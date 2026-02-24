/**
 * GatePrompts — Readline-based terminal UI for human-in-the-loop gating.
 *
 * Provides interactive prompts at each gate in the orchestration pipeline.
 * All methods return {action, directive?, extend?} for the GateController.
 */

import { createInterface } from 'readline';
import path from 'path';
import chalk from 'chalk';

export class GatePrompts {
  constructor(previewPlayer = null, checkpointManager = null) {
    this.previewPlayer = previewPlayer;
    this.checkpointManager = checkpointManager;
  }

  // ── Helpers ─────────────────────────────────────────────────────────

  /**
   * Render a score bar: ▓▓▓▓▓▓▓░░░ 7/10
   */
  _scoreBar(value, max = 10, width = 10) {
    const filled = Math.round((value / max) * width);
    const empty = width - filled;
    const color = value >= 7 ? chalk.green : value >= 5 ? chalk.yellow : chalk.red;
    return color('▓'.repeat(filled) + '░'.repeat(empty)) + ` ${value}/${max}`;
  }

  /**
   * Render QA scores block.
   */
  _renderScores(qaResult) {
    if (!qaResult?.scores) return chalk.dim('  (no QA scores available)');
    const s = qaResult.scores;
    const lines = [];
    if (s.technical != null) lines.push(`  Technical:    ${this._scoreBar(s.technical)}`);
    if (s.musical != null) lines.push(`  Musical:      ${this._scoreBar(s.musical)}`);
    if (s.fusion != null) lines.push(`  Fusion:       ${this._scoreBar(s.fusion)}`);
    if (s.completeness != null) lines.push(`  Completeness: ${this._scoreBar(s.completeness)}`);
    if (qaResult.verdict) lines.push(`  Verdict:      ${qaResult.verdict}`);
    return lines.join('\n');
  }

  /**
   * Print a divider line.
   */
  _divider() {
    return chalk.dim('─'.repeat(60));
  }

  /**
   * Prompt for a single keypress and return the key.
   */
  _ask(prompt) {
    return new Promise((resolve) => {
      const rl = createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: true,
      });
      rl.question(prompt, (answer) => {
        rl.close();
        resolve(answer.trim().toLowerCase());
      });
    });
  }

  /**
   * Prompt for free-text directive input.
   */
  async _askDirective() {
    console.error(chalk.cyan('\n  Enter your directive (press Enter when done):'));
    const directive = await this._ask(chalk.cyan('  > '));
    return directive || null;
  }

  /**
   * Prompt for iteration adjustment (+/-).
   * Returns a signed integer.
   */
  async _askExtend() {
    const raw = await this._ask(chalk.cyan('  How many iterations to add? (e.g. 3 or -2): '));
    const n = parseInt(raw, 10);
    return Number.isNaN(n) ? 0 : n;
  }

  // ── Gate Prompts ────────────────────────────────────────────────────

  /**
   * Gate: Orchestrator made a decision (which agent to invoke next).
   *
   * @param {Object} decision - {action, agent?, directive?, reasoning, expectedImprovement?}
   * @param {Object} context  - {iteration, maxIterations, workHistory, currentAbc, lastQaResult}
   * @returns {Object} {action: 'approve'|'direct'|'quit', directive?, extend?}
   */
  async promptDecision(decision, context) {
    console.error('\n' + this._divider());
    console.error(chalk.bold.cyan(`  GATE: Orchestrator Decision  [iteration ${context.iteration + 1}/${context.maxIterations}]`));
    console.error(this._divider());
    console.error(`  Action:    ${chalk.bold(decision.action)}`);
    if (decision.agent) console.error(`  Agent:     ${chalk.yellow(decision.agent)}`);
    if (decision.directive) console.error(`  Directive: ${decision.directive}`);
    if (decision.reasoning) console.error(`  Reasoning: ${chalk.dim(decision.reasoning)}`);
    if (decision.expectedImprovement) console.error(`  Expected:  ${chalk.dim(decision.expectedImprovement)}`);
    console.error('');
    console.error(chalk.dim('  QA Scores (current):'));
    console.error(this._renderScores(context.lastQaResult));
    console.error('');
    console.error(chalk.bold('  [a]pprove  [l]isten  [b]ranch  [d]irect  [q]uit  [+]adjust iterations'));
    console.error(this._divider());

    while (true) {
      const key = await this._ask('  > ');
      switch (key) {
        case 'a': return { action: 'approve' };
        case 'd': {
          const directive = await this._askDirective();
          return { action: 'direct', directive };
        }
        case 'l': {
          if (!this.previewPlayer) {
            console.error(chalk.red('  Preview not available (no ABC file path)'));
            break;
          }
          await this.previewPlayer.play(context.currentAbc);
          console.error('');
          console.error(chalk.bold('  [a]pprove  [l]isten  [b]ranch  [d]irect  [q]uit  [+]adjust iterations'));
          console.error(this._divider());
          break;
        }
        case 'b': {
          if (!this.checkpointManager) {
            console.error(chalk.red('  Branching not available'));
            break;
          }
          const branchPath = await this.checkpointManager.createBranch(context.currentAbc, context.iteration);
          console.error(chalk.green(`\n  ✅ Branch saved: ${path.basename(branchPath)}`));
          console.error(chalk.dim(`     To explore: mediocre enhance "${branchPath}" --interactive`));
          console.error('');
          console.error(chalk.bold('  [a]pprove  [l]isten  [b]ranch  [d]irect  [q]uit  [+]adjust iterations'));
          console.error(this._divider());
          break;
        }
        case 'q': return { action: 'quit' };
        case '+':
        case '-': {
          const extend = await this._askExtend();
          return { action: 'approve', extend };
        }
        default:
          console.error(chalk.red('  Invalid key. Use: a, l, b, d, q, +'));
      }
    }
  }

  /**
   * Gate: Orchestrator says "done".
   *
   * @param {string} finalAbc   - Current ABC notation
   * @param {Object} qaResult   - Latest QA assessment
   * @param {number} iterations - How many iterations completed
   * @returns {Object} {action: 'approve'|'reject'|'direct', directive?}
   */
  async promptDone(finalAbc, qaResult, iterations) {
    console.error('\n' + this._divider());
    console.error(chalk.bold.green(`  GATE: Orchestrator says DONE  [after ${iterations} iteration(s)]`));
    console.error(this._divider());
    console.error(chalk.dim('  QA Scores (final):'));
    console.error(this._renderScores(qaResult));
    console.error('');
    console.error(`  ABC length: ${finalAbc.length} chars`);
    console.error('');
    console.error(chalk.bold('  [a]ccept  [l]isten  [b]ranch  [r]eject (force more)  [d]irect (force more with feedback)'));
    console.error(this._divider());

    while (true) {
      const key = await this._ask('  > ');
      switch (key) {
        case 'l': {
          if (!this.previewPlayer) {
            console.error(chalk.red('  Preview not available (no ABC file path)'));
            break;
          }
          await this.previewPlayer.play(finalAbc);
          console.error('');
          console.error(chalk.bold('  [a]ccept  [l]isten  [b]ranch  [r]eject (force more)  [d]irect (force more with feedback)'));
          console.error(this._divider());
          break;
        }
        case 'b': {
          if (!this.checkpointManager) {
            console.error(chalk.red('  Branching not available'));
            break;
          }
          const branchPath = await this.checkpointManager.createBranch(finalAbc, iterations);
          console.error(chalk.green(`\n  ✅ Branch saved: ${path.basename(branchPath)}`));
          console.error(chalk.dim(`     To explore: mediocre enhance "${branchPath}" --interactive`));
          console.error('');
          console.error(chalk.bold('  [a]ccept  [l]isten  [b]ranch  [r]eject (force more)  [d]irect (force more with feedback)'));
          console.error(this._divider());
          break;
        }
        case 'a': return { action: 'approve' };
        case 'r': return { action: 'reject' };
        case 'd': {
          const directive = await this._askDirective();
          return { action: 'direct', directive };
        }
        default:
          console.error(chalk.red('  Invalid key. Use: a, l, b, r, d'));
      }
    }
  }

  /**
   * Gate: Agent produced new ABC, QA scored it.
   *
   * @param {string} newAbc     - The agent's output
   * @param {Object} qaResult   - QA assessment
   * @param {number} iteration  - Current iteration number
   * @param {Object} context    - {decision, workHistory, maxIterations}
   * @returns {Object} {action: 'approve'|'reject'|'direct'|'quit', directive?, extend?}
   */
  async promptAgentOutput(newAbc, qaResult, iteration, context) {
    console.error('\n' + this._divider());
    console.error(chalk.bold.magenta(`  GATE: Agent Output  [iteration ${iteration + 1}/${context.maxIterations}]`));
    console.error(this._divider());
    if (context.decision?.agent) {
      console.error(`  Agent:     ${chalk.yellow(context.decision.agent)}`);
    }
    if (context.decision?.directive) {
      console.error(`  Was told:  ${chalk.dim(context.decision.directive)}`);
    }
    console.error(`  ABC length: ${newAbc.length} chars`);
    console.error('');
    console.error(chalk.dim('  QA Scores:'));
    console.error(this._renderScores(qaResult));
    if (qaResult?.summary) {
      console.error(`\n  Summary: ${chalk.dim(qaResult.summary)}`);
    }
    console.error('');
    console.error(chalk.bold('  [a]pprove  [l]isten  [b]ranch  [r]eject  [d]irect  [q]uit  [+]adjust iterations'));
    console.error(this._divider());

    while (true) {
      const key = await this._ask('  > ');
      switch (key) {
        case 'l': {
          if (!this.previewPlayer) {
            console.error(chalk.red('  Preview not available (no ABC file path)'));
            break;
          }
          await this.previewPlayer.play(newAbc);
          console.error('');
          console.error(chalk.bold('  [a]pprove  [l]isten  [b]ranch  [r]eject  [d]irect  [q]uit  [+]adjust iterations'));
          console.error(this._divider());
          break;
        }
        case 'b': {
          if (!this.checkpointManager) {
            console.error(chalk.red('  Branching not available'));
            break;
          }
          const branchPath = await this.checkpointManager.createBranch(newAbc, iteration);
          console.error(chalk.green(`\n  ✅ Branch saved: ${path.basename(branchPath)}`));
          console.error(chalk.dim(`     To explore: mediocre enhance "${branchPath}" --interactive`));
          console.error('');
          console.error(chalk.bold('  [a]pprove  [l]isten  [b]ranch  [r]eject  [d]irect  [q]uit  [+]adjust iterations'));
          console.error(this._divider());
          break;
        }
        case 'a': return { action: 'approve' };
        case 'r': return { action: 'reject' };
        case 'd': {
          const directive = await this._askDirective();
          return { action: 'direct', directive };
        }
        case 'q': return { action: 'quit' };
        case '+':
        case '-': {
          const extend = await this._askExtend();
          return { action: 'approve', extend };
        }
        default:
          console.error(chalk.red('  Invalid key. Use: a, l, b, r, d, q, +'));
      }
    }
  }

  /**
   * Gate: Max iterations reached without orchestrator saying 'done'.
   *
   * @param {string} currentAbc  - Best ABC so far
   * @param {Object} qaResult    - Latest QA assessment
   * @param {number} iterations  - Total iterations completed
   * @returns {Object} {action: 'approve'|'direct', directive?, extend?}
   */
  async promptMaxIterations(currentAbc, qaResult, iterations) {
    console.error('\n' + this._divider());
    console.error(chalk.bold.yellow(`  GATE: Max Iterations Reached  [${iterations} iterations]`));
    console.error(this._divider());
    console.error(chalk.dim('  QA Scores (current):'));
    console.error(this._renderScores(qaResult));
    console.error('');
    console.error(`  ABC length: ${currentAbc.length} chars`);
    console.error('');
    console.error(chalk.bold('  [a]ccept as-is  [l]isten  [b]ranch  [d]irect + extend  [+]extend (add more iterations)'));
    console.error(this._divider());

    while (true) {
      const key = await this._ask('  > ');
      switch (key) {
        case 'l': {
          if (!this.previewPlayer) {
            console.error(chalk.red('  Preview not available (no ABC file path)'));
            break;
          }
          await this.previewPlayer.play(currentAbc);
          console.error('');
          console.error(chalk.bold('  [a]ccept as-is  [l]isten  [b]ranch  [d]irect + extend  [+]extend (add more iterations)'));
          console.error(this._divider());
          break;
        }
        case 'b': {
          if (!this.checkpointManager) {
            console.error(chalk.red('  Branching not available'));
            break;
          }
          const branchPath = await this.checkpointManager.createBranch(currentAbc, iterations);
          console.error(chalk.green(`\n  ✅ Branch saved: ${path.basename(branchPath)}`));
          console.error(chalk.dim(`     To explore: mediocre enhance "${branchPath}" --interactive`));
          console.error('');
          console.error(chalk.bold('  [a]ccept as-is  [l]isten  [b]ranch  [d]irect + extend  [+]extend (add more iterations)'));
          console.error(this._divider());
          break;
        }
        case 'a': return { action: 'approve' };
        case 'd': {
          const directive = await this._askDirective();
          const extend = await this._askExtend();
          return { action: 'direct', directive, extend };
        }
        case '+': {
          const extend = await this._askExtend();
          return { action: 'approve', extend };
        }
        default:
          console.error(chalk.red('  Invalid key. Use: a, l, b, d, +'));
      }
    }
  }

  /**
   * Clean up readline interface.
   */
  close() {
    // No persistent resources to clean up — readline created/destroyed per prompt.
  }
}
