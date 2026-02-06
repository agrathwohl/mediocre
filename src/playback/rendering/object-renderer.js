/**
 * Object Renderer Module
 * 
 * Renders individual visual objects to the screen buffer.
 * Handles color effects, transformations, and positioning.
 * 
 * @module playback/rendering/object-renderer
 * 
 * @example
 * import { ObjectRenderer } from './object-renderer.js';
 * 
 * const renderer = new ObjectRenderer(colorSystem, artManipulator);
 * renderer.renderObject(obj, buffer, colorBuffer, amplitude, elapsed);
 */

/**
 * Color effect types
 * @type {string[]}
 */
export const COLOR_EFFECTS = ['rainbow', 'glitch', 'inverted', 'normal'];

/**
 * ObjectRenderer class for rendering individual objects
 */
export class ObjectRenderer {
  /**
   * Creates a new ObjectRenderer instance
   * @param {ColorSystem} colorSystem - Color system for generating colors
   * @param {Object} [artManipulator] - Art manipulator for transformations
   */
  constructor(colorSystem, artManipulator = null) {
    this.colorSystem = colorSystem;
    this.artManipulator = artManipulator;
  }

  /**
   * Renders a single object to the screen buffers
   * @param {Object} obj - Object to render
   * @param {Array<Array<string>>} buffer - Screen character buffer
   * @param {Array<Array<string>>} colorBuffer - Screen color buffer
   * @param {number} amplitude - Audio amplitude
   * @param {number} elapsed - Elapsed time
   * @param {number} objectIndex - Index for color offset
   * @param {number} screenWidth - Screen width
   * @param {number} screenHeight - Screen height
   * @returns {Object} Render stats { charsRendered, colorsApplied }
   */
  renderObject(obj, buffer, colorBuffer, amplitude, elapsed, objectIndex, screenWidth, screenHeight) {
    let charsRendered = 0;
    let colorsApplied = 0;

    // Transform the art
    const transformed = this.transformArt(obj.art, obj.scale, obj.rotation);
    
    // Determine colors
    const colors = this.determineColors(obj, amplitude, elapsed, objectIndex);
    const { borderColor, interiorColor } = colors;

    // Calculate position
    const startY = Math.floor(obj.y);
    const startX = Math.floor(obj.x);

    // Render each character
    for (let y = 0; y < transformed.length; y++) {
      for (let x = 0; x < transformed[y].length; x++) {
        const screenY = startY + y;
        const screenX = startX + x;

        // Check bounds
        if (
          screenY >= 0 &&
          screenY < screenHeight &&
          screenX >= 0 &&
          screenX < screenWidth
        ) {
          const char = transformed[y][x];
          if (char !== " ") {
            buffer[screenY][screenX] = char;
            charsRendered++;

            // Determine final color based on effects
            const finalColor = this.determinePixelColor(
              obj,
              transformed,
              y,
              x,
              screenX,
              screenY,
              borderColor,
              interiorColor,
              elapsed
            );

            colorBuffer[screenY][screenX] = finalColor;
            colorsApplied++;
          }
        }
      }
    }

    return { charsRendered, colorsApplied };
  }

  /**
   * Transforms art with scale and rotation
   * @param {Object} art - Art object
   * @param {number} scale - Scale factor
   * @param {number} rotation - Rotation in radians
   * @returns {Array<string>} Transformed lines
   */
  transformArt(art, scale, rotation) {
    // Handle both string art and object with art property
    const artString = typeof art === 'string' ? art : (art?.art || '');
    
    // Use art manipulator if available
    if (this.artManipulator && this.artManipulator.transformArt) {
      return this.artManipulator.transformArt(artString, scale, rotation);
    }

    // Fallback implementation
    const lines = artString.split("\n");
    let transformed = [];

    // Apply scale
    if (scale !== 1) {
      const scaledLines = [];
      for (const line of lines) {
        if (scale > 1) {
          const factor = Math.floor(scale);
          let scaledLine = "";
          for (const char of line) {
            scaledLine += char.repeat(factor);
          }
          for (let i = 0; i < factor; i++) {
            scaledLines.push(scaledLine);
          }
        } else {
          if (Math.random() < scale) {
            let scaledLine = "";
            for (let i = 0; i < line.length; i++) {
              if (Math.random() < scale || i % Math.floor(1 / scale) === 0) {
                scaledLine += line[i];
              }
            }
            scaledLines.push(scaledLine);
          }
        }
      }
      transformed = scaledLines;
    } else {
      transformed = [...lines];
    }

    // Apply rotation (90-degree increments)
    const rotationSteps = Math.floor(rotation / (Math.PI / 2)) % 4;
    if (rotationSteps === 1 || rotationSteps === 3) {
      const maxLen = Math.max(...transformed.map((l) => l.length));
      const rotated = [];
      for (let i = 0; i < maxLen; i++) {
        let newLine = "";
        if (rotationSteps === 1) {
          for (let j = transformed.length - 1; j >= 0; j--) {
            newLine += transformed[j][i] || " ";
          }
        } else {
          for (let j = 0; j < transformed.length; j++) {
            newLine += transformed[j][maxLen - 1 - i] || " ";
          }
        }
        rotated.push(newLine);
      }
      transformed = rotated;
    } else if (rotationSteps === 2) {
      transformed = transformed
        .reverse()
        .map((line) => line.split("").reverse().join(""));
    }

    return transformed;
  }

  /**
   * Determines border and interior colors for an object
   * @param {Object} obj - Object
   * @param {number} amplitude - Audio amplitude
   * @param {number} elapsed - Elapsed time
   * @param {number} index - Object index for color offset
   * @returns {Object} { borderColor, interiorColor }
   */
  determineColors(obj, amplitude, elapsed, index) {
    let borderColor, interiorColor;

    if (obj.color) {
      // Use template-specific color
      const templateColor = this.parseColorToAnsi(obj.color);
      borderColor = templateColor;
      interiorColor = templateColor;
    } else {
      // Use ColorSystem cycling
      borderColor = this.colorSystem.getBorderColor(
        amplitude + index * 0.1,
        elapsed
      );
      interiorColor = this.colorSystem.getInteriorColor(
        amplitude + index * 0.15,
        elapsed
      );
    }

    return { borderColor, interiorColor };
  }

  /**
   * Determines final color for a pixel based on effects
   * @param {Object} obj - Object
   * @param {Array<string>} transformed - Transformed art lines
   * @param {number} y - Y position in art
   * @param {number} x - X position in art
   * @param {number} screenX - Screen X position
   * @param {number} screenY - Screen Y position
   * @param {string} borderColor - Border color ANSI
   * @param {string} interiorColor - Interior color ANSI
   * @param {number} elapsed - Elapsed time
   * @returns {string} Final color ANSI
   */
  determinePixelColor(obj, transformed, y, x, screenX, screenY, borderColor, interiorColor, elapsed) {
    // Rainbow effect
    if (obj.rainbow) {
      const rainbowHue = ((screenX + screenY + elapsed * 100) * 10) % 360;
      return this.colorSystem.hslToAnsi(rainbowHue, 100, 60);
    }

    // Glitch effect - random colors
    if (obj.glitching) {
      const glitchHue = Math.random() * 360;
      return this.colorSystem.hslToAnsi(glitchHue, 100, 50);
    }

    // Inverted colors
    if (obj.inverted) {
      const isBorder = this.isBorder(transformed, y, x);
      return isBorder ? interiorColor : borderColor;
    }

    // Normal coloring
    const isBorder = this.isBorder(transformed, y, x);
    return isBorder ? borderColor : interiorColor;
  }

  /**
   * Checks if a character is on the border
   * @param {Array<string>} lines - Art lines
   * @param {number} row - Row index
   * @param {number} col - Column index
   * @returns {boolean} True if border
   */
  isBorder(lines, row, col) {
    // Use art manipulator if available
    if (this.artManipulator && this.artManipulator.isBorder) {
      return this.artManipulator.isBorder(lines, row, col);
    }

    // Fallback implementation
    const char = lines[row]?.[col];
    if (!char || char === " ") return false;

    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const neighborChar = lines[row + dr]?.[col + dc];
        if (neighborChar === " " || neighborChar === undefined) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Parses CSS color string to ANSI
   * @param {string} colorStr - Color string (hex)
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
   * Renders multiple objects
   * @param {Array<Object>} objects - Objects to render
   * @param {Array<Array<string>>} buffer - Screen buffer
   * @param {Array<Array<string>>} colorBuffer - Color buffer
   * @param {number} amplitude - Audio amplitude
   * @param {number} elapsed - Elapsed time
   * @param {number} screenWidth - Screen width
   * @param {number} screenHeight - Screen height
   * @returns {Object} Total stats
   */
  renderObjects(objects, buffer, colorBuffer, amplitude, elapsed, screenWidth, screenHeight) {
    let totalChars = 0;
    let totalColors = 0;

    objects.forEach((obj, index) => {
      const stats = this.renderObject(
        obj,
        buffer,
        colorBuffer,
        amplitude,
        elapsed,
        index,
        screenWidth,
        screenHeight
      );
      totalChars += stats.charsRendered;
      totalColors += stats.colorsApplied;
    });

    return { totalChars, totalColors };
  }
}

export default {
  ObjectRenderer,
  COLOR_EFFECTS
};
