/**
 * Shared utility functions for AI SDK v6 agents
 * Helper functions for agent result extraction, logging, etc.
 */

/**
 * Extract the result from a 'done' tool call in agent steps
 * @param {Object} agentResult - The result from agent.generate()
 * @param {string} [fieldName='done'] - The tool name to extract from
 * @returns {any} The input from the done tool call, or null if not found
 */
export function extractDoneResult(agentResult, fieldName = 'done') {
  if (!agentResult || !agentResult.steps) {
    return null;
  }

  // Find the done tool call in step content (AI SDK v6 structure)
  for (const step of agentResult.steps) {
    if (!step.content) continue;

    const doneCall = step.content.find(
      item => item.type === 'tool-call' && item.toolName === fieldName
    );

    if (doneCall) {
      return doneCall.input;
    }
  }

  return null;
}

/**
 * Log agent step progress with formatted output
 * Use in onStepFinish callback
 * @param {Object} stepInfo - Step information from onStepFinish
 */
export function logAgentStep({ stepNumber, toolCalls, usage, finishReason }) {
  const toolNames = toolCalls?.map(tc => tc.toolName).join(', ') || 'text generation';
  const totalTokens = usage ? usage.inputTokens + usage.outputTokens : 0;

  console.log(`  Step ${stepNumber}: ${toolNames}`);
  if (usage) {
    console.log(`    Tokens: ${totalTokens} (in: ${usage.inputTokens}, out: ${usage.outputTokens})`);
  }
  if (finishReason && finishReason !== 'tool-calls') {
    console.log(`    Finish: ${finishReason}`);
  }
}

/**
 * Create a standard onStepFinish callback with logging
 * @param {string} agentName - Name of the agent (for logging context)
 * @returns {Function} onStepFinish callback function
 */
export function createStepLogger(agentName) {
  let totalTokens = 0;
  let stepCount = 0;

  return async (stepInfo) => {
    stepCount++;
    const stepTokens = stepInfo.usage
      ? stepInfo.usage.inputTokens + stepInfo.usage.outputTokens
      : 0;
    totalTokens += stepTokens;

    const stepNum = stepInfo.stepNumber || stepCount;
    console.log(`[${agentName}] Step ${stepNum}: ${stepInfo.toolCalls?.map(tc => tc.toolName).join(', ') || 'text'}`);

    if (stepInfo.usage) {
      console.log(`  Tokens: ${stepTokens} (total: ${totalTokens})`);
    }

    // Log completion on final step
    if (stepInfo.finishReason && stepInfo.finishReason !== 'tool-calls') {
      console.log(`[${agentName}] Complete: ${stepCount} steps, ${totalTokens} total tokens`);
    }
  };
}

/**
 * Build a composition prompt from options
 * @param {Object} options - Composition options
 * @returns {string} Formatted prompt for agent
 */
export function buildCompositionPrompt(options) {
  const {
    genre,
    classicalGenre,
    modernGenre,
    style,
    solo,
    recordLabel,
    producer,
    instruments,
  } = options;

  const parts = [
    `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}.`,
    '',
    `Style: ${style}`,
  ];

  if (solo) {
    parts.push('Include a dedicated solo section for the lead instrument.');
  }

  if (recordLabel) {
    parts.push(`Style the composition to sound like it was released on the record label "${recordLabel}".`);
  }

  if (producer) {
    parts.push(`Produce the composition in the style of ${producer}.`);
  }

  if (instruments) {
    parts.push(`Required instruments: ${instruments}`);
  }

  parts.push('');
  parts.push('Generate complete ABC notation with:');
  parts.push('- Unique title (T:)');
  parts.push('- Proper headers (X:, M:, L:, K:)');
  parts.push('- Multi-voice arrangement if appropriate');
  parts.push('- MIDI program assignments (%%MIDI program)');
  parts.push('- Authentic genre fusion in both harmony and melody');

  return parts.join('\n');
}

/**
 * Performance metrics tracker for agents
 */
export class AgentMetrics {
  constructor(agentName) {
    this.agentName = agentName;
    this.startTime = Date.now();
    this.totalTokens = 0;
    this.stepCount = 0;
    this.toolCalls = [];
  }

  recordStep(stepInfo) {
    this.stepCount++;

    if (stepInfo.usage) {
      this.totalTokens += stepInfo.usage.inputTokens + stepInfo.usage.outputTokens;
    }

    if (stepInfo.toolCalls) {
      this.toolCalls.push(...stepInfo.toolCalls.map(tc => tc.toolName));
    }
  }

  getReport() {
    const duration = Date.now() - this.startTime;
    return {
      agent: this.agentName,
      duration: `${(duration / 1000).toFixed(2)}s`,
      steps: this.stepCount,
      totalTokens: this.totalTokens,
      tokensPerStep: this.stepCount > 0 ? Math.round(this.totalTokens / this.stepCount) : 0,
      toolCallCount: this.toolCalls.length,
      uniqueTools: [...new Set(this.toolCalls)],
    };
  }

  logReport() {
    const report = this.getReport();
    console.log(`\n[${this.agentName}] Performance Report:`);
    console.log(`  Duration: ${report.duration}`);
    console.log(`  Steps: ${report.steps}`);
    console.log(`  Total Tokens: ${report.totalTokens} (avg ${report.tokensPerStep}/step)`);
    console.log(`  Tool Calls: ${report.toolCallCount} (${report.uniqueTools.join(', ')})`);
  }
}
