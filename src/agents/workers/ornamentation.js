/**
 * Ornamentation Worker Agent
 * Adds baroque/classical ornaments to ABC notation
 *
 * Ornament types:
 * - T (trill)
 * - M (mordent)
 * - {/} (grace notes)
 * - S (turn)
 * - ~ (slide)
 */

import { streamText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { validateAbcNotation } from '../../utils/claude.js';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Add ornamentation to ABC notation
 * @param {Object} options
 * @param {string} options.abc - Current ABC notation
 * @param {string} options.directive - Specific directive from orchestrator
 * @returns {Promise<string>} Enhanced ABC with ornaments
 */
export async function addOrnamentation(options) {
  const { abc, directive } = options;

  console.log('\n🎵 Ornamentation Worker executing...');
  console.log(`   Directive: ${directive}`);

  const systemPrompt = `You are an expert in baroque and classical ornamentation and MIDI expression.

## ABC ORNAMENTATION SYNTAX
- T - trill (rapid alternation between the note and the note above)
- M - mordent (single alternation between the note and the note below)
- {/} - grace notes (small notes before main note, e.g., {C}D)
- S - turn (ornamental figure around a note)
- ~ - slide (smooth approach to a note)

## ORNAMENTATION RULES
1. Place ornament symbols BEFORE the note they decorate
2. Trills (T) work best on longer notes (half notes, whole notes)
3. Mordents (M) add elegance to quarter notes
4. Grace notes {/} create melodic flow
5. Don't over-ornament - tasteful addition is key
6. Respect the musical phrase structure
7. Focus on melodic lines (treble voices), not bass or accompaniment
8. You may also use %%MIDI gracedivider and %%MIDI trim/expand for articulation shaping

${ABC2MIDI_REFERENCE}`;

  try {
    const result = streamText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
      },
      messages: [
        {
          role: 'user',
          content: `Add ornaments to the ABC notation following this directive:\n"${directive}"\n\n## CURRENT ABC NOTATION\n\`\`\`\n${abc}\n\`\`\`\n\nReturn the COMPLETE ABC notation with ornaments added. Return ONLY the ABC notation, no explanations.`,
        },
      ],
    });

    let enhancedAbc = '';
    for await (const delta of result.textStream) {
      process.stdout.write(delta);
      enhancedAbc += delta;
    }
    process.stdout.write('\n');

    // Clean up the response (remove markdown code fences if present)
    const cleaned = enhancedAbc
      .replace(/^```[a-z]*\n/gm, '')
      .replace(/\n```$/gm, '')
      .trim();

    console.log('   ✅ Ornamentation applied');

    return cleaned;

  } catch (error) {
    console.error('Ornamentation worker error:', error.message);
    throw error;
  }
}

/**
 * Example directive formats the orchestrator might send:
 * - "Add trills to violin parts in measures 4-8"
 * - "Add baroque ornamentation (trills and mordents) to the melody in measures 12-16, reduce density by 40%"
 * - "Add grace notes to string sections for smoother transitions"
 * - "Add classical ornamentation throughout, focusing on cadences"
 */
