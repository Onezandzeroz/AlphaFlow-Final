// ============================================================
// source-tools.ts — Source code reading tools for Hermes
// ============================================================
//
// Gives Hermes the ability to read AlphaFlow source code files
// via OpenAI-compatible function calling. Two tools are provided:
//
//   1. list_source_directory  — explore the codebase tree
//   2. read_source_file       — read a specific file's content
//
// Security:
//   - Path traversal blocked (no "..", no absolute paths)
//   - Sensitive files blocked (.env, .git, node_modules, etc.)
//   - SuperDev-only files blocked for non-SuperDev users
//   - Max file size enforced (50 KB)
//   - Max tool iterations enforced (prevents infinite loops)
//
// The code atlas is a cached, structured file tree index
// injected into the system prompt so the LLM knows WHERE to look
// before calling any tools.
// ============================================================

import { readdir, stat, readFile, join } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import * as path from 'node:path'

// ─── Configuration ─────────────────────────────────────────────

/** Root of the AlphaFlow project. Defaults to parent of mini-services/. */
export function getProjectRoot(): string {
  return process.env.ALPHAFLOW_ROOT || path.resolve(import.meta.dir, '..')
}

const MAX_FILE_SIZE_BYTES = 50 * 1024   // 50 KB per file
const MAX_TOOL_ITERATIONS = 6           // Max tool-calling rounds per chat message
const MAX_DIR_ENTRIES = 200             // Max files returned per directory listing

// ─── Path Security ──────────────────────────────────────────────

/** Patterns that are ALWAYS blocked (regardless of user role). */
const BLOCKED_PATTERNS: RegExp[] = [
  /\/\.git\//,
  /\/\.env/,
  /\/\.env\./,
  /\/node_modules\//,
  /\/\.next\//,
  /\.(db|sqlite|sqlite3)$/,
  /\.(lock|log)$/,
  /\/bun\.lock$/,
  /\/package-lock\.json$/,
  /\/\.gitignore$/,
  /\/upload\//,
  /\/\.zscripts\//,
  /\.(pem|key|cert|crt|p12|pfx)$/,
  /\/credentials/,
  /\/secret/,
  /\/ecosystem\.config/,
  /\/tool-results\//,
]

/**
 * Patterns for files that contain SuperDev-only implementation details.
 * These are ONLY accessible when the user is a SuperDev.
 */
const SUPERDEV_ONLY_PATTERNS: RegExp[] = [
  /oversight-settings/,
  /system-messages-tab/,
  /hermes-oversight-page/,
  /scripts\/fix-isdemo/,
  /rate-limiter\.ts$/,           // Rate limiter internals are SuperDev concern
  /load-env\.ts$/,               // Server deployment internals
  /boot\.ts$/,                   // Server boot internals
  /session-verifier\.ts$/,      // Session security internals
]

/** Validate and resolve a relative path. Returns null if blocked. */
function resolveSafePath(relativePath: string, isSuperDev: boolean): string | null {
  // Normalize: strip leading/trailing slashes, collapse redundant segments
  let normalized = relativePath
    .replace(/^\/+|\/+$/g, '')
    .replace(/\\/g, '/')

  // Block path traversal
  if (normalized.includes('..')) return null
  if (path.isAbsolute(normalized)) return null

  // Block empty paths for file reads (allowed for directory listing)
  if (!normalized) return null

  const root = getProjectRoot()
  const fullPath = path.resolve(root, normalized)

  // Ensure the resolved path is within the project root
  if (!fullPath.startsWith(root + path.sep) && fullPath !== root) return null

  // Check blocked patterns
  const relativeUnix = '/' + normalized.replace(/\\/g, '/')
  for (const pattern of BLOCKED_PATTERNS) {
    if (pattern.test(relativeUnix)) return null
  }

  // Check SuperDev-only patterns
  if (!isSuperDev) {
    for (const pattern of SUPERDEV_ONLY_PATTERNS) {
      if (pattern.test(relativeUnix)) return null
    }
  }

  return fullPath
}

// ─── Tool Definitions (OpenAI format) ───────────────────────────

export interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string
  }
}

export const SOURCE_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'list_source_directory',
      description: 'List files and subdirectories in a given path within the AlphaFlow source code. Returns file names, types (file/dir), and sizes. Use this to explore the codebase structure and find relevant files before reading them.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path within the project (e.g. "src/lib", "src/components/invoices"). Use "." or "" for the project root.',
          },
        },
        required: ['path'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_source_file',
      description: 'Read the full contents of a specific source code file from the AlphaFlow project. Use list_source_directory first to discover file paths. Returns the complete file content with line numbers.',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'Relative path to the file (e.g. "src/lib/rbac.ts", "src/app/api/invoices/route.ts", "prisma/schema.prisma").',
          },
        },
        required: ['path'],
      },
    },
  },
]

// ─── Tool Executors ─────────────────────────────────────────────

interface ToolResult {
  content: string
  isError?: boolean
}

/** Execute a source code tool call. Returns the result content or an error. */
export async function executeSourceTool(
  toolName: string,
  argsJson: string,
  isSuperDev: boolean,
): Promise<ToolResult> {
  let args: Record<string, string>
  try {
    args = JSON.parse(argsJson)
  } catch {
    return { content: 'Fejl: Ugyldige argumenter (ugyldigt JSON).', isError: true }
  }

  switch (toolName) {
    case 'list_source_directory':
      return executeListDirectory(args.path || '.', isSuperDev)
    case 'read_source_file':
      return executeReadFile(args.path || '', isSuperDev)
    default:
      return { content: `Ukendt værktøj: ${toolName}`, isError: true }
  }
}

async function executeListDirectory(relativePath: string, isSuperDev: boolean): Promise<ToolResult> {
  const root = getProjectRoot()
  let targetDir: string

  if (relativePath === '.' || relativePath === '') {
    targetDir = root
  } else {
    const resolved = resolveSafePath(relativePath, isSuperDev)
    if (!resolved) {
      return { content: `Adgang nægtet: Stien "${relativePath}" er blokeret eller ugyldig.`, isError: true }
    }
    targetDir = resolved
  }

  try {
    const entries = await readdir(targetDir, { withFileTypes: true })

    // Filter blocked entries and sort
    const filtered = entries
      .filter(entry => {
        if (entry.name.startsWith('.') && entry.name !== '.env.example') return false
        if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') return false
        if (entry.name === 'upload' || entry.name === '.zscripts' || entry.name === 'tool-results') return false
        if (entry.name === 'bun.lock' || entry.name === 'package-lock.json') return false
        // SuperDev-only directories
        if (!isSuperDev && entry.name === 'scripts') return false
        return true
      })
      .sort((a, b) => {
        // Directories first, then files, alphabetical within each group
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })
      .slice(0, MAX_DIR_ENTRIES)

    if (filtered.length === 0) {
      return { content: 'Tom mappe (ingen synlige filer eller undermapper).' }
    }

    const lines = await Promise.all(
      filtered.map(async (entry) => {
        try {
          const fullPath = path.join(targetDir, entry.name)
          const s = await stat(fullPath)
          const icon = entry.isDirectory() ? '📁' : '📄'
          const size = entry.isFile() ? formatFileSize(s.size) : ''
          const suffix = entry.isDirectory() ? '/' : ''
          return `${icon} ${entry.name}${suffix}  ${size}`.trimEnd()
        } catch {
          return `📄 ${entry.name}  (fejl ved læsning)`
        }
      }),
    )

    const header = relativePath === '.' || relativePath === ''
      ? 'Projektrod (/)'
      : `${relativePath}/`

    const moreNote = entries.length > MAX_DIR_ENTRIES
      ? `\n  ... og ${entries.length - MAX_DIR_ENTRIES} flere filer (viser kun de første ${MAX_DIR_ENTRIES})`
      : ''

    return { content: `${header}  (${entries.length} poster):
${lines.map(l => `  ${l}`).join('\n')}${moreNote}` }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { content: `Stien findes ikke: "${relativePath}"`, isError: true }
    }
    if (err.code === 'EACCES') {
      return { content: `Ingen adgang til: "${relativePath}"`, isError: true }
    }
    return { content: `Fejl ved læsning af mappe: ${err.message}`, isError: true }
  }
}

async function executeReadFile(relativePath: string, isSuperDev: boolean): Promise<ToolResult> {
  const resolved = resolveSafePath(relativePath, isSuperDev)
  if (!resolved) {
    return { content: `Adgang nægtet: Filen "${relativePath}" er blokeret, ugyldig, eller kræver SuperDev-adgang.`, isError: true }
  }

  try {
    const s = await stat(resolved)
    if (s.isDirectory()) {
      return { content: `"${relativePath}" er en mappe, ikke en fil. Brug list_source_directory til at se indholdet.`, isError: true }
    }
    if (s.size > MAX_FILE_SIZE_BYTES) {
      return {
        content: `Filen er for stor (${formatFileSize(s.size)}). Maksimal tilladt størrelse er ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`,
        isError: true,
      }
    }

    const content = await readFile(resolved, 'utf-8')

    // Add line numbers for easy reference
    const lines = content.split('\n')
    const numbered = lines
      .map((line, i) => {
        const num = String(i + 1).padStart(4, ' ')
        return `${num} │ ${line}`
      })
      .join('\n')

    const ext = path.extname(relativePath).slice(1) || 'unknown'
    const header = `📄 ${relativePath}  (${formatFileSize(s.size)}, ${lines.length} linjer, ${ext})`

    return { content: `${header}\n${'─'.repeat(header.length)}\n${numbered}` }
  } catch (err: any) {
    if (err.code === 'ENOENT') {
      return { content: `Filen findes ikke: "${relativePath}"`, isError: true }
    }
    return { content: `Fejl ved læsning af fil: ${err.message}`, isError: true }
  }
}

// ─── Code Atlas ──────────────────────────────────────────────────

/** Cached code atlas — built once at startup, rebuilt on demand. */
let cachedAtlas: string | null = null
let atlasBuildTime = 0
const ATLAS_TTL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * Builds a structured, human-readable index of the source code.
 * This is injected into the system prompt so the LLM knows WHERE to look
 * before calling any tools. Much more efficient than blind exploration.
 *
 * Only covers the top 2-3 levels of key directories.
 * Excludes node_modules, .next, .git, etc.
 */
export async function buildCodeAtlas(isSuperDev: boolean = false): Promise<string> {
  const now = Date.now()
  // Cache non-SuperDev atlas; always rebuild for SuperDev (they see more)
  if (cachedAtlas && now < atlasBuildTime + ATLAS_TTL_MS && !isSuperDev) {
    return cachedAtlas
  }

  const root = getProjectRoot()
  const sections: string[] = []

  const keyDirs = [
    { rel: 'src/app', label: 'Next.js App Router (sider & API-ruter)', depth: 2 },
    { rel: 'src/components', label: 'React UI-komponenter', depth: 2 },
    { rel: 'src/lib', label: 'Forretningslogik & hjælpefunktioner', depth: 1 },
    { rel: 'src/hooks', label: 'React hooks', depth: 1 },
    { rel: 'src/types', label: 'TypeScript type-definitioner', depth: 1 },
    { rel: 'prisma', label: 'Database schema (Prisma)', depth: 1 },
    { rel: 'mini-services', label: 'Uafhængige mikrotjenester', depth: 1 },
    { rel: 'public', label: 'Statiske filer (logoer, billeder)', depth: 1 },
  ]

  // SuperDev-only directories
  if (isSuperDev) {
    keyDirs.push(
      { rel: 'scripts', label: 'Administrationsscripts (seed, migration)', depth: 1 },
      { rel: 'docs', label: 'Dokumentation', depth: 1 },
    )
  }

  for (const { rel, label, depth } of keyDirs) {
    const dirPath = path.join(root, rel)
    if (!existsSync(dirPath)) continue

    const entries = await buildDirIndex(dirPath, rel, depth, isSuperDev)
    if (entries) {
      sections.push(`### ${label} (\`${rel}/\`)\n${entries}`)
    }
  }

  cachedAtlas = `# AlphaFlow Kildekode-atlas

Nedenfor er en struktureret oversigt over kildekoden. Brug \`list_source_directory\` for at udforske undermapper og \`read_source_file\` for at læse specifikke filer.

${sections.join('\n\n')}

**Tip:** Start med at udforske den mappe der er mest relevant for brugerens spørgsmål, og læs derefter de specifikke filer for at give et detaljeret svar.`

  atlasBuildTime = now
  return cachedAtlas
}

/** Recursively build a directory index string up to a given depth. */
async function buildDirIndex(
  dirPath: string,
  prefix: string,
  maxDepth: number,
  isSuperDev: boolean,
  currentDepth: number = 0,
): Promise<string | null> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })

    // Filter and sort
    const filtered = entries
      .filter(e => {
        if (e.name.startsWith('.') && e.name !== '.env.example') return false
        if (['node_modules', '.next', '.git', 'upload', '.zscripts', 'tool-results'].includes(e.name)) return false
        if (e.name === 'bun.lock' || e.name === 'package-lock.json') return false
        if (!isSuperDev && ['scripts'].includes(e.name)) return false
        return true
      })
      .sort((a, b) => {
        if (a.isDirectory() && !b.isDirectory()) return -1
        if (!a.isDirectory() && b.isDirectory()) return 1
        return a.name.localeCompare(b.name)
      })

    if (filtered.length === 0) return null

    const lines: string[] = []

    for (const entry of filtered) {
      const entryPath = `${prefix}/${entry.name}`

      if (entry.isDirectory()) {
        if (currentDepth < maxDepth) {
          lines.push(`📁 **${entry.name}/**/`)
          const subIndex = await buildDirIndex(
            path.join(dirPath, entry.name),
            entryPath,
            maxDepth,
            isSuperDev,
            currentDepth + 1,
          )
          if (subIndex) lines.push(subIndex)
        } else {
          lines.push(`📁 **${entry.name}/**/`)
        }
      } else {
        // Clean up file extension for display
        const ext = path.extname(entry.name)
        const cleanName = ext ? entry.name.replace(ext, '') : entry.name
        lines.push(`📄 \`${entry.name}\``)
      }
    }

    return lines.map(l => `  ${l}`).join('\n')
  } catch {
    return null
  }
}

// ─── Helpers ─────────────────────────────────────────────────────

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Check whether a message involves source code questions (for conditional tool injection).
 *  We keep the trigger list TIGHT to avoid sending `tools` to the LLM on
 *  ordinary accounting questions (which most models handle worse when tools
 *  are present, especially free-tier models that don't truly support
 *  function calling). */
export function isSourceCodeQuestion(message: string): boolean {
  const lower = message.toLowerCase()
  // Strong source-code-only indicators (must be present)
  const strongTriggers = [
    'kildekode', 'source code', 'koden', 'the code',
    'implementering', 'implementation',
    'filen', 'the file', 'funktionen', 'the function', 'komponenten', 'the component',
    'api-rute', 'api route', 'endpoint',
    'backend', 'frontend',
    'databasen', 'database', 'prisma', 'schema',
    'teknisk', 'technical', 'arkitektur', 'architecture',
    'vis mig', 'show me', 'læs', 'read the', 'find filen',
    'feature', 'funktionalitet', 'modul', 'module',
    'integration', 'flow', 'processen', 'the process',
    'hvordan fungerer', 'how does', 'how do',
    'hvorfor', 'why does',
  ]
  // If the message mentions source-code tool names explicitly, always activate
  const toolMention = /list_source_directory|read_source_file/.test(lower)
  if (toolMention) return true

  return strongTriggers.some(t => lower.includes(t))
}

export { MAX_TOOL_ITERATIONS }
