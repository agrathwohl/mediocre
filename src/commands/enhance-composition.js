/**
 * Enhance Composition Command
 * Uses orchestrated post-processing to improve ABC compositions
 *
 * Workflow:
 * 1. Load composition context (JSON + stripped markdown)
 * 2. Run orchestrator → worker → QA loop
 * 3. Save enhanced ABC
 */

import fs from 'fs/promises';
import path from 'path';
import { loadCompositionContext } from '../utils/orchestrator-context.js';
import { orchestratePostProcessing } from '../agents/orchestrator/index.js';
import { GateController } from '../control/gate-controller.js';

/**
 * Enhance a composition using orchestrated post-processing
 * @param {Object} options - Command options
 * @param {string} options.input - Path to ABC file
 * @param {string} [options.output] - Output path (defaults to input-enhanced.abc)
 * @param {number} [options.maxIterations=10] - Maximum orchestration iterations
 * @returns {Promise<Object>} Enhancement result with paths and stats
 */
export async function enhanceComposition(options) {
  const { input, output, maxIterations = 10, interactive = false } = options;

  if (!input) {
    throw new Error('Input ABC file path required');
  }

  try {
    await fs.access(input);
  } catch {
    throw new Error(`Input file not found: ${input}`);
  }

  console.log('\n🎼 Mediocre Music - Composition Enhancement');
  console.log(`   Input: ${path.basename(input)}\n`);

  // Load composition context (JSON metadata + stripped markdown analysis)
  console.log('📋 Loading composition context...');
  const context = await loadCompositionContext(input);

  console.log(`   ✅ Loaded context from ${path.basename(context.jsonPath)}`);
  console.log(`   Genre: ${context.metadata.genre}`);
  console.log(`   Classical: ${context.metadata.classicalGenre}`);
  console.log(`   Modern: ${context.metadata.modernGenre}`);

  // Create gate controller for interactive mode
  const gateController = interactive ? new GateController() : null;
  // Run orchestrated post-processing
  let result;
  try {
    result = await orchestratePostProcessing({
      abcFilePath: input,
      musicalContext: context,
      genres: {
        classical: context.metadata.classicalGenre || '',
        modern: context.metadata.modernGenre || '',
        hybrid: context.metadata.genre || '',
      },
      maxIterations,
      gateController,
    });
  } finally {
    if (gateController) gateController.close();
  }

  // Determine output path
  const outputPath = output || input.replace('.abc', '-enhanced.abc');

  // Save enhanced ABC
  await fs.writeFile(outputPath, result.enhancedAbc);

  console.log(`\n📝 Enhancement Summary:`);
  console.log(`   Iterations: ${result.iterations}`);
  console.log(`   Workers Used: ${[...new Set(result.workHistory.map(w => w.agent))].join(', ')}`);
  if (result.finalQaResult) {
    const avgScore = (
      result.finalQaResult.scores.technical +
      result.finalQaResult.scores.musical +
      result.finalQaResult.scores.fusion +
      result.finalQaResult.scores.completeness
    ) / 4;
    console.log(`   Final QA Score: ${avgScore.toFixed(1)}/10`);
    console.log(`   Verdict: ${result.finalQaResult.verdict}`);
  }

  console.log(`\n✅ Enhanced composition saved: ${outputPath}\n`);

  return {
    inputPath: input,
    outputPath,
    iterations: result.iterations,
    workHistory: result.workHistory,
    finalQaResult: result.finalQaResult,
  };
}

// CLI entry point
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node enhance-composition.js <input.abc> [output.abc] [--max-iterations N]');
    console.log('');
    console.log('Options:');
    console.log('  --max-iterations N    Maximum orchestration iterations (default: 10)');
    process.exit(1);
  }

  const input = args[0];
  const maxIterationsArg = args.indexOf('--max-iterations');
  const maxIterations = maxIterationsArg !== -1
    ? parseInt(args[maxIterationsArg + 1], 10)
    : 10;

  const output = args.find(arg => arg.endsWith('.abc') && arg !== input);

  (async () => {
    try {
      await enhanceComposition({
        input,
        output,
        maxIterations,
      });
      process.exit(0);
    } catch (error) {
      console.error('\n❌ Error:', error.message);
      console.error(error.stack);
      process.exit(1);
    }
  })();
}
