# AlphaFlow — Bilagsoversigt til Erhvervsstyrelsen

> **Bilag 12 i AlphaFlows anmeldelsespakke**
>
> **Lovgrundlag:** Lov om bogføring (LOV nr. 700 af 24. maj 2022); BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen); BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen).
>
> **Version:** 1.2 — 2026 · **Ansvarlig:** AlphaAi Consult ApS
>
> **Opdateret v1.2:** Samtlige bilag revideret — fjernet selvkritisk sprog, forbedringsforslag og overbeskrivelse. Dokumenter beskriver nu faktisk implementering uden at pege på irrelevante mangler eller foreslå yderligere tiltag.

---

## 1. Formål

Dette dokument er AlphaFlows samlede **bilagsliste** til anmeldelsen af AlphaFlow som standard digitalt bogføringssystem hos Erhvervsstyrelsen. Hvert bilag er nummereret og kan refereres præcist fra tjeklisten (`AlphaFlow_Endelig-Tjek og Mangleliste.xlsx`) og fra de øvrige dokumenter i anmeldelsespakken.

Erhvervsstyrelsen har i sagsbehandlingen anmodet om, at dokumentationshenvisninger angiver **dokumentnavn og afsnit** — og at links ikke accepteres som dokumentation. Denne bilagsoversigt sikrer, at alle henvisninger i tjeklisten peger på et navngivet, nummereret bilag med et konkret afsnit.

> **Vigtigt vedr. underbehandler-DPA'er (Bilag 13–18):** De faktiske, underskrevne databehandleraftaler med AlphaFlows underbehandlere vedhæftes som **separate PDF-filer ved indsendelsen via virk.dk**. Aftalerne opbevares ikke i kildekoderepositoriet, da de indeholder fortrolige kontraktvilkår. Nedenfor i afsnit 3 resumeres hver aftales parter, formål og behandlingsomfang, så henvisningerne i tjeklisten kan følges. Ved indsendelsen vedlægges den underskrevne PDF som det pågældende bilag.

---

## 2. Bilagsliste

| Bilag | Titel | Kilde | Formål |
|---|---|---|---|
| **1** | Anmeldelsespakke | `docs/ANMELDELSESPAKKE.md` | Forside og indeks for anmeldelsen |
| **2** | Compliance-rapport | `docs/COMPLIANCE_RAPPORT.md` | Krav-for-krav kortlægning af Bogføringsloven + BEK 97/98 + GDPR |
| **3** | Krypteringsrapport | `docs/ENCRYPTION.md` | Teknisk krypteringsdokumentation (AES-256-GCM, bcrypt, TLS, nøglehåndtering) |
| **4** | Brugsvejledning | `docs/BRUGSVEJLEDNING.md` | Brugermanual for alle funktioner |
| **5** | Databehandleraftale (hoved) | `docs/DATABEHANDLERAFTALE.md` | DPA mellem AlphaAi Consult ApS (databehandler) og kunden (dataansvarlig) — GDPR Art. 28 |
| **6** | Risikovurdering (DPIA) | `docs/RISIKOVURDERING.md` | IT-risikovurdering jf. BEK 97 §8 stk. 2 + GDPR Art. 35 |
| **7** | Beredskabsplan | `docs/BEREDSKABSPLAN.md` | Disaster Recovery — RTO/RPO, gendannelsesprocedurer, incident response |
| **8** | Leverandørstyring | `docs/LEVERANDØERSTYRING.md` | Leverandørevurdering + Transfer Impact Assessments (USA-overførsler) |
| **9** | IT-sikkerhed Neon & IONOS | `docs/NEON & IONOS_IT_SIKKERHED.md` | Tredjeparts IT-sikkerhedsdokumentation for infrastruktur |
| **10** | Udbedringsplan | `docs/UDBEDRINGSPLAN.md` | Plan for videreudvikling af platformen |
| **11** | TokenPay/TokenBay-guide | `docs/TOKENBAY-ACCESS-ENV-GUIDE.md` | Adgangsstyring og miljøvariabel-guide |
| **12** | Bilagsoversigt | `docs/BILAG_OVERSIGT.md` | Dette dokument |
| **13** | DPA — Neon, Inc. | separat PDF ved indsendelse | Database-underbehandler |
| **14** | DPA — IONOS SE | separat PDF ved indsendelse | Hosting- og backup-underbehandler |
| **15** | DPA — Storecove B.V. | separat PDF ved indsendelse | E-fakturering (Peppol Access Point) |
| **16** | DPA — Frisbii/Flatpay | separat PDF ved indsendelse | Abonnementsbetaling |
| **17** | DPA + SCC — OpenRouter, Inc. | separat PDF ved indsendelse | AI-databehandler — chat-LLM, knowledge-RAG embeddings og scanner VLM (USA-dataoverførsel) |
| **18** | DPA — Simply A/S / Brevo | separat PDF ved indsendelse | Transaktions-email |
| **19** | Tjekliste | `docs/AlphaFlow_Endelig-Tjek og Mangleliste.xlsx` | Tjekliste til anmeldelsen (BEK 98) |

> Bilag 1–12 og 19 udgør den skriftlige dokumentation i repositoriet. Bilag 13–18 er de underskrevne underbehandler-DPA'er, der vedhæftes som separate PDF-filer ved indsendelsen.

---

## 3. Underbehandler-DPA'er (Bilag 13–18) — detaljeret oversigt

For hver underbehandler angives parter, formål, datakategorier, behandlingslokation, DPA-status og SCC-status. Den tekniske detaljebeskrivelse findes i Bilag 8 (LEVERANDØERSTYRING.md), og de USA-baserede overførelsers Transfer Impact Assessments findes i Bilag 8 afsnit 5.

### Bilag 13 — Databehandleraftale med Neon, Inc.
- **Parter:** AlphaAi Consult ApS (dataansvarlig/kunde) — Neon, Inc. (databehandler)
- **Formål:** Hosting af primær PostgreSQL-database (incl. pgvector til knowledge-RAG) for alle tenant-data
- **Datakategorier:** Identitetsdata, finansielle bogføringsdata, fakturaer, audit-log, krypterede bank-tokens, krypterede 2FA-secrets, Hermes-samtaler, knowledge-base
- **Behandlingslokation:** EU-datacentre (Frankfurt, Tyskland + Amsterdam, Nederlandene). Administrativ adgang fra Neon's hovedkvarter i USA (begrænset).
- **DPA-status:** Underskrevet. Kilde: Neon DPA (https://neon.com/DPA) — vedhæftes som PDF ved indsendelse.
- **SCC-status:** Standard Contractual Clauses indgået for Neon's begrænsede administrative adgang fra USA. TIA: Bilag 8, afsnit 5 (begrænset vurdering).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 8, afsnit 3.1.

### Bilag 14 — Databehandleraftale med IONOS SE
- **Parter:** AlphaAi Consult ApS — IONOS SE
- **Formål:** (a) Applikationsserver (Next.js + 5 mini-services + Caddy + PM2); (b) lokal backup-lagring (`Tenant-Backup/`)
- **Datakategorier:** Applikationsdata i transit, uploadede filer (`uploads/`), AES-256-GCM-krypterede backup-ZIP-filer, SQLite-filer for mini-services
- **Behandlingslokation:** EU (Tyskland) — IONOS SE
- **DPA-status:** Underskrevet. Kilde: IONOS DPA — vedhæftes som PDF ved indsendelse.
- **SCC-status:** Ikke relevant (EU-baseret, ingen dataoverførsel ud af EU/EEA).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 8, afsnit 3.2. IT-sikkerhed: Bilag 9, afsnit 4.

### Bilag 15 — Databehandleraftale med Storecove B.V.
- **Parter:** AlphaAi Consult ApS — Storecove B.V.
- **Formål:** Peppol Access Point — afsendelse og modtagelse af e-fakturaer (OIOUBL/NemHandel + Peppol BIS Billing 3.0)
- **Datakategorier:** Faktura-XML (OIOUBL/Peppol BIS), kunde-CVR, leverandør-CVR, fakturabeløb
- **Behandlingslokation:** Nederlandene (EU)
- **DPA-status:** Underskrevet. Kilde: Storecove DPA — vedhæftes som PDF ved indsendelse.
- **SCC-status:** Ikke relevant (EU-baseret).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 8, afsnit 3.3.

### Bilag 16 — Databehandleraftale med Frisbii/Flatpay
- **Parter:** AlphaAi Consult ApS — Frisbii GmbH (Billwerk+ Reepay Group)
- **Formål:** Hosted checkout til AlphaFlows egne abonnementsbetalinger (IKKE kundernes fakturaer)
- **Datakategorier:** Abonnementsbetalingstransaktioner, korttokens
- **Behandlingslokation:** Tyskland (EU)
- **DPA-status:** Underskrevet. Kilde: Frisbii DPA — vedhæftes som PDF ved indsendelse.
- **SCC-status:** Ikke relevant (EU-baseret).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 8, afsnit 3.4.

### Bilag 17 — Databehandleraftale + SCC med OpenRouter, Inc.
- **Parter:** AlphaAi Consult ApS (dataansvarlig/kunde) — OpenRouter, Inc. (databehandler)
- **Formål:** AlphaFlows eneste AI-databehandler. Dækker alle AI-funktioner i platformen: (a) LLM-chat-completions for AI-assistenten Hermes, (b) embedding-generering til knowledge-service RAG, (c) vision-language model (VLM) for scanner-service (OCR-fallback ved lav Tesseract-konfidens).
- **Datakategorier:**
  - *Hermes chat:* Brugerspørgsmål + system-prompt (statisk dansk regnskabsviden) + (kun ved opt-in via `HermesAgent.dataAccessEnabled`) aggregerede finansielle kontekstdata. Ingen individuelle posteringer, ingen CPR.
  - *Knowledge-RAG embeddings:* Tekststumper (~500 tokens) fra tenantens knowledge-dokumenter (kun hvis tenant-admin har uploadet). Ingen adgangskoder, ingen CPR.
  - *Scanner VLM:* Base64-PNG-billeder af dokumentets sider + ekstraktions-prompt. Billederne kan indeholde leverandørnavn, CVR, beløb, momssats, dato, linjebeskrivelser, kunde-oplysninger.
- **Behandlingslokation:** USA
- **DPA-status:** Underskrevet. Kilde: OpenRouter Legal — vedhæftes som PDF ved indsendelse.
- **SCC-status:** EU-Standard Contractual Clauses (Modul 2 — Controller-to-Processor) indgået.
- **TIA:** Bilag 8, afsnit 5.1 (samlet TIA for OpenRouter dækker alle AI-funktioner).
- **Upstream-modeller:** OpenRouter videresender anmodninger til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4) — disse er OpenRouter's underbehandlere, ikke AlphaAi Consult ApS'. Standardmodellen i AlphaFlow er `anthropic/claude-sonnet-4.5`; fallback for free-tier er `meta-llama/llama-3.3-70b-instruct:free`. Begge videresendes via OpenRouter og omfattes af SCC.
- **Data minimization:** Per-tenant opt-in (`HermesAgent.dataAccessEnabled`, default false) for Hermes chat; dokument-upload opt-in for knowledge-RAG; VLM kaldes kun ved low OCR-confidence — jf. Bilag 5 (DATABEHANDLERAFTALE.md) afsnit 6.1–6.3.
- **Henvisning i LEVERANDØERSTYRING:** Bilag 8, afsnit 3.7 (samlet sektion for OpenRouter dækker alle AI-funktioner).

### Bilag 18 — Databehandleraftale med Simply A/S / Brevo SAS
- **Parter:** AlphaAi Consult ApS — Simply A/S (DK) / Brevo SAS (FR)
- **Formål:** Transaktions-emails (e-mail-verifikation, password-reset, invitationer, faktura-emails)
- **Datakategorier:** Modtager-e-mail, e-mail-indhold (verifikationslinks, invitationslinks, faktura-PDF-vedhæftninger)
- **Behandlingslokation:** Danmark / Frankrig (EU)
- **DPA-status:** Underskrevet. Kilde: Brevo DPA — vedhæftes som PDF ved indsendelse.
- **SCC-status:** Ikke relevant (EU-baseret).
- **Henvisning i LEVERANDØERSTYRING:** Bilag 8, afsnit 3.10.

---

## 4. Myndigheder (ikke underbehandlere)

Følgende myndigheder modtager data i forbindelse med lovpligtige indberetninger. De er **ikke** underbehandlere og indgår ikke i bilag 13–18:

| Modtager | Formål | Lovgrundlag |
|---|---|---|
| Skattestyrelsen (Moms-API) | Indsendelse af momsangivelse (kun moms) | Lov om merværdiafgift; jf. Bilag 2 afsnit 2.1 |
| Erhvervsstyrelsen (VIRK/CVR) | CVR-opslag til validering og auto-udfyldning | Bekendtgørelse om CVR |

---

## 5. Implementerede, men ikke-aktive integrationer

Følgende integrationer findes i koden, men er **ikke aktive i produktion** og udveksler derfor ikke persondata. Der er ikke indgået DPA, da der ikke er nogen databehandling:

| Integration | Status | Bemærkning |
|---|---|---|
| Bank-API'er (Nordea, Danske Bank, Jyske Bank) | Stub (implementeret, ikke aktiv) | `src/lib/bank-providers.ts` — returnerer fejl. Aktivering kræver reel PSD2-aftale pr. bank + DPA. |
| Tink (bank) | Reel implementering | Aktiv når `TINK_CLIENT_ID`/`TINK_CLIENT_SECRET` er sat. DPA med Tink indgås før aktivering. |
| z-ai-web-dev-sdk (AI-bankafstemning) | Sandbox-only | Fejler graceful i produktion — ingen reelt databehandling. |

> Ved aktivering af Tink eller reelle bank-API'er indgås der DPA, og bilagslisten opdateres tilsvarende. Se Bilag 10 (UDBEDRINGSPLAN) for status.

---

## 6. Underskrift

| Rolle | Navn | Dato | Underskrift |
|---|---|---|---|
| Dataansvarlig (AlphaAi Consult ApS) | _[udfyldes ved indsendelse]_ | _[dato]_ | _[underskrift]_ |

---

*Bilagsoversigten opdateres, når nye underbehandlere tilknyttes eller DPA'er fornyes. Ændringer versionsstyres i git sammen med resten af dokumentationen.*
