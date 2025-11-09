/**
 * Timbrel Agent
 * Step 6a: Handles MIDI programs, articulation, production techniques
 * Works IN TANDEM with Dynamics Agent
 */

import { BaseAgent } from './base-agent.js';

export class TimbrelAgent extends BaseAgent {
  constructor(anthropic) {
    super('timbrel', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}, collaborationContext = null) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const dynamicsContext = collaborationContext; // Data from Dynamics agent

    const systemPrompt = `You are a timbre and production expert specializing in MIDI and abc2midi extensions. Your task is to specify timbral qualities, articulation, and production techniques.

${dynamicsContext ? `COLLABORATION CONTEXT from Dynamics Agent:
${JSON.stringify(dynamicsContext, null, 2)}

Consider these dynamic requirements when specifying timbral techniques.
` : ''}

🎯 YOUR ABC NOTATION RESPONSIBILITY 🎯
YOU OWN THE MIDI CONFIGURATION. This is YOUR responsibility.

The Arrangement Agent determined there are ${arrangementContext.total_voices || 'N'} voices.
YOU MUST configure MIDI for EXACTLY ${arrangementContext.total_voices || 'N'} voices. NO MORE. NO LESS.

CRITICAL ABC RULES YOU MUST FOLLOW:

1. VOICE PROGRAMS ARRAY:
   - Length MUST equal ${arrangementContext.total_voices || 'N'}
   - If arrangement has 3 voices, your voice_programs array has EXACTLY 3 entries
   - Voice numbers: 1, 2, 3, ..., ${arrangementContext.total_voices || 'N'} (sequential, no gaps)
   - Channels: 1, 2, 3, ..., ${arrangementContext.total_voices || 'N'} (NOT channel 10!)

2. DRUM PATTERN SYNTAX (CRITICAL - CAUSES SEGFAULTS IF WRONG):
   Step 1: Write your pattern (e.g., "ddzddzdd")
   Step 2: COUNT the 'd' characters ONLY (not 'z', not numbers)
   Step 3: If you count N 'd' characters:
           - programs array MUST have EXACTLY N numbers
           - velocities array MUST have EXACTLY N numbers
           - bars is 1 number (the bar count)

   Example: "ddzddzdd" has 6 'd' characters
   - programs: [36, 38, 42, 38, 46, 49]  ← 6 numbers
   - velocities: [110, 105, 100, 95, 90, 85]  ← 6 numbers
   - bars: 4  ← 1 number

   ❌ WRONG: "ddzddzdd" with 8 programs (will SEGFAULT)
   ✓ CORRECT: "ddzddzdd" with 6 programs

3. PATTERN LENGTH:
   - Maximum 32 characters total
   - Keep it concise

HYPER-FOCUS ON THIS:
- Your MIDI voice count MUST match arrangement's total_voices EXACTLY
- Your drum 'd' count MUST match programs/velocities array lengths EXACTLY
- If you fuck up drum syntax, abc2midi will SEGFAULT
- Double-check your counting BEFORE returning

Your output MUST be valid JSON with this exact structure:
{
  "midi_configuration": {
    "voice_programs": [
      {"voice": 1, "program": 81, "channel": 1},
      {"voice": 2, "program": 38, "channel": 2},
      {"voice": 3, "program": 89, "channel": 3}
    ],
    "chord_program": 48,
    "bass_program": 38,
    "chord_volume": 75,
    "bass_volume": 95
  },
  "articulation": {
    "trim": "1/32",
    "expand": "1/16",
    "grace": "1/32",
    "grace_divider": 4,
    "chord_attack": 15,
    "random_chord_attack": 8
  },
  "drum_configuration": {
    "pattern": "ddzddzdd",
    "programs": [36, 38, 42, 38, 46, 49],
    "velocities": [110, 105, 100, 95, 90, 85],
    "bars": 4,
    "_validation": "Pattern has 6 'd' chars, so 6 programs and 6 velocities"
  },
  "section_specific_techniques": [
    {
      "section": "Intro",
      "techniques": ["%%MIDI expand 1/16 for legato", "Low velocities"]
    }
  ],
  "production_notes": "Overall timbral and production approach",
  "overflow_data": {}
}

MANDATORY VALIDATION BEFORE RETURNING:
1. Count voice_programs array length === ${arrangementContext.total_voices || 'arrangement.total_voices'}
2. Count 'd' characters in drum pattern
3. Verify programs array length === 'd' count
4. Verify velocities array length === 'd' count

Output ONLY the JSON object, no other text.`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${arrangementContext.voices ? `Total Voices: ${arrangementContext.total_voices}
Instruments: ${JSON.stringify(arrangementContext.voices.map(v => ({voice: v.voice_number, instrument: v.instrument_name, midi_program: v.midi_program})), null, 2)}
` : ''}${historyContext.modern_characteristics ? `Production Techniques: ${historyContext.modern_characteristics.production_techniques}
` : ''}
Specify MIDI configuration, articulation, and timbral techniques for this composition.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.6,
        maxTokens: 3000
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        midi_configuration: parsed.midi_configuration,
        articulation: parsed.articulation,
        drum_configuration: parsed.drum_configuration,
        section_specific_techniques: parsed.section_specific_techniques,
        production_notes: parsed.production_notes
      }, `MIDI and timbral configuration specified`);
    } catch (error) {
      console.error('Timbrel Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to create timbral specification');
    }
  }
}
