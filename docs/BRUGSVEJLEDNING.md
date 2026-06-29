# AlphaFlow — Brugsvejledning

> Komplet brugermanual for AlphaFlow, det danskudviklede regnskabssystem til små og mellemstore virksomheder. Udviklet i overensstemmelse med dansk Bogføringslov.

---

## Indhold

1. [Introduktion](#1-introduktion)
2. [Kom i Gang](#2-kom-i-gang)
3. [Kontrolpanel (Dashboard)](#3-kontrolpanel-dashboard)
4. [Kontooversigt (Kontoplan)](#4-kontooversigt-kontoplan)
5. [Finansielle Poster (Journalposter)](#5-finansielle-poster-journalposter)
6. [Køb & Kvitteringer (Posteringer)](#6-køb--kvitteringer-posteringer)
7. [Kvitteringsscanner & OCR](#7-kvitteringsscanner--ocr)
8. [Fakturering](#8-fakturering)
9. [E-faktura (NemHandel & Peppol)](#9-e-faktura-nemhandel--peppol)
10. [Kontakter](#10-kontakter)
11. [MOMS (Merværdiafgift)](#11-moms-merværdiafgift)
12. [Bankafstemning](#12-bankafstemning)
13. [Periodeafslutning & Årsafslutning](#13-periodeafslutning--årsafslutning)
14. [Rapportering](#14-rapportering)
15. [Budgettering](#15-budgettering)
16. [Projektregnskab](#16-projektregnskab)
17. [Tilbagevendende Poster](#17-tilbagevendende-poster)
18. [Fremmedvaluta](#18-fremmedvaluta)
19. [SAF-T Eksport](#19-saf-t-eksport)
20. [OIOUBL Eksport](#20-oioubl-eksport)
21. [Årsregnskab & iXBRL](#21-årsregnskab--ixbrl)
22. [Udbyderskift](#22-udbyderskift)
23. [Backup og Gendannelse](#23-backup-og-gendannelse)
24. [Hermes AI-assistent](#24-hermes-ai-assistent)
25. [Abonnementer & Adgang](#25-abonnementer--adgang)
26. [Bruger- & Rollestyring](#26-bruger--rollestyring)
27. [2-Faktor Autentificering (2FA)](#27-2-faktor-autentificering-2fa)
28. [Sikkerhed & Compliance](#28-sikkerhed--compliance)
29. [PWA & Mobil](#29-pwa--mobil)
30. [Kommandopalette & Tastaturgenveje](#30-kommandopalette--tastaturgenveje)
31. [Notifikationer & Realtidssynkronisering](#31-notifikationer--realtidssynkronisering)
32. [Demo-tilstand](#32-demo-tilstand)
33. [App Ejer (SuperDev) & Oversight](#33-app-ejer-superdev--oversight)
34. [Support og Kontakt](#34-support-og-kontakt)

---

## 1. Introduktion

### Hvad er AlphaFlow?

AlphaFlow er et moderne, cloudbaseret regnskabssystem udviklet specifikt til danske virksomheder. Systemet overholder kravene i Bogføringsloven, herunder pligten til at gemme regnskabsmateriale i mindst 5 år, samt understøttelse af SAF-T og OIOUBL formater til Erhvervsstyrelsen og Skattestyrelsen.

AlphaFlow er bygget som et multi-tenant system — det betyder, at din virksomheds data er fuldstændig adskilt fra andre kunders data, og du kun ser og har adgang til dine egne oplysninger.

### Hvem er systemet til?

| Rolle | Niveau | Beskrivelse |
|-------|--------|-------------|
| **Ejer (Owner)** | 5 (højeste) | Har fuld adgang til alle funktioner, herunder sletning, overdragelse af virksomhed og årsafslutning |
| **Administrator (Admin)** | 4 | Kan administrere teammedlemmer, forbinde banker, ændre indstillinger og slette data |
| **Bogholder (Accountant)** | 3 | Kan oprette, redigere og annullere finansposter, journalposter og fakturaer |
| **Seer (Viewer)** | 2 | Har skrivebeskyttet adgang til rapporter og data |
| **Revisor (Auditor)** | 1 | Kan se og eksportere rapporter samt SAF-T filer til compliance |

### Hurtig oversigt over funktioner

- **Kontrolpanel** med 25+ widgets, finansielt helbred, KPI'er og onboarding-guide
- Standard dansk kontoplan (FSR-standard) med automatisk opsætning og SKAT standardkontoplan-mapping
- Finansielle journalposter med debet/kredit og fortløbende bilagsnummerering
- **Køb & kvitteringer** med AI-kategorisering og OCR-scanning
- Fakturering med moms, kreditnotaer og OIOUBL eksport
- **E-faktura** via NemHandel og Peppol (Storecove-integration) — send og modtag
- **10 danske momskoder** og momsopgørelse med indberetning til Skattestyrelsen
- Bankafstemning med Open Banking (Nordigen) og AI-auto-match
- Periodeafslutning og årsafslutning med automatisk postering
- Rapportering: balance, resultatopgørelse, aldersopdeling, likviditet, kontantstrømsprognose
- **Budgettering** med budget vs. faktisk analyse
- **Projektregnskab** med projektbudgetter, -rapporter og projekttilstand
- **Tilbagevendende poster** med automatisk eksekvering
- SAF-T eksport (til Erhvervsstyrelsen/Skattestyrelsen)
- OIOUBL eksport (e-faktura i Peppol-format)
- **Årsregnskab** med iXBRL-eksport til Erhvervsstyrelsen
- **Hermes AI-assistent** — dansk regnskabsrådgiver med RAG-videnbase
- **Kvitteringsscanner** med OpenCV, Tesseract OCR og VLM
- Automatiseret backup med SHA-256 checksums og kryptering
- Dokumenthåndtering og bilagsføring
- **Fremmedvaluta** med automatiske ECB-kurser
- **TokenPay-adgang** (.tbkey bevisfiler)
- **PWA** — installér som app på mobil og desktop
- **Kommandopalette** (⌘+K) og tastaturgenveje
- Mørk tilstand (dark mode) og dansk/engelsk flersprogethed

---

## 2. Kom i Gang

### Oprettelse af konto og første login

1. Gå til AlphaFlows startside og klik på **Opret konto**.
2. Indtast din e-mailadresse, adgangskode og virksomhedsnavn.
3. Bekræft din e-mailadresse via linket i velkomstmailen.
4. Log ind med dine oplysninger.

> **Tip:** Du modtager en bekræftelsesmail inden for få minutter. Tjek dit spam-filter, hvis mailen ikke fremgår af indbakken. Du kan anmode om en ny bekræftelsesmail fra login-siden.

### Oprettelse af virksomhed

1. Klik på **Ny virksomhed** eller gå til Indstillinger → Virksomhed.
2. Indtast følgende oplysninger:

   | Felt | Beskrivelse |
   |------|-------------|
   | Virksomhedsnavn | Det officielle navn på din virksomhed |
   | CVR-nummer | 8-cifret virksomhedsnummer (kan auto-udfyldes via CVR-opslag) |
   | Adresse | Virksomhedens fysiske adresse |
   | Telefon | Kontaktnummer |
   | E-mail | Officiel e-mailadresse |
   | Virksomhedstype | ApS, A/S, IVS, Enkeltmandsvirksomhed osv. |

3. Klik på **Gem**. AlphaFlow opretter automatisk en standard dansk kontoplan (FSR) med 38 konti.

> **CVR-opslag:** Brug knappen **Verificér CVR** til automatisk at slå virksomhedsdata op i VIRK-registret og udfylde navn, adresse og type.

### Onboarding-guide

Første gang du logger ind, vises en interaktiv onboarding-guide med 7 trin, der hjælper dig med at:

1. Bekræfte virksomhedsoplysninger
2. Tilpasse kontoplanen
3. Oprette din første bankforbindelse
4. Oprette en kontakt
5. Oprette din første faktura
6. Udforske Hermes AI
7. Vælge abonnement

Du kan altid tilgå onboarding-guiden igen fra kontrolpanelet.

### Inviter teammedlemmer

1. Gå til **Indstillinger → Team**.
2. Klik på **Inviter medlem**.
3. Indtast modtagerens e-mailadresse.
4. Vælg en rolle (se afsnit 26 for rollebeskrivelse).
5. Send invitationen. Modtageren modtager en mail med et tilmeldingslink.

> **Bemærk:** Kun administratorer og ejere kan invitere nye teammedlemmer. Antallet af teammedlemmer afhænger af dit abonnement (se afsnit 25).

---

## 3. Kontrolpanel (Dashboard)

### Oversigt

Kontrolpanelet er dit finansielle kommandocenter med over 25 widgets, der giver et øjebliksbillede af virksomhedens økonomi. Widgets vises i et masonry-layout med 3 kolonner (desktop), 2 kolonner (tablet) eller 1 kolonne (mobil).

### Tilgængelige widgets

**Nøgletal (KPI):**
- Omsætning, Driftsresultat, Udgående moms, Indgående moms
- Kassebeholdning, Resultat, Omsætningsændring, Omkostningsændring
- Nettoprofitændring, Finansielt helbred

**Diagrammer:**
- Omsætning vs. Omkostninger (kurve)
- Nettoresultat pr. måned
- Resultatopgørelse (vandfaldsdiagram)
- Kontantstrømsprognose (3 måneders prognose)
- Omkostningsanalyse (tærtdiagram pr. kategori)
- Projektindtjening

**Detaljer:**
- Aktivitetsfeed, Aktive konti, Fakturaoversigt
- Budget vs. Faktisk, Seneste journalposter, SAF-T Eksport
- AI-kategorisering, Finansielt helbred detalje, Projektoversigt

### Tilpasning af dashboard

1. Klik på **Tilpas widgets** (øverst til højre på dashboard).
2. Drag-and-drop widgets mellem de 3 kolonner.
3. Slå widgets til/fra med øje-ikonet.
4. Klik på **Nulstil** for at gendanne standardlayoutet.

> **Tip:** Dine layout-ændringer gemmes automatisk og synkroniseres på tværs af enheder.

### Datofiltrering

Brug datofilteret øverst på dashboardet til at vælge periode:

| Mulighed | Beskrivelse |
|----------|-------------|
| Denne måned | Nuværende kalendermåned |
| Sidste måned | Forrige kalendermåned |
| Dette kvartal | Nuværende kvartal |
| I år | Nuværende regnskabsår |
| Sidste år | Forrige regnskabsår |
| Brugerdefineret | Vælg start- og slutdato |

### Finansielt helbred

Widgetten "Finansielt helbred" beregner en samlet score baseret på:
- **Likviditetsgrad** — kan virksomheden betale kortsigtede forpligtelser?
- **Overskudsgrad** — hvor stor en del af omsætningen er overskud?
- **Kontantstrømtendens** — stiger eller falder likviditeten?

Scoren vises med farvekoder: 🟢 God, 🟡 Advarsel, 🔴 Kritisk.

---

## 4. Kontooversigt (Kontoplan)

### Standard dansk kontoplan

Når du opretter en virksomhed, opretter AlphaFlow automatisk en komplet kontoplan baseret på FSR-standard (Foreningen af Statsautoriserede Revisorer). Kontoplanen indeholder 38 konti fordelt på følgende hovedgrupper:

| Kontonummer | Gruppe | Eksempler |
|-------------|--------|-----------|
| 1xxx | **Aktiver** | Kasse (1000), Bankkonto (1100), Tilgodehavender (1200), Varelager (1300), IT-udstyr (1800) |
| 2xxx | **Passiv (Gæld)** | Leverandørgæld (2000), Momsgæld (2200), Personalegæld (2400), Banklån (2600) |
| 3xxx | **Egenkapital** | Aktiekapital (3000), Reserver (3200), Årets resultat (3300), Overført resultat (3400) |
| 4xxx–5xxx | **Indtægter & Moms** | Salg af varer (4000), Tjenesteydelser (4100), EU-salg (4200), Eksport (4300), Udgående moms (4510/4520), Indgående moms (5410/5420) |
| 6xxx–9xxx | **Omkostninger** | Vareforbrug (6000), Lønninger (7000), Husleje (8000), Renteomkostninger (9100) |

### Tilpasning af konti

**Tilføj en ny konto:**

1. Gå til **Kontoplan** i sidebjælken.
2. Klik på **Tilføj konto**.
3. Indtast kontonummer, navn (dansk og engelsk) og vælg type (aktiv, passiv, egenkapital, indtægt, omkostning) samt gruppe.
4. Klik på **Gem**.

**Deaktivér en konto:**

1. Find kontoen i kontoplanen.
2. Slå aktivitetsstatus fra (toggle).
3. Kontoen forbliver synlig i historik, men kan ikke bruges til nye poster.

> **Vigtigt:** Systemkonti (markeret med ikon) kan ikke slettes. De kan kun deaktiveres.

### Standardkontoplan-mapping (FSR → SKAT)

AlphaFlow indeholder SKAT's Fællesoffentlige Standardkontoplan som en integreret reference. Mapping-værktøjet lader dig knytte dine FSR-konti til de offentlige standardkonti:

1. Gå til **Kontoplan** i sidebjælken.
2. Vælg fanen **Standard Mapping**.
3. Brug **Auto-map** for automatisk at tildele standardkonti baseret på kontotype og gruppe.
4. Juster individuelle mapping'er manuelt efter behov.
5. Eksporter mapping'en som CSV-fil.

### Momskode-mapping

AlphaFlow tilbyder en separat mapping-tabel for momskoder, som konverterer interne VAT-koder til SKAT's offentlige momskoder:

| Intern kode | Betegnelse | Offentlig kode | Offentlig betegnelse |
|-------------|------------|----------------|---------------------|
| S25 | Udgående moms 25% | U25 | Udgående moms 25% |
| S12 | Udgående moms 12% | U12 | Udgående moms 12% |
| S0 | Udgående moms 0% | U0 | Udgående moms 0% |
| SEU | EU-salg uden moms | UE | EU-salg |
| K25 | Indgående moms 25% | I25 | Indgående moms 25% |
| K12 | Indgående moms 12% | I12 | Indgående moms 12% |
| K0 | Indgående moms 0% | I0 | Indgående moms 0% |
| KEU | EU-køb | IE | EU-indkøb |
| KUF | Føringsmoms | IF | Føringsmoms |
| NONE | Ingen moms | — | Ikke momsfaktureret |

### Konteringsvejledning (Bogføringsguide)

AlphaFlow indeholder en indbygget bogføringsguide/assistent, der hjælper med korrekt bogføring:

1. Gå til **Kontoplan** → fanen **Bogføringsguide**.
2. Se anbefalede bogføringsregler opdelt i kategorier:
   - **Salg:** Debet bankkonto/tilgodehavender, kredit salgsindtægt + udgående moms
   - **Indkøb:** Debet vareforbrug + indgående moms, kredit bankkonto/kreditorer
   - **Moms:** Oversigt over momskontoer og afregning
   - **Årsafslutning:** Overførsel af årsresultat til egenkapital
3. Reference-links til SKAT's officielle vejledninger (Bogføringsloven, BEK 98, SKAT moms).

Hver konto kan desuden have en brugerdefineret konteringsvejledning, der vises som hjælpetekst ved bogføring:

1. Gå til **Kontoplan** og redigér en konto.
2. I feltet **Konteringsvejledning** kan du tilføje en beskrivelse af, hvornår og hvordan kontoen skal bruges.

---

## 5. Finansielle Poster (Journalposter)

### Oprettelse af journalposter

En journalpost består af mindst to linjer — en debet og en kredit — der tilsammen balancerer. Alle journalposter får automatisk et fortløbende bilagsnummer i overensstemmelse med Bogføringslovens krav.

1. Gå til **Journal** i sidebjælken.
2. Klik på **Ny journalpost**.
3. Angiv dato, reference og beskrivelse.
4. Tilføj journalposter med debet og kredit:
   - Vælg konto for hver linje.
   - Angiv beløb i debet- eller kreditkolonnen.
   - Vælg momskode for hver linje (hvis relevant).
   - Tilknyt et projekt (hvis projekttilstand er aktiv).
   - Sørg for, at summen af debet = summen af kredit.
5. Klik på **Gem som kladde**.

> **Auto-balance:** Systemet validerer automatisk, at debet og kredit balancerer, før du kan gemme.

### Bogføring af salg, køb og løn

**Salg:**
- Debet: Bankkonto (1100) eller Tilgodehavender (1200)
- Kredit: Salg af varer/tjenesteydelser (4000/4100) + Udgående moms (4510)

**Køb:**
- Debet: Vareforbrug (6000/6100) + Indgående moms (5410)
- Kredit: Bankkonto (1100) eller Leverandørgæld (2000)

**Løn:**
- Debet: Lønninger (7000)
- Kredit: Bankkonto (1100) eller Personalegæld (2400)

### Status: Kladde → Bogført

| Status | Beskrivelse |
|--------|-------------|
| **KLADDE (DRAFT)** | Posten er gemt men endnu ikke bogført. Kan redigeres og slettes. |
| **BOGFØRT (POSTED)** | Posten er endeligt bogført. Kan ikke længere redigeres. |
| **ANNULLERET (CANCELLED)** | Posten er annulleret med modpost. Kan ikke gendannes. |

1. Åbn journalposten i kladdetilstand.
2. Gennemgå alle linjer.
3. Klik på **Bogfør** for at ændre status til BOGFØRT.

### Annullering af poster

I overensstemmelse med Bogføringsloven slettes poster aldrig fysisk. I stedet annulleres de (soft delete):

1. Find den bogførte post.
2. Klik på **Annuller**.
3. Angiv en årsag (f.eks. "Fejlbogføring — dobbeltkontering").
4. Systemet opretter en modpost, der neutraliserer den oprindelige post.

> **Sikkerhedsbemærkning:** Annullerede poster er altid synlige i audit-loggen med dato, bruger og årsag. Dette opfylder Bogføringslovens krav om uigendrkelig dokumentation.

### Bilagsføring

Du kan vedhæfte dokumenter (kvitteringer, fakturaer, kontrakter) til journalposter:

1. Åbn eller opret en journalpost.
2. Klik på **Upload bilag**.
3. Vælg filen fra din computer (PDF, billeder, etc.).
4. Tilføj en beskrivelse af bilaget.
5. Gem.

### Udkast-autogemning

AlphaFlow gemmer automatisk dine udkast, mens du arbejder. Hvis du mister forbindelsen eller navigerer væk, kan du genoptage dit udkast:

- En **Udkast-genoprettelsesbanner** vises, når du har ikke-gemte udkast.
- Hvert udkast udløber automatisk efter 30 minutter.
- Du kan kassere individuelle udkast eller alle på én gang.

---

## 6. Køb & Kvitteringer (Posteringer)

### Oversigt

Under **Køb & Kvitteringer** håndterer du virksomhedens indkøb, udgifter og kvitteringer. Siden har tre faner:

| Fane | Beskrivelse |
|------|-------------|
| **Posteringer** | Alle købstransaktioner med kvitteringer |
| **Tilbagevendende** | Tilbagevendende poster (se afsnit 17) |
| **E-faktura Indbakke** | Modtagne e-fakturaer (se afsnit 9) |

### Oprettelse af transaktion

1. Klik på **Ny postering** (eller brug den mobile FAB-knap).
2. Udfyld felterne:

   | Felt | Beskrivelse |
   |------|-------------|
   | Beløb | Beløb inkl. eller ekskl. moms |
   | Beskrivelse | Tekstlig beskrivelse af købet |
   | Dato | Transaktionsdato |
   | Konto | Vælg den relevante afsætningskonto |
   | Momssats | Vælg momskode (S25, K25, osv.) |
   | Valuta | Vælg valuta (DKK, EUR, USD, GBP, SEK, NOK) |
   | Projekt | Tilknyt et projekt (hvis aktivt) |
   | Kvittering | Upload eller scan kvittering |

3. Moms beregnes automatisk baseret på den valgte momssats.
4. Klik på **Gem**.

### AI-kategorisering

AlphaFlow tilbyder automatisk AI-kategorisering af transaktioner baseret på danske nøgleord:

1. Når du opretter en transaktion, vises et **AI-kategoriseringsbadge** (✨-ikon).
2. Systemet foreslår en konto baseret på transaktionsbeskrivelsen.
3. Klik på badget for at anvende forslaget med ét klik.
4. Konfidensniveauet vises (høj/mellem/lav).

### Transaktionstyper

| Type | Beskrivelse |
|------|-------------|
| **SALE** | Salg af varer eller tjenesteydelser |
| **PURCHASE** | Indkøb og udgifter |
| **SALARY** | Lønudbetalinger |
| **BANK** | Banktransaktioner |
| **Z_REPORT** | Z-rapport fra kassesystem |
| **PRIVATE** | Private hævninger |
| **ADJUSTMENT** | Reguleringer og justeringer |

### Eksport af transaktioner

Du kan eksportere transaktioner til CSV eller PDF (kræver Månedlig-abonnement eller derover). Eksport til Peppol-format er også tilgængelig.

---

## 7. Kvitteringsscanner & OCR

AlphaFlow har en indbygget kvitteringsscanner med tre teknologier, der arbejder sammen for at give den mest præcise dataudtrækning:

### Scanningsmetoder

| Metode | Hvornår | Hastighed | Præcision |
|--------|---------|-----------|-----------|
| **Kamera (OpenCV)** | Mobil og desktop PWA | Hurtig | Høj (automatisk kantdetektering) |
| **Tesseract OCR** | Billeder og scanninger | Hurtig | Moderat |
| **VLM (Vision Language Model)** | Tesseract konfidens < 60% | Langsom | Meget høj |

### Kamerascanning (OpenCV)

1. Klik på **Scan kvittering** (kamera-ikon) i en transaktion.
2. Tillad kameraadgang, hvis du bliver spurgt.
3. Hold kvitteringen foran kameraet.
4. Systemet detekterer automatisk dokumentets kanter (grøn firkant).
5. Hold stille — systemet tager automatisk billedet, når dokumentet er stabilt.
6. Det beskårne og perspektivkorrigerede billede sendes til OCR.

### Upload af PDF eller billede

1. Klik på **Upload** i transaktionen.
2. Vælg en PDF, JPG eller PNG-fil fra din computer.
3. Filen sendes til scanner-servicen til behandling.

### Behandlingspipeline

```
Upload/Kamera → Filtype-detektion
  ├─ PDF med tekstlag → Direkte tekstudtrækning (hurtig)
  ├─ PDF uden tekst → Render 300 DPI → VLM-analyse
  └─ Billede → OpenCV-forbedring → Tesseract OCR
       └─ Konfidens < 60% → VLM fallback
→ Dansk parsing (beløb, dato, CVR, momssats)
→ Validering (CVR Mod-11, IBAN, EAN)
→ Kontoforslag baseret på danske nøgleord
→ Auto-udfyldning af transaktion
```

### Automatisk udfyldning

Når en kvittering er scannet, udfylder systemet automatisk:

- **Beløb** — Totalbeløb og subtotal
- **Dato** — Transaktionsdato
- **Moms** — Momssats og momsbeløb
- **Leverandør** — Navn og evt. CVR-nummer
- **Kontoforslag** — Foreslået FSR-konto med konfidensniveau
- **Dokumenttype** — Kvittering, faktura eller kreditnota

> **Tip:** Scanningsresultater med lav konfidens markeres med "Kræver gennemsyn" — gennemgå altid automatiske udsagn.

---

## 8. Fakturering

### Oprettelse af salgsfaktura

1. Gå til **Salg & Faktura** i sidebjælken.
2. Klik på **Ny faktura**.
3. Udfyld kundeoplysninger (navn, adresse, e-mail, CVR) — eller vælg en eksisterende kontakt.
4. Vælg fakturadato og forfaldsdato.
5. Tilføj linjevarer.

### Tilføjelse af linjevarer

For hver linje angives:

| Felt | Beskrivelse |
|------|-------------|
| Beskrivelse | Tekstlig beskrivelse af varen/ydelsen |
| Antal | Antal enheder |
| Enhedspris | Pris pr. enhed ekskl. moms |
| Moms | Momskode (S25, S12, S0, SEU osv.) |
| Beløb | Beregnes automatisk (antal × enhedspris) |

Systemet beregner automatisk subtotal, momsbeløb og totalbeløb.

### Fakturastatusser

| Status | Beskrivelse |
|--------|-------------|
| **KLADDE (DRAFT)** | Fakturaen er oprettet men ikke sendt. Kan redigeres. |
| **SENDT (SENT)** | Fakturaen er sendt til kunden. |
| **BETALT (PAID)** | Fakturaen er betalt. |
| **ANNULLERET (CANCELLED)** | Fakturaen er annulleret. En kreditnota oprettes automatisk. |

### Sendelse af faktura

1. Gennemgå fakturaen.
2. Klik på **Send** for at e-maile fakturaen til kunden (med mulighed for egen besked og BCC).
3. Alternativt: Klik på **Download PDF** for at gemme og sende manuelt.
4. Klik på **Send e-faktura** for at sende via Peppol/NemHandel (se afsnit 9).

### Kreditnota

Hvis en faktura skal annulleres eller rettes:

1. Find den oprindelige faktura.
2. Klik på **Opret kreditnota**.
3. Systemet opretter en automatisk modpost med negativt beløb.
4. Angiv årsag til kreditnotaen.
5. Send kreditnotaen til kunden.

### Forfaldne fakturaer

AlphaFlow markerer automatisk forfaldne fakturaer med rød indikator. Du kan se alle forfaldne fakturaer i oversigten og via notifikationscenteret.

### Tilbagevendende fakturaer

Du kan oprette tilbagevendende fakturaer direkte fra fakturaformularet ved at aktivere **Tilbagevendende**-toggle og vælge frekvens (ugentlig, månedlig, kvartalsvis, årlig).

---

## 9. E-faktura (NemHandel & Peppol)

AlphaFlow understøtter fuld elektronisk fakturering via både NemHandel (OIOUBL) og Peppol BIS Billing 3.0.

### Indbakke for modtagne e-fakturaer

1. Gå til **Salg & Faktura → Indbakke** (eller Køb & Kvitteringer → E-faktura Indbakke).
2. Se alle modtagne e-fakturaer med status: MODTAGET, GODKENDT, AFVIST eller KONTERET.
3. Klik på en faktura for at se preview med alle detaljer (leverandør, linjer, beløb, moms).
4. XML-filen vises i en indbygget viewer.

### Understøttede formater

| Format | Standard | Profil |
|--------|----------|--------|
| **OIOUBL** | OIOUBL 2.1 | Dansk offentlig fakturastandard |
| **Peppol BIS** | Peppol BIS Billing 3.0 | EN 16931 (European Norm) |

Systemet registrerer automatisk formatet baseret på CustomizationID og ProfileID i XML-filen.

### Godkend/afvis workflow

Når en e-faktura modtages:

1. **Forhåndsvisning:** Systemet viser en preview af fakturaens indhold.
2. **Validering:** XML-struktur, momskoder og beløb valideres automatisk.
3. **Godkend:** Markerer fakturaen som accepteret og klar til bogføring.
4. **Afvis:** Markerer fakturaen som afvist med en årsag (gemmes i audit-loggen).
5. **Bogfør:** Automatisk kontering til journalen med korrekte debet/kredit-poster.

### Automatisk kontering

Ved godkendelse kan AlphaFlow automatisk bogføre den modtagne faktura:

- Kreditorpost oprettes på leverandørgældkontoen (typisk 2000)
- Vareforbrug/moms konteres på de relevante konti
- Bilag (XML) vedhæftes journalposten
- En Application Response (OIOUBL) eller Message Level Response (Peppol) sendes tilbage til afsenderen

### Send e-faktura (Peppol/NemHandel)

1. Åbn en faktura i DRAFT- eller SENT-status.
2. Klik på **Send e-faktura**.
3. Vælg afsendelseskanal:

   | Kanal | Format | Krav |
   |-------|--------|------|
   | NemHandel OIOUBL | OIOUBL 2.1 | Modtager tilmeldt NemHandel |
   | Peppol BIS | BIS Billing 3.0 | Modtager tilmeldt Peppol |
   | Storecove | Multi-format | Storecove API-nøgle konfigureret |

4. Systemet validerer fakturaens OIOUBL-XML mod skemaet.
5. Modtagerens deltagerslup opslås automatisk (Peppol participant lookup).
6. Fakturaen sendes, og leveringsstatus spores i realtid.

### Leveringsstatus

| Status | Beskrivelse |
|--------|-------------|
| **PENDING** | Afventer afsendelse |
| **QUEUED** | I kø hos access point |
| **SENDING** | Under afsendelse |
| **DELIVERED** | Leveret til modtager |
| **ACCEPTED** | Modtager har accepteret |
| **FAILED** | Afsendelse mislykkedes — kan prøves igen |
| **REJECTED** | Afvist af modtager |
| **CANCELLED** | Annulleret |

> **Prøv igen:** Hvis en e-faktura fejler, kan du klikke **Prøv igen** for at gentage afsendelsen.

### NemHandel-registrering

AlphaFlow understøtter tilmelding til NemHandelsregisteret:

1. Gå til **Indstillinger → E-faktura**.
2. Se NemHandel-registreringsoplysninger (CVR, e-invoice identifikator).
3. Registrér virksomhedens e-faktura-kapacitet i NemHandelsregisteret.

### Storecove-konfiguration

1. Gå til **Indstillinger → E-faktura**.
2. Indtast Storecove API-nøgle.
3. Test forbindelsen.
4. Bekræft din juridiske entitet.
5. Når Storecove er forbundet, kan du sende e-fakturaer automatisk (kræver Business-abonnement eller derover).

---

## 10. Kontakter

### Oversigt

Under **Kontakter** håndterer du virksomhedens kunder og leverandører. Kontakter bruges til fakturering, e-faktura og rapportering.

### Kontakttyper

| Type | Beskrivelse |
|------|-------------|
| **Kunde (CUSTOMER)** | Kun salgskunde |
| **Leverandør (SUPPLIER)** | Kun leverandør |
| **Begge (BOTH)** | Både kunde og leverandør |

### Oprettelse af kontakt

1. Gå til **Kontakter** i sidebjælken.
2. Klik på **Ny kontakt**.
3. Udfyld oplysninger:

   | Felt | Beskrivelse |
   |------|-------------|
   | Navn | Kontaktens firmanavn eller fulde navn |
   | CVR-nummer | 8-cifret CVR (kan auto-udfyldes) |
   | E-mail | Kontakt-e-mail (bruges til faktura-afsendelse) |
   | Telefon | Telefonnummer |
   | Adresse | Postadresse |
   | Type | Kunde, Leverandør eller Begge |
   | Noter | Fritekst-noter |

4. Klik på **Gem**.

### CVR-opslag

Brug knappen **Verificér CVR** til automatisk at slå virksomhedsdata op i VIRK-registret og udfylde navn, adresse og type ud fra CVR-nummeret.

### Peppol-deltageropslag

Når du sender en e-faktura, kan AlphaFlow automatisk slå modtageren op i Peppol-netværket for at bekræfte, at de kan modtage e-fakturaer.

---

## 11. MOMS (Merværdiafgift)

### Danske momskoder

AlphaFlow understøtter alle 10 danske momskoder:

| Kode | Type | Sats | Konto | Anvendelse |
|------|------|------|-------|------------|
| **S25** | Udgående | 25% | 4510 | Standardmoms for de fleste varer og tjenesteydelser |
| **S12** | Udgående | 12% | 4520 | Reduceret sats for bl.a. aviser, korte transportydelser |
| **S0** | Udgående | 0% | — | Undtaget moms for bl.a. eksport, sundhedsvæsen |
| **SEU** | Udgående EU | 0% | — | EU-salg uden moms (intracommunity) |
| **K25** | Indgående | 25% | 5410 | Indgående standardmoms fra leverandører |
| **K12** | Indgående | 12% | 5420 | Indgående reduceret moms fra leverandører |
| **K0** | Indgående | 0% | — | Indgående 0% moms |
| **KEU** | Indgående EU | — | — | EU-køb (indtrafinit) |
| **KUF** | Føringsmoms | — | — | Føringsmoms ved import |
| **NONE** | Ingen | — | — | Ikke momsfaktureret |

### MOMS-register

AlphaFlow holder automatisk styr på din udgående og indgående moms:

- **Udgående moms (output moms):** Moms, du har opkrævet hos dine kunder og skal afregne til Skattestyrelsen.
- **Indgående moms (input moms):** Moms, du har betalt til dine leverandører og kan fratrække.

Du kan se momssaldoen under **MOMS-register** i sidebjælken.

### MOMS-opgørelse og indberetning

1. Gå til **Moms & Årsregnskab → Momsrapport**.
2. Vælg periode (Q1, Q2, Q3, Q4 eller Årlig).
3. Systemet beregner automatisk:
   - Total udgående moms
   - Total indgående moms
   - Netto moms til afregning (udgående − indgående)
4. Gennemgå beregningen.
5. Klik på **Indberet til Skattestyrelsen** for at sende via Moms-API (OAuth2).

### Momsindberetningsstatus

| Status | Beskrivelse |
|--------|-------------|
| **DRAFT** | Opgørelse oprettet, ikke indsendt |
| **SUBMITTED** | Indsendt til Skattestyrelsen |
| **ACCEPTED** | Accepteret af Skattestyrelsen |
| **REJECTED** | Afvist — skal rettes og genindsendes |
| **ERROR** | Teknisk fejl ved indsendelse |

> **Vigtigt:** Momsopgørelsen skal indsendes til Skattestyrelsen via TastSelv Erhverv inden fristen. Moms-API integrationen kræver, at virksomheden er tilmeldt TastSelv Erhverv.

### Momsrapport

Momsrapporten er tilgængelig under **Rapporter → Momsrapport** med detaljeret opdeling pr. momskode og visuel cirkeldiagram-repræsentation.

---

## 12. Bankafstemning

### Oprettelse af bankforbindelse (Open Banking)

AlphaFlow integrerer med Nordigen (GoCardless) til Open Banking med understøttelse af danske banker:

1. Gå til **Bankafstemning** i sidebjælken.
2. Klik på **Tilføj bankforbindelse**.
3. Vælg din bank fra listen over understøttede udbydere (Danske Bank, Nordea, Jyske Bank m.fl.).
4. Godkend adgangen via din banks sikkerhedssystem (MitID/NemID).
5. AlphaFlow henter automatisk transaktioner fra din bankkonto.

> **Sikkerhed:** Bankadgangskoder krypteres med AES-256-GCM og opbevares sikkert. AlphaFlow har kun læseadgang til dine kontoudtog (PSD2).

> **Gratis brugere:** På Gratis-abonnementet fås en demo-bank med simulerede transaktioner. Ægte bankintegration kræver Månedlig-abonnement eller derover.

### Bankforbindelsesstatus

| Status | Beskrivelse |
|--------|-------------|
| **ACTIVE** | Forbindelsen er aktiv og kan synkroniseres |
| **PENDING** | Afventer godkendelse fra bank |
| **EXPIRED** | Samtykke er udløbet — skal fornyes |
| **REVOKED** | Samtykke er tilbagekaldt |
| **ERROR** | Teknisk fejl |

### Synkronisering af transaktioner

1. Gå til **Bankafstemning**.
2. Klik på **Synkronisér** ved den relevante bankforbindelse.
3. Systemet henter nye transaktioner og viser synkroniseringsstatus.
4. Nye transaktioner markeres som UMATCHET.

### Import af kontoudtog (CSV)

1. Gå til **Bank → Import**.
2. Upload din CSV-fil fra banken.
3. Map kolonnerne (dato, tekst, beløb, saldo).
4. Klik på **Importér**.

### Automatisk afstemning (AI-match)

Når banktransaktioner er importeret, forsøger AlphaFlow automatisk at matche dem med eksisterende journalposter via et 3-niveau match-system:

| Niveau | Metode | Beskrivelse |
|--------|--------|-------------|
| 1 | **Regelbaseret** | Eksakt match på beløb, dato og beskrivelse |
| 2 | **Fuzzy match** | Tolerante matcher med små afvigelser |
| 3 | **LLM-match** | AI-assisteret matching for komplekse tilfælde |

Matchede poster markeres automatisk som afstemt med konfidensniveau.

### Manuel afstemning

1. Gå til **Bankafstemning**.
2. Find den umatchede bankpost.
3. Klik på **Afstem manuelt**.
4. Vælg den tilhørende journalpost.
5. Bekræft afstemningen.

> **Tip:** Marker transaktioner som "ikke bogførte", hvis de endnu ikke har en tilsvarende journalpost. Du kan altid afstemme dem senere.

---

## 13. Periodeafslutning & Årsafslutning

### Åbne og lukke perioder

AlphaFlow arbejder med regnskabsperioder (måneder). En periode kan have statussen **ÅBEN** eller **LUKKET**.

1. Gå til **Perioder** i sidebjælken.
2. Find den periode, der skal lukkes.
3. Bekræft, at alle poster for perioden er bogført.
4. Klik på **Luk periode**.

> **Bemærk:** Når en periode er lukket, kan der ikke bogføres nye poster i den. Kun administratorer kan genåbne en lukket periode.

### Årsafslutning

Årsafslutningen samler årets resultat og overfører det til egenkapitalen. AlphaFlow tilbyder en trin-for-trin guide:

1. Sikr dig, at alle perioder for året er lukkede.
2. Gå til **Årsafslutning** (eller **Moms & Årsregnskab → Årsafslutning**).
3. Gennemgå det beregnede resultat (overskud eller underskud).
4. Bekræft balancekontroller.
5. Klik på **Udfør årsafslutning**.

Systemet opretter automatisk en journalpost, der overfører resultatet:

- **Overskud:** Debet på konto 3300 (Årets resultat), kredit på konto 3400 (Overført resultat)
- **Underskud:** Debet på konto 3400, kredit på konto 3300

> **Vigtigt:** Årsafslutningen er en endelig handling. Kontakt din revisor, hvis du er i tvivl om proceduren.

---

## 14. Rapportering

AlphaFlow tilbyder en række finansielle rapporter, der alle kan eksporteres til CSV.

### Resultatopgørelse (Income Statement)

1. Gå til **Rapporter** i sidebjælken.
2. Vælg fanen **Resultatopgørelse**.
3. Vælg periode.
4. Se en oversigt over årets indtægter og omkostninger med nettoresultatet.
5. Eksporter som CSV.

### Balance (Balance Sheet)

1. Gå til **Rapporter → Balance**.
2. Vælg periode.
3. Se en oversigt over virksomhedens aktiver, passiv og egenkapital.
4. Eksporter som CSV.

### Hovedbog (Ledger)

1. Gå til **Hovedbog** i sidebjælken.
2. Vælg periode og evt. specifik konto.
3. Se alle transaktioner pr. konto med løbende saldo.
4. Eksporter som CSV.

### Aldersopdeling (Aging Reports)

Aldersopdelingen viser tilgodehavender og leverandørgæld opdelt i tidsintervaller:

| Interval | Beskrivelse |
|----------|-------------|
| 0–30 dage | Nye forfaldne beløb |
| 30–60 dage | Kort forsinkelse |
| 60–90 dage | Middels forsinkelse |
| 90+ dage | Lang forsinkelse |

Du kan skifte mellem tilgodehavender (debitorer) og leverandørgæld (kreditorer).

> **Krav:** Aldersopdeling kræver Månedlig-abonnement eller derover (Advanced Reports).

### Likviditet (Cash Flow)

1. Gå til **Likviditet** i sidebjælken.
2. Se kontantstrøm opdelt i:
   - Driftsaktiviteter
   - Investeringsaktiviteter
   - Finansieringsaktiviteter
3. Sammenlign perioder.

### Kontantstrømsprognose

AlphaFlow tilbyder en AI-baseret kontantstrømsprognose, der forudsætter den næste måneds likviditet baseret på de seneste 3 måneders historik. Prognosen vises som et søjlediagram med trendindikatorer.

> **Krav:** Kontantstrømsprognose kræver Månedlig-abonnement eller derover.

---

## 15. Budgettering

### Oprettelse af budget

1. Gå til **Budgetter** i sidebjælken.
2. Klik på **Nyt budget**.
3. Angiv navn og år.
4. Tilføj budgetlinjer pr. konto med månedlige beløb (januar–december).
5. Gem.

### Budget vs. Faktisk

AlphaFlow beregner automatisk afvigelsen mellem budgetterede og faktiske beløb:

1. Gå til **Budgetter** og vælg et budget.
2. Se kolonnen **Afvigelse** (faktisk − budget) og **Afvigelse %**.
3. Tendenspile viser om du er over eller under budget.

> **Krav:** Budget vs. Faktisk analyse kræver Månedlig-abonnement eller derover (Advanced Reports).

### Projektbudgetter

Projektbudgetter oprettes under det enkelte projekt (se afsnit 16) og fungerer på samme måde, men er begrænset til projektets konti og periode.

---

## 16. Projektregnskab

### Oversigt

Projektregnskab lader dig organisere økonomien pr. projekt med separate budgetter, transaktioner og rapporter. Dette er ideelt for virksomheder, der arbejder med projekter, opgaver eller afdelinger.

> **Krav:** Projektregnskab kræver Business Extended (3-årig) abonnement, eller at App Ejer har aktiveret projekttilstand for din virksomhed.

### Oprettelse af projekt

1. Gå til **Projekter** i sidebjælken.
2. Klik på **Nyt projekt**.
3. Udfyld:

   | Felt | Beskrivelse |
   |------|-------------|
   | Navn | Projektnavn |
   | Kode | Unik projektkode (automatisk eller manuel) |
   | Status | Aktiv, På pause, Afsluttet, Annulleret |
   | Startdato | Projektets startdato |
   | Slutdato | Projektets slutdato |
   | Kunde | Tilknyt en kontakt som kunde |
   | Budgettotal | Samlet projektbudget |

4. Klik på **Gem**.

### Projektvisning

Når du er i et projekt, skifter AlphaFlow til **projekttilstand**:

- Sidebjælken skjuler eller nedtoner irrelevante menupunkter.
- Transaktioner, fakturaer og journalposter filtreres automatisk til projektet.
- Datoer defaulter til projektets start- og slutdato.
- En projektvælger vises i topbaren, så du let kan skifte projekt eller forlade projekttilstand.

### Projektbudget

1. Åbn projektet og vælg fanen **Budget**.
2. Tilføj budgetlinjer pr. konto med månedlige beløb.
3. Se budget vs. faktisk for projektet.

### Projekt rapport

1. Åbn projektet og vælg fanen **Rapport**.
2. Se projektets resultatopgørelse med omsætning, omkostninger og resultat.
3. Sammenlign med projektbudgettet.

---

## 17. Tilbagevendende Poster

### Oversigt

Tilbagevendende poster lader dig automatisere gentagne transaktioner som husleje, forsikringer, abonnementer m.m.

### Oprettelse af tilbagevendende post

1. Gå til **Køb & Kvitteringer → Tilbagevendende**.
2. Klik på **Ny tilbagevendende post**.
3. Angiv:
   - Navn og beskrivelse
   - Frekvens: Daglig, Ugentlig, Månedlig, Kvartalsvis, Årlig
   - Næste eksekveringsdato
   - Posterlinjer (debet/kredit)
4. Gem.

### Status

| Status | Beskrivelse |
|--------|-------------|
| **AKTIV (ACTIVE)** | Posten eksekveres automatisk efter tidsplan |
| **PAUSE (PAUSED)** | Posten er midlertidigt sat på pause |
| **AFSLUTTET (COMPLETED)** | Posten er afsluttet og eksekveres ikke længere |

### Eksekveringshistorik

For hver tilbagevendende post kan du se historik over alle eksekveringer med dato, oprettede journalposter og status.

---

## 18. Fremmedvaluta

### Understøttede valutaer

AlphaFlow understøtter bogføring i følgende valutaer udover DKK:

| Valuta | ISO-kode | Beskrivelse |
|--------|----------|-------------|
| Dansk krone | DKK | Standardvaluta (basisvaluta) |
| Euro | EUR | Fælles europæisk valuta |
| Amerikansk dollar | USD | US dollar |
| Britisk pund | GBP | Sterling |
| Svensk krone | SEK | Svensk valuta |
| Norsk krone | NOK | Norsk valuta |

### Automatiske valutakurser

AlphaFlow henter automatiske valutakurser fra **European Central Bank (ECB) — Frankfurter API**:

- Kurserne opdateres dagligt.
- Alle beløb konverteres til DKK (basisvaluta) ved bogføring.
- Valutakursen gemmes på den enkelte post, så historiske konverteringer altid kan genskabes.
- Systemet cacher valutakurser med en time-varighed (TTL) for optimal ydeevne.

### Valutakonvertering ved bogføring

Når du bogfører en post i en fremmed valuta:

1. Vælg valuta for posten (f.eks. EUR).
2. Indtast beløb i fremmed valuta.
3. AlphaFlow konverterer automatisk til DKK baseret på dagens ECB-kurs.
4. Både det oprindelige beløb og det konverterede DKK-beløb gemmes.
5. Kursen fremgår af journalposten og kan ses i detaljvisningen.

---

## 19. SAF-T Eksport

### Hvad er SAF-T?

SAF-T (Standard Audit File for Tax) er et internationalt standardiseret filformat, som Erhvervsstyrelsen og Skattestyrelsen kan kræve udleveret ved skattekontrol. I Danmark kaldes det *SAF-T Financial DK v1.0*.

Filen indeholder en komplet kopi af dit regnskab i et maskinlæsbart XML-format, herunder:

- Kontoplan
- Momskoder og satser
- Finansposter med alle linjer
- Samlet oversigt (totals)

### Sådan eksporterer du

1. Gå til **Eksport** i sidebjælken.
2. Vælg **SAF-T eksport**.
3. Angiv periode (start- og slutdato).
4. Klik på **Generér SAF-T**.
5. Download den genererede XML-fil.

### Validering af eksport

AlphaFlow validerer automatisk filen før eksport. Valideringen tjekker bl.a.:

- Alle obligatoriske felter er udfyldt
- CVR-nummeret har korrekt format (8 cifre)
- Landekoden er sat til "DK"
- Versionen er "1.0"
- Regnskabsperioden er logisk (startdato ≤ slutdato)
- Momssatserne er gyldige danske satser

Hvis der findes fejl, vises de med forslag til rettelse. Du kan altid genkøre eksporten efter at have rettet data.

> **Tip:** Eksporter SAF-T filen regelmæssigt — f.eks. ved hvert kvartalsafslutning — så du altid har en opdateret fil klar, hvis Erhvervsstyrelsen anmoder om den.

> **Krav:** SAF-T eksport kræver Månedlig-abonnement eller derover (Data Export).

---

## 20. OIOUBL Eksport

### Hvad er OIOUBL?

OIOUBL er den danske standard for elektroniske fakturaer (e-fakturaer). Formatet bygger på international Peppol BIS Billing 3.0 standard og bruges, når offentlige myndigheder og store virksomheder kræver elektronisk fakturering.

### Sådan eksporterer du en faktura som OIOUBL

1. Gå til **Fakturaer** og find den ønskede faktura.
2. Klik på **Eksportér OIOUBL**.
3. Systemet genererer automatisk en OIOUBL XML-fil baseret på fakturaens data.
4. Valideringen udføres automatisk.
5. Download filen og upload den til modtagerens fakturaportal.

### Understøttede Fakturatyper

| Fakturakode | Type | Beskrivelse |
|-------------|------|-------------|
| 380 | Salgsfaktura | Almindelig faktura til kunde |
| 381 | Kreditnota | Tilbagebetaling eller korrektion af faktura |
| 384 | Rettet faktura | Rettelse af en eksisterende faktura |
| 389 | Selvfaktura | Selvfakturering ved leverandørfakturering |

### Validering

AlphaFlow validerer automatisk OIOUBL filen før eksport, herunder:

- Korrekt XML-struktur i henhold til Peppol BIS Billing 3.0
- Udstederoplysninger (navn, CVR, adresse)
- Modtageroplysninger
- Linjevarer med korrekte beløb og momskoder
- Totalbeløb stemmer overens med linjesum
- Momskategorier (S: Standard 25%, Z: Nulsats, E: Fritaget)

> **Krav:** Manuel OIOUBL-eksport er tilgængelig for alle abonnementer. Automatisk e-faktura via Peppol/NemHandel kræver Business (2-årig) eller derover.

---

## 21. Årsregnskab & iXBRL

### Årsregnskab

AlphaFlow kan generere årsregnskaber i flere formater til brug for Erhvervsstyrelsen:

**Regnskab Basis (CSV-eksport):**

1. Gå til **Moms & Årsregnskab → Årsregnskab**.
2. Vælg det ønskede regnskabsår.
3. Klik på **Eksportér CSV (Regnskab Basis)**.
4. Filen indeholder resultatopgørelse, balance og statusopgørelse i SKAT's Regnskab Basis format.

**Regnskab Special (iXBRL-eksport):**

1. Gå til **Moms & Årsregnskab → Årsregnskab**.
2. Vælg det ønskede regnskabsår.
3. Klik på **Eksportér iXBRL (Regnskab Special)**.
4. Filen indeholder årsrapporten i iXBRL-format med dansk FSA taxonomy.

> **Krav:** iXBRL-eksport kræver Månedlig-abonnement eller derover (Annual Report iXBRL).

### Moms-API integration med Skattestyrelsen

AlphaFlow integrerer med Skattestyrelsens Moms-API til automatisk momsindberetning:

1. Gå til **Moms & Årsregnskab → Momsrapport**.
2. Vælg periode (Q1–Q4 eller Årlig).
3. Systemet beregner automatisk udgående/indgående moms og netto moms.
4. Klik på **Indberet til Skattestyrelsen** for at sende via Moms-API.
5. Modtag kvittering og bekræftelse fra Skattestyrelsen.

> **Vigtigt:** Moms-API integrationen kræver, at virksomheden er tilmeldt TastSelv Erhverv. Indberetningen foretages via sikker OAuth2-autentificering med Skattestyrelsen.

### Indsendelsesstatus

| Status | Beskrivelse |
|--------|-------------|
| **DRAFT** | Opgørelse oprettet |
| **SUBMITTED** | Indsendt til Skattestyrelsen |
| **ACCEPTED** | Accepteret |
| **REJECTED** | Afvist — skal rettes |
| **ERROR** | Teknisk fejl |

---

## 22. Udbyderskift

### Udbyderskift-checkliste

AlphaFlow tilbyder en dedikeret checkliste-side til udbyderskift under **Eksport → Udbyderskift**. Checklisten sikrer en sikker og komplet overgang til en ny bogføringssystemudbyder i overensstemmelse med Bogføringsloven og BEK 98.

### Portabel JSON-eksport

AlphaFlow kan eksportere alle virksomhedsdata som en portabel JSON-fil:

1. Gå til **Eksport → Udbyderskift**.
2. Klik på **Eksportér data (JSON)**.
3. Systemet genererer en komplet eksportfil med:
   - Virksomhedsoplysninger (navn, CVR, adresse)
   - Kontoplan med alle konti
   - Journalposter med alle linjer
   - Fakturaer og kreditnotaer
   - Bilag og dokumenter
   - MOMS-register
   - Standardkontoplan-mapping
4. Eksportfilen indeholder en **GUID** (unik identifikator) og en **SHA-256 checksum** til verifikation af filintegritet.

### 8-trins tjekliste for udbyderskift

| Trin | Handling | Beskrivelse |
|------|----------|-------------|
| 1 | Eksportér alle data | Generer portabel JSON-eksport med GUID og checksum |
| 2 | Verificér eksporten | Tjek SHA-256 checksum og åbn filen for at bekræfte indhold |
| 3 | Download bilag | Eksportér og gem alle vedhæftede bilag separat |
| 4 | Bekræft lukkede perioder | Sørg for, at alle perioder er korrekt lukkede og afsluttet |
| 5 | Download backup | Opret en manuel backup af hele virksomheden |
| 6 | Meddel udbyder | Informér den nye udbyder om eksportformat og GUID |
| 7 | Importér i nyt system | Overfør data til den nye bogføringssystemudbyder |
| 8 | Bekræft overførsel | Verificér at alle data er korrekt overført i det nye system |

### BEK 98 overholdelse

Udbyderskift-funktionen er designet til at overholde Bekendtgørelse nr. 98 af 13. februar 2024 (BEK 98) om elektronisk bogføring:

- **Data-portabilitet:** Alle data eksporteres i et maskinlæsbart format (JSON).
- **Integritet:** SHA-256 checksum sikrer, at filen ikke er ændret under overførslen.
- **5-års opbevaring:** AlphaFlow bevarer en kopi af eksportfilen i mindst 5 år.
- **Udgangsrapport:** Eksporten genererer en udgangsrapport med dato, GUID og oversigt over eksporterede data.

> **Tip:** Udfør altid udbyderskift i samarbejde med din revisor for at sikre, at alt er korrekt overført og afstemt.

---

## 23. Backup og Gendannelse

### Automatiseret backup

AlphaFlow udfører automatisk backup af din virksomheds data med jævne mellemrum:

| Type | Hyppighed | Opbevaring |
|------|-----------|------------|
| Timebackup | Hver time | Seneste 24 |
| Dagsbackup | Hver dag | Seneste 30 |
| Ugebackup | Hver uge | Seneste 52 |
| Månedsbackup | Hver måned | Seneste 60 |

Alle backup-filer gemmes som krypterede (AES-256-GCM) ZIP-arkiver med tilhørende SHA-256 checksum, så du kan verificere filens integritet.

### Manuel backup

1. Gå til **Backup** i sidebjælken.
2. Klik på **Opret backup nu**.
3. Systemet opretter en manuel backup, der gemmes i 90 dage.

### Upload og gendannelse fra fil

1. Gå til **Backup**.
2. Klik på **Upload og gendan**.
3. Vælg en backup-fil (.zip) fra din computer.
4. Bekræft gendannelsen.

### Gendannelse af data

1. Gå til **Backup** og find den ønskede backup.
2. Klik på **Gendan**.
3. Bekræft handlingen.

> **Sikkerhed:** Før gendannelsen opretter systemet automatisk en sikkerhedskopi af din nuværende data. Hvis gendannelsen mislykkes, rulles ændringerne automatisk tilbage.

### 5-års opbevaringspligt

I henhold til Bogføringsloven §15 skal regnskabsmateriale opbevares i mindst 5 år. AlphaFlow opbevarer dine data sikkert i skyen og sikrer, at backup-filer opbevares med korrekte checksums til verifikation.

> **Vigtigt:** Slet aldrig gamle backup-filer manuelt. De kan være nødvendige ved skattekontrol eller revision.

---

## 24. Hermes AI-assistent

### Hvad er Hermes?

Hermes er AlphaFlows indbyggede AI-regnskabsrådgiver — en chat-baseret assistent, der kan svare på spørgsmål om dansk regnskab, moms, skat, bogføringsregler og meget mere. Hermes er specialtrænet i dansk regnskabslovgivning og har adgang til en omfattende videnbase.

> **Krav:** Hermes kræver Pro (årligt) abonnement eller derover, medmindre App Ejer har aktiveret det for din virksomhed.

### Aktivering af Hermes

1. Gå til **Indstillinger → Hermes**.
2. Aktiver **Hermes AI-assistent**.
3. Vælg om Hermes må læse dine virksomhedsdata (dataadgang).
4. Vælg personlighed: **Professionel**, **Venlig** eller **Kortfattet**.

> **Dataadgang:** Når dataadgang er aktiveret, kan Hermes se din virksomheds balance, indtægter, udgifter, momsstatus og lignende, hvilket giver mere præcise og kontekstspecifikke svar. Dataadgang er frivillig og kan altid deaktiveres.

### Brug af Hermes

1. Klik på Hermes-uglen (svævende knap) i nederste højre hjørne.
2. Chatpanelet åbnes.
3. Skriv dit spørgsmål i chatten.
4. Hermes svarer med streaming-svar i realtid.
5. Du kan stille opfølgende spørgsmål i samme samtale.

### Hermes' kapaciteter

Hermes kan hjælpe med:

- **Momsfrister og beregninger** — hvornår skal moms indberettes? Hvad er fristen?
- **Bogføringsregler** — hvordan bogføres et bestemt køb? Hvilken konto?
- **SKAT-vejledning** — henvisninger til gældende regler og love
- **Årsafslutning** — trin-for-trin vejledning
- **Dansk skatteret** — selskabsskat, personbeskatning, fradrag
- **EU-handel** — regler for grænsehandel, intrastat, føringsmoms
- **Erhvervsstyrelsen** — indberetningskrav, CVR, Virk.dk
- **Regnskabsstandarder** — FRS 1–12, IFRS
- **Lønadministration** — feriepenge, ATP, e-indkomst
- **Virksomhedsdata** — (kun med dataadgang) aktuelle tal, momsstatus, påmindelser

### Hermes-påmindelser

Hermes kan sende proaktive påmindelser om:

- Momsfrister
- Årsregnskabsfrister
- Forfaldne fakturaer
- Andre vigtige deadlines

Påmindelser vises som kort i nederste højre hjørne og forsvinder automatisk efter 8 sekunder.

### Rate limiting

For at sikre fair brug er Hermes underlagt rate limiting pr. virksomhed:

| Vindue | Standard grænse |
|--------|-----------------|
| Burst (pr. minut) | 10 beskeder |
| Time | 40 beskeder |
| Dag | 120 beskeder |
| Måned | 2.000 beskeder |

> **Bemærk:** Rate limits kan være højere, afhængigt af din virksomheds konfiguration.

### Videnbase (Knowledge Base)

Hermes bruger en RAG-videnbase (Retrieval-Augmented Generation) med semantisk søgning til at finde relevante dokumenter, før der svares. Videnbasen indeholder:

- Denne brugsvejledning
- Dansk regnskabslovgivning og vejledninger
- Momsregler og frister
- Bogføringslovens krav

App Ejer (SuperDev) kan administrere videnbasen og tilføje, redigere eller slette dokumenter via Hermes Oversight.

---

## 25. Abonnementer & Adgang

### Abonnementsplaner

AlphaFlow tilbyder 5 abonnementsplaner med stigende funktionalitet:

| Plan | Månedlig pris | Binding | Sæder | Nøglefunktioner |
|------|--------------|---------|-------|-----------------|
| **Gratis** | 0 kr. | Ingen | 1 | Basisbogføring, manuel OIOUBL, demo-bank |
| **Månedlig** | 199 kr./md. | Ingen | 3 | Ægte bank, avancerede rapporter, data eksport, iXBRL |
| **Pro (Årlig)** | 169 kr./md. | 12 md. | 5 | Alt i Månedlig + Hermes AI |
| **Business (2-årig)** | 149 kr./md. | 24 md. | Ubegrænset | Alt i Pro + Auto e-faktura, ubegrænsede sæder |
| **Business Extended (3-årig)** | 145 kr./md. | 36 md. | Ubegrænset | Alt i Business + Projektregnskab |

> Priser for årlige og flerårige planer opkræves som et samlet beløb for bindingsperioden.

### Funktionsoversigt pr. plan

| Funktion | Gratis | Månedlig | Pro | Business | Business Ext. |
|----------|--------|----------|-----|----------|---------------|
| Manuel e-faktura (OIOUBL) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Ægte bankintegration | ❌ | ✅ | ✅ | ✅ | ✅ |
| Avancerede rapporter | ❌ | ✅ | ✅ | ✅ | ✅ |
| Data eksport (CSV/PDF) | ❌ | ✅ | ✅ | ✅ | ✅ |
| Årsrapport iXBRL | ❌ | ✅ | ✅ | ✅ | ✅ |
| Hermes AI-assistent | ❌ | ❌ | ✅ | ✅ | ✅ |
| Auto e-faktura (Peppol) | ❌ | ❌ | ❌ | ✅ | ✅ |
| Ubegrænsede sæder | ❌ | ❌ | ❌ | ✅ | ✅ |
| Projektregnskab | ❌ | ❌ | ❌ | ❌ | ✅ |

### Gratis prøveperiode

Alle nye brugere får en **60-dages gratis prøveperiode** med fuld adgang til alle funktioner. Efter prøveperioden nedgraderes kontoen til Gratis-planen, medmindre du opgraderer.

### Betaling via Flatpay/Frisbii

AlphaFlow bruger Flatpay (Frisbii) som betalingsudbyder:

1. Vælg din plan fra kontrolpanelet eller indstillinger.
2. Du videresendes til Flatpay's sikre betalingsside.
3. Gennemført betaling aktiverer planen med det samme.
4. Du modtager en bekræftelses-e-mail.

### TokenPay-adgang (.tbkey)

Alternativt kan du få adgang til AlphaFlow via et **TokenPay-bevis (.tbkey-fil)**. Et .tbkey-bevis giver:

- **Fuld skriveadgang** (read_write) til platformen
- **Alle funktioner** (svarende til Business Extended)
- Adgang i den periode, beviset dækker

**Sådan aktiverer du et .tbkey-bevis:**

1. Gå til **Indstillinger → Adgang**.
2. Klik på **Upload bevis (.tbkey)**.
3. Vælg din .tbkey-fil fra computeren.
4. Systemet verificerer og dekrypterer beviset (7-trins sikkerhedskontrol).
5. Klik på **Aktivér** for at aktivere beviset.
6. Din adgang opdateres med det samme.

> **Sikkerhed:** .tbkey-filer er AES-256-GCM-krypterede og kan ikke forfalskes. Systemet verificerer automatisk bevisets gyldighed og udløbsdato.

### Adgangsniveauer

| Niveau | Beskrivelse |
|--------|-------------|
| **read_only** | Kan kun se data — kan ikke oprette eller redigere |
| **read_write** | Fuld adgang til at oprette, redigere og slette data |

> **Bemærk:** Uden et betalt abonnement eller gyldigt .tbkey-bevis har du kun read_only-adgang. Du vil se en "Opgrader adgang"-prompt, når du forsøger at oprette eller redigere data.

### Abonnementsforlængelse og binding

- **Gratis og Månedlig:** Ingen binding — kan opsiges når som helst.
- **Årlig, 2-årig og 3-årig:** Binder for den angivne periode. Ved udløb fornyes automatisk til Månedlig, medmindre andet er aftalt.

---

## 26. Bruger- & Rollestyring

### 5 roller med forskellige rettigheder

| Rolle | Niveau | Kan se data | Kan oprette poster | Kan administrere | Kan slette |
|-------|--------|-------------|-------------------|-------------------|------------|
| **Ejer** | 5 (højeste) | Ja | Ja | Ja | Ja |
| **Administrator** | 4 | Ja | Ja | Ja | Nej* |
| **Bogholder** | 3 | Ja | Ja | Nej | Nej |
| **Seer** | 2 | Ja | Nej | Nej | Nej |
| **Revisor** | 1 | Ja | Nej | Nej | Nej |

\* Administratorer kan fjerne data, men kan ikke slette virksomheden eller ændre ejerskab.

### 18 granulære tilladelser

Systemet har 18 granulære tilladelser, der fordeler sig på følgende områder:

| Område | Tilladelser | Minimumsrolle |
|--------|-------------|---------------|
| Virksomhed | Se indstillinger, redigere, overdrage, slette | VIEWER → OWNER |
| Medlemmer | Se, invitere, fjerne, ændre rolle | ADMIN → OWNER |
| Data | Læse, oprette, redigere, annullere, slette | VIEWER → ADMIN |
| Rapporter | Se, eksportere, SAF-T | VIEWER → ACCOUNTANT |
| Perioder | Lukke, åbne, årsafslutning | ACCOUNTANT → ADMIN |
| Bank | Forbinde, synkronisere | ADMIN / ACCOUNTANT |
| Backup | Oprette, gendanne | ADMIN / OWNER |

### Inviterelse af nye brugere

1. Gå til **Indstillinger → Team**.
2. Klik på **Inviter medlem**.
3. Indtast e-mailadresse og vælg rolle.
4. Modtageren får en invitation pr. e-mail og skal oprette en konto.
5. Invitationen accepteres automatisk ved første login.

> **Sæde-begrænsning:** Antallet af teammedlemmer afhænger af dit abonnement: Gratis (1), Månedlig (3), Pro (5), Business/Extended (ubegrænset).

### Virksomhedsskift

Hvis du er medlem af flere virksomheder:

1. Klik på virksomhedsnavnet øverst i venstre hjørne.
2. Vælg den ønskede virksomhed fra dropdown-menuen.
3. Alle data og menuer opdateres til den valgte virksomhed.

### Kontosletning

I overensstemmelse med Bogføringsloven og GDPR kan brugere deaktivere deres konto. Da regnskabsmateriale skal opbevares i 5 år, deaktiveres kontoen i stedet for at slettes permanent. Bogføringslovens opbevaringspligt har forrang over GDPR's ret til sletning (GDPR Art. 17(3)(c)).

---

## 27. 2-Faktor Autentificering (2FA)

### Hvad er 2FA/MFA i AlphaFlow?

AlphaFlow understøtter Multi-Faktor Autentificering (MFA) via Time-based One-Time Password (TOTP). Dette tilføjer et ekstra sikkerhedslag udover e-mail og adgangskode, hvilket beskytter mod uautoriseret adgang — også selvom adgangskoden kompromitteres.

2FA er tilgængeligt for alle brugere og kan aktiveres individuelt. Virksomhedsejere og administratorer kan desuden kræve 2FA for alle medlemmer (tenant-niveau).

### Opsætning af 2FA

1. Gå til **Indstillinger → Adgang**.
2. Klik på **Set up 2FA**.
3. Scan QR-koden med en TOTP-kompatibel app (f.eks. Google Authenticator, Authy, Microsoft Authenticator).
4. Indtast den 6-cifrede verify-kode fra appen for at bekræfte opsætningen.
5. Gem backup-koderne på et sikkert sted (koderne vises kun én gang).

> **Vigtigt:** Backup-koderne er den eneste måde at få adgang til kontoen, hvis du mister adgang til din TOTP-app. Gem dem sikkert.

### Login-flow med 2FA

Når 2FA er aktiveret for din konto:

1. Indtast e-mail og adgangskode som normalt.
2. Systemet beder om en 6-cifret kode.
3. Indtast koden fra din TOTP-app (eller brug en backup-kode).
4. Du logges ind, når koden er verificeret.

### Tenant-niveau 2FA-krav

Virksomhedsejere og administratorer kan aktivere 2FA som et obligatorisk krav for alle medlemmer:

1. Gå til **Indstillinger → Virksomhed**.
2. Aktiver **Kræv 2FA for alle medlemmer**.
3. Systemet kontrollerer, at alle medlemmer har aktiveret 2FA.
4. Medlemmer uden 2FA vises i en ikke-kompatibel liste og skal aktivere det ved næste login.

> **Bemærk:** Når tenant-2FA er aktiveret, kan individuelle brugere ikke deaktivere deres egen 2FA. Kun ejere og administratorer kan slå tenant-kravet fra.

### Backup-koder

- Hver bruger får **10 engangskoder** ved aktivering af 2FA.
- Koderne er SHA-256 hashede og krypteret (AES-256-GCM) i databasen.
- Hver kode kan kun bruges én gang.
- Brugte koder markeres automatisk som forbrugte.
- Nye backup-koder kan genereres via **Indstillinger → Adgang → Regenerér backup-koder** (kræver en aktuel TOTP-kode).

---

## 28. Sikkerhed & Compliance

### Datakryptering

| Område | Metode |
|--------|--------|
| Bankadgangskoder | AES-256-GCM (symmetrisk kryptering) |
| Backup-filer | AES-256-GCM (krypterede ZIP-arkiver) |
| 2FA-hemmeligheder | AES-256-GCM (krypteret lagring) |
| .tbkey bevisfiler | AES-256-GCM (krypteret lagring) |
| Data i transit | TLS 1.3 (HTTPS) |
| Adgangskoder | bcrypt med 12 salt-runder (auto-rehash) |

### Sessionsikkerhed

- Alle sessioner er beskyttet med unikke, tilfældige sessionstokens (HTTP-only cookies).
- Sessioner udløber automatisk efter 7 dage.
- Systemet sporer metadata (IP-adresse, user-agent) for hver session.
- Login-rate-limiting: maks. 5 forsøg pr. minut pr. IP-adresse.

### Audit trail

AlphaFlow fører en uforanderlig (immutable) audit-log over alle væsentlige handlinger:

- Oprettelse og ændring af data
- Login og logout
- Backup og gendannelse
- Rolle- og tilladelsesændringer
- Alle mutationer med bruger, tidsstempel og ændringsdiff

Audit-loggen kan ses under **Revisionslog** i sidebjælken.

> **Immutabilitet:** Audit-loggen er beskyttet af PostgreSQL-triggere på databaseniveau, der forhindrer UPDATE og DELETE. Dette opfylder Bogføringslovens krav om uigendrkelig dokumentation (§10-12).

### Compliance

| Lov/Krav | Opfyldelse |
|----------|------------|
| **Bogføringsloven §10-12** | Uforanderlig audit-log, fortløbende bilagsnummerering, periodelåsning |
| **Bogføringsloven §15** | 5-års opbevaring af regnskabsmateriale |
| **BEK 98** | Portabel dataeksport (JSON + SHA-256), udbyderskift-checkliste |
| **GDPR Art. 32** | Kryptering, adgangskontrol, audit-log |
| **GDPR Art. 17(3)(c)** | Konto-deaktivering i stedet for sletning (5-års opbevaringspligt har forrang) |
| **SAF-T Financial DK v1.0** | Komplet SAF-T XML-eksport |
| **OIOUBL / Peppol BIS 3.0** | E-faktura-eksport og -modtagelse |
| **PSD2** | Open Banking med læseadgang kun |

### Sikkerhedsoverskrifter (HTTP Headers)

AlphaFlow anvender følgende sikkerhedsoverskrifter:

- `X-Frame-Options: SAMEORIGIN` — forhindrer clickjacking
- `X-Content-Type-Options: nosniff` — forhindrer MIME-type sniffing
- `X-XSS-Protection: 1; mode=block` — beskyttelse mod XSS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(self)` — kameraadgang kun for scanning
- `Cache-Control: no-store` — ingen caching af API-svar og HTML

---

## 29. PWA & Mobil

### Progressive Web App

AlphaFlow er en Progressive Web App (PWA), hvilket betyder, at du kan installere den som en app på både desktop og mobil — uden at bruge en app-butik.

### Installation på mobil

**Android (Chrome):**
1. Besøg AlphaFlow i Chrome.
2. Du vil se en "Tilføj til startskærm"-banner.
3. Klik på **Installér**.

**iOS (Safari):**
1. Besøg AlphaFlow i Safari.
2. Tryk på del-ikonet (firkant med pil).
3. Vælg **Tilføj til startskærm**.

> **Tip:** AlphaFlow viser automatisk en installationsprompt, når du besøger platformen på en mobil enhed.

### Mobile funktioner

AlphaFlow er fuldt responsivt og optimeret til mobil brug:

- **Mobilt bundnavigation:** Dashboard, Transaktioner, Fakturaer, Rapporter
- **Svævende handlingsknap (FAB):** Opret ny postering, faktura eller kontakt med ét klik
- **Svej-navigation:** Stryg venstre/højre for at skifte mellem visninger
- **Kamera-scanning:** Brug mobilen kamera til at scanne kvitteringer (OpenCV kantdetektering)
- **Kollapsende sidebjælke:** Sheet-baseret navigation på små skærme

### Offline-understøttelse

AlphaFlows service worker cacher statiske ressourcer og API-svar, så du kan:

- Se tidligere indlæste data, når du er offline
- Få en tydelig "Du er offline"-meddelelse
- Automatisk synkronisere, når forbindelsen genoprettes

> **Bemærk:** Offline-tilstand er begrænset til læsning. Du kan ikke oprette eller redigere data uden internetforbindelse.

### Mørk tilstand (Dark Mode)

AlphaFlow understøtter mørk tilstand:

1. Gå til **Indstillinger → Profil**.
2. Vælg **Lyst**, **Mørkt** eller **System** (følger dit operativsystems indstilling).

### Sprog

AlphaFlow er tilgængeligt på dansk og engelsk. Sproget følger din browsers indstilling, men kan ændres under indstillinger.

---

## 30. Kommandopalette & Tastaturgenveje

### Kommandopalette (⌘+K)

Åbn kommandopaletten med **⌘+K** (Mac) eller **Ctrl+K** (Windows/Linux) for hurtigt at:

- Søge efter visninger og funktioner
- Navigere til en specifik side
- Oprette nye transaktioner, fakturaer, kontakter
- Udføre handlinger som eksport, backup, etc.

Kommandopaletten er kontekstafhængig og viser kun tilgængelige funktioner baseret på dit abonnement og projekttilstand.

### Tastaturgenveje

| Genvej | Handling |
|--------|----------|
| `⌘/Ctrl + K` | Åbn kommandopalette |
| `1`–`9` | Hurtignavigation til visninger |
| `N` | Opret ny postering |
| `I` | Opret ny faktura |
| `?` | Vis tastaturgenveje |

> **Tip:** Klik på **?**-ikonet i sidebjælken eller tryk `?` for at se alle tilgængelige tastaturgenveje.

---

## 31. Notifikationer & Realtidssynkronisering

### Notifikationscenter

Klik på klokke-ikonet i topbaren for at åbne notifikationscenteret. Her ser du:

- **Forfaldne fakturaer** — fakturaer, der har overskredet forfaldsdatoen
- **Momsfrister** — kommende momsindberetningsfrister
- **Bankafstemningspåmindelser** — ikke-afstemte banktransaktioner
- **Journalpåmindelser** — kladder, der afventer bogføring

Du kan markere alle notifikationer som læst med ét klik.

### Realtidssynkronisering

AlphaFlow bruger WebSocket (Socket.IO) til at synkronisere data i realtid på tværs af alle dine enheder:

- Når du opretter eller ændrer data på én enhed, opdateres alle andre åbne faner automatisk.
- Ændringer synkroniseres pr. virksomhed — kun relevante opdateringer sendes.
- Forbindelsesstatus vises i Hermes-panelet.

---

## 32. Demo-tilstand

### Hvad er demo-tilstand?

AlphaFlow tilbyder en demo-tilstand, hvor du kan udforske platformen med simulerede data. Dette er nyttigt for:

- Nye brugere, der vil afprøve systemet
- Undervisningsformål
- Test af funktioner uden at påvirke rigtige data

### Aktivering af demo-tilstand

1. Gå til **Indstillinger → Virksomhed**.
2. Aktivér **Demo-tilstand**.
3. Systemet opretter automatisk demonstrationsdata.

> **Bemærk:** I demo-tilstand er alle data simulerede. Du kan se alt, men du kan ikke oprette, redigere eller slette data. Dette sikrer, at demonstrationsdata forbliver konsistente.

### Demo-bank

På Gratis-abonnementet får du adgang til en demo-bank med simulerede transaktioner. Ægte bankintegration (Nordigen) kræver Månedlig-abonnement eller derover.

---

## 33. App Ejer (SuperDev) & Oversight

### Hvad er SuperDev?

SuperDev er AlphaFlows App Ejer-rolle, der giver adgang til tværgående administration af alle virksomheder (tenants) på platformen.

### Oversight-tilstand

SuperDev kan skifte til oversight-tilstand for at se en hvilken som helst virksomheds data i skrivebeskyttet mode:

1. Gå til **Indstillinger → Oversight** (eller **Hermes Oversight** i sidebjælken).
2. Vælg en virksomhed fra listen.
3. Du skifter til oversight-tilstand med læseadgang til alle data.
4. Klik på **Afslut oversight** for at vende tilbage til din egen virksomhed.

> **Vigtigt:** I oversight-tilstand kan du IKKE oprette, redigere eller slette data. Alle mutationer er blokeret.

### Tenant-administration

SuperDev kan:

- Se alle virksomheder og deres abonnementer
- Ændre abonnementsplan for enhver virksomhed
- Administrere prøveperioder (starte, forlænge, afslutte)
- Aktivere/deaktivere specifikke funktioner pr. virksomhed (projekttilstand, Hermes)
- Se live status og brugsstatistik

### Hermes Oversight

SuperDev kan administrere Hermes AI for alle virksomheder:

- Aktivere/deaktivere Hermes pr. tenant
- Konfigurere rate limits pr. tenant
- Se brugsstatistik og samtalehistorik
- Administrere videnbasen (tilføje, redigere, slette dokumenter)
- Genindeksere videnbasedokumenter

---

## 34. Support og Kontakt

### Sådan får du hjælp

- **Hermes AI:** Brug Hermes-chat-assistenten til at få hurtige svar på regnskabsspørgsmål.
- **Kommandopalette:** Tryk **⌘+K** for hurtigt at finde funktioner.
- **Hjælpeside:** Klik på spørgsmålstegnet (?) i interface for at få vist kontekstafhængig hjælp.
- **Videnbase:** Besøg vores dokumentation for detaljerede guides og ofte stillede spørgsmål.
- **E-mail:** Kontakt support via e-mail for tekniske spørgsmål eller fejl.

### Fejlrapportering

Oplever du en fejl i systemet?

1. Beskriv fejlen så præcist som muligt (hvad du gjorde, hvad der skete, hvad du forventede).
2. Notér dato og klokkeslæt.
3. Tag et skærmbillede, hvis muligt.
4. Send fejlrapporten via e-mail eller supportformularen.

> **Tip:** Tjek audit-loggen under **Revisionslog**, hvis du har brug for at spore, hvornår en bestemt handling blev udført.

### Tjenestearkitektur

AlphaFlow består af 6 tjenester, der kører sammen og rutes gennem en Caddy reverse proxy:

| Tjeneste | Port | Teknologi | Database | Formål |
|----------|------|-----------|----------|--------|
| **AlphaFlow** (hovedapp) | 3000 | Next.js 16 + Prisma | PostgreSQL (Neon) | Hovedregnskabsprogram |
| **Hermes Agent** | 3004 | Bun + Socket.IO | PostgreSQL | AI-chatassistent |
| **Knowledge Service** | 3006 | Bun + HTTP | PostgreSQL (pgvector) | RAG videnbase |
| **Scanner Service** | 3005 | Python + FastAPI | SQLite | OCR/VLM dokumentscanning |
| **TokenPay Access** | 3100 | Bun + Hono | SQLite | Bevisbaseret adgangskontrol |
| **Notification WS** | 3001 | Bun + Socket.IO | In-memory | Realtidsnotifikationer |

Alle tjenester administreres samlet via PM2 i produktionsmiljøet.

---

*AlphaFlow er udviklet med fokus på dansk compliance, brugervenlighed og sikkerhed. Alle funktioner er designet til at overholde gældende dansk lovgivning, herunder Bogføringsloven, BEK 98 og GDPR.*
