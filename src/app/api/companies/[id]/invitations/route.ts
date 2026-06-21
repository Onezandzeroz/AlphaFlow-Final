import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { withGuard } from '@/lib/route-guard';
import { routeConfig } from '@/lib/route-config';
import { sendInvitationEmail } from '@/lib/email-service';
import { hashPassword } from '@/lib/password';
import { logger } from '@/lib/logger';
import crypto from 'crypto';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { getSeatCap, type PlanTier } from '@/lib/plan-features';

/** Generate a readable 12-char password: mix of upper, lower, digits */
function generateInvitePassword(): string {
  const upper = 'ABCDEFGHJKMNPQRSTUVWXYZ';   // no ambiguous I/L/O
  const lower = 'abcdefghjkmnpqrstuvwxyz';   // no ambiguous i/l/o
  const digits = '23456789';                  // no ambiguous 0/1
  const all = upper + lower + digits;
  const bytes = crypto.randomBytes(12);
  let pw = '';
  for (let i = 0; i < 12; i++) {
    pw += all[bytes[i]! % all.length];
  }
  return pw;
}

const guard = routeConfig['/api/companies/[id]/invitations'];

// GET /api/companies/[id]/invitations - List invitations
export const GET = withGuard(guard.GET!, async (request, ctx, context) => {
  try {
    const { id: companyId } = await context.params as { id: string };

    const invitations = await db.invitation.findMany({
      where: { companyId, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      invitations: invitations.map(inv => ({
        id: inv.id,
        email: inv.email,
        role: inv.role,
        status: inv.status,
        expiresAt: inv.expiresAt,
        createdAt: inv.createdAt,
      })),
    });
  } catch (error) {
    logger.error('List invitations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});

// POST /api/companies/[id]/invitations - Send invitation
export const POST = withGuard(guard.POST!, async (request, ctx, context) => {
  try {
    const { id: companyId } = await context.params as { id: string };
    const { email, role } = await request.json();

    // Look up company for invitation email + plan tier (seat cap)
    const company = await db.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, planTier: true },
    });
    if (!company) {
      return NextResponse.json({ error: 'Company not found' }, { status: 404 });
    }

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // ── Seat cap check (FASE 5) ──
    // Count current members + pending invitations and compare to the
    // plan tier's seat cap. SuperDev bypasses (they manage all tenants).
    const seatCap = getSeatCap(company.planTier as PlanTier);
    if (seatCap !== null && !ctx.isSuperDev) {
      const [memberCount, pendingInvites] = await Promise.all([
        db.userCompany.count({ where: { companyId } }),
        db.invitation.count({ where: { companyId, status: 'PENDING' } }),
      ]);
      const currentSeats = memberCount + pendingInvites;
      if (currentSeats >= seatCap) {
        return NextResponse.json(
          {
            error: `Seat limit reached (${currentSeats}/${seatCap}). Opgrader til en højere plan for at invitere flere medlemmer.`,
            code: 'SEAT_LIMIT_REACHED',
            seatCap,
            seatCount: currentSeats,
          },
          { status: 403 }
        );
      }
    }

    const normalizedEmail = email.toLowerCase().trim();
    const inviteRole = role || 'VIEWER';

    if (!['ADMIN', 'ACCOUNTANT', 'VIEWER', 'AUDITOR'].includes(inviteRole)) {
      return NextResponse.json({ error: 'Invalid role. Can only invite as ADMIN, ACCOUNTANT, VIEWER, or AUDITOR.' }, { status: 400 });
    }

    // Check if user already exists
    const existingUser = await db.user.findUnique({ where: { email: normalizedEmail } });
    if (existingUser) {
      const existingMember = await db.userCompany.findUnique({
        where: { userId_companyId: { userId: existingUser.id, companyId } },
      });
      if (existingMember) {
        return NextResponse.json({ error: 'User is already a member of this company' }, { status: 400 });
      }
    }

    // If user does NOT exist, create an account with a generated password
    let invitePassword: string | undefined;
    if (!existingUser) {
      invitePassword = generateInvitePassword();
      const hashedPw = await hashPassword(invitePassword);

      // Ensure unique company name for the user's own company
      const userCompanyName = `${normalizedEmail.split('@')[0]} (privat)`;
      const existingCompany = await db.company.findFirst({
        where: { name: userCompanyName },
        select: { id: true, name: true },
      });
      if (existingCompany) {
        return NextResponse.json(
          { error: `Cannot create account — a company named "${userCompanyName}" already exists.` },
          { status: 409 }
        );
      }

      // Create user
      await db.user.create({
        data: {
          email: normalizedEmail,
          password: hashedPw,
          emailVerified: true, // Invited users are pre-verified (they received the email)
          emailVerifiedAt: new Date(),
        },
      });

      // Create a private company for the user (required by schema)
      await db.company.create({
        data: {
          name: userCompanyName,
          email: normalizedEmail,
          cvrNumber: '',
          address: '',
          phone: '',
          bankName: '',
          bankAccount: '',
          bankRegistration: '',
          invoicePrefix: 'INV',
          currentYear: new Date().getFullYear(),
          isDemo: false,
        },
      });

      // Link user to their private company as OWNER
      const newCompany = await db.company.findUnique({
        where: { name: userCompanyName },
        select: { id: true },
      });
      if (newCompany) {
        const newUser = await db.user.findUnique({
          where: { email: normalizedEmail },
          select: { id: true },
        });
        if (newUser) {
          await db.userCompany.create({
            data: {
              userId: newUser.id,
              companyId: newCompany.id,
              role: 'OWNER',
            },
          });
        }
      }

      logger.info(`[INVITE] Created new user account for ${normalizedEmail}`);
    }

    // Check for existing pending invitation
    const existingInvite = await db.invitation.findFirst({
      where: { companyId, email: normalizedEmail, status: 'PENDING' },
    });
    if (existingInvite) {
      return NextResponse.json({ error: 'Invitation already sent to this email' }, { status: 400 });
    }

    // Create invitation
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // 7 days

    const invitation = await db.invitation.create({
      data: {
        companyId,
        email: normalizedEmail,
        role: inviteRole as 'ADMIN' | 'ACCOUNTANT' | 'VIEWER' | 'AUDITOR',
        token,
        invitedBy: ctx.id,
        expiresAt,
      },
    });

    // Send invitation email — fire-and-forget so SMTP latency doesn't block the response
    sendInvitationEmail(
      normalizedEmail,
      company.name,
      inviteRole,
      invitation.token,
      'da',
      companyId,
      invitePassword
    )
      .then((emailResult) => {
        if (!emailResult.success) {
          logger.warn(`Invitation email failed for ${normalizedEmail}, logId=${emailResult.logId}`);
        }
      })
      .catch((emailError) => {
        logger.warn('Failed to send invitation email:', emailError);
      });

    // Audit: log invitation creation
    await auditCreate(ctx.id, 'Invitation', invitation.id, { email: normalizedEmail, role: inviteRole, companyId }, requestMetadata(request), ctx.activeCompanyId);

    return NextResponse.json({
      invitation: {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role,
        expiresAt: invitation.expiresAt,
        // Token is no longer returned — sent via email instead
      },
    }, { status: 201 });
  } catch (error) {
    logger.error('Create invitation error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
});
