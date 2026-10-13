/**
 * ABC edit tools: the model edits a score by voice and bar number instead of re-writing it.
 * abcjs parses the text to find every bar line; edits only insert %% lines or change
 * decorations (!...!), so notes and rhythms cannot change. finish() checks that.
 */

import abcjsImport from 'abcjs';
import { tool } from 'ai';
import { z } from 'zod';
import { validateAbcNotation } from '../../utils/validation.js';
import { trace } from '../shared/utils.js';

const abcjs = abcjsImport.default || abcjsImport;

const DYNAMICS = ['pppp', 'ppp', 'pp', 'p', 'mp', 'mf', 'f', 'ff', 'fff', 'ffff'];

// Voice sections in text order. A voice can have many sections ([V:1] ... [V:2] ... [V:1] ...).
function voiceSections(text) {
  const re = /\[V:\s*([^\s\]]+)[^\]]*\]|^V:\s*(\S+).*$/gm;
  const sections = [];
  let m;
  while ((m = re.exec(text))) {
    sections.push({ id: m[1] || m[2], header: m[0], start: m.index, contentStart: m.index + m[0].length });
  }
  sections.forEach((s, i) => { s.end = i + 1 < sections.length ? sections[i + 1].start : text.length; });
  return sections;
}

// True when a stretch of ABC contains a note or rest (ignores %-lines, inline fields, decorations, strings).
function hasMusic(segment) {
  const stripped = segment
    .split('\n').filter((l) => !l.trimStart().startsWith('%')).join('\n')
    .replace(/\[[A-Za-z]:[^\]]*\]/g, '')
    .replace(/![^!\n]*!/g, '')
    .replace(/"[^"\n]*"/g, '');
  return /[A-Ga-gzZx]/.test(stripped);
}

// Map of voice id -> list of bars {start, end} (character positions in text). Bars are numbered from 1.
export function indexBars(text) {
  const [tune] = abcjs.parseOnly(text);
  const barEnds = new Set();
  for (const line of tune?.lines || []) {
    for (const staff of line.staff || []) {
      for (const voice of staff.voices || []) {
        for (const el of voice) if (el.el_type === 'bar') barEnds.add(el.endChar);
      }
    }
  }
  const sortedEnds = [...barEnds].sort((a, b) => a - b);
  const voices = new Map();
  for (const section of voiceSections(text)) {
    if (!voices.has(section.id)) {
      const name = (section.header.match(/name="([^"]+)"/) || [])[1] || '';
      voices.set(section.id, { id: section.id, name, bars: [] });
    }
    const v = voices.get(section.id);
    if (!v.name) v.name = (section.header.match(/name="([^"]+)"/) || [])[1] || '';
    const ends = sortedEnds.filter((end) => end > section.contentStart && end <= section.end);
    if (ends.length === 0) {
      // no bar lines in this section: each line of music is one bar
      let lineStart = section.contentStart;
      for (const line of text.slice(section.contentStart, section.end).split('\n')) {
        const lineEnd = lineStart + line.length;
        if (hasMusic(line)) v.bars.push({ start: lineStart, end: lineEnd });
        lineStart = lineEnd + 1;
      }
      continue;
    }
    let s = section.contentStart;
    for (const end of ends) {
      if (hasMusic(text.slice(s, end))) v.bars.push({ start: s, end });
      s = end;
    }
    if (hasMusic(text.slice(s, section.end))) v.bars.push({ start: s, end: section.end });
  }
  return voices;
}

// Notes and rhythms only: drops %-lines, decorations and all whitespace.
export function musicSkeleton(text) {
  return text
    .split('\n').filter((l) => !l.trimStart().startsWith('%')).join('\n')
    .replace(/![^!\n]*!/g, '')
    .replace(/\s+/g, '');
}

export function createAbcEditSession(originalAbc, logLabel = 'abc-edit') {
  let text = originalAbc;
  let index = indexBars(text);
  const stats = { insertedLines: 0, dynamicsSet: 0, decorationsReplaced: 0, validations: 0 };

  const reindex = () => { index = indexBars(text); };
  const log = (name, input, output) => {
    trace(`\n--- tool result [${logLabel}] ${name} ${JSON.stringify(input)} ->\n${typeof output === 'string' ? output : JSON.stringify(output, null, 2)}\n`);
    return output;
  };

  const getBar = (voice, bar) => {
    const v = index.get(String(voice));
    if (!v) throw new Error(`No voice "${voice}". Voices: ${[...index.keys()].join(', ')}`);
    if (bar < 1) throw new Error('bar numbers start at 1');
    const b = v.bars[bar - 1];
    if (!b) throw new Error(`Voice ${voice} has ${v.bars.length} bars; bar ${bar} does not exist`);
    return b;
  };

  // Position of the first musical character of a bar (after whitespace and inline fields like [Q:...]).
  const barContentStart = (b) => {
    let p = b.start;
    for (;;) {
      while (p < b.end && /\s/.test(text[p])) p++;
      if ((p === 0 || text[p - 1] === '\n') && text[p] === '%') {
        const nl = text.indexOf('\n', p);
        p = nl === -1 ? b.end : nl + 1;
        continue;
      }
      const field = text.slice(p, b.end).match(/^\[[A-Za-z]:[^\]]*\]/);
      if (!field) return p;
      p += field[0].length;
    }
  };

  const insertLineBefore = (voice, bar, line) => {
    const b = getBar(voice, bar);
    let p = b.start;
    while (p < b.end && /\s/.test(text[p])) p++;
    let q = p;
    while (q > 0 && /[ \t]/.test(text[q - 1])) q--;
    if (q === 0 || text[q - 1] === '\n') p = q; // only spaces before the bar on its line: insert at the line start, never leave a whitespace-only line
    const atLineStart = p === 0 || text[p - 1] === '\n';
    text = text.slice(0, p) + (atLineStart ? '' : '\n') + line + '\n' + text.slice(p);
    stats.insertedLines++;
    reindex();
  };

  const safe = (name, fn) => async (input) => {
    try {
      return log(name, input, await fn(input));
    } catch (error) {
      return log(name, input, { error: error.message });
    }
  };

  const voiceArg = z.string().describe('Voice id as written after V: in the score, e.g. "1" or "drums"');
  const barArg = z.number().int().describe('Bar number in that voice, counting from 1. Only bars that contain notes or rests are counted.');

  const tools = {
    show_bars: tool({
      strict: true,
      description: 'Show the exact text of bars in one voice, to check you have the right place before editing. Max 32 bars per call.',
      inputSchema: z.object({ voice: voiceArg, from: barArg, to: barArg }),
      execute: safe('show_bars', async ({ voice, from, to }) => {
        if (to < from) throw new Error('to must be >= from');
        const last = Math.min(to, from + 31);
        const lines = [];
        for (let n = from; n <= last; n++) {
          const b = getBar(voice, n);
          lines.push(`V${voice} bar ${n}: ${text.slice(b.start, b.end).trim()}`);
        }
        return lines.join('\n');
      }),
    }),
    insert_directive: tool({
      strict: true,
      description: 'Insert one %% directive line (e.g. "%%MIDI control 11 90", "%%MIDI beat 110 95 70 4", "%%PNEUMA humanize 10") immediately before a bar of a voice. It applies to that voice from that bar on.',
      inputSchema: z.object({ voice: voiceArg, bar: barArg, line: z.string().describe('The full directive line, starting with %%') }),
      execute: safe('insert_directive', async ({ voice, bar, line }) => {
        if (!line.startsWith('%%') || line.includes('\n')) throw new Error('line must start with %% and be a single line');
        insertLineBefore(voice, bar, line.trim());
        return { ok: true };
      }),
    }),
    ramp: tool({
      strict: true,
      description: 'Write a MIDI controller ramp: inserts "%%MIDI control <controller> <value>" before every bar from from_bar to to_bar, moving linearly from start to end. Use for crescendo/expression/filter/pan curves (CC7 volume, CC11 expression, CC74 brightness, CC10 pan, CC1 modulation, CC91 reverb).',
      inputSchema: z.object({
        voice: voiceArg,
        from_bar: barArg,
        to_bar: barArg,
        controller: z.number().int().describe('MIDI controller number 0-127'),
        start: z.number().int().describe('Value 0-127 at from_bar'),
        end: z.number().int().describe('Value 0-127 at to_bar'),
      }),
      execute: safe('ramp', async ({ voice, from_bar, to_bar, controller, start, end }) => {
        if (to_bar < from_bar) throw new Error('to_bar must be >= from_bar');
        for (const [k, v] of Object.entries({ controller, start, end })) if (v < 0 || v > 127) throw new Error(`${k} must be 0-127`);
        getBar(voice, from_bar);
        getBar(voice, to_bar);
        const steps = to_bar - from_bar;
        // insert from the last bar backwards so earlier bar positions stay valid
        for (let n = to_bar; n >= from_bar; n--) {
          const value = steps === 0 ? start : Math.round(start + ((end - start) * (n - from_bar)) / steps);
          insertLineBefore(voice, n, `%%MIDI control ${controller} ${value}`);
        }
        return { ok: true, linesInserted: steps + 1 };
      }),
    }),
    set_dynamic: tool({
      strict: true,
      description: 'Set the dynamic mark at the start of a bar (replaces an existing leading dynamic or adds one). Marks: pppp ppp pp p mp mf f ff fff ffff.',
      inputSchema: z.object({ voice: voiceArg, bar: barArg, mark: z.enum(DYNAMICS) }),
      execute: safe('set_dynamic', async ({ voice, bar, mark }) => {
        const b = getBar(voice, bar);
        const p = barContentStart(b);
        const existing = text.slice(p, b.end).match(/^!(pppp|ppp|pp|p|mp|mf|f|ff|fff|ffff)!/);
        text = text.slice(0, p) + `!${mark}!` + text.slice(p + (existing ? existing[0].length : 0));
        stats.dynamicsSet++;
        reindex();
        return { ok: true, replaced: existing ? existing[0] : null };
      }),
    }),
    replace_decoration: tool({
      strict: true,
      description: 'Inside one bar, replace a decoration such as "!f!" with another such as "!fff!" (or with "" to remove it). Use for accents and dynamics on individual notes inside a bar.',
      inputSchema: z.object({
        voice: voiceArg,
        bar: barArg,
        from: z.string().describe('Existing decoration, e.g. "!f!"'),
        to: z.string().describe('New decoration, e.g. "!fff!", or "" to remove'),
        all: z.boolean().describe('true: replace every occurrence in the bar; false: first only'),
      }),
      execute: safe('replace_decoration', async ({ voice, bar, from, to, all }) => {
        if (!/^![^!\s]+!$/.test(from)) throw new Error('from must be one decoration like "!f!"');
        if (!/^(![^!\s]+!)?$/.test(to)) throw new Error('to must be one decoration like "!fff!" or ""');
        const b = getBar(voice, bar);
        const segment = text.slice(b.start, b.end);
        const count = segment.split(from).length - 1;
        if (count === 0) throw new Error(`"${from}" not found in voice ${voice} bar ${bar}: ${segment.trim()}`);
        const updated = all ? segment.split(from).join(to) : segment.replace(from, to);
        text = text.slice(0, b.start) + updated + text.slice(b.end);
        stats.decorationsReplaced += all ? count : 1;
        reindex();
        return { ok: true, replaced: all ? count : 1 };
      }),
    }),
    remove_directive: tool({
      strict: true,
      description: 'Remove one %% directive line from inside a bar of a voice (exact text match). Use it to undo a directive you inserted, e.g. after validate reports it.',
      inputSchema: z.object({ voice: voiceArg, bar: barArg, line: z.string().describe('The exact directive line to remove, starting with %%') }),
      execute: safe('remove_directive', async ({ voice, bar, line }) => {
        if (!line.startsWith('%%')) throw new Error('line must start with %%');
        const b = getBar(voice, bar);
        const segment = text.slice(b.start, b.end);
        const lines = segment.split('\n');
        const i = lines.findIndex((l) => l.trim() === line.trim());
        if (i === -1) throw new Error(`"${line}" not found in voice ${voice} bar ${bar}`);
        lines.splice(i, 1);
        text = text.slice(0, b.start) + lines.join('\n') + text.slice(b.end);
        stats.removedLines = (stats.removedLines || 0) + 1;
        reindex();
        return { ok: true };
      }),
    }),
    validate: tool({
      strict: true,
      description: 'Run abc2midi on the current edited score and return errors and warnings. Call this after your edits.',
      inputSchema: z.object({}),
      execute: safe('validate', async () => {
        stats.validations++;
        const v = await validateAbcNotation(text);
        return { valid: v.isValid, errors: v.issues.slice(0, 20), warningCount: v.warnings.length, warnings: v.warnings.slice(0, 20) };
      }),
    }),
  };

  return {
    tools,
    stats,
    getText: () => text,
    voiceSummary: () => [...index.values()].map((v) => `V:${v.id}${v.name ? ` "${v.name}"` : ''}: ${v.bars.length} bars`).join('\n'),
    // Throws if notes or rhythms changed. Returns the edited score.
    finish: () => {
      if (/\n[ \t]*\n/.test(text.trim()) && !/\n[ \t]*\n/.test(originalAbc.trim())) {
        throw new Error('Edited score contains a blank line, which would end the tune; edits rejected');
      }
      if (musicSkeleton(text) !== musicSkeleton(originalAbc)) {
        throw new Error('Edited score changed notes or rhythms; edits rejected');
      }
      return text;
    },
  };
}
