/**
 * THE GAY SCHEMA - EXACT COPY FROM MULTI-AGENT GENERATOR
 *
 * This is the ACTUAL schema used by generate-choreography-multi-agent.js
 * This is NOT the official schema - this is what the generator creates
 *
 * Created for comparison purposes to show schema incompatibility
 */

import { z } from 'zod';

// Agent 4a - Lifecycle events (spawn/despawn)
function buildLifecycleEventSchema() {
  return z.object({
    label: z.string(),
    trigger: z.object({
      type: z.enum(["time", "beat", "onset"]),
      at: z.number().optional(),
      beat: z.number().optional(),
      offset: z.number().optional()
    }),
    actions: z.array(z.union([
      // Spawn action (8 params)
      z.object({
        type: z.literal("spawn"),
        objectId: z.string(),
        template: z.string(),
        position: z.object({
          x: z.number(),
          y: z.number()
        }),
        track: z.string().optional(),
        delay: z.number().optional()
      }),
      // Despawn action (3 params)
      z.object({
        type: z.literal("despawn"),
        objectId: z.string(),
        delay: z.number().optional()
      })
    ]))
  });
}

// Agent 4b - Operation events (move/transform/visual)
function buildOperationsEventSchema() {
  return z.object({
    label: z.string(),
    trigger: z.object({
      type: z.enum(["time", "beat", "onset"]),
      at: z.number().optional(),
      beat: z.number().optional(),
      offset: z.number().optional()
    }),
    actions: z.array(z.union([
      // Move action (7 params)
      z.object({
        type: z.literal("move"),
        objectId: z.string(),
        to: z.object({
          x: z.number(),
          y: z.number()
        }),
        duration: z.number(),
        delay: z.number().optional()
      }),
      // Transform action (7 params)
      z.object({
        type: z.literal("transform"),
        objectId: z.string(),
        scale: z.number().optional(),
        rotation: z.number().optional(),
        alpha: z.number().optional(),
        duration: z.number(),
        delay: z.number().optional()
      }),
      // Visual action (6 params)
      z.object({
        type: z.literal("visual"),
        objectId: z.string(),
        color: z.string().optional(),
        alpha: z.number().optional(),
        duration: z.number(),
        delay: z.number().optional()
      })
    ]))
  });
}

function buildBackgroundSchema() {
  return z.object({
    backgroundEvents: z.array(z.object({
      label: z.string(),
      trigger: z.object({
        type: z.literal("time"),
        at: z.number()
      }),
      actions: z.array(z.object({
        type: z.literal("background"),
        mode: z.enum(["audio-reactive", "static", "content", "image", "disabled"]),
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
        image: z.object({
          path: z.string().describe("Relative path to downloaded image file"),
          fit: z.enum(["cover", "contain", "fill", "stretch"]).optional(),
          position: z.object({
            x: z.enum(["left", "center", "right"]).optional(),
            y: z.enum(["top", "center", "bottom"]).optional()
          }).optional(),
          opacity: z.number().optional(),
          blur: z.number().optional()
        }).optional(),
        transition: z.object({
          duration: z.number(),
          easing: z.enum(["linear", "ease-in", "ease-out", "ease-in-out"])
        }).optional(),
        delay: z.number().optional()
      }))
    }))
  });
}

export {
  buildLifecycleEventSchema,
  buildOperationsEventSchema,
  buildBackgroundSchema
};
