import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { generateText, streamText } from 'ai';
import { config } from '../utils/config.js';
import { getMusicPieceInfo } from '../utils/dataset-utils.js';
import { modifyCompositionWithClaude, generateDescription, getAnthropic, cleanAbcNotation, validateAbcNotation, validateWithAbc2Midi } from '../utils/claude.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Calculate duration of an ABC notation file from its tempo and content
 * @param {string} abcContent - The ABC notation content
 * @returns {number|null} Duration in seconds, or null if cannot be determined
 */
function calculateAbcDuration(abcContent) {
  // Parse Q: field (tempo) - formats like "Q:1/4=120" or "Q:120" or "Q:1/8=90"
  const tempoMatch = abcContent.match(/^Q:\s*(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/m);
  if (!tempoMatch) {
    return null; // No tempo = can't calculate duration
  }

  const tempoNoteNum = tempoMatch[1] ? parseInt(tempoMatch[1], 10) : 1;
  const tempoNoteDenom = tempoMatch[2] ? parseInt(tempoMatch[2], 10) : 4;
  const bpm = parseInt(tempoMatch[3], 10);

  if (!bpm || bpm <= 0) return null;

  // Parse M: field (meter) - e.g., "M:4/4", "M:3/4", "M:6/8"
  const meterMatch = abcContent.match(/^M:\s*(\d+)\/(\d+)/m);
  const beatsPerMeasure = meterMatch ? parseInt(meterMatch[1], 10) : 4;
  const beatUnit = meterMatch ? parseInt(meterMatch[2], 10) : 4;

  // Parse L: field (default note length) - e.g., "L:1/8"
  const lengthMatch = abcContent.match(/^L:\s*(\d+)\/(\d+)/m);
  const defaultNoteNum = lengthMatch ? parseInt(lengthMatch[1], 10) : 1;
  const defaultNoteDenom = lengthMatch ? parseInt(lengthMatch[2], 10) : 8;

  // Count measures by counting bar lines (|)
  // Remove header section first (everything before first voice or first measure)
  const musicSection = abcContent.replace(/^[A-Za-z]:.*/gm, '').replace(/^%%.*$/gm, '');

  // Count bar lines - each | represents end of a measure
  // Exclude double bars ||, repeat signs |:, :|, and other special bars
  const barMatches = musicSection.match(/\|(?![:\|])/g);
  let measureCount = barMatches ? barMatches.length : 0;

  // Adjust for multi-voice pieces - bar lines from all voices are counted together
  // Count voice declarations to estimate voice count
  const voiceDeclarations = abcContent.match(/^V:\s*\d+/gm);
  const voiceCount = voiceDeclarations ? voiceDeclarations.length : 1;
  if (voiceCount > 1) {
    measureCount = Math.ceil(measureCount / voiceCount);
  }

  if (measureCount === 0) {
    // Try alternative: count notes and estimate measures
    const noteMatches = musicSection.match(/[a-gA-G][',]*\d*\/?(?:\d+)?/g);
    if (noteMatches && noteMatches.length > 0) {
      // Rough estimate: assume notes fill measures proportionally
      const notesPerMeasure = beatsPerMeasure * (beatUnit / (defaultNoteDenom || 8));
      const estimatedMeasures = Math.ceil(noteMatches.length / notesPerMeasure);
      if (estimatedMeasures > 0) {
        // Calculate duration based on estimated measures
        const beatsTotal = estimatedMeasures * beatsPerMeasure;
        const tempoNoteValue = tempoNoteNum / tempoNoteDenom; // e.g., 1/4 = 0.25
        const beatNoteValue = 1 / beatUnit; // e.g., for 4/4, beat unit is quarter = 0.25
        const beatsPerTempoNote = tempoNoteValue / beatNoteValue;
        const durationSeconds = (beatsTotal / beatsPerTempoNote) * (60 / bpm);
        return Math.max(1, durationSeconds);
      }
    }
    return null;
  }

  // Calculate duration: measures * beats per measure, adjusted for tempo note value
  // If Q:1/4=120, then quarter note = 120 BPM
  // If meter is 4/4, each measure has 4 quarter notes worth of time
  const tempoNoteValue = tempoNoteNum / tempoNoteDenom; // e.g., 1/4 = 0.25
  const beatNoteValue = 1 / beatUnit; // e.g., for 4/4, beat unit is quarter = 0.25
  const beatsPerTempoNote = tempoNoteValue / beatNoteValue; // how many beat units per tempo note

  // Total beats = measures * beats per measure
  const totalBeats = measureCount * beatsPerMeasure;

  // Duration = (total beats / beats per tempo note) * (60 seconds / BPM)
  const durationSeconds = (totalBeats / beatsPerTempoNote) * (60 / bpm);

  return Math.max(1, durationSeconds); // Minimum 1 second
}

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
 * @param {boolean} [options.useStreaming] - Use streaming mode for API calls (helps avoid timeout errors)
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
  const useStreaming = options.useStreaming || false;

  // Parse genres list
  const genres = options.genres ? options.genres.split(',').map(g => g.trim()) : [];

  console.log(`Searching for compositions under ${durationLimit} seconds...`);

  console.log(`Looking for .abc files in ${directory}...`);

  // Get all ABC files and calculate duration from ABC notation (tempo + measure count)
  const dirEntries = await fs.promises.readdir(directory);
  const abcFiles = dirEntries
    .filter(file => file.endsWith('.abc'))
    .map(file => path.join(directory, file));
  let filesWithDuration = [];
  for (const abcFile of abcFiles) {
    const abcContent = await fs.promises.readFile(abcFile, 'utf8');
    const duration = calculateAbcDuration(abcContent);
    const stats = await fs.promises.stat(abcFile);
    filesWithDuration.push({
      path: path.resolve(abcFile),
      duration,
      created: stats.birthtime,
      modified: stats.mtime
    });
  }

  // Filter out files without calculable duration
  const filesWithValidDuration = filesWithDuration.filter(file => file.duration !== null);
  const filesWithoutDuration = filesWithDuration.filter(file => file.duration === null);

  console.log(`Found ${filesWithDuration.length} ABC files total`);
  console.log(`  - ${filesWithValidDuration.length} with calculable duration (have Q: tempo field)`);
  if (filesWithoutDuration.length > 0) {
    console.log(`  - ${filesWithoutDuration.length} without tempo info (excluded from duration filtering)`);
  }

  // Only use files with valid duration for filtering
  filesWithDuration = filesWithValidDuration;

  // Sort by duration (shortest first)
  filesWithDuration.sort((a, b) => {
    if (a.duration && b.duration) return a.duration - b.duration;
    if (a.duration) return -1;
    if (b.duration) return 1;
    return 0;
  });

  // Filter by duration - only include files under the duration limit
  let shortPieces = filesWithDuration.filter(file => file.duration <= durationLimit);

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
      const baseFilename = path.basename(file.path, '.abc');
      const pieceInfo = getMusicPieceInfo(baseFilename, directory);

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

  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    console.log(`Processing group ${i + 1}/${groups.length} with ${group.length} pieces...`);

    const abcNotations = [];
    const genres = [];

    // Collect ABC notations and genres from each piece in the group
    for (const piece of group) {
      const baseFilename = path.basename(piece.path, '.abc');
      // Read ABC content directly since we're searching ABC files
      const abcContent = await fs.promises.readFile(piece.path, 'utf8');
      abcNotations.push(abcContent);

      // Try to get genre from description file or filename
      const pieceInfo = getMusicPieceInfo(baseFilename, directory);
      if (pieceInfo.genre) {
        genres.push(pieceInfo.genre);
      } else if (baseFilename.includes('_x_')) {
        // Extract genre from filename pattern
        genres.push(baseFilename.split('-score')[0]);
      }
    }

    if (abcNotations.length === 0) {
      console.log('No valid ABC notation found for this group, skipping...');
      continue;
    }

    // Create a combined piece using Claude
    const newPiece = await createCombinedPiece(abcNotations, genres, i, includeSolo, recordLabel, producer, requestedInstruments, useStreaming);

    // Save the new composition
    if (newPiece) {
      const timestamp = Date.now();
      const combinedGenre = combineGenres(genres);
      const filename = `${combinedGenre}-combined-${timestamp}`;
      const abcFilePath = path.join(outputDir, `${filename}.abc`);

      await fs.promises.writeFile(abcFilePath, newPiece);
      console.log(`Created combined composition: ${abcFilePath}`);

      // VALIDATE WITH ABC2MIDI IMMEDIATELY - prevent segfaults
      console.log(`  🔧 Validating with abc2midi...`);
      let validation = await validateWithAbc2Midi(abcFilePath);

      // Check for warning (abc2midi not installed)
      if (validation.warning) {
        console.log(chalk.yellow(`  ⚠️  ${validation.warning}`));
      }

      const MAX_FIX_ATTEMPTS = 3;
      let fixAttempt = 0;

      while (!validation.valid && fixAttempt < MAX_FIX_ATTEMPTS) {
        fixAttempt++;
        console.warn(`  ⚠️ abc2midi validation failed: ${validation.error}`);
        console.log(`  🔧 Fix attempt ${fixAttempt}/${MAX_FIX_ATTEMPTS}...`);

        try {
          const fixedAbc = await modifyCompositionWithClaude({
            abcNotation: await fs.promises.readFile(abcFilePath, 'utf8'),
            instructions: `FIX THIS ABC NOTATION - IT FAILED abc2midi VALIDATION WITH ERROR: "${validation.error}".

DO NOT EXPAND OR MODIFY THE MUSIC. ONLY FIX THE TECHNICAL ERRORS IN THE ABC NOTATION.
Common issues to check and fix:
- Blank lines between voice sections (REMOVE them)
- Malformed MIDI directives
- Unbalanced bar lines
- Invalid note durations or time signatures
- Missing or malformed headers

Return the FIXED ABC notation that will pass abc2midi without errors.`,
            useStreaming
          });

          await fs.promises.writeFile(abcFilePath, fixedAbc);
          validation = await validateWithAbc2Midi(abcFilePath);

          if (validation.valid) {
            console.log(`  ✅ ABC notation fixed on attempt ${fixAttempt}!`);
          }
        } catch (fixError) {
          console.error(`  ❌ Fix attempt ${fixAttempt} failed: ${fixError.message}`);
        }
      }

      if (!validation.valid) {
        console.error(`  ❌ Could not fix ABC notation after ${MAX_FIX_ATTEMPTS} attempts. Skipping this composition.`);
        await fs.promises.unlink(abcFilePath); // Delete the bad file
        continue;
      }

      console.log(`  ✅ abc2midi validation passed`);

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
      await fs.promises.writeFile(descriptionFilePath, JSON.stringify(description, null, 2));

      // Create a markdown file with details about the source pieces
      const sourceDetails = group.map(piece => {
        const baseFilename = path.basename(piece.path, '.abc');
        const durationStr = piece.duration ? `${piece.duration.toFixed(2)}s` : 'unknown duration';
        return `- ${baseFilename} (${durationStr})`;
      }).join('\n');

      const mdContent = `# Combined ${combinedGenre} Composition

## Source Compositions
${sourceDetails}

## ABC Notation

\`\`\`
${newPiece}
\`\`\`

## Analysis

${description.analysis}
`;
      const mdFilePath = path.join(outputDir, `${filename}.md`);
      await fs.promises.writeFile(mdFilePath, mdContent);

      generatedFiles.push(abcFilePath);
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
 * @param {boolean} [useStreaming=false] - Use streaming mode for API calls
 * @returns {Promise<string>} Combined ABC notation
 */
async function createCombinedPiece(abcNotations, genres, groupIndex, includeSolo = false, recordLabel = '', producer = '', instruments = '', useStreaming = false) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic('claude-3-7-sonnet-20250219');

  const combinedGenre = combineGenres(genres);
  const genreParts = combinedGenre.split('_x_');
  const classicalGenre = genreParts.length === 2 ? genreParts[0] : 'Classical';
  const modernGenre = genreParts.length === 2 ? genreParts[1] : 'Contemporary';

  console.log(`Creating combined ${combinedGenre} piece...`);

  const systemPrompt = `You are a creative music composer specializing in combining existing musical fragments into cohesive new compositions.
Your task is to analyze the provided ABC notation pieces and create a new composition that combines the most interesting elements from each source.

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, and other element must be on its own line with NO INDENTATION.
Failure to follow these formatting rules will result in completely unplayable music files.

Guidelines for combining the compositions:
1. Create a cohesive piece that feels like a natural fusion of the source materials
2. Maintain the hybrid genre character (${classicalGenre} x ${modernGenre})
3. Identify the most interesting motifs, harmonies, or rhythms from each source
4. Create transitions between sections borrowed from different sources
5. Ensure the final piece has a complete musical structure with proper beginning, development, and conclusion

Technical guidelines:
- Ensure the ABC notation is properly formatted and playable with abc2midi
- Include appropriate headers (X:1, T:, M:, L:, Q:, K:) at the beginning, before any voice declarations
- Use the title "Combined ${combinedGenre} Composition ${groupIndex + 1}"
- All notes must belong to a voice (V:1, V:2, etc.)
- Maintain consistent key signatures and time signatures between voices
${includeSolo ? '- Include a dedicated solo section for the lead instrument, clearly marked in the notation' : ''}
${recordLabel ? `- Style the composition to sound like it was released on the record label "${recordLabel}"` : ''}
${producer ? `- Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ''}
${instruments ? `- Your composition MUST include at minimum these instruments: ${instruments}. Use the appropriate MIDI program numbers for each instrument. You are encouraged to add additional instruments that complement these and that are authentic to the ${combinedGenre} genre fusion.` : ''}

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi

ABC2MIDI EXTENSIONS REFERENCE - Use these freely:

1. INSTRUMENTS & CHANNELS:
   - %%MIDI program [channel] n - Select instrument (0-127 General MIDI)
     Example: %%MIDI program 1 40 (violin on channel 1)
   - %%MIDI channel n - Select melody channel (1-16)

2. DRUMS & PERCUSSION (USE THESE FOR MODERN GENRES!):
   - %%MIDI drum string [programs] [velocities] - Define drum pattern
     Example: %%MIDI drum dddd 36 38 42 46 110 90 70 70
     The string uses 'd' for drum hit, 'z' for rest. Programs are GM drum numbers:
     35=Acoustic Bass Drum, 36=Bass Drum 1, 38=Acoustic Snare, 40=Electric Snare,
     42=Closed Hi-Hat, 44=Pedal Hi-Hat, 46=Open Hi-Hat, 49=Crash Cymbal,
     51=Ride Cymbal, 39=Hand Clap, 37=Side Stick, 47/48=Toms, 56=Cowbell
   - %%MIDI drumon - Enable drum pattern
   - %%MIDI drumoff - Disable drum pattern
   - %%MIDI drumbars n - Spread drum pattern over n bars for variation
   - %%MIDI drummap note midipitch - Map ABC notes to specific drum sounds

   CRITICAL - DRUM KIT SELECTION (Channel 10 program changes):
   When selecting drum KITS via %%MIDI program 10 N, you MUST ONLY use these available programs:
   0-66, 76-77, 80, 85, 95-96, 99-110, 118, 125-127
   DO NOT use programs: 67-75, 78-79, 81-84, 86-94, 97-98, 111-117, 119-124
   These missing programs do not exist in our soundfont collection and will cause playback failures.
    Safest choice: Use programs 0-56 (standard GM drum kits guaranteed in all soundfonts).

    BANNED MELODIC INSTRUMENTS - NEVER USE THESE PROGRAMS:
    78 (Whistle), 120 (Guitar Fret Noise), 121 (Breath Noise), 122 (Seashore),
    123 (Bird Tweet), 124 (Telephone Ring), 125 (Helicopter), 126 (Applause), 127 (Gunshot)
    These are novelty sound effects that sound terrible in compositions. DO NOT USE THEM.

    BANNED DRUM NOTES - NEVER USE THESE IN %%MIDI drum OR %%MIDI drummap:
    71 (Short Whistle - B4), 72 (Long Whistle - C5), 73 (Short Guiro - C#5), 74 (Long Guiro - D5),
    78 (Mute Cuica - F#5), 79 (Open Cuica - G5)
    These percussion sounds are annoying novelty effects.

    ⚠️ CRITICAL SOURCE MATERIAL SANITIZATION ⚠️
    The source compositions you are combining MAY CONTAIN banned drum notes (71, 72, 73, 74, 78, 79).
    You MUST NOT allow ANY of these banned sounds into your combined output!
    If you find ANY of these drum notes in the source material:
    - IMMEDIATELY REPLACE them with proper drum sounds (36=kick, 38=snare, 42=hi-hat, etc.)
    - DO NOT copy them verbatim into the combined piece
    - Scan ALL %%MIDI drum and %%MIDI drummap directives for these banned values
    - Replace whistle/guiro/cuica sounds with standard kit percussion
    This is NON-NEGOTIABLE. These novelty sounds DESTROY the composition quality.

3. DYNAMICS & EXPRESSION:
   - Standard dynamics: !ppp! !pp! !p! !mp! !mf! !f! !ff! !fff!
   - %%MIDI beat a b c n - Velocity control (first note, strong, weak, beat divisor)
     Example: %%MIDI beat 105 95 80 1
   - %%MIDI beatmod n - Increment/decrement velocity (use for crescendo/diminuendo)
   - %%MIDI beatstring fmpfmp - Custom accent pattern (f=forte, m=mezzo, p=piano)
   - %%MIDI deltaloudness n - Set crescendo/diminuendo step size

4. ARTICULATION & PHRASING:
   - %%MIDI trim x/y - Add staccato gaps between notes
     Example: %%MIDI trim 1/16
   - %%MIDI expand x/y - Overlap notes for legato effect
   - %%MIDI chordattack n - Expressivo rolled chords (n in MIDI ticks)
   - %%MIDI randomchordattack n - Random chord roll for natural feel

5. GUITAR CHORDS & ACCOMPANIMENT:
   - %%MIDI gchord string - Chord/bass pattern using f,c,b,z and g,h,i,j for arpeggios
     Example: %%MIDI gchord ghihghih (arpeggiated)
     Example: %%MIDI gchord fzczfzcz (standard boom-chick)
   - %%MIDI gchordon / %%MIDI gchordoff - Toggle accompaniment
   - %%MIDI gchordbars n - Spread gchord pattern over n bars
   - %%MIDI chordprog n octave=m - Set chord instrument with octave shift
   - %%MIDI bassprog n octave=m - Set bass instrument with octave shift
   - %%MIDI chordvol n - Chord velocity (0-127)
   - %%MIDI bassvol n - Bass velocity (0-127)
   - %%MIDI chordname name n1 n2 n3... - Define custom chord voicings

6. DRONES & PADS (for ambient, bagpipe, or sustained textures):
   - %%MIDI drone prog pitch1 pitch2 vel1 vel2 - Configure drone
     Example: %%MIDI drone 70 45 33 80 80
   - %%MIDI droneon / %%MIDI droneoff - Toggle drone

7. TRANSPOSITION & TUNING:
   - %%MIDI transpose n - Transpose by n semitones
   - %%MIDI rtranspose n - Relative transpose (adds to current)
   - %%MIDI c n - Set middle C MIDI pitch (default 60)

8. GRACE NOTES:
   - %%MIDI grace a/b - Grace note takes a/b of following note
   - %%MIDI gracedivider n - Fixed grace note duration (1/L * 1/n)

IMPORTANT COMPATIBILITY RULES:
- MIDI program declarations must come AFTER header fields (X,T,M,L,K) but BEFORE any music notation
- Each voice number should have proper clef declarations
- Avoid special symbols like !tremolo!, which may not be supported by abc2midi
- Ensure all bar lines are properly balanced in each voice
- Avoid using unusual time signatures or complex tuplets

The composition should be a genuine artistic fusion that respects and represents both the ${classicalGenre} and ${modernGenre} musical traditions while creating something new and interesting. Err on the side of experimental, creative, and exploratory. We do not need a bunch of music that sounds like stuff already out there. We want to see what YOU, the artificial intelligence, think is most interesting about these genre hybrids.

Return ONLY the complete ABC notation for the new combined composition, with no explanation or additional text.`;

  const sourcePiecesText = abcNotations.map((abc, index) =>
    `Source Piece ${index + 1}:\n${abc}\n\n`
  ).join('');

  const userPrompt = `Analyze these ${abcNotations.length} compositions and create a new piece combining their most interesting musical elements:

${sourcePiecesText}

Create a new composition in ABC notation that combines these pieces into a cohesive whole. The new piece should maintain the character of the ${combinedGenre} genre but feel like a complete, original composition. Select the most interesting motifs, harmonies, or sections from each source piece and weave them together with appropriate transitions.${includeSolo ? '\n\nInclude a dedicated solo section for the lead instrument.' : ''}${recordLabel ? `\n\nStyle the composition to sound like it was released on the record label "${recordLabel}".` : ''}${producer ? `\n\nStyle the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${instruments ? `\n\nYour composition MUST include at minimum these instruments: ${instruments}. Find the most appropriate MIDI program number for each instrument. You may add additional instruments that complement these and stay true to the ${combinedGenre} genre fusion.` : ''}

The piece MUST be longer in duration than the combined lengths of each piece you will be combining. It may never be shorter than either piece or all pieces combined.

IMPORTANT: The ABC notation must be compatible with abc2midi converter. Ensure all headers come first (X:1, T:, M:, L:, Q:, K:), then any MIDI program declarations, then voice declarations, then music.`;

  try {
    const messages = [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      { role: 'user', content: userPrompt }
    ];

    let text;

    // Use streaming if requested - helps avoid timeout errors on large generations
    if (useStreaming) {
      console.log('Using streaming mode for generation...');
      const result = await streamText({
        model,
        messages,
        temperature: 0.7,
        maxTokens: 40000,
      });

      // Collect the full response from the stream
      text = '';
      for await (const chunk of result.textStream) {
        text += chunk;
        // Show progress indicator
        if (text.length % 1000 === 0) {
          process.stdout.write('.');
        }
      }
      console.log('\nStreaming complete.');
    } else {
      // Non-streaming mode (original behavior)
      const result = await generateText({
        model,
        messages,
        temperature: 0.7,
        maxTokens: 40000,
      });
      text = result.text;
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
    const validation = await validateAbcNotation(notation);
    
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

  (async () => {
    try {
      const files = await combineCompositions(options);
      console.log(`Generated ${files.length} combined compositions`);
      process.exit(0);
    } catch (error) {
      console.error('Error:', error);
      process.exit(1);
    }
  })();
}
