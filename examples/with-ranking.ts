// Example using GACA-Core with ranking features

import { initGacaCore, getEngine, shutdownGacaCore } from '../src/index.js';

async function main() {
  console.log('GACA-Core Ranking Example\n');

  // Initialize
  await initGacaCore();
  const engine = getEngine();

  // Run multiple completions to generate ranking data
  console.log('1. Running 5 completions to generate ranking data...\n');

  for (let i = 1; i <= 5; i++) {
    try {
      const result = await engine.complete({
        prompt: `Say the number ${i} and nothing else.`,
        maxTokens: 10,
      });
      console.log(`   Request ${i}: ${result.providerName}/${result.model} - "${result.content.trim()}" (${result.latencyMs}ms)`);
    } catch (error: any) {
      console.log(`   Request ${i}: Failed - ${error.message}`);
    }
  }

  // View rankings
  console.log('\n2. Current model rankings:\n');

  const rankings = await engine.getRankingService().getAllRankings();

  if (rankings.length === 0) {
    console.log('   No rankings yet (need more requests)');
  } else {
    rankings.forEach((r, i) => {
      console.log(
        `   ${i + 1}. ${r.providerName}/${r.modelName}`.padEnd(45) +
          `Score: ${r.score.toFixed(3)}  ` +
          `Success: ${(r.successRate * 100).toFixed(0)}%  ` +
          `Latency: ${r.avgLatencyMs.toFixed(0)}ms  ` +
          `Samples: ${r.sampleSize}`
      );
    });
  }

  // Get ranking weights
  console.log('\n3. Ranking weights:');
  const weights = engine.getRankingService().getWeights();
  console.log(`   Success Rate: ${weights.successRate}`);
  console.log(`   Latency: ${weights.latency}`);
  console.log(`   Quality: ${weights.quality}`);

  // View failover events
  console.log('\n4. Recent failover events:');
  const failovers = await engine.getFailoverEvents(5);

  if (failovers.length === 0) {
    console.log('   No failover events');
  } else {
    failovers.forEach((f) => {
      console.log(
        `   ${new Date(f.createdAt).toLocaleTimeString()} - ` +
          `${f.reason}: ${f.errorMessage?.substring(0, 50) || 'N/A'}`
      );
    });
  }

  // Recalculate rankings
  console.log('\n5. Recalculating rankings...');
  await engine.getRankingService().recalculateAll();
  console.log('   ✓ Rankings recalculated\n');

  await shutdownGacaCore();
}

main().catch(console.error);
