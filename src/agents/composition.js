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

🎯 YOUR ABC NOTATION RESPONSIBILITY 🎯
YOU OWN THE FINAL ABC NOTATION. This is YOUR responsibility.

The Arrangement Agent specified ${arrangementContext.total_voices || 'N'} voices.
The Timbrel Agent configured MIDI for those voices.
YOU MUST use EXACTLY ${arrangementContext.total_voices || 'N'} voices. NO MORE. NO LESS.

⚠️ CRITICAL ABC SYNTAX RULES - YOUR SOLE RESPONSIBILITY ⚠️

1. OCTAVE NOTATION (CAUSES PARSE ERRORS IF WRONG):
   ✓ CORRECT: c' d' e' f' g' a' b'  (lowercase + apostrophe)
   ✗ WRONG: C' D' E' F' G' A' B'  (uppercase + apostrophe is INVALID)

   - Apostrophes (') ONLY work with LOWERCASE letters
   - For uppercase notes going down, use comma: C, D, E,
   - NEVER EVER use uppercase with apostrophe

2. VOICE DECLARATIONS (MUST MATCH ARRANGEMENT):
   - Arrangement said ${arrangementContext.total_voices || 'N'} voices
   - You create EXACTLY ${arrangementContext.total_voices || 'N'} voice sections: [V:1] [V:2] ... [V:${arrangementContext.total_voices || 'N'}]
   - Voice numbers are sequential: 1, 2, 3, ... (no gaps, no skipping)
   - metadata.voices_used MUST equal ${arrangementContext.total_voices || 'N'}

3. BAR COUNTS (EVERY BAR MUST BE CORRECT):
   Time signature: ${formContext.time_signature || '4/4'}
   Unit note length: L:1/16 (sixteenth notes)

   Math for ${formContext.time_signature || '4/4'} with L:1/16:
   - Each bar needs EXACTLY 16 sixteenth notes (4 beats × 4 sixteenths per beat)
   - Count every note and rest: c2 = 2 sixteenths, z4 = 4 sixteenths
   - Use 'z' rests to fill incomplete bars

   MANDATORY:
   - COUNT notes in EVERY bar before writing next bar
   - If bar doesn't add up to 16, ADD RESTS
   - ALL ${arrangementContext.total_voices || 'N'} voices MUST have SAME total number of bars

4. VOICE BAR SYNCHRONIZATION:
   - If [V:1] has 64 bars, then [V:2] MUST have 64 bars, [V:3] MUST have 64 bars
   - Count bars for each voice as you write
   - Verify at the end: all voices same bar count

5. FORMATTING:
   - NO BLANK LINES anywhere in the ABC
   - Each voice section directly follows previous one
   - Section comments (% Section A) on their own line

HYPER-FOCUS ON THESE MISTAKES:
1. ❌ Using C' D' E' instead of c' d' e' (this breaks abc2midi)
2. ❌ Creating 5 voices when arrangement specified 3
3. ❌ Having bars with 15 or 17 notes instead of 16
4. ❌ Voice 1 has 64 bars but Voice 2 has 62 bars

Your output MUST be valid JSON with this structure:
{
  "abc_notation": "Complete ABC notation as a single string with \\n for line breaks",
  "metadata": {
    "title": "Composition title",
    "total_bars": 64,
    "voices_used": ${arrangementContext.total_voices || 3},
    "key": "${formContext.key || 'Dm'}",
    "tempo": ${formContext.tempo || 174}
  },
  "overflow_data": {
    "_bar_count_verification": "All voices have 64 bars",
    "_octave_notation_check": "Only lowercase letters used with apostrophes"
  }
}

MANDATORY CHECKS BEFORE RETURNING:
1. Search output for pattern [A-G]' and ELIMINATE IT (uppercase + apostrophe)
2. Count voices used === ${arrangementContext.total_voices}
3. Count bars for each voice, verify all equal
4. Verify metadata.voices_used === ${arrangementContext.total_voices}

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
