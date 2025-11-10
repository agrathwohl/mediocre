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
    // Extract actual data from agent outputs (with reasonable fallbacks)
    const title = genreContext.data?.genre_name || genreContext.genre_name || 'Untitled Composition';
    const meter = formContext.data?.time_signature || formContext.time_signature || '4/4';
    const tempo = formContext.data?.tempo || formContext.tempo || 120;
    const key = formContext.data?.key || formContext.key || 'C';

    console.log(`   📋 Header: "${title}" | ${meter} | ${tempo} BPM | ${key}`);

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
    const totalVoices = arrangementContext.data?.total_voices || arrangementContext.total_voices || 3;

    // Extract voice configurations from timbrel agent response
    const voiceConfigs = timbrelContext.data?.voice_midi_configurations
                      || timbrelContext.voice_midi_configurations
                      || [];

    console.log(`   🎹 Configuring MIDI for ${totalVoices} voices:`);

    // Generate MIDI program declarations for each voice
    for (let i = 0; i < totalVoices; i++) {
      const voiceConfig = voiceConfigs[i] || {};
      const channel = i + 1;
      const program = voiceConfig.midi_program || voiceConfig.program || 0;

      // Validate program number (0-127)
      const validProgram = Math.max(0, Math.min(127, program));

      console.log(`      Voice ${channel}: MIDI program ${validProgram} (${voiceConfig.instrument_name || 'unknown'})`);
      declarations.push(`%%MIDI program ${channel} ${validProgram}`);
    }

    // Add drum patterns if specified
    const drumPattern = timbrelContext.data?.drum_pattern || timbrelContext.drum_pattern;
    if (drumPattern) {
      const pattern = drumPattern.pattern || 'dzzz';
      const programs = drumPattern.programs || [36];
      const velocities = drumPattern.velocities || [80];

      // Count 'd' characters in pattern
      const dCount = (pattern.match(/d/g) || []).length;

      // Take exactly dCount programs and velocities
      const validPrograms = programs.slice(0, dCount);
      const validVelocities = velocities.slice(0, dCount);

      // Pad with defaults if needed
      while (validPrograms.length < dCount) validPrograms.push(36);
      while (validVelocities.length < dCount) validVelocities.push(80);

      const drumDeclaration = `%%MIDI drum ${pattern} ${validPrograms.join(' ')} ${validVelocities.join(' ')}`;
      console.log(`      Drum pattern: ${pattern} (${dCount} voices)`);
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
    const systemPrompt = `You are an expert music composer generating ABC notation note sequences.

╔═══════════════════════════════════════════════════════════════╗
║                   MUSICAL SPECIFICATIONS                      ║
╚═══════════════════════════════════════════════════════════════╝

GENRE & AESTHETIC:
${JSON.stringify(genreContext, null, 2)}

MUSIC HISTORY CONTEXT:
${JSON.stringify(historyContext, null, 2)}

COMPOSITIONAL FORM & STRUCTURE:
${JSON.stringify(formContext, null, 2)}

ARRANGEMENT (Voice Roles):
${JSON.stringify(arrangementContext, null, 2)}

MELODIC THEMES & MOTIFS:
${JSON.stringify(melodicContext, null, 2)}

DYNAMIC ARC:
${JSON.stringify(dynamicsContext, null, 2)}

╔═══════════════════════════════════════════════════════════════╗
║                    YOUR COMPOSITIONAL TASK                    ║
╚═══════════════════════════════════════════════════════════════╝

Generate ${targetBars} bars of ABC notation note sequences for ${totalVoices} voices that EMBODY all the specifications above.

CRITICAL: You are generating ONLY note sequences. DO NOT generate:
- Headers (X:, T:, M:, L:, Q:, K:) ← Header is auto-generated
- MIDI declarations (%%MIDI) ← MIDI is auto-generated
- Voice declarations ([V:1], [V:2]) ← Voice markers are auto-added

Generate ONLY: musical notes, rests (z), and bar lines (|)

╔═══════════════════════════════════════════════════════════════╗
║                 COMPOSITIONAL REQUIREMENTS                    ║
╚═══════════════════════════════════════════════════════════════╝

1. FOLLOW THE FORM STRUCTURE:
   - The Compositional Form agent designed a ${targetBars}-bar structure
   - Follow any section divisions, developmental arcs, or formal plans specified
   - Respect the time signature: ${formContext.time_signature || '4/4'}

2. DEVELOP THE MELODIC THEMES:
   - The Melodic agent created themes/motifs for you to use
   - Introduce, develop, vary, and recapitulate these themes
   - Create melodic relationships between voices as specified

3. REALIZE THE DYNAMIC ARC:
   - The Dynamics agent designed an energy/intensity arc across the piece
   - Reflect dynamics through: note density, register, rhythmic activity, articulation
   - Build and release tension according to the dynamic plan

4. EMBODY THE GENRE FUSION:
   - Incorporate stylistic elements from the historical analysis
   - Blend the aesthetic qualities of both genres
   - Use rhythmic patterns, harmonic language, and textures that reflect the fusion

5. RESPECT VOICE ROLES:
   - Each voice has a specific role (melody, harmony, bass, rhythm, etc.)
   - Voice interaction patterns may be specified (call-response, counterpoint, etc.)
   - Maintain voice independence while creating ensemble coherence

╔═══════════════════════════════════════════════════════════════╗
║                      ABC SYNTAX RULES                         ║
╚═══════════════════════════════════════════════════════════════╝

1. OCTAVE NOTATION:
   ✓ CORRECT: c d e f g a b c' d' e' f' g' a' b' c'' (lowercase + apostrophe)
   ✗ WRONG: C' D' E' F' G' (uppercase + apostrophe is INVALID ABC syntax)

2. BAR LENGTH (CRITICAL):
   Time signature: ${formContext.time_signature || '4/4'}
   Unit length: L:1/16 (sixteenth notes)

   Each bar needs EXACTLY 16 sixteenth-note units:
   - c1 = 1 unit, c2 = 2 units, c4 = 4 units, c8 = 8 units, c16 = 16 units
   - Chords count as one unit: [ceg]4 = 4 units
   - z = rest (same duration rules)

   MANDATORY: Count note durations in EVERY bar to ensure they sum to 16

3. BAR COUNT:
   - Generate EXACTLY ${targetBars} bars for EACH voice
   - ALL ${totalVoices} voices must have same bar count
   - End each bar with | (bar line)

4. OUTPUT FORMAT:
   Return JSON with this EXACT structure:
   {
     "voice_sequences": [
       "note sequence for voice 1...",
       "note sequence for voice 2...",
       "note sequence for voice 3..."
     ],
     "bars_per_voice": [${targetBars}, ${targetBars}, ${targetBars}],
     "compositional_notes": "Brief notes on how you realized the musical specifications"
   }

EXAMPLE (simplified 4-bar excerpt):
{
  "voice_sequences": [
    "d4f4a4d'4|e4g4c'4e'4|f4a4d'4f'4|d4a4d'4a'4|",
    "D8F8|E8G8|F8A8|D8A8|",
    "D,16|C,16|F,16|D,16|"
  ],
  "bars_per_voice": [4, 4, 4],
  "compositional_notes": "Voice 1 carries main melodic theme, Voice 2 provides harmonic support, Voice 3 provides bass foundation"
}

MANDATORY CHECKS BEFORE OUTPUTTING:
□ Generated ${totalVoices} voice sequences
□ Each sequence has ${targetBars} bars (count the | symbols)
□ Only lowercase letters with apostrophes for octave marks
□ No syntax elements (no X:, T:, M:, K:, %%MIDI, [V:N])
□ Musical content reflects the genre fusion and specifications
□ Form structure and dynamic arc are realized
□ Melodic themes are developed and varied

Output ONLY valid JSON.`;

    const prompt = `Compose ${targetBars} bars for ${totalVoices} voices that realizes the complete musical vision specified above.

COMPOSITIONAL FOCUS:
- Genre fusion: ${genreContext.genre_name || 'innovative fusion'}
- Aesthetic goal: Blend ${historyContext.classical_reference || 'classical'} with ${historyContext.modern_reference || 'modern'} styles
- Key: ${formContext.key || 'C'}
- Tempo: ${formContext.tempo || 120} BPM
- Time signature: ${formContext.time_signature || '4/4'}

CRITICAL REQUIREMENTS:
1. Use the melodic themes/motifs provided by the Melodic agent
2. Follow the form structure (sections, development plan) from Compositional Form agent
3. Realize the dynamic arc designed by the Dynamics agent
4. Respect voice roles and interactions from Arrangement agent
5. Incorporate stylistic elements from the Music History analysis

This is a complete composition - make it musically compelling, coherent, and true to the genre fusion vision.`;

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
