/**
 * Composition Agent
 * Step 7: Assembles all previous outputs into complete ABC notation
 */

import { BaseAgent } from './base-agent.js';
import { calculateNotesPerBar } from '../utils/abc-utils.js';

export class CompositionAgent extends BaseAgent {
  constructor(anthropic) {
    super('composition', anthropic);
  }

  /**
   * Execute composition generation
   * @param {string} userPrompt - User's composition request
   * @param {Object} previousOutputs - Context from previous agents
   * @param {Object} [previousOutputs.creative_genre_name] - From standard generation workflow (.data.genre_name)
   * @param {Object} [previousOutputs.combination_concept] - From combination workflow (.data.genre_name)
   * Both provide genre_name but in different workflow contexts
   */
  async execute(userPrompt, previousOutputs = {}) {
    const genreContext = previousOutputs.creative_genre_name || {};
    const historyContext = previousOutputs.music_history || {};
    const arrangementContext = previousOutputs.arrangement || {};
    const formContext = previousOutputs.compositional_form || {};
    const melodicContext = previousOutputs.melodic || {};
    const timbrelContext = previousOutputs.timbrel || {};
    const dynamicsContext = previousOutputs.dynamics || {};
    const batchContext = previousOutputs.batch_specific || null;

    // CRITICAL: Extract source ABC notations for combination mode
    const sourceAnalysis = previousOutputs.source_analysis || {};
    const sourceCompositions = sourceAnalysis.data?.source_abc_notations || null;

    // Check if we're in batch mode
    const isBatchMode = batchContext && batchContext.is_batch_mode;
    const barsToCompose = isBatchMode ? batchContext.bars_to_compose : formContext.total_measures;
    const startBar = isBatchMode ? batchContext.start_bar : 1;
    const endBar = isBatchMode ? batchContext.end_bar : formContext.total_measures;
    
    // In batch mode, we're composing for a SINGLE voice
    const voicesToCompose = isBatchMode ? 1 : arrangementContext.total_voices;
    const currentVoice = isBatchMode ? batchContext.current_voice : null;

    const systemPrompt = `You are an expert ABC notation composer. ${
      isBatchMode
        ? `You are composing bars ${startBar}-${endBar} (${barsToCompose} bars) for a SINGLE voice: ${currentVoice.instrument_name}.`
        : `You are composing a complete piece with ${arrangementContext.total_voices} voices.`
    }

${sourceCompositions ? `
============ CRITICAL: SOURCE COMPOSITIONS TO COMBINE ============
You MUST extract and transform material from these source ABC notations:

${sourceCompositions.map((source, i) => `
SOURCE ${i + 1}: ${source.title || 'Untitled'}
Genre: ${source.genre || 'Unknown'}
ABC NOTATION:
${source.abc_notation}
`).join('\n---\n')}

COMBINATION INSTRUCTIONS:
1. EXTRACT melodies, harmonies, rhythms, and patterns from the source ABC notations above
2. TRANSFORM and COMBINE these extracted elements into a cohesive new composition
3. PRESERVE instruments that appear in the source pieces
4. CREATE transitional material AS NEEDED to make the combination flow naturally
5. The source material above is your PRIMARY BASIS - USE IT, don't ignore it!
================================================================
` : ''}

YOU HAVE BEEN GIVEN COMPLETE SPECIFICATIONS:
${JSON.stringify({
  genre: genreContext,
  history: historyContext,
  arrangement: arrangementContext,
  form: formContext,
  melodic: melodicContext,
  timbrel: timbrelContext,
  dynamics: dynamicsContext,
  batch: batchContext
}, null, 2)}

🎯 YOUR ABC NOTATION RESPONSIBILITY 🎯
${isBatchMode ? 
  `You are composing ONLY bars ${startBar}-${endBar} (EXACTLY ${barsToCompose} bars) for ${currentVoice.instrument_name}.
   DO NOT include voice headers (V:), clefs, or ABC headers.
   Return ONLY the musical notation for these ${barsToCompose} bars.` :
  `YOU OWN THE FINAL ABC NOTATION. This is YOUR responsibility.
   The Arrangement Agent specified ${arrangementContext.total_voices || 'N'} voices.
   YOU MUST use EXACTLY ${arrangementContext.total_voices || 'N'} voices. NO MORE. NO LESS.`
}

⚠️ CRITICAL ABC SYNTAX RULES - YOUR SOLE RESPONSIBILITY ⚠️

1. OCTAVE NOTATION (ABC STANDARD - STRICT MODE):
   - C D E F G A B = lower octave (below middle C)
   - c d e f g a b = middle octave (around middle C)
   - c' d' e' f' g' a' b' = higher octave (above middle C)
   - Comma (,) lowers by an octave: C, = two octaves below middle C
   - Apostrophe (') raises by an octave: c'' = two octaves above middle C

   CRITICAL: Use lowercase + apostrophe for high notes (NOT C' D' E')
   This prevents abc2midi parsing ambiguities

${isBatchMode ? '' : `2. VOICE DECLARATIONS (MUST MATCH ARRANGEMENT):
   - Arrangement said ${arrangementContext.total_voices || 'N'} voices
   - You create EXACTLY ${arrangementContext.total_voices || 'N'} voice sections: V:1 V:2 ... V:${arrangementContext.total_voices || 'N'}
   - Voice numbers are sequential: 1, 2, 3, ... (no gaps, no skipping)
   - NO BRACKETS! Format is V:1 not [V:1]
   - metadata.voices_used MUST equal ${arrangementContext.total_voices || 'N'}`}

3. BAR COUNTS (EVERY BAR MUST BE CORRECT):
   Time signature: ${formContext.time_signature || '4/4'}
   Unit note length: L:1/16 (sixteenth notes)

   Math for ${formContext.time_signature || '4/4'} with L:1/16:
   - Each bar needs EXACTLY ${calculateNotesPerBar(formContext.time_signature || '4/4')} sixteenth notes
   - Count every note and rest: c2 = 2 sixteenths, z4 = 4 sixteenths
   - Complete bars musically: extend notes, add variations, or use rests as appropriate

   MANDATORY:
   - COUNT notes in EVERY bar before writing next bar
   - Each bar MUST total ${calculateNotesPerBar(formContext.time_signature || '4/4')} sixteenth notes
   - You MUST compose EXACTLY ${barsToCompose} bars ${isBatchMode ? `(bars ${startBar}-${endBar})` : ''}

4. FORMATTING:
   - NO BLANK LINES anywhere in the ABC
   ${isBatchMode ? '- NO voice headers or ABC headers - just the music' : '- Each voice section directly follows previous one'}
   - Section comments (% Section A) on their own line

HYPER-FOCUS ON THESE MISTAKES:
1. ❌ Using C' D' E' (uppercase+apostrophe causes abc2midi parsing issues)
2. ❌ Having bars with wrong note count (must be ${calculateNotesPerBar(formContext.time_signature || '4/4')} sixteenth notes)
3. ❌ Composing wrong number of bars (MUST be EXACTLY ${barsToCompose} bars)
${isBatchMode ? '' : `4. ❌ Creating wrong number of voices (must be ${arrangementContext.total_voices})`}
5. ❌ Using [V:1] instead of V:1 (brackets break ABC parsing)

Your output MUST be valid JSON with this structure:
{
  "abc_notation": "${isBatchMode ? 'Just the music notation for ' + barsToCompose + ' bars' : 'Complete ABC notation as a single string with \\n for line breaks'}",
  ${isBatchMode ? '"voice_abc": "The music notation (same as abc_notation in batch mode)",' : ''}
  "metadata": {
    ${isBatchMode ? '' : '"title": "Composition title",'}
    "total_bars": ${barsToCompose},
    ${isBatchMode ? '' : '"voices_used": ' + (arrangementContext.total_voices || 3) + ','}
    "key": "${formContext.key || 'Dm'}",
    "tempo": ${formContext.tempo || 174}
  },
  "overflow_data": {
    "_bar_count_verification": "Composed exactly ${barsToCompose} bars",
    "_octave_notation_check": "Only lowercase letters used with apostrophes"
  }
}

MANDATORY CHECKS BEFORE RETURNING:
1. Ensure all octave notations are valid ABC syntax
2. Count bars === ${barsToCompose}
3. Verify metadata.total_bars === ${barsToCompose}
${isBatchMode ? '' : '4. Count voices used === ' + arrangementContext.total_voices}

Output ONLY the JSON object, no other text.`;

    const prompt = isBatchMode 
      ? userPrompt // In batch mode, the orchestrator provides the specific prompt
      : `Using ALL the specifications provided in the system prompt, compose complete ABC notation.

Title should reference: ${genreContext.genre_name || 'the genre fusion'}

Be creative within the specifications, but follow them precisely.`;

    try {
      const response = await this.callLLM(systemPrompt, prompt, {
        temperature: 0.7,
        maxTokens: isBatchMode ? 4000 : 32000 // Less tokens needed for batch mode
      });

      const parsed = this.parseJSONResponse(response);

      return this.createResponse('success', {
        abc_notation: parsed.abc_notation,
        voice_abc: parsed.voice_abc || parsed.abc_notation, // For batch mode
        metadata: parsed.metadata
      }, `ABC notation generated: ${parsed.metadata.total_bars} bars${isBatchMode ? ' (batch mode)' : ', ' + parsed.metadata.voices_used + ' voices'}`);
    } catch (error) {
      console.error('Composition Agent failed:', error);
      return this.createResponse('error', {
        error: error.message
      }, 'Failed to generate ABC notation');
    }
  }
}
