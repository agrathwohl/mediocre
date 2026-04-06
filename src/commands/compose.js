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
 * Parse multi-voice ABC output and extract content for each voice.
 * @param {string} text - Raw LLM output with multiple voices
 * @param {Array} targetVoices - Array of voice IDs to extract
 * @returns {Object} Map of voiceId → content
 */
function parseMultiVoiceAbc(text, targetVoices) {
  const lines = text.split('\n');
  const voices = {};
  let currentVoice = null;
  let currentContent = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Detect voice declaration: V:1, [V:2], V:soprano, [V:bass name="Bass"]
    const voiceMatch = t.match(/^\[?V:(\w+)/);
    if (voiceMatch) {
      // Save previous voice if any
      if (currentVoice !== null && currentContent.length > 0) {
        voices[currentVoice] = currentContent.join(' ').replace(/\s+/g, ' ').trim();
      }
      // Start new voice
      currentVoice = voiceMatch[1];
      currentContent = [];
      continue;
    }

    // Skip headers, directives, comments, markdown, thinking tags
    if (/^[XTMLQKCZW]:/.test(t)) continue;
    if (t.startsWith('%%')) continue;
    if (t.startsWith('[M:') || t.startsWith('[K:') || t.startsWith('[Q:')) continue;
    if (t.startsWith('```')) continue;
    if (t.startsWith('%')) continue;
    if (t.startsWith('Q:')) continue;
    if (t.startsWith('<think>') || t.startsWith('</think>')) continue;

    // Skip prose
    if (/^[A-Z][a-z]{3,}/.test(t) && !/[|]/.test(t)) continue;

    // Collect note content for current voice
    if (currentVoice !== null && /[A-Ga-gz]/.test(t)) {
      currentContent.push(t);
    }
  }

  // Save last voice
  if (currentVoice !== null && currentContent.length > 0) {
    voices[currentVoice] = currentContent.join(' ').replace(/\s+/g, ' ').trim();
  }

  // Match voices to target voice IDs
  const result = {};
  for (const targetId of targetVoices) {
    const targetStr = String(targetId);
    // Try exact match
    if (voices[targetStr]) {
      result[targetId] = voices[targetStr];
      continue;
    }
    // Try numeric match (V:voice1 matches target 1)
    for (const [voiceId, content] of Object.entries(voices)) {
      const numMatch = voiceId.match(/\d+/);
      if (numMatch && numMatch[0] === targetStr) {
        result[targetId] = content;
        break;
      }
    }
  }

  return result;
}

/**
 * Extract note content from an LLM response.
 * The fine-tuned model generates complete multi-voice ABC compositions regardless of system prompt.
 * This function parses the output and extracts ONLY the target voice's content.
 *
 * @param {string} text - Raw LLM output (may contain multiple voices)
 * @param {number|string} targetVoice - Voice ID we're filling (e.g., 1, 2, "1", "soprano")
 * @returns {string} Just the note content lines for the target voice
 */
function extractNoteContent(text, targetVoice) {
  const lines = text.split('\n');

  // Parse the multi-voice ABC output into voice sections
  const voices = [];
  let currentVoice = null;
  let currentContent = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;

    // Detect voice declaration: V:1, [V:2], V:soprano, [V:bass name="Bass"]
    const voiceMatch = t.match(/^\[?V:(\w+)/);
    if (voiceMatch) {
      // Save previous voice if any
      if (currentVoice !== null) {
        voices.push({ id: currentVoice, content: currentContent.join(' ') });
      }
      // Start new voice
      currentVoice = voiceMatch[1];
      currentContent = [];
      continue;
    }

    // Skip headers, directives, comments, markdown
    if (/^[XTMLQKCZW]:/.test(t)) continue;
    if (t.startsWith('%%')) continue;
    if (t.startsWith('[M:') || t.startsWith('[K:') || t.startsWith('[Q:')) continue;
    if (t.startsWith('```')) continue;
    if (t.startsWith('%')) continue;
    if (t.startsWith('Q:')) continue;

    // Skip prose
    if (/^[A-Z][a-z]{3,}/.test(t) && !/[|]/.test(t)) continue;

    // Collect note content for current voice
    if (currentVoice !== null && /[A-Ga-gz]/.test(t)) {
      currentContent.push(t);
    }
  }

  // Save last voice
  if (currentVoice !== null) {
    voices.push({ id: currentVoice, content: currentContent.join(' ') });
  }

  // If no voices were parsed, fall back to extracting all note content
  if (voices.length === 0) {
    const notes = [];
    for (const line of lines) {
      const t = line.trim();
      if (!t) continue;
      if (/^[XTMLQKCZW]:/.test(t)) continue;
      if (t.startsWith('%%')) continue;
      if (t.startsWith('V:') || t.startsWith('[V:')) continue;
      if (t.startsWith('[M:') || t.startsWith('[K:') || t.startsWith('[Q:')) continue;
      if (t.startsWith('```')) continue;
      if (t.startsWith('%')) continue;
      if (t.startsWith('Q:')) continue;
      if (/^[A-Z][a-z]{3,}/.test(t) && !/[|]/.test(t)) continue;
      if (/[A-Ga-gz]/.test(t)) {
        notes.push(t);
      }
    }
    const result = notes.join(' ').replace(/\s+/g, ' ').trim();
    return result;
  }

  // Find the voice that matches targetVoice
  // Try exact match first (V:1 matches targetVoice "1")
  const targetStr = String(targetVoice);
  let targetContent = voices.find(v => v.id === targetStr);

  // If no exact match, try numeric match (V:voice1 matches targetVoice 1)
  if (!targetContent) {
    targetContent = voices.find(v => v.id.match(/\d+/) && v.id.match(/\d+/)[0] === targetStr);
  }

  // If still no match, use the first voice (fallback)
  if (!targetContent && voices.length > 0) {
    targetContent = voices[0];
  }

  const result = targetContent ? targetContent.content : '';
  return result.replace(/\s+/g, ' ').trim();
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
 * Group slots by their bar range (section).
 * Slots covering the same bar range belong to the same section.
 * @param {Array} slots - Array of slot objects
 * @returns {Array} Array of section objects {startBar, endBar, slots}
 */
function groupSlotsBySection(slots) {
  const sectionMap = new Map();

  for (const slot of slots) {
    // Extract bar range from instruction (e.g., "V1 bars 1-16")
    const match = slot.instruction.match(/bars?\s+(\d+)-(\d+)/);
    if (!match) continue;

    const startBar = parseInt(match[1]);
    const endBar = parseInt(match[2]);
    const key = `${startBar}-${endBar}`;

    if (!sectionMap.has(key)) {
      sectionMap.set(key, { startBar, endBar, slots: [] });
    }
    sectionMap.get(key).slots.push(slot);
  }

  return Array.from(sectionMap.values()).sort((a, b) => a.startBar - b.startBar);
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

  let prompt = `${slot.instruction}\n\n`;
  prompt += `${K}, ${M}, L:${L}, ${Q ? Q.replace('1/4=', '') + ' BPM' : ''}. Exactly ${slot.barCount} bars, ${template.unitsPerBar} units per bar.\n`;
  if (template.instruments) {
    prompt += `Instruments in this piece: ${template.instruments}.\n`;
  }
  prompt += `\nOutput ${slot.barCount} bars of note content separated by | for this single voice. Use dynamics, articulations, and expressive marks. No headers, no voice declarations.\n`;

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
 * Fill an entire section (all voices for a bar range) in one LLM call.
 * @param {Object} section - Section object {startBar, endBar, slots}
 * @param {Object} template - Parsed template
 * @param {Map} filledSoFar - Already filled voice content
 * @param {string} rawDir - Directory to save raw output
 * @returns {Promise<Object|null>} Map of voiceId → content, or null on failure
 */
export async function fillSection(section, template, filledSoFar, rawDir) {
  const provider = getAnthropic();
  const modelId = getModel('claude-sonnet-4-6');

  // Build section prompt — include ALL voice instructions for this bar range
  const { M, L, Q, K } = template.headers;
  let prompt = `Compose bars ${section.startBar}-${section.endBar} for ALL voices.\n\n`;
  prompt += `${K}, ${M}, L:${L}, ${Q ? Q.replace('1/4=', '') + ' BPM' : ''}. ${section.slots[0].barCount} bars, ${template.unitsPerBar} units per bar.\n`;
  if (template.instruments) {
    prompt += `Instruments: ${template.instruments}.\n`;
  }
  prompt += `\nVoice instructions:\n`;

  for (const slot of section.slots) {
    const voice = template.voices.find(v => v.id === slot.voice);
    const voiceName = voice ? voice.name : `V:${slot.voice}`;
    prompt += `\n${voiceName} (V:${slot.voice}): ${slot.instruction}\n`;
  }

  prompt += `\nGenerate complete ABC notation for ALL ${section.slots.length} voices for this section. Include voice declarations (V:1, V:2, etc.) and note content for each voice.\n`;

  // Add context from previously filled sections
  const contextVoices = [];
  for (const [vid, content] of filledSoFar) {
    const v = template.voices.find(vv => vv.id === vid);
    const name = v ? v.name : vid;
    contextVoices.push(`${name} (V:${vid}, previous sections):\n${content.slice(-500)}`); // last 500 chars for context
  }
  if (contextVoices.length > 0) {
    const context = contextVoices.slice(-3).join('\n\n');
    prompt += `\nPREVIOUS SECTIONS (for continuity):\n${context}\n`;
  }

  // System prompt — let the model generate full multi-voice sections
  let systemPrompt = `You are a music composition AI specializing in hybrid genre fusions.

Generate complete multi-voice ABC notation sections. Include:
- Voice declarations: V:1, V:2, V:3, etc.
- Note content for each voice with proper bar separators |
- Dynamics (!pp!, !mf!, !ff!), articulations, grace notes, chords

Output ONLY raw ABC notation. No commentary, no markdown, no explanations.`;

  if (template.directives.length > 0) {
    systemPrompt += `\n\nThis piece uses temporal humanization directives:\n${template.directives.join('\n')}`;
  }

  try {
    const { text, usage } = await generateText({
      model: provider(modelId),
      system: systemPrompt,
      prompt,
      maxTokens: 8000, // larger for multi-voice sections
      temperature: 0.7,
    });

    // Save raw output
    if (rawDir) {
      const rawPath = path.join(rawDir, `section-bars${section.startBar}-${section.endBar}.txt`);
      await fs.promises.writeFile(rawPath, text);
    }

    // Parse multi-voice output
    const voiceContent = parseMultiVoiceAbc(text, section.slots.map(s => s.voice));

    // Post-process each voice
    const processed = {};
    for (const [voiceId, content] of Object.entries(voiceContent)) {
      if (!content.trim()) continue;

      // Cleanup
      const { cleaned, fixes } = cleanupAbc(content, { unitsPerBar: template.unitsPerBar });
      if (fixes.length > 0) {
        console.log(`    🔧 V:${voiceId}: ${fixes.length} auto-fixes`);
      }

      // Check bar count and normalize
      let notes = cleaned;
      const slot = section.slots.find(s => String(s.voice) === String(voiceId));
      if (slot) {
        const bars = countBars(notes);
        if (bars < slot.barCount) {
          const restBar = `z${template.unitsPerBar}`;
          const padding = Array(slot.barCount - bars).fill(restBar).join(' | ');
          notes = notes.trimEnd();
          if (!notes.endsWith('|')) notes += ' |';
          notes += ' ' + padding + ' |';
        } else if (bars > slot.barCount) {
          const barArray = notes.split('|').filter(b => b.trim());
          notes = barArray.slice(0, slot.barCount).join(' | ') + ' |';
        }
      }

      processed[voiceId] = notes;
      const tok = usage ? Math.round(usage.totalTokens / section.slots.length) : 0;
      console.log(`    ✓ V:${voiceId}: ${countBars(notes)} bars, ${notes.length}c, ~${tok} tok`);
    }

    return Object.keys(processed).length > 0 ? processed : null;
  } catch (err) {
    console.error(`    ✗ Section bars ${section.startBar}-${section.endBar} failed: ${err.message}`);
    return null;
  }
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

  // Build system prompt — single-voice content for an existing template
  let systemPrompt = `You are a music composition AI specializing in hybrid genre fusions.

OUTPUT FORMAT: Raw ABC note content ONLY — bars separated by |
DO NOT output: headers (X:, T:, M:, L:, Q:, K:), voice declarations (V:), %%MIDI directives, markdown, prose, commentary, or blank lines.

You are filling ONE voice in an existing multi-voice piece. Output ONLY the note lines for that voice.
Use dynamics (!pp!, !mf!, !ff!, !fff!), articulations, grace notes, chords ([CEG]), and expressive marks freely.
Fill EVERY bar with active musical content — no empty bars unless the instruction says SILENCE.
Write musically: varied rhythms, interesting intervals, dynamic shaping, phrase structure.`;

  if (template.directives.length > 0) {
    systemPrompt += `\n\nThis piece uses temporal humanization directives:\n${template.directives.join('\n')}`;
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

    // Extract note content for the target voice
    let notes = extractNoteContent(text, slot.voice);
    if (!notes.trim()) {
      console.warn(`  ⚠️ Slot ${slot.index} returned no usable note content for V:${slot.voice}`);
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

  // Group slots by bar range (section)
  const sections = groupSlotsBySection(slotsToFill);
  console.log(`\n🎼 Filling ${sections.length} sections (${slotsToFill.length} total voice slots)...`);

  const slotContent = new Map();
  const filledVoiceContent = new Map(template.filledContent); // start with pre-written

  for (const section of sections) {
    console.log(`\n  📍 Section: bars ${section.startBar}-${section.endBar} (${section.slots.length} voices)`);

    let sectionContent = await fillSection(section, template, filledVoiceContent, rawDir);
    // Retry up to 2 times on failure
    if (!sectionContent) {
      console.log(`    ⟳ Retrying section bars ${section.startBar}-${section.endBar}...`);
      sectionContent = await fillSection(section, template, filledVoiceContent, rawDir);
    }
    if (!sectionContent) {
      console.log(`    ⟳ Final retry section bars ${section.startBar}-${section.endBar}...`);
      sectionContent = await fillSection(section, template, filledVoiceContent, rawDir);
    }

    if (sectionContent) {
      // Assign content to each voice slot
      for (const [voiceId, content] of Object.entries(sectionContent)) {
        const slot = section.slots.find(s => String(s.voice) === String(voiceId));
        if (slot && content) {
          slotContent.set(slot.index, content);
          // Update context
          const existing = filledVoiceContent.get(slot.voice) || '';
          filledVoiceContent.set(slot.voice, existing + (existing ? '\n' : '') + content);
        }
      }
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
