/**
 * Builds a time-indexed playback timeline from ABC source using abcjs.parseOnly.
 *
 * abcjs's own event timing (setupEvents/noteTimings) requires the rendered
 * engraver layout, which is unavailable headless — so timing is computed here
 * from each parsed element's whole-note `duration` and the Q:/L: headers.
 *
 * Output events carry source character ranges so the TUI can highlight the
 * exact ABC the AI wrote, and comment/directive lines are attached as text
 * events at the moment the music following them begins.
 */

import abcjsImport from 'abcjs';

const abcjs = abcjsImport.default || abcjsImport;

function wholeNoteSeconds(source) {
  const q = source.match(/^Q:\s*(?:"[^"]*"\s*)?(?:(\d+)\/(\d+)\s*=\s*)?(\d+)/m);
  if (!q) return 2.0;
  const num = q[1] ? parseInt(q[1], 10) : 1;
  const den = q[2] ? parseInt(q[2], 10) : 4;
  const bpm = parseInt(q[3], 10);
  if (!bpm) return 2.0;
  return (den / num) * (60 / bpm);
}

function* walkElements(tune) {
  for (const line of tune.lines || []) {
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        for (const el of voice) {
          yield el;
        }
      }
    }
  }
}

// Voices are written as full sequential blocks marked by [V:id] / line-start V:.
// Keying each voice clock by which marker-segment an element falls in makes
// separately-written voices start together (parallel) instead of stacking.
function voiceBoundaries(source) {
  const bounds = [];
  const re = /\[V:[^\]]*\]|^V:[^\n]*/gm;
  let m;
  while ((m = re.exec(source)) !== null) bounds.push(m.index);
  return bounds;
}

function voiceKeyFor(charStart, bounds) {
  let key = 0;
  for (let i = 0; i < bounds.length; i++) {
    if (bounds[i] <= charStart) key = i + 1;
    else break;
  }
  return key;
}

/**
 * @param {string} source - raw ABC notation
 * @returns {{ source: string, lines: string[], events: Array, totalMs: number, wholeMs: number }}
 */
export function buildTimeline(source) {
  const wholeMs = wholeNoteSeconds(source) * 1000;
  let tune;
  try {
    tune = abcjs.parseOnly(source)[0];
  } catch (e) {
    tune = null;
  }

  const events = [];

  if (tune) {
    // Each voice advances its own clock; elements with a duration consume time,
    // zero-duration elements (bars, inline fields, grace notes) are timestamped
    // at the current voice position without advancing it.
    const bounds = voiceBoundaries(source);
    const voiceTime = {};
    for (const el of walkElements(tune)) {
      if (el.startChar == null) continue;
      const voice = voiceKeyFor(el.startChar, bounds);
      if (voiceTime[voice] === undefined) voiceTime[voice] = 0;
      const dur = typeof el.duration === 'number' ? el.duration : 0;
      const tMs = voiceTime[voice];
      const durMs = dur * wholeMs;
      if (el.endChar != null && el.el_type) {
        events.push({
          tMs,
          durMs,
          voice,
          kind: el.el_type === 'note' ? (el.rest ? 'rest' : 'note') : el.el_type,
          charStart: el.startChar,
          charEnd: el.endChar,
          text: source.slice(el.startChar, el.endChar).trim(),
        });
      }
      voiceTime[voice] += durMs;
    }
  }

  // Comment (%) and directive (%%) lines are stripped from the parsed model;
  // recover them from raw source and attach to the next note's time so they
  // surface as text events exactly when their music arrives.
  const noteEvents = events.filter((e) => e.kind === 'note' || e.kind === 'rest');
  let offset = 0;
  for (const rawLine of source.split('\n')) {
    const lineStart = offset;
    offset += rawLine.length + 1;
    const trimmed = rawLine.trim();
    if (!trimmed.startsWith('%')) continue;
    const isDirective = trimmed.startsWith('%%');
    const next = noteEvents.find((e) => e.charStart >= lineStart);
    events.push({
      tMs: next ? next.tMs : (noteEvents.length ? noteEvents[noteEvents.length - 1].tMs : 0),
      durMs: 0,
      voice: -1,
      kind: isDirective ? 'directive' : 'comment',
      charStart: lineStart,
      charEnd: lineStart + rawLine.length,
      text: trimmed,
    });
  }

  events.sort((a, b) => a.tMs - b.tMs || a.charStart - b.charStart);
  const totalMs = events.reduce((m, e) => Math.max(m, e.tMs + e.durMs), 0);

  return { source, lines: source.split('\n'), events, totalMs, wholeMs };
}
