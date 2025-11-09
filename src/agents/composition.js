/**
 * Composition Agent
 * Step 7: Assembles all previous outputs into complete ABC notation
 */

import { BaseAgent } from './base-agent.js';

export class CompositionAgent extends BaseAgent {
  constructor(anthropic) {
    super('composition', anthropic);
  }

  async execute(userPrompt, previousOutputs = {}) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const timbrelContext = previousOutputs.timbrel || {};
    const dynamicsContext = previousOutputs.dynamics || {};

    const systemPrompt = `You are an expert ABC notation composer. Your task is to take all the musical decisions from previous agents and create complete, valid, playable ABC notation.

YOU HAVE BEEN GIVEN COMPLETE SPECIFICATIONS:
${JSON.stringify({
  genre: genreContext,
  history: historyContext,
  arrangement: arrangementContext,
  form: formContext,
  melodic: melodicContext,
  timbrel: timbrelContext,
  dynamics: dynamicsContext
}, null, 2)}

⚠️ CRITICAL ABC SYNTAX RULES ⚠️

1. OCTAVE NOTATION:
   - Apostrophes (') ONLY work with LOWERCASE letters: c' d' e' ✓
   - NEVER use uppercase with apostrophes: C' D' E' ✗
   - For lowercase: ' = higher octave, no modifier = middle, , = lower octave

2. VOICE DECLARATIONS:
   - ONLY declare voices that exist in the arrangement
   - If arrangement specifies 3 voices, ONLY use [V:1] [V:2] [V:3]
   - NEVER declare %%MIDI program/channel for non-existent voices

3. BAR COUNTS:
   - EVERY bar must have EXACTLY the correct number of beats
   - M:4/4 with L:1/16 = 16 sixteenth notes per bar
   - Use 'z' for rests to fill bars to correct length
   - ALL voices must have the SAME number of bars

4. FORMATTING:
   - NO BLANK LINES between voice sections
   - Each voice section on its own line with no indentation

5. MIDI:
   - Drum pattern: count 'd' characters, provide that many programs and velocities
   - Valid channels: 1-9, 11-16 (skip 10, it's drums only)
   - Max dynamic: !fff!, min: !ppp!

Your output MUST be valid JSON with this structure:
{
  "abc_notation": "Complete ABC notation as a single string with \\n for line breaks",
  "metadata": {
    "title": "Composition title",
    "total_bars": 64,
    "voices_used": 3,
    "key": "Dm",
    "tempo": 174
  }
}

FOCUS ON:
- Correct bar counts in every single bar
- Valid octave notation (lowercase + apostrophe)
- Matching voice declarations to arrangement
- Musical coherence

Output ONLY the JSON object, no other text.`;

    const prompt = `Using ALL the specifications provided in the system prompt, compose complete ABC notation.

Title should reference: ${genreContext.genre_name || 'the genre fusion'}

Be creative within the specifications, but follow them precisely.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: 32000 // Need lots of tokens for full ABC notation
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        abc_notation: parsed.abc_notation,
        metadata: parsed.metadata
      }, `ABC notation generated: ${parsed.metadata.total_bars} bars, ${parsed.metadata.voices_used} voices`);
    } catch (error) {
      console.error('Composition Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to generate ABC notation');
    }
  }
}
