# Choreography v1.1 Schema Documentation

**Version**: 1.1
**Purpose**: Terminal ASCII art visualization choreography for audio-reactive performances
**Format**: JSON

---

## Table of Contents
1. [Overview](#overview)
2. [Root Structure](#root-structure)
3. [Metadata](#metadata)
4. [Settings](#settings)
5. [Templates](#templates)
6. [Timeline](#timeline)
7. [Actions Reference](#actions-reference)
8. [Triggers Reference](#triggers-reference)
9. [Optional Features](#optional-features)
10. [Examples](#examples)

---

## Overview

Choreography v1.1 defines timed visual events for terminal-based ASCII art animations synchronized to audio playback. The schema supports:

- **Audio-reactive backgrounds** with HSL color control
- **Multi-line ASCII art templates** with physics properties
- **8 action types**: spawn, move, transform, formation, visual, destroy, audio-map, background
- **4 trigger types**: time, beat, audio-condition, loop
- **Dynamic number expressions** for procedural animation
- **Frequency band analysis** (sub/bass/mid/high/air)
- **Optional tracks, scenes, and threads** for advanced composition

---

## Root Structure

```json
{
  "metadata": { ... },
  "settings": { ... },
  "templates": { ... },
  "timeline": [ ... ],
  "tracks": [ ... ],      // Optional
  "scenes": [ ... ],      // Optional
  "threads": [ ... ]      // Optional
}
```

### Required Fields
- `metadata` - Composition information and playback configuration
- `settings` - Audio-reactive, collision, and performance settings
- `templates` - ASCII art object definitions
- `timeline` - Array of timed events with triggers and actions

### Optional Fields
- `tracks` - Layer management with z-ordering and audio channels
- `scenes` - Sectioned composition with transitions (cut/crossfade/dissolve)
- `threads` - Parallel timeline execution for complex choreography

---

## Metadata

**Type**: `object` (required)

```json
{
  "metadata": {
    "version": "1.1",
    "name": "My Choreography",
    "duration": 120.5,
    "bpm": 140,
    "timeSignature": "4/4",
    "fps": 120,
    "seed": 12345,
    "notes": "Custom description"
  }
}
```

### Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `version` | string | Yes | "1.1" | Schema version identifier |
| `name` | string | Yes | - | Choreography title |
| `duration` | number | Yes | - | Total duration in seconds |
| `bpm` | number | No | - | Beats per minute (for beat triggers) |
| `timeSignature` | string | No | "4/4" | Time signature (e.g., "5/4", "7/8") |
| `fps` | number | No | 120 | Animation frames per second |
| `seed` | number | No | - | Random seed for deterministic playback |
| `notes` | string | No | - | Additional metadata or description |

---

## Settings

**Type**: `object` (optional)

```json
{
  "settings": {
    "background": { ... },
    "audioReactive": { ... },
    "collisionBehavior": "default",
    "boundaryMode": "bounce",
    "randomness": { ... },
    "performanceBudget": { ... }
  }
}
```

### Background Settings

```json
{
  "background": {
    "mode": "audio-reactive",
    "audioReactive": {
      "sensitivity": 1.0,
      "colorWheelOffset": 0,
      "saturation": { "min": 50, "max": 100 },
      "lightness": { "min": 10, "max": 40 },
      "updateRate": 30
    }
  }
}
```

#### Background Modes

1. **`audio-reactive`** - HSL color driven by audio amplitude
   - `sensitivity`: Multiplier (0.1x to 5.0x)
   - `colorWheelOffset`: Hue rotation in degrees (0-360)
   - `saturation`: Min/max saturation percentages
   - `lightness`: Min/max lightness percentages
   - `updateRate`: Updates per second

2. **`static`** - Fixed color and pattern
   ```json
   {
     "mode": "static",
     "static": {
       "color": "#1a1a2e",
       "pattern": "solid"  // "solid" | "grid" | "dots" | "noise"
     }
   }
   ```

3. **`content`** - Text, ASCII art, or scrolling banner
   ```json
   {
     "mode": "content",
     "content": {
       "type": "text",
       "text": "♪ MUSIC ♪",
       "position": { "x": "center", "y": "center" },
       "color": "#FFFFFF",
       "opacity": 0.8
     }
   }
   ```

4. **`disabled`** - No background rendering

### Audio Reactive Settings

```json
{
  "audioReactive": {
    "amplitudeMultiplier": 1.0,
    "velocityThreshold": 0.15,
    "frequencyBands": [
      { "name": "sub", "range": [20, 60], "weight": 1.5 },
      { "name": "bass", "range": [60, 250], "weight": 1.3 },
      { "name": "mid", "range": [250, 2000], "weight": 1.0 },
      { "name": "high", "range": [2000, 8000], "weight": 0.8 },
      { "name": "air", "range": [8000, 20000], "weight": 0.5 }
    ],
    "analysisWindow": 50,
    "smoothing": 0.3
  }
}
```

| Field | Type | Description |
|-------|------|-------------|
| `amplitudeMultiplier` | number | Global amplitude scaling factor |
| `velocityThreshold` | number | Minimum velocity to trigger onset detection |
| `frequencyBands` | array | Custom frequency analysis bands |
| `analysisWindow` | number | Analysis window size in milliseconds |
| `smoothing` | number | Amplitude smoothing factor (0.0-1.0) |

### Other Settings

```json
{
  "collisionBehavior": "default",  // "default" | "scripted" | "disabled"
  "boundaryMode": "bounce",        // "bounce" | "wrap" | "stop" | "destroy"
  "randomness": {
    "seed": 12345,
    "mode": "deterministic"        // "deterministic" | "random"
  },
  "performanceBudget": {
    "maxObjects": 64,
    "maxTransformsPerSecond": 240
  }
}
```

---

## Templates

**Type**: `object` (required)

Templates define reusable ASCII art shapes with visual and physical properties.

```json
{
  "templates": {
    "objects": {
      "star": {
        "shape": [
          "    *    ",
          "   ***   ",
          "  *****  ",
          " ******* ",
          "*********"
        ],
        "defaultScale": 1,
        "defaultColor": "#ffaa00",
        "bounds": {
          "width": 9,
          "height": 5
        },
        "physics": {
          "mass": 1,
          "friction": 0.8,
          "elasticity": 0.3
        },
        "description": "A star shape"
      }
    }
  }
}
```

### Template Object Structure

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `shape` | string[] | Yes | Array of ASCII art lines (one string per line) |
| `defaultScale` | number | Yes | Default scale multiplier (1.0 = 100%) |
| `defaultColor` | string | Yes | Hex color code (e.g., "#ff6b35") |
| `bounds` | object | Yes | Width and height of the ASCII art |
| `bounds.width` | number | Yes | Character width |
| `bounds.height` | number | Yes | Line count (height) |
| `physics` | object | Yes | Physical simulation properties |
| `physics.mass` | number | Yes | Mass for collision/movement (0.1-10) |
| `physics.friction` | number | Yes | Friction coefficient (0.0-1.0) |
| `physics.elasticity` | number | Yes | Bounce factor (0.0-1.0) |
| `description` | string | No | Human-readable description |

### Color Conventions

Common intensity-based color mapping:
- **Small/Low**: `#4ecdc4` (cyan-blue)
- **Medium**: `#ff6b35` (orange-red)
- **High**: `#e63946` (bright red)
- **Default**: `#f1faee` (off-white)

---

## Timeline

**Type**: `array` (required)

Timeline events define what happens and when.

```json
{
  "timeline": [
    {
      "label": "Opening Spawn",
      "trigger": {
        "type": "time",
        "at": 0.5
      },
      "actions": [
        {
          "type": "spawn",
          "objectId": "obj1",
          "template": "star",
          "position": { "x": 50, "y": 50, "relative": false }
        }
      ]
    }
  ]
}
```

### Timeline Event Structure

```json
{
  "label": "Event Name",      // Optional: human-readable label
  "trigger": { ... },         // Required: when to fire
  "actions": [ ... ],         // Required: what to do
  "_scene": "scene_id"        // Optional: scene association
}
```

---

## Triggers Reference

### 1. Time Trigger

Fire at a specific time in seconds.

```json
{
  "type": "time",
  "at": 12.5,
  "jitter": 0.1  // Optional: random offset ±0.1s
}
```

| Field | Type | Description |
|-------|------|-------------|
| `at` | number \| string | Time in seconds or dynamic expression |
| `jitter` | number | Optional random offset range |

**Dynamic Expression Example**:
```json
{ "at": "metadata.duration * 0.5" }  // Fire at 50% of total duration
```

### 2. Beat Trigger

Fire on a specific musical beat.

```json
{
  "type": "beat",
  "measure": 4,
  "beat": 1
}
```

| Field | Type | Description |
|-------|------|-------------|
| `measure` | number | Measure number (1-indexed) |
| `beat` | number \| string | Beat within measure or expression |

**Requires**: `metadata.bpm` and `metadata.timeSignature`

### 3. Audio Trigger

Fire when audio conditions are met.

```json
{
  "type": "audio",
  "condition": {
    "parameter": "amplitude",
    "operator": ">",
    "value": 0.7
  }
}
```

**Multi-condition with logic**:
```json
{
  "type": "audio",
  "conditions": [
    { "parameter": "amplitude", "operator": ">", "value": 0.8 },
    { "parameter": "velocity", "operator": "spike", "value": 0 }
  ],
  "logic": "and"
}
```

| Parameter | Operators | Description |
|-----------|-----------|-------------|
| `amplitude` | `>`, `<`, `==` | Audio amplitude level (0.0-1.0) |
| `velocity` | `spike`, `drop`, `>`, `<` | Rate of change in amplitude |
| `frequency` | `>`, `<`, `==` | Frequency band energy (requires `band`) |

**Logic operators**: `and`, `or`, `xor`

### 4. Loop Trigger

Repeat actions at intervals.

```json
{
  "type": "loop",
  "every": 2.0,
  "count": 10
}
```

| Field | Type | Description |
|-------|------|-------------|
| `every` | number \| string | Interval in seconds or expression |
| `count` | number | Repetitions (-1 for infinite) |

---

## Actions Reference

### 1. Spawn Action

Create a new object on screen.

```json
{
  "type": "spawn",
  "objectId": "obj1",
  "template": "star",
  "position": {
    "x": 50,
    "y": 50,
    "relative": false
  },
  "track": "foreground",  // Optional
  "delay": 0.5            // Optional
}
```

| Field | Description |
|-------|-------------|
| `objectId` | Unique identifier for the spawned object |
| `template` | Template name from `templates.objects` |
| `position.x` | X coordinate (absolute or dynamic expression) |
| `position.y` | Y coordinate (absolute or dynamic expression) |
| `position.relative` | If true, positions are percentages (0-100) |
| `track` | Optional track ID for layering |
| `delay` | Optional delay in seconds before spawn |

### 2. Move Action

Move existing objects.

**Preset Movement**:
```json
{
  "type": "move",
  "target": "obj1",
  "movement": {
    "preset": "bounce",
    "duration": 2.0,
    "easing": "ease-in-out"
  }
}
```

**Path-based Movement**:
```json
{
  "type": "move",
  "target": "obj1",
  "movement": {
    "path": [
      { "x": 10, "y": 10, "time": 0 },
      { "x": 50, "y": 50, "time": 1.0 },
      { "x": 90, "y": 10, "time": 2.0 }
    ]
  }
}
```

**Velocity-based Movement**:
```json
{
  "type": "move",
  "target": "obj1",
  "movement": {
    "velocity": { "x": 10, "y": -5 },
    "acceleration": { "x": 0, "y": 2 }
  }
}
```

| Target | Description |
|--------|-------------|
| `"obj1"` | Specific object ID |
| `"all"` | All objects |
| `"track_id"` | All objects in a track |

### 3. Transform Action

Apply visual transformation effects.

```json
{
  "type": "transform",
  "target": "obj1",
  "effect": "rotate",
  "duration": 1.0,
  "delay": 0
}
```

**Available effects**: `rotate`, `scale`, `fade`, `shake`, `pulse`, `rainbow`, `glitch`, `invert`

### 4. Formation Action

Arrange multiple objects in a pattern.

```json
{
  "type": "formation",
  "objects": ["obj1", "obj2", "obj3"],
  "pattern": "circle",
  "center": { "x": 50, "y": 50 },
  "duration": 2.0,
  "stagger": 0.1
}
```

**Available patterns**: `circle`, `line`, `grid`, `spiral`, `random`

| Field | Description |
|-------|-------------|
| `objects` | Array of object IDs to arrange |
| `pattern` | Formation pattern name |
| `center` | Center point of the formation |
| `stagger` | Delay between each object movement |

### 5. Visual Action

Modify visual properties over time.

```json
{
  "type": "visual",
  "target": "obj1",
  "changes": {
    "color": "#ff0000",
    "scale": 1.5,
    "rotation": 45,
    "opacity": 0.5,
    "blur": 2,
    "glow": {
      "color": "#ffff00",
      "radius": 10
    }
  },
  "duration": 1.0,
  "easing": "ease-out"
}
```

### 6. Destroy Action

Remove objects from the scene.

```json
{
  "type": "destroy",
  "target": "obj1",
  "effect": "fade",  // Optional: "fade", "explode", "shrink"
  "delay": 0
}
```

### 7. Audio-Map Action

Map audio properties to visual properties in real-time.

```json
{
  "type": "audio-map",
  "target": "obj1",
  "mapping": {
    "amplitude": {
      "property": "scale",
      "range": [0.5, 2.0],
      "smoothing": 0.2
    },
    "frequency": {
      "band": "bass",
      "property": "rotation",
      "range": [0, 360]
    }
  }
}
```

### 8. Background Action

Change background settings during playback.

```json
{
  "type": "background",
  "mode": "audio-reactive",
  "audioReactive": {
    "sensitivity": 1.5,
    "colorWheelOffset": 180
  },
  "delay": 0
}
```

---

## Optional Features

### Tracks

Layer management with z-ordering.

```json
{
  "tracks": [
    {
      "id": "background",
      "name": "Background Layer",
      "layer": 0,
      "opacity": 0.5,
      "audioChannel": "left"
    },
    {
      "id": "foreground",
      "name": "Foreground Layer",
      "layer": 10,
      "opacity": 1.0,
      "audioChannel": "stereo"
    }
  ]
}
```

### Scenes

Sectioned composition with transitions.

```json
{
  "scenes": [
    {
      "name": "Intro",
      "start": 0,
      "duration": 30,
      "transition": {
        "type": "crossfade",
        "duration": 2.0
      },
      "timeline": [ ... ]  // Scene-specific events
    }
  ]
}
```

**Transition types**: `cut`, `crossfade`, `dissolve`

### Threads

Parallel timeline execution.

```json
{
  "threads": [
    {
      "id": "percussion",
      "name": "Drum Pattern",
      "timeline": [ ... ]
    },
    {
      "id": "melody",
      "name": "Melodic Elements",
      "timeline": [ ... ]
    }
  ]
}
```

---

## Examples

### Minimal Choreography

```json
{
  "metadata": {
    "version": "1.1",
    "name": "Simple Animation",
    "duration": 10,
    "fps": 120
  },
  "settings": {},
  "templates": {
    "objects": {
      "dot": {
        "shape": ["•"],
        "defaultScale": 1,
        "defaultColor": "#ffffff",
        "bounds": { "width": 1, "height": 1 },
        "physics": { "mass": 1, "friction": 0.5, "elasticity": 0.5 }
      }
    }
  },
  "timeline": [
    {
      "trigger": { "type": "time", "at": 0 },
      "actions": [
        {
          "type": "spawn",
          "objectId": "dot1",
          "template": "dot",
          "position": { "x": 50, "y": 50, "relative": true }
        }
      ]
    }
  ]
}
```

### Audio-Reactive Example

```json
{
  "metadata": {
    "version": "1.1",
    "name": "Bass Response",
    "duration": 60,
    "bpm": 140
  },
  "settings": {
    "audioReactive": {
      "frequencyBands": [
        { "name": "bass", "range": [60, 250], "weight": 2.0 }
      ]
    }
  },
  "templates": {
    "objects": {
      "pulse": {
        "shape": ["█"],
        "defaultScale": 1,
        "defaultColor": "#ff6b35",
        "bounds": { "width": 1, "height": 1 },
        "physics": { "mass": 2, "friction": 0.8, "elasticity": 0.3 }
      }
    }
  },
  "timeline": [
    {
      "trigger": {
        "type": "audio",
        "condition": {
          "parameter": "frequency",
          "operator": ">",
          "value": 0.6,
          "band": "bass"
        }
      },
      "actions": [
        {
          "type": "spawn",
          "objectId": "pulse_${timestamp}",
          "template": "pulse",
          "position": { "x": "random(0, 100)", "y": "random(0, 100)", "relative": true }
        }
      ]
    }
  ]
}
```

---

## Schema Version History

- **v1.1** (Current)
  - Extended templates with `bounds` and `physics`
  - Audio-reactive backgrounds
  - Frequency band analysis
  - Dynamic number expressions
  - Threads and scenes support

- **v1.0** (Legacy)
  - Basic timeline with spawn/move/destroy
  - Single background mode
  - Fixed numeric values only

---

## Validation Rules

1. **Duration consistency**: All time-based triggers must be ≤ `metadata.duration`
2. **Template references**: All `template` fields must reference existing `templates.objects` keys
3. **Object IDs**: Must be unique within spawned objects
4. **Color format**: Hex colors must be `#RRGGBB` format
5. **Dynamic expressions**: Must reference valid metadata or audio properties
6. **Physics ranges**:
   - `mass`: 0.1 - 10.0
   - `friction`: 0.0 - 1.0
   - `elasticity`: 0.0 - 1.0

---

**End of Documentation**
