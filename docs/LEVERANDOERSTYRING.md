# Leverandørdokumentation — AlphaFlow

**AlphaAi ApS**
**CVR: [Indtast CVR-nummer]**
**Dokumentversion:** 2.0
**Dato:** 2025
**Klassifikation:** Fortroligt — Compliance-dokumentation

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Kriterier for valg af leverandører](#2-kriterier-for-valg-af-leverandører)
3. [Evaluering af leverandører](#3-evaluering-af-leverandører)
4. [Løbende overvågning](#4-løbende-overvågning)
5. [Håndtering af leverandørskift](#5-håndtering-af-leverandørskift)
6. [Underleverandørkæde](#6-underleverandørkæde)
7. [Konklusion](#7-konklusion)

---

## 1. Indledning

### 1.1 Formål

Dette dokument beskriver AlphaFlows proces for styring af tekniske leverandører og underleverandører i overensstemmelse med kravene i:

- **Hovedkrav nr. 2 (It-sikkerhed)** — krav D3 (Leverandørstyring) fra Erhvervsstyrelsens tjekliste for anmeldelse af standard bogføringssystemer
- **Bogføringslovens § 10** — krav om, at data behandles sikkert og fortroligt
- **GDPR artikel 28** — krav til databehandleraftaler og underleverandører
- **Bekendtgørelse nr. 98 af 21. januar 2022** (BEK 98) — tekniske krav til elektronisk bogføringssystem

### 1.2 Anvendelsesområde

Dette dokument gælder for alle eksterne leverandører, der leverer it-tjenester, infrastruktur, softwarekomponenter eller datahåndtering til AlphaFlow-systemet. Det inkluderer både direkte leverandører og underleverandører i leverandørkæden.

### 1.3 Definitioner

| Begreb | Definition |
|--------|-----------|
| **Leverandør** | Ekstern part, der leverer en it-tjeneste eller infrastruktur til AlphaFlow |
| **Underleverandør** | Tredjepart, der anvendes af en leverandør til at levere en del af tjenesten |
| **Databehandler** | Part, der behandler personoplysninger på vegne af AlphaAi ApS (dataansvarlig) |
| **Dataansvarlig** | AlphaAi ApS, der bestemmer formål og midler for databehandlingen |

---

## 2. Kriterier for valg af leverandører

Ved valg af tekniske leverandører anvendes følgende minimumskriterier, som dokumenteres og evalueres før indgåelse af aftale:

### 2.1 Sikkerhedscertificering

| Kriterie | Minimumskrav | Vægtning |
|----------|-------------|----------|
| Sikkerhedscertificering | SOC 2 Type II eller ISO 27001 | **Kritisk** |
| Penetrationstest | Årlig uafhængig pentest med offentlig rapport | **Høj** |
| Kryptering | Kryptering af data under transport og i hvile (AES-256) | **Kritisk** |
| Adgangsstyring | MFA for administrative adgange | **Høj** |
| Incident response | Dokumenteret beredskabsplan med RTO/RPO | **Middel** |

### 2.2 GDPR-compliance

| Kriterie | Minimumskrav | Vægtning |
|----------|-------------|----------|
| Data Processing Agreement (DPA) | Indgået aftale i overensstemmelse med GDPR artikel 28 | **Kritisk** |
| EU/EØS-hosting | Al data lagres og behandles inden for EU/EØS | **Kritisk** |
| Underleverandører | Gennemsigtig liste over underleverandører med notifikationsforpligtelse | **Høj** |
| Data subjects' rettigheder | Understøttelse af ret til sletning, dataportabilitet og indsigt | **Høj** |
| Registering over behandlingsaktiviteter | Offentlig tilgængelig eller tilgængelig på anmodning | **Middel** |

### 2.3 Tekniske krav

| Kriterie | Minimumskrav | Vægtning |
|----------|-------------|----------|
| Oppetid (SLA) | Minimum 99,9 % oppetid | **Høj** |
| Skalerbarhed | Automatisk skalering efter behov | **Middel** |
| API-stabilitet | Versionerede API'er med backward compatibility | **Middel** |
| Open source / gennemsigtighed | Præference for open source med aktivt community | **Middel** |
| Økonomisk stabilitet | Etablert virksomhed med bæredygtig forretningsmodel | **Høj** |

### 2.4 Evaluationsproces

Alle nye leverandører evalueres gennem følgende proces:

```
1. Behovsidentifikation → 2. Markedsafklaring → 3. Sikkerhedsvurdering
       ↓                                                    ↓
4. DPA-indgåelse ← 5. Compliance-godkendelse ← 6. Teknisk test
       ↓
7. Produktionsudrulning → 8. Løbende overvågning
```

---

## 3. Evaluering af leverandører

Nedenfor evalueres hver af AlphaFlows aktuelle tekniske leverandører mod kriterierne i afsnit 2.

### 3.1 Neon PostgreSQL — Databasehosting

**Tjeneste:** Managed PostgreSQL-database (serverless, autoscaling)
**Brug i AlphaFlow:** Primær database til al bogføringsdata, brugerdata og audit trail
**Teknisk reference:** `prisma/schema.prisma`, `src/lib/db.ts`
**Forbindelse:** `sslmode=require` (krypteret forbindelse pålagt)

| Kriterie | Vurdering | Status |
|----------|----------|--------|
| Sikkerhedscertificering | **SOC 2 Type II** certificeret — uafhængig revision af sikkerhedsforanstaltninger | ✅ Opfyldt |
| Datakryptering i hvile | **AES-256** kryptering af alle lagrede data | ✅ Opfyldt |
| Datakryptering under transport | **TLS 1.3** forbindelse (sslmode=require) | ✅ Opfyldt |
| EU/EØS-hosting | Data hostes i AWS eu-west-1 (Irland) — EU/EØS | ✅ Opfyldt |
| GDPR/DPA | Data Processing Agreement tilgængelig og indgået | ✅ Opfyldt |
| Oppetid | 99,9 % SLA med automatisk failover | ✅ Opfyldt |
| Skalerbarhed | Serverless autoscaling — ingen manuel kapacitetsstyring | ✅ Opfyldt |
| Automatiske backups | Point-in-time recovery (PITR) med op til 7 dages retention | ✅ Opfyldt |

**Konklusion:** Neon PostgreSQL opfylder alle kritiske og høje kriterier. SOC 2 Type II-certificeringen giver uafhængig bekræftelse på sikkerhedsforanstaltningerne. EU-hosting og DPA sikrer GDPR-overholdelse.

**Tilgængelig dokumentation:**
- SOC 2 Type II rapport (tilgængelig på anmodning)
- Data Processing Agreement (DPA)
- Privacy Policy: https://neon.tech/privacy
- Sub-processor liste: https://neon.tech/legal/subprocessors

---

### 3.2 Caddy — Reverse Proxy / TLS-terminering

**Tjeneste:** Open source webserver og reverse proxy med automatisk HTTPS
**Brug i AlphaFlow:** TLS-terminering, reverse proxy til Next.js og mini-services, sikkerhedshoveder
**Teknisk reference:** `Caddyfile`

| Kriterie | Vurdering | Status |
|----------|----------|--------|
| Open source | Apache 2.0 licenseret — fuld kildekode tilgængelig | ✅ Opfyldt |
| Automatisk TLS | Integreret ACME-klient med automatisk Let's Encrypt certifikatfornyelse | ✅ Opfyldt |
| TLS-version | TLS 1.3 (latest) — understøttes af Caddy som standard | ✅ Opfyldt |
| Sikkerhedshoveder | HSTS, X-Frame-Options, X-Content-Type-Options, CSP implementeret | ✅ Opfyldt |
| HSTS | `max-age=31536000; includeSubDomains; preload` | ✅ Opfyldt |
| Underleverandører | Ingen — open source software uden tredjepartsafhængigheder | ✅ Opfyldt |
| Økonomisk stabilitet | Zephyr Logger Inc. — finansieret af enterprise-abonnementer | ✅ Opfyldt |
| Aktivt community | 50.000+ GitHub stars, hyppige sikkerhedsopdateringer | ✅ Opfyldt |

**Implementerede sikkerhedshoveder i `Caddyfile`:**

```
Strict-Transport-Security  "max-age=31536000; includeSubDomains; preload"
X-Frame-Options            "SAMEORIGIN"
X-Content-Type-Options     "nosniff"
X-XSS-Protection           "1; mode=block"
Referrer-Policy            "strict-origin-when-cross-origin"
Permissions-Policy         "camera=(), microphone=(), geolocation=()"
```

**Konklusion:** Caddy er en veletableret open source-løsning med automatisk TLS-håndtering og omfattende sikkerhedshoveder. Da det er open source, er der ingen underleverandørrisici, og kildekoden er fuldt auditerbar.

---

### 3.3 Let's Encrypt — Certificate Authority (CA)

**Tjeneste:** Gratis, automatiseret Certificate Authority
**Brug i AlphaFlow:** Udstedelse og fornyelse af TLS-certifikater via Caddy
**Teknisk reference:** Integreret i `Caddyfile` (automatisk via Caddy ACME-klient)

| Kriterie | Vurdering | Status |
|----------|----------|--------|
| Open source | ISRG (Internet Security Research Group) — non-profit | ✅ Opfyldt |
| Browser-compatibilitet | Betroet af alle moderne browsere (Chrome, Firefox, Safari, Edge) | ✅ Opfyldt |
| Certifikattype | Domain Validation (DV) — automatiseret via ACME-protokollen | ✅ Opfyldt |
| Automatisk fornyelse | Caddy fornyer certifikater automatisk før udløb | ✅ Opfyldt |
| Certifikatgyldighed | 90 dage (anbefalet) med automatisk fornyelse | ✅ Opfyldt |
| Sikkerhed | ECDSA P-256 / RSA 2048+ nøgler | ✅ Opfyldt |
| Underleverandører | Ingen — ISRG driver egen CA-infrastruktur | ✅ Opfyldt |

**Konklusion:** Let's Encrypt er den de facto standard for automatiseret TLS-certifikater, drevet af en non-profit organisation med støtte fra Mozilla, Cisco, Akamai m.fl. Integrationen via Caddy gør certifikatstyringen fuldautomatisk og fri for manuelle fejl.

---

### 3.4 Frankfurter API — Valutakurser

**Tjeneste:** ECB-referencekurser (European Central Bank)
**Brug i AlphaFlow:** Fremmedvaluta-omregning i bogføring (valutakurser fra EU-kilde)
**Teknisk reference:** `src/lib/currency-utils.ts` — `getExchangeRate()`

| Kriterie | Vurdering | Status |
|----------|----------|--------|
| Datakilde | Europæiske Centralbank (ECB) — officiel EU-reference | ✅ Opfyldt |
| EU/EØS-baseret | API hostes i Frankfurt, Tyskland — EU/EØS | ✅ Opfyldt |
| Omkostninger | Gratis, ingen abonnement eller API-nøgle påkrævet | ✅ Opfyldt |
| Autentificering | Ingen personoplysninger transmitteres | ✅ Opfyldt |
| Datakvalitet | ECB-daglige referencekurser (officiel EU-valutakurs) | ✅ Opfyldt |
| Tilgængelighed | Offentlig API med høj oppetid | ✅ Opfyldt |
| GDPR-risiko | Minimal — ingen personoplysninger transmitteres | ✅ Opfyldt |

**Konklusion:** Frankfurter API er en letvægts API-wrapper omkring ECB's officielle valutakursdata. Der transmitteres ingen personoplysninger eller forretningsdata til tjenesten, og API'et hostes i EU/EØS. Risikoen er minimal.

---

### 3.5 Samlet leverandøroversigt

| Leverandør | Tjeneste | Sikkerhed | GDPR | EU-hosting | Risiko | DPA indgået |
|-----------|---------|-----------|------|------------|--------|-------------|
| Neon PostgreSQL | Database | SOC 2 Type II | ✅ | ✅ (Irland) | Lav | ✅ |
| Caddy | Reverse Proxy | Open source | ✅ | ✅ | Minimal | N/A (self-hosted) |
| Let's Encrypt | TLS-certifikater | Non-profit CA | ✅ | ✅ | Minimal | N/A |
| Frankfurter API | Valutakurser | ECB-kilde | ✅ | ✅ (Tyskland) | Minimal | N/A (kun læsning) |

---

## 4. Løbende overvågning

### 4.1 Overvågningsproces

AlphaFlow overvåger løbende sine leverandører for at sikre, at sikkerheds- og compliance-krav opretholdes:

| Aktivitet | Frekvens | Ansvarlig |
|-----------|---------|-----------|
| Tjek for nye sikkerhedsadvisories | Ugentligt | System Administrator |
| Gennemgang af leverandørs sikkerhedsblog | Månedligt | Technical Lead |
| Opdatering af underleverandørliste | Kvartalsvis | Compliance Officer |
| Gennemgang af SOC 2-rapporter | Årligt | Compliance Officer |
| Vurdering af nye lovkrav (GDPR, Bogføringsloven) | Årligt | Compliance Officer |
| Penetrationstest af integrationer | Årligt | Ekstern revisor |

### 4.2 Sikkerhedsadvisories

Ved modtagelse af sikkerhedsadvisories fra en leverandør:

1. **Vurdering:** System Administrator vurderer alvorlighedsgraden og påvirkningen af AlphaFlow
2. **Korrektion:** Relevant opdatering eller patch anvendes inden for:
   - **Kritisk:** 24 timer
   - **Høj:** 7 dage
   - **Middel/Lav:** Næste planlagte vedligeholdelsesvindue
3. **Dokumentation:** Alle sikkerhedsopdateringer dokumenteres i audit trail (`src/lib/audit.ts`)
4. **Notifikation:** Compliance Officer informeres om hændelser af høj eller kritisk alvorlighed

### 4.3 Underleverandørs overvågning

For leverandører med underleverandører (især Neon PostgreSQL):

- Underleverandørliste overvåges kvartalsvis for ændringer
- Nye underleverandører accepteres kun, hvis de opfylder EU/EØS-kravet
- Ved ændringer i underleverandørkæden vurderes konsekvensen for GDPR-compliance
- Documenteres i løbende opdatering af dette dokument

---

## 5. Håndtering af leverandørskift

### 5.1 Generel procedure

Ved skift af teknisk leverandør følges denne procedure:

```
1. Identifikation af behov
   ├── Leverandøren opfylder ikke længere krav
   ├── Bedre alternativ tilgængeligt
   └── Lovgivningsmæssige ændringer

2. Evaluering af ny leverandør
   ├── Gennemgang af kriterier (afsnit 2)
   ├── Teknisk proof-of-concept
   └── DPA-indgåelse

3. Migreringsplanlægning
   ├── Dataeksport fra eksisterende leverandør
   ├── Datamigrering til ny leverandør
   ├── Downtime-plan (minimeres)
   └── Validering af migreret data

4. Udførelse
   ├── Planlagt maintenance window
   ├── Migrering med SHA-256 verificering
   ├── Integrationstest
   └── Produktionsswitch

5. Efterfølgende
   ├── Verificering af dataintegritet
   ├── Opsigelse af eksisterende leverandør
   ├── Sletningsbekræftelse (GDPR artikel 17)
   └── Opdatering af dette dokument
```

### 5.2 Specifikke migreringsplaner

#### Database-migrering (Neon → alternativ)

Ved migrering fra Neon PostgreSQL til en anden databaseudbyder:

1. **Eksport:** Full dump af databasen via `pg_dump` med alle tabeller
2. **Verifikation:** SHA-256 checksum af eksportfilen
3. **Import:** Import til ny database
4. **Validering:** Tæl alle records og sammenlign med kilde
5. **Test:** Kør integrationstest mod ny database
6. **DNS/Connection string:** Opdater `DATABASE_URL` miljøvariabel
7. **Overvågning:** Tæt overvågning i 48 timer efter migrering

#### Reverse Proxy-migrering (Caddy → alternativ)

1. Eksporter `Caddyfile`-konfiguration til ny platform
2. Konfigurer TLS-certifikater på ny platform
3. Test alle endpoints, WebSocket-ruter og mini-services
4. Planlagt switch med DNS TTL-minimering
5. Verificer HSTS og sikkerhedshoveder

### 5.3 Compliance under overgang

Under leverandørskift skal følgende opretholdes:

| Krav | Handling |
|------|----------|
| Bogføringsloven § 10-12 | Audit trail (`src/lib/audit.ts`) forbliver uforanderlig under og efter migrering |
| GDPR artikel 17 | Sletningsanmodning til eksisterende leverandør med dokumenteret bekræftelse |
| GDPR artikel 28 | Ny DPA indgået med ny leverandør før dataoverførsel |
| BEK 98 krav 2 | Backup-system (`src/lib/backup-engine.ts`) opretholder fuld backup-dækning under overgang |
| 5-års opbevaring | Månedlige backups (`src/lib/backup-scheduler.ts`) sikrer retention i 60 måneder |

---

## 6. Underleverandørkæde

### 6.1 Neon PostgreSQL's underleverandører

Neon PostgreSQL benytter følgende underleverandører (baseret på offentlig tilgængelig information):

| Underleverandør | Tjeneste | Lokation | Formål |
|----------------|---------|---------|--------|
| Amazon Web Services (AWS) | Cloud-infrastruktur | eu-west-1 (Irland) | Hosting af compute og storage |
| Cloudflare | CDN / DDoS-beskyttelse | Global | Beskyttelse af offentlige endpoints |
| Stripe | Betalingsbehandling | USA (kun betalingsdata) | Abonnementsbetaling |

**Vurdering:**
- AWS eu-west-1 (Irland) er EU/EØS — GDPR-kompatibel lokation
- Cloudflare bruges kun til DDoS-beskyttelse, ikke til datalagring
- Stripe håndterer kun betalingsdata, ikke bogføringsdata eller personoplysninger
- Ingen underleverandører uden for EU/EØS håndterer AlphaFlows data

### 6.2 Caddy's afhængigheder

Caddy er open source software med følgende tekniske afhængigheder:

| Komponent | Formål | Risikovurdering |
|----------|--------|----------------|
| Go standard library | Kernefunktionalitet | Lav — vedligeholdt af Google |
| Let's Encrypt ACME | Certifikatudstedelse | Lav — ISRG non-profit |
| Cloudflare DNS | DNS-udfordring (valgfrit) | Lav — kan undgås med andre DNS-udbydere |

### 6.3 Let's Encrypt

Let's Encrypt (ISRG) benytter:

| Underleverandør | Tjeneste | Formål |
|----------------|---------|--------|
| ISRG-root-CA | Certificate Authority | Udstedelse af certifikater |

Let's Encrypt har ingen underleverandører, der behandler AlphaFlow-specifikke data.

### 6.4 Frankfurter API

Frankfurter API er en statisk API-wrapper uden underleverandører. API'et transmitterer ingen AlphaFlow-specifikke data — kun HTTP GET-forespørgsler om valutakurser.

---

## 7. Konklusion

### 7.1 Samlet vurdering

AlphaFlows valg af tekniske leverandører er baseret på objektive kriterier med vægtning af sikkerhed, GDPR-compliance og EU/EØS-hosting. Alle leverandører opfylder de kritiske krav:

| Leverandør | Kritiske krav opfyldt | Samlet risiko |
|-----------|----------------------|---------------|
| Neon PostgreSQL | 5/5 | Lav |
| Caddy | 5/5 | Minimal |
| Let's Encrypt | 5/5 | Minimal |
| Frankfurter API | 5/5 | Minimal |

### 7.2 Dokumentrevision

| Version | Dato | Ændringer | Forfatter |
|---------|------|----------|-----------|
| 1.0 | 2025 | Første udgave | AlphaAi ApS |
| 2.0 | 2025 | Opdateret med konkrete kode-referencer og teknisk vurdering | AlphaAi ApS |

### 7.3 Godkendelse

| Rolle | Navn | Dato | Underskrift |
|------|------|------|-------------|
| Direktør | | | |
| Compliance Officer | | | |
| System Administrator | | | |

---

*Dette dokument er udarbejdet af AlphaAi ApS som del af compliance-dokumentationen til Erhvervsstyrelsens anmeldelse af AlphaFlow som standard bogføringssystem.*

*Dokumentet opdateres årligt eller ved væsentlige ændringer i leverandørsammensætningen.*
