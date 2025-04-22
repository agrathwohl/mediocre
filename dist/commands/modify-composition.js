import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { modifyCompositionWithClaude, generateDescription, validateAbcNotation, cleanAbcNotation } from '../utils/claude.js';
import { getMusicPieceInfo } from '../utils/dataset-utils.js';
import { config } from '../utils/config.js';
import { extractInstruments } from './generate-abc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Modify an existing composition according to user instructions
 * @param {Object} options - Command options
 * @param {string} options.filename - Filename or base filename of the composition to modify
 * @param {string} options.instructions - Instructions for modifying the composition
 * @param {string} [options.directory] - Directory containing the original composition
 * @param {string} [options.output] - Output directory for the modified composition
 * @returns {Promise<string>} Path to the modified composition file
 */
export async function modifyComposition(options) {
  const directory = options.directory || config.get('outputDir');
  const outputDir = options.output || directory;
  const filename = options.filename;
  const instructions = options.instructions;
  
  if (!filename) {
    throw new Error('Filename is required');
  }
  
  if (!instructions) {
    throw new Error('Modification instructions are required');
  }
  
  console.log(`Loading composition "${filename}"...`);
  
  // Get the original composition
  const originalPiece = getMusicPieceInfo(filename, directory);
  
  if (!originalPiece.files || !originalPiece.files.abc) {
    throw new Error(`Could not find ABC notation for "${filename}"`);
  }
  
  const originalAbc = originalPiece.files.abc.content;
  const genre = originalPiece.genre || 'Unknown';
  
  // Parse the hybrid genre if applicable
  const genreComponents = genre.split('_x_');
  const classicalGenre = genreComponents.length === 2 ? genreComponents[0] : 'Classical';
  const modernGenre = genreComponents.length === 2 ? genreComponents[1] : 'Contemporary';
  
  console.log(`Modifying ${genre} composition...`);
  console.log(`Applying instructions: "${instructions}"`);
  
  // Generate the modified composition
  let modifiedAbc = await modifyCompositionWithClaude({
    abcNotation: originalAbc,
    instructions,
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
  const validation = validateAbcNotation(modifiedAbc);
  
  // If there are issues, log and use the fixed version
  if (!validation.isValid) {
    console.warn(`⚠️ WARNING: ABC notation validation issues found:`);
    validation.issues.forEach(issue => console.warn(`  - ${issue}`));
    console.warn(`Auto-fixing ${validation.issues.length} issues...`);
    modifiedAbc = validation.fixedNotation;
  } else {
    console.log(`✅ ABC notation validation passed`);
  }
  
  // Extract the instruments used in the modified composition
  const instruments = extractInstruments(modifiedAbc);
  const instrumentString = instruments.length > 0 
    ? instruments.join(', ') 
    : 'Default Instrument';
  
  console.log(`Using instruments: ${instrumentString}`);
  
  // Generate a filename for the modified composition
  const timestamp = Date.now();
  const modifiedFilename = `${genre}-modified-${timestamp}`;
  
  // Save the modified ABC notation to a file
  const abcFilePath = path.join(outputDir, `${modifiedFilename}.abc`);
  fs.writeFileSync(abcFilePath, modifiedAbc);
  
  // Generate and save the description for the modified composition
  console.log('Generating description document...');
  const description = await generateDescription({
    abcNotation: modifiedAbc,
    genre,
    classicalGenre,
    modernGenre
  });
  
  // Save the description as JSON
  const descriptionFilePath = path.join(outputDir, `${modifiedFilename}_description.json`);
  fs.writeFileSync(descriptionFilePath, JSON.stringify(description, null, 2));
  
  // Create a markdown file with both the ABC notation, modification instructions, and description
  const mdContent = `# Modified ${genre} Composition

## Original Composition
- Base: ${originalPiece.baseFilename}

## Modification Instructions
${instructions}

## Instruments
${instrumentString}

## ABC Notation

\`\`\`
${modifiedAbc}
\`\`\`

## Analysis

${description.analysis}
`;
  const mdFilePath = path.join(outputDir, `${modifiedFilename}.md`);
  fs.writeFileSync(mdFilePath, mdContent);
  
  console.log(`Successfully modified composition: ${abcFilePath}`);
  
  return abcFilePath;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    filename: args[0],
    instructions: args[1],
    directory: args[2] || config.get('outputDir'),
    output: args[3] || config.get('outputDir')
  };
  
  modifyComposition(options)
    .then(file => {
      console.log(`Modified composition saved to: ${file}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}