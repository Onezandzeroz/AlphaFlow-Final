# AlphaFlow — Brugsvejledning

**Version 3.1 — 2026**

> Komplet brugermanual for AlphaFlow, den danskudviklede cloud-baserede bogføringsplatform til små og mellemstore virksomheder. Udviklet af AlphaAi Consult ApS til overholdelse af Lov om bogføring (LOV nr. 700 af 24. maj 2022), BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen), BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen) og GDPR.

Denne brugsvejledning beskriver **kun** funktioner, der faktisk findes i AlphaFlows kodebase. Hvor en funktion er begrænset eller ikke tilgængelig, markeres det eksplicit.

---

## Indhold

1. [Introduktion](#1-introduktion)
2. [Kom i gang](#2-kom-i-gang)
3. [Navigation & layout](#3-navigation--layout)
4. [Roller & adgang](#4-roller--adgang)
5. [Bogføring](#5-bogføring)
6. [Fakturering](#6-fakturering)
7. [Kontakter](#7-kontakter)
8. [Bank](#8-bank)
9. [Moms & SKAT](#9-moms--skat)
10. [Rapporter](#10-rapporter)
11. [Dokument-OCR & scanning](#11-dokument-ocr--scanning)
12. [Projekter](#12-projekter)
13. [AI-assistenten Hermes](#13-ai-assistenten-hermes)
14. [Backup & gendannelse](#14-backup--gendannelse)
15. [Eksport & GDPR](#15-eksport--gdpr)
16. [Indstillinger](#16-indstillinger)
17. [Revisionslog & oversight](#17-revisionslog--oversight)
18. [Fejlfinding & support](#18-fejlfinding--support)

---

## 1. Introduktion

### Hvad er AlphaFlow?

AlphaFlow er en cloud-baseret (SaaS) dansk bogføringsplatform med dobbelt bogføring, fakturering, momsangivelse, e-fakturering (NemHandel/Peppol), en AI-assistent (Hermes), dokument-OCR og rapportering. Platformen er bygget til overholdelse af Bogføringslovens krav til fortløbende bilagsnummerering, periodelåsning, uforanderlig revisionslog og 5-års opbevaring.

AlphaFlow er **multi-tenant**: din virksomheds data er fuldt adskilt fra andre kunders data, og adgangen styres af rollebaseret adgangskontrol (RBAC) pr. virksomhed.

### Hvem er det til?

| Målgruppe | Beskrivelse |
|-----------|-------------|
| **Virksomhedsejer** | Ejer af én eller flere små/mellemstore danske virksomheder, der ønsker cloud-baseret bogføring |
| **Bogholder** | Intern eller ekstern bogholder, der bogfører, opretter fakturaer og afslutter perioder |
| **Revisor** | Ekstern revisor med læseadgang til rapporter, hovedbog og SAF-T eksport |
| **Teammedlemmer** | Andre medarbejdere, der har brug for læse- eller skriveadgang til specifikke funktioner |

### Tekniske krav

| Komponent | Krav |
|-----------|------|
| Browser | moderne browser (Chrome, Edge, Firefox, Safari) med JavaScript aktiveret |
| Internetforbindelse | påkrævet for bogføring (offline er kun læsetilstand) |
| Skærm | responsivt fra mobil (≥360 px) til desktop (≥1280 px) |
| PWA | kan installeres som app på desktop og mobil (se afsnit 3) |
| Kamera | valgfrit — anvendes til kvitteringsscanning (mobil) |
| MitID/Bank-ID | **ikke påkrævet** — autentificering sker via e-mail + adgangskode + valgfri TOTP-2FA |

### Abonnementsplaner (korte)

| Plan | Pris | Binding | Sæder | Nøglefunktioner |
|------|------|---------|-------|-----------------|
| Gratis | 0 kr./md. | Ingen | 1 | Basisbogføring, manuel OIOUBL, demo-bank |
| Månedlig | 199 kr./md. | Ingen | 3 | Bankintegration (Demo + Tink), avancerede rapporter, dataeksport, iXBRL |
| Pro (årlig) | 169 kr./md. | 12 md. | 5 | Alt i Månedlig + Hermes AI |
| Business (2-årig) | 149 kr./md. | 24 md. | Ubegrænset | Alt i Pro + auto e-faktura |
| Business Extended (3-årig) | 145 kr./md. | 36 md. | Ubegrænset | Alt i Business + projektregnskab |

Detaljer om funktioner pr. plan findes i afsnit 16. Alle nye brugere får 60 dages gratis prøveperiode.

---

## 2. Kom i gang

### 2.1 Registrering

1. Gå til **alphaflow.dk** og klik på **Log ind** → fanen **Opret konto** (eller brug et direkte link `/login?mode=register`).
2. Udfyld formularen:

   | Felt | Krav |
   |------|------|
   | Virksomhedsnavn | valgfrit (kan udfyldes senere) |
   | E-mailadresse | gyldig e-mail — bliver brugerkontonavn |
   | Adgangskode | min. 6 tegn |
   | Bekræft adgangskode | skal matche |

3. Klik på **Opret konto**. Du modtager en bekræftelsesmail inden for få minutter.
4. Tjek evt. spam-filter, hvis mailen ikke fremgår af indbakken.

> Adgangskoder gemmes bcrypt-hashede med 12 salt-runder.

### 2.2 E-mail-verifikation

Du skal bekræfte din e-mailadresse, før du kan logge ind:

1. Åbn bekræftelsesmailen fra AlphaAi Consult ApS.
2. Klik på bekræftelseslinket. Linket har formen `?verify=TOKEN`.
3. Browseren åbner AlphaFlow og viser en bekræftelsesskærm.
4. Du kan nu logge ind.

Hvis du ikke har modtaget mailen, kan du klikke **Send bekræftelses-e-mail igen** fra loginskærmen (rate-limiteret til 1 forsøg pr. minut). En persistent banner i appen minder dig om at bekræfte e-mailen, hvis du alligevel kommer ind.

### 2.3 Login

1. Gå til `/login`.
2. Indtast e-mail og adgangskode. Sæt hak i **Husk mig**, hvis du vil have længere levetid på sessionen.
3. Klik på **Log ind**.

Sessionen gemmes i en HTTP-only, secure, SameSite=Lax cookie med 7 dages sliding-udløb. Hvis 2FA er aktiveret for din konto, vises et ekstra trin (se nedenfor).

Glemt adgangskode? Klik på **Glemt adgangskode?** → indtast e-mail → du modtager et reset-link, der er gyldigt i en kort periode. Af hensyn til anti-enumeration viser systemet altid samme bekræftelsesbesked, uanset om e-mailen findes.

### 2.4 2-faktor-autentificering (2FA)

AlphaFlow understøtter TOTP-baseret 2FA (RFC 6238) via autentificerings-apps som Google Authenticator, Authy eller Microsoft Authenticator. **MitID/Bank-ID er ikke understøttet.**

**Opsætning (4 trin):**

1. Gå til **Indstillinger → Adgang → Set up 2FA**.
2. Trin 1: Klik på **Start opsætning**.
3. Trin 2: Scan QR-koden med din TOTP-app (eller indtast den manuelt som `otpauth://`-URL). Hemmeligheden er AES-256-GCM-krypteret i databasen.
4. Trin 3: Indtast den 6-cifrede kode fra din app.
5. Trin 4: Gem de **10 backup-koder**, der vises, på et sikkert sted (download eller kopiér). Koderne vises kun én gang.

**Login med 2FA:**

1. Indtast e-mail og adgangskode.
2. Hvis serveren svarer `requiresTwoFactor=true`, vises en 6-cifret OTP-prompt.
3. Indtast koden fra din TOTP-app. Hvis du ikke har adgang til appen, kan du bruge en af dine 10 backup-koder (8-cifret format).
4. Koden sendes til `/api/auth/2fa/verify-login`.

> **Vigtigt:** Mistede du både TOTP-app og backup-koder, kan kontoen ikke gendannes uden hjælp fra App Ejer. Opbevar backup-koderne adskilt fra din adgangskode.

### 2.5 Oprettelse af første virksomhed

Når du er logget ind første gang, vises en onboarding-wizard. Antallet af trin afhænger af din plan (2 eller 3):

| Trin | Vises for | Formål |
|------|-----------|--------|
| 1. Virksomhedsoplysninger | Alle | Indtast CVR, navn, adresse, bank |
| 2. Kontoplan | Alle | Opret FSR-baseret standardkonti |
| 3. eLevering / eFaktura | Kun Business+ (AUTO_EINVOICE-feature) | Konfigurer Storecove + Peppol/NemHandel |

Hvert trin har baggrundsillustration, ikon og "udført"-status, der synkroniseres på tværs af enheder. Når alle trin er gennemført, vises en **OnboardingCompleteOverlay** (mobil: cirkel+checkmark-animation, desktop: inline kort).

### 2.6 CVR-auto-udfyld

Når du indtaster et CVR-nummer i virksomheds- eller kontaktformularen, kan du klikke på **Verificér CVR**:

1. Systemet slår CVR-nummeret op i Det Centrale Virksomhedsregister (VIRK Elasticsearch) via `/api/cvr/lookup`.
2. Navn, adresse og virksomhedstype auto-udfyldes.
3. Resultatet cachelagres i din browsers `localStorage` i 24 timer for hurtigere gentagne opslag.

> **Begrænsning:** CVR-opslag kører mod den officielle VIRK-tjeneste, når `CVR_SIMULATION_MODE=false`. I simulationstilstand returneres testdata. Feltet kræver 8-cifret CVR med korrekt Mod-11-tjek.

### 2.7 Vælg abonnement (første login)

Første gang du logger ind, vises en **SubscriptionPlansPrompt**-modal (kun hvis du ikke har valgt en plan). Vælg en plan, og du videresendes til Frisbii/Flatpay-betaling (eller en mock-checkout i udviklingsmiljøet). Efter betaling vises en PaymentResultOverlay med velkomstkort.

Du kan også tilgå abonnementsvalg senere fra dashboard-widgetten **SubscriptionPlansWidget** eller Indstillinger → Adgang.

---

## 3. Navigation & layout

AlphaFlows applikation er en Next.js 16 PWA med en enkelt-page applikationsstruktur. Alle interne ruter (`/dashboard`, `/invoices`, `/accounts`, osv.) serveres fra samme komponent, som holder `currentView`-state og synkroniserer med browserens History API. URL-tilbage-knap virker derfor som forventet.

### 3.1 Sidebjælke (sidebar)

På desktop vises en fast sidebjælke med 5 accordion-sektioner:

| Sektion | Indhold |
|---------|---------|
| **Daglig Drift** | Dashboard, Køb & Kvittering, Salg & Faktura, Kontakter |
| **Bogføring** | Kontoplan, Finansjournal, Hovedbog, Tilbagevendende posteringer |
| **Regnskab** | Rapporter, Aldersopdeling, Likviditet, Budget, Projekter |
| **Afslutning & Compliance** | Regnskabsperioder, Bankafstemning, Eksport, Backup, Revisionslog, Moms & Årsregnskab |
| **Indstillinger** | Indstillinger, Virksomhed, eLevering, Hermes Oversight |

Sidebjælkens accordion-tilstand (hvilke sektioner er udvidet) gemmes pr. bruger og synkroniseres på tværs af enheder.

Øverst i sidebjælken findes:

- **Virksomheds-vælger** (`company-selector`) — skift mellem virksomheder, du er medlem af. Viser App Owner-badge og Demo-badge hvor relevant.
- **Tema-toggle** (Sol/Måne)
- **Sprog-toggle** (DA/EN)
- **Klokke-ikon** (notifikationscenter, se afsnit 3.7)

Nogle menupunkter er **feature-gated** efter dit abonnement (se afsnit 16):

| Menupunkt | Krævet feature | Min. plan |
|-----------|----------------|-----------|
| Projekter | `PROJECT_ACCOUNTING` | Business Extended |
| Aldersopdeling + Likviditet | `ADVANCED_REPORTS` | Månedlig |
| Moms & Årsregnskab (iXBRL) | `ANNUAL_REPORT_IXBRL` | Månedlig |
| Eksport | `DATA_EXPORT` | Månedlig |
| Hermes Oversight | `isSuperDev` | App Ejer |

### 3.2 Dashboard

Dashboardet er dit finansielle kommandocenter. Det viser widgets i et **masonry-layout** (3 kolonner på stor desktop, 2 på tablet, 1 på mobil). Widgets er organiseret i 3 sektioner med i alt **27 widgets**:

| Sektion | Antal | Indhold |
|---------|-------|---------|
| **Indikatorer** | 12 | Omsætning, Driftsresultat, Udgående/Indgående moms, Likviditetsoversigt, Resultat & Likviditet, Omsætnings-/Udgifts-/Nettoprofit-ændring, Økonomisk Sundhed, Hurtige Handlinger |
| **Diagrammer** | 7 | Indtægter vs Omkostninger, Netto resultat pr. måned, Resultatopgørelse (vandfald), Likviditetsprognose, Omsætning vs Omkostninger (detaljeret), Udgiftsanalyse, Projektresultat |
| **Detaljer** | 8 | Seneste aktivitet, Mest aktive konti, Fakturaoversigt, Budget vs faktisk, Seneste journalposter, SAF-T eksport, AI-kategorisering, Aktive projekter |

**Tilpasning af layout:**

1. Klik på **Tilpas widgets** (øverst til højre på dashboard).
2. Widget-layout-editoren åbnes i en dialog.
3. Træk widgets mellem kolonner med grip-handles.
4. Slå widgets til/fra med øje-ikonet.
5. Sæt farve-tags pr. widget.
6. Klik på **Nulstil** for at gendanne standardlayout.

Layoutet gemmes via `/api/widget-settings` og synkroniseres på tværs af enheder.

**Datofiltrering:** Brug datofilteret øverst på dashboardet (denne måned, sidste måned, dette kvartal, i år, sidste år eller brugerdefineret).

**Tom-tilstand:** Hvis der endnu ikke findes dobbelt-bogføringsdata, vises onboarding-guiden i stedet for widgets.

### 3.3 Kommandopalette (⌘K)

Åbn kommandopaletten med **⌘K** (Mac) eller **Ctrl+K** (Windows/Linux). Paletten er en søgbar liste over alle de samme views, der findes i sidebjælken, og lader dig navigere hurtigt med tastaturet.

### 3.4 Tastaturgenveje

Tryk på **?** for at åbne modalen med tastaturgenveje. Aktive genveje:

| Genvej | Handling |
|--------|----------|
| `⌘/Ctrl + K` | Åbn kommandopalette |
| `?` | Vis tastaturgenveje |
| `Alt + ←` / `Alt + →` | Tilbage / frem i historik |
| `Alt + N` | Opret ny postering (køb) |
| `Alt + I` | Gå til Salg & Faktura |
| `Alt + R` | Gå til Rapporter |
| `Alt + V` | Gå til Moms & Årsregnskab |
| `Esc` | Luk åben overlay/dialog |

### 3.5 Mørkt tema

AlphaFlow understøtter tre tema-tilstande via `next-themes`:

1. Gå til **Indstillinger → Appearance** (eller brug tema-knappen i sidebjælken).
2. Vælg **Lyst**, **Mørkt** eller **System** (følger operativsystemets indstilling).
3. Valget gemmes i `localStorage.theme` og synkroniseres til serveren.

> **Bemærkning:** De offentlige marketingsider (`/`, `/features`, `/pricing`, `/about`, `/faq`, `/contact`) er låst til lyst tema for konsistent brand-oplevelse.

### 3.6 Sprog (DA/EN)

AlphaFlow er flersproget (dansk/engelsk). Skift sprog via sprog-toggle i sidebjælken eller **Indstillinger → Appearance**. Sprogvalget gemmes via `useLanguageStore` (zustand+persist).

- UI-tekster skifter pr. sprog.
- Regnskabsdata forbliver altid på dansk (compliance-krav).
- Dokument-titel skifter pr. sprog.
- Standard er `da`.

### 3.7 Notifikationscenter

Klik på klokke-ikonet i sidebjælken for at åbne notifikationscenteret. Her ser du ulæste påmindelser:

- Forfaldne fakturaer
- Kommende momsfrister
- Bankafstemningspåmindelser (ikke-afstemte banktransaktioner)
- Kladder, der afventer bogføring
- Seneste journalposter

Klik på **Markér alle som læst** for at rydde listen.

### 3.8 Realtidssynkronisering

AlphaFlow bruger Socket.IO (port 3001) til at synkronisere data i realtid mellem enheder:

- Når du opretter eller ændrer data på én enhed, opdateres alle andre åbne faner automatisk.
- Synkroniseringen er pr. virksomhed (tenant-rum) — kun relevante opdateringer sendes.
- Forbindelsesstatus (connect/disconnect) vises i Hermes-panelet.

### 3.9 PWA-installation

AlphaFlow er en Progressive Web App og kan installeres som en app på både desktop og mobil — uden en app-butik:

**Desktop (Chrome/Edge):**

1. Besøg alphaflow.dk i Chrome eller Edge.
2. Klik på installations-ikonet i adresselinjen, eller klik på **Installér** i PwaInstallBanner, der vises i appen.
3. Appen åbnes i sit eget vindue.

**Android (Chrome):**

1. Besøg alphaflow.dk i Chrome.
2. Tryk på menuen (tre prikker) → **Tilføj til startskærm**, eller brug MobileInstallPrompt.
3. Bekræft installationen.

**iOS (Safari):**

1. Besøg alphaflow.dk i Safari.
2. Tryk på del-ikonet (firkant med pil).
3. Vælg **Tilføj til startskærm**.

Service-worker version `alphaai-v4`. Efter installationen kan AlphaFlow bede om kameratilladelse til kvitteringsscanning (PostInstallCameraPrompt).

### 3.10 Mobil-navigation

På små skærmer vises:

- **MobileBottomNav** — 4 faste tabs: Dashboard, Køb & Kvittering, Salg & Faktura, Rapporter.
- **MobileFab** — animeret "+"-knap nederst centreret, der åbner en sheet med 4 hurtige handlinger:
  1. Scan bilag
  2. Opret faktura
  3. Opret kontakt
  4. Opret postering
- **Swipe-navigation** mellem views (stryg venstre/højre).
- **OfflineNotice** — toast, når forbindelsen mistes/genoprettes. Offline-tilstand er læse-kun: du kan se tidligere indlæste data, men ikke oprette eller ændre.

### 3.11 Draft-gendannelse (auto-gem)

Mange formularer (f.eks. journalposter, transaktioner, fakturaer) auto-gemmes pr. tenant via `useDraftSync`. Hvis du mister forbindelsen eller navigerer væk, kan du genoptage dit udkast:

- En **DraftRecoveryBanner** vises i Indstillinger, når du har gemte kladder.
- Hvert udkast udløber automatisk efter 30 minutter.
- Du kan slette individuelle klapper eller alle på én gang.

### 3.12 Vigtige URL-parametre

| Parameter | Handling |
|-----------|----------|
| `?mode=register` | Åbn registeringsformularen direkte |
| `?verify=TOKEN` | Bekræft e-mailadresse |
| `?token=TOKEN` eller `?reset=TOKEN` | Nulstil adgangskode |
| `/reset-password?token=TOKEN` | Nulstil adgangskode (egen sti) |
| `?invite=TOKEN` | Accepter invitation til en virksomhed (auto-accept hvis logget ind) |
| `?payment=success\|failed\|pending\|cancelled\|error` | Feedback efter Frisbii/Flatpay-betaling |

---

## 4. Roller & adgang

AlphaFlow har 5 roller med faldende rettigheder, plus en særlig App Ejer-rolle. Roller og tilladelser er defineret i `src/lib/rbac.ts`.

### 4.1 Rolle-hierarki

| Rolle | Niveau | Kan se data | Kan bogføre | Kan administrere | Kan slette virksomhed |
|-------|--------|-------------|-------------|-------------------|----------------------|
| **OWNER (Ejer)** | 5 (højeste) | Ja | Ja | Ja (alt) | Ja |
| **ADMIN (Administrator)** | 4 | Ja | Ja | Ja (firma-indstillinger, medlemmer, bank, backup) | Nej |
| **ACCOUNTANT (Bogholder)** | 3 | Ja | Ja (opret/rediger/annuller posteringer, fakturaer, journal, luk perioder) | Nej | Nej |
| **VIEWER (Seer)** | 2 | Ja | Nej | Nej | Nej |
| **AUDITOR (Revisor)** | 1 | Ja (viser lilla "revisor"-badge) | Nej | Nej | Nej |

Der er **23 granulære tilladelser** fordelt på 7 kategorier (virksomhed, medlemmer, data, rapporter, perioder, bank og backup). Hver permission har en minimums-rolle (`PERMISSION_MIN_ROLE` i `src/lib/rbac.ts`).

### 4.2 App Ejer (SuperDev)

`isSuperDev=true`-brugere har særlige rettigheder på tværs af alle tenants:

- Cross-tenant read-only **oversight-mode** (se afsnit 17).
- Kan forfremme sig selv til App Owner for en bestemt virksomhed.
- Viser "App Owner"-badge (amber gradient med Shield-ikon) i sidebjælken.

### 4.3 UI-implikationer

Mutation-knapper (Opret, Rediger, Slet, Annuller) skjules automatisk, hvis du ikke har rettigheden.

I **oversight-mode** (SuperDev inspicerer en tenant) bliver alle mutationsknapper skjult, og et banner viser "Overvåger: X — Skrivebeskyttet tilstand".

I **demo-mode** (ikke-SuperDev på demo-virksomhed) blokeres alle writes, og banner viser "Demo-virksomhed — Skrivebeskyttet". SuperDev på demo-virksomhed kan redigere (banner: "AppOwner-redigering").

### 4.4 Invitation af team-medlemmer

1. Gå til **Indstillinger → Team**.
2. Klik på **Inviter medlem**.
3. Udfyld: e-mailadresse, rolle (OWNER/ADMIN/ACCOUNTANT/VIEWER/AUDITOR), udløbsdato.
4. Klik på **Send invitation**.

Modtageren får en invitation pr. e-mail. Hvis modtageren allerede er logget ind og klikker invitation-linket (`?invite=TOKEN`), accepteres invitationen automatisk. Hvis ikke, gemmes token og vises efter login.

Invitations-status: PENDING / ACCEPTED / EXPIRED. Du kan tilbagekalde ventende invitationer og fjerne medlemmer. Kun OWNER kan skifte andre medlemmers roller.

> **Sæde-begrænsning:** Antallet af team-medlemmer afhænger af din plan: Gratis (1), Månedlig (3), Pro (5), Business/Extended (ubegrænset).

### 4.5 Tenant-wide 2FA-krav

Virksomhedsejere og administratorer kan kræve 2FA for alle medlemmer:

1. Gå til **Indstillinger → Team**.
2. Aktivér **Kræv 2FA for alle medlemmer** (`TenantTwoFactorToggle`).
3. Systemet kontrollerer, at alle medlemmer har 2FA aktiveret.
4. Medlemmer uden 2FA skal aktivere det ved næste login.

> Når tenant-2FA er aktiveret, kan individuelle brugere ikke deaktivere deres egen 2FA. Kun OWNER og ADMIN kan slå tenant-kravet fra.

### 4.6 Kontosletning

I overensstemmelse med Bogføringsloven §10-12 og GDPR Art. 17(3)(c) kan en brugerkonto **deaktiveres**, men ikke slettes permanent. Bogføringslovens 5-års opbevaringspligt har forrang over GDPR's ret til sletning.

Klik på **Slet konto**-ikonet (Trash2) i sidebjælken → bekræft i AlertDialog → `DELETE /api/auth/delete-account`.

---

## 5. Bogføring

### 5.1 Kontoplan (FSR-baseret)

Når du opretter en virksomhed, opretter AlphaFlow automatisk en FSR-baseret standard dansk kontoplan fordelt på:

| Kontonummer | Gruppe | Eksempler |
|-------------|--------|-----------|
| 1xxx | **Aktiver** | Kasse (1000), Bankkonto (1100), Tilgodehavender (1200), Varelager (1300), IT-udstyr (1800) |
| 2xxx | **Passiver (gæld)** | Leverandørgæld (2000), Momsgæld (2200), Personalegæld (2400), Banklån (2600) |
| 3xxx | **Egenkapital** | Aktiekapital (3000), Reserver (3200), Årets resultat (3300), Overført resultat (3400) |
| 4xxx–5xxx | **Indtægter & moms** | Salg af varer (4000), Tjenesteydelser (4100), EU-salg (4200), Eksport (4300), Udgående moms (4510/4520), Indgående moms (5410/5420) |
| 6xxx–9xxx | **Omkostninger** | Vareforbrug (6000), Lønninger (7000), Husleje (8000), Renteomkostninger (9100) |

Gå til **Kontoplan** i sidebjælken (`/accounts`) for at se, oprette, redigere og deaktivere konti. Sidekomponenten `ChartOfAccountsPage` indeholder:

- Søgning, type-filter, collapsible grupper.
- Opret/rediger/slet-konti (med write-access-guard — systemkonti kan kun deaktiveres, ikke slettes).
- **VATMappingPanel** — interne momskoder → offentlige SKAT-koder.
- **StandardMappingPanel** — kobler dine konti til FSR-standardkonti (til SAF-T eksport).
- **PostingGuideAssistant** — søgbar dansk konteringsvejledning.

### 5.2 Finansjournal (dobbelt bogføring)

Den finansielle journal (`/journal`) er AlphaFlows kerne-bogføringsmodul. En journalpost består af mindst to linjer — en debet og en kredit — der tilsammen balancerer.

**Oprettelse af journalpost:**

1. Gå til **Journal** i sidebjælken.
2. Klik på **Ny journalpost**.
3. Angiv dato, reference og beskrivelse.
4. Tilføj linjer:
   - Vælg konto pr. linje.
   - Angiv beløb i debet- eller kreditkolonnen.
   - Vælg momskode pr. linje (hvis relevant).
   - Tilknyt et projekt via projekt-selector (hvis projekt-tilstand er aktiv).
5. Sørg for, at sum(debet) = sum(kredit). Systemet validerer automatisk balance, før du kan gemme.
6. Klik på **Gem som kladde** eller **Bogfør**.

Journal-formularen auto-gemmer via `useDraftSync` og advarer ved navigation væk (`useWarnOnUnsaved`).

### 5.3 Bilagsnummerering (journalPrefix)

I overensstemmelse med Bogføringsloven forsynes hver journalpost automatisk med et fortløbende bilagsnummer. Formatet bestemmes af:

- `Company.journalPrefix` — standard præfiks er `"BIL"`.
- `Company.nextJournalSequence` — fortløbende tæller, der inkrementeres pr. post.

Du kan ændre præfikset i **Indstillinger → Virksomhed**. Tælleren kan ikke nulstilles (compliance-krav om fortløbende nummerering).

### 5.4 Hovedbog

Gå til **Hovedbog** i sidebjælken (`/ledger`) for at se samlede debit/kredit/saldo pr. konto, filtreret på år. Eksportér til CSV for videre behandling.

### 5.5 Manuelle posteringer (Køb & Kvittering)

Under **Køb & Kvittering** (`/transactions`) opretter du indkøb, udgifter og kvitteringer. Siden har 3 faner:

| Fane | Indhold |
|------|---------|
| Alle posteringer | Alle købstransaktioner med filter, søgning, sortering, paginering |
| Tilbagevendende posteringer | Se afsnit 5.7 |
| E-faktura Indbakke | Modtagne e-fakturaer (se afsnit 6.6) |

**Oprettelse af køb/postering:**

1. Klik på **Tilføj køb** (eller brug MobileFab → "Opret postering").
2. Udfyld:

   | Felt | Beskrivelse |
   |------|-------------|
   | Dato | Transaktionsdato |
   | Beskrivelse | Tekstlig beskrivelse af købet |
   | Udgifskonto | Vælg konto (grupperet: Vareforbrug 6000–6999, Personale 7000–7999, Drift 8000–8999, Finansielle 9000–9400, Skat 9500) |
   | Valuta | DKK, EUR, USD, GBP, SEK eller NOK (valutakurs-konvertering til DKK sker server-side) |
   | Moms% | Vælg momssats |
   | Kvitteringsvedhæftning | Upload fil eller brug kamera |
   | Linje-items | Description, antal, enhedspris, moms%, konto pr. linje |
   | Projekt | Tilknyt et projekt (valgfrit) |
   | Tilbagevendende | Aktivér for at gentage posteringen |

3. Systemet beregner automatisk sub-total, moms og total.
4. Klik på **Gem**.

**AI-kategorisering:** Når du indtaster en beskrivelse, kan et **CategorizationBadge** (✨-ikon) foreslå en konto baseret på danske nøgleord via `/api/ai-categorize`. Klik på badget for at anvende forslaget.

> **Bemærkning om valuta:** Multi-currency er delvist understøttet — du kan vælge valuta pr. transaktion, men der er ingen UI til manuel indtastning af valutakurs. Konvertering sker automatisk server-side.

### 5.6 Transaktionstyper

Posteringer kan have følgende typer (defineret via `TransactionType`-enum):

| Type | Beskrivelse |
|------|-------------|
| SALE | Salg |
| PURCHASE | Indkøb |
| SALARY | Løn (kun enum-værdi — **intet dedikeret lønmodul**) |
| BANK | Banktransaktion |
| Z_REPORT | Z-rapport fra kassesystem |
| PRIVATE | Private hævninger |
| ADJUSTMENT | Reguleringer og justeringer |

> **Bemærkning:** AlphaFlow har **ikke** et dedikeret lønmodul. Løn kan bogføres som almindelige journalposter via `SALARY`-typen, men der findes ingen løn-kørsel, e-indkomst-indberetning eller lønartskartotek.

### 5.7 Tilbagevendende posteringer

Tilbagevendende posteringer lader dig automatisere gentagne transaktioner som husleje, forsikringer og abonnementer. Gå til **Køb & Kvittering → Tilbagevendende** (`/recurring`).

**Oprettelse:**

1. Klik på **Ny tilbagevendende post**.
2. Angiv navn, beskrivelse, frekvens (DAILY / WEEKLY / MONTHLY / QUARTERLY / YEARLY) og næste eksekveringsdato.
3. Tilføj posterlinjer (debet/kredit) som i en almindelig journalpost.
4. Gem.

> **Backfill:** Hvis `startDate` ligger i fortiden ved oprettelse, opretter systemet automatisk alle missede eksekveringer fra `startDate` til dags dato (backfill i `recurring-entries/route.ts`).

**Håndtering:**

- Tidslinje-visning viser kommende og tidligere eksekveringer.
- Play/pause for at aktivere/deaktivere.
- "Udfør nu" for at gennemtvinge en eksekvering.
- Slet for at fjerne posten permanent.

**Scheduler (`src/lib/recurring-scheduler.ts`):**

- Kører via `node-cron` kl. 06:00 dagligt (`0 6 * * *`, tidszone Europe/Copenhagen).
- **Startup catch-up:** hvis den seneste daglige kørsel var mere end 36 timer siden (`wasRecurringJobMissed`), indhentes den oversete kørsel automatisk ved app-start.
- Retry med eksponentiel backoff (maks. 2 retries, basistid 3s, maks 30s).
- Overlap guard via `runningJobs`-Set forhindrer concurrent kørsler.
- Hver cyklus logges i `CronExecution`-tabellen; `DISABLE_RECURRING_SCHEDULER=true` slår scheduleren fra ved vedligeholdelse.

### 5.8 Regnskabsperioder

AlphaFlow arbejder med regnskabsperioder (måneder). En periode kan være **ÅBEN** eller **LUKKET**.

Gå til **Perioder** i sidebjælken (`/periods`).

| Handling | Krævet rolle |
|----------|--------------|
| Luk periode | ACCOUNTANT+ |
| Genåbn lukket periode | ADMIN+ |

Når en periode er lukket, registreres `lockedAt` og `lockedBy` i databasen. Der kan ikke bogføres nye poster i en lukket periode, før den genåbnes af en ADMIN+.

### 5.9 Årsafslutning

Årsafslutningen samler årets resultat og overfører det til egenkapitalen.

**Via Årsrapport-siden:**

1. Gå til **Moms & Årsregnskab → Årsafslutning** (`/annual-report`).
2. Vælg regnskabsår.
3. Gennemgå P&L og balance for året.
4. Klik på **Årsafslutning**-tabben (`YearEndTab`).
5. Preview af lukke-posteringen vises: overskud → Debet 3300 / Kredit 3400; underskud → Debet 3400 / Kredit 3300.
6. Bekræft balance-kontrol.
7. Klik på **Udfør årsafslutning**.

Systemet opretter en automatisk journalpost, der overfører årets resultat til egenkapitalen. Historik-tabben viser tidligere årsafslutninger.

> **Vigtigt:** Årsafslutningen er en endelig handling. Kontakt din revisor, hvis du er i tvivl om proceduren.

### 5.10 Annullering af poster (soft delete)

I overensstemmelse med Bogføringsloven slettes bogførte poster aldrig fysisk. I stedet annulleres de (soft delete):

1. Find den bogførte post.
2. Klik på **Annuller**.
3. Angiv en årsag (f.eks. "Fejlbogføring — dobbeltkontering").
4. Systemet opretter en modpost, der neutraliserer den oprindelige post.

Annullerede poster forbliver synlige i revisionsloggen med dato, bruger og årsag. Dette opfylder Bogføringslovens krav om uigendrkelig dokumentation.

### 5.11 Bilagsvedhæftning

Du kan vedhæfte dokumenter (kvitteringer, fakturaer, kontrakter) til journalposter og transaktioner:

1. Åbn eller opret posten.
2. Klik på **Upload bilag**.
3. Vælg filen (PDF, JPG, PNG — op til 25 MB).
4. Gem.

Fil-upload er sikret med MIME-whitelist, størrelsesgrænse og path-traversal-beskyttelse. Filer servères tenant-scoped (du kan ikke se andre tenants' filer).

---

## 6. Fakturering

AlphaFlows faktureringsmodul (`/invoices`) håndterer salgsfakturaer, e-mail-afsendelse, e-faktura via Peppol/NemHandel/Storecove og modtagelse af e-fakturaer.

### 6.1 Oprette salgsfaktura

1. Gå til **Salg & Faktura** i sidebjælken.
2. Klik på **Ny faktura** (eller brug MobileFab → "Opret faktura").
3. Vælg kunde (Combo-box med eksisterende kontakter eller "ny kunde").
4. Fakturanummeret vises som live preview (auto-genereret baseret på `Company.invoicePrefix` + `nextInvoiceSequence`).
5. Vælg fakturadato og forfaldsdato (Calendar-popover).
6. Tilføj linje-items:

   | Felt | Beskrivelse |
   |------|-------------|
   | Beskrivelse | Tekstlig beskrivelse af varen/ydelsen |
   | Antal | Antal enheder |
   | Enhedspris | Pris pr. enhed ekskl. moms |
   | Moms% | Vælg momssats (25/12/0) |
   | Konto | Konteringskonto (valgfrit) |
   | Beløb | Beregnes automatisk (antal × enhedspris) |

7. Systemet beregner automatisk sub-total, VAT og total.
8. Tilføj evt. notes/terms (textarea med standardtekst fra virksomhedsindstillinger).
9. Klik på **Gem som kladde**.

> **Ingen varekartotek:** AlphaFlow har ikke et dedikeret vare-/produktkartotek. Linje-items gemmes som JSON direkte på fakturaen. Du kan genskabe tidligere linjer ved at kopiere fra en tidligere faktura.

### 6.2 Fakturastatusser

| Status | Beskrivelse |
|--------|-------------|
| **DRAFT (Kladde)** | Faktura oprettet, ikke sendt. Kan redigeres. |
| **SENT (Sendt)** | Fakturaen er sendt til kunden. |
| **PAID (Betalt)** | Fakturaen er markeret som betalt (med betalingsdato). |
| **CANCELLED (Annulleret)** | Fakturaen er annulleret. Bruges, når en faktura skal trækkes tilbage. |

> **Kreditnotaer:** Kreditnotaer er fuldt implementeret i AlphaFlow. Klik på **Opret kreditnota** i faktura-listen (`invoices-page.tsx`) for at oprette en kreditnota med separat nummerering (`creditNotePrefix` → f.eks. `KRE-2026-0001`), spejlet bogføring (debet/kredit byttet), valgfrit `originalInvoiceId` reference til den oprindelige faktura, PDF-generering (PDF'en viser titlen "KREDITNOTA"), og OIOUBL e-fakturering med type 381 (`oioubl-generator.ts`). Annullering af en faktura opretter en modpostering (`REVERSAL-{invoiceNumber}`) jf. Bogføringsloven §§ 10-12.

### 6.3 PDF og e-mail

Fra faktura-preview-dialogen (klik på en faktura i listen):

- **Download PDF** — genererer en PDF til download.
- **Print** — åbner browserens print-dialog.
- **Send via e-mail** (`SendInvoiceDialog`) — indtast subject og message, se modtager-preview. Fakturaen sendes via SMTP (kræver konfigureret SMTP_HOST).
- **Markér som betalt** (`MarkPaidDialog`) — skift status til PAID med valgfri betalingsdato (`paidDate`); systemet opretter automatisk en kassejournalpost (Debit Bank / Kredit Tilgodehavende).
- **Annuller** — skift status til CANCELLED med årsag. Systemet opretter automatisk en modpostering (`REVERSAL-{invoiceNumber}`), der neutraliserer den oprindelige accrual- og evt. kassejournalpost jf. Bogføringsloven §§ 10-12.
- **Slet** — kun for DRAFT-status.

### 6.4 Send e-faktura (Peppol/NemHandel)

Fra faktura-preview-dialogen klik på **Send e-faktura** (`SendEInvoiceDialog`):

1. Vælg afsendelseskanal:

   | Kanal | Format | Krav |
   |-------|--------|------|
   | NemHandel | OIOUBL 2.1 | Modtager tilmeldt NemHandel |
   | Peppol BIS | Peppol BIS Billing 3.0 (EN 16931) | Modtager tilmeldt Peppol |
   | Storecove | Multi-format (videresender) | Storecove API-nøgle konfigureret |

2. Systemet validerer modtagerens endpoint via Peppol participant lookup (CVR-opslag).
3. Vælg om fakturaen skal sendes automatisk ved finalize.
4. Klik på **Send**.

Fakturaen konverteres til OIOUBL eller Peppol BIS XML og sendes via Storecove access point. Leveringsstatus spores i `EInvoiceSendStatus`-tabellen (channel, format, status SENT/DELIVERED/ACCEPTED/ERROR, retry-count, messageId).

> **Begrænsning:** Auto-e-faktura ved finalize kræver `AUTO_EINVOICE`-feature (Business-abonnement eller derover). Manuel afsendelse fra preview-dialogen er tilgængelig for alle abonnementer.

### 6.5 Leveringsstatus (e-faktura afsendelse)

| Status | Beskrivelse |
|--------|-------------|
| SENT | Sendt til access point |
| DELIVERED | Leveret til modtager |
| ACCEPTED | Modtager har accepteret |
| ERROR | Afsendelse mislykkedes — kan prøves igen |

Hvis en e-faktura fejler, kan du klikke **Prøv igen** for at gentage afsendelsen.

### 6.6 E-faktura Indbakke (modtagne)

Under **Køb & Kvittering → E-faktura Indbakke** (`EInvoiceInbox`) ser du modtagne e-fakturaer fra Peppol/Storecove:

- Filtrer på status, søgning, tabel-visning.
- Klik på en faktura for at se preview med alle detaljer (leverandør, linjer, beløb, moms).
- Upload XML manuelt, hvis du har modtaget en fil uden for platformen.
- Opret indkøbspostering direkte fra den modtagne faktura.
- Slet modtagne fakturaer.

Systemet registrerer automatisk formatet (OIOUBL eller Peppol BIS) baseret på CustomizationID og ProfileID i XML-filen.

### 6.7 Tilbagevendende fakturaer?

AlphaFlow har **ikke** et dedikeret "tilbagevendende fakturaer"-flow som separat funktion. Brug i stedet tilbagevendende posteringer (afsnit 5.7) til at automatisere gentagne salg, eller kopier en eksisterende faktura.

### 6.8 Forfaldne fakturaer

AlphaFlow markerer automatisk forfaldne fakturaer (SENT-status, forfaldsdato < dags dato) med rød indikator i faktura-listen. Du kan se forfaldne fakturaer via notifikationscenteret (afsnit 3.7).

---

## 7. Kontakter

Under **Kontakter** (`/contacts`) håndterer du virksomhedens kunder og leverandører. Kontakter bruges til fakturering, e-faktura og rapportering.

### 7.1 Kontakttyper

| Type | Beskrivelse |
|------|-------------|
| **CUSTOMER (Kunde)** | Kun salgskunde |
| **SUPPLIER (Leverandør)** | Kun leverandør |
| **BOTH (Begge)** | Både kunde og leverandør |

### 7.2 Oprettelse af kontakt

1. Gå til **Kontakter** i sidebjælken.
2. Klik på **Ny kontakt** (eller brug MobileFab → "Opret kontakt").
3. Udfyld:

   | Felt | Beskrivelse |
   |------|-------------|
   | Navn | Firmanavn eller fulde navn |
   | CVR-nummer | 8-cifret CVR (auto-udfyld via CVR-opslag) |
   | E-mail | Bruges til faktura-afsendelse |
   | Telefon | Telefonnummer |
   | Adresse, by, postnummer, land | Postadresse |
   | Type | CUSTOMER, SUPPLIER eller BOTH |
   | Noter | Fritekst-noter |
   | Aktiv/inaktiv | Toggle |

4. Klik på **Gem**.

### 7.3 CVR-opslag

Brug knappen **Verificér CVR** (`CvrVerifyButton`) til automatisk at slå virksomhedsdata op i VIRK-registret. Navn, adresse og virksomhedstype auto-udfyldes. Resultatet cachelagres i `localStorage` i 24 timer.

### 7.4 Søgning og filtrering

- Søg på navn, CVR eller e-mail.
- Filtrer på type (CUSTOMER, SUPPLIER, BOTH).
- Viser oprettelsesdato og link til relaterede fakturaer/posteringer.
- Inaktive konti forbliver synlige i historik men kan ikke vælges ved ny postering.

---

## 8. Bank

AlphaFlows bankmodul (`/bank-recon`) omfatter bank-forbindelser, import af kontoudtog, transaktionsvisning og manuel afstemning.

I produktion er **Demo-provideren** og **Tink** fuldt funktionsdygtige. PSD2-bankforbindelser (Danske Bank, Nordea, Jyske Bank) er tilgængelige i brugerfladen med consent-flow, men de underliggende bank-API-integrationer er stubs i den nuværende version.

### 8.1 Bankforbindelser

Gå til **Bankafstemning → Open Banking** (`OpenBankingSection`).

**Oprettelse af forbindelse (Demo-provider):**

1. Klik på **Tilføj bankforbindelse**.
2. Vælg **Demo** som udbyder for at få simulerede transaktioner til test/demonstration.
3. Bekræft oprettelsen.

**PSD2-forbindelse (Danske Bank, Nordea, Jyske Bank):**

1. Vælg bank fra listen.
2. Start consent-flow — du videresendes til bankens consent-side.
3. Efter godkendelse kaldes callback `/api/bank-connections/[id]/consent`.
4. Synkronisér transaktioner manuelt eller automatisk.
5. Visning af forbindelses-status, sidste sync, accountNumber/IBAN.

> **Bemærkning om MitID:** Consent-flow hos ægte banker ville normalt kræve MitID, men da bank-API-integrationerne er stubs, er der ingen MitID-integration i AlphaFlow i den nuværende version.

**Bankforbindelses-status:**

| Status | Beskrivelse |
|--------|-------------|
| ACTIVE | Forbindelsen er aktiv og kan synkroniseres |
| PENDING | Afventer godkendelse fra bank |
| EXPIRED | Samtykke udløbet — skal fornyes |
| REVOKED | Samtykke tilbagekaldt |
| ERROR | Teknisk fejl |

Bank-tokens (adgangskoder) er AES-256-GCM-krypteret i databasen med `ENCRYPTION_KEY`.

### 8.2 Import af kontoudtog

Alternativt til PSD2-forbindelse kan du importere bankkontoudtog manuelt:

1. Gå til **Bankafstemning**.
2. Klik på **Importér kontoudtog**.
3. Upload en **MT940**-fil fra din bank, eller indtast transaktioner manuelt.

Efter import vises nye banktransaktioner i venstre pane i afstemningsvisningen.

### 8.3 Transaktionsvisning

`TransactionsPage` viser alle transaktioner med:

- Filter på type, moms, dato.
- Søgning, sortering, paginering.
- Eksport pr. række (CSV).

### 8.4 Afstemning — tre-niveau matching

AlphaFlow implementerer AI-assisteret bankafstemning i produktion via OpenRouter (LLM) i `src/lib/matching-engine.ts`. Matching kører i tre niveauer:

1. **Regelbaseret eksakt match** — beløb ±0,01 DKK, dato ±3 dage, reference-tekstlighed.
2. **Fuzzy match** — beløb ±5 DKK, dato ±7 dage, beskrivelses-lighed >70%.
3. **AI-match via OpenRouter** — sender kandidat-par til LLM'en og får konfidens-score (0,00–1,00) tilbage.

**Konfidens-tærskler:**

- **AI-match ≥ 0,95** → autoprogrammeres som `MATCHED` (banklinje kobles automatisk til journalpost).
- **AI-match 0,80–0,95** → markeres `AI_SUGGESTED` og vises i afstemningsvisningen; kræver manuel godkendelse (`Link`).
- **AI-match < 0,80** → ignoreres (forslås ikke).

AI-output overstyrer **aldrig** automatisk bogførte posteringer uden brugergodkendelse.

**Afstemning via to-panes visning:**

1. Gå til **Bankafstemning** (`BankReconciliationPage`).
2. Venstre pane: banktransaktioner.
3. Højre pane: bogførte posteringer.
4. Find en umatchet banklinje (eller en banklinje med `AI_SUGGESTED`-forslag).
5. Klik på **Link** for at koble den med en tilsvarende journalpost.
6. Klik på **Unlink** for at fjerne en kobling.

Du kan også oprette en ny postering direkte fra en umatchet banklinje, hvis der ikke findes en tilsvarende journalpost.

> **Tip:** Marker transaktioner som "ikke bogførte", hvis de endnu ikke har en tilsvarende journalpost. Du kan altid afstemme dem senere.

### 8.5 Oversigt over bank-funktioner

| Funktion | Status |
|----------|--------|
| Demo-bankforbindelse | ✅ Virker |
| PSD2-bankforbindelser (Danske/Nordea/Jyske) | ⚠️ UI findes, integration er stub |
| MT940-import | ✅ Virker |
| Manuel indtastning af transaktioner | ✅ Virker |
| Manuel afstemning (klik "Link") | ✅ Virker |
| AI-assisteret afstemning (OpenRouter, 3-niveau) | ✅ Virker i produktion (≥0,95 auto, 0,80–0,95 forslag) |

---

## 9. Moms & SKAT

AlphaFlow understøtter danske momskoder, momsrapportering og indsendelse af momsangivelse via Skattestyrelsens Moms-API.

### 9.1 Danske momskoder

| Kode | Type | Sats | Konto | Anvendelse |
|------|------|------|-------|------------|
| S25 | Udgående | 25% | 4510 | Standardmoms for de fleste varer og tjenesteydelser |
| S12 | Udgående | 12% | 4520 | Reduceret sats (bl.a. aviser, transport) |
| S0 | Udgående | 0% | — | Undtaget moms (bl.a. eksport, sundhedsvæsen) |
| SEU | Udgående EU | 0% | — | EU-salg uden moms (intracommunity) |
| K25 | Indgående | 25% | 5410 | Indgående standardmoms fra leverandører |
| K12 | Indgående | 12% | 5420 | Indgående reduceret moms |
| K0 | Indgående | 0% | — | Indgående 0% moms |
| KEU | Indgående EU | — | — | EU-køb (intracommunity) |
| KUF | Føringsmoms | — | — | Føringsmoms ved import |
| NONE | Ingen | — | — | Ikke momsfaktureret |

### 9.2 Momsrapport

Gå til **Moms & Årsregnskab → Momsrapport** (eller `/annual-report` med VAT-tab valgt):

1. Vælg periode (måned + år) eller kvartal/årligt.
2. Systemet beregner automatisk:
   - Output-VAT (salgsmoms) pr. momskode.
   - Input-VAT (købsmoms) pr. momskode.
   - Net VAT payable (output − input).
3. Visuel fordeling i pie-charts pr. momssats.
4. Eksportér til CSV eller print.

### 9.3 Indsendelse af momsangivelse via SKAT-API

AlphaFlow integrerer med Skattestyrelsens Moms-API (OAuth2 client_credentials) til automatisk indsendelse af momsangivelse.

> **Bemærkning:** Integrationen omfatter **kun momsangivelse**. Der er **ikke** indberetning af årsopgørelse, e-indkomst, AM-bidrag eller løn via SKAT-API i AlphaFlow.

**Indsendelse:**

1. Gå til **Moms & Årsregnskab → Momsrapport**.
2. Vælg periode og gennemgå beregningen.
3. Klik på **Indberet til Skattestyrelsen**.
4. Systemet sender momsangivelsen via `/api/vat-report/submissions`.
5. Modtag kvittering med reference-ID og indsendelsesdato.

> **Forudsætning:** Moms-API-integrationen kræver, at `SKAT_CLIENT_ID` og `SKAT_CLIENT_SECRET` er konfigureret på serveren, og at virksomheden er tilmeldt TastSelv Erhverv. Hvis API-nøgler mangler, falder integrationen tilbage til en simulation.

### 9.4 VATSubmission-statusser

| Status | Beskrivelse |
|--------|-------------|
| DRAFT | Opgørelse oprettet, ikke indsendt |
| SUBMITTED | Indsendt til Skattestyrelsen |
| ACCEPTED | Accepteret af Skattestyrelsen |
| REJECTED | Afvist — skal rettes og genindsendes |
| ERROR | Teknisk fejl ved indsendelse |

Tidligere momsangivelser vises med reference-ID og indsendelsesdato i "Historik"-tabben under `/annual-report`.

> **Manuel fallback:** Hvis API-integrationen ikke er konfigureret, kan du downloade momsrapporten som CSV/udskrift og indberette manuelt via TastSelv Erhverv.

---

## 10. Rapporter

AlphaFlow tilbyder en række finansielle rapporter, der kan eksporteres til CSV. Hovedparten af rapporterne er tilgængelige på dedicated sider i sidebjælken.

### 10.1 Resultatopgørelse (P&L)

1. Gå til **Rapporter** i sidebjælken (`/reports`).
2. Vælg fanen **Resultatopgørelse**.
3. Vælg periode (år, kvartal, måned eller custom).
4. Se: omsætning, vareforbrug, dækningsbidrag, driftsomkostninger (personale + andre), driftsresultat, finansielle poster, årets resultat.
5. Eksportér som CSV.

### 10.2 Balance

1. Gå til **Rapporter → Balance**.
2. Vælg periode.
3. Se: omsættelsesaktiver (kasse, bank, tilgodehavende, varelager), anlægsaktiver, kort/langfristet gæld, egenkapital.
4. Eksportér som CSV.

### 10.3 Hovedbog (Ledger)

Gå til **Hovedbog** i sidebjælken (`/ledger`). Viser samlede debit/kredit/saldo pr. konto, filtreret på år. Eksportér til CSV.

### 10.4 Likviditet (Cash Flow)

Gå til **Likviditet** i sidebjælken (`/cash-flow`). Pengestrømsopgørelse opdelt i:

- Driftsaktiviteter
- Investeringsaktiviteter
- Finansieringsaktiviteter

Periode-filter, eksport CSV. Dashboardet har også en **Likviditetsprognose**-widget, der viser en 3-måneders prognose baseret på historiske data.

> **Krav:** Likviditet og Aldersopdeling kræver `ADVANCED_REPORTS`-feature (Månedlig+).

### 10.5 Aldersopdeling (Aging)

Gå til **Aldersopdeling** i sidebjælken (`/aging`). Viser tilgodehavender (debitorer) og leverandørgæld (kreditorer) pr. konto opdelt i aldersgrupper:

| Interval | Beskrivelse |
|----------|-------------|
| Current | Ikke forfalden |
| 31–60 dage | Kort forsinkelse |
| 61–90 dage | Middels forsinkelse |
| 91–120 dage | Lang forsinkelse |
| 120+ dage | Alvorlig forsinkelse |

Tab-view, eksport CSV.

### 10.6 Budgetter

Gå til **Budget** i sidebjælken (`/budget`).

**Oprettelse:**

1. Klik på **Nyt budget**.
2. Angiv navn og år.
3. Tilføj budgetlinjer pr. konto med månedlige beløb (januar–december).
4. Gem.

**Budget vs. faktisk:** AlphaFlow beregner automatisk afvigelsen mellem budgetterede og faktiske beløb pr. konto og pr. måned. Viser afvigelse (faktisk − budget) og afvigelse %.

### 10.7 Økonomisk sundhed (Financial Health)

Dashboard-widgetten "Økonomisk Sundhed" beregner en samlet score baseret på:

- Likviditetsgrad
- Overskudsgrad
- Kontantstrømtendens

Scoren vises med farvekoder: 🟢 God, 🟡 Advarsel, 🔴 Kritisk.

### 10.8 SAF-T eksport

SAF-T (Standard Audit File for Tax) — Dansk Finansskema v1.0 — er et standardiseret XML-format, som Erhvervsstyrelsen og Skattestyrelsen kan kræve udleveret ved skattekontrol.

1. Gå til **Eksport** i sidebjælken (`/exports`).
2. Vælg **SAF-T eksport**.
3. Vælg periode (år, kvartal, måned eller custom).
4. Klik på **Generér SAF-T**.
5. Download XML-filen.

Systemet validerer filen før eksport (obligatoriske felter, CVR-format, landekode DK, version 1.0, momssatser).

> **Krav:** Dataeksport (SAF-T) kræver `DATA_EXPORT`-feature (Månedlig+).

### 10.9 Årlig XBRL/CSV-rapport

AlphaFlow kan generere årsrapporten i to formater:

| Format | Endpoint | Brug |
|--------|----------|------|
| XBRL | `/api/reports/annual-xbrl` | Årsrapport til Erhvervsstyrelsen |
| CSV | `/api/reports/annual-csv` | Årsrapport i regnearksformat |

Tilgås fra **Moms & Årsregnskab → Årsrapport**-tabben. Klik på **Download iXBRL** eller **Download CSV**.

> **Krav:** iXBRL-eksport kræver `ANNUAL_REPORT_IXBRL`-feature (Månedlig+).

### 10.10 Andre rapporter og widgets

- **Udgiftsanalyse** (dashboard-widget): Pie-chart pr. kategori + månedlig trend.
- **Projektresultat** (dashboard-widget): Omsætning/udgifter/resultat pr. aktivt projekt.
- **Mest aktive konti** (dashboard-widget): Top konti efter aktivitet.
- **Seneste aktivitet / Seneste journalposter** (dashboard-widgets): Live feed.

> **Ingen rapport-scheduling:** Rapporter genereres on-demand. AlphaFlow har ikke "send ugentlig rapport pr. e-mail"-funktion.

---

## 11. Dokument-OCR & scanning

AlphaFlow har en indbygget dokumentscanner via `scanner-service` (Python/FastAPI, port 3005), der kombinerer Tesseract OCR og VLM via OpenRouter (Vision Language Model) til at udtrække data fra kvitteringer og fakturaer.

### 11.1 Upload kvittering/faktura

1. Åbn en postering (eller klik på MobileFab → "Scan bilag").
2. Klik på **Upload bilag** eller **Scan kvittering**.
3. Vælg en PDF, JPG eller PNG-fil (max 25 MB), eller brug kameraet på mobil.
4. Filen sendes til scanner-servicen til behandling.

### 11.2 Behandlingspipeline

```
Upload/Kamera → Filtype-detektion
  ├─ PDF med tekstlag → Direkte tekstudtrækning (hurtig)
  ├─ PDF uden tekst → Render 300 DPI → VLM-analyse
  └─ Billede → OpenCV-forbedring → Tesseract OCR
       └─ Konfidens lav → VLM fallback
→ Dansk parsing (beløb, dato, CVR, momssats)
→ Validering (CVR Mod-11, IBAN, EAN)
→ Kontoforslag baseret på danske nøgleord
→ Auto-udfyldning af transaktion
```

### 11.3 Automatisk udfyldning

Når et dokument er scannet, udfylder systemet automatisk:

- **Beløb** — Totalbeløb og evt. subtotal
- **Dato** — Transaktionsdato
- **Moms** — Momssats og momsbeløb
- **Leverandør** — Navn og evt. CVR-nummer
- **Kontoforslag** — Foreslået FSR-konto med konfidensniveau

> **Vigtigt:** Scanningsresultater med lav konfidens markeres "Kræver gennemsyn". Gennemgå altid automatiske udsagn, før du bogfører.

### 11.4 Begrænsninger

- Den integrerede Tesseract.js-klient i `ReceiptScanner`-komponenten kan bruges offline i browseren, mens den fulde VLM-pipeline (via OpenRouter) kræver internetforbindelse og aktiv `OPENROUTER_API_KEY` på serveren.
- Scanner-servicen er hosted separat og rutes gennem AlphaFlows API-proxy.
- Billeder af kvitteringer sendes til USA via OpenRouter til VLM-analyse (SCC+TIA påkrævet — se Bilag 13) — se afsnit 13 og GDPR-dokumentationen for detaljer om databehandling.

---

## 12. Projekter

Projektregnskab er et valgfrit modul, der lader dig organisere økonomien pr. projekt med separate budgetter, transaktioner og fakturaer.

> **Krav:** Projektregnskab kræver `PROJECT_ACCOUNTING`-feature (Business Extended-abonnement), medmindre App Ejer har aktiveret det for din virksomhed.

### 12.1 Oprettelse af projekt

1. Gå til **Projekter** i sidebjælken (`/projects`).
2. Klik på **Nyt projekt**.
3. Udfyld:

   | Felt | Beskrivelse |
   |------|-------------|
   | Navn | Projektnavn |
   | Kode | Unik projektkode (auto eller manuel) |
   | Beskrivelse | Valgfri beskrivelse |
   | Farve | 6 prædefinerede farver |
   | Status | ACTIVE / ON_HOLD / COMPLETED / CANCELLED |
   | Startdato | Projektets start |
   | Slutdato | Projektets slut |
   | Budgettotal | Samlet projektbudget |
   | Kunde | Tilknyt en kontakt |

4. Klik på **Gem**.

### 12.2 Projektvisning (Project Mode)

Når du "går ind i" et projekt (via `ProjectSelector` eller detalje-siden), skifter AlphaFlow til **projekt-tilstand**:

- Farvet banner øverst: "Projekt-regnskab: X — alle nye posteringer knyttes automatisk til dette projekt".
- Nogle views skjules eller nedtones via `PROJECT_MODE_HIDDEN_VIEWS` / `PROJECT_MODE_GRAYED_VIEWS`.
- Dato-filtre default'er til projektets start/slut-datoer.
- `ProjectSelector` i forms (AddTransactionForm, JournalEntriesPage) er låst (read-only chip) — nye posteringer knyttes automatisk til projektet.

### 12.3 Projektdetalje

Åbn et projekt for at se 4 tabs:

| Tab | Indhold |
|-----|---------|
| Oversigt | Meta-info, KPI'er (omsætning, udgifter, resultat, budget-forbrug) |
| Posteringer | Tilknyttede transaktioner |
| Budget | Månedlig budget vs faktisk pr. konto (`ProjectBudgetTab`) |
| Fakturaer | Tilknyttede fakturaer |

### 12.4 Begrænsninger

- **Ingen timeregistrering:** Projekter har ikke timer-pr-medlem tracking.
- **Ingen separate projekt-rapporter ud over budget-tab:** Projektresultat-widget på dashboard viser samlet omsætning/udgifter/resultat pr. aktivt projekt.

---

## 13. AI-assistenten Hermes

Hermes er AlphaFlows indbyggete AI-assistent — en chat-baseret hjælperekspert, der kan svare på spørgsmål om dansk regnskab, moms, skat og bogføringsregler.

### 13.0 Vigtige advarsler — læs før aktivering

Før du aktiverer Hermes, skal du som tenant-administrator (OWNER/ADMIN) være opmærksom på følgende:

> ⚠️ **Advarsel 1 — GDPR-relaterede risici (persondata til USA):**
> Når Hermes er aktiveret, sendes dit spørgsmål og — hvis du tilmelder dig data-adgang (se afsnit 13.3) — kontekst om din virksomheds regnskab til AlphaFlows AI-underbehandler **OpenRouter, Inc. (USA)**. OpenRouter videresender til relevante model-udbydere (f.eks. Anthropic, Meta, OpenAI) per GDPR Art. 28(4).
>
> Dette indebærer **overførsel af persondata til et tredjeland (USA)**. AlphaAi Consult ApS har indgået DPA + EU-Standard Contractual Clauses (SCC) + Transfer Impact Assessment (TIA) med OpenRouter (Bilag 13) for at beskytte dine data, men der er en tilbageværende risiko for at amerikanske myndigheder (FISA 702, EO 12333, CLOUD Act) kan kræve adgang. Du accepterer denne risiko ved aktivering.

> ⚠️ **Advarsel 2 — Non-deterministiske processer (usikkerhed ved AI-output):**
> Hermes er baseret på en sprogmodel (LLM). AI-genereret rådgivning er **ikke deterministisk** — det samme spørgsmål kan give forskellige svar, og svar kan indeholde **fejl, unøjagtigheder eller "hallucinationer"** (det vil sige tilsyneladende plausible men forkerte oplysninger). AI-output er **ikke** professionel regnskabsrådgivning og erstatter ikke en revisor eller bogholder.
>
> Du skal **altid** efterprøve Hermes' svar mod gældende lovgivning, SKAT-vejledninger og din egen bogføringspraksis før du agerer på dem. AlphaAi Consult ApS påtager sig **intet ansvar** for økonomiske tab der opstår som følge af at følge Hermes' rådgivning uden uafhængig verificering.

> ⚠️ **Advarsel 3 — Ikke menneskelig rådgivning:**
> Hermes er AI-kun. Der er ingen menneskelig revisor bag Hermes-chat. For endelig rådgivning ved vigtige beslutninger (årsafslutning, komplekse skattespørgsmål, tvivl om kontering) skal du kontakte en autoriseret revisor eller bogholder.

Disse tre advarsler er beskrevet ovenfor og refereres i dataadgangs-beskrivelsen (§13.3). Aktivering, deaktivering og ændring af dataadgangs-indstillingen audit-logges (`action: UPDATE`, `entityType: System`) og kan til enhver tid tilbagekaldes af tenant-administratoren eller SuperDev.

### 13.1 Aktivering

Hermes aktiveres per tenant af Owner/Admin (eller SuperDev for enhver tenant) via en **enable/disable-toggle** i **Indstillinger → Hermes AI** (`HermesSettings`). Aktivering/deaktivering audit-logges med `action: UPDATE`, `entityType: System` i AuditLog (se `src/app/api/hermes/toggle/route.ts`). Hermes forudsætter Pro-abonnement eller derover (`Feature.Hermes` — Pro, Business, Business Extended).

1. Gå til **Indstillinger → Hermes AI** (`HermesSettings`).
2. Aktivér **Hermes AI-assistent**-toggle for din virksomhed.
3. Vælg om Hermes må læse dine virksomhedsdata (data-adgang, se afsnit 13.3) — separat toggle, default `false`.
4. Gem.

Når Hermes er aktiveret, vises en animeret ugle-FAB (svævende knap) i nederste højre hjørne af appen. Klik på ugle-ikonet for at åbne chat-panelet. Ved deaktivering skjules Hermes for alle brugere i tenanten.

### 13.2 Brug af Hermes-chat

1. Klik på Hermes-uglen.
2. Chat-panelet åbnes (Framer Motion-animeret).
3. Skriv dit spørgsmål.
4. Hermes svarer med streaming markdown-rendering (`ReactMarkdown`).
5. Tryk **Enter** for at sende, **Esc** for at lukke panelet.

Panelet viser connect/disconnect-indikator og auto-scroller til seneste besked. Ulæste notifikationer vises med rødt "!"-badge på FAB'en, og "typing"-animation vises, når agenten tænker.

### 13.3 Dataadgang (dataAccessEnabled opt-in)

AlphaFlow har et per-tenant `dataAccessEnabled`-flag, der styrer, hvor meget data Hermes ser:

| Indstilling | Hvad sendes til LLM |
|-------------|---------------------|
| **Deaktiveret (default)** | Kun dit spørgsmål + statisk system-prompt. Ingen tenant-specifikke finansielle data. |
| **Aktiveret** | Dit spørgsmål + kontekst om din virksomheds balance, indtægter, udgifter, momsstatus m.m. for mere præcise svar. |

Dataadgang er frivillig og kan altid deaktiveres i **Indstillinger → Hermes AI**.

> **GDPR-bemærkning:** Når Hermes er aktiveret, sendes dit spørgsmål (og evt. virksomhedsdata ved opt-in) til OpenRouter (USA), som videresender til underliggende LLM-udbydere per GDPR Art. 28(4). Dette er omfattet af Standard Contractual Clauses og Data Processing Agreement — se GDPR-dokumentationen for detaljer. De fulde GDPR-risici, non-determinisme-advarsler og samtykke-krav er beskrevet i afsnit 13.0 ovenfor.

### 13.4 Hermes' kapaciteter

Hermes kan hjælpe med:

- **Momsfrister og beregninger** — hvornår skal moms indberettes?
- **Bogføringsregler** — hvordan bogføres et bestemt køb? Hvilken konto?
- **SKAT-vejledning** — henvisninger til gældende regler og love
- **Årsafslutning** — trin-for-trin vejledning
- **Dansk skatteret** — selskabsskat, fradrag
- **EU-handel** — regler for grænsehandel, intrastat, føringsmoms
- **Regnskabsstandarder** — FRS, IFRS
- **Virksomhedsdata** — (kun med dataadgang) aktuelle tal, momsstatus

### 13.5 Skills-system (SuperDev-styret)

I **Indstillinger → Hermes AI → Skills** (`HermesSkillsAdmin`) kan **App Ejer (SuperDev)** tilvælge færdigheder (skills) globalt på tværs af alle tenants. Tenants har ingen separat skills-UI; hvis de vil vide hvilke skills Hermes har, kan de spørge Hermes direkte.

- Writing
- Compliance
- Analysis
- Productivity

Eksterne skills kan tilføjes via source-URL. Indbyggede skills kan ikke fjernes. Aktiverer/deaktiverer SuperDev en skill, gælder det for alle tenant-virksomheder.

### 13.6 Proaktive påmindelser

Hermes kan sende proaktive påmindelser (via `HermesNotificationCard`):

- Typer: reminder / deadline / info.
- Vises som kort i nederste højre hjørne.
- Auto-dismiss efter 8 sekunder.
- Pålægges med 60 sekunders interval for check.

Typiske påmindelser: momsfrister, årsregnskabsfrister, forfaldne fakturaer.

### 13.7 Videnbase (Knowledge RAG)

Hermes bruger en RAG-videnbase (Retrieval-Augmented Generation) med semantisk søgning via `knowledge-service` (port 3006) og embeddings via OpenRouter (pgvector):

- Indeholder bl.a. dansk regnskabslovgivning, momsregler og Bogføringslovens krav.
- App Ejer (SuperDev) kan administrere videnbasen via `HermesKnowledgeAdmin`: tilføje, redigere, slette dokumenter (title, kategori, indhold, tenant scope).
- Re-index-knap genbygger embeddings.

### 13.8 Rate limiting og personlighed

Hermes er underlagt per-tenant rate limiting i 4 niveauer (`mini-services/hermes-agent/rate-limiter.ts`):

| Vindue | Default grænse |
|--------|----------------|
| Burst (minut) | 10 beskeder/minut |
| Time | 40 beskeder/time |
| Dag | 120 beskeder/dag |
| Måned | 2.000 beskeder/måned |

Grænserne kan konfigureres pr. tenant af App Ejer (SuperDev) i Hermes Oversight (`/hermes-oversight`). Når en grænse nås, vises en meddelelse i chat-panelet.

**Personlighed:** Hermes' personlighed er konfigurerbar per tenant (`HermesAgent.personality`) med værdierne `professional` (default), `friendly` eller `concise`. Vælg i **Indstillinger → Hermes AI**.

### 13.9 Hermes Oversight (SuperDev-only)

SuperDev har adgang til `/hermes-oversight` med:

- Per-tenant Hermes status.
- Rate-limits (burst/time/dag/måned).
- Usage-statistik og samtalehistorik.
- Aktivér/deaktivér Hermes pr. tenant.

---

## 14. Backup & gendannelse

AlphaFlow udfører automatisk krypteret backup af din virksomheds data via node-cron scheduler (process-intern, tidszonen Europe/Copenhagen).

### 14.1 Backup-typer og retention

| Type | Cron | Hyppighed | Retention |
|------|------|-----------|-----------|
| Timebackup | `5 * * * *` | Hver time | Seneste 24 |
| Dagsbackup | `15 2 * * *` | Hver dag kl. 02:15 | Seneste 30 |
| Ugebackup | `30 3 * * 1` | Hver mandag kl. 03:30 | Seneste 52 |
| Månedsbackup | `0 4 1 * *` | 1. i måneden kl. 04:00 | Seneste 60 / **5 år** |
| Oprydning | `0 3 * * *` | Daglig kl. 03:00 | Sletter udløbne |
| Manuel | (on-demand) | Når du klikker | 90 dage |

> **Bogføringsloven §15:** Månedsbackups opbevares i op til 5 år for at opfylde Bogføringslovens opbevaringspligt for regnskabsmateriale.

### 14.2 Format og placering

- Hver backup er en ZIP pr. tenant + `manifest.json` v2 + SHA-256 checksum.
- ZIP-filen er AES-256-GCM-krypteret (`.zip.enc`) med `ENCRYPTION_KEY`.
- Placeres i `Tenant-Backup/{companyName}/` på IONOS VPS (EU/Tyskland).

### 14.3 Manuel backup

1. Gå til **Backup** i sidebjælken (`/backups`).
2. Klik på **Opret backup nu**.
3. Systemet opretter en manuel backup (gemmes i 90 dage).

### 14.4 Download

1. Find den ønskede backup i listen.
2. Klik på **Download**.
3. Den krypterede ZIP-fil (`*.zip.enc`) hentes til din computer.

> **Bemærkning:** Den downloadede backup er krypteret og kan kun dekrypteres af AlphaFlows restore-flow (eller med den korrekte `ENCRYPTION_KEY`). Formålet er primært offline-arkivering.

### 14.5 Gendannelse (restore)

1. Gå til **Backup** i sidebjælken.
2. Klik på **Gendan** ved en eksisterende backup — ELLER klik på **Upload og gendan** for at uploade en `.zip.enc`-fil fra din computer.
3. Bekræft gendannelsen.

> **Pre-restore safety backup:** Før gendannelsen opretter systemet automatisk en sikkerhedskopi af din nuværende data. Hvis gendannelsen mislykkes, rulles ændringerne automatisk tilbage (atomisk gendannelse).

Kun OWNER og ADMIN kan oprette og gendanne backupper.

### 14.6 Robusthed

- `CronExecution`-log i databasen for hver kørsel.
- Startup catch-up: Hvis serveren har været nede, indhentes missede backups.
- Retry 3× med eksponentiel backoff ved fejl.
- Overlap guard forhindrer samtidige backups.
- Neon PITR (Point-in-Time Recovery) op til 7 dage som defense-in-depth lag 1.

### 14.7 Backup-liste-visning

Backup-siden (`BackupPage`) viser:

- Alle backupper (manuelle, automatiske, planlagte).
- SHA-256 checksum pr. fil.
- Filstørrelse.
- Udløbsdato (typisk 60 måneder for månedlige).
- Status (completed / failed).
- Scheduler-status.

---

## 15. Eksport & GDPR

### 15.1 Eksport-side

Gå til **Eksport** i sidebjælken (`/exports`) for at få adgang til alle eksport-muligheder:

| Eksport-type | Format | Beskrivelse |
|--------------|--------|-------------|
| SAF-T | XML (Dansk Finansskema v1.0) | Komplet regnskab til Skat/Erhvervsstyrelse |
| Posteringer | CSV | Alle transaktioner i regnearksformat |
| Rapporter | PDF | Resultatopgørelse / balance |
| OIOUBL | XML | E-faktura i Peppol BIS Billing 3.0 |
| iXBRL | XML | Årsrapport til Erhvervsstyrelsen |
| CSV (årlig) | CSV | Årsrapport i regnearksformat |
| Eksporter alt | JSON + ZIP | Komplet tenant-snapshot (med filer) — til udvandring |
| ZIP-backup | ZIP (krypteret) | Se afsnit 14 |

### 15.2 Export-tenant (komplet dataudvandring)

`/api/export-tenant` genererer en komplet JSON-snapshot af din virksomheds data inklusiv vedhæftede filer:

1. Gå til **Eksport → Eksporter alt**.
2. Klik på **Generér eksport**.
3. Systemet pakker alle data (virksomhedsoplysninger, kontoplan, journalposter, fakturaer, bilag, momskoder, standard-mapping) i en JSON-fil + en ZIP med filer.
4. En **SHA-256 checksum** genereres til verifikation af filintegritet.

Denne eksport opfylder GDPR's krav om dataportabilitet (Art. 20) og BEK 98's krav om udbyderskift.

### 15.3 ProviderSwitchChecklist (udbyderskift)

Under Eksport findes `ProviderSwitchChecklist` — en guide, der forklarer, hvordan man flytter til et andet regnskabsprogram i overensstemmelse med Bogføringsloven og BEK 98:

| Trin | Handling |
|------|----------|
| 1 | Eksporter alle data (JSON + filer) |
| 2 | Verificér SHA-256 checksum |
| 3 | Download bilag |
| 4 | Bekræft lukkede perioder |
| 5 | Opret manuel backup |
| 6 | Meddel ny udbyder om eksportformat |
| 7 | Importér i nyt system |
| 8 | Bekræft overførsel |

### 15.4 Sletning/deaktivering af konto

I overensstemmelse med Bogføringsloven §10-12 og GDPR Art. 17(3)(c) kan en brugerkonto **deaktiveres**, men ikke permanent slettes. Bogføringslovens 5-års opbevaringspligt har forrang over GDPR's ret til sletning.

1. Klik på **Slet konto**-ikonet (Trash2) i sidebjælken.
2. Bekræft i AlertDialog.
3. Systemet deaktiverer kontoen via `DELETE /api/auth/delete-account`.
4. Din data forbliver opbevaret i mindst 5 år (månedsbackups) til skattekontrol/revision.

### 15.5 GDPR-overholdelse

AlphaFlow overholder GDPR via:

- Kryptering af følsomme data (bank-tokens, 2FA-secrets, backup-koder, .tbkey-beviser) med AES-256-GCM.
- Rolle- og tilladelsesbaseret adgangskontrol (RBAC).
- Audit-log over alle mutationer (se afsnit 17).
- Dataportabilitet via export-tenant.
- Konto-deaktivering frem for permanent sletning.
- Underbehandler-aftaler (SCC + TIA) med OpenRouter (data sendes til USA — se afsnit 13 for Hermes-dataadgang). OpenRouter er AlphaFlows eneste AI-underbehandler; model-udbydere (Anthropic, Meta, OpenAI m.fl.) er OpenRouter's underbehandlere per GDPR Art. 28(4).
- Ingen CPR-data registreres (kun CVR).

---

## 16. Indstillinger

Gå til **Indstillinger** i sidebjælken (`/settings`). SettingsPage er en tab-baseret side med 8 tabs.

### 16.1 Virksomhedsprofil

`CompanySettingsPage` — onboarding step 1 (`/settings-company`):

| Felt | Beskrivelse |
|------|-------------|
| CVR-nummer | Med `CvrVerifyButton` til auto-udfyld |
| Virksomhedsnavn | Officielt navn |
| Adresse | Postadresse |
| Telefon, e-mail | Kontaktoplysninger |
| Virksomhedstype | Auto-detected fra CVR (ApS, A/S, IVS, Enkeltmandsvirksomhed m.m.) |
| Faktura-præfiks | Standard præfiks for fakturanumre |
| Næste faktura-sekvens | Fortløbende tæller |
| Bilags-præfiks (`journalPrefix`) | Standard "BIL" |
| Næste bilags-sekvens | Fortløbende tæller |
| Bankoplysninger | Banknavn, reg+kontonr, IBAN, bank-adresse |
| Faktura-betingelser | Textarea med standardtekst |
| Faktura-notes-skabelon | Standardtekst til faktura-notes |
| Nuværende regnskabsår | År |
| Virksomhedslogo | Upload logo |
| Vis firma-logo i sidebar | Toggle |
| Projekt-tilstand aktiveret | Toggle |

### 16.2 Team

`TeamManagement` — medlemmer og invitationer:

- Medlemsliste med roller (OWNER/ADMIN/ACCOUNTANT/VIEWER/AUDITOR).
- Invitation-flow (e-mail + rolle + udløbsdato).
- Tilbagekald invitation.
- Skift rolle (kun OWNER).
- Fjern medlem.
- **TenantTwoFactorToggle** — kræv 2FA for alle medlemmer (se afsnit 4.5).

### 16.3 E-faktura

`EInvoiceSettings` (`/settings-edelivery`) — onboarding step 3, kun for Business+ (`AUTO_EINVOICE`):

- Aktiver e-faktura-afsendelse (toggle).
- Vælg default kanal (NemHandel, Peppol BIS Billing 3.0).
- Endpoint ID (CVR), GLN (valgfrit), Peppol AS4 ID.
- Auto-send ved finalize (toggle).
- NemHandel-registrering (registreringsnummer, status, dato).
- **Storecove-forbindelsesopsætning**: API-key, legal entity ID, connection status, test-forbindelse, frakobl.
- Peppol participant lookup (tjek om modtager eksisterer på Peppol-netværket).

### 16.4 Defaults

Standardindstillinger:

- Standard moms-rate (25/12/0).
- Betalingsbetingelser (Netto 8/14/30/60 dage).
- Regnskabsårets start (jan/feb/mar).

### 16.5 Appearance

- Tema (light/dark/system).
- Compact-mode toggle.
- Valuta-format (full/no-decimals/compact) med live preview.

### 16.6 Adgang

`AccessSettings` — adgangskontrol og abonnement:

- **TokenPay proof-upload** (.tbkey-fil) — se afsnit 16.9.
- Adgangs-niveau visning (read_only / read_write).
- Plan-tier og abonnements-status.
- Trial-info (60 dages gratis prøveperiode).
- "Køb adgangstoken"-CTA (åbner Frisbii/Flatpay checkout).
- `TwoFactorSettings` integration (2FA-opsætning).
- `ProviderSwitchChecklist` — guide til udbyderskift.

### 16.7 Hermes AI

`HermesSettings` — se afsnit 13.

### 16.8 Tilsyn / Oversight

`OversightSettings` — KUN for SuperDev (App Owner) eller AlphaAi-brugere uden App Owner:

- Liste over alle tenants, søgning.
- Start/stop oversight-mode (read-only).
- Forfrem til App Owner.
- Trial forlæng.
- Abonnement tilbagekald.
- Hermes toggle pr. tenant.

### 16.9 Abonnementer & TokenPay (.tbkey)

**Abonnementsplaner** (5 planer, se afsnit 1):

| Funktion | Gratis | Månedlig | Pro | Business | Business Ext. |
|----------|--------|----------|-----|----------|---------------|
| Manuel e-faktura (OIOUBL) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Bankintegration (Demo + Tink) | ✅ Gratis (Demo) | ✅ Månedlig+ | ✅ Pro+ | ✅ Business+ | ✅ Business Ext.+ |
| Avancerede rapporter | ❌ | ✅ | ✅ | ✅ | ✅ |
| Data eksport (CSV/PDF/SAF-T) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Årsrapport iXBRL | ❌ | ✅ | ✅ | ✅ | ✅ |
| Hermes AI-assistent | ❌ | ❌ | ✅ | ✅ | ✅ |
| Auto e-faktura (Peppol) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ubegrænsede sæder | ❌ | ❌ | ❌ | ✅ | ✅ |
| Projektregnskab | ❌ | ❌ | ❌ | ❌ | ✅ |

> **Prisforbehold:** Specifikke priser og bindingsperioder fremgår af `/pricing`. Priser for årlige og flerårige planer opkræves som et samlet beløb for bindingsperioden. Gratis og Månedlig har ingen binding; årlige planer fornyes automatisk til Månedlig ved udløb, medmindre andet er aftalt.

> **Bemærk om bankintegration:** Kun Demo-provider og Tink er reelle integrationer. Nordea, Danske Bank og Jyske Bank er stubs i den nuværende version. Se Bilag 2 (Bilag-02_Compliance-rapport.md) afsnit 2.1.

**Betaling via Flatpay/Frisbii:**

1. Vælg din plan fra kontrolpanelet eller Indstillinger → Adgang.
2. Du videresendes til Flatpay's sikre betalingsside.
3. Gennemført betaling aktiverer planen med det samme.
4. Du modtager en bekræftelses-e-mail.

**TokenPay-adgang (.tbkey-fil):**

Alternativt kan du få adgang til AlphaFlow via et TokenPay-bevis (`.tbkey`-fil):

1. Gå til **Indstillinger → Adgang**.
2. Klik på **Upload bevis (.tbkey)**.
3. Vælg din `.tbkey`-fil fra computeren.
4. Systemet verificerer og dekrypterer beviset (AES-256-GCM via `PROOF_ENCRYPTION_KEY`).
5. Klik på **Aktivér**.
6. Din adgang opdateres med det samme.

Et `.tbkey`-bevis giver typisk:

- Fuld skriveadgang (`read_write`).
- Alle funktioner (svarende til Business Extended).
- Adgang i den periode, beviset dækker.

> **Uden betalt abonnement eller gyldigt .tbkey-bevis** har du kun `read_only`-adgang. Du vil se en "Opgrader adgang"-prompt (`UpgradeAccessModal`), når du forsøger at oprette eller ændre data.

**Trial:** Alle nye brugere får 60 dages gratis prøveperiode med fuld adgang. Efter prøveperioden nedgraderes kontoen til Gratis-planen, medmindre du opgraderer. App Ejer kan forlænge trials individuelt.

**Owner-bypass:** Virksomhedsejere (OWNER) kan fortsætte med begrænsede funktioner uden aktivt abonnement — men skrive-adgang til avancerede features kræver stadig korrekt plan eller `.tbkey`.

### 16.10 Bruger-præferencer (server-synkroniserede)

Følgende præferencer synkroniseres på tværs af enheder via `/api/user/preferences`:

- Tema, compact-mode, valuta-format.
- Standard moms-rate, betalingsbetingelser, regnskabsårets start.
- `expandedSections` (sidebar accordion tilstand) — debounced sync.
- `dashboardWidgets` (widget synlighed, størrelse, kolonne-position).
- `sidebarPrefs`.

---

## 17. Revisionslog & oversight

### 17.1 Revisionslog (audit-log)

AlphaFlow fører en uforanderlig (immutable) audit-log over alle væsentlige handlinger. Gå til **Revisionslog** i sidebjælken (`/audit-log`).

**Funktioner:**

- Filtrer på `entityType` (Transaction, Invoice, JournalEntry, Account, Contact, Company, BankConnection, FiscalPeriod, VATSubmission, YearEndClosing, Backup m.fl.).
- Filtrer på `action` (CREATE / UPDATE / DELETE / CANCEL / RESTORE).
- Søgning, paginering.
- Collapsible JSON-diff pr. entry.
- Kopiér entry-ID.

**Immutabilitet (3-niveau):**

1. **App-niveau:** AlphaFlows kode kan KUN oprette (CREATE) audit-logs — aldrig opdatere eller slette.
2. **Database-niveau:** PostgreSQL BEFORE UPDATE/DELETE triggere blokerer mutationer.
3. **Cascade-niveau:** `onDelete: Restrict` forhindrer sletning af refercerede rækker.

Dette opfylder Bogføringslovens krav om uigendrkelig dokumentation (§10-12). Audit-loggen indeholder 25 forskellige AuditAction-typer, og 75+ API-routes logger automatisk.

### 17.2 SuperDev oversight-mode

App Ejer (SuperDev) kan inspicere en hvilken som helst virksomheds data i read-only mode:

1. Gå til **Indstillinger → Tilsyn / Oversight** (eller `/hermes-oversight` i sidebjælken).
2. Vælg en virksomhed fra listen.
3. Klik på **Start oversight**.
4. Du skifter til oversight-tilstand med læseadgang til alle data.
5. Et banner viser "Overvåger: X — Skrivebeskyttet tilstand".
6. Alle mutationsknapper skjules automatisk.
7. Klik på **Afslut oversight** for at vende tilbage til din egen virksomhed.

### 17.3 Tenant-administration (SuperDev)

SuperDev kan:

- Se alle virksomheder og deres abonnementer.
- Ændre abonnementsplan for enhver virksomhed.
- Administrere prøveperioder (starte, forlænge, afslutte).
- Aktivere/deaktivere specifikke funktioner pr. virksomhed (projekttilstand, Hermes).
- Forfremme en bruger til App Owner.
- Se live status og brugsstatistik.

### 17.4 Hermes Oversight

Se afsnit 13.9.

### 17.5 Demo-firma

AlphaFlow tilbyder en demo-virksomhed med simulerede data:

- Nyttigt til test, undervisning og onboarding af nye brugere.
- **Skrivebeskyttet for ikke-SuperDev**: Alle writes blokeres, banner viser "Demo-virksomhed — Skrivebeskyttet".
- **Redigerbar for SuperDev**: AppOwner-redigering tilladt (banner: "AppOwner-redigering").

Demo-banken (med simulerede transaktioner) er tilgængelig på Gratis-abonnement.

### 17.6 Audit-log eksport

Audit-loggen kan eksporteres til ekstern revision via `/api/export-tenant` (inkluderer audit-log-poster i JSON-eksporten).

---

## 18. Fejlfinding & support

### 18.1 Ofte stillede spørgsmål (FAQ)

AlphaFlows offentlige FAQ-side findes på `/faq` med 12 spørgsmål i accordion-format. Gennemgå disse først, hvis du har et generelt spørgsmål.

### 18.2 Kontakt

Brug kontaktsiden på `/contact` til at sende en besked til AlphaAi Consult ApS:

1. Udfyld kontaktsformularen (navn, e-mail, emne, besked) med zod-validering.
2. Beskeden sendes via `/api/contact`.
3. Du modtager svar pr. e-mail.

Alternativt kan du kontakte AlphaAi Consult ApS direkte:

- **Adresse:** Skelagervej 124C, 8200 Aarhus N
- **CVR:** 46312058
- **E-mail/telefon:** se `/contact`-siden for aktuelle kontaktoplysninger.

### 18.3 Hermes AI

Brug Hermes-chat-assistenten (se afsnit 13) til hurtige svar på regnskabsspørgsmål. Husk at Hermes er en AI-assistent, ikke en menneskelig rådgiver — brug din revisor til endelig rådgivning ved vigtige beslutninger.

### 18.4 Kommandopalette og tastaturgenveje

- Tryk **⌘/Ctrl + K** for at søge efter funktioner.
- Tryk **?** for at se alle tastaturgenveje (se afsnit 3.4).

### 18.5 Fejlrapportering

Oplever du en fejl i systemet:

1. Notér hvad du gjorde, hvad der skete, og hvad du forventede.
2. Notér dato og klokkeslæt.
3. Tag et skærmbillede, hvis muligt.
4. Send en fejlrapport via `/contact`.

> **Tip:** Tjek revisionsloggen under **Revisionslog** (afsnit 17.1), hvis du har brug for at spore, hvornår en bestemt handling blev udført, og af hvem.

### 18.6 Tjenestearkitektur

AlphaFlow består af 6 tjenester, der kører sammen og rutes gennem en Caddy reverse proxy (TLS 1.2/1.3, Let's Encrypt):

| Tjeneste | Port | Teknologi | Formål |
|----------|------|-----------|--------|
| AlphaFlow (hovedapp) | 3000 | Next.js 16 + Prisma + Bun | Hovedregnskabsprogram |
| Hermes Agent | 3004 | Bun + Socket.IO | AI-chatassistent |
| Knowledge Service | 3006 | Bun + HTTP + pgvector | RAG-videnbase |
| Scanner Service | 3005 | Python + FastAPI | OCR/VLM dokumentscanning |
| TokenPay Access | 3100 | Bun + Hono | Bevisbaseret adgangskontrol |
| Notification WS | 3001 | Bun + Socket.IO | Realtidsnotifikationer |

Alle tjenester administreres samlet via PM2 i produktionsmiljøet (fork-mode, 6 processer).

### 18.7 Browser-support og kendte begrænsninger

AlphaFlow understøtter moderne browsere (Chrome, Edge, Firefox, Safari). Kendte begrænsninger i den nuværende version:

| Begrænsning | Beskrivelse |
|-------------|-------------|
| Ingen lønmodul | Løn kan bogføres som almindelige journalposter, men der er intet dedikeret lønmodul. |
| Ingen varekartotek | Faktura-linje-items gemmes som JSON — ingen Item-master. |
| Ingen MitID/Bank-ID | Autentificering via e-mail + adgangskode + valgfri TOTP-2FA. |
| PSD2-bankintegrationer er stubs | Nordea/Danske Bank/Jyske Bank er stubs; Tink er reel implementering (aktiv ved konfigurerede TINK_CLIENT_ID/SECRET); Demo-provider virker altid. |
| Ingen native mobil-app | PWA-installation fra browser. |
| Ingen SSO/SAML | Kun e-mail/password + 2FA. |
| Ingen chat-med-revisor | Hermes er AI, ikke menneske. |
| Ingen approval-workflow | Fakturaer/posteringer har ikke flertrins godkendelse. |
| Ingen rapport-scheduling | Rapporter genereres on-demand. |
| Kun moms via SKAT-API | Ingen årsopgørelse, e-indkomst eller AM-bidrag API. |
| Adgangskode min. 6 tegn | |
| Ingen CSRF-token | SameSite=Lax cookie + Bearer-token benyttes i stedet for dedikeret CSRF-token. |
| Ingen account-lockout | Kun IP-baseret rate-limiting. |

Disse begrænsninger er anført for at hjælpe dig med at vurdere, om AlphaFlow dækker dine behov. For spørgsmål til specifikke funktioner, kontakt AlphaAi Consult ApS via `/contact`.

---

*AlphaFlow er udviklet af AlphaAi Consult ApS med fokus på dansk compliance, brugervenlighed og sikkerhed. Alle funktioner er designet til at overholde gældende dansk lovgivning, herunder Lov om bogføring (LOV nr. 700 af 24. maj 2022), BEK nr. 97 af 26. januar 2023 (Kravbekendtgørelsen), BEK nr. 98 af 26. januar 2023 (Anmeldelsesbekendtgørelsen) og GDPR. Denne brugsvejledning opdateres løbende i takt med nye versioner af platformen.*
