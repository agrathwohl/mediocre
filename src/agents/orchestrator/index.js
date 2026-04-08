/**
 * Orchestrator Agent - AI SDK v6
 * Master coordinator for post-processing workflow
 *
 * Responsibilities:
 * - Receives QA feedback and synthesizes with musical context
 * - Maintains full work history across iterations
 * - Decides which agent to invoke next (composition, ornamentation, midi-expression)
 * - Determines when composition meets quality standards
 */

import { streamText, generateText, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { modifyMusicWithAgent } from '../composition/index.js';
import { readAbcFileTool } from '../shared/tools.js';
import { reviewCompositionWithAgent } from '../qa/index.js';
import { addOrnamentation } from '../workers/ornamentation.js';
import { addMidiExpression } from '../workers/midi-expression.js';
import { enhanceDrums } from '../workers/drum-specialist.js';
import { validateAbcNotation } from '../../utils/claude.js';
import fs from 'fs/promises';
import path from 'path';
import { buildSessionData } from '../../control/session-persistence.js';
import { getAnthropic, getModel, supportsContextManagement } from '../../utils/llm-client.js';

/**
 * Orchestrator decision schema
 */
const orchestratorDecisionSchema = z.object({
  action: z.enum(['done', 'invoke']).describe('Whether to continue processing or finish'),

  reasoning: z.string().describe('Why this decision was made, synthesizing QA feedback, musical context, and work history'),

  agent: z.enum(['composition', 'ornamentation', 'midi-expression'])
    .describe('Which agent to invoke next. Always provide even when action is "done".'),

  directive: z.string()
    .describe('Specific instructions for the agent. Always provide even when action is "done".'),

  expectedImprovement: z.string()
    .describe('What improvement this should achieve. Always provide even when action is "done".'),
});

/**
 * Orchestrator Agent
 * Makes strategic decisions about post-processing based on full context
 */
export async function orchestratorAgent(options) {
  const anthropic = getAnthropic();
  const {
    currentAbc,
    originalAbc,
    musicalContext,
    genres,
    workHistory = [],
    qaFeedback = null,
    iteration = 0,
    maxIterations = 10,
    selectedSoundfonts = null,
    userComplaint = null,
    priorSession = null,
    abc2midiWarnings = [],  // Timing warnings from last iteration's validation
    abc2midiErrors = [],    // Hard errors from last iteration's validation
    userInstructions = '',
  } = options;

  // Check if we've hit max iterations
  if (iteration >= maxIterations) {
    return {
      action: 'done',
      reasoning: `Reached maximum iterations (${maxIterations}). Accepting current state.`,
    };
  }

  // Build context for orchestrator
  const context = buildOrchestratorContext({
    musicalContext,
    workHistory,
    qaFeedback,
    iteration,
  });

  // Orchestrator analyzes and decides
  const complaintBlock = userComplaint ? `
## ⚠️ USER COMPLAINT — ABSOLUTE TOP PRIORITY
The user has reviewed the prior session and has this complaint:

"${userComplaint}"

You MUST address this complaint above ALL other considerations. Every decision you make must directly serve resolving this specific grievance. Do NOT declare action "done" until the complaint has been verifiably resolved. If the complaint identifies something the previous session failed to do, make sure this session actually does it.

${priorSession ? `## PRIOR SESSION SUMMARY (what already failed)
Genre: ${priorSession.genre?.hybrid}
Total prior iterations: ${priorSession.totalIterations}
Prior final verdict: ${priorSession.finalVerdict} | ${priorSession.finalSummary || ''}

Prior iteration history:
${priorSession.iterations.map(iter =>
  `  Iter ${iter.iteration}: [${iter.orchestrator.agent}] "${iter.orchestrator.directive?.substring(0, 120)}" → QA: ${iter.qa.verdict} (${iter.qa.avgScore?.toFixed(1)}/10) — ${iter.qa.summary?.substring(0, 100)}`
).join('\n')}
` : ''}` : '';

  const instructionsBlock = userInstructions
    ? `\n## ⚠️ HARD REQUIREMENTS — ABSOLUTE NON-NEGOTIABLE\nThese user requirements MUST be preserved in every iteration. Any directive you issue MUST explicitly remind the composition agent to maintain these requirements:\n${userInstructions}\nBefore declaring "done", verify the composition fully complies with every requirement above.\n`
    : '';

  const prompt = `You are the orchestrator for a music composition post-processing pipeline.
${complaintBlock}${instructionsBlock}
## YOUR ROLE
You synthesize QA feedback, musical history context, and work history to decide what to do next.
You can invoke:
1. **composition** agent - to regenerate or modify musical content
2. **ornamentation** agent - to add baroque/classical ornaments (trills, mordents, grace notes)
3. **midi-expression** agent - to add velocity curves, crescendos, expression markers

## MUSICAL CONTEXT
${context.musicalContextSummary}

## GENRE
- Classical: ${genres.classical}
- Modern: ${genres.modern}
- Hybrid: ${genres.hybrid}

## WORK HISTORY (${workHistory.length} iterations so far)
${context.workHistorySummary}

## ABC2MIDI VALIDATION (last iteration)
${abc2midiErrors.length > 0
  ? `🚨 HARD ERRORS: ${abc2midiErrors.length} abc2midi error(s) detected — these are syntax/structural problems that cause abc2midi to bail early, producing truncated or silent MIDI output. The composition agent already attempted self-correction but could not fully resolve them. You MUST invoke the composition agent to fix these before anything else.
Sample errors:
${abc2midiErrors.slice(0, 15).join('\n')}`
  : '✅ No abc2midi errors'}

${abc2midiWarnings.length > 0
  ? `⚠️ ${abc2midiWarnings.length} timing warning(s) detected — bars contain note values that don't sum to the correct meter duration. This causes increasingly broken MIDI output and eventual segfaults.
${abc2midiWarnings.length > 20 ? `HIGH PRIORITY: ${abc2midiWarnings.length} warnings is critically high. Direct the composition agent to fix all timing errors before any other work.` : ''}
Sample warnings:
${abc2midiWarnings.slice(0, 15).join('\n')}`
  : '✅ No abc2midi warnings'}

## LATEST QA FEEDBACK
${context.qaFeedbackSummary}

## LOADED SOUNDFONTS (${selectedSoundfonts ? selectedSoundfonts.length : 0} total)
${selectedSoundfonts && selectedSoundfonts.length > 0
  ? `These soundfonts are loaded in TiMidity (later = higher priority override):\n${selectedSoundfonts.map((sf, i) => `${i + 1}. ${sf}`).join('\n')}\n\nWhen directing the midi-expression agent, reference specific programs that exist in these soundfonts.`
  : 'No custom soundfonts selected (using default TiMidity config).'}

## CURRENT ITERATION: ${iteration + 1}/${maxIterations}
${iteration >= maxIterations - 1 ? `
⚠️ FINAL ITERATION WARNING: This is iteration ${iteration + 1} of ${maxIterations}. After this iteration, the process ends regardless of quality. If ANY issues remain (timing warnings, silent sections, incomplete elements, quality scores below 8/10), you MUST invoke the appropriate agent to fix them NOW. Do not accept "good enough" — this is your last chance to improve the composition.
` : ''}

## HARD RULE: COMPOSITION COMPLETENESS GATE
If the QA feedback contains ANY high-priority recommendations with category "duration", you MUST:
- Set action: "invoke"
- Set agent: "composition"
- Use the expansion directive from the duration recommendation
You MAY NOT invoke ornamentation or midi-expression while high-priority duration issues remain unresolved. This gate takes absolute precedence over all other considerations.

## TECHNIQUE FIDELITY GATE
If the QA feedback scores techniqueFidelity below 5 OR fusionStrategy below 5, prioritize invoking the composition agent to address musicological deficiencies BEFORE spending iterations on ornamentation or midi-expression polish. A piece that fails to authentically represent its genres should not receive surface polish — fix the foundation first.

## YOUR TASK
Analyze the current state and decide:
- If composition meets quality standards → action: "done"
- If improvements needed → action: "invoke", specify which agent and exact directive

${iteration === 0 ? `
## FIRST ITERATION GUIDANCE
The foundation composition already exists and has been saved to disk — it is described in MUSICAL CONTEXT above. Do NOT instruct the composition agent to create or compose a new piece from scratch. Your job is to ENHANCE the existing composition. Unless there are unresolved abc2midi errors, start with ornamentation or MIDI expression improvements appropriate to the genre.
` : ''}

Consider:
1. QA feedback priority (high priority issues first) — duration gates everything else
2. What's already been tried (work history)
3. Genre appropriateness (don't add baroque ornaments to punk)
4. Progressive improvement (one aspect at a time)
5. **Iteration budget**: At iteration ${iteration + 1}/${maxIterations}, be strategic about remaining opportunities to improve

${iteration >= maxIterations - 1 ? `
**FINAL ITERATION STRATEGY**: With ${maxIterations - iteration} iteration(s) remaining, prioritize fixing critical/major issues over minor polish. Any issue you skip NOW will persist in the final output.
` : ''}
Be specific in directives (e.g., "Add trills to violin in measures 4-8" not "improve ornamentation").`;

  try {
    const stream = streamText({
      model: anthropic(getModel('claude-sonnet-4-6')),
      output: Output.object({ schema: orchestratorDecisionSchema }),
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral', ttl: '1h' },
          ...(supportsContextManagement() && {
            contextManagement: {
              edits: [
                {
                  type: 'compact_20260112',
                  trigger: { type: 'input_tokens', value: 50000 },
                  instructions: 'Summarize iteration history preserving: agent decisions, QA scores, directive outcomes, error patterns, abc2midi validation results',
                },
                {
                  type: 'clear_tool_uses_20250919',
                  trigger: { type: 'input_tokens', value: 30000 },
                  keep: { type: 'tool_uses', value: 3 },
                  clearAtLeast: { type: 'input_tokens', value: 5000 },
                },
              ],
            },
          }),
        },
      },
    });

    // Stream decision fields to terminal in real time
    let decision = {};
    const prev = { action: false, agent: false, reasoning: '', directive: '', expected: '' };
    process.stdout.write(`\n\u{1F3BC} Orchestrator Decision (Iteration ${iteration + 1}):\n`);

    for await (const partial of stream.partialOutputStream) {
      decision = partial;

      if (partial.action && !prev.action) {
        process.stdout.write(`   Action: ${partial.action}\n`);
        prev.action = true;
      }

      if (partial.agent && !prev.agent) {
        process.stdout.write(`   Agent: ${partial.agent}\n`);
        prev.agent = true;
      }

      if (partial.reasoning && partial.reasoning.length > prev.reasoning.length) {
        if (!prev.reasoning) process.stdout.write('   Reasoning: ');
        process.stdout.write(partial.reasoning.slice(prev.reasoning.length));
        prev.reasoning = partial.reasoning;
      }

      if (partial.directive && partial.directive.length > prev.directive.length) {
        if (!prev.directive) process.stdout.write('\n   Directive: ');
        process.stdout.write(partial.directive.slice(prev.directive.length));
        prev.directive = partial.directive;
      }

      if (partial.expectedImprovement && partial.expectedImprovement.length > prev.expected.length) {
        if (!prev.expected) process.stdout.write('\n   Expected: ');
        process.stdout.write(partial.expectedImprovement.slice(prev.expected.length));
        prev.expected = partial.expectedImprovement;
      }
    }
    process.stdout.write('\n');

    // Validate decision
    if (decision.action === 'invoke' && (!decision.agent || !decision.directive)) {
      throw new Error('Orchestrator returned "invoke" without agent or directive');
    }

    // Programmatic error gate — if abc2midi hard errors persist, force composition agent.
    // The composition agent already tried self-correction; orchestrator must try again.
    if (abc2midiErrors.length > 0 && decision.agent !== 'composition') {
      console.log(`🚨 abc2midi error gate override: forcing composition agent (was: ${decision.agent || 'done'})`);
      decision.action = 'invoke';
      decision.agent = 'composition';
      decision.directive = `Fix ${abc2midiErrors.length} abc2midi hard error(s) that are causing corrupted/truncated MIDI output. Errors: ${abc2midiErrors.slice(0, 10).join('; ')}`;
      decision.expectedImprovement = 'Eliminate abc2midi errors so MIDI output is valid and complete';
    }

    // Programmatic composition completeness gate — belt and suspenders enforcement.
    // If QA has outstanding high-priority duration issues, force composition agent
    // regardless of what the LLM decided.
    const highPriorityDurationIssues = (Array.isArray(qaFeedback) ? qaFeedback : []).filter(
      r => r.priority === 'high' && r.category === 'duration'
    );
    if (highPriorityDurationIssues.length > 0 &&
        decision.action === 'invoke' &&
        decision.agent !== 'composition') {
      const expansionDirective = highPriorityDurationIssues.map(r => r.action).join('. ');
      console.log(`⚠️  Duration gate override: forcing composition agent (was: ${decision.agent})`);
      decision.agent = 'composition';
      decision.directive = expansionDirective;
      decision.expectedImprovement = 'Expand composition to meet duration requirements before post-processing';
    }

    return decision;

  } catch (error) {
    console.error('Orchestrator agent error:', error.message);
    throw error;
  }
}

/**
 * Orchestrator Agent for Enhance mode
 * Uses generateText + read_abc_file tool so the orchestrator can read the
 * existing composition from disk before deciding what to improve.
 */
export async function orchestratorAgentEnhance(options) {
  const {
    currentAbc,
    originalAbc,
    abcFilePath,
    musicalContext,
    genres,
    workHistory = [],
    qaFeedback = null,
    iteration = 0,
    maxIterations = 10,
    selectedSoundfonts = null,
    userComplaint = null,
    priorSession = null,
    abc2midiWarnings = [],
    abc2midiErrors = [],
    userInstructions = '',
  } = options;

  if (iteration >= maxIterations) {
    return {
      action: 'done',
      reasoning: `Reached maximum iterations (${maxIterations}). Accepting current state.`,
      agent: 'composition',
      directive: 'N/A',
      expectedImprovement: 'N/A',
    };
  }

  const anthropic = getAnthropic();
  const context = buildOrchestratorContext({ musicalContext, workHistory, qaFeedback, iteration });

  const complaintBlock = userComplaint ? `
## ⚠️ USER COMPLAINT — ABSOLUTE TOP PRIORITY
The user has reviewed the prior session and has this complaint:

"${userComplaint}"

You MUST address this complaint above ALL other considerations.
${priorSession ? `## PRIOR SESSION SUMMARY
Genre: ${priorSession.genre?.hybrid}
Total prior iterations: ${priorSession.totalIterations}
Prior final verdict: ${priorSession.finalVerdict} | ${priorSession.finalSummary || ''}
` : ''}` : '';

  const enhanceInstructionsBlock = userInstructions
    ? `\n## ⚠️ HARD REQUIREMENTS — ABSOLUTE NON-NEGOTIABLE\nThese user requirements MUST be preserved in every iteration. Any directive you issue MUST explicitly remind the composition agent to maintain these requirements:\n${userInstructions}\nBefore declaring "done", verify the composition fully complies with every requirement above.\n`
    : '';

  const filePath = iteration === 0
    ? abcFilePath
    : abcFilePath.replace(/\.abc$/i, `_iter${iteration}.abc`);

  const prompt = `You are the orchestrator for a music composition post-processing pipeline.
${complaintBlock}${enhanceInstructionsBlock}
## YOUR ROLE
You synthesize QA feedback, musical history context, and work history to decide what to do next.
You can invoke:
1. **composition** agent - to regenerate or modify musical content
2. **ornamentation** agent - to add baroque/classical ornaments (trills, mordents, grace notes)
3. **midi-expression** agent - to add velocity curves, crescendos, expression markers

## MUSICAL CONTEXT
${context.musicalContextSummary}

## GENRE
- Classical: ${genres.classical}
- Modern: ${genres.modern}
- Hybrid: ${genres.hybrid}

## WORK HISTORY (${workHistory.length} iterations so far)
${context.workHistorySummary}

## ABC2MIDI VALIDATION (last iteration)
${abc2midiErrors.length > 0
  ? `🚨 HARD ERRORS: ${abc2midiErrors.length} abc2midi error(s) detected.
Sample errors:
${abc2midiErrors.slice(0, 15).join('\n')}`
  : '✅ No abc2midi errors'}

${abc2midiWarnings.length > 0
  ? `⚠️ ${abc2midiWarnings.length} timing warning(s) detected.
Sample warnings:
${abc2midiWarnings.slice(0, 15).join('\n')}`
  : '✅ No abc2midi warnings'}

## LATEST QA FEEDBACK
${context.qaFeedbackSummary}

## LOADED SOUNDFONTS (${selectedSoundfonts ? selectedSoundfonts.length : 0} total)
${selectedSoundfonts && selectedSoundfonts.length > 0
  ? `Loaded in TiMidity:\n${selectedSoundfonts.map((sf, i) => `${i + 1}. ${sf}`).join('\n')}`
  : 'No custom soundfonts selected.'}

## CURRENT ITERATION: ${iteration + 1}/${maxIterations}

## YOUR TASK
A composition ALREADY EXISTS on disk. Use the read_abc_file tool with filePath "${filePath}" to read it BEFORE making any decision.

Analyze the existing composition and decide:
- If composition meets quality standards → action: "done"
- If improvements needed → action: "invoke", specify which agent and exact directive
Do NOT ask the composition agent to write from scratch. Direct it to MODIFY the existing piece.

${iteration === 0 ? `
## FIRST ITERATION GUIDANCE
This is the first iteration. Read the composition with read_abc_file first, then decide what aspect most needs improvement.
` : ''}

Be specific in directives (e.g., "Add trills to violin in measures 4-8" not "improve ornamentation").`;

  try {
    const result = await generateText({
      model: anthropic(getModel('claude-sonnet-4-6')),
      tools: { read_abc_file: readAbcFileTool },
      output: Output.object({ schema: orchestratorDecisionSchema }),
      stopWhen: stepCountIs(7),
      messages: [{ role: 'user', content: prompt }],
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral', ttl: '1h' },
        },
      },
    });

    process.stdout.write(`\n\u{1F3BC} Orchestrator Decision (Iteration ${iteration + 1}):\n`);
    let decision;
    try {
      decision = result.output;
    } catch (outputErr) {
      // Log what the model actually returned for debugging
      console.error(`   Failed to extract structured output. Raw text: ${(result.text || '(empty)').slice(0, 500)}`);
      console.error(`   Steps: ${result.steps?.length || 0}`);
      throw outputErr;
    }
    if (!decision || !decision.action) {
      throw new Error(`Orchestrator returned empty decision. Raw text: ${(result.text || '').slice(0, 300)}`);
    }
    process.stdout.write(`   Action: ${decision.action}\n`);
    if (decision.agent) process.stdout.write(`   Agent: ${decision.agent}\n`);
    if (decision.reasoning) process.stdout.write(`   Reasoning: ${decision.reasoning}\n`);
    if (decision.directive) process.stdout.write(`   Directive: ${decision.directive}\n`);
    if (decision.expectedImprovement) process.stdout.write(`   Expected: ${decision.expectedImprovement}\n`);

    if (decision.action === 'invoke' && (!decision.agent || !decision.directive)) {
      throw new Error('Orchestrator returned "invoke" without agent or directive');
    }

    // Programmatic error gate
    if (abc2midiErrors.length > 0 && decision.agent !== 'composition') {
      console.log(`🚨 abc2midi error gate override: forcing composition agent (was: ${decision.agent || 'done'})`);
      decision.action = 'invoke';
      decision.agent = 'composition';
      decision.directive = `Fix ${abc2midiErrors.length} abc2midi hard error(s). Errors: ${abc2midiErrors.slice(0, 10).join('; ')}`;
      decision.expectedImprovement = 'Eliminate abc2midi errors so MIDI output is valid and complete';
    }

    // Duration gate
    const highPriorityDurationIssues = (Array.isArray(qaFeedback) ? qaFeedback : []).filter(
      r => r.priority === 'high' && r.category === 'duration'
    );
    if (highPriorityDurationIssues.length > 0 &&
        decision.action === 'invoke' &&
        decision.agent !== 'composition') {
      const expansionDirective = highPriorityDurationIssues.map(r => r.action).join('. ');
      console.log(`⚠️  Duration gate override: forcing composition agent (was: ${decision.agent})`);
      decision.agent = 'composition';
      decision.directive = expansionDirective;
      decision.expectedImprovement = 'Expand composition to meet duration requirements before post-processing';
    }

    return decision;

  } catch (error) {
    console.error('Orchestrator agent error (enhance):', error.message);
    throw error;
  }
}

/**
 * Build context summary for orchestrator prompt
 */
function buildOrchestratorContext(options) {
  const { musicalContext, workHistory, qaFeedback, iteration } = options;

  // Musical context summary
  const musicalContextSummary = musicalContext.analysis
    ? musicalContext.analysis.substring(0, 1500) + '...'
    : 'No musical context available';

  // Work history summary
  let workHistorySummary = 'No previous work';
  if (workHistory.length > 0) {
    workHistorySummary = workHistory.map((work, i) =>
      `${i + 1}. ${work.agent} (score: ${work.qaScore.toFixed(1)}/10): ${work.directive}`
    ).join('\n');
  }

  // QA feedback summary
  let qaFeedbackSummary = 'No QA feedback yet (first iteration)';
  if (qaFeedback) {
    const highPriority = qaFeedback.filter(r => r.priority === 'high');
    const mediumPriority = qaFeedback.filter(r => r.priority === 'medium');

    qaFeedbackSummary = `
HIGH PRIORITY (${highPriority.length}):
${highPriority.map(r => `- [${r.category}] ${r.action}`).join('\n') || 'None'}

MEDIUM PRIORITY (${mediumPriority.length}):
${mediumPriority.map(r => `- [${r.category}] ${r.action}`).join('\n') || 'None'}
    `.trim();
  }

  return {
    musicalContextSummary,
    workHistorySummary,
    qaFeedbackSummary,
  };
}

/**
 * Main orchestration loop
 * Coordinates orchestrator → agent → QA → orchestrator cycle
 */
export async function orchestratePostProcessing(options) {
  const {
    abcFilePath,
    musicalContext,
    genres,
    maxIterations: configMaxIterations = 10,
    selectedSoundfonts = null,
    drumPrescription = null,
    customSystemPrompt = null,
    userComplaint: initialUserComplaint = null,
    priorSession = null,
    gateController = null,
    resumeState = null,
    enhance = false,
    objectMode = true,
    userInstructions = '',
  } = options;

  let maxIterations = configMaxIterations;
  let userComplaint = initialUserComplaint;
  let exitReason = 'max_iterations';
  const originalAbc = await fs.readFile(abcFilePath, 'utf-8');
  const baseNoExt = abcFilePath.replace(/\.abc$/, '');
  // Initialize state from resumeState if resuming a previous session
  let currentAbc = resumeState?.currentAbc ?? originalAbc;
  let workHistory = resumeState?.workHistory ?? [];
  let sessionLog = resumeState?.sessionLog ?? [];
  let lastQaResult = resumeState?.lastQaResult ?? null;
  let lastAbc2midiWarnings = resumeState?.lastAbc2midiWarnings ?? [];
  let lastAbc2midiErrors = resumeState?.lastAbc2midiErrors ?? [];
  let iteration = resumeState?.currentIteration ?? 0;
  const writtenPaths = resumeState?.writtenPaths ? [...resumeState.writtenPaths] : [];
  let stopped = false;
  // When resuming, maxIterations is ADDITIVE from current iteration
  if (resumeState) {
    maxIterations = iteration + configMaxIterations;
  }

  console.log('\n🎼 Starting Orchestrated Post-Processing');
  console.log(`   Genre: ${genres.hybrid}`);
  console.log(`   Max Iterations: ${maxIterations}`);
  if (gateController) console.log('   Mode: Interactive (human-in-the-loop)');
  console.log('');

  // ── SIGINT interrupt handler ──
  // Ctrl+C during orchestration: finish current LLM call, then stop cleanly.
  // Best-so-far ABC is saved to ../mediocre/output/interrupts/___<name>.abc
  const sigintHandler = () => {
    if (!stopped) {
      stopped = true;
      exitReason = 'interrupted';
      console.log('\n\n⚡ Interrupted — finishing current step then stopping...');
      console.log('   Best iteration so far will be saved to interrupts/');
    }
  };
  process.once('SIGINT', sigintHandler);

  while (!stopped) {
    while (iteration < maxIterations && !stopped) {
      const agentFn = enhance ? orchestratorAgentEnhance : orchestratorAgent;
      const decision = await agentFn({
        currentAbc,
        originalAbc,
        abcFilePath,
        musicalContext,
        genres,
        workHistory,
        qaFeedback: lastQaResult?.recommendations || null,
        iteration,
        maxIterations,
        selectedSoundfonts,
        userComplaint,
        priorSession,
        abc2midiWarnings: lastAbc2midiWarnings,
        abc2midiErrors: lastAbc2midiErrors,
        userInstructions,
      });

      // Clear userComplaint after it's been consumed by the orchestrator
      userComplaint = null;

      // ── GATE 1: Orchestrator made a decision ──
      if (gateController) {
        const gate = await gateController.onDecision(decision, {
          iteration, maxIterations, workHistory, currentAbc, lastQaResult,
        });
        if (gate.action === 'quit') { stopped = true; exitReason = 'quit'; break; }
        if (gate.action === 'direct') {
          userComplaint = gate.directive;
          continue;
        }
        if (gate.extend) maxIterations += gate.extend;
      }

      // ── GATE 2: Orchestrator says "done" ──
      if (decision.action === 'done') {
        if (gateController) {
          const gate = await gateController.onDone(currentAbc, lastQaResult, iteration);
          if (gate.action === 'reject') {
            userComplaint = 'Not satisfied yet, keep improving';
            continue;
          }
          if (gate.action === 'direct') {
            userComplaint = gate.directive;
            continue;
          }
        }
        console.log('\n✅ Orchestrator satisfied with composition');
        exitReason = 'done';
        stopped = true;
        break;
      }

      // Invoke the agent orchestrator selected
      let newAbc;

      if (!decision.agent) {
        throw new Error(`Orchestrator decision has action 'invoke' but missing 'agent' field`);
      }

      if (decision.agent === 'composition') {
        newAbc = await modifyMusicWithAgent({
          currentAbc,
          modificationDirective: decision.directive,
          qaFeedback: lastQaResult,
          genre: genres.hybrid,
          classicalGenre: genres.classical,
          modernGenre: genres.modern,
          drumPrescription,
          objectMode,
          userInstructions,
          customSystemPrompt,
        });
      } else if (decision.agent === 'ornamentation') {
        newAbc = await addOrnamentation({
          abc: currentAbc,
          directive: decision.directive,
          customSystemPrompt,
        });
      } else if (decision.agent === 'midi-expression') {
        newAbc = await addMidiExpression({
          abc: currentAbc,
          directive: decision.directive,
          customSystemPrompt,
        });
      } else {
        throw new Error(`Unknown agent type: ${decision.agent}. Valid agents: composition, ornamentation, midi-expression`);
      }

      // Write this iteration to disk immediately as an intermediate checkpoint
      const iterPath = `${baseNoExt}_iter${iteration + 1}.abc`;
      await fs.writeFile(iterPath, newAbc);
      writtenPaths.push(iterPath);
      console.log(`💾 Iteration written: ${path.basename(iterPath)}`);

      // Run abc2midi validation to capture errors and warnings for next orchestrator decision
      const iterValidation = await validateAbcNotation(newAbc);
      lastAbc2midiWarnings = iterValidation.warnings || [];
      lastAbc2midiErrors = iterValidation.issues || [];
      if (lastAbc2midiErrors.length > 0) {
        console.warn(`   🚨 ${lastAbc2midiErrors.length} abc2midi error(s) persist — feeding to orchestrator`);
      }
      if (lastAbc2midiWarnings.length > 0) {
        console.warn(`   ⚠️ ${lastAbc2midiWarnings.length} abc2midi timing warning(s) — feeding to orchestrator`);
      }

      // QA evaluates the result
      console.log('\n🔍 Running QA evaluation...');

      const qaResult = await reviewCompositionWithAgent({
        abcFilePath: iterPath,
        genre: genres.hybrid,
        classicalGenre: genres.classical,
        modernGenre: genres.modern,
        drumPrescription,
        userInstructions,
        customSystemPrompt,
      });

      // Calculate average score
      const scoreValues = Object.values(qaResult.scores);
      const avgScore = scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length;

      // ── GATE 3: Agent produced output, QA scored it ──
      if (gateController) {
        const gate = await gateController.onAgentOutput(newAbc, qaResult, iteration, {
          decision, workHistory, maxIterations,
        });
        if (gate.action === 'quit') { stopped = true; break; }
        if (gate.action === 'reject') continue;
        if (gate.action === 'direct') userComplaint = gate.directive;
        if (gate.extend) maxIterations += gate.extend;
      }

      // Update state for next iteration
      currentAbc = newAbc;
      lastQaResult = qaResult;

      const iterRecord = {
        iteration: iteration + 1,
        orchestrator: {
          action: decision.action,
          agent: decision.agent,
          directive: decision.directive,
          expectedImprovement: decision.expectedImprovement,
          reasoning: decision.reasoning,
        },
        abc2midiErrorCount: lastAbc2midiErrors.length,
        abc2midiErrorSample: lastAbc2midiErrors.slice(0, 10),
        abc2midiWarningCount: lastAbc2midiWarnings.length,
        abc2midiWarningSample: lastAbc2midiWarnings.slice(0, 10),
        qa: {
          verdict: qaResult.verdict,
          avgScore,
          scores: qaResult.scores,
          issues: qaResult.issues,
          strengths: qaResult.strengths,
          recommendations: qaResult.recommendations,
          summary: qaResult.summary,
        },
      };

      workHistory.push({
        iteration: iteration + 1,
        agent: decision.agent,
        directive: decision.directive,
        expectedImprovement: decision.expectedImprovement,
        qaScore: avgScore,
        qaVerdict: qaResult.verdict,
        qaFeedback: qaResult.recommendations,
      });
      sessionLog.push(iterRecord);

      iteration++;

      // QA feedback goes back to orchestrator in next iteration
      console.log(`\n📊 Iteration ${iteration} complete - QA score: ${avgScore.toFixed(1)}/10`);
    }

    // ── GATE 4: Max iterations reached ──
    if (!stopped && iteration >= maxIterations && gateController) {
      const gate = await gateController.onMaxIterations(currentAbc, lastQaResult, iteration);
      if (gate.extend && gate.extend > 0) {
        maxIterations += gate.extend;
        if (gate.action === 'direct') userComplaint = gate.directive;
        continue;
      }
    }
    break;
  }

  // Remove SIGINT handler now that the loop is done (no-op if already fired)
  process.removeListener('SIGINT', sigintHandler);

  // ── Interrupted: save best-so-far to interrupts dir ──
  if (exitReason === 'interrupted') {
    try {
      const interruptsDir = path.resolve(path.dirname(abcFilePath), '..', 'mediocre', 'output', 'interrupts');
      await fs.mkdir(interruptsDir, { recursive: true });
      const baseName = path.basename(abcFilePath, '.abc');
      const interruptPath = path.join(interruptsDir, `___${baseName}.abc`);
      await fs.writeFile(interruptPath, currentAbc);
      console.log(`\n💾 Interrupted — best iteration saved to:`);
      console.log(`   ${interruptPath}`);
    } catch (saveErr) {
      console.error('⚠️  Could not save interrupted output:', saveErr.message);
    }
  }

  // ── POST-LOOP: Drum Specialist Pass ──
  let drumSpecialistResult = null;
  if (drumPrescription && (exitReason === 'done' || exitReason === 'max_iterations')) {
    try {
      console.log('\n🥁 Running drum specialist pass...');

      const preDrumAbc = currentAbc;

      let baselineQaResult = lastQaResult;
      if (!baselineQaResult) {
        console.log('   Running baseline QA for comparison...');
        baselineQaResult = await reviewCompositionWithAgent({
          abcFilePath: `${baseNoExt}_iter${iteration}.abc`,
          genre: genres.hybrid,
          classicalGenre: genres.classical,
          modernGenre: genres.modern,
          drumPrescription,
          userInstructions,
          customSystemPrompt,
        });
      }

      const drumAbc = await enhanceDrums({
        abc: currentAbc,
        drumPrescription,
        genres,
        customSystemPrompt,
      });

      const drumIterPath = `${baseNoExt}_drums.abc`;
      await fs.writeFile(drumIterPath, drumAbc);

      console.log('\n🔍 Running QA on drum-enhanced version...');
      const drumQaResult = await reviewCompositionWithAgent({
        abcFilePath: drumIterPath,
        genre: genres.hybrid,
        classicalGenre: genres.classical,
        modernGenre: genres.modern,
        drumPrescription,
        userInstructions,
        customSystemPrompt,
      });

      const baselineScores = Object.values(baselineQaResult.scores);
      const drumScores = Object.values(drumQaResult.scores);
      const baselineAvg = baselineScores.reduce((sum, s) => sum + s, 0) / baselineScores.length;
      const drumAvg = drumScores.reduce((sum, s) => sum + s, 0) / drumScores.length;

      if (drumAvg >= baselineAvg) {
        console.log(`\n✅ Drum specialist accepted (${baselineAvg.toFixed(1)} → ${drumAvg.toFixed(1)})`);
        currentAbc = drumAbc;
        lastQaResult = drumQaResult;
        drumSpecialistResult = { accepted: true, preScore: baselineAvg, postScore: drumAvg };
      } else {
        console.log(`\n❌ Drum specialist rejected (${baselineAvg.toFixed(1)} → ${drumAvg.toFixed(1)})`);
        const rejectedPath = `${baseNoExt}_drums_rejected.abc`;
        await fs.writeFile(rejectedPath, drumAbc);
        writtenPaths.push(rejectedPath);
        console.log(`   Rejected version saved: ${path.basename(rejectedPath)}`);
        drumSpecialistResult = { accepted: false, preScore: baselineAvg, postScore: drumAvg, rejectedPath };
      }

      await fs.unlink(drumIterPath).catch(() => {});
    } catch (drumErr) {
      console.error('⚠️  Drum specialist pass failed, keeping pre-drum version:', drumErr.message);
      drumSpecialistResult = { accepted: false, error: drumErr.message };
    }
  }

  const humanDirectives = gateController ? gateController.getDirectives() : [];
  if (gateController) gateController.close();
  const sessionLogPath = `${baseNoExt}_session.json`;
  const sessionState = {
    abcFilePath,
    currentAbc,
    originalAbc,
    genres,
    musicalContext,
    selectedSoundfonts,
    drumPrescription,
    iteration,
    maxIterations,
    workHistory,
    sessionLog,
    lastQaResult,
    lastAbc2midiWarnings,
    lastAbc2midiErrors,
    humanDirectives,
    exitReason,
    writtenPaths,
    drumSpecialistResult,
  };
  const sessionData = buildSessionData(sessionState);
  await fs.writeFile(sessionLogPath, JSON.stringify(sessionData, null, 2));
  console.log(`\n📋 Session log: ${path.basename(sessionLogPath)}`);
  if (exitReason === 'quit') {
    console.log('   (Session is resumable — use `mediocre resume` to continue)');
  }

  // Return final result
  return {
    enhancedAbc: currentAbc,
    originalAbc,
    workHistory,
    finalQaResult: lastQaResult,
    iterations: iteration,
    writtenPaths,
    sessionLogPath,
    drumSpecialistResult,
  };
}
