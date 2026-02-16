import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { modifyMusicXmlComposition, generateMusicXmlDescription, validateMusicXml } from '../utils/claude.js';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Modify an existing MusicXML composition according to user instructions
 * @param {Object} options - Command options
 * @param {string} options.mxmlFile - Direct file path to MusicXML notation file
 * @param {string} options.instructions - Instructions for modifying the composition
 * @param {string} [options.output] - Output directory for the modified composition
 * @returns {Promise<string>} Path to the modified composition file
 */
export async function modifyMxmlComposition(options) {
  const outputDir = options.output || config.get('outputDir');
  const mxmlFile = options.mxmlFile;
  const instructions = options.instructions;

  if (!mxmlFile) {
    throw new Error('MusicXML file path is required');
  }

  if (!instructions) {
    throw new Error('Modification instructions are required');
  }

  if (!fs.existsSync(mxmlFile)) {
    throw new Error(`MusicXML file not found: ${mxmlFile}`);
  }

  if (!mxmlFile.endsWith('.musicxml') && !mxmlFile.endsWith('.xml')) {
    throw new Error(`File is not a MusicXML notation file: ${mxmlFile}`);
  }

  console.log(`Loading composition "${mxmlFile}"...`);

  // Read the MusicXML content directly
  const originalMxml = fs.readFileSync(mxmlFile, 'utf8');

  // Get the base filename without extension
  const baseFilename = path.basename(mxmlFile, path.extname(mxmlFile));

  // Try to find associated description file
  let genre = 'Unknown';
  let classicalGenre = 'Classical';
  let modernGenre = 'Contemporary';

  // Look for genre in description file if it exists
  const descPath = path.join(path.dirname(mxmlFile), `${baseFilename}_description.json`);
  if (fs.existsSync(descPath)) {
    try {
      const descContent = JSON.parse(fs.readFileSync(descPath, 'utf8'));
      if (descContent.genre) {
        genre = descContent.genre;
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

  console.log(`Modifying ${genre} composition...`);
  console.log(`Applying instructions: "${instructions}"`);

  // Generate the modified composition
  let modifiedMxml = await modifyMusicXmlComposition({
    musicXml: originalMxml,
    instructions,
    genre,
    classicalGenre,
    modernGenre,
    temperature: 0.7,
    solo: options.solo || false,
    recordLabel: options.recordLabel || '',
    producer: options.producer || '',
    instruments: options.instruments || '',
    useStreaming: options.useStreaming || false
  });

  // Validate the MusicXML notation
  const validation = validateMusicXml(modifiedMxml);

  // If validation fails, ABORT - do not save broken files
  if (!validation.isValid) {
    console.error(`❌ ERROR: MusicXML validation FAILED:`);
    validation.issues.forEach(issue => console.error(`  - ${issue}`));
    throw new Error('Modified MusicXML failed validation - refusing to save broken file');
  }

  console.log(`✅ MusicXML validation passed`);

  // Generate a filename for the modified composition
  const timestamp = Date.now();
  const modifiedFilename = `${genre}-modified-${timestamp}`;

  // Save the modified MusicXML notation to a file
  const mxmlFilePath = path.join(outputDir, `${modifiedFilename}.musicxml`);
  fs.writeFileSync(mxmlFilePath, modifiedMxml);

  // Generate and save the description for the modified composition
  console.log('Generating description document...');
  const description = await generateMusicXmlDescription({
    musicXml: modifiedMxml,
    genre,
    classicalGenre,
    modernGenre
  });

  // Save the description as JSON
  const descriptionFilePath = path.join(outputDir, `${modifiedFilename}_description.json`);
  fs.writeFileSync(descriptionFilePath, JSON.stringify(description, null, 2));

  // Create a markdown file
  const instrumentString = description.instruments?.length > 0
    ? description.instruments.join(', ')
    : 'Default Instruments';

  const mdContent = `# Modified ${genre} Composition

## Original Composition
- Source: ${mxmlFile}

## Modification Instructions
${instructions}

## Genre Fusion
- Classical Element: ${classicalGenre}
- Modern Element: ${modernGenre}

## Instruments
${instrumentString}

## Musical Details
- Tempo: ${description.tempo || 'Not specified'}
- Time Signature: ${description.timeSignature || 'Not specified'}
- Key Signature: ${description.keySignature || 'Not specified'}
- Measures: ${description.measures || 'Unknown'}

## MusicXML File
\`${modifiedFilename}.musicxml\`

## Analysis

${description.analysis}`;

  const mdFilePath = path.join(outputDir, `${modifiedFilename}.md`);
  fs.writeFileSync(mdFilePath, mdContent);

  console.log(`Modified composition saved to ${mxmlFilePath}`);

  return mxmlFilePath;
}
