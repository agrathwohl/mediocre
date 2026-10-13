/**
 * timidity playback with position feedback.
 *
 * timidity's dumb interface (-id) streams "M:SS  MEASURE.BEAT" to stdout as it
 * plays, so the controller drives a drift-free clock from the engine's actual
 * reported position (and "playback started" = the first position line, which
 * deterministically solves the instrument-load wait).
 *
 * cfg: an accompanying <base>.timidity.cfg next to the ABC is preferred (the
 * soundfont agent's per-piece config); if it segfaults timidity we fall back
 * once to timidity-sanitized.cfg.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execa } from 'execa';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SANITIZED_CFG = path.resolve(__dirname, '../../timidity-sanitized.cfg');

export function selectCfg(abcPath) {
  const dir = path.dirname(path.resolve(abcPath));
  const base = path.basename(abcPath).replace(/\.abc$/i, '');
  const candidates = [
    path.join(dir, `${base}.timidity.cfg`),
    path.join(dir, `${base.replace(/_\d+$/, '')}.timidity.cfg`),
    path.join(dir, `${base.replace(/\d+$/, '')}.timidity.cfg`),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return { cfg: c, custom: true };
  }
  return { cfg: SANITIZED_CFG, custom: false };
}

const POS_RE = /(\d+):(\d{2})\s+(\d+)\.(\d+)/g;

export class TimidityPlayer {
  constructor(abcPath, midiPath, handlers = {}) {
    this.abcPath = abcPath;
    this.midiPath = midiPath;
    this.h = handlers;
    this.proc = null;
    this.started = false;
    this.fellBack = false;
  }

  _emit(name, ...a) { if (this.h[name]) this.h[name](...a); }

  _spawn(cfg, custom) {
    const args = ['-c', cfg, this.midiPath, '-A100a,100a', '-j', '-a', '-Ewpvsetoz', '-F', '-idt'];
    const proc = execa('timidity', args, { reject: false, stdout: 'pipe', stderr: 'pipe', stdin: 'ignore' });
    this.proc = proc;
    proc.catch(() => {});

    let buf = '';
    proc.stdout.on('data', (d) => {
      buf += d.toString();
      let last = null;
      let m;
      POS_RE.lastIndex = 0;
      while ((m = POS_RE.exec(buf)) !== null) last = m;
      if (last) {
        if (!this.started) { this.started = true; this._emit('onStart'); }
        const ms = (parseInt(last[1], 10) * 60 + parseInt(last[2], 10)) * 1000;
        this._emit('onPosition', ms, parseInt(last[3], 10), parseInt(last[4], 10));
      }
      if (buf.length > 8192) buf = buf.slice(-2048);
    });

    proc.on('exit', (code, signal) => {
      if (custom && !this.fellBack && (signal === 'SIGSEGV' || !this.started)) {
        this.fellBack = true;
        this.started = false;
        this._emit('onLog', `custom cfg failed (${signal || 'exit ' + code}) — falling back to sanitized cfg`);
        this._spawn(SANITIZED_CFG, false);
        return;
      }
      this._emit('onExit', code, signal);
    });
  }

  start() {
    const { cfg, custom } = selectCfg(this.abcPath);
    this._emit('onLog', `cfg: ${custom ? 'custom ' : 'sanitized '}${path.basename(cfg)}`);
    this._spawn(cfg, custom);
  }

  pause() { try { this.proc.kill('SIGSTOP'); } catch (_) {} }
  resume() { try { this.proc.kill('SIGCONT'); } catch (_) {} }
  stop() { try { this.proc.kill('SIGKILL'); } catch (_) {} }
}
