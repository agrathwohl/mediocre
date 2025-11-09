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

Your output MUST be valid JSON with this exact structure:
{
  "midi_configuration": {
    "voice_programs": [
      {"voice": 1, "program": 81, "channel": 1},
      {"voice": 2, "program": 38, "channel": 2}
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
    "bars": 4
  },
  "section_specific_techniques": [
    {
      "section": "Intro",
      "techniques": ["%%MIDI expand 1/16 for legato", "Low velocities"]
    }
  ],
  "production_notes": "Overall timbral and production approach"
}

CRITICAL RULES:
- NEVER declare more MIDI voices than exist in the arrangement
- Count 'd' characters in drum pattern to determine program/velocity count
- Drum pattern max 32 characters
- Valid MIDI channels: 1-9, 11-16 (NOT 10 - that's drums only)
- Use abc2midi extensions creatively but correctly

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
