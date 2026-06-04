# IT-Risikovurdering

## AlphaFlow Cloud Regnskabssystem

| **Felt** | **Oplysning** |
|---|---|
| **Dokumenttype** | IT-risikovurdering |
| **Version** | 2.0 |
| **Dato** | 1. juli 2025 |
| **Udarbejdet af** | AlphaAi (dataansvarlig) |
| **Klassifikation** | Fortroligt |
| **Gyldighedsperiode** | 12 måneder (næste revision: 1. juli 2026) |
| **Referencer** | ISO/IEC 27005:2022, Bogføringsloven (LBK nr. 1513), GDPR (forordning 2016/679), BEK nr. 98 om elektronisk bogføring |

---

## 1. Indledning

### 1.1 Formål

Denne IT-risikovurdering er udarbejdet som led i AlphaFlows anmeldelse til Erhvervsstyrelsen som standardiseret bogføringssystem jf. Bekendtgørelse om godkendelse af standardiserede bogføringssystemer (BEK nr. 98).

Formålet er at identificere, vurdere og håndtere IT-relaterede risici forbundet med drift af AlphaFlow — et multi-tenant cloud-baseret regnskabssystem, der behandler finansielle data for danske virksomheder.

Dokumentet adresserer specifikt følgende krav fra Erhvervsstyrelsen:

| Krav | Beskrivelse |
|------|-------------|
| **N2** | Risikovurdering af tab af tilgængelighed |
| **N3** | Risikovurdering af tredjeparter |
| **N4** | Risikovurdering af trusselsændringer |
| **N5** | Risikovurdering med konsekvens- og sandsynlighedsvurdering |
| **D1** | It-sikkerhed på tilstrækkeligt niveau |
| **D15** | Hændelig tilintetgørelse af data |

### 1.2 Anvendelsesområde

Denne risikovurdering dækker følgende systemkomponenter:

- **Applikation:** AlphaFlow Next.js 16 webapplikation (TypeScript, Prisma ORM)
- **Applikationsserver:** IONOS VPS (Cloud VPS, C5 + IT-Grundschutz cert., EU-hosted)
- **Database:** Neon PostgreSQL (hosted, EU-baseret)
- **Backup-lagring:** IONOS VPS (Tenant-Backup/ folder, AES-256-GCM krypteret)
- **Reverse proxy/TLS:** Caddy (open source, TLS 1.3)
- **E-faktura:** OIOUBL og Peppol BIS Billing 3.0 parser/validator
- **Valutakurser:** Frankfurter API (ECB reference rates)
- **Backup:** Automatiseret tenant-snapshot backup med AES-256-GCM kryptering og SHA-256 verificering
- **Tredjepartstjenester:** NemHandel-klient, bank-sync integrationer

### 1.3 Metodologi

Risikovurderingen er udført i overensstemmelse med principperne i **ISO/IEC 27005:2022** (Information security risk management) og omfatter følgende trin:

1. **Kontekstetablering:** Identifikation af kritiske aktiver, forretningsprocesser og interessenter
2. **Trusselsidentifikation:** Systematisk kortlægning af trusler mod tilgængelighed, fortrolighed, integritet og persondata
3. **Risikovurdering:** Kvantitativ vurdering af konsekvens (1–5) og sandsynlighed (1–5)
4. **Kontrolidentifikation:** Eksisterende tekniske og organisatoriske kontroller
5. **Restrisikoberegning:** Vurdering af resterende risiko efter implementerede kontroller
6. **Risikoaccept:** Formel accept af dokumenterede restrisici

### 1.4 Risikovurderingsskala

#### Konsekvens (K)

| Niveau | Beskrivelse | Eksempel |
|-------|-------------|----------|
| **1 — Forsummelig** | Ubetydelig indvirkning på driften | Midlertidig forsinkelse i rapportgenerering |
| **2 — Lille** | Begrænset indvirkning, hurtigt gendannet | Enkel bruger mister adgang i kort tid |
| **3 — Middel** | Mærkbar indvirkning på forretning | Flere brugere mister adgang; data korrupt |
| **4 — Betydelig** | Betydelig forretningsmæssig skade | Omfattende datatab; system nede i timer |
| **5 — Katastrofal** | Eksistens truet; lovkrav overtrådt | Komplet datatab; GDPR-breach; bogføringslovbrud |

#### Sandsynlighed (S)

| Niveau | Beskrivelse | Frekvens |
|-------|-------------|----------|
| **1 — Meget lav** | Forventes ikke at indtræffe | < 1 gang pr. 5 år |
| **2 — Lav** | Usandsynligt men muligt | 1 gang pr. 1–5 år |
| **3 — Middel** | Muligt og forventeligt | 1–3 gange pr. år |
| **4 — Høj** | Sandsynligt at indtræffe | Månedlig |
| **5 — Meget høj** | Forventes at indtræffe hyppigt | Ugentlig/daglig |

#### Risikoklassificering

| Risiko (K × S) | Klasse | Farve |
|-----------------|--------|-------|
| 1–4 | 🟢 **Lav** | Grøn |
| 5–9 | 🟡 **Middel** | Gul |
| 10–15 | 🟠 **Høj** | Orange |
| 16–25 | 🔴 **Kritisk** | Rød |

---

## 2. Aktivoversigt

Følgende kritiske informationssystemer er identificeret som væsentlige aktiver for AlphaFlow:

| Aktiv ID | Aktivnavn | Type | Klassifikation | Beskrivelse |
|----------|-----------|------|----------------|-------------|
| **A1** | Regnskabsdata | Data | Fortroligt | Finansielle transaktioner, journalposter, fakturaer, bilag, momsopgørelser, årsregnskaber for alle kunder |
| **A2** | Brugerdata | Data | Fortroligt | Personoplysninger: navn, e-mail, CPR-relaterede data, adgangskoder (hashed), 2FA-secrets (krypterede) |
| **A3** | Bankforbindelser | Data | Fortroligt | Bank access tokens, refresh tokens (AES-256-GCM krypterede), kontoudtog, bank-reconciliation data |
| **A4** | Audit trail | Data | Fortroligt | Uforanderlig log over alle ændringer til regnskabsdata (bogføringslov §10-12) |
| **A5** | E-faktura data | Data | Fortroligt | Modtagne OIOUBL/Peppol fakturaer, kreditnotaer og genererede responses |
| **A6** | Backup arkiv | Data | Fortroligt | Automatiske og manuelle snapshots (AES-256-GCM krypteret ZIP med SHA-256 checksum) af alle tenant-data, lagret på IONOS VPS i EU |
| **A7** | Applikationskode | Software | Internt | Next.js kildekode, API routes, library-moduler |
| **A8** | Infrastruktur | System | Internt | IONOS VPS (applikationsserver + backup-lagring, C5 + IT-Grundschutz), Neon PostgreSQL database, Caddy reverse proxy |

### Aktivafhængigheder

```
A7 (Applikation) ──afhænger af──→ A8 (Infrastruktur)
A1 (Regnskabsdata) ──beskyttes af──→ A4 (Audit trail)
A3 (Bankforbindelser) ──beskyttes af──→ AES-256-GCM kryptering
A2 (Brugerdata) ──beskyttes af──→ bcrypt + 2FA + RBAC
A6 (Backup) ──gendanner──→ A1 + A2 + A3 + A4 + A5
A6 (Backup) ──krypteret med──→ AES-256-GCM filkryptering (lagret på IONOS VPS)
A8 (Infrastruktur) ──hostet af──→ IONOS VPS (C5 + IT-Grundschutz, EU)
```

---

## 3. Trusselsidentifikation

Trusler er kategoriseret i fire hovedkategorier baseret på CIKA (Confidentiality, Integrity, Availability, Accountability) principperne med tillæg af en persondata-specifik kategori.

### 3.1 Tilgængelighed (Availability) — Tab af adgang

| Trussel ID | Trussel | Beskrivelse |
|------------|---------|-------------|
| **T-AV1** | Servernedetid | Hardwarefejl, OS-opdatering, konfigurationsfejl medfører at AlphaFlow-applikationen er utilgængelig |
| **T-AV2** | DDoS-angreb | Distribueret denial-of-service angreb overbelaster serveren og forhindrer legitime brugere i at få adgang |
| **T-AV3** | Databasefejl (Neon) | Neon PostgreSQL hostingudbyder oplever nedetid, datakorruption eller forbindelsesproblemer |
| **T-AV4** | Fil-system fejl | Diskfejl eller fillagring fuldt, hvilket forhindrer backup-oprettelse eller restore |
| **T-AV5** | Backup-fiasko | Automatiske backups mislykkes pga. diskplads, fejl i cron-scheduler, eller database timeout |

### 3.2 Fortrolighed (Confidentiality) — Dataudlæk

| Trussel ID | Trussel | Beskrivelse |
|------------|---------|-------------|
| **T-CF1** | Data breach (ekstern) | Uautoriseret adgang til regnskabsdata, brugeroplysninger eller bankforbindelser via sårbarhed i applikationen |
| **T-CF2** | Insider-trussel | Medarbejder eller godkendt bruger udnytter sine rettigheder til at tilgå data de ikke bør se (cross-tenant adgang) |
| **T-CF3** | Session hijacking | Stjålne session-cookies eller JWT-tokens giver uautoriseret adgang til brugerkonti |
| **T-CF4** | Kompromitteret adgangskode | Brugers adgangskode gættes, stjåles (phishing) eller knækkes via brute-force |
| **T-CF5** | Lækage af krypteringsnøgler | ENCRYPTION_KEY miljøvariabel eksponeres, hvilket afslører AES-256-GCM krypterede bank-tokens og 2FA-secrets |

### 3.3 Integritet (Integrity) — Data manipulation

| Trussel ID | Trussel | Beskrivelse |
|------------|---------|-------------|
| **T-IG1** | Uberettiget ændring af data | Bruger ændrer regnskabsdata, journalposter eller fakturaer uden korrekte rettigheder (RBAC-bypass) |
| **T-IG2** | Datakorruption via fejl | Softwarefejl i bogføringslogikken forårsager forkerte saldi eller korrupte journalposter |
| **T-IG3** | Malware/ransomware | Skadelig software krypterer eller ændrer serverfiler inkl. backup-arkivet |
| **T-IG4** | SQL injection / XSS | Skadelige input-data udnytter sårbarheder til at manipulere databaseindhold eller injicere kode |
| **T-IG5** | Manipulation af valutakurser | Forkerte eller manipulerede valutakurser fra ekstern API fører til urigtige beløb i regnskabet |

### 3.4 Persondata (GDPR) — GDPR-specifikke trusler

| Trussel ID | Trussel | Beskrivelse |
|------------|---------|-------------|
| **T-PD1** | GDPR-breach (personoplysninger) | Uautoriseret adgang til eller lækage af brugernes personoplysninger (navn, e-mail, CPR-data) |
| **T-PD2** | Manglende ret til sletning | Brugers anmodning om sletning af persondata (art. 17 GDPR) opfyldes ikke korrekt |
| **T-PD3** | Uautoriseret cross-tenant adgang | Bruger fra én tenant får adgang til en anden tenants data, herunder personoplysninger |

---

## 4. Tredjepartsrisici

### 4.1 Neon PostgreSQL (Database Hosting)

| Egenskab | Vurdering |
|----------|-----------|
| **Type** | Hosted PostgreSQL (serverless) |
| **Lokation** | EU/EØS (Europa) |
| **Certificeringer** | SOC 2 Type II |
| **Kritikalitet** | 🔴 Kritisk — alle data lagres her |
| **Konsekvens ved nedetid** | Komplet tab af tilgængelighed for hele systemet |

**Identificerede risici:**

| Risiko | Konsekvens | Sandsynlighed | Foranstaltning |
|--------|------------|---------------|----------------|
| Service nedetid | 4 | 2 | Multi-region deployment, connection pooling med automatisk retry |
| Datakorruption | 5 | 1 | Neon's egen backup (point-in-time recovery), automatiske tenant-snapshots |
| Sikkerhedsbreach hos Neon | 5 | 1 | SOC 2 Type II certificering, sslmode=require krypterer transport |
| Kontraktligt driftsstop | 4 | 1 | Databehandleraftale indgået, eksport-funktionalitet sikrer portabilitet |

### 4.2 IONOS VPS (Applikationsserver og Backup-lagring)

| Egenskab | Vurdering |
|----------|-----------|
| **Type** | Cloud VPS (Virtual Private Server) |
| **Lokation** | EU/EØS (alle datacentre i Europa) |
| **Certificeringer** | C5 (BSI Cloud Computing Compliance) + IT-Grundschutz — første europæiske udbyder med begge |
| **Kritikalitet** | 🔴 Kritisk — applikationsserver og lokal backup-lagring |
| **Konsekvens ved nedetid** | Komplet tab af tilgængelighed; backup-gendannelse kræver adgang til IONOS VPS |
| **ISO-certificering** | 25 ISO-certificerede datacentre i Europa med geo-redundans |

**Identificerede risici:**

| Risiko | Konsekvens | Sandsynlighed | Foranstaltning |
|--------|------------|---------------|----------------|
| VPS nedetid (hardware) | 4 | 2 | PM2 auto-restart, IONOS geo-redundans, beredskabsplan for servergendannelse |
| Sikkerhedsbreach på VPS | 5 | 1 | C5 + IT-Grundschutz certificering, DDoS-beskyttelse, 2FA/brute-force beskyttelse, SSH-nøgler |
| Tab af backup-data | 4 | 1 | AES-256-GCM kryptering af backup-filer, SHA-256 checksum, Neon PITR som alternativ kilde |
| Dataoverførsel til tredjelande | 5 | 1 | Alle IONOS-datacentre i Europa, DPA indgået, fuld GDPR-compliance |
| DDoS angreb | 3 | 2 | IONOS automatisk DDoS-detektion og blokering, Caddy rate limiting (`rate_limit` direktiv), applikations-level rate limiting (rate-limit.ts) |

### 4.3 Caddy (Reverse Proxy / TLS)

| Egenskab | Vurdering |
|----------|-----------|
| **Type** | Open source reverse proxy (Go) |
| **Anvendelse** | TLS 1.3 terminering, HTTP→HTTPS omdirigering, security headers |
| **Kritikalitet** | 🟠 Høj — front-door for al trafik |
| **Certificeringer** | Open source, regelmæssigt opdateret |

**Identificerede risici:**

| Risiko | Konsekvens | Sandsynlighed | Foranstaltning |
|--------|------------|---------------|----------------|
| TLS-konfigurationsfejl | 3 | 1 | Caddy håndterer TLS automatisk (Let's Encrypt), minimal konfiguration |
| Caddy sårbarhed | 3 | 1 | Regelmæssige opdateringer, open source audit |
| Certificate expiry | 2 | 1 | Caddy auto-fornyer certifikater via ACME-protokollen |

### 4.4 Frankfurter API (Valutakurser)

| Egenskab | Vurdering |
|----------|-----------|
| **Type** | Gratis, åben API |
| **Datakilde** | ECB (European Central Bank) reference rates |
| **Kritikalitet** | 🟡 Middel — valutakurser er vigtige men kan håndteres manuelt |
| **Autentificering** | Ingen påkrævet |

**Identificerede risici:**

| Risiko | Konsekvens | Sandsynlighed | Foranstaltning |
|--------|------------|---------------|----------------|
| API nedetid | 2 | 3 | Stale cache fallback (1-time cache), manuel indtastning mulig |
| Manipulerede kurser | 3 | 1 | ECB er autoriseret offentlig datakilde, validering af responsformat |
| API deprecation | 2 | 1 | Open source, ECB-reference data, nem udskiftning til alternativ kilde |

### 4.5 E-faktura Netværk (NemHandel / Peppol)

| Egenskab | Vurdering |
|----------|-----------|
| **Type** | Offentlig e-faktura infrastruktur |
| **Anvendelse** | Modtagelse og fremsendelse af OIOUBL/Peppol e-fakturaer |
| **Kritikalitet** | 🟡 Middel — vigtig funktion men ikke eksistentiel for kernebogføring |

**Identificerede risici:**

| Risiko | Konsekvens | Sandsynlighed | Foranstaltning |
|--------|------------|---------------|----------------|
| NemHandel nedetid | 2 | 2 | Asynkron fremsendelse med retry-logik, audit trail af alle forsøg |
| Invalid e-faktura payload | 2 | 3 | XML-validering i `einvoice-parser.ts`, Application Response med fejlkode |
| Peppol Access Point fejl | 2 | 2 | Status tracking (SENDT/AFLEVERET/FEJLET), retry-mekanisme |

---

## 5. Risikomatrix

Nedenstående matrix viser alle identificerede trusler med konsekvens-, sandsynlighed- og risikovurdering før og efter eksisterende kontroller.

### Risiko før kontroller (Brutto risiko)

| # | Trussel ID | Trusselbeskrivelse | K (1-5) | S (1-5) | Risiko (K×S) | Klasse |
|---|-----------|--------------------|---------|---------|-------------|--------|
| 1 | T-AV1 | Servernedetid (hardware, OS, konfiguration) | 4 | 3 | **12** | 🟠 Høj |
| 2 | T-AV2 | DDoS-angreb | 3 | 3 | **9** | 🟡 Middel |
| 3 | T-AV3 | Databasefejl (Neon PostgreSQL nedetid) | 4 | 2 | **8** | 🟡 Middel |
| 4 | T-AV4 | Fil-system fejl (diskplads, diskfejl) | 3 | 2 | **6** | 🟡 Middel |
| 5 | T-AV5 | Backup-fiasko (automatiske backups mislykkes) | 4 | 2 | **8** | 🟡 Middel |
| 6 | T-CF1 | Data breach (ekstern uautoriseret adgang) | 5 | 2 | **10** | 🟠 Høj |
| 7 | T-CF2 | Insider-trussel (cross-tenant adgang) | 5 | 2 | **10** | 🟠 Høj |
| 8 | T-CF3 | Session hijacking | 4 | 2 | **8** | 🟡 Middel |
| 9 | T-CF4 | Kompromitteret adgangskode | 4 | 3 | **12** | 🟠 Høj |
| 10 | T-CF5 | Lækage af krypteringsnøgler | 5 | 1 | **5** | 🟡 Middel |
| 11 | T-IG1 | Uberettiget ændring af regnskabsdata | 5 | 2 | **10** | 🟠 Høj |
| 12 | T-IG2 | Datakorruption via softwarefejl | 4 | 3 | **12** | 🟠 Høj |
| 13 | T-IG3 | Malware/ransomware | 5 | 1 | **5** | 🟡 Middel |
| 14 | T-IG4 | SQL injection / XSS | 5 | 2 | **10** | 🟠 Høj |
| 15 | T-IG5 | Manipulerede valutakurser | 2 | 2 | **4** | 🟢 Lav |
| 16 | T-PD1 | GDPR-breach (personoplysninger) | 5 | 2 | **10** | 🟠 Høj |
| 17 | T-PD2 | Manglende ret til sletning (art. 17 GDPR) | 3 | 2 | **6** | 🟡 Middel |
| 18 | T-PD3 | Uautoriseret cross-tenant adgang (persondata) | 5 | 2 | **10** | 🟠 Høj |

### Risiko efter kontroller (Netto risiko / Restrisiko)

| # | Trussel ID | Trusselbeskrivelse | K (1-5) | S (1-5) | Restrisiko | Klasse | Eksisterende kontrol |
|---|-----------|--------------------|---------|---------|-------------|--------|---------------------|
| 1 | T-AV1 | Servernedetid | 3 | 2 | **6** | 🟡 Middel | PM2 process management med auto-restart; cron health monitoring; backup-scheduler per-tenant overvågning |
| 2 | T-AV2 | DDoS-angreb | 2 | 2 | **4** | 🟢 Lav | Caddy reverse proxy med rate limiting (Caddyfile); IONOS automatisk DDoS-detektion; HSTS forhindrer downgrade-angreb; applikations-level rate limiting (rate-limit.ts) på følsomme endpoints |
| 3 | T-AV3 | Databasefejl (Neon) | 3 | 1 | **3** | 🟢 Lav | Neon SOC 2 Type II; sslmode=require; connection retry i Prisma client |
| 4 | T-AV4 | Fil-system fejl | 2 | 1 | **2** | 🟢 Lav | Backup scheduler overvåger diskplads; cleanup cron fjerner expired backups dagligt |
| 5 | T-AV5 | Backup-fiasko | 2 | 1 | **2** | 🟢 Lav | Per-tenant cron health monitoring (idle/pending/healthy/unhealthy); dedup-tracking; pre-restore safety backup |
| 6 | T-CF1 | Data breach (ekstern) | 4 | 1 | **4** | 🟢 Lav | TLS 1.3 + HSTS (Caddyfile); AES-256-GCM kryptering (crypto.ts); security headers; RBAC (rbac.ts); 2FA (two-factor.ts) |
| 7 | T-CF2 | Insider-trussel (cross-tenant) | 4 | 1 | **4** | 🟢 Lav | Alle 89+ API routes scoped af `companyScope()`/`tenantFilter()` i rbac.ts; oversight-mode mutation block; 23 RBAC-permissioner |
| 8 | T-CF3 | Session hijacking | 2 | 1 | **2** | 🟢 Lav | Secure session-håndtering (session.ts); HSTS forbidding HTTP; 2FA kræver ekstra faktor; rate limiting (rate-limit.ts) |
| 9 | T-CF4 | Kompromitteret adgangskode | 3 | 2 | **6** | 🟡 Middel | bcrypt 12 rounds (password.ts); 2FA/TOTP som ekstra faktor (two-factor.ts); login rate limiting |
| 10 | T-CF5 | Lækage af krypteringsnøgler | 5 | 1 | **5** | 🟡 Middel | ENCRYPTION_KEY kun i miljøvariabel (aldrig i database/codebase); server-miljøisolering (.env) forhindrer kode-adgang til nøglen; RBAC + 2FA beskytter administrative funktioner |
| 11 | T-IG1 | Uberettiget ændring af data | 3 | 1 | **3** | 🟢 Lav | RBAC med 23 permissioner (rbac.ts); requirePermission() i alle mutation-endpoints; immutable audit trail med database-level triggers (audit.ts + audit-immutability.sql); onDelete: Restrict forhindrer sletning af refererede brugere/virksomheder; 2FA forhindrer uautoriseret adgang |
| 12 | T-IG2 | Datakorruption via softwarefejl | 3 | 2 | **6** | 🟡 Middel | Automatiske backups (hourly/daily/weekly/monthly); SHA-256 checksum-verificering ved restore; atomic database-transaktioner |
| 13 | T-IG3 | Malware/ransomware | 4 | 1 | **4** | 🟢 Lav | Automatiske backups med SHA-256; restore muligt fra clean snapshot; minimal attack surface (kun Caddy eksponeret) |
| 14 | T-IG4 | SQL injection / XSS | 3 | 1 | **3** | 🟢 Lav | Prisma ORM parameteriserer alle queries; Next.js auto-escapes JSX; security headers (X-XSS-Protection, X-Content-Type-Options) |
| 15 | T-IG5 | Manipulerede valutakurser | 2 | 1 | **2** | 🟢 Lav | ECB reference rates (officiel EU-kilde); response-validering i currency-utils.ts; 1-time cache; fallback til DKK |
| 16 | T-PD1 | GDPR-breach | 4 | 1 | **4** | 🟢 Lav | TLS 1.3; AES-256-GCM; RBAC med tenant-isolation; audit trail med database-level immutability; 2FA; data eksport/sletning |
| 17 | T-PD2 | Manglende ret til sletning | 2 | 1 | **2** | 🟢 Lav | `/api/auth/delete-account` endpoint; tenant-eksport (`export-tenant`) for portabilitet; sletning af user-data i alle tabeller |
| 18 | T-PD3 | Cross-tenant adgang (persondata) | 4 | 1 | **4** | 🟢 Lav | `companyScope()` i alle queries; `tenantFilter()` med demo-company block; oversight read-only mode; audit trail log med database-level immutability |

---

## 6. Eksisterende Kontroller

Alle eksisterende tekniske og organisatoriske kontroller er dokumenteret nedenfor med reference til konkrete kildekodefiler.

### 6.1 Netværks- og Transportsikkerhed

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-NT1** | TLS 1.2 (minimum) + TLS 1.3 (preferred) + HSTS | `Caddyfile` (linje 68–73, 75–93) | Caddy konfigurerer eksplicit minimum TLS 1.2 med TLS 1.3 som preferred protocol via `tls { protocols tls1.2 tls1.3 }` direktiv. TLS-certifikater håndteres automatisk via Let's Encrypt (ACME). HSTS med `max-age=31536000; includeSubDomains; preload` tvinger HTTPS for alle fremtidige anmodninger. |
| **K-NT2** | Security Headers | `Caddyfile` (linje 69–87) | X-Frame-Options (SAMEORIGIN), X-Content-Type-Options (nosniff), X-XSS-Protection (1; mode=block), Referrer-Policy (strict-origin-when-cross-origin), Permissions-Policy (camera/microphone/geolocation=deaktiveret). |
| **K-NT3** | Database Transport Kryptering | Prisma `DATABASE_URL` | `sslmode=require` sikrer at al kommunikation mellem applikation og Neon PostgreSQL er TLS-krypteret. |

### 6.2 Data Kryptering

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-DK1** | AES-256-GCM (Data at Rest) | `src/lib/crypto.ts` | Krypterer følsomme data (bank access tokens, refresh tokens, 2FA secrets) med AES-256-GCM. IV: 12 bytes (96 bit, NIST SP 800-38D), auth tag: 16 bytes (128 bit), key: 32 bytes (256 bit) fra `ENCRYPTION_KEY` miljøvariabel. Unik IV pr. kryptering. Integritetsverificering via GCM auth tag. |
| **K-DK2** | bcrypt 12 Rounds (Adgangskoder) | `src/lib/password.ts` | Alle adgangskoder hashes med bcrypt med 12 salt rounds. Bagudkompatibilitet med legacy hash-format via `needsRehash()`. |
| **K-DK3** | SHA-256 Checksums (Backups) | `src/lib/backup-engine.ts` | Alle backup-ZIP-filer verificeres med SHA-256 checksum (streaming). Checksum gemmes i databasen og valideres før restore. |

### 6.3 Adgangskontrol og Autentificering

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-AC1** | RBAC (Role-Based Access Control) | `src/lib/rbac.ts` | 5 roller med hierarki: OWNER(5) > ADMIN(4) > ACCOUNTANT(3) > VIEWER(2) > AUDITOR(1). 23 unikke permissioner fordelt på kategorier: company settings (4), member management (4), accounting data (5), reports (3), period management (3), banking (2), backup (2). `requirePermission()` blokerer uautoriserede handlinger. |
| **K-AC2** | Tenant Isolation | `src/lib/rbac.ts` (`companyScope()`, `tenantFilter()`) | Alle database-queries er scoped af companyId. `companyScope()` returnerer filter baseret på brugerens activeCompanyId eller oversightCompanyId. Ingen mulighed for at tilgå andre tenanters data. |
| **K-AC3** | 2FA / MFA (TOTP) | `src/lib/two-factor.ts` | TOTP-baseret two-factor autentificering. 2FA-secrets krypteres med AES-256-GCM. 10 backup-codes (SHA-256 hashed). Tenant-level kravmulighed (Company.twoFactorRequired). SuperDev bypass for udvikling. |
| **K-AC4** | Oversight Mode (Read-Only) | `src/lib/rbac.ts` (`blockOversightMutation()`) | SUPER_DEV brugere i oversight mode har kun læseadgang til andre tenants. Alle mutationer blokeres med 403-respons. |
| **K-AC5** | Demo Company Protection | `src/lib/rbac.ts` (`requireNotDemoCompany()`) | Demo-company data kan ikke ændres af almindelige brugere. Kun SuperDev har write-adgang. |

### 6.4 Audit Trail

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-AT1** | Immutable Audit Log (dobbelte beskyttelseslag) | `src/lib/audit.ts` + `prisma/audit-immutability.sql` | Uforanderlig log af alle ændringer til regnskabsdata (bogføringslov §10-12). Immutability håndhæves på **to uafhængige niveauer**: **1) Applikationsniveau:** `audit.ts` eksporterer kun CREATE-funktioner — ingen update/delete. API route (`audit-logs/route.ts`) eksponerer kun GET-endpoints. **2) Databaseniveau:** PostgreSQL-triggere (`prisma/audit-immutability.sql`) forhindrer UPDATE og DELETE på "AuditLog"-tabellen fuldstændigt. Selv en database-administrator eller kompromitteret forbindelse kan ikke ændre eller slette audit-poster. Fremmednøgler bruger `onDelete: Restrict` — brugere og virksomheder med audit-poster kan ikke slettes (5-års opbevaringspligt jf. Bogføringsloven §12 forrang over GDPR Art. 17(3)(c)). 21+ event-typer: CREATE, UPDATE, CANCEL, DELETE_ATTEMPT, LOGIN, LOGIN_FAILED, LOGOUT, REGISTER, BACKUP_CREATE, BACKUP_RESTORE, BACKUP_DELETE, SESSION_INVALIDATE, DATA_RESET, OVERSIGHT, TWO_FACTOR_SETUP_STARTED, TWO_FACTOR_ACTIVATED, TWO_FACTOR_DISABLED, TWO_FACTOR_BACKUP_CODES_REGENERATED, TWO_FACTOR_TENANT_TOGGLE, LOGIN_2FA_VERIFIED. Alle events inkluderer userId, companyId, entityType, entityId, before/after values, IP, userAgent. |
| **K-AT2** | Audit på alle mutation-endpoints | Alle API routes i `src/app/api/` | Alle POST/PUT/DELETE API routes kalder `auditLog()` eller hjælpefunktionerne `auditCreate()`, `auditUpdate()`, `auditCancel()`, `auditDeleteAttempt()`. Audit-poster er beskyttet mod ændring/sletning af PostgreSQL-triggere (se K-AT1). |

### 6.5 Backup og Gendannelse

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-BK1** | Automatiske Backups | `src/lib/backup-engine.ts`, `src/lib/backup-scheduler.ts` | Fire niveauer: hourly (minut 5, hver time), daily (kl. 02:15), weekly (mandag kl. 03:30), monthly (1. kl. 04:00). Tenant-snapshot som ZIP med struktureret JSON. **AES-256-GCM filkryptering** af backup-ZIP før lagring på IONOS VPS. SHA-256 checksum. Lagret på IONOS VPS i EU (C5 + IT-Grundschutz cert.). |
| **K-BK2** | Retention Policy | `src/lib/backup-engine.ts` (linje 76–82) | Hourly: 24 backups (25 timer), Daily: 30 backups (31 dage), Weekly: 52 backups (53 dage), Monthly: 60 backups (1 år), Manual: 999 backups (90 dage). Automated cleanup dagligt kl. 03:00. |
| **K-BK3** | Backup Restore med Verificering | `src/lib/backup-engine.ts` (`restoreBackup()`) | SHA-256 checksum-validering før restore. Pre-restore safety backup oprettes automatisk. Atomic database-transaktion (rollback ved fejl). 10-minut timeout for store restores. |
| **K-BK4** | Per-Tenant Cron Health | `src/lib/backup-scheduler.ts` (`getCronHealth()`) | Uafhængig overvågning per tenant: idle/pending/healthy/unhealthy. Tracker consecutive errors. Overlever server-genstarter via database-hydratering. |
| **K-BK5** | Data Eksport (Portabilitet) | `src/app/api/export-tenant/route.ts` | Portabel JSON-eksport med GUID, SHA-256 checksum. Alle tenant-data i ét samlet format til brug ved systemskift. |

### 6.6 E-faktura Sikkerhed

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-EF1** | OIOUBL / Peppol BIS Parser | `src/lib/einvoice-parser.ts` | Forenet parser der understøtter både OIOUBL og Peppol BIS Billing 3.0 format. Auto-detection via CustomizationID/ProfileID. Understøtter InvoiceTypeCode 380, 381, 384, 389. |
| **K-EF2** | E-faktura Response Generator | `src/lib/einvoice-response.ts` | Genererer Application Response (N9), Message Level Response (N12), og Invoice Response (N13) for Peppol. Response codes: ACCEPTED, REJECTED, PARTIALLY_ACCEPTED. |
| **K-EF3** | Duplicate Detection | `src/app/api/invoices/receive/route.ts` | Indgående e-fakturaer tjekkes for duplicates før oprettelse. |

### 6.7 Valutakurs-sikkerhed

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-VC1** | ECB Reference Rates | `src/lib/currency-utils.ts` | Frankfurter API (gratis, EU-baseret, ECB datakilde). 10-sekunders timeout. Response-validering (tjekker for rates-objekt). |
| **K-VC2** | In-Memory Cache (1 time) | `src/lib/currency-utils.ts` | Kurser cachelagres i hukommelsen med 1-times TTL. Stale cache fallback hvis API er utilgængeligt. Undgå at systemet afhænger af real-time API for grundlæggende funktion. |

### 6.8 Rate Limiting og API-beskyttelse

| Kontrol ID | Kontrol | Reference | Beskrivelse |
|------------|---------|-----------|-------------|
| **K-RL1** | Rate Limiting (to lag) | `src/lib/rate-limit.ts` + `Caddyfile` (rate_limit direktiv) | **Lag 1 — Caddy (infrastructure):** Global rate limiting per IP i Caddyfile (`rate_limit` direktiv) — 100 req/min generelt, 30 req/min for API-zoner. Persistenter på tværs af server-genstarter. Beskytter mod DDoS og volumetriske angreb før de når applikationen. **Lag 2 — Applikation (granulær):** In-memory rate limiting (`rate-limit.ts`) på specifikke følsomme endpoints (login, 2FA, password reset) med finere grænser. Begrænsning: in-memory Store nulstilles ved server-genstart og gælder kun for single-instance drift. |
| **K-RL2** | API Error Handler | `src/lib/api-error-handler.ts` | Centraliseret fejlhåndtering der forhindrer lækage af interne detaljer i API-responser. |

---

## 7. Restrisici og Accept

### 7.1 Resterende risici

Efter implementering af alle eksisterende kontroller, følgende restrisici forbliver:

| # | Restrisiko | Risikoscore | Klasse | Acceptforanstaltning |
|---|-----------|-------------|--------|---------------------|
| **R1** | Kompromitteret adgangskode trods bcrypt | 6 (3×2) | 🟡 Middel | **Accepteret.** 2FA dæmmer konsekvensen. Brugere opfordres til stærke adgangskoder. Login rate limiting forhindrer brute-force. |
| **R2** | Lækage af ENCRYPTION_KEY | 5 (5×1) | 🟡 Middel | **Accepteret.** Key er kun i miljøvariabel, aldrig i kode eller database. Server-hardening begrænser adgang. Secret management kan forbedres med Vault/HSM i fremtiden. |
| **R3** | Datakorruption via softwarefejl | 6 (3×2) | 🟡 Middel | **Accepteret.** Automatiske backups muliggør gendannelse inden for 1 time (hourly backup). SHA-256 verificering sikrer backup-integritet. Atomic transaktioner forhindrer partial corruption. |
| **R4** | Servernedetid trods PM2 auto-restart | 6 (3×2) | 🟡 Middel | **Accepteret.** PM2 genstarter applikationen automatisk. Cron health monitoring alarmerer ved gentagne fejl. Beredskabsplan definerer manual genstart (se separat BEREDSKABSPLAN.md). |

### 7.2 Samlet risikoprofil

```
Før kontroller (Brutto):
  Kritisk (16-25):  0 trusler
  Høj (10-15):      9 trusler
  Middel (5-9):     7 trusler
  Lav (1-4):        2 trusler

Efter kontroller (Netto/Restrisiko):
  Kritisk (16-25):  0 trusler  ← INGEN kritiske risici
  Høj (10-15):      0 trusler  ← INGEN høje risici
  Middel (5-9):     4 trusler  ← Alle acceptable (R1-R4)
  Lav (1-4):       14 trusler  ← Håndteres af eksisterende kontroller
```

### 7.3 Formel risikoaccept

Alle resterende risici er formelt accepteret af dataansvarlig (AlphaAi) med følgende begrundelse:

> **Accepterklæring:**
>
> Efter implementering af tekniske kontroller (TLS 1.3, AES-256-GCM, bcrypt 12 rounds, RBAC med 5 roller/23 permissioner, TOTP 2FA, uforanderlig audit trail, automatiske backups med SHA-256 verificering, per-tenant isolation i alle API routes) og organisatoriske foranstaltninger (backup health monitoring, rate limiting, oversight-mode, demo-company protection), vurderes alle resterende risici at være på et acceptabelt niveau.
>
> De 4 mellemrisici (R1-R4) er alle dæmpet af 2FA-laget, automatiske backups og monitoring, hvilket reducerer den faktiske konsekvens markant. Ingen enkelt rest-risiko udgør en trussel mod AlphaFlows evne til at opfylde Bogføringslovens krav til sikker opbevaring af regnskabsdata.
>
> Accepteret af: AlphaAi, dataansvarlig
>
> Dato: 1. juli 2025

---

## 8. Behandling af Trusselsændringer

### 8.1 Proces for løbende risikovurdering

AlphaFlow opretholder en struktureret proces for identifikation og håndtering af nye og ændrede trusler:

| Trin | Handling | Ansvarlig | Frekvens |
|------|----------|-----------|----------|
| **1. Overvågning** | Overvåge sikkerhedsfeeds (CVE, NIST NVD, Node.js security advisories, Caddy releases, Neon status page) | Teknisk lead | Daglig |
| **2. Identifikation** | Vurdere om nye sårbarheder gælder for AlphaFlows teknologistak | Teknisk lead | Ved ny CVE |
| **3. Vurdering** | Opdatere risikomatrix med ny trussels konsekvens og sandsynlighed | Teknisk lead + dataansvarlig | Ved ny trussel |
| **4. Håndtering** | Implementere patch, konfigurationsændring eller ny kontrol | Teknisk lead | Inden for rimelig tid |
| **5. Dokumentation** | Opdatere dette dokument med nye trusler og kontroller | Dataansvarlig | Ved revision |
| **6. Gennemgang** | Samlet revision af hele risikovurderingen | Teknisk lead + dataansvarlig | Årligt (eller ved væsentlige ændringer) |

### 8.2 Triggers for ekstraordinær revision

En ekstraordinær revision af risikovurderingen skal udføres ved:

- **Væsentlige ændringer i systemarkitekturen** (ny database, ny hostingudbyder, nye tredjepartstjenester)
- **Nye lovkrav** (ændringer i Bogføringsloven, GDPR-vejledning, Erhvervsstyrelsens krav)
- **Sikkerhedshændelser** (selv hvis afvist, skal konsekvenserne vurderes)
- **Nye kritiske sårbarheder** i afhængigheder (Next.js, Prisma, Caddy, Neon)
- **Skift af tredjepartsudbydere** (ny database hosting, ny e-faktura access point)

### 8.3 Dokumentation af ændringer

Alle ændringer i risikovurderingen dokumenteres i tabelform:

| Dato | Ændring | Forårsaget af | Udført af |
|------|---------|---------------|-----------|
| 1. juli 2025 | Første version (v2.0) af IT-risikovurdering | System anmeldelse til Erhvervsstyrelsen | AlphaAi |
| 2025 | Tilføjet IONOS VPS som tredjepartsrisiko (C5 + IT-Grundschutz, EU-hosted), opdateret backup-kryptering til AES-256-GCM | IONOS VPS tilføjet som leverandør | AlphaAi |
| 2025 | Tilføjet database-level immutability for AuditLog (PostgreSQL-triggere i K-AT1), opdateret FK onDelete fra SetNull til Restrict | Compliance-review: audit trail var kun beskyttet på applikationsniveau | AlphaAi |
| 04/06/2026 | Rettet T-CF5: fjernet fejlagtig access-guard.ts reference; tilføjet eksplicit TLS 1.2/1.3 konfiguration i Caddyfile (K-NT1); tilføjet Caddy rate limiting (K-RL1); præciseret in-memory begrænsning i rate-limit.ts | Compliance-review: dokumentation matchede ikke faktisk konfiguration | AlphaAi |

---

## 9. Konklusion

Denne IT-risikovurdering har identificeret og vurderet **18 specifikke trusler** fordelt på 4 kategorier (tilgængelighed, fortrolighed, integritet, persondata) samt 4 tredjepartsrisici.

### Nøglekonklusioner:

1. **Ingen kritiske eller høje restrisici.** Alle 18 trusler er reduceret til lavt eller middel niveau gennem eksisterende tekniske kontroller.

2. **Kernen af sikkerhedsarkitekturen** er et multi-lager forsvar:
   - **Netværkslag:** TLS 1.3 + HSTS + security headers (Caddy)
   - **Transportlag:** sslmode=require (PostgreSQL)
   - **Krypteringslag:** AES-256-GCM (følsomme data), bcrypt 12 rounds (adgangskoder)
   - **Autentificeringslag:** 2FA/TOTP + session management + rate limiting
   - **Autorisationslag:** RBAC med 5 roller, 23 permissioner, tenant isolation i alle queries
   - **Auditlag:** Uforanderlig log af alle ændringer (bogføringslov §10-12) — **håndhævet på både applikations- og databaseniveau** via PostgreSQL-triggere der forhindrer UPDATE/DELETE på AuditLog-tabellen
   - **Gendannelseslag:** Automatiske backups (hourly/daily/weekly/monthly), SHA-256 verificering, atomic restore

3. **Compliance:** Systemets kontroller opfylder kravene i:
   - Bogføringslovens §10-12 (audit trail, uforanderlig dokumentation)
   - Bogføringslovens §15 (backup og opbevaring i 5 år)
   - GDPR art. 32 (sikkerhed ved behandling af personoplysninger)
   - BEK nr. 98 (IT-sikkerhed på tilstrækkeligt niveau, hændelig tilintetgørelse)

4. **Tredjepartsrisici** er acceptable: Neon (SOC 2 Type II, EU-baseret), IONOS VPS (C5 + IT-Grundschutz, EU-baseret, første europæiske udbyder med begge cert.), Caddy (open source, auto-TLS), Frankfurter API (ECB-reference, cache med fallback).

5. **4 accepterede mellemrisici** (R1-R4) er alle effektivt dæmpet af 2FA, automatiske backups og monitoring, og udgør ikke en trussel mod systemets lovmæssige forpligtelser.

**Samlet vurdering:** AlphaFlows IT-sikkerhed er på et **tilstrækkeligt niveau** til at understøtte godkendelse som standardiseret bogføringssystem jf. Erhvervsstyrelsens krav.

---

*Dokumentet er udarbejdet af AlphaAi (dataansvarlig) og danner del af anmeldelsespakken til Erhvervsstyrelsen.*

*Næste revision: 1. juli 2026, eller ved væsentlige ændringer i systemet eller trusselsbilledet.*
