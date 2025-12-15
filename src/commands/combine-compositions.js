import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateText } from 'ai';
import { config } from '../utils/config.js';
import { getMusicPieceInfo } from '../utils/dataset-utils.js';
import { modifyCompositionWithClaude, generateDescription, getAnthropic, cleanAbcNotation, validateAbcNotation } from '../utils/claude.js';
import { CombineOrchestrator } from '../agents/combine-orchestrator.js';
import { calculateAbcDuration } from '../utils/abc-duration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Finds short compositions and combines them into new pieces
 * @param {Object} options - Command options
 * @param {number} [options.durationLimit=60] - Maximum duration in seconds for pieces to combine
 * @param {string} [options.dateFrom] - Filter pieces created after this date (ISO format)
 * @param {string} [options.dateTo] - Filter pieces created before this date (ISO format)
 * @param {string} [options.genres] - Comma-separated list of genres to include
 * @param {string} [options.output] - Output directory for new compositions
 * @param {string} [options.directory] - Directory to search for compositions
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @returns {Promise<Array<string>>} Paths to the generated compositions
 */
export async function combineCompositions(options) {
  const directory = options.directory || config.get('outputDir');
  const outputDir = options.output || directory;
  const durationLimit = parseFloat(options.durationLimit) || 60;
  const dateFrom = options.dateFrom ? new Date(options.dateFrom) : null;
  const dateTo = options.dateTo ? new Date(options.dateTo) : null;
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';

  // Parse genres list
  const genres = options.genres ? options.genres.split(',').map(g => g.trim()) : [];

  console.log(`Searching for compositions under ${durationLimit} seconds...`);

  console.log(`Looking for ABC files to analyze duration...`);

  // Get all ABC files and calculate their duration
  const abcFiles = fs.readdirSync(directory)
    .filter(file => file.endsWith('.abc'))
    .map(file => path.join(directory, file));

  console.log(`Found ${abcFiles.length} ABC files to analyze`);

  // Calculate duration for each ABC file
  let filesWithDuration = [];

  for (const abcPath of abcFiles) {
    const baseFilename = path.basename(abcPath, '.abc');

    // Read ABC content
    const abcContent = fs.readFileSync(abcPath, 'utf-8');
    const duration = calculateAbcDuration(abcContent);

    if (duration !== null && duration >= 1) {
      // Get file stats for date filtering
      const stats = fs.statSync(abcPath);

      filesWithDuration.push({
        path: abcPath,
        basename: baseFilename,
        duration: duration,
        created: stats.birthtime,
        modified: stats.mtime,
        abcContent: abcContent  // Store ABC content for later use
      });

      console.log(`  ${baseFilename}: ${duration.toFixed(1)}s`);
    } else {
      console.log(`  ${baseFilename}: Unable to calculate duration`);
    }
  }
  console.log(filesWithDuration)

  /*
  // Get duration using ffprobe for each file
  const filesWithDuration = await Promise.all(
    files.map(async (filePath) => {
      try {
        // Use ffprobe to get duration
        const result = await execaCommand(
          `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${filePath}"`
        );
        const duration = parseFloat(result.stdout.trim());
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          basename: path.basename(filePath),
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          duration
        };
      } catch (error) {
        console.error(`Error getting duration for ${filePath}:`, error.stderr || error.message);
        const stats = fs.statSync(filePath);
        return {
          path: filePath,
          basename: path.basename(filePath),
          size: stats.size,
          created: stats.birthtime,
          modified: stats.mtime,
          duration: null
        };
      }
    })
  );
  */
  // Sort by duration (shortest first)
  filesWithDuration.sort((a, b) => {
    if (a.duration && b.duration) return a.duration - b.duration;
    if (a.duration) return -1;
    if (b.duration) return 1;
    return 0;
  });

  // Filter by duration
  let shortPieces = filesWithDuration.filter(file => {
    return file.duration && file.duration <= durationLimit;
  });

  console.log(`Found ${shortPieces.length} compositions under ${durationLimit} seconds`);

  // Filter by date if specified
  if (dateFrom || dateTo) {
    shortPieces = shortPieces.filter(file => {
      const created = new Date(file.created);
      if (dateFrom && created < dateFrom) return false;
      if (dateTo && created > dateTo) return false;
      return true;
    });
    console.log(`After date filtering: ${shortPieces.length} compositions remain`);
  }

  // Filter by genre if specified
  if (genres.length > 0) {
    shortPieces = shortPieces.filter(file => {
      const pieceInfo = getMusicPieceInfo(file.basename, directory);

      if (!pieceInfo.genre) return false;

      // Check if any of the specified genres is in the piece's genre
      return genres.some(genre =>
        pieceInfo.genre.toLowerCase().includes(genre.toLowerCase())
      );
    });
    console.log(`After genre filtering: ${shortPieces.length} compositions remain`);
  }

  if (shortPieces.length === 0) {
    console.log('No compositions found matching the criteria');
    return [];
  }

  // Group pieces that would work well together (max 3 per group)
  const groups = groupPiecesByCompatibility(shortPieces, directory);
  console.log(`Created ${groups.length} groups of compatible compositions`);

  // Generate new compositions from each group
  const generatedFiles = [];

  // Check if we should use the orchestration approach
  if (options.orchestrate) {
    console.log('\n🎭 Using Multi-Agent Orchestration for Combination\n');

    // Validate AI provider
    if (config.get('aiProvider') !== 'anthropic') {
      throw new Error('Orchestrate combination currently only supports Anthropic AI provider');
    }

    // Initialize Anthropic and orchestrator
    const anthropic = getAnthropic();
    const sessionId = options.resume || Date.now();
    const orchestratorOptions = {
      saveIntermediateOutputs: true,
      sessionId: sessionId
    };
    console.log(`   📝 Session ID: ${sessionId}`);
    const orchestrator = new CombineOrchestrator(anthropic, orchestratorOptions);

    // Process each group with orchestration
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      console.log(`\nProcessing group ${i + 1}/${groups.length} with ${group.length} pieces using orchestration...`);

      // Prepare source pieces data for orchestrator
      const sourcePieces = [];
      for (const piece of group) {
        const pieceInfo = getMusicPieceInfo(piece.basename, directory);

        // Use the ABC content we already loaded into memory
        if (piece.abcContent) {
          sourcePieces.push({
            abc: piece.abcContent,  // Using stored content instead of reading from disk
            genre: pieceInfo.genre || 'unknown',
            filename: piece.basename,
            title: pieceInfo.title || piece.basename,
            duration: piece.duration,
            description: pieceInfo.description || null
          });
        }
      }

      if (sourcePieces.length === 0) {
        console.log('No valid ABC notation found for this group, skipping...');
        continue;
      }

      // Build user prompt for orchestrator
      const userPrompt = buildOrchestratorPrompt(sourcePieces, {
        includeSolo,
        recordLabel,
        producer,
        requestedInstruments,
        notInstruments: options.notInstruments
      });

      try {
        // Run orchestration
        const result = await orchestrator.orchestrateCombination(
          sourcePieces,
          userPrompt,
          options
        );

        // Save the orchestrated composition
        const timestamp = Date.now();
        if (!result.genre_name) {
          console.warn('⚠️  WARNING: No genre_name in orchestration result, using fallback "combined"');
        }
        const genreName = (result.genre_name || 'combined').toLowerCase().replace(/[^a-z0-9]+/g, '_');
        const filename = `${genreName}-orchestrated-${timestamp}`;
        const abcFilePath = path.join(outputDir, `${filename}.abc`);

        fs.writeFileSync(abcFilePath, result.abc_notation);
        console.log(`Created orchestrated composition: ${abcFilePath}`);

        // Save full context as JSON
        const jsonPath = path.join(outputDir, `${filename}.json`);
        fs.writeFileSync(jsonPath, JSON.stringify(result.full_context, null, 2));

        // Create markdown summary
        const mdContent = createOrchestratedMarkdown(result, sourcePieces);
        const mdFilePath = path.join(outputDir, `${filename}.md`);
        fs.writeFileSync(mdFilePath, mdContent);

        generatedFiles.push(abcFilePath);

      } catch (error) {
        console.error(`Failed to orchestrate group ${i + 1}:`, error.message);
        console.error(`   💾 Best-effort ABC may have been saved to ./output/ directory`);
        console.error(`   💾 To resume, use: mediocre combine --orchestrate --resume ${sessionId}`);
        continue;
      }
    }
  } else {
    // Use traditional combination approach
    for (let i = 0; i < groups.length; i++) {
      const group = groups[i];
      console.log(`Processing group ${i + 1}/${groups.length} with ${group.length} pieces...`);

      const abcNotations = [];
      const genres = [];

      // Collect ABC notations and genres from each piece in the group
      for (const piece of group) {
        const pieceInfo = getMusicPieceInfo(piece.basename, directory);

        // Use the ABC content we already have in memory
        if (piece.abcContent) {
          abcNotations.push(piece.abcContent);  // Using stored content
          if (pieceInfo.genre) {
            genres.push(pieceInfo.genre);
          }
        }
      }

      if (abcNotations.length === 0) {
        console.log('No valid ABC notation found for this group, skipping...');
        continue;
      }

      // Create a combined piece using Claude
      const newPiece = await createCombinedPiece(abcNotations, genres, i, includeSolo, recordLabel, producer, requestedInstruments);

      // Save the new composition
      if (newPiece) {
        const timestamp = Date.now();
        const combinedGenre = combineGenres(genres);
        const filename = `${combinedGenre}-combined-${timestamp}`;
        const abcFilePath = path.join(outputDir, `${filename}.abc`);

        fs.writeFileSync(abcFilePath, newPiece);
        console.log(`Created combined composition: ${abcFilePath}`);

        // Generate and save description
        const genreComponents = combinedGenre.split('_x_');
        const classicalGenre = genreComponents.length === 2 ? genreComponents[0] : 'Classical';
        const modernGenre = genreComponents.length === 2 ? genreComponents[1] : 'Contemporary';

        const description = await generateDescription({
          abcNotation: newPiece,
          genre: combinedGenre,
          classicalGenre,
          modernGenre
        });

        const descriptionFilePath = path.join(outputDir, `${filename}_description.json`);
        fs.writeFileSync(descriptionFilePath, JSON.stringify(description, null, 2));

        // Create a markdown file with details about the source pieces
        const sourceDetails = group.map(piece => {
          return `- ${piece.basename} (${piece.duration.toFixed(2)}s)`;
        }).join('\n');

        const mdContent = `# Original ${combinedGenre} Composition

## Inspired By
${sourceDetails}

## ABC Notation

\`\`\`
${newPiece}
\`\`\`

## Analysis

${description.analysis}
`;
        const mdFilePath = path.join(outputDir, `${filename}.md`);
        fs.writeFileSync(mdFilePath, mdContent);

        generatedFiles.push(abcFilePath);
      }
    }
  }

  return generatedFiles;
}

/**
 * Groups pieces by musical compatibility
 * @param {Array<Object>} pieces - List of piece objects with file stats
 * @param {string} directory - Directory containing the pieces
 * @returns {Array<Array<Object>>} Groups of compatible pieces
 */
function groupPiecesByCompatibility(pieces, directory) {
  const groups = [];

  // Use Claude to analyze and group pieces
  // For now, use a simpler grouping strategy of 2-3 pieces per group
  const maxPiecesPerGroup = 3;
  let currentGroup = [];

  for (const piece of pieces) {
    currentGroup.push(piece);

    if (currentGroup.length >= maxPiecesPerGroup) {
      groups.push([...currentGroup]);
      currentGroup = [];
    }
  }

  // Add the last group if it's not empty
  if (currentGroup.length > 0) {
    groups.push(currentGroup);
  }

  return groups;
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
 * Creates a new composition by combining elements from multiple pieces
 * @param {Array<string>} abcNotations - List of ABC notations
 * @param {Array<string>} genres - List of genre names
 * @param {number} groupIndex - Index of the group (for labeling)
 * @param {boolean} [includeSolo=false] - Include a musical solo section for the lead instrument
 * @param {string} [recordLabel=''] - Make it sound like it was released on this record label
 * @param {string} [producer=''] - Make it sound as if it was produced by this record producer
 * @param {string} [instruments=''] - Comma-separated list of instruments the output ABC notations must include
 * @returns {Promise<string>} Combined ABC notation
 */
async function createCombinedPiece(abcNotations, genres, groupIndex, includeSolo = false, recordLabel = '', producer = '', instruments = '') {
  const myAnthropic = getAnthropic();
  const model = myAnthropic('claude-3-5-sonnet-20241022');

  const combinedGenre = combineGenres(genres);
  const genreParts = combinedGenre.split('_x_');
  const classicalGenre = genreParts.length === 2 ? genreParts[0] : 'Classical';
  const modernGenre = genreParts.length === 2 ? genreParts[1] : 'Contemporary';

  console.log(`Creating combined ${combinedGenre} piece...`);

  const systemPrompt = `You are a creative music composer specializing in creating original compositions inspired by existing musical ideas.
Your task is to analyze the provided ABC notation pieces and create a NEW, ORIGINAL composition that intelligently incorporates elements from each source.

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, and other element must be on its own line with NO INDENTATION.
Failure to follow these formatting rules will result in completely unplayable music files.

Guidelines for creating this new composition:
1. THE RESULTS SHOULD NOT BE WHAT IS CONVENTIONALLY KNOWN AS A 'MASH-UP' - it should be a UNIQUE PIECE that makes intelligent use of the facets of both works to make a new piece of SINGULARLY UNIQUE VALUE
2. Create a cohesive composition that stands on its own as an original work, not merely a combination of existing materials
3. Maintain the hybrid genre character (${classicalGenre} x ${modernGenre}) while transcending both
4. Extract the most compelling musical ideas from each source but transform them significantly
5. Develop these ideas in ways the original composers would not have - add your unique perspective
6. Ensure the final piece has a complete musical structure with proper beginning, development, and conclusion that feels entirely original

Technical guidelines:
- Ensure the ABC notation is properly formatted and playable with abc2midi
- Include appropriate headers (X:1, T:, M:, L:, Q:, K:) at the beginning, before any voice declarations
- Use the title "Original ${combinedGenre} Composition ${groupIndex + 1} (Inspired by Multiple Works)"
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

Return ONLY the complete ABC notation for the new combined composition, with no explanation or additional text.`;

  const sourcePiecesText = abcNotations.map((abc, index) =>
    `Source Piece ${index + 1}:\n${abc}\n\n`
  ).join('');

  const userPrompt = `Analyze these ${abcNotations.length} compositions as sources of musical inspiration for a completely new and original piece:

${sourcePiecesText}

Create a BRAND NEW, WHOLLY ORIGINAL composition in ABC notation. This should NOT be a mashup or direct combination of these pieces, but rather a unique creation that shows your understanding of what makes these pieces interesting.

THE RESULTS SHOULD NOT BE WHAT IS CONVENTIONALLY KNOWN AS A 'MASH-UP' - it should be a UNIQUE PIECE that makes intelligent use of the facets of both works to make a new piece of SINGULARLY UNIQUE VALUE.

Extract seed ideas, themes, or structural elements from the source materials, but transform them significantly to create something truly novel. The new piece should maintain the essence of the ${combinedGenre} genre while standing completely on its own as an original artistic creation.${includeSolo ? '\n\nInclude a dedicated solo section for the lead instrument.' : ''}${recordLabel ? `\n\nStyle the composition to sound like it was released on the record label "${recordLabel}".` : ''}${producer ? `\n\nStyle the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${instruments ? `\n\nYour composition MUST include these specific instruments: ${instruments}. Find the most appropriate MIDI program number for each instrument.` : ''}

The piece MUST be longer in duration than the combined lengths of each piece you will be combining. It may never be shorter than either piece or all pieces combined.

IMPORTANT: The ABC notation must be compatible with abc2midi converter. Ensure all headers come first (X:1, T:, M:, L:, Q:, K:), then any MIDI program declarations, then voice declarations, then music.`;

  try {
    // Build messages array with cache control for system prompt
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
        providerOptions: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      {
        role: 'user',
        content: userPrompt
      }
    ];

    const { text, providerMetadata } = await generateText({
      model,
      messages,
      temperature: 0.7,
      maxTokens: 20000,
    });

    // Log cache stats if available
    if (providerMetadata?.anthropic?.cacheCreationInputTokens) {
      console.log(`  📦 Cache created: ${providerMetadata.anthropic.cacheCreationInputTokens} tokens`);
    }
    if (providerMetadata?.anthropic?.cacheReadInputTokens) {
      console.log(`  ♻️  Cache hit: ${providerMetadata.anthropic.cacheReadInputTokens} tokens`);
    }

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
    console.error('Error generating combined piece:', error);
    return null;
  }
}

/**
 * Build a user prompt for the orchestrator based on source pieces and options
 * @param {Array} sourcePieces - Array of source piece objects
 * @param {Object} options - Combination options
 * @returns {string} User prompt for orchestrator
 */
function buildOrchestratorPrompt(sourcePieces, options) {
  let prompt = `Create a new musical composition that intelligently combines elements from ${sourcePieces.length} source pieces:

`;

  // Add source piece descriptions
  sourcePieces.forEach((piece, index) => {
    prompt += `Source ${index + 1}: ${piece.genre} composition "${piece.title}" (${piece.duration.toFixed(1)}s)\n`;
  });

  prompt += `
Create something entirely NEW and ORIGINAL that transcends mere combination. Extract the essence and most compelling ideas from these sources, but transform them into a unique artistic statement.`;

  if (options.includeSolo) {
    prompt += ' Include a dedicated solo section for the lead instrument.';
  }

  if (options.recordLabel) {
    prompt += ` Style the composition to sound like it was released on the record label "${options.recordLabel}".`;
  }

  if (options.producer) {
    prompt += ` Style the composition to sound as if it was produced by ${options.producer}.`;
  }

  if (options.requestedInstruments) {
    prompt += ` The composition MUST include these instruments: ${options.requestedInstruments}.`;
  }

  if (options.notInstruments) {
    prompt += ` The composition MUST NOT include these instruments: ${options.notInstruments}.`;
  }

  return prompt;
}

/**
 * Create markdown documentation for orchestrated composition
 * @param {Object} result - Orchestration result
 * @param {Array} sourcePieces - Source pieces used
 * @returns {string} Markdown content
 */
function createOrchestratedMarkdown(result, sourcePieces) {
  const context = result.full_context;

  let markdown = `# ${result.metadata.title}

**Genre:** ${result.genre_name || 'Combined Composition'}
**Creation Method:** Multi-Agent Orchestrated Combination

## Source Compositions

${sourcePieces.map((piece, index) =>
  `${index + 1}. **${piece.title}** (${piece.genre}, ${piece.duration.toFixed(1)}s)`
).join('\n')}

## Creative Vision

${context.combination_concept?.data?.creative_explanation || 'A unique synthesis of the source materials.'}

## Musical Analysis

### Classical Elements
${context.music_history?.data?.classical_characteristics ?
  `- **Harmonic Language:** ${context.music_history.data.classical_characteristics.harmonic_language}
- **Formal Structures:** ${context.music_history.data.classical_characteristics.formal_structures}
- **Melodic Style:** ${context.music_history.data.classical_characteristics.melodic_style}` :
  'Classical elements integrated from source materials.'}

### Modern Elements
${context.music_history?.data?.modern_characteristics ?
  `- **Rhythmic Approach:** ${context.music_history.data.modern_characteristics.rhythmic_approach}
- **Production Techniques:** ${context.music_history.data.modern_characteristics.production_techniques}
- **Textural Approach:** ${context.music_history.data.modern_characteristics.textural_approach}` :
  'Modern elements synthesized from source materials.'}

## Arrangement

${context.arrangement?.data ?
  `**Total Voices:** ${context.arrangement.data.total_voices}

${context.arrangement.data.voices?.map(v =>
  `- Voice ${v.voice_number}: ${v.instrument_name} (MIDI ${v.midi_program}) - ${v.role}`
).join('\n') || 'Voice arrangement details available in JSON output.'}` :
  'Arrangement details available in JSON output.'}

## Structure

${context.compositional_form?.data ?
  `**Key:** ${context.compositional_form.data.key}
**Time Signature:** ${context.compositional_form.data.time_signature}
**Tempo:** ${context.compositional_form.data.tempo} BPM
**Total Measures:** ${context.compositional_form.data.total_measures}
**Form:** ${context.compositional_form.data.form_type}` :
  'Structural details available in JSON output.'}

## Validation Results

${result.validation ?
  `**Status:** ${result.validation.validation_status}
**Recommendation:** ${result.validation.recommendation}
${result.validation.issues?.length > 0 ?
  `\n### Issues Identified\n${result.validation.issues.map((issue, i) =>
    `${i + 1}. [${issue.severity}] ${issue.description}`
  ).join('\n')}` : ''}` :
  'Validation results available in JSON output.'}

## ABC Notation

\`\`\`abc
${result.abc_notation}
\`\`\`

---

*Generated by Mediocre Music Combination Orchestrator*
*Session ID: ${result.metadata.session_id}*
`;

  return markdown;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    durationLimit: args[0] || 60,
    dateFrom: args[1] || null,
    dateTo: args[2] || null,
    genres: args[3] || '',
    directory: args[4] || config.get('outputDir'),
    output: args[5] || config.get('outputDir')
  };

  combineCompositions(options)
    .then(files => {
      console.log(`Generated ${files.length} combined compositions`);
      process.exit(0);
    })
    .catch(error => {
      console.error('Error:', error);
      process.exit(1);
    });
}
