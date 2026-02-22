/**
 * Composition Generation Agent - AI SDK v6
 * Generates ABC notation for music compositions with genre fusion
 * Core agent for mediocre-music generation pipeline
 */

import { ToolLoopAgent, Output, stepCountIs, generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { validateAbcTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';
import { validateAbcNotation, cleanAbcNotation } from '../../utils/claude.js';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Assemble structured ABC notation into proper format
 * @param {Object} structured - Structured ABC components
 * @returns {string} Properly formatted ABC notation
 */
function assembleAbcNotation(structured) {
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
          // Pattern must be a single word — strip any spaces the LLM may have inserted
          const cleanPattern = ext.pattern.replace(/\s+/g, '');
          lines.push(`%%MIDI drum ${cleanPattern} ${ext.programs.join(' ')} ${ext.velocities.join(' ')}`);
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
    lines.push(Array.isArray(voice.notes) ? voice.notes.join('\n') : voice.notes);
  }

  return lines.join('\n');
}

/**
 * Composition Generation Agent
 * Uses Claude Sonnet with fully structured ABC notation output
 * Features: Validated structure, zero formatting errors, genre fusion
 */
export const compositionAgent = new ToolLoopAgent({
  model: anthropic('claude-sonnet-4-6', {
    cacheControl: { type: 'ephemeral', ttl: '1h' },
  }),

  instructions: `You are a music composer specializing in fusion genres.
Your task is to create compositions that authentically blend classical and modern musical traditions.

You will provide structured components that will be assembled into proper ABC notation automatically.
Focus on the musical content - the formatting will be handled correctly.

CRITICAL: Modern genres (synthwave, techno, electronic, industrial, breakcore, drum and bass, etc.) REQUIRE drums/percussion!
For genre fusions with modern electronic/dance/rock elements, you MUST include a drum voice with clef="perc".

DRUM VOICE RULES:
- Always use clef: "perc" for the drum voice — this automatically assigns MIDI channel 10 (percussion)
- Do NOT set midiProgram on a perc voice (channel 10 ignores program changes)
- Use the 'drum' midiExtension for the repeating pattern:
  - Pattern: ONLY d=hit and z=rest, NO spaces, NO duration numbers (e.g., "dzdzdzdz" not "d2zd z2d")
  - programs array: EXACTLY one GM drum number per 'd' in the pattern (36=Kick, 38=Snare, 42=Hi-Hat, 46=Open Hi-Hat, 49=Crash, 47=Tom)
  - velocities array: EXACTLY one 0-127 value per 'd' in the pattern
  - Count your d's! If pattern is "dzdzdzdz" (4 d's), you need exactly 4 programs and 4 velocities
  - Example: pattern "dzdzdzdz", programs [36,38,42,38], velocities [110,90,70,90] ✓
  - WRONG: pattern "d2zd zddd", programs [36,38,42,49], velocities [100,80,70,90] ✗ (spaces, duration chars, wrong count)

Guidelines for other MIDI extensions:
- Use 'program' to set instruments (0-127 General MIDI) for melodic voices
- Use 'gchord' for guitar chord accompaniment
- Use 'drummap' to map specific notes to drum sounds
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
          programs: z.array(z.number()).describe('GM drum numbers 35-81. MUST have exactly as many numbers as d characters in pattern!'),
          velocities: z.array(z.number()).describe('Hit velocities 0-127. MUST have exactly as many numbers as d characters in pattern!'),
        }),
        z.object({
          type: z.literal('gchord'),
          instrument: z.number().describe('Instrument 0-127 for chord accompaniment'),
        }),
        z.object({
          type: z.literal('drummap'),
          note: z.string().describe('ABC note like C, D\', E,,'),
          midiPitch: z.number().describe('GM drum number 35-81 to map to'),
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

const isAbcCrash = (errs) => errs.some(e => e.includes('crashed') || e.includes('SIGSEGV') || e.includes('SIGABRT'));

const TEXT_MODE_SYSTEM_PROMPT = `You are a music composer specializing in fusion genres.
Output ONLY valid ABC notation — no markdown fences, no explanatory text, no reasoning, nothing before X:1.

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
- PERCUSSION VOICES (CRITICAL — read carefully):
  A drum voice uses %%MIDI drum, NOT pitched notes. The drum voice notes are just timing placeholders (z = rest, c = beat).
  The %%MIDI drum directive maps those placeholder notes to actual GM drum sounds.
  CORRECT drum voice:
    [V:drums name="Drums" clef=perc]
    %%MIDI channel 10
    %%MIDI drum dzdzdzdz 36 38 36 38 36 38 36 38 120 90 110 85 100 80 95 75
    c c c c | c c c c | c c c c | c c c c |
  Where: d=hit, z=rest in pattern; programs list GM numbers for each d; velocities for each d.
  Common GM drums: 36=Bass Drum, 38=Snare, 42=Closed Hi-Hat, 46=Open Hi-Hat, 49=Crash, 51=Ride, 37=Rim, 39=Clap
  For breakcore/jungle/Venetian Snares style: use dense irregular patterns like ddzddzdz or ddddzddd at high BPM (160-200+)
  DO NOT write pitched notes (C D E etc.) in a drum voice — only z and c as timing, with %%MIDI drum doing the work.
- Multi-voice: use [V:1], [V:2] etc., NO blank lines between voice sections
- OCTAVE NOTATION (CRITICAL):
  - C, D, = low octave (uppercase + comma)
  - C D E = middle octave (uppercase)
  - c d e = high octave (lowercase)
  - c' d' = very high (lowercase + apostrophe)
  - NEVER use lowercase letters with commas (a, b, c, — INVALID)`;

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
  } = options;

  // Build comprehensive user prompt with all requirements
  const userPrompt = `Generate a ${genre} composition that fuses ${classicalGenre} and ${modernGenre}.

${genreResearch ? `## GENRE RESEARCH (read this first — it determines what you MUST include)
${genreResearch}

` : ''}Style: ${style}

Guidelines:
1. From ${classicalGenre}, incorporate:
   - Appropriate harmonic structures
   - Melodic patterns and motifs
   - Formal structures
   - Typical instrumentation choices

2. From ${modernGenre}, incorporate:
   - Rhythmic elements
   - Textural approaches
   - Production aesthetics
   - Distinctive sounds or techniques

3. Technical requirements:
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
      const { output } = await compositionAgent.generate({
        prompt: userPrompt,
        onStepFinish: createStepLogger('CompositionAgent[object]'),
      });
      abcNotation = assembleAbcNotation(output);
      console.log(`✅ Composition generated [object]: ${output.title} (${output.voices.length} voice(s))`);
    } else {
      const { text } = await generateText({
        model: anthropic('claude-sonnet-4-6', { cacheControl: { type: 'ephemeral', ttl: '1h' } }),
        system: TEXT_MODE_SYSTEM_PROMPT,
        prompt: userPrompt,
        providerOptions: {
          anthropic: {
            thinking: { type: 'disabled' },
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
          },
        },
      });
      // Strip any accidental markdown fences
      abcNotation = text.replace(/^```[^\n]*\n?/gm, '').replace(/^```$/gm, '').trim();
      const titleMatch = abcNotation.match(/^T:(.+)$/m);
      console.log(`✅ Composition generated [text]: ${titleMatch ? titleMatch[1].trim() : '(untitled)'}`);
    }

    // Clean before validating — catches control chars, malformed MIDI directives, etc.
    abcNotation = cleanAbcNotation(abcNotation);

    // Validate assembled ABC with actual abc2midi -c
    let validation = validateAbcNotation(abcNotation);
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
            objectMode,
            _isCorrection: true,
          });
          abcNotation = corrected;
          const revalidation = validateAbcNotation(abcNotation);
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
          objectMode,
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
  const {
    currentAbc,
    modificationDirective,
    qaFeedback = null,
    genre = '',
    classicalGenre = '',
    modernGenre = '',
    objectMode = false,
    _isCorrection = false,
  } = options;

  const qaSection = qaFeedback ? `
## QA EVALUATION FEEDBACK
Scores: Technical=${qaFeedback.scores?.technical}/10, Musical=${qaFeedback.scores?.musical}/10, Fusion=${qaFeedback.scores?.fusion}/10, Completeness=${qaFeedback.scores?.completeness}/10
Verdict: ${qaFeedback.verdict}

High priority issues:
${qaFeedback.recommendations?.filter(r => r.priority === 'high').map(r => `- [${r.category}] ${r.action}`).join('\n') || 'None'}

Medium priority issues:
${qaFeedback.recommendations?.filter(r => r.priority === 'medium').map(r => `- [${r.category}] ${r.action}`).join('\n') || 'None'}` : '';

  const userPrompt = objectMode
    ? `You are modifying an existing ${genre} composition (${classicalGenre} x ${modernGenre}).

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
      const { output } = await compositionAgent.generate({
        prompt: userPrompt,
        onStepFinish: createStepLogger('CompositionAgent[modify/object]'),
      });
      abcNotation = assembleAbcNotation(output);
      console.log(`✅ Composition modified [object]: ${output.title}`);
    } else {
      const { text } = await generateText({
        model: anthropic('claude-sonnet-4-6', { cacheControl: { type: 'ephemeral', ttl: '1h' } }),
        system: TEXT_MODE_SYSTEM_PROMPT,
        prompt: userPrompt,
        providerOptions: {
          anthropic: {
            thinking: { type: 'disabled' },
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
          },
        },
      });
      abcNotation = text.replace(/^```[^\n]*\n?/gm, '').replace(/^```$/gm, '').trim();
      const titleMatch = abcNotation.match(/^T:(.+)$/m);
      console.log(`✅ Composition modified [text]: ${titleMatch ? titleMatch[1].trim() : '(untitled)'}`);
    }

    abcNotation = cleanAbcNotation(abcNotation);

    let validation = validateAbcNotation(abcNotation);
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
            objectMode,
            _isCorrection: true,
          });
          abcNotation = corrected;
          const revalidation = validateAbcNotation(abcNotation);
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
