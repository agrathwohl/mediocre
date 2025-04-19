import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';
import { validateAbcNotation, cleanAbcNotation } from '../utils/claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert ABC notation files to MIDI
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input ABC file
 * @param {string} [options.directory] - Input directory with ABC files
 * @param {string} [options.output] - Output directory
 * @returns {Promise<string[]>} Array of generated MIDI file paths
 */
export async function convertToMidi(options) {
  const outputDir = options.output || config.get('outputDir');
  const generatedFiles = [];
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process a single file if provided
  if (options.input && fs.existsSync(options.input)) {
    const outputPath = path.join(outputDir, path.basename(options.input, '.abc') + '.mid');
    await convertFile(options.input, outputPath);
    generatedFiles.push(outputPath);
  }
  
  // Process all files in a directory if provided
  if (options.directory && fs.existsSync(options.directory)) {
    const files = fs.readdirSync(options.directory);
    
    for (const file of files) {
      if (file.endsWith('.abc')) {
        const inputPath = path.join(options.directory, file);
        const outputPath = path.join(outputDir, path.basename(file, '.abc') + '.mid');
        
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
 * Convert a single ABC file to MIDI
 * @param {string} inputPath - Input ABC file path
 * @param {string} outputPath - Output MIDI file path
 * @returns {Promise<void>}
 */
async function convertFile(inputPath, outputPath) {
  try {
    console.log(`Converting ${inputPath} to ${outputPath}`);
    
    // Check if abc2midi is installed
    try {
      await execa('which', ['abc2midi']);
    } catch (error) {
      throw new Error('abc2midi not found. Please install abcmidi package.');
    }
    
    // Read the ABC file
    const abcContent = fs.readFileSync(inputPath, 'utf-8');
    
    // Validate the ABC content
    const validation = validateAbcNotation(abcContent);
    
    // If there are issues, fix the file first
    if (!validation.isValid) {
      console.warn(`⚠️ WARNING: ABC notation validation issues found in ${inputPath}:`);
      validation.issues.forEach(issue => console.warn(`  - ${issue}`));
      console.warn(`Auto-fixing issues before conversion...`);
      
      // Create a temporary file with the fixed content
      const fixedContent = validation.fixedNotation;
      const tempPath = inputPath + '.fixed.abc';
      fs.writeFileSync(tempPath, fixedContent);
      
      // Convert the fixed file
      await execa('abc2midi', [tempPath, '-o', outputPath, '-silent']);
      
      // Optionally clean up the temp file
      fs.unlinkSync(tempPath);
      
      console.log(`Converted fixed version of ${inputPath} to ${outputPath}`);
      return;
    }
    
    // If no issues, convert the original file
    await execa('abc2midi', [inputPath, '-o', outputPath, '-silent']);
    
    console.log(`Converted ${inputPath} to ${outputPath}`);
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to MIDI: ${error.message}`);
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
  
  convertToMidi(options)
    .then(files => {
      console.log(`Converted ${files.length} file(s) to MIDI`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}