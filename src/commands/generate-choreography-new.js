#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { streamText, generateText, Output, NoObjectGeneratedError } from 'ai';
import { getAnthropic } from '../utils/claude.js';
import { getAudioMetadata } from '../utils/audio-metadata.js';
import asciiArtManager from '../utils/ascii-art-manager.js';
import { createOnsetQueryTool, getOnsetStatistics } from '../utils/onset-query-tool.js';
import { repairJSONEscapes, parseTemplatesField } from '../utils/json-repair.js';
import { generateChoreographyMultiAgent } from './generate-choreography-multi-agent.js';
import {
  evaluateChoreographyDensity,
  generateImprovementStrategy,
  identifyLargeGaps,
  identifySparseEvents,
  DENSITY_TARGETS
} from '../utils/choreography-density.js';
import { buildChoreographySchemaV1_1 } from '../utils/choreography-schema.js';


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
 * Filter description to remove ABC-specific content that confuses choreography generation
 * @param {string} description - Raw description text
 * @returns {string} Filtered description suitable for choreography prompts
 */
function filterDescriptionForChoreography(description) {
  return description
    .split('\n')
    .filter(line => {
      // Remove modification instructions section
      if (line.includes('## Modification Instructions')) return false;
      if (line.includes('DOUBLE the length') || line.includes('Add the following specific elements')) return false;
      // Remove ABC notation section
      if (line.includes('## ABC Notation')) return false;
      if (line.includes('```')) return false;
      // Keep everything else
      return true;
    })
    .join('\n')
    .replace(/\n{3,}/g, '\n\n') // Clean up multiple blank lines
    .trim();
}

/**
 * Build choreography prompt for v1.1 schema
 * @param {string} description - Music description
 * @param {Object} metadata - ABC metadata
 * @param {Array} asciiShapes - ASCII art shapes from library
 * @returns {string} Generated prompt
 */
function buildChoreographyPromptV1_1(description, metadata, asciiShapes = []) {
  const filteredDescription = filterDescriptionForChoreography(description);

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
IMPORTANT: Use these shapes in your choreography templates.objects section.
For multi-line shapes, use array format: "shape": ["line1", "line2", ...]

`;
  }

  let onsetSection = "";
  if (metadata.onsets && metadata.onsets.length > 0) {
    const density = (metadata.onsets.length / metadata.duration).toFixed(2);

    // Include all onset times directly in the prompt
    const onsetTimes = metadata.onsets.map(o => o.toFixed(3)).join(', ');
    const estimatedTokens = Math.ceil(onsetTimes.length / 4); // Rough token approximation

    // Warn if onset data is unusually large
    if (estimatedTokens > 10000) {
      console.log(chalk.yellow(`⚠️  Large onset data: ~${estimatedTokens} tokens (${(estimatedTokens/640).toFixed(1)}% of 64k budget)`));
    }

    onsetSection = `
BEAT TIMING DATA (All ${metadata.onsets.length} onset times in seconds):
${onsetTimes}

- Duration: ${metadata.duration}s
- Average density: ${density} onsets/sec
- Onset data size: ~${estimatedTokens} tokens

IMPORTANT: Use these exact onset times to synchronize your timeline events with the actual musical beats.
Pick onset times that align with your choreography sections and use them in your trigger timings.
`;
  }

  return `Generate a v1.1 JSON choreography for terminal ASCII art visualization.

🎨 CREATIVE CANVAS:
- Resolution: 2560x2880 pixels (~320x180 character grid)
- Use as much or little space as you want
- Think BIG - create expansive scenes, sweeping movements
- Or go minimal - the choice is yours!

🌟 CREATIVE DIRECTION - MAKE IT COMPELLING:
**STRONGLY ENCOURAGED:** Seek opportunities for:
- 🔮 **Kaleidoscopic Patterns**: Mirror symmetries, repeating motifs, fractal-like arrangements
- 📐 **Geometric Symmetry**: Balanced compositions, radial patterns, tessellations
- 🎪 **Composite Forms**: Use MULTIPLE ASCII art pieces positioned strategically to create:
  * Larger recognizable shapes (faces, buildings, creatures from smaller elements)
  * Abstract forms that emerge from the arrangement of individual pieces
  * Visual ideas and concepts built from constituent parts
  * Choreographed movements where objects collaborate to tell a story

**ALTERNATIVE:** If geometric/visual approaches don't inspire you:
- 📖 **Tell a Story**: Create a narrative arc through the choreography
  * Character journeys (objects with personality moving through scenes)
  * Emotional progressions (calm → tension → resolution)
  * Visual metaphors for the musical themes

**CRITICAL REQUIREMENT:**
⚡ This MUST be ACTIVE, ENGAGING, and INTERESTING
❌ AVOID: Static displays, boring linear movements, sparse uninspired positioning
✅ CREATE: Dynamic compositions, surprising transformations, rich visual density

✨ V1.1 EXTENDED FEATURES:
- **Shape Arrays**: Multi-line ASCII art using ["line1", "line2", ...] format
- **Extended Metadata**: Add seed (numeric), notes (description)
- **Advanced Audio**: 5+ frequency bands (sub/bass/mid/high/air), custom analysis
- **Object Bounds**: Specify width/height for complex shapes
- **Scene Transitions**: Cut, crossfade, dissolve between scenes
- **Event Labels**: Label timeline events for clarity
- **Action Delays**: Stagger actions within events
- **DynamicNumber**: Use expressions like "random(0,1)" or "{{beat}}*2" (optional)
- **Threads**: Parallel timelines for layered sequences (optional)
- **Animation Frames**: Multi-frame object animation (optional)

${asciiSection}MUSIC INFO:
- Title: ${metadata.title}
- Duration: ${metadata.duration} seconds
- Tempo: ${metadata.tempo} BPM
- Time Signature: ${metadata.timeSignature}
- Description: ${filteredDescription}
${onsetSection}

SCHEMA STRUCTURE v1.1:
{
  "metadata": {
    "version": "1.1",
    "name": "Choreography Title",
    "duration": ${metadata.duration},
    "bpm": ${metadata.tempo},
    "timeSignature": "${metadata.timeSignature}",
    "fps": 120,
    "seed": 20260111,  // Optional random seed
    "notes": "Description"  // Optional notes
  },
  "settings": {
    "background": {  // NEW: Background control (optional)
      "mode": "audio-reactive",  // "audio-reactive" | "static" | "content" | "disabled"
      "audioReactive": {  // Config for audio-reactive mode
        "sensitivity": 1.0,  // 0.1 to 5.0 (higher = more reactive)
        "colorWheelOffset": 0,  // 0-360 degrees hue offset
        "saturation": { "min": 50, "max": 100 },  // 0-100
        "lightness": { "min": 10, "max": 40 },  // 0-100
        "updateRate": 30  // Updates per second (1-120)
      },
      "static": {  // Config for static mode
        "color": "#1a1a2e",  // CSS color string
        "pattern": "solid"  // "solid" | "grid" | "dots" | "noise"
      },
      "content": {  // Config for content mode
        "type": "text",  // "text" | "ascii-art" | "banner"
        "text": "♪ MUSIC ♪",
        "position": { "x": "center", "y": "center" },
        "color": "#FFFFFF",
        "opacity": 0.8
      },
      "transition": {  // Smooth transitions between modes
        "duration": 0.5,  // seconds
        "easing": "ease-in-out"  // "linear" | "ease-in" | "ease-out" | "ease-in-out"
      }
    },
    "collisionBehavior": "default",
    "boundaryMode": "bounce",
    "audioReactive": {
      "amplitudeMultiplier": 1.0,
      "velocityThreshold": 0.15,
      "frequencyBands": [  // Extended frequency bands
        { "name": "sub", "range": [20, 60], "weight": 1.5 },
        { "name": "bass", "range": [60, 250], "weight": 1.3 },
        { "name": "mid", "range": [250, 2000], "weight": 1.0 },
        { "name": "high", "range": [2000, 8000], "weight": 0.8 },
        { "name": "air", "range": [8000, 20000], "weight": 0.5 }
      ],
      "analysisWindow": 50,
      "smoothing": 0.3
    },
    "randomness": {
      "seed": 20260111,
      "mode": "deterministic"
    },
    "performanceBudget": {
      "maxObjects": 64,
      "maxTransformsPerSecond": 240
    }
  },
  "templates": {
    "objects": {
      "myShape": {
        "shape": ["line 1", "line 2", "line 3"],  // Array for multi-line
        "defaultColor": "#ff6b35",
        "defaultScale": 1.0,
        "bounds": { "width": 26, "height": 7 },
        "physics": { "mass": 2, "friction": 0.8, "elasticity": 0.3 }
      },
      "simpleShape": {
        "shape": "★",  // String for single char
        "defaultColor": "yellow"
      }
    },
    "movements": {
      "pulse": { "type": "sine", "parameters": { "amplitude": 20, "frequency": 3 } }
    },
    "formations": {
      "line": { "pattern": "grid", "spacing": 200, "count": 8, "orientation": "horizontal" }
    }
  },
  "tracks": [
    { "id": "drums", "name": "Drums", "layer": 5, "opacity": 1, "audioChannel": "stereo" }
  ],
  "scenes": [
    {
      "name": "Section A - Intro",
      "start": 0,
      "duration": 10.5,
      "transition": { "type": "cut" }
    },
    {
      "name": "Section B - Build",
      "start": 10.5,
      "duration": 12.5,
      "transition": { "type": "crossfade", "duration": 0.5 }
    }
  ],
  "timeline": [
    {
      "label": "intro-spawn",  // Event label
      "trigger": { "type": "time", "at": 0 },
      "actions": [
        {
          "type": "spawn",
          "objectId": "star_1",
          "template": "myShape",
          "position": { "x": 960, "y": 540 },
          "track": "drums",
          "delay": 0  // Optional action delay
        }
      ],
      "_scene": "Section A - Intro"
    }
  ],
  "threads": [  // Optional parallel timelines
    {
      "id": "background-thread",
      "name": "Ambient Background",
      "timeline": [...]
    }
  ]
}

ACTION TYPES (v1.1 format - NOTE THE REQUIRED STRUCTURE):

MOVE ACTIONS (v1.1 - CRITICAL CHANGE):
{
  "type": "move",
  "target": "object_id",
  "movement": {
    "preset": "linear",  // or "circular", "zigzag", etc.
    "duration": 2.5,
    "easing": "easeInOut"  // Optional
  }
}
// OR path-based: "movement": { "path": [{"x": 100, "y": 200, "time": 0.5}] }
// OR velocity-based: "movement": { "velocity": {"x": 50, "y": -30} }

OTHER ACTIONS:
- spawn: Creates new object at position with template
- transform: Changes scale/rotation/opacity with duration
- formation: Arranges multiple objects in pattern
- visual: Modifies visual properties (color, opacity)
- destroy: Removes object from scene
- audio-map: Maps audio analysis to object properties
- All support optional "delay" parameter for stagger effects

TRANSFORMATIONS: EXPLODE, SHATTER, MELT, PIXELATE, GLITCH, MORPH, WARP, MULTIPLY, RAINBOW, INVERT, MATRIX, DISSOLVE, MIRROR, CORRUPT, INVERSION, VORTEX, LIQUIFY, CRYSTALLIZE, WORMHOLE, ELECTRIC, FRACTAL, QUANTUM, PLASMA, SINGULARITY

TRIGGERS:
- time: { "type": "time", "at": seconds }
- beat: { "type": "beat", "measure": N, "beat": N }
- audio: { "type": "audio", "condition": {...} } or "conditions": [...] with "logic"
- loop: { "type": "loop", "every": seconds, "count": N }

IMPORTANT:
- Duration MUST be exactly ${metadata.duration} seconds
- Use queryOnsets tool for precise beat sync
- Canvas is ~320x180 characters
- Shapes can be strings or arrays
- Create engaging, rhythmically accurate choreography
- Use v1.1 features where appropriate (scenes, extended bands, labels)
- You may use static numeric values OR dynamicNumber expressions as needed

🚨 CRITICAL JSON FORMATTING RULES:
- The "templates" field MUST be a JSON object, NOT a string containing JSON
- In shape arrays with backslashes (\\), use DOUBLE backslashes: "\\\\\\\\" not "\\\\"
- For single backslash in ASCII art, write "\\\\\\\\" (4 backslashes = 2 in JSON = 1 in output)
- NEVER generate templates as: "templates": "{\\"objects\\": {...}}"
- ALWAYS generate templates as: "templates": {"objects": {...}}
- Test your JSON is valid before submitting

Generate a complete v1.1 choreography with extended features.`;
}

/**
 * Generate choreography with fallback strategies (v1.1)
 * @param {string} prompt - Generated prompt
 * @param {Object} metadata - ABC metadata
 * @param {string} description - Music description
 * @param {Object} options - Options
 * @param {string} onsetCachePath - Path to onset cache file
 * @param {string} outputPath - Output file path for recovery files
 * @returns {Promise<Object>} Generated choreography
 */

/**
 * Multi-Agent Choreography Generation Wrapper
 * Replaced monolithic approach due to Anthropic's 24 optional parameter limit (schema had 210)
 */
async function generateChoreographyWithFallbacks(prompt, metadata, description, options, onsetCachePath, outputPath, asciiShapes = []) {
  return await generateChoreographyMultiAgent(prompt, metadata, description, options, onsetCachePath, outputPath, asciiShapes);
}

/**
 * Detect latest choreography version for given basename
 * @param {string} basename - ABC basename (e.g., "messiaen_x_merzbow-modified-final-1767429180873")
 * @param {string} outputDir - Output directory path
 * @returns {Promise<{exists: boolean, latestVersion: number, latestPath: string|null}>}
 */
async function detectLatestChoreographyVersion(basename, outputDir) {
  // Check for v1.1 (schema version, first iteration)
  const v1Path = path.join(outputDir, `${basename}-choreography.v1.1.json`);

  try {
    await fs.access(v1Path);
  } catch {
    // No existing choreography
    return { exists: false, latestVersion: 0, latestPath: null };
  }

  // v1.1 exists, now check for v2, v3, v4, etc.
  let latestVersion = 1;
  let latestPath = v1Path;

  for (let v = 2; v <= 100; v++) {
    const vPath = path.join(outputDir, `${basename}-choreography.v${v}.json`);
    try {
      await fs.access(vPath);
      latestVersion = v;
      latestPath = vPath;
    } catch {
      // Version doesn't exist, stop searching
      break;
    }
  }

  return { exists: true, latestVersion, latestPath };
}

/**
 * Load existing choreography from file
 * @param {string} filePath - Path to choreography JSON
 * @returns {Promise<Object>} Parsed choreography object
 * @throws {Error} If file cannot be read or JSON is corrupted
 */
async function loadExistingChoreography(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    return parsed;
  } catch (error) {
    if (error instanceof SyntaxError) {
      // JSON parsing failed - corrupted file
      console.log(chalk.red(`\n❌ Corrupted JSON in existing choreography: ${filePath}`));
      console.log(chalk.red(`   Parse error: ${error.message}`));
      console.log(chalk.yellow(`\n⚠️  Falling back to initial generation mode`));
      throw new Error(`CORRUPTED_JSON: ${error.message}`);
    } else {
      // File read failed
      console.log(chalk.red(`\n❌ Failed to read existing choreography: ${filePath}`));
      console.log(chalk.red(`   Error: ${error.message}`));
      throw error;
    }
  }
}

/**
 * Analyze timeline and find section that needs most improvement
 * @param {Array} timeline - Timeline events
 * @param {number} duration - Total duration in seconds
 * @param {number} sectionLength - Length of each section (default 60s)
 * @returns {{startTime: number, endTime: number, events: Array, density: number}}
 */
/**
 * Detect if choreography uses background control system
 * @param {Object} choreography - Full choreography object
 * @returns {boolean} True if any timeline events have background actions
 */
function usesBackgroundSystem(choreography) {
  if (!choreography || typeof choreography !== 'object') {
    return false;
  }

  const timeline = choreography.timeline || [];
  const threads = choreography.threads || [];

  // Early exit if both are empty
  if (timeline.length === 0 && threads.length === 0) {
    return false;
  }

  // Check main timeline
  for (const event of timeline) {
    if (event?.actions && Array.isArray(event.actions)) {
      for (const action of event.actions) {
        if (action && action.type === 'background') {
          return true;
        }
      }
    }
  }

  // Check threads
  for (const thread of threads) {
    if (thread?.timeline && Array.isArray(thread.timeline)) {
      for (const event of thread.timeline) {
        if (event?.actions && Array.isArray(event.actions)) {
          for (const action of event.actions) {
            if (action && action.type === 'background') {
              return true;
            }
          }
        }
      }
    }
  }

  return false;
}

/**
 * Build prompt for adding background control actions to choreography
 * @param {Object} existingChoreography - Full choreography for context
 * @param {string} description - Music description
 * @param {Object} metadata - ABC metadata
 * @returns {string} Background improvement prompt
 */
function buildBackgroundImprovementPrompt(existingChoreography, description, metadata) {
  const duration = existingChoreography.metadata.duration;
  const bpm = existingChoreography.metadata.bpm;
  const filteredDescription = filterDescriptionForChoreography(description);

  return `BACKGROUND SYSTEM MODERNIZATION TASK

You are upgrading an existing choreography to use the new v1.1 background control system.

COMPOSITION CONTEXT:
- Title: ${metadata.title}
- Description: ${filteredDescription}
- Duration: ${duration}s
- BPM: ${bpm}
- Time Signature: ${metadata.timeSignature}

CURRENT CHOREOGRAPHY:
- Timeline events: ${existingChoreography.timeline.length}
- Background system: NOT USED (needs modernization)

YOUR TASK:
Add 3-5 background action events throughout the timeline to enhance the visual experience.

BACKGROUND ACTION SCHEMA:
{
  "label": "background_change_<descriptive_name>",
  "trigger": { "type": "time", "at": <timestamp_in_seconds> },
  "actions": [
    {
      "type": "background",
      "mode": "audio-reactive" | "static" | "content" | "disabled",
      "audioReactive": {
        "sensitivity": 0.5-2.0,
        "colorWheelOffset": 0-360,
        "saturation": { "min": 30-70, "max": 60-100 },
        "lightness": { "min": 5-20, "max": 20-50 }
      },
      "static": {
        "color": "#RRGGBB"
      },
      "content": {
        "type": "banner",
        "banner": {
          "text": "scrolling text",
          "scrollSpeed": 0.5-2.0
        },
        "position": { "x": "center", "y": "bottom" },
        "color": "#FFFFFF",
        "opacity": 0.5-1.0
      },
      "transition": {
        "duration": 0.5-2.0,
        "easing": "ease-in-out"
      },
      "delay": 0
    }
  ]
}

GUIDELINES:
1. Space events throughout the duration (every 10-20 seconds)
2. Match background changes to musical mood and structure
3. Use audio-reactive mode for dynamic sections
4. Use static mode for calm or minimal sections
5. Use content mode sparingly for title cards or special moments
6. Transitions should be smooth (0.5-1.5s duration)
7. Return ONLY a JSON array of timeline events

OUTPUT FORMAT: [ {...event1}, {...event2}, {...event3} ]
Each event must have: { label, trigger: {type: "time", at: <seconds>}, actions: [{type: "background", ...}] }`;
}

function findWeakestSection(timeline, duration, sectionLength = 60) {
  const numSections = Math.ceil(duration / sectionLength);
  const sections = [];

  for (let i = 0; i < numSections; i++) {
    const startTime = i * sectionLength;
    const endTime = Math.min((i + 1) * sectionLength, duration);

    // Get events in this time range
    const sectionEvents = timeline.filter(event => {
      const eventTime = event.trigger?.at || 0;
      return eventTime >= startTime && eventTime < endTime;
    });

    const density = sectionEvents.length / sectionLength;

    sections.push({
      startTime,
      endTime,
      events: sectionEvents,
      density,
      eventCount: sectionEvents.length
    });
  }

  // Find section with lowest density (sparsest)
  sections.sort((a, b) => a.density - b.density);
  return sections[0]; // Return weakest section
}

/**
 * Build section improvement prompt
 * @param {Object} section - Section to improve {startTime, endTime, events}
 * @param {Object} existingChoreography - Full choreography for context
 * @param {string} description - Music description
 * @param {Object} metadata - ABC metadata
 * @returns {string} Section improvement prompt
 */
function buildSectionImprovementPrompt(section, existingChoreography, description, metadata) {
  const duration = existingChoreography.metadata.duration;
  const bpm = existingChoreography.metadata.bpm;
  const templates = existingChoreography.templates || {};
  const templateNames = Object.keys(templates.objects || {});
  const filteredDescription = filterDescriptionForChoreography(description);

  return `SECTION IMPROVEMENT TASK (${section.startTime}s - ${section.endTime}s)

Improve THIS SECTION of an existing choreography. Make it more exciting and detailed.

FULL COMPOSITION CONTEXT:
- Title: ${metadata.title}
- Description: ${filteredDescription}
- Full duration: ${duration}s
- BPM: ${bpm}
- Time Signature: ${metadata.timeSignature}

SECTION TO IMPROVE:
- Time range: ${section.startTime}s to ${section.endTime}s
- Current events: ${section.eventCount}
- Current density: ${section.density.toFixed(2)} events/second

AVAILABLE TEMPLATES (reuse these shapes):
${templateNames.map(name => `- "${name}"`).join('\n')}

EXISTING EVENTS IN THIS SECTION:
${JSON.stringify(section.events, null, 2)}

🌟 CREATIVE DIRECTION - MAKE IT COMPELLING:
**STRONGLY ENCOURAGED:** Seek opportunities for:
- 🔮 **Kaleidoscopic Patterns**: Mirror symmetries, repeating motifs, fractal-like arrangements
- 📐 **Geometric Symmetry**: Balanced compositions, radial patterns, tessellations
- 🎪 **Composite Forms**: Use MULTIPLE ASCII art pieces positioned strategically to create:
  * Larger recognizable shapes (faces, buildings, creatures from smaller elements)
  * Abstract forms that emerge from the arrangement of individual pieces
  * Visual ideas and concepts built from constituent parts
  * Choreographed movements where objects collaborate to tell a story

**ALTERNATIVE:** If geometric/visual approaches don't inspire you:
- 📖 **Tell a Story**: Create a narrative arc through the choreography
  * Character journeys (objects with personality moving through scenes)
  * Emotional progressions (calm → tension → resolution)
  * Visual metaphors for the musical themes

**CRITICAL REQUIREMENT:**
⚡ This MUST be ACTIVE, ENGAGING, and INTERESTING
❌ AVOID: Static displays, boring linear movements, sparse uninspired positioning
✅ CREATE: Dynamic compositions, surprising transformations, rich visual density

YOUR TASK:
1. Keep ALL good existing events from this section
2. ADD new events to fill sparse gaps
3. Enhance boring events with better timing, transformations, movements
4. Use available template shapes creatively
5. Events MUST stay within ${section.startTime}s - ${section.endTime}s range
6. Maintain musical coherence with surrounding sections

OUTPUT: Array of timeline events for this section ONLY.
Format: [ {...event1}, {...event2}, ... ]
Each event must have: { trigger: {type: "time", at: <seconds>}, actions: [...] }
Make it MORE exciting, MORE detailed, MORE musically aligned.`;
}

/**
 * Merge improved section back into full timeline
 * @param {Array} fullTimeline - Complete timeline
 * @param {Array} improvedSectionEvents - Improved events for section
 * @param {number} startTime - Section start time
 * @param {number} endTime - Section end time
 * @returns {Array} Updated timeline with improved section
 */
function mergeSectionIntoTimeline(fullTimeline, improvedSectionEvents, startTime, endTime) {
  // Remove old events in this time range
  const beforeSection = fullTimeline.filter(event => {
    const eventTime = event.trigger?.at || 0;
    return eventTime < startTime;
  });

  const afterSection = fullTimeline.filter(event => {
    const eventTime = event.trigger?.at || 0;
    return eventTime >= endTime;
  });

  // Combine: before + improved + after
  return [...beforeSection, ...improvedSectionEvents, ...afterSection]
    .sort((a, b) => (a.trigger?.at || 0) - (b.trigger?.at || 0));
}

/**
 * Enrich sparse events by adding more actions
 * @param {Object} choreography - Full choreography object
 * @param {Array} sparseEvents - List of events needing more actions
 * @param {Object} metadata - Audio metadata
 * @param {Object} options - Command options
 */
async function enrichSparseEvents(choreography, sparseEvents, metadata, options) {
  const anthropic = getAnthropic();

  // Process up to 3 sparse events per iteration
  for (const sparseEvent of sparseEvents.slice(0, 3)) {
    const event = choreography.timeline[sparseEvent.index];
    const availableTemplates = Object.keys(choreography.templates?.objects || {}).join(', ');

    try {
      const { text } = await generateText({
        model: anthropic('claude-sonnet-4-5'),
        messages: [
          {
            role: 'system',
            content: `You are a choreography enrichment assistant. Your task is to add actions to sparse timeline events.

ACTION SCHEMA (use these exact structures):
- Spawn: { "type": "spawn", "objectId": "unique_id", "template": "template_name", "position": {"x": 960, "y": 540}, "delay": 0 }
- Move: { "type": "move", "target": "object_id", "x": 100, "y": 100, "duration": 1, "delay": 0 }
- Transform: { "type": "transform", "target": "object_id", "scale": 1.5, "rotation": 45, "duration": 1, "delay": 0 }
- Visual: { "type": "visual", "target": "object_id", "style": {"color": "cyan", "bold": true}, "delay": 0 }
- Destroy: { "type": "destroy", "target": "object_id", "delay": 0 }
- Background: { "type": "background", "mode": "static", "static": {"color": "#000000"}, "transition": {"duration": 1.0}, "delay": 0 }

🌟 CREATIVE DIRECTION - MAKE IT COMPELLING:
**STRONGLY ENCOURAGED:** Seek opportunities for:
- 🔮 Kaleidoscopic patterns: Mirror symmetries, repeating motifs
- 📐 Geometric symmetry: Balanced compositions, radial patterns
- 🎪 Composite forms: Multiple objects positioned to create larger shapes or ideas
- 📖 Storytelling: Actions that tell a narrative or create emotional progression

**CRITICAL:** Actions MUST be ACTIVE, ENGAGING, and INTERESTING
❌ AVOID: Static positioning, boring linear movements
✅ CREATE: Dynamic compositions, surprising transformations, rich visual density

GUIDELINES:
- Use "delay" parameter (0-2 seconds) to stagger actions within the event
- Create musically-appropriate, visually interesting actions
- Always return ONLY a JSON array of actions, no explanatory text`,
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } }
            }
          },
          {
            role: 'user',
            content: `Current event at ${event.trigger?.at}s:
${JSON.stringify(event, null, 2)}

Available templates: ${availableTemplates}

Add ${sparseEvent.needsMoreActions} action(s) to reach target of ${DENSITY_TARGETS.targetActionsPerEvent} actions per event.

Return JSON array of NEW actions only:`
          }
        ],
        temperature: 0.9,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const repairedJSON = repairJSONEscapes(jsonMatch[0]);
        const newActions = JSON.parse(repairedJSON);

        // Add new actions to the event
        if (Array.isArray(newActions) && newActions.length > 0) {
          event.actions = [...(event.actions || []), ...newActions];
        }
      } else {
        // SAVE INVALID OUTPUT
        const errorPath = path.join(options.output || './output', `enrich-error-${Date.now()}.txt`);
        await fs.writeFile(errorPath, `Event: ${event.trigger?.at}s\n\nLLM Response:\n${text}`);
        console.log(chalk.yellow(`   ⚠️  No JSON found, saved to: ${errorPath}`));
      }
    } catch (error) {
      // SAVE ERROR OUTPUT
      const errorPath = path.join(options.output || './output', `enrich-error-${Date.now()}.txt`);
      await fs.writeFile(errorPath, `Event: ${event.trigger?.at}s\n\nError: ${error.message}\n\nStack: ${error.stack}`);
      console.log(chalk.yellow(`   ⚠️  Failed to enrich event at ${event.trigger?.at}s: ${error.message}`));
      console.log(chalk.yellow(`   💾 Error saved to: ${errorPath}`));
    }
  }
}

/**
 * Fill large gaps in timeline by generating new events
 * @param {Object} choreography - Full choreography object
 * @param {Array} gaps - List of large gaps to fill
 * @param {Object} metadata - Audio metadata
 * @param {Object} options - Command options
 * @param {string} onsetCachePath - Path to onset cache
 */
async function fillTimelineGaps(choreography, gaps, metadata, options, onsetCachePath) {
  const anthropic = getAnthropic();
  const availableTemplates = Object.keys(choreography.templates?.objects || {}).join(', ');

  // Process up to 2 large gaps per iteration
  for (const gap of gaps.slice(0, 2)) {
    try {
      const { text } = await generateText({
        model: anthropic('claude-sonnet-4-5'),
        messages: [
          {
            role: 'system',
            content: `You are a choreography gap-filling assistant. Your task is to generate complete timeline events.

EVENT SCHEMA (use this exact structure):
{
  "label": "descriptive_label",
  "trigger": { "type": "time", "at": <timestamp_in_seconds> },
  "actions": [
    {
      "type": "spawn",
      "objectId": "obj_<unique_id>",
      "template": "<template_name>",
      "position": {"x": 960, "y": 540},
      "delay": 0
    },
    {
      "type": "move",
      "target": "obj_<same_id>",
      "movement": {
        "preset": "linear",
        "duration": 1,
        "easing": "easeInOut"
      },
      "delay": 0.5
    }
  ]
}

ACTION TYPES: spawn, move, transform, visual, destroy, background

🌟 CREATIVE DIRECTION - MAKE IT COMPELLING:
**STRONGLY ENCOURAGED:** Seek opportunities for:
- 🔮 Kaleidoscopic patterns: Mirror symmetries, repeating motifs
- 📐 Geometric symmetry: Balanced compositions, radial patterns
- 🎪 Composite forms: Multiple objects positioned to create larger shapes or ideas
- 📖 Storytelling: Events that tell a narrative or create emotional progression

**CRITICAL:** Events MUST be ACTIVE, ENGAGING, and INTERESTING
❌ AVOID: Static positioning, boring linear movements
✅ CREATE: Dynamic compositions, surprising transformations, rich visual density

GUIDELINES:
- Use "delay" to stagger actions (0-2 seconds)
- Each event should have ${Math.ceil(DENSITY_TARGETS.targetActionsPerEvent)} actions
- Create musically-appropriate, visually interesting events
- Return ONLY a JSON array of events, no explanatory text`,
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } }
            }
          },
          {
            role: 'user',
            content: `Fill gap: ${gap.start}s to ${gap.end}s (${gap.duration.toFixed(2)}s)
Available templates: ${availableTemplates}
Duration: ${metadata.duration}s

Generate 1-2 events with timestamps between ${gap.start} and ${gap.end}.

Return JSON array of events:`
          }
        ],
        temperature: 0.9,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const repairedJSON = repairJSONEscapes(jsonMatch[0]);
        const newEvents = JSON.parse(repairedJSON);

        // Add new events to timeline
        if (Array.isArray(newEvents) && newEvents.length > 0) {
          choreography.timeline.push(...newEvents);
          choreography.timeline.sort((a, b) => (a.trigger?.at || 0) - (b.trigger?.at || 0));
        }
      } else {
        // SAVE INVALID OUTPUT
        const errorPath = path.join(options.output || './output', `fill-gap-error-${Date.now()}.txt`);
        await fs.writeFile(errorPath, `Gap: ${gap.start}s-${gap.end}s\n\nLLM Response:\n${text}`);
        console.log(chalk.yellow(`   ⚠️  No JSON found, saved to: ${errorPath}`));
      }
    } catch (error) {
      // SAVE ERROR OUTPUT
      const errorPath = path.join(options.output || './output', `fill-gap-error-${Date.now()}.txt`);
      await fs.writeFile(errorPath, `Gap: ${gap.start}s-${gap.end}s\n\nError: ${error.message}\n\nStack: ${error.stack}`);
      console.log(chalk.yellow(`   ⚠️  Failed to fill gap ${gap.start}s-${gap.end}s: ${error.message}`));
      console.log(chalk.yellow(`   💾 Error saved to: ${errorPath}`));
    }
  }
}

/**
 * Add new ASCII art templates to increase diversity
 * @param {Object} choreography - Full choreography object
 * @param {number} count - Number of templates to add
 * @param {Object} metadata - Audio metadata
 * @param {Object} options - Command options
 */
async function addNewTemplates(choreography, count, metadata, options) {
  const anthropic = getAnthropic();
  const existingTemplates = Object.keys(choreography.templates?.objects || {});

  try {
    const { text } = await generateText({
      model: anthropic('claude-sonnet-4-5'),
      messages: [
        {
          role: 'system',
          content: `You are an ASCII art template generator for choreography visualizations.

TEMPLATE SCHEMA (use this exact structure):
{
  "template_name": {
    "art": ["line1", "line2", "line3"]
  }
}

GUIDELINES:
- Each template should have a unique descriptive name
- Templates should be 3-7 lines tall
- Use varied ASCII characters for visual interest
- Represent musical or abstract shapes
- Return ONLY a JSON object with templates, no explanatory text`,
          providerOptions: {
            anthropic: { cacheControl: { type: 'ephemeral' } }
          }
        },
        {
          role: 'user',
          content: `Existing templates (${existingTemplates.length}): ${existingTemplates.join(', ')}

Generate ${Math.min(count, 3)} NEW unique templates with names different from existing.

Return JSON object:`
        }
      ],
      temperature: 0.9,
    });

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const repairedJSON = repairJSONEscapes(jsonMatch[0]);
      const newTemplates = JSON.parse(repairedJSON);

      // Add new templates to choreography
      if (typeof newTemplates === 'object' && newTemplates !== null) {
        choreography.templates = choreography.templates || { objects: {} };
        choreography.templates.objects = {
          ...choreography.templates.objects,
          ...newTemplates
        };
      }
    } else {
      // SAVE INVALID OUTPUT
      const errorPath = path.join(options.output || './output', `add-templates-error-${Date.now()}.txt`);
      await fs.writeFile(errorPath, `Template count: ${count}\n\nLLM Response:\n${text}`);
      console.log(chalk.yellow(`   ⚠️  No JSON found, saved to: ${errorPath}`));
    }
  } catch (error) {
    // SAVE ERROR OUTPUT
    const errorPath = path.join(options.output || './output', `add-templates-error-${Date.now()}.txt`);
    await fs.writeFile(errorPath, `Template count: ${count}\n\nError: ${error.message}\n\nStack: ${error.stack}`);
    console.log(chalk.yellow(`   ⚠️  Failed to add templates: ${error.message}`));
    console.log(chalk.yellow(`   💾 Error saved to: ${errorPath}`));
  }
}

/**
 * Load description from file or use default
 * @param {Object} options - Options containing description or desc path
 * @returns {Promise<string>} The loaded or default description
 */
async function loadDescription(options) {
  let description = options.description || 'An experimental musical composition';
  const descPath = options.desc;

  if (descPath) {
    try {
      description = await fs.readFile(descPath, 'utf-8');
      console.log(chalk.green(`✓ Loaded description from ${descPath}`));
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Failed to read description file: ${error.message}`));
    }
  }

  return description;
}

/**
 * Load and parse metadata from ABC file or use defaults
 * @param {Object} options - Options containing abc path and verbose flag
 * @returns {Promise<Object>} Parsed metadata with duration and onsets
 */
async function loadAndParseMetadata(options) {
  if (!options.abc) {
    console.log(chalk.gray('No ABC file provided, using defaults\n'));
    return {
      title: "Generated Composition",
      tempo: 120,
      timeSignature: "4/4",
      measures: 32,
      beatsPerMeasure: 4,
      duration: 60,
      key: "C",
      onsets: []
    };
  }

  const abcPath = path.resolve(options.abc);
  console.log(chalk.gray(`Reading ABC file: ${abcPath}`));

  try {
    const abcContent = await fs.readFile(abcPath, 'utf-8');
    const metadata = parseABCMetadata(abcContent);

    // Get actual duration and onsets from WAV file
    const audioData = await getAudioMetadata(abcPath, { verbose: options.verbose });

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

    return metadata;
  } catch (error) {
    console.log(chalk.yellow(`⚠️  Could not read ABC file: ${error.message}`));
    console.log(chalk.yellow('   Using default metadata\n'));

    return {
      title: "Untitled",
      tempo: 120,
      timeSignature: "4/4",
      measures: 32,
      beatsPerMeasure: 4,
      duration: 60,
      key: "C",
      onsets: []
    };
  }
}

/**
 * Generate choreography JSON for audio visualization (v1.1 schema)
 * @param {Object} options - Command options
 * @param {string} options.description - Music description
 * @param {string} options.abc - Path to ABC notation file
 * @param {string} options.descriptionFile - Path to file containing description
 * @param {string} options.output - Output path for choreography JSON
 * @param {boolean} options.verbose - Show detailed progress
 */
export async function generateChoreographyNew(options) {
  try {
    console.log(chalk.cyan('🎭 Generating Choreography (Schema v1.1)...\n'));

    // Load description and metadata using helper functions
    const description = await loadDescription(options);
    const metadata = await loadAndParseMetadata(options);

    // Load ASCII art shapes
    let asciiShapes = [];
    const abcBasename = options.abc ?
      path.basename(options.abc, path.extname(options.abc)) :
      `composition-${Date.now()}`;

    const outputDir = path.resolve(options.output || './output');

    // Actually load the ASCII art from manager
    if (options.abc) {
      asciiShapes = asciiArtManager.getArtForAbc(abcBasename) || [];
      if (asciiShapes.length > 0) {
        console.log(chalk.green(`✓ Found ${asciiShapes.length} ASCII art shapes for this composition`));
      } else {
        console.log(chalk.yellow(`⚠️  No ASCII art found in library for: ${abcBasename}`));
        console.log(chalk.gray(`   Tip: Run 'node scripts/generate-ascii-for-abc.js ${options.abc}' to create custom ASCII art`));
      }
    }

    // Check for existing choreography versions
    const versionInfo = await detectLatestChoreographyVersion(abcBasename, outputDir);

    let prompt = '';
    let outputPath = '';
    let mode = '';
    let choreography;

    if (versionInfo.exists) {
      // SECTION-BASED IMPROVEMENT MODE
      try {
        const existingChoreography = await loadExistingChoreography(versionInfo.latestPath);
        const nextVersion = versionInfo.latestVersion + 1;

        mode = 'improvement';
        console.log(chalk.cyan(`📝 Found existing choreography v${versionInfo.latestVersion}`));
        console.log(chalk.cyan(`   Path: ${versionInfo.latestPath}`));
        console.log(chalk.cyan(`   Timeline events: ${existingChoreography.timeline?.length || 0}`));

        // PRIORITY 1: Check if background system is used
        const hasBackground = usesBackgroundSystem(existingChoreography);

        if (!hasBackground) {
          // Background system not used - add it FIRST before any density improvements
          console.log(chalk.yellow(`\n🎨 Background system not detected - adding background control...\n`));

          // Build background improvement prompt
          const backgroundPrompt = buildBackgroundImprovementPrompt(existingChoreography, description, metadata);

          if (options.verbose) {
            console.log(chalk.gray('Background improvement prompt preview:'));
            console.log(chalk.gray(backgroundPrompt.substring(0, 500) + '...\n'));
          }

          // Generate background events using direct text generation
          const myAnthropic = getAnthropic();
          const model = myAnthropic("claude-sonnet-4-5");

          console.log(chalk.yellow('Generating background control events...\n'));

          const { text } = await generateText({
            model,
            prompt: backgroundPrompt + "\n\nIMPORTANT: Return ONLY the JSON array of background events, no other text.",
            temperature: 0.7,
            maxTokens: 16000
          });

          // Parse background events from response
          const jsonMatch = text.match(/\[[\s\S]*\]/);
          if (!jsonMatch) {
            console.log(chalk.yellow('⚠️  Failed to extract JSON array from background response'));
            const debugPath = path.join(outputDir, `${abcBasename}-background-debug.txt`);
            await fs.writeFile(debugPath, text);
            console.log(chalk.yellow(`💾 Saved raw response to: ${debugPath}`));
            throw new Error('Failed to extract JSON array from background LLM response');
          }

          let backgroundEvents;
          let validBackgroundEvents = [];  // Declare before try block for wider scope
          try {
            const repairedJSON = repairJSONEscapes(jsonMatch[0]);
            backgroundEvents = JSON.parse(repairedJSON);

            if (!Array.isArray(backgroundEvents)) {
              throw new Error('Parsed JSON is not an array');
            }

            // Validate each event has trigger and actions, filter invalid events
            let invalidCount = 0;

            for (const event of backgroundEvents) {
              if (!event?.trigger || !event?.actions || !Array.isArray(event.actions)) {
                console.log(chalk.yellow(`⚠️  Invalid event structure (skipping): ${JSON.stringify(event).substring(0, 100)}`));
                invalidCount++;
              } else {
                validBackgroundEvents.push(event);
              }
            }

            const validCount = validBackgroundEvents.length;
            if (invalidCount > 0) {
              console.log(chalk.green(`✓ Generated ${validCount} valid background events (${invalidCount} invalid filtered)\n`));
            } else {
              console.log(chalk.green(`✓ Generated ${validCount} valid background events\n`));
            }
          } catch (parseError) {
            console.log(chalk.red(`❌ Failed to parse background events: ${parseError.message}`));
            const debugPath = path.join(outputDir, `${abcBasename}-background-invalid.json`);
            await fs.writeFile(debugPath, jsonMatch[0]);
            console.log(chalk.yellow(`💾 Saved invalid JSON to: ${debugPath}`));
            throw parseError;
          }

          // Merge only valid background events into timeline (sorted by time)
          const updatedTimeline = [...existingChoreography.timeline, ...validBackgroundEvents].sort((a, b) => {
            const timeA = a.trigger?.at || 0;
            const timeB = b.trigger?.at || 0;
            return timeA - timeB;
          });

          // Create next version with background system
          choreography = {
            ...existingChoreography,
            timeline: updatedTimeline
          };

          outputPath = path.join(outputDir, `${abcBasename}-choreography.v${nextVersion}.json`);

          console.log(chalk.green(`✓ Added background system to choreography`));
          console.log(chalk.cyan(`   Total events: ${choreography.timeline.length}`));
          console.log(chalk.cyan(`   Background events added: ${validBackgroundEvents.length}\n`));

          // Save and exit - background improvement takes priority over density improvements
          await fs.writeFile(outputPath, JSON.stringify(choreography, null, 2));
          console.log(chalk.green(`✅ Choreography saved: ${outputPath}\n`));
          console.log(chalk.cyan(`💡 Next run will improve section density\n`));
          return;
        }

        // Background system exists - proceed with density-based section improvement
        console.log(chalk.yellow(`\n🔄 Improving weakest section...\n`));

        // Find weakest section
        const section = findWeakestSection(
          existingChoreography.timeline,
          existingChoreography.metadata.duration,
          60 // 60 second sections
        );

        console.log(chalk.cyan(`📍 Target section: ${section.startTime}s - ${section.endTime}s`));
        console.log(chalk.cyan(`   Current events: ${section.eventCount}`));
        console.log(chalk.cyan(`   Density: ${section.density.toFixed(2)} events/sec\n`));

        // Build section improvement prompt
        const sectionPrompt = buildSectionImprovementPrompt(section, existingChoreography, description, metadata);

        if (options.verbose) {
          console.log(chalk.gray('Section improvement prompt preview:'));
          console.log(chalk.gray(sectionPrompt.substring(0, 500) + '...\n'));
        }

        // Generate improved section using direct text generation
        const myAnthropic = getAnthropic();
        const model = myAnthropic("claude-sonnet-4-5");

        console.log(chalk.yellow('Generating improved section events...\n'));

        const { text } = await generateText({
          model,
          prompt: sectionPrompt + "\n\nIMPORTANT: Return ONLY the JSON array of events, no other text.",
          temperature: 0.7,
          maxTokens: 32000
        });

        // Parse section events from response with comprehensive error handling
        const jsonMatch = text.match(/\[[\s\S]*\]/);
        if (!jsonMatch) {
          console.log(chalk.yellow('⚠️  Failed to extract JSON array from response'));
          // Save raw text for debugging
          const debugPath = path.join(outputDir, `${abcBasename}-section-debug.txt`);
          await fs.writeFile(debugPath, text);
          console.log(chalk.yellow(`💾 Saved raw response to: ${debugPath}`));
          throw new Error('Failed to extract JSON array from LLM response');
        }

        let improvedSectionEvents;
        try {
          const repairedJSON = repairJSONEscapes(jsonMatch[0]);
          improvedSectionEvents = JSON.parse(repairedJSON);

          // Validate it's actually an array
          if (!Array.isArray(improvedSectionEvents)) {
            throw new Error('Parsed JSON is not an array');
          }

          // Basic validation: each event should have trigger and actions
          let validCount = 0;
          for (const event of improvedSectionEvents) {
            if (!event.trigger || !event.actions) {
              console.log(chalk.yellow(`⚠️  Invalid event structure: ${JSON.stringify(event).substring(0, 100)}`));
            } else {
              validCount++;
            }
          }

          console.log(chalk.green(`✓ Generated ${validCount} valid improved events for section\n`));
        } catch (parseError) {
          console.log(chalk.red(`❌ Failed to parse section events: ${parseError.message}`));
          const debugPath = path.join(outputDir, `${abcBasename}-section-invalid.json`);
          await fs.writeFile(debugPath, jsonMatch[0]);
          console.log(chalk.yellow(`💾 Saved invalid JSON to: ${debugPath}`));
          throw parseError;
        }

        // Merge improved section back into full timeline
        const updatedTimeline = mergeSectionIntoTimeline(
          existingChoreography.timeline,
          improvedSectionEvents,
          section.startTime,
          section.endTime
        );

        // Create v2 choreography with updated timeline
        choreography = {
          ...existingChoreography,
          timeline: updatedTimeline
        };

        outputPath = path.join(outputDir, `${abcBasename}-choreography.v${nextVersion}.json`);

        console.log(chalk.green(`✓ Merged section into choreography`));
        console.log(chalk.cyan(`   Total events: ${choreography.timeline.length}\n`));

      } catch (error) {
        // Corrupted JSON or improvement error - fall back to initial generation
        if (error.message.startsWith('CORRUPTED_JSON')) {
          console.log(chalk.yellow('   Falling back to fresh generation...\n'));
          mode = 'initial';
          prompt = buildChoreographyPromptV1_1(description, metadata, asciiShapes);
          outputPath = path.join(outputDir, `${abcBasename}-choreography.v1.1.json`);

          // Generate new choreography
          const onsetCachePath = options.abc ?
            `${path.resolve(options.abc).replace(/\.abc$/i, '')}-onsets.json` :
            null;

          choreography = await generateChoreographyWithFallbacks(
            prompt,
            metadata,
            description,
            options,
            onsetCachePath,
            outputPath,
            asciiShapes
          );
        } else {
          throw error;
        }
      }
    } else {
      // INITIAL GENERATION MODE
      mode = 'initial';
      console.log(chalk.yellow('🎬 No existing choreography found - creating initial version...\n'));

      // Build choreography prompt
      const prompt = buildChoreographyPromptV1_1(description, metadata, asciiShapes);
      outputPath = path.join(outputDir, `${abcBasename}-choreography.v1.1.json`);

      // Generate using sequential expansion with fallbacks
      const onsetCachePath = options.abc ?
        `${path.resolve(options.abc).replace(/\.abc$/i, '')}-onsets.json` :
        null;

      choreography = await generateChoreographyWithFallbacks(
        prompt,
        metadata,
        description,
        options,
        onsetCachePath,
        outputPath,
        asciiShapes
      );
    }

    // Write choreography to file
    await fs.writeFile(outputPath, JSON.stringify(choreography, null, 2));
    console.log(chalk.green(`✅ Choreography saved: ${outputPath}\n`));

    // Optionally validate against schema
    if (options.validate) {
      console.log(chalk.cyan('🔍 Validating choreography against schema...\n'));
      try {
        const validation = validateChoreographySchema(choreography);
        if (validation.valid) {
          console.log(chalk.green('✓ Choreography schema valid\n'));
        } else {
          console.log(chalk.yellow('⚠️  Schema validation warnings:'));
          validation.errors.forEach(err => {
            console.log(chalk.yellow(`   - ${err.path}: ${err.message}`));
          });
          console.log('');
        }
      } catch (validationError) {
        console.log(chalk.red(`❌ Schema validation error: ${validationError.message}\n`));
      }
    }

    return choreography;

  } catch (error) {
    console.error(chalk.red(`\n❌ Error generating choreography: ${error.message}`));
    if (error.stack && options.verbose) {
      console.error(chalk.gray(error.stack));
    }
    process.exit(1);
  }
}
