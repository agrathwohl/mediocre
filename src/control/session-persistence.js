/**
 * SessionPersistence — Save and restore full orchestration state.
 *
 * Captures everything needed to resume an orchestration session:
 * - Current ABC and original ABC
 * - Work history, session log, QA results
 * - Human directives from gate controller
 * - Genre/soundfont/context metadata
 * - Iteration position and max iterations
 * - Exit reason (quit, done, max_iterations, error)
 *
 * Session files are written alongside the ABC file as `*_session.json`.
 * This module extends the existing session JSON format with resumable state.
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Build a complete session data object from orchestration state.
 * This is the canonical serialization format for resume.
 *
 * @param {Object} state - Current orchestration state
 * @returns {Object} Serializable session data
 */
export function buildSessionData(state) {
  const {
    abcFilePath,
    currentAbc,
    originalAbc,
    genres,
    musicalContext,
    selectedSoundfonts,
    iteration,
    maxIterations,
    workHistory,
    sessionLog,
    lastQaResult,
    lastAbc2midiWarnings,
    lastAbc2midiErrors,
    humanDirectives,
    exitReason,        // 'quit' | 'done' | 'max_iterations' | 'error'
    writtenPaths,
    branchedFrom,      // { sessionFile, iteration } if this is a branch
  } = state;

  return {
    // Format version — bump if schema changes
    version: 2,

    // Metadata
    timestamp: new Date().toISOString(),
    abcFilePath: path.resolve(abcFilePath),
    exitReason: exitReason || 'unknown',

    // Genre info
    genres,

    // Iteration state (for resume)
    iteration,
    maxIterations,

    // ABC content
    currentAbc,
    originalAbc,

    // Full histories
    workHistory,
    sessionLog,

    // Last evaluation state
    lastQaResult: lastQaResult || null,
    lastAbc2midiWarnings: lastAbc2midiWarnings || [],
    lastAbc2midiErrors: lastAbc2midiErrors || [],

    // Human interaction
    humanDirectives: humanDirectives || [],

    // Context (for orchestrator prompt reconstruction)
    musicalContext: musicalContext || null,
    selectedSoundfonts: selectedSoundfonts || null,

    // File tracking
    writtenPaths: writtenPaths || [],

    // Branch metadata
    branchedFrom: branchedFrom || null,

    // Legacy compat fields (so existing tools reading _session.json still work)
    genre: genres,
    totalIterations: iteration,
    iterations: sessionLog,
    finalVerdict: lastQaResult?.verdict || null,
    finalScores: lastQaResult?.scores || null,
    finalSummary: lastQaResult?.summary || null,
  };
}

/**
 * Save session state to disk.
 *
 * @param {string} sessionPath - Where to write the session JSON
 * @param {Object} state - Current orchestration state (passed to buildSessionData)
 * @returns {Promise<string>} The written session path
 */
export async function saveSession(sessionPath, state) {
  const data = buildSessionData(state);
  await fs.writeFile(sessionPath, JSON.stringify(data, null, 2));
  return sessionPath;
}

/**
 * Load a session from disk and validate it has the fields needed for resume.
 *
 * @param {string} sessionPath - Path to _session.json
 * @returns {Promise<Object>} Parsed session data
 * @throws {Error} If file doesn't exist or is missing critical fields
 */
export async function loadSession(sessionPath) {
  const raw = await fs.readFile(sessionPath, 'utf-8');
  const data = JSON.parse(raw);

  // Version 2 sessions have everything we need
  if (data.version >= 2) {
    return data;
  }

  // Version 1 (legacy) sessions are missing resumable state.
  // They can be loaded for inspection but not resumed.
  if (!data.currentAbc) {
    throw new Error(
      `Session file is version 1 (legacy) and cannot be resumed.\n` +
      `It was created before checkpoint support was added.\n` +
      `File: ${sessionPath}`
    );
  }

  return data;
}

/**
 * Check if a session can be resumed (was quit/paused, not completed).
 *
 * @param {Object} sessionData - Parsed session data from loadSession
 * @returns {{ resumable: boolean, reason: string }}
 */
export function canResume(sessionData) {
  if (sessionData.version < 2) {
    return { resumable: false, reason: 'Legacy session format (version 1) — cannot resume' };
  }

  if (sessionData.exitReason === 'done') {
    return { resumable: true, reason: 'Orchestrator marked as done — can resume to force more iterations' };
  }

  if (sessionData.exitReason === 'quit') {
    return { resumable: true, reason: 'User quit — can resume from last checkpoint' };
  }

  if (sessionData.exitReason === 'max_iterations') {
    return { resumable: true, reason: 'Max iterations reached — can resume with more iterations' };
  }

  if (sessionData.exitReason === 'error') {
    return { resumable: true, reason: 'Session ended with error — can retry from last good state' };
  }

  return { resumable: true, reason: 'Session can be resumed' };
}

/**
 * Reconstruct the options object needed by orchestratePostProcessing() from a session.
 *
 * @param {Object} sessionData - Parsed session data
 * @param {Object} overrides - CLI overrides (maxIterations, interactive, etc.)
 * @returns {Object} Options for orchestratePostProcessing
 */
export function buildResumeOptions(sessionData, overrides = {}) {
  // Additional iterations are ADDED to current position, not total
  const additionalIterations = overrides.maxIterations || 5;

  return {
    abcFilePath: sessionData.abcFilePath,
    musicalContext: sessionData.musicalContext,
    genres: sessionData.genres,
    maxIterations: sessionData.iteration + additionalIterations,
    selectedSoundfonts: sessionData.selectedSoundfonts,

    // Resume state — tells orchestrator to pick up from checkpoint
    resumeState: {
      currentAbc: sessionData.currentAbc,
      originalAbc: sessionData.originalAbc,
      iteration: sessionData.iteration,
      workHistory: sessionData.workHistory || [],
      sessionLog: sessionData.sessionLog || [],
      lastQaResult: sessionData.lastQaResult,
      lastAbc2midiWarnings: sessionData.lastAbc2midiWarnings || [],
      lastAbc2midiErrors: sessionData.lastAbc2midiErrors || [],
      humanDirectives: sessionData.humanDirectives || [],
      writtenPaths: sessionData.writtenPaths || [],
    },
  };
}
