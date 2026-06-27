import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { loadSession, canResume, buildResumeOptions } from '../control/session-persistence.js';
import { orchestratePostProcessing } from '../agents/orchestrator/index.js';
import { GateController } from '../control/gate-controller.js';

/**
 * Resume a previously paused orchestration session.
 * Sessions are saved when the user quits during interactive mode.
 * Resume picks up exactly where it left off — same state, same work history.
 *
 * @param {Object} options
 * @param {string} options.sessionFile - Path to session JSON file
 * @param {number} options.maxIterations - Additional iterations to run (additive)
 * @param {boolean} options.interactive - Enable interactive gating (default: true for resume)
 */
export async function resumeSession({ sessionFile, maxIterations = 5, interactive = true }) {
  console.log(chalk.bold('\n🔄 Resuming Session'));
  console.log(`   File: ${path.basename(sessionFile)}`);


  let session;
  try {
    session = await loadSession(sessionFile);
  } catch (err) {
    console.error(chalk.red(`Failed to load session: ${err.message}`));
    process.exit(1);
  }


  const { resumable, reason } = canResume(session);
  if (!resumable) {
    console.error(chalk.red(`Cannot resume: ${reason}`));
    process.exit(1);
  }

  const genres = session.genres || session.genre;
  console.log(`   Genre: ${genres?.hybrid || 'unknown'}`);
  console.log(`   Paused at iteration: ${session.iteration}`);
  console.log(`   Exit reason: ${session.exitReason}`);
  console.log(`   Adding ${maxIterations} more iterations`);
  console.log('');


  const options = buildResumeOptions(session, { maxIterations });


  try {
    await fs.access(options.abcFilePath);
  } catch {
    console.error(chalk.red(`ABC file not found: ${options.abcFilePath}`));
    console.error(chalk.dim('The original composition file must exist to resume.'));
    process.exit(1);
  }


  let gateController = null;
  if (interactive) {
    gateController = new GateController({ abcFilePath: options.abcFilePath });
  }


  const result = await orchestratePostProcessing({
    ...options,
    gateController,
  });

  console.log(chalk.green('\n✅ Session resumed and completed'));
  return result;
}
