/**
 * pg-service — Lokal embedded PostgreSQL 17 + pgvector
 * =====================================================
 *
 * HVORFOR DENNE SERVICE FINDES:
 *   AlphaFlow-hostappen er bygget til PostgreSQL (Neon i produktion) med
 *   pgvector til Hermes RAG-vidensbasen (KnowledgeChunk.embedding
 *   vector(1536)). Sandbox-miljøet nulstiller .env ved genstart til en
 *   SQLite-default (`file:...`), som er inkompatibel med skemaet — og
 *   sandboxen har ingen system-PostgreSQL og ingen root-adgang.
 *
 *   Denne service kører en SELVSTÆNDIG PostgreSQL 17.9 (binærer fra
 *   npm-pakken `embedded-postgres`) + selvbygget pgvector 0.8.0 (kompileret
 *   mod PG 17.9-kildekoden i pgbuild/), så hele appen kan køre lokalt.
 *   .env rettes automatisk, så Prisma peger på den lokale database.
 *
 *   Ved genoprettelse af Neon-forbindelsen i produktion: sæt DATABASE_URL
 *   til Neon-connection-strengen igen — appen og skemaet er uændret.
 *
 * PORTFØLGE (intern, ikke HTTP — eksponeres ikke via Caddy):
 *   127.0.0.1:5432 — PostgreSQL. Kun Next.js-appen forbinder.
 *
 * LIVSCYKLUS (idempotent — sikker at køre igen / bun --hot):
 *   1. Bibliotekssymlinks i embedded-pakken (bun blokerer postinstall)
 *   2. pgvector-filer kopieres ind i embedded-pakken (vector.so → lib/,
 *      vector.control + SQL → share/postgresql/extension/)
 *   3. initdb hvis data-mappen mangler (auth=trust, bruger=postgres)
 *   4. pg_ctl start — SPRINGER OVER hvis serveren allerede kører
 *   5. Rolle `alphaflow` + database `alphaflow` + CREATE EXTENSION vector
 *   6. Ret /home/z/my-project/.env hvis DATABASE_URL mangler/er file:-default
 *   7. Heartbeat — processen forbliver i live (mini-service supervisor)
 */

import { spawn, spawnSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import { Client } from "pg";

const SERVICE_DIR = path.dirname(new URL(import.meta.url).pathname);
const PROJECT_DIR = "/home/z/my-project";
const ENV_FILE = path.join(PROJECT_DIR, ".env");

const NATIVE_DIR = path.join(
  SERVICE_DIR,
  "node_modules",
  "@embedded-postgres",
  "linux-x64",
  "native",
);
const PGVECTOR_DIST = path.join(SERVICE_DIR, "pgvector-dist");
const DATA_DIR = path.join(SERVICE_DIR, "data", "pg");
const PG_LOG = path.join(SERVICE_DIR, "data", "postgres.log");

const HOST = "127.0.0.1";
const PORT = 5432;
const SUPERUSER = "postgres";
const APP_USER = "alphaflow";
const APP_PASSWORD = "alphaflow";
const APP_DB = "alphaflow";

/** Connection-streng som skrives i .env (og bruges af appens db.ts-fallback). */
export const LOCAL_DATABASE_URL = `postgresql://${APP_USER}:${APP_PASSWORD}@${HOST}:${PORT}/${APP_DB}`;

function log(msg: string): void {
  console.log(`[PG-SERVICE] ${msg}`);
}

function run(cmd: string, args: string[], opts: { cwd?: string } = {}): { ok: boolean; stdout: string; stderr: string } {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd ?? NATIVE_DIR,
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      LD_LIBRARY_PATH: path.join(NATIVE_DIR, "lib"),
    },
  });
  return { ok: res.status === 0, stdout: res.stdout ?? "", stderr: res.stderr ?? "" };
}

/** Trin 1: gendan .so-symlinks (bun blokerer embedded-postgres' postinstall). */
function ensureLibSymlinks(): void {
  const libDir = path.join(NATIVE_DIR, "lib");
  if (!fs.existsSync(libDir)) throw new Error(`Mangler embedded-postgres: ${libDir} — kør 'bun install' i pg-service`);

  // pg-symlinks.json i bin/ beskriver de symlink-par postinstall ellers havde lavet
  const linkMap = path.join(NATIVE_DIR, "bin", "pg-symlinks.json");
  if (fs.existsSync(linkMap)) {
    try {
      const map = JSON.parse(fs.readFileSync(linkMap, "utf8")) as Record<string, string>;
      for (const [link, target] of Object.entries(map)) {
        const linkPath = path.join(NATIVE_DIR, link);
        const targetPath = path.join(NATIVE_DIR, target);
        if (fs.existsSync(targetPath) && !fs.existsSync(linkPath)) {
          fs.symlinkSync(target, linkPath, "file");
        }
      }
    } catch {
      /* ikke-kritisk — vi laver også versions-symlinks nedenfor */
    }
  }

  // Generel fallback: libfoo.so.1.2 → libfoo.so.1 + libfoo.so
  for (const file of fs.readdirSync(libDir)) {
    const m = /^(\S+)\.so\.(\d+)\.(\d+)$/.exec(file);
    if (!m) continue;
    const [, base, maj] = m;
    const dir = (l: string) => path.join(libDir, l);
    if (!fs.existsSync(dir(`${base}.so.${maj}`))) fs.symlinkSync(file, dir(`${base}.so.${maj}`));
    if (!fs.existsSync(dir(`${base}.so`))) fs.symlinkSync(file, dir(`${base}.so`));
  }
  log(`Bibliotekssymlinks OK (${path.basename(libDir)})`);
}

/** Trin 2: kopier pgvector ind i embedded-pakken (idempotent).
 *
 * BEMÆRK module_pathname: den embeddede postgres er kompileret med
 * prefix /usr/local/pg-build, så '$libdir/vector' ikke findes på denne maskine
 * (ingen root-adgang). Vi skriver derfor en ABSOLUT sti i vector.control —
 * og sætter dynamic_library_path i postgres.conf (ensureConf) som fallback
 * for alle andre $libdir-referencer. */
function installPgvector(): void {
  const so = path.join(PGVECTOR_DIST, "vector.so");
  const control = path.join(PGVECTOR_DIST, "vector.control");
  const sql = path.join(PGVECTOR_DIST, "vector--0.8.0.sql");
  for (const f of [so, control, sql]) {
    if (!fs.existsSync(f)) throw new Error(`Mangler pgvector-fil: ${f} (se pgbuild/README)`);
  }
  const soTarget = path.join(NATIVE_DIR, "lib", "vector.so");
  fs.copyFileSync(so, soTarget);
  const extDir = path.join(NATIVE_DIR, "share", "postgresql", "extension");
  fs.mkdirSync(extDir, { recursive: true });
  // Absolute module_pathname — $libdir peger på /usr/local/pg-build i den embeddede binary
  const controlSrc = fs.readFileSync(control, "utf8").replace(
    /module_pathname\s*=\s*'.*'/,
    `module_pathname = '${soTarget}'`,
  );
  fs.writeFileSync(path.join(extDir, "vector.control"), controlSrc);
  fs.copyFileSync(sql, path.join(extDir, "vector--0.8.0.sql"));
  log("pgvector 0.8.0 installeret (vector.so + control + SQL)");
}

/** Trin 3: initdb hvis databasen ikke er initialiseret. */
function ensureInitdb(): void {
  if (fs.existsSync(path.join(DATA_DIR, "PG_VERSION"))) {
    log(`Data-mappe findes allerede (${DATA_DIR})`);
    return;
  }
  fs.mkdirSync(path.dirname(DATA_DIR), { recursive: true });
  const res = run(path.join(NATIVE_DIR, "bin", "initdb"), [
    "-D", DATA_DIR,
    "-U", SUPERUSER,
    "--auth=trust",
    "-E", "UTF8",
    "--no-instructions",
  ]);
  if (!res.ok) throw new Error(`initdb fejlede: ${res.stderr || res.stdout}`);
  log(`Data-mappe initialiseret (${DATA_DIR})`);
}

/** Sæt dynamic_library_path til embedded-lib-mappen (idempotent).
 *
 * Returnerer true hvis conf blev ÆNDRET (kræver server-genstart hvis den kører). */
function ensureConf(): boolean {
  const conf = path.join(DATA_DIR, "postgresql.conf");
  if (!fs.existsSync(conf)) throw new Error(`Mangler postgresql.conf: ${conf}`);
  const libDir = path.join(NATIVE_DIR, "lib");
  const wanted = `dynamic_library_path = '${libDir}'`;
  let content = fs.readFileSync(conf, "utf8");
  if (content.includes(wanted)) return false;
  content = content.replace(/^\s*#?\s*dynamic_library_path\s*=.*$/m, "");
  content = content.trimEnd() + `\n\n# pg-service: embedded-lib-mappen (binary-prefix er /usr/local/pg-build)\n${wanted}\n`;
  fs.writeFileSync(conf, content);
  log("postgresql.conf: dynamic_library_path sat");
  return true;
}

/** Trin 4: start serveren — spring over hvis den allerede kører. */
function startServer(): void {
  const status = run(path.join(NATIVE_DIR, "bin", "pg_ctl"), ["-D", DATA_DIR, "status"]);
  if (status.ok) {
    log("PostgreSQL kører allerede — spring start over");
    return;
  }
  fs.mkdirSync(path.dirname(PG_LOG), { recursive: true });
  const res = run(path.join(NATIVE_DIR, "bin", "pg_ctl"), [
    "-D", DATA_DIR,
    "-l", PG_LOG,
    "-w",
    "-t", "60",
    "start",
    "-o", `-p ${PORT} -h ${HOST}`,
  ]);
  if (!res.ok) throw new Error(`pg_ctl start fejlede: ${res.stderr || res.stdout}`);
  log(`PostgreSQL 17.9 startet på ${HOST}:${PORT}`);
}

/** Vent på at serveren accepterer forbindelser (TCP-probe via pg-klienten). */
async function waitForReady(attempts = 30): Promise<void> {
  for (let i = 1; i <= attempts; i++) {
    try {
      const c = new Client({ host: HOST, port: PORT, user: SUPERUSER, database: "postgres" });
      await c.connect();
      await c.end();
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw new Error("PostgreSQL blev ikke klar inden for timeout");
}

/** Trin 5: rolle + database + pgvector-udvidelse. */
async function ensureDatabase(): Promise<void> {
  const admin = new Client({ host: HOST, port: PORT, user: SUPERUSER, database: "postgres" });
  await admin.connect();

  const role = await admin.query("SELECT 1 FROM pg_roles WHERE rolname = $1", [APP_USER]);
  if (role.rowCount === 0) {
    await admin.query(`CREATE ROLE ${APP_USER} LOGIN SUPERUSER PASSWORD '${APP_PASSWORD}'`);
    log(`Rolle '${APP_USER}' oprettet`);
  }

  const db = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [APP_DB]);
  if (db.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${APP_DB} OWNER ${APP_USER}`);
    log(`Database '${APP_DB}' oprettet`);
  }
  await admin.end();

  const app = new Client({ host: HOST, port: PORT, user: SUPERUSER, database: APP_DB });
  await app.connect();
  await app.query("CREATE EXTENSION IF NOT EXISTS vector");
  const ver = await app.query("SELECT extversion FROM pg_extension WHERE extname = 'vector'");
  await app.end();
  log(`pgvector aktiv (version ${ver.rows[0]?.extversion ?? "?"}) i '${APP_DB}'`);
}

/** Trin 6: ret .env hvis DATABASE_URL mangler eller er sandbox-SQLite-default. */
function patchEnvFile(): void {
  const target = LOCAL_DATABASE_URL;
  let content = "";
  if (fs.existsSync(ENV_FILE)) content = fs.readFileSync(ENV_FILE, "utf8");

  const lines = content.split("\n");
  const idx = lines.findIndex((l) => /^DATABASE_URL\s*=/.test(l));
  const current = idx >= 0 ? lines[idx].slice(lines[idx].indexOf("=") + 1).trim() : "";

  const isBroken = !current || current.startsWith("file:");
  if (!isBroken) {
    log(`.env DATABASE_URL er allerede sat (${current.slice(0, 40)}...) — rører den ikke`);
    return;
  }

  const newLine = `# Lokal embedded PostgreSQL (pg-service) — Neon-URL i produktion sættes her igen ved genoprettelse`;
  if (idx >= 0) {
    lines[idx] = `DATABASE_URL=${target}`;
    lines.splice(idx + 1, 0, "");
  } else {
    lines.push(newLine, `DATABASE_URL=${target}`);
  }
  fs.writeFileSync(ENV_FILE, lines.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
  log(`.env DATABASE_URL → lokal PostgreSQL (${target})`);
}

/** Hovedflow — alle trin idempotente. */
async function main(): Promise<void> {
  console.log("\n🗄️  pg-service — lokal PostgreSQL 17 + pgvector\n");
  ensureLibSymlinks();
  installPgvector();
  ensureInitdb();
  const confChanged = ensureConf();
  const running = run(path.join(NATIVE_DIR, "bin", "pg_ctl"), ["-D", DATA_DIR, "status"]).ok;
  if (confChanged && running) {
    const res = run(path.join(NATIVE_DIR, "bin", "pg_ctl"), [
      "-D", DATA_DIR, "-l", PG_LOG, "-w", "-t", "60", "restart", "-o", `-p ${PORT} -h ${HOST}`,
    ]);
    if (!res.ok) throw new Error(`pg_ctl restart fejlede: ${res.stderr || res.stdout}`);
    log("PostgreSQL genstartet (ny dynamic_library_path)");
  } else {
    startServer();
  }
  await waitForReady();
  await ensureDatabase();
  patchEnvFile();
  log("Klar — heartbeat aktiv (processen forbliver kørende)");

  // Heartbeat: holder mini-service-processen i live og logger sundhed 1×/min
  setInterval(() => {
    const status = run(path.join(NATIVE_DIR, "bin", "pg_ctl"), ["-D", DATA_DIR, "status"]);
    if (!status.ok) {
      log("ADVARSEL: postgres kører ikke længere — prøver genstart");
      try {
        startServer();
      } catch (err) {
        console.error("[PG-SERVICE] Genstart fejlede:", err);
      }
    }
  }, 60_000);
}

/** Stop databasen pænt ved SIGTERM/SIGINT (kun når processen afsluttes). */
function shutdown(): void {
  try {
    run(path.join(NATIVE_DIR, "bin", "pg_ctl"), ["-D", DATA_DIR, "-m", "fast", "stop"]);
    log("PostgreSQL stoppet");
  } catch {
    /* ignore */
  }
  process.exit(0);
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

main().catch((err) => {
  console.error("[PG-SERVICE] FATAL:", err);
  process.exit(1);
});
