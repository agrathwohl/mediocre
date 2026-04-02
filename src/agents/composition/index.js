/**
 * Composition Generation Agent - AI SDK v6
 * Generates ABC notation for music compositions with genre fusion
 * Core agent for mediocre-music generation pipeline
 */

import { ToolLoopAgent, Output, stepCountIs, streamText } from 'ai';
import { z } from 'zod';
import { validateAbcTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';
import { validateAbcNotation, cleanAbcNotation } from '../../utils/claude.js';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';
import { formatDrumKitForPrompt } from '../drum-arranger/gm-percussion-reference.js';
import { getAnthropic, getModel, supportsContextManagement } from '../../utils/llm-client.js';

/**
 * Assemble structured ABC notation into proper format
 * @param {Object} structured - Structured ABC components
 * @returns {string} Properly formatted ABC notation
 */
function findNearestAllowed(gm, allowedSet) {
  let nearest = 36;
  let minDist = Infinity;
  for (const allowed of allowedSet) {
    const dist = Math.abs(gm - allowed);
    if (dist < minDist) {
      minDist = dist;
      nearest = allowed;
    }
  }
  return nearest;
}

/**
 * Compute a single rest bar based on meter and default note length.
 * @param {string} meter - Time signature like "4/4"
 * @param {string} defaultNoteLength - Default note length like "1/8"
 * @returns {string} ABC rest notation for one full bar
 */
function computeRestBar(meter, defaultNoteLength) {
  try {
    const [mNum, mDen] = meter.split('/').map(Number);
    const [lNum, lDen] = defaultNoteLength.split('/').map(Number);
    const unitsPerBar = Math.round((mNum / mDen) / (lNum / lDen));
    return `z${unitsPerBar}`;
  } catch {
    return 'z4';
  }
}

function assembleAbcNotation(structured, options = {}) {
  const lines = [];

  // Required headers
  lines.push(`X:${structured.referenceNumber}`);
  lines.push(`T:${structured.title}`);
  if (structured.composer) lines.push(`C:${structured.composer}`);
  lines.push(`M:${structured.meter}`);
  lines.push(`L:${structured.defaultNoteLength}`);
  if (structured.tempo) lines.push(`Q:${structured.tempo}`);
  lines.push(`K:${structured.key}`);

  // MIDI extensions
  if (structured.midiExtensions) {
    for (const ext of structured.midiExtensions) {
      switch (ext.type) {
        case 'program':
          if (ext.channel !== undefined) {
            lines.push(`%%MIDI program ${ext.channel} ${ext.program}`);
          } else {
            lines.push(`%%MIDI program ${ext.program}`);
          }
          break;
        case 'drum': {
          const cleanPattern = ext.pattern.replace(/\s+/g, '');
          let programs = ext.programs;
          if (options.allowedDrumNumbers && options.allowedDrumNumbers.size > 0) {
            programs = programs.map(gm =>
              options.allowedDrumNumbers.has(gm) ? gm : findNearestAllowed(gm, options.allowedDrumNumbers)
            );
          }
          lines.push(`%%MIDI drum ${cleanPattern} ${programs.join(' ')} ${programs.map((_, i) => ext.velocities[i] ?? 90).join(' ')}`);
          break;
        }
        case 'gchord':
          lines.push(`%%MIDI gchord ${ext.instrument}`);
          break;
        case 'drummap':
          lines.push(`%%MIDI drummap ${ext.note} ${ext.midiPitch}`);
          break;
        case 'drumon':
          lines.push('%%MIDI drumon');
          break;
        case 'drumoff':
          lines.push('%%MIDI drumoff');
          break;
        case 'channel':
          lines.push(`%%MIDI channel ${ext.channel}`);
          break;
      }
    }
  }

  // Check if any drummap entries exist in midiExtensions
  const hasDrumMap = structured.midiExtensions?.some(ext => ext.type === 'drummap') ?? false;

  // Voices
  for (const voice of structured.voices) {
    const voiceHeader = `[V:${voice.id}${voice.name ? ` ${voice.name}` : ''}${voice.clef ? ` clef=${voice.clef}` : ''}]`;
    lines.push(voiceHeader);
    // Percussion voices MUST be on MIDI channel 10 or they play as melodic instruments
    if (voice.clef === 'perc') {
      lines.push('%%MIDI channel 10');
    }
    if (voice.midiProgram !== undefined) {
      lines.push(`%%MIDI program ${voice.midiProgram}`);
    }
    // Safety net: perc voices WITHOUT drummap get all rests
    // (prevents unmapped notes playing as whistles/bongos on channel 10)
    // Perc voices WITH drummap keep their notes — the agent wrote real rhythmic notation
    if (voice.clef === 'perc' && !hasDrumMap) {
      const restBar = computeRestBar(structured.meter, structured.defaultNoteLength);
      if (Array.isArray(voice.notes)) {
        lines.push(voice.notes.map(() => restBar).join(' | '));
      } else {
        const barCount = Math.max(1, (voice.notes.match(/\|/g) || []).length + 1);
        lines.push(Array(barCount).fill(restBar).join(' | '));
      }
    } else {
      lines.push(Array.isArray(voice.notes) ? voice.notes.join('\n') : voice.notes);
    }
  }

  return lines.join('\n');
}

/**
 * Build a drummap assignment table from drum arranger output.
 * Maps ABC note letters to specific GM percussion sounds so the composition
 * agent can write real rhythmic notation instead of placeholder notes.
 * @param {Array<{gm: number, name: string, role: string}>} drumKit
 * @returns {Array<{abcNote: string, gm: number, name: string, role: string}>}
 */
function buildDrumMapTable(drumKit) {
  // ABC note letters assigned in priority order: foundation → timekeeping → accent → color
  const abcNotes = ['C', 'D', 'E', 'F', 'G', 'A', 'B', 'c', 'd', 'e', 'f', 'g', 'a', 'b'];
  const rolePriority = { foundation: 0, timekeeping: 1, accent: 2, color: 3, ethnic: 4, novelty: 5 };
  const sorted = [...drumKit].sort((a, b) => (rolePriority[a.role] || 5) - (rolePriority[b.role] || 5));
  const mappings = [];
  for (let i = 0; i < sorted.length && i < abcNotes.length; i++) {
    mappings.push({
      abcNote: abcNotes[i],
      gm: sorted[i].gm,
      name: sorted[i].name,
      role: sorted[i].role,
    });
  }
  return mappings;
}

/**
 * Text-mode post-processing safety net: replace unmapped perc voice notes with rests.
 * If a perc voice section has %%MIDI drummap entries, notes are preserved (the agent
 * wrote real rhythmic notation using mapped notes).
 * If a perc voice has NO drummap, note lines become rests to prevent literal MIDI
 * percussion sounds (e.g. lowercase c = MIDI 72 = Long Whistle).
 * @param {string} abcText - Raw ABC notation
 * @returns {string} ABC notation with perc voice safety applied
 */
function enforcePercVoiceNotes(abcText) {
  const lines = abcText.split('\n');

  // Extract meter and default note length from headers
  let meter = '4/4';
  let defaultNoteLength = '1/8';
  for (const line of lines) {
    const mMatch = line.match(/^M:\s*(.+)/);
    if (mMatch) meter = mMatch[1].trim();
    const lMatch = line.match(/^L:\s*(.+)/);
    if (lMatch) defaultNoteLength = lMatch[1].trim();
  }
  const restBar = computeRestBar(meter, defaultNoteLength);

  const result = [];
  let inPercVoice = false;
  let percVoiceHasDrummap = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Detect voice section start
    if (line.match(/^\[V:/)) {
      inPercVoice = line.includes('clef=perc');
      percVoiceHasDrummap = false;

      // Also check for channel 10 without clef=perc
      if (!inPercVoice) {
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^\[V:/)) break;
          if (lines[j].match(/%%MIDI\s+channel\s+10/)) {
            inPercVoice = true;
            break;
          }
        }
      }

      // Look ahead for drummap in this voice section
      if (inPercVoice) {
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].match(/^\[V:/)) break;
          if (lines[j].includes('%%MIDI drummap')) {
            percVoiceHasDrummap = true;
            break;
          }
        }
      }

      result.push(line);
      continue;
    }

    // Detect channel 10 mid-section
    if (line.match(/%%MIDI\s+channel\s+10/) && !inPercVoice) {
      inPercVoice = true;
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^\[V:/)) break;
        if (lines[j].includes('%%MIDI drummap')) {
          percVoiceHasDrummap = true;
          break;
        }
      }
      result.push(line);
      continue;
    }

    // In a perc voice without drummap: replace note lines with rests
    if (inPercVoice && !percVoiceHasDrummap) {
      // Keep directives and headers as-is
      if (line.startsWith('%%') || line.match(/^[A-Z]:/) || line.trim().length === 0) {
        result.push(line);
        continue;
      }
      // Note line: count bars and replace with rest bars
      const barCount = (line.match(/\|/g) || []).length;
      const trailingBar = line.trimEnd().endsWith('|');
      if (barCount > 0) {
        const actualBars = trailingBar ? barCount : barCount + 1;
        result.push(Array(actualBars).fill(restBar).join(' | ') + (trailingBar ? ' |' : ''));
      } else if (line.trim().length > 0) {
        result.push(restBar);
      }
      continue;
    }

    result.push(line);
  }

  return result.join('\n');
}

/**
 * Create a composition agent with dynamic drum constraints.
 * When drumMapTable is provided, the agent's instructions and schema
 * are constrained to use only the drum arranger's selected sounds
 * via %%MIDI drummap notation for musical drum writing.
 * @param {Object} [options]
 * @param {Array} [options.drumMapTable] - From buildDrumMapTable()
 * @returns {ToolLoopAgent}
 */
function createCompositionAgent(options = {}) {
  const anthropic = getAnthropic();
  const { drumMapTable = null } = options;

  // Dynamic drum instructions based on drum arranger's selection
  let drumMapInstructions = '';
  if (drumMapTable && drumMapTable.length > 0) {
    drumMapInstructions = `

DRUM SOUND PALETTE (from drum arranger — use ONLY these in drum notation):
${drumMapTable.map(m => `  ${m.abcNote} → GM ${m.gm} (${m.name}) [${m.role}]`).join('\n')}

In your midiExtensions array, include a drummap entry for each sound you use:
  { type: 'drummap', note: '${drumMapTable[0].abcNote}', midiPitch: ${drumMapTable[0].gm} }
Then in the drum voice notes, write actual rhythmic patterns using those ABC note letters.
Write DIFFERENT patterns per section — fills at transitions, accents on hits, dynamic variation.
Make the drums MUSICAL and ALIVE, not a boring repeating loop.
NEVER use note letters in the drum voice that are NOT in the above mapping. Use z for rests.
You may ALSO add a 'drum' midiExtension for a simple repeating base groove alongside drummap notation.
ONLY use these GM numbers in drum-related midiExtensions: ${drumMapTable.map(m => m.gm).join(', ')}`;
  }

  // Dynamic drum programs description for schema
  const drumProgramsDesc = drumMapTable && drumMapTable.length > 0
    ? `GM drum numbers — ONLY use: ${drumMapTable.map(m => `${m.gm}(${m.name})`).join(', ')}`
    : 'GM drum numbers 35-81. MUST have exactly as many numbers as d characters in pattern!';

  const drumMidiPitchDesc = drumMapTable && drumMapTable.length > 0
    ? `GM drum number — ONLY use: ${drumMapTable.map(m => `${m.gm}(${m.name})`).join(', ')}`
    : 'GM drum number 35-81 to map to';

  return new ToolLoopAgent({
    model: anthropic(getModel('claude-sonnet-4-6'), {
      cacheControl: { type: 'ephemeral', ttl: '1h' },
    }),

    instructions: `You are a music composer specializing in fusion genres.
Your task is to create compositions that authentically blend classical and modern musical traditions.

MUSICOLOGICAL PRINCIPLES:
You compose with authentic technique fidelity — each genre's specific compositional methods must be faithfully implemented, not just superficially referenced. When genre research mentions STYLE FINGERPRINTS, these are non-negotiable requirements that must appear in your composition.

MIXTURE STRATEGY (Alcalde 2022):
When genre research recommends a mixture strategy, structure your entire piece around it:
- CLASH: Keep traditions structurally and perceptually distinct. Different tonalities, registers, textures. Friction is deliberate. Juxtapose (alternate in time) or overlap (superimpose without alignment).
- COEXISTENCE: Find shared traits between traditions and use them as linchpins for integration. Make concessions from each to create a THIRD compound identity — an amalgam, not two things side by side.
- DISTORTION: One tradition is clearly recognizable source material. Alter it with incongruous elements that don't form a second coherent style — they corrupt, exaggerate, or undermine. The source is recognizable but defamiliarized.
- TRAJECTORY: Gradual, traceable transformation from one tradition to another. The process of change must be audible and followable.
If no strategy is specified, default to COEXISTENCE.

You will provide structured components that will be assembled into proper ABC notation automatically.
Focus on the musical content - the formatting will be handled correctly.

CRITICAL: Modern genres (synthwave, techno, electronic, industrial, breakcore, drum and bass, etc.) REQUIRE drums/percussion!
For genre fusions with modern electronic/dance/rock elements, you MUST include a drum voice with clef="perc".

DRUM VOICE RULES:
- Always use clef: "perc" for the drum voice — this automatically assigns MIDI channel 10 (percussion)
- Do NOT set midiProgram on a perc voice (channel 10 ignores program changes)
- PRIMARY METHOD — Use 'drummap' midiExtensions to assign ABC notes to drum sounds, then write REAL notation:
  - Add drummap entries in midiExtensions for each drum sound you use
  - In the drum voice notes, write actual rhythmic patterns using the mapped ABC note letters
  - Write DIFFERENT patterns per section — fills, accents, dynamics — make drums MUSICAL
  - Use z for rests between hits
  - NEVER use note letters in a drum voice that don't have a drummap entry
- ALTERNATIVE — Use the 'drum' midiExtension for a simple repeating pattern:
  - Pattern: ONLY d=hit and z=rest, NO spaces, NO duration numbers (e.g., "dzdzdzdz" not "d2zd z2d")
  - programs array: EXACTLY one GM drum number per 'd' in the pattern
  - velocities array: EXACTLY one 0-127 value per 'd' in the pattern
  - Count your d's! If pattern is "dzdzdzdz" (4 d's), you need exactly 4 programs and 4 velocities
  - When using ONLY %%MIDI drum (no drummap), drum voice notes MUST be all rests (z)
${drumMapInstructions}

Guidelines for other MIDI extensions:
- Use 'program' to set instruments (0-127 General MIDI) for melodic voices
- Use 'gchord' for guitar chord accompaniment
- Use 'drumon'/'drumoff' to enable/disable drum patterns

IMPORTANT: Create drum patterns appropriate for the specific genre fusion!

TOOL USE: Do NOT call validate_abc before generating the composition. Generate the full composition first, then optionally use validate_abc to self-correct if you believe there may be errors.

VOICE NOTES FORMAT:
- Each voice's 'notes' field is an ARRAY where each element is ONE MEASURE
- Example: notes: ["defg abcd", "efga bcde", "fgab cdef"]
- Each measure should be a complete bar according to the time signature
- Measures will be automatically joined with | separator during assembly

ABC OCTAVE NOTATION (CRITICAL - DO NOT USE COMMAS):
- C,, D,, E,, F,, G,, A,, B,, = great octave (very low)
- C, D, E, F, G, A, B, = small octave (low)
- C D E F G A B = one-line octave (middle)
- c d e f g a b = two-line octave (high)
- c' d' e' f' g' a' b' = three-line octave (very high)
- NEVER use lowercase notes with commas (a, b, c,) - ONLY use uppercase with commas for low octaves
- For high octaves, use lowercase letters and add apostrophes (c' d' e')
- Example valid notes: C, D, E F G A B c d e f g a b c' d' e'
- Example INVALID (will cause errors): a, b, c, d, e, f, g,

${ABC2MIDI_REFERENCE}`,

    output: Output.object({
      schema: z.object({
        // Required headers
        referenceNumber: z.number().describe('Reference number (e.g., 1)'),
        title: z.string().describe('Composition title'),
        meter: z.string().describe('Time signature (e.g., "4/4", "3/4", "6/8")'),
        defaultNoteLength: z.string().describe('Default note length (e.g., "1/8", "1/4")'),
        key: z.string().describe('Key signature (e.g., "C", "Dm", "G major")'),

        // Optional headers
        composer: z.string().optional().describe('Composer name'),
        tempo: z.string().optional().describe('Tempo marking (e.g., "1/4=120")'),

        // Structured MIDI extensions
        midiExtensions: z.array(z.discriminatedUnion('type', [
          z.object({
            type: z.literal('program'),
            channel: z.number().optional().describe('MIDI channel 1-16'),
            program: z.number().describe('MIDI program number 0-127'),
          }),
          z.object({
            type: z.literal('drum'),
            pattern: z.string().describe('Drum pattern using d=hit, z=rest (e.g., "dddd"). Count the d characters!'),
            programs: z.array(z.number()).describe(drumProgramsDesc),
            velocities: z.array(z.number()).describe('Hit velocities 0-127. MUST have exactly as many numbers as d characters in pattern!'),
          }),
          z.object({
            type: z.literal('gchord'),
            instrument: z.number().describe('Instrument 0-127 for chord accompaniment'),
          }),
          z.object({
            type: z.literal('drummap'),
            note: z.string().describe('ABC note letter to map (e.g., C, D, E, F, G, A, B)'),
            midiPitch: z.number().describe(drumMidiPitchDesc),
          }),
          z.object({
            type: z.enum(['drumon', 'drumoff']),
          }),
          z.object({
            type: z.literal('channel'),
            channel: z.number().describe('Melody channel 1-16'),
          }),
        ])).optional().describe('MIDI extensions for instruments and effects'),

        // Voices
        voices: z.array(z.object({
          id: z.string().describe('Voice ID like 1, melody, bass'),
          name: z.string().optional().describe('Voice name for readability'),
          clef: z.enum(['treble', 'bass', 'alto', 'tenor', 'treble+8', 'treble-8', 'bass+8', 'bass-8', 'perc']).optional().describe('Musical clef — use "perc" for drum/percussion voices (auto-assigns MIDI channel 10)'),
          midiProgram: z.number().optional().describe('MIDI instrument 0-127 for this voice'),
          notes: z.union([
            z.string(),
            z.array(z.string()),
          ]).describe('ABC note sequence for this voice - measures separated by | (may be a single string or array of measure strings)'),
        })).describe('Musical voices/parts - at least 1 required'),
      }),
    }),

    tools: {
      validate_abc: validateAbcTool,
    },

    stopWhen: stepCountIs(15),
    toolChoice: 'auto',
  });
}

// Default instance for backwards compatibility (no drum constraints)
export const compositionAgent = createCompositionAgent();

const isAbcCrash = (errs) => errs.some(e => e.includes('crashed') || e.includes('SIGSEGV') || e.includes('SIGABRT'));

/**
 * Build text-mode system prompt with dynamic drum constraints.
 * @param {Array|null} drumMapTable - From buildDrumMapTable(), or null
 * @returns {string} System prompt for text-mode composition
 */
function buildTextModeSystemPrompt(drumMapTable = null) {
  let percSection;

  if (drumMapTable && drumMapTable.length > 0) {
    const exampleNotes = drumMapTable.slice(0, 3);
    percSection = `- PERCUSSION VOICES (CRITICAL — read carefully):
  Use %%MIDI drummap to assign ABC note letters to specific drum sounds, then write REAL rhythmic notation.
  Your drum sound assignments for this composition:
${drumMapTable.map(m => `    %%MIDI drummap ${m.abcNote} ${m.gm}   (${m.abcNote} = ${m.name} [${m.role}])`).join('\n')}
  Write each %%MIDI drummap directive inside the drum voice section, then write musical patterns using those note letters.
  CORRECT drum voice:
    [V:drums name="Drums" clef=perc]
    %%MIDI channel 10
${exampleNotes.map(m => `    %%MIDI drummap ${m.abcNote} ${m.gm}`).join('\n')}
    ${exampleNotes.map(m => m.abcNote).join(' ')} ${exampleNotes[0].abcNote} | ${exampleNotes.map(m => m.abcNote).join(' ')} z | ${exampleNotes[0].abcNote} z ${exampleNotes[1]?.abcNote || 'z'} ${exampleNotes[2]?.abcNote || 'z'} ${exampleNotes[0].abcNote} z ${exampleNotes[1]?.abcNote || 'z'} ${exampleNotes[2]?.abcNote || 'z'} |
  Write DIFFERENT patterns per section — fills, accents, dynamics. Make the drums MUSICAL.
  NEVER use note letters that are NOT in the above drummap assignments. Use z for rests between hits.
  ONLY use these GM drum numbers: ${drumMapTable.map(m => m.gm).join(', ')}
  You MAY also use %%MIDI drum for a simple repeating base groove, but drummap notation is preferred.`;
  } else {
    percSection = `- PERCUSSION VOICES (CRITICAL — read carefully):
  Use %%MIDI drummap to assign ABC note letters to GM drum sounds, then write rhythmic notation.
  Common setup:
    %%MIDI drummap C 36   (C = Bass Drum)
    %%MIDI drummap D 38   (D = Snare)
    %%MIDI drummap E 42   (E = Closed Hi-Hat)
    %%MIDI drummap F 46   (F = Open Hi-Hat)
    %%MIDI drummap G 49   (G = Crash Cymbal)
  CORRECT drum voice:
    [V:drums name="Drums" clef=perc]
    %%MIDI channel 10
    %%MIDI drummap C 36
    %%MIDI drummap D 38
    %%MIDI drummap E 42
    E E D E | E E D E | C z D E C z D E |
  NEVER write notes in a drum voice WITHOUT %%MIDI drummap — they play as literal MIDI percussion
  (e.g., lowercase c = MIDI 72 = Long Whistle — NOT what you want).
  Always set up drummap first, then write notation using only mapped notes and z for rests.
  Common GM drums: 36=Bass Drum, 38=Snare, 42=Closed Hi-Hat, 46=Open Hi-Hat, 49=Crash, 51=Ride, 37=Rim, 39=Clap
  For breakcore/jungle/Venetian Snares style: use dense irregular patterns at high BPM (160-200+)`;
  }

  return `You are a music composer specializing in fusion genres.
Output ONLY valid ABC notation — no markdown fences, no explanatory text, no reasoning, nothing before X:1.

MUSICOLOGICAL PRINCIPLES:
You compose with authentic technique fidelity — each genre's specific compositional methods must be faithfully implemented, not just superficially referenced. When genre research mentions STYLE FINGERPRINTS, these are non-negotiable requirements that must appear in your composition.

MIXTURE STRATEGY (Alcalde 2022):
When genre research recommends a mixture strategy, structure your entire piece around it:
- CLASH: Keep traditions structurally and perceptually distinct. Different tonalities, registers, textures. Friction is deliberate. Juxtapose (alternate in time) or overlap (superimpose without alignment).
- COEXISTENCE: Find shared traits between traditions and use them as linchpins for integration. Make concessions from each to create a THIRD compound identity — an amalgam, not two things side by side.
- DISTORTION: One tradition is clearly recognizable source material. Alter it with incongruous elements that don't form a second coherent style — they corrupt, exaggerate, or undermine. The source is recognizable but defamiliarized.
- TRAJECTORY: Gradual, traceable transformation from one tradition to another. The process of change must be audible and followable.
If no strategy is specified, default to COEXISTENCE.

ABC NOTATION RULES:
- Required headers in order: X: T: M: L: Q: K:
- MIDI PROGRAM PLACEMENT (CRITICAL): %%MIDI program N must appear INSIDE each voice section,
  on the line immediately after [V:N ...], NEVER in a block before the voices.
  CORRECT:
    [V:1 name="Violin" clef=treble]
    %%MIDI program 40
    C D E F |
  WRONG (do not do this):
    %%MIDI program 0 40
    %%MIDI program 1 42
    [V:1 name="Violin" clef=treble]
- %%MIDI program takes ONE argument (the GM program number 0-127). Never two arguments.
${percSection}
- Multi-voice: use [V:1], [V:2] etc., NO blank lines between voice sections
- OCTAVE NOTATION (CRITICAL):
  - C, D, = low octave (uppercase + comma)
  - C D E = middle octave (uppercase)
  - c d e = high octave (lowercase)
  - c' d' = very high (lowercase + apostrophe)
  - NEVER use lowercase letters with commas (a, b, c, — INVALID)`;
}

/**
 * Generate ABC notation using the composition agent
 * @param {Object} options - Generation options
 * @param {string} options.genre - Full genre name (e.g., "baroque_x_synthwave")
 * @param {string} options.classicalGenre - Classical component
 * @param {string} options.modernGenre - Modern component
 * @param {string} [options.style] - Style descriptor
 * @param {boolean} [options.objectMode=false] - Use structured object output (default: text mode)
 * @param {boolean} [options.solo] - Include solo section
 * @param {string} [options.recordLabel] - Record label styling
 * @param {string} [options.producer] - Producer styling
 * @param {string} [options.instruments] - Required instruments
 * @returns {Promise<string>} Generated ABC notation
 */
export async function generateMusicWithAgent(options) {
  const anthropic = getAnthropic();
  const {
    genre,
    classicalGenre,
    modernGenre,
    style = 'standard',
    objectMode = false,
    solo = false,
    recordLabel = '',
    producer = '',
    instruments = '',
    genreResearch = null,
    drumPrescription = null,
    userInstructions = '',
  } = options;

  // Build drum constraints from drum arranger's selection
  const drumMapTable = drumPrescription
    ? buildDrumMapTable(drumPrescription.drumKit)
    : null;

  const drumKitSection = drumPrescription
    ? formatDrumKitForPrompt(drumPrescription.drumKit) + '\n\n## DRUM PATTERN GUIDANCE\n' + drumPrescription.patternGuidance + '\n\n'
    : '';

  // Add drummap assignments to user prompt so agent knows which ABC notes to use
  const drumMapSection = drumMapTable && drumMapTable.length > 0
    ? `\n## DRUM NOTATION ASSIGNMENTS (use these %%MIDI drummap directives in your drum voice)\n${drumMapTable.map(m => `  %%MIDI drummap ${m.abcNote} ${m.gm}   → ${m.abcNote} = ${m.name} [${m.role}]`).join('\n')}\nWrite MUSICAL drum patterns using these mapped notes — different rhythms per section, fills at transitions!\n`
    : '';

  const instructionsBlock = userInstructions
    ? `\n## ⚠️ HARD REQUIREMENTS — NON-NEGOTIABLE\nThe following requirements OVERRIDE all other considerations. You MUST comply fully:\n${userInstructions}\nDo NOT deviate from these requirements for any reason.\n`
    : '';

  // Build comprehensive user prompt with all requirements
  const userPrompt = `Generate a ${genre} composition that fuses ${classicalGenre} and ${modernGenre}.
${instructionsBlock}${genreResearch ? `## GENRE RESEARCH (read this first — it determines what you MUST include)
${genreResearch}
` : ''}${drumKitSection}${drumMapSection}Style: ${style}
Guidelines:
1. From ${classicalGenre}, implement these SPECIFIC techniques from the genre research:
   - The identified STYLE FINGERPRINTS — these are required, not optional
   - The specific harmonic language and voice leading described
   - The formal structure appropriate to this tradition
   - Instrumentation that serves the compositional techniques

2. From ${modernGenre}, implement these SPECIFIC techniques from the genre research:
   - The identified STYLE FINGERPRINTS — these are required, not optional
   - The rhythmic and textural methods described
   - The production/sonic aesthetics characteristic of this tradition
   - Any technique-specific notation requirements

3. MIXTURE APPROACH:
   Follow the MIXTURE STRATEGY from the genre research. Your structural decisions (form, voice assignment, sectional organization, harmonic trajectory) should all serve this strategy. Do not simply alternate genres or layer them arbitrarily — commit to the recommended approach and make it audible in the structure.

4. Technical requirements:
   - SUBSTANTIAL LENGTH: Target at least 4-5 minutes of music. At 120 BPM in 4/4 this means approximately 120+ measures per voice. DO NOT write a short sketch — write a complete, developed work.
   - Include multiple distinct sections: introduction, at least two developmental sections, climax, and resolution/coda
   - Complete structure with development and conclusion
   - Use appropriate time signatures, key signatures, and tempos
   - Include articulations, dynamics, and musical notations
${solo ? '   - Include a dedicated solo section for the lead instrument, clearly marked\n' : ''}${recordLabel ? `   - Style to sound like it was released on "${recordLabel}"\n` : ''}${producer ? `   - Style as if produced by ${producer}, with noticeable production characteristics\n` : ''}${instruments ? `   - MUST include these instruments: ${instruments}\n   - Use appropriate MIDI program numbers for each instrument\n` : ''}
Generate complete ABC notation with:
- Unique title (T:)
- Proper headers (X:, M:, L:, K:)
- Multi-voice arrangement if appropriate
- MIDI program assignments (%%MIDI program)
- Authentic genre fusion in both harmony and melody

Remember: NO BLANK LINES between voice sections or elements!`;

  try {
    let abcNotation;

    if (objectMode) {
      // Create agent with dynamic drum constraints
      const agent = createCompositionAgent({ drumMapTable });
      const { output } = await agent.generate({
        prompt: userPrompt,
        onStepFinish: createStepLogger('CompositionAgent[object]'),
      });
      const allowedDrumNumbers = drumPrescription
        ? new Set(drumPrescription.drumKit.map(s => s.gm))
        : null;
      abcNotation = assembleAbcNotation(output, { allowedDrumNumbers });
      console.log(`✅ Composition generated [object]: ${output.title} (${output.voices.length} voice(s))`);
    } else {
      const result = streamText({
        model: anthropic(getModel('claude-sonnet-4-6'), { cacheControl: { type: 'ephemeral', ttl: '1h' } }),
        system: buildTextModeSystemPrompt(drumMapTable),
        prompt: userPrompt,
        providerOptions: {
          anthropic: {
            thinking: { type: 'disabled' },
            ...(supportsContextManagement() && {
              contextManagement: {
                edits: [
                  {
                    type: 'clear_tool_uses_20250919',
                    trigger: { type: 'input_tokens', value: 20000 },
                    keep: { type: 'tool_uses', value: 2 },
                    clearToolInputs: true,
                  },
                ],
              },
            }),
          },
        },
      });
      let text = '';
      for await (const delta of result.textStream) {
        process.stdout.write(delta);
        text += delta;
      }
      process.stdout.write('\n');
      // Strip any accidental markdown fences
      abcNotation = text.replace(/^```[^\n]*\n?/gm, '').replace(/^```$/gm, '').trim();
      // Safety net: enforce perc voice notes (replace unmapped notes with rests)
      abcNotation = enforcePercVoiceNotes(abcNotation);
      const titleMatch = abcNotation.match(/^T:(.+)$/m);
      console.log(`✅ Composition generated [text]: ${titleMatch ? titleMatch[1].trim() : '(untitled)'}`);
    }

    // Clean before validating — catches control chars, malformed MIDI directives, etc.
    abcNotation = cleanAbcNotation(abcNotation);

    // Validate assembled ABC with actual abc2midi -c
    let validation = await validateAbcNotation(abcNotation);
    let warnings = validation.warnings || [];
    let errors = validation.issues || [];

    // Multi-pass error correction (up to 3 attempts)
    // On initial SIGSEGV: cleanAbcNotation already ran, so throw — nothing more to try here
    if (errors.length > 0) {
      if (isAbcCrash(errors)) {
        const crashErr = new Error(`abc2midi crashed (SIGSEGV/SIGABRT) on initial generation — aborting`);
        crashErr.abcNotation = abcNotation;
        throw crashErr;
      }
      for (let pass = 1; pass <= 3 && errors.length > 0; pass++) {
        console.warn(`⚠️ abc2midi reported ${errors.length} error(s) - correction pass ${pass}/3...`);
        try {
          const corrected = await modifyMusicWithAgent({
            currentAbc: abcNotation,
            modificationDirective: `Fix these abc2midi errors (${errors.length} total). Each error is a syntax or structural problem that will cause corrupted MIDI output. Fix ALL of them: ${errors.slice(0, 20).join('; ')}`,
            genre,
            classicalGenre,
            modernGenre,
            objectMode: false,
            _isCorrection: true,
          });
          abcNotation = corrected;
          const revalidation = await validateAbcNotation(abcNotation);
          errors = revalidation.issues || [];
          warnings = revalidation.warnings || [];
          if (isAbcCrash(errors)) {
            const crashErr = new Error(`abc2midi crashed (SIGSEGV/SIGABRT) after correction pass ${pass} — aborting`);
            crashErr.abcNotation = abcNotation;
            throw crashErr;
          }
          if (errors.length === 0) {
            console.log(`✅ All errors resolved after correction pass ${pass}`);
          } else {
            console.warn(`   Still ${errors.length} error(s) after pass ${pass}`);
          }
        } catch (correctionError) {
          console.warn(`⚠️ Error correction pass ${pass} failed:`, correctionError.message);
          if (correctionError.message.includes('SIGSEGV') || correctionError.message.includes('SIGABRT') || correctionError.message.includes('crashed')) {
            if (!correctionError.abcNotation) correctionError.abcNotation = abcNotation;
            throw correctionError;
          }
          break;
        }
      }
      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} error(s) remain after correction — orchestrator will gate on this`);
      }
    }

    // Warning correction pass (single pass, after errors are handled)
    if (warnings.length > 0) {
      console.warn(`⚠️ ${warnings.length} abc2midi timing warning(s) - sending to agent for self-correction...`);
      const sampleWarnings = warnings.slice(0, 10);
      try {
        const corrected = await modifyMusicWithAgent({
          currentAbc: abcNotation,
          modificationDirective: `Fix ${warnings.length} abc2midi timing warning(s). Each warning means a bar's note values don't sum to the correct duration for the time signature. Fix every bar so its notes sum exactly to the meter. Sample warnings: ${sampleWarnings.join('; ')}`,
          genre,
          classicalGenre,
          modernGenre,
            objectMode: false,
          _isCorrection: true,
        });
        abcNotation = corrected;
      } catch (correctionError) {
        console.warn('⚠️ Warning self-correction failed, continuing with warnings:', correctionError.message);
      }
    }

    return abcNotation;

  } catch (error) {
    console.error('Composition agent error:', error.message);
    throw error;
  }
}

/**
 * Modify existing ABC notation using the composition agent
 * @param {Object} options - Modification options
 * @param {string} options.currentAbc - Current ABC notation to modify
 * @param {string} options.modificationDirective - What specifically to change
 * @param {Object} [options.qaFeedback] - QA evaluation feedback
 * @param {string} [options.genre] - Full genre name
 * @param {string} [options.classicalGenre] - Classical component
 * @param {string} [options.modernGenre] - Modern component
 * @returns {Promise<string>} Modified ABC notation
 */
export async function modifyMusicWithAgent(options) {
  const anthropic = getAnthropic();
  const {
    currentAbc,
    modificationDirective,
    qaFeedback = null,
    genre = '',
    classicalGenre = '',
    modernGenre = '',
    objectMode = false,
    _isCorrection = false,
    drumPrescription = null,
    userInstructions = '',
    customSystemPrompt = null,
  } = options;

  // Build drum constraints from drum arranger's selection
  const drumMapTable = drumPrescription
    ? buildDrumMapTable(drumPrescription.drumKit)
    : null;

  const qaSection = qaFeedback ? `
## QA EVALUATION FEEDBACK
Scores: Technical=${qaFeedback.scores?.technical}/10, Musical=${qaFeedback.scores?.musical}/10, Fusion=${qaFeedback.scores?.fusion}/10, Completeness=${qaFeedback.scores?.completeness}/10
Verdict: ${qaFeedback.verdict}

High priority issues:
${qaFeedback.recommendations?.filter(r => r.priority === 'high').map(r => `- [${r.category}] ${r.action}`).join('\n') || 'None'}

Medium priority issues:
${qaFeedback.recommendations?.filter(r => r.priority === 'medium').map(r => `- [${r.category}] ${r.action}`).join('\n') || 'None'}` : '';

  const modifyInstructionsBlock = userInstructions
    ? `\n## ⚠️ HARD REQUIREMENTS — NON-NEGOTIABLE\nThese requirements MUST be maintained throughout all modifications:\n${userInstructions}\n`
    : '';

  const userPrompt = objectMode
    ? `You are modifying an existing ${genre} composition (${classicalGenre} x ${modernGenre}).
${modifyInstructionsBlock}
## MODIFICATION DIRECTIVE
${modificationDirective}
${qaSection}

## CURRENT ABC NOTATION
\`\`\`
${currentAbc}
\`\`\`

## YOUR TASK
Return the COMPLETE modified composition as structured output.
- Apply ONLY the changes described in the directive
- Preserve everything else exactly as-is (key, meter, tempo, other voices)
- Keep the same title unless the directive asks to change it
- The output must be a complete valid composition, not just the changed parts

Remember: NO BLANK LINES between voice sections or elements!`
    : `You are modifying an existing ${genre} composition (${classicalGenre} x ${modernGenre}).
${modifyInstructionsBlock}
## MODIFICATION DIRECTIVE
${modificationDirective}
${qaSection}

## CURRENT ABC NOTATION
\`\`\`
${currentAbc}
\`\`\`

## YOUR TASK
Output ONLY the COMPLETE modified ABC notation — no markdown fences, no explanation.
- Apply ONLY the changes described in the directive
- Preserve everything else exactly as-is (key, meter, tempo, other voices)
- Keep the same title unless the directive asks to change it
- NO BLANK LINES between voice sections or elements`;

  try {
    let abcNotation;

    if (objectMode) {
      // Create agent with dynamic drum constraints
      const agent = createCompositionAgent({ drumMapTable });
      const { output } = await agent.generate({
        prompt: userPrompt,
        onStepFinish: createStepLogger('CompositionAgent[modify/object]'),
      });
      const modAllowedDrums = drumPrescription
        ? new Set(drumPrescription.drumKit.map(s => s.gm))
        : null;
      abcNotation = assembleAbcNotation(output, { allowedDrumNumbers: modAllowedDrums });
      console.log(`✅ Composition modified [object]: ${output.title}`);
    } else {
      const modResult = streamText({
        model: anthropic(getModel('claude-sonnet-4-6'), { cacheControl: { type: 'ephemeral', ttl: '1h' } }),
        system: buildTextModeSystemPrompt(drumMapTable) + (customSystemPrompt ? '\n\n## EXTENDED DIRECTIVE SET\n' + customSystemPrompt : ''),
        prompt: userPrompt,
        providerOptions: {
          anthropic: {
            thinking: { type: 'disabled' },
            ...(supportsContextManagement() && {
              contextManagement: {
                edits: [
                  {
                    type: 'clear_tool_uses_20250919',
                    trigger: { type: 'input_tokens', value: 20000 },
                    keep: { type: 'tool_uses', value: 2 },
                    clearToolInputs: true,
                  },
                ],
              },
            }),
          },
        },
      });
      let text = '';
      for await (const delta of modResult.textStream) {
        if (!_isCorrection) process.stdout.write(delta);
        text += delta;
      }
      if (!_isCorrection) process.stdout.write('\n');
      abcNotation = text.replace(/^```[^\n]*\n?/gm, '').replace(/^```$/gm, '').trim();
      // Safety net: enforce perc voice notes (replace unmapped notes with rests)
      abcNotation = enforcePercVoiceNotes(abcNotation);
      const titleMatch = abcNotation.match(/^T:(.+)$/m);
      console.log(`✅ Composition modified [text]: ${titleMatch ? titleMatch[1].trim() : '(untitled)'}`);
    }

    abcNotation = cleanAbcNotation(abcNotation);

    let validation = await validateAbcNotation(abcNotation);
    let warnings = validation.warnings || [];
    let errors = validation.issues || [];

    // Multi-pass error correction (up to 3 attempts, only when not already in correction)
    if (errors.length > 0 && !_isCorrection) {
      if (isAbcCrash(errors)) {
        throw new Error(`abc2midi crashed (SIGSEGV/SIGABRT) — aborting modification`);
      }
      for (let pass = 1; pass <= 3 && errors.length > 0; pass++) {
        console.warn(`⚠️ abc2midi reported ${errors.length} error(s) - correction pass ${pass}/3...`);
        try {
          const corrected = await modifyMusicWithAgent({
            currentAbc: abcNotation,
            modificationDirective: `Fix these abc2midi errors (${errors.length} total). Each error is a syntax or structural problem that will cause corrupted MIDI output. Fix ALL of them: ${errors.slice(0, 20).join('; ')}`,
            genre,
            classicalGenre,
            modernGenre,
            objectMode: false,
            _isCorrection: true,
          });
          abcNotation = corrected;
          const revalidation = await validateAbcNotation(abcNotation);
          errors = revalidation.issues || [];
          warnings = revalidation.warnings || [];
          if (isAbcCrash(errors)) {
            throw new Error(`abc2midi crashed (SIGSEGV/SIGABRT) after correction pass ${pass} — aborting`);
          }
          if (errors.length === 0) {
            console.log(`✅ All errors resolved after correction pass ${pass}`);
          } else {
            console.warn(`   Still ${errors.length} error(s) after pass ${pass}`);
          }
        } catch (correctionError) {
          console.warn(`⚠️ Error correction pass ${pass} failed:`, correctionError.message);
          if (correctionError.message.includes('SIGSEGV') || correctionError.message.includes('SIGABRT') || correctionError.message.includes('crashed')) {
            throw correctionError;
          }
          break;
        }
      }
      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} error(s) remain after correction — orchestrator will gate on this`);
      }
    } else if (errors.length > 0) {
      console.warn(`⚠️ abc2midi still has ${errors.length} error(s) (in correction pass, not recursing)`);
    }

    // Warning correction (single pass, only when not in correction)
    if (warnings.length > 0 && !_isCorrection) {
      console.warn(`⚠️ ${warnings.length} abc2midi timing warning(s) - sending to agent for self-correction...`);
      const sampleWarnings = warnings.slice(0, 10);
      try {
        const corrected = await modifyMusicWithAgent({
          currentAbc: abcNotation,
          modificationDirective: `Fix ${warnings.length} abc2midi timing warning(s). Each warning means a bar's note values don't sum to the correct duration for the time signature. Fix every bar so its notes sum exactly to the meter. Sample warnings: ${sampleWarnings.join('; ')}`,
          genre,
          classicalGenre,
          modernGenre,
            objectMode: false,
          _isCorrection: true,
        });
        abcNotation = corrected;
      } catch (correctionError) {
        console.warn('⚠️ Warning self-correction failed, continuing with warnings:', correctionError.message);
      }
    } else if (warnings.length > 0) {
      console.warn(`⚠️ abc2midi still has ${warnings.length} timing warning(s) (in correction pass, not recursing)`);
    }

    return abcNotation;

  } catch (error) {
    console.error('Composition modification error:', error.message);
    throw error;
  }
}
