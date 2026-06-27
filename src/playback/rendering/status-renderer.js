/**
 * Status Renderer Module
 * 
 * Renders on-screen display (OSD) and status bar for choreography playback:
 * - Status bar with amplitude meter
 * - Time display
 * - Playback information
 * 
 * @module playback/rendering/status-renderer
 * 
 * @example
 * import { StatusRenderer } from './status-renderer.js';
 * import { ColorSystem } from '../core/color-system.js';
 * 
 * const colors = new ColorSystem();
 * const status = new StatusRenderer(colors);
 * 
 * const statusBar = status.renderStatusBar(0.8, 10.5);
 * process.stdout.write(statusBar);
 */

/**
 * Default status bar configuration
 * @type {Object}
 */
export const DEFAULT_STATUS_CONFIG = {
  meterWidth: 50,
  showTime: true,
  showLevel: true,
  showObjects: false,
  gradientStartHue: 120,  // Green
  gradientEndHue: 0,      // Red
};

/**
 * Box drawing characters
 * @type {Object}
 */
export const BOX_CHARS = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
  filled: '█',
  empty: '░'
};

/**
 * StatusRenderer class for rendering UI elements
 */
export class StatusRenderer {
  /**
   * Creates a new StatusRenderer instance
   * @param {ColorSystem} colorSystem - Color system for generating colors
   * @param {Object} [config={}] - Configuration options
   */
  constructor(colorSystem, config = {}) {
    this.colorSystem = colorSystem;
    this.config = { ...DEFAULT_STATUS_CONFIG, ...config };
  }

  /**
   * Renders the status bar with amplitude meter
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} elapsed - Elapsed time in seconds
   * @param {Object} [options={}] - Rendering options
   * @param {number} [options.width] - Terminal width (auto-detected if not provided)
   * @param {number} [options.objectCount] - Number of objects to display
   * @returns {string} Status bar string with ANSI codes
   */
  renderStatusBar(amplitude, elapsed, options = {}) {
    const width = options.width || (process.stdout.columns || 80);
    const meterWidth = Math.min(this.config.meterWidth, width - 20);
    const filledBars = Math.floor(amplitude * meterWidth);
    const emptyBars = meterWidth - filledBars;

    // Create gradient meter
    let meter = "";
    for (let i = 0; i < filledBars; i++) {
      const hue = this.config.gradientStartHue - 
        (i / meterWidth) * (this.config.gradientStartHue - this.config.gradientEndHue);
      const color = this.colorSystem.hslToAnsi(hue, 100, 50);
      meter += color + BOX_CHARS.filled;
    }
    meter += "\x1B[90m" + BOX_CHARS.empty.repeat(emptyBars) + "\x1B[0m";

    // Calculate padding
    const timeStr = elapsed.toFixed(1);
    const levelStr = (amplitude * 100).toFixed(0);
    const infoStr = `Time: ${timeStr}s | Level: ${levelStr}%`;
    const padding = width - infoStr.length - 5;

    // Build status bar lines
    const topLine = BOX_CHARS.topLeft + BOX_CHARS.horizontal.repeat(width - 2) + BOX_CHARS.topRight;
    const infoLine = `${BOX_CHARS.vertical} 🎵 ENHANCED AUDIO VISUALIZATION | ${infoStr} ${"".padEnd(padding)}${BOX_CHARS.vertical}`;
    const meterLine = `${BOX_CHARS.vertical} [${meter}] ${"".padEnd(width - meterWidth - 5)}${BOX_CHARS.vertical}`;
    const bottomLine = BOX_CHARS.bottomLeft + BOX_CHARS.horizontal.repeat(width - 2) + BOX_CHARS.bottomRight;

    return `
${topLine}
${infoLine}
${meterLine}
${bottomLine}\x1B[0m`;
  }

  /**
   * Renders a simple OSD line
   * @param {Object} info - OSD information
   * @param {string} [info.trackName] - Track name
   * @param {number} [info.currentTime] - Current time
   * @param {number} [info.duration] - Total duration
   * @param {number} [info.objectCount] - Object count
   * @returns {string} OSD string
   */
  renderOSD(info = {}) {
    const parts = [];
    
    if (info.trackName) {
      parts.push(`🎵 ${info.trackName}`);
    }
    
    if (info.currentTime !== undefined && info.duration !== undefined) {
      parts.push(`⏱️ ${info.currentTime.toFixed(1)}s / ${info.duration.toFixed(1)}s`);
    } else if (info.currentTime !== undefined) {
      parts.push(`⏱️ ${info.currentTime.toFixed(1)}s`);
    }
    
    if (info.objectCount !== undefined) {
      parts.push(`👁️ ${info.objectCount} objects`);
    }

    return parts.join(' | ');
  }

  /**
   * Creates a gradient amplitude meter
   * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
   * @param {number} width - Meter width
   * @returns {string} Colored meter string
   */
  createGradientMeter(amplitude, width) {
    const filled = Math.floor(amplitude * width);
    let meter = "";

    for (let i = 0; i < width; i++) {
      if (i < filled) {
        const hue = this.config.gradientStartHue - 
          (i / width) * (this.config.gradientStartHue - this.config.gradientEndHue);
        const color = this.colorSystem.hslToAnsi(hue, 100, 50);
        meter += color + BOX_CHARS.filled;
      } else {
        meter += "\x1B[90m" + BOX_CHARS.empty;
      }
    }

    return meter + "\x1B[0m";
  }

  /**
   * Renders a simple progress bar
   * @param {number} progress - Progress (0.0 to 1.0)
   * @param {number} width - Bar width
   * @param {string} [label] - Optional label
   * @returns {string} Progress bar string
   */
  renderProgressBar(progress, width, label) {
    const filled = Math.floor(progress * width);
    const empty = width - filled;
    
    let bar = "[";
    bar += BOX_CHARS.filled.repeat(filled);
    bar += " ".repeat(empty);
    bar += "]";

    if (label) {
      bar = `${label} ${bar}`;
    }

    return bar;
  }

  /**
   * Renders a centered title
   * @param {string} title - Title text
   * @param {number} [width] - Terminal width
   * @returns {string} Centered title string
   */
  renderTitle(title, width) {
    const termWidth = width || (process.stdout.columns || 80);
    const paddedTitle = ` ${title} `;
    const padding = (termWidth - paddedTitle.length) / 2;
    
    const leftPad = Math.floor(padding);
    const rightPad = Math.ceil(padding);
    
    return BOX_CHARS.horizontal.repeat(leftPad) + 
           paddedTitle + 
           BOX_CHARS.horizontal.repeat(rightPad);
  }

  /**
   * Clears the status bar area
   * @param {number} [lines=4] - Number of lines to clear
   * @returns {string} ANSI escape codes to clear status
   */
  clearStatus(lines = 4) {
    let clear = "";
    for (let i = 0; i < lines; i++) {
      clear += "\x1B[K\n";  // Clear line
    }
    clear += "\x1B[" + lines + "A";  // Move cursor back up
    return clear;
  }

  /**
   * Updates configuration
   * @param {Object} newConfig - New configuration values
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }

  /**
   * Gets current configuration
   * @returns {Object} Current configuration
   */
  getConfig() {
    return { ...this.config };
  }
}

export default {
  StatusRenderer,
  DEFAULT_STATUS_CONFIG,
  BOX_CHARS
};
