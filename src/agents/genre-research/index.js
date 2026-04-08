/**
 * Genre Research Agent
 *
 * Produces a concise, authoritative musical profile of each genre
 * before the composition agent starts writing. Now backed by a file
 * cache so repeated genres skip the API call entirely.
 */

import { generateText } from 'ai';
import { getAnthropic, getModel } from '../../utils/llm-client.js';
import {
  getCachedResearch,
  cacheAllSections,
  cachePair,
  parseResearchSections,
  assembleBriefing,
} from '../../utils/genre-research-cache.js';

const GENRE_BRIEFING_CATEGORIES = `
1. DEFINING ELEMENTS: What specific sonic characteristics make this genre instantly recognizable?
2. RHYTHM & PERCUSSION: What role do drums/percussion play? Are they central or optional? Typical BPM and meter?
3. ESSENTIAL INSTRUMENTS: What instruments MUST be present for the genre to be authentic?
4. FORMAL STRUCTURE: Typical length, section structure, development approach.
5. MUST NOT OMIT: What elements, if absent, would make a listener say "this isn't really this genre"?
6. COMPOSITIONAL TECHNIQUES: What specific compositional methods define this genre? Include: voice leading rules or tendencies, harmonic language (chord vocabulary, progression logic, cadential patterns), counterpoint or layering methods, rhythmic construction approach (additive, divisive, process-based, chance-based), and textural strategies (homophonic, polyphonic, heterophonic, sound-mass).
7. STYLE FINGERPRINTS (CRITICAL): Identify exactly 2-3 techniques that are ESSENTIAL MARKERS of authenticity for this genre. These are techniques where, if absent, a knowledgeable listener would say "this isn't really this genre." Format each as: TECHNIQUE NAME — one-sentence description of what it sounds like and how a composer would implement it.`.trim();

const MIXTURE_STRATEGY_PROMPT = `recommend ONE of these four approaches from Alcalde 2022: CLASH — harsh juxtaposition/superposition where styles remain structurally distinct and friction is deliberate; COEXISTENCE — align shared characteristics as linchpins while maintaining unaligned features, creating a third compound identity; DISTORTION — one recognizable style altered by incongruous elements that don't form a second clear identity; TRAJECTORY — gradual traceable transformation from one style into another. Explain WHY this strategy suits this pairing, and identify which STYLE FINGERPRINTS from each genre should interact and HOW under the chosen strategy.`;

function buildFlagsBlock(flags) {
  const { solo, recordLabel, producer, instruments, style } = flags;
  if (!solo && !recordLabel && !producer && !instruments && !style) return '';
  return `
## CLI FLAGS FROM USER
The user also specified:
${solo ? '- --solo: Include a dedicated solo section\n' : ''}${recordLabel ? `- --record-label: "${recordLabel}"\n` : ''}${producer ? `- --producer: "${producer}"\n` : ''}${instruments ? `- --instruments: "${instruments}"\n` : ''}${style ? `- style: "${style}"\n` : ''}
For each flag, assess: Does this COMPLEMENT the genre hybrid (lean into it) or CLASH with it (require careful handling)? Be direct — if a solo section makes no sense for breakcore, say so and explain how to handle it anyway.
`;
}

function buildInstructionsBlock(userInstructions) {
  if (!userInstructions) return '';
  return `
## HARD USER REQUIREMENTS
The following requirements are absolute and override genre conventions. When describing essential instruments, percussion, and structure for this fusion, you MUST account for these constraints:
${userInstructions}
`;
}

/**
 * @param {string} classicalGenre
 * @param {string} modernGenre
 * @param {Object} [flags]
 * @returns {Promise<string>}
 */
export async function researchGenresForComposition(classicalGenre, modernGenre, flags = {}) {
  const { userInstructions } = flags;

  // ── Cache check ─────────────────────────────────────────────────────
  const cached = await getCachedResearch(classicalGenre, modernGenre);

  // FULL HIT: all three parts cached → zero API cost
  if (cached.classical && cached.modern && cached.pair) {
    console.log(`📚 Genre research cache hit: ${classicalGenre} × ${modernGenre} (skipping API call)`);
    return assembleBriefing(classicalGenre, modernGenre, cached.classical, cached.modern, cached.pair, flags);
  }

  // COMPONENTS HIT, PAIR MISS: both genres known, just need mixture strategy
  if (cached.classical && cached.modern && !cached.pair) {
    console.log(`📚 Both genres cached — generating mixture strategy for ${classicalGenre} × ${modernGenre}...`);
    const mixtureText = await generateMixtureOnly(classicalGenre, modernGenre, cached.classical, cached.modern, flags);
    if (!userInstructions) await cachePair(classicalGenre, modernGenre, mixtureText);
    return assembleBriefing(classicalGenre, modernGenre, cached.classical, cached.modern, mixtureText, flags);
  }

  // ANYTHING ELSE (partial or full miss) → full generation, then cache
  if (cached.classical || cached.modern) {
    const hitName = cached.classical ? classicalGenre : modernGenre;
    console.log(`📚 Partial cache hit (${hitName}) — full research for ${classicalGenre} × ${modernGenre}...`);
  } else {
    console.log(`🔍 Researching genre characteristics: ${classicalGenre} × ${modernGenre}...`);
  }

  const fullText = await generateFullResearch(classicalGenre, modernGenre, flags);

  // Parse and cache individual sections (skip if userInstructions present —
  // those contaminate the genre profiles with session-specific guidance)
  if (!userInstructions) {
    const sections = parseResearchSections(fullText);
    if (sections.classical || sections.modern || sections.mixture) {
      const count = await cacheAllSections(classicalGenre, modernGenre, sections);
      console.log(`💾 Cached ${count} genre research section(s) for future use`);
    }
  }

  return fullText;
}

// ── Full research (current behavior, extracted) ──────────────────────

async function generateFullResearch(classicalGenre, modernGenre, flags) {
  const anthropic = getAnthropic();
  const flagsBlock = buildFlagsBlock(flags);
  const instructionsBlock = buildInstructionsBlock(flags.userInstructions);

  const { text } = await generateText({
    model: anthropic(getModel('claude-haiku-4-5-20251001'), {
      cacheControl: { type: 'ephemeral', ttl: '1h' },
    }),
    prompt: `You are a musicologist briefing a composer who is about to write a hybrid of "${classicalGenre}" and "${modernGenre}".
${instructionsBlock}
Write a dense, factual briefing covering BOTH genres. For each genre, answer:

${GENRE_BRIEFING_CATEGORIES}

If "${classicalGenre}" or "${modernGenre}" refers to a specific artist or act (e.g., "Venetian Snares", "Aphex Twin", "Burial"), describe their specific style, not the general genre they represent.
${flagsBlock}
Be direct and specific. Do not hedge or generalize. Format as:
- SECTION 1: ${classicalGenre}
- SECTION 2: ${modernGenre}
- SECTION 3: MIXTURE STRATEGY RECOMMENDATION (${MIXTURE_STRATEGY_PROMPT})
${flagsBlock ? '- SECTION 4: FLAG ASSESSMENT (complement vs. clash for each flag above)' : ''}`,
  });

  return text;
}

// ── Mixture-only generation (both components cached) ─────────────────

async function generateMixtureOnly(classicalGenre, modernGenre, cachedClassical, cachedModern, flags) {
  const anthropic = getAnthropic();
  const instructionsBlock = buildInstructionsBlock(flags.userInstructions);

  const { text } = await generateText({
    model: anthropic(getModel('claude-haiku-4-5-20251001'), {
      cacheControl: { type: 'ephemeral', ttl: '1h' },
    }),
    prompt: `You are a musicologist. You have already researched both genres individually. Now recommend a mixture strategy for combining them.

## GENRE A: ${classicalGenre}
${cachedClassical}

## GENRE B: ${modernGenre}
${cachedModern}
${instructionsBlock}
Write a MIXTURE STRATEGY RECOMMENDATION for combining "${classicalGenre}" and "${modernGenre}". ${MIXTURE_STRATEGY_PROMPT}

Output ONLY the mixture strategy — do not repeat the genre profiles.`,
  });

  return text;
}
