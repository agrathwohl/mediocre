/**
 * CheckpointManager — Branch creation, checkpoint listing, iteration file management.
 *
 * Works as an overlay on the existing flat file structure:
 *   composition_iter1.abc, composition_iter2.abc, composition_session.json
 *
 * Branching copies the current ABC at the branch point to a new file,
 * and copies the metadata JSON alongside it. The user can then
 * `mediocre enhance <branch-file> --interactive` to explore the alternative.
 */

import fs from 'fs/promises';
import path from 'path';

export class CheckpointManager {
  constructor(abcFilePath) {
    this.abcFilePath = abcFilePath;
    this.baseNoExt = abcFilePath.replace(/\.abc$/, '');
    this.dir = path.dirname(abcFilePath);
    this.baseName = path.basename(this.baseNoExt);
  }

  /**
   * Create a branch from the current ABC at the given iteration.
   * Writes a new ABC file and copies the metadata JSON alongside it.
   *
   * @param {string} abc       - Current ABC notation content
   * @param {number} iteration - Iteration number at the branch point
   * @returns {Promise<string>} Path to the branch ABC file
   */
  async createBranch(abc, iteration) {
    const branchName = `branch-${Date.now()}`;
    const branchAbcPath = path.join(this.dir, `${this.baseName}_${branchName}.abc`);

    // Write the branch ABC
    await fs.writeFile(branchAbcPath, abc);

    // Copy the metadata JSON alongside the branch ABC if it exists
    const metadataJsonPath = `${this.baseNoExt}.json`;
    try {
      await fs.access(metadataJsonPath);
      const branchJsonPath = path.join(
        this.dir,
        `${this.baseName}_${branchName}.json`,
      );
      await fs.copyFile(metadataJsonPath, branchJsonPath);
    } catch {
      // No metadata JSON to copy — that's fine
    }

    return branchAbcPath;
  }

  /**
   * List all iteration files for the current composition.
   * @returns {Promise<Array<{ path: string, iteration: number, size: number, mtime: Date }>>}
   */
  async listIterations() {
    const files = await fs.readdir(this.dir);
    const iterPattern = new RegExp(`^${escapeRegExp(this.baseName)}_iter(\\d+)\\.abc$`);
    const results = [];

    for (const file of files) {
      const match = file.match(iterPattern);
      if (match) {
        const filePath = path.join(this.dir, file);
        const stat = await fs.stat(filePath);
        results.push({
          path: filePath,
          iteration: parseInt(match[1], 10),
          size: stat.size,
          mtime: stat.mtime,
        });
      }
    }

    results.sort((a, b) => a.iteration - b.iteration);
    return results;
  }

  /**
   * List all branch files for the current composition.
   * @returns {Promise<Array<{ path: string, name: string, hasJson: boolean }>>}
   */
  async listBranches() {
    const files = await fs.readdir(this.dir);
    const branchPattern = new RegExp(`^${escapeRegExp(this.baseName)}_(branch-\\d+)\\.abc$`);
    const results = [];

    for (const file of files) {
      const match = file.match(branchPattern);
      if (match) {
        const branchAbcPath = path.join(this.dir, file);
        const jsonPath = branchAbcPath.replace(/\.abc$/, '.json');
        let hasJson = false;
        try {
          await fs.access(jsonPath);
          hasJson = true;
        } catch { /* no json file */ }

        results.push({
          path: branchAbcPath,
          name: match[1],
          hasJson,
        });
      }
    }

    return results;
  }

  /**
   * List all checkpoints: iterations + branches + session files.
   * @returns {Promise<{ iterations: Array, branches: Array, sessionFile: string|null }>}
   */
  async listCheckpoints() {
    const iterations = await this.listIterations();
    const branches = await this.listBranches();

    const sessionPath = `${this.baseNoExt}_session.json`;
    let sessionFile = null;
    try {
      await fs.access(sessionPath);
      sessionFile = sessionPath;
    } catch { /* no session file */ }

    return { iterations, branches, sessionFile };
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Standalone function: list checkpoints for a composition directory or ABC file.
 * Used by the `mediocre checkpoints` CLI command.
 */
export async function listCheckpointsForPath(targetPath) {
  const stat = await fs.stat(targetPath);
  let abcFilePath;

  if (stat.isDirectory()) {
    const files = await fs.readdir(targetPath);
    const abcFiles = files.filter(f => f.endsWith('.abc') && !f.includes('_iter') && !f.includes('branch-'));
    if (abcFiles.length === 0) {
      throw new Error(`No base ABC files found in ${targetPath}`);
    }
    abcFilePath = path.join(targetPath, abcFiles[0]);
  } else {
    abcFilePath = targetPath;
  }

  const mgr = new CheckpointManager(abcFilePath);
  return mgr.listCheckpoints();
}
