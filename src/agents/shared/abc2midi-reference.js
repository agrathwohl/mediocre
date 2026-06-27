/**
 * Full abc2midi %%MIDI extension reference
 * Shared across composition, ornamentation, and midi-expression agents.
 * Sources: abc2midi man page + abcguide.txt (James Allwright)
 */

export const ABC2MIDI_REFERENCE = `## COMPLETE abc2midi %%MIDI EXTENSION REFERENCE

All %%MIDI commands appear on a line by themselves and are valid inside the tune body,
allowing per-section changes when combined with part notation.

---

### Channel & Program

%%MIDI channel n
  Select melody channel n (1-16).

%%MIDI program [c] n
  Select General MIDI program n (0-127) on channel c. If c omitted, uses current melody channel.

---

### Velocity & Beat Emphasis

%%MIDI beat a b c n
  Controls note velocities. First note in bar: velocity a. Other "strong" notes: b. Rest: c.
  All values 0-127. n determines strong notes: in x/y time, note at position k (0..x-1) is
  "strong" if k is a multiple of n.

  Dynamic marking equivalents:
    !ppp! = %%MIDI beat 30 20 10 1
    !pp!  = %%MIDI beat 45 35 20 1
    !p!   = %%MIDI beat 60 50 35 1
    !mp!  = %%MIDI beat 75 65 50 1
    !mf!  = %%MIDI beat 90 80 65 1
    !f!   = %%MIDI beat 105 95 80 1
    !ff!  = %%MIDI beat 120 110 95 1
    !fff! = %%MIDI beat 127 125 110 1

%%MIDI beatmod n
  Increment (or decrement if negative) the a, b, c velocities by n.
  !crescendo(! and !crescendo)! (aliases !<(! !<)!) insert %%MIDI beatmod 15.
  !diminuendo(! and !diminuendo)! (aliases !>(! !>)!) insert %%MIDI beatmod -15.

%%MIDI deltaloudness n
  Sets the velocity step size for crescendo/diminuendo (default 15).

%%MIDI nobeataccents
  Forces every note to use the 'b' (medium) velocity regardless of bar position.
  Useful for instruments like organ. Dynamics (!f!, !pp!, etc.) still function normally.

%%MIDI beataccents
  Reverts to normal beat emphasis (default).

%%MIDI beatstring <string>
  Alternative strong/weak specification: f (velocity a, strong), m (velocity b, medium),
  p (velocity c, soft). Length = beats in bar.
  Example for 7/8 with stresses on beats 1, 4, 6:
    %%MIDI beatstring fppmpmp

---

### Transposition

%%MIDI transpose n
  Transpose output by n semitones (positive or negative).

%%MIDI rtranspose n
  Relative transpose: adds n to current transposition.

%%MIDI c n
  Specifies the MIDI pitch corresponding to ABC 'C'. Default 60. Should be multiple of 12.

---

### Grace Notes

%%MIDI grace a/b
  Fraction of the following note that grace notes consume. a must be between 1 and b-1.

%%MIDI gracedivider b
  Fixed grace note duration: unit_length / b. E.g. with L:1/8 and b=4, each grace note
  is a 32nd note. Time stolen from the following note.

---

### Guitar Chords (gchord)

%%MIDI gchord string
  Specifies how guitar chord accompaniment is generated per bar using:
    z = rest, c = chord, f = fundamental (bass), b = fundamental+chord
    g,h,i,j = individual chord notes from lowest (root) upward
    G,H,I,J = same notes transposed down one octave
  Optional length suffix per symbol (e.g. czf2zf3).
  Duration units: entire string = one bar.

  Default patterns by time signature:
    2/4 or 4/4: %%MIDI gchord fzczfzcz
    3/4:        %%MIDI gchord fzczcz
    6/8:        %%MIDI gchord fzcfzc
    9/8:        %%MIDI gchord fzcfzcfzc

  Arpeggiation example (C major → C E G E):
    %%MIDI gchord ghih

%%MIDI gchordon / %%MIDI gchordoff
  Enable / disable guitar chord generation (on by default).

%%MIDI gchordbars n
  Spread the gchord pattern over n consecutive bars.

%%MIDI chordprog n [octave=n]
  MIDI instrument for chord notes. Optional octave shift -2 to +2.

%%MIDI bassprog n [octave=n]
  MIDI instrument for bass/fundamental notes. Optional octave shift.

%%MIDI chordvol n
  Velocity of chord notes (0-127).

%%MIDI bassvol n
  Velocity of bass/fundamental notes (0-127).

%%MIDI chordname name n1 n2 n3 n4 n5 n6
  Define or redefine a guitar chord type. n1=0 (root), n2-n6 = semitones above root.
  May have fewer than 6 notes. Stays in effect to end of file.
  Examples:
    %%MIDI chordname m 0 3 7
    %%MIDI chordname 7 0 4 7 10
    %%MIDI chordname m7 0 3 7 10
    %%MIDI chordname maj7 0 4 7 11

%%MIDI chordattack n
  Stagger chord note onsets by n MIDI time units (480 units = 1 quarter note).
  n=0 disables.

%%MIDI randomchordattack n
  Like chordattack but randomized: delay uniform 0..n-1.

---

### Drums

%%MIDI drum string [programs] [velocities]
  Set drum pattern. String: d=hit, z=rest. Programs: GM drum numbers for each d.
  Velocities: 0-127 for each d. Pattern repeats each bar.
  Enable with %%MIDI drumon (or !drum! in tune body). Disable with %%MIDI drumoff (or !nodrum!).
  Example: %%MIDI drum d2zdd 35 38 38 100 50 50

%%MIDI drumon / %%MIDI drumoff
  Enable / disable the drum pattern.

%%MIDI drumbars n
  Spread drum pattern over n consecutive bars to avoid monotony.

%%MIDI drummap note midipitch
  Map an ABC note to a specific GM drum MIDI pitch.

GM Percussion Map (channel 10):
  35 Acoustic Bass Drum   36 Bass Drum 1       37 Side Stick
  38 Acoustic Snare       39 Hand Clap         40 Electric Snare
  41 Low Floor Tom        42 Closed Hi-Hat     43 High Floor Tom
  44 Pedal Hi-Hat         45 Low Tom           46 Open Hi-Hat
  47 Low-Mid Tom          48 Hi-Mid Tom        49 Crash Cymbal 1
  50 High Tom             51 Ride Cymbal 1     52 Chinese Cymbal
  53 Ride Bell            54 Tambourine        55 Splash Cymbal
  56 Cowbell              57 Crash Cymbal 2    58 Vibraslap
  59 Ride Cymbal 2        60 Hi Bongo          61 Low Bongo
  62 Mute Hi Conga        63 Open Hi Conga     64 Low Conga
  65 High Timbale         66 Low Timbale       67 High Agogo
  68 Low Agogo            69 Cabasa            70 Maracas
  75 Claves               76 Hi Wood Block     77 Low Wood Block
  80 Mute Triangle        81 Open Triangle
  BANNED (do not use): 71 Short Whistle, 72 Long Whistle, 73 Short Guiro,
    74 Long Guiro, 78 Mute Cuica, 79 Open Cuica

---

### Articulation

%%MIDI trim x/y
  Shorten notes by fraction x/y of unit length, creating gaps between notes
  for staccato feel. x=0 disables. Ignored inside slurs.

%%MIDI expand x/y
  Lengthen notes by fraction x/y so they overlap the start of the next note.
  x/y must be less than 1.

---

### MIDI Control & Pitchbend

%%MIDI control [bass/chord] n1 n2
  Generate a MIDI control event on the melody channel (or bass/chord channel if specified).
  n1 = control parameter (0-127), n2 = value (0-127).
  Common uses:
    %%MIDI control 7 n   — set volume (0-127)
    %%MIDI control 10 n  — set pan (0=left, 64=center, 127=right)
    %%MIDI control 11 n  — set expression (0-127)
    %%MIDI control 91 n  — reverb depth
    %%MIDI control 93 n  — chorus depth

%%MIDI pitchbend [bass/chord] <high byte> <low byte>
  Generate a pitchbend event on the current (or bass/chord) channel.

---

### Broken Rhythm

%%MIDI ratio n m
  Sets the ratio of note lengths in broken rhythm (e.g. a>b).
  Default: 2:1 (a sounds twice as long as b).
  Example for exact dotted notation: %%MIDI ratio 3 1

---

### Barline & Accidental Scope

%%MIDI nobarlines
  Accidentals apply only to the immediately following note (early music without barlines).

%%MIDI barlines
  Restores normal accidental scope (default).

---

### Drone

%%MIDI droneon / %%MIDI droneoff
  Enable/disable a continuous two-note drone.

%%MIDI drone n1 n2 n3 n4 n5
  Configure drone: n1=MIDI program, n2/n3=MIDI pitches, n4/n5=velocities.
  Defaults: 70 45 33 80 80.

---

### Stress Models

%%MIDI ptstress filename
  Load Phil Taylor stress parameters. Overrides beat model.

%%MIDI stressmodel n
  Select stress model: 1 (articulation) or 2 (onset+duration, default).

---

### General MIDI Instrument Program Numbers (0-127 / displayed as 1-128)

  1  Acoustic Grand Piano    2  Bright Acoustic Piano   3  Electric Grand Piano
  4  Honky-tonk Piano        5  Electric Piano 1         6  Electric Piano 2
  7  Harpsichord             8  Clavi                    9  Celesta
  10 Glockenspiel           11  Music Box               12  Vibraphone
  13 Marimba                14  Xylophone               15  Tubular Bells
  16 Dulcimer               17  Drawbar Organ           18  Percussive Organ
  19 Rock Organ             20  Church Organ            21  Reed Organ
  22 Accordion              23  Harmonica               24  Tango Accordion
  25 Acoustic Guitar (nylon) 26 Acoustic Guitar (steel) 27 Electric Guitar (jazz)
  28 Electric Guitar (clean) 29 Electric Guitar (muted) 30 Overdriven Guitar
  31 Distortion Guitar      32  Guitar harmonics        33  Acoustic Bass
  34 Electric Bass (finger) 35  Electric Bass (pick)    36  Fretless Bass
  37 Slap Bass 1            38  Slap Bass 2             39  Synth Bass 1
  40 Synth Bass 2           41  Violin                  42  Viola
  43 Cello                  44  Contrabass              45  Tremolo Strings
  46 Pizzicato Strings      47  Orchestral Harp         48  Timpani
  49 String Ensemble 1      50  String Ensemble 2       51  SynthStrings 1
  52 SynthStrings 2         53  Choir Aahs              54  Voice Oohs
  55 Synth Voice            56  Orchestra Hit           57  Trumpet
  58 Trombone               59  Tuba                    60  Muted Trumpet
  61 French Horn            62  Brass Section           63  SynthBrass 1
  64 SynthBrass 2           65  Soprano Sax             66  Alto Sax
  67 Tenor Sax              68  Baritone Sax            69  Oboe
  70 English Horn           71  Bassoon                 72  Clarinet
  73 Piccolo                74  Flute                   75  Recorder
  76 Pan Flute              77  Blown Bottle            78  Shakuhachi
  79 Whistle                80  Ocarina                 81  Lead 1 (square)
  82 Lead 2 (sawtooth)      83  Lead 3 (calliope)       84  Lead 4 (chiff)
  85 Lead 5 (charang)       86  Lead 6 (voice)          87  Lead 7 (fifths)
  88 Lead 8 (bass+lead)     89  Pad 1 (new age)         90  Pad 2 (warm)
  91 Pad 3 (polysynth)      92  Pad 4 (choir)           93  Pad 5 (bowed)
  94 Pad 6 (metallic)       95  Pad 7 (halo)            96  Pad 8 (sweep)
  97 FX 1 (rain)            98  FX 2 (soundtrack)       99  FX 3 (crystal)
  100 FX 4 (atmosphere)    101  FX 5 (brightness)      102  FX 6 (goblins)
  103 FX 7 (echoes)        104  FX 8 (sci-fi)           105 Sitar
  106 Banjo                107  Shamisen               108  Koto
  109 Kalimba              110  Bag pipe               111  Fiddle
  112 Shanai               113  Tinkle Bell            114  Agogo
  115 Steel Drums          116  Woodblock              117  Taiko Drum
  118 Melodic Tom          119  Synth Drum             120  Reverse Cymbal
  121 Guitar Fret Noise    122  Breath Noise           123  Seashore
  124 Bird Tweet           125  Telephone Ring         126  Helicopter
  127 Applause             128  Gunshot
`;
