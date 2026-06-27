/**
 * Soundfont Selection Agent - AI SDK v6
 * Selects optimal soundfont combinations for genre-specific compositions
 * Uses structured output for guaranteed format and categorization
 */

import { ToolLoopAgent, Output, stepCountIs } from 'ai';
import { z } from 'zod';
import { exploreSoundFontsForComposition } from '../../utils/soundfont-tools.js';
import { searchSoundfontCatalogTool, getSoundfontDetailsTool, checkProgramCoverageTool } from '../shared/tools.js';
import { createStepLogger } from '../shared/utils.js';
import { getAnthropic, getModel } from '../../utils/llm-client.js';

let _soundfontAgent = null;
function getSoundfontAgent() {
  if (!_soundfontAgent) {
    const anthropic = getAnthropic();
    _soundfontAgent = new ToolLoopAgent({
      model: anthropic(getModel('claude-haiku-4-5-20251001'), {
        cacheControl: { type: 'ephemeral', ttl: '1h' },
      }),

  instructions: `You are a music producer selecting soundfonts for compositions.

Your task is to analyze genre requirements and select optimal soundfont combinations.

You have access to a catalog of 500 soundfonts with 81,415 presets.

AVAILABLE TOOLS:
- search_soundfont_catalog: Search for soundfonts by keyword (supports synonyms like 'synth' → synthesizer/analog/digital). Returns matched presets with MIDI program numbers and GM names.
- get_soundfont_details: Inspect a specific soundfont to see ALL its presets (bank, program, GM instrument name). Use this to verify a soundfont has the instruments you need.
- check_program_coverage: Verify which MIDI programs (0-127) are covered by your selected soundfont stack. Shows gaps and which soundfont provides each program.

WORKFLOW:
1. Search catalog for genre-relevant soundfonts using keywords
2. Inspect promising soundfonts with get_soundfont_details to verify preset coverage
3. Build your selection of 15-30 soundfonts
4. Use check_program_coverage to verify your stack covers all needed MIDI programs
5. Adjust selection if coverage gaps found

CRITICAL RULES:
1. Always include at least ONE general GM soundfont as base (GeneralUser GS, FluidR3 GM, SGM-128)
2. Select 15-30 soundfonts total - BUILD A RICH PALETTE
3. Later soundfonts OVERRIDE earlier ones for same instruments
4. Order: General GM first, then specialty soundfonts to override specific instruments
5. Include variety: drums/percussion, bass, strings, pads, leads, genre-specific
6. MORE IS BETTER - each soundfont adds depth and character

Categorize selections by purpose for clarity.`,

  tools: {
    search_soundfont_catalog: searchSoundfontCatalogTool,
    get_soundfont_details: getSoundfontDetailsTool,
    check_program_coverage: checkProgramCoverageTool,
  },

  output: Output.object({
    schema: z.object({
      // Main soundfont list (final order for TiMidity)
      soundfonts: z.array(z.string()).describe('Soundfont filenames in load order (15-30 total)'),

      // Categorized breakdown for transparency
      categories: z.object({
        general: z.array(z.string()).describe('General GM soundfonts (base layer)'),
        drums: z.array(z.string()).describe('Drum and percussion soundfonts'),
        bass: z.array(z.string()).describe('Bass instrument soundfonts'),
        strings: z.array(z.string()).describe('String instrument soundfonts'),
        synth: z.array(z.string()).describe('Synthesizer and pad soundfonts'),
        specialty: z.array(z.string()).describe('Genre-specific specialty soundfonts'),
      }),

      // Selection reasoning
      reasoning: z.string().describe('Brief explanation of why these soundfonts work for this genre fusion'),

      // Coverage assessment
      coverage: z.object({
        classical: z.array(z.string()).describe('Soundfonts addressing classical genre needs'),
        modern: z.array(z.string()).describe('Soundfonts addressing modern genre needs'),
        hybrid: z.array(z.string()).describe('Soundfonts bridging both genres'),
      }),
    }),
  }),

  stopWhen: stepCountIs(10),
  toolChoice: 'auto',
    });
  }
  return _soundfontAgent;
}

/**
 * Select soundfonts using the agent
 * @param {Object} options - Selection options
 * @param {string} options.genre - Full genre name (e.g., "baroque_x_synthwave")
 * @param {string} options.classicalGenre - Classical component
 * @param {string} options.modernGenre - Modern component
 * @param {string} [options.instruments] - Required instruments
 * @returns {Promise<Object>} Soundfont selection with categorization
 */
export async function selectSoundfontsWithAgent(options) {
  const {
    genre = 'Classical_x_Contemporary',
    classicalGenre = 'Classical',
    modernGenre = 'Contemporary',
    instruments = '',
  } = options;

  // Get soundfont exploration data
  const exploration = await exploreSoundFontsForComposition({
    genreHybrid: genre,
    requiredInstruments: instruments
      ? instruments.split(',').map(i => i.trim())
      : [],
    style: '',
  });

  // Format available soundfonts for the agent
  const availableSoundfonts = `
## Primary Recommendations (Best matches for ${genre}):
${exploration.genreRecommendations.primary.map(sf =>
  `- ${sf.filename} (score: ${sf.score}, presets: ${sf.presetCount}) - Keywords: ${sf.matchedKeywords.join(', ')}`
).join('\n')}

## Secondary Options:
${exploration.genreRecommendations.secondary.map(sf => `- ${sf.filename}`).join('\n')}

## Auto-Suggested Selection:
${exploration.suggestedSelection.join(', ')}

## Categories Available:
- Drums: ${exploration.categoryResults.drums.slice(0, 5).map(sf => sf.filename).join(', ')}
- Bass: ${exploration.categoryResults.bass.slice(0, 5).map(sf => sf.filename).join(', ')}
- Strings: ${exploration.categoryResults.strings.slice(0, 5).map(sf => sf.filename).join(', ')}
- Synth: ${exploration.categoryResults.synth.slice(0, 5).map(sf => sf.filename).join(', ')}
`;

  const prompt = `Select optimal soundfonts for ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}).

${instruments ? `Required instruments: ${instruments}\n` : ''}
Available soundfonts and recommendations:
${availableSoundfonts}

Select 15-30 soundfonts with:
1. General GM base soundfont(s) first
2. Specialty soundfonts to override specific instruments
3. Coverage for both classical and modern genre needs
4. Categorized by purpose for clarity`;

  try {
    const { output: selection } = await getSoundfontAgent().generate({
      prompt,
      onStepFinish: createStepLogger('SoundfontAgent'),
    });

    console.log(`✅ Selected ${selection.soundfonts.length} soundfonts`);
    console.log(`   General: ${selection.categories.general.length}, Drums: ${selection.categories.drums.length}, Specialty: ${selection.categories.specialty.length}`);
    console.log(`   Reasoning: ${selection.reasoning}`);

    return selection;

  } catch (error) {
    console.error('Soundfont agent error:', error.message);

    // Fallback to default soundfonts
    return {
      soundfonts: [
        'GeneralUser GS v1.471.sf2',
        'FluidR3 GM + GS.sf2',
        'SGM-128 v1.17.sf2',
      ],
      categories: {
        general: ['GeneralUser GS v1.471.sf2', 'FluidR3 GM + GS.sf2', 'SGM-128 v1.17.sf2'],
        drums: [],
        bass: [],
        strings: [],
        synth: [],
        specialty: [],
      },
      reasoning: 'Using default GM soundfonts due to selection error',
      coverage: {
        classical: ['GeneralUser GS v1.471.sf2'],
        modern: ['FluidR3 GM + GS.sf2'],
        hybrid: ['SGM-128 v1.17.sf2'],
      },
    };
  }
}
