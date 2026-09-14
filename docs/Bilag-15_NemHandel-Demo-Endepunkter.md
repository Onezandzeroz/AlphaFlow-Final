# Bilag 15 — NemHandel Demo-Endepunkter for alle fire endepunkts-ID-typer

**Fremsendt som bilag til anmodning om oplysninger — Hovedkrav nr. 3 (Bilag 2, 1, a, afsnit 10.1)**

**Fremsendt af:** AlphaAi Consult ApS (CVR 46312058)
**Dato:** September 2026
**Kilde:** https://www.digitaliser.dk/nemhandel/vejledninger-nemhandel/vejledning-til-nemhandel-demo-miljoe
**Senest opdateret af Digitaliseringsstyrelsen:** 07-03-2025

---

## Formål

Dette bilag dokumenterer de fire NemHandel demo-endepunkter for alle fire
endepunkts-ID-typer, der er tilgængelige i NemHandels demo/test-miljø. Dette
opfylder kravet fra Erhvervsstyrelsen om at fremsende "Nemhandel demo-endepunkter
for alle fire typer endepunkts-ID'er" som bilag til anmodningen.

AlphaFlow afsender OIOUBL 2.1 (type 380) via Storecove som adgangspunkt til
NemHandel eDelivery-netværket. Se Bilag 4 (Compliance-rapport) afsnit 2.1 og
Bilag 6 (Brugsvejledning) afsnit 6.4 for dokumentation af afsendelsesflowet.

---

## De fire NemHandel demo-endepunkter

Følgende eDelivery endepunkter er registreret i demo-miljøet med TEST-certifikat
som valide modtagere:

### 1. GLN-nummer demo-endepunkt

| Felts | Værdi |
|---|---|
| **Modtagernummer** | 5798009811639 |
| **Beskrivelse** | Benyttes som valid offentligt Nemhandel GLN-nummer demo-endepunkt |
| **Kan modtage** | Alt (registreret med alle profiler/dokumenttyper) |
| **Sletter dokument efter modtagelse** | Ja (MitID FOCES3) |
| **Nummerformat** | GLN |
| **Endpoint URL** | https://edel-demo.nemhandel.dk/as4 |

### 2. P-nummer demo-endepunkt

| Felt | Værdi |
|---|---|
| **Modtagernummer** | 9999999999 |
| **Beskrivelse** | Benyttes som valid offentligt Nemhandel P-nummer demo-endepunkt |
| **Kan modtage** | Faktura, Kreditnota, Rykker, Ordrer, Katalog og Forsyningspecifikationer |
| **Sletter dokument efter modtagelse** | Ja (MitID FOCES3) |
| **Nummerformat** | DK:P |
| **Endpoint URL** | https://edel-demo.nemhandel.dk/as4 |

### 3. CVR-nummer demo-endepunkt

| Felt | Værdi |
|---|---|
| **Modtagernummer** | 10150817 |
| **Beskrivelse** | Benyttes som valid offentligt Nemhandel CVR-nummer demo-endepunkt |
| **Kan modtage** | Faktura, Kreditnota, Rykker, Ordrer, Katalog og Forsyningspecifikationer |
| **Sletter dokument efter modtagelse** | Ja (MitID FOCES3) |
| **Nummerformat** | DK:CVR |
| **Endpoint URL** | https://edel-demo.nemhandel.dk/as4 |

### 4. SE-nummer demo-endepunkt

| Felt | Værdi |
|---|---|
| **Modtagernummer** | 99999999 |
| **Beskrivelse** | Benyttes som valid offentligt Nemhandel SE-nummer demo-endepunkt |
| **Kan modtage** | Faktura, Kreditnota, Rykker, Ordrer, Katalog og Forsyningspecifikationer |
| **Sletter dokument efter modtagelse** | Ja (MitID FOCES3) |
| **Nummerformat** | DK:SE |
| **Endpoint URL** | https://edel-demo.nemhandel.dk/as4 |

---

## Oversigtstabel — fire endepunkts-ID-typer

| # | Endepunkts-ID-type | Nummerformat | Demo-nummer | Endpoint URL | Kan modtage |
|---|---|---|---|---|---|
| 1 | GLN | GLN | 5798009811639 | https://edel-demo.nemhandel.dk/as4 | Alt (alle profiler) |
| 2 | P-nummer | DK:P | 9999999999 | https://edel-demo.nemhandel.dk/as4 | Faktura, Kreditnota, Rykker, Ordrer, Katalog, Forsyningspecifikationer |
| 3 | CVR-nummer | DK:CVR | 10150817 | https://edel-demo.nemhandel.dk/as4 | Faktura, Kreditnota, Rykker, Ordrer, Katalog, Forsyningsspecifikationer |
| 4 | SE-nummer | DK:SE | 99999999 | https://edel-demo.nemhandel.dk/as4 | Faktura, Kreditnota, Rykker, Ordrer, Katalog, Forsyningspecifikationer |

Alle fire demo-endepunkter:
- Er registreret i NemHandels demo-miljø med TEST-certifikat
- Modtager og sletter dokumenter efter modtagelse (MitID FOCES3)
- Bruger samme AS4 endpoint URL: https://edel-demo.nemhandel.dk/as4
- Kan bruges til at teste afsendelse af OIOUBL 2.1 fakturaer (type 380) og kreditnotaer (type 381)

---

## AlphaFlow's integration

AlphaFlow sender elektroniske fakturaer i OIOUBL 2.1 format via Storecove som
certificeret Peppol/NemHandel adgangspunkt. Storecove håndterer:

- AS4 transport til modtagende adgangspunkt
- MitID Erhverv-certifikatsignering (på vegne af AlphaFlow)
- SMP/NHR opslag for modtager-routing
- Schema- og schematron-validering
- MLR/AR-svar ved valideringsfejl

Ved afsendelse til demo-miljøet anvendes et test-modtager-endepunkt fra tabellen
ovenfor. Se Bilag 4 (Compliance-rapport) afsnit 2.1 og Bilag 6 (Brugsvejledning)
afsnit 6.4 for den fulde tekniske dokumentation.

---

## Kilde og verifikation

- **Kilde:** Digitaliseringsstyrelsen, digitaliser.dk
- **URL:** https://www.digitaliser.dk/nemhandel/vejledninger-nemhandel/vejledning-til-nemhandel-demo-miljoe
- **Senest opdateret:** 07-03-2025
- **Verifikation:** Endepunkterne kan bekræftes via NemHandel demo NHR participant lookup:
  https://registration-demo.nemhandel.dk/v3-nhr-web/public/participant/info?key=5798009811639&keytype=GLN

---

*Udarbejdet af AlphaAi Consult ApS (CVR 46312058) som bilag til anmodning om
oplysninger fra Erhvervsstyrelsen.*
