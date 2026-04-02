/**
 * Title Generation Agent - AI SDK v6
 * Generates unique, creative titles for music compositions
 * Ensures no title collisions with existing compositions
 */

import { ToolLoopAgent, tool, stepCountIs } from 'ai';
import { z } from 'zod';
import { checkTitleExistsTool } from '../shared/tools.js';
import { extractDoneResult, createStepLogger } from '../shared/utils.js';
import { getAnthropic, getModel } from '../../utils/llm-client.js';

let _titleAgent = null;
function getTitleAgent() {
  if (!_titleAgent) {
    const anthropic = getAnthropic();
    _titleAgent = new ToolLoopAgent({
      model: anthropic(getModel('claude-haiku-4-5-20251001'), {
        cacheControl: { type: 'ephemeral', ttl: '1h' },
      }),

  instructions: `You are a creative title generator for music compositions.

Generate unique, specific titles that aren't already in use.

Guidelines:
- Avoid generic titles like "Serialist Chaos" or "Prepared Noise"
- Be inventive and specific to the genre fusion
- Reflect the character of both classical and modern elements
- Use evocative language that captures the composition's essence
- Keep titles under 60 characters

Workflow:
1. Generate a creative title for the genre
2. Use check_title_exists tool to verify uniqueness
3. If exists, generate a different title
4. When unique title found, call done tool`,

  tools: {
    check_title_exists: checkTitleExistsTool,

    done: tool({
      description: 'Signal that a unique title has been found',
      inputSchema: z.object({
        finalTitle: z.string().describe('The unique, creative title for the composition'),
      }),
      // No execute function - this stops the loop
    }),
  },

  stopWhen: [
    stepCountIs(10), // Max 10 attempts to find unique title
    (state) => {
      // Stop when done tool is called
      return state.steps
        .flatMap(s => s.toolCalls || [])
        .some(tc => tc.toolName === 'done');
    },
  ],

  toolChoice: 'required', // Force tool use at every step
    });
  }
  return _titleAgent;
}

/**
 * Generate a unique title using the title agent
 * @param {string} genre - Genre for context (e.g., "baroque_x_synthwave")
 * @param {string} [initialTitle] - Optional initial title to check/improve
 * @returns {Promise<string>} Unique composition title
 */
export async function ensureUniqueTitleWithAgent(genre, initialTitle = null) {
  const prompt = initialTitle
    ? `Generate a unique title for a ${genre} composition. Initial suggestion: "${initialTitle}". If it exists, create a different creative title.`
    : `Generate a unique, creative title for a ${genre} composition.`;

  try {
    const result = await getTitleAgent().generate({
      prompt,
      onStepFinish: createStepLogger('TitleAgent'),
    });

    // Extract final title from done tool call
    const doneArgs = extractDoneResult(result, 'done');

    if (doneArgs && doneArgs.finalTitle) {
      return doneArgs.finalTitle;
    }

    // Fallback if no done call found (shouldn't happen with forced tools)
    console.warn('Title agent completed without calling done tool, using fallback');
    return initialTitle || `Untitled ${genre} ${Date.now()}`;

  } catch (error) {
    console.error('Title agent error:', error.message);

    // Fallback to timestamp-based unique title
    const fallbackTitle = initialTitle
      ? `${initialTitle} (${Date.now()})`
      : `Untitled ${genre} ${Date.now()}`;

    console.log(`Using fallback title: ${fallbackTitle}`);
    return fallbackTitle;
  }
}
