/**
 * PreviewPlayer — Real-time MIDI preview via TiMidity++ ncurses interface.
 *
 * Converts ABC notation to MIDI (abc2midi), then plays it through
 * timidity -in (ncurses TUI) with full transport controls:
 *   space = pause/resume, ←→ = seek, +/- = volume, q = quit
 *
 * Uses the composition's .timidity.cfg if it exists alongside the ABC file.
 */

import { execa } from 'execa';
import { writeFile, unlink } from 'fs/promises';
import { existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import chalk from 'chalk';

export class PreviewPlayer {
  /**
   * @param {string} abcFilePath - Path to the ABC file on disk.
   *   Used to locate a sibling .timidity.cfg for soundfont config.
   */
  constructor(abcFilePath) {
    this.abcFilePath = abcFilePath;
  }

  /**
   * Play ABC content as MIDI through TiMidity++'s ncurses interface.
   * Blocks until the user quits timidity (q) or Ctrl+C.
   *
   * @param {string} abcContent - ABC notation string to preview
   */
  async play(abcContent) {
    const timestamp = Date.now();
    const tmpAbc = join(tmpdir(), `mediocre-preview-${timestamp}.abc`);
    const tmpMidi = join(tmpdir(), `mediocre-preview-${timestamp}.mid`);

    try {
      await writeFile(tmpAbc, abcContent, 'utf-8');

      console.error(chalk.dim('  Converting ABC to MIDI...'));
      const abc2midiResult = await execa('abc2midi', [tmpAbc, '-o', tmpMidi], {
        reject: false,
      });

      if (!existsSync(tmpMidi)) {
        console.error(chalk.red('  abc2midi failed to produce MIDI file.'));
        if (abc2midiResult.stderr) {
          console.error(chalk.red(`  ${abc2midiResult.stderr.split('\n')[0]}`));
        }
        return;
      }

      const configPath = this.abcFilePath
        ? this.abcFilePath.replace(/_[0-9]+\.abc$|\.abc$/, '.timidity.cfg')
        : null;
      const hasConfig = configPath && existsSync(configPath);

      const args = ['-in'];
      if (hasConfig) {
        args.push('-c', configPath);
      }
      args.push(tmpMidi);

      // Adding a SIGINT listener suppresses Node's default exit-on-SIGINT.
      // This ensures Ctrl+C kills timidity (same process group), not our CLI.
      const sigintHandler = () => {};
      process.on('SIGINT', sigintHandler);

      console.error(chalk.dim('  Launching TiMidity++ (space=pause  ←→=seek  +/-=vol  q=quit)'));

      try {
        await execa('timidity', args, {
          stdio: 'inherit',
          reject: false,
        });
      } finally {
        process.removeListener('SIGINT', sigintHandler);
        await execa('stty', ['sane'], { reject: false }).catch(() => {});
      }
    } catch (err) {
      await execa('stty', ['sane'], { reject: false }).catch(() => {});

      const errObj = /** @type {Error & {code?: string}} */ (err);
      if (errObj.code === 'ENOENT') {
        const missing = errObj.message.includes('abc2midi') ? 'abc2midi' : 'timidity';
        console.error(chalk.red(`  ${missing} not found. Install it to use preview.`));
      } else {
        console.error(chalk.red(`  Preview failed: ${errObj.message}`));
      }
    } finally {
      await unlink(tmpAbc).catch(() => {});
      await unlink(tmpMidi).catch(() => {});
    }
  }
}
