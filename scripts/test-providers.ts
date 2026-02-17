// Test all configured providers

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { AIEngine } from '../src/core/AIEngine.js';

config();

const prisma = new PrismaClient();
const engine = new AIEngine(prisma);

async function testProviders() {
  console.log('Testing GACA-Core providers...\n');

  const providers = await prisma.aIProvider.findMany({
    orderBy: { priority: 'asc' },
    include: { models: { where: { isDefault: true }, take: 1 } },
  });

  if (providers.length === 0) {
    console.log('No providers found. Run: npm run seed');
    await prisma.$disconnect();
    return;
  }

  console.log(`Found ${providers.length} providers\n`);
  console.log('═'.repeat(60));

  let successCount = 0;
  let failCount = 0;

  for (const provider of providers) {
    process.stdout.write(`Testing ${provider.name.padEnd(20)}`);

    if (!provider.apiKey) {
      console.log('⚠️  No API key configured');
      failCount++;
      continue;
    }

    if (!provider.isEnabled) {
      console.log('⏸️  Disabled');
      continue;
    }

    try {
      const result = await engine.testProvider(provider.id);

      if (result.success) {
        console.log(`✅ OK (${result.latencyMs}ms)`);
        successCount++;
      } else {
        console.log(`❌ ${result.error?.substring(0, 40)}`);
        failCount++;
      }
    } catch (error: any) {
      console.log(`❌ ${error.message?.substring(0, 40)}`);
      failCount++;
    }
  }

  console.log('═'.repeat(60));
  console.log(`\nResults: ${successCount} passed, ${failCount} failed\n`);

  // Test full completion with failover
  if (successCount > 0) {
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

testProviders().catch((error) => {
  console.error('Test failed:', error);
  process.exit(1);
});
