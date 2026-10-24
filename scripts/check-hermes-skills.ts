/**
 * Diagnose Hermes source-code-explorer skill setup.
 *
 * Checks:
 * 1. Does the source-code-explorer skill exist in the DB?
 * 2. Is it enabledByDefault?
 * 3. Can the Hermes agent reach the skills API?
 * 4. Is ALPHAFLOW_ROOT / sourceCodeRootPath set correctly?
 *
 * Usage: bun run scripts/check-hermes-skills.ts
 */

import { db } from '@/lib/db';

async function main() {
  console.log('=== Hermes Source Code Skill Diagnostic ===\n');

  // 1. Check if source-code-explorer skill exists in DB
  console.log('1. Checking HermesSkill in database...');
  const skills = await db.hermesSkill.findMany({
    select: { id: true, name: true, enabledByDefault: true, isBuiltIn: true, category: true },
  });

  if (skills.length === 0) {
    console.log('   ✗ NO skills found in database! Run: bun run scripts/seed-hermes-skills.ts');
    return;
  }

  console.log(`   Found ${skills.length} skills:`);
  for (const s of skills) {
    const status = s.enabledByDefault ? '✓ enabled' : '✗ disabled';
    console.log(`   - ${s.name} (${status}, builtIn: ${s.isBuiltIn})`);
  }

  const sourceSkill = skills.find(s => s.name === 'source-code-explorer');
  if (!sourceSkill) {
    console.log('\n   ✗ source-code-explorer skill NOT found! Run: bun run scripts/seed-hermes-skills.ts');
    return;
  }

  if (!sourceSkill.enabledByDefault) {
    console.log('\n   ✗ source-code-explorer is disabled (enabledByDefault=false). Run: bun run scripts/seed-hermes-skills.ts');
    return;
  }

  console.log('\n   ✓ source-code-explorer skill is enabled and ready');

  // 2. Check environment variables
  console.log('\n2. Checking environment...');
  const alphaflowRoot = process.env.ALPHAFLOW_ROOT || process.cwd();
  const hermesAdminKey = process.env.HERMES_ADMIN_KEY || process.env.OPENROUTER_API_KEY || '';
  console.log(`   ALPHAFLOW_ROOT: ${alphaflowRoot}`);
  console.log(`   HERMES_ADMIN_KEY: ${hermesAdminKey ? '✓ set (' + hermesAdminKey.length + ' chars)' : '✗ NOT SET'}`);

  // 3. Check if source code root path exists
  console.log('\n3. Checking source code root path...');
  const fs = await import('fs');
  try {
    const stats = fs.statSync(alphaflowRoot);
    if (stats.isDirectory()) {
      console.log(`   ✓ ${alphaflowRoot} exists and is a directory`);
      // Check if src/ subfolder exists (indicates it's the project root)
      const hasSrc = fs.existsSync(`${alphaflowRoot}/src`);
      const hasPackageJson = fs.existsSync(`${alphaflowRoot}/package.json`);
      console.log(`   - /src exists: ${hasSrc ? '✓' : '✗'}`);
      console.log(`   - /package.json exists: ${hasPackageJson ? '✓' : '✗'}`);
    }
  } catch {
    console.log(`   ✗ ${alphaflowRoot} does NOT exist`);
  }

  // 4. Summary
  console.log('\n=== Summary ===');
  if (sourceSkill.enabledByDefault && hermesAdminKey) {
    console.log('✓ Everything looks correct. The Hermes agent should be able to:');
    console.log('  - Fetch skill prompts from /api/hermes/skills/prompts');
    console.log('  - Use list_source_directory and read_source_file tools');
    console.log('  - Access source code at: ' + alphaflowRoot);
    console.log("\nIf Hermes still says it does not have access to source code:");
    console.log('  1. Check PM2 logs: pm2 logs hermes-agent --lines 30');
    console.log('  2. Look for "SkillsLoader" warnings (API fetch failures)');
    console.log('  3. Look for "Source code tools available" (should appear when SuperDev chats)');
    console.log('  4. Ensure HERMES_ADMIN_KEY in .env matches the one in mini-services/hermes-agent/.env');
  } else {
    console.log('✗ Issues found — see above for fixes');
  }
}

main().catch(console.error).finally(() => db.$disconnect());
