/**
 * Logger Utility
 * Provides consistent logging patterns with emoji prefixes and formatting
 */

import { config } from './config.js';

/**
 * Status emojis for different log types
 * @type {Object<string, string>}
 */
const EMOJI = {
  // Status indicators
  success: '✅',
  error: '❌',
  warning: '⚠️',
  info: 'ℹ️',
  pending: '⏳',
  loading: '🔄',

  // Domain-specific
  music: '🎵',
  audio: '🔊',
  file: '📁',
  folder: '📂',
  config: '🔧',
  ai: '🤖',
  generate: '✨',
  convert: '🔄',
  play: '▶️',
  stop: '⏹️',
  time: '⏱️',

  // Results
  check: '✓',
  cross: '✗',
  bullet: '•',
  arrow: '→'
};

/**
 * Log a success message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function success(message, ...args) {
  console.log(`${EMOJI.success} ${message}`, ...args);
}

/**
 * Log an error message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function error(message, ...args) {
  console.error(`${EMOJI.error} ${message}`, ...args);
}

/**
 * Log a warning message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function warn(message, ...args) {
  console.warn(`${EMOJI.warning} ${message}`, ...args);
}

/**
 * Log an info message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function info(message, ...args) {
  console.log(`${EMOJI.info} ${message}`, ...args);
}

/**
 * Log a music-related message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function music(message, ...args) {
  console.log(`${EMOJI.music} ${message}`, ...args);
}

/**
 * Log an audio-related message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function audio(message, ...args) {
  console.log(`${EMOJI.audio} ${message}`, ...args);
}

/**
 * Log a configuration message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function configMsg(message, ...args) {
  console.log(`${EMOJI.config} ${message}`, ...args);
}

/**
 * Log a generation message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function generate(message, ...args) {
  console.log(`${EMOJI.generate} ${message}`, ...args);
}

/**
 * Log a file operation message
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function file(message, ...args) {
  console.log(`${EMOJI.file} ${message}`, ...args);
}

/**
 * Log verbose output (only if verbose mode is enabled)
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function verbose(message, ...args) {
  if (config.get('verbose')) {
    console.log(`[verbose] ${message}`, ...args);
  }
}

/**
 * Log debug output (only if verbose mode is enabled)
 * @param {string} message - Message to log
 * @param {...any} args - Additional arguments to log
 */
export function debug(message, ...args) {
  if (config.get('verbose')) {
    console.log(`[debug] ${message}`, ...args);
  }
}

/**
 * Create a progress logger for multi-step operations
 * @param {string} operation - Name of the operation
 * @param {number} total - Total number of steps
 * @returns {Object} Progress logger with step() and complete() methods
 */
export function createProgress(operation, total) {
  let current = 0;

  return {
    /**
     * Log progress for current step
     * @param {string} stepName - Name of the current step
     */
    step(stepName) {
      current++;
      console.log(`${EMOJI.loading} [${current}/${total}] ${operation}: ${stepName}`);
    },

    /**
     * Log completion of the operation
     * @param {string} [message] - Optional completion message
     */
    complete(message) {
      const completionMsg = message || `${operation} complete`;
      console.log(`${EMOJI.success} ${completionMsg} (${total} steps)`);
    },

    /**
     * Log failure of the operation
     * @param {string} [message] - Optional failure message
     */
    fail(message) {
      const failMsg = message || `${operation} failed at step ${current}/${total}`;
      console.error(`${EMOJI.error} ${failMsg}`);
    }
  };
}

/**
 * Log a section header
 * @param {string} title - Section title
 */
export function section(title) {
  console.log();
  console.log(`${'─'.repeat(40)}`);
  console.log(`  ${title}`);
  console.log(`${'─'.repeat(40)}`);
}

/**
 * Log a list of items
 * @param {string[]} items - Items to list
 * @param {Object} options - Options
 * @param {string} [options.prefix='•'] - Prefix for each item
 * @param {number} [options.indent=2] - Indentation spaces
 */
export function list(items, options = {}) {
  const { prefix = EMOJI.bullet, indent = 2 } = options;
  const spaces = ' '.repeat(indent);

  items.forEach(item => {
    console.log(`${spaces}${prefix} ${item}`);
  });
}

/**
 * Log a key-value pair
 * @param {string} key - Key name
 * @param {any} value - Value
 * @param {Object} options - Options
 * @param {number} [options.keyWidth=20] - Width for key column
 */
export function keyValue(key, value, options = {}) {
  const { keyWidth = 20 } = options;
  console.log(`${key.padEnd(keyWidth)}: ${value}`);
}

/**
 * Log multiple key-value pairs
 * @param {Object} pairs - Object with key-value pairs
 * @param {Object} options - Options passed to keyValue
 */
export function keyValuePairs(pairs, options = {}) {
  Object.entries(pairs).forEach(([key, value]) => {
    keyValue(key, value, options);
  });
}

/**
 * Create a namespaced logger
 * @param {string} namespace - Namespace prefix
 * @returns {Object} Logger with all methods prefixed with namespace
 */
export function createLogger(namespace) {
  const prefix = `[${namespace}]`;

  return {
    success: (msg, ...args) => success(`${prefix} ${msg}`, ...args),
    error: (msg, ...args) => error(`${prefix} ${msg}`, ...args),
    warn: (msg, ...args) => warn(`${prefix} ${msg}`, ...args),
    info: (msg, ...args) => info(`${prefix} ${msg}`, ...args),
    verbose: (msg, ...args) => verbose(`${prefix} ${msg}`, ...args),
    debug: (msg, ...args) => debug(`${prefix} ${msg}`, ...args),
    log: (msg, ...args) => console.log(`${prefix} ${msg}`, ...args)
  };
}

// Export emojis for custom usage
export { EMOJI };

// Default export for convenience
export default {
  success,
  error,
  warn,
  info,
  music,
  audio,
  configMsg,
  generate,
  file,
  verbose,
  debug,
  createProgress,
  section,
  list,
  keyValue,
  keyValuePairs,
  createLogger,
  EMOJI
};
