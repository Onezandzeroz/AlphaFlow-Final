# Implementeringsplan — prioriteret efter ROI for målgruppen

**Dokumenttype:** Produktroadmap (intern)
**Baggrund:** Konkurrentanalyse mod Dinero, Billy by Shine og e-conomic (Task 7)
**Status:** PARKERET — ingen implementering påbegyndes, før registreringsprocessen hos Erhvervsstyrelsen (standardsystemanmeldelse, sag X26-CT-19-ML) er afsluttet
**Målgruppe:** Danske enkeltmandsvirksomheder, mikro-ApS'er og små bogføringskontorer
**Dato:** Oprettet på baggrund af konkurrentanalyse (Dinero, Billy by Shine, e-conomic)

---

## 1. Baggrund og formål

Konkurrentanalysen (jvf. worklog Task 7) kortlagde AlphaFlows funktionalitet mod de tre største danske regnskabsplatforme. Resultatet var **7 verificerede funktionalitetsmangler** — alle bekræftet direkte i kodebasen med grep-verifikation, ikke blot marketingmæssige huller.

Dette dokument prioriterer udbedringen af hullerne efter **ROI for målgruppen** (ENK/mikro-ApS + små bogføringskontorer), ikke efter hvad der teknisk set er mest interessant eller hvad de store konkurrenter bygger til mellemstore virksomheder.

### Prioriteringskriterier

1. **Direkte økonomisk værdi for brugeren** — hjælper funktionen brugeren med at få penge i kassen hurtigere?
2. **Differentiering vs. konkurrenterne** — lukker funktionen et hul, kunder nævner ved valg af system?
3. **Genbrug af eksisterende komponenter** — lavere implementeringsrisiko og kortere tid til værdi
4. **Kompatibilitet med BFL-registreringen** — ingen ændringer der rører ved forretningskritisk compliance-kode uden nøje analyse

---

## 2. Konkurrenternes position (sammenfatning)

| | Dinero | Billy by Shine | e-conomic | **AlphaFlow** |
|---|---|---|---|---|
| Pris (afgørende plan) | Starter+ 297 / Pro 397 / Total 545 kr./md. | Basic 160 / Plus 295 / Complete 595 kr./md. | 249–449 kr./md. | **145–199 kr./md.** |
| Gratis | ≤100.000 kr. omsætning/12 mdr. | Free (3 fakturaer + 10 bilag/md.) | Nej (kun demo) | ≤50.000 kr./år |
| Integrationer | Webshop-API m.m. | 60+ | 300+ apps | Ingen offentlige |
| Løn | Via integrationer | Lønsystem i Plus+ | Indbygget (2025) | Nej |
| Årsregnskab | Tillæg | Tillæg fra 2.495 kr. | Eget modul | **Inkluderet (iXBRL)** |
| SAF-T-eksport | — | — | — | **Inkluderet (DK v2.1)** |
| Digital momsindberetning | Ja | Ja | Ja | **Ja (Moms-API)** |

**AlphaFlows styrker, der skal bevares:** iXBRL-årsrapport inkluderet i abonnementet, SAF-T Financial DK v2.1-eksport, digital momsindberetning via Skattestyrelsens Moms-API, hash-forseglet journal/audit-trail (BFL-parat), 60 måneders krypterede backups, offline-PWA, modtagne e-fakturaer (OIOUBL 2.1 + Peppol BIS Billing 3.0 via Sproom), Hermes AI — samt markant lavere pris.

---

## 3. Verificerede funktionalitetsmangler (grundlaget for planen)

Alle 7 huller er grep-verificeret i kodebasen (Task 7, worklog):

| # | Manglende funktion | Hos konkurrenterne | Verifikation i AlphaFlow |
|---|---|---|---|
| 1 | Rykkermodul (rykker 1/2 + inkassovarsel) | Alle tre | Kun abonnements-fornyelses-emails — intet kunde-flow |
| 2 | Tilbud → ordre → faktura-pipeline | Billy, e-conomic | Faktura findes; tilbud/ordre eksisterer ikke |
| 3 | Betalingslink/kortbetaling på fakturaer | Billy (MobilePay m.m.) | MobilePay optræder kun som demo-banktransaktion |
| 4 | Abonnementsfakturering til kunder | Billy | `recurring-entries` er interne bilag — faktura-ruten har ingen recurrence |
| 5 | Offentlig API / integrationsmarkedsplads | Billy 60+, e-conomic 300+ | ~179 ruter, alle lukket til eget frontend |
| 6 | Lønsystem | Alle tre | "Løn" er kun kontonavne (konto 60800) og hjælpetekst |
| 7 | Faktura-branding/designer (logo, farver) | Billy | PDF-template er fast — ingen branding-felter i koden |

**Konkurrenceparameter (ikke kode):** Dineros gratis-grænse er 100.000 kr./12 mdr. mod AlphaFlows 50.000 kr./år — overvejes særskilt, da det er en pris-/markedsføringsbeslutning, ikke en implementering.

---

## 4. Implementeringsplan — 6 faser prioriteret efter ROI

### Fase 1 — Rykkermodul 🥇 *Højeste prioritet*

**Hvorfor først:** Direkte penge i kassen for brugeren (forfaldne tilgodehavender er en af de hyppigste smertepunkter for ENK'er), alle tre konkurrenter har det, nemmest at bygge med maksimalt genbrug, og funktionen rører ikke compliance-kritisk kode.

**Genbrug af eksisterende komponenter:**
- Aging-rapportens 5 aldersgrupper (0-30/31-60/61-90/91-120/120+ dage) → klar logik for hvornår rykker 1/2/inkassovarsel udløses
- `src/lib/email-service.ts` + `email-templates.ts` → e-mail-afsendelse med sprogstøtte (da/en)
- `src/lib/invoice-pdf.ts` → PDF-vedhæftning af rykker
- `recurring-scheduler.ts`-cron-mønsteret → automatisk påmindelses-gennemløb

**Teknisk design:**
- Prisma: ny model `InvoiceReminder` (invoiceId, niveau 1/2/INKASSO, afsendtTidspunkt, gebyrBeløb, sprog) + felter `reminderCount` og `lastReminderAt` på `Invoice`
- Lovgivningsmæssigt: rykkergebyrer efter gældende takst (2024/25: 100 kr. rykkergebyr + renter; inkassovarsel uden gebyr) — hardcodes som konfigurerbare standarder
- API: `POST /api/invoices/[id]/remind` (manuelt) + `POST /api/reminders/run` (cron-gennemløb)
- UI: rykker-dialog på faktura-siden + "Forfaldne fakturaer"-panel på dashboard
- Plan-gating: `Feature.AdvancedReports`-familien (Månedlig+)

**Omfang/estimat:** Lille-mellem (2–3 uger)

---

### Fase 2 — Tilbud/ordre-pipeline 🥈

**Hvorfor nummer to:** Konkurrenternes mest efterspurgte salgsfunktion blandt selvstændige ( Billy: "Tilbudsmodul", "Ordrebekræftelse", "Prisoverslag"); bygger naturligt videre på Fase 1's faktura-infrastruktur.

**Teknisk design:**
- Prisma: ny model `Quote` med eget nummersekvens-system (genbruger `voucher-number.ts`-mønsteret), linjer som fakturalinjer, status: `DRAFT → SENT → ACCEPTED → EXPIRED → CONVERTED`
- API/UI spejler faktura-siden: `GET/POST /api/quotes`, `POST /api/quotes/[id]/send` (e-mail via email-service)
- **Kernefunktion: konvertér-til-faktura** — ét klik kopierer linjer + kundedata til ny faktura-kladde (nummer trækkes fra invoice-number-sekvensen)
- Plan-gating: Månedlig+

**Omfang/estimat:** Mellem (3–4 uger)

---

### Fase 3 — Abonnementsfakturering

**Hvorfor:** Vigtig for fastpris-konsulenter og håndværkere med serviceaftaler (centralt segment i målgruppen); Billy har "Abonnementsfaktura" som differentiator.

**Teknisk design:**
- Prisma: `InvoiceSubscription` (kunde, linjeskabelon, interval månedlig/kvartalvis/årlig, næsteAfstedDato, autoSend)
- Cron (recurring-scheduler-mønster): danner kladde-faktura pr. subscription, auto-send via eksisterende e-mail-flow; Business+-kunder via Sproom auto-e-faktura
- UI: abonnements-fane i faktura-afsnittet

**Omfang/estimat:** Mellem (3 uger)

---

### Fase 4 — Betalingslink/kortbetaling på fakturaer ⚠️ *Kræver kommerciel beslutning først*

**Hvorfor sidst af de kundevendte:** Høj værdi ( hurtigere betaling, MobilePay-adoption i Danmark), men kræver **PSP-aftale (MobilePay/Quickpay/Stripe) med transaktionsgebyrer** — en kommerciel beslutning, ikke blot kodning.

**Teknisk design (når aftale er på plads):**
- Betalingslink-felt på faktura (kort URL), QR-kode på PDF'en
- Status-webhook fra PSP → markerer faktura som betalt + posterer betalingstransaktion
- Plan-gating: Business+

**Omfang/estimat:** Teknisk mellem (2–3 uger efter PSP-aftale)

---

### Fase 5 — Offentlig API + webhooks

**Hvorfor:** Strategisk svar på konkurrenternes 60+/300+ integrationer; åbner for bogholderi-partnere (vigtig kanal til målgruppen "små bogføringskontorer") og webshop-integrationer.

**Teknisk design:**
- Hashed API-nøgler pr. virksomhed + rate-limits (mønster findes i `hermes-agent/rate-limiter.ts`)
- Webhook-events: `invoice.paid`, `invoice.overdue`, `vat.submitted` via notification-ws-service
- Dokumentation + minimal "app-katalog"-side
- Plan-gating: Business+ / ubegrænsede seats-tiers

**Omfang/estimat:** Mellem-stor (4–6 uger)

---

### Fase 6 — Løn → anbefalet som INTEGRATION, ikke fuldt modul

**Hvorfor ikke fuldt modul:** Skattekort/eIndkomst/ferie/ATP-regler er en hel virksomhed i sig selv (e-conomic byggede deres lønsystem over flere år), og mikro-målgruppen har stort set ingen ansatte. Fuldt lønmodul = høj risiko, lav ROI for netop vores segment.

**Anbefalet alternativ (små skridt):**
1. **Lønkladde-import:** CSV/manuel indtastning der bogfører løn på eksisterende konto 60800 + eIndkomst-CSV-eksport til DataLøn/Salary
2. **Integration** med Salary/Zenegy/DataLøn (kræver deres partnerprogram — kommerciel aftale som Fase 4)

**Omfang/estimat:** Lønkladde lille (1–2 uger); integration afhænger af partneraftale

---

### Bevidst FRIVALGT (ikke på listen)

- **Lagermodul** — ikke kerne for ENK/mikro-ApS (e-conomics modul er til detail/handel)
- **Firmakort** — kræver bank-/kortudstederaftale; lille udbredelse i mikrosegmentet
- **Erhvervslån** —Billys funktion er finansieringsformidling, ikke bogføring
- **Ændring af gratis-grænse** (50.000 → 100.000 kr.) — markedsførings-/prisbeslutning der tages særskilt med henblik på ERST-processen

---

## 5. Sekvens og afhængigheder

```
ERST-registrering afsluttet
        │
        ▼
Fase 1: Rykkermodul ──────┐
        │                 │ (genbruger samme
        ▼                 │  PDF-/email-infra)
Fase 2: Tilbud/ordre ─────┤
        │                 │
        ▼                 │
Fase 3: Abonnementsfaktura┘
        │
        ├──▶ Fase 4: Betalingslink (kræver PSP-aftale)
        │
        ├──▶ Fase 5: Offentligt API (uafhængig, kan parallels)
        │
        └──▶ Fase 6: Lønkladde (uafhængig, lille)

Fase 4, 5 og 6 er indbyrdes uafhængige og kan prioriteres frit efter Fase 1–3.
```

## 6. Risici og forbehold

- **BFL-compliance først:** Faserne rører ikke journal-/hash-kæden, men alle ændringer efter ERST-godkendelsen skal vurderes mod anmeldelsens beskrivelse af systemet — væsentlige funktionsudvidelser kan kræve orientering til Erhvervsstyrelsen
- **Fase 4 og 6 afhænger af kommercielle aftaler** (PSP/lønpartnere) — kan ikke påbegyndes uden beslutning
- **Vedligehold af sandhed i marketing:** Ingen af funktionerne må markedsføres, før de er implementeret og verificeret (jvf. Tasks 4–6-metoden: påstand → kodeverifikation → tekst)

---

*Kilde: Konkurrentanalyse Task 7 (Dinero, Billy by Shine, e-conomic — research fra dinero.dk, billy.dk/priser, e-conomic.dk + sammenligningssider, februar 2026). Alle gap-påstande grep-verificeret i AlphaFlow-kodebasen.*
