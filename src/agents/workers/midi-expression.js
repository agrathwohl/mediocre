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

import { generateText } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Add MIDI expression to ABC notation
 * @param {Object} options
 * @param {string} options.abc - Current ABC notation
 * @param {string} options.directive - Specific directive from orchestrator
 * @returns {Promise<string>} Enhanced ABC with MIDI expression
 */
export async function addMidiExpression(options) {
  const { abc, directive } = options;

  console.log('\n🎹 MIDI Expression Worker executing...');
  console.log(`   Directive: ${directive}`);

  const systemPrompt = `You are an expert in MIDI expression, dynamics, and electronic music production.
You have access to the complete abc2midi %%MIDI extension set and should use it fully.

${ABC2MIDI_REFERENCE}`;

  try {
    const { text: enhancedAbc } = await generateText({
      model: anthropic('claude-sonnet-4-6'),
      system: systemPrompt,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: 'ephemeral', ttl: '1h' } },
      },
      messages: [
        {
          role: 'user',
          content: `Add MIDI expression to the ABC notation following this directive:\n"${directive}"\n\n## CURRENT ABC NOTATION\n\`\`\`\n${abc}\n\`\`\`\n\nReturn the COMPLETE ABC notation with expression added. Return ONLY the ABC notation, no explanations.`,
        },
      ],
    });

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
