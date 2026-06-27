import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getAnthropic, getModel, supportsAnthropicSamplingParams } from '../../utils/llm-client.js';

const movementPlanSchema = z.object({
  overallArc: z.string().describe('The dramatic/emotional span across ALL movements — how the work travels from first movement to last, as one unified statement'),
  sharedThemes: z.string().describe('Recurring motifs, harmonic language, and instrumentation that carry across movements and make this ONE work rather than unrelated pieces'),
  movements: z.array(z.object({
    number: z.number().describe('Movement number, starting at 1, in performance order'),
    character: z.string().describe('The character/affect of this movement (e.g. "Solemn, glacial introduction" or "Frenetic breakbeat scherzo")'),
    key: z.string().describe('Key/tonal center for this movement (e.g. "D minor", "modal on E", "atonal")'),
    tempo: z.string().describe('Tempo marking with BPM (e.g. "Adagio (1/4=52)", "Presto (1/4=184)")'),
    form: z.string().describe('Formal structure of this movement (e.g. "Sonata-allegro", "Through-composed build", "Scherzo and trio")'),
    durationTarget: z.string().describe('Target duration (e.g. "5-7 minutes")'),
  })).describe('Exactly the requested number of movements, ordered by number'),
});

/**
 * Plan the movements of a long-form multi-movement work.
 * Produces an overall arc, shared thematic material, and a per-movement
 * descriptor (character, key, tempo, form, duration). Each movement is
 * later composed and refined independently and written as its own file.
 *
 * @param {Object} options
 * @param {string} options.classicalGenre - Classical genre component
 * @param {string} options.modernGenre - Modern genre component
 * @param {string} [options.style] - Style descriptor
 * @param {number} options.movementCount - Number of movements to plan
 * @param {string} [options.userInstructions] - Hard user requirements
 * @param {string} [options.genreResearch] - Genre research briefing text
 * @returns {Promise<{overallArc: string, sharedThemes: string, movements: Array<{number: number, character: string, key: string, tempo: string, form: string, durationTarget: string}>}>}
 */
export async function planMovements(options) {
  const {
    classicalGenre,
    modernGenre,
    style = 'standard',
    movementCount,
    userInstructions = '',
    genreResearch = null,
  } = options;

  const anthropic = getAnthropic();

  const prompt = `You are planning the structure of a LONG-FORM, multi-movement work that fuses ${classicalGenre} and ${modernGenre}.
This is the scale of a Bruckner symphony or a Wagner music-drama act — a single unified work spanning ${movementCount} movements.

${genreResearch ? `## GENRE RESEARCH (context for what this fusion requires)
${genreResearch}
` : ''}${userInstructions ? `## ⚠️ HARD USER REQUIREMENTS — NON-NEGOTIABLE
The following requirements MUST shape every movement:
${userInstructions}

` : ''}## YOUR TASK
Design a coherent ${movementCount}-movement plan in the style "${style}".
- Produce EXACTLY ${movementCount} movements, numbered 1..${movementCount} in performance order.
- Give the work a single dramatic ARC across all movements — contrast of tempo, key, and character between movements, building to a culmination.
- Define SHARED thematic material (motifs, harmony, instrumentation) that recurs across movements so the whole reads as ONE work, not ${movementCount} unrelated pieces.
- For each movement specify a distinct character, key/tonal center, tempo (with BPM), formal structure, and target duration.
- Keep the instrumentation consistent across movements (a single ensemble performs the whole work).

Think like a symphonist: slow introductions, scherzos, slow movements, finales — adapt these archetypes to the ${classicalGenre} × ${modernGenre} fusion.`;

  let result;
  const modelId = getModel('claude-sonnet-4-6');
  if (supportsAnthropicSamplingParams('claude-sonnet-4-6')) {
    const { output } = await generateText({
      model: anthropic(modelId, { cacheControl: { type: 'ephemeral', ttl: '1h' } }),
      output: Output.object({ schema: movementPlanSchema }),
      prompt,
    });
    result = output;
  } else {
    const { text } = await generateText({
      model: anthropic(modelId),
      prompt: prompt + '\n\nRespond with a JSON object matching this schema: { overallArc: string, sharedThemes: string, movements: [{ number: number, character: string, key: string, tempo: string, form: string, durationTarget: string }] }',
    });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Movement planner returned no parseable JSON object');
    result = JSON.parse(jsonMatch[0]);
  }

  // Loud failure rather than padding/truncating — the caller depends on exact count
  if (!result.movements || result.movements.length !== movementCount) {
    throw new Error(`Movement planner returned ${result.movements?.length ?? 0} movements, expected ${movementCount}`);
  }

  console.log(`\n🎼 Movement plan: ${movementCount}-movement ${classicalGenre} × ${modernGenre} work`);
  console.log(`   Arc: ${result.overallArc}`);
  for (const m of result.movements) {
    console.log(`   ${m.number}. ${m.character} — ${m.key}, ${m.tempo} [${m.form}]`);
  }

  return result;
}
