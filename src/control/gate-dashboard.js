/**
 * Neo-blessed full-screen TUI dashboard for HITL orchestration gates.
 * Drop-in replacement for GatePrompts — same 4 async methods + close().
 */
import blessed from 'neo-blessed';

// ── Score dimension metadata ────────────────────────────────────────
const DIMENSIONS = [
  { key: 'technical',    label: 'Technical   ', color: 'cyan' },
  { key: 'musical',      label: 'Musical     ', color: 'magenta' },
  { key: 'fusion',       label: 'Fusion      ', color: 'yellow' },
  { key: 'completeness', label: 'Completeness', color: 'green' },
  { key: 'duration',     label: 'Duration    ', color: 'red' },
];

const SPARK = '▁▂▃▄▅▆▇█';

// ── Directed feedback shortcuts (HITL design doc §Directed Feedback) ─
const FEEDBACK_SHORTCUTS = [
  { key: '1',  complaint: 'Add more prominent drums and percussion. The rhythm section needs more presence and drive.' },
  { key: '2',  complaint: 'Strengthen the bass and low-end. Add more sub-bass presence and bass movement.' },
  { key: '3',  complaint: 'The melody and lead lines need to be more prominent and memorable.' },
  { key: '4',  complaint: 'Add more textural elements and pad sounds for atmospheric depth.' },
  { key: '5',  complaint: 'Increase the classical genre influence. Add more classical techniques and characteristics.' },
  { key: '6',  complaint: 'Increase the modern genre influence. Add more modern production techniques.' },
  { key: '7',  complaint: 'Improve the genre fusion. The blend feels disjointed — integrate both styles more creatively.' },
  { key: '8',  complaint: 'Add a proper introduction section that establishes the mood and sets up the themes.' },
  { key: '9',  complaint: 'Add a bridge or transition section for better flow between main sections.' },
  { key: '10', complaint: 'Add a dedicated solo section for the lead instrument to showcase virtuosity.' },
  { key: '11', complaint: 'Add a proper ending section (coda/outro) for a satisfying conclusion.' },
  { key: '12', complaint: 'The composition is too short. Extend with additional development or variations.' },
  { key: '13', complaint: 'Fix rhythm issues. Ensure consistent meter, fix irregular bar lengths, improve flow.' },
  { key: '14', complaint: 'Fix harmony issues. Reduce unwanted dissonance, ensure intentional chord progressions.' },
  { key: '15', complaint: 'Improve dynamic range and expression. Add crescendos, decrescendos, varied articulation.' },
];

// ── Helpers ─────────────────────────────────────────────────────────

function scoreTag(score) {
  if (score >= 8) return '{green-fg}';
  if (score >= 6) return '{yellow-fg}';
  return '{red-fg}';
}

function renderBar(score, width) {
  width = width || 15;
  const filled = Math.round((score / 10) * width);
  const empty = width - filled;
  const tag = scoreTag(score);
  return `${tag}${'█'.repeat(filled)}{/}${'░'.repeat(empty)} ${tag}${score.toFixed(1)}{/}`;
}

function sparkline(values) {
  return values.map(v => {
    const i = Math.min(Math.floor((v / 10) * 8), 7);
    return SPARK[Math.max(0, i)];
  }).join('');
}

function fmtElapsed(ms) {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function avgScore(scores) {
  if (!scores) return 0;
  const vals = DIMENSIONS.map(d => scores[d.key] || 0);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

function wordWrap(text, maxW) {
  if (!text || maxW <= 0) return text || '';
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    if (line.length + word.length + 1 > maxW) { lines.push(line); line = word; }
    else line = line ? line + ' ' + word : word;
  }
  if (line) lines.push(line);
  return lines.join('\n  ');
}

function truncate(text, n) {
  if (!text) return '';
  const clean = text.replace(/\n/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

// ── Action bar label map ────────────────────────────────────────────
const ACTION_LABELS = {
  a: '{bold}{green-fg}[a]{/}pprove',
  r: '{bold}{red-fg}[r]{/}eject',
  d: '{bold}{cyan-fg}[d]{/}irect',
  l: '{bold}{magenta-fg}[l]{/}isten',
  b: '{bold}{yellow-fg}[b]{/}ranch',
  q: '{bold}{red-fg}[q]{/}uit',
  '+': '{bold}{white-fg}[+]{/} extend',
  '-': '{bold}{white-fg}[-]{/} reduce',
};

// ═════════════════════════════════════════════════════════════════════
//  GateDashboard
// ═════════════════════════════════════════════════════════════════════

export class GateDashboard {
  constructor(previewPlayer = null, checkpointManager = null, options = {}) {
    this.previewPlayer = previewPlayer;
    this.checkpointManager = checkpointManager;
    this.genre = options.genre || '';
    this.screen = null;
    this.w = {};               // widget refs
    this.scoreHistory = [];    // array of { technical, musical, … } score objects
    this.startTime = Date.now();
    this._state = {};          // saved state for restoration after preview
  }

  // ── Screen lifecycle ──────────────────────────────────────────────

  _ensureScreen() {
    if (!this.screen) this._createScreen();
  }

  _createScreen() {
    this.screen = blessed.screen({
      smartCSR: true,
      fullUnicode: true,
      dockBorders: true,
      autoPadding: true,
      title: 'Mediocre — Orchestration Dashboard',
      ignoreLocked: ['C-c'],
    });

    this.screen.key(['C-c'], () => { this.close(); process.exit(0); });

    // ── Header (fixed 3 rows) ──
    this.w.header = blessed.box({
      parent: this.screen,
      top: 0, left: 0, width: '100%', height: 3,
      tags: true,
      style: { bg: 'blue', fg: 'white', bold: true },
      padding: { left: 1, right: 1 },
    });

    // ── Decision panel (left 60%, middle band) ──
    this.w.decision = blessed.box({
      parent: this.screen,
      top: 3, left: 0, width: '60%', height: '45%-3',
      label: ' Decision ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'blue' }, fg: 'white' },
      padding: { left: 1, right: 1 },
      scrollable: true, alwaysScroll: true, mouse: true,
    });

    // ── Scores panel (right 40%, middle band) ──
    this.w.scores = blessed.box({
      parent: this.screen,
      top: 3, left: '60%', width: '40%', height: '45%-3',
      label: ' QA Scores ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'blue' }, fg: 'white' },
      padding: { left: 1, right: 1 },
    });

    // ── Work history panel (fills between middle band and action bar) ──
    this.w.history = blessed.box({
      parent: this.screen,
      top: '45%', left: 0, width: '100%', height: '55%-3',
      label: ' Work History ',
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'blue' }, fg: 'white' },
      padding: { left: 1, right: 1 },
      scrollable: true, alwaysScroll: true, mouse: true,
      scrollbar: { ch: '│', style: { fg: 'blue' } },
    });

    // ── Action bar (fixed 3 rows at bottom) ──
    this.w.actions = blessed.box({
      parent: this.screen,
      bottom: 0, left: 0, width: '100%', height: 3,
      tags: true,
      border: { type: 'line' },
      style: { border: { fg: 'blue' }, fg: 'white' },
      padding: { left: 1 },
    });

    this.screen.render();
  }

  _destroyScreen() {
    if (this.screen) {
      this.screen.destroy();
      this.screen = null;
      this.w = {};
    }
  }

  // ── Widget update methods ─────────────────────────────────────────

  _updateHeader({ genre, iteration, maxIterations, agent, mode }) {
    const el = fmtElapsed(Date.now() - this.startTime);
    const g = genre || this.genre || '';
    const iter = iteration != null ? `Iter ${iteration}/${maxIterations}` : '';
    const ag = agent ? `│  Agent: {bold}${agent}{/bold}  ` : '';
    const m = mode ? `│  ${mode}  ` : '';
    this.w.header.setContent(
      `  🎵 {bold}ORCHESTRATION DASHBOARD{/bold}  │  ${g}  │  ${iter}  ${ag}${m}│  ⏱ ${el}`
    );
  }

  _updateDecision(d) {
    if (!d) {
      this.w.decision.setContent('{gray-fg}Waiting for orchestrator…{/}');
      return;
    }
    const mw = Math.max(30, Math.floor((this.screen.width || 80) * 0.6) - 6);
    const lines = [];
    if (d.action) {
      const c = d.action === 'done' ? 'green' : 'cyan';
      lines.push(`{bold}Action:{/bold}  {${c}-fg}${d.action}{/}`);
    }
    if (d.agent) lines.push(`{bold}Agent:{/bold}   {yellow-fg}${d.agent}{/}`);
    if (d.directive) {
      lines.push('', '{bold}Directive:{/bold}');
      lines.push(`  {white-fg}${wordWrap(d.directive, mw)}{/}`);
    }
    if (d.reasoning) {
      lines.push('', '{bold}Reasoning:{/bold}');
      lines.push(`  {gray-fg}${wordWrap(d.reasoning, mw)}{/}`);
    }
    if (d.expectedImprovement) {
      lines.push('', `{bold}Expected:{/bold}  {green-fg}${d.expectedImprovement}{/}`);
    }
    this.w.decision.setContent(lines.join('\n'));
  }

  _updateScores(qa) {
    if (!qa?.scores) {
      this.w.scores.setContent('{gray-fg}No scores yet{/}');
      return;
    }
    const vc = qa.verdict === 'pass' ? 'green' : qa.verdict === 'fail' ? 'red' : 'yellow';
    const lines = [`{bold}Verdict:{/bold} {${vc}-fg}${qa.verdict}{/}`, ''];

    for (const dim of DIMENSIONS) {
      const s = qa.scores[dim.key] || 0;
      const hist = this.scoreHistory.map(h => h[dim.key] || 0);
      const sp = hist.length > 1 ? `  {gray-fg}${sparkline(hist)}{/}` : '';
      lines.push(`{${dim.color}-fg}${dim.label}{/}  ${renderBar(s)}${sp}`);
    }

    lines.push('', `{bold}Average:{/bold}     ${renderBar(avgScore(qa.scores))}`);

    if (qa.summary) {
      const mw = Math.max(20, Math.floor((this.screen.width || 80) * 0.4) - 6);
      lines.push('', '{bold}Summary:{/bold}');
      lines.push(`  {gray-fg}${wordWrap(qa.summary, mw)}{/}`);
    }
    this.w.scores.setContent(lines.join('\n'));
  }

  _updateWorkHistory(wh) {
    if (!wh?.length) {
      this.w.history.setContent('{gray-fg}No iterations yet{/}');
      return;
    }
    const lines = wh.map((e, i) => {
      const ag = e.agent ? `{yellow-fg}${e.agent.padEnd(16)}{/}` : '{gray-fg}—{/}'.padEnd(16);
      const dir = truncate(e.directive || '', 45);
      const a = e.qaScores ? avgScore(e.qaScores).toFixed(1) : '—';
      const sc = e.qaScores ? scoreTag(avgScore(e.qaScores)) : '{gray-fg}';
      return `  {bold}#${String(i + 1).padStart(2)}{/bold}  │  ${ag}  │  ${dir.padEnd(47)}  │  ${sc}${a}{/}`;
    });
    this.w.history.setContent(lines.join('\n'));
    this.w.history.setScrollPerc(100);
  }

  _setActions(keys) {
    this.w.actions.setContent(keys.map(k => ACTION_LABELS[k] || k).join('   '));
  }

  // ── User input ────────────────────────────────────────────────────

  /** Wait for a single keypress matching one of `keys`. */
  _waitForKey(keys) {
    return new Promise(resolve => {
      const handler = (ch) => {
        let k = ch;
        if (k === '=') k = '+';   // unshifted +
        if (k === '_') k = '-';   // shifted -
        if (keys.includes(k)) {
          this.screen.removeListener('keypress', handler);
          resolve(k);
        }
      };
      this.screen.on('keypress', handler);
    });
  }

  /** Show the directed-feedback modal. Returns complaint string or null. */
  _showDirectiveModal() {
    return new Promise(resolve => {
      const modal = blessed.box({
        parent: this.screen,
        top: 'center', left: 'center',
        width: '80%', height: '75%',
        label: ' Directed Feedback ',
        tags: true,
        border: { type: 'line' },
      style: { border: { fg: 'cyan' }, bg: 'black', fg: 'white' },
        padding: { left: 1, right: 1 },
        shadow: true,
      });

      blessed.box({
        parent: modal,
        top: 0, left: 0, width: '100%-4', height: '55%',
        tags: true,
        content: [
          '{bold}Quick directives:{/bold}  Type a number (1-15), or write custom text below.',
          '',
          '  {cyan-fg}INSTRUMENT{/}           {cyan-fg}GENRE{/}              {cyan-fg}STRUCTURE{/}         {cyan-fg}QUALITY{/}',
          '   1 More drums          5 More classical     8  Add intro       13 Fix rhythm',
          '   2 More bass           6 More modern        9  Add bridge      14 Fix harmony',
          '   3 More melody         7 Better fusion      10 Add solo        15 Dynamics',
          '   4 More texture                             11 Add coda',
          '                                              12 Extend length',
        ].join('\n'),
      });

      blessed.box({
        parent: modal,
        top: '55%', left: 0, width: '100%-4', height: 1,
        tags: true,
        content: '{bold}Your directive:{/bold}  (Enter = submit, Escape = cancel)',
      });

      const input = blessed.textbox({
        parent: modal,
        top: '55%+2', left: 0,
        width: '100%-4', height: 3,
        border: { type: 'line' },
        style: { border: { fg: 'cyan' }, focus: { border: { fg: 'white' } } },
      });

      const done = (val) => {
        modal.destroy();
        this.screen.render();
        resolve(val);
      };

      input.readInput((err, value) => {
        if (err) { done(null); return; }
        const text = (value || '').trim();
        if (!text) { done(null); return; }
        const shortcut = FEEDBACK_SHORTCUTS.find(s => s.key === text);
        done(shortcut ? shortcut.complaint : text);
      });

      this.screen.render();
    });
  }

  /** Small prompt for number of iterations to extend. Returns number or null. */
  _showExtendPrompt() {
    return new Promise(resolve => {
      const box = blessed.box({
        parent: this.screen,
        bottom: 3, left: 'center',
        width: 40, height: 3,
        label: ' Extend by how many iterations? ',
        border: { type: 'line' },
        style: { border: { fg: 'cyan' } },
        shadow: true,
      });

      const input = blessed.textbox({
        parent: box,
        top: 0, left: 1, width: 34, height: 1,
        style: { fg: 'white' },
      });

      const done = (val) => {
        box.destroy();
        this.screen.render();
        resolve(val);
      };

      input.setValue('3');
      input.readInput((err, value) => {
        if (err) { done(null); return; }
        const n = parseInt((value || '').trim(), 10);
        done(isNaN(n) || n <= 0 ? null : n);
      });

      this.screen.render();
    });
  }

  // ── Preview & branch ──────────────────────────────────────────────

  async _handleListen(abc) {
    if (!this.previewPlayer) return;
    // Destroy blessed screen so timidity's ncurses can take over the terminal
    this._destroyScreen();
    try {
      await this.previewPlayer.play(abc);
    } catch (_) {
      // Preview failed — continue anyway
    }
    // Re-create screen and restore all widget state
    this._createScreen();
    this._restoreState();
  }

  async _handleBranch(abc, iteration) {
    if (!this.checkpointManager) return;
    try {
      const branchPath = await this.checkpointManager.createBranch(abc, iteration);
      const prev = this.w.history.getContent();
      this.w.history.setContent(prev + `\n  {green-fg}✓ Branch saved: ${branchPath}{/}`);
      this.screen.render();
    } catch (_) {
      // Branch failed — continue silently
    }
  }

  _restoreState() {
    const s = this._state;
    if (s.header) this._updateHeader(s.header);
    if (s.decision) this._updateDecision(s.decision);
    if (s.qa) this._updateScores(s.qa);
    if (s.wh) this._updateWorkHistory(s.wh);
    if (s.keys) this._setActions(s.keys);
    if (this.screen) this.screen.render();
  }

  // ── Action loop (shared by all 4 prompt methods) ──────────────────

  async _actionLoop(abc, validKeys, iteration) {
    this._setActions(validKeys);
    this.screen.render();

    while (true) {
      const k = await this._waitForKey(validKeys);

      switch (k) {
        case 'a':
          return { action: 'approve' };

        case 'r':
          return { action: 'reject' };

        case 'q':
          return { action: 'quit' };

        case 'd': {
          const directive = await this._showDirectiveModal();
          if (directive) return { action: 'direct', directive };
          // Cancelled — fall back to action bar
          this._setActions(validKeys);
          this.screen.render();
          break;
        }

        case 'l':
          await this._handleListen(abc);
          this._setActions(validKeys);
          this.screen.render();
          break;

        case 'b':
          await this._handleBranch(abc, iteration);
          break;

        case '+': {
          const n = await this._showExtendPrompt();
          if (n) return { action: 'approve', extend: n };
          this._setActions(validKeys);
          this.screen.render();
          break;
        }

        case '-':
          return { action: 'approve', extend: -1 };
      }
    }
  }

  // ═════════════════════════════════════════════════════════════════
  //  Interface methods (matching GatePrompts contract exactly)
  // ═════════════════════════════════════════════════════════════════

  async promptDecision(decision, context) {
    this._ensureScreen();
    const { iteration, maxIterations, workHistory, currentAbc, lastQaResult } = context;

    this._state = {
      header: { genre: this.genre, iteration, maxIterations, agent: decision.agent, mode: 'DECISION' },
      decision,
      qa: lastQaResult,
      wh: workHistory,
      keys: ['a', 'd', 'l', 'b', 'q', '+', '-'],
    };

    this._updateHeader(this._state.header);
    this._updateDecision(decision);
    this._updateScores(lastQaResult);
    this._updateWorkHistory(workHistory);

    return this._actionLoop(currentAbc, this._state.keys, iteration);
  }

  async promptDone(finalAbc, qaResult, iterations) {
    this._ensureScreen();
    if (qaResult?.scores) this.scoreHistory.push(qaResult.scores);

    this._state = {
      header: { genre: this.genre, iteration: iterations, maxIterations: iterations, mode: '{green-fg}DONE{/}' },
      decision: { action: 'done', reasoning: 'Orchestrator decided the composition meets quality standards.' },
      qa: qaResult,
      keys: ['a', 'r', 'd', 'l', 'b'],
    };

    this._updateHeader(this._state.header);
    this._updateDecision(this._state.decision);
    this._updateScores(qaResult);

    return this._actionLoop(finalAbc, this._state.keys, iterations);
  }

  async promptAgentOutput(newAbc, qaResult, iteration, context) {
    this._ensureScreen();
    if (qaResult?.scores) this.scoreHistory.push(qaResult.scores);
    const { decision, workHistory, maxIterations } = context;

    this._state = {
      header: { genre: this.genre, iteration, maxIterations, agent: decision?.agent, mode: 'REVIEW' },
      decision,
      qa: qaResult,
      wh: workHistory,
      keys: ['a', 'r', 'd', 'l', 'b', 'q', '+', '-'],
    };

    this._updateHeader(this._state.header);
    this._updateDecision(decision);
    this._updateScores(qaResult);
    this._updateWorkHistory(workHistory);

    return this._actionLoop(newAbc, this._state.keys, iteration);
  }

  async promptMaxIterations(currentAbc, qaResult, iterations) {
    this._ensureScreen();

    this._state = {
      header: { genre: this.genre, iteration: iterations, maxIterations: iterations, mode: '{red-fg}MAX ITERATIONS{/}' },
      decision: { action: 'max_reached', reasoning: `Hit ${iterations} iterations. Accept current result or extend.` },
      qa: qaResult,
      keys: ['a', 'd', 'l', 'b', '+'],
    };

    this._updateHeader(this._state.header);
    this._updateDecision(this._state.decision);
    this._updateScores(qaResult);

    const result = await this._actionLoop(currentAbc, this._state.keys, iterations);
    // At max iterations, a 'direct' action should also include an extend
    if (result.action === 'direct' && !result.extend) {
      result.extend = 3;
    }
    return result;
  }


  /**
   * Stream partial orchestrator decision fields to the dashboard in real time.
   * Called on each partialOutputStream emission — updates panels incrementally.
   *
   * @param {Object} partial  - Partial decision (fields arrive incrementally)
   * @param {Object} context  - {iteration, maxIterations, workHistory, currentAbc, lastQaResult}
   */
  updateStreamingDecision(partial, context) {
    this._ensureScreen();
    const { iteration, maxIterations, lastQaResult, workHistory } = context;
      genre: this.genre,
      iteration,
      maxIterations,
      agent: partial.agent || '...',
      mode: '{cyan-fg}STREAMING{/}',
    });

    this._updateDecision(partial);
    if (lastQaResult) this._updateScores(lastQaResult);
    if (workHistory) this._updateWorkHistory(workHistory);
    // Clear action bar during streaming — no user input expected yet
    this.w.actions.setContent('{gray-fg}  ⏳ Receiving orchestrator decision…{/}');
    this.screen.render();
  }

  close() {
    this._destroyScreen();
  }
}
