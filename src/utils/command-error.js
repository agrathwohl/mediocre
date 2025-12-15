/**
 * Command Error Handling Utility
 * Provides consistent error handling patterns for CLI commands
 */

/**
 * Standard error codes for different error types
 * @type {Object<string, number>}
 */
export const ERROR_CODES = {
  GENERAL: 1,
  FILE_NOT_FOUND: 2,
  INVALID_INPUT: 3,
  AI_ERROR: 4,
  CONVERSION_ERROR: 5,
  NETWORK_ERROR: 6,
  VALIDATION_ERROR: 7,
  USER_INTERRUPTED: 130 // Standard SIGINT exit code
};

/**
 * Error prefixes for different error types
 * @type {Object<string, string>}
 */
const ERROR_PREFIXES = {
  generation: 'Error generating',
  conversion: 'Error converting',
  validation: 'Error validating',
  processing: 'Error processing',
  loading: 'Error loading',
  saving: 'Error saving',
  ai: 'AI error',
  network: 'Network error',
  file: 'File error'
};

/**
 * Handle command errors with consistent formatting and exit behavior
 *
 * @param {Error|string} error - Error object or message
 * @param {Object} options - Handler options
 * @param {string} [options.context] - Context description (e.g., "compositions", "MIDI files")
 * @param {string} [options.type='general'] - Error type (generation, conversion, etc.)
 * @param {boolean} [options.exit=false] - Whether to exit the process
 * @param {number} [options.exitCode=1] - Exit code if exiting
 * @param {boolean} [options.showStack=false] - Whether to show stack trace
 * @returns {void}
 *
 * @example
 * try {
 *   await generateComposition();
 * } catch (error) {
 *   handleCommandError(error, { context: 'composition', type: 'generation', exit: true });
 * }
 */
export function handleCommandError(error, options = {}) {
  const {
    context = '',
    type = 'general',
    exit = false,
    exitCode = ERROR_CODES.GENERAL,
    showStack = false
  } = options;

  const prefix = ERROR_PREFIXES[type] || 'Error';
  const contextStr = context ? ` ${context}` : '';
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(`${prefix}${contextStr}: ${errorMessage}`);

  if (showStack && error instanceof Error && error.stack) {
    console.error('\nStack trace:');
    console.error(error.stack);
  }

  if (exit) {
    process.exit(exitCode);
  }
}

/**
 * Wrap an async command action with error handling
 * This provides a cleaner pattern for command handlers
 *
 * @param {Function} action - Async action function
 * @param {Object} options - Error handling options
 * @param {string} [options.context] - Context description
 * @param {string} [options.type] - Error type
 * @param {boolean} [options.exit=true] - Whether to exit on error
 * @returns {Function} Wrapped action function
 *
 * @example
 * .action(withErrorHandling(
 *   async (options) => {
 *     await generateComposition(options);
 *   },
 *   { context: 'compositions', type: 'generation' }
 * ));
 */
export function withErrorHandling(action, options = {}) {
  const { exit = true, ...errorOptions } = options;

  return async (...args) => {
    try {
      return await action(...args);
    } catch (error) {
      handleCommandError(error, { ...errorOptions, exit });
    }
  };
}

/**
 * Create a contextualized error handler for a specific command
 * Useful when a command needs to handle multiple error scenarios
 *
 * @param {string} commandName - Name of the command for context
 * @returns {Object} Object with error handling methods
 *
 * @example
 * const errorHandler = createCommandErrorHandler('generate');
 * try {
 *   await generateAbc();
 * } catch (error) {
 *   errorHandler.handleGenerationError(error);
 * }
 */
export function createCommandErrorHandler(commandName) {
  return {
    /**
     * Handle generation errors
     * @param {Error} error - Error object
     * @param {boolean} exit - Whether to exit
     */
    handleGenerationError(error, exit = false) {
      handleCommandError(error, {
        context: commandName,
        type: 'generation',
        exit,
        exitCode: ERROR_CODES.GENERAL
      });
    },

    /**
     * Handle conversion errors
     * @param {Error} error - Error object
     * @param {boolean} exit - Whether to exit
     */
    handleConversionError(error, exit = false) {
      handleCommandError(error, {
        context: commandName,
        type: 'conversion',
        exit,
        exitCode: ERROR_CODES.CONVERSION_ERROR
      });
    },

    /**
     * Handle validation errors
     * @param {Error} error - Error object
     * @param {boolean} exit - Whether to exit
     */
    handleValidationError(error, exit = false) {
      handleCommandError(error, {
        context: commandName,
        type: 'validation',
        exit,
        exitCode: ERROR_CODES.VALIDATION_ERROR
      });
    },

    /**
     * Handle file errors
     * @param {Error} error - Error object
     * @param {boolean} exit - Whether to exit
     */
    handleFileError(error, exit = false) {
      handleCommandError(error, {
        context: commandName,
        type: 'file',
        exit,
        exitCode: ERROR_CODES.FILE_NOT_FOUND
      });
    },

    /**
     * Handle AI/LLM errors
     * @param {Error} error - Error object
     * @param {boolean} exit - Whether to exit
     */
    handleAIError(error, exit = false) {
      handleCommandError(error, {
        context: commandName,
        type: 'ai',
        exit,
        exitCode: ERROR_CODES.AI_ERROR
      });
    }
  };
}

/**
 * Check if an error is a user interruption (SIGINT/Ctrl+C)
 * @param {Error} error - Error to check
 * @returns {boolean} True if error is from user interruption
 */
export function isUserInterruption(error) {
  return error.signal === 'SIGINT' ||
         error.signal === 'SIGTERM' ||
         (error.exitCode === 130);
}

/**
 * Format error for display with optional details
 * @param {Error|string} error - Error to format
 * @param {Object} options - Formatting options
 * @param {boolean} [options.includeType=false] - Include error type/name
 * @param {boolean} [options.includeStack=false] - Include stack trace
 * @returns {string} Formatted error string
 */
export function formatError(error, options = {}) {
  const { includeType = false, includeStack = false } = options;

  let formatted = '';

  if (error instanceof Error) {
    if (includeType && error.name) {
      formatted += `[${error.name}] `;
    }
    formatted += error.message;

    if (includeStack && error.stack) {
      formatted += `\n${error.stack}`;
    }
  } else {
    formatted = String(error);
  }

  return formatted;
}
