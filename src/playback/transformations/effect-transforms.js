/**
 * Effect Transforms Module
 * 
 * Visual effects for ASCII art animations triggered by collisions:
 * - Glitch: Digital corruption artifacts
 * - Shatter: Breaking into pieces
 * - Pixelate: Blocky pixel effect
 * - Corrupt: Random character replacement
 * - Dissolve: Fading away
 * 
 * @module playback/transformations/effect-transforms
 * 
 * @example
 * import { glitchArt, shatterArt, pixelateArt } from './effect-transforms.js';
 * 
 * // Apply glitch effect
 * const glitched = glitchArt(art);
 * 
 * // Apply shatter effect
 * const shattered = shatterArt(art);
 */

/**
 * Glitch effect - Digital corruption with block characters
 * @param {Object} art - Art object with .art property
 * @param {number} [intensity=0.3] - Glitch probability (0-1)
 * @returns {Object} Glitched art object
 */
export function glitchArt(art, intensity = 0.3) {
  const lines = art.art.split("\n");
  const glitchChars = "▓▒░█▄▌▐▀╔╗╚╝║═┌┐└┘│─";
  const glitched = lines.map((line) =>
    line
      .split("")
      .map((char) =>
        Math.random() < intensity && char !== " "
          ? glitchChars[Math.floor(Math.random() * glitchChars.length)]
          : char,
      )
      .join(""),
  );
  return { ...art, art: glitched.join("\n") };
}

/**
 * Shatter effect - Breaks art into offset pieces with gaps
 * @param {Object} art - Art object
 * @param {number} [gapProbability=0.2] - Probability of creating gaps
 * @returns {Object} Shattered art object
 */
export function shatterArt(art, gapProbability = 0.2) {
  const lines = art.art.split("\n");
  const shattered = lines.map((line, i) => {
    const offset = Math.sin(i * 0.5) * 3;
    return (
      " ".repeat(Math.max(0, Math.floor(offset))) +
      line
        .split("")
        .map((char) => (Math.random() < gapProbability ? " " : char))
        .join("")
    );
  });
  return { ...art, art: shattered.join("\n") };
}

/**
 * Pixelate effect - Converts characters to pixel blocks
 * @param {Object} art - Art object
 * @returns {Object} Pixelated art object
 */
export function pixelateArt(art) {
  const lines = art.art.split("\n");
  const pixels = "▪▫◾◽▬▭";
  const pixelated = lines.map((line, i) =>
    line
      .split("")
      .map((char, j) => {
        if (i % 2 === 0 && j % 2 === 0 && char !== " ") {
          return pixels[Math.floor(Math.random() * pixels.length)];
        }
        return char;
      })
      .join(""),
  );
  return { ...art, art: pixelated.join("\n") };
}

/**
 * Corrupt effect - Random ASCII character replacement
 * @param {Object} art - Art object
 * @param {number} [lineCorruption=0.3] - Probability of corrupting entire lines
 * @param {number} [charCorruption=0.1] - Probability of corrupting individual chars
 * @returns {Object} Corrupted art object
 */
export function corruptArt(art, lineCorruption = 0.3, charCorruption = 0.1) {
  const lines = art.art.split("\n");
  const corrupted = lines.map((line) => {
    if (Math.random() < lineCorruption) {
      // Corrupt entire line
      return line
        .split("")
        .map(() => String.fromCharCode(33 + Math.floor(Math.random() * 94)))
        .join("");
    }
    return line
      .split("")
      .map((char) =>
        Math.random() < charCorruption
          ? String.fromCharCode(33 + Math.floor(Math.random() * 94))
          : char,
      )
      .join("");
  });
  return { ...art, art: corrupted.join("\n") };
}

/**
 * Dissolve effect - Gradual fade-out based on position
 * @param {Object} art - Art object
 * @param {number} [progress=0.5] - Dissolve progress (0-1)
 * @returns {Object} Dissolved art object
 */
export function dissolveArt(art, progress = 0.5) {
  const lines = art.art.split("\n");
  const dissolved = lines.map((line, i) =>
    line
      .split("")
      .map((char, j) => {
        const dissolveChance = (i + j) / (lines.length + line.length);
        return Math.random() < dissolveChance * progress ? " " : char;
      })
      .join(""),
  );
  return { ...art, art: dissolved.join("\n") };
}

/**
 * Explode effect - Scatters characters outward
 * @param {Object} art - Art object
 * @param {number} [progress=0.5] - Explosion progress (0-1)
 * @returns {Object} Exploded art object
 */
export function explodeArt(art, progress = 0.5) {
  const lines = art.art.split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const centerX = Math.floor(width / 2);
  const centerY = Math.floor(height / 2);

  const exploded = Array(height)
    .fill(null)
    .map(() => Array(width).fill(" "));

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] && lines[y][x] !== " ") {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const newDist = dist * (1 + progress * 2);
        const newX = Math.round(centerX + Math.cos(angle) * newDist);
        const newY = Math.round(centerY + Math.sin(angle) * newDist);

        if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
          exploded[newY][newX] = lines[y][x];
        }
      }
    }
  }

  return { ...art, art: exploded.map((line) => line.join("")).join("\n") };
}

/**
 * Melt effect - Dripping characters downward
 * @param {Object} art - Art object
 * @param {number} [progress=0.5] - Melt progress (0-1)
 * @returns {Object} Melted art object
 */
export function meltArt(art, progress = 0.5) {
  const lines = art.art.split("\n");
  const dropChars = ["▼", "▽", "╲", "╱", "│", "┃", "┆", "┊", "╿"];
  const melted = [];

  for (let y = 0; y < lines.length; y++) {
    let line = "";
    for (let x = 0; x < lines[y].length; x++) {
      const char = lines[y][x];
      if (char !== " ") {
        const dripChance = (y / lines.length) * progress;
        if (Math.random() < dripChance) {
          line += dropChars[Math.floor(Math.random() * dropChars.length)];
        } else {
          line += char;
        }
      } else {
        line += char;
      }
    }
    melted.push(line);

    // Add extra drip lines
    if (Math.random() < progress * 0.3 && y < lines.length - 1) {
      let dripLine = "";
      for (let x = 0; x < line.length; x++) {
        if (line[x] !== " " && Math.random() < 0.2) {
          dripLine += dropChars[Math.floor(Math.random() * dropChars.length)];
        } else {
          dripLine += " ";
        }
      }
      melted.push(dripLine);
    }
  }

  return { ...art, art: melted.join("\n") };
}

/**
 * Rainbow effect - Character substitution for color cycling
 * @param {Object} art - Art object
 * @returns {Object} Rainbow art object
 */
export function rainbowArt(art) {
  const lines = art.art.split("\n");
  const rainbowChars = ["░", "▒", "▓", "█", "▄", "▀", "▌", "▐"];

  const rainbow = lines.map((line) =>
    line
      .split("")
      .map((char) => {
        if (char !== " ") {
          return rainbowChars[Math.floor(Math.random() * rainbowChars.length)];
        }
        return char;
      })
      .join(""),
  );

  return { ...art, art: rainbow.join("\n") };
}

/**
 * Noise effect - Adds random characters to empty spaces
 * @param {Object} art - Art object
 * @param {number} [intensity=0.1] - Noise intensity (0-1)
 * @returns {Object} Noisy art object
 */
export function noiseArt(art, intensity = 0.1) {
  const lines = art.art.split("\n");
  const noiseChars = "░▒░·:∙∘○◌○◯◦";

  const noisy = lines.map((line) =>
    line
      .split("")
      .map((char) => {
        if (char === " " && Math.random() < intensity) {
          return noiseChars[Math.floor(Math.random() * noiseChars.length)];
        }
        return char;
      })
      .join(""),
  );

  return { ...art, art: noisy.join("\n") };
}

/**
 * Morph effect - Blends between current art and target pattern
 * @param {Object} art - Current art object
 * @param {Object} targetArt - Target art object
 * @param {number} progress - Morph progress (0-1)
 * @returns {Object} Morphed art object
 */
export function morphArt(art, targetArt, progress) {
  const sourceLines = art.art.split("\n");
  const targetLines = targetArt.art.split("\n");
  const height = Math.max(sourceLines.length, targetLines.length);
  const width = Math.max(
    ...sourceLines.map((l) => l.length),
    ...targetLines.map((l) => l.length),
  );

  const morphed = [];

  for (let y = 0; y < height; y++) {
    let line = "";
    for (let x = 0; x < width; x++) {
      const sourceChar = sourceLines[y]?.[x] || " ";
      const targetChar = targetLines[y]?.[x] || " ";

      if (Math.random() < progress) {
        line += targetChar;
      } else {
        line += sourceChar;
      }
    }
    morphed.push(line);
  }

  return { ...art, art: morphed.join("\n") };
}

export default {
  glitchArt,
  shatterArt,
  pixelateArt,
  corruptArt,
  dissolveArt,
  explodeArt,
  meltArt,
  rainbowArt,
  noiseArt,
  morphArt,
};
