/**
 * documentDetect.ts
 *
 * Receipt quad detection — 3 strategies + corner tracking.
 *
 * Strategy 1 — Brightness (primary):
 *   Bilateral filter → Otsu threshold → whiteness validation.
 *   Receipts are uniformly white paper; Otsu finds the brightest region.
 *   Whiteness validation rejects quads whose interior isn't mostly white.
 *
 * Strategy 2 — Edges (fallback):
 *   Bilateral filter → Canny edge detection → contour search.
 *   For high-contrast receipt boundaries when brightness alone fails.
 *
 * Strategy 3 — Corners (fast tracking):
 *   Uses goodFeaturesToTrack (Shi-Tomasi) to find strong corners near
 *   the previous quad's corners. Much faster than full detection because:
 *   - No bilateral/Otsu/Canny pipeline needed
 *   - Only searches small regions around previous corners
 *   - GoodFeaturesToTrack is highly optimized in OpenCV
 *
 * Corner Tracking:
 *   trackQuadCorners() refines a previously detected quad by finding
 *   the strongest corners near its 4 vertices. This runs in ~1-3ms
 *   compared to ~15-30ms for full detection, making the overlay
 *   significantly more responsive.
 *
 * Performance: operates on small canvases (~480px).
 * Auto-switches from bilateral to Gaussian if bilateral >40ms.
 */

declare const cv: any;

export interface Quad {
  tl: { x: number; y: number };
  tr: { x: number; y: number };
  br: { x: number; y: number };
  bl: { x: number; y: number };
}

// ── Adaptive filter: bilateral with auto-fallback ───────────────────

let useBilateral = true;

function adaptiveSmooth(src: any, out: any): void {
  if (useBilateral) {
    const t0 = performance.now();
    try {
      cv.bilateralFilter(src, out, 9, 75, 75);
      const dt = performance.now() - t0;
      if (dt > 40) {
        useBilateral = false;
        console.warn(`[detect] Bilateral ${dt.toFixed(1)}ms → Gaussian fallback`);
      }
      return;
    } catch {
      useBilateral = false;
    }
  }
  cv.GaussianBlur(src, out, new cv.Size(7, 7), 0);
}

// ── Whiteness validation ────────────────────────────────────────────

function quadWhiteness(gray: any, quad: Quad, w: number, h: number): number {
  const { tl, tr, br, bl } = quad;

  // Bounding box with 15% inset to avoid edge pixels
  const minX = Math.max(0, Math.min(tl.x, bl.x) + (Math.max(tl.x, bl.x) - Math.min(tl.x, bl.x)) * 0.15);
  const maxX = Math.min(w, Math.max(tr.x, br.x) - (Math.max(tr.x, br.x) - Math.min(tr.x, br.x)) * 0.15);
  const minY = Math.max(0, Math.min(tl.y, tr.y) + (Math.max(tl.y, tr.y) - Math.min(tl.y, tr.y)) * 0.15);
  const maxY = Math.min(h, Math.max(bl.y, br.y) - (Math.max(bl.y, br.y) - Math.min(bl.y, br.y)) * 0.15);

  const rx = Math.round(minX);
  const ry = Math.round(minY);
  const rw = Math.round(maxX - rx);
  const rh = Math.round(maxY - ry);

  if (rw <= 2 || rh <= 2) return 0;

  try {
    const roi = gray.roi(new cv.Rect(rx, ry, rw, rh));
    const mean = cv.mean(roi);
    roi.delete();
    return mean[0] / 255;
  } catch {
    return 0;
  }
}

// ── Fast whiteness check (no OpenCV, operates on canvas pixel data) ──

function fastWhitenessCheck(canvas: HTMLCanvasElement, quad: Quad): number {
  const ctx = canvas.getContext('2d');
  if (!ctx) return 0;
  const w = canvas.width;
  const h = canvas.height;

  const minX = Math.max(0, Math.min(quad.tl.x, quad.bl.x) + (Math.max(quad.tl.x, quad.bl.x) - Math.min(quad.tl.x, quad.bl.x)) * 0.2);
  const maxX = Math.min(w, Math.max(quad.tr.x, quad.br.x) - (Math.max(quad.tr.x, quad.br.x) - Math.min(quad.tr.x, quad.br.x)) * 0.2);
  const minY = Math.max(0, Math.min(quad.tl.y, quad.tr.y) + (Math.max(quad.tl.y, quad.tr.y) - Math.min(quad.tl.y, quad.tr.y)) * 0.2);
  const maxY = Math.min(h, Math.max(quad.bl.y, quad.br.y) - (Math.max(quad.bl.y, quad.br.y) - Math.min(quad.bl.y, quad.br.y)) * 0.2);

  const rx = Math.round(minX);
  const ry = Math.round(minY);
  const rw = Math.round(maxX - rx);
  const rh = Math.round(maxY - ry);

  if (rw <= 2 || rh <= 2) return 0;

  try {
    const imageData = ctx.getImageData(rx, ry, rw, rh);
    const d = imageData.data;
    const n = rw * rh;
    let sum = 0;
    // Sample every 4th pixel for speed
    for (let i = 0; i < n; i += 4) {
      const j = i * 4;
      sum += (0.299 * d[j] + 0.587 * d[j + 1] + 0.114 * d[j + 2]);
    }
    return (sum / (n / 4)) / 255;
  } catch {
    return 0;
  }
}

// ── Contour → quad extraction ───────────────────────────────────────

interface QuadCandidate {
  quad: Quad;
  score: number;
  whiteness: number;
}

function extractQuadCandidates(
  contours: any,
  gray: any,
  frameArea: number,
  minArea: number,
  minWhiteness = 0.50,
): QuadCandidate[] {
  const candidates: QuadCandidate[] = [];
  const imgW = gray.cols;
  const imgH = gray.rows;

  for (let i = 0; i < contours.size(); i++) {
    const contour = contours.get(i);
    const peri = cv.arcLength(contour, true);
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, 0.02 * peri, true);

    if (approx.rows === 4) {
      const area = cv.contourArea(approx);
      if (area > minArea) {
        const pts: Array<{ x: number; y: number }> = [];
        for (let j = 0; j < 4; j++) {
          pts.push({
            x: approx.data32S[j * 2],
            y: approx.data32S[j * 2 + 1],
          });
        }
        pts.sort((a, b) => a.y - b.y);
        const top = pts.slice(0, 2).sort((a, b) => a.x - b.x);
        const bottom = pts.slice(2, 4).sort((a, b) => a.x - b.x);
        const quad: Quad = { tl: top[0], tr: top[1], br: bottom[1], bl: bottom[0] };

        const whiteness = quadWhiteness(gray, quad, imgW, imgH);
        if (whiteness < minWhiteness) {
          approx.delete();
          continue;
        }

        // Aspect ratio score
        const topW = Math.hypot(quad.tr.x - quad.tl.x, quad.tr.y - quad.tl.y);
        const botW = Math.hypot(quad.br.x - quad.bl.x, quad.br.y - quad.bl.y);
        const leftH = Math.hypot(quad.bl.x - quad.tl.x, quad.bl.y - quad.tl.y);
        const rightH = Math.hypot(quad.br.x - quad.tr.x, quad.br.y - quad.tr.y);
        const avgW = (topW + botW) / 2;
        const avgH = (leftH + rightH) / 2;
        const aspect = avgH / Math.max(avgW, 1);

        let aspectScore: number;
        if (aspect >= 0.8 && aspect <= 3.0) {
          aspectScore = 1.0;
        } else if (aspect >= 0.5 && aspect < 0.8) {
          aspectScore = 0.5;
        } else {
          aspectScore = 0.15;
        }

        const areaScore = area / frameArea;
        const whitenessBonus = whiteness > 0.75 ? 1.4 : whiteness > 0.65 ? 1.15 : 1.0;
        const score = areaScore * aspectScore * whitenessBonus;

        candidates.push({ quad, score, whiteness });
      }
    }
    approx.delete();
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates;
}

/**
 * Find best quad from a binary image (already thresholded).
 */
function findBestQuad(
  binary: any,
  gray: any,
  frameArea: number,
  minArea: number,
  minWhiteness = 0.50,
): Quad | null {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  try {
    cv.findContours(binary, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const candidates = extractQuadCandidates(contours, gray, frameArea, minArea, minWhiteness);
    return candidates.length > 0 ? candidates[0].quad : null;
  } catch {
    return null;
  } finally {
    contours.delete();
    hierarchy.delete();
  }
}

// ── Morphological close helper ──────────────────────────────────────

function morphClose(img: any, ksize: number, iterations: number): void {
  const kernel = cv.Mat.ones(ksize, ksize, cv.CV_8U);
  cv.morphologyEx(img, img, cv.MORPH_CLOSE, kernel, new cv.Point(-1, -1), iterations);
  kernel.delete();
}

// ── Strategy 1: Brightness — Otsu threshold (primary) ───────────────
/**
 * Smooth with bilateral filter → Otsu auto-threshold → morphology close.
 * Receipts are uniformly white, so Otsu naturally separates them from
 * darker/colored backgrounds. Whiteness validation rejects false positives.
 */

function detectByBrightness(
  gray: any,
  frameArea: number,
  minArea: number,
): Quad | null {
  const filtered = new cv.Mat();
  const binary = new cv.Mat();

  try {
    adaptiveSmooth(gray, filtered);

    // Otsu automatically finds the best brightness threshold
    cv.threshold(filtered, binary, 0, 255, cv.THRESH_BINARY + cv.THRESH_OTSU);

    // Merge fragmented white regions
    morphClose(binary, 7, 3);

    // Slight dilation to close gaps at receipt edges
    const kernel = cv.Mat.ones(3, 3, cv.CV_8U);
    cv.dilate(binary, binary, kernel);
    kernel.delete();

    return findBestQuad(binary, gray, frameArea, minArea, 0.50);
  } catch {
    return null;
  } finally {
    filtered.delete();
    binary.delete();
  }
}

// ── Strategy 2: Edges — Canny (fallback) ───────────────────────────
/**
 * Smooth with bilateral filter → Canny edge detection → contour search.
 * For high-contrast receipt boundaries when brightness alone fails.
 */

function detectByEdges(
  gray: any,
  frameArea: number,
  minArea: number,
): Quad | null {
  const filtered = new cv.Mat();
  const edges = new cv.Mat();

  try {
    adaptiveSmooth(gray, filtered);
    cv.Canny(filtered, edges, 80, 200);

    morphClose(edges, 5, 2);

    return findBestQuad(edges, gray, frameArea, minArea, 0.55);
  } catch {
    return null;
  } finally {
    filtered.delete();
    edges.delete();
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORNER TRACKING (Strategy 3 — fast quad refinement)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Track and refine a previously detected quad by finding the strongest
 * Shi-Tomasi corners near each of the quad's 4 vertices.
 *
 * This is dramatically faster than full detection (~1-3ms vs ~15-30ms)
 * because:
 *   - Only searches small regions around previous corners
 *   - goodFeaturesToTrack is highly optimized in OpenCV WASM
 *   - No bilateral/Otsu/Canny/morphClose pipeline needed
 *
 * Returns the refined quad, or null if tracking fails (corners not found
 * or quad shape is invalid).
 */
export function trackQuadCorners(
  sourceCanvas: HTMLCanvasElement,
  prevQuad: Quad,
): Quad | null {
  if (typeof cv === 'undefined' || !cv.Mat) return null;

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const frameArea = w * h;

    // Search radius: proportion of frame size, large enough to handle
    // reasonable camera movement between frames
    const searchRadius = Math.round(Math.max(w, h) * 0.08);

    const corners: Array<{ x: number; y: number } | null> = [];
    const prevCorners = [prevQuad.tl, prevQuad.tr, prevQuad.br, prevQuad.bl];

    for (const prevCorner of prevCorners) {
      const corner = findStrongestCornerInRegion(
        gray, prevCorner.x, prevCorner.y, searchRadius, w, h
      );
      corners.push(corner);
    }

    // All 4 corners must be found
    if (corners.some(c => c === null)) return null;

    const [tl, tr, br, bl] = corners as Array<{ x: number; y: number }>;

    const refinedQuad: Quad = { tl, tr, br, bl };

    // Validate the refined quad:
    // 1. Whiteness check — interior should still be mostly white
    const whiteness = quadWhiteness(gray, refinedQuad, w, h);
    if (whiteness < 0.40) return null;

    // 2. Shape check — corners shouldn't have moved too far from previous
    const maxCornerShift = Math.max(w, h) * 0.15; // 15% of frame
    for (let i = 0; i < 4; i++) {
      const dx = corners[i]!.x - prevCorners[i].x;
      const dy = corners[i]!.y - prevCorners[i].y;
      if (Math.hypot(dx, dy) > maxCornerShift) return null;
    }

    // 3. Area check — quad shouldn't have shrunk or grown too much
    const prevArea = quadArea(prevQuad);
    const newArea = quadArea(refinedQuad);
    const areaRatio = newArea / Math.max(prevArea, 1);
    if (areaRatio < 0.6 || areaRatio > 1.5) return null;

    return refinedQuad;
  } catch (err) {
    return null;
  } finally {
    src.delete();
    gray.delete();
  }
}

/**
 * Find the strongest Shi-Tomasi corner in a circular region around (cx, cy).
 * Returns the corner position, or null if no strong corner is found.
 */
function findStrongestCornerInRegion(
  gray: any,
  cx: number,
  cy: number,
  radius: number,
  imgW: number,
  imgH: number,
): { x: number; y: number } | null {
  // Define the search region (clamped to image bounds)
  const x1 = Math.max(0, Math.round(cx - radius));
  const y1 = Math.max(0, Math.round(cy - radius));
  const x2 = Math.min(imgW, Math.round(cx + radius));
  const y2 = Math.min(imgH, Math.round(cy + radius));
  const regionW = x2 - x1;
  const regionH = y2 - y1;

  if (regionW <= 2 || regionH <= 2) return null;

  let roi: any = null;
  let corners: any = null;

  try {
    // Extract the search region
    roi = gray.roi(new cv.Rect(x1, y1, regionW, regionH));

    // Find the strongest corner in this region
    // maxCorners=1, qualityLevel=0.01, minDistance=5
    corners = new cv.Mat();
    const mask = new cv.Mat();
    cv.goodFeaturesToTrack(roi, corners, 1, 0.01, 5, mask, 3);

    if (corners.rows === 0) return null;

    // The first corner is the strongest
    const localX = corners.data32F[0];
    const localY = corners.data32F[1];

    // Convert back to full image coordinates
    return {
      x: Math.round(x1 + localX),
      y: Math.round(y1 + localY),
    };
  } catch {
    return null;
  } finally {
    if (roi) roi.delete();
    if (corners) corners.delete();
  }
}

/**
 * Compute the area of a quad using the Shoelace formula.
 */
function quadArea(quad: Quad): number {
  const { tl, tr, br, bl } = quad;
  return Math.abs(
    (tl.x * tr.y - tr.x * tl.y) +
    (tr.x * br.y - br.x * tr.y) +
    (br.x * bl.y - bl.x * br.y) +
    (bl.x * tl.y - tl.x * bl.y)
  ) / 2;
}

/**
 * Quickly validate whether a previously detected quad is still valid
 * in the current frame. Uses only a fast whiteness check — no OpenCV.
 *
 * This is intended as a pre-check before running the more expensive
 * trackQuadCorners(). If the quad's interior is no longer white,
 * there's no point in trying to track corners.
 *
 * Returns true if the quad likely still contains a receipt.
 */
export function validateQuadFast(
  sourceCanvas: HTMLCanvasElement,
  quad: Quad,
): boolean {
  const whiteness = fastWhitenessCheck(sourceCanvas, quad);
  return whiteness >= 0.40;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// PUBLIC API
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Detect a document/receipt quadrilateral in the given canvas.
 *
 * Two strategies tried in order until one succeeds:
 *   1. Brightness (Otsu) — primary, works for most backgrounds
 *   2. Edges (Canny) — fallback for high-contrast boundaries
 *
 * Returns null if no suitable quad is found.
 */
export function detectDocumentQuad(
  sourceCanvas: HTMLCanvasElement
): Quad | null {
  if (typeof cv === 'undefined' || !cv.Mat) return null;

  const src = cv.imread(sourceCanvas);
  const gray = new cv.Mat();

  try {
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    const frameArea = sourceCanvas.width * sourceCanvas.height;
    const minArea = frameArea * 0.05;

    // 1. Brightness — Otsu threshold (primary)
    const brightQuad = detectByBrightness(gray, frameArea, minArea);
    if (brightQuad) return brightQuad;

    // 2. Edges — Canny (fallback)
    return detectByEdges(gray, frameArea, minArea);
  } catch (err) {
    console.warn('[documentDetect] Detection failed:', err);
    return null;
  } finally {
    src.delete();
    gray.delete();
  }
}

/**
 * Convert a Quad to an array of 4 points for cv.matFromArray.
 */
export function quadToOpenCVPoints(quad: Quad): number[] {
  return [
    quad.tl.x, quad.tl.y,
    quad.tr.x, quad.tr.y,
    quad.br.x, quad.br.y,
    quad.bl.x, quad.bl.y,
  ];
}
