#!/usr/bin/env python3
"""
SKAT Test Certificate Extractor
================================

Extracts the VOCES3 S1 test certificate + private key from SKAT's public
client-keystore.jks (in the rsu-b2b-sample-client-java GitHub repo) and
builds a PKCS12 keystore that AlphaFlow can load.

PRIVACY: This script runs entirely locally. It does NOT make any network
request (except an optional one-time download of the public JKS file from
SKAT's GitHub repo), does NOT print the passphrase, and does NOT upload
anything. The passphrase is read from your local app.conf and used only
in-memory.

TWO EXTRACTION METHODS (auto-detected):
  1. keytool  — Java's native JKS tool (preferred, no Python deps needed)
  2. pyjks    — Python library (fallback if keytool not installed)

PREREQUISITES (one of):
  - Java JRE installed (provides `keytool`):  sudo apt install default-jre
  - OR pyjks Python package:                  pip3 install pyjks

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
import shutil
import subprocess
from pathlib import Path

# ─── Configuration ───────────────────────────────────────────────────────

# The JKS keystore from SKAT's public GitHub repo.
JKS_PATHS = [
    "/tmp/skat-rsu/rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks",
    "./rsu-b2b-sample-client/src/main/resources/keystore/client-keystore.jks",
    os.environ.get("SKAT_JKS_PATH", ""),
]

JKS_STOREPASS = "storepassword"  # public, from Client_Sign.properties

# The alias we want — the VOCES3 System S1 integrationstest certificate.
# Listed in BOTH CamelCase (as in app.conf) and lowercase (as stored in JKS).
# keytool/pyjks will use whichever matches the keystore.
PREFERRED_ALIASES = [
    "LucaPacioli_ApS_System_Integrationstest_S1",
    "lucapacioli_aps_system_integrationstest_s1",
    "LucaPacioli_ApS_System_Integrationstest_S1_expired",
    "lucapacioli_aps_system_integrationstest_s1_expired",
    "LucaPacioli_ApS_System_Integrationstest_S1_revoked",
    "lucapacioli_aps_system_integrationstest_s1_revoked",
]

# Output paths (relative to project root)
APP_CONF_PATH = "certs/skat/app.conf"
OUTPUT_P12 = "certs/skat/client.p12"
TMP_DIR = "/tmp/skat-extract"

# ─── Helpers ────────────────────────────────────────────────────────────


def find_jks():
    """Find the client-keystore.jks file, auto-downloading if needed."""
    for p in JKS_PATHS:
        if p and os.path.isfile(p):
            return p
    # Auto-download from SKAT's GitHub repo
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

    Returns a dict: { alias: passphrase }  (both original and lowercased alias)
    """
    with open(path, "r") as f:
        content = f.read()

    # Find the certificatePassphrases { ... } block
    m = re.search(r"certificatePassphrases\s*\{([^}]*)\}", content, re.DOTALL)
    if not m:
        return {}

    block = m.group(1)
    passphrases = {}
    for line in block.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        m2 = re.match(r'^([a-zA-Z0-9_]+)\s*=\s*"([^"]*)"', line)
        if m2:
            alias = m2.group(1)
            passphrases[alias] = m2.group(2)
            passphrases[alias.lower()] = m2.group(2)

    return passphrases


def get_passphrase():
    """Get the certificate passphrase from app.conf or env var.

    Returns (passphrases_dict_or_string, source_description)
    """
    # Option 1: environment variable (single passphrase)
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


def has_keytool():
    """Check if Java's keytool is available on PATH."""
    return shutil.which("keytool") is not None


def has_openssl():
    """Check if openssl is available on PATH."""
    return shutil.which("openssl") is not None


# ─── Method 1: keytool (Java native, no Python deps) ────────────────────


def extract_with_keytool(jks_path, alias, passphrase):
    """Use Java's keytool to convert the JKS alias to a PKCS12 file directly.

    keytool is Java's native JKS handler — it's the most reliable way to
    read JKS keystores. Requires a Java JRE (provides `keytool`).
    """
    if not has_keytool():
        return False, "keytool not found on PATH"

    os.makedirs(os.path.dirname(OUTPUT_P12), exist_ok=True)
    # Remove existing output so keytool doesn't complain
    if os.path.exists(OUTPUT_P12):
        os.remove(OUTPUT_P12)

    cmd = [
        "keytool",
        "-importkeystore",
        "-srckeystore", jks_path,
        "-srcstorepass", JKS_STOREPASS,
        "-srcalias", alias,
        "-srckeypass", passphrase,
        "-destkeystore", OUTPUT_P12,
        "-deststorepass", passphrase,
        "-destkeypass", passphrase,
        "-deststoretype", "PKCS12",
        "-J-Dkeystore.pkcs12.legacy=true",  # fast RC2 encryption (node-forge compatible)
    ]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=60)

    if result.returncode == 0 and os.path.exists(OUTPUT_P12):
        return True, None
    else:
        stderr = result.stderr.strip()
        # Clean up partial output
        if os.path.exists(OUTPUT_P12):
            os.remove(OUTPUT_P12)
        if "UnrecoverableKeyException" in stderr or "Cannot recover key" in stderr:
            return False, f"wrong passphrase for alias '{alias}'"
        return False, stderr or "keytool failed (unknown reason)"


# ─── Method 2: pyjks + openssl (Python, fallback) ───────────────────────


def extract_with_pyjks(jks_path, alias, passphrase):
    """Use the pyjks Python library to extract the key, then openssl to build PKCS12."""
    try:
        import jks
    except ImportError:
        return False, "pyjks not installed (install with: pip3 install pyjks)"

    ks = jks.KeyStore.load(jks_path, JKS_STOREPASS)
    if alias not in ks.private_keys:
        return False, f"alias '{alias}' not found in keystore"

    entry = ks.private_keys[alias]
    if not entry.is_decrypted():
        try:
            entry.decrypt(passphrase)
        except Exception as e:
            return False, f"could not decrypt private key (wrong passphrase?)"

    if not has_openssl():
        return False, "openssl not found on PATH (required for pyjks method)"

    # Convert DER → PEM
    import base64
    def der_to_pem(der, pem_type="CERTIFICATE"):
        b64 = base64.b64encode(der).decode("ascii")
        lines = [b64[i:i + 64] for i in range(0, len(b64), 64)]
        return f"-----BEGIN {pem_type}-----\n" + "\n".join(lines) + f"\n-----END {pem_type}-----\n"

    key_pem = der_to_pem(entry.pkey, "PRIVATE KEY")
    cert_pem = der_to_pem(entry.cert_chain[0].cert, "CERTIFICATE")
    ca_pem = ""
    if len(entry.cert_chain) > 1:
        ca_der = b"".join(c.cert for c in entry.cert_chain[1:])
        ca_pem = der_to_pem(ca_der, "CERTIFICATE")

    # Write temp PEM files
    os.makedirs(TMP_DIR, exist_ok=True)
    key_file = os.path.join(TMP_DIR, "key.pem")
    cert_file = os.path.join(TMP_DIR, "cert.pem")
    ca_file = os.path.join(TMP_DIR, "ca-chain.pem")
    with open(key_file, "w") as f: f.write(key_pem)
    with open(cert_file, "w") as f: f.write(cert_pem)
    if ca_pem:
        with open(ca_file, "w") as f: f.write(ca_pem)

    os.makedirs(os.path.dirname(OUTPUT_P12), exist_ok=True)
    cmd = [
        "openssl", "pkcs12", "-export",
        "-inkey", key_file,
        "-in", cert_file,
        "-passout", f"pass:{passphrase}",
        "-out", OUTPUT_P12,
        "-legacy",
        "-name", alias,
    ]
    if ca_pem:
        cmd += ["-certfile", ca_file]

    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)

    # Clean up temp files (contain private key)
    for f in [key_file, cert_file, ca_file]:
        if os.path.exists(f):
            os.remove(f)

    if result.returncode == 0 and os.path.exists(OUTPUT_P12):
        return True, None
    return False, result.stderr.strip() or "openssl pkcs12 failed"


# ─── Main ───────────────────────────────────────────────────────────────


def main():
    print("=" * 60)
    print("  SKAT Test Certificate Extractor")
    print("=" * 60)
    print()
    print("Extracts the VOCES3 S1 test certificate from SKAT's public")
    print("client-keystore.jks and builds a PKCS12 file for AlphaFlow.")
    print()
    print("PRIVACY: runs entirely locally. No network (except optional")
    print("JKS download). Passphrase used in-memory only, never printed.")
    print()

    # Check prerequisites
    use_keytool = has_keytool()
    use_pyjks = False
    if not use_keytool:
        try:
            import jks
            use_pyjks = True
        except ImportError:
            pass

    if not use_keytool and not use_pyjks:
        print("ERROR: Neither keytool nor pyjks is available.")
        print()
        print("Install ONE of the following:")
        print()
        print("  Option A — Java JRE (provides keytool, recommended):")
        print("    sudo apt install default-jre")
        print()
        print("  Option B — pyjks Python package:")
        print("    sudo apt install python3-pip")
        print("    pip3 install pyjks")
        print("    # (if PEP 668 blocks: pip3 install --break-system-packages pyjks)")
        sys.exit(1)

    method = "keytool" if use_keytool else "pyjks"
    print(f"[i] Extraction method: {method}" + (" (Java native)" if use_keytool else " (Python)"))
    print()

    # 1. Find the JKS
    jks_path = find_jks()
    print(f"[1/4] JKS keystore: {jks_path}")

    # 2. Get the passphrase
    passphrase, source = get_passphrase()
    print(f"[2/4] Passphrase source: {source}")
    print(f"      (passphrase not shown for security)")

    # 3. Determine which alias + passphrase to use
    # If passphrase came from app.conf, it's a dict {alias: pass}
    # If from env var, it's a single string
    candidates = []  # list of (alias, passphrase) tuples to try
    if isinstance(passphrase, dict):
        for alias in PREFERRED_ALIASES:
            pwd = passphrase.get(alias) or passphrase.get(alias.lower())
            if pwd:
                candidates.append((alias, pwd))
        # Also try all aliases present in the passphrases dict
        for alias, pwd in passphrase.items():
            if alias not in [c[0] for c in candidates]:
                candidates.append((alias, pwd))
    else:
        for alias in PREFERRED_ALIASES:
            candidates.append((alias, passphrase))

    if not candidates:
        print("ERROR: No matching alias found in app.conf.")
        print("       Expected an entry for one of:")
        for a in PREFERRED_ALIASES:
            print(f"         {a}")
        sys.exit(1)

    print(f"[3/4] Trying {len(candidates)} alias(es) with the {method} method...")

    # 4. Try each candidate
    success = False
    used_alias = None
    used_passphrase = None
    for alias, pwd in candidates:
        print(f"        - alias '{alias}'...", end=" ")
        if use_keytool:
            ok, err = extract_with_keytool(jks_path, alias, pwd)
        else:
            ok, err = extract_with_pyjks(jks_path, alias, pwd)
        if ok:
            print("✓")
            success = True
            used_alias = alias
            used_passphrase = pwd
            break
        else:
            print(f"✗ ({err})")

    if not success:
        print()
        print("ERROR: Could not extract the private key with any of the tried aliases.")
        print()
        if method == "keytool":
            print("       The passphrase(s) in your app.conf do not match the keystore.")
        else:
            print("       The passphrase(s) could not decrypt the private key.")
        print()
        print("       Verify that your app.conf contains the correct passphrase for")
        print("       'lucapacioli_aps_system_integrationstest_s1'.")
        sys.exit(1)

    print(f"[4/4] Building PKCS12: {OUTPUT_P12}")

    # Verify the output
    print()
    print("Verifying the PKCS12...")
    verify = subprocess.run(
        ["openssl", "pkcs12", "-info", "-in", OUTPUT_P12, "-passin", f"pass:{used_passphrase}", "-noout"],
        capture_output=True, text=True,
    )
    if verify.returncode == 0 and "MAC verified OK" in verify.stderr:
        print("  ✓ PKCS12 is valid — MAC verified OK")
    elif verify.returncode == 0:
        print("  ✓ PKCS12 is valid and can be opened with the passphrase")
    else:
        print(f"  ⚠ Verification warning: {verify.stderr.strip()}")
        print(f"    (the file may still be usable — try loading it in AlphaFlow)")

    size = os.path.getsize(OUTPUT_P12)
    print()
    print("=" * 60)
    print("  ✓ SUCCESS — client.p12 created")
    print("=" * 60)
    print(f"  File: {OUTPUT_P12}  ({size} bytes)")
    print(f"  Alias used: {used_alias}")
    print()
    print("Next steps:")
    print(f"  1. Set in .env (use the SAME passphrase from your app.conf):")
    print(f"       SKAT_KEYSTORE_PATH={OUTPUT_P12}")
    print(f"       SKAT_KEYSTORE_PASSWORD=<passphrase>")
    print(f"       SKAT_KEY_PASSWORD=<passphrase>")
    print(f"  2. Also set the 3 endpoints from your app.conf + ALPHAFLOW_CVR")
    print(f"  3. AlphaFlow will then use real mTLS + WS-Security (no simulation)")
    print()


if __name__ == "__main__":
    main()
