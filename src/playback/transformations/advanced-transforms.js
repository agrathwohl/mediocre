/**
 * Advanced Transforms Module
 * 
 * Complex visual effects for ASCII art animations:
 * - Vortex: Spiral rotation effect
 * - Wormhole: Tunnel/pull to center
 * - Singularity: Compress then explode
 * - Plasma: Wave distortions
 * - Quantum: Phase in/out probability
 * - Liquify: Dripping liquid
 * - Crystallize: Angular crystal patterns
 * - Electric: Lightning sparks
 * - Fractal: Recursive patterns
 * - Inversion: Inner/outer character swap
 * 
 * @module playback/transformations/advanced-transforms
 */

/**
 * Vortex effect - Spiral rotation around center
 * @param {Object} art - Art object with .art property
 * @param {number} [strength=0.5] - Vortex rotation strength
 * @returns {Object} Vortexed art object
 */
export function vortexArt(art, strength = 0.5) {
  const lines = art.art.split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);

  const vortexed = Array(height)
    .fill(null)
    .map(() => Array(width).fill(" "));

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] && lines[y][x] !== " ") {
        const dx = x - centerX;
        const dy = y - centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const angle = Math.atan2(dy, dx);

        const newAngle = angle + dist * strength;
        const newX = Math.round(centerX + Math.cos(newAngle) * dist);
        const newY = Math.round(centerY + Math.sin(newAngle) * dist);

        if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
          vortexed[newY][newX] = lines[y][x];
        }
      }
    }
  }

  return { ...art, art: vortexed.map((line) => line.join("")).join("\n") };
}

/**
 * Liquify effect - Dripping liquid distortion
 * @param {Object} art - Art object
 * @param {number} [progress=0.5] - Liquify progress (0-1)
 * @returns {Object} Liquified art object
 */
export function liquifyArt(art, progress = 0.5) {
  const lines = art.art.split("\n");
  const liquified = [];
  const dropChars = ["▼", "▽", "╲", "╱", "│", "┃", "┆", "┊", "╿"];

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
    liquified.push(line);

    if (Math.random() < progress * 0.3 && y < lines.length - 1) {
      let dripLine = "";
      for (let x = 0; x < line.length; x++) {
        if (line[x] !== " " && Math.random() < 0.2) {
          dripLine += dropChars[Math.floor(Math.random() * dropChars.length)];
        } else {
          dripLine += " ";
        }
      }
      liquified.push(dripLine);
    }
  }

  return { ...art, art: liquified.join("\n") };
}

/**
 * Crystallize effect - Angular crystal patterns
 * @param {Object} art - Art object
 * @returns {Object} Crystallized art object
 */
export function crystallizeArt(art) {
  const lines = art.art.split("\n");
  const crystalChars = ["◆", "◇", "⬟", "⬢", "⬡", "⬠", "◈", "◊", "⟐", "⟡", "⬗", "⬖"];

  const crystallized = lines.map((line, y) =>
    line
      .split("")
      .map((char, x) => {
        if (char !== " ") {
          const pattern = (x + y) % crystalChars.length;
          return crystalChars[pattern];
        }
        return char;
      })
      .join(""),
  );

  return { ...art, art: crystallized.join("\n") };
}

/**
 * Wormhole effect - Tunnel pull to center
 * @param {Object} art - Art object
 * @param {number} [progress=0.5] - Pull strength (0-1)
 * @returns {Object} Wormholed art object
 */
export function wormholeArt(art, progress = 0.5) {
  const lines = art.art.split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);

  const wormholed = Array(height)
    .fill(null)
    .map(() => Array(width).fill(" "));

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] && lines[y][x] !== " ") {
        const dx = centerX - x;
        const dy = centerY - y;

        const newX = Math.round(x + dx * progress);
        const newY = Math.round(y + dy * progress);

        if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
          const tunnelChars = ["○", "◎", "◉", "●", "◐", "◑", "◒", "◓"];
          const dist = Math.sqrt(dx * dx + dy * dy);
          const charIndex = Math.floor(dist / 3) % tunnelChars.length;
          wormholed[newY][newX] =
            Math.random() < 0.7 ? lines[y][x] : tunnelChars[charIndex];
        }
      }
    }
  }

  return { ...art, art: wormholed.map((line) => line.join("")).join("\n") };
}

/**
 * Electric effect - Lightning spark patterns
 * @param {Object} art - Art object
 * @returns {Object} Electrified art object
 */
export function electricArt(art) {
  const lines = art.art.split("\n");
  const electricChars = ["⚡", "↯", "⟟", "⌁", "↯", "╱", "╲", "╳", "⟡"];

  const electrified = lines.map((line, y) => {
    let newLine = "";
    for (let x = 0; x < line.length; x++) {
      const char = line[x];
      if (char !== " ") {
        if (Math.random() < 0.3) {
          newLine += electricChars[Math.floor(Math.random() * electricChars.length)];
        } else {
          newLine += char;
        }
      } else {
        if (
          x > 0 &&
          x < line.length - 1 &&
          (line[x - 1] !== " " || line[x + 1] !== " ") &&
          Math.random() < 0.1
        ) {
          newLine += electricChars[Math.floor(Math.random() * 3)];
        } else {
          newLine += char;
        }
      }
    }
    return newLine;
  });

  return { ...art, art: electrified.join("\n") };
}

/**
 * Fractal effect - Recursive self-similar patterns
 * @param {Object} art - Art object
 * @returns {Object} Fractal art object
 */
export function fractalArt(art) {
  const lines = art.art.split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));

  const fractal = [...lines];
  const miniHeight = Math.floor(height / 3);
  const miniWidth = Math.floor(width / 3);

  for (let y = 0; y < miniHeight && y < lines.length; y++) {
    for (let x = 0; x < miniWidth && x < lines[y].length; x++) {
      if (lines[y * 3] && lines[y * 3][x * 3] && lines[y * 3][x * 3] !== " ") {
        if (fractal[y]) {
          const char = lines[y * 3][x * 3];
          if (x < fractal[y].length) {
            fractal[y] =
              fractal[y].substring(0, x) + char + fractal[y].substring(x + 1);
          }
        }
      }
    }
  }

  return { ...art, art: fractal.join("\n") };
}

/**
 * Quantum effect - Phasing in/out based on probability wave
 * @param {Object} art - Art object
 * @param {number} [phase=0] - Quantum phase
 * @returns {Object} Quantum art object
 */
export function quantumArt(art, phase = 0) {
  const lines = art.art.split("\n");
  const quantumChars = ["░", "▒", "▓", "█", "◌", "○", "●"];

  const quantum = lines.map((line, y) =>
    line
      .split("")
      .map((char, x) => {
        if (char !== " ") {
          const probability = Math.sin(phase + x * 0.5 + y * 0.3);

          if (Math.abs(probability) < 0.3) {
            return " ";
          } else if (Math.abs(probability) < 0.6) {
            return quantumChars[Math.floor(Math.random() * quantumChars.length)];
          } else {
            return char;
          }
        }
        return char;
      })
      .join(""),
  );

  return { ...art, art: quantum.join("\n") };
}

/**
 * Plasma effect - Wave distortions with character substitution
 * @param {Object} art - Art object
 * @param {number} [time=0] - Animation time
 * @returns {Object} Plasma art object
 */
export function plasmaArt(art, time = 0) {
  const lines = art.art.split("\n");
  const plasma = [];

  for (let y = 0; y < lines.length; y++) {
    let newLine = "";
    const waveOffset = Math.sin(time + y * 0.3) * 3;

    for (let x = 0; x < lines[y].length + Math.abs(waveOffset); x++) {
      const sourceX = Math.round(x - waveOffset);

      if (sourceX >= 0 && sourceX < lines[y].length) {
        const char = lines[y][sourceX];
        if (char !== " ") {
          const plasmaChars = ["≈", "~", "∿", "∾", "∽", "≋"];
          if (Math.random() < 0.2) {
            newLine +=
              plasmaChars[Math.floor((x + y + time * 10) % plasmaChars.length)];
          } else {
            newLine += char;
          }
        } else {
          newLine += " ";
        }
      } else {
        newLine += " ";
      }
    }
    plasma.push(newLine);
  }

  return { ...art, art: plasma.join("\n") };
}

/**
 * Singularity effect - Compress then explode
 * @param {Object} art - Art object
 * @param {number} [phase=0] - Phase (0=compress, 1=explode)
 * @param {number} [progress=0.5] - Progress (0-1)
 * @returns {Object} Singularity art object
 */
export function singularityArt(art, phase = 0, progress = 0.5) {
  const lines = art.art.split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));
  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);

  const singularity = Array(height)
    .fill(null)
    .map(() => Array(width).fill(" "));

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] && lines[y][x] !== " ") {
        const dx = x - centerX;
        const dy = y - centerY;

        let newX, newY;

        if (phase === 0) {
          const compressionFactor = 1 - progress * 0.9;
          newX = Math.round(centerX + dx * compressionFactor);
          newY = Math.round(centerY + dy * compressionFactor);
        } else {
          const explosionFactor = 1 + progress * 3;
          newX = Math.round(centerX + dx * explosionFactor);
          newY = Math.round(centerY + dy * explosionFactor);
        }

        if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
          if (phase === 0 && progress > 0.7) {
            singularity[newY][newX] = "◉";
          } else if (phase === 1) {
            const explodeChars = ["*", "✦", "✧", "⟟", "✱", "✲", "✳"];
            singularity[newY][newX] =
              explodeChars[Math.floor(Math.random() * explodeChars.length)];
          } else {
            singularity[newY][newX] = lines[y][x];
          }
        }
      }
    }
  }

  return { ...art, art: singularity.map((line) => line.join("")).join("\n") };
}

/**
 * Inversion effect - Swaps inner and outer characters
 * @param {Object} art - Art object
 * @returns {Object} Inverted art object
 */
export function inversionArt(art) {
  const lines = art.art.split("\n");
  const height = lines.length;
  const width = Math.max(...lines.map((l) => l.length));

  const centerY = Math.floor(height / 2);
  const centerX = Math.floor(width / 2);

  const distanceMap = [];
  const chars = [];

  for (let y = 0; y < lines.length; y++) {
    for (let x = 0; x < lines[y].length; x++) {
      if (lines[y][x] && lines[y][x] !== " ") {
        const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
        distanceMap.push({ char: lines[y][x], dist, x, y });
        chars.push(lines[y][x]);
      }
    }
  }

  distanceMap.sort((a, b) => a.dist - b.dist);
  chars.sort(() => Math.random() - 0.5);

  const inverted = lines.map((line) => line.split(""));

  for (let y = 0; y < inverted.length; y++) {
    for (let x = 0; x < inverted[y].length; x++) {
      if (inverted[y][x] !== " ") inverted[y][x] = " ";
    }
  }

  distanceMap.forEach((item, i) => {
    const invertedIndex = distanceMap.length - 1 - i;
    if (distanceMap[invertedIndex]) {
      const targetY = distanceMap[invertedIndex].y;
      const targetX = distanceMap[invertedIndex].x;
      if (inverted[targetY] && targetX < inverted[targetY].length) {
        inverted[targetY][targetX] = item.char;
      }
    }
  });

  return { ...art, art: inverted.map((line) => line.join("")).join("\n") };
}

export default {
  vortexArt,
  liquifyArt,
  crystallizeArt,
  wormholeArt,
  electricArt,
  fractalArt,
  quantumArt,
  plasmaArt,
  singularityArt,
  inversionArt,
};
