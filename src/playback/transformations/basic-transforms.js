/**
 * Basic Transforms Module
 * 
 * Fundamental geometric transformations for ASCII art:
 * - Scaling (enlarge/shrink)
 * - Rotation (90-degree increments)
 * - Mirroring (horizontal flip)
 * - Inversion (solid/empty swap)
 * 
 * @module playback/transformations/basic-transforms
 * 
 * @example
 * import { scaleArt, rotateArt, mirrorArt, invertArt } from './basic-transforms.js';
 * 
 * // Scale art by 2x
 * const scaled = scaleArt(art, 2);
 * 
 * // Rotate 90 degrees
 * const rotated = rotateArt(art, Math.PI / 2);
 * 
 * // Mirror horizontally
 * const mirrored = mirrorArt(art);
 * 
 * // Invert solid/empty
 * const inverted = invertArt(art);
 */

/**
 * Scales ASCII art by a factor
 * @param {Object} art - Art object with .art property
 * @param {number} scale - Scale factor (>1 = enlarge, <1 = shrink)
 * @returns {Object} Scaled art object
 */
export function scaleArt(art, scale) {
  const lines = art.art.split("\n");
  let scaled = [];

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
    scaled = scaledLines;
  } else {
    scaled = [...lines];
  }

  return { ...art, art: scaled.join("\n") };
}

/**
 * Rotates ASCII art (90-degree increments only)
 * @param {Object} art - Art object
 * @param {number} rotation - Rotation angle in radians
 * @returns {Object} Rotated art object
 */
export function rotateArt(art, rotation) {
  const lines = art.art.split("\n");
  let transformed = [...lines];

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

  return { ...art, art: transformed.join("\n") };
}

/**
 * Mirrors ASCII art horizontally
 * @param {Object} art - Art object
 * @returns {Object} Mirrored art object
 */
export function mirrorArt(art) {
  const lines = art.art.split("\n");
  const mirrored = lines.map((line) => line.split("").reverse().join(""));
  return { ...art, art: mirrored.join("\n") };
}

/**
 * Inverts ASCII art (swaps solid and empty characters)
 * @param {Object} art - Art object
 * @returns {Object} Inverted art object
 */
export function invertArt(art) {
  const lines = art.art.split("\n");
  const inverted = lines.map((line) =>
    line
      .split("")
      .map((char) => {
        if (char === " ") return "█";
        if (char === "█") return " ";
        return char === char.toUpperCase()
          ? char.toLowerCase()
          : char.toUpperCase();
      })
      .join(""),
  );
  return { ...art, art: inverted.join("\n") };
}

/**
 * Flips ASCII art vertically
 * @param {Object} art - Art object
 * @returns {Object} Flipped art object
 */
export function flipArt(art) {
  const lines = art.art.split("\n");
  const flipped = [...lines].reverse();
  return { ...art, art: flipped.join("\n") };
}

/**
 * Combines multiple transformations
 * @param {Object} art - Art object
 * @param {Array<Function>} transforms - Array of transform functions
 * @returns {Object} Transformed art object
 */
export function composeTransforms(art, transforms) {
  return transforms.reduce((acc, transform) => transform(acc), art);
}

/**
 * Gets art dimensions
 * @param {Object} art - Art object
 * @returns {Object} Dimensions { width, height }
 */
export function getArtDimensions(art) {
  const lines = art.art.split("\n");
  return {
    width: Math.max(...lines.map((l) => l.length)),
    height: lines.length,
  };
}

/**
 * Pads art to specific dimensions
 * @param {Object} art - Art object
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Object} Padded art object
 */
export function padArt(art, width, height) {
  const lines = art.art.split("\n");
  const padded = [];

  for (let i = 0; i < height; i++) {
    if (i < lines.length) {
      const line = lines[i];
      if (line.length < width) {
        padded.push(line + " ".repeat(width - line.length));
      } else {
        padded.push(line);
      }
    } else {
      padded.push(" ".repeat(width));
    }
  }

  return { ...art, art: padded.join("\n") };
}

/**
 * Crops art to specific dimensions
 * @param {Object} art - Art object
 * @param {number} width - Target width
 * @param {number} height - Target height
 * @returns {Object} Cropped art object
 */
export function cropArt(art, width, height) {
  const lines = art.art.split("\n");
  const cropped = [];

  for (let i = 0; i < Math.min(height, lines.length); i++) {
    cropped.push(lines[i].substring(0, width));
  }

  return { ...art, art: cropped.join("\n") };
}

/**
 * Centers art within specified dimensions
 * @param {Object} art - Art object
 * @param {number} width - Container width
 * @param {number} height - Container height
 * @returns {Object} Centered art object
 */
export function centerArt(art, width, height) {
  const dims = getArtDimensions(art);
  const padLeft = Math.floor((width - dims.width) / 2);
  const padTop = Math.floor((height - dims.height) / 2);

  const lines = art.art.split("\n");
  const centered = [];

  // Top padding
  for (let i = 0; i < padTop; i++) {
    centered.push(" ".repeat(width));
  }

  // Centered lines
  for (const line of lines) {
    centered.push(
      " ".repeat(padLeft) + line + " ".repeat(width - padLeft - line.length),
    );
  }

  // Bottom padding
  while (centered.length < height) {
    centered.push(" ".repeat(width));
  }

  return { ...art, art: centered.join("\n") };
}

export default {
  scaleArt,
  rotateArt,
  mirrorArt,
  invertArt,
  flipArt,
  composeTransforms,
  getArtDimensions,
  padArt,
  cropArt,
  centerArt,
};
