/**
 * Pattern Renderer Module
 * 
 * Renders procedural background patterns for terminal display:
 * - Noise: Random scattered characters
 * - Dots: Sparse dot pattern
 * - Grid: Regular grid lines
 * 
 * @module playback/rendering/pattern-renderer
 * 
 * @example
 * import { PatternRenderer } from './pattern-renderer.js';
 * 
 * const patterns = new PatternRenderer();
 * const char = patterns.renderPattern('noise', x, y, bgColor, fgColor);
 */

/**
 * Available pattern types
 * @type {string[]}
 */
export const PATTERN_TYPES = ['noise', 'dots', 'grid'];

/**
 * Pattern density constants
 * @type {Object}
 */
export const PATTERN_DENSITY = {
  noise: 0.25,  // 25% density
  dots: 0.10,   // 10% density
  grid: 0.05    // Lines only
};

/**
 * Pattern characters for each type
 * @type {Object}
 */
export const PATTERN_CHARS = {
  noise: ['░', '▒', '▓'],
  dots: ['·', '•', '∙'],
  grid: {
    h: '─',
    v: '│',
    corner: '┼'
  }
};

/**
 * Grid cell dimensions
 * @type {Object}
 */
export const GRID_CELL = {
  width: 8,
  height: 4
};

/**
 * PatternRenderer class for procedural background patterns
 */
export class PatternRenderer {
  /**
   * Creates a new PatternRenderer instance
   */
  constructor() {
    // Prime numbers for good hash distribution
    this.hashMultiplierX = 7919;
    this.hashMultiplierY = 7907;
  }

  /**
   * Gets a hash value for position-based patterns
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} [mod=1000] - Modulo value
   * @returns {number} Hash value
   */
  getPositionHash(x, y, mod = 1000) {
    return (x * this.hashMultiplierX + y * this.hashMultiplierY) % mod;
  }

  /**
   * Renders a procedural pattern at a specific position
   * @param {string} pattern - Pattern type ('noise', 'dots', 'grid')
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} bgColor - Background ANSI color
   * @param {Object|number} fgColor - Foreground RGB object or hue
   * @returns {Object} Pattern result { char, color }
   * @property {string} char - Character to render (null if no pattern)
   * @property {string} color - ANSI color string
   */
  renderPattern(pattern, x, y, bgColor, fgColor) {
    // Handle fgColor as object or number
    let fgAnsi;
    if (typeof fgColor === 'object' && fgColor.r !== undefined) {
      // RGB object
      fgAnsi = this.getContrastFg(fgColor.r, fgColor.g, fgColor.b);
    } else {
      // Assume it's already an ANSI string or use default
      fgAnsi = fgColor || '\x1b[38;2;255;255;255m';
    }

    switch (pattern) {
      case 'noise':
        return this.renderNoise(x, y, bgColor, fgAnsi);
      case 'dots':
        return this.renderDots(x, y, bgColor, fgAnsi);
      case 'grid':
        return this.renderGrid(x, y, bgColor, fgAnsi);
      default:
        return { char: null, color: bgColor };
    }
  }

  /**
   * Renders noise pattern at position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} bgColor - Background color
   * @param {string} fgColor - Foreground color
   * @returns {Object} { char, color }
   */
  renderNoise(x, y, bgColor, fgColor) {
    const hash = this.getPositionHash(x, y);
    const threshold = PATTERN_DENSITY.noise * 1000;

    if (hash < threshold) {
      const chars = PATTERN_CHARS.noise;
      const char = chars[hash % chars.length];
      return { char, color: fgColor + bgColor };
    }

    return { char: null, color: bgColor };
  }

  /**
   * Renders dots pattern at position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} bgColor - Background color
   * @param {string} fgColor - Foreground color
   * @returns {Object} { char, color }
   */
  renderDots(x, y, bgColor, fgColor) {
    const hash = this.getPositionHash(x, y);
    const threshold = PATTERN_DENSITY.dots * 1000;

    if (hash < threshold) {
      return { char: '·', color: fgColor + bgColor };
    }

    return { char: null, color: bgColor };
  }

  /**
   * Renders grid pattern at position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {string} bgColor - Background color
   * @param {string} fgColor - Foreground color
   * @returns {Object} { char, color }
   */
  renderGrid(x, y, bgColor, fgColor) {
    const { width: cellW, height: cellH } = GRID_CELL;
    const isVLine = x % cellW === 0;
    const isHLine = y % cellH === 0;

    if (isVLine || isHLine) {
      const chars = PATTERN_CHARS.grid;
      let char;
      
      if (isVLine && isHLine) {
        char = chars.corner;
      } else if (isVLine) {
        char = chars.v;
      } else {
        char = chars.h;
      }

      return { char, color: fgColor + bgColor };
    }

    return { char: null, color: bgColor };
  }

  /**
   * Gets contrasting foreground color for background RGB
   * @param {number} r - Red (0-255)
   * @param {number} g - Green (0-255)
   * @param {number} b - Blue (0-255)
   * @returns {string} ANSI foreground color
   */
  getContrastFg(r, g, b) {
    // Calculate relative luminance using standard formula
    const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    // Return black for light backgrounds, white for dark
    return luminance > 0.5 
      ? '\x1b[38;2;0;0;0m' 
      : '\x1b[38;2;255;255;255m';
  }

  /**
   * Checks if a pattern should render at this position
   * @param {string} pattern - Pattern type
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {boolean} True if pattern should render
   */
  shouldRender(pattern, x, y) {
    const hash = this.getPositionHash(x, y);
    const threshold = (PATTERN_DENSITY[pattern] || 0) * 1000;

    switch (pattern) {
      case 'noise':
      case 'dots':
        return hash < threshold;
      case 'grid':
        const { width: cellW, height: cellH } = GRID_CELL;
        return x % cellW === 0 || y % cellH === 0;
      default:
        return false;
    }
  }

  /**
   * Gets the character for a grid intersection
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @returns {string|null} Grid character or null
   */
  getGridChar(x, y) {
    const { width: cellW, height: cellH } = GRID_CELL;
    const isVLine = x % cellW === 0;
    const isHLine = y % cellH === 0;

    if (isVLine && isHLine) {
      return '┼';
    } else if (isVLine) {
      return '│';
    } else if (isHLine) {
      return '─';
    }

    return null;
  }

  /**
   * Validates if pattern type is supported
   * @param {string} pattern - Pattern type to validate
   * @returns {boolean} True if valid pattern
   */
  isValidPattern(pattern) {
    return PATTERN_TYPES.includes(pattern);
  }

  /**
   * Gets list of available pattern types
   * @returns {string[]} Array of pattern types
   */
  getAvailablePatterns() {
    return [...PATTERN_TYPES];
  }

  /**
   * Gets pattern description
   * @param {string} pattern - Pattern type
   * @returns {string} Description
   */
  getPatternDescription(pattern) {
    const descriptions = {
      noise: 'Random scattered characters (25% density)',
      dots: 'Sparse dot pattern (10% density)',
      grid: 'Regular grid lines with intersections'
    };
    return descriptions[pattern] || 'Unknown pattern';
  }
}

export default {
  PatternRenderer,
  PATTERN_TYPES,
  PATTERN_DENSITY,
  PATTERN_CHARS,
  GRID_CELL
};
