#!/usr/bin/env python3
"""
SKAT Test Certificate Extractor
================================

Extracts the VOCES3 S1 test certificate + private key from SKAT's public
client-keystore.jks (in the rsu-b2b-sample-client-java GitHub repo) and
builds a PKCS12 keystore that AlphaFlow can load.

PRIVACY: This script runs entirely locally. It does NOT make any network
request, does NOT print the passphrase, and does NOT upload anything.
The passphrase is read from your local app.conf and used only in-memory.

PREREQUISITES:
  - pyjks installed:  uv pip install pyjks   (or: pip install pyjks)
  - openssl available on PATH
  - The SKAT repo cloned (or just the client-keystore.jks file)
  - Your app.conf file from SKAT (contains the certificate passphrase)

USAGE:
  1. Place your app.conf file at:  certs/skat/app.conf
     (this path is gitignored — it will never be committed)

  2. Run this script:
       python3 scripts/extract-skat-cert.py

  3. If successful, the file certs/skat/client.p12 will be created.

  4. Then set in .env:
       SKAT_KEYSTORE_PATH=certs/skat/client.p12
       SKAT_KEYSTORE_PASSWORD=<the passphrase from app.conf>
       SKAT_KEY_PASSWORD=<the passphrase from app.conf>

ALTERNATIVE — if you don't want to place app.conf:
  Set the passphrase as an environment variable and run:
       SKAT_KEY_PASSPHRASE=<passphrase> python3 scripts/extract-skat-cert.py
"""

import os
import re
import sys
import subprocess
from pathlib import Path

try:
    import jks
except ImportError:
    # Auto-install pyjks if missing — the script only needs it once
    import subprocess
    import sys as _sys
    print("pyjks not found — attempting auto-install...")
    for tool in ["uv pip install pyjks", "pip3 install pyjks", f"{_sys.executable} -m pip install pyjks"]:
        try:
            result = subprocess.run(tool.split(), capture_output=True, text=True, timeout=60)
            if result.returncode == 0:
                print(f"  ✓ Installed via: {tool}")
                break
        except Exception:
            continue
    else:
        print("ERROR: Could not auto-install pyjks. Install it manually:")
        print("       uv pip install pyjks   (or)   pip3 install pyjks")
        _sys.exit(1)
    # Re-import after install
    try:
        import jks
    except ImportError:
        print("ERROR: pyjks install seemed to succeed but import still fails.")
        print("       Try running with the same Python that has pip:")
        print(f"       {_sys.executable} scripts/extract-skat-cert.py")
        _sys.exit(1)

# ─── Configuration ───────────────────────────────────────────────────────

# The JKS keystore from SKAT's public GitHub repo. Adjust this path if you
# cloned the repo elsewhere. You can also download just this one file from:
# https://github.com/skat/rsu-b2b-sample-client-java/blob/master/rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks
JKS_PATHS = [
    "/tmp/skat-rsu/rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks",
    "./rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks",
    os.environ.get("SKAT_JKS_PATH", ""),
]

JKS_STOREPASS = "storepassword"  # public, from Client_Sign.properties

# The alias we want — the VOCES3 System S1 integrationstest certificate
PREFERRED_ALIASES = [
    "lucapacioli_aps_system_integrationstest_s1",
    "lucapacioli_aps_system_integrationstest_s1_expired",
    "lucapacioli_aps_system_integrationstest_s1_revoked",
]

# Output paths (relative to project root)
APP_CONF_PATH = "certs/skat/app.conf"
OUTPUT_P12 = "certs/skat/client.p12"
TMP_DIR = "/tmp/skat-extract"

# ─── Helpers ────────────────────────────────────────────────────────────


def find_jks():
    """Find the client-keystore.jks file."""
    # Check local clone locations first
    for p in JKS_PATHS:
        if p and os.path.isfile(p):
            return p
    # Auto-download from SKAT's GitHub repo if not found
    print("[i] client-keystore.jks not found locally — downloading from SKAT's GitHub repo...")
    import urllib.request
    url = "https://raw.githubusercontent.com/skat/rsu-b2b-sample-client-java/master/rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks"
    local_path = os.path.join(TMP_DIR, "client-keystore.jks")
    os.makedirs(TMP_DIR, exist_ok=True)
    try:
        urllib.request.urlretrieve(url, local_path)
        print(f"  ✓ Downloaded to {local_path} ({os.path.getsize(local_path)} bytes)")
        return local_path
    except Exception as e:
        print(f"ERROR: Could not download client-keystore.jks: {e}")
        print("       Download it manually from:")
        print("       https://github.com/skat/rsu-b2b-sample-client-java/raw/master/rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks")
        print("       Then set the SKAT_JKS_PATH env var to its location.")
        sys.exit(1)


def parse_app_conf(path):
    """Parse the certificatePassphrases section from app.conf (HOCON format).

    Returns a dict: { alias: passphrase }
    """
    with open(path, "r") as f:
        content = f.read()

    # Find the certificatePassphrases { ... } block
    m = re.search(r"certificatePassphrases\s*\{([^}]*)\}", content, re.DOTALL)
    if not m:
        return {}

    block = m.group(1)
    # Parse lines like:  alias_name = "passphrase"
    passphrases = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m2 = re.match(r'^([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"', line)
        if m2:
            alias = m2.group(1)
            # Normalize: pyjks/jks aliases are lowercase, but app.conf may have CamelCase
            passphrases[alias] = m2.group(2)
            passphrases[alias.lower()] = m2.group(2)

    return passphrases


def get_passphrase():
    """Get the certificate passphrase either from app.conf or env var."""
    # Option 1: environment variable
    env_pass = os.environ.get("SKAT_KEY_PASSPHRASE")
    if env_pass:
        return env_pass, "(from SKAT_KEY_PASSPHRASE env var)"

    # Option 2: app.conf file
    if os.path.isfile(APP_CONF_PATH):
        passphrases = parse_app_conf(APP_CONF_PATH)
        if passphrases:
            return passphrases, f"(from {APP_CONF_PATH})"
        else:
            print(f"ERROR: Found {APP_CONF_PATH} but could not parse certificatePassphrases section.")
            print("       Make sure it contains a block like:")
            print('       certificatePassphrases {')
            print('           lucapacioli_aps_system_integrationstest_s1 = "..."')
            print('       }')
            sys.exit(1)

    print("ERROR: No certificate passphrase found.")
    print()
    print("To provide it, do ONE of the following:")
    print()
    print("  Option A — place your app.conf file at:")
    print(f"    {APP_CONF_PATH}")
    print("    (this path is gitignored — it will not be committed)")
    print()
    print("  Option B — set an environment variable:")
    print("    SKAT_KEY_PASSPHRASE=<passphrase> python3 scripts/extract-skat-cert.py")
    sys.exit(1)


def extract_key_and_cert(jks_path, alias, passphrase):
    """Extract the private key + cert chain from the JKS as DER bytes."""
    ks = jks.KeyStore.load(jks_path, JKS_STOREPASS)

    if alias not in ks.private_keys:
        print(f"ERROR: Alias '{alias}' not found in keystore.")
        print(f"       Available aliases: {list(ks.private_keys.keys())}")
        return None

    entry = ks.private_keys[alias]
    if not entry.is_decrypted():
        try:
            entry.decrypt(passphrase)
        except Exception as e:
            print(f"ERROR: Could not decrypt private key for alias '{alias}'.")
            print(f"       The passphrase is incorrect. ({e})")
            return None

    key_der = entry.pkey
    cert_der = entry.cert_chain[0].cert
    ca_chain_der = b""
    if len(entry.cert_chain) > 1:
        for c in entry.cert_chain[1:]:
            ca_chain_der += c.cert

    return key_der, cert_der, ca_chain_der


def der_to_pem(der_bytes, pem_type="CERTIFICATE"):
    """Convert DER bytes to PEM string."""
    import base64
    b64 = base64.b64encode(der_bytes).decode("ascii")
    lines = [b64[i : i + 64] for i in range(0, len(b64), 64)]
    return f"-----BEGIN {pem_type}-----\n" + "\n".join(lines) + f"\n-----END {pem_type}-----\n"


def build_pkcs12(key_pem, cert_pem, ca_pem, out_path, passphrase):
    """Build a PKCS12 keystore from PEM components using openssl."""
    os.makedirs(os.path.dirname(out_path), exist_ok=True)

    # Write temp PEM files
    os.makedirs(TMP_DIR, exist_ok=True)
    key_file = os.path.join(TMP_DIR, "key.pem")
    cert_file = os.path.join(TMP_DIR, "cert.pem")
    ca_file = os.path.join(TMP_DIR, "ca-chain.pem")

    with open(key_file, "w") as f:
        f.write(key_pem)
    with open(cert_file, "w") as f:
        f.write(cert_pem)
    if ca_pem:
        with open(ca_file, "w") as f:
            f.write(ca_pem)

    # Build PKCS12 with openssl (use -legacy for fast RC2 encryption,
    # which node-forge parses without issues)
    cmd = [
        "openssl", "pkcs12", "-export",
        "-inkey", key_file,
        "-in", cert_file,
        "-passout", f"pass:{passphrase}",
        "-out", out_path,
        "-legacy",
        "-name", "lucapacioli_aps_system_integrationstest_s1",
    ]
    if ca_pem and os.path.isfile(ca_file):
        cmd += ["-certfile", ca_file]

    result = subprocess.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"ERROR: openssl pkcs12 failed: {result.stderr}")
        sys.exit(1)

    # Clean up temp files (they contain the private key)
    for f in [key_file, cert_file, ca_file]:
        if os.path.exists(f):
            os.remove(f)
    try:
        os.rmdir(TMP_DIR)
    except OSError:
        pass


# ─── Main ───────────────────────────────────────────────────────────────


def main():
    print("=" * 60)
    print("  SKAT Test Certificate Extractor")
    print("=" * 60)
    print()
    print("This script extracts the VOCES3 S1 test certificate from")
    print("SKAT's public client-keystore.jks and builds a PKCS12 file")
    print("that AlphaFlow can load.")
    print()
    print("PRIVACY: runs entirely locally. No network. Passphrase is")
    print("read from app.conf / env var and used in-memory only.")
    print()

    # 1. Find the JKS
    jks_path = find_jks()
    print(f"[1/5] JKS keystore: {jks_path}")

    # 2. Get the passphrase
    passphrase, source = get_passphrase()
    print(f"[2/5] Passphrase source: {source}")
    print(f"      (passphrase not shown for security)")

    # 3. Load the keystore + list aliases
    ks = jks.KeyStore.load(jks_path, JKS_STOREPASS)
    aliases = list(ks.private_keys.keys())
    print(f"[3/5] Keystore loaded. {len(aliases)} private key entries:")
    for a in aliases:
        marker = " ← preferred" if a in PREFERRED_ALIASES else ""
        print(f"        - {a}{marker}")

    # 4. Try each preferred alias with the passphrase
    print(f"[4/5] Extracting private key + certificate...")
    result = None
    used_alias = None
    # If passphrase came from app.conf, it's a dict of {alias: pass}
    if isinstance(passphrase, dict):
        for alias in PREFERRED_ALIASES:
            pwd = passphrase.get(alias) or passphrase.get(alias.lower())
            if not pwd:
                continue
            print(f"        Trying alias '{alias}'...")
            result = extract_key_and_cert(jks_path, alias, pwd)
            if result:
                used_alias = alias
                passphrase_to_use = pwd
                break
        if not result:
            # Try all aliases in the passphrases dict
            for alias, pwd in passphrase.items():
                if alias in ks.private_keys:
                    print(f"        Trying alias '{alias}'...")
                    result = extract_key_and_cert(jks_path, alias, pwd)
                    if result:
                        used_alias = alias
                        passphrase_to_use = pwd
                        break
    else:
        # Single passphrase from env var — try preferred aliases
        passphrase_to_use = passphrase
        for alias in PREFERRED_ALIASES:
            print(f"        Trying alias '{alias}'...")
            result = extract_key_and_cert(jks_path, alias, passphrase_to_use)
            if result:
                used_alias = alias
                break

    if not result:
        print()
        print("ERROR: Could not extract the private key with the provided passphrase.")
        print("       The passphrase does not match any of the preferred aliases.")
        print("       Check that your app.conf contains the correct passphrase for")
        print("       'lucapacioli_aps_system_integrationstest_s1'.")
        sys.exit(1)

    key_der, cert_der, ca_der = result
    print(f"        ✓ Extracted from alias '{used_alias}'")
    print(f"          Private key: {len(key_der)} bytes DER")
    print(f"          Certificate: {len(cert_der)} bytes DER")
    if ca_der:
        print(f"          CA chain: {len(ca_der)} bytes DER")

    # 5. Build the PKCS12
    print(f"[5/5] Building PKCS12 keystore: {OUTPUT_P12}")
    key_pem = der_to_pem(key_der, "PRIVATE KEY")
    cert_pem = der_to_pem(cert_der, "CERTIFICATE")
    ca_pem = der_to_pem(ca_der, "CERTIFICATE") if ca_der else ""
    build_pkcs12(key_pem, cert_pem, ca_pem, OUTPUT_P12, passphrase_to_use)

    # 6. Verify
    print()
    print("Verifying the PKCS12...")
    verify = subprocess.run(
        ["openssl", "pkcs12", "-info", "-in", OUTPUT_P12, "-passin", f"pass:{passphrase_to_use}", "-noout"],
        capture_output=True, text=True,
    )
    if verify.returncode == 0:
        print("  ✓ PKCS12 is valid and can be opened with the passphrase")
    else:
        print(f"  ✗ Verification failed: {verify.stderr}")
        sys.exit(1)

    # Done
    size = os.path.getsize(OUTPUT_P12)
    print()
    print("=" * 60)
    print("  ✓ SUCCESS — client.p12 created")
    print("=" * 60)
    print(f"  File: {OUTPUT_P12}  ({size} bytes)")
    print()
    print("Next steps:")
    print(f"  1. Set in .env (the passphrase is the one from your app.conf):")
    print(f"       SKAT_KEYSTORE_PATH={OUTPUT_P12}")
    print(f"       SKAT_KEYSTORE_PASSWORD=<passphrase>")
    print(f"       SKAT_KEY_PASSWORD=<passphrase>")
    print(f"  2. Also set the 3 endpoints from your app.conf + ALPHAFLOW_CVR")
    print(f"  3. AlphaFlow will then use real mTLS + WS-Security (no simulation)")
    print()


if __name__ == "__main__":
    main()
