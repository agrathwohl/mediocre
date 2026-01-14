#!/usr/bin/env node

import { spawn, execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import AudioAnalyzer from "../src/utils/audio-analyzer.js";
import asciiArtManager from "../src/utils/ascii-art-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Use the existing ASCII frames from the project + expanded variations
const asciiFrames = [
  // Small/quiet frames (many variations)
  {
    art: `   .
  /|\\
 / | \\
'--|--'`,
    type: "small",
  },
  {
    art: `    ^
   /|\\
  / | \\
 /  |  \\
'-.|.-'`,
    type: "small",
  },
  {
    art: `  ◊
 ╱ ╲
╱   ╲`,
    type: "small",
  },
  {
    art: ` △
╱ ╲`,
    type: "small",
  },
  {
    art: `  ☆
 ╱│╲
  │`,
    type: "small",
  },
  {
    art: ` ♪
╱|╲`,
    type: "small",
  },
  // Medium intensity (more variations)
  {
    art: `     A
    /I\\
   //I\\\\
  ///I\\\\\\
 '//I\\\\'
    'I'`,
    type: "medium",
  },
  {
    art: `    .-^-.
   /     \\
  /       \\
 /         \\
|           |
\\           /
 \`-.___.-'`,
    type: "medium",
  },
  {
    art: `   ╱◆╲
  ╱ ◆ ╲
 │  ◆  │
  ╲ ◆ ╱
   ╲◆╱`,
    type: "medium",
  },
  {
    art: `  ╔═╗
 ╔╬═╬╗
╔╬╬═╬╬╗
 ╚╬═╬╝
  ╚═╝`,
    type: "medium",
  },
  {
    art: `   ♫♫♫
  ♪ ♪ ♪
 ♫  ♫  ♫
♪   ♪   ♪`,
    type: "medium",
  },
  {
    art: `  /╲╱╲
 ╱    ╲
│  ○○  │
 ╲    ╱
  ╲╱╲╱`,
    type: "medium",
  },
  // High intensity (more variations)
  {
    art: `        A
       *I=
      **I==
     ***I===
    ****I====
   ''_**I==_''
      - I -`,
    type: "high",
  },
  {
    art: `      .-^-.
   ."       ".
."             ".
\\               /
 \\             /
  \\           /
   \\________/`,
    type: "high",
  },
  {
    art: `     /\\
   .'  \`.
 .'      \`.
<          >
 \`.      .'
   \`.  .'
     \\/`,
    type: "high",
  },
  {
    art: `    ╱▲╲
   ╱▲▲▲╲
  ╱▲▲▲▲▲╲
 ╱▲▲▲▲▲▲▲╲
╱▲▲▲▲▲▲▲▲▲╲`,
    type: "high",
  },
  {
    art: `   ┌─────┐
  ╱│     │╲
 ╱ │  ●  │ ╲
╱  │     │  ╲
───┴─────┴───`,
    type: "high",
  },
  // Maximum intensity
  {
    art: `             ^
            /A\\
           //I\\\\
          ///I\\\\\\
         ////I\\\\\\\\
        /////I\\\\\\\\\\
       //////I\\\\\\\\\\\\
      ///////I\\\\\\\\\\\\\\
     ////////I\\\\\\\\\\\\\\\\
    /////////I\\\\\\\\\\\\\\\\\\
   //////////I\\\\\\\\\\\\\\\\\\\\
    '////////I\\\\\\\\\\\\\\\\'
      '//////I\\\\\\\\\\\\\\\\'
        '////I\\\\\\\\'
          '//I\\\\'
            'I'`,
    type: "max",
  },
  {
    art: `            /A\\
           /*I=\\
          /**I==\\
         /*^*I===\\
        /*^**I====\\
       /*^***I=^^==\\
      /*^^^^^I^==^==\\
     /*^^***I^======\\
    /*^*^***I^=======\\
   /*^**^***I^========\\
    \\**^****I^=======/
     \\**^***I=^==^==/
       \\*^***I==^^==/
        \\^***I=====/
         \\***I====/
          \\**I===/
           \\*I==/
            \\I=/
              V`,
    type: "max",
  },
];

// Enhanced color utilities
class ColorSystem {
  constructor() {
    this.time = 0;
  }

  // Generate vibrant HSL colors
  getVibrantColor(amplitude, time, type = "main") {
    const hue = (time * 50 + amplitude * 360) % 360;
    const saturation = 70 + amplitude * 30; // 70-100%
    const lightness = 40 + amplitude * 30; // 40-70%

    return this.hslToAnsi(hue, saturation, lightness);
  }

  // Convert HSL to ANSI 256 color code
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

    // Return ANSI 24-bit color escape code
    return `\x1B[38;2;${r};${g};${b}m`;
  }

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

    return `\x1B[48;2;${r};${g};${b}m`;
  }

  getBorderColor(amplitude, time) {
    // Bright, contrasting colors for borders
    const hue = (time * 100) % 360;
    const saturation = 90 + amplitude * 10; // 90-100%
    const lightness = 50 + amplitude * 20; // 50-70%

    return this.hslToAnsi(hue, saturation, lightness);
  }

  getInteriorColor(amplitude, time) {
    // Softer colors for interior
    const hue = (time * 75 + 90) % 360;
    const saturation = 50 + amplitude * 30; // 50-80%
    const lightness = 45 + amplitude * 25; // 45-70%

    return this.hslToAnsi(hue, saturation, lightness);
  }

  update(deltaTime) {
    this.time += deltaTime;
  }
}

// Transform manager for motion and scaling
class TransformManager {
  constructor() {
    this.objects = [];
    this.screenWidth = process.stdout.columns || 80;
    this.screenHeight = process.stdout.rows || 24;
    // Buffer limits to prevent crashes
    this.MAX_OBJECTS = 50; // Hard limit on total objects
    this.MULTIPLY_LIMIT = 8; // Maximum objects from multiplication
    this.MAX_SCALE = 8; // Maximum scale multiplier
    this.MIN_SCALE = 0.1; // Minimum scale before removal
  }

  addObject(art, x, y, scale = 1, rotation = 0, amplitude = 0, velocity = 0) {
    // Don't add if we've hit the object limit
    if (this.objects.length >= this.MAX_OBJECTS) {
      // Remove oldest object to make room
      this.objects.shift();
    }

    this.objects.push({
      art,
      x,
      y,
      scale,
      rotation,
      // Motion depends on VELOCITY not amplitude - objects move with rhythmic changes
      velocityX: (Math.random() - 0.5) * (velocity * 6), // Motion only with velocity
      velocityY: (Math.random() - 0.5) * (velocity * 3), // No velocity = no motion
      rotationSpeed: (Math.random() - 0.5) * 0.03 * velocity,
      pulsePhase: Math.random() * Math.PI * 2,
      lifetime: 0,
      maxLifetime: 3 + velocity * 7 + amplitude * 3, // Lifetime based on both
      // Collision transformation state
      transformation: null,
      transformProgress: 0,
      originalArt: art,
      inverted: false,
      exploding: false,
      melting: false,
      glitching: false,
      morphing: false,
      shattered: false,
      pixelated: false,
      rainbow: false,
      collisionCooldown: 0,
      isMultipliedCopy: false, // Track if this was created by multiplication
    });
  }

  updateObjects(deltaTime, amplitude, velocity = 0) {
    // Check for collisions between objects FIRST
    this.detectAndHandleCollisions(amplitude, velocity);

    // Periodic cleanup - remove excess objects if we're over 75% capacity
    if (this.objects.length > this.MAX_OBJECTS * 0.75) {
      // Remove oldest objects without full sort (more efficient)
      const targetCount = Math.floor(this.MAX_OBJECTS * 0.6);
      const toRemove = this.objects.length - targetCount;

      // Since we add new objects with push() and remove old with shift(),
      // the array is naturally ordered by age - just remove from front
      for (let i = 0; i < toRemove; i++) {
        this.objects.shift(); // Remove oldest (from front)
      }
    }

    // Update existing objects
    for (let i = this.objects.length - 1; i >= 0; i--) {
      const obj = this.objects[i];

      // Update collision cooldown
      if (obj.collisionCooldown > 0) {
        obj.collisionCooldown -= deltaTime;
      }

      // Check for circular motion (from choreography)
      if (obj.circularMotion) {
        // Update angle
        obj.circularMotion.angle += obj.circularMotion.speed * deltaTime;

        // Calculate new position based on circular motion
        const centerX =
          obj.circularMotion.centerX || process.stdout.columns / 2;
        const centerY = obj.circularMotion.centerY || process.stdout.rows / 2;

        obj.x =
          centerX +
          Math.cos(obj.circularMotion.angle) * obj.circularMotion.radius;
        obj.y =
          centerY +
          Math.sin(obj.circularMotion.angle) * obj.circularMotion.radius * 0.5; // Flatten Y for terminal aspect ratio
      } else {
        // Motion ONLY when velocity is significant (rhythmic change happening)
        // Below threshold = minimal/no motion, above = proportional motion
        const motionThreshold = 0.15; // Only move when velocity > 15%
        const motionMultiplier =
          velocity > motionThreshold ? (velocity - motionThreshold) * 3 : 0;

        obj.x += obj.velocityX * deltaTime * 5 * motionMultiplier; // Much less motion
        obj.y += obj.velocityY * deltaTime * 3 * motionMultiplier; // Controlled movement
      }

      // Rotation only with significant velocity
      const rotationMultiplier = velocity > 0.2 ? (velocity - 0.2) * 2 : 0;
      obj.rotation += obj.rotationSpeed * rotationMultiplier;

      // Apply transformation-specific motion modifications
      if (obj.exploding) {
        // Exploding objects fly apart faster
        obj.velocityX *= 1.05;
        obj.velocityY *= 1.05;
        obj.scale *= 0.95; // Shrink as they explode
      }
      if (obj.melting) {
        // Melting objects fall faster
        obj.velocityY += deltaTime * 2;
        obj.scale = Math.max(0.1, obj.scale - deltaTime * 0.3);
      }
      if (obj.shattered) {
        // Shattered pieces vibrate
        obj.x += (Math.random() - 0.5) * 2;
        obj.y += (Math.random() - 0.5) * 2;
      }

      // NEW TRANSFORMATION MOTION UPDATES
      if (obj.inversionActive) {
        // Spin faster and wobble
        obj.rotation += deltaTime * 2;
        obj.x += Math.sin(obj.lifetime * 5) * 0.5;
        obj.y += Math.cos(obj.lifetime * 5) * 0.3;
      }

      if (obj.vortexActive) {
        // Spiral motion
        obj.vortexAngle = (obj.vortexAngle || 0) + deltaTime * 3;
        obj.art = this.vortexArt(obj.originalArt);
        obj.rotation += deltaTime * 4;
      }

      if (obj.liquifying) {
        // Update liquify progress
        obj.liquifyProgress = Math.min(1, (obj.liquifyProgress || 0) + deltaTime * 0.3);
        obj.art = this.liquifyArt(obj.originalArt, obj.liquifyProgress);
        obj.velocityY += deltaTime * 5; // Fall faster
      }

      if (obj.crystallized) {
        // Vibrate slightly
        obj.x += (Math.random() - 0.5) * 0.3;
        obj.y += (Math.random() - 0.5) * 0.3;
      }

      if (obj.wormholeActive) {
        // Update wormhole pull
        obj.wormholeProgress = Math.min(1, (obj.wormholeProgress || 0) + deltaTime * 0.5);
        obj.art = this.wormholeArt(obj.originalArt, obj.wormholeProgress);
        // Pull toward center
        const centerX = this.screenWidth / 2;
        const centerY = this.screenHeight / 2;
        obj.velocityX += (centerX - obj.x) * deltaTime * 0.5;
        obj.velocityY += (centerY - obj.y) * deltaTime * 0.5;
      }

      if (obj.electrified) {
        // Electric pulses
        obj.electricPulse = (obj.electricPulse || 0) + deltaTime;
        if (obj.electricPulse > 0.1) {
          obj.art = this.electricArt(obj.originalArt);
          obj.electricPulse = 0;
        }
        // Jittery motion
        obj.x += (Math.random() - 0.5) * 2;
        obj.y += (Math.random() - 0.5) * 2;
      }

      if (obj.fractalActive) {
        // Recursive scaling
        obj.scale = 0.5 + Math.sin(obj.lifetime * 2) * 0.3;
        if (Math.random() < 0.05) {
          obj.art = this.fractalArt(obj.originalArt);
        }
      }

      if (obj.quantumActive) {
        // Phase in/out
        obj.quantumPhase = (obj.quantumPhase || 0) + deltaTime * 3;
        obj.art = this.quantumArt(obj.originalArt, obj.quantumPhase);
        // Quantum tunneling motion
        if (Math.random() < 0.01) {
          obj.x = Math.random() * this.screenWidth;
          obj.y = Math.random() * this.screenHeight;
        }
      }

      if (obj.plasmaActive) {
        // Wave motion
        obj.plasmaTime = (obj.plasmaTime || 0) + deltaTime * 2;
        obj.art = this.plasmaArt(obj.originalArt, obj.plasmaTime);
        obj.x += Math.sin(obj.plasmaTime) * 2;
        obj.y += Math.cos(obj.plasmaTime * 1.5) * 1.5;
      }

      if (obj.singularityActive) {
        // Update singularity phases
        obj.singularityProgress = (obj.singularityProgress || 0) + deltaTime * 0.5;

        if (obj.singularityPhase === 0 && obj.singularityProgress >= 1) {
          // Switch to explosion phase
          obj.singularityPhase = 1;
          obj.singularityProgress = 0;
        }

        obj.art = this.singularityArt(obj.originalArt, obj.singularityPhase, obj.singularityProgress);

        if (obj.singularityPhase === 1) {
          // Explosion forces
          obj.scale *= 1.1;
          obj.velocityX *= 1.2;
          obj.velocityY *= 1.2;
        }
      }

      // Scale pulses gently with amplitude, slight boost with velocity
      if (!obj.exploding && !obj.melting) {
        obj.scale = Math.min(
          0.8 +
            amplitude * 0.6 +
            velocity * 0.2 +
            Math.sin(obj.pulsePhase + obj.lifetime * 2) * 0.05,
          this.MAX_SCALE,
        );
      }

      // Enforce scale limits
      obj.scale = Math.max(this.MIN_SCALE, Math.min(obj.scale, this.MAX_SCALE));

      // Boundary bounce
      if (obj.x < 0 || obj.x > this.screenWidth - 10) {
        obj.velocityX *= -1;
        obj.x = Math.max(0, Math.min(this.screenWidth - 10, obj.x));
      }
      if (obj.y < 0 || obj.y > this.screenHeight - 10) {
        obj.velocityY *= -1;
        obj.y = Math.max(0, Math.min(this.screenHeight - 10, obj.y));
      }

      // Update lifetime
      obj.lifetime += deltaTime;

      // Update transformation progress
      if (obj.transformation) {
        obj.transformProgress += deltaTime * 2;
      }

      // Remove old objects or objects that are too small/large
      if (
        obj.lifetime > obj.maxLifetime ||
        obj.scale < this.MIN_SCALE ||
        obj.scale > this.MAX_SCALE * 2
      ) {
        // Safety check
        this.objects.splice(i, 1);
      }
    }
  }

  // Apply transformations to ASCII art
  transformArt(art, scale, rotation) {
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

  // Detect collisions between objects and apply EXTREME transformations
  detectAndHandleCollisions(amplitude, velocity) {
    for (let i = 0; i < this.objects.length; i++) {
      for (let j = i + 1; j < this.objects.length; j++) {
        const obj1 = this.objects[i];
        const obj2 = this.objects[j];

        // Skip if either is on cooldown
        if (obj1.collisionCooldown > 0 || obj2.collisionCooldown > 0) continue;

        // Calculate distance between objects (simple bounding box)
        const dx = Math.abs(obj1.x - obj2.x);
        const dy = Math.abs(obj1.y - obj2.y);
        const collisionDistance = 8 + (obj1.scale + obj2.scale) * 3;

        if (dx < collisionDistance && dy < collisionDistance) {
          // COLLISION DETECTED! Apply EXTREME transformations
          this.applyExtremeTransformation(obj1, obj2, amplitude, velocity);

          // Bounce objects apart with extreme force
          const angleFromObj1ToObj2 = Math.atan2(
            obj2.y - obj1.y,
            obj2.x - obj1.x,
          );
          const collisionForce = 3 + velocity * 5;

          obj1.velocityX -= Math.cos(angleFromObj1ToObj2) * collisionForce;
          obj1.velocityY -= Math.sin(angleFromObj1ToObj2) * collisionForce;
          obj2.velocityX += Math.cos(angleFromObj1ToObj2) * collisionForce;
          obj2.velocityY += Math.sin(angleFromObj1ToObj2) * collisionForce;

          // Set cooldown to prevent immediate re-collision
          obj1.collisionCooldown = 5.0; // 5 second cooldown for ALL collisions
          obj2.collisionCooldown = 5.0; // Consistent with multiplication protection
        }
      }
    }
  }

  // Apply EXTREME transformations to colliding objects
  applyExtremeTransformation(obj1, obj2, amplitude, velocity) {
    // Choose random extreme transformations for each object
    const transformations = [
      "EXPLODE",
      "INVERT",
      "MELT",
      "GLITCH",
      "MORPH",
      "SHATTER",
      "PIXELATE",
      "RAINBOW",
      "MIRROR",
      "CORRUPT",
      "DISSOLVE",
      "MULTIPLY",
      "INVERSION",
      "VORTEX",
      "LIQUIFY",
      "CRYSTALLIZE",
      "WORMHOLE",
      "ELECTRIC",
      "FRACTAL",
      "QUANTUM",
      "PLASMA",
      "SINGULARITY",
    ];

    // Sometimes transform one, sometimes both, sometimes ALL nearby objects!
    const transformBoth = Math.random() < 0.6; // 60% chance to transform both
    const chainReaction = Math.random() < 0.2 && velocity > 0.3; // 20% chance of chain reaction with high velocity

    const transform1 =
      transformations[Math.floor(Math.random() * transformations.length)];
    const transform2 =
      transformations[Math.floor(Math.random() * transformations.length)];

    // Apply to first object
    this.applyTransformationType(obj1, transform1);

    // Apply to second object if transforming both
    if (transformBoth) {
      this.applyTransformationType(obj2, transform2);
    }

    // CHAIN REACTION - affect ALL nearby objects!
    if (chainReaction) {
      const epicenterX = (obj1.x + obj2.x) / 2;
      const epicenterY = (obj1.y + obj2.y) / 2;
      const blastRadius = 20 + amplitude * 30;

      for (const obj of this.objects) {
        if (obj === obj1 || obj === obj2) continue;
        const dist = Math.sqrt(
          Math.pow(obj.x - epicenterX, 2) + Math.pow(obj.y - epicenterY, 2),
        );
        if (dist < blastRadius) {
          const randomTransform =
            transformations[Math.floor(Math.random() * transformations.length)];
          this.applyTransformationType(obj, randomTransform);
          // Blast them away from epicenter
          const angle = Math.atan2(obj.y - epicenterY, obj.x - epicenterX);
          obj.velocityX += (Math.cos(angle) * (blastRadius - dist)) / 5;
          obj.velocityY += (Math.sin(angle) * (blastRadius - dist)) / 5;
        }
      }
    }
  }

  // Apply specific transformation type to an object
  applyTransformationType(obj, transformType) {
    obj.transformation = transformType;
    obj.transformProgress = 0;

    switch (transformType) {
      case "EXPLODE":
        obj.exploding = true;
        obj.maxLifetime = Math.min(obj.maxLifetime, obj.lifetime + 2);
        obj.rotationSpeed *= 5;
        break;
      case "INVERT":
        obj.inverted = true;
        obj.art = this.invertArt(obj.art);
        break;
      case "MELT":
        obj.melting = true;
        obj.maxLifetime = Math.min(obj.maxLifetime, obj.lifetime + 3);
        break;
      case "GLITCH":
        obj.glitching = true;
        obj.art = this.glitchArt(obj.art);
        break;
      case "MORPH":
        obj.morphing = true;
        // Swap with random ASCII from the library
        if (this.objects.length > 2) {
          const randomObj =
            this.objects[Math.floor(Math.random() * this.objects.length)];
          if (randomObj !== obj && randomObj.originalArt) {
            obj.art = randomObj.originalArt;
          }
        }
        break;
      case "SHATTER":
        obj.shattered = true;
        obj.art = this.shatterArt(obj.art);
        break;
      case "PIXELATE":
        obj.pixelated = true;
        obj.art = this.pixelateArt(obj.art);
        break;
      case "RAINBOW":
        obj.rainbow = true;
        break;
      case "MIRROR":
        obj.art = this.mirrorArt(obj.art);
        break;
      case "CORRUPT":
        obj.art = this.corruptArt(obj.art);
        break;
      case "DISSOLVE":
        obj.melting = true;
        obj.art = this.dissolveArt(obj.art);
        obj.maxLifetime = Math.min(obj.maxLifetime, obj.lifetime + 1.5);
        break;
      case "MULTIPLY":
        // Create duplicates that fly off in different directions
        this.multiplyObject(obj);
        break;
      case "INVERSION":
        obj.inversionActive = true;
        obj.art = this.inversionArt(obj.art);
        obj.rotationSpeed *= 3;
        break;
      case "VORTEX":
        obj.vortexActive = true;
        obj.art = this.vortexArt(obj.art);
        obj.vortexAngle = 0;
        obj.rotationSpeed *= 5;
        break;
      case "LIQUIFY":
        obj.liquifying = true;
        obj.art = this.liquifyArt(obj.art, 0);
        obj.liquifyProgress = 0;
        obj.velocityY += 3;
        break;
      case "CRYSTALLIZE":
        obj.crystallized = true;
        obj.art = this.crystallizeArt(obj.art);
        obj.scale *= 1.2;
        break;
      case "WORMHOLE":
        obj.wormholeActive = true;
        obj.wormholeProgress = 0;
        obj.art = this.wormholeArt(obj.art, 0);
        break;
      case "ELECTRIC":
        obj.electrified = true;
        obj.art = this.electricArt(obj.art);
        obj.electricPulse = 0;
        break;
      case "FRACTAL":
        obj.fractalActive = true;
        obj.art = this.fractalArt(obj.art);
        obj.fractalDepth = 1;
        break;
      case "QUANTUM":
        obj.quantumActive = true;
        obj.quantumPhase = 0;
        obj.art = this.quantumArt(obj.art, 0);
        break;
      case "PLASMA":
        obj.plasmaActive = true;
        obj.plasmaTime = 0;
        obj.art = this.plasmaArt(obj.art, 0);
        break;
      case "SINGULARITY":
        obj.singularityActive = true;
        obj.singularityPhase = 0; // 0 = compress, 1 = explode
        obj.singularityProgress = 0;
        obj.art = this.singularityArt(obj.art, 0, 0);
        break;
    }
  }

  // Art transformation functions
  invertArt(art) {
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

  glitchArt(art) {
    const lines = art.art.split("\n");
    const glitchChars = "▓▒░█▄▌▐▀╔╗╚╝║═┌┐└┘│─";
    const glitched = lines.map((line) =>
      line
        .split("")
        .map((char) =>
          Math.random() < 0.3 && char !== " "
            ? glitchChars[Math.floor(Math.random() * glitchChars.length)]
            : char,
        )
        .join(""),
    );
    return { ...art, art: glitched.join("\n") };
  }

  shatterArt(art) {
    const lines = art.art.split("\n");
    const shattered = lines.map((line, i) => {
      const offset = Math.sin(i * 0.5) * 3;
      return (
        " ".repeat(Math.max(0, Math.floor(offset))) +
        line
          .split("")
          .map((char) => (Math.random() < 0.2 ? " " : char))
          .join("")
      );
    });
    return { ...art, art: shattered.join("\n") };
  }

  pixelateArt(art) {
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

  mirrorArt(art) {
    const lines = art.art.split("\n");
    const mirrored = lines.map((line) => line.split("").reverse().join(""));
    return { ...art, art: mirrored.join("\n") };
  }

  corruptArt(art) {
    const lines = art.art.split("\n");
    const corrupted = lines.map((line) => {
      if (Math.random() < 0.3) {
        // Corrupt entire line
        return line
          .split("")
          .map(() => String.fromCharCode(33 + Math.floor(Math.random() * 94)))
          .join("");
      }
      return line
        .split("")
        .map((char) =>
          Math.random() < 0.1
            ? String.fromCharCode(33 + Math.floor(Math.random() * 94))
            : char,
        )
        .join("");
    });
    return { ...art, art: corrupted.join("\n") };
  }

  dissolveArt(art) {
    const lines = art.art.split("\n");
    const dissolved = lines.map((line, i) =>
      line
        .split("")
        .map((char, j) => {
          const dissolveChance = (i + j) / (lines.length + line.length);
          return Math.random() < dissolveChance * 0.5 ? " " : char;
        })
        .join(""),
    );
    return { ...art, art: dissolved.join("\n") };
  }

  multiplyObject(obj) {
    // Prevent multiplication if we're already near the limit
    const totalMultiplyCount = this.objects.filter(
      (o) => o.transformation === "MULTIPLY",
    ).length;
    if (
      totalMultiplyCount >= this.MULTIPLY_LIMIT ||
      this.objects.length > this.MAX_OBJECTS - 4
    ) {
      // Don't multiply, just apply a different effect instead
      obj.exploding = true;
      return;
    }

    // Set cooldown on SOURCE object to prevent immediate re-multiplication
    obj.collisionCooldown = 5.0; // 5 second cooldown for source too!

    // Create 2-3 copies (reduced from 2-4)
    const copies = 2 + Math.floor(Math.random() * 2);
    const actualCopies = Math.min(
      copies,
      this.MAX_OBJECTS - this.objects.length,
    );

    for (let i = 0; i < actualCopies; i++) {
      const angle = (Math.PI * 2 * i) / actualCopies;
      const speed = 3 + Math.random() * 4; // Faster initial speed to spread out
      const spread = 10 + Math.random() * 10; // Spawn further apart (10-20 units)
      const newObj = {
        ...obj,
        x: obj.x + Math.cos(angle) * spread, // Position in circle around source
        y: obj.y + Math.sin(angle) * spread, // Spread out more
        velocityX: Math.cos(angle) * speed,
        velocityY: Math.sin(angle) * speed,
        scale: Math.min(
          obj.scale * (0.5 + Math.random() * 0.5),
          this.MAX_SCALE,
        ),
        lifetime: 0,
        maxLifetime: 2 + Math.random() * 2,
        art: { ...obj.art },
        originalArt: obj.originalArt,
        transformation: null, // Clear parent transformation - fresh copy
        collisionCooldown: 5.0, // 5 SECOND IMMUNITY for multiplied objects!
        isMultipliedCopy: true, // Flag to identify multiplied copies
        // Reset all transformation states from parent
        inverted: false,
        exploding: false,
        melting: false,
        glitching: false,
        morphing: false,
        shattered: false,
        pixelated: false,
        rainbow: false,
      };

      // Only add if we haven't hit the limit
      if (this.objects.length < this.MAX_OBJECTS) {
        this.objects.push(newObj);
      } else {
        break;
      }
    }
  }

  // INVERSION - Swaps inner and outer characters
  inversionArt(art) {
    const lines = art.art.split("\n");
    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));

    // Find center point
    const centerY = Math.floor(height / 2);
    const centerX = Math.floor(width / 2);

    // Create a distance map
    const distanceMap = [];
    const chars = [];

    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        if (lines[y][x] && lines[y][x] !== ' ') {
          const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(y - centerY, 2));
          distanceMap.push({ char: lines[y][x], dist, x, y });
          chars.push(lines[y][x]);
        }
      }
    }

    // Sort by distance and reverse the character assignment
    distanceMap.sort((a, b) => a.dist - b.dist);
    chars.sort((a, b) => Math.random() - 0.5); // Shuffle for chaos

    // Create new art with inverted positions
    const inverted = lines.map(line => line.split(''));

    // Clear the array first
    for (let y = 0; y < inverted.length; y++) {
      for (let x = 0; x < inverted[y].length; x++) {
        if (inverted[y][x] !== ' ') inverted[y][x] = ' ';
      }
    }

    // Place characters in inverted positions
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

    return { ...art, art: inverted.map(line => line.join('')).join("\n") };
  }

  // VORTEX - Creates spiral rotation effect
  vortexArt(art) {
    const lines = art.art.split("\n");
    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));
    const centerY = Math.floor(height / 2);
    const centerX = Math.floor(width / 2);

    const vortexed = Array(height).fill(null).map(() => Array(width).fill(' '));

    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        if (lines[y][x] && lines[y][x] !== ' ') {
          // Calculate angle and distance from center
          const dx = x - centerX;
          const dy = y - centerY;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          // Apply vortex rotation based on distance
          const vortexStrength = 0.5;
          const newAngle = angle + (dist * vortexStrength);

          // Calculate new position
          const newX = Math.round(centerX + Math.cos(newAngle) * dist);
          const newY = Math.round(centerY + Math.sin(newAngle) * dist);

          if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
            vortexed[newY][newX] = lines[y][x];
          }
        }
      }
    }

    return { ...art, art: vortexed.map(line => line.join('')).join("\n") };
  }

  // LIQUIFY - Dripping liquid effect
  liquifyArt(art, progress) {
    const lines = art.art.split("\n");
    const liquified = [];
    const dropChars = ['▼', '▽', '╲', '╱', '│', '┃', '┆', '┊', '╿'];

    for (let y = 0; y < lines.length; y++) {
      let line = '';
      for (let x = 0; x < lines[y].length; x++) {
        const char = lines[y][x];
        if (char !== ' ') {
          // Add drips based on position and progress
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

      // Add extra drip lines
      if (Math.random() < progress * 0.3 && y < lines.length - 1) {
        let dripLine = '';
        for (let x = 0; x < line.length; x++) {
          if (line[x] !== ' ' && Math.random() < 0.2) {
            dripLine += dropChars[Math.floor(Math.random() * dropChars.length)];
          } else {
            dripLine += ' ';
          }
        }
        liquified.push(dripLine);
      }
    }

    return { ...art, art: liquified.join("\n") };
  }

  // CRYSTALLIZE - Angular crystal patterns
  crystallizeArt(art) {
    const lines = art.art.split("\n");
    const crystalChars = ['◆', '◇', '⬟', '⬢', '⬡', '⬠', '◈', '◊', '⟐', '⟡', '⬗', '⬖'];

    const crystallized = lines.map((line, y) =>
      line.split('').map((char, x) => {
        if (char !== ' ') {
          // Use position to determine crystal pattern
          const pattern = (x + y) % crystalChars.length;
          return crystalChars[pattern];
        }
        return char;
      }).join('')
    );

    return { ...art, art: crystallized.join("\n") };
  }

  // WORMHOLE - Tunnel effect to center
  wormholeArt(art, progress) {
    const lines = art.art.split("\n");
    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));
    const centerY = Math.floor(height / 2);
    const centerX = Math.floor(width / 2);

    const wormholed = Array(height).fill(null).map(() => Array(width).fill(' '));

    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        if (lines[y][x] && lines[y][x] !== ' ') {
          // Calculate pull toward center
          const dx = centerX - x;
          const dy = centerY - y;
          const pullStrength = progress;

          const newX = Math.round(x + dx * pullStrength);
          const newY = Math.round(y + dy * pullStrength);

          if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
            // Add tunnel distortion characters
            const tunnelChars = ['○', '◎', '◉', '●', '◐', '◑', '◒', '◓'];
            const dist = Math.sqrt(dx * dx + dy * dy);
            const charIndex = Math.floor(dist / 3) % tunnelChars.length;
            wormholed[newY][newX] = Math.random() < 0.7
              ? lines[y][x]
              : tunnelChars[charIndex];
          }
        }
      }
    }

    return { ...art, art: wormholed.map(line => line.join('')).join("\n") };
  }

  // ELECTRIC - Lightning bolt patterns
  electricArt(art) {
    const lines = art.art.split("\n");
    const electricChars = ['⚡', '↯', '⟟', '⌁', '↯', '╱', '╲', '╳', '⟡'];

    const electrified = lines.map((line, y) => {
      let newLine = '';
      for (let x = 0; x < line.length; x++) {
        const char = line[x];
        if (char !== ' ') {
          // Random electric sparks
          if (Math.random() < 0.3) {
            newLine += electricChars[Math.floor(Math.random() * electricChars.length)];
          } else {
            newLine += char;
          }
        } else {
          // Add random sparks in empty spaces near characters
          if (x > 0 && x < line.length - 1 &&
              (line[x-1] !== ' ' || line[x+1] !== ' ') &&
              Math.random() < 0.1) {
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

  // FRACTAL - Recursive self-similar patterns
  fractalArt(art) {
    const lines = art.art.split("\n");
    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));

    // Create smaller copies
    const fractal = [...lines];

    // Add mini versions at corners
    const miniHeight = Math.floor(height / 3);
    const miniWidth = Math.floor(width / 3);

    for (let y = 0; y < miniHeight && y < lines.length; y++) {
      for (let x = 0; x < miniWidth && x < lines[y].length; x++) {
        if (lines[y * 3] && lines[y * 3][x * 3] && lines[y * 3][x * 3] !== ' ') {
          // Place mini copies in corners
          if (fractal[y]) {
            const char = lines[y * 3][x * 3];
            // Top-left mini
            if (x < fractal[y].length) {
              fractal[y] = fractal[y].substring(0, x) + char + fractal[y].substring(x + 1);
            }
          }
        }
      }
    }

    return { ...art, art: fractal.join("\n") };
  }

  // QUANTUM - Phasing in/out effect
  quantumArt(art, phase) {
    const lines = art.art.split("\n");
    const quantumChars = ['░', '▒', '▓', '█', '◌', '○', '●'];

    const quantum = lines.map((line, y) =>
      line.split('').map((char, x) => {
        if (char !== ' ') {
          // Quantum probability wave
          const probability = Math.sin(phase + x * 0.5 + y * 0.3);

          if (Math.abs(probability) < 0.3) {
            // Phase out
            return ' ';
          } else if (Math.abs(probability) < 0.6) {
            // Quantum fuzzy state
            return quantumChars[Math.floor(Math.random() * quantumChars.length)];
          } else {
            // Solid state
            return char;
          }
        }
        return char;
      }).join('')
    );

    return { ...art, art: quantum.join("\n") };
  }

  // PLASMA - Wave distortions
  plasmaArt(art, time) {
    const lines = art.art.split("\n");
    const plasma = [];

    for (let y = 0; y < lines.length; y++) {
      let newLine = '';
      const waveOffset = Math.sin(time + y * 0.3) * 3;

      for (let x = 0; x < lines[y].length + Math.abs(waveOffset); x++) {
        const sourceX = Math.round(x - waveOffset);

        if (sourceX >= 0 && sourceX < lines[y].length) {
          const char = lines[y][sourceX];
          if (char !== ' ') {
            // Apply plasma coloring effect via character substitution
            const plasmaChars = ['≈', '~', '∿', '∾', '∽', '≋'];
            if (Math.random() < 0.2) {
              newLine += plasmaChars[Math.floor((x + y + time * 10) % plasmaChars.length)];
            } else {
              newLine += char;
            }
          } else {
            newLine += ' ';
          }
        } else {
          newLine += ' ';
        }
      }
      plasma.push(newLine);
    }

    return { ...art, art: plasma.join("\n") };
  }

  // SINGULARITY - Compress then explode
  singularityArt(art, phase, progress) {
    const lines = art.art.split("\n");
    const height = lines.length;
    const width = Math.max(...lines.map(l => l.length));
    const centerY = Math.floor(height / 2);
    const centerX = Math.floor(width / 2);

    const singularity = Array(height).fill(null).map(() => Array(width).fill(' '));

    for (let y = 0; y < lines.length; y++) {
      for (let x = 0; x < lines[y].length; x++) {
        if (lines[y][x] && lines[y][x] !== ' ') {
          const dx = x - centerX;
          const dy = y - centerY;

          let newX, newY;

          if (phase === 0) {
            // Compression phase
            const compressionFactor = 1 - progress * 0.9;
            newX = Math.round(centerX + dx * compressionFactor);
            newY = Math.round(centerY + dy * compressionFactor);
          } else {
            // Explosion phase
            const explosionFactor = 1 + progress * 3;
            newX = Math.round(centerX + dx * explosionFactor);
            newY = Math.round(centerY + dy * explosionFactor);
          }

          if (newY >= 0 && newY < height && newX >= 0 && newX < width) {
            // Add singularity effects
            if (phase === 0 && progress > 0.7) {
              singularity[newY][newX] = '◉';
            } else if (phase === 1) {
              const explodeChars = ['*', '✦', '✧', '⟟', '✱', '✲', '✳'];
              singularity[newY][newX] = explodeChars[Math.floor(Math.random() * explodeChars.length)];
            } else {
              singularity[newY][newX] = lines[y][x];
            }
          }
        }
      }
    }

    return { ...art, art: singularity.map(line => line.join('')).join("\n") };
  }

  // Check if character is a border (edge detection)
  isBorder(lines, row, col) {
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
}

// Render manager
class RenderManager {
  constructor() {
    this.colorSystem = new ColorSystem();
    this.transformManager = new TransformManager();
    this.buffer = [];
  }

  clear() {
    process.stdout.write("\x1B[2J\x1B[H");
  }

  render(amplitude, elapsed, showOSD = false) {
    const width = process.stdout.columns || 80;
    const height = process.stdout.rows || 24;

    // Initialize screen buffer with background
    this.buffer = Array(height)
      .fill(null)
      .map(() => Array(width).fill(" "));
    const colorBuffer = Array(height)
      .fill(null)
      .map(() => Array(width).fill(""));

    // Set background color
    const bgColor = this.colorSystem.getBackgroundColor(amplitude, elapsed);

    // Render each object
    this.transformManager.objects.forEach((obj, index) => {
      const transformed = this.transformManager.transformArt(
        obj.art,
        obj.scale,
        obj.rotation,
      );
      const borderColor = this.colorSystem.getBorderColor(
        amplitude + index * 0.1,
        elapsed,
      );
      const interiorColor = this.colorSystem.getInteriorColor(
        amplitude + index * 0.15,
        elapsed,
      );

      // Place transformed art in buffer
      const startY = Math.floor(obj.y);
      const startX = Math.floor(obj.x);

      for (let y = 0; y < transformed.length; y++) {
        for (let x = 0; x < transformed[y].length; x++) {
          const screenY = startY + y;
          const screenX = startX + x;

          if (
            screenY >= 0 &&
            screenY < height &&
            screenX >= 0 &&
            screenX < width
          ) {
            const char = transformed[y][x];
            if (char !== " ") {
              this.buffer[screenY][screenX] = char;

              // Determine color based on transformation effects
              let finalColor;

              // Apply RAINBOW effect if active
              if (obj.rainbow) {
                const rainbowHue =
                  ((screenX + screenY + elapsed * 100) * 10) % 360;
                finalColor = this.colorSystem.hslToAnsi(rainbowHue, 100, 60);
              } else if (obj.glitching) {
                // Glitch effect - random colors
                const glitchHue = Math.random() * 360;
                finalColor = this.colorSystem.hslToAnsi(glitchHue, 100, 50);
              } else if (obj.inverted) {
                // Inverted colors
                const isBorder = this.transformManager.isBorder(
                  transformed,
                  y,
                  x,
                );
                finalColor = isBorder ? interiorColor : borderColor;
              } else {
                // Normal coloring
                const isBorder = this.transformManager.isBorder(
                  transformed,
                  y,
                  x,
                );
                finalColor = isBorder ? borderColor : interiorColor;
              }

              colorBuffer[screenY][screenX] = finalColor;
            }
          }
        }
      }
    });

    // Output the buffer with colors
    let output = bgColor;

    const maxHeight = showOSD ? height - 5 : height; // Use full height if no OSD

    for (let y = 0; y < maxHeight; y++) {
      let line = "";
      let lastColor = bgColor;

      for (let x = 0; x < width; x++) {
        const char = this.buffer[y][x];
        const color = colorBuffer[y][x] || "";

        if (color !== lastColor) {
          line += color || bgColor;
          lastColor = color;
        }

        line += char;
      }

      output += line;
      if (y < maxHeight - 1) output += "\n";
    }

    // Only add status bar if OSD is enabled
    if (showOSD) {
      output += "\x1B[0m\n"; // Reset colors
      output += this.renderStatusBar(amplitude, elapsed);
    } else {
      output += "\x1B[0m"; // Just reset colors
    }

    process.stdout.write(output);
  }

  renderStatusBar(amplitude, elapsed) {
    const width = process.stdout.columns || 80;
    const meterWidth = Math.min(50, width - 20);
    const filledBars = Math.floor(amplitude * meterWidth);
    const emptyBars = meterWidth - filledBars;

    // Create gradient meter
    let meter = "";
    for (let i = 0; i < filledBars; i++) {
      const hue = (i / meterWidth) * 120; // Green to red
      const color = this.colorSystem.hslToAnsi(120 - hue, 100, 50);
      meter += color + "█";
    }
    meter += "\x1B[90m" + "░".repeat(emptyBars) + "\x1B[0m";

    return `\x1B[K╔${"═".repeat(width - 2)}╗
\x1B[K║ 🎵 ENHANCED AUDIO VISUALIZATION | Time: ${elapsed.toFixed(1)}s | Level: ${(amplitude * 100).toFixed(0)}% ${"".padEnd(width - 60)}║
\x1B[K║ [${meter}] ${"".padEnd(width - meterWidth - 5)}║
\x1B[K╚${"═".repeat(width - 2)}╝\x1B[0m`;
  }
}

// Choreography Manager for handling timeline-based events
class ChoreographyManager {
  constructor(choreographyData) {
    this.data = choreographyData;
    this.metadata = choreographyData.metadata || {};
    this.settings = choreographyData.settings || {};
    this.templates = choreographyData.templates || {};
    this.timeline = choreographyData.timeline || [];
    this.tracks = choreographyData.tracks || [];

    // Track executed events to avoid duplicates
    this.executedEvents = new Set();
    this.activeObjects = new Map(); // Track spawned objects by ID
    this.timelineIndex = 0;

    // Calculate centroid of all spawn positions for centering
    this.centroid = this.calculateCentroid();
  }

  // Calculate the average position of all spawn actions
  calculateCentroid() {
    const positions = [];

    // Collect all spawn positions from timeline
    for (const event of this.timeline) {
      if (!event.actions) continue;
      for (const action of event.actions) {
        if (action.type === 'spawn' && action.position) {
          const x = typeof action.position.x === 'number' ? action.position.x : null;
          const y = typeof action.position.y === 'number' ? action.position.y : null;
          if (x !== null && y !== null) {
            positions.push({ x, y });
          }
        }
      }
    }

    // Calculate average
    if (positions.length === 0) {
      return { x: 960, y: 540 }; // Default to 1920x1080 center
    }

    const sumX = positions.reduce((sum, pos) => sum + pos.x, 0);
    const sumY = positions.reduce((sum, pos) => sum + pos.y, 0);

    return {
      x: sumX / positions.length,
      y: sumY / positions.length
    };
  }

  // Convert simple shape strings to ASCII art format
  convertShapeToArt(shape) {
    // Map simple characters to proper ASCII art objects
    const shapeMap = {
      "★": { art: "  ★\n ★★★\n  ★", type: "small" },
      "♪": { art: " ♪\n╱|╲", type: "small" },
      "◆": { art: "  ◆\n ◆◆◆\n  ◆", type: "small" },
      "●": { art: "  ●\n ●●●\n  ●", type: "small" },
      "▲": { art: "  ▲\n ▲▲▲", type: "small" },
      "■": { art: " ■■■\n ■■■\n ■■■", type: "small" },
    };

    // If it's a simple character, convert it
    if (shapeMap[shape]) {
      return shapeMap[shape];
    }

    // Otherwise assume it's already formatted ASCII art
    // Handle arrays by joining with newlines
    return { art: Array.isArray(shape) ? shape.join("\n") : shape, type: "medium" };
  }

  // Get template object definition
  getTemplate(templateName) {
    if (!this.templates.objects || !this.templates.objects[templateName]) {
      // Return a default template if not found
      return {
        shape: "★",
        defaultColor: "white",
        defaultScale: 1,
        physics: { mass: 1, friction: 0.1, elasticity: 0.8 },
      };
    }
    return this.templates.objects[templateName];
  }

  // Get movement preset
  getMovementPreset(presetName) {
    if (!this.templates.movements || !this.templates.movements[presetName]) {
      return null;
    }
    return this.templates.movements[presetName];
  }

  // Process timeline events for the current time
  processTimeline(currentTime, transformManager, amplitude, velocity) {
    // Process all events that should trigger by current time
    for (let i = this.timelineIndex; i < this.timeline.length; i++) {
      const event = this.timeline[i];
      const eventId = `event_${i}`;

      // Check if this event has already been executed
      if (this.executedEvents.has(eventId)) {
        continue;
      }

      // Check trigger conditions
      const shouldTrigger = this.checkTrigger(
        event.trigger,
        currentTime,
        amplitude,
        velocity,
      );

      if (shouldTrigger) {
        // Execute all actions for this event
        if (event.actions) {
          for (const action of event.actions) {
            this.executeAction(action, transformManager, amplitude, velocity);
          }
        }

        // Mark as executed (unless it's a loop)
        if (event.trigger.type !== "loop" || event.trigger.count !== -1) {
          this.executedEvents.add(eventId);
        }

        // Update timeline index for time-based events
        if (event.trigger.type === "time") {
          this.timelineIndex = i + 1;
        }
      } else if (
        event.trigger.type === "time" &&
        event.trigger.at > currentTime
      ) {
        // Stop checking future time-based events
        break;
      }
    }
  }

  // Check if a trigger condition is met
  checkTrigger(trigger, currentTime, amplitude, velocity) {
    switch (trigger.type) {
      case "time":
        return currentTime >= trigger.at;

      case "beat":
        // Calculate beat time based on BPM
        const beatsPerSecond = (this.metadata.bpm || 120) / 60;
        const beatTime =
          ((trigger.measure - 1) * 4) / beatsPerSecond +
          (trigger.beat - 1) / beatsPerSecond;
        return currentTime >= beatTime;

      case "audio":
        // Check audio conditions
        if (trigger.condition) {
          const { parameter, operator, value } = trigger.condition;
          let paramValue = 0;

          if (parameter === "amplitude") paramValue = amplitude;
          else if (parameter === "velocity") paramValue = velocity;

          switch (operator) {
            case ">":
              return paramValue > value;
            case "<":
              return paramValue < value;
            case "==":
              return Math.abs(paramValue - value) < 0.01;
            case "spike":
              return velocity > value && amplitude > 0.3;
            case "drop":
              return velocity < -value && amplitude < 0.3;
          }
        }
        return false;

      case "loop":
        // Check loop timing
        const loopTime =
          Math.floor(currentTime / trigger.every) * trigger.every;
        const loopId = `loop_${trigger.every}_${loopTime}`;
        if (!this.executedEvents.has(loopId)) {
          this.executedEvents.add(loopId);
          return true;
        }
        return false;

      default:
        return false;
    }
  }

  // Execute an action
  executeAction(action, transformManager, amplitude, velocity) {
    switch (action.type) {
      case "spawn":
        this.executeSpawn(action, transformManager, amplitude, velocity);
        break;
      case "move":
        this.executeMove(action, transformManager);
        break;
      case "transform":
        this.executeTransform(action, transformManager);
        break;
      case "destroy":
        this.executeDestroy(action, transformManager);
        break;
      case "visual":
        this.executeVisual(action, transformManager);
        break;
      case "formation":
        this.executeFormation(action, transformManager);
        break;
      case "audio-map":
        this.executeAudioMap(action, transformManager);
        break;
    }
  }

  // Spawn a new object
  executeSpawn(action, transformManager, amplitude, velocity) {
    const template = this.getTemplate(action.template);
    const art = this.convertShapeToArt(template.shape);

    // Determine position
    let x = 0,
      y = 0;
    if (action.position) {
      const termCols = process.stdout.columns || 80;
      const termRows = process.stdout.rows || 24;
      const termCenterX = termCols / 2;
      const termCenterY = termRows / 2;

      // Handle x coordinate with scaling and centering
      if (action.position.x === "random") {
        x = Math.random() * (termCols - 10);
      } else if (action.position.x === "center") {
        x = termCenterX;
      } else if (typeof action.position.x === 'number') {
        // Scale from 1920-based pixel coordinate to terminal columns
        const scaledX = (action.position.x / 1920) * termCols;
        // Calculate centroid offset to center the choreography
        const centroidScaledX = (this.centroid.x / 1920) * termCols;
        const offsetX = termCenterX - centroidScaledX;
        // Apply offset
        x = scaledX + offsetX;
      } else {
        x = action.position.x;
      }

      // Handle y coordinate with scaling and centering
      if (action.position.y === "random") {
        y = Math.random() * (termRows - 10);
      } else if (action.position.y === "center") {
        y = termCenterY;
      } else if (typeof action.position.y === 'number') {
        // Scale from 1080-based pixel coordinate to terminal rows
        const scaledY = (action.position.y / 1080) * termRows;
        // Calculate centroid offset to center the choreography
        const centroidScaledY = (this.centroid.y / 1080) * termRows;
        const offsetY = termCenterY - centroidScaledY;
        // Apply offset
        y = scaledY + offsetY;
      } else {
        y = action.position.y;
      }
    }

    // Add object to transform manager
    transformManager.addObject(
      art,
      x,
      y,
      template.defaultScale || 1,
      0,
      amplitude,
      velocity,
    );

    // Track the spawned object
    const newObj =
      transformManager.objects[transformManager.objects.length - 1];
    if (action.objectId) {
      this.activeObjects.set(action.objectId, newObj);
      newObj.choreographyId = action.objectId;
    }
  }

  // Move objects
  executeMove(action, transformManager) {
    let targets = [];

    if (action.target === "all") {
      targets = transformManager.objects;
    } else if (this.activeObjects.has(action.target)) {
      targets = [this.activeObjects.get(action.target)];
    }

    // Apply movement to targets
    for (const obj of targets) {
      if (action.movement.preset) {
        const preset = this.getMovementPreset(action.movement.preset);
        if (preset && preset.type === "linear") {
          // Apply linear movement
          const speed = preset.parameters.speed || 0.5;
          obj.velocityX = (Math.random() - 0.5) * speed * 10;
          obj.velocityY = (Math.random() - 0.5) * speed * 10;
        } else if (preset && preset.type === "circular") {
          // Set up circular movement
          obj.circularMotion = {
            radius: preset.parameters.radius || 10,
            speed: preset.parameters.speed || 1,
            angle: 0,
          };
        }
      } else if (action.movement.velocity) {
        // Direct velocity setting
        obj.velocityX = action.movement.velocity.x || 0;
        obj.velocityY = action.movement.velocity.y || 0;
      }
    }
  }

  // Apply transformation effects
  executeTransform(action, transformManager) {
    let targets = [];

    if (action.target === "all") {
      targets = transformManager.objects;
    } else if (this.activeObjects.has(action.target)) {
      targets = [this.activeObjects.get(action.target)];
    }

    // Apply transformation to targets
    for (const obj of targets) {
      transformManager.applyTransformationType(obj, action.effect);
    }
  }

  // Destroy objects
  executeDestroy(action, transformManager) {
    if (action.target === "all") {
      transformManager.objects.length = 0;
    } else if (this.activeObjects.has(action.target)) {
      const obj = this.activeObjects.get(action.target);
      const index = transformManager.objects.indexOf(obj);
      if (index > -1) {
        transformManager.objects.splice(index, 1);
      }
      this.activeObjects.delete(action.target);
    }
  }

  // Apply visual changes
  executeVisual(action, transformManager) {
    let targets = [];

    if (action.target === "all") {
      targets = transformManager.objects;
    } else if (this.activeObjects.has(action.target)) {
      targets = [this.activeObjects.get(action.target)];
    }

    // Apply visual changes to targets
    for (const obj of targets) {
      if (action.changes) {
        if (action.changes.scale !== undefined) {
          obj.scale = action.changes.scale;
        }
        if (action.changes.rotation !== undefined) {
          obj.rotation = (action.changes.rotation * Math.PI) / 180;
        }
      }
    }
  }

  // Create formations
  executeFormation(action, transformManager) {
    // Implementation for formation patterns
    // This would arrange objects in specified patterns
  }

  // Map audio to visual properties
  executeAudioMap(action, transformManager) {
    // Implementation for audio mapping
    // This would link audio properties to visual properties
  }
}

// Parse playlist file format: 'wavfile.wav' 'choreography.json' per line
function parsePlaylist(playlistFile) {
  try {
    const content = fs.readFileSync(playlistFile, 'utf8');
    const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
    const playlist = [];
    const baseDir = path.dirname(path.resolve(playlistFile));

    for (const [lineNum, line] of lines.entries()) {
      try {
        // Match quoted filenames with spaces: 'file name.wav' 'choreo file.json'
        const matches = line.match(/'([^']+)'/g);

        if (!matches || matches.length < 1) {
          console.warn(`⚠️  Line ${lineNum + 1}: Invalid format, skipping - "${line}"`);
          continue;
        }

        const wavFile = matches[0].replace(/'/g, '');
        const choreographyFile = matches[1] ? matches[1].replace(/'/g, '') : null;

        // Validate audio file format
        const validAudioExtensions = ['.wav', '.flac', '.mp3', '.ogg', '.m4a'];
        const ext = path.extname(wavFile).toLowerCase();

        if (!validAudioExtensions.includes(ext)) {
          console.warn(`⚠️  Line ${lineNum + 1}: Unsupported audio format ${ext}, skipping - ${wavFile}`);
          continue;
        }

        // Resolve relative paths
        const resolvedWav = path.isAbsolute(wavFile)
          ? wavFile
          : path.join(baseDir, wavFile);

        if (!fs.existsSync(resolvedWav)) {
          console.warn(`⚠️  Line ${lineNum + 1}: Audio file not found, skipping - ${wavFile}`);
          continue;
        }

        // Check if it's actually a regular file
        const stat = fs.statSync(resolvedWav);
        if (!stat.isFile()) {
          console.warn(`⚠️  Line ${lineNum + 1}: Not a regular file, skipping - ${wavFile}`);
          continue;
        }

        if (stat.size === 0) {
          console.warn(`⚠️  Line ${lineNum + 1}: Empty audio file, skipping - ${wavFile}`);
          continue;
        }

        // Resolve choreography file if present
        let resolvedChoreo = null;
        if (choreographyFile) {
          resolvedChoreo = path.isAbsolute(choreographyFile)
            ? choreographyFile
            : path.join(baseDir, choreographyFile);

          if (!fs.existsSync(resolvedChoreo)) {
            console.warn(`⚠️  Line ${lineNum + 1}: Choreography file not found - ${choreographyFile}`);
            resolvedChoreo = null;
          }
        }

        playlist.push({
          audioFile: resolvedWav,
          choreographyFile: resolvedChoreo
        });
      } catch (lineError) {
        console.warn(`⚠️  Line ${lineNum + 1}: Parse error - ${lineError.message}`);
        continue;
      }
    }

    return playlist;
  } catch (error) {
    console.error(`❌ Failed to read playlist file: ${error.message}`);
    throw error;
  }
}

// Playlist controller class
class PlaylistController {
  constructor(playlist) {
    this.playlist = playlist;
    this.currentIndex = 0;
    this.isPlaying = false;
  }

  get current() {
    return this.playlist[this.currentIndex];
  }

  next() {
    if (this.currentIndex < this.playlist.length - 1) {
      this.currentIndex++;
      return true;
    }
    return false;
  }

  previous() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return true;
    }
    return false;
  }

  get hasNext() {
    return this.currentIndex < this.playlist.length - 1;
  }

  get hasPrevious() {
    return this.currentIndex > 0;
  }
}

// Main animation controller
async function startEnhancedAnimation(audioFile, choreographyFile = null, showOSD = false, playlistController = null, recordMode = false) {
  if (!fs.existsSync(audioFile)) {
    console.error(`Error: Audio file '${audioFile}' not found`);
    return false;
  }

  let recorderProcess = null;
  let recordingOutputFile = null;
  let choreographyManager = null;

  // Load choreography if provided
  if (choreographyFile) {
    if (!fs.existsSync(choreographyFile)) {
      console.error(`Error: Choreography file '${choreographyFile}' not found`);
      return false;
    }

    try {
      const choreographyData = JSON.parse(
        fs.readFileSync(choreographyFile, "utf8"),
      );
      choreographyManager = new ChoreographyManager(choreographyData);
      console.log(
        `🎭 Loaded choreography: ${choreographyManager.metadata.name || "Unnamed"}`,
      );
      console.log(`   • Duration: ${choreographyManager.metadata.duration}s`);
      console.log(`   • BPM: ${choreographyManager.metadata.bpm || "N/A"}`);
      console.log(
        `   • Timeline events: ${choreographyManager.timeline.length}`,
      );
    } catch (error) {
      console.error(`Error loading choreography file: ${error.message}`);
      return false;
    }
  }

  // Show track info if in playlist mode
  if (playlistController) {
    console.log(`\n📁 Track ${playlistController.currentIndex + 1}/${playlistController.playlist.length}: ${path.basename(audioFile)}`);
    if (choreographyFile) {
      console.log(`   🎭 With choreography: ${path.basename(choreographyFile)}`);
    }
    console.log(`   ⌨️  Controls: [n]ext | [p]revious | [q]uit`);
  }

  console.log("🎵 Analyzing audio for enhanced visualization...");

  // Check if this WAV file is associated with an ABC notation
  const customArtData = asciiArtManager.getArtForWav(audioFile);
  let customFrames = null;

  if (customArtData) {
    console.log(
      `🎨 Found custom AI-generated ASCII art for ${customArtData.abcBasename}`,
    );
    customFrames = asciiArtManager.formatShapesForVisualization(
      customArtData.shapes,
    );
    console.log(`   • Loaded ${customFrames.length} custom shapes`);
    if (customArtData.metadata.title) {
      console.log(`   • Title: ${customArtData.metadata.title}`);
    }
  }

  // Analyze audio
  const analyzer = new AudioAnalyzer(audioFile, {
    sampleRate: 30, // Higher sample rate for smoother animation
    method: "sox",
  });

  const samples = await analyzer.extractAmplitudes();
  const duration = samples.length / 30;

  // Calculate velocities (rate of change) from amplitude data
  const velocities = [0]; // First velocity is 0
  const onsets = [];

  for (let i = 1; i < samples.length; i++) {
    const velocity = Math.abs(samples[i] - samples[i - 1]);
    velocities.push(velocity);

    // Detect onset when amplitude increases significantly
    if (samples[i] > samples[i - 1] * 1.3 && samples[i] > 0.2) {
      onsets.push({
        index: i,
        time: i / 30,
        strength: samples[i],
        velocity: velocity,
      });
    }
  }

  const avgVelocity = velocities.reduce((a, b) => a + b, 0) / velocities.length;
  console.log(`   • Onsets detected: ${onsets.length}`);
  console.log(`   • Average velocity: ${avgVelocity.toFixed(3)}`);

  console.log("🌟 Starting enhanced ASCII animation with:");
  console.log("  • Vibrant HSL colors");
  if (choreographyManager) {
    console.log("  • 🎭 CHOREOGRAPHY MODE - Timeline-driven visualization");
    console.log("  • Objects controlled by choreography events");
  } else {
    console.log("  • Audio-driven motion (no random speed)");
    console.log("  • Starts with 0 objects, spawns based on audio");
  }
  console.log("  • 120 FPS ultra-smooth rendering");
  if (customFrames) {
    console.log(
      `  • Using AI-generated ASCII art for ${customArtData.abcBasename} (${customFrames.length} shapes)`,
    );
  } else {
    console.log("  • Using existing project ASCII shapes");
  }
  console.log("  • Background colors");
  console.log("  • Border/interior differentiation");
  console.log(
    showOSD ? "  • OSD enabled" : "  • OSD disabled (use --osd to show)",
  );

  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Initialize render manager
  const renderManager = new RenderManager();

  // Hide cursor and clear screen
  process.stdout.write("\x1B[?25l");
  renderManager.clear();

  // Start audio playback at 100% volume
  const mpv = spawn("mpv", [
    audioFile,
    "--no-video",
    "--really-quiet",
    "--volume=100",
  ]);

  mpv.on("error", (err) => {
    console.error("Error starting mpv:", err.message);
    process.exit(1);
  });

  // Start recording if enabled - RIGHT when playback begins
  if (recordMode) {
    try {
      // Check if wf-recorder is available
      try {
        execSync('which wf-recorder', { stdio: 'ignore' });
      } catch {
        console.error("❌ wf-recorder not found. Install with: nix-shell -p wf-recorder");
        recordMode = false;
        return;
      }

      console.log("🎥 Recording started");

      // Get window geometry from hyprctl
      const hyprctl = spawn("hyprctl", ["activewindow", "-j"]);
      let geometryData = "";
      let hyprctlError = "";

      hyprctl.stdout.on("data", (data) => {
        geometryData += data.toString();
      });

      hyprctl.stderr.on("data", (data) => {
        hyprctlError += data.toString();
      });

      await new Promise((resolve, reject) => {
        hyprctl.on("close", (code) => {
          if (code === 0) resolve();
          else reject(new Error(`hyprctl exited with code ${code}: ${hyprctlError}`));
        });
      });

      const windowInfo = JSON.parse(geometryData);

      // Validate window geometry structure
      if (!windowInfo?.at?.[0] || !windowInfo?.at?.[1] ||
          !windowInfo?.size?.[0] || !windowInfo?.size?.[1]) {
        throw new Error(`Invalid window geometry from hyprctl: ${JSON.stringify(windowInfo)}`);
      }

      const x = windowInfo.at[0];
      const y = windowInfo.at[1];
      const width = windowInfo.size[0];
      const height = windowInfo.size[1];

      // Generate output filename
      const audioBasename = path.basename(audioFile, path.extname(audioFile));
      const timestamp = Date.now();
      recordingOutputFile = path.join(
        path.dirname(audioFile),
        `${audioBasename}-recording-${timestamp}.mkv`
      );

      // Log file for wf-recorder output
      const logFile = path.join(
        path.dirname(audioFile),
        `${audioBasename}-recording-${timestamp}.log`
      );
      const logStream = fs.createWriteStream(logFile, { flags: 'a' });

      // Start wf-recorder with specified encoding parameters
      recorderProcess = spawn("wf-recorder", [
        "-g", `${x},${y} ${width}x${height}`,
        "-c", "h264_nvenc",
        "-r", "60",
        "-p", "pix_fmt=yuv444p",    // Codec parameter: pixel format
        "-p", "b=50M",               // Codec parameter: bitrate
        "-p", "g=60",                // Codec parameter: keyframe interval (1 second at 60fps)
        "-a",                        // Capture audio
        "-C", "pcm_f32le",           // Audio codec: float32 PCM
        "-f", recordingOutputFile    // Output file
      ]);

      // Write all output to log file
      logStream.write(`=== wf-recorder started at ${new Date().toISOString()} ===\n`);
      logStream.write(`Command: wf-recorder -g ${x},${y} ${width}x${height} -c h264_nvenc -r 60 -p pix_fmt=yuv444p -p b=50M -p g=60 -a -C pcm_f32le -f ${recordingOutputFile}\n\n`);

      // Capture stderr to log file
      recorderProcess.stderr.on("data", (data) => {
        logStream.write(`[STDERR] ${data.toString()}`);
      });

      // Capture stdout to log file
      recorderProcess.stdout.on("data", (data) => {
        logStream.write(`[STDOUT] ${data.toString()}`);
      });

      recorderProcess.on("error", (err) => {
        logStream.write(`[ERROR] wf-recorder spawn error: ${err.message}\n`);
        recorderProcess = null;
      });

      recorderProcess.on("exit", (code, signal) => {
        logStream.write(`\n=== wf-recorder exited at ${new Date().toISOString()} ===\n`);
        logStream.write(`Exit code: ${code}, Signal: ${signal}\n`);
        logStream.end();
      });

      console.log(`   📁 Recording to: ${recordingOutputFile}`);
      console.log(`   📄 Log file: ${logFile}`);
    } catch (error) {
      console.error(`⚠️  Failed to start recording: ${error.message}`);
      recorderProcess = null;
    }
  }

  const startTime = Date.now();
  let lastTime = startTime / 1000;
  let nextSpawnTime = 0;

  // Get art based on amplitude level - use custom frames if available
  const getArtForAmplitude = (amplitude) => {
    const frames = customFrames || asciiFrames;

    if (amplitude < 0.2) {
      // Small for very quiet
      const smallFrames = frames.filter((f) => f.type === "small");
      return smallFrames.length > 0
        ? smallFrames[Math.floor(Math.random() * smallFrames.length)]
        : frames[0];
    } else if (amplitude < 0.35) {
      // Medium for moderate
      const mediumFrames = frames.filter((f) => f.type === "medium");
      return mediumFrames.length > 0
        ? mediumFrames[Math.floor(Math.random() * mediumFrames.length)]
        : frames[Math.min(2, frames.length - 1)];
    } else if (amplitude < 0.6) {
      // High for loud
      const highFrames = frames.filter((f) => f.type === "high");
      return highFrames.length > 0
        ? highFrames[Math.floor(Math.random() * highFrames.length)]
        : frames[Math.min(4, frames.length - 1)];
    } else {
      // Max for very loud
      const maxFrames = frames.filter((f) => f.type === "max");
      return maxFrames.length > 0
        ? maxFrames[Math.floor(Math.random() * maxFrames.length)]
        : frames[frames.length - 1];
    }
  };

  // Animation loop
  const animate = () => {
    const currentTime = Date.now() / 1000;
    const elapsed = currentTime - startTime / 1000;
    const deltaTime = currentTime - lastTime;
    lastTime = currentTime;

    // Get current amplitude AND velocity
    const sampleIndex = Math.floor(elapsed * 30);
    const amplitude = samples[sampleIndex] || 0;
    const velocity = velocities[sampleIndex] || 0;

    // Normalize velocity (0-1 range)
    const normalizedVelocity = Math.min(1, velocity / (avgVelocity * 4));

    // Update color system
    renderManager.colorSystem.update(deltaTime);

    // Use choreography if available, otherwise use default behavior
    if (choreographyManager) {
      // Process choreography timeline events
      choreographyManager.processTimeline(
        elapsed,
        renderManager.transformManager,
        amplitude,
        normalizedVelocity,
      );
    } else {
      // Default behavior: Spawn objects based on VELOCITY (rhythmic changes) not just amplitude
      if (
        currentTime > nextSpawnTime &&
        velocity > avgVelocity * 1.5 &&
        amplitude > 0.1
      ) {
        // High velocity = rhythmic change = spawn objects
        const maxObjects = Math.min(6, 1 + Math.floor(normalizedVelocity * 5));

        if (renderManager.transformManager.objects.length < maxObjects) {
          const art = getArtForAmplitude(amplitude);
          const x = Math.random() * (process.stdout.columns - 20);
          const y = Math.random() * (process.stdout.rows - 15);
          // Pass velocity for motion calculation
          renderManager.transformManager.addObject(
            art,
            x,
            y,
            1,
            0,
            amplitude,
            normalizedVelocity,
          );
        }

        // Spawn delay based on velocity - faster spawning with higher velocity
        nextSpawnTime = currentTime + 0.3 / (1 + normalizedVelocity * 3);
      }

      // NO minimum objects - start with 0!
    }

    // Update objects with velocity for rhythmic motion
    renderManager.transformManager.updateObjects(
      deltaTime,
      amplitude,
      normalizedVelocity,
    );

    // Render frame
    renderManager.render(amplitude, elapsed, showOSD);

    // Stop when audio ends
    if (elapsed >= duration) {
      clearInterval(animationInterval);
      mpv.kill();
    }
  };

  // Run at 120 FPS for ultra-smooth animation
  const animationInterval = setInterval(animate, 1000 / 120);

  // Store references for cleanup
  let keyHandlerRef = null;
  let isTransitioning = false;

  // Enhanced cleanup function with proper resource management
  const cleanup = async () => {
    clearInterval(animationInterval);

    // Stop recording gracefully if active
    if (recorderProcess && !recorderProcess.killed) {
      console.log("\n🛑 Stopping recording...");
      recorderProcess.kill('SIGINT'); // Send Ctrl+C to wf-recorder for clean shutdown
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 2000); // 2 second timeout
        recorderProcess.once('exit', () => {
          clearTimeout(timeout);

          // Verify the file actually exists
          if (recordingOutputFile && fs.existsSync(recordingOutputFile)) {
            const stats = fs.statSync(recordingOutputFile);
            const sizeMB = (stats.size / (1024 * 1024)).toFixed(2);
            console.log(`   ✅ Recording saved: ${recordingOutputFile} (${sizeMB} MB)`);
          } else {
            console.error(`   ❌ Recording file not found: ${recordingOutputFile}`);
            console.error(`   ⚠️  wf-recorder may have failed - check error messages above`);
          }

          resolve();
        });
      });
    }

    // Kill MPV and wait for it to exit
    if (mpv && !mpv.killed) {
      mpv.kill();
      // Wait for process to actually exit
      await new Promise((resolve) => {
        const timeout = setTimeout(resolve, 1000); // 1 second timeout
        mpv.once('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Remove stdin listener if it exists
    if (keyHandlerRef) {
      process.stdin.removeListener('data', keyHandlerRef);
      keyHandlerRef = null;
    }

    // Reset stdin state for playlist mode
    if (playlistController) {
      process.stdin.setRawMode(false);
      process.stdin.pause();
    }

    // Reset terminal and clear screen
    process.stdout.write("\x1B[?25h\x1B[0m");
    renderManager.clear();
  };

  // Set up keyboard input for playlist mode
  if (playlistController) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');

    keyHandlerRef = async (key) => {
      // Prevent concurrent track changes
      if (isTransitioning) return;

      switch(key) {
        case 'n':
        case 'N':
          if (playlistController.hasNext) {
            isTransitioning = true;
            await cleanup();
            console.log("\n⏭️  Skipping to next track...");
            playlistController.next();
            const next = playlistController.current;
            // Use setImmediate to break recursion chain
            setImmediate(() => {
              startEnhancedAnimation(next.audioFile, next.choreographyFile, showOSD, playlistController, recordMode);
            });
            return; // Exit this animation
          } else {
            console.log("\n📍 Already at last track");
          }
          break;
        case 'p':
        case 'P':
          if (playlistController.hasPrevious) {
            isTransitioning = true;
            await cleanup();
            console.log("\n⏮️  Going to previous track...");
            playlistController.previous();
            const prev = playlistController.current;
            // Use setImmediate to break recursion chain
            setImmediate(() => {
              startEnhancedAnimation(prev.audioFile, prev.choreographyFile, showOSD, playlistController, recordMode);
            });
            return; // Exit this animation
          } else {
            console.log("\n📍 Already at first track");
          }
          break;
        case 'q':
        case 'Q':
        case '\u0003': // Ctrl+C
          isTransitioning = true;
          await cleanup();
          console.log("\n\n👋 Playlist stopped");
          process.exit(0);
          break;
      }
    };

    process.stdin.on('data', keyHandlerRef);
  }

  // Handle mpv exit
  mpv.on("exit", async () => {
    // Clean up resources properly
    await cleanup();

    if (playlistController && playlistController.hasNext) {
      console.log("✅ Track complete, playing next...");
      playlistController.next();
      const next = playlistController.current;
      // Use setImmediate to avoid recursion
      setImmediate(() => {
        startEnhancedAnimation(next.audioFile, next.choreographyFile, showOSD, playlistController, recordMode);
      });
    } else {
      console.log("✅ Playback complete!");
      if (!playlistController) {
        process.exit(0);
      } else {
        // Playlist finished, exit cleanly
        process.exit(0);
      }
    }
  });

  // Handle Ctrl+C
  if (!playlistController) {
    process.on("SIGINT", async () => {
      await cleanup();
      process.stdout.write("\x1B[?25h\x1B[0m");
      console.log("\n\n👋 Animation stopped");
      process.exit(0);
    });
  }

  return true;
}

// Main entry point
async function main() {
  const args = process.argv.slice(2);

  const firstArg = args[0];
  const showOSD = args.includes("--osd");
  const recordMode = args.includes("--record");

  if (!firstArg) {
    console.error("Usage: node play-choreography-v1.1.js <audio.wav> [choreography.json] [--osd] [--record]");
    process.exit(1);
  }

  // Single file mode
  const audioFile = firstArg;

  // Choreography is second positional argument
  const choreographyFile = args[1] && args[1].endsWith('.json') ? args[1] : null;

  await startEnhancedAnimation(audioFile, choreographyFile, showOSD, null, recordMode);
}

// Start the show!
main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
