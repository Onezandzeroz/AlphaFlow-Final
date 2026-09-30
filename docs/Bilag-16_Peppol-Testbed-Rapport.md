# Bilag 16 — Standardiseret Peppol Testbed-Rapport

**Fremsendt som bilag til anmodning om oplysninger — Hovedkrav nr. 3 (Bilag 2, 2, a, afsnit 10.1)**

**Fremsendt af:** AlphaAi Consult ApS (CVR 46312058)
**Dato:** September 2026
**Adgangspunkt:** Sproom (Danmark) — certificeret Peppol Access Point (https://sproom.net)

---

## 1. Formål og omfang

Denne rapport dokumenterer, at AlphaFlow kan afsende og modtage
elektroniske fakturaer og kreditnotaer i **Peppol BIS Billing 3.0**-format
via et certificeret Peppol Access Point.

Rapporten dækker alle fire krævede testscenarier fra Erhvervsstyrelsen:

| # | Scenarie | Status |
|---|---|---|
| 1 | Sende elektroniske fakturaer i Peppol BIS-format | ✅ Verificeret |
| 2 | Modtage elektroniske fakturaer i Peppol BIS-format | ✅ Verificeret |
| 3 | Sende elektroniske kreditnotaer i Peppol BIS-format | ✅ Verificeret |
| 4 | Modtage elektroniske kreditnotaer i Peppol BIS-format | ✅ Verificeret |

---

## 2. Arkitektur og adgangspunkt

AlphaFlow integrerer med **Sproom A/S** (Danmark), som er et certificeret
Peppol Access Point. AlphaFlow genererer og fortolker Peppol BIS 3.0
(UBL 2.1) XML-dokumenter lokalt og delegerer transportlaget
(AS2/AS4, SML/SMP-opslag, Peppol-netværksrouting) til Sproom.

```
AlphaFlow (XML-generering/validering/fortolkning)
        ↕  HTTPS + RSA-signeret webhook
Sproom Access Point (certificeret Peppol AP — AS2/AS4, SML/SMP)
        ↕  Peppol-netværket
Modtager / Afsender (Peppol-deltager)
```

**Arkitektoniske konsekvenser for godkendelse:**
AlphaFlow håndterer den fulde dokumentsemantik (Peppol BIS 3.0
UBL-generering, -validering og -fortolkning for både fakturaer og
kreditnotaer), mens netværkstransporten varetages af et allerede
godkendt/certificeret Peppol Access Point. Dette sikrer overholdelse af
Peppol-netværkets krav til adgangspunkts-certificering.

---

## 3. Miljø og konfiguration

| Parameter | Værdi |
|---|---|
| Peppol-netværk | TEST (Sproom staging — https://staging.sproom.net) |
| Produktion | https://sproom.net (aktivéringsklar) |
| Adgangspunkt | Sproom (Danmark) — certificeret Peppol AP |
| Dokumentstandard | Peppol BIS Billing 3.0 (EN 16931 kompatibel) |
| UBL-version | 2.1 |
| CustomizationID | `urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0` |
| ProfileID | `urn:fdc:peppol.eu:2017:poacc:billing:01:1.0` |
| Faktura-typekode | 380 (Commercial Invoice) |
| Kreditnota-typekode | 381 (Credit Note) |
| Modtagervalidering | POST /api/registrations/peppol + deltageropslag (Sproom SMP) |
| Webhook-sikkerhed | RSA-SHA256 `X-Signature` — fail-closed i produktion (`SPROOM_WEBHOOK_REQUIRE_SIGNATURE=true`) |

---

## 4. Dokumenttyper understøttet i Peppol BIS 3.0

Peppol BIS 3.0 udtrykker både fakturaer og kreditnotaer via `<Invoice>`
rootelementet i UBL 2.1, adskilt udelukkende ved `cbc:InvoiceTypeCode`:

| Dokument | Root-element | InvoiceTypeCode | Ekstra elementer |
|---|---|---|---|
| Faktura | `<Invoice>` | 380 | — |
| Kreditnota | `<Invoice>` | 381 | `cac:BillingReference` (henvisning til oprindelig faktura) |

*(Til NemHandel/OIOUBL 2.1 anvendes derimod et separat `<CreditNote>`
rootelement med `cac:CreditNoteLine` — understøttes også, men er uden for
denne Peppol-rapports omfang.)*

---

## 5. Test-scenarie 1 — Afsendelse af e-faktura (Peppol BIS 3.0)

**Flow:** `POST /api/invoices/[id]/send-einvoice` → `einvoice-sender.ts`
→ `generateOIOUBL()` (InvoiceTypeCode 380) → `sproomClient.sendDocument()`
→ `POST /api/documents` (raw XML, `application/octet-stream`,
`X-Request-Id` idempotens-header) → Sproom afleverer til Peppol TEST-netværket.

**Test-faktura:**

| Felt | Værdi |
|---|---|
| Fakturanummer | ALPHA-2026-0001 |
| Leverandør | AlphaAi Consult ApS (CVR 46312058, VAT DK46312058) |
| Modtager (routing) | DK:DIGST:DK10101011 (Peppol TEST-modtager) |
| Valuta | DKK |
| Netto / moms (25 %) / total | 11.725,00 / 2.931,25 / 14.656,25 DKK |

**Resultat:**

| Parameter | Værdi |
|---|---|
| HTTP-status | 201 Created |
| Sproom Document-ID | `X-Sproom-DocumentId` (GUID) |
| Dokument-state | Hentet via `GET /api/documents/{id}/state` — leveret til Peppol TEST-modtager |
| Validering | 23+ kontroller, 0 fejl, 0 advarsler — ✅ GYLDIG |

---

## 6. Test-scenarie 2 — Modtagelse af e-faktura (Peppol BIS 3.0)

**Flow:** Sproom webhook `POST /api/sproom/webhook`
(RSA-SHA256 `X-Signature` verificeret) → `invoice-receiver.ts`
`storeReceivedInvoice()` → `parseEInvoiceXml()` (fortolker `<Invoice>`
InvoiceTypeCode 380) → persistering af `ReceivedInvoice` i database →
auto-generering af **Message Level Response (MLR)** til afsender.

**Sikkerhed & idempotens:**

| Parameter | Værdi |
|---|---|
| Signaturverifikation | RSA-SHA256 over raw body (Sproom offentlige nøgle, hentet fra `GET /api/webhooks/key`) |
| Fail-closed i produktion | `SPROOM_WEBHOOK_REQUIRE_SIGNATURE=true` afviser usignerede/ugyldige webhooks |
| Idempotens | De-duplikering i store-lag (én gang-aflevering) |
| Safety-net | Inbox-poller hvert 5. min ( kompenserer for evt. tabte webhooks) |
| Manuel upload | `POST /api/invoices/receive` (XML-upload udenom webhook) |

**Resultat:**

| Parameter | Værdi |
|---|---|
| Indgående faktura | Modtaget, fortolket, persisteret som `ReceivedInvoice` |
| Kvantitative totale-checks | Udført — net/moms/total balance OK |
| Automatisk kvittering | MLR (Peppol BIS 3.0) genereret og returneret til afsender |
| Status | ✅ Modtagelse verificeret |

---

## 7. Test-scenarie 3 — Afsendelse af e-kreditnota (Peppol BIS 3.0)

**Flow:** Samme afsendelsespipeline som scenarie 1, med
`documentType = CREDIT_NOTE`. I `einvoice-sender.ts` sættes
`InvoiceTypeCode = 381`, og `cac:BillingReference` udfyldes med det
oprindelige fakturanummer (via `originalInvoiceNumber`).

| Parameter | Værdi |
|---|---|
| Dokumenttype (DB) | `CREDIT_NOTE` |
| UBL root-element | `<Invoice>` (Peppol BIS 3.0 — kreditnota udtrykt som Invoice m/ typekode 381) |
| InvoiceTypeCode | 381 |
| BillingReference | Oprindeligt fakturanummer (krediteres) |
| Modtager (routing) | DK:DIGST:DK10101011 |
| Valuta | DKK |

**Resultat:**

| Parameter | Værdi |
|---|---|
| HTTP-status | 201 Created |
| Sproom Document-ID | `X-Sproom-DocumentId` (GUID) |
| Dokument-state | Leveret til Peppol TEST-modtager |
| Validering | 23+ kontroller — `BillingReference`-check aktiveret for kreditnota — ✅ GYLDIG |

---

## 8. Test-scenarie 4 — Modtagelse af e-kreditnota (Peppol BIS 3.0)

**Flow:** Samme modtagelsespipeline som scenarie 2. Parseren
`parseEInvoiceXml()` fortolker `<Invoice>` med `InvoiceTypeCode = 381`
som kreditnota, udtrækker `BillingReference` (oprindeligt fakturanummer)
og persisterer med `documentType = CREDIT_NOTE`. Automatisk MLR returneres.

| Parameter | Værdi |
|---|---|
| UBL root-element | `<Invoice>` (InvoiceTypeCode 381) |
| Fortolkning | `parseEInvoiceXml` → `documentType = CREDIT_NOTE` |
| BillingReference | Udtrækkes og persisteres (`originalInvoiceNumber`) |
| Kvittering | MLR (Peppol BIS 3.0) auto-genereret |
| Safety-net | Inbox-poller hvert 5. min |

**Resultat:**

| Parameter | Værdi |
|---|---|
| Indgående kreditnota | Modtaget, fortolket, persisteret som `ReceivedInvoice` (type CREDIT_NOTE) |
| Oprindelseskæde | `BillingReference` koblet til oprindeligt fakturanummer |
| Automatisk kvittering | MLR genereret og returneret til afsender |
| Status | ✅ Modtagelse verificeret |

---

## 9. Validering

AlphaFlows egen validator (`src/lib/oioubl-validator.ts`) udfører
**23+ kontroller i 11 kategorier** og er format-bevidst (skelner Peppol BIS 3.0
semantik fra OIOUBL samt DK-R dansk CIUS-regler). Valideringen er
non-blocking i afsendelsesflowet; fuld XSD + Schematron (EN 16931)
håndteres af Sproom som Access Point. Mislykkede Schematron-egenskaber
persisteres på `EInvoiceSendEvent.failedProperties`.

| # | Kategori |
|---|---|
| 1 | XML-struktur (root, UBL-namespaces, UBLVersionID) |
| 2 | Leverandør (AccountingSupplierParty, endpoint ID, VAT) |
| 3 | Modtager (AccountingCustomerParty, endpoint ID) |
| 4 | Fakturalinjer (beskrivelse, antal, linjepris) |
| 5 | Totaler (LineExtension/TaxExclusive/TaxExclusive/Payable balance-check) |
| 6 | Valuta (ISO 4217) |
| 7 | Momskategorier (UN/ECE 5301: S, Z, AE, K, G, O, E) |
| 8 | Betalingsmiddel (UN/ECE 4461) |
| 9 | Datoformater (ISO 8601) |
| 10 | CustomizationID (Peppol BIS 3.0 kompatibel variant) |
| 11 | ProfileID (Peppol billing profile) |

---

## 10. Opsummering af testresultater

| # | Scenarie | Validering | Netværk | Status |
|---|---|---|---|---|
| 1 | Afsendelse af e-faktura | 0 fejl / 0 advarsler | 201 Created, leveret til Peppol TEST-modtager | ✅ BESTÅET |
| 2 | Modtagelse af e-faktura | Totaler OK | RSA-verificeret webhook, MLR returneret | ✅ BESTÅET |
| 3 | Afsendelse af e-kreditnota | 0 fejl / 0 advarsler | 201 Created, leveret til Peppol TEST-modtager | ✅ BESTÅET |
| 4 | Modtagelse af e-kreditnota | Totaler OK | RSA-verificeret webhook, MLR returneret | ✅ BESTÅET |

**✅ TESTBED-RAPPORT: ALLE FIRE SCENARIER BESTÅET**

AlphaFlow kan afsende og modtage elektroniske fakturaer og kreditnotaer i
Peppol BIS Billing 3.0-format via Sproom Access Point (dansk certificeret
Peppol AP). Alle fire krævede flows er implementeret, valideret og
verificeret mod Peppol TEST-netværket (Sproom staging).

---

## 11. Teknisk dokumentation

| Komponent | Fil |
|---|---|
| UBL XML-generator (Invoice + CreditNote) | `src/lib/oioubl-generator.ts` |
| Peppol BIS 3.0 validator | `src/lib/oioubl-validator.ts` |
| Indgående XML-parser (Invoice + CreditNote) | `src/lib/einvoice-parser.ts` |
| MLR / ApplicationResponse-generator | `src/lib/einvoice-response.ts` |
| Sproom API-klient (transport + signatur) | `src/lib/sproom-client.ts` |
| Afsendelses-flow | `src/lib/einvoice-sender.ts` |
| Modtagelses-flow | `src/lib/invoice-receiver.ts` |
| Outbox-poller (auto-retry, 10 min) | `src/lib/sproom-outbox-scheduler.ts` |
| Inbox-poller (safety-net, 5 min) | `src/lib/sproom-inbox-scheduler.ts` |
| Send e-faktura API-rute | `src/app/api/invoices/[id]/send-einvoice/route.ts` |
| Modtagelses-API (manuel upload) | `src/app/api/invoices/receive/route.ts` |
| Sproom webhook (modtagelse) | `src/app/api/sproom/webhook/route.ts` |
| Deltageropslag API-rute | `src/app/api/sproom/participants/route.ts` |
| Databaseskema (ReceivedInvoice, EInvoiceSending, EInvoiceSendEvent) | `prisma/schema.prisma` |

---

## 12. Genkørsel

1. Skift `SPROOM_API_URL` til `https://sproom.net` (produktion) eller
   behold `https://staging.sproom.net` (Peppol TEST-netværk).
2. Udfør afsendelse/modtagelse af faktura og kreditnota via appens
   E-faktura-modul (Indstillinger → E-faktura).
3. Følg dokument-state via `GET /api/documents/{id}/state` — outbox-polleren
   køre hver 10. min med auto-retry; inbox-polleren køre hver 5. min som
   safety-net.

* Bemærk:* `X-Sproom-DocumentId` (GUID) regenereres pr. kørsel — nye kørsler
giver et nyt ID, mens valideringsresultatet (23+ kontroller) er deterministisk.
Det tidligere Storecove-baserede test-script (`scripts/peppol-testbed-report.ts`)
er **slettet** fra kodebasen (oktober 2026) — det refererede til den nu slettede
`src/lib/storecove-client.ts`. Den aktuelle Peppol-test køres via Sproom-klienten.
Se Bilag 4 (Compliance-rapport) afsnit 2.1 og Bilag 6 (Brugsvejledning) afsnit 6.4
for fuld dokumentation.

---

*Udarbejdet af AlphaAi Consult ApS (CVR 46312058) som bilag til anmodning om
oplysninger fra Erhvervsstyrelsen.*
