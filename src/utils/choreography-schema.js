import { z } from 'zod';

/**
 * Choreography Schema v1.1 (Extended) for AI visualization generation
 * Extracted from generate-choreography-new.js for better maintainability
 *
 * This module defines the complete Zod schema for choreography JSON files,
 * including metadata, settings, templates, tracks, scenes, threads, backgroundEvents, and timeline.
 *
 * v1.1 Features:
 * - backgroundEvents: Separate background control events (patterns, audio-reactive, content)
 * - Extended timeline actions: spawn, move, transform, formation, visual, destroy, audio-map, background
 * - Template system with object and movement presets
 * - Multi-track support with layering
 * - Scene-based composition
 * - Thread-based parallel timelines
 */

/**
 * Build Choreography Schema v1.1 (Extended) using Zod
 * @returns {z.ZodObject} The v1.1 choreography schema
 */
export function buildChoreographySchemaV1_1() {
  // dynamicNumber: numeric or expression string
  const dynamicNumber = z.union([
    z.number(),
    z.string()
  ]);

  // Metadata Schema v1.1
  const MetadataSchema = z.object({
    version: z.string().default("1.1"),
    name: z.string(),
    duration: z.number().describe("Total duration in seconds"),
    bpm: z.number().optional().describe("Beats per minute"),
    timeSignature: z.string().default("4/4"),
    fps: z.number().default(120),
    seed: z.number().optional(),
    notes: z.string().optional()
  });

  // Background Settings Schema v1.1
  const BackgroundSettings = z.object({
    mode: z.enum(["audio-reactive", "static", "content", "disabled"]).default("audio-reactive"),
    audioReactive: z.object({
      sensitivity: z.number().default(1.0).describe("Sensitivity multiplier (0.1x to 5.0x)"),
      colorWheelOffset: z.number().default(0).describe("HSL hue offset in degrees"),
      saturation: z.object({
        min: z.number().default(50),
        max: z.number().default(100)
      }).default({ min: 50, max: 100 }),
      lightness: z.object({
        min: z.number().default(10),
        max: z.number().default(40)
      }).default({ min: 10, max: 40 }),
      updateRate: z.number().default(30).describe("Updates per second")
    }).optional(),
    static: z.object({
      color: z.string().describe("CSS color string (hex, rgb, hsl, named)"),
      pattern: z.enum(["solid", "grid", "dots", "noise"]).default("solid").optional()
    }).optional(),
    content: z.object({
      type: z.enum(["text", "ascii-art", "banner"]),
      text: z.string().optional(),
      asciiArt: z.string().optional(),
      banner: z.object({
        text: z.string(),
        scrollSpeed: z.number().default(1.0),
        repeat: z.boolean().default(true)
      }).optional(),
      position: z.object({
        x: z.enum(["left", "center", "right"]).default("center"),
        y: z.enum(["top", "center", "bottom"]).default("center")
      }).default({ x: "center", y: "center" }),
      color: z.string().default("#FFFFFF"),
      opacity: z.number().default(1.0)
    }).optional(),
    transition: z.object({
      duration: z.number().default(0.5).describe("Transition duration in seconds"),
      easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"]).default("ease-in-out")
    }).default({ duration: 0.5, easing: "ease-in-out" })
  }).optional();

  // Settings Schema v1.1
  const SettingsSchema = z.object({
    background: BackgroundSettings,
    audioReactive: z.object({
      amplitudeMultiplier: z.number().default(1.0),
      velocityThreshold: z.number().default(0.15),
      frequencyBands: z.array(z.object({
        name: z.string(),
        range: z.array(z.number()),
        weight: z.number()
      })).optional(),
      analysisWindow: z.number().optional(),
      smoothing: z.number().optional()
    }).optional(),
    collisionBehavior: z.enum(["default", "scripted", "disabled"]).default("default"),
    boundaryMode: z.enum(["bounce", "wrap", "stop", "destroy"]).default("bounce"),
    randomness: z.object({
      seed: z.number().optional(),
      mode: z.enum(["deterministic", "random"]).optional()
    }).optional(),
    performanceBudget: z.object({
      maxObjects: z.number().optional(),
      maxTransformsPerSecond: z.number().optional()
    }).optional()
  }).optional();

  // Templates Schema v1.1 - Must use string because Anthropic rejects z.record()
  // Templates will be JSON-stringified object that gets parsed after generation
  const TemplatesSchema = z.string();

  // Tracks Schema v1.1
  const TracksSchema = z.array(z.object({
    id: z.string(),
    name: z.string(),
    layer: z.number().int().describe("Z-order, higher = front"),
    opacity: z.number(),
    audioChannel: z.enum(["stereo", "left", "right", "center"]).default("stereo")
  })).optional();

  // Action Types v1.1
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
    delay: z.number().optional()
  });

  const MoveAction = z.object({
    type: z.literal("move"),
    target: z.string().describe("Object ID or 'all' or track ID"),
    movement: z.union([
      z.object({
        preset: z.string(),
        duration: dynamicNumber,
        easing: z.string().optional()
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
    ]),
    delay: z.number().optional()
  });

  const TransformAction = z.object({
    type: z.literal("transform"),
    target: z.string(),
    effect: z.string().describe("Transformation effect name"),
    duration: dynamicNumber,
    delay: z.number().optional()
  });

  const FormationAction = z.object({
    type: z.literal("formation"),
    objects: z.array(z.string()),
    pattern: z.string(),
    center: z.object({ x: dynamicNumber, y: dynamicNumber }),
    duration: dynamicNumber,
    stagger: z.number().optional(),
    delay: z.number().optional()
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
      }).optional()
    }),
    duration: dynamicNumber,
    easing: z.string().optional(),
    delay: z.number().optional()
  });

  const DestroyAction = z.object({
    type: z.literal("destroy"),
    target: z.string(),
    effect: z.string().optional(),
    delay: z.number().optional()
  });

  const AudioMapAction = z.object({
    type: z.literal("audio-map"),
    target: z.string(),
    mapping: z.object({
      amplitude: z.object({
        property: z.string(),
        range: z.array(dynamicNumber),
        smoothing: z.number().optional()
      }).optional(),
      frequency: z.object({
        band: z.string(),
        property: z.string(),
        range: z.array(dynamicNumber)
      }).optional()
    }),
    delay: z.number().optional()
  });

  const BackgroundAction = z.object({
    type: z.literal("background"),
    mode: z.enum(["audio-reactive", "static", "content", "disabled"]).optional(),
    audioReactive: z.object({
      sensitivity: z.number().optional(),
      colorWheelOffset: z.number().optional(),
      saturation: z.object({
        min: z.number(),
        max: z.number()
      }).optional(),
      lightness: z.object({
        min: z.number(),
        max: z.number()
      }).optional(),
      updateRate: z.number().optional()
    }).optional(),
    static: z.object({
      color: z.string(),
      pattern: z.enum(["solid", "grid", "dots", "noise"]).optional()
    }).optional(),
    content: z.object({
      type: z.enum(["text", "ascii-art", "banner"]),
      text: z.string().optional(),
      asciiArt: z.string().optional(),
      banner: z.object({
        text: z.string(),
        scrollSpeed: z.number().optional(),
        repeat: z.boolean().optional()
      }).optional(),
      position: z.object({
        x: z.enum(["left", "center", "right"]),
        y: z.enum(["top", "center", "bottom"])
      }).optional(),
      color: z.string().optional(),
      opacity: z.number().optional()
    }).optional(),
    transition: z.object({
      duration: z.number(),
      easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"])
    }).optional(),
    delay: z.number().optional()
  });

  // Audio condition with boolean logic support
  const AudioCondition = z.object({
    type: z.literal("audio"),
    conditions: z.array(z.object({
      parameter: z.enum(["amplitude", "velocity", "frequency"]),
      operator: z.enum([">", "<", "==", "spike", "drop"]),
      value: z.number(),
      band: z.string().optional()
    })).optional(),
    condition: z.object({
      parameter: z.enum(["amplitude", "velocity", "frequency"]),
      operator: z.enum([">", "<", "==", "spike", "drop"]),
      value: z.number()
    }).optional(),
    logic: z.enum(["and", "or", "xor"]).optional()
  });

  // Timeline Schema v1.1
  const TimelineSchema = z.array(z.object({
    label: z.string().optional(),
    trigger: z.union([
      z.object({
        type: z.literal("time"),
        at: dynamicNumber.describe("Time in seconds or expression"),
        jitter: z.number().optional()
      }),
      z.object({
        type: z.literal("beat"),
        measure: z.number().int(),
        beat: dynamicNumber
      }),
      AudioCondition,
      z.object({
        type: z.literal("loop"),
        every: dynamicNumber.describe("Interval or expression"),
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
      AudioMapAction,
      BackgroundAction
    ])),
    _scene: z.string().optional()
  }));

  // Threads Schema v1.1
  const ThreadsSchema = z.array(z.object({
    id: z.string(),
    name: z.string().optional(),
    timeline: TimelineSchema
  })).optional();

  // Scenes Schema v1.1
  const ScenesSchema = z.array(z.object({
    name: z.string(),
    start: z.number(),
    duration: z.number(),
    transition: z.object({
      type: z.enum(["cut", "crossfade", "dissolve"]),
      duration: z.number().optional()
    }).optional(),
    timeline: TimelineSchema.optional()
  })).optional();

  // Main Choreography Schema v1.1
  return z.object({
    metadata: MetadataSchema,
    settings: SettingsSchema,
    templates: TemplatesSchema,
    tracks: TracksSchema,
    scenes: ScenesSchema,
    threads: ThreadsSchema,
    backgroundEvents: TimelineSchema.optional().describe("v1.1: Background control events (separate from object choreography)"),
    timeline: TimelineSchema
  });
}
