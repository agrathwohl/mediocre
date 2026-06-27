import readline from 'readline';
import path from 'path';
import fs from 'fs/promises';
import chalk from 'chalk';
import { PreviewPlayer } from '../control/preview-player.js';

/**
 * A/B comparison of two ABC iterations.
 * Plays each through abc2midi + timidity for ear-driven evaluation.
 *
 * @param {Object} options
 * @param {string} options.fileA - Path to first ABC file
 * @param {string} options.fileB - Path to second ABC file
 */
export async function compareIterations({ fileA, fileB }) {

  for (const f of [fileA, fileB]) {
    try {
      await fs.access(f);
    } catch {
      console.error(chalk.red(`File not found: ${f}`));
      process.exit(1);
    }
  }

  const abcA = await fs.readFile(fileA, 'utf-8');
  const abcB = await fs.readFile(fileB, 'utf-8');

  const playerA = new PreviewPlayer(fileA);
  const playerB = new PreviewPlayer(fileB);

  console.log(chalk.bold('\n🔊 A/B Comparison'));
  console.log(`   A: ${path.basename(fileA)}`);
  console.log(`   B: ${path.basename(fileB)}`);
  console.log('');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  });
  const ask = (/** @type {string} */ q) => new Promise(resolve => rl.question(q, resolve));

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const answer = await ask(chalk.cyan('  [a] Play A  [b] Play B  [q] Quit > '));
      switch (answer.trim().toLowerCase()) {
        case 'a':
          console.log(chalk.dim(`  ▶ Playing A: ${path.basename(fileA)}`));
          await playerA.play(abcA);
          break;
        case 'b':
          console.log(chalk.dim(`  ▶ Playing B: ${path.basename(fileB)}`));
          await playerB.play(abcB);
          break;
        case 'q':
          console.log(chalk.dim('  Done.'));
          return;
        default:
          console.log(chalk.dim('  Press a, b, or q'));
      }
    }
  } finally {
    rl.close();
  }
}
