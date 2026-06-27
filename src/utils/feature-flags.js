/**
 * Feature Flag System for AI SDK v6 Agent Rollout
 * Allows gradual migration from traditional to agent-based generation
 */

/**
 * Global feature flags
 * Can be controlled via environment variables or CLI flags
 */
export const features = {
  // Master switch for all agent functionality
  useAgents: process.env.USE_AGENTS === 'true',

  // Individual agent enable/disable flags
  agentMode: {
    title: process.env.AGENT_TITLE === 'true',
    composition: process.env.AGENT_COMPOSITION === 'true',
    qa: process.env.AGENT_QA === 'true',
    soundfont: process.env.AGENT_SOUNDFONT === 'true',
    description: process.env.AGENT_DESCRIPTION === 'true',
    ornamentation: process.env.AGENT_ORNAMENTATION === 'true',
    midiExtensions: process.env.AGENT_MIDI_EXTENSIONS === 'true',
    timidityConfig: process.env.AGENT_TIMIDITY_CONFIG === 'true',
    sequential: process.env.AGENT_SEQUENTIAL === 'true',
  },

  // Playback engine selection
  playback: {
    useFluidSynth: process.env.USE_FLUIDSYNTH === 'true',
    useTiMidity: process.env.USE_TIMIDITY !== 'false', // Default to TiMidity, opt-out with USE_TIMIDITY=false
  },

  // A/B testing configuration
  abTesting: {
    enabled: process.env.AB_TESTING === 'true',
    agentPercentage: parseInt(process.env.AB_AGENT_PERCENTAGE || '0', 10),
  },
};

/**
 * Check if a specific agent is enabled
 * Respects both master switch and individual agent flags
 * @param {string} agentName - Name of the agent (e.g., 'composition', 'title')
 * @returns {boolean} Whether the agent should be used
 */
export function isAgentEnabled(agentName) {
  if (!features.useAgents) {
    return false; // Master switch disabled
  }

  if (features.agentMode[agentName] === undefined) {
    console.warn(`Unknown agent: ${agentName}`);
    return false;
  }

  return features.agentMode[agentName];
}

/**
 * Enable an agent at runtime
 * @param {string} agentName - Name of the agent to enable
 */
export function enableAgent(agentName) {
  if (features.agentMode[agentName] !== undefined) {
    features.agentMode[agentName] = true;
  }
}

/**
 * Disable an agent at runtime
 * @param {string} agentName - Name of the agent to disable
 */
export function disableAgent(agentName) {
  if (features.agentMode[agentName] !== undefined) {
    features.agentMode[agentName] = false;
  }
}

/**
 * Enable all agents (master switch + all individual agents)
 */
export function enableAllAgents() {
  features.useAgents = true;
  Object.keys(features.agentMode).forEach(agent => {
    features.agentMode[agent] = true;
  });
}

/**
 * Disable all agents (revert to traditional generation)
 */
export function disableAllAgents() {
  features.useAgents = false;
  Object.keys(features.agentMode).forEach(agent => {
    features.agentMode[agent] = false;
  });
}

/**
 * A/B testing: Randomly decide if agents should be used
 * Based on configured percentage (0-100)
 * @returns {boolean} Whether to use agents for this request
 */
export function shouldUseAgentsAB() {
  if (!features.abTesting.enabled) {
    return features.useAgents;
  }

  const random = Math.random() * 100;
  return random < features.abTesting.agentPercentage;
}

/**
 * Check if FluidSynth playback is enabled
 * @returns {boolean} Whether to use FluidSynth for playback
 */
export function useFluidSynthPlayback() {
  return features.playback.useFluidSynth;
}

/**
 * Check if TiMidity playback is enabled
 * @returns {boolean} Whether to use TiMidity for playback
 */
export function useTiMidityPlayback() {
  return features.playback.useTiMidity && !features.playback.useFluidSynth;
}

/**
 * Get current feature flag status as object
 * @returns {Object} Current feature flag configuration
 */
export function getFeatureStatus() {
  return {
    masterSwitch: features.useAgents,
    agents: { ...features.agentMode },
    playback: { ...features.playback },
    abTesting: { ...features.abTesting },
  };
}

/**
 * Print feature flag status to console
 */
export function printFeatureStatus() {
  console.log('\n🚩 Feature Flags Status:');
  console.log(`  Master Switch: ${features.useAgents ? '✅ ON' : '❌ OFF'}`);
  console.log('  Individual Agents:');
  Object.entries(features.agentMode).forEach(([name, enabled]) => {
    console.log(`    ${name}: ${enabled ? '✅' : '❌'}`);
  });
  console.log('  Playback Engine:');
  console.log(`    FluidSynth: ${features.playback.useFluidSynth ? '✅' : '❌'}`);
  console.log(`    TiMidity: ${features.playback.useTiMidity ? '✅' : '❌'}`);
  if (features.abTesting.enabled) {
    console.log(`  A/B Testing: ${features.abTesting.agentPercentage}% agents`);
  }
  console.log('');
}
