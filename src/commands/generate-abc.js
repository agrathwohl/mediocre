import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateMusicWithClaude, generateDescription, cleanAbcNotation, validateAbcNotation } from '../utils/claude.js';
import { generateCreativeGenreName } from '../utils/genre-generator.js';
import { config } from '../utils/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract MIDI instrument names from ABC notation
 * @param {string} abcNotation - ABC notation
 * @returns {Array<string>} Array of instrument names
 */
export function extractInstruments(abcNotation) {
  const instruments = [];
  const programRegex = /%%MIDI\s+program\s+(?:\d+\s+)?(\d+)/g;
  let match;
  
  // General MIDI program numbers to instrument names mapping
  const gmInstruments = [
    'Acoustic Grand Piano', 'Bright Acoustic Piano', 'Electric Grand Piano', 'Honky-tonk Piano',
    'Electric Piano 1', 'Electric Piano 2', 'Harpsichord', 'Clavi',
    'Celesta', 'Glockenspiel', 'Music Box', 'Vibraphone',
    'Marimba', 'Xylophone', 'Tubular Bells', 'Dulcimer',
    'Drawbar Organ', 'Percussive Organ', 'Rock Organ', 'Church Organ',
    'Reed Organ', 'Accordion', 'Harmonica', 'Tango Accordion',
    'Acoustic Guitar (nylon)', 'Acoustic Guitar (steel)', 'Electric Guitar (jazz)', 'Electric Guitar (clean)',
    'Electric Guitar (muted)', 'Overdriven Guitar', 'Distortion Guitar', 'Guitar harmonics',
    'Acoustic Bass', 'Electric Bass (finger)', 'Electric Bass (pick)', 'Fretless Bass',
    'Slap Bass 1', 'Slap Bass 2', 'Synth Bass 1', 'Synth Bass 2',
    'Violin', 'Viola', 'Cello', 'Contrabass',
    'Tremolo Strings', 'Pizzicato Strings', 'Orchestral Harp', 'Timpani',
    'String Ensemble 1', 'String Ensemble 2', 'Synth Strings 1', 'Synth Strings 2',
    'Choir Aahs', 'Voice Oohs', 'Synth Voice', 'Orchestra Hit',
    'Trumpet', 'Trombone', 'Tuba', 'Muted Trumpet',
    'French Horn', 'Brass Section', 'Synth Brass 1', 'Synth Brass 2',
    'Soprano Sax', 'Alto Sax', 'Tenor Sax', 'Baritone Sax',
    'Oboe', 'English Horn', 'Bassoon', 'Clarinet',
    'Piccolo', 'Flute', 'Recorder', 'Pan Flute',
    'Blown Bottle', 'Shakuhachi', 'Whistle', 'Ocarina',
    'Lead 1 (square)', 'Lead 2 (sawtooth)', 'Lead 3 (calliope)', 'Lead 4 (chiff)',
    'Lead 5 (charang)', 'Lead 6 (voice)', 'Lead 7 (fifths)', 'Lead 8 (bass + lead)',
    'Pad 1 (new age)', 'Pad 2 (warm)', 'Pad 3 (polysynth)', 'Pad 4 (choir)',
    'Pad 5 (bowed)', 'Pad 6 (metallic)', 'Pad 7 (halo)', 'Pad 8 (sweep)',
    'FX 1 (rain)', 'FX 2 (soundtrack)', 'FX 3 (crystal)', 'FX 4 (atmosphere)',
    'FX 5 (brightness)', 'FX 6 (goblins)', 'FX 7 (echoes)', 'FX 8 (sci-fi)',
    'Sitar', 'Banjo', 'Shamisen', 'Koto',
    'Kalimba', 'Bag pipe', 'Fiddle', 'Shanai',
    'Tinkle Bell', 'Agogo', 'Steel Drums', 'Woodblock',
    'Taiko Drum', 'Melodic Tom', 'Synth Drum', 'Reverse Cymbal',
    'Guitar Fret Noise', 'Breath Noise', 'Seashore', 'Bird Tweet',
    'Telephone Ring', 'Helicopter', 'Applause', 'Gunshot'
  ];
  
  // Check for gchord and drum settings
  const hasGchord = abcNotation.includes('%%MIDI gchord');
  const hasDrum = abcNotation.includes('%%MIDI drum');
  
  if (hasGchord) {
    instruments.push('Guitar Chords');
  }
  
  if (hasDrum) {
    instruments.push('Percussion');
  }
  
  // Extract MIDI program numbers
  while ((match = programRegex.exec(abcNotation)) !== null) {
    const programNumber = parseInt(match[1], 10);
    if (programNumber >= 1 && programNumber <= 128) {
      // MIDI program numbers are 1-based, but our array is 0-based
      const instrumentName = gmInstruments[programNumber - 1];
      instruments.push(instrumentName);
    }
  }
  
  return [...new Set(instruments)]; // Remove duplicates
}

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
 * Generate ABC notation files using Claude
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
 * @returns {Promise<string[]>} Array of generated file paths
 */
export async function generateAbc(options) {
  const count = parseInt(options.count || '1', 10);
  const genre = options.genre || 'Classical_x_Contemporary';
  const style = options.style || 'standard';
  const outputDir = options.output || config.get('outputDir');
  const customSystemPrompt = options.systemPrompt;
  const customUserPrompt = options.userPrompt;
  const useCreativeNames = options.creativeNames === true; // Default to false unless explicitly specified
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  
  // Parse the hybrid genre
  const genreComponents = parseHybridGenre(genre);
  
  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
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
      const filename = `${displayGenre}-score${i+1}-${timestamp}`;
      
      // Generate the ABC notation with special attention to genre fusion
      console.log(`Generating ${displayGenre} composition in ${style} style...`);
      console.log(`Fusing ${genreComponents.classical} with ${genreComponents.modern}...`);
      
      // Log if using a custom system prompt
      if (customSystemPrompt) {
        console.log('Using custom system prompt...');
      }
      
      const abcNotation = await generateMusicWithClaude({
        genre: creativeGenreName || genre, // Use creative name if available
        classicalGenre: genreComponents.classical,
        modernGenre: genreComponents.modern,
        style,
        temperature: 0.7,
        customSystemPrompt,
        customUserPrompt,
        solo: includeSolo,
        recordLabel: recordLabel,
        producer: producer
      });
      
      // Extract the instruments used in the composition
      const instruments = extractInstruments(abcNotation);
      const instrumentString = instruments.length > 0 
        ? instruments.join(', ') 
        : 'Default Instrument';
      
      console.log(`Using instruments: ${instrumentString}`);
      
      // First pass: clean the notation
      let cleanedAbcNotation = cleanAbcNotation(abcNotation);
      
      // Validate the ABC notation
      const validation = validateAbcNotation(cleanedAbcNotation);
      
      // If there are issues, log and use the fixed version
      if (!validation.isValid) {
        console.warn(`⚠️ WARNING: ABC notation validation issues found for ${filename}.abc:`);
        validation.issues.forEach(issue => console.warn(`  - ${issue}`));
        console.warn(`Auto-fixing ${validation.issues.length} issues...`);
        cleanedAbcNotation = validation.fixedNotation;
      } else {
        console.log(`✅ ABC notation validation passed for ${filename}.abc`);
      }
      
      // Save the cleaned and validated ABC notation to a file
      const abcFilePath = path.join(outputDir, `${filename}.abc`);
      fs.writeFileSync(abcFilePath, cleanedAbcNotation);
      generatedFiles.push(abcFilePath);
      
      // Generate and save the description
      console.log('Generating description document...');
      const description = await generateDescription({
        abcNotation,
        genre: creativeGenreName || genre, // Use creative name if available
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
      
      // Create a markdown file with both the ABC notation and description
      const mdContent = `# ${creativeGenreName || genre} Composition in ${style} Style
      
## Genre Fusion${creativeGenreName ? `\n- Creative Genre Name: "${creativeGenreName}"` : ''}
- Classical Element: ${genreComponents.classical}
- Modern Element: ${genreComponents.modern}

## Instruments
${instrumentString}

## ABC Notation

\`\`\`
${abcNotation}
\`\`\`

## Analysis

${description.analysis}
`;
      const mdFilePath = path.join(outputDir, `${filename}.md`);
      fs.writeFileSync(mdFilePath, mdContent);
      
      console.log(`Generated ${abcFilePath}`);
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
  
  generateAbc(options)
    .then(files => {
      console.log(`Generated ${files.length} composition(s)`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}