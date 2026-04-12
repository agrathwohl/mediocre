/**
 * Evolve command v2 — evolutionary selection with segment-level scoring.
 * Renders N variations with different seeds, converts each to ABC via midi2abc,
 * splits into segments, scores each segment with QA (local LLM or Anthropic),
 * selects the best render per segment, and assembles via MIRROR.
 *
 * Requires abc2midi-llm fork with -seed support and midi2abc.
 *
 * @module evolve
 */

import fs from 'fs';
import path from 'path';
import { execa } from 'execa';
import { generateText } from 'ai';
import abcParser from 'abc-parser';
const { Parser, Scanner, AbcFormatter } = abcParser;
import { getAnthropic, getModel, getAbc2midiBinary } from '../utils/llm-client.js';
import { resolveMirrors } from '../utils/abc-mirror.js';
import { cleanupAbc } from '../utils/abc-cleanup.js';
import { readFragmap, applyFragmentMap, assembleFromFragmaps } from '../utils/fragmap.js';

/**
 * Get midi2abc binary path — same directory as abc2midi.
 */
function getMidi2abcBinary() {
  const abc2midi = getAbc2midiBinary();
  const dir = path.dirname(abc2midi);
  const candidate = path.join(dir, 'midi2abc');
  if (fs.existsSync(candidate)) return candidate;
  return 'midi2abc'; // fallback to PATH
}

/**
 * Split ABC notation into bar-based segments using abc-parser for proper parsing.
 * Each segment contains bars for ALL voices, extracted from the parsed AST.
 * @param {string} abc - ABC notation
 * @param {number} barsPerSegment - Bars per segment
 * @returns {{ segments: Object[], voiceIds: string[], header: string }}
 */
function splitIntoSegments(abc, barsPerSegment) {
  // Parse with abc-parser — use it for voice/bar extraction
  let ast;
  try {
    const scanner = new Scanner(abc);
    const tokens = scanner.scanTokens();
    const parser = new Parser(tokens);
    ast = parser.parse();
    if (!ast.tune || !ast.tune[0]) throw new Error('no tune');
  } catch {
    return splitIntoSegmentsRaw(abc, barsPerSegment);
  }

  // Parser succeeded — use AST to detect voice IDs from the sequence
  const tune = ast.tune[0];
  const seq = tune.tune_body?.sequence || [];
  const parserVoiceIds = [];

  for (const item of seq) {
    if (!Array.isArray(item)) continue;
    const vSwitch = item.find(t => t.key?.lexeme === 'V:');
    if (vSwitch) {
      const vid = vSwitch.value?.[0]?.lexeme;
      if (vid && !parserVoiceIds.includes(vid)) parserVoiceIds.push(vid);
    }
  }

  // Use raw text splitter for the actual bar extraction (more reliable for midi2abc output)
  // but with the parser-verified voice IDs
  const raw = splitIntoSegmentsRaw(abc, barsPerSegment);
  if (parserVoiceIds.length > 0) raw.voiceIds = parserVoiceIds;
  return raw;
}

/**
 * Fallback raw text splitter when abc-parser can't handle the input.
 */
function splitIntoSegmentsRaw(abc, barsPerSegment) {
  const lines = abc.split('\n');
  const voiceBars = new Map();
  const voiceIds = [];
  let currentVoice = null;

  for (const line of lines) {
    const t = line.trim();
    const vMatch = t.match(/^\[?V:(\S+?)[\]\s]/) || t.match(/^V:(\S+)/);
    if (vMatch) {
      currentVoice = vMatch[1];
      if (!voiceBars.has(currentVoice)) { voiceBars.set(currentVoice, []); voiceIds.push(currentVoice); }
      continue;
    }
    if (!currentVoice || !t || /^[XTMLQKCZW]:/.test(t) || t.startsWith('%%') || t.startsWith('%')) continue;
    const bars = t.split('|').map(b => b.replace(/\\/g, '').trim()).filter(b => b);
    for (const bar of bars) voiceBars.get(currentVoice).push(bar);
  }

  const maxBars = Math.max(...[...voiceBars.values()].map(b => b.length), 0);
  const numSegments = Math.ceil(maxBars / barsPerSegment);
  const segments = [];
  for (let seg = 0; seg < numSegments; seg++) {
    const start = seg * barsPerSegment;
    const segVoiceBars = new Map();
    for (const [vid, bars] of voiceBars) segVoiceBars.set(vid, bars.slice(start, start + barsPerSegment));
    let segAbc = '';
    for (const vid of voiceIds) {
      const bars = segVoiceBars.get(vid) || [];
      if (bars.length > 0) segAbc += `[V:${vid}]\n${bars.join(' | ')} |\n`;
    }
    segments.push({ voiceBars: segVoiceBars, abc: segAbc });
  }

  // Extract header
  const headerLines = [];
  for (const l of lines) { headerLines.push(l); if (l.trim().startsWith('K:')) break; }

  return { segments, voiceIds, header: headerLines.join('\n') };
}

/**
 * Score a segment using the LLM as QA evaluator.
 * @param {string} segmentAbc - ABC text of the segment
 * @param {number} segIndex - Segment index
 * @param {number} seed - Seed number
 * @param {number} segmentBars - Bars per segment
 * @param {string} [prevWinnerAbc] - ABC of the previously selected winning segment (for continuity)
 * @returns {Promise<number>} Score 0-100
 */
async function scoreSegment(segmentAbc, segIndex, seed, segmentBars, prevWinnerAbc = null) {
  const provider = getAnthropic();
  const modelId = getModel('claude-sonnet-4-6');

  let context = '';
  if (prevWinnerAbc) {
    context = `\nPREVIOUS WINNING SEGMENT (for continuity — score higher if this segment flows naturally from it):\n${prevWinnerAbc}\n\n`;
  }

  try {
    const { text } = await generateText({
      model: provider(modelId),
      system: 'You are a music QA expert. Respond with ONLY a JSON object: {"score": 0-100, "reason": "one sentence"}. Score based on: melodic interest, rhythmic variety, harmonic richness, voice independence, and CONTINUITY with the previous segment if provided. Higher = more musically interesting AND coherent with what came before.',
      prompt: `Score this segment (bars ${segIndex * segmentBars + 1}-${(segIndex + 1) * segmentBars}, seed ${seed}):${context}\n${segmentAbc}`,
      maxTokens: 200,
      temperature: 0.3,
    });

    const start = text.indexOf('{');
    const end = text.lastIndexOf('}') + 1;
    if (start >= 0 && end > start) {
      const parsed = JSON.parse(text.slice(start, end));
      return parsed.score || 0;
    }
    return 0;
  } catch {
    return 0;
  }
}

/**
 * Main evolve pipeline v2 — segment-level selection.
 * @param {string} abcFilePath - Source ABC file
 * @param {Object} options - CLI options
 */
export async function evolve(abcFilePath, options = {}) {
  const {
    renders = 20,
    segmentBars = 8,
    output = null,
    keepRenders = false,
    topN = 5,
    skipQa = false,
  } = options;

  const abc2midi = getAbc2midiBinary();
  const midi2abc = getMidi2abcBinary();
  const baseDir = path.dirname(abcFilePath);
  const baseName = path.basename(abcFilePath, '.abc');
  const renderDir = path.join(baseDir, `${baseName}-renders`);

  console.log(`🧬 Evolutionary Selection Pipeline v2`);
  console.log(`   Source: ${abcFilePath}`);
  console.log(`   Renders: ${renders}`);
  console.log(`   Segment size: ${segmentBars} bars`);
  console.log(`   abc2midi: ${abc2midi}`);
  console.log(`   midi2abc: ${midi2abc}`);

  await fs.promises.mkdir(renderDir, { recursive: true });

  // ── Phase 1: Batch render with different seeds + fragment maps ──────
  console.log(`\n📡 Phase 1: Rendering ${renders} variations...`);
  const renderPaths = [];
  const fragmaps = new Map(); // seed → fragmap object
  let hasFragmaps = false;

  for (let seed = 1; seed <= renders; seed++) {
    const midPath = path.join(renderDir, `seed_${seed}.mid`);
    const fragPath = path.join(renderDir, `seed_${seed}.json`);
    try {
      await execa(abc2midi, [abcFilePath, '-o', midPath, '-seed', String(seed), '-fragmap', fragPath], {
        reject: false, timeout: 30000,
      });
      if (fs.existsSync(midPath) && fs.statSync(midPath).size > 0) {
        renderPaths.push({ seed, midPath });
        // Read fragmap if produced
        if (fs.existsSync(fragPath)) {
          try {
            const fm = JSON.parse(await fs.promises.readFile(fragPath, 'utf8'));
            fragmaps.set(seed, fm);
            hasFragmaps = true;
          } catch {}
        }
      }
    } catch {}
    if (seed % 10 === 0 || seed === renders) {
      process.stdout.write(`   ${seed}/${renders}\r`);
    }
  }
  console.log(`   ✓ ${renderPaths.length}/${renders} valid MIDIs, ${fragmaps.size} fragmaps`);

  if (renderPaths.length === 0) {
    console.error('   ✗ No valid renders. Check abc2midi and -seed support.');
    return;
  }

  // ── Phase 2: Build per-seed ABC variants ────────────────────────────
  // If fragmaps exist: apply fragment decisions to SOURCE ABC (lossless)
  // If no fragmaps: fall back to midi2abc round-trip (lossy)
  const sourceAbc = await fs.promises.readFile(abcFilePath, 'utf8');
  const renderAbcs = [];

  if (hasFragmaps) {
    console.log(`\n🧬 Phase 2: Applying ${fragmaps.size} fragment maps to source (lossless)...`);
    for (const [seed, fm] of fragmaps) {
      const variant = applyFragmentMap(sourceAbc, fm);
      const render = renderPaths.find(r => r.seed === seed);
      renderAbcs.push({ seed, content: variant, midPath: render?.midPath });
    }
    // Also include seeds without fragmaps (no fragment decisions = source as-is)
    for (const render of renderPaths) {
      if (!fragmaps.has(render.seed)) {
        renderAbcs.push({ seed: render.seed, content: sourceAbc, midPath: render.midPath });
      }
    }
    console.log(`   ✓ ${renderAbcs.length} lossless variants`);
  } else {
    console.log(`\n🔄 Phase 2: No fragmaps — falling back to midi2abc round-trip (lossy)...`);
    for (const render of renderPaths) {
      const abcPath = render.midPath.replace('.mid', '.abc');
      try {
        await execa(midi2abc, [render.midPath, '-o', abcPath, '-obpl'], {
          reject: false, timeout: 15000,
        });
        if (fs.existsSync(abcPath)) {
          const content = await fs.promises.readFile(abcPath, 'utf8');
          renderAbcs.push({ seed: render.seed, content, midPath: render.midPath });
        }
      } catch {}
    }
    console.log(`   ✓ ${renderAbcs.length} ABC round-trips (lossy)`);
  }

  // ── Phase 3: Split into segments and score ──────────────────────────
  console.log(`\n🔬 Phase 3: Segmenting and scoring...`);

  // Split all renders into voice-aware segments
  const segmentMatrix = []; // { seed, segIndex, abc, voiceBars, score }
  let globalVoiceIds = [];

  for (const render of renderAbcs) {
    const { segments, voiceIds } = splitIntoSegments(render.content, segmentBars);
    if (voiceIds.length > globalVoiceIds.length) globalVoiceIds = voiceIds;
    for (let i = 0; i < segments.length; i++) {
      segmentMatrix.push({
        seed: render.seed,
        segIndex: i,
        abc: segments[i].abc,
        voiceBars: segments[i].voiceBars,
        score: 0,
        midPath: render.midPath,
      });
    }
  }

  const numSegments = segmentMatrix.length > 0
    ? Math.max(...segmentMatrix.map(s => s.segIndex)) + 1
    : 0;
  console.log(`   ${numSegments} segments × ${renderAbcs.length} renders = ${segmentMatrix.length} total`);
  console.log(`   ${globalVoiceIds.length} voices detected: ${globalVoiceIds.join(', ')}`);

  // Score segments — with continuity context from previous winner
  if (!skipQa && segmentMatrix.length > 0) {
    console.log(`   Scoring segments with QA agent (with continuity)...`);
    let scored = 0;
    let prevWinnerAbc = null;

    // Score segment-by-segment so we can pass the previous winner as context
    for (let seg = 0; seg < numSegments; seg++) {
      const candidates = segmentMatrix.filter(s => s.segIndex === seg);
      for (const entry of candidates) {
        entry.score = await scoreSegment(entry.abc, entry.segIndex, entry.seed, segmentBars, prevWinnerAbc);
        scored++;
        if (scored % 20 === 0 || scored === segmentMatrix.length) {
          process.stdout.write(`   ${scored}/${segmentMatrix.length} scored\r`);
        }
      }
      // Pick this segment's winner and use its ABC as context for next segment
      const segWinner = candidates.sort((a, b) => b.score - a.score)[0];
      if (segWinner) prevWinnerAbc = segWinner.abc;
    }
    console.log(`   ✓ ${scored} segments scored (with continuity)`);
  } else if (skipQa) {
    // Fallback: score by ABC content length (proxy for density)
    for (const entry of segmentMatrix) {
      entry.score = entry.abc.length;
    }
    console.log(`   ✓ Scored by content density (--skip-qa)`);
  }

  // ── Phase 4: Select best render per segment ─────────────────────────
  console.log(`\n🏆 Phase 4: Selecting best segments...`);
  const selections = []; // { segIndex, seed, score }

  for (let seg = 0; seg < numSegments; seg++) {
    const candidates = segmentMatrix
      .filter(s => s.segIndex === seg)
      .sort((a, b) => b.score - a.score);

    if (candidates.length > 0) {
      const winner = candidates[0];
      selections.push({
        segIndex: seg,
        seed: winner.seed,
        score: winner.score,
        abc: winner.abc,
        voiceBars: winner.voiceBars,
      });
      if (seg < topN) {
        console.log(`   Segment ${seg}: seed ${winner.seed} (score ${winner.score})`);
      }
    }
  }

  if (selections.length > topN) {
    console.log(`   ... and ${selections.length - topN} more segments`);
  }

  // ── Phase 5: Segment-level assembly ─────────────────────────────────
  console.log(`\n🔧 Phase 5: Assembling${hasFragmaps ? ' (lossless via fragmaps)' : ''}...`);

  const uniqueSeeds = [...new Set(selections.map(s => s.seed))];
  console.log(`   Seeds used: ${uniqueSeeds.join(', ')}`);

  // Read source for assembly
  const sourceAbcForAssembly = await fs.promises.readFile(abcFilePath, 'utf8');

  let assembled;

  if (hasFragmaps) {
    // LOSSLESS PATH: use fragment maps to apply decisions to source ABC directly
    const fragSelections = selections.map(s => ({
      segStart: s.segIndex * segmentBars + 1,
      segEnd: (s.segIndex + 1) * segmentBars,
      seed: s.seed,
      score: s.score,
    }));
    assembled = assembleFromFragmaps(sourceAbcForAssembly, fragSelections, fragmaps);
    console.log(`   ✓ Lossless assembly via fragment maps`);
  } else {
  // LOSSY FALLBACK: line-by-line bar replacement from midi2abc round-trip
  const sourceParsed = splitIntoSegments(sourceAbcForAssembly, segmentBars);

  // Determine which seed won each segment
  // For the default seed (seed 1 = source as-is), keep source bars.
  // For other seeds, replace with that render's bars.

  // Build a map: renderSeed → parsed segments
  const renderSegmentMap = new Map();
  for (const render of renderAbcs) {
    const parsed = splitIntoSegments(render.content, segmentBars);
    renderSegmentMap.set(render.seed, parsed);
  }

  // Start with a COPY of the source file
  const sourceLines = sourceAbcForAssembly.split('\n');

  // Parse source to find which lines contain bar content per voice
  // We need to know: for voice V, segment S, which LINE in the source has those bars
  // Then we replace JUST those lines

  // Simpler approach: rebuild the file line by line.
  // Non-bar lines (headers, directives, voice declarations, comments) → copy as-is.
  // Bar lines → replace with the winning segment's bars from the winning render.

  assembled = '';
  let currentVoice = null;
  let barIndex = 0; // per-voice bar counter
  const voiceBarCounters = new Map(); // vid → current bar index

  for (const line of sourceLines) {
    const t = line.trim();

    // Track voice switches
    const vm = t.match(/^\[?V:(\S+?)[\]\s]/) || t.match(/^V:(\S+)/);
    if (vm) {
      currentVoice = vm[1];
      if (!voiceBarCounters.has(currentVoice)) voiceBarCounters.set(currentVoice, 0);
      assembled += line + '\n';
      continue;
    }

    // Non-bar lines → copy as-is
    if (!currentVoice || !t || /^[XTMLQKCZW]:/.test(t) || t.startsWith('%%') || t.startsWith('%')) {
      assembled += line + '\n';
      continue;
    }

    // This is a bar content line. Figure out which segment it belongs to.
    const barsInLine = t.split('|').map(b => b.replace(/\\/g, '').trim()).filter(b => b);
    const voiceBarIdx = voiceBarCounters.get(currentVoice);
    const segIdx = Math.floor(voiceBarIdx / segmentBars);

    // Find the winning selection for this segment
    const winner = selections.find(s => s.segIndex === segIdx);

    if (winner && winner.seed !== 1) {
      // Different seed won — get bars from that render
      const renderParsed = renderSegmentMap.get(winner.seed);
      if (renderParsed) {
        const renderSeg = renderParsed.segments[segIdx];
        const renderBars = renderSeg?.voiceBars?.get(currentVoice);
        if (renderBars && renderBars.length > 0) {
          // Replace this line's bars with the render's bars for this range
          const startInSeg = voiceBarIdx % segmentBars;
          const replacementBars = renderBars.slice(startInSeg, startInSeg + barsInLine.length);
          if (replacementBars.length > 0) {
            assembled += replacementBars.join(' | ') + ' |\n';
            voiceBarCounters.set(currentVoice, voiceBarIdx + barsInLine.length);
            continue;
          }
        }
      }
    }

    // Default: keep source line as-is
    assembled += line + '\n';
    voiceBarCounters.set(currentVoice, voiceBarIdx + barsInLine.length);
  }

  // Inject provenance as a comment
  const provenance = `% EVOLVED: segments from ${renders} renders — ${uniqueSeeds.join(', ')}\n` +
    selections.map(s => `%   Seg ${s.segIndex}: seed ${s.seed} (score ${s.score})`).join('\n') + '\n';
  assembled = assembled.replace(/^(K:.*\n)/m, `$1${provenance}`);
  } // end lossy fallback

  // Cleanup — strip non-ASCII (abc2midi chokes on UTF-8) and fix ABC issues
  assembled = assembled.replace(/[^\x00-\x7F]/g, '-');
  const { cleaned } = cleanupAbc(assembled);
  assembled = cleaned;

  // Write output
  const outAbcPath = output || path.join(baseDir, `${baseName}-evolved.abc`);
  await fs.promises.writeFile(outAbcPath, assembled);

  const outMidPath = outAbcPath.replace(/\.abc$/, '.mid');
  try {
    await execa(abc2midi, [outAbcPath, '-o', outMidPath], { reject: false, timeout: 30000 });
    const midSize = fs.existsSync(outMidPath) ? fs.statSync(outMidPath).size : 0;
    console.log(`   Written: ${outAbcPath} (${assembled.length} chars)`);
    console.log(`   MIDI: ${outMidPath} (${midSize} bytes)`);
  } catch (err) {
    console.log(`   Written: ${outAbcPath} (${assembled.length} chars)`);
    console.warn(`   ⚠️ abc2midi failed on assembled file: ${err.message}`);
  }

  // Write evolution report
  const reportPath = path.join(baseDir, `${baseName}-evolution-report.json`);
  await fs.promises.writeFile(reportPath, JSON.stringify({
    source: abcFilePath,
    renders,
    validRenders: renderAbcs.length,
    segments: numSegments,
    segmentBars,
    selections: selections.map(s => ({
      segment: s.segIndex,
      seed: s.seed,
      score: s.score,
    })),
    timestamp: new Date().toISOString(),
  }, null, 2));
  console.log(`   Report: ${reportPath}`);

  // Cleanup
  if (!keepRenders) {
    for (const render of renderPaths) {
      try { await fs.promises.unlink(render.midPath); } catch {}
      try { await fs.promises.unlink(render.midPath.replace('.mid', '.abc')); } catch {}
    }
    try { await fs.promises.rmdir(renderDir); } catch {}
    console.log(`   Cleaned up render files`);
  }

  console.log(`\n✨ Evolution complete — best segments from ${renderAbcs.length} parallel universes assembled!`);

  return {
    evolvedPath: outAbcPath,
    reportPath,
    selections,
  };
}
