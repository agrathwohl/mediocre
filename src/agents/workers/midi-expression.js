/**
 * MIDI Expression Worker Agent
 * Adds MIDI expression markers to ABC notation through edit tools (abc-edit-tools.js);
 * the model never re-writes the score.
 *
 * Expression types:
 * - %%MIDI crescendo
 * - %%MIDI diminuendo
 * - Velocity curves (via beatmod)
 * - Expression controllers
 * - Dynamic markings (!pp!, !mf!, !ff!, etc.)
 */

import { streamText, generateText, stepCountIs, Output, NoSuchToolError } from 'ai';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';
import { ADVENTUROUSNESS_MANDATE } from '../shared/adventurousness-directive.js';
import { FORK_DIRECTIVES_REFERENCE } from '../shared/fork-directives-reference.js';
import { writeFailure, trace } from '../shared/utils.js';
import { validateAbcNotation } from '../../utils/validation.js';
import { createAbcEditSession } from './abc-edit-tools.js';
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
${ADVENTUROUSNESS_MANDATE}
${usingFork ? '\nThe abc2midi-llm fork is available, with additional directives for organic timing, phrase shaping, and algorithmic transformation — part of the toolbox to reach for when they serve the music, not by default.\n' : ''}
${ABC2MIDI_REFERENCE}${forkSection}${customSystemPrompt ? '\n\n## EXTENDED DIRECTIVE SET\n' + customSystemPrompt : ''}`;

  const session = createAbcEditSession(abc, 'MidiExpression');
  const toolInstructions = `

## HOW YOU EDIT THE SCORE
You never write the score out. You change it only by calling the tools; the score text you are given is the original.
- Bars are numbered per voice from 1, counting only bars that contain notes or rests. Bar counts per voice are listed with the score.
- %% directives apply to the voice they are placed in, from that bar on.
- Use ramp for controller curves across bars instead of many single insert_directive calls.
- Use set_dynamic for the dynamic at the start of a bar, and replace_decoration for decorations on notes inside a bar.
- Use show_bars when you are unsure you have the right bar.
- Use remove_directive to undo a directive you inserted.
- Make independent tool calls together in one turn.
- Call validate once at the end and fix anything it reports.
- When you are done, reply with a short summary of what you changed.`;

  const startedAt = Date.now();
  const model = anthropic(getModel('claude-opus-5-5'));
  const streamErrors = [];
  const toolErrors = [];

  // Invalid tool input (strict mode makes this rare): regenerate just the input with structured output.
  const repairToolCall = async ({ toolCall, tools, inputSchema, error }) => {
    if (NoSuchToolError.isInstance(error)) return null;
    trace(`\n--- tool call repair: ${toolCall.toolName} ${toolCall.input} (${error.message})\n`);
    const { output } = await generateText({
      model,
      providerOptions: { anthropic: { effort: 'low' } },
      output: Output.object({ schema: tools[toolCall.toolName].inputSchema }),
      prompt: [
        `The model tried to call the tool "${toolCall.toolName}" with the following inputs:`,
        JSON.stringify(toolCall.input),
        'The tool accepts the following schema:',
        JSON.stringify(inputSchema(toolCall)),
        `The call failed with: ${error.message}`,
        'Please fix the inputs.',
      ].join('\n'),
    });
    trace(`--- repaired input: ${JSON.stringify(output)}\n`);
    return { ...toolCall, input: JSON.stringify(output) };
  };

  const runRound = async (messages, maxSteps) => {
    const result = streamText({
      model,
      system: systemPrompt + toolInstructions,
      providerOptions: { anthropic: { effort: 'medium' } },
      tools: session.tools,
      stopWhen: stepCountIs(maxSteps),
      experimental_repairToolCall: repairToolCall,
      messages,
    });
    for await (const part of result.fullStream) {
      if (part.type === 'reasoning-start') process.stdout.write('\n--- thinking ---\n');
      else if (part.type === 'reasoning-delta') process.stdout.write(part.text ?? '');
      else if (part.type === 'text-start') process.stdout.write('\n--- text ---\n');
      else if (part.type === 'text-delta') process.stdout.write(part.text ?? '');
      else if (part.type === 'tool-call') console.log(`\n🔧 ${part.toolName} ${JSON.stringify(part.input)}`);
      else if (part.type === 'tool-result') console.log(`   ↩ ${typeof part.output === 'string' ? part.output.split('\n')[0] + ' …' : JSON.stringify(part.output)}`);
      else if (part.type === 'tool-error') {
        toolErrors.push({ tool: part.toolName, input: part.input, error: String(part.error?.message ?? part.error) });
        console.error(`   ❌ tool error in ${part.toolName}: ${part.error?.message ?? part.error}`);
        trace(`\n!!! tool error in ${part.toolName} ${JSON.stringify(part.input)}: ${part.error?.message ?? part.error}\n`);
      } else if (part.type === 'finish-step') {
        const u = part.usage || {};
        console.log(`\n[MidiExpression step] finish: ${part.finishReason} (raw: ${part.rawFinishReason}) in: ${u.inputTokens} (cache read: ${u.inputTokenDetails?.cacheReadTokens}, cache write: ${u.inputTokenDetails?.cacheWriteTokens}) out: ${u.outputTokens} (reasoning: ${u.outputTokenDetails?.reasoningTokens})`);
      } else if (part.type === 'error') {
        streamErrors.push(String(part.error?.message ?? part.error));
        console.error(`\n❌ stream error: ${part.error?.message ?? part.error}`);
      }
    }
    const [finishReason, rawFinishReason, totalUsage, steps, response] = await Promise.all([
      result.finishReason, result.rawFinishReason, result.totalUsage, result.steps, result.response,
    ]);
    console.log(`\n[MidiExpression round] ${steps.length} step(s), finish: ${finishReason} (raw: ${rawFinishReason}), in: ${totalUsage.inputTokens} (cache read: ${totalUsage.inputTokenDetails?.cacheReadTokens}), out: ${totalUsage.outputTokens} (reasoning: ${totalUsage.outputTokenDetails?.reasoningTokens})`);
    if (streamErrors.length > 0) throw new Error(`stream error(s): ${streamErrors.join(' | ')}`);
    if (finishReason !== 'stop') {
      throw new Error(`did not finish (finishReason: ${finishReason}, raw: ${rawFinishReason}, after ${steps.length} step(s))`);
    }
    return response.messages;
  };

  try {
    const firstMessage = {
      role: 'user',
      content: `Add MIDI expression following this directive: "${directive}"\n\nVoices:\n${session.voiceSummary()}\n\nScore:\n\`\`\`\n${abc}\n\`\`\``,
    };
    const history = [firstMessage, ...(await runRound([firstMessage], 40))];

    // toolChoice 'required' is not available on this model (forced tool use is rejected), so check it here.
    const editCount = session.stats.insertedLines + session.stats.dynamicsSet + session.stats.decorationsReplaced;
    if (editCount === 0) throw new Error('the model made no edits');

    // New abc2midi errors (not present in the original score) get one fix round.
    const errorsOf = async (t) => (await validateAbcNotation(t)).issues;
    const originalErrors = new Set(await errorsOf(abc));
    let newErrors = (await errorsOf(session.getText())).filter((e) => !originalErrors.has(e));
    if (newErrors.length > 0) {
      console.warn(`\n⚠️ abc2midi reports ${newErrors.length} new error(s) after the edits; asking the model to fix them`);
      trace(`\n===== fix round: new abc2midi errors =====\n${newErrors.join('\n')}\n`);
      const fixMessage = { role: 'user', content: `abc2midi now reports these errors that were not in the original score:\n${newErrors.join('\n')}\nFix them with the tools (remove_directive or replace_decoration), then call validate.` };
      await runRound([...history, fixMessage], 15);
      newErrors = (await errorsOf(session.getText())).filter((e) => !originalErrors.has(e));
      if (newErrors.length > 0) throw new Error(`edits still cause abc2midi errors: ${newErrors.join(' | ')}`);
    }

    const edited = session.finish();
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(0);
    console.log(`\n[MidiExpression] done in ${seconds}s, edits: ${JSON.stringify(session.stats)}, tool errors: ${toolErrors.length}`);
    console.log('   ✅ MIDI expression applied (notes and rhythms verified unchanged, no new abc2midi errors)');
    return edited;
  } catch (error) {
    writeFailure('MidiExpression', { error: error.message, stack: error.stack, edits: session.stats, toolErrors, streamErrors, editedAbc: session.getText() });
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
