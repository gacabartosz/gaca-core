// Smart Provider Sync — updates database from DEFAULT_PROVIDERS without losing runtime data
// Usage: npx tsx scripts/sync-providers.ts [--dry-run]
//
// This script compares DEFAULT_PROVIDERS (source of truth in code) with the database
// and applies changes non-destructively:
//   - New providers → created with usage/ranking records
//   - New models → added to existing providers
//   - Removed models → disabled (not deleted, preserves history)
//   - Updated config (URL, rate limits) → updated in DB
//   - NEVER touches: API keys, usage data, ranking scores, enabled/disabled state

import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { DEFAULT_PROVIDERS, DefaultProviderConfig } from '../src/core/types.js';

config();

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

interface SyncResult {
  providersCreated: string[];
  providersUpdated: string[];
  modelsCreated: string[];
  modelsDisabled: string[];
  modelsReEnabled: string[];
  errors: string[];
  timestamp: string;
}

async function syncProviders(): Promise<SyncResult> {
  const result: SyncResult = {
    providersCreated: [],
    providersUpdated: [],
    modelsCreated: [],
    modelsDisabled: [],
    modelsReEnabled: [],
    errors: [],
    timestamp: new Date().toISOString(),
  };

  console.log(`\n[Sync] Starting provider sync${dryRun ? ' (DRY RUN)' : ''}...`);
  console.log(`[Sync] Source: ${DEFAULT_PROVIDERS.length} providers in types.ts\n`);

  // Slug-to-env mapping for special cases
  const slugToEnv: Record<string, string> = {
    'google': 'GOOGLE_AI_API_KEY',
  };

  // Get existing providers from DB
  const existingProviders = await prisma.aIProvider.findMany({
    include: { models: true },
  });
  const existingBySlug = new Map(existingProviders.map(p => [p.slug, p]));

  for (const defaultProvider of DEFAULT_PROVIDERS) {
    const existing = existingBySlug.get(defaultProvider.slug);

    if (!existing) {
      // NEW PROVIDER — create it
      console.log(`[Sync] + Creating new provider: ${defaultProvider.name}`);

      const envKey = slugToEnv[defaultProvider.slug] || `${defaultProvider.slug.toUpperCase().replace(/-/g, '_')}_API_KEY`;
      const apiKey = process.env[envKey] || null;

      if (!dryRun) {
        try {
          const provider = await prisma.aIProvider.create({
            data: {
              name: defaultProvider.name,
              slug: defaultProvider.slug,
              baseUrl: defaultProvider.baseUrl,
              apiKey,
              apiFormat: defaultProvider.apiFormat,
              authHeader: defaultProvider.authHeader,
              authPrefix: defaultProvider.authPrefix,
              customHeaders: '{}',
              rateLimitRpm: defaultProvider.rateLimitRpm,
              rateLimitRpd: defaultProvider.rateLimitRpd,
              priority: defaultProvider.priority,
              isEnabled: !!apiKey,
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

          // Create models
          for (const modelConfig of defaultProvider.models) {
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
            result.modelsCreated.push(`${defaultProvider.name}/${modelConfig.name}`);
          }

          result.providersCreated.push(defaultProvider.name);
        } catch (err: any) {
          result.errors.push(`Failed to create ${defaultProvider.name}: ${err.message}`);
          console.error(`[Sync] ERROR creating ${defaultProvider.name}: ${err.message}`);
        }
      } else {
        result.providersCreated.push(defaultProvider.name);
        for (const m of defaultProvider.models) {
          result.modelsCreated.push(`${defaultProvider.name}/${m.name}`);
        }
      }
      continue;
    }

    // EXISTING PROVIDER — check for config updates
    const updates: Record<string, any> = {};
    if (existing.baseUrl !== defaultProvider.baseUrl) updates.baseUrl = defaultProvider.baseUrl;
    if (existing.apiFormat !== defaultProvider.apiFormat) updates.apiFormat = defaultProvider.apiFormat;
    if (existing.authHeader !== defaultProvider.authHeader) updates.authHeader = defaultProvider.authHeader;
    if (existing.authPrefix !== defaultProvider.authPrefix) updates.authPrefix = defaultProvider.authPrefix;
    if (existing.rateLimitRpm !== defaultProvider.rateLimitRpm) updates.rateLimitRpm = defaultProvider.rateLimitRpm;
    if (existing.rateLimitRpd !== defaultProvider.rateLimitRpd) updates.rateLimitRpd = defaultProvider.rateLimitRpd;
    if (existing.priority !== defaultProvider.priority) updates.priority = defaultProvider.priority;

    if (Object.keys(updates).length > 0) {
      console.log(`[Sync] ~ Updating provider config: ${defaultProvider.name} (${Object.keys(updates).join(', ')})`);
      if (!dryRun) {
        await prisma.aIProvider.update({
          where: { id: existing.id },
          data: updates,
        });
      }
      result.providersUpdated.push(defaultProvider.name);
    }

    // Check models
    const existingModels = new Map(existing.models.map(m => [m.name, m]));
    const defaultModelNames = new Set(defaultProvider.models.map(m => m.name));

    // Add new models
    for (const modelConfig of defaultProvider.models) {
      const existingModel = existingModels.get(modelConfig.name);

      if (!existingModel) {
        console.log(`[Sync] + Adding model: ${defaultProvider.name}/${modelConfig.name}`);
        if (!dryRun) {
          try {
            await prisma.aIModel.create({
              data: {
                providerId: existing.id,
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
            result.modelsCreated.push(`${defaultProvider.name}/${modelConfig.name}`);
          } catch (err: any) {
            result.errors.push(`Failed to add model ${modelConfig.name}: ${err.message}`);
          }
        } else {
          result.modelsCreated.push(`${defaultProvider.name}/${modelConfig.name}`);
        }
      } else if (!existingModel.isEnabled) {
        // Model exists but was disabled — re-enable it
        console.log(`[Sync] ~ Re-enabling model: ${defaultProvider.name}/${modelConfig.name}`);
        if (!dryRun) {
          await prisma.aIModel.update({
            where: { id: existingModel.id },
            data: { isEnabled: true },
          });
        }
        result.modelsReEnabled.push(`${defaultProvider.name}/${modelConfig.name}`);
      }
    }

    // Disable removed models (don't delete — preserve history)
    for (const [modelName, model] of existingModels) {
      if (!defaultModelNames.has(modelName) && model.isEnabled) {
        console.log(`[Sync] - Disabling removed model: ${defaultProvider.name}/${modelName}`);
        if (!dryRun) {
          await prisma.aIModel.update({
            where: { id: model.id },
            data: { isEnabled: false },
          });
        }
        result.modelsDisabled.push(`${defaultProvider.name}/${modelName}`);
      }
    }
  }

  // Summary
  console.log('\n[Sync] ═══════════════════════════════════════');
  console.log(`[Sync] Sync complete${dryRun ? ' (DRY RUN — no changes made)' : ''}:`);
  console.log(`[Sync]   Providers created: ${result.providersCreated.length}`);
  console.log(`[Sync]   Providers updated: ${result.providersUpdated.length}`);
  console.log(`[Sync]   Models created:    ${result.modelsCreated.length}`);
  console.log(`[Sync]   Models disabled:   ${result.modelsDisabled.length}`);
  console.log(`[Sync]   Models re-enabled: ${result.modelsReEnabled.length}`);
  console.log(`[Sync]   Errors:            ${result.errors.length}`);
  console.log('[Sync] ═══════════════════════════════════════\n');

  if (result.errors.length > 0) {
    console.log('[Sync] Errors:');
    for (const err of result.errors) {
      console.log(`  - ${err}`);
    }
  }

  return result;
}

syncProviders()
  .then(async (result) => {
    // Save sync result to a log file
    const fs = await import('fs');
    const logDir = '/root/gaca-core/logs';
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.writeFileSync(
      `${logDir}/last-sync.json`,
      JSON.stringify(result, null, 2)
    );
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error('[Sync] Fatal error:', error);
    await prisma.$disconnect();
    process.exit(1);
  });

export { syncProviders, SyncResult };
