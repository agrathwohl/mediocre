/**
 * Render Manager Module
 * 
 * Coordinates all rendering operations for choreography playback:
 * - Screen buffer management
 * - Object rendering
 * - Background pattern rendering
 * - Status bar display
 * 
 * @module playback/rendering/render-manager
 * 
 * @example
 * import { RenderManager } from './render-manager.js';
 * import { ColorSystem } from '../core/color-system.js';
 * 
 * const renderManager = new RenderManager(choreographySettings);
 * 
 * // Clear screen
 * renderManager.clear();
 * 
 * // Render frame
 * renderManager.render(objects, amplitude, elapsed, showOSD);
 */

import { ColorSystem } from '../core/color-system.js';
import { ObjectRenderer } from './object-renderer.js';
import { PatternRenderer } from './pattern-renderer.js';
import { StatusRenderer } from './status-renderer.js';
import { BackgroundManager } from '../../utils/background-manager.js';

/**
 * Default render configuration
 * @type {Object}
 */
export const DEFAULT_RENDER_CONFIG = {
  usePatterns: true,
  showStatusBar: false,
  statusBarHeight: 4,
  doubleBuffer: true
};

/**
 * ANSI escape codes
 * @type {Object}
 */
export const ANSI_CODES = {
  clear: '\x1B[2J\x1B[H',
  reset: '\x1B[0m',
  home: '\x1B[H'
};

/**
 * RenderManager class for coordinating rendering
 */
export class RenderManager {
  /**
   * Creates a new RenderManager instance
   * @param {Object} [choreographySettings=null] - Choreography settings
   * @param {Object} [config={}] - Rendering configuration
   */
  constructor(choreographySettings = null, config = {}) {
    this.colorSystem = new ColorSystem();
    this.objectRenderer = new ObjectRenderer(this.colorSystem);
    this.patternRenderer = new PatternRenderer();
    this.statusRenderer = new StatusRenderer(this.colorSystem);
    this.backgroundManager = new BackgroundManager();
    
    this.config = { ...DEFAULT_RENDER_CONFIG, ...config };
    this.choreographySettings = choreographySettings;
    
    // Buffers
    this.buffer = [];
    this.colorBuffer = [];
    
    // Terminal dimensions
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 24;
  }

  /**
   * Clears the screen
   */
  clear() {
    process.stdout.write(ANSI_CODES.clear);
  }

  /**
   * Updates terminal dimensions
   */
  updateDimensions() {
    this.width = process.stdout.columns || 80;
    this.height = process.stdout.rows || 24;
  }

  /**
   * Initializes screen buffers
   */
  initBuffers() {
    this.buffer = Array(this.height)
      .fill(null)
      .map(() => Array(this.width).fill(" "));
    
    this.colorBuffer = Array(this.height)
      .fill(null)
      .map(() => Array(this.width).fill(""));
  }

  /**
   * Clears buffers for new frame
   * @param {string} [bgColor=''] - Background color to fill
   */
  clearBuffers(bgColor = '') {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        this.buffer[y][x] = " ";
        this.colorBuffer[y][x] = bgColor;
      }
    }
  }

  /**
   * Renders a complete frame
   * @param {Array<Object>} objects - Objects to render
   * @param {number} amplitude - Audio amplitude
   * @param {number} elapsed - Elapsed time
   * @param {boolean} [showOSD=false] - Whether to show status bar
   * @param {Object} [backgroundRender] - Background render info
   */
  render(objects, amplitude, elapsed, showOSD = false, backgroundRender = null) {
    // Update dimensions
    this.updateDimensions();
    
    // Initialize buffers
    this.initBuffers();
    
    // Get background info from background manager
    let bgInfo;
    if (this.backgroundManager) {
      bgInfo = this.backgroundManager.render(amplitude, elapsed);
    }
    
    // Get background info (use provided or from background manager)
    const bgColor = backgroundRender?.ansi || bgInfo?.ansi || '';
    const bgPattern = backgroundRender?.pattern || bgInfo?.pattern;
    const bgPatternColor = backgroundRender?.patternColor || bgInfo?.patternColor;
    
    // Clear with background color
    this.clearBuffers(bgColor);
    
    // Render objects
    if (objects && objects.length > 0) {
      this.objectRenderer.renderObjects(
        objects,
        this.buffer,
        this.colorBuffer,
        amplitude,
        elapsed,
        this.width,
        showOSD ? this.height - this.config.statusBarHeight : this.height
      );
    }
    
    // Build output
    let output = bgColor;
    const maxHeight = showOSD ? this.height - this.config.statusBarHeight : this.height;
    
    for (let y = 0; y < maxHeight; y++) {
      let line = "";
      let lastColor = bgColor;
      
      for (let x = 0; x < this.width; x++) {
        let char = this.buffer[y][x];
        let color = this.colorBuffer[y][x] || "";
        
        // Apply pattern for empty pixels
        if (char === ' ' && bgPattern && bgPatternColor && this.config.usePatterns) {
          const patternResult = this.patternRenderer.renderPattern(
            bgPattern,
            x,
            y,
            bgColor,
            bgPatternColor
          );
          if (patternResult.char) {
            char = patternResult.char;
            color = patternResult.color;
          }
        }
        
        // Add color code only when it changes
        if (color !== lastColor) {
          line += color || bgColor;
          lastColor = color;
        }
        
        line += char;
      }
      
      output += line;
      if (y < maxHeight - 1) output += "\n";
    }
    
    // Add status bar if enabled
    if (showOSD) {
      output += ANSI_CODES.reset + "\n";
      output += this.statusRenderer.renderStatusBar(amplitude, elapsed, { width: this.width });
    } else {
      output += ANSI_CODES.reset;
    }
    
    // Output to terminal
    process.stdout.write(output);
  }

  /**
   * Renders a simple frame without objects (for transitions)
   * @param {string} bgColor - Background color
   * @param {string} [pattern] - Optional pattern
   * @param {Object} [patternColor] - Pattern color
   */
  renderBackgroundOnly(bgColor, pattern, patternColor) {
    this.updateDimensions();
    
    let output = bgColor;
    
    for (let y = 0; y < this.height; y++) {
      let line = "";
      
      for (let x = 0; x < this.width; x++) {
        let char = " ";
        
        if (pattern && patternColor && this.config.usePatterns) {
          const result = this.patternRenderer.renderPattern(
            pattern,
            x,
            y,
            bgColor,
            patternColor
          );
          if (result.char) {
            char = result.char;
          }
        }
        
        line += char;
      }
      
      output += line;
      if (y < this.height - 1) output += "\n";
    }
    
    output += ANSI_CODES.reset;
    process.stdout.write(output);
  }

  /**
   * Renders background content (text, banners)
   * @param {Object} content - Content to render
   * @param {string} content.content - Text content
   * @param {string} content.color - Content color
   * @param {Object} content.position - Position {x, y}
   * @param {string} bgColor - Background color
   */
  renderBackgroundContent(content, bgColor) {
    if (!content || !content.content) return;
    
    const lines = content.content.split('\n');
    const contentColor = content.color ? 
      this.parseColorToAnsi(content.color) : '\x1b[37m';
    
    let startY = 0, startX = 0;
    const pos = content.position;
    
    if (pos.y === 'top') startY = 1;
    else if (pos.y === 'center') startY = Math.floor((this.height - lines.length) / 2);
    else if (pos.y === 'bottom') startY = this.height - lines.length - 1;
    
    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const y = startY + lineIdx;
      
      if (y < 0 || y >= this.height) continue;
      
      if (pos.x === 'left') startX = 1;
      else if (pos.x === 'center') startX = Math.floor((this.width - line.length) / 2);
      else if (pos.x === 'right') startX = this.width - line.length - 1;
      
      for (let charIdx = 0; charIdx < line.length; charIdx++) {
        const x = startX + charIdx;
        if (x >= 0 && x < this.width) {
          this.buffer[y][x] = line[charIdx];
          this.colorBuffer[y][x] = contentColor;
        }
      }
    }
  }

  /**
   * Parses hex color to ANSI
   * @param {string} colorStr - Hex color (#RGB or #RRGGBB)
   * @returns {string} ANSI color code
   */
  parseColorToAnsi(colorStr) {
    if (colorStr.startsWith('#')) {
      const hex = colorStr.slice(1);
      let r, g, b;
      if (hex.length === 3) {
        r = parseInt(hex[0] + hex[0], 16);
        g = parseInt(hex[1] + hex[1], 16);
        b = parseInt(hex[2] + hex[2], 16);
      } else {
        r = parseInt(hex.slice(0, 2), 16);
        g = parseInt(hex.slice(2, 4), 16);
        b = parseInt(hex.slice(4, 6), 16);
      }
      return `\x1b[38;2;${r};${g};${b}m`;
    }
    return '\x1b[37m';
  }

  /**
   * Updates configuration
   * @param {Object} newConfig - New configuration
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
  RenderManager,
  DEFAULT_RENDER_CONFIG,
  ANSI_CODES
};
