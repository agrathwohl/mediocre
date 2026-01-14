#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { z } from 'zod';
import { streamObject, generateText } from 'ai';
import { getAnthropic } from '../utils/claude.js';
import { getAudioMetadata } from '../utils/audio-metadata.js';
import asciiArtManager from '../utils/ascii-art-manager.js';
import { createOnsetQueryTool, getOnsetStatistics } from '../utils/onset-query-tool.js';

/**
 * Build Choreography Schema v1.0 using Zod
 * @returns {z.ZodObject} The v1.0 choreography schema
 */
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
      type: z.string(),
      parameters: z.object({}).passthrough()
    })).optional(),
    formations: z.record(z.object({
      pattern: z.string(),
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
      "EXPLODE", "SHATTER", "MELT", "PIXELATE", "GLITCH", "MORPH", "WARP",
      "MULTIPLY", "RAINBOW", "INVERT", "MATRIX", "DISSOLVE", "MIRROR", "CORRUPT",
      "INVERSION", "VORTEX", "LIQUIFY", "CRYSTALLIZE", "WORMHOLE", "ELECTRIC",
      "FRACTAL", "QUANTUM", "PLASMA", "SINGULARITY"
    ]),
    duration: z.number(),
    parameters: z.object({}).passthrough().optional()
  });

  const FormationAction = z.object({
    type: z.literal("formation"),
    objects: z.array(z.string()),
    pattern: z.string(),
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

/**
 * Parse ABC metadata from ABC notation content
 * @param {string} abcContent - ABC notation content
 * @returns {Object} Parsed metadata
 */
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

/**
 * Build choreography prompt for v1.0 schema
 * @param {string} description - Music description
 * @param {Object} metadata - ABC metadata
 * @param {Array} asciiShapes - ASCII art shapes from library
 * @returns {string} Generated prompt
 */
function buildChoreographyPromptV1_0(description, metadata, asciiShapes = []) {
  let asciiSection = "";

  if (asciiShapes.length > 0) {
    asciiSection = `
AVAILABLE ASCII ART SHAPES:
You should use these specific ASCII art shapes that were designed for this composition:

`;
    asciiShapes.forEach((shape, index) => {
      asciiSection += `Shape ${index + 1} (${shape.intensity} intensity):
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
    const density = (metadata.onsets.length / metadata.duration).toFixed(2);
    onsetSection = `
BEAT TIMING DATA AVAILABLE:
- Total onsets: ${metadata.onsets.length}
- Duration: ${metadata.duration}s
- Average density: ${density} onsets/sec
- Tool: Use the 'queryOnsets' tool to get precise onset times for any time range
- Example: queryOnsets(startTime: 0, endTime: 10) returns all onsets in first 10 seconds

IMPORTANT: Use the queryOnsets tool frequently to get accurate beat timings for each section of your choreography. This ensures actions are synchronized with the actual musical beats.
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

/**
 * Generate choreography with fallback strategies
 * @param {string} prompt - Generated prompt
 * @param {Object} metadata - ABC metadata
 * @param {string} description - Music description
 * @param {Object} options - Options
 * @param {string} onsetCachePath - Path to onset cache file
 * @returns {Promise<Object>} Generated choreography
 */
async function generateChoreographyWithFallbacks(prompt, metadata, description, options, onsetCachePath) {
  let choreography = null;
  const ChoreographySchema = buildChoreographySchemaV1_0();

  // Get the model
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-7-sonnet-20250219");

  // Create onset query tool if onset data is available
  const tools = {};
  if (onsetCachePath && metadata.onsets && metadata.onsets.length > 0) {
    try {
      await fs.access(onsetCachePath);
      tools.queryOnsets = createOnsetQueryTool(onsetCachePath);
      if (options.verbose) {
        console.log(chalk.gray(`✓ Onset query tool enabled (${metadata.onsets.length} onsets available)\n`));
      }
    } catch {
      if (options.verbose) {
        console.log(chalk.yellow('⚠️  Onset cache not found, tool disabled\n'));
      }
    }
  }

  // Strategy 1: Try structured generation
  if (options.verbose) {
    console.log(chalk.gray('Attempting structured generation for v1.0...'));
  }

  try {
    const result = await streamObject({
      model,
      schema: ChoreographySchema,
      prompt,
      temperature: 0.7,
      maxTokens: 64000,
      tools: Object.keys(tools).length > 0 ? tools : undefined
    });

    console.log(chalk.cyan('\nStreaming choreography generation...\n'));

    // Stream text for visible progress
    for await (const textChunk of result.textStream) {
      process.stdout.write(textChunk);
    }

    console.log('\n');

    // Get final validated object
    choreography = await result.object;

    if (choreography && choreography.timeline && choreography.timeline.length > 0) {
      console.log(chalk.green(`✓ Generated choreography with ${choreography.timeline.length} timeline events`));
    }
  } catch (error) {
    console.log(chalk.red('\n❌ Structured generation error:'));
    console.log(chalk.red(error.message));
    if (options.verbose && error.stack) {
      console.log(chalk.gray(error.stack));
    }
  }

  // Strategy 2: Try text generation
  if (!choreography) {
    if (options.verbose) {
      console.log(chalk.gray('Attempting text generation with JSON extraction...'));
    }

    try {
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
        maxTokens: 64000
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

        const validated = ChoreographySchema.safeParse(parsed);
        if (validated.success) {
          choreography = validated.data;
          console.log(chalk.green('✓ Text generation with extraction successful'));
        } else {
          console.log(chalk.yellow('⚠️  Validation errors:'));
          validated.error.issues.forEach((issue, idx) => {
            console.log(chalk.gray(`  ${idx + 1}. ${issue.path.join('.')} - ${issue.message}`));
          });
          if (options.verbose) {
            console.log(chalk.gray('\nFull error details:'));
            console.log(chalk.gray(JSON.stringify(validated.error.issues, null, 2)));
          }
        }
      }
    } catch (error) {
      console.log(chalk.red('❌ Text extraction error:'));
      console.log(chalk.red(error.message));
      if (error.stack && options.verbose) {
        console.log(chalk.gray(error.stack));
      }
    }
  }

  // NO FALLBACK - AI MUST WORK
  if (!choreography) {
    console.error(chalk.red('❌ FATAL: AI generation failed completely'));
    console.error(chalk.red('   No fallback allowed - choreography must use ASCII art from library'));
    throw new Error('Cannot generate choreography without successful AI generation');
  }

  // Ensure duration matches and version is correct
  if (choreography.metadata.duration !== metadata.duration) {
    choreography.metadata.duration = metadata.duration;
  }
  choreography.metadata.version = "1.0";

  return choreography;
}

/**
 * Generate choreography JSON for audio visualization (v1.0 schema only)
 * @param {Object} options - Command options
 * @param {string} options.description - Music description
 * @param {string} options.abc - Path to ABC notation file
 * @param {string} options.descriptionFile - Path to file containing description
 * @param {string} options.output - Output path for choreography JSON
 * @param {boolean} options.verbose - Show detailed progress
 */
export async function generateChoreography(options) {
  console.log(chalk.cyan('🎭 Generating Choreography (Schema v1.0)...\n'));

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
      console.log(chalk.yellow('   Using default metadata\n'));
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
    console.log(chalk.gray('No ABC file provided, using defaults\n'));
  }

  // Load ASCII art from library if available
  let asciiShapes = [];
  if (options.abc) {
    const abcBasename = path.basename(options.abc, path.extname(options.abc));
    asciiShapes = asciiArtManager.getArtForAbc(abcBasename) || [];
    if (asciiShapes.length > 0) {
      console.log(chalk.green(`✓ Found ${asciiShapes.length} ASCII art shapes for this composition`));
    }
  }

  // Build prompt and generate choreography
  const prompt = buildChoreographyPromptV1_0(description, metadata, asciiShapes);

  if (options.verbose) {
    console.log(chalk.gray('Prompt preview (v1.0):'));
    console.log(chalk.gray(prompt.substring(0, 500) + '...\n'));
  }

  // Get onset cache path for tool
  const onsetCachePath = options.abc ?
    `${path.resolve(options.abc).replace(/\.abc$/i, '')}-onsets.json` :
    null;

  console.log(chalk.yellow('Generating v1.0 choreography...\n'));
  const choreography = await generateChoreographyWithFallbacks(
    prompt,
    metadata,
    description,
    options,
    onsetCachePath
  );

  // Save choreography to file
  const abcBasename = path.basename(options.abc, path.extname(options.abc));
  const outputPath = options.output || path.join(
    process.cwd(),
    'output',
    `${abcBasename}-choreography.json`
  );

  await fs.writeFile(outputPath, JSON.stringify(choreography, null, 2));
  console.log(chalk.green(`\n✅ Choreography saved to: ${outputPath}`));
  console.log(chalk.cyan(`   Timeline events: ${choreography.timeline.length}`));
  console.log(chalk.cyan(`   Duration: ${choreography.metadata.duration}s`));
  console.log(chalk.cyan(`   Version: ${choreography.metadata.version}\n`));

  return outputPath;
}
