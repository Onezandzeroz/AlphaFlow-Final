# SKAT VOCES3 Certificates — CONFIDENTIAL

Place Skattestyrelsen's test/production certificate files in this directory.
**All files here are gitignored** and must never be committed to version control.

## Files to place here

### Required (choose ONE certificate format)

| File (suggested name) | Description | Env var to set |
|-----------------------|-------------|----------------|
| `client.p12` | VOCES3 System (S1) keystore in PKCS12 format (default delivery from MitID Erhverv) | `SKAT_KEYSTORE_PATH=certs/skat/client.p12` |
| **or** `client.crt` + `client.key` | Certificate + private key in PEM format (if you've split the .p12 with openssl) | `SKAT_CERT_PATH=certs/skat/client.crt` + `SKAT_KEY_PATH=certs/skat/client.key` |

### Required (truststore — verifies SKAT's server certificate during mTLS)

| File (suggested name) | Description | Env var to set |
|-----------------------|-------------|----------------|
| `skat-ca.pem` | CA bundle for the SKAT test/prod environment (from the app.conf SKAT sends you) | `SKAT_TRUSTSTORE_PATH=certs/skat/skat-ca.pem` |

## How to obtain these files

Email `momsapi@sktst.dk` with AlphaFlow's CVR to request test access.
SKAT responds with:
- A test VOCES3 certificate (usually a `.p12`/`.pfx` file)
- The test environment endpoints (also in the attached `app.conf`)
- The CA bundle to verify SKAT's server certificate
- A `readme.txt` describing the test environment

## Permissions

This directory has `chmod 700` (owner-only access). In production on Ubuntu/PM2,
ensure the PM2 process user owns these files:

```bash
chown <pm2-user>:<pm2-group> certs/skat/*
chmod 600 certs/skat/*   # private key + keystore: read/write owner only
chmod 644 certs/skat/skat-ca.pem  # CA bundle can be world-readable
```

## Verification

After placing the files, verify the keystore is valid:

```bash
# PKCS12
openssl pkcs12 -info -in certs/skat/client.p12 -noout
# (enter the passphrase when prompted — should list 1 certificate + 1 private key)

# PEM (split)
openssl x509 -in certs/skat/client.crt -noout -subject -issuer -dates
openssl rsa -in certs/skat/client.key -check -noout
```

Then set the env vars in `.env` (copy from `.env.example`) and restart AlphaFlow.
See `docs/SKAT-setup.md` for the full setup + testing flow.

## Confidentiality

Per SKAT's onboarding email: *"Al denne information er fortrolig og må ikke
deles uden tilladelse."* Do not share, upload, or commit these files anywhere
outside the secured production server.
