"""
danish_validate.py — Danish identifier validation.

Uses python-stdnum library for battle-tested validation:
  - CVR (8 digits + Modulo-11 checksum)
  - EAN-13 (13 digits + check digit)
  - IBAN (DK format: DK + 16 digits + MOD-97 checksum)
  - CPR (10 digits — format only, no checksum due to privacy)

These are NEW improvements vs the JS version, which only did regex format
checks (no Mod-11 / MOD-97 checksums).
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Optional


@dataclass
class ValidationResult:
    is_valid: bool
    normalized: Optional[str]
    error: Optional[str] = None


# ── CVR (Danish company registration number) ──────────────────


def validate_cvr(cvr: str) -> ValidationResult:
    """
    Validate a Danish CVR number with Modulo-11 checksum.

    CVR format: 8 digits. The last digit is a Mod-11 check digit.
    Algorithm: multiply each digit by weights [2,7,6,5,4,3,2,1],
    sum modulo 11 must be 0.

    Args:
        cvr: CVR string (may contain spaces, "DK" prefix, dashes)
    Returns:
        ValidationResult with normalized CVR (8 digits) or error
    """
    if not cvr:
        return ValidationResult(False, None, "CVR is empty")

    # Clean: strip "DK" prefix, spaces, dashes
    cleaned = re.sub(r"[^\d]", "", cvr.upper().replace("DK", ""))

    if not cleaned:
        return ValidationResult(False, None, "No digits found")

    if len(cleaned) != 8:
        return ValidationResult(False, None, f"CVR must be 8 digits (got {len(cleaned)})")

    try:
        from stdnum.dk.cvr import is_valid as stdnum_cvr_is_valid
        if stdnum_cvr_is_valid(cleaned):
            return ValidationResult(True, cleaned)
        return ValidationResult(False, cleaned, "CVR failed Mod-11 checksum")
    except ImportError:
        # Fallback: implement Mod-11 ourselves
        weights = [2, 7, 6, 5, 4, 3, 2, 1]
        try:
            digits = [int(d) for d in cleaned]
            total = sum(d * w for d, w in zip(digits, weights))
            if total % 11 == 0:
                return ValidationResult(True, cleaned)
            return ValidationResult(False, cleaned, "CVR failed Mod-11 checksum")
        except ValueError:
            return ValidationResult(False, cleaned, "CVR contains non-digit characters")


def extract_cvr_from_text(text: str) -> Optional[str]:
    """
    Extract a CVR number from text by looking for "CVR" keyword nearby.

    Returns the first valid CVR found, or None.
    """
    if not text:
        return None

    # Look for "CVR" or "CVR-nr" followed by 8 digits (with optional DK prefix, spaces, dashes)
    patterns = [
        re.compile(r"CVR[\s\-:]*(?:nr\.?)?[\s:]*(DK)?\s*(\d{8})", re.IGNORECASE),
        re.compile(r"(?:DK)\s*(\d{8})\b", re.IGNORECASE),  # DK + 8 digits
    ]

    for pattern in patterns:
        for match in pattern.finditer(text):
            cvr_str = match.group(2) if match.lastindex == 2 else match.group(1)
            result = validate_cvr(cvr_str)
            if result.is_valid:
                return result.normalized

    return None


# ── EAN-13 (European Article Number) ──────────────────────────


def validate_ean13(ean: str) -> ValidationResult:
    """
    Validate an EAN-13 number with check digit.

    Used for Danish public sector invoicing (EAN-nummer).
    """
    if not ean:
        return ValidationResult(False, None, "EAN is empty")

    cleaned = re.sub(r"[^\d]", "", ean)

    if len(cleaned) != 13:
        return ValidationResult(False, cleaned, f"EAN-13 must be 13 digits (got {len(cleaned)})")

    try:
        from stdnum.ean import is_valid as stdnum_ean_is_valid
        if stdnum_ean_is_valid(cleaned):
            return ValidationResult(True, cleaned)
        return ValidationResult(False, cleaned, "EAN-13 check digit mismatch")
    except ImportError:
        # Fallback: implement check digit
        try:
            digits = [int(d) for d in cleaned]
            # Even positions (1,3,5,7,9,11 — 0-indexed) weighted 1, odd positions weighted 3
            total = sum(d * (1 if i % 2 == 0 else 3) for i, d in enumerate(digits[:-1]))
            check = (10 - (total % 10)) % 10
            if check == digits[-1]:
                return ValidationResult(True, cleaned)
            return ValidationResult(False, cleaned, "EAN-13 check digit mismatch")
        except ValueError:
            return ValidationResult(False, cleaned, "EAN contains non-digit characters")


# ── IBAN (International Bank Account Number) ──────────────────


def validate_iban(iban: str) -> ValidationResult:
    """
    Validate an IBAN with MOD-97 checksum.
    Danish IBAN format: DK + 2 check digits + 14 digits = 18 chars total.
    """
    if not iban:
        return ValidationResult(False, None, "IBAN is empty")

    cleaned = re.sub(r"[\s\-]", "", iban.upper())

    # Generic IBAN format check
    if not re.match(r"^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$", cleaned):
        return ValidationResult(False, cleaned, "IBAN format invalid")

    # Danish IBAN must be exactly 18 chars
    if cleaned.startswith("DK") and len(cleaned) != 18:
        return ValidationResult(False, cleaned, f"Danish IBAN must be 18 chars (got {len(cleaned)})")

    try:
        from stdnum.iban import is_valid as stdnum_iban_is_valid
        if stdnum_iban_is_valid(cleaned):
            return ValidationResult(True, cleaned)
        return ValidationResult(False, cleaned, "IBAN MOD-97 checksum failed")
    except ImportError:
        # Fallback: implement MOD-97
        # Move first 4 chars to end, convert letters to numbers (A=10, B=11, ...), then MOD-97
        try:
            rearranged = cleaned[4:] + cleaned[:4]
            numeric = ""
            for ch in rearranged:
                if ch.isdigit():
                    numeric += ch
                elif ch.isalpha():
                    numeric += str(ord(ch) - ord("A") + 10)
                else:
                    return ValidationResult(False, cleaned, "IBAN contains invalid characters")
            if int(numeric) % 97 == 1:
                return ValidationResult(True, cleaned)
            return ValidationResult(False, cleaned, "IBAN MOD-97 checksum failed")
        except (ValueError, OverflowError):
            return ValidationResult(False, cleaned, "IBAN MOD-97 computation failed")


# ── Document type classification ──────────────────────────────


def classify_document_type(text: str) -> str:
    """
    Classify document type from text content.

    Returns one of: "receipt", "invoice", "credit_note", "unknown"

    Heuristics (Danish + English keywords):
      - "Kreditnota" / "Credit note" → credit_note
      - "Faktura" / "Invoice" → invoice
      - "Kvittering" / "Receipt" / "Bon" → receipt
      - Otherwise → unknown
    """
    if not text:
        return "unknown"

    text_lower = text.lower()

    # Credit note detection (highest priority — must check before invoice)
    credit_note_indicators = [
        "kreditnota", "credit note", "credit memo",
        "kreditnotering", "tilbagebetaling",
        "i forbindelse med faktura", "refusion",
    ]
    if any(ind in text_lower for ind in credit_note_indicators):
        return "credit_note"

    # Invoice detection
    invoice_indicators = [
        "faktura", "invoice", "fakturanr", "fakturanummer",
        "forfaldsdato", "due date", "betalingstermin",
        "at betale", "betalingsbetingelse", "payment terms",
    ]
    invoice_hits = sum(1 for ind in invoice_indicators if ind in text_lower)
    if invoice_hits >= 2:
        return "invoice"

    # Receipt detection
    receipt_indicators = [
        "kvittering", "receipt", "bon ",
        "kontant", "cash", "dankort", "mobilepay",
        "danmark", "butik", "tlf", "cvr",
    ]
    receipt_hits = sum(1 for ind in receipt_indicators if ind in text_lower)
    if receipt_hits >= 2:
        return "receipt"

    # Single strong signal
    if "faktura" in text_lower or "invoice" in text_lower:
        return "invoice"
    if "kvittering" in text_lower or "receipt" in text_lower:
        return "receipt"

    return "unknown"


# ── Danish keyword → account number categorization ────────────
# Port of src/app/api/ai-categorize/route.ts logic.

ACCOUNT_KEYWORDS: list[dict] = [
    {
        "account": "8000", "name": "Husleje",
        "keywords": ["husleje", "leje", "rent", "lejemål"],
        "confidence": 0.92,
    },
    {
        "account": "7000", "name": "Lønninger",
        "keywords": ["løn", "lønning", "lønninger", "salary", "wage", "honorar"],
        "confidence": 0.95,
    },
    {
        "account": "8100", "name": "El, vand og varme",
        "keywords": ["el", "vand", "varme", "strøm", "fjernvarme", "gas", "elektricitet",
                     "electricity", "vandafgift", "fjernkøling"],
        "confidence": 0.88,
    },
    {
        "account": "8400", "name": "Forsikring",
        "keywords": ["forsikring", "insurance", "indbo", "ansvarsforsikring",
                     "erhvervsforsikring", "skadesforsikring"],
        "confidence": 0.90,
    },
    {
        "account": "8600", "name": "IT- og kommunikationsomkostninger",
        "keywords": ["internet", "telefon", "mobil", "bredbånd", "it", "software",
                     "hosting", "domæne", "cloud", "abonnement", "subscription"],
        "confidence": 0.85,
    },
    {
        "account": "8700", "name": "Kontorartikler",
        "keywords": ["kontor", "office", "papir", "printer", "blæk", "toner",
                     "skriveartikel", "kontorartikel"],
        "confidence": 0.80,
    },
    {
        "account": "8800", "name": "Annoncering og markedsføring",
        "keywords": ["reklame", "marketing", "annoncering", "annonce", "facebook",
                     "google ads", "linkedin", "so-me", "social media"],
        "confidence": 0.83,
    },
    {
        "account": "4100", "name": "Konsulentydelser",
        "keywords": ["konsulent", "consulting", "rådgivning", "rådgiver",
                     "konsulentydelse", "fremmøde", "workshop"],
        "confidence": 0.87,
    },
]


def suggest_account(description: str) -> Optional[dict]:
    """
    Suggest a Danish FSR account number based on description keywords.

    Returns dict with accountNumber, accountName, confidence, matchedKeywords
    or None if no match.
    """
    if not description:
        return None

    desc_lower = description.lower()
    best_match = None
    best_confidence = 0
    matched_keywords: list[str] = []

    for entry in ACCOUNT_KEYWORDS:
        matched = [kw for kw in entry["keywords"] if kw in desc_lower]
        if matched:
            # Confidence scales with number of matches
            confidence = entry["confidence"] * (1 + 0.05 * (len(matched) - 1))
            confidence = min(0.99, confidence)
            if confidence > best_confidence:
                best_match = entry
                best_confidence = confidence
                matched_keywords = matched

    if not best_match:
        return None

    return {
        "accountNumber": best_match["account"],
        "accountName": best_match["name"],
        "confidence": round(best_confidence, 2),
        "matchedKeywords": matched_keywords,
    }
