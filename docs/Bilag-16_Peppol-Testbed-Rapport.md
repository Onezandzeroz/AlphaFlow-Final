# Bilag 16 — Standardiseret Peppol Testbed-Rapport

**Fremsendt som bilag til anmodning om oplysninger — Hovedkrav nr. 3 (Bilag 2, 2, a, afsnit 10.1)**

**Fremsendt af:** AlphaAi Consult ApS (CVR 46312058)
**Dato:** September 2026
**Adgangspunkt:** Storecove (Holland) — certificeret Peppol Access Point

---

## 1. Formål

Dette bilag dokumenterer at AlphaFlow kan generere, validere og afsende
elektroniske fakturaer i **Peppol BIS Billing 3.0** format via Storecove
Access Point i Peppol TEST-netværket.

Rapporten opfylder kravet fra Erhvervsstyrelsen om at fremsende en
"standardiseret testbed-rapport fra Peppol".

---

## 2. Miljø og konfiguration

| Parameter | Værdi |
|---|---|
| Peppol netværk | TEST (sandbox/demo) |
| Adgangspunkt | Storecove (Holland, certificeret Peppol AP) |
| Storecove API URL | https://api.storecove.com/api/v2 |
| Dokumentstandard | Peppol BIS Billing 3.0 (EN 16931 compliant) |
| OIOUBL version | 2.1 |
| Invoice type code | 380 (Commercial invoice) |
| CustomizationID | urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0 |
| ProfileID | urn:fdc:peppol.eu:2017:poacc:billing:01:1.0 |
| Test-modtager | DK:DIGST:DK10101011 (Storecove Peppol TEST receiver) |

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

### Submission til Storecove (Peppol TEST netværk)

| Parameter | Værdi |
|---|---|
| Endpoint | POST https://api.storecove.com/api/v2/document_submissions |
| Legal Entity ID | 1040564 (AlphaAi Consult ApS, CVR 46312058) |
| Tax identifier | DK:ERST:DK46312058 (VAT-nummer) |
| Routing identifier | DK:DIGST:DK10101011 (Peppol TEST modtager) |
| Tax system | tax_line_percentages |
| Document type | invoice (Peppol BIS Billing 3.0) |

### Submission resultat

| Parameter | Værdi |
|---|---|
| HTTP status | 200 OK |
| Submission GUID | 1fbbecd5-5f12-44ce-b444-ff894c51029f |
| Resultat | ✅ Faktura accepteret af Storecove og afleveret til Peppol TEST-netværket |

### Leveringsbevis (evidence)

| Parameter | Værdi |
|---|---|
| Evidence endpoint | GET /document_submissions/{guid}/evidence/sending |
| Network | peppol |
| Status | Leveret til Peppol TEST modtager (DK:DIGST:DK10101011) |

---

## 6. Opsummering

| Trin | Status |
|---|---|
| 1. OIOUBL 2.1 generering | ✅ Gennemført |
| 2. Peppol BIS Billing 3.0 validering | ✅ GYLDIG (0 fejl, 0 advarsler) |
| 3. Storecove submission (Peppol TEST) | ✅ 200 OK — GUID: 1fbbecd5-5f12-44ce-b444-ff894c51029f |
| 4. Leveringsbevis | ✅ Hentet — leveret til Peppol TEST modtager |

**✅ TESTBED-RAPPORT: ALLE TRIN BESTÅET**

AlphaFlow kan generere, validere og afsende Peppol BIS Billing 3.0
fakturaer via Storecove Access Point. Den testede faktura bestod alle
23+ valideringskontroller og blev succesfuldt afleveret til Peppol
TEST-netværket.

---

## 7. Teknisk dokumentation

| Komponent | Fil |
|---|---|
| OIOUBL XML-generator | `src/lib/oioubl-generator.ts` |
| Peppol BIS 3.0 validator | `src/lib/oioubl-validator.ts` |
| Storecove API-klient | `src/lib/storecove-client.ts` |
| E-faktura afsendelses-flow | `src/lib/einvoice-sender.ts` |
| Send e-faktura API-rute | `src/app/api/invoices/[id]/send-einvoice/route.ts` |
| OIOUBL validering API-rute | `src/app/api/invoices/[id]/oioubl/validate/route.ts` |

---

## 8. Genkørsel af test

Testen kan genkøres med:

```bash
bun scripts/peppol-testbed-report.ts
```

Dette genererer en opdateret rapport med nye submission-GUID'er og
valideringsresultater. Se også Bilag 4 (Compliance-rapport) afsnit 2.1
og Bilag 6 (Brugsvejledning) afsnit 6.4 for den fulde dokumentation
af Peppol BIS Billing 3.0 integrationen.

---

*Udarbejdet af AlphaAi Consult ApS (CVR 46312058) som bilag til
anmodning om oplysninger fra Erhvervsstyrelsen.*
