/**
 * ANSI color codes for terminal output
 * Centralized constants for consistent styling across CLI scripts
 */

export const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  gray: '\x1b[90m'
};

/**
 * Log colored message to console
 * @param {string} message - Message to log
 * @param {keyof colors} color - Color name from colors object (default: 'reset')
 */
export function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

/**
 * Log section header with cyan separators
 * @param {string} title - Section title
 */
export function logSection(title) {
  log(`\n${'='.repeat(60)}`, 'cyan');
  log(`  ${title}`, 'bright');
  log('='.repeat(60), 'cyan');
}
