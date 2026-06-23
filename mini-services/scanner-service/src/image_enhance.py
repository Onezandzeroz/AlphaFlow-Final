"""
image_enhance.py — v10 document enhancement pipeline (cv2 port of perspectiveWarp.ts).

Faithful Python port of the TypeScript v10 pipeline from
`AlphaFlow-Final/src/lib/opencv/perspectiveWarp.ts:437-491`.

Pipeline (8 steps, exact same order as v10):
  1. Grayscale (BT.601: 0.299R + 0.587G + 0.114B)
  2. Brightness boost (+15%) — compensates mobile sensor underexposure
  3. Median denoise (3x3) — remove sensor noise
  4. Contrast stretch (1st-99th percentile) — gentle normalization
  5. Unsharp mask (radius=1, strength=0.5) — crisp text edges
  6. Gentle S-curve (steepness=4, midpoint=median) — subtle contrast
  7. Paper whitening (threshold=220, quadratic ease-in) — clean white bg

Also includes:
  - assess_image_quality() — Laplacian variance + brightness scoring
    (NEW improvement: rejects blurry/dark images before wasting OCR cycles)

Constants are preserved EXACTLY from the TS source — these represent
months of tuning and must not be changed without A/B testing.
"""

from __future__ import annotations

import cv2
import numpy as np
from PIL import Image

# ── Constants (preserved EXACTLY from perspectiveWarp.ts) ────────

MIN_OUTPUT_DIM = 2000   # Min longest side for OCR-quality text
MIN_OUTPUT_WIDTH = 800  # Min width — prevents narrow receipts
MAX_OUTPUT_DIM = 3500   # Max longest side — memory limit

BRIGHTNESS_FACTOR = 1.15           # +15% brightness
CONTRAST_LOW_PCT = 0.01            # 1st percentile
CONTRAST_HIGH_PCT = 0.99           # 99th percentile
SHARPEN_RADIUS = 1
SHARPEN_STRENGTH = 0.5
S_CURVE_STEEPNESS = 4
PAPER_WHITEN_THRESHOLD = 220

# Image quality thresholds (NEW — not in TS original)
BLUR_THRESHOLD = 100.0   # Laplacian variance below this = too blurry
DARK_THRESHOLD = 40      # Mean brightness below this = too dark
BRIGHT_THRESHOLD = 240   # Mean brightness above this = too bright (overexposed)


# ── Image quality assessment (NEW) ─────────────────────────────


def assess_image_quality(img: np.ndarray) -> dict:
    """
    Assess image quality before OCR — Laplacian variance (blur) + brightness.

    Returns dict with:
      - blur_score: float (higher = sharper)
      - brightness: float (0-255 mean)
      - is_blurry: bool
      - is_too_dark: bool
      - is_too_bright: bool
      - is_acceptable: bool
    """
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img

    blur_score = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    brightness = float(gray.mean())

    return {
        "blur_score": round(blur_score, 2),
        "brightness": round(brightness, 2),
        "is_blurry": blur_score < BLUR_THRESHOLD,
        "is_too_dark": brightness < DARK_THRESHOLD,
        "is_too_bright": brightness > BRIGHT_THRESHOLD,
        "is_acceptable": (
            blur_score >= BLUR_THRESHOLD
            and DARK_THRESHOLD <= brightness <= BRIGHT_THRESHOLD
        ),
    }


# ── 8-step v10 enhancement pipeline ─────────────────────────────


def boost_brightness(gray: np.ndarray, factor: float = BRIGHTNESS_FACTOR) -> np.ndarray:
    """Step 2: Multiply each pixel by factor (1.15 = +15%)."""
    # cv2.multiply clips to 255 automatically for uint8
    return cv2.multiply(gray, np.array([factor], dtype=np.float32)).clip(0, 255).astype(np.uint8)


def median_denoise(gray: np.ndarray) -> np.ndarray:
    """Step 3: 3x3 cross-pattern median filter (cv2.medianBlur uses 3x3 kernel)."""
    return cv2.medianBlur(gray, 3)


def stretch_contrast(gray: np.ndarray, low_pct: float = CONTRAST_LOW_PCT, high_pct: float = CONTRAST_HIGH_PCT) -> np.ndarray:
    """
    Step 4: Contrast stretch using 1st-99th percentiles.

    Gentler than 2nd-98th — preserves natural shading in darker areas.
    """
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = gray.size
    cum_low = int(total * low_pct)
    cum_high = int(total * high_pct)

    cumsum = np.cumsum(hist)
    lo = int(np.searchsorted(cumsum, cum_low))
    hi = int(np.searchsorted(cumsum, cum_high))

    if hi - lo <= 5:
        return gray  # Already full contrast

    # Linear stretch: scale [lo, hi] → [0, 255]
    lut = np.zeros(256, dtype=np.uint8)
    for i in range(256):
        if i <= lo:
            lut[i] = 0
        elif i >= hi:
            lut[i] = 255
        else:
            lut[i] = int(round((i - lo) * 255 / (hi - lo)))
    return cv2.LUT(gray, lut)


def unsharp_mask(gray: np.ndarray, radius: int = SHARPEN_RADIUS, strength: float = SHARPEN_STRENGTH) -> np.ndarray:
    """
    Step 5: Unsharp mask — sharpened = original + strength * (original - blurred).

    Mild strength (0.5) at radius 1 — sharpens text without halos.
    """
    # Box blur radius 1 = 3x3 kernel (cv2.blur uses 2*radius+1)
    ksize = 2 * radius + 1
    blurred = cv2.boxFilter(gray.astype(np.float32), -1, (ksize, ksize))
    sharp = gray.astype(np.float32) + strength * (gray.astype(np.float32) - blurred)
    return sharp.clip(0, 255).astype(np.uint8)


def gentle_s_curve(gray: np.ndarray, steepness: float = S_CURVE_STEEPNESS) -> np.ndarray:
    """
    Step 6: Gentle S-curve (sigmoid) — subtle contrast boost.

    Midpoint is auto-adapted from image's median brightness.
    Sigmoid output is rescaled so 0→0 and 255→255 (preserves pure black/white).
    """
    # Find median from histogram (faster than np.median on full array)
    hist = cv2.calcHist([gray], [0], None, [256], [0, 256]).flatten()
    total = gray.size
    cumsum = np.cumsum(hist)
    median = int(np.searchsorted(cumsum, total // 2))

    # Build LUT
    midpoint_norm = median / 255.0
    x = np.arange(256, dtype=np.float64) / 255.0
    centered = (x - midpoint_norm) * steepness
    raw = 1.0 / (1.0 + np.exp(-centered))

    raw_min, raw_max = raw[0], raw[255]
    raw_range = raw_max - raw_min
    if raw_range < 1e-6:
        return gray  # Degenerate

    lut = ((raw - raw_min) / raw_range * 255).clip(0, 255).astype(np.uint8)
    return cv2.LUT(gray, lut)


def whiten_paper(gray: np.ndarray, threshold: int = PAPER_WHITEN_THRESHOLD) -> np.ndarray:
    """
    Step 7: Paper whitening — lift near-white pixels to pure white.

    Uses quadratic ease-in so pixels just above threshold lift gently,
    while pixels close to 255 snap to pure white.
    """
    rng = 255 - threshold
    lut = np.arange(256, dtype=np.float32)
    mask = lut > threshold
    t = (lut - threshold) / rng
    lut[mask] = threshold + (t[mask] ** 2) * rng
    lut = lut.clip(0, 255).astype(np.uint8)
    return cv2.LUT(gray, lut)


def enhance_image(img: np.ndarray) -> np.ndarray:
    """
    Apply the full v10 enhancement pipeline to an image.

    Input: BGR or grayscale numpy array (from cv2.imread or PyMuPDF render).
    Output: Grayscale uint8 numpy array with v10 enhancement applied.

    Order: Gray → Brightness → Denoise → Contrast → Sharpen → S-curve → Whiten
    """
    # Step 1: Grayscale (BT.601 — same as cv2 default BGR2GRAY)
    if len(img.shape) == 3:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    else:
        gray = img.copy()

    # Step 2: Brightness +15%
    gray = boost_brightness(gray)

    # Step 3: Median denoise (3x3)
    gray = median_denoise(gray)

    # Step 4: Contrast stretch (1st-99th percentile)
    gray = stretch_contrast(gray)

    # Step 5: Sharpen (unsharp mask, r=1 s=0.5)
    gray = unsharp_mask(gray)

    # Step 6: Gentle S-curve (steepness=4)
    gray = gentle_s_curve(gray)

    # Step 7: Paper whitening (threshold=220)
    gray = whiten_paper(gray)

    return gray


# ── Public API ─────────────────────────────────────────────────


def enhance_pil_image(pil_img: Image.Image) -> tuple[bytes, dict]:
    """
    Enhance a PIL image and return PNG bytes + quality assessment.

    Returns:
      (png_bytes, quality_info)
      png_bytes: enhanced grayscale PNG ready for OCR/VLM
      quality_info: dict with blur_score, brightness, is_acceptable, etc.
    """
    # PIL → cv2 (RGB → BGR)
    img_array = np.array(pil_img.convert("RGB"))
    bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

    # Quality assessment BEFORE enhancement
    quality = assess_image_quality(bgr)

    # Enhance
    enhanced_gray = enhance_image(bgr)

    # Encode to PNG bytes
    ok, png_buf = cv2.imencode(".png", enhanced_gray)
    if not ok:
        raise RuntimeError("Failed to encode enhanced image to PNG")

    return png_buf.tobytes(), quality


def enhance_image_bytes(image_bytes: bytes) -> tuple[bytes, dict]:
    """
    Enhance raw image bytes (JPEG/PNG/HEIC/etc.) and return PNG + quality.

    Args:
      image_bytes: raw bytes of JPEG, PNG, WebP, BMP, TIFF, or HEIC image
    Returns:
      (png_bytes, quality_info)
    """
    # Register HEIC opener if available
    try:
        from pillow_heif import register_heif_opener
        register_heif_opener()
    except ImportError:
        pass

    import io
    pil_img = Image.open(io.BytesIO(image_bytes))
    return enhance_pil_image(pil_img)
