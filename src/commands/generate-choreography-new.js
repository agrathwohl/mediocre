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
async function generateChoreographyWithFallbacks(prompt, metadata, description, options, onsetCachePath, outputPath) {
  let choreography = null;
  let rawTextOutput = null;
  const ChoreographySchema = buildChoreographySchemaV1_1();

  // Get the model
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-7-sonnet-20250219");

  // Note: Onset data included directly in prompt (see buildChoreographyPromptV1_1)
  // Tool-based onset queries disabled - onset times embedded for reliability

  // Strategy 1: Try structured generation
  if (options.verbose) {
    console.log(chalk.gray('Attempting structured generation for v1.1...'));
  }

  try {
    const result = streamText({
      model,
      output: Output.object({ schema: ChoreographySchema }),
      prompt,
      temperature: 0.7,
      maxTokens: 64000
      // Tools disabled - onset data included directly in prompt instead
    });

    console.log(chalk.cyan('\nGenerating v1.1 choreography...\n'));

    // Capture raw text first (for recovery if parsing fails)
    rawTextOutput = await result.text;
    console.log(chalk.gray(`Raw text length: ${rawTextOutput.length} chars`));

    // Now try to get the structured output
    choreography = await result.output;
    console.log(chalk.cyan(`📦 result.output returned: ${choreography ? 'object' : 'null/undefined'}`));
    if (choreography) {
      console.log(chalk.gray(`   - Has metadata: ${!!choreography.metadata}`));
      console.log(chalk.gray(`   - Has templates: ${!!choreography.templates}`));
      console.log(chalk.gray(`   - Has timeline: ${!!choreography.timeline}`));
      console.log(chalk.gray(`   - Timeline length: ${choreography.timeline?.length || 0}`));
      console.log(chalk.gray(`   - Keys: ${Object.keys(choreography).join(', ')}`));
    }

    if (choreography && choreography.timeline && choreography.timeline.length > 0) {
      console.log(chalk.green(`✓ Generated v1.1 choreography with ${choreography.timeline.length} timeline events`));
    } else {
      console.log(chalk.yellow(`⚠️ Choreography exists but timeline is empty/missing`));
    }
  } catch (error) {
    console.log(chalk.red(`🔥 CATCH BLOCK HIT - Error type: ${error.constructor.name}`));
    console.log(chalk.red('\n❌ Structured generation error:'));
    console.log(chalk.red(error.message));

    // Handle NoObjectGeneratedError with full SDK error properties
    if (error instanceof NoObjectGeneratedError) {
      console.log(chalk.yellow('\n📋 NoObjectGeneratedError Details:'));
      console.log(chalk.gray(`  Text: ${error.text?.length || 0} chars`));
      console.log(chalk.gray(`  Cause: ${error.cause?.message || 'Unknown'}`));
      console.log(chalk.gray(`  Finish Reason: ${error.finishReason || 'N/A'}`));

      if (error.response) {
        console.log(chalk.gray(`  Response ID: ${error.response.id || 'N/A'}`));
        console.log(chalk.gray(`  Model: ${error.response.modelId || 'N/A'}`));
        console.log(chalk.gray(`  Timestamp: ${error.response.timestamp || 'N/A'}`));
      }

      if (error.usage) {
        console.log(chalk.gray(`  Usage: ${error.usage.promptTokens || 0} prompt + ${error.usage.completionTokens || 0} completion = ${error.usage.totalTokens || 0} total tokens`));
      }

      // Extract text from the error object
      rawTextOutput = error.text || null;
    }

    if (options.verbose && error.stack) {
      console.log(chalk.gray(error.stack));
    }

    // Save raw output even on error
    if (rawTextOutput) {
      const recoveryPath = outputPath.replace('.json', '-recovery-raw.txt');
      await fs.writeFile(recoveryPath, rawTextOutput);
      console.log(chalk.yellow(`💾 Saved failed output to: ${recoveryPath}`));

      // Try to repair and parse the JSON from raw output
      console.log(chalk.yellow('🔧 Attempting to repair JSON from raw output...'));
      try {
        const jsonMatch = rawTextOutput.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          let jsonText = repairJSONEscapes(jsonMatch[0]);
          const parsed = JSON.parse(jsonText);

          // Post-process templates if string
          const templateResult = parseTemplatesField(parsed);
          if (!templateResult.success) {
            console.log(chalk.yellow(`⚠️  Failed to parse templates: ${templateResult.error}`));
          } else if (parsed.templates && typeof parsed.templates === 'object') {
            console.log(chalk.green('✓ Successfully parsed templates'));
          }

          const validated = ChoreographySchema.safeParse(templateResult.choreography);
          if (validated.success) {
            choreography = validated.data;
            console.log(chalk.green('✓ Successfully repaired and validated JSON!'));
          } else {
            console.log(chalk.yellow('⚠️  Repaired JSON but validation failed'));
            // Save repaired JSON for inspection
            const repairedPath = outputPath.replace('.json', '-recovery-repaired.json');
            await fs.writeFile(repairedPath, JSON.stringify(templateResult.choreography, null, 2));
            console.log(chalk.yellow(`💾 Saved repaired JSON to: ${repairedPath}`));
          }
        }
      } catch (repairError) {
        console.log(chalk.yellow(`⚠️  JSON repair failed: ${repairError.message}`));
      }
    }
  }

  // Strategy 2: Try text generation
  if (!choreography) {
    console.log(chalk.yellow('🔄 Strategy 1 failed - trying Strategy 2 (text generation)...'));
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

      rawTextOutput = text;

      // ALWAYS SAVE RAW OUTPUT
      const recoveryPath = outputPath.replace('.json', '-recovery-text.txt');
      await fs.writeFile(recoveryPath, rawTextOutput);
      console.log(chalk.gray(`💾 Saved raw text to: ${recoveryPath}`));

      // Log cache stats if available
      if (providerMetadata?.anthropic?.cacheCreationInputTokens) {
        console.log(`  📦 Cache created: ${providerMetadata.anthropic.cacheCreationInputTokens} tokens`);
      }
      if (providerMetadata?.anthropic?.cacheReadInputTokens) {
        console.log(`  ♻️  Cache hit: ${providerMetadata.anthropic.cacheReadInputTokens} tokens`);
      }

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        let jsonText = repairJSONEscapes(jsonMatch[0]);

        try {
          const parsed = JSON.parse(jsonText);

          // Post-process: If templates is a string, parse it
          const templateResult = parseTemplatesField(parsed);
          if (!templateResult.success) {
            console.log(chalk.yellow(`⚠️  Failed to parse templates: ${templateResult.error}`));
          } else if (parsed.templates && typeof parsed.templates === 'object') {
            console.log(chalk.green('✓ Successfully parsed templates'));
          }

          const validated = ChoreographySchema.safeParse(templateResult.choreography);
          if (validated.success) {
            choreography = validated.data;
            console.log(chalk.green('✓ Text generation with extraction successful'));
          } else {
            console.log(chalk.yellow('⚠️  Validation errors:'));
            validated.error.issues.forEach((issue, idx) => {
              console.log(chalk.gray(`  ${idx + 1}. ${issue.path.join('.')} - ${issue.message}`));
            });

            // Save the parsed but invalid JSON for manual recovery
            const parsedPath = outputPath.replace('.json', '-recovery-parsed.json');
            await fs.writeFile(parsedPath, JSON.stringify(templateResult.choreography, null, 2));
            console.log(chalk.yellow(`💾 Saved parsed (invalid) JSON to: ${parsedPath}`));

            if (options.verbose) {
              console.log(chalk.gray('\nFull error details:'));
              console.log(chalk.gray(JSON.stringify(validated.error.issues, null, 2)));
            }
          }
        } catch (parseError) {
          console.log(chalk.red(`❌ JSON parse error: ${parseError.message}`));

          // Save the extracted JSON text for manual inspection
          const extractedPath = outputPath.replace('.json', '-recovery-extracted.json');
          await fs.writeFile(extractedPath, jsonText);
          console.log(chalk.yellow(`💾 Saved extracted JSON to: ${extractedPath}`));
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
  console.log(chalk.cyan(`🏁 Final choreography check: ${choreography ? 'exists' : 'NULL'}`));
  if (!choreography) {
    console.error(chalk.red('❌ FATAL: AI generation failed completely'));
    console.error(chalk.red('   No fallback allowed - choreography must use ASCII art from library'));
    console.error(chalk.yellow('   Check recovery files for manual repair'));
    throw new Error('Cannot generate choreography without successful AI generation');
  }

  // Ensure duration matches and version is correct
  if (choreography.metadata.duration !== metadata.duration) {
    choreography.metadata.duration = metadata.duration;
  }
  choreography.metadata.version = "1.1";

  return choreography;
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
        model: anthropic('claude-3-7-sonnet-20250219'),
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
        model: anthropic('claude-3-7-sonnet-20250219'),
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

ACTION TYPES: spawn, move, transform, visual, destroy
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
      model: anthropic('claude-3-7-sonnet-20250219'),
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
      const model = myAnthropic("claude-3-7-sonnet-20250219");

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
          outputPath
        );
      } else {
        // Unexpected error - rethrow
        throw error;
      }
    }
  } else {
    // No existing valid choreography found
    console.log(chalk.cyan('📝 No existing choreography found\n'));

    // CHECK FOR RECOVERY FILES
    const recoveryFiles = [
      path.join(outputDir, `${abcBasename}-choreography.v1.1-recovery-raw.txt`),
      path.join(outputDir, `${abcBasename}-choreography.v1.1-recovery-text.txt`),
      path.join(outputDir, `${abcBasename}-choreography.v1.1-recovery-extracted.json`)
    ];

    let recoveryFileToUse = null;
    for (const recoveryPath of recoveryFiles) {
      try {
        await fs.access(recoveryPath);
        const stats = await fs.stat(recoveryPath);
        if (!recoveryFileToUse || stats.mtime > recoveryFileToUse.mtime) {
          recoveryFileToUse = { path: recoveryPath, mtime: stats.mtime };
        }
      } catch (error) {
        // File doesn't exist, continue
      }
    }

    if (recoveryFileToUse) {
      // RECOVERY MODE - FIX INVALID JSON FROM PREVIOUS FAILURE
      mode = 'recovery';
      const ageMinutes = Math.round((Date.now() - recoveryFileToUse.mtime.getTime()) / 1000 / 60);
      console.log(chalk.yellow(`⚠️  RECOVERY MODE: Found failed output from ${ageMinutes} minute(s) ago\n`));
      console.log(chalk.cyan(`Loading: ${path.basename(recoveryFileToUse.path)}\n`));

      let rawContent;
      try {
        rawContent = await fs.readFile(recoveryFileToUse.path, 'utf-8');
        console.log(chalk.green(`✓ Loaded ${(rawContent.length / 1024).toFixed(1)} KB of raw output\n`));
      } catch (error) {
        console.error(chalk.red(`❌ Failed to read recovery file: ${error.message}\n`));
        throw error;
      }

      // Use LLM to repair the invalid JSON
      console.log(chalk.cyan('🔧 Using LLM to repair invalid JSON...\n'));

      const myAnthropic = getAnthropic();
      const model = myAnthropic("claude-3-7-sonnet-20250219");
      const ChoreographySchema = buildChoreographySchemaV1_1();

      const repairPrompt = `You are a JSON repair specialist. Fix this invalid choreography JSON that has control character errors.

CRITICAL RULES:
1. Fix ALL control characters in string literals (newlines, tabs, etc.) by escaping them properly
2. Ensure all strings use proper escape sequences: \\n for newline, \\t for tab, \\\\ for backslash
3. Fix any malformed JSON structure (missing commas, brackets, quotes)
4. Preserve ALL data - do not remove or truncate any content
5. Return ONLY the valid JSON - no explanations, no markdown code blocks

Common issues to fix:
- Unescaped newlines in strings → Replace with \\n
- Unescaped tabs in strings → Replace with \\t
- Unescaped quotes in strings → Replace with \\"
- Control characters (ASCII 0-31) → Remove or escape appropriately
- Missing commas between array/object elements
- Trailing commas before closing brackets
- Unclosed strings, arrays, or objects

INVALID JSON:
${rawContent}

Return the repaired, valid JSON immediately.`;

      const { text: repairedText } = await generateText({
        model,
        prompt: repairPrompt,
        temperature: 0.1,
        maxTokens: 50000
      });

      let repairedJson = repairedText.trim();

      // Remove markdown code blocks if present
      if (repairedJson.startsWith('```json')) {
        repairedJson = repairedJson.replace(/```json\n?/g, '').replace(/```\n?$/g, '');
      } else if (repairedJson.startsWith('```')) {
        repairedJson = repairedJson.replace(/```\n?/g, '');
      }

      // Try to parse and validate
      try {
        console.log(chalk.cyan('🔍 Parsing repaired JSON...\n'));
        const parsed = JSON.parse(repairedJson);

        console.log(chalk.cyan('🔍 Validating against choreography schema...\n'));
        choreography = ChoreographySchema.parse(parsed);

        console.log(chalk.green('✅ JSON repaired and validated successfully!\n'));

        // Save the repaired version
        outputPath = path.join(outputDir, `${abcBasename}-choreography.v1.1.json`);
        await fs.writeFile(outputPath, JSON.stringify(choreography, null, 2));
        console.log(chalk.green(`✅ Saved repaired choreography to: ${path.basename(outputPath)}\n`));

        // Also save the raw repaired JSON for reference
        const repairedRawPath = path.join(outputDir, `${abcBasename}-choreography.v1.1-REPAIRED.json`);
        await fs.writeFile(repairedRawPath, repairedJson);
        console.log(chalk.gray(`   Also saved raw repaired JSON to: ${path.basename(repairedRawPath)}\n`));

        console.log(chalk.yellow('⚠️  Recovery files kept for your reference\n'));

      } catch (error) {
        console.error(chalk.red(`❌ Recovery failed: ${error.message}\n`));
        console.log(chalk.yellow('Falling back to initial generation...\n'));

        // Fall back to initial generation
        mode = 'initial';
        prompt = buildChoreographyPromptV1_1(description, metadata, asciiShapes);
        outputPath = path.join(outputDir, `${abcBasename}-choreography.v1.1.json`);

        choreography = await generateChoreographyWithFallbacks(
          prompt,
          metadata,
          description,
          options,
          null,
          outputPath
        );
      }

    } else {
      // INITIAL GENERATION MODE - No recovery files found
      mode = 'initial';
      console.log(chalk.yellow('✨ Generating NEW choreography v1.1...\n'));

      // Build initial prompt
      prompt = buildChoreographyPromptV1_1(description, metadata, asciiShapes);
      outputPath = path.join(outputDir, `${abcBasename}-choreography.v1.1.json`);

      if (options.verbose) {
        console.log(chalk.gray('Initial prompt preview:'));
        console.log(chalk.gray(prompt.substring(0, 500) + '...\n'));
      }

      // Generate choreography for initial mode
      choreography = await generateChoreographyWithFallbacks(
        prompt,
        metadata,
        description,
        options,
        null, // onsetCachePath not needed here
        outputPath
      );
    }
  }

  // Get onset cache path for sequential expansion (outside the else block)
  const onsetCachePath = options.abc ?
    `${path.resolve(options.abc).replace(/\.abc$/i, '')}-onsets.json` :
    null;

  // Sequential expansion mode: iteratively improve choreography density
  if (options.sequential && mode === 'initial') {
    console.log(chalk.cyan('\n🔄 Sequential expansion mode enabled'));
    console.log(chalk.gray(`Target: ${DENSITY_TARGETS.targetEventsPerSecond} events/s, ${DENSITY_TARGETS.targetActionsPerSecond} actions/s\n`));

    let iteration = 0;
    const maxIterations = 5;
    let lastDensityScore = 0;
    let stagnationCount = 0;
    const stagnationThreshold = 2;

    while (iteration < maxIterations) {
      // Evaluate current density
      const evaluation = evaluateChoreographyDensity(choreography);

      // Check for stagnation (no improvement)
      if (iteration > 0 && Math.abs(evaluation.scores.densityScore - lastDensityScore) < 0.01) {
        stagnationCount++;
        console.log(chalk.yellow(`   ⚠️  No improvement detected (stagnation: ${stagnationCount}/${stagnationThreshold})`));

        if (stagnationCount >= stagnationThreshold) {
          console.log(chalk.yellow(`\n⚠️  No improvement after ${stagnationThreshold} iterations, stopping expansion`));
          break;
        }
      } else {
        stagnationCount = 0;
      }

      lastDensityScore = evaluation.scores.densityScore;

      console.log(chalk.cyan(`\n📊 Iteration ${iteration + 1} - Current Density:`));
      console.log(chalk.gray(`   Events/second: ${evaluation.metrics.eventsPerSecond.toFixed(3)} (target: ${DENSITY_TARGETS.targetEventsPerSecond})`));
      console.log(chalk.gray(`   Actions/second: ${evaluation.metrics.actionsPerSecond.toFixed(3)} (target: ${DENSITY_TARGETS.targetActionsPerSecond})`));
      console.log(chalk.gray(`   Actions/event: ${evaluation.metrics.actionsPerEvent.toFixed(2)} (target: ${DENSITY_TARGETS.targetActionsPerEvent})`));
      console.log(chalk.gray(`   Templates: ${evaluation.metrics.templateCount} (target: ${DENSITY_TARGETS.targetTemplates})`));
      console.log(chalk.gray(`   Density score: ${(evaluation.scores.densityScore * 100).toFixed(1)}% (target: ${DENSITY_TARGETS.minDensityScore * 100}%)`));

      // Check if target met
      if (evaluation.meetsTarget) {
        console.log(chalk.green(`\n✅ Density target achieved after ${iteration} improvement${iteration !== 1 ? 's' : ''}!`));
        break;
      }

      // Generate improvement strategy
      const strategy = generateImprovementStrategy(evaluation, choreography);

      if (strategy.actions.length === 0) {
        console.log(chalk.yellow('\n⚠️  No improvement actions identified, stopping expansion'));
        break;
      }

      console.log(chalk.cyan(`\n🎯 Improvement strategy: ${strategy.priority.join(' → ')}`));

      // Apply improvements based on strategy
      for (const action of strategy.actions) {
        if (action.type === 'enrich_events') {
          console.log(chalk.gray(`\n   Enriching ${action.targetCount} sparse events...`));
          await enrichSparseEvents(choreography, action.sparseEvents, metadata, options);
        } else if (action.type === 'fill_gaps') {
          console.log(chalk.gray(`\n   Filling ${action.targetCount} large gaps...`));
          await fillTimelineGaps(choreography, action.gaps, metadata, options, onsetCachePath);
        } else if (action.type === 'add_templates') {
          console.log(chalk.gray(`\n   Adding ${action.needsMore} new templates...`));
          await addNewTemplates(choreography, action.needsMore, metadata, options);
        }
      }

      // SAVE OUTPUT AFTER EVERY ITERATION
      const iterationOutputPath = outputPath.replace('.json', `-iter${iteration + 1}.json`);
      try {
        await fs.writeFile(iterationOutputPath, JSON.stringify(choreography, null, 2));
        console.log(chalk.green(`\n💾 Saved iteration ${iteration + 1} to: ${iterationOutputPath}`));
      } catch (saveError) {
        console.log(chalk.yellow(`⚠️  Failed to save iteration ${iteration + 1}: ${saveError.message}`));
      }

      iteration++;
    }

    if (iteration === maxIterations) {
      console.log(chalk.yellow(`\n⚠️  Reached maximum iterations (${maxIterations}), stopping expansion`));
    }

    // Final evaluation
    const finalEvaluation = evaluateChoreographyDensity(choreography);
    console.log(chalk.cyan(`\n📊 Final Density:`));
    console.log(chalk.gray(`   Events/second: ${finalEvaluation.metrics.eventsPerSecond.toFixed(3)}`));
    console.log(chalk.gray(`   Actions/second: ${finalEvaluation.metrics.actionsPerSecond.toFixed(3)}`));
    console.log(chalk.gray(`   Actions/event: ${finalEvaluation.metrics.actionsPerEvent.toFixed(2)}`));
    console.log(chalk.gray(`   Density score: ${(finalEvaluation.scores.densityScore * 100).toFixed(1)}%`));
  }

  // ALWAYS save output - try primary path first, fallback to recovery if it fails
  let finalPath = outputPath;
  try {
    await fs.writeFile(outputPath, JSON.stringify(choreography, null, 2));
    console.log(chalk.green(`\n✅ Choreography saved to: ${outputPath}`));
  } catch (writeError) {
    // Primary write failed - save to recovery location
    const recoveryPath = outputPath.replace('.json', '-final-recovery.json');
    console.log(chalk.yellow(`\n⚠️  Failed to write to primary path: ${writeError.message}`));
    console.log(chalk.yellow(`   Saving to recovery location: ${recoveryPath}`));

    try {
      await fs.writeFile(recoveryPath, JSON.stringify(choreography, null, 2));
      finalPath = recoveryPath;
      console.log(chalk.green(`✅ Choreography saved to recovery path: ${recoveryPath}`));
    } catch (recoveryError) {
      // Even recovery failed - dump to stdout as last resort
      console.log(chalk.red(`\n❌ Failed to write to recovery path: ${recoveryError.message}`));
      console.log(chalk.yellow(`\n📋 CHOREOGRAPHY JSON (copy manually):`));
      console.log(JSON.stringify(choreography, null, 2));
      throw new Error(`Failed to save choreography: ${writeError.message}`);
    }
  }

  console.log(chalk.cyan(`   Mode: ${mode === 'improvement' ? 'Iterative improvement' : 'Initial generation'}`));
  console.log(chalk.cyan(`   Timeline events: ${choreography.timeline.length}`));
  console.log(chalk.cyan(`   Duration: ${choreography.metadata.duration}s`));
  console.log(chalk.cyan(`   Schema version: ${choreography.metadata.version}`));
  if (choreography.scenes) {
    console.log(chalk.cyan(`   Scenes: ${choreography.scenes.length}`));
  }
  if (choreography.threads) {
    console.log(chalk.cyan(`   Threads: ${choreography.threads.length}`));
  }
  console.log();

  return finalPath;
}
