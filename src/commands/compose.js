/**
 * Compose command — fills template content slots using an LLM.
 * Reads a template ABC file, sends each content slot to the model,
 * validates responses, and assembles the final piece.
 *
 * @module compose
 */

import fs from 'fs';
import path from 'path';
import { generateText } from 'ai';
import { parseTemplate } from '../utils/template-parser.js';
import { getAnthropic, getModel, getAbc2midiBinary } from '../utils/llm-client.js';
import { cleanupAbc } from '../utils/abc-cleanup.js';
import { resolveMirrors } from '../utils/abc-mirror.js';
import { execa } from 'execa';

/**
 * Extract note content from an LLM response — strip headers, directives, voice declarations.
 * @param {string} text - Raw LLM output
 * @returns {string} Just the note content lines
 */
function extractNoteContent(text) {
  const lines = text.split('\n');
  const notes = [];
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    // Include lines that contain ABC note characters (A-G, a-g, or z for rests)
    // with bar separators (|) — this IS music content
    if (/[A-Ga-gz]/.test(t) && /[|]/.test(t)) {
      // But skip lines that are clearly headers/directives/prose
      if (/^[XTMLQKCZW]:/.test(t)) continue;
      if (t.startsWith('%%')) continue;
      if (t.startsWith('V:') || t.startsWith('[V:')) continue;
      if (t.startsWith('```')) continue;
      if (t.startsWith('%')) continue;
      notes.push(t);
    }
  }
  return notes.join('\n');
}

/**
 * Count bars in ABC note content.
 * @param {string} noteContent
 * @returns {number}
 */
function countBars(noteContent) {
  return noteContent.split('|').filter(b => b.trim()).length;
}

/**
 * Build the prompt for filling a single content slot.
 * @param {Object} slot - Parsed slot from template
 * @param {Object} template - Full parsed template
 * @param {Map} filledSoFar - Voice content filled in previous iterations
 * @returns {string}
 */
function buildSlotPrompt(slot, template, filledSoFar) {
  const { M, L, Q, K } = template.headers;
  const voice = template.voices.find(v => v.id === slot.voice);
  const instrument = voice ? voice.name : 'instrument';
  const program = voice ? voice.program : 0;

  let prompt = `Instruction: Generate ABC notation matching this description.\n`;
  prompt += `Input: Compose ${slot.barCount} bars for voice ${slot.voice} (${instrument}, program ${program}). `;
  prompt += `${K}, ${M}, L:${L}, ${Q ? Q.replace('1/4=', '') + ' BPM' : ''}.\n\n`;
  prompt += `${slot.instruction}\n\n`;
  prompt += `Write ${slot.barCount} bars. ${template.unitsPerBar} ${L} notes per bar.\n`;

  // Add context from previously filled voices
  const contextVoices = [];
  for (const [vid, content] of filledSoFar) {
    if (vid === slot.voice) continue; // don't show self
    const v = template.voices.find(vv => vv.id === vid);
    const name = v ? v.name : vid;
    contextVoices.push(`${name} (V:${vid}):\n${content}`);
  }
  // Also include pre-written content from the template
  for (const [vid, content] of template.filledContent) {
    if (vid === slot.voice) continue;
    if (filledSoFar.has(vid)) continue; // already included
    const v = template.voices.find(vv => vv.id === vid);
    const name = v ? v.name : vid;
    contextVoices.push(`${name} (V:${vid}, pre-written):\n${content}`);
  }

  if (contextVoices.length > 0) {
    // Limit context to avoid overwhelming the model
    const context = contextVoices.slice(-3).join('\n\n');
    prompt += `\nEXISTING VOICES (for reference — do NOT regenerate these):\n${context}\n`;
  }

  return prompt;
}

/**
 * Fill a single content slot by calling the LLM.
 * @param {Object} slot - Parsed slot
 * @param {Object} template - Parsed template
 * @param {Map} filledSoFar - Already filled voice content
 * @param {string} rawDir - Directory to save raw output
 * @returns {Promise<string|null>} Generated note content, or null on failure
 */
export async function fillSlot(slot, template, filledSoFar, rawDir) {
  const provider = getAnthropic();
  const modelId = getModel('claude-sonnet-4-6');
  const prompt = buildSlotPrompt(slot, template, filledSoFar);

  // Build system prompt dynamically from template content
  let systemPrompt = `You are a music composition AI specializing in hybrid genre fusions. Output ONLY raw ABC notation compatible with abc2midi. No prose, no commentary, no markdown.`;

  if (template.instruments) {
    systemPrompt += `\n\nINSTRUMENTS: The composition uses these instruments: ${template.instruments}. Assign appropriate GM MIDI program numbers for each.`;
  }

  if (template.directives.length > 0) {
    systemPrompt += `\n\nThis composition uses the following abc2midi directives (already placed in the template header — you do NOT need to emit these, just be aware the piece uses temporal humanization):\n${template.directives.join('\n')}`;
  }

  try {
    const { text, usage } = await generateText({
      model: provider(modelId),
      system: systemPrompt,
      prompt,
      maxTokens: 4000,
      temperature: 0.7,
    });

    // Save raw output
    if (rawDir) {
      const rawPath = path.join(rawDir, `slot-${slot.index}-V${slot.voice}.txt`);
      await fs.promises.writeFile(rawPath, text);
    }

    // Extract note content
    let notes = extractNoteContent(text);
    if (!notes.trim()) {
      console.warn(`  ⚠️ Slot ${slot.index} returned no usable note content`);
      return null;
    }

    // Post-process: fix systematic LLM errors
    const { cleaned, fixes } = cleanupAbc(notes, { unitsPerBar: template.unitsPerBar });
    if (fixes.length > 0) {
      console.log(`    🔧 ${fixes.length} auto-fixes applied`);
    }
    notes = cleaned;

    // Check bar count
    const bars = countBars(notes);
    if (bars < slot.barCount) {
      // Pad with rests
      const restBar = `z${template.unitsPerBar}`;
      const padding = Array(slot.barCount - bars).fill(restBar).join(' | ');
      notes = notes.trimEnd();
      if (!notes.endsWith('|')) notes += ' |';
      notes += ' ' + padding + ' |';
    } else if (bars > slot.barCount) {
      // Truncate to the right number of bars
      const allBars = notes.split('|').filter(b => b.trim());
      notes = allBars.slice(0, slot.barCount).join(' | ') + ' |';
    }

    const tok = usage?.completionTokens || 0;
    console.log(`  ✓ Slot ${slot.index} V:${slot.voice}: ${countBars(notes)} bars, ${notes.length}c, ${tok} tok`);
    return notes;
  } catch (err) {
    console.error(`  ✗ Slot ${slot.index} V:${slot.voice} failed: ${err.message}`);
    return null;
  }
}

/**
 * Assemble the filled template — replace rest lines with generated content.
 * @param {Object} template - Parsed template
 * @param {Map<number, string>} slotContent - Map of slot index → generated note content
 * @returns {string} Complete ABC notation
 */
export function assembleTemplate(template, slotContent) {
  const lines = [...template.rawLines];

  // Replace rest lines for filled slots (in reverse order to preserve line numbers)
  const filledSlots = [...slotContent.entries()]
    .sort(([a], [b]) => b - a); // reverse order

  for (const [slotIdx, content] of filledSlots) {
    const slot = template.slots[slotIdx];
    if (slot.restLineNumber !== null && slot.restLineNumber !== undefined) {
      lines[slot.restLineNumber] = content;
    }
  }

  return lines.join('\n');
}

/**
 * Main compose function — orchestrates the full pipeline.
 * @param {string} templatePath - Path to template ABC file
 * @param {Object} options - CLI options
 */
export async function compose(templatePath, options = {}) {
  const {
    dryRun = false,
    slotNumber = null,
    output = null,
    skipValidation = false,
  } = options;

  // Parse template
  console.log(`📋 Parsing template: ${templatePath}`);
  const template = await parseTemplate(templatePath);

  console.log(`   ${template.headers.M} ${template.headers.L} ${template.headers.Q}`);
  console.log(`   ${template.voices.length} voices, ${template.slots.length} content slots, ${template.prewritten.length} pre-written`);
  console.log(`   ${template.unitsPerBar} units per bar`);

  // Filter out SILENCE slots — these are intentionally empty
  const activeSlots = template.slots.filter(s =>
    !s.instruction.includes('SILENCE')
  );

  console.log(`   ${activeSlots.length} active slots to fill (${template.slots.length - activeSlots.length} silence slots skipped)`);

  if (dryRun) {
    console.log('\n📝 Content slots:');
    for (const slot of template.slots) {
      const active = !slot.instruction.includes('SILENCE');
      const marker = active ? '🎵' : '🔇';
      console.log(`   ${marker} [${slot.index}] V:${slot.voice} ${slot.barCount} bars — ${slot.instruction.slice(0, 70)}`);
    }
    return;
  }

  // Setup raw output directory
  const baseName = path.basename(templatePath, '.abc');
  const baseDir = path.dirname(templatePath);
  const rawDir = path.join(baseDir, `${baseName}-raw`);
  await fs.promises.mkdir(rawDir, { recursive: true });

  // Determine which slots to fill
  let slotsToFill = activeSlots;
  if (slotNumber !== null) {
    const target = template.slots[parseInt(slotNumber)];
    if (!target) {
      console.error(`Slot ${slotNumber} not found (0-${template.slots.length - 1})`);
      return;
    }
    slotsToFill = [target];
    console.log(`\n🎯 Filling only slot ${slotNumber}`);
  }

  // Fill slots sequentially
  console.log(`\n🎼 Filling ${slotsToFill.length} content slots...`);
  const slotContent = new Map();
  const filledVoiceContent = new Map(template.filledContent); // start with pre-written

  for (const slot of slotsToFill) {
    console.log(`\n  [${slot.index}/${template.slots.length - 1}] V:${slot.voice} — ${slot.instruction.slice(0, 60)}...`);

    let content = await fillSlot(slot, template, filledVoiceContent, rawDir);
    // Retry up to 2 times on failure — a missing voice is catastrophic
    if (!content) {
      console.log(`    ⟳ Retrying slot ${slot.index}...`);
      content = await fillSlot(slot, template, filledVoiceContent, rawDir);
    }
    if (!content) {
      console.log(`    ⟳ Final retry slot ${slot.index}...`);
      content = await fillSlot(slot, template, filledVoiceContent, rawDir);
    }
    if (content) {
      slotContent.set(slot.index, content);
      // Update context for subsequent slots
      const existing = filledVoiceContent.get(slot.voice) || '';
      filledVoiceContent.set(slot.voice, existing + (existing ? '\n' : '') + content);
    }
  }

  console.log(`\n✅ Filled ${slotContent.size}/${slotsToFill.length} slots`);

  // Assemble
  console.log('\n🔧 Assembling...');
  let assembled = assembleTemplate(template, slotContent);

  // Resolve any %%MIRROR directives
  if (assembled.includes('%%MIRROR')) {
    const baseDir = path.dirname(templatePath);
    const { resolved, operations, errors: mirrorErrors } = resolveMirrors(assembled, baseDir);
    if (operations.length > 0) {
      console.log(`   🪞 Resolved ${operations.length} MIRROR directive(s)`);
    }
    if (mirrorErrors.length > 0) {
      mirrorErrors.forEach(e => console.warn(`   ⚠️ ${e}`));
    }
    assembled = resolved;
  }

  // Final cleanup pass on the complete file
  const { cleaned: finalCleaned, fixes: finalFixes } = cleanupAbc(assembled, { unitsPerBar: template.unitsPerBar });
  if (finalFixes.length > 0) {
    console.log(`   🔧 Final cleanup: ${finalFixes.length} fixes applied`);
    assembled = finalCleaned;
  }

  // Write output
  const outPath = output || path.join(baseDir, `${baseName}-composed.abc`);
  await fs.promises.writeFile(outPath, assembled);
  console.log(`   Written: ${outPath} (${assembled.length} chars, ${assembled.split('\n').length} lines)`);

  // Validate with abc2midi
  if (!skipValidation) {
    const midPath = outPath.replace(/\.abc$/, '.mid');
    try {
      const { stdout, stderr } = await execa(getAbc2midiBinary(), [outPath, '-o', midPath], { reject: false });
      const combined = `${stdout || ''}\n${stderr || ''}`;
      const errors = (combined.match(/Error/g) || []).length;
      const warnings = (combined.match(/Warning/g) || []).length;
      const midSize = fs.existsSync(midPath) ? fs.statSync(midPath).size : 0;
      console.log(`\n🎹 abc2midi: ${errors} errors, ${warnings} warnings, ${midSize} bytes MIDI`);
      if (midSize > 0) {
        console.log(`   MIDI: ${midPath}`);
      }
    } catch (err) {
      console.warn(`   ⚠️ abc2midi failed: ${err.message}`);
    }
  }

  console.log('\n✨ Done!');
}
