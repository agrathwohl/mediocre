# Choreography Playback System

A modular, testable system for rendering choreographed ASCII art visualizations synchronized with audio playback.

## Architecture Overview

The playback system is organized into focused modules, each with a single responsibility:

```
src/playback/
├── data/           # Static data (ASCII art frames)
├── core/           # Foundation systems (colors, object pool)
├── physics/        # Physics simulation (collision, motion)
├── transformations/# Visual effects (scale, rotate, effects)
├── rendering/      # Screen rendering (patterns, objects, UI)
├── choreography/   # Event system (timeline, actions, triggers)
├── playlist/       # Playlist management
└── utils/          # Helper utilities
```

## Quick Start

```javascript
import AudioAnalyzer from "../utils/audio-analyzer.js";
import { ColorSystem, ObjectPool } from "./core/index.js";
import { RenderManager } from "./rendering/index.js";
import { ChoreographyManager } from "./choreography/index.js";

// Initialize systems
const audioAnalyzer = new AudioAnalyzer("music.wav");
const renderManager = new RenderManager(choreographySettings);
const choreographyManager = new ChoreographyManager(choreographyData, renderManager);

// Animation loop
function animate(elapsed, amplitude, velocity) {
  choreographyManager.processTimeline(elapsed, objectPool, amplitude, velocity);
  renderManager.render(amplitude, elapsed, showOSD);
}
```

## Core Modules

### ObjectPool

Manages the lifecycle of visual objects on screen.

```javascript
import { ObjectPool } from "./core/object-pool.js";

const pool = new ObjectPool(maxObjects = 50);

// Add an object
const id = pool.addObject({
  art: "ASCII art string",
  x: 40,
  y: 12,
  scale: 1.0,
  rotation: 0,
  color: "#ff0000",        // Template defaultColor (PHASE 1)
  bounds: { width, height }, // Template bounds (PHASE 2)
  physics: { mass, friction, elasticity }, // Template physics (PHASE 3)
  velocityX: 0,
  velocityY: 0,
  lifetime: 0
});

// Get all active objects
const objects = pool.getAllObjects();

// Remove specific object
pool.removeObject(id);

// Cleanup old objects
pool.cleanup(threshold = 10);
```

### ColorSystem

Generates and manages colors for visual objects.

```javascript
import { ColorSystem } from "./core/color-system.js";

const colors = new ColorSystem();

// Get vibrant color based on elapsed time
const ansiCode = colors.getVibrantColor(elapsedTime);

// Get complementary colors
const [primary, secondary] = colors.getComplementaryColor(elapsedTime);

// Convert HSL to ANSI escape code
const code = colors.hslToAnsi(hue, saturation, lightness);
```

## Physics Modules

### CollisionDetector

Implements AABB (Axis-Aligned Bounding Box) collision detection (PHASE 2).

```javascript
import { CollisionDetector } from "./physics/collision-detector.js";

const detector = new CollisionDetector();

// Check collision between two objects
const collision = detector.detectAABB(obj1, obj2);
// Returns: { collided: true, overlapX, overlapY } or { collided: false }

// Detect all collisions in object pool
const collisions = detector.detectCollisions(objects);

// Handle collision response
const response = detector.handleCollision(obj1, obj2, amplitude, velocity);
// Applies bounce effects based on audio amplitude and velocity
```

### PhysicsEngine

Manages mass, friction, and elasticity (PHASE 3).

```javascript
import { PhysicsEngine } from "./physics/physics-engine.js";

const physics = new PhysicsEngine();

// Apply friction to slow objects
physics.applyFriction(obj, deltaTime);

// Apply force considering mass
physics.applyMass(obj, forceVector);

// Calculate elastic collision response
physics.applyElasticity(obj1, obj2);

// Update all physics for frame
physics.updatePhysics(objects, deltaTime);
```

### MotionController

Handles velocity, acceleration, and motion patterns.

```javascript
import { MotionController } from "./physics/motion-controller.js";

const motion = new MotionController();

// Apply velocity to position
motion.applyVelocity(obj, deltaTime);

// Apply circular motion
motion.applyCircularMotion(obj, deltaTime);
// obj must have: centerX, centerY, orbitRadius, orbitSpeed

// Follow a path
motion.applyPathAnimation(obj, deltaTime);
// obj must have: path (array of points), pathIndex, pathProgress

// Apply acceleration
motion.applyAcceleration(obj, deltaTime);
// obj must have: accelerationX, accelerationY
```

## Transformation Modules

### Basic Transforms

Simple geometric transformations.

```javascript
import {
  scaleArt,
  rotateArt,
  mirrorArt,
  invertArt
} from "./transformations/basic-transforms.js";

// Scale ASCII art by factor
const scaled = scaleArt("█\n█", 2);
// Returns: "██\n██"

// Rotate art by angle (in radians)
const rotated = rotateArt(art, Math.PI / 4);

// Mirror horizontally
const mirrored = mirrorArt(art);

// Invert characters (solid ↔ empty)
const inverted = invertArt(art);
```

### Effect Transforms

Visual effects for dynamic animations.

```javascript
import {
  explodeArt,
  meltArt,
  glitchArt,
  shatterArt,
  pixelateArt,
  dissolveArt,
  corruptArt
} from "./transformations/effect-transforms.js";

// Explode art outward (progress: 0-1)
const exploded = explodeArt(art, progress);

// Melt art downward
const melted = meltArt(art, progress);

// Add glitch artifacts
const glitched = glitchArt(art);

// Break into shards
const shattered = shatterArt(art);

// Pixelate (reduce resolution)
const pixelated = pixelateArt(art);

// Fade characters randomly
const dissolved = dissolveArt(art);

// Corrupt random characters
const corrupted = corruptArt(art);
```

### Advanced Transforms

Complex visual effects.

```javascript
import {
  vortexArt,
  wormholeArt,
  singularityArt,
  plasmaArt,
  quantumArt,
  liquifyArt,
  crystallizeArt,
  electricArt,
  fractalArt
} from "./transformations/advanced-transforms.js";

// Spiral/vortex effect
const vortex = vortexArt(art);

// Tunnel/wormhole distortion
const wormhole = wormholeArt(art, progress);

// Implosion effect
const singularity = singularityArt(art, phase, progress);

// Plasma wave distortion
const plasma = plasmaArt(art, time);

// Quantum uncertainty effect
const quantum = quantumArt(art, phase);

// Liquid distortion
const liquid = liquifyArt(art, progress);

// Crystalline structure
const crystal = crystallizeArt(art);

// Electric spark effect
const electric = electricArt(art);

// Recursive fractal pattern
const fractal = fractalArt(art);
```

### ArtManipulator

Core art manipulation utilities.

```javascript
import { ArtManipulator } from "./transformations/art-manipulator.js";

const manipulator = new ArtManipulator();

// Transform art with scale and rotation
const transformed = manipulator.transformArt(art, scale, rotation);

// Check if position is on border of art
const isBorder = manipulator.isBorder(lines, y, x);

// Get art dimensions
const { width, height } = manipulator.getArtDimensions(art);

// Convert shape definition to ASCII art
const art = manipulator.convertShapeToArt(shapeDefinition);
```

## Rendering Modules

### PatternRenderer

Renders procedural background patterns.

```javascript
import { PatternRenderer } from "./rendering/pattern-renderer.js";

const patterns = new PatternRenderer();

// Render pattern at position
const char = patterns.renderProceduralPattern("noise", x, y, bgColor, fgColor);
const char = patterns.renderProceduralPattern("dots", x, y, bgColor, fgColor);
const char = patterns.renderProceduralPattern("grid", x, y, bgColor, fgColor);

// Get contrasting foreground color
const fgColor = patterns.getContrastFg(r, g, b);
```

### StatusRenderer

Renders UI elements and status information.

```javascript
import { StatusRenderer } from "./rendering/status-renderer.js";

const ui = new StatusRenderer();

// Render status bar
const statusBar = ui.renderStatusBar(amplitude, elapsed, terminalWidth);

// Render on-screen display
const osd = ui.renderOSD({
  trackName: "Song Title",
  currentTime: 120.5,
  duration: 240.0,
  objects: 15
});

// Create amplitude meter
const meter = ui.createGradientMeter(amplitude, width);
```

### ObjectRenderer

Renders individual visual objects.

```javascript
import { ObjectRenderer } from "./rendering/object-renderer.js";

const renderer = new ObjectRenderer();

// Render object to screen buffer
renderer.renderObject(obj, buffer, colorBuffer, colorSystem, artManipulator);

// Apply color effects based on audio
renderer.applyColorEffects(obj, screenX, screenY, elapsedTime);

// Determine border/interior colors
const color = renderer.determineObjectColor(obj, isBorder, borderColor, interiorColor);
```

### RenderManager

Coordinates all rendering operations.

```javascript
import { RenderManager } from "./rendering/render-manager.js";

const renderManager = new RenderManager(choreographySettings);

// Clear screen
renderManager.clear();

// Render complete frame
renderManager.render(amplitude, elapsedTime, showOSD);

// Background is handled by BackgroundManager (imported from utils)
```

## Choreography Modules

### TimelineProcessor

Processes timeline events at the right moments.

```javascript
import { TimelineProcessor } from "./choreography/timeline-processor.js";

const timeline = new TimelineProcessor(choreographyData.timeline);

// Process events for current time
const events = timeline.processEvents(
  currentTime,
  amplitude,
  velocity,
  (event) => { /* execute action */ }
);

// Check if event should execute
const shouldExecute = timeline.shouldExecuteEvent(event, currentTime);
```

### TriggerEvaluator

Evaluates trigger conditions (time, beat, audio, loop).

```javascript
import { TriggerEvaluator } from "./choreography/trigger-evaluator.js";

const triggers = new TriggerEvaluator();

// Check if trigger condition is met
const shouldTrigger = triggers.checkTrigger(
  trigger,
  currentTime,
  amplitude,
  velocity,
  metadata
);

// Specific trigger types
triggers.evaluateTimeTrigger(trigger, currentTime);     // { type: "time", at: 10.5 }
triggers.evaluateBeatTrigger(trigger, currentTime, bpm); // { type: "beat", beat: 4 }
triggers.evaluateAudioTrigger(trigger, amplitude, velocity); // { type: "audio", threshold: 0.5 }
triggers.evaluateLoopTrigger(trigger, currentTime, executedSet); // { type: "loop", interval: 5 }
```

### TemplateResolver

Resolves templates and movement presets.

```javascript
import { TemplateResolver } from "./choreography/template-resolver.js";

const templates = new TemplateResolver(choreographyData.templates);

// Get template by name
const template = templates.getTemplate("dancer_01");
// Returns: { art, defaultColor, bounds, physics, movement }

// Get movement preset
const movement = templates.getMovementPreset("bounce");
// Returns: { velocityX, velocityY, rotationSpeed, ... }

// Resolve position specification
const position = templates.resolvePosition(
  { x: "center", y: "top" },
  termWidth,
  termHeight,
  centroid
);
// Returns: { x: 40, y: 0 }
```

### ActionExecutor

Executes choreography actions.

```javascript
import { ActionExecutor } from "./choreography/action-executors.js";

const actions = new ActionExecutor();

// Spawn new object
actions.executeSpawn(action, objectPool, template, amplitude, velocity);

// Move existing object
actions.executeMove(action, objectPool);

// Apply transformation
actions.executeTransform(action, objectPool);

// Destroy object
actions.executeDestroy(action, objectPool);

// Apply visual effect
actions.executeVisual(action, objectPool);

// Arrange in formation
actions.executeFormation(action, objectPool);

// Map to audio feature
actions.executeAudioMap(action, objectPool);

// Change background
actions.executeBackground(action, backgroundManager);
```

### ChoreographyManager

Coordinates the entire choreography system.

```javascript
import { ChoreographyManager } from "./choreography/choreography-manager.js";

const manager = new ChoreographyManager(choreographyData, renderManager);

// Process timeline for current frame
manager.processTimeline(currentTime, objectPool, amplitude, velocity);

// Process background events
manager.processBackgroundEvents(currentTime);

// Get choreography info
const info = manager.getInfo();
// Returns: { eventCount, duration, templateCount, ... }
```

## Choreography JSON Schema

### Structure

```json
{
  "metadata": {
    "version": "1.1",
    "title": "Composition Name",
    "duration": 120,
    "bpm": 120,
    "timeSignature": "4/4",
    "fps": 30
  },
  "templates": {
    "object_name": {
      "art": "ASCII art string",
      "defaultColor": "#ff0000",
      "bounds": { "width": 10, "height": 5 },
      "physics": {
        "mass": 1.0,
        "friction": 0.8,
        "elasticity": 0.3
      },
      "movement": {
        "preset": "bounce",
        "velocityX": 0.5,
        "velocityY": -0.3
      }
    }
  },
  "timeline": [
    {
      "label": "Event description",
      "trigger": {
        "type": "time",
        "at": 10.5
      },
      "actions": [
        {
          "type": "spawn",
          "template": "object_name",
          "position": { "x": "center", "y": "center" },
          "count": 3
        }
      ]
    }
  ],
  "backgroundEvents": [
    {
      "label": "Background change",
      "trigger": { "type": "time", "at": 30 },
      "actions": [{
        "type": "background",
        "mode": "audio-reactive",
        "audioReactive": {
          "sensitivity": 2.5,
          "saturation": { "min": 50, "max": 90 }
        }
      }]
    }
  ],
  "settings": {
    "background": {
      "mode": "disabled"
    }
  }
}
```

### Trigger Types

**Time Trigger**
```json
{ "type": "time", "at": 10.5 }
```
Executes at exact timestamp (in seconds).

**Beat Trigger**
```json
{ "type": "beat", "beat": 16, "offset": 0 }
```
Executes at specific beat number.

**Audio Trigger**
```json
{ "type": "audio", "threshold": 0.7, "feature": "amplitude" }
```
Executes when audio feature exceeds threshold.

**Loop Trigger**
```json
{ "type": "loop", "interval": 5, "maxExecutions": 10 }
```
Executes repeatedly at interval (in seconds).

### Action Types

**Spawn**
```json
{
  "type": "spawn",
  "template": "object_name",
  "position": { "x": 40, "y": 12 },
  "count": 1,
  "scale": 1.0,
  "rotation": 0
}
```

**Move**
```json
{
  "type": "move",
  "target": "object_name",
  "to": { "x": 60, "y": 20 },
  "duration": 2.0,
  "easing": "ease-in-out"
}
```

**Transform**
```json
{
  "type": "transform",
  "target": "object_name",
  "effect": "explode",
  "duration": 1.5
}
```
Effects: `explode`, `melt`, `glitch`, `shatter`, `pixelate`, `dissolve`, `corrupt`, `vortex`, `wormhole`, `singularity`, `plasma`, `quantum`, `liquify`, `crystallize`, `electric`, `fractal`

**Destroy**
```json
{
  "type": "destroy",
  "target": "object_name",
  "effect": "fade"
}
```

**Visual**
```json
{
  "type": "visual",
  "target": "object_name",
  "property": "color",
  "value": "#00ff00"
}
```

**Formation**
```json
{
  "type": "formation",
  "template": "object_name",
  "layout": "grid",
  "rows": 3,
  "cols": 3
}
```

**Audio Map**
```json
{
  "type": "audioMap",
  "target": "object_name",
  "property": "scale",
  "feature": "amplitude",
  "min": 0.5,
  "max": 2.0
}
```

**Background**
```json
{
  "type": "background",
  "mode": "static",
  "static": {
    "color": "#0a0a1a",
    "pattern": "dots"
  }
}
```
Modes: `static`, `audio-reactive`
Patterns: `solid`, `dots`, `grid`, `noise`

## Position Specifications

Positions can be specified in multiple ways:

**Absolute coordinates**
```json
{ "x": 40, "y": 12 }
```

**Relative keywords**
```json
{ "x": "center", "y": "top" }        // Center top
{ "x": "left", "y": "middle" }       // Left middle
{ "x": "right", "y": "bottom" }      // Right bottom
{ "x": "center", "y": "center" }     // Center
```

**Random positions**
```json
{ "x": "random", "y": "random" }
```

**Audio-reactive positions**
```json
{ "x": "beat", "y": "amplitude" }    // X based on beat, Y on amplitude
```

## Data Flow

```
Audio File → AudioAnalyzer → amplitude, velocity
                                    ↓
Choreography JSON → ChoreographyManager → TimelineProcessor
                                    ↓
                              TriggerEvaluator
                                    ↓
                              ActionExecutor → ObjectPool
                                    ↓
                              PhysicsEngine (PHASE 3)
                              CollisionDetector (PHASE 2)
                              MotionController
                                    ↓
                              RenderManager → Screen Output
```

## Utility Modules

### PlaylistController

Manages playback of multiple tracks.

```javascript
import { PlaylistController } from "./playlist/playlist-controller.js";

const playlist = new PlaylistController("playlist.txt");
await playlist.loadPlaylist();

// Get current track
const track = playlist.getCurrentTrack();
// Returns: { audioFile, choreographyFile }

// Advance to next track
playlist.playNext();

// Check if more tracks exist
if (playlist.hasNext()) { }
```

### ChoreographyLogger

Logs choreography preview information.

```javascript
import { logChoreographyPreview } from "./utils/choreography-logger.js";

logChoreographyPreview(choreographyManager);
// Outputs: Event count, templates, duration, etc.
```

### PlaylistParser

Parses playlist file format.

```javascript
import { parsePlaylist } from "./utils/playlist-parser.js";

const tracks = parsePlaylist("playlist.txt");
// Returns: [{ audioFile, choreographyFile }, ...]
```

## Error Handling

All modules throw descriptive errors for invalid inputs:

```javascript
try {
  const obj = pool.addObject(invalidConfig);
} catch (error) {
  // "Invalid object config: missing required field 'art'"
}
```

## Performance Considerations

- **ObjectPool.MAX_OBJECTS**: Limit to prevent memory issues (default: 50)
- **RenderManager**: Double-buffered screen output for smooth rendering
- **PhysicsEngine**: Only updates objects with physics enabled
- **CollisionDetector**: Spatial hashing for large object counts

## Testing

Each module is designed to be testable in isolation:

```javascript
// Example: Test transformation function
import { scaleArt } from "./transformations/basic-transforms.js";

const input = "█\n█";
const output = scaleArt(input, 2);
assert.equal(output, "██\n██");
```

## Migration from v1.0 to v1.1

See `scripts/migrate-to-v1.1.js` for automated migration:

```bash
node scripts/migrate-to-v1.1.js --dry-run  # Preview changes
node scripts/migrate-to-v1.1.js --backup   # Migrate with backups
```

New in v1.1:
- **PHASE 1**: Template `defaultColor` support
- **PHASE 2**: Bounds-based AABB collision detection
- **PHASE 3**: Physics simulation (mass, friction, elasticity)
- **backgroundEvents**: Timeline-based background transitions

## Examples

### Basic Choreography

```javascript
import { ChoreographyManager } from "./choreography/index.js";

const choreography = {
  metadata: { version: "1.1", duration: 60 },
  templates: {
    star: {
      art: "☆",
      defaultColor: "#ffff00"
    }
  },
  timeline: [
    {
      trigger: { type: "time", at: 0 },
      actions: [{
        type: "spawn",
        template: "star",
        position: { x: "center", y: "center" }
      }]
    }
  ]
};

const manager = new ChoreographyManager(choreography, renderManager);
```

### Audio-Reactive Objects

```javascript
{
  "templates": {
    "pulse": {
      "art": "●",
      "physics": { "mass": 0.5, "elasticity": 0.8 }
    }
  },
  "timeline": [
    {
      "trigger": { "type": "audio", "threshold": 0.6 },
      "actions": [{
        "type": "spawn",
        "template": "pulse",
        "position": { "x": "random", "y": "random" }
      }]
    }
  ]
}
```

### Complex Formation

```javascript
{
  "trigger": { "type": "time", "at": 30 },
  "actions": [{
    "type": "formation",
    "template": "dancer",
    "layout": "grid",
    "rows": 3,
    "cols": 4,
    "spacing": 5
  }]
}
```

---

## License

MIT - Part of the mediocre-music project.
