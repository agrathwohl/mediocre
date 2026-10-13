/**
 * TiMidity Config Agent - AI SDK v6
 * Two-phase soundfont arranger: phase 1 searches the catalog for real candidate
 * soundfonts; phase 2 selects and orders from those candidates with a single
 * structured call. Config file generation (non-LLM) is in soundfont-tools.js.
 */

import { generateText, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { searchSoundfontCatalogTool, extractInstrumentsTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';
import { BANNED_SOUNDFONTS, soundfontExists } from '../../utils/soundfont-tools.js';
import { saveCustomTimidityConfig } from '../../utils/claude.js';
import { getAnthropic, getModel } from '../../utils/llm-client.js';

const SELECTION_SCHEMA = z.object({
  soundfonts: z.array(z.string()).describe('Soundfont filenames in TiMidity load order (general GM first, specialty last)'),
  layeringStrategy: z.string().describe('Brief explanation of the layering order and why'),
  instrumentsCovered: z.array(z.string()).describe('Instruments/programs covered by this selection'),
});

/**
 * Select and arrange soundfonts for TiMidity, then generate the config file.
 * @param {Object} options
 * @param {string} options.abcNotation
 * @param {string} options.genre
 * @param {string} options.classicalGenre
 * @param {string} options.modernGenre
 * @param {string} options.outputDir
 * @param {string} options.baseFilename
 * @returns {Promise<{configPath: string, soundfonts: string[], layeringStrategy: string, instrumentsCovered: string[]}>}
 */
export async function arrangeSoundfontsAndGenerateConfig(options) {
  const {
    abcNotation,
    genre = 'Classical_x_Contemporary',
    classicalGenre = 'Classical',
    modernGenre = 'Contemporary',
    outputDir,
    baseFilename,
  } = options;

  const anthropic = getAnthropic();
  const model = anthropic(getModel('claude-opus-5-5'), { cacheControl: { type: 'ephemeral' } });
  const abcExcerpt = `${abcNotation.substring(0, 2000)}${abcNotation.length > 2000 ? '\n[... truncated ...]' : ''}`;

  const gather = await generateText({
    model,
    tools: { extract_instruments: extractInstrumentsTool, search_soundfont_catalog: searchSoundfontCatalogTool },
    toolChoice: 'auto',
    stopWhen: stepCountIs(10),
    onStepFinish: createStepLogger('timidity-config:search'),
    system: `You research soundfonts for TiMidity playback of a ${classicalGenre} × ${modernGenre} composition. Call extract_instruments once to see the MIDI programs used, then call search_soundfont_catalog for: a general GM soundfont, drums, bass, the actual instruments used, and the "${classicalGenre}" and "${modernGenre}" styles. Your only job here is to surface real candidate soundfonts from the catalog — search thoroughly.`,
    prompt: `Genre: ${genre}\n\nABC:\n\`\`\`\n${abcExcerpt}\n\`\`\``,
  });

  const candidates = new Set();
  for (const step of gather.steps ?? []) {
    for (const tr of step.toolResults ?? []) {
      const res = tr.output ?? tr.result;
      for (const r of res?.results ?? []) {
        if (soundfontExists(r.filename) && !BANNED_SOUNDFONTS.includes(r.filename)) candidates.add(r.filename);
      }
    }
  }
  const candidateList = [...candidates];

  if (candidateList.length === 0) {
    const fallback = soundfontExists('GeneralUser GS v1.471.sf2') ? ['GeneralUser GS v1.471.sf2'] : [];
    console.warn('⚠️ No catalog candidates surfaced — writing GM-only fallback config.');
    const configPath = await saveCustomTimidityConfig({ soundfonts: fallback, outputDir, baseFilename, title: baseFilename, genre });
    return { configPath, soundfonts: fallback, layeringStrategy: 'fallback (no candidates)', instrumentsCovered: [] };
  }

  const { output } = await generateText({
    model,
    output: Output.object({ schema: SELECTION_SCHEMA }),
    system: `You arrange soundfonts for TiMidity. Select 15-25 from the provided candidate list and order them for layering: general GM first, then drums, bass, instrument-specific, and genre-specialty soundfonts LAST (later entries override earlier). Output ONLY filenames that appear verbatim in the candidate list.`,
    prompt: `Genre: ${genre} (${classicalGenre} × ${modernGenre}).\n\nCANDIDATE SOUNDFONTS (real catalog files — choose only from these):\n${candidateList.join('\n')}`,
  });

  const invented = output.soundfonts.filter(sf => !candidates.has(sf));
  if (invented.length > 0) {
    console.warn(`⚠️ Dropped ${invented.length} soundfont(s) not in the candidate list: ${invented.join(', ')}`);
  }
  let safeSoundfonts = output.soundfonts.filter(sf => candidates.has(sf));
  if (safeSoundfonts.length === 0) safeSoundfonts = candidateList.slice(0, 20);

  const configPath = await saveCustomTimidityConfig({
    soundfonts: safeSoundfonts,
    outputDir,
    baseFilename,
    title: baseFilename,
    genre,
  });

  return {
    configPath,
    soundfonts: safeSoundfonts,
    layeringStrategy: output.layeringStrategy,
    instrumentsCovered: output.instrumentsCovered,
  };
}
