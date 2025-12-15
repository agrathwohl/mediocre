import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';
import { config } from '../utils/config.js';
import { validateAbcNotation, cleanAbcNotation } from '../utils/claude.js';
import { extractAbcVoices, createSingleVoiceAbc } from '../utils/abc-voice-parser.js';
import { getStemDirectories, ensureStemDirectories, createStemFileName } from '../utils/stem-paths.js';
import { fixABCContent } from '../utils/abc-fixer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Convert ABC notation files to MIDI
 * @param {Object} options - Command options
 * @param {string} [options.input] - Input ABC file
 * @param {string} [options.directory] - Input directory with ABC files
 * @param {string} [options.output] - Output directory
 * @param {boolean} [options.stems] - Whether to create separate MIDI files for each track/voice
 * @returns {Promise<string[]>} Array of generated MIDI file paths
 */
export async function convertToMidi(options) {
  const outputDir = options.output || config.get('outputDir');
  const generatedFiles = [];
  const exportStems = options.stems === true;
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Process a single file if provided
  if (options.input && fs.existsSync(options.input)) {
    const outputPath = path.join(outputDir, path.basename(options.input, '.abc') + '.mid');
    
    if (exportStems) {
      const stemFiles = await convertFileWithStems(options.input, outputPath);
      generatedFiles.push(...stemFiles);
    } else {
      await convertFile(options.input, outputPath);
      generatedFiles.push(outputPath);
    }
  }
  
  // Process all files in a directory if provided
  if (options.directory && fs.existsSync(options.directory)) {
    const files = fs.readdirSync(options.directory);
    
    for (const file of files) {
      if (file.endsWith('.abc')) {
        const inputPath = path.join(options.directory, file);
        const outputPath = path.join(outputDir, path.basename(file, '.abc') + '.mid');
        
        try {
          if (exportStems) {
            const stemFiles = await convertFileWithStems(inputPath, outputPath);
            generatedFiles.push(...stemFiles);
          } else {
            await convertFile(inputPath, outputPath);
            generatedFiles.push(outputPath);
          }
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
    
    // Always apply fixes to prevent segfaults (even if validation passes)
    console.log(`🔧 Applying ABC fixes to prevent segfaults...`);

    // Apply both validation fixes and structural fixes
    let fixedContent = validation.isValid ? abcContent : validation.fixedNotation;

    fixedContent = fixABCContent(fixedContent); // Apply structural fixes from abc-fixer

    // Create a temporary file with the fixed content
    const tempPath = inputPath + '.fixed.abc';
    fs.writeFileSync(tempPath, fixedContent);

    // Convert the fixed file
    try {
      await execa('abc2midi', [tempPath, '-o', outputPath]);
      // Clean up the temp file
      fs.unlinkSync(tempPath);

      console.log(`✅ Successfully converted ${inputPath} to ${outputPath}`);
    } catch (convertError) {
      // Keep temp file for debugging on failure
      console.error(`⚠️ Keeping temp file for debugging: ${tempPath}`);
      throw new Error(`Failed to convert ${inputPath} to MIDI: ${convertError.message}`);
    }
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to MIDI: ${error.message}`);
  }
}

/**
 * Convert an ABC file to multiple MIDI files, one per voice/track
 * @param {string} inputPath - Input ABC file path
 * @param {string} baseOutputPath - Base output MIDI file path
 * @returns {Promise<string[]>} Array of generated stem file paths
 */
async function convertFileWithStems(inputPath, baseOutputPath) {
  try {
    console.log(`Converting ${inputPath} to individual track MIDI files...`);
    
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
    const contentToUse = validation.isValid ? abcContent : validation.fixedNotation;
    
    if (!validation.isValid) {
      console.warn(`⚠️ WARNING: ABC notation validation issues found in ${inputPath}:`);
      validation.issues.forEach(issue => console.warn(`  - ${issue}`));
      console.warn(`Auto-fixing issues before conversion...`);
    }
    
    // Extract voice/track information
    const voices = extractAbcVoices(contentToUse);
    console.log(`Found ${voices.length} voices/tracks in ${inputPath}`);
    
    // Also create the full mix as the main file
    await convertFile(inputPath, baseOutputPath);

    // Create stem directories
    const { stemDir, fileSpecificStemDir, baseFileName } = getStemDirectories(baseOutputPath, 'mid');
    ensureStemDirectories(stemDir, fileSpecificStemDir);

    // Generate MIDI files for each voice
    const generatedStems = [baseOutputPath]; // Include the full mix

    console.log(`Generating ${voices.length} MIDI stems...`);
    for (let i = 0; i < voices.length; i++) {
      const voice = voices[i];

      try {
        // Create stem file path
        const stemFileName = createStemFileName(baseFileName, voice.name, voice.voice, 'mid');
        const stemFilePath = path.join(fileSpecificStemDir, stemFileName);

        console.log(`[${i + 1}/${voices.length}] Generating MIDI stem for voice ${voice.voice} (${voice.name})...`);

        // Create a temporary single-voice ABC file
        const singleVoiceAbc = createSingleVoiceAbc(contentToUse, voice.voice);
        const tempAbcPath = path.join(fileSpecificStemDir, `temp_${voice.voice}.abc`);
        fs.writeFileSync(tempAbcPath, singleVoiceAbc);

        // Convert the single-voice ABC to MIDI
        await execa('abc2midi', [tempAbcPath, '-o', stemFilePath, '-silent']);

        // Cleanup temporary file
        fs.unlinkSync(tempAbcPath);

        generatedStems.push(stemFilePath);
        console.log(`Generated stem MIDI file: ${stemFilePath}`);
      } catch (error) {
        console.error(`Warning: Failed to generate MIDI stem for voice ${voice.voice}: ${error.message}`);
        // Continue processing other voices
      }
    }
    
    return generatedStems;
  } catch (error) {
    throw new Error(`Failed to convert ${inputPath} to MIDI stems: ${error.message}`);
  }
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    input: args[0],
    directory: args[1],
    output: args[2] || config.get('outputDir'),
    stems: args.includes('--stems')
  };
  
  convertToMidi(options)
    .then(files => {
      console.log(`Converted ${files.length} file(s) to MIDI`);
      if (options.stems) {
        console.log('Stems have been created in the stems/ directory');
      }
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}