# DATABEHANDLERAFTALE (DPA)

**Mellem AlphaAi Consult ApS (Databehandler) og kundens virksomhed (Dataansvarlig)**

---

## Forside

| Felt | Indhold |
|------|---------|
| **Dokumenttype** | Databehandleraftale (DPA) jf. GDPR artikel 28 |
| **Version** | 3.0 |
| **Dato** | 08.06.2026 |
| **Gældende lov** | Europa-Parlamentets og Rådets forordning (EU) 2016/679 (GDPR); dansk databeskyttelseslovgivning (LBK nr. 775 af 25. juni 2021); Lov om bogføring (LOV nr. 700 af 24. maj 2022); BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen); BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen) |
| **Parter** | **Dataansvarlig:** Kundens virksomhed (kunde hos AlphaFlow) — **Databehandler:** AlphaAi Consult ApS, CVR 46312058 |
| **Sprog** | Dansk |
| **Klassifikation** | Fortroligt — Compliance-dokumentation |
| **Udarbejdet af** | AlphaAi Consult ApS Compliance |

Denne databehandleraftale indgås som led i AlphaFlows anmeldelse til Erhvervsstyrelsen som standardiseret bogføringssystem jf. BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen), der henviser til BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen), og dokumenterer forpligtelser, sikkerhedsforanstaltninger og rettigheder i relation til AlphaAi Consult ApS' behandling af personoplysninger og bogføringsdata på vegne af kunden. Aftalen dækker samtlige underbehandlere, der anvendes i AlphaFlow-platformen (jf. afsnit 5).

---

## § 1 Parter og formål

### 1.1 Dataansvarlig (Kunden)

| Felt | Oplysninger |
|------|-------------|
| **Virksomhedsnavn** | [Indsættes ved aftaleindgåelse] |
| **CVR-nummer** | [Indsættes ved aftaleindgåelse] |
| **Adresse** | [Indsættes ved aftaleindgåelse] |
| **Kontaktperson (DPO/privacy-ansvarlig)** | [Indsættes ved aftaleindgåelse] |
| **E-mail** | [Indsættes ved aftaleindgåelse] |
| **Telefon** | [Indsættes ved aftaleindgåelse] |

Kunden er dataansvarlig for de personoplysninger og bogføringsdata, der behandles i AlphaFlow. Kunden afgør formål og midler for behandlingen, herunder hvilke medarbejdere, kontakter og fakturamodtagere der registreres i systemet.

### 1.2 Databehandler (AlphaAi Consult ApS)

| Felt | Oplysninger |
|------|-------------|
| **Virksomhedsnavn** | AlphaAi Consult ApS |
| **CVR-nummer** | 46312058 |
| **Adresse** | [Indsættes ved anmeldelse] |
| **Direktør / kontaktperson** | Jess Martin Christoffersen |
| **E-mail** | alphaaiconsult@gmail.com |
| **Telefon** | 61 73 60 76 |

AlphaAi Consult ApS er indehaver og driftsansvarlig for AlphaFlow — en cloud-baseret dansk bogføringsplatform (SaaS) — og fungerer som databehandler for kunden i forbindelse med levering af bogførings-, fakturerings-, momsangivelses-, e-fakturerings- og AI-assistent-ydelser.

### 1.3 Formål

AlphaAi Consult ApS behandler udelukkende personoplysninger og bogføringsdata på vegne af og i overensstemmelse med kundens skriftlige instrukser, som afgives gennem kundens brug af AlphaFlow-platformen. Behandlingen omfatter:

- Dobbelt bogføring (JournalEntry + JournalEntryLine), kontoplan FSR-38, finansjournal, hovedbog.
- Fakturering (salgsfakturaer, PDF-generering, e-mail-afsendelse, e-fakturering via Peppol/NemHandel/Storecove).
- Momsrapportering og -indberetning til SKAT (momsangivelse).
- Bank-forbindelser (scaffolding; ingen reelle PSD2-kald i produktion pr. dags dato).
- AI-assistent (Hermes) med valgfri tenant-dataadgang (per-tenant opt-in).
- Dokument-OCR/scanning (Tesseract + VLM via OpenRouter).
- Multi-tenant adgangskontrol, audit-log, backup og gendannelse.

AlphaAi Consult ApS behandler ikke data til egne kommercielle formål uden forudgående skriftligt samtykke fra kunden.

---

## § 2 Behandlingens formål og varighed

### 2.1 Formål

Levering af cloud-baseret bogføringsservice til kunden, herunder:

1. Indtastning, registrering og opbevaring af bogføringsdata jf. Bogføringsloven §§ 10-12.
2. Kontering og kategorisering efter FSR-standardkontoplan.
3. Rapportering (resultatopgørelse, balance, cash-flow, ældresaldo, budgetter, SAF-T, årsrapport-XBRL/CSV).
4. E-fakturering (OIOUBL + Peppol BIS Billing 3.0 via Peppol-netværket).
5. Momsangivelse til SKAT (kvartalsvis/årligt).
6. AI-assistent ("Hermes") til dansk regnskabsrådgivning.
7. Dokument-OCR med FSR-konto-forslag.
8. Backup og gendannelse i overensstemmelse med Bogføringsloven § 15.

### 2.2 Varighed

Aftalen gælder for kundens abonnementsperiode (jvf. AlphaFlows generelle vilkår) **+** den lovpligtige opbevaringsperiode jf. Bogføringsloven §§ 10-12 og § 15 (minimum 5 år fra regnskabsårets udløb). Efter ophør af abonnementet fortsætter opbevaring som beskrevet i § 8.

### 2.3 Behandlingens art

Behandlingen er begrænset til det i § 2.1 anførte. Behandlingen sker udelukkende på grundlag af kundens instrukser afgivet gennem platformens brugergrænseflade, undtagen hvor dansk lovgivning (særligt Bogføringsloven) pålægger AlphaAi Consult ApS at udføre specifikke handlinger (f.eks. opretholdelse af immutabel audit-log og 5-års backup-retention).

---

## § 3 Kategorier af persondata der behandles

Følgende datakategorier behandles i AlphaFlow-platformen. Kategorierne er baseret på den faktiske Prisma-datamodel (`prisma/schema.prisma`, 40 modeller, jf. P1-DB-analysen).

### 3.1 Identitetsdata

| Felt | Eksempler | Modeller |
|------|-----------|----------|
| **Navn** | Brugers fulde navn, virksomhedsnavn, kontaktnavn, kundenavn på faktura | `User.businessName`, `Company.name`, `Contact.name`, `Invoice.customerName` |
| **E-mail** | Bruger-login, kontakt-email, fakturamodtager-email | `User.email`, `Company.email`, `Contact.email`, `Invoice.customerEmail`, `Invitation.email` |
| **Telefon** | Virksomhedstelefon, kontakt-telefon, fakturamodtager-telefon | `Company.phone`, `Contact.phone`, `Invoice.customerPhone` |
| **Adresse** | Virksomhedsadresse, kontakt-adresse, fakturamodtager-adresse | `Company.address`, `Contact.address`, `Invoice.customerAddress` |

### 3.2 Finansielle data

| Felt | Eksempler | Modeller |
|------|-----------|----------|
| **Posteringer** | Beløb, dato, valuta, beskrivelse, momssats | `Transaction`, `JournalEntry`, `JournalEntryLine` |
| **Fakturaer** | Fakturanummer, linjer (JSON), subtotal, moms, total, status | `Invoice`, `ReceivedInvoice`, `EInvoiceSending` |
| **Momsangivelser** | Output/input VAT, periode, indberetnings-reference | `VATSubmission` |
| **Banktransaktioner** | Bankudtog, posteringer til afstemning | `BankStatement`, `BankConnection` (tokens krypteret, jf. § 7) |
| **Kontoplan** | FSR-38 konti, saldo, bevægelser | `Account`, `StandardAccountMapping` |
| **Budgetter** | Periode, beløb, kategori | `Budget` |

### 3.3 Adgangsdata og sikkerhedsdata

| Felt | Lagring | Modeller |
|------|---------|----------|
| **Adgangskode-hash** | bcrypt 12 salt-runder (aldrig plaintext) | `User.password` |
| **TOTP 2FA-secret** | AES-256-GCM-krypteret (base32 encoded) | `User.twoFactorSecret` |
| **2FA backup-koder** | AES-256-GCM-krypteret JSON-array af SHA-256-hashes | `User.twoFactorBackupCodes` |
| **Bank-tokens** | AES-256-GCM-krypteret (access/refresh-token) | `BankConnection.accessToken`, `BankConnection.refreshToken` |
| **Session-tokens** | 32-byte krypto-sikker random hex (httpOnly+secure+sameSite=lax) | `Session.token` |
| **IP-adresse / User-Agent** | Logges på session og audit-log | `Session.ipAddress`, `Session.userAgent`, `AuditLog.ipAddress` |
| **Proof-filer (.tbkey)** | AES-256-GCM via PROOF_ENCRYPTION_KEY | TokenPay SQLite (`proofs`) |

### 3.4 Organisatoriske data

| Felt | Eksempler | Modeller |
|------|-----------|----------|
| **CVR-nummer** | Kundens CVR, fakturamodtager-CVR, leverandør-CVR | `Company.cvrNumber`, `Invoice.customerCvr`, `Contact.cvr` |
| **Virksomhedsform** | ApS, A/S, ENK, IVS | `Company.companyType` |
| **Brugeres rolle i tenant** | OWNER, ADMIN, ACCOUNTANT, VIEWER, AUDITOR | `UserCompany.role` |

### 3.5 Hvad der IKKE behandles

Afgrænsning — følgende kategorier behandles **ikke** i AlphaFlow:

| Udelukket data | Begrundelse |
|----------------|-------------|
| **CPR-numre** | Ingen CPR-felter i datamodel. CVR anvendes udelukkende. |
| **Løndata** | Intet lønmodul — `TransactionType.SALARY` findes som enum, men der er ingen løn-kørsel. |
| **MitID/Bank-ID** | Autentificering er udelukkende e-mail+password+TOTP 2FA. |
| **Biometriske data** | Ingen biometri. |
| **Særlige kategorier (art. 9)** | Ingen race, religion, sundhed, sexuelle forhold etc. |
| **Børnedata** | Platformen er B2B og forventer ingen brugere under 18. |

### 3.6 Felter der opbevares UKRYPTERET i databasen

Af hensyn til søgbarhed og rapportering opbevares følgende felter ukrypteret i Neon PostgreSQL (kryptering på kolonne-niveau er ikke implementeret; database-niveau kryptering varetages af Neon, jf. afsnit 7):

- `Contact.email`, `Contact.phone`, `Contact.address`
- `BankConnection.accountNumber`, `BankConnection.iban`
- `Company.bankAccount`, `Company.bankRegistration`, `Company.bankIban`
- `Invoice.customerEmail`, `Invoice.customerPhone`, `Invoice.customerAddress`
- `User.email`, `User.businessName`
- De fleste personnavne, adresser og firmanavne

Følsomme felter (adgangskoder, TOTP-secrets, bank-tokens, backup-koder, proof-filer) er altid AES-256-GCM-krypteret — jf. ENCRYPTION.md for tekniske detaljer.

---

## § 4 Kategorier af registrerede

Følgende kategorier af fysiske personer kan have personoplysninger behandlet i AlphaFlow:

| Kategori | Beskrivelse | Persondata |
|----------|-------------|------------|
| **Kundens ansatte (brugere)** | Medlemmer af kundens virksomhed med login til AlphaFlow (`UserCompany`) | Navn, e-mail, brugernavn, IP/User-Agent, adgangskode-hash, 2FA-data, session-data |
| **Kundens kontakter (kunder/leverandører)** | Personer i kundens kontakt-kartotek (`Contact`) | Navn, e-mail, telefon, adresse, CVR (for virksomheder) |
| **Fakturamodtagere** | Personer der modtager fakturaer fra kunden | Navn, e-mail, telefon, adresse, CVR |
| **Inviterede brugere** | Personer inviteret til tenant endnu ikke har accepteret | E-mail, inviteret-rolle |
| **Kontakt-formular-afsendere** | Afsendere af beskeder via kontakt-formular | Navn, e-mail, besked-indhold |

**Børn:** AlphaFlow er en B2B-platform og forventer ingen registrerede under 18 år. Systemet udfører ikke aldersverifikation.

---

## § 5 Underbehandlere (data processors)

AlphaAi Consult ApS anvender underbehandlere til at levere specifikke dele af AlphaFlow-tjenesten. Nedenstående tabel er den **komplette liste** over eksterne integrationer identificeret i AlphaFlows kodebase (verificeret i P1-INT-analysen, 13 integrationer). Listen udgør Bilag A.

### 5.1 Klassifikation

Underbehandlerne er grupperet efter funktion:

#### 5.1.A — Infrastruktur (EU)

| # | Underbehandler | Juridisk enhed | Lokation (HQ / datacenter) | Formål i AlphaFlow | Data sendt | Retsgrundlag (GDPR Art. 28) | Tredjeland |
|---|----------------|----------------|---------------------------|---------------------|------------|------------------------------|------------|
| 1 | **Neon PostgreSQL** | Neon, Inc. | USA (HQ) / EU (Frankfurt + Amsterdam) | Primær database — PostgreSQL (serverless) med pgvector til RAG | **Alt:** virksomhedsoplysninger (CVR, adresse), bruger-emails, bcrypt-password-hashes, TOTP-secrets (AES-256-GCM), bank-access-tokens (AES-256-GCM), alle posteringer, fakturaer, momsangivelser, audit-log, Hermes-konversationer, knowledge-base | Art. 28(2) — DPA + SCC (admin-adgang fra USA) | Nej — data i EU. Admin-adgang fra USA → SCC påkrævet |
| 2 | **IONOS VPS** | IONOS SE | EU (Tyskland) | Applikationsserver (Next.js, Caddy, PM2) og lokal backup-lagring | AES-256-GCM-krypterede backup-ZIP-filer pr. tenant, SHA-256 checksum, runtime-data i arbejdshukommelse, audit-log via PM2 log-filer | Art. 28(2) — DPA | Nej (Tyskland) |

#### 5.1.B — E-fakturering og betaling (EU)

| # | Underbehandler | Juridisk enhed | Lokation | Formål i AlphaFlow | Data sendt | Retsgrundlag | Tredjeland |
|---|----------------|----------------|----------|---------------------|------------|--------------|------------|
| 3 | **Storecove** | Storecove B.V. | Holland (EU) | Peppol Access Point — afsendelse/modtagelse af e-fakturaer (OIOUBL + Peppol BIS Billing 3.0, NemHandel eDelivery) | OIOUBL/Peppol XML: afsender-CVR, modtager-CVR/EAN, fakturanummer, dato, linjer (beskrivelse, antal, pris, momssats), total, betalingsbetingelser, IBAN. B2B — typisk kun firmanavne, CVR, beløb. Ingen CPR. | Art. 28(2) — DPA | Nej (Holland) |
| 4 | **Frisbii / Flatpay** | Billwerk+ Reepay Group / Frisbii GmbH | Tyskland (EU) | Hosted checkout til AlphaFlows egne abonnementsbetalinger (Månedlig/Pro/Business/Business Extended). **Ikke** betalingsprocessor for kundens fakturaer. | Brugerens e-mail, virksomhedsnavn (brugt som customer first/last name), beløb i DKK øre, betalings-status, callback-URL'er | Art. 28(2) — DPA | Nej (Tyskland) |

#### 5.1.C — AI-underbehandler (USA — SCC påkrævet)

| # | Underbehandler | Juridisk enhed | Lokation | Formål i AlphaFlow | Data sendt | Retsgrundlag | Tredjeland |
|---|----------------|----------------|----------|---------------------|------------|--------------|------------|
| 5 | **OpenRouter, Inc.** | OpenRouter, Inc. | USA | AlphaFlows eneste AI-databehandler. Dækker alle AI-funktioner: (a) LLM chat-completions for Hermes AI-assistent, (b) embedding-generering til knowledge-service RAG, (c) vision-language model (VLM) i scanner-service (OCR-fallback). | (a) *Hermes chat:* System-prompt (statisk dansk regnskabsviden), brugerens spørgsmål, samtalehistorik (sidste 20 beskeder), tenant-kontekst **KUN hvis `dataAccessEnabled=true`** (virksomhedsnavn, CVR, branche, regnskabssummer, medlemsliste, påmindelser). Ingen individuelle posteringer, ingen CPR. (b) *Knowledge-RAG:* Dokument-tekst chunks (~500 tokens) fra danske regnskabsregler, branchekoder, kontoplan-beskrivelser. Potentielt tenant-specifikke dokumenter hvis `dataAccessEnabled=true`. Ingen adgangskoder, ingen CPR. (c) *Scanner VLM:* Base64-PNG-billeder af dokumentets sider + ekstraktions-prompt. Billederne kan indeholde leverandørnavn, CVR, beløb, momssats, dato, linjebeskrivelser, kunde-oplysninger. | Art. 28(2) + Art. 46(2)(c) — DPA + SCC (modul 2) + TIA | **JA (USA)** |

**Note vedr. upstream-modeller:** OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'. Standardmodellen i AlphaFlow er `anthropic/claude-sonnet-4.5` (videresendes til Anthropic). Fallback for free-tier er `meta-llama/llama-3.3-70b-instruct:free` (videresendes til Meta). Begge er USA-baserede og omfattes af OpenRouter's SCC.

#### 5.1.D — Email (EU)

| # | Underbehandler | Juridisk enhed | Lokation | Formål i AlphaFlow | Data sendt | Retsgrundlag | Tredjeland |
|---|----------------|----------------|----------|---------------------|------------|--------------|------------|
| 6 | **Simply / Brevo (SMTP)** | Simply A/S eller Brevo SAS | DK / FR (EU) | Transaktions-emails: email-verifikation, password-reset, team-invitations, owner-notifikationer, faktura-emails med PDF-vedhæftning | Modtager-email, brugernavn/firmanavn, verification/reset-tokens, invitation-rolle, faktura-PDF (indeholder typisk beløb, CVR, modtager-oplysninger) | Art. 28(2) — DPA | Nej (EU) |

#### 5.1.E — Myndigheder (ikke underbehandlere, men modtagere)

Følgende er ikke underbehandlere efter GDPR Art. 28, da de er offentlige myndigheder der modtager data i henhold til lovpligtige forpligtelser:

| # | Modtager | Formål i AlphaFlow | Data sendt | Retsgrundlag |
|---|----------|---------------------|------------|--------------|
| 7 | **Skattestyrelsen (SKAT)** — Moms-API | Indsendelse af momsangivelse (kvartalsvis/årligt). KUN moms — ingen årsopgørelse eller e-indkomst. | CVR-nummer, periode, momsbeløb (output/input/net), breakdown. Ingen personnavne eller CPR. | Bogføringsloven + Momsloven + SKAT's egne vilkår |
| 8 | **Erhvervsstyrelsen (VIRK/CVR-register)** | CVR-opslag til validering og auto-udfyldning af firmanavn, adresse, postnummer, virksomhedsform | CVR-nummer som term-query (HTTP Basic Auth over `http://distribution.virk.dk`). Ingen persondata. | Offentlig tilgængeligt register |

#### 5.1.F — Interne sub-systemer (ikke selvstændige underbehandlere)

Følgende komponenter er **integrerede dele af AlphaFlow** og kører på AlphaAi's egen infrastruktur (IONOS VPS). De er **ikke** selvstændige underbehandlere:

| # | Sub-system | Port | Formål | Lokation |
|---|-----------|------|--------|----------|
| 9 | **tokenpay-access-service** | 3100 | Token-baseret adgangskontrol via `.tbkey` proof-filer (AES-256-GCM dekrypteret med PROOF_ENCRYPTION_KEY), trial-administration, free-tier håndtering, owner-bypass. Lokal SQLite. | IONOS VPS (EU) |
| 10 | **scanner-service** | 3005 | Python/FastAPI — dokument-OCR (Tesseract + VLM via OpenRouter fallback). Lokal SQLite. VLM kaldes kun ved OCR-fallback. | IONOS VPS (EU) |
| 11 | **notification-ws-service** | 3001 | Socket.IO real-time notifikationer og `DATA_CHANGED`-invalidering pr. company-rum. In-memory only, ingen database. | IONOS VPS (EU) |
| 12 | **knowledge-service** | 3006 | RAG knowledge base (pgvector) — semantisk søgning via embeddings fra OpenRouter. | IONOS VPS (EU), embeddings via OpenRouter (USA) |
| 13 | **hermes-agent** | 3004 | Socket.IO AI chat-assistent — kalder OpenRouter (USA). | IONOS VPS (EU), LLM hos OpenRouter (USA) |

Disse sub-systemer behandler data på AlphaAi's vegne og er underlagt samme sikkerhedsforanstaltninger som hovedapplikationen.

#### 5.1.G — Implementerede men IKKE aktive integrationer

Følgende integrationer findes i koden, men er ikke aktive i produktion. De er inkluderet for transparens, men udgør ikke underbehandlere pt.:

| # | Integration | Status | Begrundelse |
|---|-------------|--------|-------------|
| — | **Bank-API'er (Tink, Nordea, Danske Bank, Jyske Bank)** | Stub-only — ingen reelle API-kald. Kun Demo-provider returnerer data. Bank-tokens krypteres dog alligevel med AES-256-GCM før lagring (fremtidssikring). | Implementeret som `createRealBankProvider()` factory, men consent-flow stubbes. `fetchTransactions` kaster "requires production configuration". |
| — | **z-ai-web-dev-sdk (AI-bankafstemning)** | Sandbox-only — virker ikke i produktion. Fejler gracefully. | Ifølge `.env.example` er SDK'et sandbox-only. |

Hvis disse integrationer aktiveres i fremtiden, vil de blive tilføjet til Bilag A og kunden vil blive underrettet jf. § 14.

### 5.2 Samlet oversigt — SCC-status

| Underbehandler | Tredjeland (USA)? | SCC påkrævet? | TIA påkrævet? |
|----------------|-------------------|----------------|----------------|
| Neon PostgreSQL | Nej (admin-adgang USA) | Ja (admin) | Begrænset |
| IONOS VPS | Nej | Nej | Nej |
| Storecove | Nej | Nej | Nej |
| Frisbii / Flatpay | Nej | Nej | Nej |
| **OpenRouter** | **Ja** | **Ja** | **Ja** |
| Simply / Brevo | Nej | Nej | Nej |

Detaljeret Transfer Impact Assessment for den USA-baserede AI-underbehandler (OpenRouter) findes i `docs/LEVERANDØERSTYRING.md` afsnit 5.

---

## § 6 Data-minimization foranstaltninger

AlphaFlow implementerer følgende data-minimization-foranstaltninger i henhold til GDPR art. 5(1)(c):

### 6.1 HermesAgent.dataAccessEnabled (per-tenant opt-in, default false)

> **Samtykke før AI-brug (forud for data-adgang):** Før Hermes AI-assistenten kan aktiveres overhovedet, skal tenant-administratoren (OWNER/ADMIN) aktivt acceptere tre advarsler via en samtykke-dialog i appen: (1) GDPR-relaterede risici ved persondata-overførsel til USA via OpenRouter, (2) non-deterministiske processer (AI-output kan variere, indeholde fejl eller hallucinationer), (3) at Hermes ikke er menneskelig revisor-rådgivning. Samtykket logges i AuditLog (`action: AI_CONSENT_ACCEPTED`) og kan tilbagekaldes ved deaktivering. Dette AI-brugssamtykke er adskilt fra `dataAccessEnabled` (nedenfor) som er et særskilt opt-in for om Hermes må læse tenant-specifikke finansielle data. Se Bilag 4 (BRUGSVEJLEDNING.md) afsnit 13.0 for de fulde advarselstekster.

Dette er den primære minimization-foranstaltning for AI-underbehandleren (OpenRouter). Standard er `false` — dvs. uden udtrykkelig opt-in fra tenant-ejer (OWNER) sendes **KUN**:

- Brugerens spørgsmål (naturligt sprog)
- Statisk dansk regnskabs-system-prompt (`knowledge-base.ts`, 454 LOC — lovtekst, moms-satser, frister, virksomhedsklasser)
- Samtalehistorik (sidste 20 beskeder)
- Valgfrie Hermes-skill-prompts (tenant-administreret)

**IKKE** sendt uden opt-in:
- Virksomhedsnavn, CVR, branche
- Medlemsliste (navn, rolle, email)
- Regnskabsoplysninger (balance, momsstatus, indtægter/udgifter, nettoresultat)
- Afventende påmindelser
- Individuelle posteringer, fakturaer, kontoplan

Når `dataAccessEnabled=true` aktiveres af tenant-ejer, sendes desuden ovenstående tenant-kontekst. Opt-in registreres i `HermesAgent`-modellen (Prisma) og kan til enhver tid tilbagekaldes.

### 6.2 Scanner-service — billed-niveau minimization

Scanner-service sender **kun** billedet af det dokument, brugeren har valgt at scanne — ikke hele tenant-datasættet. VLM (via OpenRouter) kaldes kun som fallback når:

1. PDF uden tekstlag → PNG-rendering → VLM via OpenRouter
2. Billede (JPEG/PNG/WebP) med OCR-confidence < 60 → VLM fallback

PDF'er med tekstlag håndteres udelukkende lokalt (PyMuPDF + Tesseract) uden kald til VLM (via OpenRouter).

### 6.3 Knowledge-service — dokument-niveau

Knowledge-service sender kun dokument-tekst chunks (~500 tokens) fra dokumenter, som tenant-administrator aktivt har uploadet til knowledge-base. Default knowledge-base indeholder kun generelle danske regnskabsregler (BRUGSVEJLEDNING.md) — ikke tenant-specifikke finansielle data.

### 6.4 SKAT — moms-niveau

SKAT Moms-API'en sender **kun** CVR, periode og momsbeløb (output/input/net). Ingen personnavne, individuelle transaktioner eller CPR.

### 6.5 CVR-opslag — input-niveau

CVR-opslag sender kun CVR-nummeret som term-query. Ingen persondata udveksles.

### 6.6 Frisbii — abonnements-niveau

Frisbii/Flatpay modtager kun kundens bruger-email og virksomhedsnavn (i B2B-kontekst brugt som customer first/last name) samt beløb og callback-URL'er. Ingen bogføringsdata.

### 6.7 Tenant-isolation

Multi-tenant-isolation via `tenantFilter(ctx)` + per-row `companyId` sikrer, at underbehandlere (særligt Neon og OpenRouter når `dataAccessEnabled=true`) kun modtager data for den korrekte tenant.

---

## § 7 Sikkerhedsforanstaltninger (Art. 32)

AlphaFlow implementerer følgende tekniske og organisatoriske sikkerhedsforanstaltninger jf. GDPR art. 32 og Bogføringslovens it-sikkerhedskrav. Detaljeret teknisk dokumentation findes i `docs/ENCRYPTION.md` og `docs/COMPLIANCE_RAPPORT.md`.

### 7.1 Kryptering i hvile (At-Rest)

| Foranstaltning | Implementering | Reference |
|----------------|----------------|-----------|
| **AES-256-GCM** (256-bit nøgle, 96-bit IV, 128-bit auth-tag) | Bank-tokens, TOTP-secrets, 2FA backup-koder, proof-filer (.tbkey), backup-filer | `src/lib/crypto.ts` |
| **Backup-kryptering** | AES-256-GCM fil-kryptering før lagring på IONOS VPS. Format: `[12B IV][16B authTag][ciphertext]` med `.zip.enc`-suffix. SHA-256 checksum på unencrypted ZIP inden secure-delete. | `src/lib/backup-engine.ts` |
| **Adgangskode-hashing** | bcrypt med 12 salt-runder | `src/lib/password.ts` |
| **Database-niveau kryptering** | Varetages af Neon (AES-256 i hvile, SOC 2 Type II) | Neon DPA |
| **Nøglehåndtering** | `ENCRYPTION_KEY` + `PROOF_ENCRYPTION_KEY` (64-hex / 32 bytes) via miljøvariabler, aldrig i kode | `.env` (prod) |

### 7.2 Kryptering i transit (In-Transit)

| Foranstaltning | Implementering | Reference |
|----------------|----------------|-----------|
| **TLS 1.2/1.3** | Caddy reverse proxy (min TLS 1.2, preferred TLS 1.3) med Let's Encrypt auto-cert | `Caddyfile` |
| **HSTS** | `max-age=31536000; includeSubDomains; preload` | `Caddyfile` |
| **DB-forbindelse** | `sslmode=require` til Neon PostgreSQL | `prisma/schema.prisma` |
| **Inter-service** | `localhost`-kald (notification-ws, hermes-agent, scanner-service, tokenpay-access, knowledge-service) | `ecosystem.config.example.js` |

### 7.3 Autentificering og adgangskontrol

| Foranstaltning | Implementering | Reference |
|----------------|----------------|-----------|
| **Adgangskode** | bcrypt 12 + min. længde 6 tegn (under NIST 800-63B anbefaling på 8 — kendt afvigelse) | `src/lib/password.ts` |
| **TOTP 2FA** | RFC 6238, 30s step, ±1 tolerance, 10 backup-koder | `src/lib/two-factor.ts` |
| **Session** | 256-bit random hex-token, httpOnly+secure+sameSite=lax, 7 dages sliding expiry | `src/lib/session.ts` |
| **RBAC** | 5 roller (OWNER > ADMIN > ACCOUNTANT > VIEWER > AUDITOR), 18 permissions | `src/lib/rbac.ts` |
| **Multi-tenant isolation** | `tenantFilter(ctx)` + per-row `companyId` (24 modeller) | `src/lib/rbac.ts` |
| **SuperDev oversight** | Read-only cross-tenant adgang for AlphaAi-teknikere. Alle oversight-sessioner logges som `OVERSIGHT` i audit-log. | `src/lib/rbac.ts` |

### 7.4 Audit-trail og immutability (Bogføringsloven §§ 10-12)

| Foranstaltning | Implementering | Reference |
|----------------|----------------|-----------|
| **3-niveau immutability** | (1) App-kode KUN CREATE på AuditLog + (2) PostgreSQL BEFORE UPDATE/DELETE triggere + (3) `onDelete: Restrict` cascade | `prisma/audit-immutability.sql` |
| **25 AuditAction-typer** | CREATE, UPDATE, CANCEL, DELETE_ATTEMPT, LOGIN, LOGIN_FAILED, LOGOUT, REGISTER, BACKUP_*, SESSION_INVALIDATE, DATA_RESET, OVERSIGHT, TWO_FACTOR_*, etc. | `src/lib/audit.ts` |
| **75+ routes logger** | Alle data-muterende API-ruter | `src/app/api/**` |
| **Metadata** | IP-adresse, User-Agent, timestamp, før/efter-værdier | `src/lib/audit.ts` |

### 7.5 Rate-limiting og netværkssikkerhed

| Foranstaltning | Implementering | Begrænsning |
|----------------|----------------|-------------|
| **App-level rate-limiting** | In-memory sliding window: login 5/min, register 3/min, 2FA 5-10/min, forgot-password 1/5min | Nulstilles ved PM2-restart (kendt begrænsning) |
| **Security headers** | HSTS, X-Frame-Options, X-Content-Type-Options, X-XSS-Protection, Referrer-Policy, Permissions-Policy | `next.config.ts` + `Caddyfile` |
| **Webhook-signering** | HMAC-SHA256 (Storecove, Frisbii, TokenPay, Flatpay, Scanner). Dev-fallback accept-all hvis secret tom — skal sikres i prod | `src/app/api/*/webhook/route.ts` |
| **Fil-upload** | MIME-whitelist, 25 MB max, path-traversal guard, tenant-scoped serving | Ingen antivirus-scanning (kendt afvigelse) |

### 7.6 Åbne / kendte sikkerhedsmangler

AlphaAi Consult ApS er forpligtet til at informere kunden om følgende kendte sikkerhedsmangler, som er dokumenteret i `docs/RISIKOVURDERING.md`:

1. **Ingen Content-Security-Policy (CSP) header** implementeret.
2. **Ingen CSRF-token** (kun SameSite=Lax cookie).
3. **Ingen Next.js middleware.ts** (auth håndteres pr. route via `withGuard`).
4. **Ingen antivirus-scanning af uploads** (kun MIME-whitelist + størrelsesgrænse).
5. **Ingen key rotation/versioning** (ENCRYPTION_KEY / PROOF_ENCRYPTION_KEY er statiske).
6. **Ingen account-lockout** (kun IP-baseret rate-limiting).
7. **Password min. længde kun 6 tegn** (under NIST 800-63B anbefaling på 8).
8. **Caddy rate_limit udkommenteret** (kun app-level).
9. **Webhook HMAC fallback "accept all" i dev** hvis WEBHOOK_SECRET tom.
10. **Ingen MitID/Bank-ID** (kun email+password+TOTP).

Disse mangler afhjælpes i den rækkefølge, der er angivet i `docs/UDBEDRINGSPLAN.md`.

### 7.7 Backup og gendannelse

AlphaFlow opretholder et 5-lags backup-system:

| Lag | Implementering | Retention |
|-----|----------------|-----------|
| 1. Neon PITR | Managed by Neon | 7 dage |
| 2. AlphaFlow hourly backup | node-cron (`5 * * * *`) — AES-256-GCM ZIP pr. tenant på IONOS VPS | 25 timer (24 stykker) |
| 3. AlphaFlow daily backup | node-cron (`15 2 * * *`) | 31 dage (30 stykker) |
| 4. AlphaFlow weekly backup | node-cron (`30 3 * * 1`) | 53 dage (52 stykker) |
| 5. AlphaFlow monthly backup | node-cron (`0 4 1 * *`) | **5 år** (60 stykker) — Bogføringsloven § 12 |
| (manuelle backups) | Bruger-initierede | 90 dage (999 stykker) |

**Format:** ZIP pr. tenant + manifest.json v2 + SHA-256 checksum + AES-256-GCM `.zip.enc`.
**Lokation:** `Tenant-Backup/{companyName}/` på IONOS VPS (EU).
**Robusthed:** DB-baseret CronExecution-log, startup catch-up, retry 3x exp backoff, overlap guard, pre-restore safety backup, atomisk gendannelse.

---

## § 8 Slette- og retention-politik

### 8.1 Bogføringslovens 5-års opbevaringspligt

I henhold til Bogføringsloven §§ 10-12 og § 15 skal bogføringsdata, bilag, fakturaer, bankudtog og audit-log opbevares i **minimum 5 år** fra regnskabsårets udløb. Dette har forrang over GDPR's slettepligt (art. 17(3)(c)).

### 8.2 Konto-deaktivering (ikke hard-delete)

AlphaFlow udfører **ikke** hard-delete af brugerkonti. I stedet anvendes **konto-deaktivering** (`User.deactivatedAt` + `User.deactivationReason`):

| Årsag | Beskrivelse |
|-------|-------------|
| `self_request` | Brugeren anmoder om deaktivering af egen konto |
| `admin_action` | Tenant-administrator (OWNER/ADMIN) deaktiverer bruger |
| `sole_company_cleanup` | Brugeren er ene medlem af et company, der nedlægges |

Deaktiverede konti kan ikke logge ind. Data opbevares i overensstemmelse med Bogføringslovens 5-års regel.

### 8.3 Soft-delete via modpostering

Bogføringsposter (Transaction, JournalEntry, Invoice) kan ikke hard-slettes. Annullering sker via modpostering:

- `Transaction.cancelled = true` + `cancelReason` + `originalId`
- `Invoice.status = CANCELLED` + `cancelReason`
- `JournalEntry.status = CANCELLED`

Dette sikrer fuld sporbarhed jf. Bogføringsloven §§ 10-12.

### 8.4 Backup-retention

Som beskrevet i § 7.7. Monthly backups opbevares i 5 år (60 måneder) for at opfylde Bogføringsloven § 12.

### 8.5 Audit-log — slettes aldrig

AuditLog-poster kan **aldrig** slettes eller ændres pga. 3-niveau immutability (app + DB-triggere + cascade-restrict). Dette opfylder Bogføringsloven §§ 10-12's krav om uforanderlig registrering.

### 8.6 Sletning ved ophør

Ved ophør af abonnement:

| Trin | Handling | Frist |
|------|----------|-------|
| 1 | Kunden adviseres om at eksportere data via `/api/export-tenant` | Senest 14 dage før ophør |
| 2 | Kunde foretager portabel eksport | Før ophør |
| 3 | Konto deaktiveres (ikke hard-delete) | Ved ophør |
| 4 | Backups opbevares i 5 år jf. Bogføringsloven | 5 år fra regnskabsårets udløb |
| 5 | Efter 5 år: monthly backups slettes via retention policy | Automatisk |

Kunden kan anmode om hard-delete af data, der ikke længere er under Bogføringslovens opbevaringspligt, forudsat at data er eksporteret og overført til en anden godkendt bogføringsudbyder jf. Bogføringsloven § 15, stk. 3.

---

## § 9 Overførsel til tredjelande (Kapitel V)

### 9.1 USA-overførsler

Følgende underbehandler overfører personoplysninger til USA:

| Underbehandler | Data sendt | Minimization |
|----------------|------------|---------------|
| **OpenRouter, Inc.** | (a) Hermes chat: Brugerens spørgsmål + system-prompt + (hvis opt-in) tenant-kontekst; (b) Knowledge-RAG: dokument-tekst chunks (embeddings); (c) Scanner VLM: Base64-PNG-billeder af dokumenter (kun ved VLM fallback) | (a) `dataAccessEnabled` per-tenant opt-in (default false); (b) Kun dokumenter tenant-admin har uploadet; (c) Kun ved low OCR-confidence |

OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'.

### 9.2 nødvendige sikkerhedsforanstaltninger

For hver USA-overførsel gælder:

1. **Standard Contractual Clauses (SCC)** — Kommissionens gennemførelsesafgørelse (EU) 2021/914 af 25. november 2021:
   - **Modul 2** (Controller-to-Processor) anvendes for OpenRouter (da data returneres til kunden som dataansvarlig).
2. **Transfer Impact Assessment (TIA)** — Vurdering af det amerikanske retsmiljø, herunder FISA 702, EO 12333 og CLOUD Act. Udføres før ibrugtagning og årligt efterfølgende. Detaljeret TIA findes i `docs/LEVERANDØERSTYRING.md` afsnit 5.
3. **Supplerende foranstaltninger:**
   - `HermesAgent.dataAccessEnabled` opt-in (default false) — primær minimization for Hermes chat (via OpenRouter).
   - OpenRouter — kort log-retention ifølge deres DPA (skal verificeres); OpenRouter forpligter sig til zero-retention for enterprise/API-aftaler (skal verificeres årligt).

### 9.3 Neon admin-adgang fra USA

Neon, Inc. er en US-virksomhed, men alle data hostes i EU (Frankfurt + Amsterdam). Admin-adgang fra Neon-personale (USA) udgør en teoretisk overførsel til USA. DPA + SCC indgås med Neon for at dække dette scenarie.

### 9.4 Ingen andre tredjelande

Ingen andre underbehandlere overfører data til tredjelande. Storecove (Holland), Frisbii (Tyskland), IONOS (Tyskland), Simply/Brevo (DK/FR) er alle EU-baserede.

---

## § 10 Underbehandlerers forpligtelser

### 10.1 Generelle forpligtelser

Hver underbehandler forpligter sig til at:

1. **Kun behandle personoplysninger** på dokumenteret instruks fra AlphaAi Consult ApS (som igen handler på kundens vegne).
2. **Ikke behandle data** til egne formål (herunder marketing, model-træning etc.) uden forudgående skriftligt samtykke.
3. **Sikre fortrolighed** — alt personale med adgang er underlagt fortrolighedsforpligtelse.
4. **Implementere passende sikkerhedsforanstaltninger** jf. GDPR art. 32.
5. **Respektere kundens rettigheder** jf. GDPR art. 12-22.
6. **Medvirke ved DSAR** — underbehandler leverer data inden for rimelig frist (typisk 14 dage) når AlphaAi anmoder.
7. **Slette eller returnere data** ved ophør af DPA — undtagen hvor lovgivning kræver opbevaring.
8. **Underrette AlphaAi om databrud** uden unødig forsinkelse og senest 24 timer efter opdagelse.
9. **Tillade revision** — AlphaAi har ret til at revidere underbehandler (selv eller via tredjepart).
10. **Indhente forudgående skriftligt samtykke** fra AlphaAi før tilkaldelse af nye sub-underbehandlere.

### 10.2 AI-underbehandlerers specifikke forpligtelser

For OpenRouter (AlphaFlows eneste AI-underbehandler) gælder udover de generelle forpligtelser:

1. **Ingen model-træning** på kundedata. AlphaAi indgår enterprise-/API-aftaler der garanterer zero-retention.
2. **Kort log-retention** — input/output data slettes efter teknisk nødvendig periode (typisk 30-90 dage for abuse-monitoring).
3. **SCC + TIA** opretholdes løbende.
4. **Transparens om upstream-udbydere** — OpenRouter skal oplyse hvilken model der faktisk anvendes og dens lokation. OpenRouter's underbehandlere (f.eks. Anthropic, Meta, OpenAI) er omfattet af GDPR Art. 28(4) og indgås ikke separate DPA'er med AlphaAi Consult ApS.

### 10.3 Myndigheders forpligtelser

SKAT og Erhvervsstyrelsen er ikke underbehandlere, men AlphaFlow transmitterer data til dem i henhold til lovpligtige forpligtelser:

- SKAT: Momsloven + SKAT's API-vilkår.
- Erhvervsstyrelsen: CVR-loven.

Kunden bærer ansvaret for korrektheden af indberetningsgrundlaget; AlphaAi Consult ApS leverer kun den tekniske transmittering.

---

## § 11 Kunders rettigheder og support

### 11.1 DSAR (Data Subject Access Requests)

Registrerede personer udøver deres rettigheder (art. 15-22) over for kunden som dataansvarlig. AlphaAi Consult ApS yder teknisk bistand via følgende API-endpoints:

| Rettighed | Endpoint / Funktion | Beskrivelse |
|-----------|---------------------|-------------|
| **Indsigt (art. 15)** | `GET /api/export-tenant` (OWNER/ADMIN) | Eksporterer alle tenant-data som struktureret JSON med SHA-256 checksum og GUID. Valgfri `?includeFiles=true` for base64-filer. |
| **Indsigt (art. 15)** | `GET /api/company/export-info` (OWNER/ADMIN) | Eksporterer virksomheds-specifik metadata. |
| **Berigtigelse (art. 16)** | UI — bruger-profil, kontakt-redigering, faktura-redigering | Direkte redigering via grænseflade (ACCOUNTANT+ for finansielle data) |
| **Sletning (art. 17)** | Konto-deaktivering (`User.deactivatedAt`) | Soft-delete; hard-delete blokeres af Bogføringsloven §§ 10-12. Sletning af specifikke entiteter via modpostering. |
| **Begrænsning (art. 18)** | `FiscalPeriod.lockedAt` / `lockedBy` | Lukning af regnskabsperiode forhindrer ændringer. |
| **Dataportabilitet (art. 20)** | `GET /api/export-tenant`, `GET /api/export-saft`, `GET /api/reports/annual-xbrl`, `GET /api/reports/annual-csv` | Strukturerede, maskinlæsbare formater. |
| **Indsigelse (art. 21)** | Kunden vurderer og instruerer AlphaAi | AlphaAi eksekverer instruks. |

### 11.2 Sletningsanmodninger vs. Bogføringsloven

Sletningsanmodninger afvejes mod Bogføringslovens 5-års opbevaringspligt (jf. GDPR art. 17(3)(c)). Følgende matrix gælder:

| Data-type | Sletning mulig? | Begrundelse |
|-----------|-----------------|-------------|
| Bogføringsdata (posteringer, fakturaer, journaler) | Nej — kun modpostering | Bogføringsloven §§ 10-12 |
| Bilag (PDF, kvitteringer) | Nej | Bogføringsloven § 15 |
| Audit-log | Nej | Bogføringsloven §§ 10-12 |
| Backups (monthly) | Efter 5 år | Automatisk retention |
| Identitetsdata (navn, email, telefon) | Konto-deaktivering | Soft-delete |
| Brugerkonto-data (adgangskode, 2FA) | Kan slettes ved kontodeaktivering | Ikke bogføringsdata |
| Hermes-samtalehistorik | Ja (efter samtale-rulning) | Ikke bogføringsdata |
| Knowledge-base dokumenter | Ja (tenant-admin sletter) | Ikke bogføringsdata |

### 11.3 Support-kanaler

Kunden kan rette DSAR-henvendelser til AlphaAi Consult ApS via:

- **E-mail:** alphaaiconsult@gmail.com
- **Telefon:** 61 73 60 76
- **In-app:** Support-formular

Svartid: 30 dage (jf. GDPR art. 12(3)).

---

## § 12 Brudsprocedures

### 12.1 Definition

Et persondata-brud (personal data breach) er enhver sikkerhedshændelse der fører til eller kan føre til:

- Uautoriseret adgang til personoplysninger
- Accidental eller ulovlig destruktion, tab, ændring eller uautoriseret videregivelse
- Tab af fortrolighed, integritet eller tilgængelighed

### 12.2 Brudprocedure

Ved et mistænkt persondata-brud følges proceduren i `docs/BEREDSKABSPLAN.md`. Opsummeret:

| Trin | Handling | Ansvarlig | Frist |
|------|----------|-----------|-------|
| 1 | Bruddet opdages og registreres i audit trail | AlphaAi / Kunde | Straks |
| 2 | Kunde underretter AlphaAi (hvis kunden opdager brud) | Kunde | Straks |
| 3 | AlphaAi vurderer omfang og alvorlighed | AlphaAi Compliance | 24 timer |
| 4 | Underbehandler underretter AlphaAi ved brud hos underbehandler | Underbehandler | Uden unødig forsinkelse (typisk ≤ 24 timer) |
| 5 | AlphaAi underretter Datatilsynet ved risiko for registrerede | AlphaAi | 72 timer (GDPR art. 33) |
| 6 | Kunde underrettes, så kunden kan opfylde sin underretningspligt over for Datatilsynet | AlphaAi | Straks |
| 7 | Berørte registrerede underrettes ved høj risiko | Kunde (med AlphaAis bistand) | Uden unødig forsinkelse (GDPR art. 34) |
| 8 | Dokumentation af brud og tiltag afsluttes | AlphaAi | 14 dage |

### 12.3 Underbehandler-underretning

Hver underbehandler forpligter sig til at underrette AlphaAi Consult ApS om ethvert persondata-brud uden unødig forsinkelse og senest **24 timer** efter at bruddet er opdaget. Underretningen skal indeholde:

1. Beskrivelse af bruddets art
2. Kategorier og antal berørte registrerede
3. Kategorier og antal berørte personoplysninger
4. Sandsynlig konsekvens for de registrerede
5. Foranstaltninger truffet eller foreslået
6. Kontaktperson hos underbehandler

### 12.4 Audit-trail sporing

Alle hændelser i AlphaFlow logges i den ufornderlige audit trail (jf. § 7.4), hvilket muliggør teknisk efterforskning af brud.

---

## § 13 Revisionsret (Art. 28(3)(h))

### 13.1 Kundens revisionsret

Kunden har ret til at revidere AlphaAi Consult ApS' databehandling, jf. GDPR art. 28(3)(h). Revisionen kan udføres af kunden selv eller af en uafhængig tredjepart underlagt fortrolighedsforpligtelse.

### 13.2 AlphaAis dokumentationsleverancer

AlphaAi Consult ApS stiller følgende dokumentation til rådighed for kundens revision:

| Dokument | Sti | Indhold |
|----------|-----|---------|
| Compliance-rapport | `docs/COMPLIANCE_RAPPORT.md` | Intern kontrol, sikkerhedsforanstaltninger, compliance-matrix |
| Krypteringsdokumentation | `docs/ENCRYPTION.md` | AES-256-GCM, TLS, nøglehåndtering |
| Leverandørstyring | `docs/LEVERANDØERSTYRING.md` | Due diligence, TIA, sub-processor-lister |
| Risikovurdering | `docs/RISIKOVURDERING.md` | IT-risikovurdering |
| Beredskabsplan | `docs/BEREDSKABSPLAN.md` | Incident response, kontaktliste |
| Audit-log | AuditLog-tabellen i Neon DB | Trækkes via `/api/audit` (OWNER/ADMIN) eller `/api/export-tenant` |
| Sub-processor-liste | Bilag A i dette dokument | Løbende opdateret |

### 13.3 Revisionsformer

| Form | Frekvens | Udføres af |
|------|----------|------------|
| **Selvrevision** | Årligt | AlphaAi Compliance Officer |
| **Ekstern audit** | Efter anmodning | Kundens revisor (under NDA) |
| **Sikkerhedstest** | Efter anmodning | Uafhængig pentest-firma (omkostninger afholdes af kunden) |
| **Certificeringsaudit** | Årligt | Neon (SOC 2 Type II), IONOS (C5, IT-Grundschutz) — rapporter tilgængelige på anmodning |

### 13.4 Begrænsninger

- Revision må ikke forstyrre driften af AlphaFlow.
- Revisor må ikke tilgå andre kunders data (tenant-isolation).
- Resultater der afslører sikkerhedssårbarheder håndteres jf. `docs/BEREDSKABSPLAN.md`.

---

## § 14 Ændringer i underbehandlere

### 14.1 Underretningsforpligtelse

AlphaAi Consult ApS forpligter sig til at underrette kunden om enhver planlagt ændring i underbehandlerlisten (Bilag A):

| Ændringstype | Varsel | Kanal |
|--------------|-------|-------|
| Tilføjelse af ny underbehandler | 30 dage før ikrafttrædelse | E-mail + statusside |
| Udskiftning af eksisterende underbehandler | 60 dage før ikrafttrædelse | E-mail + statusside |
| Ændring i underbehandlers lokation (f.eks. EU→USA) | 60 dage før ikrafttrædelse | E-mail + statusside |
| Tilføjelse af sub-underbehandler hos eksisterende underbehandler | 30 dage | Opdatering af Bilag A |

### 14.2 Kundens indsigtsret (Art. 28(2))

Kunden kan gøre indsigelse mod tilføjelse eller udskiftning af en underbehandler, hvis det rimeligt kan påvirke behandlingen af personoplysninger negativt (f.eks. ny underbehandler i USA uden SCC). Indsigten skal fremføres skriftligt inden for 30 dage efter underretning.

### 14.3 Konfliktløsning

Hvis parterne ikke kan opnå enighed:

1. AlphaAi Consult ApS udarbejder en alternativ handlingsplan.
2. Kunden kan opsige DPA'en uden varsel, forudsat at årsagen er dokumenteret.
3. Data returneres eller slettes jf. § 8.

### 14.4 Nødtilfælde

Ved akut sikkerhedshændelse (f.eks. underbehandler-brud der kræver øjeblikkelig afløsning) kan AlphaAi Consult ApS foretage midlertidig udskiftning uden forudgående varsel, men underretter kunden **straks** efterfølgende.

---

## § 15 Underskrift

Denne databehandleraftale er accepteret af begge parter ved elektronisk accept i AlphaFlow-systemet (ved oprettelse af virksomhed) eller ved underskrift nedenfor.

### 15.1 Databehandler — AlphaAi Consult ApS

| Felt | Underskrift |
|------|-------------|
| **Virksomhedsnavn** | AlphaAi Consult ApS |
| **CVR-nummer** | 46312058 |
| **Underskrevet af** | Jess Martin Christoffersen |
| **Funktion** | Direktør |
| **Dato og sted** | 08.06.2026, [By] |
| **Underskrift** | _________________________________ |

### 15.2 Dataansvarlig — Kunde

| Felt | Underskrift |
|------|-------------|
| **Virksomhedsnavn** | _________________________________ |
| **CVR-nummer** | _________________________________ |
| **Underskrevet af** | _________________________________ |
| **Funktion** | _________________________________ |
| **Dato og sted** | _________________________________ |
| **Underskrift** | _________________________________ |

---

## Bilag A — Komplet underbehandler-liste

| # | Navn | Juridisk enhed | Lokation | Formål i AlphaFlow | Data sendt | Rolle | Tredjeland (USA)? | SCC | DPA-status |
|---|------|----------------|----------|---------------------|------------|-------|--------------------|------|------------|
| 1 | Neon PostgreSQL | Neon, Inc. | USA HQ / EU DC (Frankfurt+Amsterdam) | Primær database | Alt (virksomhed, brugere, posteringer, fakturaer, moms, audit) | Databehandler | Nej (admin: ja) | Ja (admin) | Indgået |
| 2 | IONOS VPS | IONOS SE | Tyskland (EU) | Applikationsserver + backup-lagring | AES-256-GCM-krypterede backup-ZIPs, runtime-data | Databehandler | Nej | Nej | Indgået |
| 3 | Storecove | Storecove B.V. | Holland (EU) | Peppol Access Point — e-fakturering | OIOUBL/Peppol XML (CVR, faktura, linjer, IBAN) | Databehandler | Nej | Nej | Påkræret |
| 4 | Frisbii / Flatpay | Billwerk+ Reepay Group | Tyskland (EU) | Abonnementsbetalinger | Bruger-email, virksomhedsnavn, beløb, callback-URL'er | Databehandler | Nej | Nej | Påkræret |
| 5 | OpenRouter | OpenRouter, Inc. | USA | AI-databehandler — Hermes chat-LLM, knowledge-RAG embeddings og scanner VLM | Spørgsmål + system-prompt + (opt-in) tenant-kontekst; dokument-tekst chunks; base64-PNG-billeder | Databehandler | **Ja** | **Ja** (Modul 2) | Påkræret + TIA |
| 6 | Simply / Brevo (SMTP) | Simply A/S / Brevo SAS | DK / FR (EU) | Transaktions-emails | Modtager-email, brugernavn, faktura-PDF, tokens | Databehandler | Nej | Nej | Påkræret |
| 7 | SKAT (Moms-API) | Skattestyrelsen | DK (EU) | Momsangivelse-indberetning | CVR, periode, momsbeløb | Myndighed | Nej | Nej | N/A |
| 8 | Erhvervsstyrelsen (VIRK/CVR) | Erhvervsstyrelsen | DK (EU) | CVR-opslag | CVR-nummer (term-query) | Myndighed | Nej | Nej | N/A |
| 9 | tokenpay-access-service | AlphaAi Consult ApS (intern) | IONOS VPS (EU) | Adgangskontrol via .tbkey proofs | Bruger-ID, email, navn, proof-manifest, access-log | Intern sub-system | Nej | Nej | N/A (intern) |
| 10 | scanner-service | AlphaAi Consult ApS (intern) | IONOS VPS (EU) | Dokument-OCR + VLM-ekstraktion | Dokument-billeder, OCR-resultater | Intern sub-system | Nej | Nej | N/A (intern) |
| 11 | notification-ws-service | AlphaAi Consult ApS (intern) | IONOS VPS (EU) | Real-time notifikationer | userId, readIds, companyId (in-memory) | Intern sub-system | Nej | Nej | N/A (intern) |
| 12 | knowledge-service | AlphaAi Consult ApS (intern) | IONOS VPS (EU) | RAG knowledge base | Dokument-tekst, embeddings (pgvector) | Intern sub-system | Nej | Nej | N/A (intern) |
| 13 | hermes-agent | AlphaAi Consult ApS (intern) | IONOS VPS (EU) | AI chat-assistent | Socket.IO-events, samtalehistorik | Intern sub-system | Nej | Nej | N/A (intern) |
| 14 | NemHandel / Nets (Access Point) | Nets A/S | DK (EU) | NemHandel e-fakturering (OIOUBL) via direkte Nets Access Point-integration (reserveret; aktiveres kun hvis Storecove ikke anvendes som AP) | OIOUBL XML: afsender-CVR, modtager-CVR/EAN, fakturanummer, dato, linjer, total, IBAN (samme indhold som Storecove) | Databehandler (potentiel) | Nej (DK) | Nej | Ved aktivering — se Bilag 15 (Storecove) hvis Storecove anvendes som AP, ellers separat DPA med Nets |

**Note vedr. OpenRouter's underbehandlere:** OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4). Disse model-udbydere er OpenRouter's underbehandlere — ikke AlphaAi Consult ApS' — og indgås derfor ikke separate DPA'er med AlphaAi. AlphaAi's DPA og SCC med OpenRouter (Bilag 17) dækker alle AI-funktioner i AlphaFlow: Hermes chat-LLM, knowledge-RAG embeddings og scanner VLM.

**Note vedr. Peppol/NemHandel Access Point:** AlphaFlow anvender **Storecove B.V. (Holland)** som både Peppol og NemHandel Access Point (se Bilag 15 — separat DPA-PDF ved indsendelse) i den nuværende konfiguration. Miljøvariablerne `NEMHANDEL_API_KEY`, `NEMHANDEL_API_URL` (https://nemhandel.nets.dk/api/v2) og `PEPPOL_AP_URL` (jf. Bilag 11 — TOKENBAY-ACCESS-ENV-GUIDE.md) er reserveret til en fremtidig direkte Nets-integration, men er **ikke aktive i produktion**. Hvis direkte Nets-integration aktiveres i fremtiden, vil Nets blive tilføjet som selvstændig underbehandler med separat DPA (jf. § 14).

### Bilag A.2 — Implementerede men IKKE aktive integrationer

| Integration | Status | Begrundelse |
|-------------|--------|-------------|
| Bank-API'er (Tink, Nordea, Danske Bank, Jyske Bank) | Stub-only — ingen reelle API-kald i produktion. Kun Demo-provider. Bank-tokens krypteres dog alligevel med AES-256-GCM før lagring. | Implementeret men ikke produktionsaktiveret |
| z-ai-web-dev-sdk (AI-bankafstemning) | Sandbox-only — fejler gracefully i produktion. | Ifølge `.env.example` er SDK'et sandbox-only |

Disse integrationer vil blive tilføjet Bilag A, hvis de aktiveres.

---

## Bilag B — Henvisninger

| Dokument | Sti | Indhold |
|----------|-----|---------|
| Krypteringsdokumentation | `docs/ENCRYPTION.md` | AES-256-GCM tekniske detaljer, nøglehåndtering |
| Compliance-rapport | `docs/COMPLIANCE_RAPPORT.md` | Intern kontrol, RBAC, audit-trail |
| Leverandørstyring | `docs/LEVERANDØERSTYRING.md` | Due diligence, TIA for USA-underbehandlere |
| Risikovurdering | `docs/RISIKOVURDERING.md` | IT-risici, åbne afvigelser |
| Beredskabsplan | `docs/BEREDSKABSPLAN.md` | Incident response, kontaktliste |
| Udbedringsplan | `docs/UDBEDRINGSPLAN.md` | Åbne sikkerhedsmangler og afhjælpningsplan |
| Neon & IONOS IT-sikkerhed | `docs/NEON & IONOS_IT_SIKKERHED.md` | Hosting-udbydere sikkerhedsdokumentation |

---

## Bilag C — GDPR-artikel-referencer

| Artikel | Emne | Relevans |
|---------|------|----------|
| Art. 5 | Principper for behandling | Minimization (§ 6), formålsbegrænsning (§ 2) |
| Art. 13-14 | Informationspligt | Kundens ansvar som dataansvarlig |
| Art. 15-22 | Registreredes rettigheder | Understøttet via eksport-API'er (§ 11) |
| Art. 25 | Privacy by Design | `dataAccessEnabled` opt-in (§ 6.1), tenant-isolation |
| Art. 28 | Databehandleraftale | Nærværende aftale |
| Art. 28(2) | Underbehandler-indsigtsret | § 14 |
| Art. 28(3)(h) | Revisionsret | § 13 |
| Art. 32 | Sikkerhed i behandling | § 7 |
| Art. 33 | Underretning ved brud (Datatilsynet) | § 12.2 trin 5 |
| Art. 34 | Underretning af registrerede | § 12.2 trin 7 |
| Art. 35 | DPIA | Henviser til `docs/RISIKOVURDERING.md` |
| Art. 44-49 | Tredjelandsoverførsler | § 9 — SCC + TIA for USA-underbehandlere |
| Art. 46(2)(c) | SCC | Standard Contractual Clauses 2021/914 |

---

## Bilag D — Bogføringslovens reference

| Paragraf | Emne | AlphaFlows understøttelse |
|----------|------|---------------------------|
| § 4 | Dokumentationspligt | Automatisk journalisering, bilagsstyring |
| § 10 | Uforanderlighed af registreringer | Audit trail 3-niveau immutability, soft-delete via modpostering |
| § 11 | Klarhed og overskuelighed | Struktureret JSON + manifest v2 |
| § 12 | Fortløbende registrering | Automatisk dato- og tidsstempling, fortløbende bilagsnummer (`journalPrefix` + `nextJournalSequence`) |
| § 15 | 5-års opbevaringspligt | Monthly backups 60 stk. (5 år), Konto-deaktivering i stedet for sletning |

---

## Historik

| Version | Dato | Ændring |
|---------|------|---------|
| 1.0 | 2025 | Første udkast |
| 2.0 | 1. januar 2025 | Komplet revidering med tekniske referencer |
| 3.0 | 08.06.2026 | **Komplet omskrivning (D4-DPA-LEV):** Rettet partrollen (AlphaAi = databehandler, kunde = dataansvarlig); tilføjet komplet underbehandler-tabel for alle 15 integrationer fra P1-INT (Neon, IONOS, Storecove, Frisbii, OpenAI, OpenRouter, Anthropic, Simply/Brevo, SKAT, Erhvervsstyrelsen, + 5 interne sub-systemer); tilføjet data-minimization-sektion med `HermesAgent.dataAccessEnabled` opt-in (default false); tilføjet Tredjelands-overførsels-sektion (§ 9) med SCC 2021/914 + TIA for USA-underbehandlere; tilføjet præcise datakategorier fra P1-DB-analysen; dokumenteret konto-deaktivering vs. hard-delete per Bogføringsloven §§ 10-12; dokumenteret åbne sikkerhedsmangler ærligt (CSP, CSRF, etc.) |
| 3.1 | 2026 (AI-konsolidering C1) | **AI-underbehandler-konsolidering:** OpenRouter, Inc. er nu AlphaFlows eneste AI-databehandler per AI-CONSOLIDATION-SPEC. OpenAI, Inc. og Anthropic PBC er fjernet som selvstændige underbehandlere (de er OpenRouter's underbehandlere per GDPR Art. 28(4), ikke AlphaAi Consult ApS'). Bilag A reduceret fra 16 til 14 rækker; §5.1.C reduceret fra 3 til 1 række; §5.2 SCC-status-tabel reduceret fra 3 til 1 AI-række; §9.1 USA-overførsler konsolideret; §6.2/§6.3 beskrivelser opdateret ("via OpenRouter"); §10.2 AI-specifikke forpligtelser gælder nu kun OpenRouter. Bilag 17 = OpenRouter (konsolideret DPA + SCC), Bilag 18 = Simply/Brevo, Bilag 19 = xlsx-tjekliste (jf. BILAG_OVERSIGT.md). |

---

*Udarbejdet af AlphaAi Consult ApS Compliance som del af anmeldelsen til Erhvervsstyrelsen af AlphaFlow som standardiseret bogføringssystem (BEK 98).*

*Alle tekniske referencer er baseret på faktisk implementeret kode fra AlphaFlow-kodebasen (verificeret i P1-INT og P1-DB-analyserne). Ingen opdigtede underbehandlere.*
