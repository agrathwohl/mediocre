/**
 * abc2midi-llm fork directive reference.
 * Injected into agents when --abc2midi points at the fork binary.
 */

export const FORK_DIRECTIVES_REFERENCE = `## abc2midi-llm Fork — Custom Directive Extensions (Pneuma Engine)

These directives are ONLY available when using the abc2midi-llm fork binary (passed via --abc2midi).
Use them liberally for organic, expressive, algorithmically rich MIDI output.

### %%PNEUMA — Temporal Liberation

Apply organic timing variations to MIDI output. Place in the tune body.

| Directive            | Parameters              | Effect                                                                           |
| -------------------- | ----------------------- | -------------------------------------------------------------------------------- |
| \`%%PNEUMA humanize\`  | \`N\` (integer ticks)     | Add random jitter of ±N ticks to note onsets                                     |
| \`%%PNEUMA heartbeat\` | \`V\` (float 0.0-1.0)     | Sinusoidal tempo modulation (respiratory sinus arrhythmia). 8 quarter note cycle |
| \`%%PNEUMA drift\`     | \`R\` (float, e.g. 0.015) | Cumulative random-walk timing drift per beat, soft-clamped at ±4%                |
| \`%%PNEUMA free\`      | \`start\` or \`end\`        | Toggle free time: durations become ±20% random suggestions                       |
| \`%%PNEUMA rubato\`    | up to 16 floats         | Per-beat stretch factors (e.g. \`1.15 0.9 0.95 1.0\`)                              |

### %%ENSEMBLE — Inter-Voice Timing Offset

Add micro-timing offsets so voices sound like musicians playing together.

| Directive           | Parameters          | Effect                                                               |
| ------------------- | ------------------- | -------------------------------------------------------------------- |
| \`%%ENSEMBLE offset\` | \`N\` (signed ticks)  | Global default onset shift (positive=late, negative=early)           |
| \`%%ENSEMBLE jitter\` | \`N\` (integer ticks) | Random per-note jitter of ±N ticks                                   |
| \`%%ENSEMBLE voice\`  | \`N\` (signed ticks)  | Per-voice constant offset (negative=drives beat, positive=lays back) |

### %%BREATH — Automatic Rest Insertion

Insert micro-rests at phrase boundaries so the piece breathes.

| Directive        | Parameters          | Effect                                     |
| ---------------- | ------------------- | ------------------------------------------ |
| \`%%BREATH auto\`  | \`N\` (integer ticks) | Insert N-tick micro-rest at every bar line |
| \`%%BREATH bars\`  | \`N\` (integer)       | Breath only every N bars                   |
| \`%%BREATH after\` | \`N\` (integer ticks) | Also breath after notes > N ticks duration |
| \`%%BREATH off\`   |                     | Disable breath insertion                   |

### %%GRAVITY — Phrase-Level Weight

Apply phrase-level dynamics (heavier openings, lighter middles, stretched endings).

| Directive          | Parameters         | Effect                                                  |
| ------------------ | ------------------ | ------------------------------------------------------- |
| \`%%GRAVITY phrase\` | \`N\` (integer bars) | Set phrase length                                       |
| \`%%GRAVITY weight\` | up to 16 floats    | Velocity multiplier per bar (e.g. \`1.15 1.0 0.95 0.85\`) |
| \`%%GRAVITY agogic\` | up to 16 floats    | Duration multiplier per bar (agogic accent)             |
| \`%%GRAVITY off\`    |                    | Disable gravity                                         |

### %%ARTICULATE — Context-Aware Note Length

Adjust note durations based on musical context.

| Directive                | Parameters      | Effect                                           |
| ------------------------ | --------------- | ------------------------------------------------ |
| \`%%ARTICULATE auto\`      |                 | Enable all rules with defaults                   |
| \`%%ARTICULATE repeated\`  | \`F\` (float 0-2) | Scale repeated pitch duration (e.g. \`0.8\` = 80%) |
| \`%%ARTICULATE leap\`      | \`F\` (float 0-2) | Scale duration after large intervals (>4th)      |
| \`%%ARTICULATE phraseend\` | \`F\` (float 0-2) | Scale duration before rest/barline               |
| \`%%ARTICULATE staccato\`  | \`F\` (float 0-1) | Set staccato note duration ratio                 |
| \`%%ARTICULATE off\`       |                 | Disable articulation rules                       |

### %%DYNAMICS — Smooth Velocity Interpolation

Instead of instant dynamic jumps, velocities glide over N notes.

| Directive               | Parameters                       | Effect                                          |
| ----------------------- | -------------------------------- | ----------------------------------------------- |
| \`%%DYNAMICS curve\`      | \`linear/exponential/logarithmic\` | Set interpolation curve                         |
| \`%%DYNAMICS transition\` | \`N\` (notes, default 8)           | Notes to interpolate over                       |
| \`%%DYNAMICS attack\`     | \`F\` (float, default 1.0)         | Velocity multiplier for first note after change |
| \`%%DYNAMICS off\`        |                                  | Disable smooth dynamics                         |

### %%SPECTRAL — Velocity-Dependent Timbral Shift

Map velocity to MIDI CC messages for brightness/filter control.

| Directive         | Parameters            | Effect                                                                   |
| ----------------- | --------------------- | ------------------------------------------------------------------------ |
| \`%%SPECTRAL tilt\` | \`F\` (float, e.g. 0.3) | Pitch bend proportional to velocity (louder=brighter)                    |
| \`%%SPECTRAL cc\`   | \`N F\` (CC#, scale)    | Emit CC N with value = velocity × F (e.g. \`cc 74 0.5\` for filter cutoff) |
| \`%%SPECTRAL off\`  |                       | Disable spectral mappings                                                |

### %%SPATIAL — Inter-Group Timing Offset

Simulate physical distance between groups of voices.

| Directive         | Parameters         | Effect                                          |
| ----------------- | ------------------ | ----------------------------------------------- |
| \`%%SPATIAL group\` | \`X voices N,N,...\` | Define group X with voice numbers               |
| \`%%SPATIAL delay\` | \`X Y N\`            | Set N milliseconds delay between groups X and Y |

### %%TRANSFORM — Cross-Voice Algorithmic Transformation

Read note data from a source voice, apply operations, and replace target voice content.
Target voices need NO placeholder notes — content is generated from source at render time.

| Directive                | Parameters                   | Effect                                               |
| ------------------------ | ---------------------------- | ---------------------------------------------------- |
| \`%%TRANSFORM source\`     | \`N\` (voice number)           | Set source voice; containing voice becomes target    |
| \`%%TRANSFORM retrograde\` |                              | Reverse the note sequence                            |
| \`%%TRANSFORM invert\`     |                              | Mirror pitches around axis                           |
| \`%%TRANSFORM invertaxis\` | \`N\` (MIDI pitch, default 60) | Set inversion axis (middle C)                        |
| \`%%TRANSFORM fragment\`   | \`F\` (float 0.0-1.0)          | Probabilistic note dropping (F = fraction surviving) |
| \`%%TRANSFORM pitchshift\` | \`N\` (semitones ±)            | Transpose all pitches                                |
| \`%%TRANSFORM timescale\`  | \`F\` (float)                  | Scale all note/rest durations                        |
| \`%%TRANSFORM delay\`      | \`N\` (bars)                   | Prepend N bars of rests                              |
| \`%%TRANSFORM off\`        |                              | Disable transform                                    |

### %%SHADOW — Reactive Voice Following

Generate a derived voice from a source with musical intelligence about HOW to follow.
Target voices need NO placeholder notes — content is generated from source at render time.

| Directive               | Parameters                       | Effect                                                                                   |
| ----------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| \`%%SHADOW source\`       | \`N\` (voice number)               | Set source voice; containing voice becomes shadow target                                 |
| \`%%SHADOW mode\`         | \`mirror/contradict/comment\`      | Mirror (close following), Contradict (inverted motion), Comment (sparse phrase-boundary) |
| \`%%SHADOW probability\`  | \`F\` (float 0.0-1.0, default 0.7) | Fraction of source notes generating shadow notes                                         |
| \`%%SHADOW transpose\`    | \`N\` (semitones ±)                | Fixed transposition offset                                                               |
| \`%%SHADOW delay\`        | \`N\` (bars)                       | Prepend N bars of rests                                                                  |
| \`%%SHADOW invertmotion\` |                                  | Invert melodic direction                                                                 |
| \`%%SHADOW intervallock\` | \`N\` (semitones)                  | Lock shadow at fixed interval from source                                                |
| \`%%SHADOW off\`          |                                  | Disable shadow                                                                           |

### Composition Philosophy

- **Start with PNEUMA**: Add humanize, drift, and heartbeat to all melodic voices
- **ENSEMBLE for texture**: Offset voices so they don't land on identical ticks
- **BREATH for phrasing**: Auto-insert micro-rests so phrases separate
- **GRAVITY for shape**: Apply phrase-level weight and agogic timing
- **TRANSFORM for structure**: Create derived voices algorithmically
- **SHADOW for depth**: Add ghost voices that follow/comment on source material
- **SPECTRAL for timbre**: Map velocity to filter cutoff for brighter loud passages
- **DYNAMICS for flow**: Smooth velocity interpolation between dynamic marks
`;
