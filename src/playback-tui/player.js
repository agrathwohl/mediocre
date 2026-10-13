/**
 * Controller: abc -> abc2midi -> timidity, with the TUI clock slaved to
 * timidity's reported position so the event stream stays accurate to the audio.
 *
 * The clock anchors on each position report and interpolates between them with
 * wall time, so it is smooth yet drift-corrected every update. Events fire in
 * time order as the clock passes them. p pauses both (SIGSTOP/SIGCONT timidity
 * + clock freeze); q quits.
 */

import fs from 'fs/promises';
import { existsSync } from 'fs';
import os from 'os';
import path from 'path';
import { execa } from 'execa';
import { getAbc2midiBinary } from '../utils/llm-client.js';
import { buildTimeline } from './abc-timeline.js';
import { PlaybackTUI } from './tui.js';
import { TimidityPlayer } from './timidity-player.js';

function fmt(ms) {
  if (ms < 0) ms = 0;
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

const KIND_COLOR = {
  note: 'white', rest: 'grey', directive: 'cyan', comment: 'green',
  bar: 'grey', 'key signature': 'magenta', meter: 'magenta', tempo: 'magenta',
};

export async function runPlayback(abcPath) {
  const source = await fs.readFile(abcPath, 'utf-8');
  const timeline = buildTimeline(source);

  // Prefer the already-rendered sibling .mid (correct program changes + tempo).
  // Regenerating via the fork was producing mangled MIDI — wrong instruments
  // and blown-up tempo — which is what sounded broken.
  const sibling = abcPath.replace(/\.abc$/i, '.mid');
  let midiPath;
  let tempMidi = false;
  if (existsSync(sibling)) {
    midiPath = sibling;
  } else {
    midiPath = path.join(os.tmpdir(), `mediocre-playback-${process.pid}.mid`);
    tempMidi = true;
    await execa(getAbc2midiBinary(), [abcPath, '-o', midiPath], { reject: false });
    try { await fs.access(midiPath); }
    catch { throw new Error(`no sibling .mid and abc2midi produced none for ${path.basename(abcPath)}`); }
  }

  const tui = new PlaybackTUI({ title: `playback: ${path.basename(abcPath)}`, source });
  tui.logMeta(`{grey-fg}midi: ${tempMidi ? 'regenerated (no sibling .mid)' : path.basename(sibling)}{/grey-fg}`);
  tui.logMeta(`{grey-fg}${timeline.events.length} events, ${fmt(timeline.totalMs)} score length{/grey-fg}`);

  let started = false;
  let paused = false;
  let anchorMs = 0;
  let anchorWall = 0;
  let measure = 0;
  let beat = 0;
  let firePtr = 0;
  let stopped = false;

  const clockMs = () => {
    if (!started) return 0;
    if (paused) return anchorMs;
    return anchorMs + (Date.now() - anchorWall);
  };

  const player = new TimidityPlayer(abcPath, midiPath, {
    onLog: (s) => tui.logMeta(`{grey-fg}${s}{/grey-fg}`),
    onStart: () => { started = true; anchorMs = 0; anchorWall = Date.now(); firePtr = 0; tui.logMeta('{green-fg}▶ playback started{/green-fg}'); },
    onPosition: (ms, meas, bt) => { anchorMs = ms; anchorWall = Date.now(); measure = meas; beat = bt; },
    onExit: () => { if (!stopped) tui.logMeta('{grey-fg}— playback ended — press q to quit{/grey-fg}'); },
  });
  player.start();

  const cleanup = () => {
    if (stopped) return;
    stopped = true;
    clearInterval(timer);
    player.stop();
    tui.destroy();
    if (tempMidi) fs.unlink(midiPath).catch(() => {});
  };

  let resolveDone;
  const done = new Promise((r) => { resolveDone = r; });

  tui.onKey({
    'q,C-c,escape': () => { cleanup(); resolveDone(); },
    'p': () => {
      if (!started) return;
      if (paused) { anchorWall = Date.now(); paused = false; player.resume(); }
      else { anchorMs = clockMs(); paused = true; player.pause(); }
    },
  });

  const tick = () => {
    if (!started) {
      tui.setStatus(' {yellow-fg}loading instruments…{/yellow-fg}  waiting for timidity\n {grey-fg}[p] pause   [q] quit{/grey-fg}');
      return;
    }
    const t = clockMs();

    while (firePtr < timeline.events.length && timeline.events[firePtr].tMs <= t) {
      const e = timeline.events[firePtr++];
      const color = KIND_COLOR[e.kind] || 'white';
      const label = e.voice >= 0 ? `v${e.voice}` : '··';
      const line = `{grey-fg}${fmt(e.tMs)}{/grey-fg} {grey-fg}${label}{/grey-fg} {${color}-fg}[${e.kind}]{/${color}-fg} ${e.text || ''}`;
      if (e.kind === 'note' || e.kind === 'rest') tui.logEvent(line);
      else tui.logMeta(line);
    }

    const state = paused ? '{yellow-fg}❚❚ PAUSED{/yellow-fg}' : '{green-fg}▶ PLAYING{/green-fg}';
    tui.setStatus(
      ` ${state}   {bold}${fmt(t)}{/bold}   measure {bold}${measure}{/bold}.${beat}\n` +
      ` {grey-fg}clock slaved to timidity position   [p] pause/resume   [q] quit{/grey-fg}`
    );
  };

  const timer = setInterval(tick, 50);
  tick();

  await done;
}
