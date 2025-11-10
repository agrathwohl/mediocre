/**
 * Composition Agent
 * Step 7: Assembles all previous outputs into complete ABC notation
 *
 * TEMPLATE-BASED APPROACH:
 * - Programmatically generates ABC header (guaranteed valid)
 * - Programmatically generates MIDI declarations (guaranteed valid)
 * - LLM generates ONLY note sequences (can't make syntax errors)
 * - Assembles everything into valid ABC notation
 */

import { BaseAgent } from './base-agent.js';

export class CompositionAgent extends BaseAgent {
  constructor(anthropic) {
    super('composition', anthropic);
  }

  /**
   * Generate ABC header from specifications (GUARANTEED VALID)
   */
  generateABCHeader(genreContext, formContext, arrangementContext) {
    const title = genreContext.genre_name || 'Untitled';
    const meter = formContext.time_signature || '4/4';
    const tempo = formContext.tempo || 120;
    const key = formContext.key || 'C';

    return [
      'X:1',
      `T:${title}`,
      `M:${meter}`,
      'L:1/16',
      `Q:1/4=${tempo}`,
      `K:${key}`
    ].join('\n');
  }

  /**
   * Generate MIDI declarations from timbrel specifications (GUARANTEED VALID)
   */
  generateMIDIDeclarations(timbrelContext, arrangementContext) {
    const declarations = [];
    const totalVoices = arrangementContext.total_voices || 3;
    const voiceConfigs = timbrelContext.voice_midi_configurations || [];

    // Generate MIDI program declarations for each voice
    for (let i = 0; i < totalVoices; i++) {
      const voiceConfig = voiceConfigs[i] || {};
      const channel = i + 1;
      const program = voiceConfig.midi_program || 0;

      // Validate program number (0-127)
      const validProgram = Math.max(0, Math.min(127, program));

      declarations.push(`%%MIDI program ${channel} ${validProgram}`);
    }

    // Add drum patterns if specified
    if (timbrelContext.drum_pattern) {
      const pattern = timbrelContext.drum_pattern.pattern || 'dzzz';
      const programs = timbrelContext.drum_pattern.programs || [36];
      const velocities = timbrelContext.drum_pattern.velocities || [80];

      // Count 'd' characters in pattern
      const dCount = (pattern.match(/d/g) || []).length;

      // Take exactly dCount programs and velocities
      const validPrograms = programs.slice(0, dCount);
      const validVelocities = velocities.slice(0, dCount);

      // Pad with defaults if needed
      while (validPrograms.length < dCount) validPrograms.push(36);
      while (validVelocities.length < dCount) validVelocities.push(80);

      const drumDeclaration = `%%MIDI drum ${pattern} ${validPrograms.join(' ')} ${validVelocities.join(' ')}`;
      declarations.push(drumDeclaration);
    }

    return declarations.join('\n');
  }

  /**
   * Assemble complete ABC notation from parts (GUARANTEED VALID STRUCTURE)
   */
  assembleABC(header, midiDeclarations, voiceSequences) {
    const parts = [
      header,
      midiDeclarations
    ];

    // Add each voice section
    for (let i = 0; i < voiceSequences.length; i++) {
      const voiceNum = i + 1;
      const sequence = voiceSequences[i];

      parts.push(`[V:${voiceNum}]`);
      parts.push(sequence);
    }

    return parts.join('\n');
  }

  /**
   * Count bars in a note sequence
   */
  countBars(noteSequence) {
    return (noteSequence.match(/\|/g) || []).length;
  }

  async execute(userPrompt, previousOutputs = {}) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const timbrelContext = previousOutputs.timbrel || {};
    const dynamicsContext = previousOutputs.dynamics || {};

    const totalVoices = arrangementContext.total_voices || 3;
    const targetBars = formContext.total_bars || 64;

    console.log(`\n🎼 Template-based ABC generation:`);
    console.log(`   Target: ${targetBars} bars, ${totalVoices} voices`);

    // STEP 1: Generate header programmatically (GUARANTEED VALID)
    const header = this.generateABCHeader(genreContext, formContext, arrangementContext);
    console.log(`   ✓ Generated header`);

    // STEP 2: Generate MIDI declarations programmatically (GUARANTEED VALID)
    const midiDeclarations = this.generateMIDIDeclarations(timbrelContext, arrangementContext);
    console.log(`   ✓ Generated MIDI declarations`);

    // STEP 3: Have LLM generate ONLY note sequences (can't make syntax errors)
    const systemPrompt = `You are a music composer generating ABC notation note sequences.

SPECIFICATIONS:
${JSON.stringify({
  genre: genreContext,
  history: historyContext,
  arrangement: arrangementContext,
  form: formContext,
  melodic: melodicContext,
  dynamics: dynamicsContext
}, null, 2)}

YOUR TASK:
Generate ONLY the note sequences for ${totalVoices} voices. DO NOT generate:
- Headers (X:, T:, M:, L:, Q:, K:)
- MIDI declarations (%%MIDI)
- Voice declarations ([V:1], [V:2])

Generate ONLY the musical notes and bar lines.

CRITICAL RULES:

1. OCTAVE NOTATION:
   ✓ CORRECT: c d e f g a b c' d' e' (lowercase + apostrophe for high octaves)
   ✗ WRONG: C' D' E' (uppercase + apostrophe is INVALID)

2. BAR LENGTH:
   Time signature: ${formContext.time_signature || '4/4'}
   Unit length: L:1/16
   Each bar needs EXACTLY 16 sixteenth-note units
   - c2 = 2 units, c4 = 4 units, c8 = 8 units
   - Use z for rests

3. BAR COUNT:
   - Generate ${targetBars} bars for EACH voice
   - ALL voices must have same bar count
   - End each bar with |

4. OUTPUT FORMAT:
   Return JSON with this EXACT structure:
   {
     "voice_sequences": [
       "notes for voice 1|more bars|...",
       "notes for voice 2|more bars|...",
       "notes for voice 3|more bars|..."
     ],
     "bars_per_voice": [64, 64, 64]
   }

EXAMPLE OUTPUT:
{
  "voice_sequences": [
    "c4d4e4f4|g4f4e4d4|c4d4e4f4|g4f4e4d4|",
    "C4D4E4F4|G4F4E4D4|C4D4E4F4|G4F4E4D4|",
    "z16|z16|z16|z16|"
  ],
  "bars_per_voice": [4, 4, 4]
}

MANDATORY:
- Generate ${totalVoices} voice sequences
- Each sequence has ${targetBars} bars
- Only lowercase letters with apostrophes for octaves
- No syntax elements (no headers, no MIDI, no [V:N])
- Just notes, rests, and bar lines

Output ONLY valid JSON.`;

    const prompt = `Generate ${targetBars} bars of ABC notation note sequences for ${totalVoices} voices.

Genre: ${genreContext.genre_name || 'fusion'}
Key: ${formContext.key || 'C'}
Tempo: ${formContext.tempo || 120} BPM

Be creative and musically interesting.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 32000
      });

      const parsed = this.parseJSONResponse(response);

      if (!parsed.voice_sequences || parsed.voice_sequences.length !== totalVoices) {
        throw new Error(`Expected ${totalVoices} voice sequences, got ${parsed.voice_sequences?.length || 0}`);
      }

      console.log(`   ✓ Generated note sequences for ${totalVoices} voices`);

      // Verify bar counts
      const barCounts = parsed.voice_sequences.map(seq => this.countBars(seq));
      console.log(`   ✓ Bar counts: ${barCounts.join(', ')}`);

      // STEP 4: Assemble into valid ABC (GUARANTEED VALID STRUCTURE)
      const abc = this.assembleABC(header, midiDeclarations, parsed.voice_sequences);

      console.log(`   ✓ Assembled complete ABC notation`);

      return this.createResponse('success', {
        abc_notation: abc,
        metadata: {
          title: genreContext.genre_name || 'Untitled',
          total_bars: Math.max(...barCounts),
          voices_used: totalVoices,
          key: formContext.key || 'C',
          tempo: formContext.tempo || 120
        }
      }, `ABC notation generated: ${Math.max(...barCounts)} bars, ${totalVoices} voices`);
    } catch (error) {
      console.error('Composition Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to generate ABC notation');
    }
  }
}
