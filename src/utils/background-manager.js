/**
 * BackgroundManager - Manages background appearance and behavior for choreography playback
 *
 * Supports five modes:
 * - audio-reactive: Responds to audio amplitude with color variations
 * - static: Solid colors or patterns
 * - content: Text, ASCII art, or scrolling banners
 * - image: Display downloaded images using kitty protocol
 * - disabled: No background rendering
 */

import terminalImage from 'terminal-image';
import fs from 'fs/promises';
import path from 'path';

/**
 * Parse CSS color string to RGB components
 * Supports: hex (#RGB, #RRGGBB), rgb(), hsl(), named colors
 * @param {string} colorStr - CSS color string
 * @returns {{r: number, g: number, b: number}} RGB values 0-255
 */
function parseColor(colorStr) {
  // Hex format
  if (colorStr.startsWith('#')) {
    const hex = colorStr.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16)
      };
    }
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    };
  }

  // RGB format: rgb(r, g, b)
  if (colorStr.startsWith('rgb(')) {
    const match = colorStr.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
    if (match) {
      return {
        r: parseInt(match[1]),
        g: parseInt(match[2]),
        b: parseInt(match[3])
      };
    }
  }

  // HSL format: hsl(h, s%, l%)
  if (colorStr.startsWith('hsl(')) {
    const match = colorStr.match(/hsl\((\d+),\s*(\d+)%,\s*(\d+)%\)/);
    if (match) {
      const h = parseInt(match[1]) / 360;
      const s = parseInt(match[2]) / 100;
      const l = parseInt(match[3]) / 100;
      return hslToRgb(h, s, l);
    }
  }

  // Named colors (common subset)
  const namedColors = {
    black: { r: 0, g: 0, b: 0 },
    white: { r: 255, g: 255, b: 255 },
    red: { r: 255, g: 0, b: 0 },
    green: { r: 0, g: 128, b: 0 },
    blue: { r: 0, g: 0, b: 255 },
    yellow: { r: 255, g: 255, b: 0 },
    cyan: { r: 0, g: 255, b: 255 },
    magenta: { r: 255, g: 0, b: 255 },
    gray: { r: 128, g: 128, b: 128 },
    grey: { r: 128, g: 128, b: 128 }
  };

  return namedColors[colorStr.toLowerCase()] || { r: 0, g: 0, b: 0 };
}

/**
 * Convert HSL to RGB
 * @param {number} h - Hue (0-1)
 * @param {number} s - Saturation (0-1)
 * @param {number} l - Lightness (0-1)
 * @returns {{r: number, g: number, b: number}}
 */
function hslToRgb(h, s, l) {
  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  return {
    r: Math.round(r * 255),
    g: Math.round(g * 255),
    b: Math.round(b * 255)
  };
}

/**
 * Convert RGB to ANSI escape code
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} ANSI escape sequence
 */
function rgbToAnsi(r, g, b) {
  return `\x1b[48;2;${r};${g};${b}m`;
}

/**
 * Calculate relative luminance for contrast calculation
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {number} Relative luminance (0-1)
 */
function getLuminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(c => {
    c = c / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

/**
 * Get contrasting foreground color (white or black) for given background
 * @param {number} r - Red (0-255)
 * @param {number} g - Green (0-255)
 * @param {number} b - Blue (0-255)
 * @returns {string} ANSI foreground color code (white or black)
 */
function getContrastingForeground(r, g, b) {
  const luminance = getLuminance(r, g, b);
  // Use white foreground for dark backgrounds, black for light backgrounds
  return luminance > 0.5 ? '\x1b[38;2;0;0;0m' : '\x1b[38;2;255;255;255m';
}

/**
 * Easing functions for transitions
 */
const EASING_FUNCTIONS = {
  linear: t => t,
  'ease-in': t => t * t,
  'ease-out': t => t * (2 - t),
  'ease-in-out': t => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t
};

/**
 * LRU Cache for content buffers
 */
class LRUCache {
  constructor(maxSize = 10) {
    this.maxSize = maxSize;
    this.cache = new Map();
  }

  get(key) {
    if (!this.cache.has(key)) return undefined;
    const value = this.cache.get(key);
    this.cache.delete(key);
    this.cache.set(key, value);
    return value;
  }

  set(key, value) {
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
    this.cache.set(key, value);
  }

  clear() {
    this.cache.clear();
  }
}

/**
 * BackgroundManager - Core background control class
 */
export class BackgroundManager {
  constructor(settings = {}, terminalWidth = 200, terminalHeight = 50) {
    this.terminalWidth = terminalWidth;
    this.terminalHeight = terminalHeight;

    // Default settings
    this.settings = {
      mode: 'audio-reactive',
      audioReactive: {
        sensitivity: 1.0,
        colorWheelOffset: 0,
        saturation: { min: 50, max: 100 },
        lightness: { min: 10, max: 40 },
        updateRate: 30
      },
      transition: {
        duration: 0.5,
        easing: 'ease-in-out'
      },
      ...settings
    };

    // Current state
    this.currentMode = this.settings.mode;
    this.currentConfig = { ...this.settings[this.currentMode] } || {};

    // Transition state
    this.transitionActive = false;
    this.transitionStartTime = 0;
    this.transitionDuration = 0;
    this.transitionFrom = null;
    this.transitionTo = null;
    this.transitionEasing = 'ease-in-out';

    // Caches
    this.colorCache = new Map();
    this.contentCache = new LRUCache(10);
    this.patternCache = new Map(); // Cache for pattern buffers (grid/dots/noise)

    // Banner scroll state
    this.bannerScrollOffset = 0;
    this.lastBannerUpdate = 0;
  }

  /**
   * Update background configuration (triggers transition)
   * @param {string} mode - New mode
   * @param {Object} config - Mode-specific configuration
   * @param {Object} transition - Transition settings
   */
  updateBackground(mode, config, transition = null) {
    const transitionConfig = transition || this.settings.transition;

    if (transitionConfig.duration > 0) {
      this.transitionActive = true;
      this.transitionStartTime = Date.now();
      this.transitionDuration = transitionConfig.duration * 1000; // Convert to ms
      this.transitionEasing = transitionConfig.easing || 'ease-in-out';
      this.transitionFrom = {
        mode: this.currentMode,
        config: { ...this.currentConfig }
      };
      this.transitionTo = {
        mode,
        config: { ...config }
      };
    } else {
      this.currentMode = mode;
      this.currentConfig = { ...config };
    }
  }

  /**
   * Render audio-reactive background
   * @param {number} amplitude - Audio amplitude (0-1)
   * @returns {string} ANSI escape sequence for background color
   */
  renderAudioReactive(amplitude) {
    const config = this.currentConfig;
    const sensitivity = config.sensitivity || 1.0;
    const scaledAmplitude = Math.min(1.0, amplitude * sensitivity);

    // Calculate HSL values
    const hue = (config.colorWheelOffset || 0) + (scaledAmplitude * 360);
    const saturation = config.saturation
      ? config.saturation.min + scaledAmplitude * (config.saturation.max - config.saturation.min)
      : 50 + scaledAmplitude * 50;
    const lightness = config.lightness
      ? config.lightness.min + scaledAmplitude * (config.lightness.max - config.lightness.min)
      : 10 + scaledAmplitude * 30;

    // Convert to RGB
    const rgb = hslToRgb(hue / 360, saturation / 100, lightness / 100);
    return rgbToAnsi(rgb.r, rgb.g, rgb.b);
  }

  /**
   * Render static background
   * @returns {string} ANSI escape sequence for background color
   */
  renderStatic() {
    const config = this.currentConfig;
    const color = config.color || '#000000';
    const pattern = config.pattern || 'solid';

    // For all patterns, just return the ANSI color code
    // Pattern rendering will be done procedurally during output
    const rgb = parseColor(color);
    const bgAnsi = rgbToAnsi(rgb.r, rgb.g, rgb.b);

    // Return color + pattern info for procedural rendering
    return {
      ansi: bgAnsi,
      pattern: pattern === 'solid' ? null : pattern,
      color: { r: rgb.r, g: rgb.g, b: rgb.b }
    };
  }

  /**
   * Render grid pattern to terminal buffer
   * @param {string} color - CSS color string
   * @param {number} cellWidth - Grid cell width in characters
   * @param {number} cellHeight - Grid cell height in characters
   * @returns {{chars: Array<Array<string>>, colors: Array<Array<string>>}}
   */
  renderGridPattern(color, cellWidth = 8, cellHeight = 4) {
    const rgb = parseColor(color);
    const bgAnsi = rgbToAnsi(rgb.r, rgb.g, rgb.b);
    const fgAnsi = getContrastingForeground(rgb.r, rgb.g, rgb.b);
    const combined = fgAnsi + bgAnsi;

    const chars = [];
    const colors = [];

    for (let y = 0; y < this.terminalHeight; y++) {
      const charRow = [];
      const colorRow = [];

      for (let x = 0; x < this.terminalWidth; x++) {
        const isTop = y % cellHeight === 0;
        const isBottom = (y + 1) % cellHeight === 0;
        const isLeft = x % cellWidth === 0;
        const isRight = (x + 1) % cellWidth === 0;

        let char = ' ';
        if (isTop && isLeft) char = '┌';
        else if (isTop && isRight) char = '┐';
        else if (isBottom && isLeft) char = '└';
        else if (isBottom && isRight) char = '┘';
        else if (isTop || isBottom) char = '─';
        else if (isLeft || isRight) char = '│';

        charRow.push(char);
        colorRow.push(char !== ' ' ? combined : bgAnsi);
      }

      chars.push(charRow);
      colors.push(colorRow);
    }

    return { chars, colors };
  }

  /**
   * Render dots pattern to terminal buffer
   * @param {string} color - CSS color string
   * @param {number} spacing - Spacing between dots in characters
   * @param {string} dotChar - Character to use for dots
   * @returns {{chars: Array<Array<string>>, colors: Array<Array<string>>}}
   */
  renderDotsPattern(color, spacing = 6, dotChar = '·') {
    const rgb = parseColor(color);
    const bgAnsi = rgbToAnsi(rgb.r, rgb.g, rgb.b);
    const fgAnsi = getContrastingForeground(rgb.r, rgb.g, rgb.b);
    const combined = fgAnsi + bgAnsi;

    const chars = [];
    const colors = [];

    for (let y = 0; y < this.terminalHeight; y++) {
      const charRow = [];
      const colorRow = [];
      const rowOffset = (y % 2) * Math.floor(spacing / 2); // Stagger rows

      for (let x = 0; x < this.terminalWidth; x++) {
        const isDot = (x + rowOffset) % spacing === 0 && y % 3 === 0;
        charRow.push(isDot ? dotChar : ' ');
        colorRow.push(isDot ? combined : bgAnsi);
      }

      chars.push(charRow);
      colors.push(colorRow);
    }

    return { chars, colors };
  }

  /**
   * Render noise pattern to terminal buffer
   * @param {string} color - CSS color string
   * @param {number} density - Noise density (0.0-1.0)
   * @param {number} seed - Random seed for deterministic generation
   * @returns {{chars: Array<Array<string>>, colors: Array<Array<string>>}}
   */
  renderNoisePattern(color, density = 0.25, seed = 12345) {
    const rgb = parseColor(color);
    const bgAnsi = rgbToAnsi(rgb.r, rgb.g, rgb.b);
    const fgAnsi = getContrastingForeground(rgb.r, rgb.g, rgb.b);
    const combined = fgAnsi + bgAnsi;
    const noiseChars = ['░', '▒', '▓'];

    const chars = [];
    const colors = [];

    for (let y = 0; y < this.terminalHeight; y++) {
      const charRow = [];
      const colorRow = [];

      for (let x = 0; x < this.terminalWidth; x++) {
        // Seeded pseudo-random for deterministic caching
        const seedVal = Math.sin(seed + x * 12.9898 + y * 78.233) * 43758.5453;
        const random = seedVal - Math.floor(seedVal);

        if (random < density) {
          const charIndex = Math.floor((random / density) * noiseChars.length);
          charRow.push(noiseChars[charIndex]);
          colorRow.push(combined);
        } else {
          charRow.push(' ');
          colorRow.push(bgAnsi);
        }
      }

      chars.push(charRow);
      colors.push(colorRow);
    }

    return { chars, colors };
  }

  /**
   * Render content to buffer (text, ASCII art, banner)
   * @param {number} currentTime - Current playback time in seconds
   * @returns {Object} { content: string, position: {x, y}, color: string, opacity: number }
   */
  renderContentToBuffer(currentTime) {
    const config = this.currentConfig;
    const cacheKey = JSON.stringify(config);

    // Check if banner needs scrolling update
    if (config.type === 'banner') {
      const scrollSpeed = config.banner?.scrollSpeed || 1.0;
      const timeSinceLastUpdate = currentTime - this.lastBannerUpdate;
      if (timeSinceLastUpdate > 0.05) { // Update every 50ms
        this.bannerScrollOffset += scrollSpeed * timeSinceLastUpdate * 10;
        this.lastBannerUpdate = currentTime;
      }
    }

    let content;
    switch (config.type) {
      case 'text':
        content = config.text || '';
        break;

      case 'ascii-art':
        content = config.asciiArt || '';
        break;

      case 'banner':
        const text = config.banner?.text || '';
        const repeat = config.banner?.repeat !== false;
        if (repeat) {
          const repeatedText = (text + '  ').repeat(Math.ceil(this.terminalWidth / text.length) + 2);
          const offset = Math.floor(this.bannerScrollOffset) % (text.length + 2);
          content = repeatedText.slice(offset, offset + this.terminalWidth);
        } else {
          content = text;
        }
        break;

      default:
        content = '';
    }

    return {
      content,
      position: config.position || { x: 'center', y: 'center' },
      color: config.color || '#FFFFFF',
      opacity: config.opacity ?? 1.0
    };
  }

  /**
   * Render image background using kitty protocol
   * @returns {Promise<Object>} { imageData: string, opacity: number, blur: number }
   *
   * TODO: Image mode disabled - requires API integration for image downloads
   * See generate-choreography-multi-agent.js Agent 2.5 for details
   */
  async renderImage() {
    // DISABLED - no image downloads available
    return { imageData: null, opacity: 1.0, blur: 0 };

    /* COMMENTED OUT - Enable when Agent 2.5 is fixed
    const config = this.currentConfig;
    const imagePath = config.path;

    if (!imagePath) {
      return { imageData: null, opacity: 1.0, blur: 0 };
    }

    try {
      // Read image file
      const imageBuffer = await fs.readFile(imagePath);

      // Generate kitty protocol image data
      const imageData = await terminalImage.buffer(imageBuffer, {
        width: this.terminalWidth,
        height: this.terminalHeight,
        preserveAspectRatio: config.fit !== 'stretch'
      });

      return {
        imageData,
        opacity: config.opacity ?? 1.0,
        blur: config.blur ?? 0,
        fit: config.fit || 'cover',
        position: config.position || { x: 'center', y: 'center' }
      };
    } catch (error) {
      console.error('Error rendering image:', error.message);
      return { imageData: null, opacity: 1.0, blur: 0 };
    }
    */
  }

  /**
   * Get current background render output
   * @param {number} amplitude - Current audio amplitude (0-1)
   * @param {number} currentTime - Current playback time in seconds
   * @returns {Object} { ansi: string, content: Object|null, pattern: Object|null, image: Object|null }
   */
  render(amplitude, currentTime) {
    // Handle transition
    if (this.transitionActive) {
      const elapsed = Date.now() - this.transitionStartTime;
      const progress = Math.min(1.0, elapsed / this.transitionDuration);
      const easedProgress = EASING_FUNCTIONS[this.transitionEasing](progress);

      if (progress >= 1.0) {
        this.transitionActive = false;
        this.currentMode = this.transitionTo.mode;
        this.currentConfig = { ...this.transitionTo.config };
      } else {
        // Interpolate between modes (simplified: snap to new mode at 50% progress)
        if (easedProgress > 0.5) {
          this.currentMode = this.transitionTo.mode;
          this.currentConfig = { ...this.transitionTo.config };
        }
      }
    }

    // Render based on current mode
    let ansi = '';
    let content = null;
    let pattern = null;
    let patternColor = null;

    switch (this.currentMode) {
      case 'audio-reactive':
        ansi = this.renderAudioReactive(amplitude);
        break;

      case 'static':
        const staticResult = this.renderStatic();
        ansi = staticResult.ansi;
        pattern = staticResult.pattern;
        patternColor = staticResult.color;
        break;

      case 'content':
        content = this.renderContentToBuffer(currentTime);
        const bgResult = this.renderStatic();
        ansi = bgResult.ansi;
        pattern = bgResult.pattern;
        patternColor = bgResult.color;
        break;

      case 'image':
        // TODO: Image mode disabled pending API integration
        // Fall back to audio-reactive mode
        console.warn('Image background mode not available, using audio-reactive fallback');
        ansi = this.renderAudioReactive(amplitude);
        break;

      case 'disabled':
        ansi = '\x1b[0m'; // Reset
        break;

      default:
        ansi = this.renderAudioReactive(amplitude);
    }

    return { ansi, content, pattern, patternColor };
  }

  /**
   * Clear all caches
   */
  clearCaches() {
    this.colorCache.clear();
    this.contentCache.clear();
    this.patternCache.clear();
  }
}
