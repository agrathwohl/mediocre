import { streamText, Output } from 'ai';
import { z } from 'zod';
import chalk from 'chalk';
import fs from 'fs/promises';
import { getAnthropic } from '../utils/claude.js';
import { repairJSONEscapes, parseTemplatesField } from '../utils/json-repair.js';

/**
 * Multi-Agent Choreography Generation
 * Breaks complex choreography into 6 specialized agents to stay under Anthropic's 24 optional param limit:
 * - Agent 0: Libretto (narrative/story synthesis)
 * - Agent 1: Metadata & Settings
 * - Agent 2: ASCII Art Templates
 * - Agent 3: Background Events (sets the stage/atmosphere)
 * - Agent 4a: Lifecycle Events (spawn/despawn choreography)
 * - Agent 4b: Operations Events (move/transform/visual choreography)
 */

// ============================================================================
// AGENT SCHEMAS (Each < 24 optional parameters)
// ============================================================================

function buildMetadataSchema() {
  return z.object({
    metadata: z.object({
      version: z.string(),
      name: z.string(),
      duration: z.number(),
      bpm: z.number().optional(),
      timeSignature: z.string(),
      fps: z.number(),
      seed: z.number().optional(),
      notes: z.string().optional()
    }),
    settings: z.object({
      background: z.object({
        mode: z.enum(["audio-reactive", "static", "content", "disabled"])
      }).optional(),
      audioReactive: z.object({
        amplitudeMultiplier: z.number().optional(),
        velocityThreshold: z.number().optional()
      }).optional(),
      collisionBehavior: z.enum(["default", "scripted", "disabled"]).optional(),
      boundaryMode: z.enum(["bounce", "wrap", "stop", "destroy"]).optional()
    }).optional()
  });
}

function buildTemplatesSchema() {
  // Templates must be string because Anthropic rejects z.record()
  return z.object({
    templates: z.string() // JSON-stringified object
  });
}

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
        mode: z.enum(["audio-reactive", "static", "content", "disabled"]),
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
      }))
    }))
  });
}

// ============================================================================
// PROMPT BUILDERS
// ============================================================================

function formatLibrettoContext(librettoText) {
  if (!librettoText) return '';
  return `\n\n📖 LIBRETTO (Narrative Guide):\n${librettoText}\n\nUse this narrative to inform your creative decisions and ensure your work aligns with the overall artistic vision.\n`;
}

function buildMetadataPrompt(title, duration, bpm, description, libretto = null) {
  return `Generate metadata and settings for a choreography composition.

COMPOSITION INFO:
- Title: ${title}
- Duration: ${duration}s
- BPM: ${bpm}
- Description: ${description}${formatLibrettoContext(libretto)}

Generate appropriate metadata and settings objects. Use audio-reactive background mode by default.`;
}

function buildTemplatesPrompt(description, templateInfo, libretto = null) {
  const customArtInstructions = templateInfo ?
    `\n\n🎨 CUSTOM ASCII ART AVAILABLE:\nThe composition has custom-generated ASCII art. Create templates based on these themes/shapes: ${templateInfo}\n\nYou MUST create templates that match or are inspired by these custom ASCII art pieces.` :
    '';

  return `Generate ASCII art templates for choreography following the v1.1 schema EXACTLY.

COMPOSITION: ${description}${customArtInstructions}${formatLibrettoContext(libretto)}

Create 5-10 ASCII art templates as a JSON object with this EXACT structure (v1.1 schema):
{
  "objects": {
    "template_name": {
      "shape": ["line1", "line2", ...],
      "defaultScale": 1,
      "defaultColor": "#FFFFFF",
      "bounds": {
        "width": <calculated from shape>,
        "height": <calculated from shape>
      },
      "physics": {
        "mass": 1,
        "friction": 0.8,
        "elasticity": 0.3
      },
      "description": "..."
    }
  }
}

CRITICAL REQUIREMENTS:
- Use "defaultColor" NOT "color"
- defaultScale must be integer (1, 2, 3) NOT float (1.0)
- bounds MUST be included with calculated width/height from ASCII art dimensions
- physics MUST be included with mass, friction, elasticity

Return ONLY the JSON object as a string.`;
}

function buildLifecyclePrompt(metadata, templates, description, onsetData, backgroundResult, libretto = null) {
  const templateList = Object.keys(templates.objects || {}).join(', ');

  let onsetInfo = '';
  if (onsetData) {
    const onsets = Array.isArray(onsetData) ? onsetData : (onsetData.onsets || []);
    if (onsets.length > 0) {
      onsetInfo = `\n\nONSET TIMES:\n${JSON.stringify(onsets.slice(0, 50), null, 2)}`;
    }
  }

  let backgroundInfo = '';
  if (backgroundResult && backgroundResult.backgroundEvents) {
    const bgSummary = backgroundResult.backgroundEvents.map(evt =>
      `  ${evt.trigger.at}s: ${evt.label} (${evt.actions[0]?.mode || 'unknown'})`
    ).join('\n');
    backgroundInfo = `\n\nBACKGROUND SCENE CHANGES:\nThe stage atmosphere changes at these times - coordinate your spawns with these scene shifts:\n${bgSummary}`;
  }

  return `Generate object lifecycle events (SPAWN + DESPAWN) for choreography with KALEIDOSCOPIC and GEOMETRICAL visual storytelling.

METADATA:
- Duration: ${metadata.duration}s
- BPM: ${metadata.bpm}
- Title: ${metadata.name}

AVAILABLE TEMPLATES: ${templateList}

DESCRIPTION: ${description}${formatLibrettoContext(libretto)}${onsetInfo}${backgroundInfo}

Generate 20-50 lifecycle events with TWO ACTION TYPES:

SPAWN (create object):
{
  "type": "spawn",
  "objectId": "unique_id",     // REQUIRED: unique identifier
  "template": "template_name", // REQUIRED: from AVAILABLE TEMPLATES
  "position": {"x": 640, "y": 360}, // REQUIRED: screen coords (0-1280, 0-720)
  "track": "foreground",       // Optional: foreground/background/ambient
  "delay": 0                   // Optional: delay in seconds
}

DESPAWN (remove object):
{
  "type": "despawn",
  "objectId": "existing_id",   // REQUIRED: reference spawned object
  "delay": 0                   // Optional: delay in seconds
}

CRITICAL RULES:
- Each spawn needs unique objectId
- Despawn can only reference spawned objectIds
- template MUST be from AVAILABLE TEMPLATES
- Space events throughout ${metadata.duration}s duration
- Align to onset times when appropriate

OBJECT LIFETIME COORDINATION:
Your lifecycle decisions directly impact Agent 4b (operations agent) downstream:
- Spawned objects need sufficient lifetime for move/transform/visual operations
- Don't despawn objects too quickly after spawning (give them time to be animated)
- Consider that operations may take 2-10 seconds to complete
- If you spawn an object at time T, avoid despawning it before T+5s minimum
- Strategic despawns at composition transitions or after major events work best

VISUAL STORYTELLING & CHOREOGRAPHY AESTHETICS:
Create KALEIDOSCOPIC and GEOMETRICAL visual narratives through strategic spawning:

1. MACRO SHAPES & FORMATIONS:
   - Spawn multiple objects in geometric patterns (circles, spirals, grids, lines)
   - Position objects to form larger composite shapes on screen
   - Example: spawn 5-8 objects in a circle formation around center (640, 360)
   - Example: spawn objects in diagonal lines, triangular clusters, or symmetrical arrangements

2. NARRATIVE THROUGH APPEARANCE/DISAPPEARANCE:
   - Use spawn timing to create visual buildup (gradual accumulation of elements)
   - Despawn strategically to create dramatic clearing or dissolution
   - Group spawns/despawns to tell a story (emergence → climax → fade)
   - Example: spawn ambient objects gradually, then spawn action objects suddenly

3. SPATIAL CHOREOGRAPHY:
   - Distribute spawns across all screen regions (corners, edges, center, quadrants)
   - Create spatial contrast: dense clusters vs sparse isolation
   - Use position strategically: foreground objects at bottom, background at top
   - Screen bounds: x: 0-1280, y: 0-720 (center: 640, 360)

4. RHYTHMIC & MUSICAL ALIGNMENT:
   - Spawn objects on musical onset times for synchronization
   - Create visual rhythm through repeated spawn patterns
   - Match spawn/despawn density to musical intensity

Think of the screen as a CANVAS where object placement creates larger GEOMETRICAL COMPOSITIONS. Your spawn positions define the ARCHITECTURE that Agent 4b will animate.

Return 20-50 lifecycle events.`;
}

function buildOperationsPrompt(metadata, spawnedObjects, description, onsetData, backgroundResult, libretto = null) {
  const objectIds = spawnedObjects.join(', ');

  let onsetInfo = '';
  if (onsetData) {
    const onsets = Array.isArray(onsetData) ? onsetData : (onsetData.onsets || []);
    if (onsets.length > 0) {
      onsetInfo = `\n\nONSET TIMES:\n${JSON.stringify(onsets.slice(0, 50), null, 2)}`;
    }
  }

  let backgroundInfo = '';
  if (backgroundResult && backgroundResult.backgroundEvents) {
    const bgSummary = backgroundResult.backgroundEvents.map(evt =>
      `  ${evt.trigger.at}s: ${evt.label} (${evt.actions[0]?.mode || 'unknown'})`
    ).join('\n');
    backgroundInfo = `\n\nBACKGROUND SCENE CHANGES:\nThe stage atmosphere changes at these times - coordinate your operations with these mood shifts:\n${bgSummary}`;
  }

  return `Generate operation events (MOVE/TRANSFORM/VISUAL) for spawned objects with KALEIDOSCOPIC and GEOMETRICAL choreography.

METADATA:
- Duration: ${metadata.duration}s
- BPM: ${metadata.bpm}

SPAWNED OBJECT IDs: ${objectIds}

DESCRIPTION: ${description}${formatLibrettoContext(libretto)}${onsetInfo}${backgroundInfo}

Generate 15-40 operation events with THREE ACTION TYPES:

MOVE (change position):
{
  "type": "move",
  "objectId": "obj_id",        // REQUIRED: from SPAWNED OBJECT IDs
  "to": {"x": 800, "y": 400},  // REQUIRED: destination coords
  "duration": 2,               // REQUIRED: animation duration
  "delay": 0                   // Optional
}

TRANSFORM (scale/rotate):
{
  "type": "transform",
  "objectId": "obj_id",        // REQUIRED: from SPAWNED OBJECT IDs
  "scale": 1.5,                // Optional: scale multiplier
  "rotation": 45,              // Optional: degrees
  "alpha": 0.8,                // Optional: 0.0-1.0
  "duration": 1,               // REQUIRED
  "delay": 0                   // Optional
}

VISUAL (color changes):
{
  "type": "visual",
  "objectId": "obj_id",        // REQUIRED: from SPAWNED OBJECT IDs
  "color": "#ff0000",          // Optional: hex color
  "alpha": 1.0,                // Optional: 0.0-1.0
  "duration": 1,               // REQUIRED
  "delay": 0                   // Optional
}

CRITICAL RULES:
- objectId MUST reference spawned objects (from list above)
- Don't reference despawned objects
- Space events throughout ${metadata.duration}s duration
- Align to onset times when appropriate

VISUAL STORYTELLING & CHOREOGRAPHY AESTHETICS:
Create KALEIDOSCOPIC and GEOMETRICAL visual narratives through dynamic operations:

1. KALEIDOSCOPIC PATTERNS & SYMMETRY:
   - Choreograph symmetrical movements (mirrored, radial, spiral patterns)
   - Rotate objects in coordinated patterns (all rotate together, counter-rotate, cascading rotations)
   - Create visual mandalas through synchronized transforms
   - Example: rotate 4 objects by 90° simultaneously for symmetrical effect
   - Example: move objects in circular paths around screen center

2. GEOMETRICAL MOTION CHOREOGRAPHY:
   - Move objects in geometric paths (circles, spirals, zigzags, straight lines)
   - Create converging/diverging patterns (objects move toward/away from a point)
   - Choreograph group formations (objects maintain relative positions while moving)
   - Example: move 5 objects from corners toward center, then spiral outward
   - Example: create diagonal sweeps across screen with staggered delays

3. TRANSFORMATION STORYTELLING:
   - Use scale to create depth illusion (growing = approaching, shrinking = receding)
   - Coordinate transforms to tell narrative (buildup → climax → resolution)
   - Create visual rhythm through repeated transform patterns
   - Example: pulse-scale multiple objects in sync with music (scale 0.8 → 1.2 → 0.8)
   - Example: fade objects in/out with alpha for ghostly appearance/disappearance

4. COLOR & VISUAL DYNAMICS:
   - Shift colors to create mood transitions (warm → cool, bright → dark)
   - Coordinate color changes across multiple objects for unified palette shifts
   - Use alpha fades for dramatic reveals or subtle background shifts
   - Example: shift all objects to blue tones during ambient section
   - Example: pulse alpha 0.3 → 1.0 → 0.3 for breathing effect

5. SPATIAL CHOREOGRAPHY:
   - Move objects to create macro shapes in motion (swarm behavior, flock patterns)
   - Use screen space strategically: corners for isolation, center for focal points
   - Create depth layers: background objects (top, smaller, slower), foreground (bottom, larger, faster)
   - Screen bounds: x: 0-1280, y: 0-720 (center: 640, 360)

6. MUSICAL & RHYTHMIC SYNCHRONIZATION:
   - Time movements to musical onset times for impact
   - Create visual acceleration/deceleration matching musical dynamics
   - Coordinate transforms with beat patterns (every 4 beats, every measure)

Think of operations as ANIMATING THE ARCHITECTURE created by Agent 4a. Your movements, transforms, and visuals bring the geometrical composition to LIFE.

Return 15-40 operation events.`;
}

function buildBackgroundPrompt(metadata, libretto = null, imageList = []) {
  const librettoGuidance = libretto ? `

🎭 LIBRETTO PROVIDED - TEXT CONTENT STRONGLY ENCOURAGED:
Since a libretto narrative has been provided, you SHOULD use CONTENT MODE with text/banner at key moments:
- Display title or key narrative phrases from the libretto
- Use scrolling banners for repeated themes or mantras
- Show section transitions with text labels
- Include at least 2-3 content mode events that reference the libretto narrative
` : '';

  const imageGuidance = imageList.length > 0 ? `

🖼️  DOWNLOADED IMAGES AVAILABLE - IMAGE MODE STRONGLY ENCOURAGED:
${imageList.length} thematic images have been downloaded and are ready for use:
${imageList.map((img, i) => `  ${i + 1}. ${img.filename} - ${img.description || 'Downloaded image'}`).join('\n')}

IMPORTANT: You SHOULD use IMAGE MODE for at least 1-2 background events.
Reference images by their filename in the "path" field: "images/${imageList[0]?.filename}"
Images are thematically relevant to the composition and libretto.
` : '';

  return `Generate background control events for choreography with DYNAMIC visual environments that enhance the composition.

COMPOSITION:
- Duration: ${metadata.duration}s
- BPM: ${metadata.bpm}
- Time Signature: ${metadata.timeSignature}${formatLibrettoContext(libretto)}${librettoGuidance}${imageGuidance}

Generate 3-7 background action events with FIVE MODE TYPES:

1. AUDIO-REACTIVE MODE (dynamic background responding to audio):
{
  "type": "background",
  "mode": "audio-reactive",
  "audioReactive": {
    "sensitivity": 1.0,          // 0.1-5.0: how strongly background reacts
    "colorWheelOffset": 0,       // 0-360: hue rotation in degrees
    "saturation": {
      "min": 50,                 // 0-100: minimum saturation
      "max": 100                 // 0-100: maximum saturation
    },
    "lightness": {
      "min": 10,                 // 0-100: minimum lightness (darker)
      "max": 40                  // 0-100: maximum lightness (brighter)
    },
    "updateRate": 30             // Hz: updates per second (15-60)
  },
  "transition": {
    "duration": 0.5,             // Crossfade duration in seconds
    "easing": "ease-in-out"      // linear|ease-in|ease-out|ease-in-out
  },
  "delay": 0                     // Optional delay
}

2. STATIC MODE (fixed color/pattern background):
{
  "type": "background",
  "mode": "static",
  "static": {
    "color": "#1a1a2e",          // CSS color: hex, rgb, hsl, named
    "pattern": "solid"           // solid|grid|dots|noise
  },
  "transition": {
    "duration": 1.0,
    "easing": "ease-in-out"
  },
  "delay": 0
}

3. CONTENT MODE (text/ASCII art/banner backgrounds):
{
  "type": "background",
  "mode": "content",
  "content": {
    "type": "text",              // text|ascii-art|banner
    "text": "COMPOSITION TITLE", // Text to display
    "position": {
      "x": "center",             // left|center|right
      "y": "center"              // top|center|bottom
    },
    "color": "#FFFFFF",
    "opacity": 0.8               // 0.0-1.0
  },
  "transition": {
    "duration": 0.5,
    "easing": "ease-in"
  },
  "delay": 0
}

// BANNER variant (scrolling text):
{
  "type": "background",
  "mode": "content",
  "content": {
    "type": "banner",
    "banner": {
      "text": "SCROLLING MESSAGE",
      "scrollSpeed": 1.0,        // Speed multiplier
      "repeat": true             // Loop the banner
    },
    "color": "#00ffff",
    "opacity": 0.6
  },
  "transition": {
    "duration": 0.3,
    "easing": "linear"
  }
}

4. IMAGE MODE (display downloaded thematic images):
{
  "type": "background",
  "mode": "image",
  "image": {
    "path": "images/image_001.jpg",  // Relative path to downloaded image
    "fit": "cover",                  // cover|contain|fill|stretch
    "position": {
      "x": "center",                 // left|center|right
      "y": "center"                  // top|center|bottom
    },
    "opacity": 0.7,                  // 0.0-1.0 (lower = more transparent)
    "blur": 0                        // 0-20 pixels (higher = more blur)
  },
  "transition": {
    "duration": 1.5,
    "easing": "ease-in-out"
  },
  "delay": 0
}

5. DISABLED MODE (turn off background):
{
  "type": "background",
  "mode": "disabled",
  "transition": {
    "duration": 2.0,             // Fade to black duration
    "easing": "ease-out"
  }
}

BACKGROUND STORYTELLING & MOOD DESIGN:
Use background changes to create ATMOSPHERIC NARRATIVE and visual depth:

1. AUDIO-REACTIVE DYNAMICS:
   - HIGH intensity sections: high sensitivity (1.5-2.5), bright colors (colorWheelOffset for palette)
   - AMBIENT sections: low sensitivity (0.3-0.8), darker tones (lightness.max: 20-30)
   - CLIMAX moments: maximum saturation (80-100), fast update rate (45-60 Hz)
   - CALM passages: desaturated (30-60), slow update rate (15-30 Hz)
   - COLOR SHIFTS: rotate colorWheelOffset throughout piece (0° → 120° → 240° for RGB cycle)

2. STATIC COLOR PALETTE SHIFTS:
   - Use for dramatic contrast: switch to static during sudden silence or breakdown
   - DARK backgrounds (#0a0a0f, #1a1a2e) for focusing attention on objects
   - COLORED backgrounds (deep blue #1e3a5f, burgundy #4a1a2e) for mood shifts
   - PATTERNS: grid/dots for structured sections, noise for chaotic sections
   - Transition slowly (1.5-3s) for smooth palette changes

3. CONTENT & TEXT INTEGRATION:
   - Display composition title at start (text mode, fade in 2s)
   - Show section names during transitions (text mode, centered)
   - Scrolling banners for repetitive/minimalist sections
   - ASCII art backgrounds for thematic reinforcement
   - Keep opacity 0.3-0.7 to avoid overwhelming foreground objects

4. IMAGE MODE FOR THEMATIC DEPTH:
   - Use downloaded images that relate to the composition's theme or libretto narrative
   - Set opacity 0.5-0.8 to avoid overwhelming ASCII art foreground
   - Use "cover" fit for dramatic full-screen immersion
   - Use "contain" fit to preserve image aspect ratio
   - Apply blur (5-15) for dreamy/ambient sections
   - No blur (0) for sharp, clear imagery during calm moments
   - Lower opacity (0.3-0.5) when ASCII objects are complex/busy
   - Higher opacity (0.6-0.8) when ASCII objects are sparse/minimal
   - Use at key narrative moments that align with image themes

5. DISABLED MODE FOR DRAMA:
   - Fade to black for dramatic pauses or resets
   - Use before major section changes
   - Create negative space for visual impact

6. TRANSITION CHOREOGRAPHY:
   - FAST transitions (0.2-0.5s): sudden mood shifts, percussive changes
   - MEDIUM transitions (0.5-1.5s): standard palette shifts, image changes
   - SLOW transitions (2-4s): gradual atmospheric evolution, fade to black, image crossfades
   - EASING: ease-in for anticipation, ease-out for resolution, linear for mechanical feel

7. MUSICAL & STRUCTURAL ALIGNMENT:
   - Change backgrounds at major section boundaries
   - Sync colorWheelOffset shifts to harmonic modulations
   - Increase sensitivity during buildups
   - Decrease sensitivity during breakdowns

STRATEGIC PLACEMENT:
- Start (0s): Set initial atmosphere (audio-reactive or static)
- Section transitions: Change mode or palette (every 60-120s for 7-8min piece)
- Climax approach: Increase audio-reactive intensity
- Breakdown/ambient: Switch to static or low-sensitivity audio-reactive
- Finale: Dramatic shift (disabled → audio-reactive max sensitivity, or static → black)

Think of background as the EMOTIONAL FOUNDATION and ATMOSPHERIC CONTAINER for the choreography. Your mode changes create the CANVAS MOOD that objects dance within.

Return 3-7 background events strategically placed throughout ${metadata.duration}s duration.`;
}

function buildLibrettoPrompt(name, duration, description, asciiShapes) {
  const shapeDescriptions = asciiShapes.length > 0 ?
    `\n\nASCII ART ELEMENTS:\n${asciiShapes.map((s, i) => `${i + 1}. ${s.id || 'Shape'}: ${s.description || 'Visual element'} (${s.intensity} intensity)`).join('\n')}` :
    '';

  return `You are creating a LIBRETTO (narrative/story) for an audiovisual choreography piece.

COMPOSITION DETAILS:
- Title: ${name}
- Duration: ${duration} seconds
- Description: ${description}${shapeDescriptions}

Your task is to synthesize these inputs into a cohesive NARRATIVE that will guide all other agents in creating the choreography.

Write a plain text narrative that:
1. Captures the ESSENCE and MOOD of the piece
2. Describes the DRAMATIC ARC over the duration (opening, development, climax, resolution)
3. Suggests VISUAL THEMES and MOVEMENT QUALITIES
4. References the ASCII art elements if provided
5. Can be structured as:
   - One unified narrative for the entire piece, OR
   - Multiple narrative blocks for different sections/movements

Keep it concise (200-500 words), poetic, and evocative. This narrative will be shared with all other agents to ensure a unified artistic vision.

Write in present tense, as if describing the piece as it unfolds.`;
}

// ============================================================================
// MAIN MULTI-AGENT GENERATION FUNCTION
// ============================================================================

export async function generateChoreographyMultiAgent(prompt, metadata, description, options, onsetCachePath, outputPath, asciiShapes = []) {
  console.log(chalk.cyan('\n🤖 Multi-Agent Choreography Generation\n'));

  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-sonnet-4-5");

  // Convert ASCII shapes to template names/descriptions for the AI
  const templateInfo = asciiShapes.length > 0 ?
    asciiShapes.map(shape => `"${shape.id || 'shape'}": ${shape.description || shape.art.substring(0, 50)}`).join(', ') :
    null;

  if (asciiShapes.length > 0) {
    console.log(chalk.green(`🎨 Using ${asciiShapes.length} custom ASCII art shapes for templates`));
  }

  let metadataResult, templatesResult, timelineResult, backgroundResult;
  let validatedChoreography = null;

  // Output directory for agent outputs
  const baseOutputPath = outputPath.replace('.json', '');
  const agentOutputDir = `${baseOutputPath}-agent-outputs`;

  try {
    // Create agent output directory
    await fs.mkdir(agentOutputDir, { recursive: true });

    // ========================================================================
    // AGENT 0: Libretto (narrative/story synthesis)
    // ========================================================================
    let librettoText = null;

    try {
      console.log(chalk.yellow('📖 Agent 0: Generating libretto narrative...'));

      const { textStream: librettoStream } = streamText({
        model,
        prompt: buildLibrettoPrompt(metadata.name, metadata.duration, description, asciiShapes),
        temperature: 0.8,
        maxTokens: 2000
      });

      let librettoChunks = [];
      for await (const chunk of librettoStream) {
        librettoChunks.push(chunk);
      }
      librettoText = librettoChunks.join('');

      // Save libretto
      await fs.writeFile(
        `${agentOutputDir}/00-libretto.txt`,
        librettoText
      );
      console.log(chalk.green('✓ Libretto generated'));
      console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/00-libretto.txt`));
    } catch (librettoError) {
      console.log(chalk.yellow(`⚠️  Libretto generation failed: ${librettoError.message}`));
      console.log(chalk.gray('   Continuing without libretto...'));
      librettoText = null;
    }

    // ========================================================================
    // AGENT 1: Metadata & Settings
    // ========================================================================
    console.log(chalk.yellow('📝 Agent 1: Generating metadata and settings...'));

    const { partialOutputStream: metadataStream } = streamText({
      model,
      output: Output.object({ schema: buildMetadataSchema() }),
      prompt: buildMetadataPrompt(metadata.name, metadata.duration, metadata.bpm, description, librettoText),
      temperature: 0.7,
      maxTokens: 4000
    });

    for await (const partial of metadataStream) {
      metadataResult = partial;
    }

    // SAVE AGENT 1 OUTPUT
    await fs.writeFile(
      `${agentOutputDir}/01-metadata.json`,
      JSON.stringify(metadataResult, null, 2)
    );
    console.log(chalk.green('✓ Metadata generated'));
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/01-metadata.json`));

    // ========================================================================
    // AGENT 2: Templates
    // ========================================================================
    let templates;

    if (asciiShapes.length > 0) {
      // USE LIBRARY ASCII ART - NO LLM NEEDED
      console.log(chalk.yellow(`🎨 Agent 2: Converting ${asciiShapes.length} library ASCII art shapes to templates...`));

      // Map intensity to hex colors (matching play-choreography color scheme)
      const intensityColors = {
        'small': '#4ecdc4',    // cyan-blue
        'medium': '#ff6b35',   // orange-red
        'high': '#e63946',     // bright red
        'max': '#ff00ff'       // magenta (maximum intensity)
      };

      // Map intensity to physics properties
      const intensityPhysics = {
        'small': { mass: 1, friction: 0.8, elasticity: 0.3 },
        'medium': { mass: 2, friction: 0.8, elasticity: 0.3 },
        'high': { mass: 3, friction: 0.8, elasticity: 0.3 },
        'max': { mass: 4, friction: 0.8, elasticity: 0.3 }
      };

      templates = { objects: {} };
      asciiShapes.forEach(shape => {
        const templateName = (shape.id || `shape_${Date.now()}`).replace(/[^a-zA-Z0-9_]/g, '_');
        const shapeLines = shape.art.split('\n');

        // Calculate bounds from ASCII art
        const width = Math.max(...shapeLines.map(line => line.length));
        const height = shapeLines.length;

        templates.objects[templateName] = {
          shape: shapeLines,
          defaultScale: 1,
          defaultColor: intensityColors[shape.intensity] || "#f1faee",
          bounds: {
            width,
            height
          },
          physics: intensityPhysics[shape.intensity] || { mass: 1, friction: 0.8, elasticity: 0.3 },
          description: shape.description || "Custom ASCII art"
        };
      });

      console.log(chalk.green(`✓ Converted ${Object.keys(templates.objects).length} library shapes to templates`));
    } else {
      // NO LIBRARY ART - GENERATE WITH LLM
      console.log(chalk.yellow('🎨 Agent 2: Generating ASCII art templates with AI...'));

      const { partialOutputStream: templatesStream } = streamText({
        model,
        output: Output.object({ schema: buildTemplatesSchema() }),
        prompt: buildTemplatesPrompt(description, templateInfo, librettoText),
        temperature: 0.8,
        maxTokens: 16000
      });

      for await (const partial of templatesStream) {
        templatesResult = partial;
      }

      // SAVE AGENT 2 RAW OUTPUT (before parsing)
      await fs.writeFile(
        `${agentOutputDir}/02-templates-raw.json`,
        JSON.stringify(templatesResult, null, 2)
      );

      // Parse templates string to object with error handling and repair
      try {
        // STRIP OUTER QUOTES if Sonnet 4.5 wrapped the JSON in quotes
        let templateString = templatesResult.templates;
        if (templateString.startsWith('"{') && templateString.endsWith('}"')) {
          templateString = templateString.slice(1, -1); // Remove outer quotes
          templateString = templateString.replace(/\\"/g, '"'); // Unescape inner quotes
        }

        // Try direct parse first
        templates = JSON.parse(templateString);
      } catch (parseError) {
        console.log(chalk.yellow(`⚠️  Initial JSON parse failed: ${parseError.message}`));
        console.log(chalk.yellow('   Attempting JSON repair...'));

        try {
          // Try with JSON repair
          const repairedTemplates = repairJSONEscapes(templatesResult.templates);
          templates = JSON.parse(repairedTemplates);
          console.log(chalk.green('✓ JSON repair successful'));
        } catch (repairError) {
          console.error(chalk.red(`❌ Templates JSON repair failed: ${repairError.message}`));
          // Save failed output for debugging
          await fs.writeFile(
            `${agentOutputDir}/02-templates-FAILED.txt`,
            templatesResult.templates
          );
          throw new Error(`Templates JSON parsing failed: ${repairError.message}`);
        }
      }

      console.log(chalk.green(`✓ Templates generated: ${Object.keys(templates.objects || {}).length} objects`));
    }

    // SAVE AGENT 2 PARSED OUTPUT
    await fs.writeFile(
      `${agentOutputDir}/02-templates-parsed.json`,
      JSON.stringify(templates, null, 2)
    );
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/02-templates-parsed.json`));

    // ========================================================================
    // AGENT 2.5: Image Search and Download (DISABLED - BROKEN IMPLEMENTATION)
    // ========================================================================
    // TODO: CRITICAL - This implementation is fundamentally broken
    //
    // PROBLEM: Asking an LLM to "find images" returns TEXT DESCRIPTIONS,
    //          not actual image URLs. The regex will match ZERO URLs in
    //          typical LLM responses like "Here are some ocean images..."
    //
    // REQUIRED FIX - Replace with real image search API:
    //   Option 1: Tavily web search with `include_images: true`
    //   Option 2: Unsplash API (requires UNSPLASH_ACCESS_KEY)
    //   Option 3: Pexels API (requires PEXELS_API_KEY)
    //
    // Example using Unsplash:
    //   const response = await fetch(
    //     `https://api.unsplash.com/search/photos?query=${query}&per_page=5`,
    //     { headers: { 'Authorization': `Client-ID ${process.env.UNSPLASH_ACCESS_KEY}` } }
    //   );
    //   const data = await response.json();
    //   const imageUrls = data.results.map(r => r.urls.regular);
    //
    // See code review report (adcb3dd) for full implementation details.
    //
    console.log(chalk.gray('  ⏭️  Agent 2.5 (Image Search): DISABLED - requires API integration'));
    console.log(chalk.gray('     (Background events will use audio-reactive, static, or content modes)'));
    const downloadedImages = [];

    // ========================================================================
    // AGENT 3: Background Events
    // ========================================================================
    console.log(chalk.yellow('🌈 Agent 3: Generating background events...'));

    const { partialOutputStream: backgroundStream } = streamText({
      model,
      output: Output.object({ schema: buildBackgroundSchema() }),
      prompt: buildBackgroundPrompt(metadataResult.metadata, librettoText, downloadedImages),
      temperature: 0.7,
      maxTokens: 8000
    });

    for await (const partial of backgroundStream) {
      backgroundResult = partial;
    }

    // SAVE AGENT 3 OUTPUT
    await fs.writeFile(
      `${agentOutputDir}/03-background.json`,
      JSON.stringify(backgroundResult, null, 2)
    );
    console.log(chalk.green(`✓ Background events generated: ${backgroundResult.backgroundEvents.length} events`));
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/03-background.json`));

    // ========================================================================
    // AGENT 4a: Lifecycle Events (spawn/despawn)
    // ========================================================================
    console.log(chalk.yellow('⏱️  Agent 4a: Generating lifecycle events (spawn/despawn)...'));

    // Load onset data if available
    let onsetData = null;
    if (onsetCachePath) {
      try {
        const onsetContent = await fs.readFile(onsetCachePath, 'utf-8');
        onsetData = JSON.parse(onsetContent);
      } catch (err) {
        // Onset data optional
      }
    }

    const { elementStream: lifecycleStream } = streamText({
      model,
      output: Output.array({ element: buildLifecycleEventSchema() }),
      prompt: buildLifecyclePrompt(metadataResult.metadata, templates, description, onsetData, backgroundResult, librettoText),
      temperature: 0.7,
      maxTokens: 16000
    });

    const lifecycleEvents = [];
    const spawnedObjectIds = new Set();

    try {
      for await (const event of lifecycleStream) {
        lifecycleEvents.push(event);

        // Track spawned object IDs
        if (event.actions) {
          event.actions.forEach(action => {
            if (action.type === 'spawn' && action.objectId) {
              spawnedObjectIds.add(action.objectId);
            }
          });
        }

        // Debug logging
        console.log(chalk.gray(`\n  Lifecycle Event ${lifecycleEvents.length}: ${event.label}`));
        if (event.actions && event.actions.length > 0) {
          console.log(chalk.gray(`    Actions: ${event.actions.map(a => a.type).join(', ')}`));

          // Show spawn details
          const spawns = event.actions.filter(a => a.type === 'spawn');
          spawns.forEach(spawn => {
            console.log(chalk.gray(`    → Spawn: id=${spawn.objectId}, template=${spawn.template}, pos=${JSON.stringify(spawn.position)}`));
          });

          // Show despawn details
          const despawns = event.actions.filter(a => a.type === 'despawn');
          despawns.forEach(despawn => {
            console.log(chalk.gray(`    → Despawn: id=${despawn.objectId}`));
          });
        }
        process.stdout.write(`\r  ${lifecycleEvents.length} lifecycle events...`);
      }
    } catch (streamError) {
      console.error(chalk.red(`\n❌ Lifecycle streaming error: ${streamError.message}`));
      console.error(chalk.gray(streamError.stack));
      throw streamError;
    }

    console.log(chalk.green(`\n✓ Lifecycle events generated: ${lifecycleEvents.length} events, ${spawnedObjectIds.size} objects spawned`));

    // SAVE AGENT 4a OUTPUT
    await fs.writeFile(
      `${agentOutputDir}/04a-lifecycle.json`,
      JSON.stringify({ lifecycle: lifecycleEvents }, null, 2)
    );
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/04a-lifecycle.json`));

    // ========================================================================
    // AGENT 4b: Operations Events (move/transform/visual)
    // ========================================================================
    console.log(chalk.yellow('🎬 Agent 4b: Generating operations events (move/transform/visual)...'));

    const { elementStream: operationsStream } = streamText({
      model,
      output: Output.array({ element: buildOperationsEventSchema() }),
      prompt: buildOperationsPrompt(metadataResult.metadata, Array.from(spawnedObjectIds), description, onsetData, backgroundResult, librettoText),
      temperature: 0.7,
      maxTokens: 16000
    });

    const operationsEvents = [];

    try {
      for await (const event of operationsStream) {
        operationsEvents.push(event);

        // Debug logging
        console.log(chalk.gray(`\n  Operations Event ${operationsEvents.length}: ${event.label}`));
        if (event.actions && event.actions.length > 0) {
          console.log(chalk.gray(`    Actions: ${event.actions.map(a => a.type).join(', ')}`));

          // Show operation details
          event.actions.forEach(action => {
            if (action.type === 'move') {
              console.log(chalk.gray(`    → Move: id=${action.objectId}, to=${JSON.stringify(action.to)}, duration=${action.duration}s`));
            } else if (action.type === 'transform') {
              const props = [];
              if (action.scale !== undefined) props.push(`scale=${action.scale}`);
              if (action.rotation !== undefined) props.push(`rotation=${action.rotation}°`);
              if (action.alpha !== undefined) props.push(`alpha=${action.alpha}`);
              console.log(chalk.gray(`    → Transform: id=${action.objectId}, ${props.join(', ')}, duration=${action.duration}s`));
            } else if (action.type === 'visual') {
              const props = [];
              if (action.color) props.push(`color=${action.color}`);
              if (action.alpha !== undefined) props.push(`alpha=${action.alpha}`);
              console.log(chalk.gray(`    → Visual: id=${action.objectId}, ${props.join(', ')}, duration=${action.duration}s`));
            }
          });
        }
        process.stdout.write(`\r  ${operationsEvents.length} operations events...`);
      }
    } catch (streamError) {
      console.error(chalk.red(`\n❌ Operations streaming error: ${streamError.message}`));
      console.error(chalk.gray(streamError.stack));
      throw streamError;
    }

    console.log(chalk.green(`\n✓ Operations events generated: ${operationsEvents.length} events`));

    // SAVE AGENT 4b OUTPUT
    await fs.writeFile(
      `${agentOutputDir}/04b-operations.json`,
      JSON.stringify({ operations: operationsEvents }, null, 2)
    );
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/04b-operations.json`));

    // MERGE AGENT 4a + 4b
    const timelineEvents = [...lifecycleEvents, ...operationsEvents];
    timelineResult = { timeline: timelineEvents };

    // SAVE COMBINED TIMELINE
    await fs.writeFile(
      `${agentOutputDir}/04-timeline.json`,
      JSON.stringify(timelineResult, null, 2)
    );
    console.log(chalk.green(`\n✓ Timeline generated: ${lifecycleEvents.length} lifecycle + ${operationsEvents.length} operations = ${timelineEvents.length} total events`));
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/04-timeline.json`));

    // ========================================================================
    // ASSEMBLY: Combine all agent outputs
    // ========================================================================
    console.log(chalk.cyan('\n🔧 Assembling choreography...'));

    // Merge background events into timeline
    const completeTimeline = [...timelineResult.timeline, ...backgroundResult.backgroundEvents]
      .sort((a, b) => {
        const timeA = a.trigger?.at || a.trigger?.beat || 0;
        const timeB = b.trigger?.at || b.trigger?.beat || 0;
        return timeA - timeB;
      });

    // Construct validated choreography
    validatedChoreography = {
      metadata: {
        ...metadataResult.metadata,
        version: "1.1",
        duration: metadata.duration // Ensure duration matches
      },
      settings: metadataResult.settings || {},
      templates,
      backgroundEvents: backgroundResult?.backgroundEvents || [],
      timeline: completeTimeline
    };

    console.log(chalk.green(`✓ Assembled: ${completeTimeline.length} total timeline events`));

    // SAVE ASSEMBLED CHOREOGRAPHY
    await fs.writeFile(
      `${agentOutputDir}/06-assembled.json`,
      JSON.stringify(validatedChoreography, null, 2)
    );
    console.log(chalk.gray(`  💾 Saved: ${agentOutputDir}/06-assembled.json`));

    // Save final output
    const validatedPath = outputPath.replace('.json', '-validated.json');
    await fs.writeFile(validatedPath, JSON.stringify(validatedChoreography, null, 2));
    console.log(chalk.green(`\n✓ Choreography generation complete!`));
    console.log(chalk.gray(`💾 Saved: ${validatedPath}`));
    console.log(chalk.cyan(`  Final: ${completeTimeline.length} timeline events, ${Object.keys(templates.objects).length} templates`));

    return validatedChoreography;

  } catch (error) {
    console.error(chalk.red(`❌ Multi-agent generation failed: ${error.message}`));

    // Save error details
    try {
      await fs.writeFile(
        `${agentOutputDir}/ERROR.txt`,
        `Error: ${error.message}\n\nStack:\n${error.stack}\n\nPartial Outputs:\n- Metadata: ${metadataResult ? 'SAVED' : 'NOT GENERATED'}\n- Templates: ${templatesResult ? 'SAVED' : 'NOT GENERATED'}\n- Timeline: ${timelineResult ? 'SAVED' : 'NOT GENERATED'}\n- Background: ${backgroundResult ? 'SAVED' : 'NOT GENERATED'}\n- Validated: ${validatedChoreography ? 'SAVED' : 'NOT GENERATED'}`
      );
      console.log(chalk.gray(`  💾 Error details saved: ${agentOutputDir}/ERROR.txt`));
    } catch (saveErr) {
      // Ignore save errors in error handler
    }

    // If we have a validated version, return it
    if (validatedChoreography) {
      console.log(chalk.yellow('   Returning partially completed choreography'));
      return validatedChoreography;
    }

    throw error;
  }
}
