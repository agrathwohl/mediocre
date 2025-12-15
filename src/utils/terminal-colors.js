/**
 * @fileoverview Shared ANSI terminal color codes and formatting utilities
 */

/**
 * ANSI color codes for terminal output
 */
export const colors = {
  red: '\x1b[0;31m',
  green: '\x1b[0;32m',
  yellow: '\x1b[1;33m',
  blue: '\x1b[0;34m',
  magenta: '\x1b[0;35m',
  cyan: '\x1b[0;36m',
  white: '\x1b[0;37m',
  reset: '\x1b[0m'
};

/**
 * Colorize text with specified color
 * @param {string} text - Text to colorize
 * @param {keyof colors} color - Color name
 * @returns {string} Colorized text
 */
export function colorize(text, color) {
  return `${colors[color] || ''}${text}${colors.reset}`;
}

/**
 * Status prefix helpers for consistent output formatting
 */
export const status = {
  success: `${colors.green}[✓]${colors.reset}`,
  error: `${colors.red}[✗]${colors.reset}`,
  warning: `${colors.yellow}[!]${colors.reset}`,
  info: `${colors.blue}[i]${colors.reset}`,
  music: `${colors.cyan}[♪]${colors.reset}`
};

export default colors;
