# AlphaFlow — Tredjeparts IT-sikkerhedsdokumentation

## Neon PostgreSQL som datalager

**Dokumenttype:** Tredjeparts IT-sikkerhedsdokumentation
**Version:** 2.0
**Dato:** 2025
**Ansvarlig:** AlphaFlow
**Gældende krav:** Bogføringsloven §15, BEK nr. 98 af 23. januar 2025 — krav D5, D6 og N23

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Om Neon PostgreSQL](#2-om-neon-postgresql)
3. [Sikkerhedsforanstaltninger hos Neon](#3-sikkerhedsforanstaltninger-hos-neon)
4. [Data Processing Agreement (DPA)](#4-data-processing-agreement-dpa)
5. [Begrundelse for valg af Neon](#5-begrundelse-for-valg-af-neon)
6. [Database Connection Sikkerhed](#6-database-connection-sikkerhed)
7. [Data Integrity og Backup hos AlphaFlow](#7-data-integrity-og-backup-hos-alphaflow)
8. [Konklusion](#8-konklusion)

---

## 1. Indledning

### 1.1 Formål

Dette dokument dokumenterer AlphaFlows brug af **Neon PostgreSQL** som primær datalager (managed database-as-a-service). Dokumentet adresserer følgende krav fra Erhvervsstyrelsens bekendtgørelse om elektronisk bogføring (BEK nr. 98 af 23. januar 2025):

| Krav | Beskrivelse |
|------|-------------|
| **D5** | Tredjeparts IT-sikkerhed — dokumentation af tredjeparts IT-systemers sikkerhed |
| **D6** | Aftale med 3. part opbevaring — dokumentation for datalagring hos tredjepart |
| **N23** | Aftale med 3. part opbevaring — formel dokumentation og aftalegrundlag |

### 1.2 Anvendelsesområde

Dokumentet omfatter AlphaFlows produktionsdatabase, som hostes på Neons serverless PostgreSQL-platform. Databasen indeholder alle bogføringsdata for AlphaFlows kunder, herunder:

- Finansielle posteringer og journalposter
- Kontoplan og momsregistrering
- Fakturaer og kontakter
- Bankafstemninger
- Bruger- og virksomhedsoplysninger
- Bankforbindelser med krypterede adgangstokens

### 1.3 Definitioner

| Term | Definition |
|------|------------|
| **AlphaFlow** | Dansk cloudbaseret bogføringssystem |
| **Neon** | Neon, Inc. — leverandør af serverless PostgreSQL (SaaS) |
| **Databehandleraftale (DPA)** | Data Processing Agreement — juridisk aftale mellem dataansvarlig og databehandler |
| **SOC 2 Type II** | Service Organization Control 2, Type II — uafhængig sikkerhedsrevision |
| **EEA** | Det Europæiske Økonomiske Samarbejdsområde |

---

## 2. Om Neon PostgreSQL

### 2.1 Virksomhedsoversigt

Neon, Inc. er en amerikansk virksomhed, der leverer serverless PostgreSQL som en managed cloud-tjeneste. Neon er bygget på open-source PostgreSQL og tilbyder fuld SQL-kompatibilitet med auto-skalering, branching og connection pooling.

| Egenskab | Detalje |
|----------|---------|
| **Produkt** | Neon Serverless PostgreSQL |
| **Database-engine** | PostgreSQL (open source) |
| **Driftsmodel** | Managed Database-as-a-Service (DBaaS) |
| **Skalering** | Automatisk serverless auto-scaling |
| **Branching** | Understøtter database branching til udvikling og test |
| **Connection pooling** | Indbygget connection pooling (PgBouncer) |
| **Hjemmeside** | https://neon.tech |

### 2.2 SOC 2 Type II-certificering

Neon har opnået **SOC 2 Type II**-certificering, hvilket dokumenterer, at virksomhedens systemer, processer og kontroller opfylder strenge krav til:

- **Sikkerhed (Security):** Beskyttelse mod uautoriseret adgang
- **Tilgængelighed (Availability):** Systemets oppetid og driftssikkerhed
- **Fortrolighed (Confidentiality):** Beskyttelse af fortrolige data
- **Integritet (Integrity):** Datakorrekthed og fuldstændighed

SOC 2 Type II-rapporten omfatter en periode på minimum 6 måneder med løbende revision af kontrollerne, hvilket overstiger det generelle sikkerhedsniveau for comparable cloud-databaser.

### 2.3 EU/EEA-datacenterlokationer

Neon drifter primære datacentre i Europa, hvilket sikrer, at AlphaFlows produktionsdata forbliver inden for EU/EEA:

| Datacenter | Lokation | Region |
|------------|----------|--------|
| **Primary** | Frankfurt am Main, Tyskland | EU (eu-west-1) |
| **Secondary** | Amsterdam, Nederlandene | EU (eu-central-1) |

> **Bemærkning:** Alle AlphaFlow-databaseinstanser er konfigureret til udelukkende at anvende EU/EEA-regioner. Data overføres aldrig til lokaliteter uden for EU/EEA.

### 2.4 Automatisk skalering og høj tilgængelighed

Neons serverless-arkitektur tilbyder:

| Egenskab | Beskrivelse |
|----------|-------------|
| **Auto-scaling** | Compute skaleres automatisk fra 0.25 til flere vCPU'er baseret på belastning |
| **Scale-to-zero** | Compute kan skaleres ned til 0 ved inaktivitet for omkostningsoptimering |
| **Storage autoscaling** | Lagerplads vokser automatisk efter behov |
| **Read replicas** | Understøttelse af read replicas for forbedret læseydelse |
| **Point-in-time recovery** | Gendannelse til ethvert tidspunkt inden for retention-perioden |

---

## 3. Sikkerhedsforanstaltninger hos Neon

### 3.1 Kryptering af data på disk (Encryption at Rest)

Neon krypterer al lagrede data ved hjælp af **AES-256**-kryptering (Advanced Encryption Standard med 256-bit nøgler). Dette gælder for:

- Alle database-tabeller og indekser
- Write-Ahead Logs (WAL)
- Backups og snapshots
- Temporary files under query-execution

Krypteringsnøglerne administreres af Neons infrastruktur og roteres i overensstemmelse med best practices.

### 3.2 Kryptering af data i transit (Encryption in Transit)

Al kommunikation mellem AlphaFlow-applikationen og Neons databaser er krypteret med **TLS (Transport Layer Security)**.

| Parameter | Konfiguration |
|-----------|---------------|
| **Protokol** | TLS 1.2+ |
| **Connection string** | `sslmode=require` |
| **Certificatvalidering** | Servercertifikat valideres af klienten |

Den faktiske connection string-konfiguration for AlphaFlow:

```
postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/dbname?sslmode=require
```

> `sslmode=require` sikrer, at forbindelsen afvises, hvis TLS ikke kan etableres. Forbindelsen krypteres dermed altid under transit.

### 3.3 Adgangskontrol (Access Control)

Neon implementerer et flerlaget adgangskontrolsystem:

| Lag | Beskrivelse |
|-----|-------------|
| **Netværk** | Databasen er kun tilgængelig via TLS-krypterede forbindelser |
| **Autentificering** | Brugernavn og adgangskode påkrævet ved hvert connection |
| **Connection pooling** | PgBouncer-baseret pooling med separat autentificering |
| **IAM-integration** | Understøttelse af IAM-baseret adgangskontrol |
| **IP-restriction** | Mulighed for IP-begrænsning på projektniveau |

AlphaFlow anvender **connection pooling** via Neons pooler-endpoint (`-pooler` i hostnavnet), hvilket:

-Reducerer antallet af direkte databaseforbindelser
-Forbedrer ydeevnen ved høj samtidig belastning
-Opholder adgangskontrollen på pooler-niveau

### 3.4 Automatiske backups

Neon udfører automatiske backups af alle databaseinstanser:

| Backup-type | Frekvens | Retention |
|-------------|----------|-----------|
| **Point-in-time recovery** | Kontinuerlig | Op til 7 dage |
| **Full backup** | Daglig | 7 dage |
| **On-demand backup** | Manuelt | Brugerstyret |

Neons backup-system er uafhængigt af AlphaFlows eget backup-system, hvilket giver **defense in depth** — to uafhængige backup-systemer beskytter mod datatab.

### 3.5 Point-in-Time Recovery (PITR)

Neon understøtter **Point-in-Time Recovery**, som gør det muligt at gendanne databasen til et hvilket som helst tidspunkt inden for retention-perioden. Dette er baseret på continuous Write-Ahead Log (WAL) archiving.

---

## 4. Data Processing Agreement (DPA)

### 4.1 Reference til Neons DPA

Neon tilbyder en offentligt tilgængelig **Data Processing Agreement (DPA)** for alle kunder. DPA'en er tilgængelig på:

> **https://neon.tech/legal/dpa** *(opdateret 2025)*

Neons DPA opfylder kravene i **EU's forordning om databeskyttelse (GDPR)**, art. 28, og dækker:

- Behandlingens art og formål
- Kategorier af personoplysninger
- Typer af databehandling
- Tekniske og organisatoriske sikkerhedsforanstaltninger
- Underdatabehandlere
- Data subjects' rettigheder
- Sletning og tilbagelevering af data

### 4.2 Nøgletermer i DPA

| Clausul | Indhold |
|---------|---------|
| **Behandlingslokalitet** | EU/EEA — data behandles udelukkende inden for EU/EEA |
| **Underdatabehandlere** | Neon oplyser om alle underdatabehandlere på deres hjemmeside |
| **Sikkerhedsforanstaltninger** | SOC 2 Type II, AES-256-kryptering, TLS, access control |
| **Incident management** | Neon underretter dataansvarlig inden for 48 timer ved brud |
| **Revision** | Neon faciliterer revision og compliance-undersøgelser |
| **Data sletning** | Data slettes ved kontraktens ophør eller på anmodning |
| **Audit rights** | Dataansvarlig har ret til at revidere Neons compliance |

### 4.3 Underdatabehandlere (Sub-processors)

Neon offentliggør en liste over underdatabehandlere, som opdateres løbende. Listen er tilgængelig på:

> **https://neon.tech/legal/subprocessors**

AlphaFlow overvåger denne liste og sikrer, at alle underdatabehandlere opretholder et tilstrækkeligt beskyttelsesniveau i overensstemmelse med GDPR art. 28(3)(4).

### 4.4 Overholdelse af krav D6 og N23

| Krav | Opfyldelse |
|------|------------|
| **D6** — Aftale med 3. part opbevaring | Neons DPA er underskrevet/accepteret som en del af AlphaFlows Neon-abonnement. DPA'en dækker datalagring og databehandling. |
| **N23** — Aftale med 3. part opbevaring (formel) | Neons DPA er et formelt juridisk dokument, der opfylder GDPR art. 28-kravene. Dokumentet er tilgængeligt og opdateres løbende. |

---

## 5. Begrundelse for valg af Neon

Valget af Neon som databaseløsning er truffet på baggrund af en vurdering af følgende kriterier:

| Kriterium | Vurdering | Relevans |
|-----------|-----------|----------|
| **SOC 2 Type II-certificering** | Opfyldt — uafhængig tredjepartsrevision | Sikrer dokumenteret sikkerhedsniveau |
| **EU/EEA-hosting** | Opfyldt — primære datacentre i Frankfurt og Amsterdam | GDPR-compliant, ingen dataoverførsel til tredjelande |
| **PostgreSQL (open source)** | Opfyldt — fuld PostgreSQL-kompatibilitet | Branchestandard for relationelle databaser, ingen vendor lock-in på query-niveau |
| **Serverless auto-scaling** | Opfyldt — automatisk skalering fra 0 til flere vCPU'er | Omkostningseffektiv drift med variabel belastning |
| **Forbindelsessikkerhed** | Opfyldt — TLS med `sslmode=require` | Krypterer al data i transit |
| **Backup og gendannelse** | Opfyldt — PITR, daglige backups | Opfylder Bogføringslovens krav til datalagring |
| **Connection pooling** | Opfyldt — indbygget PgBouncer | Effektiv forbindelseshåndtering |
| **Branching** | Opfyldt — database branching til test og udvikling | Sikker isolering af udviklingsmiljøer |

### Samlet vurdering

Neon opfylder alle krav til en godkendt tredjepartsdatalager for elektronisk bogføring jf. BEK nr. 98 § 15. Valget er baseret på Neons:

1. **Dokumenterede sikkerhedskontroller** (SOC 2 Type II)
2. **EU/EEA-lokalitet** (GDPR-compliance)
3. **Open-source database-engine** (PostgreSQL)
4. **Robust backup-infrastruktur** (PITR + automatiske backups)
5. **Serverless arkitektur** (skalérbarhed og omkostningseffektivitet)

---

## 6. Database Connection Sikkerhed

### 6.1 Forbindelseskonfiguration

AlphaFlow anvender følgende sikkerhedsforanstaltninger ved databaseforbindelser:

| Parameter | Konfiguration | Beskrivelse |
|-----------|---------------|-------------|
| **SSL/TLS** | `sslmode=require` | Alle forbindelser krypteres med TLS |
| **Connection pooling** | Neon Pooler endpoint (`-pooler.region.aws.neon.tech`) | Forbindelser routes via PgBouncer for effektiv pool-håndtering |
| **Autentificering** | Username + password | Hver forbindelse autentificeres med databasen brugeroplysninger |
| **Credentials** | Miljøvariabel (`DATABASE_URL`) | Ingen hårdkodede credentials — connection string opbevares i `DATABASE_URL` miljøvariablen |

### 6.2 Connection String-struktur

AlphaFlows produktions-connection string følger dette format:

```
postgresql://[bruger]:[adgangskode]@ep-xxx-pooler.region.aws.neon.tech/[database]?sslmode=require
```

| Komponent | Beskrivelse |
|-----------|-------------|
| `postgresql://` | PostgreSQL-protokol |
| `ep-xxx-pooler` | Pooler-endpoint (PgBouncer) for forbindelsespooling |
| `.region.aws.neon.tech` | Neons EU-region (Frankfurt/Amsterdam) |
| `?sslmode=require` | Tvinger TLS-kryptering — forbindelse afvises uden TLS |

### 6.3 Sikkerhedsmetadata

| Foranstaltning | Implementering |
|----------------|----------------|
| **Ingen plaintext credentials i kode** | Connection string læses fra miljøvariablen `DATABASE_URL` |
| **TLS påkrævet** | `sslmode=require` i connection string |
| **Pooler-endpoint** | Forbindelser via Neons PgBouncer for effektiv håndtering |
| **Prisma ORM** | Databaseklient via Prisma Client — type-sikker queries |

### 6.4 Application-level kryptering

Udover Neons infrastrukturkryptering krypterer AlphaFlow følsomme data på applikationsniveau før lagring i databasen:

| Datatype | Krypteringsmetode | Detaljer |
|----------|-------------------|----------|
| **Bank access tokens** | AES-256-GCM | Krypteret via `crypto.ts` — IV + auth tag + ciphertext |
| **Bank refresh tokens** | AES-256-GCM | Samme mekanisme som access tokens |
| **TOTP secrets (2FA)** | AES-256-GCM | Krypteret via `crypto.ts` + `two-factor.ts` |
| **2FA backup codes** | AES-256-GCM + SHA-256 | Codes hashes med SHA-256, derefter krypteret samlet |
| **Brugeradgangskoder** | bcrypt (12 rounds) | Hashed via `password.ts` — ingen lagring af plaintext passwords |

**AES-256-GCM implementeringsdetaljer:**

| Parameter | Værdi |
|-----------|-------|
| Algoritme | AES-256-GCM |
| Nøglelængde | 256 bit (32 byte) |
| IV-længde | 96 bit (12 byte) — NIST SP 800-38D |
| Auth tag | 128 bit (16 byte) |
| Lagringsformat | `iv_base64:authTag_base64:ciphertext_base64` |
| Nøglekilde | Miljøvariabel `ENCRYPTION_KEY` (ikke gemt i database) |

> **Vigtigt:** Krypteringsnøglen (`ENCRYPTION_KEY`) opbevares udelukkende i servermiljøets miljøvariabler og er aldrig gemt i databasen. Tab af nøglen gør krypterede data uigenkaldeligt utilgængelige.

---

## 7. Data Integrity og Backup hos AlphaFlow

### 7.1 AlphaFlows eget backup-system

AlphaFlow implementerer et **uafhængigt backup-system**, som supplerer Neons indbyggede backup-funktioner. Dette giver **defense in depth** — to uafhængige backup-lag.

Backup-systemet er implementeret i følgende moduler:

| Modul | Fil | Funktion |
|-------|-----|----------|
| **Backup Engine** | `src/lib/backup-engine.ts` | Oprettelse og gendannelse af tenant-snapshots |
| **Backup Scheduler** | `src/lib/backup-scheduler.ts` | Automatiske cron-baserede backup-cykler |

### 7.2 Backup-format og integritet

| Egenskab | Detalje |
|----------|---------|
| **Format** | ZIP-arkiv med strukturerede JSON-filer pr. tenant |
| **Indhold** | manifest.json, company.json, accounts.json, transactions.json, invoices.json, journal-entries.json, m.fl. |
| **Integritetskontrol** | SHA-256-checksum af hele ZIP-filen (streaming-beregnet) |
| **Versionsnummer** | Manifest version 2 (aktuel) |
| **Tenant-isolering** | Hver backup indeholder kun data tilhørende én specifik virksomhed |

### 7.3 Retention-politik

Retention-politikken er designet til at opfylde **Bogføringslovens §15**-krav om 5 års datalagring:

| Backup-type | Frekvens | Antal bevaret | Retention-periode |
|-------------|----------|---------------|-------------------|
| **Hourly** | Hver time (minut 5) | 24 | 25 timer |
| **Daily** | Daglig kl. 02:15 | 30 | 31 dage |
| **Weekly** | Mandag kl. 03:30 | 52 | 53 dage |
| **Monthly** | 1. i måneden kl. 04:00 | **60** | **5 år (60 måneder)** |
| **Manual** | På brugerinitiativ | 999 | 90 dage |

> **5-års retention:** De 60 månedlige backups sikrer, at bogføringsdata kan gendannes for op til 5 år tilbage, hvilket opfylder Bogføringslovens krav.

### 7.4 Automatiske backup-cykler

Backup-scheduleren (`backup-scheduler.ts`) kører følgende automatiske cyklusser via cron:

| Cron-udtryk | Type | Beskrivelse |
|-------------|------|-------------|
| `5 * * * *` | Hourly | Hver time, minut 5 |
| `15 2 * * *` | Daily | Daglig kl. 02:15 |
| `30 3 * * 1` | Weekly | Mandag kl. 03:30 |
| `0 4 1 * *` | Monthly | 1. i måneden kl. 04:00 |
| `0 3 * * *` | Cleanup | Daglig kl. 03:00 — sletter udløbne backups |

Scheduleren implementerer:

- **Per-tenant health monitoring:** Hver virksomhed har uafhængig overvågning af backup-status
- **Deduplication:** Forhindrer duplikerede backups inden for cooldown-perioder
- **First-data trigger:** Opretter initiale backups automatisk ved virksomhedens første dataindtastning
- **Graceful error handling:** Mislykkede backups logges uden at påvirke andre tenants

### 7.5 Gendannelse (Restore)

Backup-systemet understøtter to gendannelsesmetoder:

| Metode | Beskrivelse |
|--------|-------------|
| **Gendannelse fra eksisterende backup** | Brugeren vælger en specifik backup fra listen; checksum verificeres før gendannelse |
| **Upload og gendannelse** | Brugeren uploader en ZIP-fil; systemet parser og gendanner data |

Før hver gendannelse oprettes automatisk en **pre-restore safety backup** for at beskytte eksisterende data. Gendannelsen foregår atomisk via database-transaktion — hvis gendannelsen fejler, rulles ændringer tilbage.

### 7.6 Defense in Depth

| Lag | Ansvarlig | Beskrivelse |
|-----|-----------|-------------|
| **Lag 1: Neons infrastruktur** | Neon | AES-256-kryptering på disk, PITR, daglige backups |
| **Lag 2: AlphaFlows tenant-backups** | AlphaFlow | SHA-256-verificerede tenant-snapshots med 5-års retention |
| **Lag 3: Applikationskryptering** | AlphaFlow | AES-256-GCM for følsomme felter (tokens, 2FA-secrets) |

Disse tre lag er teknologisk uafhængige — et fejl i ét lag kompromitterer ikke de øvrige.

---

## 8. Konklusion

### 8.1 Samlet vurdering

Neon PostgreSQL opfylder som databaseløsning alle krav, der stilles til en tredjepartsdatalager for elektronisk bogføring jf. BEK nr. 98 af 23. januar 2025.

| Krav | Status | Begrundelse |
|------|--------|-------------|
| **D5 — Tredjeparts IT-sikkerhed** | ✅ Opfyldt | SOC 2 Type II-certificering, AES-256-kryptering, TLS, access control |
| **D6 — Aftale med 3. part opbevaring** | ✅ Opfyldt | Neons DPA er accepteret som del af abonnementet |
| **N23 — Formel aftale** | ✅ Opfyldt | DPA opfylder GDPR art. 28 og er tilgængelig i formelt format |
| **GDPR — EU/EEA-hosting** | ✅ Opfyldt | Primære datacentre i Frankfurt og Amsterdam |
| **Bogføringsloven §15 — Datalagring** | ✅ Opfyldt | AlphaFlows backup-system med 5-års retention via månedlige backups |

### 8.2 Risikovurdering

| Risiko | Sandsynlighed | Konsekvens | Afbødning |
|--------|---------------|-------------|------------|
| Datatab ved Neon-nedetid | Lav | Høj | AlphaFlows uafhængige tenant-backups (defense in depth) |
| Uautoriseret adgang til database | Meget lav | Kritisk | `sslmode=require`, adgangskontrol, applikationskryptering |
| Dataoverførsel uden for EU/EEA | Meget lav | Høj | EU-region valgt; DPA forbyder transfer til tredjelande |
| Service-afbrydelse hos Neon | Lav | Medium | PITR, auto-scaling, AlphaFlows lokale backups |

### 8.3 Dokumentgodkendelse

| Rolle | Navn | Dato | Underskrift |
|------|------|------|-------------|
| Teknisk ansvarlig | AlphaFlow | 2025 | _[underskrift]_ |
| Databeskyttelsesansvarlig (DPO) | AlphaFlow | 2025 | _[underskrift]_ |
| Ledelse | AlphaFlow | 2025 | _[underskrift]_ |

---

*Dette dokument opdateres årligt eller ved væsentlige ændringer i AlphaFlows infrastruktur eller Neons servicevilkår.*
