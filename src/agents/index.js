/**
 * Agent Registry - Central export point for all AI SDK v6 agents
 * Import agents from this file for consistent access
 */

// Shared utilities and tools
export * from './shared/tools.js';
export * from './shared/utils.js';

// Individual agents will be exported as they're implemented
export { titleAgent, ensureUniqueTitleWithAgent } from './title/index.js';
export { compositionAgent, generateMusicWithAgent } from './composition/index.js';
export { qaAgent, reviewCompositionWithAgent, generateWithQA } from './qa/index.js';
export { soundfontAgent, selectSoundfontsWithAgent } from './soundfont/index.js';
export { timidityConfigAgent, arrangeSoundfontsAndGenerateConfig } from './timidity-config/index.js';

/**
 * Agent availability flags
 * Used for feature detection and graceful degradation
 */
export const agentAvailability = {
  title: true, // ✅ Implemented in Phase 1
  composition: true, // ✅ Implemented in Phase 1
  qa: true, // ✅ Implemented in Phase 2.1
  soundfont: true, // ✅ Implemented in Phase 2.2
  description: false,
  ornamentation: false,
  midiExtensions: false,
  timidityConfig: true, // ✅ Implemented
  sequential: false,
};

/**
 * Check if a specific agent is available
 * @param {string} agentName - Name of the agent to check
 * @returns {boolean} Whether the agent is available
 */
export function isAgentAvailable(agentName) {
  return agentAvailability[agentName] === true;
}
