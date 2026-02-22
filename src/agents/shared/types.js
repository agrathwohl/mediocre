/**
 * Shared TypeScript type definitions for AI SDK v6 agents
 * Use with JSDoc comments for type checking
 */

/**
 * @typedef {Object} CompositionOptions
 * @property {string} genre - Hybrid genre name (e.g., "baroque_x_synthwave")
 * @property {string} classicalGenre - Classical component
 * @property {string} modernGenre - Modern component
 * @property {string} [style] - Music style (default: "standard")
 * @property {boolean} [solo] - Include solo section
 * @property {string} [recordLabel] - Target record label sound
 * @property {string} [producer] - Target producer style
 * @property {string} [instruments] - Required instruments (comma-separated)
 * @property {boolean} [sequentialMode] - Use sequential expansion workflow
 * @property {boolean} [useStreaming] - Enable streaming output
 * @property {string} [customSystemPrompt] - Override system prompt
 * @property {string} [customUserPrompt] - Override user prompt
 */

/**
 * @typedef {Object} AgentStepInfo
 * @property {number} stepNumber - Current step number
 * @property {Array<{toolName: string, args: any}>} [toolCalls] - Tools called in this step
 * @property {{inputTokens: number, outputTokens: number}} [usage] - Token usage
 * @property {string} [finishReason] - Why the step finished
 */

/**
 * @typedef {Object} AgentResult
 * @property {string} text - Generated text output
 * @property {Array<{toolCalls: Array}>} steps - All agent steps
 * @property {{inputTokens: number, outputTokens: number}} usage - Total token usage
 */

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} isValid - Whether ABC notation is valid
 * @property {Array<string>} issues - List of validation issues
 * @property {string} cleanedNotation - Cleaned/fixed ABC notation
 */

/**
 * @typedef {Object} SoundfontSelection
 * @property {Array<string>} soundfonts - Selected soundfont filenames
 * @property {string} reasoning - Why these soundfonts were selected
 */

/**
 * @typedef {Object} QAAssessment
 * @property {boolean} passed - Whether quality check passed
 * @property {number} overallScore - Quality score (0-1)
 * @property {string} report - Detailed assessment report
 * @property {Array<string>} issues - Identified issues
 */

export {};
