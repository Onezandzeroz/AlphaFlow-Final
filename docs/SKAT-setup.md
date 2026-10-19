# SKAT RSU B2B Setup — NemVirksomhed Momsindberetning

This document covers onboarding, certificate preparation, configuration, and
testing of AlphaFlow's integration with Skattestyrelsen's RSU B2B Web Service
Gateway for submitting Danish VAT returns (momsangivelse).

AlphaFlow implements the same 3 SOAP web services as Skattestyrelsen's official
Java sample client ([github.com/skat/rsu-b2b-sample-client-java](https://github.com/skat/rsu-b2b-sample-client-java)),
in TypeScript with native mTLS + WS-Security signing.

---

## 1. How the integration works

AlphaFlow is a **Registered System Provider (RSU)**. It submits a **DRAFT** VAT
return on behalf of a customer company. The legal entity (the customer) must
then approve the draft with **MitID** on **TastSelv Erhverv** via a deep link.
Only after approval is the VAT return legally filed.

```
AlphaFlow ──(1) ModtagMomsangivelseForeloebig──▶ SKAT test/prod
                    (SOAP + mTLS + WS-Security)
          ◀── transactionId + deep link ──

Customer ──(2) approves with MitID on TastSelv Erhverv──▶ SKAT

AlphaFlow ──(3) MomsangivelseKvitteringHent──▶ SKAT
          ◀── receipt PDF (base64) ──
```

### The 3 SOAP services

| # | Service | Purpose |
|---|---------|---------|
| 1 | `VirksomhedKalenderHent` | Fetch VAT reporting periods + deadlines for a SE-number |
| 2 | `ModtagMomsangivelseForeloebig` | Submit a DRAFT VAT return (17 MomsAngivelse fields) |
| 3 | `MomsangivelseKvitteringHent` | Fetch the receipt PDF after the customer approves |

### Security stack (matches the Java client's CXF + WSS4J policy)

- **Transport**: HTTPS with **mutual TLS** (mTLS) — AlphaFlow presents its
  VOCES3 System (S1) certificate; SKAT verifies it; SKAT presents its server
  certificate; AlphaFlow verifies it against the truststore.
- **Message**: **WS-Security** XML-DSig signature over `<wsu:Timestamp>` +
  `<soap:Body>` + `<wsse:BinarySecurityToken>`, using:
  - Signature algorithm: `http://www.w3.org/2000/09/xmldsig#rsa-sha1`
  - Canonicalization: `http://www.w3.org/2001/10/xml-exc-c14n#` (exclusive)
  - Digest: `http://www.w3.org/2000/09/xmldsig#sha1`
  - Key identifier: `DirectReference` (BinarySecurityToken in the header)

The signing is implemented in `src/lib/skat-ws-security.ts` (using `xml-crypto`),
and the keystore is loaded in `src/lib/skat-keystore.ts` (using `node-forge`).

---

## 2. Onboarding (organizational — before any code runs)

SKAT requires a formal onboarding before you can call the test environment.

1. **Email `momsapi@sktst.dk`** with AlphaFlow's CVR. State that you are an RSU
   building a NemVirksomhed integration. SKAT responds with:
   - The test environment **endpoints** (3 URLs) — also in the attached `app.conf`
   - A **test VOCES3 certificate** (Integrationstest S1) — usually a `.p12`/`.pfx` file
   - The test environment **CA bundle** (to verify SKAT's server cert)
   - A `readme.txt` describing the test environment
   - A `readme_dotnet.txt` if you prefer the .NET sample client

2. **Confirm the test data**. SKAT provides a test company:
   - **SE: 41250313** — configured so the test certificate can report VAT for it.

3. **Reply to SKAT** stating that AlphaFlow uses **TypeScript/Node.js** (the Java
   and .NET sample clients are for reference only; AlphaFlow has its own native
   implementation).

4. **For production** (later): order a production **VOCES3 System (S1)**
   certificate from MitID Erhverv. Each customer company must then delegate
   "Nemvirksomhed – adgang for systemudbyder" to AlphaFlow's CVR on skat.dk
   (one-time per customer).

> All material from SKAT (endpoints, certificates, app.conf) is **confidential**
> and must not be shared outside the organisation.

---

## 3. Certificate preparation

AlphaFlow's keystore loader (`src/lib/skat-keystore.ts`) supports two formats.
Pick ONE:

### Option A — PKCS12 (recommended)

This is the default delivery format from MitID Erhverv. No conversion needed —
place the `.p12`/`.pfx` file in `certs/skat/` (already gitignored + `chmod 700`)
and set `SKAT_KEYSTORE_PATH=certs/skat/client.p12`.

```bash
# Verify the .p12 contains a cert + private key
openssl pkcs12 -info -in certs/skat/client.p12 -noout
# (enter the passphrase when prompted)
```

### Option B — separate PEM files

If you prefer (or need) PEM format (e.g. the server's TLS stack expects it),
split the `.p12` once:

```bash
openssl pkcs12 -in certs/skat/client.p12 -nocerts -nodes -out certs/skat/client.key
openssl pkcs12 -in certs/skat/client.p12 -clcerts -nokeys  -out certs/skat/client.crt
# Then set SKAT_CERT_PATH + SKAT_KEY_PATH instead of SKAT_KEYSTORE_PATH
```

### Truststore (CA bundle)

The test environment uses a private CA. Save the CA certificate SKAT sends you
as `certs/skat/skat-ca.pem` and set `SKAT_TRUSTSTORE_PATH=certs/skat/skat-ca.pem`.
Without it, mTLS will fail with `UNABLE_TO_VERIFY_LEAF_SIGNATURE`.

> The `certs/skat/` directory is **gitignored** and has `chmod 700`. See
> `certs/skat/README.md` for the full list of files expected there.

---

## 4. Environment variables

Set these in `.env` (copy from `.env.example`):

```bash
# Environment: "test" or "production"
SKAT_ENV=test

# Endpoints (from the app.conf SKAT sends you)
SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT=https://<test-host>/VirksomhedKalenderHent
SKAT_ENDPOINT_MODTAGMOMSANGIVELSEFORELOEBIG=https://<test-host>/ModtagMomsangivelseForeloebig
SKAT_ENDPOINT_MOMSANGIVELSEKVITTERINGHENT=https://<test-host>/MomsangivelseKvitteringHent

# Option A: PKCS12 keystore (place the .p12 in certs/skat/)
SKAT_KEYSTORE_PATH=certs/skat/client.p12
SKAT_KEYSTORE_PASSWORD=<keystore passphrase>
SKAT_KEY_PASSWORD=<key passphrase>

# Option B (alternative): separate PEM files
# SKAT_CERT_PATH=certs/skat/client.crt
# SKAT_KEY_PATH=certs/skat/client.key

# Truststore (REQUIRED for the test environment — place the CA bundle in certs/skat/)
SKAT_TRUSTSTORE_PATH=certs/skat/skat-ca.pem

# AlphaFlow's own CVR (the RSU identifier registered with SKAT)
ALPHAFLOW_CVR=<AlphaFlow CVR>
```

> When **none** of the credential variables are set, AlphaFlow runs in
> **simulation mode**: the UI works end-to-end, but no real call is made to SKAT.
> This is the default for development.

---

## 5. Testing flow on the SKAT test environment

### Prerequisites

- Test certificate + endpoints + CA bundle configured in `.env` (Section 4)
- A company in AlphaFlow with `cvrNumber = 41250313` (the SKAT test SE-number)
- Some posted journal entries with VAT for the period you want to report

### Step 1 — Verify the calendar service

```bash
# From a logged-in session, fetch the VAT calendar for the test company
curl 'https://<your-host>/api/vat-report/calendar?year=2026' \
  -H 'Cookie: <session>'
```

Expected: `{ "calendar": { "seNumber": "41250313", "periods": [...] }, "simulated": false }`.
If `simulated` is `true`, the credentials are not loaded — re-check `.env`.

### Step 2 — Submit a DRAFT VAT return

In the AlphaFlow UI, go to **Moms & Årsregnskab → Momsindberetning**, select a
quarter, and click **"Indsend moms"**. This calls `POST /api/vat-report/submit`,
which:

1. Computes the VAT register for the period (`computeVATRegister`)
2. Maps it to the 17 SKAT MomsAngivelse fields (`mapVatRegisterToSkatFields`)
3. Builds + signs + sends the `ModtagMomsangivelseForeloebig` SOAP request
4. Stores the returned `transactionIdentifier` + `deepLink` + `advisoryCode`

The UI then shows a **"Gå til TastSelv Erhverv"** button with the deep link.

### Step 3 — Approve with MitID

Click the deep link (or open it in a browser). Log into **TastSelv Erhverv**
with the test company's MitID and approve the draft VAT return.

### Step 4 — Fetch the receipt

Back in AlphaFlow, click **"Hent kvittering"**. This calls
`POST /api/vat-report/receipt`, which runs `MomsangivelseKvitteringHent`.

- If not yet approved → `errorCode: "4810"` (status stays `SUBMITTED`)
- If approved → `status: "ACCEPTED"`, `receiptPdfBase64` is stored
- If rejected → `errorCode: "4811"` (status → `REJECTED`)

Once accepted, the receipt PDF can be downloaded at:
`GET /api/vat-report/<submissionId>/receipt.pdf`

### Step 5 — Include request + response in any bug reports to SKAT

SKAT requires both the **request XML** and the **response XML** when
investigating errors. These are stored in the `VATSubmission.responseXml` field
and in the server logs (search for `[SKAT-Transport]`).

---

## 6. Error codes & troubleshooting

### SKAT receipt error codes

| Code | Meaning | Action |
|------|---------|--------|
| `4810` | Draft not yet approved in TastSelv | Wait for the customer to approve with MitID, then retry |
| `4811` | Draft rejected (by SKAT or the customer) | Review the rejection; prepare a new submission |
| `4812` | No receipt available | Contact SKAT support with the transaction identifier |
| `4813` | Other receipt error | Contact SKAT support with the transaction identifier |

### mTLS / transport errors (logged as `SkatApiError.code`)

| Code | Likely cause | Fix |
|------|--------------|-----|
| `SKAT_CREDENTIAL_LOAD_FAILED` | Wrong keystore path or passphrase | Verify `SKAT_KEYSTORE_PATH` + `SKAT_KEYSTORE_PASSWORD` |
| `SKAT_SIGNING_FAILED` | Private key doesn't match the cert, or the cert isn't an RSA VOCES3 cert | Re-export the .p12; confirm the cert is a VOCES3 S1 |
| `SKAT_TLS_CERT_INVALID` | Truststore missing/expired, or SKAT server cert changed | Re-download the CA bundle from SKAT; check expiry |
| `SKAT_CONNECTION_REFUSED` | Wrong endpoint URL or network blocked | Verify the endpoint URLs from `app.conf`; check firewall |
| `SKAT_CONNECTION_TIMEOUT` | Network latency or SKAT down | Retry; check `https://<test-host>` reachability |
| `SKAT_CLIENT_ERROR` (HTTP 4xx) | SOAP fault or auth rejection | Inspect the response body in the logs; send to SKAT |
| `SKAT_SERVER_ERROR` (HTTP 5xx) | SKAT server-side error | Retry after a few minutes; report to SKAT if persistent |

### Common signature issues

If SKAT rejects the request with a signature error:
- Confirm the cert is a **VOCES3 System (S1)** certificate (not a person/MitID
  cert). VOCES3 S1 certs have OID `1.3.6.1.4.1.311.60.2.1.3` (jurisdiction) and
  the Subject CN ends in the system name.
- Confirm the 3 signed parts are exactly: Timestamp, Body, BinarySecurityToken
  (see `src/lib/skat-ws-security.ts`). SKAT's policy signs all three.
- Confirm `rsa-sha1` (not rsa-sha256) + exclusive C14N — SKAT's WSS4J policy is
  pinned to these algorithms.

---

## 7. Production deployment notes

For production on Ubuntu with PM2:

1. Store the production VOCES3 S1 `.p12` in `certs/skat/client.p12` (the
   project's gitignored cert directory). Ensure the PM2 process user owns it:

   ```bash
   chown <pm2-user>:<pm2-group> certs/skat/*
   chmod 700 certs certs/skat
   chmod 600 certs/skat/client.p12   # keystore + private key: owner-only
   chmod 644 certs/skat/skat-ca.pem  # CA bundle can be world-readable
   ```

2. Set the production environment variables in the PM2 ecosystem config
   (`ecosystem.config.js` — copy from `ecosystem.config.example.js`):
   ```js
   env_production: {
     SKAT_ENV: 'production',
     SKAT_ENDPOINT_VIRKSOMHEDKALENDERHENT: 'https://<prod-host>/VirksomhedKalenderHent',
     // ... production endpoints + keystore path
   }
   ```

3. Rotate the VOCES3 cert **before** it expires (typically 2-3 years). SKAT will
   start rejecting requests the day the cert expires. Set a calendar reminder
   60 days before expiry.

4. Each new customer company must delegate NemVirksomhed access to AlphaFlow's
   CVR on skat.dk before AlphaFlow can submit VAT for them. This is a one-time
   manual step the customer performs.

---

## 8. Reference: file map

| File | Purpose |
|------|---------|
| `certs/skat/` | **Certificate storage** (gitignored, `chmod 700`) — place the VOCES3 `.p12` keystore + SKAT CA bundle here. See `certs/skat/README.md`. |
| `certs/skat/README.md` | What files to place here, how to verify them, permission guidance |
| `src/lib/skat-keystore.ts` | Loads VOCES3 cert + key from PKCS12 or PEM; caches for the process |
| `src/lib/skat-ws-security.ts` | Builds the WS-Security header + signs the SOAP envelope (xml-crypto) |
| `src/lib/skat-soap-client.ts` | The 3 SOAP services + envelope builders + mTLS transport |
| `src/lib/vat-submit.ts` | Orchestration: prepare → submit → fetch receipt (DB + audit + SKAT) |
| `src/lib/vat-utils.ts` | `computeVATRegister()` — the single source of truth for VAT totals |
| `src/lib/vat-codes.ts` | VAT code constants (S25/K25/SEU/KEU etc.) + rates |
| `src/app/api/vat-report/submit/route.ts` | `POST` prepare+submit DRAFT, `GET` list submissions |
| `src/app/api/vat-report/receipt/route.ts` | `POST` fetch receipt via MomsangivelseKvitteringHent |
| `src/app/api/vat-report/submissions/route.ts` | `GET` list VAT submissions |
| `src/app/api/vat-report/calendar/route.ts` | `GET` SKAT VAT calendar (periods + deadlines) |
| `src/app/api/vat-report/[id]/receipt.pdf/route.ts` | `GET` download the receipt PDF |
| `src/components/annual-report/annual-report-page.tsx` | UI: "Momsindberetning" tab |

---

## 9. External references

- **SKAT Java sample client**: https://github.com/skat/rsu-b2b-sample-client-java
- **SKAT onboarding contact**: `momsapi@sktst.dk`
- **MitID Erhverv** (order VOCES3 certs): https://mitid.erhverv.dk
- **OIO / NemVirksomhed namespace**: `urn:oio:skat:nemvirksomhed:ws:1.0.0`
- **WS-Security spec (OASIS)**: https://docs.oasis-open.org/wss/v1.1/
