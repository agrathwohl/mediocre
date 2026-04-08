/**
 * MIDI Expression Worker Agent
 * Adds MIDI expression markers to ABC notation
 *
 * Expression types:
 * - %%MIDI crescendo
 * - %%MIDI diminuendo
 * - Velocity curves (via beatmod)
 * - Expression controllers
 * - Dynamic markings (!pp!, !mf!, !ff!, etc.)
 */

import { streamText } from 'ai';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';
import { FORK_DIRECTIVES_REFERENCE } from '../shared/fork-directives-reference.js';
import { getAnthropic, getModel, getAbc2midiBinary } from '../../utils/llm-client.js';

/**
 * Add MIDI expression to ABC notation
 * @param {Object} options
 * @param {string} options.abc - Current ABC notation
 * @param {string} options.directive - Specific directive from orchestrator
 * @returns {Promise<string>} Enhanced ABC with MIDI expression
 */
export async function addMidiExpression(options) {
  const anthropic = getAnthropic();
  const { abc, directive, customSystemPrompt = null } = options;

  console.log('\n🎹 MIDI Expression Worker executing...');
  console.log(`   Directive: ${directive}`);

  const usingFork = getAbc2midiBinary() !== 'abc2midi';
  const forkSection = usingFork ? '\n\n' + FORK_DIRECTIVES_REFERENCE : '';

  const systemPrompt = `You are an expert in MIDI expression, dynamics, and electronic music production.
You have access to the complete abc2midi %%MIDI extension set and should use it fully.
${usingFork ? '\nYou are using the abc2midi-llm fork which supports additional directives for organic timing, phrase shaping, and algorithmic transformation. USE THEM — they are the primary tools for expressive MIDI output.\n' : ''}
${ABC2MIDI_REFERENCE}${forkSection}${customSystemPrompt ? '\n\n## EXTENDED DIRECTIVE SET\n' + customSystemPrompt : ''}`;

  try {
    const result = streamText({
      model: anthropic(getModel('claude-sonnet-4-6')),
      system: systemPrompt,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
      },
      messages: [
        {
          role: 'user',
          content: `OUTPUT FORMAT: Raw ABC notation ONLY. No prose, no analysis, no commentary, no markdown fences. Your entire response must be valid ABC notation that abc2midi can compile. Any non-ABC text will destroy the file.\n\nAdd MIDI expression following this directive: "${directive}"\n\n${abc}`,
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

    console.log('   ✅ MIDI expression applied');

    return cleaned;

  } catch (error) {
    console.error('MIDI expression worker error:', error.message);
    throw error;
  }
}

/**
 * Example directive formats the orchestrator might send:
 * - "Add velocity crescendo to drums in measures 10-14"
 * - "Add MIDI expression curves to synth pads for 80s aesthetic"
 * - "Add subtle beatmod (value 8) to humanize the rhythm"
 * - "Add crescendo from measure 8-12, then diminuendo 12-16"
 * - "Enhance dynamics with pp to ff range for dramatic effect"
 */
