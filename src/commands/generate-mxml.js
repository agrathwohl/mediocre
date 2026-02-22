import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  generateMusicXmlWithClaude,
  generateMusicXmlDescription,
  validateMusicXml
} from '../utils/claude.js';
import { generateCreativeGenreName } from '../utils/genre-generator.js';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse hybrid genre name into components
 * @param {string} genreName - Hybrid genre name (format: Classical_x_Modern)
 * @returns {Object} Object with classical and modern components
 */
function parseHybridGenre(genreName) {
  // Default components
  const components = {
    classical: 'Classical',
    modern: 'Contemporary'
  };

  // Check if follows the hybrid format
  const parts = genreName.toLowerCase().split('_x_');

  if (parts.length === 2) {
    // Preserve original case for display, but match case-insensitive
    const lowerGenreName = genreName.toLowerCase();
    const splitIndex = lowerGenreName.indexOf('_x_');
    components.classical = genreName.substring(0, splitIndex);
    components.modern = genreName.substring(splitIndex + 3);
  }

  return components;
}

/**
 * Sanitize a string for safe use in filenames.
 * @param {string} str - String to sanitize
 * @returns {string} Filename-safe string
 */
function sanitizeForFilename(str) {
  return str
    .replace(/[^a-zA-Z0-9_\-. ]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_{2,}/g, '_');
}

/**
 * Generate MusicXML notation files using Claude
 * @param {Object} options - Command options
 * @param {string} [options.genre] - Music genre (hybrid format preferred: Classical_x_Modern)
 * @param {string} [options.style] - Music style
 * @param {number} [options.count=1] - Number of compositions to generate
 * @param {string} [options.output] - Output directory
 * @param {string} [options.systemPrompt] - Custom system prompt for Claude
 * @param {string} [options.userPrompt] - Custom user prompt for Claude
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output MusicXML must include
 * @returns {Promise<string[]>} Array of generated file paths
 */
export async function generateMxml(options) {
  const count = parseInt(options.count || '1', 10);
  const genre = options.genre || 'Classical_x_Contemporary';
  const style = options.style || 'standard';
  const outputDir = options.output || config.get('outputDir');
  const customSystemPrompt = options.systemPrompt;
  const customUserPrompt = options.userPrompt;
  const useCreativeNames = options.creativeNames === true;
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';
  // Parse the hybrid genre
  const genreComponents = parseHybridGenre(genre);

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Verify the output directory is writable
  try {
    fs.accessSync(outputDir, fs.constants.W_OK);
  } catch {
    throw new Error(`Output directory is not writable: ${outputDir}`);
  }

  const generatedFiles = [];

  for (let i = 0; i < count; i++) {
    // Generate a timestamp
    const timestamp = Date.now();

    try {
      // Generate a creative genre name if requested
      let displayGenre = genre;
      let creativeGenreName = null;

      if (useCreativeNames) {
        console.log('EXPERIMENTAL FEATURE: Generating creative genre name...');
        console.log('WARNING: Creative genre names may produce unpredictable results');
        try {
          const creativeResult = await generateCreativeGenreName({
            classicalGenre: genreComponents.classical,
            modernGenre: genreComponents.modern,
            temperature: 0.9
          });

          creativeGenreName = creativeResult.creativeName;
          console.log(`Generated creative genre name: ${creativeGenreName}`);

          // Use the creative name in the filename but keep the original genres internally
          displayGenre = creativeGenreName;
        } catch (error) {
          console.error('Error generating creative genre name:', error.message);
          // Fall back to standard genre format if creative name generation fails
        }
      }

      // Generate a filename based on genre and style
      const filename = `${sanitizeForFilename(displayGenre)}-score${i+1}-${timestamp}`;

      // Generate the MusicXML notation
      console.log(`Generating ${displayGenre} composition in ${style} style...`);
      console.log(`Fusing ${genreComponents.classical} with ${genreComponents.modern}...`);

      // Log if using a custom system prompt
      if (customSystemPrompt) {
        console.log('Using custom system prompt...');
      }

      const musicXml = await generateMusicXmlWithClaude({
        genre: creativeGenreName || genre,
        classicalGenre: genreComponents.classical,
        modernGenre: genreComponents.modern,
        style,
        temperature: 0.7,
        customSystemPrompt,
        customUserPrompt,
        solo: includeSolo,
        recordLabel: recordLabel,
        producer: producer,
        instruments: requestedInstruments,
        useStreaming: options.useStreaming || false
      });

      // Validate the MusicXML notation
      const validation = validateMusicXml(musicXml);

      // If validation fails, ABORT - do not save broken files
      if (!validation.isValid) {
        console.error(`❌ ERROR: MusicXML validation FAILED for ${filename}.musicxml:`);
        validation.issues.forEach(issue => console.error(`  - ${issue}`));
        console.error(`❌ Skipping this composition - will not save broken file`);
        continue; // Skip to next iteration
      }

      console.log(`✅ MusicXML validation passed for ${filename}.musicxml`);

      // Save the MusicXML notation to a file
      const mxmlFilePath = path.join(outputDir, `${filename}.musicxml`);
      fs.writeFileSync(mxmlFilePath, musicXml);
      generatedFiles.push(mxmlFilePath);

      // Only generate description documents if MusicXML validation passed
      if (validation.isValid) {
        // Generate and save the description
        console.log('Generating description document...');
        const description = await generateMusicXmlDescription({
          musicXml,
          genre: creativeGenreName || genre,
          classicalGenre: genreComponents.classical,
          modernGenre: genreComponents.modern,
          style
        });

        // Add creative genre name to the description if one was generated
        if (creativeGenreName) {
          description.creativeGenreName = creativeGenreName;
        }

        // Save the description as JSON
        const descriptionFilePath = path.join(outputDir, `${filename}_description.json`);
        fs.writeFileSync(descriptionFilePath, JSON.stringify(description, null, 2));

        // Create a markdown file with both the MusicXML notation and description
        const instrumentString = description.instruments?.length > 0
          ? description.instruments.join(', ')
          : 'Default Instruments';

        const mdContent = `# ${creativeGenreName || genre} Composition in ${style} Style

## Genre Fusion${creativeGenreName ? `\n- Creative Genre Name: "${creativeGenreName}"` : ''}
- Classical Element: ${genreComponents.classical}
- Modern Element: ${genreComponents.modern}

## Instruments
${instrumentString}

## Musical Details
- Tempo: ${description.tempo || 'Not specified'}
- Time Signature: ${description.timeSignature || 'Not specified'}
- Key Signature: ${description.keySignature || 'Not specified'}
- Measures: ${description.measures || 'Unknown'}

## MusicXML File
\`${filename}.musicxml\`

## Analysis

${description.analysis}`;
        const mdFilePath = path.join(outputDir, `${filename}.md`);
        fs.writeFileSync(mdFilePath, mdContent);
      } else {
        console.log('⚠️ Skipping description document generation - MusicXML validation failed');
      }

      console.log(`Generated ${mxmlFilePath}`);
    } catch (error) {
      console.error(`Error generating composition ${i+1}:`, error);
    }
  }

  return generatedFiles;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    genre: args[0],
    style: args[1],
    count: args[2] || '1',
    output: args[3] || config.get('outputDir')
  };

  (async () => {
    try {
      const files = await generateMxml(options);
      console.log(`Generated ${files.length} composition(s)`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}
