/**
 * GateController — Human-in-the-loop gating for the orchestration pipeline.
 *
 * When present, every hook pauses for human input (always interactive).
 * When absent from orchestratePostProcessing(), behavior is unchanged (autopilot).
 */

import { GatePrompts } from './gate-prompts.js';
import { PreviewPlayer } from './preview-player.js';
import { CheckpointManager } from './checkpoint-manager.js';

export class GateController {
  constructor({ abcFilePath } = {}) {
    const previewPlayer = abcFilePath ? new PreviewPlayer(abcFilePath) : null;
    this.checkpointManager = abcFilePath ? new CheckpointManager(abcFilePath) : null;
    this.ui = new GatePrompts(previewPlayer, this.checkpointManager);
    this.checkpoints = [];
    this.humanDirectives = [];
  }

  /**
   * Called after orchestratorAgent() returns a decision.
   * Human sees what the orchestrator wants to do and can approve, redirect, or quit.
   *
   * @param {Object} decision - {action, agent?, directive?, reasoning, expectedImprovement?}
   * @param {Object} context  - {iteration, maxIterations, workHistory, currentAbc, lastQaResult}
   * @returns {Object} {action: 'approve'|'direct'|'quit', directive?, extend?}
   */
  async onDecision(decision, context) {
    const gate = await this.ui.promptDecision(decision, context);

    if (gate.directive) {
      this.humanDirectives.push({
        type: 'decision_redirect',
        iteration: context.iteration,
        directive: gate.directive,
        timestamp: Date.now(),
      });
    }

    return gate;
  }

  /**
   * Called when orchestrator says action === 'done'.
   * Human can accept or force more iterations.
   *
   * @param {string} finalAbc      - Current ABC notation
   * @param {Object} qaResult      - Latest QA assessment
   * @param {number} iterations    - How many iterations completed
   * @returns {Object} {action: 'approve'|'reject'|'direct', directive?}
   */
  async onDone(finalAbc, qaResult, iterations) {
    const gate = await this.ui.promptDone(finalAbc, qaResult, iterations);

    if (gate.action === 'reject' || gate.action === 'direct') {
      this.humanDirectives.push({
        type: 'override_done',
        iteration: iterations,
        directive: gate.directive || 'Human rejected done — continue improving',
        timestamp: Date.now(),
      });
    }

    return gate;
  }

  /**
   * Called after an agent produces new ABC and QA scores it.
   * Human reviews scores and decides whether to keep or discard.
   *
   * @param {string} newAbc     - The agent's output
   * @param {Object} qaResult   - QA assessment of the output
   * @param {number} iteration  - Current iteration number
   * @param {Object} context    - {decision, workHistory}
   * @returns {Object} {action: 'approve'|'reject'|'direct'|'quit', directive?, extend?}
   */
  async onAgentOutput(newAbc, qaResult, iteration, context) {
    this.checkpoints.push({
      iteration,
      qaScores: qaResult?.scores || null,
      verdict: qaResult?.verdict || null,
      timestamp: Date.now(),
    });

    const gate = await this.ui.promptAgentOutput(newAbc, qaResult, iteration, context);

    if (gate.directive) {
      this.humanDirectives.push({
        type: 'agent_feedback',
        iteration,
        directive: gate.directive,
        timestamp: Date.now(),
      });
    }

    return gate;
  }

  /**
   * Called when iteration limit is hit without orchestrator saying 'done'.
   * Human can accept, extend, or provide direction.
   *
   * @param {string} currentAbc  - Best ABC so far
   * @param {Object} qaResult    - Latest QA assessment
   * @param {number} iterations  - Total iterations completed
   * @returns {Object} {action: 'approve'|'direct', directive?, extend?}
   */
  async onMaxIterations(currentAbc, qaResult, iterations) {
    const gate = await this.ui.promptMaxIterations(currentAbc, qaResult, iterations);

    if (gate.directive) {
      this.humanDirectives.push({
        type: 'max_iterations_feedback',
        iteration: iterations,
        directive: gate.directive,
        timestamp: Date.now(),
      });
    }

    return gate;
  }

  /**
   * Get all human directives issued during this session.
   * Useful for session persistence / logging.
   */
  getDirectives() {
    return this.humanDirectives;
  }

  /**
   * Get all checkpoints (iteration snapshots with QA scores).
   */
  getCheckpoints() {
    return this.checkpoints;
  }

  /**
   * Clean up readline interface.
   * MUST be called when orchestration ends.
   */
  close() {
    this.ui.close();
  }
}
