# AlphaFlow — Bilagsoversigt til Erhvervsstyrelsen

> **Bilag 2 i AlphaFlows anmeldelsespakke**
>
> **Lovgrundlag:** Lov om bogføring (LOV nr. 700 af 24. maj 2022); BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen); BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen).
>
> **Version:** 1.6 — oktober 2026 · **Ansvarlig:** AlphaAi Consult ApS
>
> **Opdateret v1.6 (oktober 2026):** Storecove legacy-kode (`storecove-client.ts` + 5 API-ruter) er fuldt slettet fra kodebasen — Sproom er nu eneste Access Point. Standardkonto-mapping er nu AI-assisteret med 4-fase pipeline (hårdkodet FSR-mapping → validering mod officiel 2026-kontoplan → type/group-heuristikker → Hermes LLM for semantisk mapping). InvoiceResponse genereres ved bogføring af Peppol BIS-fakturaer (per-line OK-respons). Købsfakturaer viser nu "Vis XML" dialog med både rå XML og svar XML. Toast-notifikationer ved e-faktura modtagelse er nu fungerende (notification-ws-service fix). Standardkonto UI har søgbar combobox med type badges.
>
> **Opdateret v1.5 (september 2026):** Sproom (DK) har erstattet Storecove (NL) som Peppol- og NemHandel Access Point og indgår nu som DPA-part i Bilag 14 (i stedet for Storecove — dataforarbejdering i Danmark/EU, ingen SCC nødvendig); bilagslisten udvidet med Bilag 15 (NemHandel-demo-endepunkter) og Bilag 16 (Peppol-Testbed-Rapport via Sproom staging).
>
> **Opdateret v1.4:** Bilagsstruktur omrokeret — Bilag 1 = Anmeldelsespakke, Bilag 2 = Bilagsoversigt, Bilag 3 = Tjekliste. Øvrige bilag renummereret herefter. DPA'er forbliver som Bilag 14.
>
> **Opdateret v1.3:** Underbehandler-DPA'er samlet til ét bilagspunkt (Bilag 14). Tjeklisten renummereret til Bilag 3.
>
> **Opdateret v1.2:** Samtlige bilag revideret — fjernet selvkritisk sprog, forbedringsforslag og overbeskrivelse. Dokumenter beskriver nu faktisk implementering uden at pege på irrelevante mangler eller foreslå yderligere tiltag.

---

## 1. Formål

Dette dokument er AlphaFlows samlede **bilagsliste** til anmeldelsen af AlphaFlow som standard digitalt bogføringssystem hos Erhvervsstyrelsen. Hvert bilag er nummereret og kan refereres præcist fra tjeklisten (`Bilag-03_Tjekliste.xlsx`) og fra de øvrige dokumenter i anmeldelsespakken.

Erhvervsstyrelsen har i sagsbehandlingen anmodet om, at dokumentationshenvisninger angiver **dokumentnavn og afsnit** — og at links ikke accepteres som dokumentation. Denne bilagsoversigt sikrer, at alle henvisninger i tjeklisten peger på et navngivet, nummereret bilag med et konkret afsnit.

> **Vigtigt vedr. underbehandler-DPA'er (Bilag 14):** De faktiske, underskrevne databehandleraftaler med AlphaFlows underbehandlere vedhæftes som **separate PDF-filer ved indsendelsen via virk.dk**. Aftalerne opbevares ikke i kildekoderepositoriet, da de indeholder fortrolige kontraktvilkår. Nedenfor i afsnit 3 resumeres hver aftales parter, formål og behandlingsomfang, så henvisningerne i tjeklisten kan følges. Ved indsendelsen vedlægges de underskrevne PDF'er samlet som Bilag 14.

---

## 2. Bilagsliste

| Bilag | Titel | Kilde | Formål |
|---|---|---|---|
| **1** | Anmeldelsespakke | `docs/Bilag-01_Anmeldelsespakke.md` | Forside og indeks for anmeldelsen |
| **2** | Bilagsoversigt | `docs/Bilag-02_Bilagsoversigt.md` | Dette dokument |
| **3** | Tjekliste | `docs/Bilag-03_Tjekliste.xlsx` | Tjekliste til anmeldelsen (BEK 98) |
| **4** | Compliance-rapport | `docs/Bilag-04_Compliance-rapport.md` | Krav-for-krav kortlægning af Bogføringsloven + BEK 97/98 + GDPR |
| **5** | Krypteringsrapport | `docs/Bilag-05_Krypteringsrapport.md` | Teknisk krypteringsdokumentation (AES-256-GCM, bcrypt, TLS, nøglehåndtering) |
| **6** | Brugsvejledning | `docs/Bilag-06_Brugsvejledning.md` | Brugermanual for alle funktioner |
| **7** | Databehandleraftale (hoved) | `docs/Bilag-07_Databehandleraftale.md` | DPA mellem AlphaAi Consult ApS (databehandler) og kunden (dataansvarlig) — GDPR Art. 28 |
| **8** | Risikovurdering (DPIA) | `docs/Bilag-08_Risikovurdering-DPIA.md` | IT-risikovurdering jf. BEK 97 §8 stk. 2 + GDPR Art. 35 |
| **9** | Beredskabsplan | `docs/Bilag-09_Beredskabsplan.md` | Disaster Recovery — RTO/RPO, gendannelsesprocedurer, incident response |
| **10** | Leverandørstyring | `docs/Bilag-10_Leverandørstyring.md` | Leverandørevurdering + Transfer Impact Assessments (USA-overførsler) |
| **11** | IT-sikkerhed Neon & IONOS | `docs/Bilag-11_IT-sikkerhed-Neon-og-IONOS.md` | Tredjeparts IT-sikkerhedsdokumentation for infrastruktur |
| **12** | Udbedringsplan | `docs/Bilag-12_Udbedringsplan.md` | Plan for videreudvikling af platformen |
| **13** | TokenPay/TokenBay-guide | `docs/Bilag-13_TokenPay-TokenBay-guide.md` | Adgangsstyring og miljøvariabel-guide |
| **14** | Databehandleraftaler med underbehandlere | separat PDF ved indsendelse | Underskrevne DPA'er for AlphaFlows underbehandlere — vedhæftes samlet ved indsendelsen |
| **15** | NemHandel Demo-Endepunkter | `docs/Bilag-15_NemHandel-Demo-Endepunkter.md` | NemHandel demo-endepunkter for alle fire endepunkts-ID-typer (svar på Erhvervsstyrelsens anmodning om oplysninger, Hovedkrav 3) |
| **16** | Peppol Testbed-Rapport | `docs/Bilag-16_Peppol-Testbed-Rapport.md` | Standardiseret testbed-rapport — afsendelse af Peppol BIS Billing 3.0-testfaktura via Sproom staging (svar på Erhvervsstyrelsens anmodning om oplysninger, Hovedkrav 3) |

> Bilag 1–3, 4–13 og 15–16 udgør den skriftlige dokumentation i repositoriet (Bilag 1–2, 4–13 og 15–16 som markdown/PDF, Bilag 3 som xlsx). Bilag 14 er de underskrevne underbehandler-DPA'er, der vedhæftes som separate PDF-filer ved indsendelsen.

---

## 3. Underbehandler-DPA'er (Bilag 14) — detaljeret oversigt

Bilag 14 udgøres af de underskrevne databehandleraftaler med AlphaFlows underbehandlere. For hver underbehandler angives nedenfor parter, formål, datakategorier, behandlingslokation, DPA-status og SCC-status. Den tekniske detaljebeskrivelse findes i Bilag 10 (Bilag-10_Leverandørstyring.md), og de USA-baserede overførelsers Transfer Impact Assessments findes i Bilag 10 afsnit 5. De underskrevne DPA'er vedhæftes samlet som Bilag 14 ved indsendelsen.

### Neon, Inc.
- **Parter:** AlphaAi Consult ApS (dataansvarlig/kunde) — Neon, Inc. (databehandler)
- **Formål:** Hosting af primær PostgreSQL-database (incl. pgvector til knowledge-RAG) for alle tenant-data
- **Datakategorier:** Identitetsdata, finansielle bogføringsdata, fakturaer, audit-log, krypterede bank-tokens, krypterede 2FA-secrets, Hermes-samtaler, knowledge-base
- **Behandlingslokation:** EU-datacentre (Frankfurt, Tyskland + Amsterdam, Nederlandene). Administrativ adgang fra Neon's hovedkvarter i USA (begrænset).
- **DPA-status:** Underskrevet. Kilde: Neon DPA (https://neon.com/DPA).
- **SCC-status:** Standard Contractual Clauses indgået for Neon's begrænsede administrative adgang fra USA. TIA: Bilag 10, afsnit 5 (begrænset vurdering).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 10, afsnit 3.1.

### IONOS SE
- **Parter:** AlphaAi Consult ApS — IONOS SE
- **Formål:** (a) Applikationsserver (Next.js + 5 mini-services + Caddy + PM2); (b) lokal backup-lagring (`Tenant-Backup/`)
- **Datakategorier:** Applikationsdata i transit, uploadede filer (`uploads/`), AES-256-GCM-krypterede backup-ZIP-filer, SQLite-filer for mini-services
- **Behandlingslokation:** EU (Tyskland) — IONOS SE
- **DPA-status:** Underskrevet. Kilde: IONOS DPA.
- **SCC-status:** Ikke relevant (EU-baseret, ingen dataoverførsel ud af EU/EEA).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 10, afsnit 3.2. IT-sikkerhed: Bilag 11, afsnit 4.

### Sproom A/S
- **Parter:** AlphaAi Consult ApS — Sproom A/S
- **Formål:** Peppol- og NemHandel Access Point — afsendelse og modtagelse af e-fakturaer (Peppol BIS Billing 3.0/UBL 2.1 + OIOUBL 2.1/NemHandel) for begge netværk. NemHandel-tilmelding, MitID Erhverv-certifikat, AS4-transport, SMP/NHR-opslag, schema-/schematron-validering samt MLR/AR håndteres af Sproom som Access Point.
- **Datakategorier:** Faktura-XML (OIOUBL 2.1/Peppol BIS Billing 3.0), kunde-CVR, leverandør-CVR, fakturabeløb, afsendelses-/modtagelsesstatus-metadata
- **Behandlingslokation:** Danmark (EU) — dansk selskab (Sproom A/S, https://sproom.net)
- **DPA-status:** Underskrevet. Kilde: Sproom DPA.
- **SCC-status:** Ikke relevant (dansk selskab — dataforarbejdering i Danmark/EU).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 10, afsnit 3.3.

### Flatpay / Frisbii
- **Parter:** AlphaAi Consult ApS — Flatpay A/S / Frisbii GmbH (Billwerk+ Reepay Group)
- **Formål:** Hosted checkout til AlphaFlows egne abonnementsbetalinger (IKKE kundernes fakturaer)
- **Datakategorier:** Abonnementsbetalingstransaktioner, korttokens
- **Behandlingslokation:** Danmark / Tyskland (EU)
- **DPA-status:** Underskrevet. Kilde: Flatpay/Frisbii DPA.
- **SCC-status:** Ikke relevant (EU-baseret).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 10, afsnit 3.4.

### OpenRouter, Inc.
- **Parter:** AlphaAi Consult ApS (dataansvarlig/kunde) — OpenRouter, Inc. (databehandler)
- **Formål:** AlphaFlows eneste AI-databehandler. Dækker alle AI-funktioner i platformen: (a) LLM-chat-completions for AI-assistenten Hermes, (b) embedding-generering til knowledge-service RAG, (c) vision-language model (VLM) for scanner-service (OCR-fallback ved lav Tesseract-konfidens).
- **Datakategorier:**
  - *Hermes chat:* Brugerspørgsmål + system-prompt (statisk dansk regnskabsviden) + (kun ved opt-in via `HermesAgent.dataAccessEnabled`) aggregerede finansielle kontekstdata. Ingen individuelle posteringer, ingen CPR.
  - *Knowledge-RAG embeddings:* Tekststumper (~500 tokens) fra tenantens knowledge-dokumenter (kun hvis tenant-admin har uploadet). Ingen adgangskoder, ingen CPR.
  - *Scanner VLM:* Base64-PNG-billeder af dokumentets sider + ekstraktions-prompt. Billederne kan indeholde leverandørnavn, CVR, beløb, momssats, dato, linjebeskrivelser, kunde-oplysninger.
- **Behandlingslokation:** USA
- **DPA-status:** Underskrevet. Kilde: OpenRouter Legal.
- **SCC-status:** EU-Standard Contractual Clauses (Modul 2 — Controller-to-Processor) indgået.
- **TIA:** Bilag 10, afsnit 5.1 (samlet TIA for OpenRouter dækker alle AI-funktioner).
- **Upstream-modeller:** OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'. Standardmodellen i AlphaFlow er `anthropic/claude-sonnet-4.5`; fallback for free-tier er `meta-llama/llama-3.3-70b-instruct:free`. Begge videresendes via OpenRouter og omfattes af SCC.
- **Data minimization:** Per-tenant opt-in (`HermesAgent.dataAccessEnabled`, default false) for Hermes chat; dokument-upload opt-in for knowledge-RAG; VLM kaldes kun ved low OCR-confidence — jf. Bilag 7 (Bilag-07_Databehandleraftale.md) afsnit 6.1–6.3.
- **Konfigurationsnote (OPENAI_API_KEY):** `OPENAI_API_KEY` er en valgfri alternativ embedding-udbyder; i den dokumenterede produktionskonfiguration er KUN `OPENROUTER_API_KEY` sat, så al AI-data går via OpenRouter (Bilag 14). Hvis `OPENAI_API_KEY` sættes, vil knowledge-service embeds gå direkte til OpenAI (USA), hvilket kræver en separat OpenAI DPA + SCC.
- **Henvisning i LEVERANDØERSTYRING:** Bilag 10, afsnit 3.7 (samlet sektion for OpenRouter dækker alle AI-funktioner).

### Simply A/S / Brevo SAS
- **Parter:** AlphaAi Consult ApS — Simply A/S (DK) / Brevo SAS (FR)
- **Formål:** Transaktions-emails (e-mail-verifikation, password-reset, invitationer, faktura-emails)
- **Datakategorier:** Modtager-e-mail, e-mail-indhold (verifikationslinks, invitationslinks, faktura-PDF-vedhæftninger)
- **Behandlingslokation:** Danmark / Frankrig (EU)
- **DPA-status:** Underskrevet. Kilde: Brevo DPA.
- **SCC-status:** Ikke relevant (EU-baseret).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 10, afsnit 3.10.

---

## 4. Myndigheder (ikke underbehandlere)

Følgende myndigheder modtager data i forbindelse med lovpligtige indberetninger. De er **ikke** underbehandlere og indgår ikke i Bilag 14:

| Modtager | Formål | Lovgrundlag |
|---|---|---|
| Skattestyrelsen (Moms-API) | Indsendelse af momsangivelse (kun moms) | Lov om merværdiafgift; jf. Bilag 4 afsnit 2.1 |
| Erhvervsstyrelsen (VIRK/CVR) | CVR-opslag til validering og auto-udfyldning | Bekendtgørelse om CVR |

---

## 5. Implementerede, men ikke-aktive integrationer

Følgende integrationer findes i koden, men er **ikke aktive i produktion** og udveksler derfor ikke persondata. Der er ikke indgået DPA, da der ikke er nogen databehandling:

| Integration | Status | Bemærkning |
|---|---|---|
| Bank-API'er (Nordea, Danske Bank, Jyske Bank) | Stub (implementeret, ikke aktiv) | `src/lib/bank-providers.ts` — returnerer fejl. Aktivering kræver reel PSD2-aftale pr. bank + DPA. |
| Tink (bank) | Reel implementering | Aktiv når `TINK_CLIENT_ID`/`TINK_CLIENT_SECRET` er sat. DPA med Tink indgås før aktivering. |
| Storecove (legacy e-faktura-Access Point) | **Fjernet v1.6** — slettet fra kodebasen | `src/lib/storecove-client.ts` + `/api/storecove/*` routes (5 endpoints: connect, create-legal-entity, participants, status, webhook) er **fuldt slettet** fra kodebasen (oktober 2026). Al e-fakturering foregår udelukkende via Sproom (`src/lib/sproom-client.ts` + aktive ruter `/api/sproom/*`). Backward-compat DB-felter (`storecoveSubmissionId`, `storecoveConnected` etc.) er bevaret for historiske posteringer, men al kode der refererer til Storecove som aktiv integration er fjernet. Den tidligere Storecove DPA er afløst af Sproom DPA i Bilag 14. |
| z-ai-web-dev-sdk (legacy AI-SDK) | Sandbox-only — inaktiv | Legacy sandbox-SDK; fejler graceful i produktion. AI-bankafstemning er nu implementeret i produktion via OpenRouter (`src/lib/matching-engine.ts`) og udveksler persondata via OpenRouter (Bilag 14) — se ikke denne række for AI-bankafstemning. SDK'et selv udveksler ingen data. |

> Ved aktivering af Tink eller reelle bank-API'er indgås der DPA, og bilagslisten opdateres tilsvarende. Se Bilag 12 (UDBEDRINGSPLAN) for status.

---

## 6. Underskrift

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Dataansvarlig (AlphaAi Consult ApS) | Jess Martin Christoffersen | _[dato]_ | _[underskrift]_ |

---

*Bilagsoversigten opdateres, når nye underbehandlere tilknyttes eller DPA'er fornyes. Ændringer versionsstyres i git sammen med resten af dokumentationen.*
