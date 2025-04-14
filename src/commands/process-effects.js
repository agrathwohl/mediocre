import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Apply audio effects to WAV files
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input WAV file
 * @param {string} [options.directory] - Input directory with WAV files
 * @param {string} [options.output] - Output directory
 * @param {string} [options.effect='all'] - Effect to apply (reverb, delay, distortion, all)
 * @returns {Promise<string[]>} Array of processed WAV file paths
 */
export async function processEffects(options) {
  const outputDir = options.output || config.get('outputDir');
  const effect = options.effect || 'all';
  const processedFiles = [];
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Check if SoX is installed
  try {
    await execa('which', ['sox']);
  } catch (error) {
    throw new Error('SoX not found. Please install sox package.');
  }
  
  // Process a single file if provided
  if (options.input && fs.existsSync(options.input)) {
    const outputPath = path.join(
      outputDir,
      `${path.basename(options.input, '.wav')}-${effect}.wav`
    );
    await processFile(options.input, outputPath, effect);
    processedFiles.push(outputPath);
  }
  
  // Process all files in a directory if provided
  if (options.directory && fs.existsSync(options.directory)) {
    const files = fs.readdirSync(options.directory);
    
    for (const file of files) {
      if (file.endsWith('.wav')) {
        const inputPath = path.join(options.directory, file);
        const outputPath = path.join(
          outputDir,
          `${path.basename(file, '.wav')}-${effect}.wav`
        );
        
        try {
          await processFile(inputPath, outputPath, effect);
          processedFiles.push(outputPath);
        } catch (error) {
          console.error(`Error processing ${inputPath}: ${error.message}`);
        }
      }
    }
  }
  
  return processedFiles;
}

/**
 * Process a single WAV file with the specified effect
 * @param {string} inputPath - Input WAV file path
 * @param {string} outputPath - Output WAV file path
 * @param {string} effect - Effect to apply
 * @returns {Promise<void>}
 */
async function processFile(inputPath, outputPath, effect) {
  try {
    console.log(`Processing ${inputPath} with ${effect} effect(s)...`);
    
    // Apply different effects based on the effect parameter
    switch (effect) {
      case 'reverb':
        await applyReverb(inputPath, outputPath);
        break;
      case 'delay':
        await applyDelay(inputPath, outputPath);
        break;
      case 'distortion':
        await applyDistortion(inputPath, outputPath);
        break;
      case 'all':
      default:
        // Apply all effects in sequence using a temporary file
        const tempPath1 = path.join(config.get('tempDir'), `${path.basename(inputPath, '.wav')}-temp1.wav`);
        const tempPath2 = path.join(config.get('tempDir'), `${path.basename(inputPath, '.wav')}-temp2.wav`);
        
        await applyReverb(inputPath, tempPath1);
        await applyDelay(tempPath1, tempPath2);
        await applyDistortion(tempPath2, outputPath);
        
        // Clean up temporary files
        fs.unlinkSync(tempPath1);
        fs.unlinkSync(tempPath2);
        break;
    }
    
    console.log(`Processed ${inputPath} with ${effect} effect(s) to ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to process ${inputPath}: ${error.message}`);
  }
}

/**
 * Apply reverb effect to a WAV file
 * @param {string} inputPath - Input WAV file path
 * @param {string} outputPath - Output WAV file path
 * @returns {Promise<void>}
 */
async function applyReverb(inputPath, outputPath) {
  await execa('sox', [
    inputPath,
    outputPath,
    'reverb', '50', '50', '100',  // reverb parameters: reverberance, HF damping, room scale
  ]);
}

/**
 * Apply delay effect to a WAV file
 * @param {string} inputPath - Input WAV file path
 * @param {string} outputPath - Output WAV file path
 * @returns {Promise<void>}
 */
async function applyDelay(inputPath, outputPath) {
  await execa('sox', [
    inputPath,
    outputPath,
    'echo', '0.8', '0.9', '400', '0.8',  // echo parameters: gain-in, gain-out, delay, decay
  ]);
}

/**
 * Apply distortion effect to a WAV file
 * @param {string} inputPath - Input WAV file path
 * @param {string} outputPath - Output WAV file path
 * @returns {Promise<void>}
 */
async function applyDistortion(inputPath, outputPath) {
  await execa('sox', [
    inputPath,
    outputPath,
    'gain', '-n', '-3',  // normalize and reduce gain
    'overdrive', '10', '5',  // overdrive parameters: gain, color
  ]);
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    input: args[0],
    directory: args[1],
    output: args[2] || config.get('outputDir'),
    effect: args[3] || 'all'
  };
  
  processEffects(options)
    .then(files => {
      console.log(`Processed ${files.length} file(s) with effects`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}