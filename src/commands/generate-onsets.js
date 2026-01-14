#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { getAudioMetadata } from '../utils/audio-metadata.js';

/**
 * Generate and save onset data for an ABC composition
 * @param {Object} options - Command options
 * @param {string} options.abc - Path to ABC file
 */
export async function generateOnsets(options) {
  const { abc } = options;

  if (!abc) {
    console.error(chalk.red('Error: --abc parameter is required'));
    process.exit(1);
  }

  const abcPath = path.resolve(abc);
  const basePath = abcPath.replace(/\.abc$/i, '');
  const outputPath = `${basePath}-onsets.json`;

  console.log(chalk.cyan(`\n🎵 Extracting onsets for ${path.basename(abc)}...\n`));

  try {
    const metadata = await getAudioMetadata(abcPath, { verbose: true });

    if (!metadata) {
      console.error(chalk.red('\n❌ Failed to extract onset data'));
      console.error(chalk.yellow('Make sure the associated WAV/FLAC file exists'));
      process.exit(1);
    }

    const onsetData = {
      abcFile: abc,
      wavFile: metadata.wavPath,
      duration: metadata.duration,
      onsets: metadata.onsets,
      onsetCount: metadata.onsets.length,
      generatedAt: new Date().toISOString()
    };

    await fs.writeFile(outputPath, JSON.stringify(onsetData, null, 2));

    console.log(chalk.green(`\n✅ Onset data saved to: ${outputPath}`));
    console.log(chalk.cyan(`   Total onsets: ${metadata.onsets.length}`));
    console.log(chalk.cyan(`   Duration: ${metadata.duration.toFixed(2)}s`));
    console.log(chalk.cyan(`   Density: ${(metadata.onsets.length / metadata.duration).toFixed(2)} onsets/sec\n`));

    return outputPath;
  } catch (error) {
    console.error(chalk.red(`\n❌ Error generating onsets: ${error.message}`));
    if (error.stack) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}
