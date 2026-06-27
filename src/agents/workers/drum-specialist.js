import { generateText, Output } from 'ai';
import { z } from 'zod';
import { getPercussionReference } from '../drum-arranger/gm-percussion-reference.js';
import { ABC2MIDI_REFERENCE } from '../shared/abc2midi-reference.js';
import { FORK_DIRECTIVES_REFERENCE } from '../shared/fork-directives-reference.js';
import { getAnthropic, getModel, getAbc2midiBinary } from '../../utils/llm-client.js';
import { cleanAbcNotation } from '../../utils/validation.js';

function stripDrumContent(abc) {
  const lines = abc.split('\n');
  const kept = [];
  let inPercVoice = false;
  let barCount = 0;
  let maxBars = 0;
  let meter = '4/4';
  let tempo = '1/4=120';
  let defaultNoteLength = '1/8';

  for (const line of lines) {
    const mMatch = line.match(/^M:\s*(.+)/);
    if (mMatch) meter = mMatch[1].trim();
    const qMatch = line.match(/^Q:\s*(.+)/);
    if (qMatch) tempo = qMatch[1].trim();
    const lMatch = line.match(/^L:\s*(.+)/);
    if (lMatch) defaultNoteLength = lMatch[1].trim();

    // Voice body start — [V:id ...]
    if (line.match(/^\[V:/)) {
      if (barCount > maxBars) maxBars = barCount;
      barCount = 0;
      if (/clef\s*=\s*perc/.test(line)) {
        inPercVoice = true;
        continue;
      }
      inPercVoice = false;
    }

    // Voice declaration (no brackets) — V:id ... clef=perc
    if (/^V:.*clef\s*=\s*perc/.test(line) && !line.startsWith('[')) continue;

    if (inPercVoice) continue;

    // Strip global drum directives
    if (/^%%MIDI\s+drummap\s/.test(line)) continue;
    if (/^%%MIDI\s+drum\s/.test(line) && !/^%%MIDI\s+drummap/.test(line)) continue;
    if (/^%%MIDI\s+drumon/.test(line)) continue;
    if (/^%%MIDI\s+drumoff/.test(line)) continue;

    // Count bars in non-drum, non-directive, non-comment lines
    if (!line.startsWith('%%') && !line.startsWith('%') && !line.startsWith('[') && !line.match(/^[A-Z]:/)) {
      barCount += (line.match(/\|/g) || []).length;
    }

    kept.push(line);
  }

  if (barCount > maxBars) maxBars = barCount;

  return { strippedAbc: kept.join('\n'), barCount: maxBars || 32, meter, tempo, defaultNoteLength };
}

function findNearestAllowed(gm, allowedSet) {
  let nearest = [...allowedSet][0];
  let minDist = Math.abs(gm - nearest);
  for (const allowed of allowedSet) {
    const dist = Math.abs(gm - allowed);
    if (dist < minDist) { nearest = allowed; minDist = dist; }
  }
  return nearest;
}

export async function enhanceDrums(options) {
  const anthropic = getAnthropic();
  const { abc, drumPrescription, genres, customSystemPrompt = null } = options;
  const usingFork = getAbc2midiBinary() !== 'abc2midi';

  console.log('\n🥁 Drum Specialist Worker executing...');
  console.log(`   Genre: ${genres.hybrid}`);

  // Strip ALL drum/perc content — the model only writes drums, never touches pitched voices
  const { strippedAbc, barCount, meter, tempo, defaultNoteLength } = stripDrumContent(abc);
  const allowedDrumNumbers = new Set(drumPrescription.drumKit.map(s => s.gm));

  const kitSummary = drumPrescription.drumKit
    .map(s => `  ${s.gm}: ${s.name} [${s.role}]`)
    .join('\n');

  const allowedDrums = drumPrescription.drumKit
    .map(s => `${s.gm}(${s.name})`)
    .join(', ');

  const percussionRef = getPercussionReference();

  const systemPrompt = `You are an elite drum programmer and percussion arranger for hybrid genre fusion music.

You will receive a composition that has NO drum/percussion voice. Your job: write the channel 10 percussion voice for it. You return ONLY the drum content as structured data — the code handles splicing it into the piece.

You will NOT see or touch the pitched voices. They are provided as READ-ONLY context so you can understand the musical structure (sections, energy arc, harmonic rhythm, tempo changes) and write drums that fit.

## WHAT MAKES GOOD DRUMS FOR ${genres.classical} × ${genres.modern}
- Genre-authentic patterns for BOTH traditions — not generic rock beats
- Rhythmic variety across sections — different patterns, fills at transitions, not the same 2-bar loop repeated endlessly
- Dynamic range via %%MIDI beat/beatstring directives per section (NOT inline !ff! marks — those do not control percussion velocity in abc2midi)
- Structural evolution: sparse intro → building density → full groove → breakdown → climax
- Use the FULL prescribed kit — don't settle for just kick/snare/hat when you have 15+ sounds available
- Real rhythmic notation using drummap-assigned ABC note letters — not just z rests with a %%MIDI drum pattern

## PRESCRIBED DRUM KIT — ONLY THESE SOUNDS ARE AUTHORIZED
${kitSummary}

Pattern guidance from drum arranger: ${drumPrescription.patternGuidance}

## NOTATION RULES
- Assign ABC note letters (C, D, E, F, G, A, B, c, d, e, f, g, a, b) to kit sounds via drumMapEntries
- Write drum patterns using those mapped letters in the notes array
- Each element in notes is ONE COMPLETE BAR — must sum to the correct beat count for ${meter} at L:${defaultNoteLength}
- Use z for rests between hits
- NEVER use note letters that aren't in your drumMapEntries
- You may ALSO provide an inlineDrumPattern for a simple repeating base groove (%%MIDI drum)
  - Pattern: ONLY d=hit and z=rest characters, no spaces, no numbers
  - programs/velocities arrays: exactly one entry per 'd' in the pattern

## REFERENCES
${percussionRef}

${ABC2MIDI_REFERENCE}${usingFork ? '\n\n' + FORK_DIRECTIVES_REFERENCE : ''}${customSystemPrompt ? '\n\n## EXTENDED DIRECTIVE SET\n' + customSystemPrompt : ''}`;

  try {
    const { output } = await generateText({
      model: anthropic(getModel('claude-sonnet-4-6'), {
        cacheControl: { type: 'ephemeral', ttl: '1h' },
      }),
      output: Output.object({
        schema: z.object({
          drumMapEntries: z.array(z.object({
            note: z.string().describe('ABC note letter (C-B, c-b) to assign to this drum sound'),
            midiPitch: z.number().describe(`GM percussion number — ONLY use: ${allowedDrums}`),
          })).describe('Map ABC note letters to drum kit sounds. Use at least 6-8 sounds from the prescribed kit — kick, snare, hi-hat minimum, plus toms, cymbals, and color sounds.'),

          inlineDrumPattern: z.object({
            pattern: z.string().describe('d=hit z=rest ONLY, no spaces or numbers. Example: "dzdzdzdz"'),
            programs: z.array(z.number()).describe('GM drum numbers, exactly one per d in pattern'),
            velocities: z.array(z.number()).describe('Velocities 0-127, exactly one per d in pattern'),
          }).optional().describe('Optional simple repeating base groove alongside the notated drum patterns'),

          forkDirectives: z.array(z.string()).optional().describe('Per-voice fork directives without %% prefix for the drum voice (e.g., "PNEUMA humanize 8", "GRAVITY weight 1.1 1.0 0.9 1.0")'),

          beatDirectives: z.array(z.string()).optional().describe('%%MIDI beat and %%MIDI beatstring directives without %%MIDI prefix — change these per section for dynamic variation. Example: ["beat 95 75 55 4", "beatstring fmpmfmpm"]'),

          notes: z.array(z.string()).describe(`Array of drum measures using mapped note letters. Write EXACTLY ${barCount} bars to match the piece length. Each string is one complete bar in ${meter} at L:${defaultNoteLength}.`),
        }),
      }),
      maxTokens: 32000,
      system: systemPrompt,
      prompt: `Write the drum/percussion voice (channel 10) for this ${genres.hybrid} composition (${genres.classical} × ${genres.modern}).

The piece is ${barCount} bars long in ${meter} at ${tempo} with L:${defaultNoteLength}.
Your drum voice must be EXACTLY ${barCount} bars to match.

Here is the composition WITHOUT drums — read it to understand the structure, then write drums that fit:

${strippedAbc}`,
    });

    // Build the drum voice section — code handles the splice, not the model
    const drumLines = [];
    drumLines.push(`[V:drums name="Drums" clef=perc]`);
    drumLines.push('%%MIDI channel 10');

    for (const entry of output.drumMapEntries) {
      const pitch = allowedDrumNumbers.has(entry.midiPitch)
        ? entry.midiPitch
        : findNearestAllowed(entry.midiPitch, allowedDrumNumbers);
      drumLines.push(`%%MIDI drummap ${entry.note} ${pitch}`);
    }

    if (output.inlineDrumPattern) {
      const p = output.inlineDrumPattern;
      const cleanPattern = p.pattern.replace(/\s+/g, '');
      const progs = p.programs.map(gm =>
        allowedDrumNumbers.has(gm) ? gm : findNearestAllowed(gm, allowedDrumNumbers)
      );
      drumLines.push(`%%MIDI drum ${cleanPattern} ${progs.join(' ')} ${p.velocities.join(' ')}`);
      drumLines.push('%%MIDI drumon');
    }

    if (output.forkDirectives) {
      for (const dir of output.forkDirectives) {
        drumLines.push(`%%${dir}`);
      }
    }

    if (output.beatDirectives) {
      for (const dir of output.beatDirectives) {
        drumLines.push(`%%MIDI ${dir}`);
      }
    }

    drumLines.push(output.notes.join(' | '));

    const finalAbc = strippedAbc + '\n' + drumLines.join('\n') + '\n';

    console.log(`   ✅ Drum specialist: ${output.drumMapEntries.length} sounds mapped, ${output.notes.length} bars written`);
    return cleanAbcNotation(finalAbc);

  } catch (error) {
    console.error('Drum specialist worker error:', error.message);
    throw error;
  }
}
