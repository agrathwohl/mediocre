/**
 * claude.js — Barrel re-export for backward compatibility
 *
 * The original 1,989-line monolith has been split into focused modules:
 *   llm-client.js  — Anthropic provider + text utilities
 *   validation.js  — ABC / MusicXML validation + cleaning
 *   title-utils.js — Title existence checks + unique-title generation
 *   soundfonts.js  — Soundfont selection + TiMidity config persistence
 *   generation.js  — All LLM generation functions (ABC, MusicXML, lyrics, descriptions)
 *
 * Every consumer that imports from '../utils/claude.js' continues to work
 * without changes. New code should import directly from the focused modules.
 */


export { getAnthropic, stripMarkdownCodeFences } from './llm-client.js';


export {
  validateAbcNotation,
  cleanAbcNotation,
  validateWithAbc2Midi,
  validateMusicXml,
  validateWithMusicXmlParser,
} from './validation.js';


export {
  getExistingTitlesSet,
  extractTitleFromAbc,
  titleExists,
  ensureUniqueTitle,
} from './title-utils.js';


export {
  SOUNDFONT_PALETTE_INFO,
  selectSoundfontsWithClaude,
  saveCustomTimidityConfig,
} from './soundfonts.js';


export {
  generateMusicWithClaude,
  generateMusicWithSoundfonts,
  modifyCompositionWithClaude,
  generateDescription,
  evaluateCompositionCompleteness,
  addLyricsWithClaude,
  generateMusicXmlWithClaude,
  generateMusicXmlDescription,
  modifyMusicXmlComposition,
  evaluateMusicXmlCompleteness,
} from './generation.js';
