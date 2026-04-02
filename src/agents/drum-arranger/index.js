import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getPercussionReference, GM_PERCUSSION } from './gm-percussion-reference.js';
import { getAnthropic, getModel } from '../../utils/llm-client.js';

const drumKitSchema = z.object({
  noDrums: z.boolean().describe('Set to true ONLY when BOTH genres are inherently non-percussive (e.g. ambient, drone, sacred minimalism, meditation music, certain chamber music). When true, drumKit must be an empty array.'),
  drumKit: z.array(z.object({
    gm: z.number().describe('GM percussion note number (35-81)'),
    name: z.string().describe('Sound name'),
    role: z.string().describe('foundation, timekeeping, accent, color, ethnic, or novelty'),
  })).describe('Selected drum sounds for this genre fusion — typically 8-20 sounds. Empty array when noDrums is true.'),

  patternGuidance: z.string().describe('Brief guidance on how to use these sounds in patterns for this genre fusion — what patterns, tempos, and rhythmic feels are authentic. When noDrums is true, explain why this fusion should be drumless.'),

  reasoning: z.string().describe('Why these specific sounds were chosen and what was excluded, or why drums were omitted entirely'),
});

/**
 * Select a genre-appropriate drum kit using the drum arranger agent.
 * Runs early in the pipeline (after genre research, before composition).
 *
 * @param {Object} options
 * @param {string} options.classicalGenre - Classical genre component
 * @param {string} options.modernGenre - Modern genre component
 * @param {string} [options.genreResearch] - Genre research text from the research agent
 * @returns {Promise<{drumKit: Array<{gm: number, name: string, role: string}>, patternGuidance: string, reasoning: string}>}
 */
export async function selectDrumKit({ classicalGenre, modernGenre, genreResearch = null, userInstructions = '' }) {
  const anthropic = getAnthropic();
  const percussionRef = getPercussionReference();

  const prompt = `You are a percussion specialist selecting drum sounds for a ${classicalGenre} \u00d7 ${modernGenre} genre fusion composition.

${genreResearch ? `## GENRE RESEARCH (context about what this fusion requires)
${genreResearch}
` : ''}${userInstructions ? `## ⚠️ HARD USER REQUIREMENTS\nThe following user requirements MUST be respected. If they prohibit drums or percussion entirely (e.g. "piano only", "no drums", "strings only"), set noDrums to true and return an empty drumKit:\n${userInstructions}\n\n` : ''}## CRITICAL: DRUMLESS GENRES
Some genre fusions are inherently non-percussive. If BOTH the classical and modern genre are predominantly drumless or ambient in nature, set noDrums to true and return an empty drumKit.

Examples of drumless fusions:
- Sacred minimalism × ambient (e.g. Arvo Pärt × Brian Eno)
- Indeterminate × drone (e.g. Feldman × Stars of the Lid)
- Gregorian chant × any ambient subgenre
- Micropolyphony × drone (e.g. Ligeti × Éliane Radigue)
- Furniture music × ambient piano (e.g. Satie × Harold Budd)

If ONE genre clearly uses drums (e.g. trap, drill, techno, rock) — select drums. Only go drumless when BOTH genres are non-percussive. However, HARD USER REQUIREMENTS (above) always take precedence over genre defaults.

## YOUR TASK
Study the complete GM percussion map below. Select the sounds that are APPROPRIATE for this specific genre fusion — OR decide this fusion should be drumless.

If selecting drums, think about:
1. What FOUNDATION sounds does this fusion need? (kick, snare — every percussive genre needs these)
2. What TIMEKEEPING sounds fit? (hi-hats, ride, etc.)
3. What ACCENT sounds add energy? (crashes, toms — genre-appropriate ones)
4. What COLOR sounds add texture? (tambourine, congas, claves — only if they fit the genre)
5. What should be EXCLUDED? (sounds with warnings that don't match this genre)
Be GENEROUS with selections — include 8-20 sounds. The composition agent can choose which to use from your selection. But do NOT include sounds whose sonic character clashes with this genre fusion.
${percussionRef}`;

  try {
    const { output: result } = await generateText({
      model: anthropic(getModel('claude-haiku-4-5-20251001'), {
        cacheControl: { type: 'ephemeral', ttl: '1h' },
      }),
      output: Output.object({ schema: drumKitSchema }),
      prompt,
    });

    // If agent says no drums, respect it
    if (result.noDrums) {
      console.log(`🔇 Drum arranger: NO DRUMS for ${classicalGenre} × ${modernGenre} — ${result.reasoning}`);
      return null;
    }
    // Validate that all returned GM numbers actually exist in the reference
    const validatedKit = result.drumKit.filter(sound => {
      if (!GM_PERCUSSION[sound.gm]) {
        console.warn(`⚠️ Drum arranger returned unknown GM number ${sound.gm} — skipping`);
        return false;
      }
      return true;
    });
    // Ensure we always have at minimum kick + snare + hi-hat
    const gmNumbers = new Set(validatedKit.map(s => s.gm));
    const essentials = [
      { gm: 36, name: 'Bass Drum 1', role: 'foundation' },
      { gm: 38, name: 'Acoustic Snare', role: 'foundation' },
      { gm: 42, name: 'Closed Hi-Hat', role: 'timekeeping' },
    ];
    for (const essential of essentials) {
      if (!gmNumbers.has(essential.gm)) {
        validatedKit.push(essential);
      }
    }

    console.log(`🥁 Drum kit selected: ${validatedKit.length} sounds for ${classicalGenre} × ${modernGenre}`);
    for (const sound of validatedKit) {
      const refEntry = GM_PERCUSSION[sound.gm];
      const displayName = refEntry ? refEntry.name : sound.name;
      console.log(`   - ${sound.gm}: ${displayName} [${sound.role}]`);
    }
    return {
      drumKit: validatedKit,
      patternGuidance: result.patternGuidance,
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error('Drum arranger error:', error.message);
    // Fallback: return a safe default kit
    console.warn('⚠️ Using fallback drum kit');
    return {
      drumKit: [
        { gm: 35, name: 'Acoustic Bass Drum', role: 'foundation' },
        { gm: 36, name: 'Bass Drum 1', role: 'foundation' },
        { gm: 37, name: 'Side Stick', role: 'timekeeping' },
        { gm: 38, name: 'Acoustic Snare', role: 'foundation' },
        { gm: 39, name: 'Hand Clap', role: 'accent' },
        { gm: 40, name: 'Electric Snare', role: 'foundation' },
        { gm: 42, name: 'Closed Hi-Hat', role: 'timekeeping' },
        { gm: 44, name: 'Pedal Hi-Hat', role: 'timekeeping' },
        { gm: 46, name: 'Open Hi-Hat', role: 'timekeeping' },
        { gm: 49, name: 'Crash Cymbal 1', role: 'accent' },
        { gm: 51, name: 'Ride Cymbal 1', role: 'timekeeping' },
        { gm: 53, name: 'Ride Bell', role: 'timekeeping' },
        { gm: 54, name: 'Tambourine', role: 'color' },
      ],
      patternGuidance: 'Use standard rock/pop patterns with kick on beats 1 and 3, snare on 2 and 4, hi-hat on eighth notes.',
      reasoning: 'Fallback kit — drum arranger agent failed. Using safe universal percussion set.',
    };
  }
}
