// Basic usage example for GACA-Core

import { initGacaCore, complete, getEngine, shutdownGacaCore } from '../src/index.js';

async function main() {
  console.log('GACA-Core Basic Usage Example\n');

  // Initialize GACA-Core
  console.log('1. Initializing GACA-Core...');
  await initGacaCore();
  console.log('   ✓ Initialized\n');

  // Simple completion using helper function
  console.log('2. Running simple completion...');
  try {
    const response = await complete('What is 2 + 2? Answer with just the number.');
    console.log(`   ✓ Response: ${response}\n`);
  } catch (error: any) {
    console.log(`   ✗ Error: ${error.message}\n`);
  }

  // Completion with system prompt
  console.log('3. Running completion with system prompt...');
  try {
    const response = await complete('Tell me a joke about programming.', {
      systemPrompt: 'You are a funny assistant who tells short jokes.',
      temperature: 0.7,
      maxTokens: 100,
    });
    console.log(`   ✓ Response: ${response}\n`);
  } catch (error: any) {
    console.log(`   ✗ Error: ${error.message}\n`);
  }

  // Using the engine directly for more control
  console.log('4. Using engine directly...');
  try {
    const engine = getEngine();
    const result = await engine.complete({
      prompt: 'What is the capital of France?',
      maxTokens: 50,
    });

    console.log('   ✓ Full response:');
    console.log(`     Provider: ${result.providerName}`);
    console.log(`     Model: ${result.model}`);
    console.log(`     Latency: ${result.latencyMs}ms`);
    console.log(`     Tokens: ${result.tokensUsed || 'N/A'}`);
    console.log(`     Content: ${result.content}\n`);
  } catch (error: any) {
    console.log(`   ✗ Error: ${error.message}\n`);
  }

  // Get available models
  console.log('5. Getting available models...');
  try {
    const engine = getEngine();
    const available = await engine.getModelSelector().getAvailableModels();

    console.log(`   ✓ ${available.length} models available:`);
    available.slice(0, 5).forEach((item) => {
      console.log(`     - ${item.provider.name} / ${item.model.displayName || item.model.name}`);
    });
    if (available.length > 5) {
      console.log(`     ... and ${available.length - 5} more`);
    }
    console.log();
  } catch (error: any) {
    console.log(`   ✗ Error: ${error.message}\n`);
  }

  // Shutdown
  console.log('6. Shutting down...');
  await shutdownGacaCore();
  console.log('   ✓ Done!\n');
}

main().catch(console.error);
