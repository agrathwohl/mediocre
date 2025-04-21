import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { addLyricsWithClaude, validateAbcNotation, cleanAbcNotation } from '../utils/claude.js';
import { getMusicPieceInfo } from '../utils/dataset-utils.js';
import { config } from '../utils/config.js';
import { extractInstruments } from './generate-abc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Add lyrics to an existing MIDI file via ABC notation
 * @param {Object} options - Command options
 * @param {string} options.midiFile - Path to MIDI file to add lyrics to
 * @param {string} options.lyricsPrompt - Prompt describing what the lyrics should be about
 * @param {string} [options.directory] - Directory containing the original MIDI file
 * @param {string} [options.output] - Output directory for the file with lyrics
 * @returns {Promise<string>} Path to the ABC file with lyrics
 */
export async function generateLyrics(options) {
  const directory = options.directory || config.get('outputDir');
  const outputDir = options.output || directory;
  const midiFile = options.midiFile;
  const lyricsPrompt = options.lyricsPrompt;
  
  if (!midiFile) {
    throw new Error('MIDI file path is required');
  }
  
  if (!lyricsPrompt) {
    throw new Error('Lyrics prompt is required');
  }
  
  console.log(`Adding lyrics to "${midiFile}"...`);
  
  // Get the original ABC file if it exists
  let baseFilename = path.basename(midiFile, '.mid');
  let originalAbc = null;
  
  try {
    // First, try to find related ABC file directly
    const abcFilePath = path.join(directory, `${baseFilename}.abc`);
    if (fs.existsSync(abcFilePath)) {
      console.log(`Found original ABC file: ${abcFilePath}`);
      originalAbc = fs.readFileSync(abcFilePath, 'utf-8');
    } else {
      // Check if this is a combined composition with a trailing digit
      if (baseFilename.endsWith('1')) {
        const combinedAbcFilePath = path.join(directory, `${baseFilename.slice(0, -1)}.abc`);
        if (fs.existsSync(combinedAbcFilePath)) {
          console.log(`Found combined composition ABC file: ${combinedAbcFilePath}`);
          originalAbc = fs.readFileSync(combinedAbcFilePath, 'utf-8');
        }
      }
      
      // If still no ABC file, try to get the composition info
      if (!originalAbc) {
        try {
          const originalPiece = getMusicPieceInfo(baseFilename, directory);
          if (originalPiece.files && originalPiece.files.abc) {
            originalAbc = originalPiece.files.abc.content;
            console.log(`Found original ABC notation from composition info`);
          }
        } catch (error) {
          console.log(`Could not find original ABC notation using composition info: ${error.message}`);
          
          // Last attempt: search for any ABC file with a similar name (ignoring trailing digit)
          if (baseFilename.match(/\d+$/)) {
            const baseWithoutDigit = baseFilename.replace(/\d+$/, '');
            const files = fs.readdirSync(directory);
            const matchingFiles = files.filter(file => 
              file.endsWith('.abc') && file.startsWith(baseWithoutDigit)
            );
            
            if (matchingFiles.length > 0) {
              const bestMatch = matchingFiles[0]; // Take the first match
              console.log(`Found similar ABC file: ${bestMatch}`);
              originalAbc = fs.readFileSync(path.join(directory, bestMatch), 'utf-8');
            }
          }
        }
      }
    }
  } catch (error) {
    console.log(`Error finding original ABC notation: ${error.message}`);
  }
  
  if (!originalAbc) {
    throw new Error(`Could not find ABC notation for "${midiFile}". Please ensure there is a corresponding .abc file.`);
  }
  
  console.log(`Adding lyrics based on prompt: "${lyricsPrompt}"`);
  
  // Generate the ABC notation with lyrics
  let lyricsAbc = await addLyricsWithClaude({
    abcNotation: originalAbc,
    lyricsPrompt,
    temperature: 0.7,
    solo: options.solo || false,
    recordLabel: options.recordLabel || '',
    producer: options.producer || '',
    instruments: options.instruments || ''
  });
  
  // Validate the ABC notation
  const validation = validateAbcNotation(lyricsAbc);
  
  // If there are issues, log and use the fixed version
  if (!validation.isValid) {
    console.warn(`⚠️ WARNING: ABC notation validation issues found:`);
    validation.issues.forEach(issue => console.warn(`  - ${issue}`));
    console.warn(`Auto-fixing ${validation.issues.length} issues...`);
    lyricsAbc = validation.fixedNotation;
  } else {
    console.log(`✅ ABC notation validation passed`);
  }
  
  // Extract the instruments used in the composition
  const instruments = extractInstruments(lyricsAbc);
  const instrumentString = instruments.length > 0 
    ? instruments.join(', ') 
    : 'Default Instrument';
  
  console.log(`Using instruments: ${instrumentString}`);
  
  // Generate a filename for the composition with lyrics
  const timestamp = Date.now();
  const lyricsFilename = `${baseFilename}-lyrics-${timestamp}`;
  
  // Save the ABC notation with lyrics to a file
  const abcFilePath = path.join(outputDir, `${lyricsFilename}.abc`);
  fs.writeFileSync(abcFilePath, lyricsAbc);
  
  // Create a markdown file with the ABC notation and lyrics information
  const mdContent = `# Lyrics Added to Composition: ${baseFilename}

## Lyrics Prompt
${lyricsPrompt}

## Instruments
${instrumentString}

## ABC Notation with Lyrics

\`\`\`
${lyricsAbc}
\`\`\`
`;
  const mdFilePath = path.join(outputDir, `${lyricsFilename}.md`);
  fs.writeFileSync(mdFilePath, mdContent);
  
  console.log(`Successfully added lyrics: ${abcFilePath}`);
  
  return abcFilePath;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    midiFile: args[0],
    lyricsPrompt: args[1],
    directory: args[2] || config.get('outputDir'),
    output: args[3] || config.get('outputDir')
  };
  
  generateLyrics(options)
    .then(file => {
      console.log(`ABC notation with lyrics saved to: ${file}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}