// Example: Adding a custom provider to GACA-Core

import { PrismaClient } from '@prisma/client';
import { initGacaCore, getEngine, shutdownGacaCore, getPrisma } from '../src/index.js';

async function main() {
  console.log('GACA-Core Custom Provider Example\n');

  // Initialize
  await initGacaCore();
  const engine = getEngine();
  const prisma = getPrisma();

  // Example: Add a custom OpenAI-compatible provider
  console.log('1. Adding a custom provider (OpenAI-compatible)...\n');

  // Check if it already exists
  const existing = await prisma.aIProvider.findUnique({
    where: { slug: 'my-custom-provider' },
  });

  let providerId: string;

  if (existing) {
    console.log('   Provider already exists, using existing...');
    providerId = existing.id;
  } else {
    // Create the provider
    const provider = await prisma.aIProvider.create({
      data: {
        name: 'My Custom Provider',
        slug: 'my-custom-provider',
        baseUrl: 'https://api.example.com/v1/chat/completions', // Your API endpoint
        apiKey: process.env.CUSTOM_API_KEY || null,
        apiFormat: 'openai', // openai, anthropic, google, or custom
        authHeader: 'Authorization',
        authPrefix: 'Bearer ',
        customHeaders: JSON.stringify({
          'X-Custom-Header': 'my-value',
        }),
        rateLimitRpm: 60,
        rateLimitRpd: 10000,
        priority: 10, // Lower = higher priority
        isEnabled: !!process.env.CUSTOM_API_KEY,
        usage: {
          create: {
            requestsToday: 0,
            requestsThisMinute: 0,
            dayResetAt: new Date(),
            minuteResetAt: new Date(),
          },
        },
      },
    });

    providerId = provider.id;
    console.log(`   ✓ Created provider: ${provider.name} (${provider.id})`);

    // Add models to the provider
    console.log('\n2. Adding models to the provider...\n');

    const models = [
      { name: 'custom-model-small', displayName: 'Custom Small', maxTokens: 2048 },
      { name: 'custom-model-large', displayName: 'Custom Large', maxTokens: 8192, isDefault: true },
    ];

    for (const model of models) {
      await prisma.aIModel.create({
        data: {
          providerId: provider.id,
          name: model.name,
          displayName: model.displayName,
          maxTokens: model.maxTokens,
          contextWindow: model.maxTokens * 2,
          rateLimitRpm: 30,
          rateLimitRpd: 5000,
          isEnabled: true,
          isDefault: model.isDefault || false,
          usage: {
            create: {
              requestsToday: 0,
              requestsThisMinute: 0,
              dayResetAt: new Date(),
              minuteResetAt: new Date(),
            },
          },
          ranking: {
            create: {
              successRate: 0,
              avgLatencyMs: 0,
              avgQualityScore: 0.5,
              score: 0.5,
              sampleSize: 0,
            },
          },
        },
      });

      console.log(`   ✓ Created model: ${model.displayName}`);
    }
  }

  // Clear adapter cache to pick up new provider
  engine.clearAdapterCache();

  // List all providers
  console.log('\n3. Current providers:\n');

  const providers = await prisma.aIProvider.findMany({
    orderBy: { priority: 'asc' },
    include: { models: true },
  });

  providers.forEach((p) => {
    console.log(
      `   ${p.priority}. ${p.name}`.padEnd(30) +
        `${p.isEnabled ? '✓ Enabled' : '✗ Disabled'}`.padEnd(15) +
        `${p.models.length} models`
    );
  });

  // Test the custom provider (if API key is set)
  if (process.env.CUSTOM_API_KEY) {
    console.log('\n4. Testing custom provider...\n');

    try {
      const result = await engine.testProvider(providerId);
      if (result.success) {
        console.log(`   ✓ Test passed (${result.latencyMs}ms)`);
      } else {
        console.log(`   ✗ Test failed: ${result.error}`);
      }
    } catch (error: any) {
      console.log(`   ✗ Error: ${error.message}`);
    }
  } else {
    console.log('\n4. Skipping test (CUSTOM_API_KEY not set)');
  }

  // Cleanup: Remove the custom provider (optional)
  console.log('\n5. Cleanup (optional)...');
  console.log('   To remove: DELETE FROM AIProvider WHERE slug = "my-custom-provider"');

  await shutdownGacaCore();
  console.log('\n   ✓ Done!\n');
}

main().catch(console.error);
