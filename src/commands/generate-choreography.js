#!/usr/bin/env node

/**
 * @fileoverview Generate choreography JSON for audio visualization using AI
 * Based on the official choreography-schema.json
 */

import { Command } from "commander";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import chalk from "chalk";
import { generateText, generateObject } from "ai";
import { z } from "zod";
import { getAudioMetadata } from "../utils/audio-metadata.js";
import asciiArtManager from "../utils/ascii-art-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================================================
// CHOREOGRAPHY SCHEMAS - Supporting both v1.0 and v1.1
// ============================================================================

// Dynamic value type for v1.1 - accepts both numbers and expression strings
const dynamicNumber = z.union([
  z.number(),
  z.string().describe("Expression like 'random(0,1)' or '{{beat}}*2'")
]);

// ============================================================================
// V1.0 SCHEMA - Original numeric-only version
// ============================================================================
function buildChoreographySchemaV1_0() {
  // Metadata Schema v1.0
  const MetadataSchema = z.object({
    version: z.string().default("1.0"),
    name: z.string(),
    duration: z.number().describe("Total duration in seconds"),
    bpm: z.number().optional().describe("Beats per minute for beat-based timing"),
    timeSignature: z.string().default("4/4"),
    fps: z.number().default(120)
  });

  // Settings Schema v1.0
  const SettingsSchema = z.object({
    audioReactive: z.object({
      amplitudeMultiplier: z.number().default(1.0),
      velocityThreshold: z.number().default(0.15),
      frequencyBands: z.array(z.object({
        name: z.enum(["bass", "mid", "treble"]),
        range: z.array(z.number()).length(2),
        weight: z.number()
      })).optional()
    }).optional(),
    collisionBehavior: z.enum(["default", "scripted", "disabled"]).default("default"),
    boundaryMode: z.enum(["bounce", "wrap", "stop", "destroy"]).default("bounce")
  }).optional();

  // Templates Schema v1.0
  const TemplatesSchema = z.object({
    objects: z.record(z.object({
      shape: z.string().describe("ASCII art reference or inline art"),
      defaultColor: z.string().optional(),
      defaultScale: z.number().optional(),
      physics: z.object({
        mass: z.number(),
        friction: z.number(),
        elasticity: z.number()
      }).optional()
    })).optional(),
    movements: z.record(z.object({
      type: z.string(), // Allow ANY movement type, not just specific ones
      parameters: z.object({}).passthrough()
    })).optional(),
    formations: z.record(z.object({
      pattern: z.string(), // Allow ANY pattern type
      spacing: z.number(),
      count: z.number().int()
    })).optional()
  }).optional();

  // Tracks Schema v1.0
  const TracksSchema = z.array(z.object({
    id: z.string(),
    name: z.string(),
    layer: z.number().int().describe("Z-order, higher = front"),
    opacity: z.number().min(0).max(1),
    audioChannel: z.enum(["stereo", "left", "right", "center"]).default("stereo")
  })).optional();

  // Action Types v1.0
  const SpawnAction = z.object({
    type: z.literal("spawn"),
    objectId: z.string(),
    template: z.string().optional(),
    position: z.object({
      x: z.union([z.number(), z.string()]),
      y: z.union([z.number(), z.string()]),
      relative: z.boolean().default(false)
    }),
    track: z.string().optional()
  });

  const MoveAction = z.object({
    type: z.literal("move"),
    target: z.string().describe("Object ID or 'all' or track ID"),
    movement: z.union([
      z.object({
        preset: z.string(),
        duration: z.number(),
        easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out", "bounce"]).optional()
      }),
      z.object({
        path: z.array(z.object({
          x: z.number(),
          y: z.number(),
          time: z.number()
        }))
      }),
      z.object({
        velocity: z.object({ x: z.number(), y: z.number() }),
        acceleration: z.object({ x: z.number(), y: z.number() }).optional()
      })
    ])
  });

  const TransformAction = z.object({
    type: z.literal("transform"),
    target: z.string(),
    effect: z.enum([
      // Original transformations
      "EXPLODE", "SHATTER", "MELT", "PIXELATE", "GLITCH", "MORPH", "WARP",
      "MULTIPLY", "RAINBOW", "INVERT", "MATRIX", "DISSOLVE", "MIRROR", "CORRUPT",
      // NEW WILD TRANSFORMATIONS
      "INVERSION",    // Swaps inner/outer characters
      "VORTEX",       // Spiral rotation effect
      "LIQUIFY",      // Dripping liquid effect
      "CRYSTALLIZE",  // Angular crystal patterns
      "WORMHOLE",     // Tunnel effect to center
      "ELECTRIC",     // Lightning bolt patterns
      "FRACTAL",      // Recursive self-similar patterns
      "QUANTUM",      // Characters phase in/out
      "PLASMA",       // Wave distortions
      "SINGULARITY"   // Compress then explode
    ]),
    duration: z.number(),
    parameters: z.object({}).passthrough().optional()
  });

  const FormationAction = z.object({
    type: z.literal("formation"),
    objects: z.array(z.string()),
    pattern: z.string(), // Already flexible
    center: z.object({ x: z.number(), y: z.number() }),
    duration: z.number()
  });

  const VisualAction = z.object({
    type: z.literal("visual"),
    target: z.string(),
    changes: z.object({
      color: z.string().optional(),
      scale: z.number().optional(),
      rotation: z.number().optional(),
      opacity: z.number().optional(),
      blur: z.number().optional(),
      glow: z.object({
        color: z.string(),
        radius: z.number()
      }).optional()
    }),
    duration: z.number(),
    easing: z.string().optional()
  });

  const DestroyAction = z.object({
    type: z.literal("destroy"),
    target: z.string(),
    effect: z.enum(["instant", "fade", "explode", "collapse"]).optional()
  });

  const AudioMapAction = z.object({
    type: z.literal("audio-map"),
    target: z.string(),
    mapping: z.object({
      amplitude: z.object({
        property: z.enum(["scale", "opacity", "rotation", "x", "y"]),
        range: z.array(z.number()).length(2),
        smoothing: z.number().optional()
      }).optional(),
      frequency: z.object({
        band: z.string(),
        property: z.string(),
        range: z.array(z.number()).length(2)
      }).optional()
    })
  });

  // Timeline Schema v1.0
  const TimelineSchema = z.array(z.object({
    trigger: z.union([
      z.object({
        type: z.literal("time"),
        at: z.number().describe("Absolute time in seconds")
      }),
      z.object({
        type: z.literal("beat"),
        measure: z.number().int(),
        beat: z.number()
      }),
      z.object({
        type: z.literal("audio"),
        condition: z.object({
          parameter: z.enum(["amplitude", "velocity", "frequency"]),
          operator: z.enum([">", "<", "==", "spike", "drop"]),
          value: z.number()
        })
      }),
      z.object({
        type: z.literal("loop"),
        every: z.number().describe("Interval in seconds"),
        count: z.number().int().describe("Number of repetitions, -1 for infinite")
      })
    ]),
    actions: z.array(z.union([
      SpawnAction,
      MoveAction,
      TransformAction,
      FormationAction,
      VisualAction,
      DestroyAction,
      AudioMapAction
    ]))
  }));

  // Main Choreography Schema v1.0
  return z.object({
    metadata: MetadataSchema,
    settings: SettingsSchema,
    templates: TemplatesSchema,
    tracks: TracksSchema,
    timeline: TimelineSchema,
    scenes: z.array(z.object({
      name: z.string(),
      start: z.number(),
      duration: z.number(),
      timeline: TimelineSchema
    })).optional()
  });
}

// ============================================================================
// V1.1 SCHEMA - Extended version with dynamic values
// ============================================================================
function buildChoreographySchemaV1_1() {
  // Metadata Schema v1.1 - includes seed
  const MetadataSchema = z.object({
    version: z.string().default("1.1"),
    name: z.string(),
    duration: dynamicNumber.describe("Total duration in seconds"),
    bpm: dynamicNumber.optional().describe("Beats per minute for beat-based timing"),
    timeSignature: z.string().default("4/4"),
    fps: dynamicNumber.default(120),
    seed: z.union([z.number(), z.string()]).optional().describe("Randomness seed for reproducibility"),
    notes: z.string().optional()
  });

  // Settings Schema v1.1 - enhanced audio and performance options
  const SettingsSchema = z.object({
    audioReactive: z.object({
      amplitudeMultiplier: dynamicNumber.default(1.0),
      velocityThreshold: dynamicNumber.default(0.15),
      frequencyBands: z.array(z.object({
        name: z.string().describe("Band name (bass/mid/treble or custom)"),
        range: z.array(dynamicNumber),
        weight: dynamicNumber
      })).optional(),
      analysisWindow: dynamicNumber.optional().describe("Milliseconds of audio per frame"),
      smoothing: dynamicNumber.optional().describe("0-1 smoothing factor")
    }).optional(),
    collisionBehavior: z.enum(["default", "scripted", "disabled"]).default("default"),
    boundaryMode: z.enum(["bounce", "wrap", "stop", "destroy"]).default("bounce"),
    randomness: z.object({
      seed: z.union([z.number(), z.string()]).optional(),
      mode: z.enum(["deterministic", "chaotic", "mixed"]).default("deterministic")
    }).optional(),
    performanceBudget: z.object({
      maxObjects: z.number().int().optional(),
      maxTransformsPerSecond: z.number().int().optional()
    }).optional()
  }).optional();

  // Templates Schema v1.1 - multi-line sprites and animation
  const TemplatesSchema = z.object({
    objects: z.record(z.object({
      shape: z.union([
        z.string(),
        z.array(z.string())
      ]).describe("ASCII art, inline art, or multi-line sprite array"),
      frames: z.array(z.union([
        z.string(),
        z.array(z.string())
      ])).optional().describe("Animated frames"),
      frameRate: dynamicNumber.optional().describe("Animation FPS"),
      loop: z.boolean().optional(),
      defaultColor: z.string().optional(),
      defaultScale: dynamicNumber.optional(),
      bounds: z.object({
        width: dynamicNumber,
        height: dynamicNumber
      }).optional(),
      physics: z.object({
        mass: dynamicNumber,
        friction: dynamicNumber,
        elasticity: dynamicNumber
      }).optional()
    })).optional(),
    movements: z.record(z.object({
      type: z.string(),
      parameters: z.object({}).passthrough()
    })).optional(),
    formations: z.record(z.object({
      pattern: z.string(),
      spacing: dynamicNumber,
      count: z.number().int(),
      stagger: dynamicNumber.optional().describe("Delay between spawns")
    })).optional()
  }).optional();

  // Tracks Schema v1.1 - with individual timelines
  const TracksSchema = z.array(z.object({
    id: z.string(),
    name: z.string(),
    layer: z.number().int().describe("Z-order, higher = front"),
    opacity: dynamicNumber,
    audioChannel: z.enum(["stereo", "left", "right", "center"]).default("stereo"),
    timeline: z.any().optional() // Recursive timeline support
  })).optional();

  // Threads Schema v1.1 - new for parallel timelines
  const ThreadsSchema = z.array(z.object({
    id: z.string(),
    name: z.string(),
    startTime: dynamicNumber,
    priority: z.number().int().optional(),
    timeline: z.any() // Will be filled with TimelineSchema
  })).optional();

  // Action Types v1.1 - with dynamic values
  const SpawnAction = z.object({
    type: z.literal("spawn"),
    objectId: z.string(),
    template: z.string().optional(),
    position: z.object({
      x: dynamicNumber,
      y: dynamicNumber,
      relative: z.boolean().default(false)
    }),
    track: z.string().optional(),
    jitter: z.object({
      x: dynamicNumber,
      y: dynamicNumber
    }).optional()
  });

  const MoveAction = z.object({
    type: z.literal("move"),
    target: z.string(),
    movement: z.union([
      z.object({
        preset: z.string(),
        duration: dynamicNumber,
        easing: z.string().optional(),
        swing: dynamicNumber.optional(),
        phase: dynamicNumber.optional()
      }),
      z.object({
        path: z.array(z.object({
          x: dynamicNumber,
          y: dynamicNumber,
          time: dynamicNumber
        }))
      }),
      z.object({
        velocity: z.object({ x: dynamicNumber, y: dynamicNumber }),
        acceleration: z.object({ x: dynamicNumber, y: dynamicNumber }).optional()
      })
    ])
  });

  const TransformAction = z.object({
    type: z.literal("transform"),
    target: z.string(),
    effect: z.string(), // Allow custom effects in v1.1
    duration: dynamicNumber,
    parameters: z.object({}).passthrough().optional(),
    intensity: dynamicNumber.optional()
  });

  const FormationAction = z.object({
    type: z.literal("formation"),
    objects: z.array(z.string()),
    pattern: z.string(),
    center: z.object({
      x: dynamicNumber,
      y: dynamicNumber
    }),
    duration: dynamicNumber,
    stagger: dynamicNumber.optional()
  });

  const VisualAction = z.object({
    type: z.literal("visual"),
    target: z.string(),
    changes: z.object({
      color: z.string().optional(),
      scale: dynamicNumber.optional(),
      rotation: dynamicNumber.optional(),
      opacity: dynamicNumber.optional(),
      blur: dynamicNumber.optional(),
      glow: z.object({
        color: z.string(),
        radius: dynamicNumber
      }).optional(),
      effectIntensity: dynamicNumber.optional()
    }),
    duration: dynamicNumber,
    easing: z.string().optional(),
    blendMode: z.string().optional()
  });

  const DestroyAction = z.object({
    type: z.literal("destroy"),
    target: z.string(),
    effect: z.string().optional(),
    duration: dynamicNumber.optional()
  });

  const AudioMapAction = z.object({
    type: z.literal("audio-map"),
    target: z.string(),
    mapping: z.object({
      amplitude: z.object({
        property: z.string(),
        range: z.array(dynamicNumber),
        smoothing: dynamicNumber.optional(),
        curve: z.string().optional(),
        clamp: z.boolean().optional(),
        offset: dynamicNumber.optional(),
        multiplier: dynamicNumber.optional()
      }).optional(),
      frequency: z.object({
        band: z.string(),
        property: z.string(),
        range: z.array(dynamicNumber),
        curve: z.string().optional()
      }).optional(),
      properties: z.record(z.object({
        source: z.string(),
        range: z.array(dynamicNumber),
        curve: z.string().optional()
      })).optional()
    })
  });

  // Timeline Schema v1.1 - enhanced triggers
  const TimelineSchema = z.array(z.object({
    trigger: z.union([
      z.object({
        type: z.literal("time"),
        at: dynamicNumber.describe("Absolute time in seconds")
      }),
      z.object({
        type: z.literal("beat"),
        measure: z.number().int(),
        beat: dynamicNumber,
        subdivision: dynamicNumber.optional()
      }),
      z.object({
        type: z.literal("audio"),
        condition: z.union([
          // Simple condition
          z.object({
            parameter: z.string(),
            operator: z.enum([">", "<", "==", "!=", "between", "spike", "drop"]),
            value: dynamicNumber,
            value2: dynamicNumber.optional(), // For "between"
            window: dynamicNumber.optional()
          }),
          // Complex condition with boolean logic
          z.object({
            logic: z.enum(["AND", "OR", "XOR"]),
            conditions: z.array(z.any()) // Recursive conditions
          })
        ])
      }),
      z.object({
        type: z.literal("loop"),
        every: dynamicNumber,
        count: z.number().int(),
        jitter: dynamicNumber.optional()
      }),
      z.object({
        type: z.literal("label"),
        name: z.string()
      })
    ]),
    actions: z.array(z.union([
      SpawnAction,
      MoveAction,
      TransformAction,
      FormationAction,
      VisualAction,
      DestroyAction,
      AudioMapAction
    ]))
  }));

  // Scene Transitions for v1.1
  const SceneTransitionSchema = z.object({
    type: z.enum(["crossfade", "wipe", "cut", "custom"]),
    duration: dynamicNumber,
    easing: z.string().optional()
  });

  // Main Choreography Schema v1.1
  return z.object({
    metadata: MetadataSchema,
    settings: SettingsSchema,
    templates: TemplatesSchema,
    tracks: TracksSchema,
    threads: ThreadsSchema,
    timeline: TimelineSchema,
    scenes: z.array(z.object({
      name: z.string(),
      start: dynamicNumber,
      duration: dynamicNumber,
      timeline: TimelineSchema,
      transition: SceneTransitionSchema.optional()
    })).optional()
  });
}

// ============================================================================
// ABC METADATA EXTRACTION
// ============================================================================
function parseABCMetadata(abcContent) {
  const title = abcContent.match(/T:(.+)/)?.[1]?.trim() || "Untitled";
  const tempoMatch = abcContent.match(/Q:(?:.*?=)?(\d+)/);
  const tempo = tempoMatch ? parseInt(tempoMatch[1]) : 120;

  const barLines = (abcContent.match(/\|/g) || []).length;
  const measures = Math.max(barLines - 1, 8);

  const meterMatch = abcContent.match(/M:(\d+)\/(\d+)/);
  const beatsPerMeasure = meterMatch ? parseInt(meterMatch[1]) : 4;
  const timeSignature = meterMatch ? `${meterMatch[1]}/${meterMatch[2]}` : "4/4";

  return {
    title,
    tempo,
    timeSignature,
    measures,
    beatsPerMeasure,
    duration: null, // Will be filled from WAV file
    key: abcContent.match(/K:([A-G][b#]?m?)/)?.[1] || "C",
    onsets: [] // Will be filled from aubioonset
  };
}

// ============================================================================
// ABC CHUNKING FUNCTIONS (for --chunked mode)
// ============================================================================

/**
 * Analyze ABC content and split into sections (voices or parts)
 * Each section is defined by V: (voice) or P: (part) markers
 * @param {string} abcContent - The ABC notation content
 * @returns {Object} Object with header and sections array
 */
function analyzeABCSections(abcContent) {
  const lines = abcContent.split('\n');
  const sections = [];
  let currentSection = null;
  let headerLines = [];
  let inHeader = true;

  for (const line of lines) {
    // Headers are before the first K: (key) line
    if (inHeader && !line.match(/^K:/)) {
      headerLines.push(line);
      continue;
    } else if (line.match(/^K:/)) {
      if (inHeader) {
        headerLines.push(line);
        inHeader = false;
      }
    }

    // Check for voice markers (V:1, V:2, etc.)
    const voiceMatch = line.match(/^V:\s*(\d+|[A-Za-z]+)/);
    if (voiceMatch) {
      // Save previous section if exists
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'voice',
        id: voiceMatch[1],
        content: [line],
        measures: 0
      };
    }
    // Check for part markers (P:A, P:B, etc.)
    else if (line.match(/^P:/)) {
      if (currentSection) {
        sections.push(currentSection);
      }
      currentSection = {
        type: 'part',
        id: line.replace(/^P:/, '').trim(),
        content: [line],
        measures: 0
      };
    }
    // Add content to current section
    else if (currentSection) {
      currentSection.content.push(line);
      // Count measures (bar lines)
      const bars = (line.match(/\|/g) || []).length;
      currentSection.measures += Math.max(0, bars - 1);
    }
    // If no sections defined, treat whole content as one section
    else if (!inHeader) {
      if (!sections.length && !currentSection) {
        currentSection = {
          type: 'main',
          id: '1',
          content: [],
          measures: 0
        };
      }
      if (currentSection) {
        currentSection.content.push(line);
        const bars = (line.match(/\|/g) || []).length;
        currentSection.measures += Math.max(0, bars - 1);
      }
    }
  }

  // Add the last section
  if (currentSection) {
    sections.push(currentSection);
  }

  // If no sections found, treat entire content as one section
  if (sections.length === 0) {
    const bars = (abcContent.match(/\|/g) || []).length;
    sections.push({
      type: 'main',
      id: '1',
      content: abcContent.split('\n'),
      measures: Math.max(bars - 1, 8)
    });
  }

  return {
    header: headerLines.join('\n'),
    sections: sections
  };
}

/**
 * Chunk sections into groups of max 6 for processing
 * @param {Array} sections - Array of ABC sections
 * @param {number} maxSectionsPerChunk - Maximum sections per chunk (default 6)
 * @returns {Array} Array of chunks, each containing up to maxSectionsPerChunk sections
 */
function chunkABCSections(sections, maxSectionsPerChunk = 6) {
  const chunks = [];

  for (let i = 0; i < sections.length; i += maxSectionsPerChunk) {
    chunks.push({
      chunkIndex: Math.floor(i / maxSectionsPerChunk),
      sections: sections.slice(i, i + maxSectionsPerChunk),
      isFirst: i === 0,
      isLast: i + maxSectionsPerChunk >= sections.length,
      totalChunks: Math.ceil(sections.length / maxSectionsPerChunk)
    });
  }

  return chunks;
}

/**
 * Process chunked ABC sections sequentially with context passing
 * @param {Array} chunks - Array of section chunks
 * @param {Object} baseMetadata - Base metadata from the full ABC file
 * @param {string} description - Music description
 * @param {Array} asciiShapes - ASCII art shapes for visualization
 * @param {Object} options - Command options
 * @returns {Object} Combined choreography
 */
async function processChunkedChoreography(chunks, baseMetadata, description, asciiShapes, options) {
  console.log(chalk.cyan(`\n📦 Processing ${chunks.length} chunk(s) of ABC sections...\n`));

  let combinedChoreography = null;
  let previousContext = null;

  for (const chunk of chunks) {
    console.log(chalk.yellow(`\nProcessing chunk ${chunk.chunkIndex + 1}/${chunk.totalChunks} (${chunk.sections.length} sections)...`));

    // Prepare chunk-specific metadata
    const chunkMetadata = {
      ...baseMetadata,
      sections: chunk.sections.map(s => ({ type: s.type, id: s.id, measures: s.measures })),
      chunkInfo: {
        index: chunk.chunkIndex,
        total: chunk.totalChunks,
        isFirst: chunk.isFirst,
        isLast: chunk.isLast
      }
    };

    // Build prompt with context from previous chunk if available
    let chunkDescription = description;
    if (previousContext) {
      chunkDescription += `\n\nCONTINUATION CONTEXT: This is part ${chunk.chunkIndex + 1} of ${chunk.totalChunks}. `;
      chunkDescription += `Continue from where the previous section left off. Previous section ended with: ${previousContext}`;
    }

    // Generate choreography for this chunk
    const prompt = options.schemaVersion === "1.0"
      ? buildChoreographyPromptV1_0(chunkDescription, chunkMetadata, asciiShapes)
      : buildChoreographyPromptV1_1(chunkDescription, chunkMetadata, asciiShapes);

    const chunkChoreography = await generateChoreographyWithFallbacks(
      prompt,
      chunkMetadata,
      chunkDescription,
      options
    );

    // Combine choreographies
    if (!combinedChoreography) {
      combinedChoreography = chunkChoreography;
    } else {
      // Merge timeline events (adjusting timestamps)
      const lastEventTime = combinedChoreography.timeline.length > 0
        ? combinedChoreography.timeline[combinedChoreography.timeline.length - 1].time
        : 0;

      // Append new timeline events with adjusted timestamps
      for (const event of chunkChoreography.timeline) {
        combinedChoreography.timeline.push({
          ...event,
          time: event.time + lastEventTime
        });
      }
    }

    // Extract context for next chunk
    if (chunkChoreography.timeline.length > 0) {
      const lastEvents = chunkChoreography.timeline.slice(-3);
      previousContext = lastEvents.map(e => e.action).join(', ');
    }

    console.log(chalk.green(`✓ Chunk ${chunk.chunkIndex + 1} processed (${chunkChoreography.timeline.length} events)`));
  }

  // Update combined choreography metadata
  combinedChoreography.metadata.name += " (Chunked Processing)";
  console.log(chalk.cyan(`\n✅ All chunks processed. Total timeline events: ${combinedChoreography.timeline.length}`));

  return combinedChoreography;
}

// ============================================================================

// ============================================================================
// AI PROMPT BUILDERS (Version-specific)
// ============================================================================
function buildChoreographyPromptV1_0(description, metadata, asciiShapes = []) {
  let asciiSection = "";

  if (asciiShapes.length > 0) {
    asciiSection = `
AVAILABLE ASCII ART SHAPES:
You should use these specific ASCII art shapes that were designed for this composition:

`;
    asciiShapes.forEach((shape, index) => {
      asciiSection += `Shape ${index + 1} (${shape.theme} - ${shape.intensity} intensity):
${shape.art}
Description: ${shape.description}

`;
    });

    asciiSection += `
IMPORTANT: Use these shapes in your choreography by referencing them in the templates.objects section.
You can use the actual ASCII art in the "shape" field of object templates.

`;
  }

  let onsetSection = "";
  if (metadata.onsets && metadata.onsets.length > 0) {
    // Show first 20 onsets as a guide
    const sampleOnsets = metadata.onsets.slice(0, 20).map(t => t.toFixed(2)).join(", ");
    const remaining = metadata.onsets.length > 20 ? ` ... (${metadata.onsets.length - 20} more)` : "";
    onsetSection = `
BEAT TIMINGS (onset times in seconds):
${sampleOnsets}${remaining}
Total onsets: ${metadata.onsets.length}
Use these timings to synchronize actions with the actual beats in the music.
`;
  }

  return `Generate a JSON choreography for terminal ASCII art visualization following the exact schema structure.

🎨 CREATIVE CANVAS INFORMATION:
You have a MASSIVE terminal space to choreograph within!
- Default resolution: 2560x2880 pixels (configurable)
- This translates to approximately 320x180 character positions (based on 8x16 pixel font)
- YOU ARE ENCOURAGED to use as much or as little of this vast space as you want
- Think BIG - create expansive scenes, sweeping movements, multiple simultaneous action zones
- Or go minimal and focus on intimate moments - the choice is yours!

✨ CREATIVE FREEDOM:
- Interpret objects as you see fit to realize your choreographic vision
- Mix scales dramatically - tiny details alongside massive formations
- Layer actions - the visualizer can handle unlimited simultaneous:
  * Motion paths and trajectories
  * Transpositions and translations
  * Transformations and morphing effects
  * Objects appearing and disappearing
- DO NOT BE AFRAID of overwhelming the playback visualizer!
- It can handle ANY amount of complexity you throw at it
- Push boundaries - if you can imagine it, the visualizer can render it

${asciiSection}MUSIC INFO:
- Title: ${metadata.title}
- Duration: ${metadata.duration} seconds
- Tempo: ${metadata.tempo} BPM
- Time Signature: ${metadata.timeSignature}
- Description: ${description}
${onsetSection}

REQUIREMENTS:
1. The choreography MUST follow this exact JSON structure:
{
  "metadata": {
    "version": "1.0",
    "name": "Title of Choreography",
    "duration": ${metadata.duration},  // MUST match music duration exactly
    "bpm": ${metadata.tempo},
    "timeSignature": "${metadata.timeSignature}",
    "fps": 120
  },
  "settings": {
    "collisionBehavior": "default",  // Options: "default", "scripted", "disabled"
    "boundaryMode": "bounce",  // Options: "bounce", "wrap", "stop", "destroy"
    "audioReactive": {
      "amplitudeMultiplier": 1.0,
      "velocityThreshold": 0.15
    }
  },
  "templates": {
    "objects": {
      "star": { "shape": "★", "defaultColor": "yellow", "defaultScale": 1.0 },
      "note": { "shape": "♪", "defaultColor": "cyan", "defaultScale": 1.0 },
      "diamond": { "shape": "◆", "defaultColor": "magenta", "defaultScale": 1.0 }
      // Add more object templates as needed
    },
    "movements": {
      "bounce": { "type": "linear", "parameters": { "speed": 0.5 } },
      "circle": { "type": "circular", "parameters": { "radius": 10 } }
      // Add more movement presets
    }
  },
  "timeline": [
    {
      "trigger": { "type": "time", "at": 0 },  // Time-based trigger
      "actions": [
        {
          "type": "spawn",
          "objectId": "star_1",
          "template": "star",
          "position": { "x": 40, "y": 12, "relative": false }
        }
      ]
    },
    {
      "trigger": { "type": "beat", "measure": 1, "beat": 1 },  // Beat-based trigger
      "actions": [
        {
          "type": "move",
          "target": "star_1",
          "movement": { "preset": "bounce", "duration": 0.5, "easing": "ease-in-out" }
        }
      ]
    },
    {
      "trigger": { "type": "audio", "condition": { "parameter": "amplitude", "operator": ">", "value": 0.7 } },
      "actions": [
        {
          "type": "transform",
          "target": "all",
          "effect": "RAINBOW",  // All 24 transformations available!
          "duration": 1.0
        }
      ]
    }
  ]
}

ACTION TYPES:
- spawn: Create objects with template and position
- move: Move objects with presets or custom paths
- transform: Apply visual effects:
  * EXPLODE - Objects fly apart with explosive force
  * SHATTER - Break into fragments that vibrate
  * MELT - Characters drip downward and dissolve
  * PIXELATE - Convert to blocky pixel patterns
  * GLITCH - Random character corruption effects
  * MORPH - Shape-shift into other objects
  * WARP - Spatial distortion effects
  * MULTIPLY - Create duplicates that spread out
  * RAINBOW - Cycle through all colors rapidly
  * INVERT - Flip characters and colors
  * MATRIX - Digital rain effect
  * DISSOLVE - Gradually fade and disappear
  * MIRROR - Horizontal/vertical reflection
  * CORRUPT - Random ASCII character replacement
  * INVERSION - Swaps inner and outer characters for inside-out effect
  * VORTEX - Creates spiral rotation pulling into a swirl
  * LIQUIFY - Makes characters drip and flow like liquid
  * CRYSTALLIZE - Converts to sharp angular crystalline patterns
  * WORMHOLE - Creates tunnel effect pulling to center
  * ELECTRIC - Adds lightning bolts and spark patterns
  * FRACTAL - Creates recursive self-similar patterns
  * QUANTUM - Characters phase in/out of existence
  * PLASMA - Creates flowing wave-like distortions
  * SINGULARITY - Compresses to a point then explodes outward
- formation: Arrange objects in patterns (circle, grid, spiral, wave, random)
- visual: Change color, scale, rotation, opacity, blur, glow
- destroy: Remove objects with effects (instant, fade, explode, collapse)
- audio-map: Map audio properties to visual properties

IMPORTANT:
- Duration MUST be exactly ${metadata.duration} seconds
- Use time-based triggers for precise timing (trigger.type: "time", trigger.at: seconds)
- Use beat-based triggers for musical alignment (trigger.type: "beat", trigger.measure: N, trigger.beat: N)
- Create as many timeline events as your vision requires - 50, 100, 500+ events are all welcome!
- Sync major events to beats (beat interval is ${(60/metadata.tempo).toFixed(2)} seconds)
- Use templates for reusable object definitions
- Canvas is HUGE: ~320x180 characters (2560x2880 pixels) - use this vast space creatively!
- Position objects anywhere within (0,0) to (320,180) character grid
- Objects can start off-screen (negative coords) and move into view
- Boundary mode (bounce/wrap/stop/destroy) handles edge behavior automatically
- Layer multiple action zones, create depth, use the full stage!

IMPORTANT v1.0 REQUIREMENTS:
- Use ONLY numeric values for positions, durations, scales, etc.
- NO expression strings like "random(0,1)" or "{{beat}}*2"
- Shapes must be single strings, NOT arrays
- Timeline triggers are simple (no complex boolean logic)

Generate a complete v1.0 choreography with numeric values only.`;
}

function buildChoreographyPromptV1_1(description, metadata, asciiShapes = []) {
  let asciiSection = "";

  if (asciiShapes.length > 0) {
    asciiSection = `
AVAILABLE ASCII ART SHAPES:
You should use these specific ASCII art shapes that were designed for this composition.
In v1.1 you can also use multi-line arrays!

`;
    asciiShapes.forEach((shape, index) => {
      asciiSection += `Shape ${index + 1} (${shape.theme} - ${shape.intensity} intensity):
${shape.art}
Description: ${shape.description}

`;
    });

    asciiSection += `
IMPORTANT: Use these shapes in your choreography. In v1.1 you can create multi-line sprites!

`;
  }

  let onsetSection = "";
  if (metadata.onsets && metadata.onsets.length > 0) {
    const sampleOnsets = metadata.onsets.slice(0, 20).map(t => t.toFixed(2)).join(", ");
    const remaining = metadata.onsets.length > 20 ? ` ... (${metadata.onsets.length - 20} more)` : "";
    onsetSection = `
BEAT TIMINGS (onset times in seconds):
${sampleOnsets}${remaining}
Total onsets: ${metadata.onsets.length}
Use dynamic expressions like "{{beat}}" to sync with these timings!
`;
  }

  return `Generate a JSON choreography for terminal ASCII art visualization using the POWERFUL v1.1 schema with dynamic expressions!

🎨 CREATIVE CANVAS INFORMATION:
You have a MASSIVE terminal space to choreograph within!
- Default resolution: 2560x2880 pixels (configurable)
- This translates to approximately 320x180 character positions (based on 8x16 pixel font)
- UNLIMITED complexity supported with v1.1 features!

${asciiSection}MUSIC INFO:
- Title: ${metadata.title}
- Duration: ${metadata.duration} seconds
- Tempo: ${metadata.tempo} BPM
- Time Signature: ${metadata.timeSignature}
- Description: ${description}
${onsetSection}

✨ v1.1 DYNAMIC FEATURES YOU SHOULD USE:

1. DYNAMIC EXPRESSIONS for any numeric value:
   - "random(0, 360)" - random rotation
   - "{{beat}} * 10" - beat-synced positions
   - "{{amplitude}} * 2" - audio-reactive scaling
   - "{{index}} + 5" - index-based positioning
   - "Math.sin({{time}}) * 50" - sine wave motion

2. MULTI-LINE SPRITES:
   "shape": [
     "╔═══╗",
     "║ ♫ ║",
     "╚═══╝"
   ]

3. ANIMATED FRAMES:
   "frames": [
     ["┌─┐", "│♪│", "└─┘"],
     ["┌─┐", "│♫│", "└─┘"],
     ["┌─┐", "│♬│", "└─┘"]
   ],
   "frameRate": 4,
   "loop": true

4. COMPLEX AUDIO CONDITIONS with boolean logic:
   "condition": {
     "logic": "AND",
     "conditions": [
       {"parameter": "amplitude", "operator": ">", "value": 0.5},
       {"parameter": "frequency", "operator": "between", "value": 100, "value2": 500}
     ]
   }

5. THREADS for parallel timelines:
   "threads": [
     {"id": "main", "timeline": [...]},
     {"id": "background", "startTime": "random(0,2)", "timeline": [...]}
   ]

6. SCENES with transitions:
   "scenes": [
     {
       "name": "Intro",
       "duration": "{{duration}} * 0.25",
       "transition": {"type": "crossfade", "duration": 2}
     }
   ]

7. GENERALIZED AUDIO MAPPING:
   "mapping": {
     "properties": {
       "scale": {"source": "amplitude", "range": ["0.5", "{{amplitude}} * 3"]},
       "color": {"source": "frequency.bass", "range": ["blue", "red"]}
     }
   }

8. PERFORMANCE HINTS:
   "performanceBudget": {
     "maxObjects": 100,
     "maxTransformsPerSecond": 30
   }

9. RANDOMNESS CONTROL:
   "randomness": {
     "seed": "my_seed_123",
     "mode": "deterministic"
   }

Generate an innovative v1.1 choreography using ALL these dynamic features!`;
}

// ============================================================================
// AI GENERATION WITH FALLBACKS
// ============================================================================
async function generateChoreographyWithFallbacks(prompt, metadata, description, options) {
  let choreography = null;
  const schemaVersion = options.schemaVersion || "1.1";
  const ChoreographySchema = schemaVersion === "1.0"
    ? buildChoreographySchemaV1_0()
    : buildChoreographySchemaV1_1();

  // Get the model
  let model;
  try {
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    const anthropicClient = createAnthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    model = anthropicClient("claude-sonnet-4-5");
  } catch (error) {
    console.error(chalk.red("❌ FATAL: Anthropic client setup failed"));
    console.error(chalk.red("   Error:", error.message));
    console.error(chalk.red("   Make sure ANTHROPIC_API_KEY is set in your environment"));
    throw new Error("Cannot generate choreography without AI - no fallback allowed");
  }

  // Strategy 1: Try structured generation
  if (!choreography && options.verbose) {
    console.log(chalk.gray(`Attempting structured generation for v${schemaVersion}...`));
  }

  try {
    const { object } = await generateObject({
      model,
      schema: ChoreographySchema,
      prompt,
      temperature: 0.7,
      maxTokens: 64000, // Maximum for Claude Sonnet 4.5
    });

    if (object) {
      // SAVE RAW OUTPUT NO MATTER WHAT
      console.log(chalk.yellow(`📝 RAW AI OUTPUT (v${schemaVersion}):`));
      console.log(JSON.stringify(object, null, 2).substring(0, 2000));

      // Save to debug file
      const debugPath = path.resolve(`choreography-raw-output-v${schemaVersion}.json`);
      await fs.writeFile(debugPath, JSON.stringify(object, null, 2));
      console.log(chalk.yellow(`💾 Raw output saved to: ${debugPath}`));

      if (object.timeline && object.timeline.length > 0) {
        choreography = object;
        console.log(chalk.green(`✓ Structured generation successful (v${schemaVersion})`));
      }
    }
  } catch (error) {
    console.log(chalk.red("❌ Structured generation error:"));
    console.log(chalk.red(error.message));
    if (error.stack && options.verbose) {
      console.log(chalk.gray(error.stack));
    }
  }

  // Strategy 2: Try text generation
  if (!choreography) {
    if (options.verbose) {
      console.log(chalk.gray("Attempting text generation with JSON extraction..."));
    }

    try {
      // Build messages array with cache control
      const messages = [
        {
          role: 'user',
          content: prompt + "\n\nIMPORTANT: Return ONLY the JSON object, no other text.",
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } }
          }
        }
      ];

      const { text, providerMetadata } = await generateText({
        model,
        messages,
        temperature: 0.7,
        maxTokens: 64000, // Maximum for Claude Sonnet 4.5
      });

      // Log cache stats if available
      if (providerMetadata?.anthropic?.cacheCreationInputTokens) {
        console.log(`  📦 Cache created: ${providerMetadata.anthropic.cacheCreationInputTokens} tokens`);
      }
      if (providerMetadata?.anthropic?.cacheReadInputTokens) {
        console.log(`  ♻️  Cache hit: ${providerMetadata.anthropic.cacheReadInputTokens} tokens`);
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);

        // SAVE RAW TEXT OUTPUT TOO
        console.log(chalk.yellow("📝 RAW TEXT GENERATION OUTPUT:"));
        console.log(JSON.stringify(parsed, null, 2).substring(0, 2000));
        const debugPath = path.resolve("choreography-raw-text-output.json");
        await fs.writeFile(debugPath, JSON.stringify(parsed, null, 2));
        console.log(chalk.yellow(`💾 Raw text output saved to: ${debugPath}`));

        const validated = ChoreographySchema.safeParse(parsed);
        if (validated.success) {
          choreography = validated.data;
          console.log(chalk.green("✓ Text generation with extraction successful"));
        } else {
          console.log(chalk.yellow("⚠️  Validation errors:"), validated.error.issues[0]?.message);
        }
      }
    } catch (error) {
      console.log(chalk.red("❌ Text extraction error:"));
      console.log(chalk.red(error.message));
      if (error.stack && options.verbose) {
        console.log(chalk.gray(error.stack));
      }
    }
  }

  // NO FALLBACK - AI MUST WORK
  if (!choreography) {
    console.error(chalk.red("❌ FATAL: AI generation failed completely"));
    console.error(chalk.red("   No fallback allowed - choreography must use ASCII art from library"));
    throw new Error("Cannot generate choreography without successful AI generation");
  }

  // Ensure duration matches and version is correct
  if (choreography.metadata.duration !== metadata.duration) {
    choreography.metadata.duration = metadata.duration;
  }
  choreography.metadata.version = schemaVersion;

  return choreography;
}

// ============================================================================
// MAIN COMMAND
// ============================================================================
const command = new Command("generate-choreography")
  .description("Generate choreography JSON for audio visualization (v1.0 or v1.1)")
  .option("-d, --description <text>", "Music description", "Electronic composition")
  .option("-a, --abc <path>", "Path to ABC notation file")
  .option("-df, --description-file <path>", "Path to file containing description")
  .option("-o, --output <path>", "Output path for choreography JSON")
  .option("--schema-version <version>", "Schema version (1.0 or 1.1)", "1.1")
  .option("-v, --verbose", "Show detailed progress")
  .option("--chunked", "Process long ABC files in chunks of 6 sections for better quality")
  .action(async (options) => {
    try {
      console.log(chalk.cyan(`🎭 Generating Choreography (Schema v${options.schemaVersion})...\n`));

      // Validate schema version
      if (!["1.0", "1.1"].includes(options.schemaVersion)) {
        console.log(chalk.red(`❌ Invalid schema version: ${options.schemaVersion}`));
        console.log(chalk.yellow("   Valid versions: 1.0, 1.1"));
        process.exit(1);
      }

      // Get description
      let description = options.description || "Electronic composition";
      if (options.descriptionFile) {
        const descPath = path.resolve(options.descriptionFile);
        console.log(chalk.gray(`Reading description from: ${descPath}`));
        description = await fs.readFile(descPath, "utf-8");
      }

      // Parse ABC file or use defaults
      let metadata;
      if (options.abc) {
        const abcPath = path.resolve(options.abc);
        console.log(chalk.gray(`Reading ABC file: ${abcPath}`));

        try {
          const abcContent = await fs.readFile(abcPath, "utf-8");
          metadata = parseABCMetadata(abcContent);

          // Get actual duration and onsets from WAV file
          const audioData = await getAudioMetadata(abcPath, { verbose: true });
          if (audioData) {
            metadata.duration = Math.round(audioData.duration);
            metadata.onsets = audioData.onsets;
            console.log(chalk.green(`✓ Parsed: ${metadata.title} (${metadata.duration}s @ ${metadata.tempo} BPM)\n`));
          } else {
            // Fallback: estimate duration from ABC if no WAV found
            const totalBeats = metadata.measures * (metadata.beatsPerMeasure || 4);
            metadata.duration = Math.round((totalBeats * 60) / metadata.tempo);
            metadata.duration = Math.min(300, Math.max(10, metadata.duration));
            console.log(chalk.yellow(`⚠️  Using estimated duration: ${metadata.duration}s\n`));
          }
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Could not read ABC file: ${error.message}`));
          console.log(chalk.yellow("   Using default metadata\n"));
          metadata = {
            title: "Untitled",
            tempo: 120,
            timeSignature: "4/4",
            measures: 32,
            duration: 60,
            key: "C",
            onsets: []
          };
        }
      } else {
        metadata = {
          title: "Generated Composition",
          tempo: 120,
          timeSignature: "4/4",
          measures: 32,
          duration: 60,
          key: "C",
          onsets: []
        };
        console.log(chalk.gray("No ABC file provided, using defaults\n"));
      }

      // Load ASCII art from library if available
      let asciiShapes = [];
      if (options.abc) {
        // Get the basename without extension for lookup
        const abcBasename = path.basename(options.abc, path.extname(options.abc));
        asciiShapes = asciiArtManager.getArtForAbc(abcBasename) || [];
        if (asciiShapes.length > 0) {
          console.log(chalk.green(`✓ Found ${asciiShapes.length} ASCII art shapes for this composition`));
        }
      }

      let choreography;

      // Check if --chunked mode is enabled and ABC file is provided
      if (options.chunked && options.abc) {
        const abcPath = path.resolve(options.abc);

        try {
          const abcContent = await fs.readFile(abcPath, "utf-8");
          const { header, sections } = analyzeABCSections(abcContent);

          console.log(chalk.cyan(`\n📊 ABC Analysis:`));
          console.log(chalk.white(`  • Sections found: ${sections.length}`));

          if (sections.length > 6) {
            console.log(chalk.yellow(`  • Sections exceed 6, will process in chunks`));

            // Chunk the sections
            const chunks = chunkABCSections(sections, 6);

            // Process chunks sequentially
            choreography = await processChunkedChoreography(
              chunks,
              metadata,
              description,
              asciiShapes,
              options
            );
          } else {
            console.log(chalk.white(`  • Processing all ${sections.length} sections in single pass`));

            // Process normally if 6 or fewer sections
            const prompt = options.schemaVersion === "1.0"
              ? buildChoreographyPromptV1_0(description, metadata, asciiShapes)
              : buildChoreographyPromptV1_1(description, metadata, asciiShapes);

            if (options.verbose) {
              console.log(chalk.gray(`Prompt preview (v${options.schemaVersion}):`));
              console.log(chalk.gray(prompt.substring(0, 500) + "...\n"));
            }

            console.log(chalk.yellow(`Generating v${options.schemaVersion} choreography...\n`));
            choreography = await generateChoreographyWithFallbacks(
              prompt,
              metadata,
              description,
              options
            );
          }
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Could not analyze ABC sections: ${error.message}`));
          console.log(chalk.yellow("   Falling back to normal processing\n"));

          // Fall back to normal processing
          const prompt = options.schemaVersion === "1.0"
            ? buildChoreographyPromptV1_0(description, metadata, asciiShapes)
            : buildChoreographyPromptV1_1(description, metadata, asciiShapes);

          console.log(chalk.yellow(`Generating v${options.schemaVersion} choreography...\n`));
          choreography = await generateChoreographyWithFallbacks(
            prompt,
            metadata,
            description,
            options
          );
        }
      } else {
        // Normal processing (no --chunked flag or no ABC file)
        const prompt = options.schemaVersion === "1.0"
          ? buildChoreographyPromptV1_0(description, metadata, asciiShapes)
          : buildChoreographyPromptV1_1(description, metadata, asciiShapes);

        if (options.verbose) {
          console.log(chalk.gray(`Prompt preview (v${options.schemaVersion}):`));
          console.log(chalk.gray(prompt.substring(0, 500) + "...\n"));
        }

        console.log(chalk.yellow(`Generating v${options.schemaVersion} choreography...\n`));
        choreography = await generateChoreographyWithFallbacks(
          prompt,
          metadata,
          description,
          options
        );
      }

      // Determine output path
      let outputPath;
      if (options.output) {
        outputPath = path.resolve(options.output);
      } else if (options.abc) {
        const basePath = options.abc.replace(/\.abc$/i, "");
        const versionSuffix = options.schemaVersion === "1.0" ? ".v1.0" : "";
        outputPath = path.resolve(`${basePath}${versionSuffix}.choreography.json`);
      } else {
        const versionSuffix = options.schemaVersion === "1.0" ? ".v1.0" : "";
        outputPath = path.resolve(`choreography${versionSuffix}.json`);
      }

      // Save choreography
      await fs.writeFile(
        outputPath,
        JSON.stringify(choreography, null, 2),
        "utf-8"
      );

      // Display summary
      console.log(chalk.green("\n✅ SUCCESS! Choreography generated and saved!\n"));
      console.log(chalk.cyan("📊 Summary:"));
      console.log(chalk.white(`  • File: ${outputPath}`));
      console.log(chalk.white(`  • Name: ${choreography.metadata.name}`));
      console.log(chalk.white(`  • Duration: ${choreography.metadata.duration} seconds`));
      console.log(chalk.white(`  • BPM: ${choreography.metadata.bpm || metadata.tempo}`));
      console.log(chalk.white(`  • Timeline Events: ${choreography.timeline.length}`));

      if (choreography.templates?.objects) {
        const objectCount = Object.keys(choreography.templates.objects).length;
        console.log(chalk.white(`  • Object Templates: ${objectCount}`));
      }

      // Count action types
      const actionTypes = {};
      choreography.timeline.forEach((event) => {
        event.actions.forEach((action) => {
          actionTypes[action.type] = (actionTypes[action.type] || 0) + 1;
        });
      });

      console.log(chalk.cyan("\n🎬 Action Types:"));
      Object.entries(actionTypes).forEach(([type, count]) => {
        console.log(chalk.white(`  • ${type}: ${count}`));
      });

      console.log(chalk.green("\n✨ Ready for visualization!"));
      console.log(chalk.gray("\nUsage:"));
      console.log(chalk.white(`  node play-ascii-beats-enhanced.js <audio.wav> ${outputPath}`));

    } catch (error) {
      console.error(chalk.red("\n❌ Unexpected error:"), error.message);
      if (options.verbose) {
        console.error(chalk.gray(error.stack));
      }

      // Create minimal fallback
      console.log(chalk.yellow("\nCreating minimal fallback choreography..."));
      const minimalChoreography = {
        metadata: {
          version: "1.0",
          name: "Minimal Fallback",
          duration: 60,
          bpm: 120,
          timeSignature: "4/4",
          fps: 120
        },
        settings: {
          collisionBehavior: "default",
          boundaryMode: "bounce"
        },
        timeline: [
          {
            trigger: { type: "time", at: 0 },
            actions: [{ type: "spawn", objectId: "star", template: "star", position: { x: 40, y: 12 } }]
          },
          {
            trigger: { type: "time", at: 30 },
            actions: [{ type: "transform", target: "star", effect: "RAINBOW", duration: 2 }]
          },
          {
            trigger: { type: "time", at: 58 },
            actions: [{ type: "destroy", target: "star", effect: "fade" }]
          }
        ]
      };

      const fallbackPath = path.resolve("choreography-fallback.json");
      await fs.writeFile(fallbackPath, JSON.stringify(minimalChoreography, null, 2));
      console.log(chalk.green(`✓ Saved minimal choreography to: ${fallbackPath}`));
      process.exit(1);
    }
  });

export default command;