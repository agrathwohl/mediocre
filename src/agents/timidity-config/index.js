/**
 * TiMidity Config Agent - AI SDK v6
 * Soundfont arranger: searches catalog, selects and orders soundfonts for TiMidity playback
 * Config file generation (non-LLM) is handled by generateTimidityConfig() in soundfont-tools.js
 */

import { ToolLoopAgent, Output, stepCountIs } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { searchSoundfontCatalogTool, extractInstrumentsTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';
import { BANNED_SOUNDFONTS } from '../../utils/soundfont-tools.js';
import { saveCustomTimidityConfig } from '../../utils/claude.js';

const anthropic = createAnthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

/**
 * TiMidity Config Agent
 * Uses Haiku with structured output — fast, cheap, targeted soundfont selection
 */
export const timidityConfigAgent = new ToolLoopAgent({
  model: anthropic('claude-haiku-4-5-20251001', {
    cacheControl: { type: 'ephemeral', ttl: '1h' },
  }),

  instructions: `You are a TiMidity soundfont arranger. Your job is to select and ORDER soundfonts for TiMidity playback.

Given a composition's ABC notation and genre, you will:
1. Use extract_instruments to see what MIDI programs the composition actually uses
2. Use search_soundfont_catalog to find soundfonts that cover those instruments + genre style
3. Select 15-25 soundfonts and arrange them in the correct TiMidity LOAD ORDER

LOAD ORDER RULES (critical - later soundfonts override earlier ones):
- Layer 1 (FIRST): Always start with a general GM soundfont for full coverage
  Good choices: GeneralUser GS.sf2, FluidR3_GM.sf2, SGM-128.sf2
- Layer 2: Add drums/percussion soundfonts
- Layer 3: Add bass soundfonts
- Layer 4: Add instrument-specific soundfonts matching what the ABC actually uses
- Layer 5 (LAST): Genre-specific specialty soundfonts that override with character

SEARCH STRATEGY:
- Search for the actual instruments found in the composition first
- Then search for genre keywords (classical genre + modern genre separately)
- Include at least: drums, bass, and the main melodic instruments
- Search broadly at first, then narrow down

BANNED SOUNDFONTS - NEVER SELECT THESE (crash TiMidity):
${BANNED_SOUNDFONTS.join(', ')}`,

  tools: {
    extract_instruments: extractInstrumentsTool,
    search_soundfont_catalog: searchSoundfontCatalogTool,
  },

  output: Output.object({
    schema: z.object({
      // Final ordered soundfont list for TiMidity (order matters!)
      soundfonts: z.array(z.string()).describe('Soundfont filenames in TiMidity load order (general GM first, specialty last)'),

      // Why this order
      layeringStrategy: z.string().describe('Brief explanation of the layering order and why'),

      // What instruments the composition uses (from extract_instruments)
      instrumentsCovered: z.array(z.string()).describe('Instruments/programs covered by this selection'),
    }),
  }),

  stopWhen: stepCountIs(12),
  toolChoice: 'auto',
});

/**
 * Select and arrange soundfonts for TiMidity, then generate the config file
 * @param {Object} options
 * @param {string} options.abcNotation - The ABC notation to analyze
 * @param {string} options.genre - Full genre name (e.g., "baroque_x_synthwave")
 * @param {string} options.classicalGenre - Classical component
 * @param {string} options.modernGenre - Modern component
 * @param {string} options.outputDir - Directory to write config file
 * @param {string} options.baseFilename - Base filename (without extension)
 * @returns {Promise<{configPath: string, soundfonts: string[], layeringStrategy: string}>}
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

  const stepLogger = createStepLogger('timidity-config');

  const prompt = `Arrange soundfonts for TiMidity playback of this composition.

Genre: ${genre} (${classicalGenre} fused with ${modernGenre})

ABC Notation:
\`\`\`
${abcNotation.substring(0, 2000)}${abcNotation.length > 2000 ? '\n[... truncated ...]' : ''}
\`\`\`

Steps:
1. First extract_instruments to see what MIDI programs this composition actually uses
2. Search the catalog for soundfonts covering those instruments
3. Search for "${classicalGenre}" style soundfonts
4. Search for "${modernGenre}" style soundfonts
5. Return your final ordered soundfont list`;

  const { output } = await timidityConfigAgent.generate({
    prompt,
    onStepFinish: stepLogger,
  });

  // Filter out any banned soundfonts the agent may have selected
  const safeSoundfonts = output.soundfonts.filter(sf => !BANNED_SOUNDFONTS.includes(sf));

  // Generate the actual config file (no LLM — pure code)
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
