/**
 * Art Manipulator Module
 * 
 * Core utilities for manipulating ASCII art:
 * - transformArt: Combined scale and rotation
 * - isBorder: Edge detection for border highlighting
 * - getArtDimensions: Calculate art size
 * - convertShapeToArt: Convert shape definitions to ASCII
 * 
 * @module playback/transformations/art-manipulator
 */

/**
 * Transforms ASCII art with scale and rotation
 * @param {Object} art - Art object with .art property
 * @param {number} scale - Scale factor
 * @param {number} rotation - Rotation in radians
 * @returns {Array<string>} Array of transformed lines
 */
export function transformArt(art, scale, rotation) {
  const lines = art.art.split("\n");
  let transformed = [];

  // Apply scale
  if (scale !== 1) {
    const scaledLines = [];
    for (const line of lines) {
      if (scale > 1) {
        // Enlarge by duplicating characters
        const factor = Math.floor(scale);
        let scaledLine = "";
        for (const char of line) {
          scaledLine += char.repeat(factor);
        }
        for (let i = 0; i < factor; i++) {
          scaledLines.push(scaledLine);
        }
      } else {
        // Shrink by skipping lines/characters
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

  // Simple rotation effect (90-degree increments)
  const rotationSteps = Math.floor(rotation / (Math.PI / 2)) % 4;
  if (rotationSteps === 1 || rotationSteps === 3) {
    // Rotate 90 or 270 degrees - transpose
    const maxLen = Math.max(...transformed.map((l) => l.length));
    const rotated = [];
    for (let i = 0; i < maxLen; i++) {
      let newLine = "";
      if (rotationSteps === 1) {
        // 90 degrees clockwise
        for (let j = transformed.length - 1; j >= 0; j--) {
          newLine += transformed[j][i] || " ";
        }
      } else {
        // 270 degrees clockwise (90 counter-clockwise)
        for (let j = 0; j < transformed.length; j++) {
          newLine += transformed[j][maxLen - 1 - i] || " ";
        }
      }
      rotated.push(newLine);
    }
    transformed = rotated;
  } else if (rotationSteps === 2) {
    // 180 degrees - reverse lines and characters
    transformed = transformed
      .reverse()
      .map((line) => line.split("").reverse().join(""));
  }

  return transformed;
}

/**
 * Checks if a character is on the border of the art
 * @param {Array<string>} lines - Array of art lines
 * @param {number} row - Row index
 * @param {number} col - Column index
 * @returns {boolean} True if character is on border
 */
export function isBorder(lines, row, col) {
  const char = lines[row]?.[col];
  if (!char || char === " ") return false;

  // Check if any neighbor is empty
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
 * Gets the dimensions of ASCII art
 * @param {Object|string} art - Art object or string
 * @returns {Object} Dimensions { width, height }
 */
export function getArtDimensions(art) {
  const artString = typeof art === "string" ? art : art.art;
  const lines = artString.split("\n");
  return {
    width: Math.max(...lines.map((l) => l.length)),
    height: lines.length,
  };
}

/**
 * Converts a shape definition to ASCII art
 * @param {Object} shape - Shape definition
 * @param {string} shape.type - Shape type ('rect', 'circle', 'triangle')
 * @param {number} shape.width - Shape width
 * @param {number} shape.height - Shape height
 * @param {string} [shape.char='█'] - Character to use
 * @returns {string} ASCII art string
 */
export function convertShapeToArt(shape) {
  const { type, width, height, char = "█" } = shape;
  const lines = [];

  switch (type) {
    case "rect":
      for (let y = 0; y < height; y++) {
        lines.push(char.repeat(width));
      }
      break;

    case "circle":
      const radius = Math.min(width, height) / 2;
      const centerX = width / 2;
      const centerY = height / 2;
      for (let y = 0; y < height; y++) {
        let line = "";
        for (let x = 0; x < width; x++) {
          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          line += dist <= radius ? char : " ";
        }
        lines.push(line);
      }
      break;

    case "triangle":
      for (let y = 0; y < height; y++) {
        const widthAtY = Math.floor((y / height) * width);
        lines.push(char.repeat(widthAtY));
      }
      break;

    default:
      // Default to rectangle
      for (let y = 0; y < height; y++) {
        lines.push(char.repeat(width));
      }
  }

  return lines.join("\n");
}

/**
 * Finds all border characters in art
 * @param {Array<string>} lines - Art lines
 * @returns {Array<{x: number, y: number}>} Array of border positions
 */
export function findBorders(lines) {
  const borders = [];
  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (isBorder(lines, y, x)) {
        borders.push({ x, y });
      }
    }
  }
  return borders;
}

/**
 * Finds all interior characters in art (non-border, non-space)
 * @param {Array<string>} lines - Art lines
 * @returns {Array<{x: number, y: number}>} Array of interior positions
 */
export function findInterior(lines) {
  const interior = [];
  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] !== " " && !isBorder(lines, y, x)) {
        interior.push({ x, y });
      }
    }
  }
  return interior;
}

/**
 * Creates a copy of art with modifications applied
 * @param {Object} art - Original art
 * @param {Function} modifier - Function(line, y) returning modified line
 * @returns {Object} Modified art object
 */
export function modifyArt(art, modifier) {
  const lines = art.art.split("\n");
  const modified = lines.map((line, y) => modifier(line, y));
  return { ...art, art: modified.join("\n") };
}

/**
 * Blends two art objects together
 * @param {Object} art1 - First art
 * @param {Object} art2 - Second art
 * @param {number} [blend=0.5] - Blend ratio (0=art1, 1=art2)
 * @returns {Object} Blended art
 */
export function blendArt(art1, art2, blend = 0.5) {
  const lines1 = art1.art.split("\n");
  const lines2 = art2.art.split("\n");
  const height = Math.max(lines1.length, lines2.length);
  const width = Math.max(
    ...lines1.map((l) => l.length),
    ...lines2.map((l) => l.length),
  );

  const blended = [];
  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const char1 = lines1[y]?.[x] || " ";
      const char2 = lines2[y]?.[x] || " ";
      line += Math.random() < blend ? char2 : char1;
    }
    blended.push(line);
  }

  return { ...art1, art: blended.join("\n") };
}

/**
 * Replaces all occurrences of a character in art
 * @param {Object} art - Art object
 * @param {string} target - Character to replace
 * @param {string} replacement - Replacement character
 * @returns {Object} Art with replacements
 */
export function replaceChar(art, target, replacement) {
  const lines = art.art.split("\n");
  const replaced = lines.map((line) => line.split(target).join(replacement));
  return { ...art, art: replaced.join("\n") };
}

export default {
  transformArt,
  isBorder,
  getArtDimensions,
  convertShapeToArt,
  findBorders,
  findInterior,
  modifyArt,
  blendArt,
  replaceChar,
};
