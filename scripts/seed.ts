// Seed script - Creates default providers and models

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { DEFAULT_PROVIDERS } from '../src/core/types.js';

config();

const prisma = new PrismaClient();

async function seed() {
  console.log('Seeding GACA-Core database...\n');

  const forceMode = process.argv.includes('--force');

  // Check if providers already exist
  const existingCount = await prisma.aIProvider.count();
  if (existingCount > 0) {
    console.log(`Database already has ${existingCount} providers.`);
    if (!forceMode) {
      const response = await prompt('Do you want to clear and reseed? (yes/no): ');
      if (response !== 'yes') {
        console.log('Seed cancelled.');
        await prisma.$disconnect();
        return;
      }
    } else {
      console.log('Force mode: clearing and reseeding...');
    }

    // Clear existing data
    console.log('Clearing existing data...');
    await prisma.aIFailoverEvent.deleteMany();
    await prisma.aIModelRanking.deleteMany();
    await prisma.aIModelUsage.deleteMany();
    await prisma.aIModel.deleteMany();
    await prisma.aIProviderUsage.deleteMany();
    await prisma.aIProvider.deleteMany();
  }

  // Create providers with models
  for (const providerConfig of DEFAULT_PROVIDERS) {
    console.log(`Creating provider: ${providerConfig.name}...`);

    // Get API key from environment
    // Handle special slug-to-env mappings
    const slugToEnv: Record<string, string> = {
      'google': 'GOOGLE_AI_API_KEY',
    };
    const envKey = slugToEnv[providerConfig.slug] || `${providerConfig.slug.toUpperCase().replace(/-/g, '_')}_API_KEY`;
    const apiKey = process.env[envKey] || null;

    if (apiKey) {
      console.log(`  ✓ Found API key in ${envKey}`);
    } else {
      console.log(`  ⚠ No API key found (${envKey})`);
    }

    const provider = await prisma.aIProvider.create({
      data: {
        name: providerConfig.name,
        slug: providerConfig.slug,
        baseUrl: providerConfig.baseUrl,
        apiKey,
        apiFormat: providerConfig.apiFormat,
        authHeader: providerConfig.authHeader,
        authPrefix: providerConfig.authPrefix,
        customHeaders: '{}',
        rateLimitRpm: providerConfig.rateLimitRpm,
        rateLimitRpd: providerConfig.rateLimitRpd,
        priority: providerConfig.priority,
        isEnabled: !!apiKey, // Only enable if API key is configured
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

    // Create models for this provider
    for (const modelConfig of providerConfig.models) {
      console.log(`  Creating model: ${modelConfig.name}`);

      await prisma.aIModel.create({
        data: {
          providerId: provider.id,
          name: modelConfig.name,
          displayName: modelConfig.displayName,
          rateLimitRpm: modelConfig.rateLimitRpm || null,
          rateLimitRpd: modelConfig.rateLimitRpd || null,
          costPer1kInput: modelConfig.costPer1kInput || 0,
          costPer1kOutput: modelConfig.costPer1kOutput || 0,
          maxTokens: modelConfig.maxTokens || 4096,
          contextWindow: modelConfig.contextWindow || 8192,
          isEnabled: true,
          isDefault: modelConfig.isDefault || false,
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
    }

    console.log(`  Created ${providerConfig.models.length} models\n`);
  }

  // Summary
  const providers = await prisma.aIProvider.findMany({ include: { models: true } });
  const enabledCount = providers.filter((p) => p.isEnabled).length;
  const totalModels = providers.reduce((acc, p) => acc + p.models.length, 0);

  console.log('═══════════════════════════════════════════');
  console.log('Seed complete!');
  console.log(`  ${providers.length} providers created`);
  console.log(`  ${enabledCount} providers enabled (with API keys)`);
  console.log(`  ${totalModels} models created`);
  console.log('═══════════════════════════════════════════\n');

  console.log('Next steps:');
  console.log('1. Copy .env.example to .env');
  console.log('2. Add your API keys to .env');
  console.log('3. Run: npm run dev');
  console.log('4. Open: http://localhost:5173\n');

  await prisma.$disconnect();
}

// Simple prompt helper
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.once('data', (data) => {
      resolve(data.toString().trim());
    });
  });
}

seed().catch((error) => {
  console.error('Seed failed:', error);
  process.exit(1);
});
