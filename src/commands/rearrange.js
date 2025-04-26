import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../utils/config.js';
import { modifyCompositionWithClaude, validateAbcNotation } from '../utils/claude.js';
import { extractInstruments } from './generate-abc.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Rearrange an existing ABC composition with new instrumentation
 * @param {Object} options - Command options
 * @param {string} options.abcFile - Direct file path to ABC notation file
 * @param {string} [options.instruments] - Comma-separated list of instruments for the new arrangement
 * @param {string} [options.style] - Arrangement style (e.g., "orchestral", "chamber", "jazz", "electronic")
 * @param {string} [options.output] - Output directory for the rearranged composition
 * @returns {Promise<string>} Path to the rearranged composition file
 */
export async function rearrangeComposition(options) {
  const outputDir = options.output || config.get('outputDir');
  const abcFile = options.abcFile;
  const instruments = options.instruments || '';
  const style = options.style || 'standard';
  
  if (!abcFile) {
    throw new Error('ABC file path is required');
  }
  
  if (!fs.existsSync(abcFile)) {
    throw new Error(`ABC file not found: ${abcFile}`);
  }
  
  if (!abcFile.endsWith('.abc')) {
    throw new Error(`File is not an ABC notation file: ${abcFile}`);
  }
  
  console.log(`Loading composition "${abcFile}"...`);
  
  // Read the ABC content directly
  const originalAbc = fs.readFileSync(abcFile, 'utf8');
  
  // Get the base filename without extension
  const baseFilename = path.basename(abcFile, '.abc');
  
  // Try to find associated description file for genre info
  let genre = 'Unknown';
  let classicalGenre = 'Classical';
  let modernGenre = 'Contemporary';
  
  // Look for genre in description file if it exists
  const descPath = path.join(path.dirname(abcFile), `${baseFilename}_description.json`);
  if (fs.existsSync(descPath)) {
    try {
      const descContent = JSON.parse(fs.readFileSync(descPath, 'utf8'));
      if (descContent.genre) {
        genre = descContent.genre;
        // Parse the hybrid genre if applicable
        const genreComponents = genre.split('_x_');
        classicalGenre = genreComponents.length === 2 ? genreComponents[0] : 'Classical';
        modernGenre = genreComponents.length === 2 ? genreComponents[1] : 'Contemporary';
      }
    } catch (descError) {
      console.warn(`Warning: Error reading description file: ${descError.message}`);
    }
  }
  
  // If no genre from description, try to extract from filename
  if (genre === 'Unknown' && baseFilename.toLowerCase().includes('_x_')) {
    genre = baseFilename.split('-score')[0];
    const genreComponents = genre.split('_x_');
    classicalGenre = genreComponents.length === 2 ? genreComponents[0] : 'Classical';
    modernGenre = genreComponents.length === 2 ? genreComponents[1] : 'Contemporary';
  }
  
  console.log(`Rearranging ${genre} composition...`);
  
  // Build the rearrangement instructions
  let instructions = `Create a new arrangement of this composition with ${style} instrumentation`;
  if (instruments) {
    instructions += ` using these instruments: ${instruments}`;
  }
  instructions += `. Keep the melodic and harmonic content intact, but modify the orchestration, voicing, and texture.`;
  
  console.log(`Applying instructions: "${instructions}"`);
  
  // Generate the rearranged composition
  let rearrangedAbc = await modifyCompositionWithClaude({
    abcNotation: originalAbc,
    instructions,
    genre,
    classicalGenre,
    modernGenre,
    temperature: 0.7,
    instruments: options.instruments || ''
  });
  
  // Validate the ABC notation
  const validation = validateAbcNotation(rearrangedAbc);
  
  // If there are issues, log and use the fixed version
  if (!validation.isValid) {
    console.warn(`⚠️ WARNING: ABC notation validation issues found:`);
    validation.issues.forEach(issue => console.warn(`  - ${issue}`));
    console.warn(`Auto-fixing ${validation.issues.length} issues...`);
    rearrangedAbc = validation.fixedNotation;
  } else {
    console.log(`✅ ABC notation validation passed`);
  }
  
  // Extract the instruments used in the rearranged composition
  const usedInstruments = extractInstruments(rearrangedAbc);
  const instrumentString = usedInstruments.length > 0 
    ? usedInstruments.join(', ') 
    : 'Default Instrument';
  
  console.log(`Using instruments: ${instrumentString}`);
  
  // Generate a filename for the rearranged composition
  const timestamp = Date.now();
  const arrangeStyle = style !== 'standard' ? `-${style}` : '';
  const rearrangedFilename = `${genre}-rearranged${arrangeStyle}-${timestamp}`;
  
  // Save the rearranged ABC notation to a file
  const abcFilePath = path.join(outputDir, `${rearrangedFilename}.abc`);
  fs.writeFileSync(abcFilePath, rearrangedAbc);
  
  // Create a markdown file with both the original and rearranged ABC notation
  const mdContent = `# Rearranged ${genre} Composition

## Original Composition
- Source: ${abcFile}

## Rearrangement Instructions
${instructions}

## Style
${style}

## Instruments
${instrumentString}

## ABC Notation

\`\`\`
${rearrangedAbc}
\`\`\`
`;
  const mdFilePath = path.join(outputDir, `${rearrangedFilename}.md`);
  fs.writeFileSync(mdFilePath, mdContent);
  
  console.log(`Successfully rearranged composition: ${abcFilePath}`);
  
  return abcFilePath;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    abcFile: args[0],
    instruments: args[1],
    style: args[2] || 'standard',
    output: args[3] || config.get('outputDir')
  };
  
  rearrangeComposition(options)
    .then(file => {
      console.log(`Rearranged composition saved to: ${file}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}