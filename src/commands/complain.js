/**
 * Complain Command
 * Pass a session JSON + your complaint to re-run the orchestration loop
 * with your grievance as the highest-priority directive.
 *
 * The orchestrator must resolve your complaint before declaring done.
 * Output: <base>-revision.abc (or -revision2.abc, etc.)
 */

import fs from 'fs';
import path from 'path';
import { loadCompositionContext } from '../utils/orchestrator-context.js';
import { orchestratePostProcessing } from '../agents/orchestrator/index.js';

/**
 * @param {Object} options
 * @param {string} options.sessionFile - Path to _session.json
 * @param {string} options.complaint - User's complaint text
 * @param {number} [options.maxIterations] - Max iterations for revision loop
 * @param {string} [options.output] - Override output path
 */
export async function complainCommand(options) {
  const { sessionFile, complaint, maxIterations = 5, output } = options;

  if (!fs.existsSync(sessionFile)) {
    throw new Error(`Session file not found: ${sessionFile}`);
  }

  const sessionData = JSON.parse(fs.readFileSync(sessionFile, 'utf-8'));
  const sessionDir = path.dirname(sessionFile);
  const sessionBase = path.basename(sessionFile, '_session.json');

  console.log(`\n📋 Loading session: ${path.basename(sessionFile)}`);
  console.log(`   Genre: ${sessionData.genre?.hybrid || 'unknown'}`);
  console.log(`   Prior iterations: ${sessionData.totalIterations}`);
  console.log(`   Prior verdict: ${sessionData.finalVerdict} (${sessionData.finalScores ? Object.values(sessionData.finalScores).reduce((a, b) => a + b, 0) / Object.values(sessionData.finalScores).length : '?'}/10 avg)`);
  console.log(`\n🗣️  Complaint: "${complaint}"`);

  // Find the ABC file to revise
  const abcFilePath = findAbcFile(sessionDir, sessionBase);
  if (!abcFilePath) {
    throw new Error(
      `Could not find ABC file for session base "${sessionBase}". ` +
      `Expected: ${sessionBase}_1.abc, ${sessionBase}_2.abc, or ${sessionBase}_iter{N}.abc`
    );
  }

  console.log(`\n🎵 Working from: ${path.basename(abcFilePath)}`);

  // loadCompositionContext finds _description.json by timestamp pattern.
  // Versioned files (_1.abc, _2.abc) have an underscore suffix it can't parse —
  // strip the version to get the base file path for context lookup.
  const abcBasename = path.basename(abcFilePath, '.abc');
  const contextBasename = abcBasename.replace(/_\d+$/, '');
  const contextAbcPath = contextBasename !== abcBasename
    ? path.join(sessionDir, `${contextBasename}.abc`)
    : abcFilePath;

  const context = await loadCompositionContext(contextAbcPath);

  // Determine revision output path
  const revisionPath = output || findRevisionPath(sessionDir, sessionBase);
  console.log(`   Output: ${path.basename(revisionPath)}`);

  // Run orchestration loop with complaint as top priority
  const result = await orchestratePostProcessing({
    abcFilePath,
    musicalContext: context,
    genres: sessionData.genre,
    maxIterations,
    userComplaint: complaint,
    priorSession: sessionData,
  });

  fs.writeFileSync(revisionPath, result.enhancedAbc);

  console.log(`\n✅ Revision written: ${revisionPath}`);
  if (result.sessionLogPath) {
    console.log(`📋 Session log: ${result.sessionLogPath}`);
  }

  return { revisionPath, result };
}

/**
 * Find the best ABC file to revise from:
 * Prefers final versioned output (_1.abc, _2.abc), falls back to last _iterN.abc
 */
function findAbcFile(dir, base) {
  // Check versioned final outputs first (_1.abc through _20.abc)
  for (let v = 20; v >= 1; v--) {
    const candidate = path.join(dir, `${base}_${v}.abc`);
    if (fs.existsSync(candidate)) return candidate;
  }

  // Fall back to last iteration checkpoint
  for (let i = 30; i >= 1; i--) {
    const candidate = path.join(dir, `${base}_iter${i}.abc`);
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

/**
 * Find a non-colliding revision output path
 */
function findRevisionPath(dir, base) {
  const first = path.join(dir, `${base}-revision.abc`);
  if (!fs.existsSync(first)) return first;

  for (let n = 2; n <= 20; n++) {
    const candidate = path.join(dir, `${base}-revision${n}.abc`);
    if (!fs.existsSync(candidate)) return candidate;
  }

  throw new Error('Too many revisions already exist');
}
