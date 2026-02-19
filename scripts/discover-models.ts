// Discover new models from provider APIs
// Usage: npx tsx scripts/discover-models.ts [--test] [--provider <slug>] [--json]
//
// Compares remote model listings with DEFAULT_PROVIDERS to find:
//   - NEW: models available remotely but not in our catalog
//   - MISSING: models in our catalog but not available remotely
//   - MATCHED: models present in both

import { config } from 'dotenv';
import { DEFAULT_PROVIDERS } from '../src/core/types.js';
import {
  PROVIDER_FETCHERS,
  discoverProvider,
  testModel,
  DiscoveryResult,
} from './lib/provider-fetchers.js';

config();

// CLI args
const args = process.argv.slice(2);
const flagTest = args.includes('--test');
const flagJson = args.includes('--json');
const providerIdx = args.indexOf('--provider');
const filterProvider = providerIdx !== -1 ? args[providerIdx + 1] : null;

async function main() {
  const providersToCheck = filterProvider
    ? DEFAULT_PROVIDERS.filter((p) => p.slug === filterProvider)
    : DEFAULT_PROVIDERS.filter((p) => PROVIDER_FETCHERS[p.slug]); // Only free providers with fetchers

  if (providersToCheck.length === 0) {
    console.error(`No provider found with slug: ${filterProvider}`);
    process.exit(1);
  }

  if (!flagJson) {
    console.log('\n[Discover] Scanning provider APIs for new models...\n');
  }

  const allResults: DiscoveryResult[] = [];

  for (const provider of providersToCheck) {
    if (!flagJson) {
      process.stdout.write(`  ${provider.name.padEnd(20)}`);
    }

    const result = await discoverProvider(provider);
    allResults.push(result);

    if (!flagJson) {
      if (result.error) {
        console.log(`⚠️  ${result.error}`);
      } else {
        const parts: string[] = [];
        parts.push(`${result.remoteTotal} remote`);
        parts.push(`${result.matchedModels.length} matched`);
        if (result.newModels.length > 0) parts.push(`+${result.newModels.length} new`);
        if (result.missingModels.length > 0) parts.push(`-${result.missingModels.length} missing`);
        console.log(parts.join(', '));
      }
    }
  }

  if (flagJson) {
    console.log(JSON.stringify(allResults, null, 2));
    return;
  }

  // Detailed report
  const hasNews = allResults.some((r) => r.newModels.length > 0 || r.missingModels.length > 0);

  if (hasNews) {
    console.log('\n' + '═'.repeat(60));

    for (const result of allResults) {
      if (result.newModels.length === 0 && result.missingModels.length === 0) continue;

      console.log(`\n${result.provider}:`);

      if (result.newModels.length > 0) {
        console.log(`  NEW (${result.newModels.length}):`);
        for (const m of result.newModels) {
          console.log(`    + ${m}`);
        }
      }

      if (result.missingModels.length > 0) {
        console.log(`  MISSING from remote (${result.missingModels.length}):`);
        for (const m of result.missingModels) {
          console.log(`    - ${m}`);
        }
      }
    }

    console.log('\n' + '═'.repeat(60));
  } else {
    console.log('\n  All models matched — catalog is up to date.');
  }

  // Test new models if requested
  if (flagTest) {
    const testableResults = allResults.filter((r) => r.newModels.length > 0 && !r.error);

    if (testableResults.length === 0) {
      console.log('\n  No new models to test.');
      return;
    }

    console.log('\n[Discover] Testing new models (max 5 per provider)...\n');
    console.log('  Provider             Model                                    Status   Latency');
    console.log('  ' + '─'.repeat(80));

    for (const result of testableResults) {
      const provider = DEFAULT_PROVIDERS.find((p) => p.slug === result.slug)!;
      const modelsToTest = result.newModels.slice(0, 5);

      for (const modelId of modelsToTest) {
        const shortProvider = result.provider.padEnd(20);
        const shortModel = modelId.length > 40 ? modelId.substring(0, 37) + '...' : modelId.padEnd(40);
        process.stdout.write(`  ${shortProvider} ${shortModel} `);

        const testResult = await testModel(provider, modelId);

        if (testResult.success) {
          console.log(`✅ OK    ${testResult.latencyMs}ms`);
        } else {
          console.log(`❌ FAIL  ${testResult.error?.substring(0, 30) || 'unknown'}`);
        }

        // Rate limit courtesy — 2s delay between tests
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
  }

  // Summary
  const totalNew = allResults.reduce((acc, r) => acc + r.newModels.length, 0);
  const totalMissing = allResults.reduce((acc, r) => acc + r.missingModels.length, 0);
  const totalMatched = allResults.reduce((acc, r) => acc + r.matchedModels.length, 0);
  const totalErrors = allResults.filter((r) => r.error).length;

  console.log(`\n[Discover] Summary: ${totalMatched} matched, ${totalNew} new, ${totalMissing} missing, ${totalErrors} errors\n`);
}

main().catch((error) => {
  console.error('Discovery failed:', error);
  process.exit(1);
});
