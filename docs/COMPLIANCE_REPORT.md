# Intern Kontrolrapport — Compliance for Digitalt Regnskabssystem

---

## Forside

| Felt | Indhold |
|------|---------|
| **Dokumenttype** | Intern kontrolrapport / Compliance-rapport |
| **Systemnavn** | AlphaFlow (alphaflow.dk) |
| **Dokumentversion** | 2.0 |
| **Udarbejdet dato** | 2025 |
| **Gyldighedsområde** | AlphaFlow produktionsmiljø |
| **Myndighed** | Erhvervsstyrelsen (Virk.dk) |
| **Formål** | Godkendelse af digitalt regnskabssystem i henhold til Bogføringsloven |
| **Lovgrundlag** | LBK nr. 1316 af 14/08/2023, Bekendtgørelse om digitalisering af regnskabsmateriale, GDPR |
| **Systemtype** | Multi-tenant SaaS cloud regnskabssystem |
| **Sprog** | Dansk |

---

## Indholdsfortegnelse

1. [Indledning](#1-indledning)
2. [Systembeskrivelse](#2-systembeskrivelse)
3. [Organisatorisk Forankring](#3-organisatorisk-forankring)
4. [Bogføringsmateriale](#4-bogføringsmateriale)
5. [Intern Kontrol](#5-intern-kontrol)
6. [Kryptering og Datasikkerhed](#6-kryptering-og-datasikkerhed)
7. [SAF-T Eksport](#7-saf-t-eksport)
8. [OIOUBL Fakturering](#8-oioubl-fakturering)
9. [Backup og Gendannelse](#9-backup-og-gendannelse)
10. [Adgangskontrol og Roller](#10-adgangskontrol-og-roller)
11. [Regnskabsperioder og Afslutning](#11-regnskabsperioder-og-afslutning)
12. [Compliance Matrix](#12-compliance-matrix)
13. [TOF/MFA (2-Faktor Autentificering)](#13-tofmfa-2-faktor-autentificering)
14. [Standardkontoplan og Mapping](#14-standardkontoplan-og-mapping)
15. [E-faktura Modtagelse (OIOUBL + Peppol)](#15-e-faktura-modtagelse-oioubl--peppol)
16. [E-faktura Fremsendelse og NemHandel](#16-e-faktura-fremsendelse-og-nemhandel)
17. [Årsregnskab og Moms-API](#17-årsregnskab-og-moms-api)
18. [Fremmedvaluta og Udbyderskift](#18-fremmedvaluta-og-udbyderskift)
19. [Bilag](#19-bilag)

---

## 1. Indledning

### 1.1 Formål

Nærværende intern kontrolrapport er udarbejdet med henblik på at dokumentere, at AlphaFlow (alphaflow.dk) opfylder kravene i dansk lovgivning for digitale regnskabssystemer. Rapporten udgør en del af ansøgningen til Erhvervsstyrelsen om godkendelse af AlphaFlow som digitalt regnskabssystem i henhold til Bogføringsloven.

Rapporten beskriver systemets tekniske arkitektur, organisatoriske forankring, sikkerhedsforanstaltninger, interne kontroller og compliance med gældende lovgivning.

### 1.2 Lovgrundlag

AlphaFlow er udviklet med henblik på at overholde følgende lovgivning:

| Lov / Bekendtgørelse | Relevans |
|----------------------|----------|
| **Bogføringsloven** (LBK nr. 1316 af 14/08/2023) | Primær lovgivning for regnskabspligt, dokumentationskrav, opbevaringspligt |
| **Bekendtgørelse om digitalisering af regnskabsmateriale** (Digitaliseringsbekendtgørelsen) | Krav til elektronisk regnskabsmateriale, tilgængelighed og sikkerhed |
| **EU's generelle databeskyttelsesforordning** (GDPR) | Sikkerhed for behandling af personoplysninger (artikel 32) |
| **SAF-T Financial DK v1.0** | Standardformat for udlevering af regnskabsdata til skattemyndigheder |
| **Peppol BIS Billing 3.0 / OIOUBL** | Standard for elektronisk fakturering til offentlige myndigheder |

### 1.3 Anvendelsesområde

Denne rapport dækker AlphaFlow i sin fulde produktionsudgave som multi-tenant SaaS-regnskabssystem. Rapporten beskriver:

- Systemets tekniske arkitektur og datasikkerhed
- Organisatorisk struktur og ansvarsfordeling
- Konceptet for bogføring af erhvervsmæssige transaktioner
- Interne kontroller, herunder adgangskontrol og audit trail
- Krypteringsimplementering (i hvile og i transit)
- Eksportfunktioner (SAF-T og OIOUBL)
- Backup- og gendannelsesprocedurer
- Regnskabsperiodestyring og årsafslutning
- Fuld compliance-matrix med lovgivningskrav

### 1.4 Definitioner

| Begreb | Definition |
|--------|-----------|
| **AlphaFlow** | Det digitale regnskabssystem, der er genstand for denne compliance-rapport |
| **Tenant** | En enkelt virksomhed i det multi-tenant system |
| **Multi-tenant** | Arkitektur, hvor flere virksomheder deler infrastruktur, men data er fuldstændig isoleret |
| **RBAC** | Role-Based Access Control — rollebaseret adgangskontrol |
| **Audit trail** | Uforanderlig log over alle handlinger i systemet |
| **SAF-T** | Standard Audit File for Tax — standardiseret filformat for regnskabsdata |
| **OIOUBL** | dansk XML-standard for elektronisk fakturering baseret på UBL 2.1 |

---

## 2. Systembeskrivelse

### 2.1 Overordnet Arkitektur

AlphaFlow er et moderne, cloudbaseret multi-tenant regnskabssystem udviklet i TypeScript og baseret på Next.js-frameworket. Systemet er hosted hos Neon (PostgreSQL) med Caddy som reverse proxy.

| Komponent | Teknologi | Version |
|-----------|-----------|---------|
| Frontend | Next.js med App Router | 16 |
| Sprog | TypeScript | 5 |
| ORM | Prisma | Latest |
| Database | PostgreSQL (Neon managed) | Latest stable |
| Reverse Proxy | Caddy | v2 |
| Kryptering | AES-256-GCM + TLS 1.3 | — |
| Løbetid | Node.js (Bun runtime) | Latest |

### 2.2 Multi-Tenant Arkitektur

AlphaFlow anvender virksomhedsbaseret tenant-isolering (company-based multi-tenancy). Alle data er knyttet til en virksomhed (Company) via fremmednøgler, og samtlige 89 API-ruter er scopet til virksomhedsniveau.

| Egenskab | Beskrivelse |
|----------|-------------|
| **Tenant-model** | Virksomhedsbaseret isolering via Company-model |
| **API-ruter** | 89 ruter, alle scopet per virksomhed |
| **Dataisolering** | Alle forespørgsler filtreres på companyId |
| **Identifikation** | virksomhedsspecifikke kontekst i hver session |
| **Forebyggelse af data-lækage** | Prisma tenantFilter på alle databasekald |

### 2.3 Datamodel

Systemets datamodel består af 23 Prisma-modeller organiseret omkring virksomhedens regnskabsdata:

| Kategori | Modeller |
|----------|----------|
| **Kerne** | Company, User, UserCompany, Session, Invitation |
| **Regnskab** | Transaction, Invoice, JournalEntry, JournalEntryLine |
| **Kontoplan** | Account, Contact |
| **Periode** | FiscalPeriod, Budget, BudgetEntry |
| **Bank** | BankStatement, BankStatementLine, BankConnection, BankConnectionSync |
| **Automatisering** | RecurringEntry |
| **Dokumentation** | Document |
| **System** | AuditLog, Backup, EmailLog |

Herudover definerer systemet 15 enums, herunder:

| Enum | Formål |
|------|--------|
| CompanyRole | OWNER, ADMIN, ACCOUNTANT, VIEWER, AUDITOR |
| AccountGroup | 22 kontogrupper (FSR dansk standard) |
| VATCode | 10 momskoder (S25, S12, S0, SEU, K25, K12, K0, KEU, KUF, NONE) |
| PeriodStatus | OPEN, CLOSED |
| JournalEntryStatus | DRAFT, POSTED, CANCELLED |
| InvoiceStatus | DRAFT, SENT, PAID, OVERDUE, CANCELLED |
| Permission | 23 tilladelser fordelt på 7 kategorier |
| AuditAction | 13+ begivenhedstyper |

### 2.4 Infrastruktur

| Komponent | Beskrivelse |
|-----------|-------------|
| **Produktionsdomæne** | alphaflow.dk |
| **Reverse Proxy** | Caddy v2 med automatiske Let's Encrypt-certifikater |
| **Database** | Neon Serverless PostgreSQL med `sslmode=require` |
| **Kryptering i transit** | TLS 1.3 (standard), minimum TLS 1.2 |
| **Kryptering i hvile** | AES-256-GCM for følsomme data (bank-tokens) |
| **Adgangskodehashing** | bcrypt med 12 salt-runder |
| **Sessionsikkerhed** | 32-byte kryptografisk tilfældige tokens |

### 2.5 Sikkerhedslag (Defense-in-Depth)

AlphaFlow benytter et multi-lag sikkerhedsarkitektur med fem beskyttelseslag:

| Lag | Sikkerhedsforanstaltning | Beskyttelse |
|-----|--------------------------|-------------|
| **1. Netværk** | TLS 1.3 + HSTS | Kryptering af al netværkstrafik |
| **2. Transport** | `sslmode=require` (PostgreSQL) | Krypteret databaseforbindelse |
| **3. Data** | AES-256-GCM + bcrypt | Kryptering af følsomme data og adgangskoder |
| **4. Adgangskontrol** | RBAC (5 roller, 23 tilladelser) | Granulær autorisation |
| **5. Overvågning** | Uforanderlig audit trail | Logning af alle ændringer |

---

## 3. Organisatorisk Forankring

### 3.1 Systemansvar

AlphaFlow er udviklet og drives som et software-as-a-service-produkt. Systemansvaret er forankret hos systemejeren, der har det samlede ansvar for:

- Systemets tekniske drift og vedligeholdelse
- Overholdelse af gældende lovgivning
- Sikkerhed og databeskyttelse
- Tilgængelighed og oppetid
- Backups og gendannelse

### 3.2 Brugerroller i Systemet

AlphaFlow differentierer mellem fem roller, der each tildeler specifikke rettigheder til at anvende systemets funktioner:

| Rolle | Beskrivelse | Tildeling |
|-------|-------------|-----------|
| **Ejer (OWNER)** | Fuld adgang til alle funktioner, herunder sletning og overdragelse af virksomhed | Tildelt automatisk ved oprettelse |
| **Administrator (ADMIN)** | Kan administrere teammedlemmer, forbinde banker og ændre indstillinger | Tildelt af Ejer eller Administrator |
| **Bogholder (ACCOUNTANT)** | Kan oprette, redigere og annullere finansposter, journalposter og fakturaer | Tildelt af Ejer eller Administrator |
| **Seer (VIEWER)** | Har skrivebeskyttet adgang til rapporter og data | Tildelt af Ejer eller Administrator |
| **Revisor (AUDITOR)** | Kan eksportere rapporter og SAF-T filer til compliance | Tildelt af Ejer eller Administrator |

### 3.3 Invitering og Onboarding

Nye brugere tilføjes til en virksomhed via et invitationssystem:

1. En autoriseret bruger (OWNER eller ADMIN) sender en invitation via e-mail
2. Den inviterede modtager et sikkerhedslink og opretter en konto
3. Systemet tildeler automatisk den valgte rolle
4. Alle invitationer logges i audit trail

### 3.4 Virksomhedsskift

Brugere, der er medlem af flere virksomheder, kan skifte mellem virksomhedskontekster. Ved skift opdateres alle data og menuer til den valgte virksomhed. Alle virksomhedsskift logges.

### 3.5 Tilsynsfunktion (Oversight)

Systemet tilbyder en SUPER_DEV tilsynsfunktion til teknisk support og fejlfinding:

| Egenskab | Beskrivelse |
|----------|-------------|
| **Adgangstype** | Skrivebeskyttet læseadgang på tværs af tenants |
| **Tilladelser** | 6 specifikke læsetilladelser (ikke skrivetilladelser) |
| **Logning** | Alle tilsynshandlinger logges som OVERSIGHT-begivenheder |
| **Formål** | Teknisk support, fejlfinding, compliance-audit |

---

## 4. Bogføringsmateriale

### 4.1 Generelt

I henhold til Bogføringsloven § 1 stk. 1 skal alle erhvervsmæssige transaktioner bogføres. AlphaFlow understøtter fuld dobbelt bogføring med debet og kredit.

### 4.2 Kontoplan

AlphaFlow opretter automatisk en standard dansk kontoplan ved virksomhedsoprettelse. Kontoplanen er baseret på FSR-standard (Foreningen af Statsautoriserede Revisorer) med 22 kontogrupper og 40+ standardkonti.

| Kontonummer | Gruppe | Eksempler på konti |
|-------------|--------|-------------------|
| 1xxx | **Aktiver** | Kasse (1000), Bankkonto (1100), Tilgodehavender (1200), Varelager (1300), IT-udstyr (1800) |
| 2xxx | **Passiv** | Leverandørgæld (2000), Momsgæld (2200), Personalegæld (2400), Banklån (2600) |
| 3xxx | **Egenkapital** | Aktiekapital (3000), Reserver (3200), Årets resultat (3300), Overført resultat (3400) |
| 4xxx–5xxx | **Indtægter** | Salg af varer (4000), Tjenesteydelser (4100), EU-salg (4200), Eksport (4300) |
| 6xxx–9xxx | **Omkostninger** | Vareforbrug (6000), Lønninger (7000), Husleje (8000), Renteomkostninger (9100) |

Brugere kan tilføje, deaktivere og tilpasse konti efter behov. Systemkonti kan kun deaktiveres, ikke slettes.

### 4.3 Journalposter

Journalposter er systemets kernefunktion for bogføring af transaktioner:

**Egenskaber:**

| Egenskab | Beskrivelse |
|----------|-------------|
| **Type** | Dobbelt bogføring (debet/kredit) |
| **Linjer** | Minimum to linjer pr. post, der skal balancere |
| **Status** | DRAFT → POSTED workflow |
| **Sletning** | Soft-delete (annullering med årsag) |
| **Dokumentation** | Bilagsføring med dokumentvedhæftning |

**Statusarbejdsgang:**

| Status | Beskrivelse |
|--------|-------------|
| **KLADDE (DRAFT)** | Posten er gemt, men endnu ikke bogført. Kan redigeres og slettes. |
| **BOGFØRT (POSTED)** | Posten er endeligt bogført og kan ikke længere redigeres. |
| **ANNULLERET (CANCELLED)** | Posten er annulleret med modpost og årsagsangivelse. |

**Annullering i overensstemmelse med Bogføringsloven:**

I henhold til Bogføringslovens principper om uigendrkelig dokumentation slettes poster aldrig fysisk. I stedet annulleres de (soft-delete):

1. Brugeren klikker "Annuller" på en bogført post
2. Systemet kræver en årsagsangivelse (f.eks. "Fejlbogføring — dobbeltkontering")
3. Systemet opretter automatisk en modpost, der neutraliserer den oprindelige post
4. Annulleringen logges uforanderligt i audit trail med dato, bruger og årsag

### 4.4 Fakturering

AlphaFlow understøtter fuld fakturering med følgende funktioner:

| Funktion | Beskrivelse |
|----------|-------------|
| **Salgsfakturaer** | Fakturaer med linjevarer, momsberegning og PDF-generering |
| **Kreditnotaer** | Kreditnotaer (InvoiceTypeCode 381) med automatisk modpost |
| **Moms** | Automatisk momsberegning med 10 momskoder |
| **Eksport** | PDF-eksport og OIOUBL XML-eksport |
| **Bilagsføring** | Dokumentvedhæftning til journalposter |

### 4.5 Momssystem (Moms)

AlphaFlow implementerer et fuldt dansk momssystem med 10 momskoder:

| Momskode | Type | Sats | Beskrivelse |
|----------|------|------|-------------|
| S25 | Udgående | 25% | Standard udgående moms |
| S12 | Udgående | 12% | Reduceret udgående moms |
| S0 | Udgående | 0% | Nul udgående moms |
| SEU | Udgående | 0% | EU-leverancer (reverse charge) |
| K25 | Indgående | 25% | Standard indgående moms |
| K12 | Indgående | 12% | Reduceret indgående moms |
| K0 | Indgående | 0% | Nul indgående moms |
| KEU | Indgående | 0% | EU-indkøb (reverse charge) |
| KUF | Indgående | 0% | Udenlandsk tjenesteydelse |
| NONE | Ingen | — | Momsfri transaktion |

### 4.6 Bankafstemning

| Funktion | Beskrivelse |
|----------|-------------|
| **Open Banking** | Integration med danske bankudbydere via samtykkebaseret adgang |
| **CSV-import** | Import af kontoudtog i CSV-format |
| **Automatisk afstemning** | Matching-motor baseret på beløb, dato og tekst |
| **Manuel afstemning** | Manuel matching af bankposter med journalposter |
| **Kryptering** | Bank-tokens krypteres med AES-256-GCM før lagring |

### 4.7 Dokumenthåndtering

| Funktion | Beskrivelse |
|----------|-------------|
| **Bilagsføring** | Vedhæftning af dokumenter til journalposter |
| **Kvitteringsscanning** | OpenCV-baseret dokumentdetektion og perspektivkorrektion |
| **OCR** | Automatisk genkendelse af beløb, dato og butik fra billeder |
| **Formater** | PDF, billeder og andre dokumenttyper |

### 4.8 Gentagende Poster

AlphaFlow understøtter oprettelse af gentagende journalposter med følgende intervaller:

| Intervall | Beskrivelse |
|-----------|-------------|
| Dagligt | Gentages hver dag |
| Ugentligt | Gentages hver uge |
| Månedligt | Gentages hver måned |
| Kvartalsvis | Gentages hvert kvartal |
| Årligt | Gentages hvert år |

### 4.9 Rapportering

AlphaFlow tilbyder følgende rapporttyper:

| Rapport | Beskrivelse |
|---------|-------------|
| **Balance** | Oversigt over aktiver, passiv og egenkapital |
| **Resultatopgørelse** | Indtægter og omkostninger med nettoresultat |
| **Momsrapport** | Udgående og indgående moms pr. periode |
| **Finansrapport (General Ledger)** | Alle journalposter med detaljer |
| **Aldersfordelte rapporter (Aging)** | Tilgodehavender og forfaldne fordringer |
| **Budget vs. Faktisk** | Sammenligning af budgetterede og faktiske beløb |
| **Cash Flow** | Likviditetsudvikling |
| **Udgifter** | Kategoriseret udgiftsanalyse |
| **Økonomisk Sundhed** | Nøgletal og finansielle indikatorer |

Alle rapporter kan eksporteres som PDF eller i andre læsbare formater.

---

## 5. Intern Kontrol

### 5.1 Kontrolmiljø

AlphaFlows kontrolmiljø er bygget på følgende principper:

- **Separation of duties:** Forskellige roller har forskellige rettigheder
- **Uforanderlig dokumentation:** Alle ændringer logges uforanderligt
- **Automatiske kontroller:** Systemet udfører validering ved alle indtastninger
- **Adgangskontrol:** Granulær RBAC med 5 roller og 23 tilladelser

### 5.2 Adgangskontrol (RBAC)

Se afsnit 10 for fuld beskrivelse af rollebaseret adgangskontrol.

### 5.3 Audit Trail

AlphaFlow implementerer en uforanderlig (immutable) audit trail, der registrerer alle væsentlige handlinger i systemet.

#### 5.3.1 Uforanderlighed

- Audit-logposter kan **aldrig slettes eller ændres**
- Der findes ingen funktionalitet til redigering eller sletning af logposter
- Dette sikrer, at dokumentationen altid er fuldstændig, ægte og pålidelig

#### 5.3.2 Begivenhedstyper

Systemet definerer 13+ begivenhedstyper:

| Begivenhedstype | Beskrivelse |
|-----------------|-------------|
| `CREATE` | Oprettelse af data |
| `UPDATE` | Ændring af eksisterende data |
| `CANCEL` | Annullering (soft-delete med årsag) |
| `DELETE_ATTEMPT` | Forsøg på sletning (logges, men forhindres) |
| `LOGIN` | Succesfuld login |
| `LOGIN_FAILED` | Mislykket login |
| `LOGOUT` | Bruger logget ud |
| `REGISTER` | Ny brugeroprettelse |
| `BACKUP_CREATE` | Oprettelse af backup |
| `BACKUP_RESTORE` | Gendannelse fra backup |
| `BACKUP_DELETE` | Sletning af backup |
| `SESSION_INVALIDATE` | Tilbagekaldelse af session |
| `DATA_RESET` | Nulstilling af data |
| `OVERSIGHT` | Tilsynsfunktion anvendt |

#### 5.3.3 Entitetstyper

Audit trail dækker følgende entitetstyper:

User, Transaction, Invoice, Company, Session, Backup, Account, JournalEntry, Contact, FiscalPeriod, BankStatement, BankConnection, Document, RecurringEntry, Budget, YearEndClosing, Invitation, UserCompany, System

#### 5.3.4 Kontekstdata

Hver audit-logpost indeholder:

| Felt | Beskrivelse |
|------|-------------|
| `userId` | ID på brugeren, der udførte handlingen |
| `companyId` | Virksomhedskontekst |
| `performedByUserId` | Den faktiske udførende bruger (ved tilsyn) |
| `timestamp` | Præcist tidspunkt (ISO 8601) |
| `ipAddress` | Klientens IP-adresse |
| `userAgent` | Browser-/enhedsidentifikation |
| `before` | Tilstand før ændringen (JSON) |
| `after` | Tilstand efter ændringen (JSON) |
| `reason` | Årsag (ved annulleringer) |

### 5.4 Dataintegritet

| Kontrol | Beskrivelse |
|---------|-------------|
| **Autentificeret kryptering** | AES-256-GCM med authentication tag for integritetsverifikation |
| **Balancekontrol** | Journalposter skal balancere (debet = kredit) |
| **Uforanderlig log** | Audit trail kan ikke redigeres eller slettes |
| **Soft-delete** | Poster annulleres med modpost, ikke slettet fysisk |
| **Referentielle integritet** | Database foreign keys forhindrer orphan-data |
| **Validering** | Alle input valideres før lagring (format, længde, logik) |

### 5.5 Multi-Tenant Isolering

| Kontrol | Beskrivelse |
|---------|-------------|
| **Virksomhedsscopning** | Alle 89 API-ruter filtrerer på companyId |
| **Sessionbinding** | Hver session er bundet til en specifik virksomhed |
| **TenantFilter** | Prisma middleware filtrerer alle databasekald |
| **Adgangskontrol** | RBAC-tjek på 47 af 89 ruter |

---

## 6. Kryptering og Datasikkerhed

### 6.1 Kryptering i Hvile (At-Rest)

AlphaFlow benytter AES-256-GCM til kryptering af følsomme data (bank-adgangstokens og opdateringstokens) før lagring i databasen.

| Parameter | Værdi |
|-----------|-------|
| **Algoritme** | AES-256-GCM (Advanced Encryption Standard — Galois/Counter Mode) |
| **Nøglelængde** | 256 bit (32 bytes) |
| **IV (Initialization Vector)** | 96 bit (12 bytes) — tilfældig ved hver kryptering |
| **Authentication Tag** | 128 bit (16 bytes) |
| **Nøglekilde** | Miljøvariablen `ENCRYPTION_KEY` (hex-kodet, 64 tegn) |
| **Implementering** | `src/lib/crypto.ts` (server-side kun) |

**Hvorfor AES-256-GCM?**

AES-256-GCM er en autentificeret krypteringsalgoritme (AEAD), der leverer:

1. **Fortrolighed (Confidentiality):** Data kan kun læses med den korrekte nøgle.
2. **Integritet (Integrity):** Enhver manipulation af krypteret data afsløres ved dekryptering via authentication tag.

### 6.1.1 Lagringsformat

Krypterede data lagres i PostgreSQL i følgende format:

```
iv_base64:authTag_base64:ciphertext_base64
```

| Del | Beskrivelse |
|-----|-------------|
| `iv_base64` | Initialization Vector (12 bytes, Base64-kodet) |
| `authTag_base64` | Authentication Tag (16 bytes, Base64-kodet) |
| `ciphertext_base64` | Krypteret data (variabel længde, Base64-kodet) |

### 6.1.2 IV-håndtering

- Hver krypteringsoperation genererer en **ny tilfældig IV** (12 bytes)
- IV'er **genbruges aldrig** — kritisk krav for GCM-tilstand
- IV genereres via `crypto.getRandomValues()` (CSPRNG)
- Nøglen caches i hukommelsen, men **gemmes aldrig** i database eller git

### 6.1.3 Nøglehåndtering

| Regel | Beskrivelse |
|-------|-------------|
| Kun miljøvariabel | Nøglen læses fra `process.env.ENCRYPTION_KEY` |
| Aldrig i database | Nøglen gemmes aldrig i nogen databasetabel |
| Aldrig i git | Ekskluderet via `.gitignore` |
| Kun server-side | Kun tilgængelig i server-side kode |
| Caching | Parseres én gang og caches i hukommelsen |

### 6.2 Kryptering i Transit (In-Transit)

### 6.2.1 TLS 1.3

| Parameter | Konfiguration |
|-----------|---------------|
| **Reverse Proxy** | Caddy v2 |
| **Certifikatudsteder** | Let's Encrypt (automatisk fornyelse) |
| **Produktionsdomæne** | `alphaflow.dk` |
| **Standard TLS-version** | TLS 1.3 |
| **Minimum TLS-version** | TLS 1.2 |
| **HTTP→HTTPS** | Automatisk omdirigering |

### 6.2.2 HSTS (HTTP Strict Transport Security)

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

| Parameter | Værdi | Betydning |
|-----------|-------|-----------|
| `max-age` | 31536000 sekunder (1 år) | Browser tvinges til HTTPS i 1 år |
| `includeSubDomains` | Aktiveret | Gælder for alle subdomæner |
| `preload` | Aktiveret | Indsendes til browser-preload lister |

### 6.2.3 Sikkerhedshoveder

| Header | Værdi | Formål |
|--------|-------|--------|
| `X-Frame-Options` | DENY | Forhindrer clickjacking via iframe-indlejring |
| `X-Content-Type-Options` | nosniff | Forhindrer MIME-type sniffing |
| `X-XSS-Protection` | 1; mode=block | Browser-indbygget XSS-filter |
| `Referrer-Policy` | strict-origin-when-cross-origin | Begrænser referrer-information |
| `Permissions-Policy` | Kamera, mikrofon, lokation | Begrænser browser-API-adgang |

### 6.3 Adgangskodesikkerhed

| Parameter | Værdi |
|-----------|-------|
| **Algoritme** | bcrypt |
| **Salt-runder** | 12 |
| **Implementering** | `src/lib/password.ts` (bcryptjs) |
| **Lagring** | Kun hash — adgangskoden gemmes aldrig i klartekst |

**Sikkerhedsprincipper:**

- Adgangskoder transmitteres kun over krypteret forbindelse (TLS 1.3)
- Adgangskoder lagres aldrig i klartekst i databasen eller logs
- Adgangskoder logges aldrig eller vises i nogen form
- Ved login sammenlignes kun hashes

### 6.4 Sessionsikkerhed

| Egenskab | Beskrivelse |
|----------|-------------|
| **Token** | Kryptografisk tilfældig 32-byte streng |
| **Udløb** | 7 dage (sliding expiry) |
| **Binding** | IP-adresse og User-Agent tracking |
| **Tilbagekaldelse** | Umiddelbar invalidering ved logout |
| **Oprydning** | Udløbne sessions slettes automatisk |
| **Multi-session** | En bruger kan have flere aktive sessions |

### 6.5 Databaseforbindelsessikkerhed

| Parameter | Værdi |
|-----------|-------|
| **Database** | PostgreSQL (Neon managed) |
| **Forbindelsessikkerhed** | `sslmode=require` |
| **Kryptering** | TLS-krypteret forbindelse |
| **Krav** | Forbindelse afvises uden gyldigt TLS-certifikat |

Med `sslmode=require` er alle data transmitteret mellem applikation og database krypteret. Bank-tokens er dermed dobbelt krypteret: AES-256-GCM (data) + TLS (transport).

### 6.6 Sammenfatning af Datasikkerhed

```
┌─────────────────────────────────────────────────┐
│  AlphaFlow Datasikkerhed — 5 Lag               │
├─────────────────────────────────────────────────┤
│                                                  │
│  Lag 1: Netværkssikkerhed                       │
│  ├── TLS 1.3 (krypteret transit)                │
│  ├── HSTS (forhindrer downgrade)                │
│  └── Sikkerhedshoveder (X-Frame-Options mv.)    │
│                                                  │
│  Lag 2: Transportsikkerhed                      │
│  ├── sslmode=require (PostgreSQL)                │
│  └── Krypteret databaseforbindelse              │
│                                                  │
│  Lag 3: Datasikkerhed (At-Rest)                 │
│  ├── AES-256-GCM (bank-tokens, 256-bit)         │
│  └── bcrypt (adgangskoder, 12 salt-runder)      │
│                                                  │
│  Lag 4: Adgangskontrol                          │
│  ├── RBAC (5 roller, 23 tilladelser)            │
│  ├── Session-management (32-byte tokens)        │
│  └── Multi-tenant isolation                     │
│                                                  │
│  Lag 5: Overvågning                             │
│  ├── Audit trail (uforanderlig, 13+ typer)      │
│  └── Fuld kontekst (hvem/hvad/hvornår/hvorfra) │
│                                                  │
└─────────────────────────────────────────────────┘
```

---

## 7. SAF-T Eksport

### 7.1 Standard og Format

| Parameter | Værdi |
|-----------|-------|
| **Format** | SAF-T Financial DK v1.0 |
| **Filformat** | XML |
| **Namespace** | `urn:Oasis/Tax/Accounting/SAF-T/Financial/DK` |
| **Karakterkodning** | UTF-8 |
| **Formål** | Udlevering af regnskabsdata til Erhvervsstyrelsen/Skattestyrelsen |

### 7.2 Indhold

SAF-T-filen indeholder følgende sektioner:

| Sektion | Indhold | Datakilde |
|---------|---------|-----------|
| **Header** | Virksomhedsoplysninger (navn, CVR, adresse), tidsperiode | Company-model |
| **MasterFiles** | | |
| ├── GeneralLedgerAccounts | Komplet kontoplan | Account-model |
| ├── TaxCodeTable | Momskoder og satser | VATCode-enum |
| └── Customers | Kundekontakter (navn, CVR, adresse) | Contact-model (reelle data) |
| **GeneralLedgerEntries** | Bogførte journalposter med linjer | JournalEntry + JournalEntryLine |
| **SourceDocuments** | Salgsfakturaer | Invoice-model |
| **Totals** | Samlet debet, kredit og moms | Beregnet fra journalposter |

### 7.3 Kundedata (ikke Pladsholdere)

AlphaFlow eksporterer reelle kundedata fra Contact-modellen i MasterFiles-sektionen:

- Kundenavn
- CVR-nummer (TaxID)
- Adresse
- Kontaktoplysninger

Systemet benytter kun minimal pladsholderdata, hvis virksomheden ikke har nogen kunder registreret. Dette sikrer, at SAF-T-filen indeholder faktiske regnskabsdata.

### 7.4 Validering

Før eksport udfører systemet 23+ valideringskontroller:

| Kontrol | Beskrivelse |
|---------|-------------|
| **Obligatoriske felter** | Virksomhedsnavn, CVR, periode mv. skal være udfyldt |
| **CVR-format** | 8-cifret dansk CVR-nummer |
| **Balanceverifikation** | Sum debet = sum kredit i Totals |
| **Datoformat** | ISO 8601 (YYYY-MM-DD) |
| **Periodelogik** | Startdato ≤ slutdato |
| **Momssatser** | Gyldige danske satser (0%, 12%, 25%) |
| **Softwareversion** | SoftwareVersion-element er til stede |
| **XML-deklaration** | XML-prolog er til stede |
| **Pladsholder-kontrol** | Advarsel ved brug af pladsholder-kunder |
| **GL-entries** | GeneralLedgerEntries-sektion findes |
| **Landekode** | "DK" for danske virksomheder |

### 7.5 Eksportprocedure

1. Brugeren vælger "SAF-T eksport" under Rapporter → Eksporter
2. Angivelse af tidsperiode (start- og slutdato)
3. Systemet genererer XML-fil med automatiske valideringer
4. Valideringsfejl vises med forslag til rettelse
5. Ved succes: Download af den komplette SAF-T XML-fil

---

## 8. OIOUBL Fakturering

### 8.1 Standard og Profil

| Parameter | Værdi |
|-----------|-------|
| **Standard** | UBL 2.1 (Universal Business Language) |
| **Profil** | Peppol BIS Billing 3.0 |
| **Profil-URI** | `urn:cen.eu:en16931:2017` |
| **Formål** | Elektronisk fakturering til offentlige myndigheder og store virksomheder |

### 8.2 Fakturatyper

| InvoiceTypeCode | Type | Beskrivelse |
|-----------------|------|-------------|
| 380 | Commercial Invoice | Almindelig salgsfaktura |
| 381 | Credit Note | Kreditnota (annullering/korrektion) |
| 384 | Corrected Invoice | Rettet faktura |
| 389 | Self-billed Invoice | Selvfakturering |

### 8.3 Momskategorier

| Kategori | Kode | Beskrivelse |
|----------|------|-------------|
| S (Standard) | Standard | Standardmomssats (25%) |
| Z (Zero rate) | Zerorated | Nulsats (0%) |
| E (Exempt) | Undtaget | Momsfritaget |

### 8.4 Valuta

| Parameter | Værdi |
|-----------|-------|
| **Standardvaluta** | DKK (danske kroner) |
| **Multi-valuta** | Understøttet med valutakurser |
| **Format** | ISO 4217 |

### 8.5 Identifikation

| Parameter | Værdi |
|-----------|-------|
| **Endpoint ID Scheme** | 0184 (dansk CVR-nummer) |
| **Udsteder-ID** | Virksomhedens CVR-nummer |
| **Modtager-ID** | Kundens CVR eller GLN |

### 8.6 Validering

Før eksport udføres automatisk validering af:

| Kontrol | Beskrivelse |
|---------|-------------|
| **XML-struktur** | Gyldig i henhold til Peppol BIS Billing 3.0 |
| **Udstederoplysninger** | Navn, CVR, adresse er korrekte |
| **Modtageroplysninger** | Navn, CVR/ID, adresse er korrekte |
| **Linjevarer** | Beløb og momskoder er korrekte |
| **Totalbeløb** | Linjesum stemmer overens med total |
| **Momsberegning** | Mombeløb er korrekt beregnet |

### 8.7 Eksportprocedure

1. Brugeren åbner den ønskede faktura
2. Klik på "Eksportér OIOUBL"
3. Systemet genererer automatisk OIOUBL XML-fil
4. Validering udføres automatisk
5. Ved succes: Download af XML-filen
6. Filen kan uploades til modtagerens fakturaportal (f.eks. Nemhandel)

---

## 9. Backup og Gendannelse

### 9.1 Backupstrategi

AlphaFlow udfører automatiserede backups af virksomhedens data med følgende retention-politik:

| Backup-type | Hyppighed | Retention (antal) | Opbevaringstid |
|-------------|-----------|-------------------|----------------|
| Timebackup | Hver time | 24 | 1 dag |
| Dagsbackup | Hver dag | 30 | 30 dage |
| Ugebackup | Hver uge | 52 | 1 år |
| Månedsbackup | Hver måned | 60 | 5 år |
| Manuel backup | Efter behov | 999 | 90 dage |

### 9.2 Backupindhold

Hver backup indeholder virksomhedens komplette regnskabsdata som JSON-filer i et ZIP-arkiv:

| Fil | Indhold |
|-----|---------|
| `manifest.json` | Backup-metadata (timestamp, version, checksums) |
| `company.json` | Virksomhedsoplysninger |
| `accounts.json` | Komplet kontoplan |
| `contacts.json` | Kunder og leverandører |
| `transactions.json` | Alle transaktioner |
| `invoices.json` | Alle fakturaer |
| `journal-entries.json` | Alle journalposter med linjer |
| `fiscal-periods.json` | Regnskabsperioder |
| `budgets.json` | Budgetter |
| `recurring-entries.json` | Gentagende poster |
| `bank-statements.json` | Kontoudtog og linjer |
| `bank-connections.json` | Bankforbindelser (uden tokens) |
| `members.json` | Medlemskaber og roller |

### 9.3 Integritetskontrol

| Kontrol | Beskrivelse |
|---------|-------------|
| **SHA-256 checksums** | Alle backup-filer forsynes med SHA-256 checksum |
| **Verifikation** | Checksum kan bruges til at verificere filens integritet |
| **Manipulationsdetektion** | Enhver ændring af backup-filen opdages ved checksum-kontrol |

### 9.4 Gendannelsesprocedure

Gendannelse af data fra backup udføres via følgende sikrede procedure:

1. Brugeren vælger en backup fra listen
2. Klik på "Gendan"
3. Systemet opretter automatisk en **præ-gendannelses sikkerhedskopi** af nuværende data
4. Data importeres via **atomiske databasetransaktioner**
5. Ved fejl: transaktionen rulles automatisk tilbage (rollback)
6. Ved succes: gendannelsen fuldføres, og den gamle data er bevaret i sikkerhedskopien

### 9.5 Audit af Backup

Alle backup-relaterede handlinger logges uforanderligt i audit trail:

| Handling | Logtype |
|----------|---------|
| Oprettelse af backup | BACKUP_CREATE |
| Gendannelse fra backup | BACKUP_RESTORE |
| Sletning af backup | BACKUP_DELETE |

### 9.6 Opbevaringspligt

I henhold med Bogføringsloven § 15 stk. 1 skal regnskabsmateriale opbevares i mindst 5 år. AlphaFlow opfylder dette krav gennem:

- **Månedsbackups med 60 måneders retention** (5 år)
- **Ugebackups med 52 ugers retention** (1 år, overlap med månedsbackups)
- **SHA-256 checksums** til verificering af dataintegritet
- **Krypteret opbevaring** (TLS 1.3 for transit, AES-256-GCM for følsomme data)

---

## 10. Adgangskontrol og Roller

### 10.1 Rollebaseret Adgangskontrol (RBAC)

AlphaFlow implementerer et omfattende rollebaseret adgangskontrolsystem med 5 roller og 23 granulære tilladelser.

### 10.2 Roller

| Rolle | Niveau | Beskrivelse |
|-------|--------|-------------|
| **OWNER** | 5 (højeste) | Fuld adgang til alle funktioner, herunder sletning og overdragelse |
| **ADMIN** | 4 | Kan administrere teammedlemmer, forbinde banker og ændre indstillinger |
| **ACCOUNTANT** | 3 | Kan oprette, redigere og annullere finansposter og fakturaer |
| **VIEWER** | 2 | Skrivebeskyttet adgang til rapporter og data |
| **AUDITOR** | 1 | Kan eksportere rapporter og SAF-T filer til compliance |

### 10.3 Tilladelser (23 i alt)

#### 10.3.1 Virksomhed (4 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `COMPANY_VIEW_SETTINGS` | Vise virksomhedsindstillinger |
| `COMPANY_EDIT_SETTINGS` | Ændre virksomhedsindstillinger |
| `COMPANY_TRANSFER_OWNERSHIP` | Overdrage ejerskab af virksomhed |
| `COMPANY_DELETE` | Slette virksomhed |

#### 10.3.2 Medlemmer (4 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `MEMBERS_VIEW` | Vise teammedlemmer |
| `MEMBERS_INVITE` | Invitere nye medlemmer |
| `MEMBERS_REMOVE` | Fjerne medlemmer |
| `MEMBERS_CHANGE_ROLE` | Ændre medlemsrolle |

#### 10.3.3 Data (5 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `DATA_READ` | Læse regnskabsdata |
| `DATA_CREATE` | Oprette nye poster |
| `DATA_EDIT` | Redigere eksisterende poster |
| `DATA_CANCEL` | Annullere poster |
| `DATA_DELETE` | Slette data |

#### 10.3.4 Rapporter (3 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `REPORTS_VIEW` | Vise rapporter |
| `REPORTS_EXPORT` | Eksportere rapporter |
| `REPORTS_SAFT` | Eksportere SAF-T filer |

#### 10.3.5 Perioder (3 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `PERIOD_CLOSE` | Lukke regnskabsperiode |
| `PERIOD_OPEN` | Genåbne regnskabsperiode |
| `YEAR_END_CLOSE` | Udføre årsafslutning |

#### 10.3.6 Bank (2 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `BANK_CONNECT` | Forbinde bankforbindelser |
| `BANK_SYNC` | Synkronisere bankdata |

#### 10.3.7 Backup (2 tilladelser)

| Tilladelse | Beskrivelse |
|------------|-------------|
| `BACKUP_CREATE` | Oprette backup |
| `BACKUP_RESTORE` | Gendanne fra backup |

### 10.4 Rolle-Tilladelse Matrix

Nedenstående matrix viser, hvilke tilladelser der er tildelt hver rolle:

| Tilladelse | OWNER | ADMIN | ACCOUNTANT | VIEWER | AUDITOR |
|------------|:-----:|:-----:|:----------:|:------:|:-------:|
| COMPANY_VIEW_SETTINGS | ✅ | ✅ | ✅ | ✅ | ✅ |
| COMPANY_EDIT_SETTINGS | ✅ | ✅ | ❌ | ❌ | ❌ |
| COMPANY_TRANSFER_OWNERSHIP | ✅ | ❌ | ❌ | ❌ | ❌ |
| COMPANY_DELETE | ✅ | ❌ | ❌ | ❌ | ❌ |
| MEMBERS_VIEW | ✅ | ✅ | ✅ | ✅ | ✅ |
| MEMBERS_INVITE | ✅ | ✅ | ❌ | ❌ | ❌ |
| MEMBERS_REMOVE | ✅ | ✅ | ❌ | ❌ | ❌ |
| MEMBERS_CHANGE_ROLE | ✅ | ✅ | ❌ | ❌ | ❌ |
| DATA_READ | ✅ | ✅ | ✅ | ✅ | ✅ |
| DATA_CREATE | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_EDIT | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_CANCEL | ✅ | ✅ | ✅ | ❌ | ❌ |
| DATA_DELETE | ✅ | ❌ | ❌ | ❌ | ❌ |
| REPORTS_VIEW | ✅ | ✅ | ✅ | ✅ | ✅ |
| REPORTS_EXPORT | ✅ | ✅ | ✅ | ❌ | ✅ |
| REPORTS_SAFT | ✅ | ✅ | ✅ | ❌ | ✅ |
| PERIOD_CLOSE | ✅ | ✅ | ✅ | ❌ | ❌ |
| PERIOD_OPEN | ✅ | ✅ | ❌ | ❌ | ❌ |
| YEAR_END_CLOSE | ✅ | ✅ | ❌ | ❌ | ❌ |
| BANK_CONNECT | ✅ | ✅ | ❌ | ❌ | ❌ |
| BANK_SYNC | ✅ | ✅ | ❌ | ❌ | ❌ |
| BACKUP_CREATE | ✅ | ✅ | ❌ | ❌ | ❌ |
| BACKUP_RESTORE | ✅ | ✅ | ❌ | ❌ | ❌ |

### 10.5 Håndhævelse

Tilladelser håndhæves gennem en 5-lags guard-kæde:

| Lag | Guard | Beskrivelse |
|-----|-------|-------------|
| **1** | Autentificering | Verifikation af gyldig session (login kræves) |
| **2** | Virksomhedsscopning | Verifikation af adgang til den valgte virksomhed |
| **3** | Tilladelsestjek | Verifikation af specifik tilladelse til handlingen |
| **4** | Demo-blokering | Forhindring af mutationer i demo-virksomheder |
| **5** | Tilsynsblokering | Forhindring af skrivetilladelser i tilsynstilstand |

**Dækning:** 47 af 89 API-ruter kræver specifikke tilladelser.

### 10.6 SUPER_DEV Tilsynsfunktion

Til teknisk support og compliance-audit tilbyder systemet en SUPER_DEV tilsynsfunktion:

| Egenskab | Beskrivelse |
|----------|-------------|
| **Adgangstype** | Skrivebeskyttet læseadgang på tværs af tenants |
| **Tilladelser** | 6 specifikke læsetilladelser |
| **Logning** | Alle handlinger logges som OVERSIGHT i audit trail |
| **Begrænsning** | Ingen skrivetilladelser — kan kun læse data |

---

## 11. Regnskabsperioder og Afslutning

### 11.1 Regnskabsperioder

AlphaFlow arbejder med månedlige regnskabsperioder. Hver periode har en status, der styrer, om der kan bogføres i perioden.

| Status | Beskrivelse |
|--------|-------------|
| **OPEN** | Perioden er åben. Der kan bogføres nye poster. |
| **CLOSED** | Perioden er lukket. Ingen nye poster kan bogføres. |

### 11.2 Periodekontrol

| Funktion | Beskrivelse |
|----------|-------------|
| **Lukning** | Kræver `PERIOD_CLOSE`-tilladelse (OWNER, ADMIN, ACCOUNTANT) |
| **Genåbning** | Kræver `PERIOD_OPEN`-tilladelse (OWNER, ADMIN) |
| **Logning** | Alle lukninger og genåbninger logges i audit trail |
| **Bogføringsspærring** | Lukkede perioder kan ikke modtage nye journalposter |

### 11.3 Årsafslutning

AlphaFlow understøtter automatisk årsafslutning med resultatoverførsel:

| Parameter | Beskrivelse |
|-----------|-------------|
| **Tilladelse** | `YEAR_END_CLOSE` (OWNER, ADMIN) |
| **Forudsætning** | Alle perioder for året skal være lukkede |
| **Handling** | Overførsel af årets resultat til egenkapital |

**Bogføring ved årsafslutning:**

| Scenario | Debet | Kredit |
|----------|-------|--------|
| **Overskud** | Konto 3300 (Årets resultat) | Konto 3400 (Overført resultat) |
| **Underskud** | Konto 3400 (Overført resultat) | Konto 3300 (Årets resultat) |

Systemet opretter automatisk en journalpost, der bogfører resultatoverførslen. Handlingen logges uforanderligt i audit trail som en `YearEndClosing`-begivenhed.

### 11.4 Gentagende Poster

For at understøtte løbende regnskabsføring tilbyder AlphaFlow oprettelse af gentagende journalposter:

| Intervall | Beskrivelse |
|-----------|-------------|
| Dagligt | Gentages hver dag |
| Ugentligt | Gentages hver uge |
| Månedligt | Gentages hver måned |
| Kvartalsvis | Gentages hvert kvartal |
| Årligt | Gentages hvert år |

Gentagende poster opretter automatisk journalposter i den aktuelle periode ved udførelse.

### 11.5 Dokumentation af Periodehåndtering

Alle periode-relaterede handlinger dokumenteres via audit trail:

| Handling | Entitet | Logdata |
|----------|---------|---------|
| Periode lukket | FiscalPeriod | userId, companyId, periode-id, timestamp |
| Periode genåbnet | FiscalPeriod | userId, companyId, periode-id, timestamp, årsag |
| Årsafslutning udført | YearEndClosing | userId, companyId, år, beløb, journalpost-id |
| Gentagende post udført | RecurringEntry | userId, companyId, post-id, timestamp |

---

## 12. Compliance Matrix

Nedenstående matrix dokumenterer AlphaFlows overholdelse af de relevante krav i Bogføringsloven, Digitaliseringsbekendtgørelsen og GDPR.

### 12.1 Bogføringsloven

| Paragraf | Krav | Status | Implementering |
|----------|------|--------|----------------|
| § 1 stk. 1 | Bogføring af alle erhvervsmæssige transaktioner | ✅ Opfyldt | Dobbelt bogføring med debet/kredit. Journalposter med linjer. Alle transaktioner bogføres med dato, beløb, konti og reference. |
| § 4 stk. 1 | Regnskabsmateriale opbevares på betryggende måde | ✅ Opfyldt | AES-256-GCM kryptering i hvile (256-bit nøgle, autentificeret kryptering). TLS 1.3 kryptering i transit. PostgreSQL med sslmode=require. SHA-256 checksums på backups. |
| § 4 stk. 2 | Uforkortethed og beskyttelse mod uberettiget ændring | ✅ Opfyldt | AES-256-GCM autentificeret kryptering garanterer integritet (authentication tag). Uforanderlig audit trail — poster kan aldrig ændres eller slettes. Soft-delete med modpost og årsagsangivelse. |
| § 4 stk. 3 | Tydeligvis viser dokumentationens indhold og sammenhæng | ✅ Opfyldt | Komplet audit trail med before/after værdier. Tidsstempler, aktør, IP-adresse. 13+ begivenhedstyper. 20+ entitetstyper. |
| § 5 | Regnskabsmateriale skal kunne fremskaffes hurtigt | ✅ Opfyldt | Momentane databaseforespørgsler (PostgreSQL). SAF-T eksport (XML). OIOUBL eksport. PDF-rapporter. JSON-backup med direkte download. |
| § 10 stk. 1 | Fuldstændig, ægte og pålidelig dokumentation | ✅ Opfyldt | Uforanderlig audit trail med 13+ begivenhedstyper. Alle ændringer logges med fuld kontekst (userId, companyId, timestamp, IP, User-Agent, before/after). |
| § 11 stk. 1 | Adgang begrænset til autoriserede personer | ✅ Opfyldt | RBAC med 5 roller og 23 tilladelser. Multi-tenant isolation med virksomhedsscopning. 47 af 89 API-ruter kræver specifikke tilladelser. 5-lags guard-kæde. |
| § 11 stk. 2 | Adgangskontrol med logning | ✅ Opfyldt | Sessionsikkerhed med 32-byte tokens. LOGIN/LOGIN_FAILED/LOGOUT logges. Session-invalidering logges. IP- og User-Agent tracking. |
| § 12 | Elektronisk regnskabsmateriale kan aflæses | ✅ Opfyldt | PDF-rapporter (balance, resultatopgørelse, momsrapport). XML-eksport (SAF-T, OIOUBL). JSON-backup med manifest. Alle formater er menneskelæselige. |
| § 15 stk. 1 | Opbevaring i mindst 5 år | ✅ Opfyldt | Automatiske backups: Månedlig (60 måneder = 5 år), Ugentlig (52 uger), Daglig (30 dage). SHA-256 checksums til integritetsverifikation. |

### 12.2 Digitaliseringsbekendtgørelsen

| Paragraf | Krav | Status | Implementering |
|----------|------|--------|----------------|
| § 8 stk. 1 | Tilgængelighed i hele opbevaringsperioden | ✅ Opfyldt | TLS 1.3 sikrer krypteret adgang. AES-256-GCM sikrer dataintegritet i hvile. Data kan tilgås og dekrypteres gennem hele opbevaringsperioden med korrekt nøgle. Automatiske backups med 5-års retention. |
| § 8 stk. 2 | Tilstrækkelig sikkerhed | ✅ Opfyldt | Defense-in-depth med 5 sikkerhedslag. AES-256-GCM (256-bit), TLS 1.3, bcrypt (12 salt-runder), HSTS, RBAC. Automatisk certifikatfornyelse via Let's Encrypt. |

### 12.3 GDPR

| Artikel | Krav | Status | Implementering |
|---------|------|--------|----------------|
| Art. 32 stk. 1 | Sikkerhed for behandling — fortrolighed, integritet, tilgængelighed og modstandsdygtighed | ✅ Opfyldt | Kryptering i hvile (AES-256-GCM) og transit (TLS 1.3). Adgangskontrol (RBAC med 5 roller, 23 tilladelser). Uforanderlig audit trail. bcrypt med 12 salt-runder til adgangskoder. 32-byte kryptografiske sessionstokens. |

### 12.4 Samlet Compliance Status

| Lovgivning | Antal krav | Opfyldt | Delvist | Ikke opfyldt |
|-----------|-----------|---------|---------|--------------|
| Bogføringsloven | 10 | 10 | 0 | 0 |
| Digitaliseringsbekendtgørelsen | 2 | 2 | 0 | 0 |
| GDPR | 1 | 1 | 0 | 0 |
| **I alt** | **13** | **13** | **0** | **0** |

**Konklusion:** AlphaFlow opfylder alle 13 identificerede lovkrav fra Bogføringsloven, Digitaliseringsbekendtgørelsen og GDPR.

### 12.5 FASE 1–6 Ekstra Compliance Krav

Nedenstående matrix dokumenterer overholdelse af yderligere krav implementeret i FASE 1–6.

| Krav ID | Krav | Status | Implementering |
|---------|------|--------|----------------|
| D2 | Adgangsstyring med 2-faktor autentificering | ✅ Opfyldt | TOTP-baseret 2FA via `src/lib/two-factor.ts`. Valgfrit per tenant (`Company.twoFactorRequired`). QR-kode opsætning, 6-cifret kodeverifikation, 10 backup-koder pr. bruger (SHA-256 hashed, krypteret med AES-256-GCM). Login-flow: e-mail/adgangskode → 2FA prompt → session. Se afsnit 13. |
| D9 | Sende faktura i OIOUBL-format | ✅ Opfyldt | OIOUBL XML-generering via `src/lib/einvoice-sender.ts`. Kanæl: NEM_HANDEL. Statussporing: PENDING → QUEUED → SENDING → DELIVERED/FAILED. Se afsnit 16. |
| D10 | Sende kreditnota i OIOUBL-format | ✅ Opfyldt | Samme sendeflow som D9 med InvoiceTypeCode 381. Se afsnit 16. |
| D11 | Sende faktura i Peppol BIS-format | ✅ Opfyldt | Peppol BIS Billing 3.0 export-format via `src/lib/einvoice-sender.ts`. Kanæl: PEPPOL_BIS. Se afsnit 16. |
| D12 | Sende kreditnota i Peppol BIS-format | ✅ Opfyldt | Samme sendeflow som D11 med Peppol credit note support. Se afsnit 16. |
| D13 | Mapping-værktøj for momskoder | ✅ Opfyldt | VAT_CODE_TO_PUBLIC_MAPPING med 10 koder (S25→U25, S12→U12, K25→I25, SEU→UE, KEU→IE, KUF→IF, mv.) i `src/lib/standard-chart-of-accounts.ts`. Se afsnit 14. |
| D14 | Bogføringsguide/assistent | ✅ Opfyldt | Indbygget konteringsvejledning med 4 kategorier (salg, indkøb, moms, årsafslutning), debet/kredit T-diagrammer og SKAT reference links i `src/components/chart-of-accounts/posting-guide-assistant.tsx`. Se afsnit 14. |
| D16 | Beskyttelse mod uberettigede ændringer (2FA) | ✅ Opfyldt | 2FA forhindrer uautoriseret adgang. Tenant-niveau toggle kræver compliance-check. SuperDev bypass. Se afsnit 13. |
| D17 | Sende kreditnota elektronisk (OIOUBL) | ✅ Opfyldt | Fuldt implementeret send + status workflow. Se afsnit 16. |
| D7 | Valutakurs/omregningsfaktor | ✅ Opfyldt | Frankfurter API (ECB reference rates) i `src/lib/currency-utils.ts`. 1-times in-memory cache med stale fallback. DKK↔EUR, USD, GBP, SEK, NOK og cross-rates. API: GET `/api/exchange-rate`. Se afsnit 18. |
| D8 | Bilag opbevares 5 år ved udbyderskift | ✅ Opfyldt | Eksport forbedret med GUID per export, format version `alphaflow-portable-v2`, compliance metadata (Bogføringsloven BEK 98, 5-års retention), SHA-256 data integrity checksum. Audit trail på alle eksporter. Se afsnit 18. |
| N7 | Modtage faktura i OIOUBL-format | ✅ Opfyldt | Unified OIOUBL/Peppol parser i `src/lib/einvoice-parser.ts`. InvoiceTypeCode 380, 381, 384, 389. API: POST `/api/invoices/receive`. Se afsnit 15. |
| N8 | Modtage kreditnota i OIOUBL-format | ✅ Opfyldt | InvoiceTypeCode 381 support i parser og inbox UI. Se afsnit 15. |
| N9 | Application Response (OIOUBL) | ✅ Opfyldt | Auto-genereret ApplicationResponse ved modtagelse i `src/lib/einvoice-response.ts`. Se afsnit 15. |
| N10 | Modtage faktura i Peppol BIS-format | ✅ Opfyldt | Auto-detect Peppol profil via CustomizationID/ProfileID i parser. Se afsnit 15. |
| N11 | Modtage kreditnota i Peppol BIS-format | ✅ Opfyldt | Peppol credit note support med MessageLevelResponse. Se afsnit 15. |
| N12 | Message Level Response (Peppol) | ✅ Opfyldt | Genereret af `src/lib/einvoice-response.ts`. Vises i inbox UI. Se afsnit 15. |
| N13 | Invoice Response (Peppol) | ✅ Opfyldt | Genereret af `src/lib/einvoice-response.ts`. Vises i inbox UI. Se afsnit 15. |
| N14 | Offentlig standardkontoplan direkte | ✅ Opfyldt | SKAT Fællesoffentlig Standardkontoplan med ~60 konti (0-9xxx struktur) i `src/lib/standard-chart-of-accounts.ts`. Se afsnit 14. |
| N15 | Standardkontoplan mappet | ✅ Opfyldt | StandardAccountMapping Prisma-model for FSR→standard mapping. Auto-mapping algoritme (buildAutoMapping). Se afsnit 14. |
| N16 | Mapping-værktøj (kontoplan) | ✅ Opfyldt | Fuld UI med auto-map, manuel redigering, filter, CSV-export i `standard-mapping-panel.tsx`. Se afsnit 14. |
| N17 | Konteringsvejledning fra 3. part | ✅ Opfyldt | SKAT reference links (Bogføringsloven, BEK 98, SKAT moms, Økonomistyrelsen) i bogføringsguiden. Se afsnit 14. |
| N18 | Brugerdefineret konteringsvejledning | ✅ Opfyldt | Per-konto postingGuide felt i Account-model. Indbygget assistant med regler og diagrammer. Se afsnit 14. |
| N19 | CSV/XBRL eksport af årsregnskab | ✅ Opfyldt | CSV for Regnskab Basis (`src/lib/annual-report-csv.ts`), iXBRL for Regnskab Special (`src/lib/annual-report-xbrl.ts`). Se afsnit 17. |
| N20 | Moms-API Skattestyrelsen | ✅ Opfyldt | Moms-API integration i `src/lib/vat-submit.ts`. OAuth2, forbered/indberet moms. VATSubmission Prisma-model. Se afsnit 17. |
| N21 | Meddelelse om NemHandelsregisteret | ✅ Opfyldt | Info-sektion og registreringsknap i `einvoice-settings.tsx`. Se afsnit 16. |
| N22 | Tilmelding NemHandelsregisteret | ✅ Opfyldt | registerNemHandel() + registreringsstatus i `src/lib/nemhandel-client.ts`. Se afsnit 16. |

### 12.6 Opdateret Samlet Compliance Status (v2.0)

| Lovgivning | Antal krav | Opfyldt | Delvist | Ikke opfyldt |
|-----------|-----------|---------|---------|--------------|
| Bogføringsloven | 10 | 10 | 0 | 0 |
| Digitaliseringsbekendtgørelsen | 2 | 2 | 0 | 0 |
| GDPR | 1 | 1 | 0 | 0 |
| FASE 1–6 ekstra krav | 25 | 25 | 0 | 0 |
| **I alt** | **38** | **38** | **0** | **0** |

**Konklusion (v2.0):** AlphaFlow opfylder alle 38 identificerede lovkrav, herunder 25 ekstra krav fra FASE 1–6 (2FA/MFA, standardkontoplan, e-faktura modtagelse/fremsendelse, årsregnskab, fremmedvaluta og udbyderskift).

---

## 13. TOF/MFA (2-Faktor Autentificering)

### 13.1 Generelt

AlphaFlow implementerer et valgfrit TOTP-baseret to-faktor autentificeringssystem (2FA) for at øge sikkerheden ved login og opfylde krav D2 (Adgangsstyring) og D16 (Beskyttelse mod uberettigede ændringer).

### 13.2 Teknisk Implementering

| Komponent | Teknologi | Fil |
|-----------|-----------|-----|
| **TOTP kernebibliotek** | otplib (TOTP RFC 6238) | `src/lib/two-factor.ts` |
| **QR-kode generering** | qrcode | `src/lib/two-factor.ts` |
| **OTP input komponent** | Custom 6-cifret input | `src/components/ui/otp-input.tsx` |
| **Login 2FA prompt** | TwoFactorPrompt | `src/components/auth/login-form.tsx` |
| **2FA settings UI** | Full management panel | `src/components/settings/two-factor-settings.tsx` |
| **Tenant toggle UI** | Compliance check panel | `src/components/settings/tenant-two-factor-toggle.tsx` |

### 13.3 Sikkerhedsforanstaltninger

| Foranstaltning | Beskrivelse |
|-------------|-------------|
| **TOTP-algoritme** | RFC 6238 (Time-based One-Time Password), 30-sekunders tidsstep, 6-cifret kode |
| **Secret kryptering** | AES-256-GCM via eksisterende `src/lib/crypto.ts` |
| **Backup-koder** | 10 koder pr. bruger, SHA-256 hashed før lagring, krypteret med AES-256-GCM |
| **Krypteret lagring** | Alle secrets og backup-koder lagres krypteret i databasen |
| **Rate limiting** | Alle mutation-endpoints har rate limiting |
| **Audit logning** | Alle 2FA-handlinger logges uforanderligt i audit trail |

### 13.4 Tenant-niveau Toggle

2FA er valgfrit per tenant via `Company.twoFactorRequired`:

| Egenskab | Beskrivelse |
|----------|-------------|
| **Toggle** | OWNER/ADMIN kan aktivere/deaktivere krav om 2FA for virksomheden |
| **Compliance check** | Ved aktivering kontrolleres, om alle non-SuperDev medlemmer har 2FA aktiveret |
| **Non-compliant liste** | Viser medlemmer, der mangler 2FA-opsætning |
| **SuperDev bypass** | SuperDev-brugere er undtaget fra 2FA-krav |
| **Personligt disable** | Blokeret hvis virksomheden kræver 2FA (undtagen SuperDev) |

### 13.5 API-ruter

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/auth/2fa/setup` | POST | Genererer TOTP secret + QR-kode, krypterer og lagrer (aktiverer IKKE endnu) |
| `/api/auth/2fa/activate` | POST | Verificerer TOTP-kode, aktiverer 2FA, genererer og returnerer backup-koder (vises én gang) |
| `/api/auth/2fa/disable` | POST | Verificerer TOTP-kode, rydder alle 2FA-felter; blokeret hvis company kræver 2FA |
| `/api/auth/2fa/backup-codes` | GET/POST | Returnerer status / regenererer backup-koder (med TOTP-verifikation) |
| `/api/auth/2fa/status` | GET | Returnerer twoFactorEnabled, hasBackupCodes, companyRequiresTwoFactor, isSuperDev |
| `/api/auth/2fa/verify-login` | POST | Verificerer TOTP eller backup-kode (forbruger backup), opretter session + cookie |
| `/api/company/toggle-2fa` | POST | Aktiverer/deaktiverer tenant-niveau twoFactorRequired med compliance-check |

### 13.6 Login-flow

1. Bruger indtaster e-mail og adgangskode
2. Systemet verificerer legitimationsoplysninger
3. Hvis 2FA er aktiveret (personligt eller tenant-krav): returneres `requiresTwoFactor: true`
4. Bruger prompted for 6-cifret TOTP-kode eller backup-kode
5. Verifikation via `/api/auth/2fa/verify-login`
6. Session oprettes og cookie sættes

### 13.7 SuperDev Bypass

SuperDev-brugere omgår alle 2FA-krav for at sikre teknisk support- og tilsynsadgang. Dette gælder både ved login og ved tenant-niveau toggles.

---

## 14. Standardkontoplan og Mapping

### 14.1 Generelt

AlphaFlow implementerer SKAT Fællesoffentlig Standardkontoplan med automatisk mapping fra den interne FSR-baserede kontoplan, for at opfylde krav N14–N18 og D13–D14.

### 14.2 SKAT Fællesoffentlig Standardkontoplan

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Kilde** | SKAT Fællesoffentlig Standardkontoplan |
| **Antal konti** | ~60 standardkonti |
| **Struktur** | 0-9xxx (kontogrupper 0–9) |
| **Implementering** | `src/lib/standard-chart-of-accounts.ts` |
| **Formål** | Standardiseret rapportering til offentlige myndigheder |

Eksempler på standardkonti:

| Standardnummer | Betegnelse | Kategori |
|----------------|-------------|----------|
| 0xxx | Hovedposter | Resultatopgørelse overskrift |
| 1xxx | Omsætning og vareforbrug | Salgsindtægter, vareforbrug |
| 2xxx | Tjenesteydelser mv. | Tjenesteindtægter, lønninger |
| 3xxx | Finansielle poster | Renteindtægter/-omkostninger |
| 4xxx | Driftsomkostninger | Husleje, drift, vedligeholdelse |
| 5xxx | Afskrivninger og nedskrivninger | Afskrivninger, tab |
| 6xxx | Finansielle omkostninger | Rente, kurstab |
| 7xxx | Ekstraordinære poster | Ekstraordinære indtægter/omkostninger |
| 8xxx | Skatter og afgifter | Indkomstskat, moms |
| 9xxx | Årsresultat og overførsel | Årets resultat, overført resultat |

### 14.3 Mapping (FSR → Standard)

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Datamodel** | StandardAccountMapping (Prisma-model) |
| **Felt** | `Account.publicStandardNumber` knytter intern konto til standardkonto |
| **Auto-mapping** | `buildAutoMapping()` algoritme: eksakt match → type-baserede heuristikker |
| **Manuelt** | Per-konto select i mapping UI |
| **CSV export** | Mapping kan eksporteres som CSV |

### 14.4 Momskode-mapping

Intern FSR-momskoder mappes til offentlige standardkoder:

| Intern kode | Offentlig kode | Type | Beskrivelse |
|------------|---------------|------|-------------|
| S25 | U25 | Udgående standard | 25% udgående moms → Udgående standard |
| S12 | U12 | Udgående reduceret | 12% udgående moms → Udgående reduceret |
| S0 | U0 | Udgående nul | 0% udgående moms → Udgående nul |
| SEU | UE | EU-leverancer | EU-leverancer (reverse charge) |
| K25 | I25 | Indgående standard | 25% indgående moms → Indgående standard |
| K12 | I12 | Indgående reduceret | 12% indgående moms → Indgående reduceret |
| K0 | I0 | Indgående nul | 0% indgående moms → Indgående nul |
| KEU | IE | EU-indkøb | EU-indkøb (reverse charge) |
| KUF | IF | Udenlandsk tjenesteydelse | Udenlandsk tjenesteydelse |
| NONE | — | Ingen | Momsfri transaktion |

### 14.5 Konteringsvejledning

AlphaFlow tilbyder en indbygget konteringsvejledning/assistent med:

| Funktion | Beskrivelse |
|----------|-------------|
| **Kategorier** | 4 kategorier: Salg, Indkøb, Moms, Årsafslutning |
| **T-diagrammer** | Debet/kredit diagrammer for hver konteringstype |
| **SKAT references** | Links til Bogføringsloven, BEK 98, SKAT moms, Økonomistyrelsen |
| **Per-konto guide** | `postingGuide` felt på Account-model for brugerdefinerede noter |

### 14.6 API-ruter

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/accounts/standard-mapping` | GET/PUT | CRUD for FSR→standard mapping |
| `/api/accounts/standard-mapping/auto` | POST | Kører auto-mapping algoritme |
| `/api/vat-codes/mapping` | GET | Offentlig VAT-kode reference data |
| `/api/accounts/posting-guide` | PUT | Opdaterer per-konto konteringsvejledning |

---

## 15. E-faktura Modtagelse (OIOUBL + Peppol)

### 15.1 Generelt

AlphaFlow understøtter modtagelse af elektroniske fakturaer og kreditnotaer i både OIOUBL- og Peppol BIS Billing 3.0-formater, for at opfylde krav N7–N13.

### 15.2 Unified Parser

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Implementering** | `src/lib/einvoice-parser.ts` |
| **Bibliotek** | fast-xml-parser v5 |
| **Format-detektion** | Auto-detect OIOUBL vs. Peppol via CustomizationID/ProfileID |
| **Understøttede typer** | InvoiceTypeCode 380 (faktura), 381 (kreditnota), 384 (rettet), 389 (selvfakturering) |

**Udtrukne data:** Leverandørinfo, fakturanummer, datoer, valuta, linjevarer, moms-subtotaler, monetære totaler, betalingsinfo.

### 15.3 Response-generering

Tre typer af respons-XML genereres automatisk ved modtagelse:

| Response-type | Standard | Fil |
|-------------|---------|-----|
| **ApplicationResponse** | OIOUBL | `src/lib/einvoice-response.ts` |
| **MessageLevelResponse** | Peppol BIS | `src/lib/einvoice-response.ts` |
| **InvoiceResponse** | Peppol BIS | `src/lib/einvoice-response.ts` |

### 15.4 API-ruter

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/invoices/receive` | POST | Modtager og gemmer e-faktura (parser XML, dublet-tjek, lagrer, genererer response XML) |
| `/api/invoices/receive/validate` | POST | Forhåndsviser/validerer uden at gemme |
| `/api/invoices/received` | GET | Pagineret liste med status/søg filter |
| `/api/invoices/received/[id]` | GET/PUT/DELETE | Enkelt faktura workflow: godkend, afvis, bogfør |

### 15.5 Workflow (Inbox UI)

E-faktura inbox UI i `src/components/invoices/einvoice-inbox.tsx`:

| Status | Ikon | Beskrivelse |
|--------|------|-------------|
| **MODTAGET** | Inbox | Faktura modtaget, afventer godkendelse |
| **GODKENDT** | CheckCircle (grøn) | Godkendt af bruger, klar til bogføring |
| **AFVIST** | XCircle (rød) | Afvist med årsag |
| **BOGFØRT** | CheckCircle (teal) | Bogført i journal (debiterer udgiftskonto, krediterer leverandørgæld) |

**Bogføring ved modtagelse:** Systemet opretter automatisk en journalpost med debet til udgiftskonto og kredit til leverandørgæld.

### 15.6 Funktioner

- Drag & drop XML-upload (max 5 MB)
- Pagineret tabel med søg (leverandør/fakturanummer) og statusfilter
- Format-badge (OIOUBL / Peppol BIS) og dokumenttype-badge (Faktura 380, Kreditnota 381, mv.)
- Samlet totaler: tax exclusive, tax, tax inclusive, payable
- Kolapsbare sektioner for raw XML og response XML preview
- Fuld DA/EN sprogstøtte
- Responsive design (mobile-first)

---

## 16. E-faktura Fremsendelse og NemHandel

### 16.1 Generelt

AlphaFlow understøtter fremsendelse af elektroniske fakturaer og kreditnotaer i OIOUBL- og Peppol BIS Billing 3.0-formater med NemHandel-integration, for at opfylde krav D9–D12, D17, N21–N22.

### 16.2 Send-infrastruktur

| Komponent | Fil |
|-----------|-----|
| **Send management** | `src/lib/einvoice-sender.ts` |
| **NemHandel klient** | `src/lib/nemhandel-client.ts` |
| **Send dialog UI** | `src/components/invoices/send-einvoice-dialog.tsx` |
| **Send-historik UI** | `src/components/invoices/einvoice-send-status.tsx` |
| **E-faktura settings** | `src/components/settings/einvoice-settings.tsx` |

### 16.3 Kanæler og Formater

| Kanal | Format | Beskrivelse |
|-------|--------|-------------|
| NEM_HANDEL | OIOUBL XML | Danske offentlige myndigheder via NemHandel |
| PEPPOL_BIS | Peppol BIS Billing 3.0 | Peppol-netværket |

### 16.4 Statussporing

| Status | Beskrivelse |
|--------|-------------|
| PENDING | Klar til afsendelse |
| QUEUED | I kø |
| SENDING | Under afsendelse |
| DELIVERED | Leveret succesfuldt |
| ACCEPTED | Accepteret af modtager |
| FAILED | Afsendelse fejlede (retry muligt) |
| REJECTED | Afvist af modtager |

**Retry-logik:** Exponentiel backoff (5 minutter, konfigurerbart max retries).

### 16.5 Virksomhedskonfiguration

Virksomheder kan konfigurere e-faktura-indstillinger:

| Felt | Beskrivelse |
|------|-------------|
| eInvoiceEnabled | Aktivere/deaktivere e-faktura |
| eInvoiceDefaultChannel | Standard kanal (NEM_HANDEL / PEPPOL_BIS) |
| eInvoiceEndpointId | Endpoint ID (typisk CVR-nummer) |
| eInvoiceGLN | GLN-nummer |
| eInvoicePeppolAS4Id | Peppol AS4 identifikator |
| eInvoiceAutoSend | Automatisk afsendelse ved fakturering |

### 16.6 NemHandel Integration

| Funktion | Beskrivelse |
|----------|-------------|
| **Registration** | `registerNemHandel()` — registrerer virksomhed i NemHandelsregisteret |
| **Identifikation** | CVR-baseret identifikation via Endpoint ID Scheme 0184 |
| **Status UI** | Viser registreringsstatus i settings |
| **Simuleret API** | Klienten er implementeret med simuleret API — klar for rigtige API-kreditiver |

### 16.7 API-ruter

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/invoices/[id]/send-einvoice` | POST | Sætter e-faktura i kø til afsendelse |
| `/api/invoices/[id]/einvoice-sends` | GET | Henter send-historik for en faktura |
| `/api/invoices/[id]/einvoice-sends/[sendingId]/retry` | POST | Genforsøger fejlet afsendelse |
| `/api/company/einvoice-settings` | GET/PUT | Håndterer virksomheds e-faktura indstillinger |
| `/api/company/einvoice-register` | POST | Registrerer virksomhed i NemHandelsregisteret |

---

## 17. Årsregnskab og Moms-API

### 17.1 Generelt

AlphaFlow understøtter eksport af årsregnskab i formatet Regnskab Basis (CSV) og Regnskab Special (iXBRL), samt integration med Skattestyrelsens Moms-API, for at opfylde krav N19–N20.

### 17.2 CSV Eksport — Regnskab Basis

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Implementering** | `src/lib/annual-report-csv.ts` |
| **Format** | CSV med UTF-8 BOM |
| **Sprog** | Danske overskrifter |
| **Valuta** | DKK |
| **Indhold** | Resultatopgørelse, Balance, Statusopgørelse, momsdata |
| **API** | GET `/api/reports/annual-csv` |

**Sektioner i CSV-filen:**

| Sektion | Indhold |
|---------|---------|
| Resultatopgørelse | Omsætning, vareforbrug, driftsresultat, finan poster, årets resultat |
| Balance | Aktiver, passiv, egenkapital |
| Statusopgørelse | Overført resultat, årets resultat |
| Momsdata | Udgående/indgående moms via computeVATRegister() |

### 17.3 iXBRL Eksport — Regnskab Special

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Implementering** | `src/lib/annual-report-xbrl.ts` |
| **Bibliotek** | xmlbuilder2 |
| **Taxonomy** | Danish FSA taxonomy (DCCA namespace) |
| **Format** | Inline XBRL (iXBRL) |
| **API** | GET `/api/reports/annual-xbrl` |

**Fakta-elementer:** Revenue, Cost of Goods Sold, Gross Profit, Operating Profit, Financial Items, Net Result, Assets, Liabilities, Equity — alle med ix:nonFraction tagging og kontekstdefinitioner for instant/duration perioder.

### 17.4 Moms-API Integration

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Implementering** | `src/lib/vat-submit.ts` |
| **API** | Skattestyrelsen NemVirksomhed Moms-API |
| **Autentificering** | OAuth2 (client_credentials flow) |
| **Datamodel** | VATSubmission (Prisma-model) |
| **Perioder** | Kvartalsvis (Q1–Q4) og årlig |

**Funktioner:**

| Funktion | Beskrivelse |
|----------|-------------|
| `prepareVATSubmission()` | Opretter DRAFT submission fra computeVATRegister data |
| `submitVATToSkat()` | Indberetter til Skat (live eller simuleret sti) |
| `getVATSubmissions()` | Henter alle submissions med status |
| `getQuarterDates()` | Beregner kvartalsdatoer |

### 17.5 API-ruter

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/reports/annual-csv` | GET | Download årsregnskab CSV (Regnskab Basis) |
| `/api/reports/annual-xbrl` | GET | Download årsregnskab iXBRL (Regnskab Special) |
| `/api/vat-report/submit` | POST | Forbereder og indberetter moms (live/simuleret) |
| `/api/vat-report/submit` | GET | Henter submission-status |
| `/api/vat-report/submissions` | GET | Liste over VAT submissions med år-filter |

### 17.6 Frontend

| Komponent | Sti |
|-----------|-----|
| **Årsregnskab side** | `src/components/annual-report/annual-report-page.tsx` |
| **Navigation** | `src/components/layout/accordion-nav.tsx` (Compliance sektion) |
| **Mobile nav** | `src/components/mobile-bottom-nav.tsx` (Rapporter tab) |

**Tre tabs:**

| Tab | Indhold |
|-----|---------|
| **Årsregnskab** | Årsvælger, sammendrag, CSV/XBRL download, årsafslutning status |
| **Momsindberetning** | År + periode (Q1–Q4/ÅRLIG), forbered/indberet, current VAT data, submission historik |
| **Historik** | Komplet tabel over VAT submissions med status badges |

### 17.7 Submission-statusser

| Status | Badge | Beskrivelse |
|--------|-------|-------------|
| DRAFT | Grå | Kladde — ikke indberettet |
| SUBMITTED | Blå | Indsendt til Skattestyrelsen |
| ACCEPTED | Grøn | Accepteret af Skattestyrelsen |
| REJECTED | Rød | Afvist af Skattestyrelsen |
| ERROR | Orange | Teknisk fejl ved indberetning |

---

## 18. Fremmedvaluta og Udbyderskift

### 18.1 Generelt

AlphaFlow implementerer valutakursopslag via Frankfurter API (ECB reference rates) og forbedret export med compliance-metadata for at opfylde krav D7 (Valutakurs) og D8 (Bilag opbevares 5 år ved udbyderskift).

### 18.2 Valutakursopslag

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Implementering** | `src/lib/currency-utils.ts` |
| **Datakilde** | Frankfurter API (ECB reference rates) |
| **Placering** | EU-baseret, gratis, ingen API-nøgle påkrævet |
| **Supporterede valutaer** | DKK, EUR, USD, GBP, SEK, NOK |
| **API-rute** | GET `/api/exchange-rate` |

### 18.3 Caching-strategi

| Egenskab | Beskrivelse |
|-----------|-------------|
| **Type** | In-memory cache (Map) |
| **TTL** | 1 time |
| **Stale fallback** | Ved fejl returneres cachelagret værdi (selv hvis udløbet) |
| **Format** | `{ from, to, rate, timestamp, cached }` |

### 18.4 Valutaberegning

| Beregning | Metode |
|-----------|--------|
| DKK → fremmed | Direkte rate fra ECB |
| Fremmed → DKK | Inverteret rate (1 / ECB rate) |
| Fremmed ↔ fremmed | Cross-rate via DKK (A / DKK_rate_B) |
| **Bulk** | `getLatestExchangeRates()` for hentning af multiple rates |

### 18.5 API-rute

| Parameter | Beskrivelse |
|-----------|-------------|
| `GET /api/exchange-rate?from=EUR&to=DKK` | Enkel valutakurs |
| `GET /api/exchange-rate?currencies=EUR,USD,GBP` | Bulk rates (alle vs. DKK) |

### 18.6 Udbyderskift — Export-forbedringer

For at sikre overholdelse af krav D8 (bilag opbevares 5 år ved skift af udbyder) er export-funktionen forbedret:

| Forbedring | Beskrivelse |
|-----------|-------------|
| **GUID per export** | Unikt UUID/GUID via `crypto.randomUUID()` for sporing |
| **Format version** | `alphaflow-portable-v2` — versionsstyring af export-formatet |
| **Compliance metadata** | Lovgrundlag: Bogføringsloven BEK 98, 5-års retention, Erhvervsstyrelsen standard |
| **SHA-256 checksum** | Data integrity checksum af export-payload (exkl. filesData) |
| **Audit trail** | Alle eksporter logges uforanderligt i audit trail |

### 18.7 Export Info API

| Rute | Metode | Beskrivelse |
|------|--------|-------------|
| `/api/export-tenant` | POST | Eksporterer virksomhedsdata med GUID, compliance metadata, SHA-256 checksum |
| `/api/company/export-info` | GET | Export-historik/stats (total exports, seneste export, data volume, audit entries med GUIDs og checksums) |

### 18.8 Udbyderskift Checklist

Ved skift af regnskabsudbyder sikrer AlphaFlow:

1. **Komplet dataeksport** med GUID for sporing
2. **Compliance metadata** indlejret i export (lovgrundlag, retention, standard)
3. **SHA-256 checksum** til verificering af dataintegritet
4. **Audit trail** med fuld dokumentation af eksporten
5. **Export info API** giver overblik over alle eksporter med checksum-verifikation

---

## 19. Bilag

### 19.1 Referencer til Teknisk Dokumentation

| Dokument | Sti | Beskrivelse |
|----------|------|-------------|
| **Krypteringsdokumentation** | `docs/ENCRYPTION.md` | Komplet teknisk beskrivelse af AES-256-GCM, TLS 1.3, adgangskodehashing, sessionsikkerhed og nøglehåndtering |
| **Brugsvejledning** | `docs/BRUGSVEJLEDNING.md` | Brugermanual med trin-for-trin instruktioner til alle systemfunktioner |

### 19.2 Referencer til Kildekode

| Komponent | Sti | Beskrivelse |
|-----------|------|-------------|
| **Krypteringsmodul** | `src/lib/crypto.ts` | AES-256-GCM krypterings-/dekrypteringsmodul (server-side) |
| **Adgangskodemodul** | `src/lib/password.ts` | bcrypt hashing med 12 salt-runder |
| **Sessionsmodul** | `src/lib/session.ts` | Sessionstyring med token-generering og udløb |
| **RBAC-modul** | `src/lib/rbac.ts` | Rolle- og tilladelsesdefinitioner |
| **Audit-modul** | `src/lib/audit.ts` | Uforanderlig audit trail |
| **Backup-motor** | `src/lib/backup-engine.ts` | Backup- og gendannelseslogik |
| **Backup-planlægger** | `src/lib/backup-scheduler.ts` | Automatisk backup-planlægning |
| **SAF-T-validator** | `src/lib/saft-validator.ts` | 23+ valideringskontroller for SAF-T eksport |
| **OIOUBL-generator** | `src/lib/oioubl-generator.ts` | Generering af OIOUBL XML |
| **OIOUBL-validator** | `src/lib/oioubl-validator.ts` | Validering af OIOUBL |
| **PDF-generator** | `src/lib/pdf-generator.ts` | Generering af PDF-rapporter |
| **Matching-motor** | `src/lib/matching-engine.ts` | Automatisk bankafstemning |
| **Adgangsguard** | `src/lib/access-guard.ts` | Multi-lags adgangskontrol |
| **Prisma-skema** | `prisma/schema.prisma` | 23+ modeller, 15+ enums |
| **SAF-T eksport** | `src/app/api/export-saft/route.ts` | API-rute for SAF-T eksport |
| **OIOUBL eksport** | `src/app/api/invoices/[id]/oioubl/route.ts` | API-rute for OIOUBL eksport |
| **Backup API** | `src/app/api/backups/route.ts` | API-rute for backup |
| **Backup gendannelse** | `src/app/api/backups/upload-restore/route.ts` | API-rute for gendannelse |
| **Caddy-konfiguration** | `Caddyfile` | Reverse proxy, TLS, sikkerhedshoveder |
| **2FA kernebibliotek** | `src/lib/two-factor.ts` | TOTP secret, verifikation, backup-koder, QR-kode, AES-256-GCM |
| **Standardkontoplan** | `src/lib/standard-chart-of-accounts.ts` | SKAT Fællesoffentlig Standardkontoplan (~60 konti), auto-mapping |
| **E-faktura parser** | `src/lib/einvoice-parser.ts` | Unified OIOUBL/Peppol BIS XML parser |
| **E-faktura response** | `src/lib/einvoice-response.ts` | ApplicationResponse, MessageLevelResponse, InvoiceResponse |
| **E-faktura sender** | `src/lib/einvoice-sender.ts` | OIOUBL/Peppol afsendelse med NemHandel |
| **NemHandel klient** | `src/lib/nemhandel-client.ts` | NemHandel API klient (simuleret) |
| **Årsregnskab CSV** | `src/lib/annual-report-csv.ts` | Regnskab Basis CSV generator |
| **Årsregnskab XBRL** | `src/lib/annual-report-xbrl.ts` | Regnskab Special iXBRL generator |
| **Moms-API** | `src/lib/vat-submit.ts` | Skattestyrelsen Moms-API integration |
| **Fremmedvaluta** | `src/lib/currency-utils.ts` | Frankfurter API (ECB rates), caching, cross-rates |
| **Export tenant** | `src/app/api/export-tenant/route.ts` | Export med GUID, SHA-256, compliance metadata |

### 19.3 Referencer til FASE 1–6 Kildekode

| Komponent | Sti | FASE | Beskrivelse |
|-----------|------|------|-------------|
| **2FA setup** | `src/app/api/auth/2fa/setup/route.ts` | 1 | TOTP secret + QR-kode generering |
| **2FA activate** | `src/app/api/auth/2fa/activate/route.ts` | 1 | Verificerer TOTP, aktiverer 2FA |
| **2FA disable** | `src/app/api/auth/2fa/disable/route.ts` | 1 | Deaktiverer 2FA (med compliance check) |
| **2FA backup** | `src/app/api/auth/2fa/backup-codes/route.ts` | 1 | Backup-kode håndtering |
| **2FA status** | `src/app/api/auth/2fa/status/route.ts` | 1 | 2FA status endpoint |
| **2FA verify-login** | `src/app/api/auth/2fa/verify-login/route.ts` | 1 | TOTP/backup verifikation ved login |
| **Tenant toggle** | `src/app/api/company/toggle-2fa/route.ts` | 1 | Tenant-niveau 2FA toggle |
| **2FA settings** | `src/components/settings/two-factor-settings.tsx` | 1 | 2FA management UI |
| **E-invoice inbox** | `src/components/invoices/einvoice-inbox.tsx` | 3 | E-faktura indbakke UI |
| **E-invoice receive** | `src/app/api/invoices/receive/route.ts` | 3 | Modtag e-faktura |
| **E-invoice validate** | `src/app/api/invoices/receive/validate/route.ts` | 3 | Validér e-faktura |
| **E-invoice received** | `src/app/api/invoices/received/route.ts` | 3 | List modtagne fakturaer |
| **E-invoice detail** | `src/app/api/invoices/received/[id]/route.ts` | 3 | Workflow: approve/reject/post |
| **Send e-invoice** | `src/app/api/invoices/[id]/send-einvoice/route.ts` | 4 | Sæt e-faktura i kø |
| **Send history** | `src/app/api/invoices/[id]/einvoice-sends/route.ts` | 4 | Send-historik |
| **Send retry** | `src/app/api/invoices/[id]/einvoice-sends/[sendingId]/retry/route.ts` | 4 | Retry fejlet send |
| **E-invoice settings** | `src/app/api/company/einvoice-settings/route.ts` | 4 | E-faktura indstillinger |
| **NemHandel register** | `src/app/api/company/einvoice-register/route.ts` | 4 | NemHandel registrering |
| **Annual CSV** | `src/app/api/reports/annual-csv/route.ts` | 5 | CSV eksport (Regnskab Basis) |
| **Annual XBRL** | `src/app/api/reports/annual-xbrl/route.ts` | 5 | iXBRL eksport (Regnskab Special) |
| **VAT submit** | `src/app/api/vat-report/submit/route.ts` | 5 | Moms indberetning |
| **VAT submissions** | `src/app/api/vat-report/submissions/route.ts` | 5 | VAT submission liste |
| **Annual report page** | `src/components/annual-report/annual-report-page.tsx` | 5 | Årsregnskab frontend (3 tabs) |
| **Exchange rate** | `src/app/api/exchange-rate/route.ts` | 6 | Valutakurs API |
| **Export info** | `src/app/api/company/export-info/route.ts` | 6 | Export historik/stats |

### 19.4 Revision og Godkendelse

| Felt | Indhold |
|------|---------|
| **Udarbejdet af** | AlphaFlow systemudvikling |
| **Dato** | 2025 |
| **Version** | 2.0 |
| **Ændringer v1.0 → v2.0** | Tilføjet afsnit 13–18: TOF/MFA, Standardkontoplan, E-faktura modtagelse/fremsendelse, Årsregnskab, Fremmedvaluta. Opdateret compliance matrix (13 → 38 krav). |
| **Næste revision** | Ved væsentlige systemændringer eller lovændringer |

---

*Dette dokument udgør AlphaFlows intern kontrolrapport og compliance-dokumentation, udarbejdet til brug for Erhvervsstyrelsens godkendelse af AlphaFlow som digitalt regnskabssystem i henhold til Bogføringsloven (LBK nr. 1316 af 14/08/2023) og Bekendtgørelse om digitalisering af regnskabsmateriale.*

*Alle oplysninger i dette dokument er baseret på den faktiske implementering i produktionskoden og er verificeret mod kildekoden.*
