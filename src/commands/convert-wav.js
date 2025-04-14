import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert MIDI files to WAV
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input MIDI file
 * @param {string} [options.directory] - Input directory with MIDI files
 * @param {string} [options.output] - Output directory
 * @returns {Promise<string[]>} Array of generated WAV file paths
 */
export async function convertToWav(options) {
  const outputDir = options.output || config.get('outputDir');
  const generatedFiles = [];
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process a single file if provided
  if (options.input && fs.existsSync(options.input)) {
    const outputPath = path.join(outputDir, path.basename(options.input, '.mid') + '.wav');
    await convertFile(options.input, outputPath);
    generatedFiles.push(outputPath);
  }
  
  // Process all files in a directory if provided
  if (options.directory && fs.existsSync(options.directory)) {
    const files = fs.readdirSync(options.directory);
    
    for (const file of files) {
      if (file.endsWith('.mid')) {
        const inputPath = path.join(options.directory, file);
        const outputPath = path.join(outputDir, path.basename(file, '.mid') + '.wav');
        
        try {
          await convertFile(inputPath, outputPath);
          generatedFiles.push(outputPath);
        } catch (error) {
          console.error(`Error converting ${inputPath}: ${error.message}`);
        }
      }
    }
  }
  
  return generatedFiles;
}

/**
 * Convert a single MIDI file to WAV
 * @param {string} inputPath - Input MIDI file path
 * @param {string} outputPath - Output WAV file path
 * @returns {Promise<void>}
 */
async function convertFile(inputPath, outputPath) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);
    
    // Check if timidity is installed
    try {
      await execa('which', ['timidity']);
    } catch (error) {
      throw new Error('timidity not found. Please install timidity package.');
    }
    
    // Convert MIDI to WAV using timidity
    await execa('timidity', [
      inputPath,
      '-Ow',
      '-o', outputPath,
      '-s', '44100',  // Sample rate
    ]);
    
    console.log(`Converted ${inputPath} to ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to WAV: ${error.message}`);
  }
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    input: args[0],
    directory: args[1],
    output: args[2] || config.get('outputDir')
  };
  
  convertToWav(options)
    .then(files => {
      console.log(`Converted ${files.length} file(s) to WAV`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}