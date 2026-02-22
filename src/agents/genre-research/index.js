/**
 * Genre Research Agent
 * Produces a concise, authoritative musical profile of each genre
 * before the composition agent starts writing.
 *
 * This runs quickly (Haiku) and gives the composition agent specific
 * knowledge about what makes each genre essential — so it can't
 * accidentally generate a "Venetian Snares" piece with no drums.
 * It also evaluates whether the CLI flags passed complement or clash
 * with the genre requirements.
 */

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Research the musical characteristics of both genres and assess
 * whether the CLI options passed by the user complement or clash.
 *
 * @param {string} classicalGenre  - Classical / structured component
 * @param {string} modernGenre     - Modern / contemporary component
 * @param {Object} [flags]         - CLI flags passed by the user
 * @param {boolean} [flags.solo]           - --solo flag
 * @param {string}  [flags.recordLabel]    - --record-label value
 * @param {string}  [flags.producer]       - --producer value
 * @param {string}  [flags.instruments]    - --instruments value
 * @param {string}  [flags.style]          - style value
 * @returns {Promise<string>}      - Musical characteristics briefing
 */
export async function researchGenresForComposition(classicalGenre, modernGenre, flags = {}) {
  console.log(`🔍 Researching genre characteristics: ${classicalGenre} × ${modernGenre}...`);

  const { solo, recordLabel, producer, instruments, style } = flags;

  const flagsBlock = (solo || recordLabel || producer || instruments || style) ? `
## CLI FLAGS FROM USER
The user also specified:
${solo ? '- --solo: Include a dedicated solo section\n' : ''}${recordLabel ? `- --record-label: "${recordLabel}"\n` : ''}${producer ? `- --producer: "${producer}"\n` : ''}${instruments ? `- --instruments: "${instruments}"\n` : ''}${style ? `- style: "${style}"\n` : ''}
For each flag, assess: Does this COMPLEMENT the genre hybrid (lean into it) or CLASH with it (require careful handling)? Be direct — if a solo section makes no sense for breakcore, say so and explain how to handle it anyway.
` : '';

  const { text } = await generateText({
    model: anthropic('claude-haiku-4-5-20251001', {
      cacheControl: { type: 'ephemeral', ttl: '1h' },
    }),
    prompt: `You are a musicologist briefing a composer who is about to write a hybrid of "${classicalGenre}" and "${modernGenre}".

Write a dense, factual briefing covering BOTH genres. For each genre, answer:

1. DEFINING ELEMENTS: What specific sonic characteristics make this genre instantly recognizable?
2. RHYTHM & PERCUSSION: What role do drums/percussion play? Are they central or optional? Typical BPM and meter?
3. ESSENTIAL INSTRUMENTS: What instruments MUST be present for the genre to be authentic?
4. FORMAL STRUCTURE: Typical length, section structure, development approach.
5. MUST NOT OMIT: What elements, if absent, would make a listener say "this isn't ${classicalGenre}" or "this isn't ${modernGenre}"?

If "${classicalGenre}" or "${modernGenre}" refers to a specific artist or act (e.g., "Venetian Snares", "Aphex Twin", "Burial"), describe their specific style, not the general genre they represent.
${flagsBlock}
Be direct and specific. Do not hedge or generalize. Format as:
- SECTION 1: ${classicalGenre}
- SECTION 2: ${modernGenre}
- SECTION 3: HOW TO FUSE THEM (key tensions and opportunities in the hybrid)
${flagsBlock ? '- SECTION 4: FLAG ASSESSMENT (complement vs. clash for each flag above)' : ''}`,
  });

  return text;
}
