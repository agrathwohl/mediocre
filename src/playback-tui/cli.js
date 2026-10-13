import fs from 'fs';
import { fileURLToPath } from 'url';
import { runPlayback } from './player.js';

export async function playbackCommand(abcFile) {
  if (!abcFile) throw new Error('Usage: mediocre playback <file.abc>');
  if (!fs.existsSync(abcFile)) throw new Error(`ABC file not found: ${abcFile}`);
  if (!process.stdout.isTTY) {
    throw new Error('playback requires an interactive terminal (TTY)');
  }
  await runPlayback(abcFile);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  playbackCommand(process.argv[2]).catch((e) => {
    console.error('Error:', e.message);
    process.exit(1);
  });
}
