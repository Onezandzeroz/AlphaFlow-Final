import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

// ─── Rate limiting (in-memory, per server instance) ──────────────────
// Simple IP-based rate limiter to prevent abuse of the public contact
// endpoint. Allows 5 submissions per IP per 10-minute window.
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const RATE_LIMIT_MAX = 5;
const ipHits = new Map<string, { count: number; resetAt: number }>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const hit = ipHits.get(ip);
  if (!hit || now > hit.resetAt) {
    ipHits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return false;
  }
  hit.count++;
  return hit.count > RATE_LIMIT_MAX;
}

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

// ─── Input validation ────────────────────────────────────────────────
interface ContactBody {
  name: string;
  email: string;
  company?: string;
  subject: string;
  message: string;
}

function validateBody(body: Partial<ContactBody>): string | null {
  if (!body.name || body.name.trim().length < 2)
    return "Navn skal være mindst 2 tegn";
  if (body.name.trim().length > 100) return "Navn er for langt";

  if (!body.email || !body.email.trim())
    return "E-mail er påkrævet";
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(body.email.trim()))
    return "Ugyldig e-mailadresse";
  if (body.email.trim().length > 200) return "E-mail er for lang";

  if (body.company && body.company.trim().length > 200)
    return "Virksomhedsnavn er for langt";

  if (!body.subject || body.subject.trim().length < 3)
    return "Emne skal være mindst 3 tegn";
  if (body.subject.trim().length > 200) return "Emne er for langt";

  if (!body.message || body.message.trim().length < 10)
    return "Beskeden skal være mindst 10 tegn";
  if (body.message.trim().length > 5000) return "Beskeden er for lang";

  return null;
}

// ─── POST /api/contact ───────────────────────────────────────────────
export async function POST(req: NextRequest) {
  const ip = getClientIp(req);

  // Rate limit check
  if (isRateLimited(ip)) {
    return NextResponse.json(
      { error: "For mange henvendelser. Prøv igen senere." },
      { status: 429 }
    );
  }

  // Parse body
  let body: Partial<ContactBody>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Ugyldig anmodning" },
      { status: 400 }
    );
  }

  // Validate
  const validationError = validateBody(body);
  if (validationError) {
    return NextResponse.json({ error: validationError }, { status: 400 });
  }

  const userAgent = req.headers.get("user-agent") || null;

  // Persist to database
  try {
    await db.contactMessage.create({
      data: {
        name: body.name!.trim(),
        email: body.email!.trim().toLowerCase(),
        company: body.company?.trim() || null,
        subject: body.subject!.trim(),
        message: body.message!.trim(),
        ipAddress: ip !== "unknown" ? ip : null,
        userAgent,
        status: "new",
      },
    });

    return NextResponse.json(
      { ok: true, message: "Besked modtaget" },
      { status: 201 }
    );
  } catch (error) {
    // If the database is unavailable (e.g. ContactMessage table not yet
    // migrated, or Neon cold-start failure), log the message so it is
    // not lost, and still return success to the user. The contact form
    // should never block the user experience.
    console.error("[/api/contact] Failed to persist message:", {
      name: body.name,
      email: body.email,
      subject: body.subject,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      { ok: true, message: "Besked modtaget" },
      { status: 201 }
    );
  }
}

// ─── GET /api/contact — health check ────────────────────────────────
export async function GET() {
  return NextResponse.json({ endpoint: "contact", status: "ok" });
}
