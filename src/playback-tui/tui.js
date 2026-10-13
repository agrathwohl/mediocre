/**
 * Two-pane playback view: left = note/rest stream, right = comments, metadata
 * and every non-note event (directives, key/meter/tempo, bars) the AI wrote.
 * Both are fed by the controller as the timidity-slaved clock passes each, so
 * the metadata appears in time with the audio. Status bar on top, a footer of
 * the global directives present in the score on the bottom.
 */

import blessed from 'neo-blessed';

function esc(s) {
  return String(s).replace(/[{}]/g, (c) => (c === '{' ? '{open}' : '{close}'));
}

function globalDirectives(source) {
  const seen = new Set();
  for (const line of source.split('\n')) {
    const m = line.match(/^\s*%%\s*([A-Za-z][\w-]*)/);
    if (m) seen.add(m[1].toUpperCase());
    if (line.match(/^\s*\[?V:/)) break;
  }
  return [...seen];
}

export class PlaybackTUI {
  constructor({ title, source }) {
    this.screen = blessed.screen({ smartCSR: true, title: title || 'mediocre playback', fullUnicode: true });

    this.status = blessed.box({
      parent: this.screen, top: 0, left: 0, width: '100%', height: 3,
      border: { type: 'line' }, tags: true, style: { border: { fg: 'grey' } },
    });

    this.logBox = blessed.log({
      parent: this.screen, label: ' Notes ',
      top: 3, left: 0, width: '60%', height: '100%-6',
      border: { type: 'line' }, tags: true, scrollable: true, alwaysScroll: true, scrollback: 100000,
      scrollbar: { ch: ' ', style: { bg: 'grey' } }, style: { border: { fg: 'grey' } },
    });

    this.metaBox = blessed.log({
      parent: this.screen, label: ' Comments · Metadata · Directives ',
      top: 3, left: '60%', width: '40%', height: '100%-6',
      border: { type: 'line' }, tags: true, scrollable: true, alwaysScroll: true, scrollback: 100000,
      scrollbar: { ch: ' ', style: { bg: 'grey' } }, style: { border: { fg: 'grey' } },
    });

    const tags = globalDirectives(source);
    this.tagsBox = blessed.box({
      parent: this.screen, bottom: 0, left: 0, width: '100%', height: 3,
      border: { type: 'line' }, tags: true, style: { border: { fg: 'grey' } },
      content: tags.length
        ? ' {bold}global directives:{/bold} ' + tags.map((t) => `{cyan-fg}%%${esc(t)}{/cyan-fg}`).join('  ')
        : ' {grey-fg}global directives: none{/grey-fg}',
    });

    this.screen.render();
  }

  onKey(map) {
    for (const [keys, fn] of Object.entries(map)) this.screen.key(keys.split(','), fn);
  }

  logEvent(line) { this.logBox.log(line); }

  logMeta(line) { this.metaBox.log(line); }

  setStatus(line) { this.status.setContent(line); this.screen.render(); }

  destroy() { try { this.screen.destroy(); } catch (_) {} }
}
