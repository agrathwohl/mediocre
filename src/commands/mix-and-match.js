import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../utils/config.js';
import { getMusicPieceInfo } from '../utils/dataset-utils.js';
import { generateText } from 'ai';
import { generateDescription, getAnthropic, validateAbcNotation, cleanAbcNotation } from '../utils/claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Mix and match segments from multiple ABC notation files into a new composition
 * @param {Object} options - Command options
 * @param {Array<string>} options.files - Array of direct file paths to ABC notation files
 * @param {string} [options.output] - Output directory for the new composition
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on the given record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @returns {Promise<string>} Path to the generated composition file
 */
export async function mixAndMatch(options) {
  const outputDir = options.output || config.get('outputDir');
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';

  if (!options.files || options.files.length < 2) {
    throw new Error('At least two input files are required for mixing and matching');
  }

  console.log(`Mixing and matching from ${options.files.length} files...`);

  // Collect ABC notations from each file
  const sourceFiles = [];

  for (const filePath of options.files) {
    try {
      if (!fs.existsSync(filePath)) {
        console.warn(`Skipping ${filePath}: File does not exist`);
        continue;
      }
      
      if (!filePath.endsWith('.abc')) {
        console.warn(`Skipping ${filePath}: Not an ABC notation file`);
        continue;
      }
      
      // Read the ABC content directly
      const abcContent = fs.readFileSync(filePath, 'utf8');
      
      // Get the base filename without extension
      const baseFilename = path.basename(filePath, '.abc');
      
      // Try to find associated description file
      let genre = 'Unknown';
      
      // Look for genre in description file if it exists
      const descPath = path.join(path.dirname(filePath), `${baseFilename}_description.json`);
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

      sourceFiles.push({
        filename: baseFilename,
        genre: genre,
        abcNotation: abcContent
      });

      console.log(`Loaded ${baseFilename} (${genre})`);
    } catch (error) {
      console.warn(`Error loading ${filePath}: ${error.message}`);
    }
  }

  if (sourceFiles.length < 2) {
    throw new Error('At least two valid ABC notation files are required for mixing and matching');
  }

  // Create a mixed composition from the source files
  const mixedComposition = await createMixedComposition(
    sourceFiles,
    includeSolo,
    recordLabel,
    producer,
    requestedInstruments
  );

  if (!mixedComposition) {
    throw new Error('Failed to generate mixed composition');
  }

  // Generate a combined genre name from the source files
  const sourceGenres = sourceFiles.map(file => file.genre);
  const combinedGenre = combineGenres(sourceGenres);
  
  // Generate a filename for the mixed composition
  const timestamp = Date.now();
  const mixedFilename = `${combinedGenre}-mixed-${timestamp}`;
  
  // Save the mixed ABC notation to a file
  const abcFilePath = path.join(outputDir, `${mixedFilename}.abc`);
  fs.writeFileSync(abcFilePath, mixedComposition);
  
  // Extract genre components for description generation
  const genreComponents = combinedGenre.split('_x_');
  const classicalGenre = genreComponents.length === 2 ? genreComponents[0] : 'Classical';
  const modernGenre = genreComponents.length === 2 ? genreComponents[1] : 'Contemporary';
  
  console.log('Generating description document...');
  
  // Generate and save the description for the mixed composition
  const description = await generateDescription({
    abcNotation: mixedComposition,
    genre: combinedGenre,
    classicalGenre,
    modernGenre
  });
  
  // Save the description as JSON
  const descriptionFilePath = path.join(outputDir, `${mixedFilename}_description.json`);
  fs.writeFileSync(descriptionFilePath, JSON.stringify(description, null, 2));
  
  // Create a markdown file with details about the source pieces
  const sourceDetails = sourceFiles.map(file => {
    return `- ${file.filename} (${file.genre})`;
  }).join('\n');
  
  const mdContent = `# Mixed ${combinedGenre} Composition

## Source Compositions
${sourceDetails}

## About This Composition
This piece was created by mixing and matching segments from multiple compositions, 
layering them together in musically coherent ways to create a new unified work.

## ABC Notation

\`\`\`
${mixedComposition}
\`\`\`

## Analysis

${description.analysis}
`;
  
  const mdFilePath = path.join(outputDir, `${mixedFilename}.md`);
  fs.writeFileSync(mdFilePath, mdContent);
  
  console.log(`Successfully created mixed composition: ${abcFilePath}`);
  
  return abcFilePath;
}

/**
 * Creates a combined genre name from multiple genres
 * @param {Array<string>} genres - List of genre names
 * @returns {string} Combined genre name
 */
function combineGenres(genres) {
  if (!genres || genres.length === 0) {
    return 'mixed';
  }

  // Extract unique classical and modern components
  const classical = new Set();
  const modern = new Set();

  for (const genre of genres) {
    const parts = genre.split('_x_');
    if (parts.length === 2) {
      classical.add(parts[0]);
      modern.add(parts[1]);
    } else {
      // If not in expected format, just add the whole genre
      classical.add(genre);
    }
  }

  // Combine into a new hybrid genre
  const classicalCombined = Array.from(classical).slice(0, 2).join('-');
  const modernCombined = Array.from(modern).slice(0, 2).join('-');

  return modernCombined ? `${classicalCombined}_x_${modernCombined}` : classicalCombined;
}

/**
 * Creates a new composition by mixing and matching segments from multiple pieces
 * @param {Array<Object>} sourceFiles - Source files with ABC notations and metadata
 * @param {boolean} [includeSolo=false] - Include a musical solo section for the lead instrument
 * @param {string} [recordLabel=''] - Make it sound like it was released on this record label
 * @param {string} [producer=''] - Make it sound as if it was produced by this record producer
 * @param {string} [instruments=''] - Comma-separated list of instruments the output ABC notations must include
 * @returns {Promise<string>} Mixed ABC notation
 */
async function createMixedComposition(sourceFiles, includeSolo = false, recordLabel = '', producer = '', instruments = '') {
  const myAnthropic = getAnthropic();
  const model = myAnthropic('claude-3-5-sonnet-20241022');

  const combinedGenre = combineGenres(sourceFiles.map(file => file.genre));
  const genreParts = combinedGenre.split('_x_');
  const classicalGenre = genreParts.length === 2 ? genreParts[0] : 'Classical';
  const modernGenre = genreParts.length === 2 ? genreParts[1] : 'Contemporary';

  console.log(`Creating mixed ${combinedGenre} composition...`);

  const systemPrompt = `You are a creative music composer specializing in mixing and matching musical segments from different compositions to create new, coherent musical works.
Your task is to create a new composition that thoughtfully combines elements from the provided ABC notation pieces.

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, and other element must be on its own line with NO INDENTATION.
Failure to follow these formatting rules will result in completely unplayable music files.

Guidelines for creating the mixed composition:
1. Analyze the provided compositions for interesting motifs, themes, harmonies, and rhythmic patterns
2. Select the most compelling segments from each source piece
3. Create a MUSICALLY COHERENT composition, not just a random collection of segments
4. Use smooth transitions between different segments
5. When appropriate, LAYER segments from different sources ON TOP OF ONE ANOTHER, combining them vertically to create rich, unified sections where multiple musical ideas coexist
6. Create a complete musical structure with proper beginning, development, and conclusion
7. Maintain the hybrid genre character (${classicalGenre} x ${modernGenre})

Technical guidelines:
- Ensure the ABC notation is properly formatted and playable with abc2midi
- Include appropriate headers (X:1, T:, M:, L:, Q:, K:) at the beginning, before any voice declarations
- Use the title "Mixed ${combinedGenre} Composition"
- All notes must belong to a voice (V:1, V:2, etc.)
- Maintain consistent key signatures and time signatures between voices
${includeSolo ? '- Include a dedicated solo section for the lead instrument, clearly marked in the notation' : ''}
${recordLabel ? `- Style the composition to sound like it was released on the record label "${recordLabel}"` : ''}
${producer ? `- Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ''}
${instruments ? `- Your composition MUST include these specific instruments: ${instruments}. Use the appropriate MIDI program numbers for each instrument.` : ''}

ONLY USE THESE SUPPORTED EXTENSIONS:
1. Channel and Program selection:
   - %%MIDI program [channel] n
2. Dynamics:
   - Use standard ABC dynamics notation: !p!, !f!, !mf!, !ff!
3. Simple chord accompaniment:
   - %%MIDI gchord string

IMPORTANT COMPATIBILITY RULES:
- MIDI program declarations must come AFTER header fields (X,T,M,L,K) but BEFORE any music notation
- Each voice number should have proper clef declarations
- Avoid special symbols like !tremolo!, which may not be supported by abc2midi
- Ensure all bar lines are properly balanced in each voice
- Avoid using unusual time signatures or complex tuplets

Return ONLY the complete ABC notation for the new mixed composition, with no explanation or additional text.`;

  const sourcePiecesText = sourceFiles.map((file, index) =>
    `Source Piece ${index + 1} (${file.genre}):\n${file.abcNotation}\n\n`
  ).join('');

  const userPrompt = `Analyze these ${sourceFiles.length} compositions and create a new piece by mixing and matching their most interesting musical elements:

${sourcePiecesText}

Create a new composition in ABC notation that thoughtfully mixes segments from these compositions. The new piece should:

1. Be MUSICALLY COHERENT - not just a random collection of segments
2. Maintain the character of the ${combinedGenre} genre
3. Select the most interesting motifs, themes, harmonies, and rhythmic patterns from each source
4. Include smooth transitions between different segments
5. CRITICALLY IMPORTANT: When musically appropriate, LAYER segments from different sources ON TOP OF ONE ANOTHER to create rich, unified sections where multiple musical ideas coexist harmoniously
6. Feel like a complete, original composition with proper musical structure${includeSolo ? '\n7. Include a dedicated solo section for the lead instrument' : ''}${recordLabel ? `\n\nStyle the composition to sound like it was released on the record label "${recordLabel}".` : ''}${producer ? `\n\nStyle the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${instruments ? `\n\nYour composition MUST include these specific instruments: ${instruments}. Find the most appropriate MIDI program number for each instrument.` : ''}

The piece MUST be complex in its layering of ideas and use vertical combination of musical concepts from different source pieces to create a unified, coherent whole.

IMPORTANT: The ABC notation must be compatible with abc2midi converter. Ensure all headers come first (X:1, T:, M:, L:, Q:, K:), then any MIDI program declarations, then voice declarations, then music.`;

  try {
    const { text } = await generateText({
      model,
      system: systemPrompt,
      prompt: userPrompt,
      temperature: 0.7,
      maxTokens: 20000,
    });

    let notation = text;

    // Validate ABC notation has required headers
    if (!notation.includes('X:') || !notation.includes('T:') ||
      !notation.includes('M:') || !notation.includes('L:') ||
      !notation.includes('K:')) {
      console.error('Generated ABC notation missing required headers');
      return null;
    }

    // First pass: clean the notation
    notation = cleanAbcNotation(notation);
    
    // Validate the ABC notation
    const validation = validateAbcNotation(notation);
    
    // If there are issues, log and use the fixed version
    if (!validation.isValid) {
      console.warn(`⚠️ WARNING: ABC notation validation issues found:`);
      validation.issues.forEach(issue => console.warn(`  - ${issue}`));
      console.warn(`Auto-fixing ${validation.issues.length} issues...`);
      notation = validation.fixedNotation;
    } else {
      console.log(`✅ ABC notation validation passed`);
    }

    return notation;
  } catch (error) {
    console.error('Error generating mixed composition:', error);
    return null;
  }
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    files: args.slice(0, -2),
    directory: args[args.length - 2] || config.get('outputDir'),
    output: args[args.length - 1] || config.get('outputDir')
  };

  mixAndMatch(options)
    .then(file => {
      console.log(`Mixed composition saved to: ${file}`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}