/**
 * AI Options Utility
 * Centralizes AI provider configuration from CLI options
 */

import { config } from './config.js';

/**
 * Sets AI provider configuration from CLI command options
 * This eliminates the repeated pattern of checking and setting each option
 *
 * @param {Object} options - Command options from Commander.js
 * @param {string} [options.aiProvider] - AI provider to use ('anthropic' or 'ollama')
 * @param {string} [options.model] - AI model to use
 * @param {string} [options.ollamaEndpoint] - Ollama API endpoint URL
 * @returns {void}
 *
 * @example
 * // In a command action handler:
 * .action(async (options) => {
 *   setAIProviderFromOptions(options);
 *   // ... rest of command logic
 * });
 */
export function setAIProviderFromOptions(options) {
  if (options.aiProvider) {
    config.set('aiProvider', options.aiProvider);
  }
  if (options.model) {
    config.set('ollamaModel', options.model);
  }
  if (options.ollamaEndpoint) {
    config.set('ollamaEndpoint', options.ollamaEndpoint);
  }
}

