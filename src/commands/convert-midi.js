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

/**
 * Extract track/voice information from ABC notation
 * @param {string} abcContent - ABC notation content
 * @returns {Array<{voice: string, name: string}>} Array of track objects
 */
function extractAbcVoices(abcContent) {
  const voices = [];
  const voicesSet = new Set(); // Track unique voice IDs

  // Split content into header and body
  const headerEndMatch = abcContent.match(/^K:.+$/m);
  if (!headerEndMatch) {
    // If no key signature found, process entire content as header
    return [{
      voice: '1',
      name: 'Default Voice'
    }];
  }

  const headerEndPos = headerEndMatch.index + headerEndMatch[0].length;
  const header = abcContent.substring(0, headerEndPos + 1);

  // Match voice definitions in header section only
  // V:id [name=...] [clef=...] etc.
  const voiceRegex = /^V:\s*([^\s\]]+)(?:\s+(.+?))?$/gm;
  let match;

  while ((match = voiceRegex.exec(header)) !== null) {
    const voiceId = match[1];

    // Skip if we've already seen this voice ID
    if (voicesSet.has(voiceId)) continue;
    voicesSet.add(voiceId);

    // Parse voice attributes from the rest of the line
    let voiceName = `Voice ${voiceId}`;
    if (match[2]) {
      // Look for name="..." or name=...
      const nameMatch = match[2].match(/name=["']?([^"'\s]+)["']?/);
      if (nameMatch) {
        voiceName = nameMatch[1];
      } else {
        // Use the whole remaining text as name if no specific name attribute
        voiceName = match[2].trim();
      }
    }

    voices.push({
      voice: voiceId,
      name: voiceName
    });
  }

  // If no explicit voices found, create a default one
  if (voices.length === 0) {
    voices.push({
      voice: '1',
      name: 'Default Voice'
    });
  }

  return voices;
}

/**
 * Create a single-voice ABC file from a multi-voice ABC file
 * @param {string} originalContent - Original ABC notation content
 * @param {string} voiceId - Voice ID to extract
 * @returns {string} ABC notation with only the specified voice
 */
function createSingleVoiceAbc(originalContent, voiceId) {
  // Split the content into header and body sections
  const headerEndMatch = originalContent.match(/^K:.+$/m);
  if (!headerEndMatch) {
    throw new Error('Invalid ABC format: No key signature (K:) found');
  }
  
  const headerEndPos = headerEndMatch.index + headerEndMatch[0].length;
  const header = originalContent.substring(0, headerEndPos + 1);
  const body = originalContent.substring(headerEndPos + 1);
  
  // Extract all voice definitions for reference
  const allVoices = extractAbcVoices(originalContent);
  const targetVoice = allVoices.find(v => v.voice === voiceId);
  
  if (!targetVoice) {
    throw new Error(`Voice ${voiceId} not found in ABC content`);
  }
  
  // Keep the header and filter the body to only include the target voice
  let filteredContent = header;
  
  // Add the target voice definition if it exists
  const voiceDefRegex = new RegExp(`^V:\\s*${voiceId}(?:\\s+.+)?$`, 'm');
  const voiceDefMatch = originalContent.match(voiceDefRegex);
  if (voiceDefMatch) {
    filteredContent += '\n' + voiceDefMatch[0];
  }
  
  // Process the body line by line
  const lines = body.split('\n');
  let currentVoice = null;
  let includeSection = allVoices.length === 1; // If only one voice, include all content
  
  for (const line of lines) {
    // Check for voice change
    const voiceMatch = line.match(/^V:\s*(\S+)/);
    if (voiceMatch) {
      currentVoice = voiceMatch[1];
      includeSection = (currentVoice === voiceId);
      
      // Don't add voice change lines in single-voice output
      continue;
    }
    
    // Add line if it belongs to our target voice or is a structural element
    if (includeSection || line.match(/^[:%|]/)) {
      filteredContent += '\n' + line;
    }
  }
  
  return filteredContent;
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
    
    // Create a stems directory
    const stemDir = path.join(path.dirname(baseOutputPath), 'stems');
    if (!fs.existsSync(stemDir)) {
      fs.mkdirSync(stemDir, { recursive: true });
    }
    
    // Create a subdirectory for this specific ABC file's stems
    const baseFileName = path.basename(baseOutputPath, '.mid');
    const fileSpecificStemDir = path.join(stemDir, baseFileName);
    if (!fs.existsSync(fileSpecificStemDir)) {
      fs.mkdirSync(fileSpecificStemDir, { recursive: true });
    }
    
    // Generate MIDI files for each voice
    const generatedStems = [baseOutputPath]; // Include the full mix
    
    for (const voice of voices) {
      // Sanitize voice name for file system
      const sanitizedName = voice.name
        .replace(/[^\w\s-]/g, '')  // Remove non-alphanumeric characters except space and dash
        .replace(/\s+/g, '_')      // Replace spaces with underscores
        .toLowerCase();
      
      // Create stem file paths
      const stemFileName = `${baseFileName}_${sanitizedName}_voice${voice.voice}.mid`;
      const stemFilePath = path.join(fileSpecificStemDir, stemFileName);
      
      console.log(`Generating MIDI stem for voice ${voice.voice} (${voice.name})...`);
      
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