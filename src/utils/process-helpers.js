/**
 * @fileoverview Shared child process spawning utilities
 */

import { spawn } from 'child_process';

/**
 * @typedef {Object} SpawnResult
 * @property {number} code - Exit code
 * @property {boolean} success - True if exit code was 0
 * @property {boolean} [interrupted] - True if process was interrupted by SIGINT
 */

/**
 * Spawn a Node.js script and wait for completion
 * @param {string} scriptPath - Path to the Node.js script
 * @param {string[]} [args=[]] - Arguments to pass to the script
 * @param {Object} [options={}] - Spawn options
 * @param {string} [options.stdio='inherit'] - stdio configuration
 * @param {Object} [options.env] - Environment variables
 * @returns {Promise<SpawnResult>}
 */
export async function spawnNode(scriptPath, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn('node', [scriptPath, ...args], {
      stdio: options.stdio || 'inherit',
      env: options.env || { ...process.env }
    });

    child.on('exit', (code, signal) => {
      if (signal === 'SIGINT' || signal === 'SIGTERM') {
        // User interrupted - treat as success
        resolve({ code: 0, success: true, interrupted: true });
      } else if (code === 0) {
        resolve({ code, success: true });
      } else {
        reject(new Error(`Process exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Spawn any command and wait for completion
 * @param {string} command - Command to run
 * @param {string[]} [args=[]] - Arguments to pass
 * @param {Object} [options={}] - Spawn options
 * @returns {Promise<SpawnResult>}
 */
export async function spawnCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: options.stdio || 'inherit',
      env: options.env || { ...process.env }
    });

    child.on('exit', (code, signal) => {
      if (signal === 'SIGINT' || signal === 'SIGTERM') {
        resolve({ code: 0, success: true, interrupted: true });
      } else if (code === 0) {
        resolve({ code, success: true });
      } else {
        reject(new Error(`${command} exited with code ${code}`));
      }
    });

    child.on('error', reject);
  });
}

/**
 * Handle process errors with consistent messaging
 * @param {Error} error - The error that occurred
 * @param {string} [context='Playback'] - Context for error message
 * @returns {boolean} True if error was handled silently (e.g., user interrupt)
 */
export function handleProcessError(error, context = 'Playback') {
  // User interruptions are normal, handle silently
  if (error.message?.includes('SIGINT') || error.message?.includes('SIGTERM')) {
    return true;
  }

  console.error(`${context} error:`, error.message);
  return false;
}

export default { spawnNode, spawnCommand, handleProcessError };
