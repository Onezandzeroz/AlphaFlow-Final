import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { auditCreate, requestMetadata } from '@/lib/audit';
import { logger } from '@/lib/logger';
import { tenantFilter, Permission } from '@/lib/rbac';
import {
  buildAutoMapping,
  getStandardAccount,
} from '@/lib/standard-chart-of-accounts';
import { buildAiMapping } from '@/lib/ai-standard-mapping';
import { withGuard } from '@/lib/route-guard';

// POST - Generate automatic standard account mappings for all tenant accounts
//
// Two-phase approach:
//   1. Heuristic (instant, no LLM cost): buildAutoMapping() handles the
//      obvious cases — Bank → 6480, Salg → 1010, Varekøb → 1610, etc.
//   2. AI-assisted (LLM): buildAiMapping() sends the remaining unmapped
//      accounts to OpenRouter (Hermes) with the full official chart as
//      context. The LLM maps them semantically based on account names.
//
// If the LLM call fails (rate limit, network, missing API key), the
// heuristic-only mapping is used — the user still gets a working mapping,
// just with more unmapped accounts.
export const POST = withGuard({
  auth: true,
  requireCompany: true,
  blockOversight: true,
  blockDemo: true,
  requireTokenPay: true,
  permissions: [Permission.DATA_EDIT],
}, async (request: NextRequest, ctx) => {
  try {
    const companyId = ctx.activeCompanyId!;
    const meta = requestMetadata(request);

    // Fetch all accounts for the tenant
    const accounts = await db.account.findMany({
      where: tenantFilter(ctx),
      select: {
        id: true,
        number: true,
        name: true,
        type: true,
        group: true,
      },
    });

    if (accounts.length === 0) {
      return NextResponse.json({ total: 0, autoMapped: 0, unmapped: 0 });
    }

    const fsrAccounts = accounts.map((a) => ({
      number: a.number,
      name: a.name,
      type: a.type,
      group: a.group,
    }));

    // Phase 1: Heuristic mapping (instant)
    const heuristicMap = buildAutoMapping(fsrAccounts);

    // Phase 2: AI-assisted mapping for unmapped accounts
    // Sends the remaining accounts to the LLM with the full official chart
    // as context. Falls back gracefully to heuristic-only on LLM failure.
    const aiResult = await buildAiMapping(fsrAccounts, heuristicMap);
    const finalMap = aiResult.mapping;

    logger.info('[AUTO_MAP] Mapping complete', {
      totalAccounts: accounts.length,
      heuristicMapped: aiResult.heuristicMappedCount,
      llmMapped: aiResult.llmMappedCount,
      usedLlm: aiResult.usedLlm,
      unmapped: accounts.length - finalMap.size,
    });

    // Delete all existing mappings for this company
    await db.standardAccountMapping.deleteMany({
      where: { companyId },
    });

    // Clear publicStandardNumber on all accounts
    await db.account.updateMany({
      where: { companyId },
      data: { publicStandardNumber: null },
    });

    const createData: Array<{
      companyId: string;
      accountId: string;
      standardAccountNumber: string;
      standardAccountName: string;
      mappingType: string;
    }> = [];

    let autoMappedCount = 0;
    let unmappedCount = 0;

    for (const account of accounts) {
      const standardNumber = finalMap.get(account.number);

      if (standardNumber) {
        // Mapped account (heuristic or LLM)
        const stdAccount = getStandardAccount(standardNumber);
        const stdName = stdAccount?.name ?? standardNumber;

        // Mark LLM-mapped accounts as 'ai' so users can distinguish them
        // from heuristic-mapped ('auto') accounts in the UI.
        const isAiMapped = aiResult.reasons.has(account.number);
        const mappingType = isAiMapped ? 'ai' : 'auto';

        createData.push({
          companyId,
          accountId: account.id,
          standardAccountNumber: standardNumber,
          standardAccountName: stdName,
          mappingType,
        });

        // Update Account.publicStandardNumber
        await db.account.update({
          where: { id: account.id },
          data: { publicStandardNumber: standardNumber },
        });

        autoMappedCount++;
      } else {
        // Unmapped account
        createData.push({
          companyId,
          accountId: account.id,
          standardAccountNumber: 'UNMAPPED',
          standardAccountName: 'Ikke tilknyttet',
          mappingType: 'none',
        });

        unmappedCount++;
      }
    }

    // Bulk create all mappings
    if (createData.length > 0) {
      await db.standardAccountMapping.createMany({
        data: createData,
        skipDuplicates: true,
      });
    }

    // Audit log the auto-mapping run — include LLM reasoning for transparency
    await auditCreate(
      ctx.id,
      'Account',
      companyId,
      {
        action: 'AUTO_MAP_STANDARD_ACCOUNTS',
        totalAccounts: accounts.length,
        heuristicMapped: aiResult.heuristicMappedCount,
        aiMapped: aiResult.llmMappedCount,
        usedLlm: aiResult.usedLlm,
        unmapped: unmappedCount,
        // Include per-account LLM reasoning for audit trail
        aiReasons: aiResult.usedLlm
          ? Object.fromEntries(aiResult.reasons)
          : undefined,
      },
      meta,
      companyId
    );

    const totalMappings = await db.standardAccountMapping.count({
      where: { companyId },
    });

    return NextResponse.json({
      total: totalMappings,
      autoMapped: autoMappedCount,
      unmapped: unmappedCount,
      heuristicMapped: aiResult.heuristicMappedCount,
      aiMapped: aiResult.llmMappedCount,
      usedLlm: aiResult.usedLlm,
    });
  } catch (error) {
    logger.error('Auto-map standard accounts error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
});
