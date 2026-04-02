/**
 * Template forms for the pipeline composition system.
 * Each form outputs a structure file — partial ABC with pre-written
 * structural voices and content slots for the LLM to fill.
 *
 * @module template-forms
 */

// ── Pneuma presets (temporal humanization for abc2midi fork) ──────────

export const PNEUMA_PRESETS = {
  // No humanization — grid-locked machine precision
  none: '',
  // Subtle — barely perceptible, like a good session player
  subtle: '%%PNEUMA humanize 8\n%%PNEUMA heartbeat 0.02\n%%PNEUMA drift 0.008\n%%ARTICULATE auto\n%%BREATH auto 20\n%%BREATH bars 8',
  // Organic — clearly human, breathing feel
  organic: '%%PNEUMA humanize 15\n%%PNEUMA heartbeat 0.04\n%%PNEUMA drift 0.015\n%%ARTICULATE auto\n%%BREATH auto 30\n%%BREATH bars 4\n%%GRAVITY phrase 4\n%%GRAVITY weight 1.1 1.0 0.95 0.9',
  // Drunk — heavily swung, stumbling, expressive
  drunk: '%%PNEUMA humanize 25\n%%PNEUMA heartbeat 0.07\n%%PNEUMA drift 0.03\n%%ARTICULATE auto\n%%BREATH auto 40\n%%BREATH bars 2\n%%GRAVITY phrase 4\n%%GRAVITY weight 1.2 0.85 0.9 1.1\n%%GRAVITY agogic 1.1 0.85 0.95 1.1',
  // Ritual — slow breathing cycle, meditative drift
  ritual: '%%PNEUMA humanize 10\n%%PNEUMA heartbeat 0.06\n%%PNEUMA drift 0.01\n%%ARTICULATE auto\n%%BREATH auto 35\n%%BREATH bars 4\n%%GRAVITY phrase 4\n%%GRAVITY weight 1.15 1.0 0.9 0.85\n%%GRAVITY agogic 1.05 1.0 1.0 0.95',
  // Mechanical — tiny jitter only, no breathing (industrial feel)
  mechanical: '%%PNEUMA humanize 4\n%%PNEUMA drift 0.003',
};

// ── Curated drummap timbral arcs ─────────────────────────────────────

export const DRUMMAP_ARCS = {
  'exploration': [
    // Standard → Exotic → Return
    { C: 36, D: 38, E: 42, label: 'Standard kit (kick/snare/hat)' },
    { C: 45, D: 47, E: 48, label: 'Toms (low/mid/high)' },
    { C: 49, D: 51, E: 53, label: 'Cymbals (crash/ride/bell)' },
    { C: 56, D: 61, E: 63, label: 'Latin (cowbell/bongo/conga)' },
    { C: 37, D: 39, E: 54, label: 'Clicks (rim/clap/tambourine)' },
    { C: 35, D: 41, E: 43, label: 'Deep (kick2/tom/tom)' },
    { C: 51, D: 53, E: 56, label: 'Metallic (ride/bell/cowbell)' },
    { C: 60, D: 62, E: 76, label: 'Electronic (hi bongo/mute conga/woodblock)' },
    { C: 42, D: 38, E: 36, label: 'Reversed standard (hat/snare/kick)' },
    { C: 37, D: 49, E: 61, label: 'Sparse (rim/crash/bongo)' },
    { C: 38, D: 51, E: 62, label: 'Bright (snare/ride/mute conga)' },
    { C: 36, D: 38, E: 42, label: 'Return to standard' },
  ],
  'sparse-to-dense': [
    { C: 36, D: 36, E: 36, label: 'Kick only' },
    { C: 36, D: 37, E: 37, label: 'Kick + rim' },
    { C: 36, D: 38, E: 37, label: 'Kick + snare + rim' },
    { C: 36, D: 38, E: 42, label: 'Standard kit' },
    { C: 36, D: 38, E: 42, label: 'Standard (lock in)' },
    { C: 36, D: 38, E: 42, label: 'Standard (lock in)' },
    { C: 36, D: 38, E: 46, label: 'Open hat replaces closed' },
    { C: 36, D: 38, E: 49, label: 'Crash replaces hat' },
    { C: 36, D: 45, E: 49, label: 'Tom replaces snare + crash' },
    { C: 36, D: 47, E: 51, label: 'Full toms + ride' },
    { C: 49, D: 51, E: 53, label: 'All cymbals' },
    { C: 36, D: 38, E: 42, label: 'Return to standard' },
  ],
  'skin-metal-wood': [
    { C: 45, D: 47, E: 48, label: 'Skin: toms' },
    { C: 35, D: 41, E: 43, label: 'Skin: deep toms' },
    { C: 38, D: 40, E: 37, label: 'Skin: snares + rim' },
    { C: 49, D: 51, E: 53, label: 'Metal: cymbals' },
    { C: 42, D: 44, E: 46, label: 'Metal: hi-hats' },
    { C: 56, D: 54, E: 52, label: 'Metal: bells' },
    { C: 76, D: 77, E: 75, label: 'Wood: claves/sticks' },
    { C: 60, D: 61, E: 62, label: 'Wood: bongos' },
    { C: 63, D: 64, E: 65, label: 'Wood: congas' },
    { C: 36, D: 38, E: 42, label: 'Return: standard' },
    { C: 45, D: 51, E: 76, label: 'Mix: skin/metal/wood' },
    { C: 36, D: 38, E: 42, label: 'Final: standard' },
  ],
  'decay': [
    { C: 49, D: 57, E: 55, label: 'Long resonance: crashes/chinas' },
    { C: 51, D: 53, E: 52, label: 'Medium resonance: rides/bells' },
    { C: 46, D: 44, E: 42, label: 'Short resonance: hi-hats' },
    { C: 45, D: 47, E: 48, label: 'Medium decay: toms' },
    { C: 38, D: 40, E: 37, label: 'Short decay: snares' },
    { C: 36, D: 35, E: 41, label: 'Tight: kicks' },
    { C: 37, D: 39, E: 56, label: 'Dead: rim/clap/cowbell' },
    { C: 76, D: 77, E: 75, label: 'Deadest: woodblocks' },
    { C: 37, D: 39, E: 76, label: 'Clicks only' },
    { C: 36, D: 37, E: 39, label: 'Sparse clicks' },
    { C: 42, D: 38, E: 36, label: 'Rebuilding' },
    { C: 49, D: 51, E: 53, label: 'Full resonance return' },
  ],
};

// ── Voice presets (GM program numbers) ───────────────────────────────

const VOICE_PRESETS = {
  medieval: { lead: 69, harmony: 52, pad: 19, bass: 39 },
  orchestral: { lead: 40, harmony: 48, pad: 89, bass: 43 },
  electronic: { lead: 81, harmony: 89, pad: 97, bass: 87 },
  chamber: { lead: 73, harmony: 68, pad: 11, bass: 42 },
  industrial: { lead: 62, harmony: 97, pad: 89, bass: 87 },
  baroque: { lead: 6, harmony: 19, pad: 52, bass: 46 },
};

// ── Ensemble presets (inter-voice timing) ────────────────────────────

export const ENSEMBLE_PRESETS = {
  none: '',
  chamber: '%%ENSEMBLE voice 1 +5\n%%ENSEMBLE voice 2 -3\n%%ENSEMBLE voice 3 0\n%%ENSEMBLE voice 4 +2\n%%ENSEMBLE jitter 3',
  orchestral: '%%ENSEMBLE voice 1 +8\n%%ENSEMBLE voice 2 +3\n%%ENSEMBLE voice 3 -5\n%%ENSEMBLE voice 4 +6\n%%ENSEMBLE jitter 5',
  jazz: '%%ENSEMBLE voice 1 +12\n%%ENSEMBLE voice 2 -8\n%%ENSEMBLE voice 3 +4\n%%ENSEMBLE voice 4 0\n%%ENSEMBLE jitter 8',
  tight: '%%ENSEMBLE voice 1 +2\n%%ENSEMBLE voice 2 -1\n%%ENSEMBLE voice 3 0\n%%ENSEMBLE voice 4 +1\n%%ENSEMBLE jitter 1',
  diaspora: '%%ENSEMBLE voice 1 +15\n%%ENSEMBLE voice 2 -10\n%%ENSEMBLE voice 3 +8\n%%ENSEMBLE voice 4 -6\n%%ENSEMBLE jitter 10',
};

// ── Spatial presets (physical distance between voice groups) ─────────

export const SPATIAL_PRESETS = {
  none: '',
  room: '%%SPATIAL group A voices 1,2\n%%SPATIAL group B voices 3,4\n%%SPATIAL delay A B 80',
  hall: '%%SPATIAL group A voices 1,2\n%%SPATIAL group B voices 3,4\n%%SPATIAL delay A B 200',
  cathedral: '%%SPATIAL group A voices 1\n%%SPATIAL group B voices 2,3\n%%SPATIAL group C voices 4\n%%SPATIAL delay A B 300\n%%SPATIAL delay A C 500\n%%SPATIAL delay B C 200',
};

// ── Transform presets (cross-voice algorithmic transformation) ───────

export const TRANSFORM_PRESETS = {
  none: '',
  // V:3 plays V:1 in retrograde, V:4 plays V:1 inverted
  mirror: '[V:3]\n%%TRANSFORM source 1\n%%TRANSFORM retrograde\n[V:4]\n%%TRANSFORM source 1\n%%TRANSFORM invert',
  // V:3 plays V:1 fragmented at 40%, V:4 plays V:1 pitch-shifted up a 5th
  fragment: '[V:3]\n%%TRANSFORM source 1\n%%TRANSFORM fragment 0.4\n[V:4]\n%%TRANSFORM source 1\n%%TRANSFORM pitchshift 7',
  // V:3 is retrograde inversion of V:1, V:4 is time-stretched fragmented V:2
  complex: '[V:3]\n%%TRANSFORM source 1\n%%TRANSFORM retrograde\n%%TRANSFORM invert\n%%TRANSFORM pitchshift -5\n[V:4]\n%%TRANSFORM source 2\n%%TRANSFORM fragment 0.6\n%%TRANSFORM timescale 1.5',
};

// ── Helper: generate drummap lines for an arc config ─────────────────

function drumConfigToABC(config) {
  return `%%MIDI drummap C ${config.C}\n%%MIDI drummap D ${config.D}\n%%MIDI drummap E ${config.E}`;
}

// ── Helper: generate a drum pattern bar ──────────────────────────────

function drumBar(meter, noteLen) {
  // 3+2+2 accent pattern for 7/8
  if (meter === '7/8' && noteLen === '1/8') return 'C3 D E2 D';
  if (meter === '7/8' && noteLen === '1/16') return 'C2D2E2C2D2E2C2';
  // 5/4 pattern
  if (meter === '5/4' && noteLen === '1/8') return 'C3 D E2 D C2 z';
  if (meter === '5/4' && noteLen === '1/16') return 'C2z2D2z2E2z2C2z2D2z2';
  // 11/8
  if (meter === '11/8' && noteLen === '1/8') return 'C3 D E2 D C2 E2';
  // Default 4/4
  if (noteLen === '1/8') return 'C2 z2 D2 E2';
  return 'C2z2D2z2E2z2C2z2';
}

// ── Helper: sustained chord for N units ──────────────────────────────

function sustainedChord(pitches, units) {
  return `[${pitches}]${units}`;
}

// ── Helper: bars of rests ────────────────────────────────────────────

function restBars(count, unitsPerBar) {
  return Array(count).fill(`z${unitsPerBar}`).join(' | ');
}

// ── Helper: compute units per bar ────────────────────────────────────

function unitsPerBar(meter, noteLen) {
  const [num, den] = meter.split('/').map(Number);
  const lenDen = parseInt(noteLen.split('/')[1]);
  return num * (lenDen / den);
}

// ── Helper: instruments instruction for content slots ─────────────────

function instrumentsInstruction(instruments) {
  if (!instruments) return '';
  return `\n% INSTRUMENTS: Use these instruments — ${instruments}. Assign appropriate GM MIDI program numbers.`;
}

// ═══════════════════════════════════════════════════════════════════════
// FORM GENERATORS
// ═══════════════════════════════════════════════════════════════════════

/**
 * RITUAL FORM
 * Based on the processional — ceremonial structure:
 * Invocation → Gathering → Building → Climax → Dissolution → Silence
 */
export function generateRitualForm({
  key = 'Ddor', meter = '7/8', noteLen = '1/8', tempo = 144,
  bars = 96, voices = 'medieval', drumarc = 'exploration',
  pneuma = 'ritual', instruments = null,
  ensemble = 'chamber', spatial = 'none', transform = 'none',
} = {}) {
  const upb = unitsPerBar(meter, noteLen);
  const preset = VOICE_PRESETS[voices] || VOICE_PRESETS.medieval;
  const arc = DRUMMAP_ARCS[drumarc] || DRUMMAP_ARCS.exploration;
  const barsPerPhase = Math.floor(bars / 6);
  const pattern = drumBar(meter, noteLen);

  const pneumaDirectives = PNEUMA_PRESETS[pneuma] || '';
  const ensembleDirectives = ENSEMBLE_PRESETS[ensemble] || '';
  const spatialDirectives = SPATIAL_PRESETS[spatial] || '';
  const transformDirectives = TRANSFORM_PRESETS[transform] || '';

  // Build voice declarations from instruments list or preset
  const instrumentList = instruments ? instruments.split(',').map(s => s.trim()) : null;
  const numVoices = instrumentList ? instrumentList.length : 5;

  let voiceDecls = '';
  if (instrumentList) {
    for (let i = 0; i < instrumentList.length; i++) {
      const name = instrumentList[i];
      const vid = i + 1;
      const isDrum = /drum|percussion|taiko|tabla|kit/i.test(name);
      if (isDrum) {
        voiceDecls += `V:${vid} name="${name}" clef=perc\n%%MIDI channel 10\n`;
      } else {
        const clef = /bass|contrabass|sub|cello|tuba/i.test(name) ? 'bass' : 'treble';
        voiceDecls += `V:${vid} name="${name}" clef=${clef}\n`;
      }
    }
  } else {
    voiceDecls = `V:1 name="Lead" clef=treble\n%%MIDI program ${preset.lead}\n`;
    voiceDecls += `V:2 name="Harmony" clef=treble\n%%MIDI program ${preset.harmony}\n`;
    voiceDecls += `V:3 name="Bass" clef=bass\n%%MIDI program ${preset.bass}\n`;
    voiceDecls += `V:4 name="Pad" clef=treble\n%%MIDI program ${preset.pad}\n`;
    voiceDecls += `V:5 name="Drums" clef=perc\n%%MIDI channel 10\n`;
  }

  let abc = `X:1
T:Ritual Form — Structure File
C:Pipeline Template (Conductor fills content slots)
M:${meter}
L:${noteLen}
Q:1/4=${tempo}
K:${key}
${pneumaDirectives ? pneumaDirectives + '\n' : ''}${ensembleDirectives ? ensembleDirectives + '\n' : ''}${spatialDirectives ? spatialDirectives + '\n' : ''}${instruments ? `% INSTRUMENTS: ${instruments}\n` : ''}${voiceDecls}
`;

  const root = key.replace(/min|maj|dor|lyd|mix|phr|loc/i, '').replace(/m$/, '');

  // Phase descriptions — what each voice does in each phase
  const phaseNames = ['INVOCATION', 'GATHERING', 'BUILDING', 'CLIMAX', 'DISSOLUTION', 'SILENCE'];
  const phaseDescs = [
    'Drone alone. Single strike, then silence. The ritual space opens.',
    'Lead voices enter. Pure modal. The procession begins.',
    'All voices present. Density increases. First chromatic notes appear.',
    'Maximum density. All voices at highest intensity. fff.',
    'Voices leave in reverse order. Thinning texture.',
    'Only the drone. Two strikes. Then nothing. The ritual is complete.',
  ];

  // For each phase, define which voices are active (by index, 0-based)
  // Phase 0: only last voice (drone/bass role)
  // Phase 1: first voice + last voice
  // Phase 2+: all voices
  function voiceActiveInPhase(vIdx, phase) {
    if (phase === 0) return false; // all silent except pre-written drone
    if (phase === 1) return vIdx === 0; // only first voice gets content slot
    if (phase === 5) return false; // silence phase — all content slots are silence
    return true; // phases 2-4: all voices active
  }

  // Generate 6 phases
  for (let phase = 0; phase < 6; phase++) {
    const phaseStart = phase * barsPerPhase + 1;
    const phaseEnd = phase === 5 ? bars : (phase + 1) * barsPerPhase;
    const phaseBars = phase === 5 ? (bars - barsPerPhase * 5) : barsPerPhase;

    abc += `% =====================================================================\n`;
    abc += `% PHASE ${phase + 1} — ${phaseNames[phase]} (bars ${phaseStart}-${phaseEnd})\n`;
    abc += `% ${phaseDescs[phase]}\n`;
    abc += `% =====================================================================\n`;

    for (let v = 0; v < numVoices; v++) {
      const vid = v + 1;
      const name = instrumentList ? instrumentList[v] : ['Lead', 'Harmony', 'Bass', 'Pad', 'Drums'][v] || `Voice${vid}`;
      const isDrum = /drum|percussion|taiko|tabla|kit/i.test(name);

      abc += `[V:${vid}]\n`;

      if (phase === 0) {
        // Phase I: silence for all voices
        abc += `% CONTENT SLOT: V${vid} bars ${phaseStart}-${phaseEnd} — SILENCE (${name} has not entered)\n`;
        abc += restBars(phaseBars, upb) + ' |\n';
      } else if (phase === 5) {
        // Phase VI: silence for all
        abc += restBars(phaseBars, upb) + ' |\n';
      } else if (!voiceActiveInPhase(v, phase)) {
        // Voice not yet active
        abc += restBars(phaseBars, upb) + ' |\n';
      } else if (isDrum && phase >= 2) {
        // Pre-written drums with drummap arc
        abc += `% PRE-WRITTEN: ${name} pattern\n`;
        const arcStart = Math.min(phase, arc.length - 1);
        abc += `${drumConfigToABC(arc[arcStart])}\n`;
        for (let i = 0; i < phaseBars; i++) {
          if (i > 0 && i % 4 === 0 && arcStart + Math.floor(i / 4) < arc.length) {
            abc += `\n${drumConfigToABC(arc[arcStart + Math.floor(i / 4)])}\n`;
          }
          abc += (phase === 3 ? `!ff!` : '') + `${pattern} | `;
        }
        abc += '\n';
      } else {
        // Content slot for the LLM to fill
        let instruction;
        if (phase === 1) instruction = `${name} enters. Modal, stepwise, breathing. Key: ${key}.`;
        else if (phase === 2) instruction = `${name} develops. Wider range. Ornaments. mf.`;
        else if (phase === 3) instruction = `${name} at peak intensity. Widest range. fff.`;
        else if (phase === 4) instruction = `${name} fragments. Increasing rests. pp. Dissolving.`;
        else instruction = `${name} content.`;

        abc += `% CONTENT SLOT: V${vid} bars ${phaseStart}-${phaseEnd} — ${instruction}\n`;
        abc += restBars(phaseBars, upb) + ' |\n';
      }
    }
  }

  return abc;
}

/**
 * STACK OVERFLOW FORM
 * Push phase (accumulate voices) → Crash point → Unwind (reverse)
 */
export function generateStackOverflowForm({
  key = 'Dmin', meter = '7/8', noteLen = '1/8', tempo = 160,
  pushBars = 32, crashBar = 33, unwindBars = 16,
  voices = 'electronic', drumarc = 'sparse-to-dense',
  pneuma = 'mechanical', instruments = null,
  ensemble = 'tight', spatial = 'none', transform = 'none',
} = {}) {
  const upb = unitsPerBar(meter, noteLen);
  const preset = VOICE_PRESETS[voices] || VOICE_PRESETS.electronic;
  const totalBars = pushBars + 4 + unwindBars; // 4 bars for crash
  const barsPerLayer = Math.floor(pushBars / 4);
  const pneumaDirectives = PNEUMA_PRESETS[pneuma] || '';
  const ensembleDirectives = ENSEMBLE_PRESETS[ensemble] || '';
  const spatialDirectives = SPATIAL_PRESETS[spatial] || '';

  let abc = `X:1
T:Stack Overflow Form — Structure File
C:Pipeline Template
M:${meter}
L:${noteLen}
Q:1/4=${tempo}
K:${key}
${pneumaDirectives ? pneumaDirectives + '\n' : ''}${ensembleDirectives ? ensembleDirectives + '\n' : ''}${spatialDirectives ? spatialDirectives + '\n' : ''}${instruments ? `% INSTRUMENTS: ${instruments}\n` : ''}V:1 name="Layer1" clef=treble
%%MIDI program ${preset.lead}
V:2 name="Layer2" clef=treble
%%MIDI program ${preset.harmony}
V:3 name="Layer3" clef=bass
%%MIDI program ${preset.bass}
V:4 name="Layer4" clef=treble
%%MIDI program ${preset.pad}
V:5 name="Drums" clef=perc
%%MIDI channel 10
%%MIDI drummap C 36
%%MIDI drummap D 38
%%MIDI drummap E 42
`;

  // Push phase: voices accumulate
  abc += `% =====================================================================
% PUSH PHASE (bars 1-${pushBars}) — voices accumulate, tempo may increase
% Each layer enters ${barsPerLayer} bars apart.
% =====================================================================
`;
  for (let v = 1; v <= 4; v++) {
    const entryBar = (v - 1) * barsPerLayer + 1;
    const silentBars = Math.max(0, (v - 1) * barsPerLayer);
    abc += `[V:${v}]\n`;
    if (silentBars > 0) abc += `${restBars(silentBars, upb)} |\n`;
    abc += `% CONTENT SLOT: V${v} bars ${entryBar}-${pushBars} — Layer ${v} enters. Builds density.\n`;
    abc += `${restBars(pushBars - silentBars, upb)} |\n`;
  }
  // Drums: sparse at start, dense at end
  const pattern = drumBar(meter, noteLen);
  abc += `[V:5]\n`;
  for (let i = 0; i < pushBars; i++) {
    if (i < barsPerLayer) abc += `C${Math.floor(upb/2)} z${upb - Math.floor(upb/2)} | `;
    else if (i < barsPerLayer * 2) abc += `C3 z D z${upb - 5} | `;
    else abc += `${pattern} | `;
  }

  // Crash point
  abc += `\n% =====================================================================
% CRASH POINT (bars ${crashBar}-${crashBar + 3}) — meter breaks, register inverts
% =====================================================================
`;
  for (let v = 1; v <= 4; v++) {
    abc += `[V:${v}]\n% CONTENT SLOT: V${v} CRASH — 4 bars of maximum chaos. Meter disruption.\n`;
    abc += `${restBars(4, upb)} |\n`;
  }
  abc += `[V:5]\n!fff!`;
  for (let i = 0; i < 4; i++) abc += `CE CE CE C | `;

  // Unwind phase: voices drop, tempo may decelerate
  abc += `\n% =====================================================================
% UNWIND PHASE (bars ${crashBar + 4}-${totalBars}) — reverse exit, tempo decelerates
% =====================================================================
`;
  for (let v = 1; v <= 4; v++) {
    const exitBar = (4 - v) * Math.floor(unwindBars / 4);
    abc += `[V:${v}]\n% CONTENT SLOT: V${v} UNWIND — exits after ${exitBar} bars. Material from push phase, degraded.\n`;
    abc += `${restBars(unwindBars, upb)} |\n`;
  }
  abc += `[V:5]\n`;
  for (let i = 0; i < unwindBars; i++) {
    if (i < unwindBars / 2) abc += `!mp!C3 z${upb - 3} | `;
    else abc += `z${upb} | `;
  }
  abc += '\n';

  return abc;
}

/**
 * SOURCE TRANSFER FORM
 * Two opposed musical logics gradually contaminate each other.
 * Infiltration density curve: 0 → 1 → 2 → 3+ foreign notes per section.
 */
export function generateSourceTransferForm({
  key = 'Ddor', meter = '5/4', noteLen = '1/8', tempo = 144,
  bars = 96, voices = 'medieval', drumarc = 'exploration',
  sourceA = 'modal chant', sourceB = 'electronic techno',
  pneuma = 'organic', instruments = null,
  ensemble = 'none', spatial = 'none', transform = 'none',
} = {}) {
  const upb = unitsPerBar(meter, noteLen);
  const preset = VOICE_PRESETS[voices] || VOICE_PRESETS.medieval;
  const sections = 6;
  const barsPerSection = Math.floor(bars / sections);
  const root = key.replace(/min|maj|dor|lyd|mix|phr|loc/i, '').replace(/m$/, '');
  const pneumaDirectives = PNEUMA_PRESETS[pneuma] || '';
  const ensembleDirectives = ENSEMBLE_PRESETS[ensemble] || '';
  const spatialDirectives = SPATIAL_PRESETS[spatial] || '';

  let abc = `X:1
T:Source Transfer Form — Structure File
C:Pipeline Template
M:${meter}
L:${noteLen}
Q:1/4=${tempo}
K:${key}
${pneumaDirectives ? pneumaDirectives + '\n' : ''}${ensembleDirectives ? ensembleDirectives + '\n' : ''}${spatialDirectives ? spatialDirectives + '\n' : ''}${instruments ? `% INSTRUMENTS: ${instruments}\n` : ''}% SOURCE A: ${sourceA}
% SOURCE B: ${sourceB}
% Infiltration curve: 0 → 1 → 2 → 3 → full integration → synthesis
V:1 name="Lead" clef=treble
%%MIDI program ${preset.lead}
V:2 name="Harmony" clef=treble
%%MIDI program ${preset.harmony}
V:3 name="Bass" clef=bass
%%MIDI program ${preset.bass}
V:4 name="Pad" clef=treble
%%MIDI program ${preset.pad}
V:5 name="Drums" clef=perc
%%MIDI channel 10
%%MIDI drummap C 36
%%MIDI drummap D 38
%%MIDI drummap E 42
%%MIDI drummap F 51
`;

  const infiltrationNotes = ['0 foreign notes', '1 foreign note (conductor places)', '2 foreign notes', '3+ foreign notes', 'both systems equally present', 'synthesis — new system emerges'];

  for (let s = 0; s < sections; s++) {
    const start = s * barsPerSection + 1;
    const end = (s + 1) * barsPerSection;
    abc += `% =====================================================================
% SECTION ${s + 1} (bars ${start}-${end}) — Infiltration: ${infiltrationNotes[s]}
% ${s < 3 ? `Source A (${sourceA}) dominant` : s < 5 ? 'Both sources present' : 'New synthesis'}
% =====================================================================
`;
    for (let v = 1; v <= 4; v++) {
      abc += `[V:${v}]\n`;
      if (s === 0 && v > 2) {
        abc += `% PRE-WRITTEN: silence — only lead + harmony in section 1\n`;
        abc += `${restBars(barsPerSection, upb)} |\n`;
      } else {
        abc += `% CONTENT SLOT: V${v} section ${s + 1} — ${infiltrationNotes[s]}.\n`;
        abc += `${restBars(barsPerSection, upb)} |\n`;
      }
    }
    // Drums: sparse early, dense later
    abc += `[V:5]\n`;
    if (s < 2) {
      abc += `% PRE-WRITTEN: sparse drums or silence\n`;
      for (let i = 0; i < barsPerSection; i++) {
        abc += (s === 0) ? `z${upb} | ` : `C${Math.floor(upb/2)} z${upb - Math.floor(upb/2)} | `;
      }
    } else {
      const pattern = drumBar(meter, noteLen);
      abc += `% PRE-WRITTEN: drums with timbral arc\n`;
      const arcStart = Math.min(s, DRUMMAP_ARCS[drumarc].length - 1);
      abc += `${drumConfigToABC(DRUMMAP_ARCS[drumarc][arcStart])}\n`;
      for (let i = 0; i < barsPerSection; i++) abc += `${pattern} | `;
    }
    abc += '\n';
  }

  return abc;
}

/**
 * ACCUMULATIVE FORM
 * Voices enter one by one. Nothing that enters ever leaves (until exit phase).
 * Three exit strategies: reverse, selective, collapse.
 */
export function generateAccumulativeForm({
  key = 'Dmin', meter = '7/8', noteLen = '1/8', tempo = 152,
  bars = 64, voices = 'orchestral', drumarc = 'sparse-to-dense',
  exitStrategy = 'reverse', // 'reverse' | 'selective' | 'collapse'
  entryInterval = 8,
  pneuma = 'organic', instruments = null,
  ensemble = 'none', spatial = 'none', transform = 'none',
} = {}) {
  const upb = unitsPerBar(meter, noteLen);
  const preset = VOICE_PRESETS[voices] || VOICE_PRESETS.orchestral;
  const pneumaDirectives = PNEUMA_PRESETS[pneuma] || '';
  const ensembleDirectives = ENSEMBLE_PRESETS[ensemble] || '';
  const spatialDirectives = SPATIAL_PRESETS[spatial] || '';
  const numVoices = 5;
  const accumBars = Math.min(entryInterval * numVoices, bars - 16);
  const exitBars = Math.max(8, Math.floor((bars - accumBars) / 3));
  const peakBars = Math.max(8, bars - accumBars - exitBars);
  const root = key.replace(/min|maj|dor|lyd|mix|phr|loc/i, '').replace(/m$/, '');

  let abc = `X:1
T:Accumulative Form — Structure File (exit: ${exitStrategy})
C:Pipeline Template
M:${meter}
L:${noteLen}
Q:1/4=${tempo}
K:${key}
${pneumaDirectives ? pneumaDirectives + '\n' : ''}${ensembleDirectives ? ensembleDirectives + '\n' : ''}${spatialDirectives ? spatialDirectives + '\n' : ''}${instruments ? `% INSTRUMENTS: ${instruments}\n` : ''}V:1 name="Voice1" clef=treble
%%MIDI program ${preset.lead}
V:2 name="Voice2" clef=treble
%%MIDI program ${preset.harmony}
V:3 name="Voice3" clef=bass
%%MIDI program ${preset.bass}
V:4 name="Voice4" clef=treble
%%MIDI program ${preset.pad}
V:5 name="Drums" clef=perc
%%MIDI channel 10
%%MIDI drummap C 36
%%MIDI drummap D 38
%%MIDI drummap E 42
%%MIDI drummap F 51
`;

  // Accumulation phase
  abc += `% =====================================================================
% ACCUMULATION PHASE (bars 1-${accumBars})
% Each voice enters ${entryInterval} bars apart. Nothing leaves.
% =====================================================================
`;
  for (let v = 1; v <= numVoices; v++) {
    const entryBar = (v - 1) * entryInterval + 1;
    const silentBars = (v - 1) * entryInterval;
    abc += `[V:${v}]\n`;
    if (silentBars > 0) {
      abc += `% PRE-WRITTEN: ${silentBars} bars silence before entry\n`;
      abc += `${restBars(silentBars, upb)} |\n`;
    }
    abc += `% CONTENT SLOT: V${v} enters bar ${entryBar}. Continuous from here through peak.\n`;
    abc += `${restBars(accumBars - silentBars, upb)} |\n`;
  }

  // Peak phase: all voices active
  const peakStart = accumBars + 1;
  const peakEnd = accumBars + peakBars;
  abc += `% =====================================================================
% PEAK PHASE (bars ${peakStart}-${peakEnd})
% All voices active simultaneously. Maximum density and development.
% =====================================================================
`;
  for (let v = 1; v <= numVoices; v++) {
    abc += `[V:${v}]\n% CONTENT SLOT: V${v} peak — maximum intensity and development.\n`;
    abc += `${restBars(peakBars, upb)} |\n`;
  }

  // Exit phase
  const exitStart = peakEnd + 1;
  abc += `% =====================================================================
% EXIT PHASE (bars ${exitStart}-${bars}) — strategy: ${exitStrategy}
% =====================================================================
`;
  for (let v = 1; v <= numVoices; v++) {
    abc += `[V:${v}]\n`;
    if (exitStrategy === 'reverse') {
      const exitAfter = (numVoices - v) * Math.floor(exitBars / numVoices);
      abc += `% CONTENT SLOT: V${v} exits after ${exitAfter} bars (reverse order — last in, first out).\n`;
    } else if (exitStrategy === 'collapse') {
      abc += `% CONTENT SLOT: V${v} — all voices stop simultaneously at bar ${bars}.\n`;
    } else {
      abc += `% CONTENT SLOT: V${v} exit — conductor decides when this voice drops.\n`;
    }
    abc += `${restBars(exitBars, upb)} |\n`;
  }

  return abc;
}

/** Map of form names to generators */
export const FORMS = {
  ritual: generateRitualForm,
  'stack-overflow': generateStackOverflowForm,
  'source-transfer': generateSourceTransferForm,
  accumulative: generateAccumulativeForm,
};

export const FORM_NAMES = Object.keys(FORMS);
