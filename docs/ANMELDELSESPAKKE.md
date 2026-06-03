# AlphaFlow — Anmeldelsespakke

> **Udarbejdet til:** Erhvervsstyrelsen — Anmeldelse af elektronisk bogføringssystem
>
> **Bekendtgørelse:** BEK nr. 98 af 13. februar 2024 om elektronisk bogføringssystem
>
> **Version:** 2.0
>
> **Dato:** 2025

---

## 1. Forside

**AlphaFlow Anmeldelsespakke**

Denne anmeldelsespakke udgør den komplette dokumentation og tekniske beskrivelse af AlphaFlow — et cloudbaseret regnskabssystem udviklet til danske små og mellemstore virksomheder. Pakken er udarbejdet med henblik på anmeldelse til Erhvervsstyrelsen som godkendt elektronisk bogføringssystem i henhold til Bekendtgørelse nr. 98 af 13. februar 2024 (BEK 98) om elektronisk bogføringssystem.

AlphaFlow er udviklet af AlphaAi og overholder kravene i dansk Bogføringslov, herunder pligten til uforanderlig dokumentation, 5-års opbevaringspligt, samt understøttelse af standardiserede eksportformater (SAF-T Financial DK, OIOUBL, Peppol BIS Billing 3.0).

---

## 2. Indledning

### Formål

Formålet med denne anmeldelsespakke er at dokumentere, at AlphaFlow opfylder alle krav i BEK 98 om elektroniske bogføringssystemer, herunder:

- **Hovedkrav nr. 1:** Bogføringsmateriale, kontooversigt, bilagsføring, valutakurser, elektronisk udbyderskift
- **Hovedkrav nr. 2:** IT-sikkerhed, adgangsstyring, risikovurdering, beredskab, databehandleraftale, leverandørstyring
- **Hovedkrav nr. 3:** Standardkontoplan, e-faktura modtagelse/fremsendelse, årsregnskab, momsindberetning

Dokumentationen bygger på den faktiske, implementerede kodebase (FASE 1-6) og afspejler det fuldt fungerende system — ingen planlagte eller teoretiske funktioner er inkluderet.

### Anmeldelsesgrundlag

Anmeldelsen er baseret på:

- **83 krav** fra Erhvervsstyrelsens tjekliste (AlphaFlow_Tjek og Mangleliste.xlsx)
- **Teknisk implementering:** FASE 1-6 (20 uger)
- **Compliance-dokumentation:** FASE 7 (3 uger)
- **Samlet:** 23 uger fra start til anmeldelse

---

## 3. Dokumentpakke

### Komplet dokumentoversigt

Nedenstående tabel viser den komplette dokumentpakke, der indgår i anmeldelsen:

| # | Dokument | Fil | Status | Krav |
|---|----------|-----|--------|------|
| 1 | Anmeldelse via virk.dk | — | ✅ | Systeminfo, CVR, kontaktperson |
| 2 | Intern Kontrolrapport / Compliance Report | docs/COMPLIANCE_REPORT.md | ✅ | v2.0 |
| 3 | Brugsvejledning | docs/BRUGSVEJLEDNING.md | ✅ | Updated med FASE 1-6 |
| 4 | Kryptografisk Sikkerhed | docs/ENCRYPTION.md | ✅ | v1.0 (updated) |
| 5 | Databehandleraftale | docs/DATABEHANDLERAFTALE.md | ✅ | v2.0 |
| 6 | Risikovurdering | docs/RISIKOVURDERING.md | ✅ | v2.0 |
| 7 | Leverandørstyring | docs/LEVERANDOERSTYRING.md | ✅ | v2.0 |
| 8 | Beredskabsplan | docs/BEREDSKABSPLAN.md | ✅ | v2.0 |
| 9 | Neon IT-sikkerhed | docs/NEON_IT_SIKKERHED.md | ✅ | v2.0 |

Alle dokumenter er udarbejdet i professionelt dansk og er tilgængelige som Markdown-filer i projektets `docs/` mappe.

### Dokumentbeskrivelser

| Dokument | Beskrivelse |
|----------|-------------|
| **Compliance Report** | Komplet compliance-rapport med krav-tjekliste (83 krav), tekniske implementeringer, og status for hvert krav |
| **Brugsvejledning** | Komplet brugermanual med 21 sektioner dækkende alle funktioner (FSR-kontoplan, journalposter, fakturering, moms, bankafstemning, 2FA, e-faktura, årsregnskab, fremmedvaluta, udbyderskift) |
| **Kryptografisk Sikkerhed** | Detaljeret beskrivelse af alle krypteringsmetoder: AES-256-GCM, bcrypt, SHA-256, TLS 1.3 |
| **Databehandleraftale** | Standard databehandleraftale mellem AlphaAi (dataansvarlig) og AlphaFlow-brugere, med referencer til implementerede sikkerhedsforanstaltninger |
| **Risikovurdering** | IT-risikovurdering med trusselsidentifikation, risikomatrix, eksisterende kontroller med kode-referencer, restrisici og accept |
| **Leverandørstyring** | Evaluering og styring af tekniske leverandører (Neon, Caddy, Peppol AP, NemHandel) |
| **Beredskabsplan** | Disaster Recovery-plan med RTO/RPO, gendannelsesprocedurer, backup-strategi, kontaktliste |
| **Neon IT-sikkerhed** | Dokumentation af Neons Data Processing Agreement, SOC 2-certificering, og sikkerhedsforanstaltninger |

---

## 4. Krav-tjekliste

### Fuld 83-krav tjekliste — Alle opfyldt (Ja)

Nedenstående tjekliste viser samtlige 83 krav fra Erhvervsstyrelsens anmeldelseskrav. Alle krav er opfyldt.

---

#### Hovedkrav nr. 1 — Bogføringsmateriale og funktionelle krav

| # | Krav | Status |
|---|------|--------|
| 1 | Systemet kan registrere alle bogføringsmateriale | ✅ Ja |
| 2 | Kontooversigt/kontoplan kan tilgås og ajourføres | ✅ Ja |
| 3 | FSR-standardkontoplan er tilgængelig | ✅ Ja |
| 4 | Bilag kan vedhæftes journalposter | ✅ Ja |
| 5 | Bilag gemmes i mindst 5 år | ✅ Ja |
| 6 | Bilag opbevares sikkert ved udbyderskift | ✅ Ja |
| 7 | Valutakurs/omregningsfaktor understøttes | ✅ Ja |
| 8 | Valutakurser hentes fra officiel kilde (ECB) | ✅ Ja |
| 9 | Udbyderskift med portabel eksport | ✅ Ja |
| 10 | SHA-256 checksum ved dataeksport | ✅ Ja |
| 11 | Dataeksport i maskinlæsbart format (JSON) | ✅ Ja |
| 12 | 5-års opbevaring af eksportdata | ✅ Ja |
| 13 | BEK 98 overholdelse ved udbyderskift | ✅ Ja |
| 14 | SAF-T Financial DK eksport | ✅ Ja |
| 15 | SAF-T validering før eksport | ✅ Ja |
| 16 | OIOUBL eksport for udgående fakturaer | ✅ Ja |
| 17 | Kreditnotaer i OIOUBL-format (InvoiceTypeCode 381) | ✅ Ja |
| 18 | OIOUBL validering | ✅ Ja |
| 19 | Periodeafslutning understøttes | ✅ Ja |
| 20 | Årsafslutning med resultatoverførsel | ✅ Ja |
| 21 | Regnskabsperiode kan lukkes | ✅ Ja |
| 22 | Lukkede perioder forhindrer ny bogføring | ✅ Ja |
| 23 | Annullering af poster (soft delete, ikke fysisk sletning) | ✅ Ja |
| 24 | Audit trail for alle ændringer | ✅ Ja |

---

#### Hovedkrav nr. 2 — IT-sikkerhed

| # | Krav | Status |
|---|------|--------|
| 25 | Tilstrækkeligt IT-sikkerhedsniveau | ✅ Ja |
| 26 | Adgangsstyring med 2FA/MFA | ✅ Ja |
| 27 | RBAC med mindst 5 roller | ✅ Ja |
| 28 | Granulære tilladelser (23 tilladelser) | ✅ Ja |
| 29 | Sessionsikkerhed med tokens | ✅ Ja |
| 30 | Adgangskoder krypteret (bcrypt, 12 salt-runder) | ✅ Ja |
| 31 | Datakryptering (AES-256-GCM) | ✅ Ja |
| 32 | Data i transit krypteret (TLS 1.3) | ✅ Ja |
| 33 | HSTS aktiveret | ✅ Ja |
| 34 | Bankadgangskoder krypteret | ✅ Ja |
| 35 | 2FA secrets krypteret | ✅ Ja |
| 36 | Backup-koder SHA-256 hashede | ✅ Ja |
| 37 | Tenant-isolering (multi-tenant dataadskillelse) | ✅ Ja |
| 38 | Uforanderlig audit trail | ✅ Ja |
| 39 | Uautoriserede ændringer forhindres | ✅ Ja |
| 40 | Hændelig tilintetgørelse beskyttes mod | ✅ Ja |
| 41 | Risikovurdering (tab af tilgængelighed) | ✅ Ja |
| 42 | Risikovurdering (tredjeparter) | ✅ Ja |
| 43 | Risikovurdering (trusselsændringer) | ✅ Ja |
| 44 | Risikovurdering (konsekvens/sandsynlighed) | ✅ Ja |
| 45 | Beredskab og reetablering (Disaster Recovery) | ✅ Ja |
| 46 | Backup med automatiseret scheduler | ✅ Ja |
| 47 | SHA-256 checksum på backup-filer | ✅ Ja |
| 48 | RTO/RPO kvantificeret | ✅ Ja |
| 49 | Leverandørstyring dokumenteret | ✅ Ja |
| 50 | Tredjeparts IT-sikkerhed (Neon) dokumenteret | ✅ Ja |
| 51 | Databehandleraftale med tredjeparter | ✅ Ja |
| 52 | Aftale med 3.part opbevaring (formel) | ✅ Ja |
| 53 | Behandling af persondata/databehandleraftale | ✅ Ja |
| 54 | GDPR Art. 32 compliance | ✅ Ja |

---

#### Hovedkrav nr. 3 — Tekniske funktionelle krav

| # | Krav | Status |
|---|------|--------|
| 55 | Offentlig standardkontoplan (SKAT) direkte tilgængelig | ✅ Ja |
| 56 | Standardkontoplan mappet (FSR → offentlig) | ✅ Ja |
| 57 | Mapping-værktøj til standardkontoplan | ✅ Ja |
| 58 | Konteringsvejledning fra 3. part (SKAT refs) | ✅ Ja |
| 59 | Brugerdefineret konteringsvejledning per konto | ✅ Ja |
| 60 | Mapping-værktøj momskoder | ✅ Ja |
| 61 | Bogføringsguide/assistent med debit/credit-regler | ✅ Ja |
| 62 | Modtage faktura i OIOUBL | ✅ Ja |
| 63 | Modtage kreditnota i OIOUBL | ✅ Ja |
| 64 | Application Response (OIOUBL) | ✅ Ja |
| 65 | Modtage faktura i Peppol BIS | ✅ Ja |
| 66 | Modtage kreditnota i Peppol BIS | ✅ Ja |
| 67 | Message Level Response (Peppol) | ✅ Ja |
| 68 | Invoice Response (Peppol) | ✅ Ja |
| 69 | E-faktura indbakke med godkend/afvis workflow | ✅ Ja |
| 70 | Automatisk kontering af godkendte e-fakturaer | ✅ Ja |
| 71 | Sende faktura i OIOUBL | ✅ Ja |
| 72 | Sende kreditnota i OIOUBL | ✅ Ja |
| 73 | Sende faktura i Peppol BIS | ✅ Ja |
| 74 | Sende kreditnota i Peppol BIS | ✅ Ja |
| 75 | Meddelelse om NemHandelsregisteret | ✅ Ja |
| 76 | Tilmelding NemHandelsregisteret | ✅ Ja |
| 77 | CSV eksport — Regnskab Basis | ✅ Ja |
| 78 | XBRL/iXBRL eksport — Regnskab Special | ✅ Ja |
| 79 | Moms-API integration med Skattestyrelsen | ✅ Ja |
| 80 | Automatisk momsopgørelse med auto-beregning | ✅ Ja |

---

#### Dokumentationskrav

| # | Krav | Status |
|---|------|--------|
| 81 | Compliance Report med fuld krav-tjekliste | ✅ Ja |
| 82 | Brugsvejledning for alle funktioner | ✅ Ja |
| 83 | Anmeldelsespakke med bilag og arkitektur | ✅ Ja |

---

**Resultat:** 83/83 krav opfyldt (100%)

---

## 5. Systemarkitektur oversigt

### Teknologi-stack

| Komponent | Teknologi | Beskrivelse |
|-----------|-----------|-------------|
| **Frontend** | Next.js 16 (App Router) | React-baseret SPA med server-side rendering |
| **Sprog** | TypeScript 5 | Strict typing gennem hele applikationen |
| **Styling** | Tailwind CSS 4 + shadcn/ui | Responsive design med New York style |
| **Database** | PostgreSQL (Neon) | Managed PostgreSQL med SOC 2-certificering |
| **ORM** | Prisma | Type-safe databaseadgang med migrations |
| **Reverse Proxy** | Caddy | TLS 1.3, HSTS, automatisk certifikat-håndtering |
| **Autentificering** | NextAuth.js v4 | Cookie-baseret session management |
| **Kryptering** | AES-256-GCM + bcrypt | Symmetrisk kryptering + password hashing |
| **2FA** | TOTP (otplib) | Time-based One-Time Password med SHA-256 backup-koder |
| **State** | Zustand + TanStack Query | Client state + server state management |

### Multi-tenant arkitektur

AlphaFlow er bygget som et multi-tenant system med fuld dataadskillelse:

- **Tenant boundary:** `Company` model som tenant-entitet
- **Dataadskillelse:** Alle databaseforespørgsler filtreres på `companyId`
- **RBAC:** 5 roller (Ejer, Administrator, Bogholder, Seer, Revisor) med 23 granulære tilladelser
- **Tenant-isolering:** Ingen cross-tenant dataadgang uden eksplit `oversightCompanyId`

### E-invoicing mini-service

Asynkron e-faktura håndtering via dedikeret mini-service:

- **Port:** Egen port (3200)
- **Protokol:** HTTP + WebSocket
- **Ansvarlig for:** E-faktura fremsendelse, modtagelse, status tracking, retry-logik

---

## 6. Databaseskema oversigt

### Prisma-modeller (PostgreSQL)

| Model | Beskrivelse | Nøglefelter |
|-------|-------------|-------------|
| **Company** | Virksomhed/tenant | name, cvrNumber, twoFactorRequired, einvoiceEnabled |
| **User** | Brugerkonto | email, password, twoFactorSecret, twoFactorEnabled |
| **UserCompany** | Medlemskab (junction) | userId, companyId, role |
| **Invitation** | Invitations-token | email, role, token, status |
| **Session** | Brugersession | token, activeCompanyId, oversightCompanyId |
| **Account** | Kontoplan-konto | number, name, type, group, publicStandardNumber, postingGuide |
| **StandardAccountMapping** | FSR → Standardkontoplan mapping | accountId, standardAccountNumber |
| **JournalEntry** | Journalpost | date, description, status (DRAFT/POSTED/CANCELLED) |
| **JournalEntryLine** | Journalpost-linje | accountId, debit, credit, vatCode |
| **Document** | Bilag/dokument | fileName, fileType, filePath, journalEntryId |
| **Transaction** | Finanspost | date, type, amount, currency, exchangeRate, amountDKK |
| **Invoice** | Faktura | invoiceNumber, lineItems, subtotal, vatTotal, total, status |
| **Contact** | Kunde/leverandør | name, cvrNumber, type (CUSTOMER/SUPPLIER/BOTH) |
| **FiscalPeriod** | Regnskabsperiode | year, month, status (OPEN/CLOSED) |
| **BankStatement** | Kontoudtog | bankAccount, startDate, endDate |
| **BankStatementLine** | Kontoudtogslinje | date, description, amount, reconciliationStatus |
| **BankConnection** | Bankforbindelse | bankName, provider, status, accessToken |
| **Backup** | Backup-record | triggerType, backupType, filePath, sha256, status |
| **AuditLog** | Audit-log | action, entityType, entityId, changes, metadata |
| **RecurringEntry** | Gentagelse | frequency, status, nextExecution, lines |
| **Budget** | Budget | year, isActive |
| **HermesAgent** | AI-assistent | enabled, personality, systemPrompt |
| **ReceivedInvoice** | Modtaget e-faktura | supplierName, format, documentType, rawXml, status |
| **EInvoiceSending** | Sendt e-faktura | invoiceId, channel, status, responseXml |
| **VATSubmission** | Momsindberetning | year, period, totalOutputVAT, totalInputVAT, status |
| **EmailLog** | E-mail log | to, subject, template, status |
| **NotificationRead** | Læst-notifikation | userId, notificationId, readAt |

### Enums

| Enum | Værdier |
|------|---------|
| **AccountType** | ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE |
| **AccountGroup** | CASH, BANK, RECEIVABLES, INVENTORY, FIXED_ASSETS, PAYABLES, SHARE_CAPITAL, RETAINED_EARNINGS, SALES_REVENUE, OUTPUT_VAT, INPUT_VAT, COST_OF_GOODS, PERSONNEL, OTHER_OPERATING, FINANCIAL_EXPENSE, FINANCIAL_INCOME, TAX |
| **CompanyRole** | OWNER, ADMIN, ACCOUNTANT, VIEWER, AUDITOR |
| **JournalEntryStatus** | DRAFT, POSTED, CANCELLED |
| **InvoiceStatus** | DRAFT, SENT, PAID, CANCELLED |
| **VATCode** | S25, S12, S0, SEU, K25, K12, K0, KEU, KUF, NONE |
| **ReceivedInvoiceStatus** | RECEIVED, APPROVED, REJECTED, POSTED |
| **EInvoiceFormat** | OIOUBL, PEPPOL_BIS |
| **EInvoiceType** | INVOICE, CREDIT_NOTE, CORRECTED, SELF_BILLED |
| **EInvoiceSendStatus** | PENDING, QUEUED, SENDING, DELIVERED, ACCEPTED, FAILED, REJECTED, CANCELLED |
| **VATSubmissionStatus** | DRAFT, SUBMITTED, ACCEPTED, REJECTED, ERROR |

---

## 7. Sikkerhedsarkitektur

### Defense-in-Depth — 5 lag

AlphaFlow anvender en "defense-in-depth" sikkerhedsarkitektur med fem lag:

```
┌─────────────────────────────────────────────────────────────────┐
│  LAG 1: NETVÆRK (Network Security)                             │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Caddy reverse proxy                                         │ │
│  │ • TLS 1.3 med automatisk certifikat-håndtering             │ │
│  │ • HSTS (HTTP Strict Transport Security)                      │ │
│  │ • DDoS-beskyttelse og rate limiting                          │ │
│  │ • IP-baseret adgangskontrol                                  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  LAG 2: AUTE NTIFICERING (Authentication)                        │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ NextAuth.js v4 med cookie-baserede sessioner                │ │
│  │ • TOTP-baseret 2FA/MFA                                       │ │
│  │ • Tenant-niveau 2FA-krav (optional per virksomhed)          │ │
│  │ • 10 backup-koder (SHA-256 hashed, AES-256-GCM krypteret)   │ │
│  │ • Password hashing: bcrypt med 12 salt-runder               │ │
│  │ • Session expiry med automatisk udløb                        │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  LAG 3: ADGANGSKONTROL (Authorization)                           │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ RBAC med 5 roller og 23 granulære tilladelser                │ │
│  │ • Tenant-isolering (alle queries filtreres på companyId)      │ │
│  │ • SuperDev oversight med audit-logning                        │ │
│  │ • Endpoint-beskyttelse med permission checks                   │ │
│  │ • Multi-tenant medlemsskab via UserCompany junction          │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  LAG 4: DATAKRYPTERING (Encryption)                              │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ AES-256-GCM (symmetrisk kryptering)                         │ │
│  │ • Bankadgangskoder                                            │ │
│  │ • TOTP secrets (2FA)                                          │ │
│  │ • Backup-koder                                                │ │
│  │ • Følsomme konfigurationsdata                                 │ │
│  │                                                             │
│  │ TLS 1.3 — al data i transit                                   │ │
│  │ SSL/TLS til databaseforbindelse (sslmode=require)            │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                                                                   │
│  LAG 5: OVERVÅGNING & GENDANNELSE (Monitoring & Recovery)       │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │ Uforanderlig audit trail (AuditLog)                           │ │
│  │ • Alle handlinger logges med bruger, tid, ændring            │ │
│  │ • Soft delete — poster slettes aldrig fysisk                 │ │
│  │                                                             │
│  │ Automated backup scheduler                                     │ │
│  │ • Timebackup: hver time (24 retention)                       │ │
│  │ • Dagsbackup: daglig (30 retention)                           │ │
│  │ • Ugebackup: ugentlig (52 retention)                         │ │
│  │ • Månedsbackup: månedlig (60 retention)                       │ │
│  │ • SHA-256 checksum verifikation                              │ │
│  │                                                             │
│  │ PM2 process management med auto-restart                        │ │
│  │ • Health check mekanisme                                      │ │
│  │ • Graceful error handling                                     │ │
│  └─────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### Sikkerhedsforanstaltninger — Detaljer

| Område | Metode | Reference |
|--------|--------|-----------|
| Adgangskoder | bcrypt (12 salt-runder) | Prisma User.password |
| 2FA secrets | AES-256-GCM kryptering | `src/lib/two-factor.ts` |
| Backup-koder | SHA-256 hash + AES-256-GCM | `src/lib/two-factor.ts` |
| Bankadgangskoder | AES-256-GCM kryptering | `src/lib/crypto.ts` |
| Data i transit | TLS 1.3 (HTTPS) | Caddyfile |
| Data i hvile (database) | Neon PostgreSQL (krypteret storage) | `prisma/schema.prisma` |
| Databaseforbindelse | SSL/TLS (sslmode=require) | DATABASE_URL |
| Sessionsikkerhed | Unikke sessionstokens med expiry | Session model |
| Tenant-isolering | companyId-filter på alle queries | RBAC middleware |
| Audit trail | Uforanderlig log af alle handlinger | `src/lib/audit.ts` |
| Backup-integritet | SHA-256 checksum | `src/lib/backup-engine.ts` |

---

## 8. Anmeldelsesprocedure

### Trin-for-trin guide til anmeldelse via virk.dk

**Trin 1: Forberedelse**

- [x] Saml alle dokumenter ifølge dokumentpakken (se sektion 3)
- [x] Bekræft at alle 83 krav er opfyldt (se sektion 4)
- [x] Forbered systeminformation (CVR, kontaktperson, teknisk beskrivelse)

**Trin 2: virk.dk anmeldelse**

1. Gå til [virk.dk](https://www.virk.dk)
2. Log ind med MitID (erhvervsprofil)
3. Navigér til **Erhvervsstyrelsen → Anmeldelse af elektronisk bogføringssystem**
4. Udfyld systemoplysninger:
   - Systemnavn: AlphaFlow
   - CVR-nummer: [Virksomhedens CVR]
   - Kontaktperson: [Navn, e-mail, telefon]
   - Systemtype: Cloudbaseret regnskabssystem
   - Teknologi: Next.js 16, PostgreSQL, Neon
5. Upload dokumentpakke (eller referér til online-dokumentation)
6. Bekræft anmeldelsen
7. Modtag kvittering med sagsnummer

**Trin 3: Efter anmeldelse**

- Opbevar anmeldelseskvitteringen
- Svær på eventuelle opfølgende spørgsmål fra Erhvervsstyrelsen
- Hold dokumentationen opdateret ved ændringer i systemet

> **Bemærk:** Anmeldelsen kan suppleres med yderligere information, hvis Erhvervsstyrelsen anmoder herom. Svarfristen er typisk 30 dage.

---

## 9. Bilag

### Liste over understøttende materialer

| Bilag | Fil | Beskrivelse |
|-------|-----|-------------|
| Bilag A | `prisma/schema.prisma` | Komplet Prisma database-schema med alle modeller og relationer |
| Bilag B | `src/lib/rbac.ts` | RBAC implementering med 5 roller og 23 tilladelser |
| Bilag C | `src/lib/two-factor.ts` | TOTP 2FA implementering med AES-256-GCM kryptering |
| Bilag D | `src/lib/crypto.ts` | Kryptografisk bibliotek (AES-256-GCM, hash-funktioner) |
| Bilag E | `src/lib/audit.ts` | Audit trail implementering |
| Bilag F | `src/lib/backup-engine.ts` | Backup engine med SHA-256 checksum |
| Bilag G | `src/lib/backup-scheduler.ts` | Automated backup scheduler |
| Bilag H | `src/lib/standard-chart-of-accounts.ts` | SKAT Fællesoffentlig Standardkontoplan (~60 konti) |
| Bilag I | `src/lib/einvoice-parser.ts` | Unified OIOUBL/Peppol BIS XML parser |
| Bilag J | `src/lib/einvoice-response.ts` | Application Response, Message Level Response, Invoice Response |
| Bilag K | `Caddyfile` | Reverse proxy konfiguration med TLS 1.3 og HSTS |
| Bilag L | `docs/ENCRYPTION.md` | Detaljeret kryptografisk dokumentation |
| Bilag M | `package.json` | Komplet liste over afhængigheder og versioner |

### Eksterne referencer

| Reference | URL / Kilde |
|-----------|-------------|
| Bogføringsloven (LOV nr. 1457 af 13/12/2019) | retsinformation.dk |
| BEK nr. 98 af 13. februar 2024 | retsinformation.dk |
| SAF-T Financial DK v1.0 specifikation | skat.dk |
| OIOUBL 2.1 standard | digst.dk |
| Peppol BIS Billing 3.0 | peppol.eu |
| European Central Bank — Frankfurter API | ecb.europa.eu |
| SKAT Fællesoffentlig Standardkontoplan | skat.dk |
| NemHandelsregisteret | nemhandel.dk |

---

*Dokumentet udgør den komplette anmeldelsespakke for AlphaFlow til Erhvervsstyrelsen.*

*Udarbejdet af AlphaAi — 2025*
