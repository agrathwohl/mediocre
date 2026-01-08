import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { addLyricsWithClaude, validateAbcNotation, cleanAbcNotation } from '../utils/claude.js';
import { config } from '../utils/config.js';
import { extractInstruments } from './generate-abc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Add lyrics to an existing MIDI file via ABC notation
 * @param {Object} options - Command options
 * @param {string} options.midiFile - Path to MIDI file to add lyrics to
 * @param {string} options.abcFile - Direct file path to ABC notation file
 * @param {string} options.lyricsPrompt - Prompt describing what the lyrics should be about
 * @param {string} [options.output] - Output directory for the file with lyrics
 * @returns {Promise<string>} Path to the ABC file with lyrics
 */
export async function generateLyrics(options) {
  const outputDir = options.output || config.get('outputDir');
  const midiFile = options.midiFile;
  const abcFile = options.abcFile;
  const lyricsPrompt = options.lyricsPrompt;
  
  if (!midiFile) {
    throw new Error('MIDI file path is required');
  }
  
  if (!abcFile) {
    throw new Error('ABC file path is required');
  }
  
  if (!lyricsPrompt) {
    throw new Error('Lyrics prompt is required');
  }
  
  if (!fs.existsSync(abcFile)) {
    throw new Error(`ABC file not found: ${abcFile}`);
  }
  
  if (!abcFile.endsWith('.abc')) {
    throw new Error(`File is not an ABC notation file: ${abcFile}`);
  }
  
  console.log(`Adding lyrics to "${midiFile}" using ABC from "${abcFile}"...`);
  
  // Read the ABC content directly
  let originalAbc = fs.readFileSync(abcFile, 'utf8');
  let baseFilename = path.basename(abcFile, '.abc');
  
  if (!originalAbc) {
    throw new Error('Could not read ABC notation from file');
  }
  
  console.log(`Generating lyrics based on prompt: "${lyricsPrompt}"`);
  
  // Extract genre information if possible
  let genre = 'Unknown';
  
  // Try to find associated description file
  const descPath = path.join(path.dirname(abcFile), `${baseFilename}_description.json`);
  if (fs.existsSync(descPath)) {
    try {
      const descContent = JSON.parse(fs.readFileSync(descPath, 'utf8'));
      if (descContent.genre) {
        genre = descContent.genre;
      }
    } catch (descError) {
      console.warn(`Warning: Error reading description file: ${descError.message}`);
    }
  }
  
  // If no genre from description, try to extract from filename
  if (genre === 'Unknown' && baseFilename.toLowerCase().includes('_x_')) {
    genre = baseFilename.split('-score')[0];
  }
  
  // Parse the hybrid genre if applicable
  const genreComponents = genre.split('_x_');
  const classicalGenre = genreComponents.length === 2 ? genreComponents[0] : 'Classical';
  const modernGenre = genreComponents.length === 2 ? genreComponents[1] : 'Contemporary';
  
  // Generate lyrics and apply them to the ABC notation
  let abcWithLyrics = await addLyricsWithClaude({
    abcNotation: originalAbc,
    lyricsPrompt,
    genre,
    classicalGenre,
    modernGenre,
    temperature: 0.7,
    solo: options.solo || false,
    recordLabel: options.recordLabel || '',
    producer: options.producer || '',
    instruments: options.instruments || ''
  });


  // Validate the ABC notation
  const validation = validateAbcNotation(abcWithLyrics);
  
  // If there are issues, log and use the fixed version
  let finalAbc = abcWithLyrics;
  if (!validation.isValid) {
    console.warn(`⚠️ WARNING: ABC notation validation issues found:`);
    validation.issues.forEach(issue => console.warn(`  - ${issue}`));
    console.warn(`Auto-fixing ${validation.issues.length} issues...`);
    finalAbc = validation.fixedNotation;
  } else {
    console.log(`✅ ABC notation validation passed`);
  }
  
  // Extract the instruments used in the composition
  const instruments = extractInstruments(finalAbc);
  const instrumentString = instruments.length > 0 
    ? instruments.join(', ') 
    : 'Default Instrument';
  
  console.log(`Using instruments: ${instrumentString}`);
  
  // Generate a filename for the lyrics file
  const timestamp = Date.now();
  const lyricsFilename = `${baseFilename}-lyrics-${timestamp}`;
  
  // Save the ABC notation with lyrics to a file
  const abcFilePath = path.join(outputDir, `${lyricsFilename}.abc`);
  fs.writeFileSync(abcFilePath, finalAbc);
  
  // Create a markdown file with the ABC notation and lyrics instructions
  const mdContent = `# Lyrics Added to Composition: ${baseFilename}

## Original MIDI File
${midiFile}

## Lyrics Prompt
${lyricsPrompt}

## Instruments
${instrumentString}

## ABC Notation with Lyrics

\`\`\`
${finalAbc}
\`\`\``;
  const mdFilePath = path.join(outputDir, `${lyricsFilename}.md`);
  fs.writeFileSync(mdFilePath, mdContent);
  
  console.log(`Successfully added lyrics to composition: ${abcFilePath}`);
  
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
      console.log('Convert to PDF to see the score with lyrics using:');
      console.log(`mediocre convert --input ${file} --to pdf`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}