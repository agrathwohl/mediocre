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
    }
  ],
  "drums": {
    "enabled": true,
    "style": "Breakbeat",
    "complexity": "high"
  },
  "interplay_notes": "How voices interact with each other",
  "arrangement_strategy": "Overall arrangement approach"
}

Guidelines:
- Keep it simple: 2-4 voices MAX (not counting drums)
- Choose instruments that make sense for BOTH classical and modern influences
- Assign appropriate MIDI program numbers (0-127, avoid channel 10)
- Consider how voices will work together
- Be specific about each voice's role

Output ONLY the JSON object, no other text.`;

    const prompt = `${userPrompt}

${genreContext.genre_name ? `Genre: "${genreContext.genre_name}"
` : ''}${historyContext.classical_characteristics ? `Classical Characteristics: ${JSON.stringify(historyContext.classical_characteristics, null, 2)}
Modern Characteristics: ${JSON.stringify(historyContext.modern_characteristics, null, 2)}
` : ''}
Determine the optimal instrumentation and arrangement for this composition.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 3000
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
