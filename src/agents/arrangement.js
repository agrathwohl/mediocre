/**
 * Arrangement Agent
 * Step 4a: Determines instrumentation and voice assignments
 * Works IN TANDEM with Compositional Form Agent
 */

import { BaseAgent } from './base-agent.js';

export class ArrangementAgent extends BaseAgent {
  constructor(anthropic) {
    super('arrangement', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}, collaborationContext = null) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const formContext = collaborationContext; // Data from Compositional Form agent

    const systemPrompt = `You are a musical arrangement expert. Your task is to determine the optimal instrumentation and voice assignments for a composition.

${formContext ? `COLLABORATION CONTEXT from Compositional Form Agent:
${JSON.stringify(formContext, null, 2)}

Consider this structural information when making arrangement decisions.
` : ''}

🎯 YOUR ABC NOTATION RESPONSIBILITY 🎯
YOU OWN THE VOICE COUNT. This is YOUR decision and YOUR responsibility.

CRITICAL ABC RULES YOU MUST FOLLOW:
1. Whatever "total_voices" you specify will be EXACTLY what gets used in the ABC notation
2. If you say total_voices: 3, the composition will use [V:1], [V:2], [V:3] ONLY
3. The Timbrel agent will declare %%MIDI program 1, 2, 3 ONLY
4. DO NOT declare more voices than you actually plan to use
5. Count carefully: If you list 3 voices in the array, total_voices MUST be 3

HYPER-FOCUS ON THIS:
- Your voice count is BINDING and FINAL
- Downstream agents TRUST your count completely
- If you fuck this up, orphaned MIDI declarations will cause segfaults
- Double-check: voices array length === total_voices

Your output MUST be valid JSON with this exact structure:
{
  "total_voices": 3,
  "voices": [
    {
      "voice_number": 1,
      "instrument_name": "Lead Synth",
      "midi_program": 81,
      "clef": "treble",
      "role": "Primary melody",
      "range": "d-d'''",
      "characteristics": "Bright, cutting lead"
    },
    {
      "voice_number": 2,
      "instrument_name": "Bass",
      "midi_program": 38,
      "clef": "bass",
      "role": "Foundational bass",
      "range": "E,-E",
      "characteristics": "Deep, solid"
    },
    {
      "voice_number": 3,
      "instrument_name": "Pad",
      "midi_program": 89,
      "clef": "treble",
      "role": "Harmonic support",
      "range": "c-c''",
      "characteristics": "Atmospheric"
    }
  ],
  "drums": {
    "enabled": true,
    "style": "Breakbeat",
    "complexity": "high"
  },
  "interplay_notes": "How voices interact with each other",
  "arrangement_strategy": "Overall arrangement approach",
  "overflow_data": {}
}

Guidelines:
- Keep it simple: 2-4 voices MAX (not counting drums)
- Voice numbers MUST be sequential: 1, 2, 3, 4 (never skip numbers)
- Choose instruments that make sense for BOTH classical and modern influences
- Assign appropriate MIDI program numbers (0-127, avoid channel 10)
- VERIFY: voices array length === total_voices before returning

IMPORTANT: You MUST output ONLY valid JSON. Do not include markdown, explanations, or any text outside the JSON object.
Do not wrap the JSON in markdown code fences.
Start your response with { and end with }`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${historyContext.classical_characteristics ? `Classical Characteristics: ${JSON.stringify(historyContext.classical_characteristics, null, 2)}
Modern Characteristics: ${JSON.stringify(historyContext.modern_characteristics, null, 2)}
` : ''}
Determine the optimal instrumentation and arrangement for this composition. Return ONLY the JSON object.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 16000  // Increased to handle detailed arrangements
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        total_voices: parsed.total_voices,
        voices: parsed.voices,
        drums: parsed.drums,
        interplay_notes: parsed.interplay_notes,
        arrangement_strategy: parsed.arrangement_strategy
      }, `Arrangement for ${parsed.total_voices} voices`);
    } catch (error) {
      console.error('Arrangement Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to create arrangement');
    }
  }
}
