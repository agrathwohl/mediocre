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

import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { modifyMusicWithAgent } from '../composition/index.js';
import { reviewCompositionWithAgent } from '../qa/index.js';
import { addOrnamentation } from '../workers/ornamentation.js';
import { addMidiExpression } from '../workers/midi-expression.js';
import { validateAbcNotation } from '../../utils/claude.js';
import fs from 'fs';
import path from 'path';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * Orchestrator decision schema
 */
const orchestratorDecisionSchema = z.object({
  action: z.enum(['done', 'invoke']).describe('Whether to continue processing or finish'),

  reasoning: z.string().describe('Why this decision was made, synthesizing QA feedback, musical context, and work history'),

  agent: z.enum(['composition', 'ornamentation', 'midi-expression']).optional()
    .describe('Which agent to invoke (required if action is "invoke")'),

  directive: z.string().optional()
    .describe('Specific instructions for the agent (required if action is "invoke")'),

  expectedImprovement: z.string().optional()
    .describe('What improvement this should achieve (required if action is "invoke")'),
});

/**
 * Orchestrator Agent
 * Makes strategic decisions about post-processing based on full context
 */
export async function orchestratorAgent(options) {
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

  const prompt = `You are the orchestrator for a music composition post-processing pipeline.
${complaintBlock}
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

## YOUR TASK
Analyze the current state and decide:
- If composition meets quality standards → action: "done"
- If improvements needed → action: "invoke", specify which agent and exact directive

${iteration === 0 ? `
## FIRST ITERATION GUIDANCE
This is the first iteration. Use your knowledge of the genres to decide what this piece most needs.
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
    const { object: decision } = await generateObject({
      model: anthropic('claude-sonnet-4-6'),
      schema: orchestratorDecisionSchema,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
      providerOptions: {
        anthropic: {
          cacheControl: { type: 'ephemeral', ttl: '1h' },
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
        },
      },
    });

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

    // Log decision
    console.log(`\n🎼 Orchestrator Decision (Iteration ${iteration + 1}):`);
    console.log(`   Action: ${decision.action}`);
    if (decision.action === 'invoke') {
      console.log(`   Agent: ${decision.agent}`);
      console.log(`   Directive: ${decision.directive}`);
      console.log(`   Expected: ${decision.expectedImprovement}`);
    }
    console.log(`   Reasoning: ${decision.reasoning}`);

    return decision;

  } catch (error) {
    console.error('Orchestrator agent error:', error.message);
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
    maxIterations = 10,
    selectedSoundfonts = null,
    userComplaint = null,
    priorSession = null,
  } = options;

  const originalAbc = fs.readFileSync(abcFilePath, 'utf-8');
  const baseNoExt = abcFilePath.replace(/\.abc$/, '');

  let currentAbc = originalAbc;
  let workHistory = [];
  let sessionLog = [];
  let lastQaResult = null;
  let lastAbc2midiWarnings = [];
  let lastAbc2midiErrors = [];
  let iteration = 0;
  const writtenPaths = [];

  console.log('\n🎼 Starting Orchestrated Post-Processing');
  console.log(`   Genre: ${genres.hybrid}`);
  console.log(`   Max Iterations: ${maxIterations}\n`);

  while (iteration < maxIterations) {
    // Orchestrator decides what to do
    const decision = await orchestratorAgent({
      currentAbc,
      originalAbc,
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
    });

    // Check if orchestrator is done
    if (decision.action === 'done') {
      console.log('\n✅ Orchestrator satisfied with composition');
      break;
    }

    // Invoke the agent orchestrator selected
    let newAbc;

    if (decision.agent === 'composition') {
      newAbc = await modifyMusicWithAgent({
        currentAbc,
        modificationDirective: decision.directive,
        qaFeedback: lastQaResult,
        genre: genres.hybrid,
        classicalGenre: genres.classical,
        modernGenre: genres.modern,
      });
    } else if (decision.agent === 'ornamentation') {
      newAbc = await addOrnamentation({
        abc: currentAbc,
        directive: decision.directive,
      });
    } else if (decision.agent === 'midi-expression') {
      newAbc = await addMidiExpression({
        abc: currentAbc,
        directive: decision.directive,
      });
    }

    // Write this iteration to disk immediately as an intermediate checkpoint
    const iterPath = `${baseNoExt}_iter${iteration + 1}.abc`;
    fs.writeFileSync(iterPath, newAbc);
    writtenPaths.push(iterPath);
    console.log(`💾 Iteration written: ${path.basename(iterPath)}`);

    // Run abc2midi validation to capture errors and warnings for next orchestrator decision
    const iterValidation = validateAbcNotation(newAbc);
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
    });

    // Calculate average score
    const scoreValues = Object.values(qaResult.scores);
    const avgScore = scoreValues.reduce((sum, s) => sum + s, 0) / scoreValues.length;

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

  // Write session log to disk
  const sessionLogPath = `${baseNoExt}_session.json`;
  const sessionData = {
    genre: genres,
    timestamp: new Date().toISOString(),
    totalIterations: iteration,
    iterations: sessionLog,
    finalVerdict: lastQaResult?.verdict || null,
    finalScores: lastQaResult?.scores || null,
    finalSummary: lastQaResult?.summary || null,
  };
  fs.writeFileSync(sessionLogPath, JSON.stringify(sessionData, null, 2));
  console.log(`\n📋 Session log: ${path.basename(sessionLogPath)}`);

  // Return final result
  return {
    enhancedAbc: currentAbc,
    originalAbc,
    workHistory,
    finalQaResult: lastQaResult,
    iterations: iteration,
    writtenPaths,
    sessionLogPath,
  };
}
