// Test all configured providers
// Usage: npx tsx scripts/test-providers.ts [--all] [--provider <slug>] [--model <name>]
//
// Default: tests default model per provider (original behavior)
// --all: test ALL enabled models
// --provider <slug>: test all models of a specific provider
// --model <name>: test a specific model by name

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { AIEngine } from '../src/core/AIEngine.js';

config();

const prisma = new PrismaClient();
const engine = new AIEngine(prisma);

// Parse CLI args
const args = process.argv.slice(2);
const flagAll = args.includes('--all');
const providerIdx = args.indexOf('--provider');
const filterProvider = providerIdx !== -1 ? args[providerIdx + 1] : null;
const modelIdx = args.indexOf('--model');
const filterModel = modelIdx !== -1 ? args[modelIdx + 1] : null;

interface TestEntry {
  providerName: string;
  modelName: string;
  status: 'ok' | 'fail' | 'skip';
  latencyMs: number;
  error?: string;
}

async function testProviders() {
  const mode = filterModel ? `model: ${filterModel}` : filterProvider ? `provider: ${filterProvider}` : flagAll ? 'all models' : 'default models';
  console.log(`Testing GACA-Core providers (${mode})...\n`);

  // Build query based on flags
  const providerWhere: any = {};
  if (filterProvider) {
    providerWhere.slug = filterProvider;
  }

  const providers = await prisma.aIProvider.findMany({
    where: providerWhere,
    orderBy: { priority: 'asc' },
    include: {
      models: flagAll || filterProvider || filterModel
        ? { where: filterModel ? { name: filterModel } : { isEnabled: true } }
        : { where: { isDefault: true }, take: 1 },
    },
  });

  if (providers.length === 0) {
    console.log('No providers found. Run: npm run seed');
    await prisma.$disconnect();
    return;
  }

  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0);
  console.log(`Found ${providers.length} providers, ${totalModels} models to test\n`);
  console.log('═'.repeat(80));
  console.log(`  ${'Provider'.padEnd(18)} ${'Model'.padEnd(35)} ${'Status'.padEnd(10)} Latency`);
  console.log('─'.repeat(80));

  const results: TestEntry[] = [];

  for (const provider of providers) {
    if (!provider.apiKey) {
      for (const model of provider.models) {
        const entry: TestEntry = {
          providerName: provider.name,
          modelName: model.name,
          status: 'skip',
          latencyMs: 0,
          error: 'No API key',
        };
        results.push(entry);
        printRow(entry);
      }
      continue;
    }

    if (!provider.isEnabled) {
      for (const model of provider.models) {
        const entry: TestEntry = {
          providerName: provider.name,
          modelName: model.name,
          status: 'skip',
          latencyMs: 0,
          error: 'Disabled',
        };
        results.push(entry);
        printRow(entry);
      }
      continue;
    }

    for (const model of provider.models) {
      const start = Date.now();
      let entry: TestEntry;

      try {
        const result = await engine.complete({
          prompt: 'Say "OK" and nothing else.',
          maxTokens: 10,
          providerId: provider.id,
          model: model.name,
        });

        entry = {
          providerName: provider.name,
          modelName: model.name,
          status: result.content.length > 0 ? 'ok' : 'fail',
          latencyMs: result.latencyMs || (Date.now() - start),
        };
      } catch (error: any) {
        entry = {
          providerName: provider.name,
          modelName: model.name,
          status: 'fail',
          latencyMs: Date.now() - start,
          error: error.message?.substring(0, 50),
        };
      }

      results.push(entry);
      printRow(entry);
    }
  }

  console.log('═'.repeat(80));

  const okCount = results.filter((r) => r.status === 'ok').length;
  const failCount = results.filter((r) => r.status === 'fail').length;
  const skipCount = results.filter((r) => r.status === 'skip').length;

  console.log(`\nResults: ${okCount} passed, ${failCount} failed, ${skipCount} skipped\n`);

  // Test full completion with failover (only in default mode)
  if (!flagAll && !filterProvider && !filterModel && okCount > 0) {
    console.log('Testing AI completion with failover...\n');

    try {
      const response = await engine.complete({
        prompt: 'Say "Hello from GACA-Core!" and nothing else.',
        maxTokens: 50,
      });

      console.log('✅ Completion successful!');
      console.log(`  Provider: ${response.providerName}`);
      console.log(`  Model: ${response.model}`);
      console.log(`  Latency: ${response.latencyMs}ms`);
      console.log(`  Response: ${response.content.substring(0, 100)}`);
    } catch (error: any) {
      console.log(`❌ Completion failed: ${error.message}`);
    }
  }

  await prisma.$disconnect();
}

function printRow(entry: TestEntry) {
  const provider = entry.providerName.padEnd(18);
  const modelShort = entry.modelName.length > 33
    ? entry.modelName.substring(0, 30) + '...'
    : entry.modelName;
  const model = modelShort.padEnd(35);

  let status: string;
  switch (entry.status) {
    case 'ok':
      status = `✅ OK`.padEnd(10);
      break;
    case 'fail':
      status = `❌ FAIL`.padEnd(10);
      break;
    case 'skip':
      status = `⏸️  SKIP`.padEnd(10);
      break;
  }

  const latency = entry.status === 'ok' ? `${entry.latencyMs}ms` : entry.error || '';
  console.log(`  ${provider} ${model} ${status} ${latency}`);
}

testProviders().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
