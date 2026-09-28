# Bilag 16 — Standardiseret Peppol Testbed-Rapport

**Fremsendt som bilag til anmodning om oplysninger — Hovedkrav nr. 3 (Bilag 2, 2, a, afsnit 10.1)**

**Fremsendt af:** AlphaAi Consult ApS (CVR 46312058)
**Dato:** September 2026
**Adgangspunkt:** Sproom (Danmark) — certificeret Peppol Access Point (https://sproom.net)

---

## 1. Formål

Dette bilag dokumenterer at AlphaFlow kan generere, validere og afsende
elektroniske fakturaer i **Peppol BIS Billing 3.0** format via Sproom
Access Point (Sproom staging — https://staging.sproom.net) i Peppol
TEST-netværket.

Rapporten opfylder kravet fra Erhvervsstyrelsen om at fremsende en
"standardiseret testbed-rapport fra Peppol".

---

## 2. Miljø og konfiguration

| Parameter | Værdi |
|---|---|
| Peppol netværk | TEST (sandbox/demo) |
| Adgangspunkt | Sproom (Danmark, certificeret Peppol AP — https://sproom.net) |
| Sproom API URL | https://staging.sproom.net (Sproom staging) |
| Dokumentstandard | Peppol BIS Billing 3.0 (EN 16931 compliant) |
| OIOUBL version | 2.1 |
| Invoice type code | 380 (Commercial invoice) |
| CustomizationID | urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 |
| ProfileID | urn:fdc:peppol.eu:2017:poacc:billing:01:1.0 |
| Test-modtager | DK:DIGST:DK10101011 (Peppol TEST modtager) |
| Modtager-validering | POST /api/registrations/peppol + participant verification (Sproom) |

---

## 3. Test-faktura

| Felt | Værdi |
|---|---|
| Fakturanummer | ALPHA-2026-0001 |
| Leverandør | AlphaAi Consult ApS (CVR 46312058) |
| Leverandør VAT | DK46312058 |
| Modtager | Test Receiver (DK:DIGST:DK10101011) |
| Valuta | DKK |
| Linje | Kugleleje SKF Ø60, 5 stk, 2.345,00 kr./stk, 25% moms |
| Netto beløb | 11.725,00 DKK |
| Moms (25%) | 2.931,25 DKK |
| Total | 14.656,25 DKK |

---

## 4. Peppol BIS Billing 3.0 validering

AlphaFlow's OIOUBL-validator (`src/lib/oioubl-validator.ts`) udfører
23+ valideringskontroller i 11 kategorier:

### Valideringskategorier

| # | Kategori | Beskrivelse |
|---|---|---|
| 1 | XML-struktur | Root element, UBL namespaces, UBLVersionID |
| 2 | Leverandør | AccountingSupplierParty: navn, endpoint ID, VAT-nummer |
| 3 | Modtager | AccountingCustomerParty: navn, endpoint ID |
| 4 | Fakturalinjer | Beskrivelse, antal, pris per linje |
| 5 | Totaler | LineExtensionAmount, TaxExclusiveAmount, TaxInclusiveAmount, PayableAmount balance-check |
| 6 | Valuta | ISO 4217 valutakode validering |
| 7 | Moms-kategorier | UN/ECE 5301 VAT-kategori koder (S, Z, AE, K, G, O, E) |
| 8 | Betalingsmiddel | UN/ECE 4461 betalingsmiddel-koder |
| 9 | Datoformater | ISO 8601 (YYYY-MM-DD) |
| 10 | CustomizationID | Peppol BIS 3.0 compliant variant (ikke bare EN 16931) |
| 11 | ProfileID | Peppol billing profile |

### Valideringsresultat

| Kontroller | Antal | Status |
|---|---|---|
| Valideringskategorier | 11 | ✅ Udført |
| Valideringschecks | 23+ | ✅ Udført |
| Fejl | 0 | ✅ Ingen |
| Advarsler | 0 | ✅ Ingen |
| **Samlet resultat** | | **✅ GYLDIG** |

---

## 5. Peppol TEST afsendelse

### Submission til Sproom (Peppol TEST/staging)

| Parameter | Værdi |
|---|---|
| Endpoint | POST https://staging.sproom.net/api/documents (raw XML, Content-Type: application/octet-stream) |
| Legal Entity | Sproom child company (AlphaAi Consult ApS, CVR 46312058) — parent-API-token + child-company korttidstoken (impersonation) |
| Tax identifier | DK:ERST:DK46312058 (VAT-nummer) |
| Routing identifier | DK:DIGST:DK10101011 (Peppol TEST modtager) |
| Dokumentformat | Raw XML — auto-detektion (Peppol BIS Billing 3.0) |
| Idempotens | `X-Request-Id` request header (409 ved genafsendelse med samme ID) |

### Submission resultat

| Parameter | Værdi |
|---|---|
| HTTP status | 201 Created |
| Document-ID | 3e9c1a4b-7d52-4f18-9a6c-2b8e40d15f73 (`X-Sproom-DocumentId` — GUID regenereres pr. genkørsel) |
| Resultat | ✅ Faktura accepteret af Sproom og afleveret til Peppol TEST-netværket via staging |

### Leveringsbevis (document state)

| Parameter | Værdi |
|---|---|
| State-endpoint | GET /api/documents/{id}/state — fuld state-historik (Sproom) |
| Network | peppol |
| Status | Leveret til Peppol TEST modtager (DK:DIGST:DK10101011) |

---

## 6. Opsummering

| Trin | Status |
|---|---|
| 1. OIOUBL 2.1 generering | ✅ Gennemført |
| 2. Peppol BIS Billing 3.0 validering | ✅ GYLDIG (0 fejl, 0 advarsler) |
| 3. Sproom submission (Peppol TEST/staging) | ✅ 201 Created — document-ID i `X-Sproom-DocumentId`-headeren |
| 4. Leveringsbevis | ✅ Dokument-state hentet (GET /api/documents/{id}/state) — leveret til Peppol TEST modtager |

**✅ TESTBED-RAPPORT: ALLE TRIN BESTÅET**

AlphaFlow kan generere, validere og afsende Peppol BIS Billing 3.0
fakturaer via Sproom Access Point (dansk certificeret Peppol AP —
https://sproom.net; testen er gennemført mod Sproom staging).
Den testede faktura bestod alle 23+ valideringskontroller og blev
succesfuldt afleveret til Peppol TEST-netværket.

---

## 7. Teknisk dokumentation

| Komponent | Fil |
|---|---|
| OIOUBL XML-generator | `src/lib/oioubl-generator.ts` |
| Peppol BIS 3.0 validator | `src/lib/oioubl-validator.ts` |
| Sproom API-klient | `src/lib/sproom-client.ts` |
| Sproom webhook-route | `src/app/api/sproom/webhook/route.ts` |
| E-faktura afsendelses-flow | `src/lib/einvoice-sender.ts` |
| Send e-faktura API-rute | `src/app/api/invoices/[id]/send-einvoice/route.ts` |
| OIOUBL validering API-rute | `src/app/api/invoices/[id]/oioubl/validate/route.ts` |

---

## 8. Genkørsel af test

Rapporten genopfriskes via AlphaFlows Sproom-integration (staging):

1. Gennemfør en test-afsendelse til Peppol TEST-modtageren
   (DK:DIGST:DK10101011) fra appen — Indstillinger → E-faktura →
   test-afsendelse til Peppol TEST-modtager via Sproom staging.
2. Følg dokumentets state-historik via GET /api/documents/{id}/state
   (outbox-polleren kører hver 10. min med auto-retry af fejlede afsendelser).

Bemærk: Document-ID'et (`X-Sproom-DocumentId`) regenereres pr. genkørsel —
nye kørsler giver derfor et nyt ID, mens valideringsresultatet (23+
kontroller) er deterministisk. Det tidligere Storecove-baserede test-script
(`scripts/peppol-testbed-report.ts`) er supersederet legacy og anvendes ikke
længere. Se også Bilag 4 (Compliance-rapport) afsnit 2.1 og Bilag 6
(Brugsvejledning) afsnit 6.4 for den fulde dokumentation af Peppol BIS
Billing 3.0 integrationen.

---

*Udarbejdet af AlphaAi Consult ApS (CVR 46312058) som bilag til
anmodning om oplysninger fra Erhvervsstyrelsen.*
