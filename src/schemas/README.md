# ASCII Choreography Schema

## Overview

The ASCII Choreography Schema provides a comprehensive JSON-based system for choreographing ASCII art objects during audio playback. It integrates with the existing visualization system to provide precise control over object behavior, movement, and audio-reactive properties.

## Key Features

### 1. Multiple Timing Systems
- **Absolute Time**: Trigger events at specific timestamps
- **Beat-Based**: Sync to musical beats and measures
- **Audio-Reactive**: Respond to amplitude, velocity, or frequency changes
- **Loop-Based**: Repeat actions at regular intervals

### 2. Flexible Movement System
- **Preset Patterns**: Built-in patterns like bounce, circle, wave
- **Custom Paths**: Define keyframe-based movement paths
- **Physics-Based**: Velocity and acceleration-driven motion
- **Formation Patterns**: Coordinate multiple objects in formations

### 3. Audio Integration
- Map audio properties (amplitude, frequency) to visual properties
- Detect velocity spikes and drops
- Frequency band analysis for bass/mid/treble visualization
- Smoothing and range mapping for natural motion

### 4. Visual Effects
- All collision transformation effects (EXPLODE, SHATTER, MELT, etc.)
- Color, scale, and rotation control
- Glow and blur effects
- Layer/z-order management

### 5. Object Management
- Template system for reusable object definitions
- Track system for organizing objects into layers
- Dynamic spawning and destruction
- Group operations on multiple objects

## Schema Structure

### Core Components

```json
{
  "metadata": {},      // Choreography info (name, BPM, duration)
  "settings": {},      // Global settings (audio reactivity, collision behavior)
  "templates": {},     // Reusable object and effect definitions
  "tracks": [],        // Parallel tracks for layering
  "timeline": [],      // Main choreography events
  "scenes": []         // Named scene definitions
}
```

### Timeline Events

Each timeline event has a trigger and actions:

```json
{
  "trigger": {
    "type": "time|beat|audio|loop",
    // trigger-specific properties
  },
  "actions": [
    // array of action objects
  ]
}
```

### Action Types

- **spawn**: Create new objects
- **move**: Move objects (preset, path, or physics)
- **transform**: Apply visual effects
- **formation**: Arrange objects in patterns
- **visual**: Change visual properties
- **destroy**: Remove objects
- **audio-map**: Map audio to visual properties

## Usage Examples

### Simple Beat Sync
```json
{
  "trigger": {"type": "beat", "measure": 1, "beat": 1},
  "actions": [{
    "type": "spawn",
    "objectId": "pulse",
    "position": {"x": "center", "y": "center"}
  }]
}
```

### Audio-Reactive Scaling
```json
{
  "trigger": {"type": "time", "at": 0},
  "actions": [{
    "type": "audio-map",
    "target": "myObject",
    "mapping": {
      "amplitude": {
        "property": "scale",
        "range": [0.5, 2.0],
        "smoothing": 0.1
      }
    }
  }]
}
```

### Physics Particles
```json
{
  "trigger": {"type": "audio", "condition": {"parameter": "amplitude", "operator": ">", "value": 0.7}},
  "actions": [{
    "type": "spawn",
    "objectId": "particle-{{timestamp}}",
    "position": {"x": "center", "y": "bottom"}
  }, {
    "type": "move",
    "target": "particle-{{timestamp}}",
    "movement": {
      "velocity": {"x": "random(-5,5)", "y": -10},
      "acceleration": {"x": 0, "y": 0.5}
    }
  }]
}
```

## Special Values

### Position Values
- Numbers: Absolute terminal cell position
- `"center"`: Center of terminal
- `"random"`: Random position
- `"left"`, `"right"`, `"top"`, `"bottom"`: Edge positions

### Template Variables
- `{{index}}`: Loop iteration index
- `{{timestamp}}`: Current timestamp
- `{{beat}}`: Current beat number
- `{{measure}}`: Current measure number

### Dynamic Values
- `"random(min,max)"`: Random number in range
- Relative positions when `relative: true`

## Integration with Visualization System

The choreography schema is designed to work seamlessly with the existing enhanced visualization system:

1. **Velocity-Based Motion**: Choreography respects velocity thresholds
2. **Collision System**: Can trigger or disable collision transformations
3. **Buffer Management**: Works within the 50-object limit
4. **Terminal Constraints**: All positions in terminal cell coordinates
5. **120 FPS Rendering**: Optimized for the existing frame rate

## Loading Choreographies

To use a choreography with the enhanced player:

```javascript
// Load choreography from file
const choreography = JSON.parse(fs.readFileSync('choreography.json'));

// Pass to player
node play-ascii-beats-enhanced.js audio.wav --choreography choreography.json
```

## Best Practices

1. **Start Simple**: Begin with basic time/beat triggers before adding complexity
2. **Use Templates**: Define reusable objects and movements
3. **Layer with Tracks**: Organize objects into foreground/background layers
4. **Test Incrementally**: Build choreographies step by step
5. **Consider Performance**: Limit simultaneous objects to maintain 120 FPS
6. **Audio Analysis**: Use velocity for rhythmic changes, amplitude for intensity

## Example Files

- `choreography-schema.json`: The complete JSON schema definition
- `example-choreographies.json`: Five complete example choreographies
  - Beat Pulse: Simple beat-synchronized spawning
  - Audio Reactive Formation: Objects dancing in formations
  - Complex Sequence: Multi-scene choreography with tracks
  - Physics Particles: Gravity-based particle system
  - Frequency Visualization: Bass/mid/treble visualization

## Future Enhancements

Potential additions to the schema:
- SVG path support for complex movement paths
- Shader-like effects for advanced visual processing
- MIDI event triggers for precise musical sync
- Network sync for multi-terminal displays
- Recording and playback of live performances