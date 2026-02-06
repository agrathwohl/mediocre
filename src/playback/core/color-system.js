/**
 * Color System Module
 * 
 * Generates and manages colors for ASCII art visualizations.
 * Provides HSL to ANSI color conversion and audio-reactive color generation.
 * 
 * @module playback/core/color-system
 * 
 * @example
 * import { ColorSystem } from './color-system.js';
 * 
 * const colors = new ColorSystem();
 * 
 * // Get vibrant color based on audio amplitude
 * const ansiCode = colors.getVibrantColor(0.8, elapsedTime);
 * process.stdout.write(ansiCode + 'Hello World');
 */

/**
 * ColorSystem class for generating and managing terminal colors
 */
export class ColorSystem {
  /**
   * Creates a new ColorSystem instance
   */
  constructor() {
    /** @type {number} Internal time accumulator for color cycling */
    this.time = 0;
  }

  /**
   * Generates a vibrant HSL color based on audio amplitude and time
   * 
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} time - Elapsed time in seconds
   * @param {string} [type="main"] - Color type ("main", "accent", etc.)
   * @returns {string} ANSI escape code for 24-bit color
   * 
   * @example
   * const color = colors.getVibrantColor(0.8, 10.5);
   * // Returns something like "\x1B[38;2;255;128;64m"
   */
  getVibrantColor(amplitude, time, type = "main") {
    const hue = (time * 50 + amplitude * 360) % 360;
    const saturation = 70 + amplitude * 30; // 70-100%
    const lightness = 40 + amplitude * 30; // 40-70%

    return this.hslToAnsi(hue, saturation, lightness);
  }

  /**
   * Converts HSL color values to ANSI 24-bit color escape code
   * 
   * @param {number} h - Hue (0-360 degrees)
   * @param {number} s - Saturation (0-100 percent)
   * @param {number} l - Lightness (0-100 percent)
   * @returns {string} ANSI escape code for foreground color
   * 
   * @example
   * const ansi = colors.hslToAnsi(120, 100, 50); // Bright green
   * // Returns "\x1B[38;2;0;255;0m"
   */
  hslToAnsi(h, s, l) {
    // Convert HSL to RGB
    const c = ((1 - Math.abs((2 * l) / 100 - 1)) * s) / 100;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l / 100 - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (h < 60) {
      [r, g, b] = [c, x, 0];
    } else if (h < 120) {
      [r, g, b] = [x, c, 0];
    } else if (h < 180) {
      [r, g, b] = [0, c, x];
    } else if (h < 240) {
      [r, g, b] = [0, x, c];
    } else if (h < 300) {
      [r, g, b] = [x, 0, c];
    } else {
      [r, g, b] = [c, 0, x];
    }

    // Convert to 0-255 range
    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    // Return ANSI 24-bit color escape code for foreground
    return `\x1B[38;2;${r};${g};${b}m`;
  }

  /**
   * Generates a background color (complementary to foreground)
   * 
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} time - Elapsed time in seconds
   * @returns {string} ANSI escape code for background color
   * 
   * @example
   * const bgColor = colors.getBackgroundColor(0.5, 10.0);
   * // Returns dark background color code
   */
  getBackgroundColor(amplitude, time) {
    const hue = (time * 30 + 180) % 360; // Complementary to foreground
    const saturation = 20 + amplitude * 30; // 20-50% for background
    const lightness = 10 + amplitude * 15; // 10-25% for dark background

    const c = ((1 - Math.abs((2 * lightness) / 100 - 1)) * saturation) / 100;
    const x = c * (1 - Math.abs(((hue / 60) % 2) - 1));
    const m = lightness / 100 - c / 2;

    let r = 0,
      g = 0,
      b = 0;

    if (hue < 60) {
      [r, g, b] = [c, x, 0];
    } else if (hue < 120) {
      [r, g, b] = [x, c, 0];
    } else if (hue < 180) {
      [r, g, b] = [0, c, x];
    } else if (hue < 240) {
      [r, g, b] = [0, x, c];
    } else if (hue < 300) {
      [r, g, b] = [x, 0, c];
    } else {
      [r, g, b] = [c, 0, x];
    }

    r = Math.round((r + m) * 255);
    g = Math.round((g + m) * 255);
    b = Math.round((b + m) * 255);

    // Return ANSI 24-bit color escape code for background
    return `\x1B[48;2;${r};${g};${b}m`;
  }

  /**
   * Generates a bright border color for object outlines
   * 
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} time - Elapsed time in seconds
   * @returns {string} ANSI escape code for border color
   * 
   * @example
   * const border = colors.getBorderColor(0.9, 15.0);
   * // Returns bright, high-contrast color
   */
  getBorderColor(amplitude, time) {
    // Bright, contrasting colors for borders
    const hue = (time * 100) % 360;
    const saturation = 90 + amplitude * 10; // 90-100%
    const lightness = 50 + amplitude * 20; // 50-70%

    return this.hslToAnsi(hue, saturation, lightness);
  }

  /**
   * Generates a softer interior color for object fills
   * 
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} time - Elapsed time in seconds
   * @returns {string} ANSI escape code for interior color
   * 
   * @example
   * const interior = colors.getInteriorColor(0.6, 12.5);
   * // Returns softer, muted color
   */
  getInteriorColor(amplitude, time) {
    // Softer colors for interior
    const hue = (time * 75 + 90) % 360;
    const saturation = 50 + amplitude * 30; // 50-80%
    const lightness = 45 + amplitude * 25; // 45-70%

    return this.hslToAnsi(hue, saturation, lightness);
  }

  /**
   * Updates the internal time accumulator
   * 
   * @param {number} deltaTime - Time elapsed since last update (in seconds)
   * 
   * @example
   * colors.update(0.016); // Update for 16ms frame
   */
  update(deltaTime) {
    this.time += deltaTime;
  }

  /**
   * Gets complementary color (180 degrees opposite on color wheel)
   * 
   * @param {number} hue - Base hue (0-360)
   * @returns {number} Complementary hue
   * 
   * @example
   * const compHue = colors.getComplementaryHue(120); // Returns 300 (magenta)
   */
  getComplementaryHue(hue) {
    return (hue + 180) % 360;
  }

  /**
   * Generates analogous colors (adjacent on color wheel)
   * 
   * @param {number} hue - Base hue (0-360)
   * @returns {number[]} Array of 3 analogous hues
   * 
   * @example
   * const hues = colors.getAnalogousHues(120);
   * // Returns [90, 120, 150] (yellow-green, green, cyan-green)
   */
  getAnalogousHues(hue) {
    return [(hue - 30 + 360) % 360, hue, (hue + 30) % 360];
  }

  /**
   * Generates triadic colors (120 degrees apart)
   * 
   * @param {number} hue - Base hue (0-360)
   * @returns {number[]} Array of 3 triadic hues
   * 
   * @example
   * const hues = colors.getTriadicHues(0);
   * // Returns [0, 120, 240] (red, green, blue)
   */
  getTriadicHues(hue) {
    return [hue, (hue + 120) % 360, (hue + 240) % 360];
  }

  /**
   * Resets the internal time accumulator
   */
  reset() {
    this.time = 0;
  }

  /**
   * Gets the current internal time
   * @returns {number} Current time value
   */
  getTime() {
    return this.time;
  }

  /**
   * Sets the internal time directly
   * @param {number} time - New time value
   */
  setTime(time) {
    this.time = time;
  }
}

/**
 * Color utility functions
 */

/**
 * Clamp a value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

/**
 * Interpolate between two values
 * @param {number} start - Start value
 * @param {number} end - End value
 * @param {number} t - Interpolation factor (0.0 to 1.0)
 * @returns {number} Interpolated value
 */
export function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Interpolate between two HSL colors
 * @param {Object} color1 - First color {h, s, l}
 * @param {Object} color2 - Second color {h, s, l}
 * @param {number} t - Interpolation factor (0.0 to 1.0)
 * @returns {Object} Interpolated color {h, s, l}
 */
export function lerpHSL(color1, color2, t) {
  // Handle hue wrapping (shortest path around color wheel)
  let h1 = color1.h;
  let h2 = color2.h;
  
  const diff = h2 - h1;
  if (diff > 180) h2 -= 360;
  if (diff < -180) h2 += 360;
  
  return {
    h: (lerp(h1, h2, t) + 360) % 360,
    s: lerp(color1.s, color2.s, t),
    l: lerp(color1.l, color2.l, t)
  };
}

/**
 * Convert RGB to HSL
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {Object} HSL color {h, s, l}
 */
export function rgbToHsl(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s, l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: h * 360,
    s: s * 100,
    l: l * 100
  };
}

/**
 * ANSI reset code to return to default terminal colors
 * @type {string}
 */
export const RESET_COLOR = '\x1B[0m';

/**
 * ANSI codes for basic 16 colors
 * @type {Object.<string, string>}
 */
export const BASIC_COLORS = {
  black: '\x1B[30m',
  red: '\x1B[31m',
  green: '\x1B[32m',
  yellow: '\x1B[33m',
  blue: '\x1B[34m',
  magenta: '\x1B[35m',
  cyan: '\x1B[36m',
  white: '\x1B[37m',
  brightBlack: '\x1B[90m',
  brightRed: '\x1B[91m',
  brightGreen: '\x1B[92m',
  brightYellow: '\x1B[93m',
  brightBlue: '\x1B[94m',
  brightMagenta: '\x1B[95m',
  brightCyan: '\x1B[96m',
  brightWhite: '\x1B[97m',
};

export default {
  ColorSystem,
  clamp,
  lerp,
  lerpHSL,
  rgbToHsl,
  RESET_COLOR,
  BASIC_COLORS,
};
