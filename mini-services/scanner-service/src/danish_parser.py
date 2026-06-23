"""
danish_parser.py — Danish receipt/invoice text parser.

Faithful Python port of `AlphaFlow-Final/src/lib/ocr/receipt-parser.ts` (754 LOC).

All regex patterns, Danish month names, number parsing, line-item block
grouping, and description cleaning logic is preserved EXACTLY from the
TypeScript source — this is battle-tested logic that should not change.

Public API:
  - parse_receipt_text(text) → ParsedReceiptFields (totalAmount, date, vatPercent)
  - parse_invoice_text(text) → ParsedInvoiceResult (date, vatPercent, totalAmount, lineItems)

Used by ocr_engine.py as fallback / verification after Tesseract OCR.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional


# ── Types (mirror TS interfaces) ────────────────────────────────


@dataclass
class ParsedReceiptFields:
    totalAmount: Optional[float] = None
    date: Optional[str] = None       # YYYY-MM-DD
    vatPercent: Optional[float] = None


@dataclass
class ParsedLineItem:
    description: str = ""
    quantity: float = 1.0
    unitPrice: float = 0.0
    vatPercent: float = 25.0


@dataclass
class ParsedInvoiceResult:
    date: Optional[str] = None
    vatPercent: Optional[float] = None
    totalAmount: Optional[float] = None
    lineItems: list[ParsedLineItem] = field(default_factory=list)


# ── Danish month names (preserved EXACTLY) ─────────────────────

DANISH_MONTHS: dict[str, int] = {
    "jan": 1, "januar": 1, "january": 1,
    "feb": 2, "februar": 2, "february": 2,
    "mar": 3, "marts": 3, "march": 3,
    "apr": 4, "april": 4,
    "maj": 5, "may": 5,
    "jun": 6, "juni": 6, "june": 6,
    "jul": 7, "juli": 7, "july": 7,
    "aug": 8, "august": 8,
    "sep": 9, "september": 9,
    "okt": 10, "oktober": 10, "oct": 10, "october": 10,
    "nov": 11, "november": 11,
    "dec": 12, "december": 12,
}


# ── Public API ──────────────────────────────────────────────────


def parse_receipt_text(text: Optional[str]) -> ParsedReceiptFields:
    """Parse Danish receipt text → (totalAmount, date, vatPercent)."""
    if not text or not isinstance(text, str):
        return ParsedReceiptFields()
    return ParsedReceiptFields(
        date=extract_date(text),
        totalAmount=extract_amount(text),
        vatPercent=extract_vat(text),
    )


def parse_invoice_text(text: Optional[str]) -> ParsedInvoiceResult:
    """Parse Danish invoice text → full line-item extraction."""
    empty = ParsedInvoiceResult()
    if not text or not isinstance(text, str):
        return empty

    date = extract_date(text)
    vat_percent = extract_vat(text)
    line_items = _extract_line_items(text)

    if line_items:
        total = 0.0
        for item in line_items:
            line_total = item.quantity * item.unitPrice
            vat_add = line_total * (item.vatPercent / 100.0)
            total += line_total + vat_add
        return ParsedInvoiceResult(
            date=date,
            vatPercent=vat_percent,
            totalAmount=round(total, 2),
            lineItems=line_items,
        )

    return ParsedInvoiceResult(
        date=date,
        vatPercent=vat_percent,
        totalAmount=extract_amount(text),
        lineItems=[],
    )


# ── Helpers ─────────────────────────────────────────────────────


def has_monetary_amount(line: str) -> bool:
    """Check whether a line contains a Danish monetary-format number."""
    if re.search(r"\d+,\d{1,2}\b", line):
        return True
    if re.search(r"\d{1,3}\.\d{3}", line):
        return True
    if re.search(r"\d[\d.,]*\s*kr", line, re.IGNORECASE):
        return True
    return False


def is_continuation_text(line: str) -> bool:
    """Check whether a line is a CONTINUATION of the previous description."""
    trimmed = line.strip()
    if re.match(r"^[a-zæøåäö]", trimmed):
        return True
    if trimmed.startswith("&"):
        return True
    return False


def is_descriptive_text(line: str) -> bool:
    """Check whether a line contains actual descriptive text (letters)."""
    stripped = re.sub(r"[\d%.,\-–—|\s:/]+", "", line).strip()
    return bool(re.search(r"[a-zA-ZæøåÆØÅäöÄÖ]{3,}", stripped))


def extract_all_numbers(line: str) -> list[float]:
    """Extract ALL numbers from a line of text (left-to-right)."""
    numbers: list[float] = []
    for match in re.finditer(r"(\d[\d.,]*)", line):
        raw = match.group(1)
        num = parse_danish_number(raw)
        if num is not None and 0 < num < 10_000_000:
            # Skip year-like 4-digit integers
            if 1990 <= num <= 2100 and "." not in raw and "," not in raw:
                continue
            numbers.append(num)
    return numbers


def _extract_line_items(text: str) -> list[ParsedLineItem]:
    """Extract line items from a Danish invoice table."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]
    if not lines:
        return []

    # Find "Beløb" header row
    header_index = -1
    for i, line in enumerate(lines):
        if re.search(r"BELØB|Beløb", line, re.IGNORECASE):
            header_index = i
            break

    if header_index == -1:
        return []

    # Collect content lines between header and subtotal
    content_lines: list[str] = []
    for line in lines[header_index + 1 :]:
        if re.match(
            r"^(?:Subtotal|I alt|Moms i alt|Total|At betale|Forfaldsdato|BANKDETAILER|BETINGELSER|BETALING)",
            line,
            re.IGNORECASE,
        ):
            break
        content_lines.append(line)

    if not content_lines:
        return []

    # Group lines into blocks
    blocks: list[list[str]] = []
    current_block: list[str] = []
    block_has_monetary = False

    for line in content_lines:
        monetary = has_monetary_amount(line)
        descriptive = is_descriptive_text(line)
        if descriptive and block_has_monetary and current_block:
            if is_continuation_text(line):
                current_block.append(line)
            else:
                blocks.append(current_block)
                current_block = [line]
                block_has_monetary = monetary
        else:
            current_block.append(line)
            if monetary:
                block_has_monetary = True

    if current_block:
        blocks.append(current_block)

    # Merge orphaned descriptive blocks back into previous block
    merged_blocks: list[list[str]] = []
    for block in blocks:
        combined = " ".join(block)
        if (
            merged_blocks
            and not has_monetary_amount(combined)
            and any(is_descriptive_text(l) for l in block)
        ):
            merged_blocks[-1].extend(block)
        else:
            merged_blocks.append(list(block))

    # Parse each block
    items: list[ParsedLineItem] = []
    default_vat = extract_vat(text) or 25

    for block in merged_blocks:
        combined = " ".join(block)
        if has_monetary_amount(combined):
            item = _parse_single_line_item(combined, default_vat)
            if item:
                items.append(item)

    return items


def _clean_description(raw: str) -> str:
    """Clean up OCR description text from Tesseract artifacts."""
    if not raw:
        return ""

    desc = raw

    # Remove stray pipe characters (column separators)
    desc = re.sub(r"[|]", "", desc)

    # Fix "K lentydelse" → "Klentydelse" (uppercase + space + lowercase word)
    desc = re.sub(r"([A-ZÆØÅ])([ \u00A0])([a-zæøå]{4,})", r"\1\3", desc)

    # Fix "ve dligehold" → "vedligehold" (lowercase fragment + word)
    desc = re.sub(r"^([a-zæøå]{1,2})([ \u00A0])([a-zæøå]{4,})", r"\1\3", desc)

    # Fix broken words after uppercase/digit/punctuation
    def _mid_merge(m: re.Match) -> str:
        prefix, fragment, _space, rest = m.group(1), m.group(2), m.group(3), m.group(4)
        return f"{prefix}{fragment}{rest}"

    desc = re.sub(
        r"([0-9A-ZÆØÅ.\-–—,(])([a-zæøå]{1,2})([ \u00A0])([a-zæøå]{4,})",
        _mid_merge,
        desc,
    )

    # Normalize whitespace
    desc = re.sub(r"\s+", " ", desc).strip()

    # Capitalize first letter
    if desc:
        desc = desc[0].upper() + desc[1:]

    return desc[:200]


def _parse_single_line_item(combined: str, default_vat: float) -> Optional[ParsedLineItem]:
    """Parse a single line item from combined block text."""
    vat_match = re.search(r"(\d+)\s*%", combined)
    line_vat = float(vat_match.group(1)) if vat_match else default_vat

    all_numbers = extract_all_numbers(combined)
    # Remove VAT value from monetary numbers
    monetary_nums = [n for n in all_numbers if n != line_vat]

    # Extract description: text before first digit + trailing descriptive text after last "kr."
    before_digit = re.match(r"^(.*?)(?=\d)", combined)
    after_last_kr = re.match(r".*kr\.?\s+(.+)", combined, re.IGNORECASE)
    after_monetary = after_last_kr.group(1).strip() if after_last_kr else ""

    trailing_is_descriptive = bool(after_monetary) and is_descriptive_text(after_monetary)

    raw_description = ""
    if before_digit:
        raw_description = re.sub(r"[|]", "", before_digit.group(1))
        raw_description = re.sub(r"\s+", " ", raw_description).strip()
        if trailing_is_descriptive:
            raw_description = f"{raw_description} {after_monetary}"

    description = _clean_description(raw_description)

    if not monetary_nums:
        return None

    if len(monetary_nums) >= 3:
        qty = monetary_nums[0]
        unit_price = monetary_nums[1]
        total = monetary_nums[-1]
        expected = qty * unit_price
        if (
            1 <= qty < 10000
            and unit_price > 0
            and total > 0
            and abs(expected - total) < max(expected, total) * 0.05
        ):
            return ParsedLineItem(description=description, quantity=qty, unitPrice=unit_price, vatPercent=line_vat)
        return ParsedLineItem(description=description, quantity=1, unitPrice=monetary_nums[0], vatPercent=line_vat)

    if len(monetary_nums) == 2:
        first, second = monetary_nums[0], monetary_nums[1]
        if 1 <= first < 1000 and second >= first:
            return ParsedLineItem(description=description, quantity=first, unitPrice=second, vatPercent=line_vat)
        return ParsedLineItem(description=description, quantity=1, unitPrice=first, vatPercent=line_vat)

    return ParsedLineItem(description=description, quantity=1, unitPrice=monetary_nums[0], vatPercent=line_vat)


def parse_danish_number(s: str) -> Optional[float]:
    """
    Parse Danish-formatted number → float.
    "3.000,00" → 3000.00 (dot=thousands, comma=decimal)
    "300,00" → 300.00
    "3.000" → 3000.00
    """
    if not s:
        return None
    try:
        cleaned = re.sub(r"[^\d.,\-]", "", s)
        if not cleaned:
            return None
        # Danish: dot=thousands, comma=decimal
        normalized = cleaned.replace(".", "").replace(",", ".")
        try:
            return float(normalized)
        except ValueError:
            return None
    except Exception:
        return None


# ── Date extraction ────────────────────────────────────────────


def extract_date(text: str) -> Optional[str]:
    """Extract date from text → YYYY-MM-DD format."""
    patterns = [
        # DD. MMM YYYY (Danish: "19. apr. 2026")
        re.compile(r"(\d{1,2})\.\s+([a-zæøå]+)\.?\s+(\d{4})", re.IGNORECASE),
        # DD MMM YYYY (no dot)
        re.compile(r"(\d{1,2})\s+([a-zæøå]+)\s+(\d{4})", re.IGNORECASE),
        # DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY
        re.compile(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})"),
        # YYYY-MM-DD (ISO)
        re.compile(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})"),
    ]
    for pattern in patterns:
        match = pattern.search(text)
        if match:
            parsed = _normalize_date(match.group(0), match.groups())
            if parsed:
                return parsed
    return None


def _normalize_date(date_str: Optional[str], groups: Optional[tuple] = None) -> Optional[str]:
    """Normalize a date string to YYYY-MM-DD."""
    if not date_str:
        return None
    try:
        # Danish named month
        if groups and len(groups) >= 3:
            day = int(groups[0])
            month_name = groups[1].lower().replace(".", "")
            year = int(groups[2])
            month = DANISH_MONTHS.get(month_name)
            if month and 1 <= day <= 31 and 1990 <= year <= 2100:
                return f"{year}-{month:02d}-{day:02d}"

        # DD/MM/YYYY or DD-MM-YYYY or DD.MM.YYYY
        dmy_match = re.search(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})", date_str, re.IGNORECASE)
        if dmy_match:
            day = dmy_match.group(1).zfill(2)
            month = dmy_match.group(2).zfill(2)
            year = dmy_match.group(3)
            if len(year) == 2:
                year = f"20{year}"
            return f"{year}-{month}-{day}"

        # YYYY-MM-DD
        iso_match = re.search(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", date_str, re.IGNORECASE)
        if iso_match:
            year = iso_match.group(1)
            month = iso_match.group(2).zfill(2)
            day = iso_match.group(3).zfill(2)
            return f"{year}-{month}-{day}"

        return None
    except Exception:
        return None


# ── Amount extraction ──────────────────────────────────────────


def extract_amount(text: str) -> Optional[float]:
    """Extract total monetary amount from text."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    # Phase 1: High-priority total-line patterns
    total_line_patterns = [
        re.compile(r"(?:TOTAL|Total|total)[:\s]+(?:kr\.?\s*)?(?:DKK\s*)?(\d[\d.,]+)", re.IGNORECASE),
        re.compile(r"(\d[\d.,]+)\s*kr\.?\s*(?:total|TOTAL|Total)", re.IGNORECASE),
        re.compile(r"(?:SUM|Sum|sum)[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)", re.IGNORECASE),
        re.compile(r"at\s+betale[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)", re.IGNORECASE),
        re.compile(r"i\s+alt[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)", re.IGNORECASE),
    ]

    for pattern in total_line_patterns:
        last_amount: Optional[float] = None
        for line in lines:
            match = pattern.search(line)
            if match:
                amount = parse_danish_number(match.group(1))
                if amount is not None and amount > 0:
                    last_amount = amount
        if last_amount is not None:
            return last_amount

    # Phase 2: Fallback — largest monetary amount
    fallback_patterns = [
        re.compile(r"dkk\s*(\d[\d.,]+)", re.IGNORECASE),
        re.compile(r"kr\.?\s*(\d[\d.,]+)", re.IGNORECASE),
        re.compile(r"(?:pris|price|amount)[:\s]+(?:kr\.?\s*)?(\d[\d.,]+)", re.IGNORECASE),
    ]

    all_amounts: list[float] = []
    for pattern in fallback_patterns:
        for line in lines:
            match = pattern.search(line)
            if match:
                amount = parse_danish_number(match.group(1))
                if amount is not None and amount > 0:
                    all_amounts.append(amount)

    if all_amounts:
        all_amounts.sort(reverse=True)
        return all_amounts[0]

    return None


# ── VAT extraction ─────────────────────────────────────────────


def extract_vat(text: str) -> Optional[float]:
    """Extract VAT percentage (0-100) from text."""
    lines = [l.strip() for l in text.split("\n") if l.strip()]

    patterns = [
        re.compile(r"(\d+)\s*%\s*(?:moms|vat)", re.IGNORECASE),  # "25% moms"
        re.compile(r"moms\s*:\s*(\d+)\s*%", re.IGNORECASE),      # "moms: 25%"
        re.compile(r"moms[^(]*\((\d+)%\)", re.IGNORECASE),       # "moms (25%)"
        re.compile(r"moms\s+(\d+)\s*%", re.IGNORECASE),          # "moms 25%"
        re.compile(r"vat\s*:?\s*(\d+)\s*%", re.IGNORECASE),      # "vat: 25%"
    ]

    for pattern in patterns:
        for line in lines:
            match = pattern.search(line)
            if match:
                try:
                    value = float(match.group(1).replace(",", "."))
                    if 0 < value <= 100:
                        return value
                except ValueError:
                    continue

    # Default to 25% for Danish receipts with no explicit VAT
    danish_indicators = ["moms", "kr", "dkk", "betale", "kontant", "dankort", "faktura"]
    text_lower = text.lower()
    if any(ind in text_lower for ind in danish_indicators):
        return 25.0

    return None


# ── Utilities ──────────────────────────────────────────────────


def format_danish_currency(amount: float) -> str:
    """Format a number as Danish currency ('1.234,56 kr.')."""
    # Python's da-DK locale isn't always available — manual format
    parts = f"{amount:.2f}".split(".")
    int_part = parts[0]
    dec_part = parts[1]
    # Add thousands separators (dot)
    result = ""
    for i, c in enumerate(reversed(int_part)):
        if i > 0 and i % 3 == 0:
            result = "." + result
        result = c + result
    return f"{result},{dec_part} kr."
