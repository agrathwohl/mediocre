import path from 'path';
import { config } from '../utils/config.js';
import { buildDatasetPipeline, validateDataset, datasetInfo } from '../dataset/pipeline.js';

/**
 * Build ML-ready JSONL dataset from composition corpus.
 *
 * Replaces the old file-copy approach with a full pipeline:
 * discover → enrich → filter → instruct → dedup → split → write JSONL.
 *
 * @param {Object} options - CLI options from Commander
 */
export async function buildDatasetML(options) {
  const inputDir = options.input || config.get('outputDir');
  const outputDir = options.output || path.join(process.cwd(), 'dataset');

  const taskTypes = options.tasks
    ? options.tasks.split(',').map(t => t.trim())
    : undefined;

  const result = await buildDatasetPipeline({
    inputDir,
    outputDir,
    minQualityScore: options.quality ? parseFloat(options.quality) : 0,
    qualityTier: options.tier || null,
    taskTypes,
    variantsPerTask: options.variants ? parseInt(options.variants, 10) : 1,
    deduplicate: options.deduplicate !== false,
    trainRatio: options.trainRatio ? parseFloat(options.trainRatio) : 0.9,
    valRatio: options.valRatio ? parseFloat(options.valRatio) : 0.05,
    testRatio: options.testRatio ? parseFloat(options.testRatio) : 0.05,
    version: options.version || '1.0.0',
    generateCard: options.card !== false,
    dryRun: options.dryRun || false,
    maxCompositions: options.maxSamples ? parseInt(options.maxSamples, 10) : undefined,
    preferredStage: options.stage || null,
    seed: options.seed ? parseInt(options.seed, 10) : 42,
  });

  return result;
}

/**
 * Validate an existing JSONL dataset for schema compliance and data integrity.
 * @param {Object} options - CLI options
 */
export async function validateDatasetCommand(options) {
  const datasetDir = options.path || path.join(process.cwd(), 'dataset');
  const result = await validateDataset(datasetDir);

  if (result.valid) {
    console.log('\n✅ Dataset is valid');
  } else {
    console.log('\n❌ Dataset has issues:');
    for (const issue of result.issues) {
      console.log(`  • ${issue}`);
    }
  }

  return result;
}

/**
 * Display dataset statistics.
 * @param {Object} options - CLI options
 */
export async function datasetInfoCommand(options) {
  const datasetDir = options.path || path.join(process.cwd(), 'dataset');
  const info = await datasetInfo(datasetDir);

  console.log(`\nDataset: ${datasetDir}`);
  console.log(`Version: ${info.version || 'unknown'}`);
  console.log(`Total Samples: ${info.totalSamples.toLocaleString()}`);

  if (info.splits) {
    console.log('\nSplits:');
    for (const [name, count] of Object.entries(info.splits)) {
      const pct = ((count / info.totalSamples) * 100).toFixed(1);
      console.log(`  ${name}: ${count.toLocaleString()} (${pct}%)`);
    }
  }

  if (info.genres && info.genres.length > 0) {
    console.log(`\nGenres: ${info.genres.length} unique`);
    const top10 = info.genres.slice(0, 10);
    for (const { genre, count } of top10) {
      console.log(`  ${genre}: ${count}`);
    }
    if (info.genres.length > 10) {
      console.log(`  ... and ${info.genres.length - 10} more`);
    }
  }

  if (info.taskTypes) {
    console.log('\nTask Types:');
    for (const [type, count] of Object.entries(info.taskTypes)) {
      console.log(`  ${type}: ${count.toLocaleString()}`);
    }
  }

  return info;
}
