/**
 * @fileoverview Audio metadata extraction utilities
 * Provides duration and onset detection for audio files
 */

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { getAudioFilePatterns } from './file-patterns.js';

/**
 * Get comprehensive audio metadata from audio file
 * @param {string} abcPath - Path to ABC file (will search for associated WAV/FLAC)
 * @param {Object} options - Options
 * @param {boolean} options.verbose - Enable verbose logging
 * @returns {Promise<Object|null>} { duration, onsets, wavPath } or null if failed
 */
export async function getAudioMetadata(abcPath, options = {}) {
  const { execa } = await import("execa");

  // Find associated WAV file
  const basePath = abcPath.replace(/\.abc$/i, "");
  let wavPath = null;

  // Try different WAV file patterns
  const wavPatterns = getAudioFilePatterns(basePath);

  for (const pattern of wavPatterns) {
    try {
      await fs.access(pattern);
      wavPath = pattern;
      break;
    } catch {}
  }

  if (!wavPath) {
    if (options.verbose) {
      console.log(chalk.yellow(`⚠️  No WAV/FLAC file found for ${path.basename(abcPath)}`));
    }
    return null;
  }

  if (options.verbose) {
    console.log(chalk.cyan(`Found audio: ${path.basename(wavPath)}`));
  }

  // Check for cached onset data
  const onsetCachePath = `${basePath}-onsets.json`;
  try {
    const cacheContent = await fs.readFile(onsetCachePath, 'utf8');
    const cached = JSON.parse(cacheContent);

    if (options.verbose) {
      console.log(chalk.gray(`✓ Loaded cached onsets (${cached.onsets.length} onsets)`));
    }

    return {
      duration: cached.duration,
      onsets: cached.onsets,
      wavPath: cached.wavPath || wavPath
    };
  } catch {
    // Cache doesn't exist or is invalid, proceed with extraction
  }

  // Get duration using sox
  try {
    const { stdout } = await execa("sox", ["--i", "-D", wavPath]);
    const duration = parseFloat(stdout.trim());

    if (options.verbose) {
      console.log(chalk.green(`✓ Duration: ${duration} seconds`));
    }

    // Get onsets using aubioonset
    let onsets = [];
    try {
      const { stdout: onsetsOutput } = await execa("aubioonset", [wavPath]);
      onsets = onsetsOutput.trim().split('\n')
        .map(line => parseFloat(line))
        .filter(t => !isNaN(t));

      if (options.verbose) {
        console.log(chalk.green(`✓ Found ${onsets.length} onsets`));
      }
    } catch (error) {
      if (options.verbose) {
        console.log(chalk.yellow(`⚠️  Could not extract onsets: ${error.message}`));
      }
    }

    const metadata = { duration, onsets, wavPath };

    // Save to cache file
    try {
      const cacheData = {
        ...metadata,
        generatedAt: new Date().toISOString()
      };
      await fs.writeFile(onsetCachePath, JSON.stringify(cacheData, null, 2));

      if (options.verbose) {
        console.log(chalk.gray(`✓ Cached onsets to ${path.basename(onsetCachePath)}`));
      }
    } catch (error) {
      if (options.verbose) {
        console.log(chalk.yellow(`⚠️  Could not save onset cache: ${error.message}`));
      }
    }

    return metadata;
  } catch (error) {
    if (options.verbose) {
      console.log(chalk.yellow(`⚠️  Failed to get audio metadata: ${error.message}`));
    }
    return null;
  }
}

/**
 * Get audio duration only (faster than full metadata)
 * @param {string} audioPath - Path to audio file (WAV/FLAC)
 * @returns {Promise<number|null>} Duration in seconds or null
 */
export async function getAudioDuration(audioPath) {
  const { execa } = await import("execa");

  try {
    const { stdout } = await execa("sox", ["--i", "-D", audioPath]);
    return parseFloat(stdout.trim());
  } catch (error) {
    console.error(`Failed to get audio duration: ${error.message}`);
    return null;
  }
}

/**
 * Get onset times from audio file
 * @param {string} audioPath - Path to audio file (WAV/FLAC)
 * @returns {Promise<number[]>} Array of onset times in seconds
 */
export async function getAudioOnsets(audioPath) {
  const { execa } = await import("execa");

  try {
    const { stdout } = await execa("aubioonset", [audioPath]);
    return stdout.trim().split('\n')
      .map(line => parseFloat(line))
      .filter(t => !isNaN(t));
  } catch (error) {
    console.error(`Failed to extract onsets: ${error.message}`);
    return [];
  }
}
