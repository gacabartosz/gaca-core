// Auto-Discover: Intelligent self-learning model discovery pipeline
// Usage: npx tsx scripts/auto-discover.ts [--ci] [--dry-run]
//
// Pipeline:
//   1. Load knowledge base (model-knowledge.json)
//   2. Discover new models from all free provider APIs
//   3. Filter candidates (skip known-rejected, recently-failed)
//   4. Test candidate models (max 5 per provider)
//   5. LLM analysis via free model (dogfooding GACA)
//   6. Apply code changes (types.ts, README.md)
//   7. Validate TypeScript compilation
//   8. Update knowledge base
//   9. Create PR (in CI mode) or output summary

import { config } from 'dotenv';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { DEFAULT_PROVIDERS, DefaultProviderConfig } from '../src/core/types.js';
import {
  PROVIDER_FETCHERS,
  discoverProvider,
  testModel,
  getApiKey,
  fetchWithTimeout,
  DiscoveryResult,
} from './lib/provider-fetchers.js';

config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '..');

// CLI args
const args = process.argv.slice(2);
const flagCI = args.includes('--ci');
const flagDryRun = args.includes('--dry-run');

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ModelKnowledgeEntry {
  firstSeen: string;
  lastSeen: string;
  status: 'added' | 'rejected' | 'failed' | 'deprecated';
  reason: string;
  confidence: number;
  testHistory: Array<{ date: string; success: boolean; latencyMs: number }>;
  addedInPR?: number;
}

interface ProviderReliability {
  lastSuccess: string | null;
  consecutiveFails: number;
}

interface KnowledgeBase {
  version: number;
  lastRun: string | null;
  models: Record<string, ModelKnowledgeEntry>;
  providerReliability: Record<string, ProviderReliability>;
  stats: {
    totalRuns: number;
    modelsDiscovered: number;
    modelsAdded: number;
    modelsRejected: number;
    prsCreated: number;
    prsAutoMerged: number;
    failedValidations: number;
  };
}

interface LLMDecision {
  provider: string;
  modelId: string;
  action: 'add' | 'skip';
  reason: string;
  displayName: string;
  rateLimitRpd?: number;
}

interface LLMResponse {
  decisions: LLMDecision[];
  confidence: number;
  summary: string;
}

interface TestResultEntry {
  provider: string;
  slug: string;
  modelId: string;
  success: boolean;
  latencyMs: number;
  error?: string;
}

// ─────────────────────────────────────────────────────────────
// Knowledge Base
// ─────────────────────────────────────────────────────────────

const KNOWLEDGE_PATH = resolve(ROOT, 'scripts/model-knowledge.json');

function loadKnowledge(): KnowledgeBase {
  if (!existsSync(KNOWLEDGE_PATH)) {
    return {
      version: 1,
      lastRun: null,
      models: {},
      providerReliability: {},
      stats: {
        totalRuns: 0,
        modelsDiscovered: 0,
        modelsAdded: 0,
        modelsRejected: 0,
        prsCreated: 0,
        prsAutoMerged: 0,
        failedValidations: 0,
      },
    };
  }
  return JSON.parse(readFileSync(KNOWLEDGE_PATH, 'utf-8'));
}

function saveKnowledge(kb: KnowledgeBase): void {
  kb.lastRun = new Date().toISOString();
  writeFileSync(KNOWLEDGE_PATH, JSON.stringify(kb, null, 2) + '\n');
}

// ─────────────────────────────────────────────────────────────
// Phase 2: Discover all providers
// ─────────────────────────────────────────────────────────────

async function discoverAllProviders(knowledge: KnowledgeBase): Promise<DiscoveryResult[]> {
  const freeProviders = DEFAULT_PROVIDERS.filter((p) => PROVIDER_FETCHERS[p.slug]);
  const results: DiscoveryResult[] = [];

  for (const provider of freeProviders) {
    // Skip providers with 3+ consecutive failures
    const reliability = knowledge.providerReliability[provider.slug];
    if (reliability && reliability.consecutiveFails >= 3) {
      console.log(`  [skip] ${provider.name} — ${reliability.consecutiveFails} consecutive failures`);
      continue;
    }

    process.stdout.write(`  [discover] ${provider.name.padEnd(20)}`);

    const result = await discoverProvider(provider);
    results.push(result);

    // Update reliability tracking
    if (!knowledge.providerReliability[provider.slug]) {
      knowledge.providerReliability[provider.slug] = { lastSuccess: null, consecutiveFails: 0 };
    }
    if (result.error) {
      knowledge.providerReliability[provider.slug].consecutiveFails++;
      console.log(`⚠ ${result.error}`);
    } else {
      knowledge.providerReliability[provider.slug].lastSuccess = new Date().toISOString();
      knowledge.providerReliability[provider.slug].consecutiveFails = 0;
      const parts: string[] = [`${result.remoteTotal} remote`, `${result.matchedModels.length} matched`];
      if (result.newModels.length > 0) parts.push(`+${result.newModels.length} new`);
      console.log(parts.join(', '));
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Phase 3: Filter candidates
// ─────────────────────────────────────────────────────────────

function filterCandidates(
  results: DiscoveryResult[],
  knowledge: KnowledgeBase
): Array<{ slug: string; provider: string; modelId: string }> {
  const candidates: Array<{ slug: string; provider: string; modelId: string }> = [];
  const today = new Date().toISOString().slice(0, 10);

  for (const result of results) {
    if (result.error || result.newModels.length === 0) continue;

    for (const modelId of result.newModels) {
      const key = `${result.slug}:${modelId}`;
      const existing = knowledge.models[key];

      // Skip known-rejected models (unless not seen in 30+ days — might have changed)
      if (existing?.status === 'rejected') {
        const daysSinceLastSeen = Math.floor(
          (Date.now() - new Date(existing.lastSeen).getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSinceLastSeen < 30) {
          continue; // Still recently rejected
        }
      }

      // Skip models that have failed testing 3+ times
      if (existing?.status === 'failed') {
        const failCount = existing.testHistory.filter((t) => !t.success).length;
        if (failCount >= 3) {
          // Auto-reject after 3 failures
          knowledge.models[key] = { ...existing, status: 'rejected', reason: 'Auto-rejected after 3+ test failures' };
          continue;
        }
      }

      // Update lastSeen for known models
      if (existing) {
        existing.lastSeen = today;
      }

      candidates.push({ slug: result.slug, provider: result.provider, modelId });
    }
  }

  return candidates;
}

// ─────────────────────────────────────────────────────────────
// Phase 4: Test candidates
// ─────────────────────────────────────────────────────────────

async function testCandidates(
  candidates: Array<{ slug: string; provider: string; modelId: string }>,
  knowledge: KnowledgeBase
): Promise<TestResultEntry[]> {
  const results: TestResultEntry[] = [];
  const today = new Date().toISOString().slice(0, 10);

  // Group by provider, max 5 per provider
  const byProvider = new Map<string, typeof candidates>();
  for (const c of candidates) {
    if (!byProvider.has(c.slug)) byProvider.set(c.slug, []);
    byProvider.get(c.slug)!.push(c);
  }

  for (const [slug, providerCandidates] of byProvider) {
    const provider = DEFAULT_PROVIDERS.find((p) => p.slug === slug);
    if (!provider) continue;

    const toTest = providerCandidates.slice(0, 5);
    console.log(`  [test] ${provider.name}: testing ${toTest.length}/${providerCandidates.length} models`);

    for (const candidate of toTest) {
      const result = await testModel(provider, candidate.modelId);

      results.push({
        provider: candidate.provider,
        slug: candidate.slug,
        modelId: candidate.modelId,
        success: result.success,
        latencyMs: result.latencyMs,
        error: result.error,
      });

      // Update knowledge base test history
      const key = `${slug}:${candidate.modelId}`;
      if (!knowledge.models[key]) {
        knowledge.models[key] = {
          firstSeen: today,
          lastSeen: today,
          status: 'failed',
          reason: '',
          confidence: 0,
          testHistory: [],
        };
      }
      knowledge.models[key].testHistory.push({
        date: today,
        success: result.success,
        latencyMs: result.latencyMs,
      });
      // Keep only last 10 test entries
      if (knowledge.models[key].testHistory.length > 10) {
        knowledge.models[key].testHistory = knowledge.models[key].testHistory.slice(-10);
      }

      const status = result.success ? '✓' : '✗';
      const latency = result.success ? `${result.latencyMs}ms` : result.error?.substring(0, 40) || 'failed';
      console.log(`    ${status} ${candidate.modelId.substring(0, 50).padEnd(52)} ${latency}`);

      // Rate limit courtesy
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  return results;
}

// ─────────────────────────────────────────────────────────────
// Phase 5: LLM Analysis
// ─────────────────────────────────────────────────────────────

const LLM_SYSTEM_PROMPT = `You are the GACA-Core Model Curator — an AI that decides which new free LLM models to add to the GACA-Core catalog.

You receive:
1. DISCOVERY RESULTS — new models found on provider APIs with test results
2. CURRENT CATALOG — existing DEFAULT_PROVIDERS from types.ts
3. KNOWLEDGE BASE — history of past decisions, test results, known issues

Your job:
- Decide which new models are worth adding (genuinely useful, free, working)
- Skip duplicates, experimental/preview models, embeddings, image models, TTS, etc.
- Generate proper displayName for each model
- Rate your overall confidence (0-100)

Respond ONLY with valid JSON (no markdown, no code fences):
{
  "decisions": [
    {
      "provider": "groq",
      "modelId": "new-model-id",
      "action": "add" | "skip",
      "reason": "Brief explanation",
      "displayName": "Human Readable Name",
      "rateLimitRpd": 1000
    }
  ],
  "confidence": 85,
  "summary": "Brief summary of changes"
}

Rules:
- Only add chat/completion models (not embeddings, TTS, image, rerank, whisper, moderation, guard)
- Skip models with "preview", "experimental", "beta" in name unless they passed testing
- Prefer models with known architectures (Llama, Qwen, Gemma, Mistral, DeepSeek, Phi, Command)
- If a model was previously rejected and nothing changed — skip it again
- If a model failed testing — skip it (action: "skip")
- For displayName: use clean human-readable names (e.g. "Llama 3.3 70B", "Qwen 3 32B")
- For rateLimitRpd: use provider defaults unless you have specific info
- Confidence 90+: Very clear additions (major new models from trusted families)
- Confidence 70-89: Probably good but some uncertainty
- Confidence <70: Unclear, needs human review`;

async function callLLM(prompt: string): Promise<string> {
  // Wait 10s before LLM call to let rate limits recover after testing phase
  console.log('  [llm] Waiting 10s for rate limits to recover...');
  await new Promise((resolve) => setTimeout(resolve, 10000));

  // Cascade of free providers — try each until one works
  const FREE_LLM_PROVIDERS = [
    { slug: 'cerebras', model: 'llama3.1-8b', baseUrl: 'https://api.cerebras.ai/v1/chat/completions' },
    { slug: 'groq', model: 'llama-3.1-8b-instant', baseUrl: 'https://api.groq.com/openai/v1/chat/completions' },
    { slug: 'groq', model: 'llama-3.3-70b-versatile', baseUrl: 'https://api.groq.com/openai/v1/chat/completions' },
    { slug: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', baseUrl: 'https://openrouter.ai/api/v1/chat/completions' },
    { slug: 'google', model: 'gemini-2.0-flash', baseUrl: '' }, // handled separately
    { slug: 'mistral', model: 'mistral-small-latest', baseUrl: 'https://api.mistral.ai/v1/chat/completions' },
  ];

  for (const { slug, model, baseUrl } of FREE_LLM_PROVIDERS) {
    const apiKey = getApiKey(slug);
    if (!apiKey) continue;

    try {
      console.log(`  [llm] Trying ${slug}/${model}...`);

      // Google uses a different API format
      if (slug === 'google') {
        const googlePrompt = `${LLM_SYSTEM_PROMPT}\n\n${prompt}\n\nRespond ONLY with valid JSON.`;
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        const res = await fetchWithTimeout(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: googlePrompt }] }],
            generationConfig: { maxOutputTokens: 4096, temperature: 0.1 },
          }),
        }, 60000);
        const data = await res.json();
        const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          console.log(`  [llm] ✓ Response from ${slug}/${model}`);
          return content;
        }
        console.warn(`  [llm] ⚠ Empty response from ${slug}/${model}`);
        continue;
      }

      // OpenAI-compatible providers
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (apiKey) {
        headers['Authorization'] = `Bearer ${apiKey}`;
      }
      if (slug === 'openrouter') {
        headers['HTTP-Referer'] = 'https://gaca-core.local';
        headers['X-Title'] = 'GACA-Core Auto-Discover';
      }

      const body: Record<string, unknown> = {
        model,
        messages: [
          { role: 'system', content: LLM_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 4096,
        temperature: 0.1,
      };
      // response_format not supported by all providers
      if (slug !== 'mistral') {
        body.response_format = { type: 'json_object' };
      }

      const res = await fetchWithTimeout(baseUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      }, 60000); // 60s timeout for LLM

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      if (content) {
        console.log(`  [llm] ✓ Response from ${slug}/${model}`);
        return content;
      }
      console.warn(`  [llm] ⚠ Empty response from ${slug}/${model}`);
    } catch (err: any) {
      console.warn(`  [llm] ✗ ${slug}/${model} failed: ${err.message?.substring(0, 60)}`);
    }
  }

  throw new Error('All LLM providers failed — cannot analyze models');
}

async function analyzeWithLLM(
  testResults: TestResultEntry[],
  discoveryResults: DiscoveryResult[],
  knowledge: KnowledgeBase
): Promise<LLMResponse> {
  // Build current catalog summary
  const catalogSummary = DEFAULT_PROVIDERS
    .filter((p) => PROVIDER_FETCHERS[p.slug])
    .map((p) => ({
      provider: p.name,
      slug: p.slug,
      models: p.models.map((m) => m.name),
    }));

  // Build knowledge summary (only relevant entries)
  const knowledgeSummary: Record<string, { status: string; reason: string; testCount: number }> = {};
  for (const [key, entry] of Object.entries(knowledge.models)) {
    knowledgeSummary[key] = {
      status: entry.status,
      reason: entry.reason,
      testCount: entry.testHistory.length,
    };
  }

  const prompt = `## DISCOVERY RESULTS

New models found on provider APIs:
${JSON.stringify(discoveryResults.filter((r) => r.newModels.length > 0).map((r) => ({
  provider: r.provider,
  slug: r.slug,
  newModels: r.newModels,
})), null, 2)}

## TEST RESULTS

Testing results for candidate models:
${JSON.stringify(testResults, null, 2)}

## CURRENT CATALOG

Models already in GACA-Core:
${JSON.stringify(catalogSummary, null, 2)}

## KNOWLEDGE BASE (past decisions)

${Object.keys(knowledgeSummary).length > 0 ? JSON.stringify(knowledgeSummary, null, 2) : 'No prior decisions recorded.'}

---

Analyze the above and decide which new models to add. Remember:
- Only add models that PASSED testing (success: true)
- Skip non-chat models (embeddings, whisper, TTS, image, guard, moderation, rerank)
- Skip duplicates already in catalog
- Provide your decisions as JSON`;

  const response = await callLLM(prompt);

  // Parse LLM response — handle potential markdown fences
  let jsonStr = response.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  try {
    const parsed = JSON.parse(jsonStr) as LLMResponse;
    // Validate structure
    if (!Array.isArray(parsed.decisions) || typeof parsed.confidence !== 'number') {
      throw new Error('Invalid LLM response structure');
    }
    return parsed;
  } catch (err: any) {
    console.error('  [llm] Failed to parse LLM response:', err.message);
    console.error('  [llm] Raw response:', response.substring(0, 500));
    // Return safe default — no changes
    return { decisions: [], confidence: 0, summary: 'Failed to parse LLM response' };
  }
}

// ─────────────────────────────────────────────────────────────
// Phase 6: Apply code changes
// ─────────────────────────────────────────────────────────────

function addModelToTypes(modelsToAdd: LLMDecision[]): { added: number; content: string } {
  const typesPath = resolve(ROOT, 'src/core/types.ts');
  let content = readFileSync(typesPath, 'utf-8');
  let addedCount = 0;

  // Group by provider slug (normalize LLM provider field to slug)
  const byProvider = new Map<string, LLMDecision[]>();
  for (const model of modelsToAdd) {
    const providerSlug = DEFAULT_PROVIDERS.find(
      (p) => p.slug === model.provider || p.name === model.provider
    )?.slug || model.provider.toLowerCase();
    if (!byProvider.has(providerSlug)) byProvider.set(providerSlug, []);
    byProvider.get(providerSlug)!.push(model);
  }

  for (const [slug, models] of byProvider) {
    // Find the provider block by slug
    const slugPattern = `slug: '${slug}'`;
    const slugIdx = content.indexOf(slugPattern);
    if (slugIdx === -1) {
      console.warn(`  [types] Provider slug '${slug}' not found in types.ts`);
      continue;
    }

    // Find the models array closing bracket for this provider
    // Strategy: from slugIdx, find "models: [" then find matching "]"
    const modelsStart = content.indexOf('models: [', slugIdx);
    if (modelsStart === -1) continue;

    // Find the matching closing bracket
    let depth = 0;
    let closingIdx = -1;
    for (let i = modelsStart + 'models: ['.length; i < content.length; i++) {
      if (content[i] === '[') depth++;
      if (content[i] === ']') {
        if (depth === 0) {
          closingIdx = i;
          break;
        }
        depth--;
      }
    }
    if (closingIdx === -1) continue;

    // Detect indentation from existing entries
    const existingLines = content.substring(modelsStart, closingIdx).split('\n');
    let indent = '      ';
    for (const line of existingLines) {
      const match = line.match(/^(\s+)\{ name:/);
      if (match) {
        indent = match[1];
        break;
      }
    }

    // Build new model entries
    const newEntries: string[] = [];
    for (const model of models) {
      const rpd = model.rateLimitRpd || 1000;
      newEntries.push(`${indent}{ name: '${model.modelId}', displayName: '${model.displayName}', rateLimitRpd: ${rpd} },`);
      addedCount++;
    }

    // Insert before closing bracket
    const insertPoint = closingIdx;
    const beforeInsert = content[insertPoint - 1] === '\n' ? '' : '\n';
    content = content.slice(0, insertPoint) + beforeInsert + newEntries.join('\n') + '\n' + indent.slice(0, -2) + content.slice(insertPoint);
  }

  if (addedCount > 0) {
    writeFileSync(typesPath, content);
  }

  return { added: addedCount, content };
}

function updateReadme(modelsAdded: LLMDecision[]): void {
  const readmePath = resolve(ROOT, 'README.md');
  let content = readFileSync(readmePath, 'utf-8');

  // 1. Update model count in header
  const totalFreeModels = DEFAULT_PROVIDERS
    .filter((p) => PROVIDER_FETCHERS[p.slug])
    .reduce((sum, p) => sum + p.models.length, 0) + modelsAdded.length;

  content = content.replace(
    /\*\*(\d+)\+ free LLM models\*\*/,
    `**${totalFreeModels}+ free LLM models**`
  );

  // Also update "60+ Models" line
  const totalAllModels = DEFAULT_PROVIDERS.reduce((sum, p) => sum + p.models.length, 0) + modelsAdded.length;
  content = content.replace(
    /\*\*\d+\+ Models\*\*/,
    `**${totalAllModels}+ Models**`
  );

  // 2. Update "Available Free Models" count
  content = content.replace(
    /Available Free Models \(\d+\+\)/,
    `Available Free Models (${totalFreeModels}+)`
  );

  // 3. Add models to provider tables in <details> section
  for (const model of modelsAdded) {
    const provider = DEFAULT_PROVIDERS.find(
      (p) => p.slug === model.provider || p.name === model.provider
    );
    if (!provider) continue;

    // Find the provider's table in README
    // Pattern: "### ProviderName (N models)" then table rows
    const headerPattern = new RegExp(`### ${provider.name} \\((\\d+)( free)? models?\\)`);
    const headerMatch = content.match(headerPattern);
    if (!headerMatch) continue;

    // Update model count in header
    const oldCount = parseInt(headerMatch[1]);
    content = content.replace(
      headerPattern,
      `### ${provider.name} (${oldCount + 1}${headerMatch[2] || ''} models)`
    );

    // Find the last table row for this provider section and add new row after it
    const headerIdx = content.indexOf(headerMatch[0]);
    const nextSectionIdx = content.indexOf('\n###', headerIdx + headerMatch[0].length);
    const sectionEnd = nextSectionIdx === -1 ? content.indexOf('\n</details>', headerIdx) : nextSectionIdx;

    if (sectionEnd === -1) continue;

    // Find the last table row (line starting with |)
    const section = content.substring(headerIdx, sectionEnd);
    const lines = section.split('\n');
    let lastTableRowIdx = -1;
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].startsWith('|') && !lines[i].includes('---')) {
        lastTableRowIdx = i;
        break;
      }
    }

    if (lastTableRowIdx === -1) continue;

    // Build new row — check if table has RPD column
    const hasRpd = lines.some((l) => l.includes('RPD'));
    const newRow = hasRpd
      ? `| \`${model.modelId}\` | ${model.displayName} | ${(model.rateLimitRpd || 1000).toLocaleString()} |`
      : `| \`${model.modelId}\` | ${model.displayName} |`;

    lines.splice(lastTableRowIdx + 1, 0, newRow);
    content = content.substring(0, headerIdx) + lines.join('\n') + content.substring(sectionEnd);
  }

  // 4. Update provider model listings in "Getting API Keys" section
  for (const model of modelsAdded) {
    const provider = DEFAULT_PROVIDERS.find(
      (p) => p.slug === model.provider || p.name === model.provider
    );
    if (!provider) continue;

    // Find "**Models:**" line for this provider
    const providerHeader = `### ${provider.name}`;
    const providerIdx = content.indexOf(providerHeader);
    if (providerIdx === -1) continue;

    const modelsLinePattern = /\*\*Models:\*\* (.+)/;
    const nextSection = content.indexOf('\n###', providerIdx + providerHeader.length);
    const providerSection = content.substring(providerIdx, nextSection === -1 ? undefined : nextSection);
    const modelsMatch = providerSection.match(modelsLinePattern);
    if (modelsMatch) {
      const existingList = modelsMatch[1];
      const newList = `${existingList}, ${model.displayName}`;
      content = content.replace(
        `**Models:** ${existingList}`,
        `**Models:** ${newList}`
      );
    }
  }

  writeFileSync(readmePath, content);
}

// ─────────────────────────────────────────────────────────────
// Phase 7: Validate TypeScript
// ─────────────────────────────────────────────────────────────

function validateTypeScript(): boolean {
  try {
    execSync('npx tsc --noEmit', { cwd: ROOT, stdio: 'pipe', timeout: 60000 });
    console.log('  [validate] ✓ TypeScript compilation OK');
    return true;
  } catch (err: any) {
    console.error('  [validate] ✗ TypeScript compilation failed');
    console.error(err.stderr?.toString().substring(0, 500) || err.message);
    return false;
  }
}

function rollbackChanges(): void {
  try {
    execSync('git checkout -- src/core/types.ts README.md', { cwd: ROOT, stdio: 'pipe' });
    console.log('  [rollback] Changes reverted');
  } catch {
    console.warn('  [rollback] Failed to revert — manual cleanup may be needed');
  }
}

// ─────────────────────────────────────────────────────────────
// Phase 8: Update knowledge base
// ─────────────────────────────────────────────────────────────

function updateKnowledge(
  knowledge: KnowledgeBase,
  llmResponse: LLMResponse,
  testResults: TestResultEntry[]
): void {
  const today = new Date().toISOString().slice(0, 10);

  for (const decision of llmResponse.decisions) {
    // Normalize provider to slug (LLM may return name like "Groq" or slug like "groq")
    const providerSlug = DEFAULT_PROVIDERS.find(
      (p) => p.slug === decision.provider || p.name === decision.provider
    )?.slug || decision.provider.toLowerCase();
    const key = `${providerSlug}:${decision.modelId}`;

    if (!knowledge.models[key]) {
      knowledge.models[key] = {
        firstSeen: today,
        lastSeen: today,
        status: 'failed',
        reason: '',
        confidence: 0,
        testHistory: [],
      };
    }

    const entry = knowledge.models[key];
    entry.lastSeen = today;
    entry.confidence = llmResponse.confidence;

    if (decision.action === 'add') {
      entry.status = 'added';
      entry.reason = decision.reason;
      knowledge.stats.modelsAdded++;
    } else {
      entry.status = 'rejected';
      entry.reason = decision.reason;
      knowledge.stats.modelsRejected++;
    }
  }

  knowledge.stats.totalRuns++;
  knowledge.stats.modelsDiscovered += testResults.length;
}

// ─────────────────────────────────────────────────────────────
// Phase 9: Create PR (CI mode)
// ─────────────────────────────────────────────────────────────

function writeCIArtifacts(llmResponse: LLMResponse, modelsAdded: LLMDecision[]): void {
  const modelNames = modelsAdded.map((m) => `${m.displayName} (${m.provider})`).join(', ');
  const date = new Date().toISOString().slice(0, 10);

  const commitMsg = `feat: auto-discover ${modelsAdded.length} new model${modelsAdded.length > 1 ? 's' : ''}

${llmResponse.summary}

Models added: ${modelNames}
Confidence: ${llmResponse.confidence}/100

Auto-generated by GACA auto-discover pipeline`;

  const prTitle = `Auto-discover: +${modelsAdded.length} model${modelsAdded.length > 1 ? 's' : ''} (${date})`;

  const prBody = `## Auto-Discovery Report

**Date:** ${date}
**Confidence:** ${llmResponse.confidence}/100
**Models added:** ${modelsAdded.length}

### New Models

${modelsAdded.map((m) => `- **${m.displayName}** (\`${m.modelId}\`) — ${m.provider} — ${m.reason}`).join('\n')}

### Skipped Models

${llmResponse.decisions.filter((d) => d.action === 'skip').map((d) => `- \`${d.modelId}\` (${d.provider}) — ${d.reason}`).join('\n') || 'None'}

### Summary

${llmResponse.summary}

---
*Auto-generated by [GACA Auto-Discover Pipeline](scripts/auto-discover.ts)*`;

  writeFileSync('/tmp/gaca-commit-message.txt', commitMsg);
  writeFileSync('/tmp/gaca-pr-title.txt', prTitle);
  writeFileSync('/tmp/gaca-pr-body.txt', prBody);
  writeFileSync('/tmp/gaca-confidence.txt', String(llmResponse.confidence));
}

// ─────────────────────────────────────────────────────────────
// Main Pipeline
// ─────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  GACA Auto-Discover Pipeline                            ║');
  console.log('╚══════════════════════════════════════════════════════════╝\n');

  if (flagDryRun) console.log('  [mode] DRY RUN — no changes will be applied\n');
  if (flagCI) console.log('  [mode] CI — will output PR artifacts\n');

  // Phase 1: Load knowledge base
  console.log('[Phase 1] Loading knowledge base...');
  const knowledge = loadKnowledge();
  console.log(`  Loaded: ${Object.keys(knowledge.models).length} known models, ${knowledge.stats.totalRuns} prior runs\n`);

  // Phase 2: Discover
  console.log('[Phase 2] Discovering models from provider APIs...');
  const discoveryResults = await discoverAllProviders(knowledge);
  const totalNew = discoveryResults.reduce((sum, r) => sum + r.newModels.length, 0);
  console.log(`  Total: ${totalNew} new models found\n`);

  if (totalNew === 0) {
    console.log('  No new models discovered — catalog is up to date.');
    saveKnowledge(knowledge);
    console.log('\n  Done.\n');
    return;
  }

  // Phase 3: Filter
  console.log('[Phase 3] Filtering candidates...');
  const candidates = filterCandidates(discoveryResults, knowledge);
  console.log(`  Candidates after filtering: ${candidates.length}\n`);

  if (candidates.length === 0) {
    console.log('  All new models were filtered out (known-rejected or failed).');
    saveKnowledge(knowledge);
    console.log('\n  Done.\n');
    return;
  }

  // Phase 4: Test
  console.log('[Phase 4] Testing candidate models...');
  const testResults = await testCandidates(candidates, knowledge);
  const passedTests = testResults.filter((t) => t.success).length;
  console.log(`  Results: ${passedTests} passed, ${testResults.length - passedTests} failed\n`);

  if (passedTests === 0) {
    console.log('  No models passed testing.');
    saveKnowledge(knowledge);
    console.log('\n  Done.\n');
    return;
  }

  // Phase 5: LLM Analysis
  console.log('[Phase 5] Analyzing with LLM...');
  let llmResponse: LLMResponse;
  try {
    llmResponse = await analyzeWithLLM(testResults, discoveryResults, knowledge);
  } catch (err: any) {
    console.error(`  [llm] ${err.message}`);
    console.log('  Saving knowledge base and exiting gracefully.');
    knowledge.stats.totalRuns++;
    knowledge.stats.modelsDiscovered += testResults.length;
    saveKnowledge(knowledge);
    console.log('\n  Done (LLM unavailable — no changes applied).\n');
    return;
  }
  const modelsToAdd = llmResponse.decisions.filter((d) => d.action === 'add');
  console.log(`  LLM confidence: ${llmResponse.confidence}/100`);
  console.log(`  Decisions: ${modelsToAdd.length} to add, ${llmResponse.decisions.length - modelsToAdd.length} to skip`);
  console.log(`  Summary: ${llmResponse.summary}\n`);

  if (modelsToAdd.length === 0) {
    console.log('  LLM decided: no models to add.');
    updateKnowledge(knowledge, llmResponse, testResults);
    saveKnowledge(knowledge);
    console.log('\n  Done.\n');
    return;
  }

  if (flagDryRun) {
    console.log('[DRY RUN] Would add these models:');
    for (const m of modelsToAdd) {
      console.log(`  + ${m.provider}: ${m.modelId} → "${m.displayName}"`);
    }
    updateKnowledge(knowledge, llmResponse, testResults);
    saveKnowledge(knowledge);
    console.log('\n  Done (dry run).\n');
    return;
  }

  // Phase 6: Apply changes
  console.log('[Phase 6] Applying code changes...');
  const { added } = addModelToTypes(modelsToAdd);
  console.log(`  [types.ts] Added ${added} model entries`);
  updateReadme(modelsToAdd);
  console.log(`  [README.md] Updated model counts and tables`);

  // Phase 7: Validate
  console.log('\n[Phase 7] Validating TypeScript compilation...');
  const valid = validateTypeScript();
  if (!valid) {
    console.error('  Validation failed — rolling back changes');
    rollbackChanges();
    knowledge.stats.failedValidations++;
    saveKnowledge(knowledge);
    process.exit(1);
  }

  // Phase 8: Update knowledge
  console.log('\n[Phase 8] Updating knowledge base...');
  updateKnowledge(knowledge, llmResponse, testResults);
  saveKnowledge(knowledge);
  console.log(`  Knowledge base saved (${Object.keys(knowledge.models).length} total entries)`);

  // Phase 9: CI artifacts
  if (flagCI) {
    console.log('\n[Phase 9] Writing CI artifacts...');
    writeCIArtifacts(llmResponse, modelsToAdd);
    console.log('  Written: commit message, PR title, PR body, confidence score');
    knowledge.stats.prsCreated++;
    if (llmResponse.confidence >= 80) {
      knowledge.stats.prsAutoMerged++;
    }
    saveKnowledge(knowledge);
  }

  // Summary
  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║  Pipeline Complete                                       ║');
  console.log('╚══════════════════════════════════════════════════════════╝');
  console.log(`  Models added: ${modelsToAdd.length}`);
  console.log(`  Confidence: ${llmResponse.confidence}/100`);
  if (llmResponse.confidence >= 80) {
    console.log('  Auto-merge: ✓ eligible (confidence ≥ 80)');
  } else {
    console.log('  Auto-merge: ✗ requires manual review');
  }
  console.log('');
}

main().catch((error) => {
  console.error('\n[FATAL] Auto-discover pipeline failed:', error.message || error);
  process.exit(1);
});
