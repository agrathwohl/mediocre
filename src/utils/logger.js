/**
 * Logger Utility
 * 
 * Centralized logging with consistent formatting and log levels.
 * Replaces scattered console.log/console.warn/console.error calls.
 * 
 * @module utils/logger
 * 
 * @example
 * import { logger } from './utils/logger.js';
 * 
 * logger.info('Starting process');
 * logger.warn('Deprecated feature used');
 * logger.error('Failed to connect', error);
 * logger.debug('Variable state:', { foo: 'bar' });
 */

import chalk from 'chalk';

/**
 * Log levels in order of severity
 */
const LOG_LEVELS = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

/**
 * Current log level (can be overridden via LOG_LEVEL env var)
 */
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

/**
 * Format a log message with timestamp and level
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @returns {string} Formatted message
 */
function formatMessage(level, message) {
  const timestamp = new Date().toISOString().split('T')[1].split('.')[0];
  return `[${timestamp}] ${level}: ${message}`;
}

/**
 * Logger object with methods for each log level
 */
export const logger = {
  /**
   * Log an error message
   * @param {string} message - Error message
   * @param {Error} [error] - Optional error object
   */
  error(message, error) {
    if (CURRENT_LEVEL >= LOG_LEVELS.ERROR) {
      console.error(chalk.red(formatMessage('ERROR', message)));
      if (error?.stack) {
        console.error(chalk.gray(error.stack));
      }
    }
  },

  /**
   * Log a warning message
   * @param {string} message - Warning message
   */
  warn(message) {
    if (CURRENT_LEVEL >= LOG_LEVELS.WARN) {
      console.warn(chalk.yellow(formatMessage('WARN', message)));
    }
  },

  /**
   * Log an info message
   * @param {string} message - Info message
   */
  info(message) {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log(chalk.blue(formatMessage('INFO', message)));
    }
  },

  /**
   * Log a success message
   * @param {string} message - Success message
   */
  success(message) {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log(chalk.green(formatMessage('SUCCESS', message)));
    }
  },

  /**
   * Log a debug message
   * @param {string} message - Debug message
   * @param {*} [data] - Optional data to log
   */
  debug(message, data) {
    if (CURRENT_LEVEL >= LOG_LEVELS.DEBUG) {
      console.log(chalk.gray(formatMessage('DEBUG', message)));
      if (data !== undefined) {
        console.log(chalk.gray(JSON.stringify(data, null, 2)));
      }
    }
  },

  /**
   * Log a section header
   * @param {string} title - Section title
   */
  section(title) {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log('\n' + chalk.cyan('═'.repeat(60)));
      console.log(chalk.cyan('  ' + title));
      console.log(chalk.cyan('═'.repeat(60)) + '\n');
    }
  },

  /**
   * Log a step in a process
   * @param {number} step - Step number
   * @param {string} description - Step description
   */
  step(step, description) {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      console.log(chalk.cyan(`  ${step}. ${description}`));
    }
  },

  /**
   * Log a result item
   * @param {string} label - Item label
   * @param {*} value - Item value
   */
  item(label, value) {
    if (CURRENT_LEVEL >= LOG_LEVELS.INFO) {
      const valueStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
      console.log(chalk.gray(`    • ${label}: ${valueStr}`));
    }
  }
};

export default logger;
