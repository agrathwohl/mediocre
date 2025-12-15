/**
 * @fileoverview Shared path resolution utilities
 */

import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Get the project root directory from any module
 * @param {string} importMetaUrl - import.meta.url from the calling module
 * @returns {string} Absolute path to project root
 */
export function getProjectRoot(importMetaUrl) {
  const __filename = fileURLToPath(importMetaUrl);
  const __dirname = path.dirname(__filename);
  // Commands are in src/commands/, utils are in src/utils/
  // So we go up 2 levels to reach project root
  return path.resolve(__dirname, '../..');
}

/**
 * Get the directory of the calling module
 * @param {string} importMetaUrl - import.meta.url from the calling module
 * @returns {string} Absolute path to module directory
 */
export function getModuleDir(importMetaUrl) {
  const __filename = fileURLToPath(importMetaUrl);
  return path.dirname(__filename);
}

/**
 * Resolve a path relative to project root
 * @param {string} importMetaUrl - import.meta.url from the calling module
 * @param {...string} segments - Path segments to join
 * @returns {string} Absolute path
 */
export function resolveFromRoot(importMetaUrl, ...segments) {
  return path.join(getProjectRoot(importMetaUrl), ...segments);
}

export default { getProjectRoot, getModuleDir, resolveFromRoot };
