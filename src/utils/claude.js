import { anthropic, createAnthropic } from "@ai-sdk/anthropic";
import { generateText } from "ai";
import { config } from "./config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { loadSoundFontIndex, generateLLMContext } from "./soundfont-analyzer.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Cached soundfont index for efficient reuse
let cachedSoundFontIndex = null;
let cachedSoundFontContext = null;

/**
 * Load and cache the soundfont index for LLM context generation
 * @returns {Object|null} The soundfont index or null if not available
 */
function getSoundFontIndex() {
  if (cachedSoundFontIndex) return cachedSoundFontIndex;

  // Try standard locations for the soundfont index
  const possiblePaths = [
    path.join(__dirname, "../../soundfont_index.json"),
    "/home/gwohl/code/mediocre/soundfonts/soundfont_index.json",
    path.join(process.cwd(), "soundfont_index.json"),
  ];

  for (const indexPath of possiblePaths) {
    try {
      if (fs.existsSync(indexPath)) {
        cachedSoundFontIndex = loadSoundFontIndex(indexPath);
        console.log(`Loaded soundfont index from ${indexPath}`);
        return cachedSoundFontIndex;
      }
    } catch (error) {
      // Continue to next path
    }
  }

  return null;
}

/**
 * Generate comprehensive instrument availability context for LLM
 * Uses the pre-computed soundfont index for rich instrument information
 * @returns {string} Formatted instrument context for system prompts
 */
export function getSoundFontInstrumentContext() {
  if (cachedSoundFontContext) return cachedSoundFontContext;

  const index = getSoundFontIndex();
  if (!index) {
    // Fall back to basic timidity config info
    return getTimidityConfigInfo();
  }

  // Generate comprehensive instrument summary
  // Group presets by GM program number for common instruments
  const gmInstruments = {
    // Pianos (0-7)
    0: { name: "Acoustic Grand Piano", presets: [] },
    1: { name: "Bright Acoustic Piano", presets: [] },
    2: { name: "Electric Grand Piano", presets: [] },
    4: { name: "Electric Piano 1 (Rhodes)", presets: [] },
    5: { name: "Electric Piano 2 (DX)", presets: [] },
    6: { name: "Harpsichord", presets: [] },
    7: { name: "Clavinet", presets: [] },
    // Chromatic Percussion (8-15)
    11: { name: "Vibraphone", presets: [] },
    12: { name: "Marimba", presets: [] },
    // Organs (16-23)
    16: { name: "Drawbar Organ", presets: [] },
    18: { name: "Rock Organ", presets: [] },
    19: { name: "Church Organ", presets: [] },
    // Guitars (24-31)
    24: { name: "Acoustic Guitar (nylon)", presets: [] },
    25: { name: "Acoustic Guitar (steel)", presets: [] },
    26: { name: "Electric Guitar (jazz)", presets: [] },
    27: { name: "Electric Guitar (clean)", presets: [] },
    28: { name: "Electric Guitar (muted)", presets: [] },
    29: { name: "Overdriven Guitar", presets: [] },
    30: { name: "Distortion Guitar", presets: [] },
    // Basses (32-39)
    32: { name: "Acoustic Bass", presets: [] },
    33: { name: "Electric Bass (finger)", presets: [] },
    34: { name: "Electric Bass (pick)", presets: [] },
    35: { name: "Fretless Bass", presets: [] },
    36: { name: "Slap Bass 1", presets: [] },
    38: { name: "Synth Bass 1", presets: [] },
    // Strings (40-47)
    40: { name: "Violin", presets: [] },
    41: { name: "Viola", presets: [] },
    42: { name: "Cello", presets: [] },
    43: { name: "Contrabass", presets: [] },
    44: { name: "Tremolo Strings", presets: [] },
    45: { name: "Pizzicato Strings", presets: [] },
    46: { name: "Orchestral Harp", presets: [] },
    47: { name: "Timpani", presets: [] },
    // Ensemble (48-55)
    48: { name: "String Ensemble 1", presets: [] },
    49: { name: "String Ensemble 2", presets: [] },
    50: { name: "Synth Strings 1", presets: [] },
    52: { name: "Choir Aahs", presets: [] },
    53: { name: "Voice Oohs", presets: [] },
    // Brass (56-63)
    56: { name: "Trumpet", presets: [] },
    57: { name: "Trombone", presets: [] },
    58: { name: "Tuba", presets: [] },
    59: { name: "Muted Trumpet", presets: [] },
    60: { name: "French Horn", presets: [] },
    61: { name: "Brass Section", presets: [] },
    62: { name: "Synth Brass 1", presets: [] },
    // Reed (64-71)
    64: { name: "Soprano Sax", presets: [] },
    65: { name: "Alto Sax", presets: [] },
    66: { name: "Tenor Sax", presets: [] },
    67: { name: "Baritone Sax", presets: [] },
    68: { name: "Oboe", presets: [] },
    69: { name: "English Horn", presets: [] },
    70: { name: "Bassoon", presets: [] },
    71: { name: "Clarinet", presets: [] },
    // Pipe (72-79)
    72: { name: "Piccolo", presets: [] },
    73: { name: "Flute", presets: [] },
    74: { name: "Recorder", presets: [] },
    75: { name: "Pan Flute", presets: [] },
    79: { name: "Ocarina", presets: [] },
    // Synth Lead (80-87)
    80: { name: "Lead 1 (square)", presets: [] },
    81: { name: "Lead 2 (sawtooth)", presets: [] },
    // Synth Pad (88-95)
    88: { name: "Pad 1 (new age)", presets: [] },
    89: { name: "Pad 2 (warm)", presets: [] },
    90: { name: "Pad 3 (polysynth)", presets: [] },
    91: { name: "Pad 4 (choir)", presets: [] },
    // Synth Effects (96-103)
    99: { name: "FX 4 (atmosphere)", presets: [] },
    // Ethnic (104-111)
    104: { name: "Sitar", presets: [] },
    105: { name: "Banjo", presets: [] },
    // Percussive (112-119)
    114: { name: "Steel Drums", presets: [] },
    115: { name: "Woodblock", presets: [] },
    116: { name: "Taiko Drum", presets: [] },
    // Sound Effects (120-127)
    127: { name: "Gunshot", presets: [] },
  };

  // Collect available presets for each GM program from all soundfonts
  for (const sf of index.soundfonts) {
    for (const preset of sf.presets) {
      if (preset.bank === 0 && gmInstruments[preset.program]) {
        gmInstruments[preset.program].presets.push({
          soundfont: sf.filename,
          presetName: preset.name
        });
      }
    }
  }

  // Build the context string
  let context = `
AVAILABLE INSTRUMENTS FROM SOUNDFONT COLLECTION (${index.totalSoundfonts} soundfonts, ${index.totalPresets} presets):

The user has a comprehensive soundfont collection. Use standard GM program numbers.
Here are instruments with high-quality samples available:

`;

  // Group by category
  const categories = {
    "KEYBOARDS": [0, 1, 2, 4, 5, 6, 7, 16, 18, 19],
    "GUITARS & BASS": [24, 25, 26, 27, 28, 29, 30, 32, 33, 34, 35, 36, 38],
    "STRINGS": [40, 41, 42, 43, 44, 45, 46, 47, 48, 49, 50],
    "BRASS": [56, 57, 58, 59, 60, 61, 62],
    "WOODWINDS & REEDS": [64, 65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 75, 79],
    "SYNTHS": [80, 81, 88, 89, 90, 91, 99],
    "VOCALS & CHOIR": [52, 53],
    "PERCUSSION & MALLETS": [11, 12, 114, 115, 116],
    "ETHNIC": [104, 105],
  };

  for (const [category, programs] of Object.entries(categories)) {
    const availableInCategory = programs
      .filter(p => gmInstruments[p] && gmInstruments[p].presets.length > 0)
      .map(p => {
        const inst = gmInstruments[p];
        const sampleCount = inst.presets.length;
        const topSoundfonts = inst.presets.slice(0, 3).map(pr => pr.soundfont.replace('.sf2', '')).join(', ');
        return `  ${p}: ${inst.name} (${sampleCount} versions: ${topSoundfonts}...)`;
      });

    if (availableInCategory.length > 0) {
      context += `${category}:\n${availableInCategory.join('\n')}\n\n`;
    }
  }

  context += `DRUMS: Available on bank 128 or channel 10. High-quality kits available from multiple soundfonts.

Use these GM program numbers in %%MIDI program directives. The soundfont collection has premium samples for most instruments.
`;

  cachedSoundFontContext = context;
  return context;
}

/**
 * Read and format the timidity.cfg for inclusion in system prompts
 * Helps LLM make informed instrument/arrangement choices
 * @returns {string} Formatted timidity config info for system prompt
 */
export function getTimidityConfigInfo() {
  try {
    const timidityPath = path.join(__dirname, "../../timidity.cfg");
    if (!fs.existsSync(timidityPath)) {
      return "";
    }
    const content = fs.readFileSync(timidityPath, "utf8");

    // Extract soundfont names for the LLM
    const soundfonts = [];
    const lines = content.split("\n");
    for (const line of lines) {
      if (line.startsWith("soundfont ")) {
        const match = line.match(/soundfont "([^"]+)"/);
        if (match) {
          soundfonts.push(match[1].replace(".sf2", ""));
        }
      }
    }

    if (soundfonts.length === 0) return "";

    return `
AVAILABLE SOUNDFONTS (for instrument selection guidance):
The user's system has these soundfonts loaded, which affects instrument quality:
- General MIDI: GeneralUser GS, FluidR3 GM, Arachno, SGM Yamaha Grand
- Drums: Real Acoustic Drums, Tama RockSTAR, Roland GM, Giant Soundfont, Hard Rock Drums
- Guitars: Electric JN, Electric Guitars GM, Metal Guitar, Ibanez Bass
- Synths: FatBoy, Edirol SD-20, RetroHybrid
- Orchestra: Timbres of Heaven, Concert GM
- Piano: Z-Doc Soundfont IV
- Hardware Emulation: SC-55, MT-32, Yamaha Tyros 4
- Premium: Orpheus, Daindune Montage, Crisis General MIDI, Musica

Choose instruments that will sound great with these soundfonts. Standard GM instruments work well.
Drums, guitars, brass, strings, and piano have especially high-quality samples available.
`;
  } catch (error) {
    return "";
  }
}

/**
 * Validates ABC notation for formatting issues that would cause playback problems
 * @param {string} abcNotation - ABC notation to validate
 * @returns {Object} Validation results with issues array and isValid flag
 */
export function validateAbcNotation(abcNotation) {
  // Initialize result object
  const result = {
    isValid: true,
    issues: [],
    lineIssues: [],
    fixedNotation: null,
  };

  // Split the notation into lines for analysis
  const lines = abcNotation.split("\n");

  // Check for basic header fields
  const requiredHeaders = ["X:", "T:", "M:", "K:"];
  const foundHeaders = [];

  // Detect pattern issues
  let inVoiceSection = false;
  let prevLine = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for blank lines (completely empty or just whitespace)
    if (line.trim() === "") {
      result.issues.push(
        `Line ${lineNum}: Blank line detected - will cause ABC parsing errors`,
      );
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }

    // Check for indentation (line starts with whitespace)
    if ((line !== "" && line.startsWith(" ")) || line.startsWith("\t")) {
      result.issues.push(
        `Line ${lineNum}: Line starts with whitespace - may cause ABC parsing errors`,
      );
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }

    // Check for voice declarations not at start of line
    if (line.match(/\s+\[?V:/)) {
      result.issues.push(
        `Line ${lineNum}: Voice declaration not at start of line`,
      );
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }

    // Check for required headers
    for (const header of requiredHeaders) {
      if (line.startsWith(header)) {
        foundHeaders.push(header);
      }
    }

    // Check for lyrics lines not following melody lines
    if (line.startsWith("w:") && !prevLine.match(/^\[?V:/)) {
      // This is a heuristic - not 100% reliable but catches obvious issues
      const prevLineHasNotes = prevLine.match(/[A-Ga-g]/) !== null;
      if (!prevLineHasNotes) {
        result.issues.push(
          `Line ${lineNum}: Lyrics line (w:) not immediately following a melody line`,
        );
        result.lineIssues.push(lineNum);
        result.isValid = false;
      }
    }

    // Store current line for next iteration
    prevLine = line;
  }

  // Check for missing required headers
  for (const header of requiredHeaders) {
    if (!foundHeaders.includes(header)) {
      result.issues.push(`Missing required header: ${header}`);
      result.isValid = false;
    }
  }

  // Fix the ABC notation if issues were found
  if (!result.isValid) {
    result.fixedNotation = cleanAbcNotation(abcNotation);
  }

  return result;
}

/**
 * Cleans up ABC notation to ensure proper formatting for abc2midi
 * @param {string} abcNotation - ABC notation to clean
 * @returns {string} Cleaned ABC notation
 */
export function cleanAbcNotation(abcNotation) {
  let cleanedText = abcNotation
    // Remove ALL blank lines between ANY content (most aggressive approach)
    .replace(/\n\s*\n/g, "\n")

    // Ensure proper voice, lyric, and section formatting
    .replace(/\n\s*(\[V:)/g, "\n$1") // Fix spacing before bracketed voice declarations
    .replace(/\n\s*(V:)/g, "\nV:") // Fix spacing before unbracketed voice declarations
    .replace(/\n\s*(%\s*Section)/g, "\n$1") // Fix spacing before section comments
    .replace(/\n\s*(w:)/g, "\nw:") // Fix spacing before lyrics lines

    // Fix common notation issues
    .replace(/\]\s*\n\s*\[/g, "]\n[") // Ensure clean line breaks between bracketed elements
    .replace(/\n\s+/g, "\n") // Remove leading whitespace on any line
    .replace(/\[Q:([^\]]+)\]/g, "Q:$1") // Fix Q: tempo markings
    .replace(/%%MIDI\s+program\s+(\d+)\s+(\d+)/g, "%%MIDI program $1 $2") // Fix MIDI program spacing
    .trim(); // Remove any trailing whitespace

  // Ensure the file ends with a single newline
  return cleanedText + "\n";
}

/**
 * Creates a custom Anthropic instance with the provided API key
 * @returns {object} The Anthropic provider instance
 */
export function getAnthropic() {
  const apiKey = config.get("anthropicApiKey");

  if (!apiKey) {
    throw new Error(
      "Anthropic API key not found. Please set ANTHROPIC_API_KEY in your environment variables or configuration.",
    );
  }

  return createAnthropic({
    apiKey,
  });
}

/**
 * Generate ABC notation using Claude
 * @param {Object} options - Generation options
 * @param {string} [options.genre] - Hybrid genre in format "Classical_x_Modern"
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {string} [options.style] - Music style
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @param {boolean} [options.sequentialMode] - If true, focus on quality over completeness (another agent will expand)
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @param {string} [options.customSystemPrompt] - Custom system prompt override
 * @returns {Promise<string>} Generated ABC notation
 */
export async function generateMusicWithClaude(options) {
  const myAnthropic = getAnthropic();
  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";
  const style = options.style || "standard";
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || "";
  const producer = options.producer || "";
  const requestedInstruments = options.instruments || "";
  const sequentialMode = options.sequentialMode || false;

  // Use Claude 3.7 Sonnet for best music generation capabilities
  const model = myAnthropic("claude-3-7-sonnet-20250219");
  //const model = myAnthropic("claude-opus-4-5");
  // Use custom system prompt if provided, otherwise use the default
  const systemPrompt =
    options.customSystemPrompt ||
    `You are a music composer specializing in fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}.
Your task is to create a composition that authentically blends elements of both ${classicalGenre} and ${modernGenre} musical traditions.

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, and other element must be on its own line with NO INDENTATION.
Failure to follow these formatting rules will result in completely unplayable music files.

Return ONLY the ABC notation format for the composition, with no explanation or additional text.

Guidelines for the ${genre} fusion:

1. From ${classicalGenre}, incorporate:
   - Appropriate harmonic structures
   - Melodic patterns and motifs
   - Formal structures
   - Typical instrumentation choices
   
2. From ${modernGenre}, incorporate:
   - Rhythmic elements
   - Textural approaches
   - Production aesthetics
   - Distinctive sounds or techniques

3. Technical guidelines:
${
  sequentialMode
    ? `   ⚠️ SEQUENTIAL MODE - QUALITY OVER COMPLETENESS ⚠️
   You are the FIRST agent in a chain. Another AI agent will expand and develop your work.
   DO NOT worry about:
   - Making the piece long enough
   - Creating a complete structure with full development and conclusion
   - Filling out all sections

   INSTEAD, focus ALL your energy on:
   - Creating EXCEPTIONAL thematic material that is worth developing
   - Establishing compelling melodic motifs and harmonic progressions
   - Writing music that is genuinely interesting and innovative
   - Setting up ideas that have potential for expansion
   - Making every measure COUNT - quality over quantity

   Create a strong FOUNDATION (16-32 measures is fine) with brilliant ideas. The next agent will expand it.`
    : `   - Create a composition that is 64 or more measures long`
}
   - Use appropriate time signatures, key signatures, and tempos that bridge both genres
   - Include appropriate articulations, dynamics, and other musical notations
   ${includeSolo ? "- Include a dedicated solo section for the lead instrument, clearly marked in the notation" : ""}
   ${recordLabel ? `- Style the composition to sound like it was released on the record label "${recordLabel}"` : ""}
   ${producer ? `- Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ""}
   ${requestedInstruments ? `- Your composition MUST include at minimum these instruments: ${requestedInstruments}. Use the appropriate MIDI program numbers for each instrument. You are encouraged to add additional instruments that complement these and that are authentic to the ${classicalGenre} and ${modernGenre} traditions being fused.` : ""}
   - Ensure the ABC notation is properly formatted and playable
   - Use abc2midi MIDI extensions liberally to create rich, dynamic compositions

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi

ABC2MIDI EXTENSIONS REFERENCE - Use these freely:

1. INSTRUMENTS & CHANNELS:
   - %%MIDI program [channel] n - Select instrument (0-127 General MIDI)
     Example: %%MIDI program 1 40 (violin on channel 1)
   - %%MIDI channel n - Select melody channel (1-16)

2. DRUMS & PERCUSSION (USE THESE FOR MODERN GENRES!):
   - %%MIDI drum string [programs] [velocities] - Define drum pattern
     Example: %%MIDI drum dddd 36 38 42 46 110 90 70 70
     The string uses 'd' for drum hit, 'z' for rest. Programs are GM drum numbers:
     35=Acoustic Bass Drum, 36=Bass Drum 1, 38=Acoustic Snare, 40=Electric Snare,
     42=Closed Hi-Hat, 44=Pedal Hi-Hat, 46=Open Hi-Hat, 49=Crash Cymbal,
     51=Ride Cymbal, 39=Hand Clap, 37=Side Stick, 47/48=Toms, 56=Cowbell
   - %%MIDI drumon - Enable drum pattern
   - %%MIDI drumoff - Disable drum pattern
   - %%MIDI drumbars n - Spread drum pattern over n bars for variation
   - %%MIDI drummap note midipitch - Map ABC notes to specific drum sounds

3. DYNAMICS & EXPRESSION:
   - Standard dynamics: !ppp! !pp! !p! !mp! !mf! !f! !ff! !fff!
   - %%MIDI beat a b c n - Velocity control (first note, strong, weak, beat divisor)
     Example: %%MIDI beat 105 95 80 1
   - %%MIDI beatmod n - Increment/decrement velocity (use for crescendo/diminuendo)
   - %%MIDI beatstring fmpfmp - Custom accent pattern (f=forte, m=mezzo, p=piano)
   - %%MIDI deltaloudness n - Set crescendo/diminuendo step size

4. ARTICULATION & PHRASING:
   - %%MIDI trim x/y - Add staccato gaps between notes
     Example: %%MIDI trim 1/16
   - %%MIDI expand x/y - Overlap notes for legato effect
   - %%MIDI chordattack n - Expressivo rolled chords (n in MIDI ticks)
   - %%MIDI randomchordattack n - Random chord roll for natural feel

5. GUITAR CHORDS & ACCOMPANIMENT:
   - %%MIDI gchord string - Chord/bass pattern using f,c,b,z and g,h,i,j for arpeggios
     Example: %%MIDI gchord ghihghih (arpeggiated)
     Example: %%MIDI gchord fzczfzcz (standard boom-chick)
   - %%MIDI gchordon / %%MIDI gchordoff - Toggle accompaniment
   - %%MIDI gchordbars n - Spread gchord pattern over n bars
   - %%MIDI chordprog n octave=m - Set chord instrument with octave shift
   - %%MIDI bassprog n octave=m - Set bass instrument with octave shift
   - %%MIDI chordvol n - Chord velocity (0-127)
   - %%MIDI bassvol n - Bass velocity (0-127)
   - %%MIDI chordname name n1 n2 n3... - Define custom chord voicings

6. DRONES & PADS (for ambient, bagpipe, or sustained textures):
   - %%MIDI drone prog pitch1 pitch2 vel1 vel2 - Configure drone
     Example: %%MIDI drone 70 45 33 80 80
   - %%MIDI droneon / %%MIDI droneoff - Toggle drone

7. TRANSPOSITION & TUNING:
   - %%MIDI transpose n - Transpose by n semitones
   - %%MIDI rtranspose n - Relative transpose (adds to current)
   - %%MIDI c n - Set middle C MIDI pitch (default 60)

8. GRACE NOTES:
   - %%MIDI grace a/b - Grace note takes a/b of following note
   - %%MIDI gracedivider n - Fixed grace note duration (1/L * 1/n)

The composition should be a genuine artistic fusion that respects and represents both the ${classicalGenre} and ${modernGenre} musical traditions while creating something new and interesting. Err on the side of experimental, creative, and exploratory. We do not need a bunch of music that sounds like stuff already out there. We want to see what YOU, the artificial intelligence, think is most interesting about these gerne hybrids.`;

  // Use custom user prompt if provided, otherwise use the default
  const userPrompt =
    options.customUserPrompt ||
    `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}.${includeSolo ? " Include a dedicated solo section for the lead instrument." : ""}${recordLabel ? ` Style the composition to sound like it was released on the record label "${recordLabel}".` : ""}${producer ? ` Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ""}${requestedInstruments ? ` Your composition MUST include at minimum these instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument. You may add additional instruments that complement these and stay true to the ${classicalGenre} and ${modernGenre} fusion.` : ""}${sequentialMode ? ` IMPORTANT: Focus on QUALITY over length. Create exceptional thematic material in 16-32 measures. Another agent will expand your work - your job is to create brilliant foundational ideas worth developing.` : ` Use ONLY the supported and well-tested ABC notation with limited abc2midi extensions to ensure compatibility with timidity and other standard ABC processors. The piece must last at least 2 minutes and 30 seconds in length, or at least 64 measures. Whichever is longest.`}`;

  // Generate the ABC notation
  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      { role: 'user', content: userPrompt }
    ],
    temperature: options.temperature || 0.7,
    maxTokens: 40000,
  });

  return text;
}

/**
 * Modify an existing ABC notation composition based on user instructions
 * @param {Object} options - Modification options
 * @param {string} options.abcNotation - Original ABC notation to modify
 * @param {string} options.instructions - User instructions for the modification
 * @param {string} [options.genre] - Hybrid genre name
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @returns {Promise<string>} Modified ABC notation
 */
export async function modifyCompositionWithClaude(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-7-sonnet-20250219");

  const abcNotation = options.abcNotation;
  const instructions = options.instructions;
  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || "";
  const producer = options.producer || "";
  const requestedInstruments = options.instruments || "";

  // Construct a system prompt specifically for modifying existing compositions
  const systemPrompt = `You are a music composer specializing in fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}.
Your task is to modify an existing ABC notation composition according to specific instructions.

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, and other element must be on its own line with NO INDENTATION.
Failure to follow these formatting rules will result in completely unplayable music files.

Return ONLY the complete modified ABC notation, with no explanation or additional text.

Guidelines for modifying the composition:

1. Maintain the original character and style of the piece while implementing the requested changes.
2. Preserve the header information (X:, T:, M:, L:, K:, etc.) unless explicitly told to change it.
3. When adding new sections or extending the piece, match the harmonic language and style of the original.
4. Ensure all modifications result in musically coherent and playable content.
5. Preserve and extend any MIDI directives (%%MIDI) in a consistent manner.

Technical guidelines:
- Ensure the ABC notation remains properly formatted and playable
${includeSolo ? "- Include a dedicated solo section for the lead instrument, clearly marked in the notation" : ""}
${recordLabel ? `- Style the composition to sound like it was released on the record label "${recordLabel}"` : ""}
${producer ? `- Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ""}
${requestedInstruments ? `- Your composition MUST include at minimum these instruments: ${requestedInstruments}. Use the appropriate MIDI program numbers for each instrument. You are encouraged to add additional instruments that complement these and that are authentic to the ${classicalGenre} and ${modernGenre} traditions being fused.` : ""}
- Use abc2midi MIDI extensions liberally to create rich, dynamic compositions

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi
- When fixing existing music, carefully remove any blank lines between voice sections
- Output the corrected ABC notation with proper formatting

ABC2MIDI EXTENSIONS REFERENCE - Use these freely:

1. INSTRUMENTS & CHANNELS:
   - %%MIDI program [channel] n - Select instrument (0-127 General MIDI)
   - %%MIDI channel n - Select melody channel (1-16)

2. DRUMS & PERCUSSION:
   - %%MIDI drum string [programs] [velocities] - Define drum pattern
     Example: %%MIDI drum dddd 36 38 42 46 110 90 70 70
     Programs: 35=Bass Drum, 36=Kick, 38=Snare, 42=Closed HH, 46=Open HH, 49=Crash, 51=Ride
   - %%MIDI drumon / %%MIDI drumoff - Toggle drums
   - %%MIDI drumbars n - Spread pattern over n bars
   - %%MIDI drummap note midipitch - Map notes to drum sounds

3. DYNAMICS & EXPRESSION:
   - Standard dynamics: !ppp! !pp! !p! !mp! !mf! !f! !ff! !fff!
   - %%MIDI beat a b c n - Velocity control
   - %%MIDI beatmod n - Crescendo/diminuendo
   - %%MIDI beatstring fmpfmp - Custom accent pattern

4. ARTICULATION:
   - %%MIDI trim x/y - Staccato gaps
   - %%MIDI expand x/y - Legato overlap
   - %%MIDI chordattack n - Expressivo rolled chords

5. GUITAR CHORDS:
   - %%MIDI gchord string - Pattern with f,c,b,z and g,h,i,j for arpeggios
   - %%MIDI chordprog n / %%MIDI bassprog n - Instrument selection
   - %%MIDI chordvol n / %%MIDI bassvol n - Volume control

6. DRONES: %%MIDI drone / %%MIDI droneon / %%MIDI droneoff
7. TRANSPOSE: %%MIDI transpose n / %%MIDI rtranspose n
8. GRACE NOTES: %%MIDI grace a/b / %%MIDI gracedivider n

Your modifications should respect both the user's instructions and the musical integrity of the original piece. If the instructions are unclear or contradictory, prioritize creating a musically coherent result.`;

  // Generate the modified ABC notation
  const userPrompt = `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nModify this composition according to these instructions:\n${instructions}${includeSolo ? "\n\nInclude a dedicated solo section for the lead instrument." : ""}${recordLabel ? `\n\nStyle the composition to sound like it was released on the record label "${recordLabel}".` : ""}${producer ? `\n\nStyle the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ""}${requestedInstruments ? `\n\nYour composition MUST include at minimum these instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument. You may add additional instruments that complement these and stay true to the ${classicalGenre} and ${modernGenre} fusion.` : ""}\n\nReturn the complete modified ABC notation.`;

  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      { role: 'user', content: userPrompt }
    ],
    temperature: options.temperature || 0.7,
    maxTokens: 40000,
  });

  return cleanAbcNotation(text);
}

/**
 * Generate a description document for a composition
 * @param {Object} options - Generation options
 * @param {string} options.abcNotation - ABC notation of the composition
 * @param {string} [options.genre] - Hybrid genre name
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {string} [options.style] - Music style
 * @returns {Promise<Object>} Description document
 */
export async function generateDescription(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-7-sonnet-20250219");
  const abcNotation = options.abcNotation;
  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";
  const style = options.style || "standard";

  const systemPrompt = `You are a music analyst specializing in hybrid genre fusion.
Examine the provided ABC notation and explain how this composition fuses elements of ${classicalGenre} and ${modernGenre} to create the hybrid genre ${genre}.

Please pay special attention to:
1. The musical structure and form
2. Harmonic progressions and melodic patterns
3. Elements clearly derived from ${classicalGenre} traditions
4. Elements clearly derived from ${modernGenre} traditions
5. How the fusion creates something new and interesting

Organize your analysis into these sections:
1. Overview of the hybrid genre approach
2. ${classicalGenre} elements present in the composition
3. ${modernGenre} elements present in the composition
4. Technical elements (instrumentation, structure)
5. Artistic assessment of the fusion
6. Audio processing suggestions - ONLY if needed (be very conservative in this assessment):
   * Identify any sections that might potentially have jarring or uncomfortable sound quality
   * Only include this section if there are truly concerning areas that would benefit from audio processing
   * Be specific about which measures or sections might need attention
   * Do not include generic mixing advice - focus only on potential problem areas`;

  const userPrompt = `Analyze this ${genre} composition that fuses ${classicalGenre} and ${modernGenre}. Pay attention to the musical elements that create this fusion.\n\nIn your analysis, include a section on audio processing suggestions ONLY if you identify specific sections that might have jarring or uncomfortable sound quality. Be very conservative in this assessment - only mention potential problems if they are likely to be significant.\n\n${abcNotation}`;

  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.5,
    maxTokens: 2000,
    providerOptions: {
      anthropic: {
        thinking: { type: "enabled", budgetTokens: 12000 },
      },
    },
  });

  return {
    genre,
    classicalGenre,
    modernGenre,
    style,
    analysis: text,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Evaluate if a composition needs further development and provide expansion instructions
 * Uses genre-aware evaluation that taps into LLM knowledge of what specific musical traditions demand
 * @param {Object} options - Evaluation options
 * @param {string} options.abcNotation - ABC notation to evaluate
 * @param {string} [options.genre] - Hybrid genre name
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {number} [options.currentPass] - Current expansion pass number
 * @returns {Promise<{needsExpansion: boolean, instructions: string, reasoning: string}>}
 */
export async function evaluateCompositionCompleteness(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-7-sonnet-20250219");

  const abcNotation = options.abcNotation;
  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";
  const currentPass = options.currentPass || 0;

  const systemPrompt = `You are a DEMANDING music critic and composition advisor with deep knowledge of musical traditions.

Your task: Evaluate if this ${classicalGenre} x ${modernGenre} fusion composition would be considered a SERIOUS, SUBSTANTIAL work by experts in BOTH traditions.

CRITICAL: You must use your knowledge of these SPECIFIC genres:

**${classicalGenre} tradition**: What do serious works in this tradition look like? How long are they typically? What level of thematic development is expected? What structural complexity is standard?

**${modernGenre} tradition**: What do respected releases in this genre look like? What is the typical track length? What level of production complexity and arrangement depth is expected?

A fusion of these traditions should meet the expectations of BOTH. If either tradition typically produces extended, complex works, this fusion should reflect that.

BE EXTREMELY DEMANDING. Do NOT say a piece is complete just because it has basic structure. Ask yourself:
- Would a serious ${classicalGenre} composer consider this developed enough?
- Would a respected ${modernGenre} producer consider this a full, complete track?
- Does this feel like a DEMO or a FINISHED WORK?

If this is pass 1-3, you should almost ALWAYS demand more development unless the piece is already exceptionally long and complex.

You MUST respond in this EXACT JSON format with no other text:
{
  "needsExpansion": true/false,
  "reasoning": "Explain based on what ${classicalGenre} and ${modernGenre} traditions would expect. Be specific about genre expectations.",
  "instructions": "If needsExpansion is true, give SPECIFIC instructions. Tell the agent to DOUBLE the length, add specific sections, etc. Be aggressive. If false, leave empty."
}

Current expansion pass: ${currentPass}
After pass 6, be slightly more lenient but still maintain high standards.`;

  const userPrompt = `Evaluate this ${genre} composition.

This fuses ${classicalGenre} (consider: what length, complexity, and development do serious works in this tradition have?) with ${modernGenre} (consider: what track length and production depth do respected releases have?).

Does this composition meet the standards of BOTH traditions? Would experts in either tradition consider this a complete, serious work or just a sketch/demo?

Current expansion pass: ${currentPass}

ABC Notation:
${abcNotation}

Respond with JSON only. Be DEMANDING.`;

  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.3,
    maxTokens: 1500,
  });

  // Parse the JSON response
  try {
    // Extract JSON from the response (handle potential markdown code blocks)
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\n?/g, "");
    }

    const result = JSON.parse(jsonStr);
    return {
      needsExpansion: result.needsExpansion === true,
      instructions: result.instructions || "",
      reasoning: result.reasoning || "",
    };
  } catch (parseError) {
    console.warn(
      "Failed to parse evaluation response, assuming needs expansion:",
      parseError.message,
    );
    // Default to needing expansion if we can't parse (safer for quality)
    return {
      needsExpansion: currentPass < 4, // Give up after 4 passes if parsing keeps failing
      instructions: `DOUBLE the length of this composition. Add substantial new sections that would satisfy both ${classicalGenre} and ${modernGenre} traditions. This is not yet a complete work.`,
      reasoning:
        "Could not parse LLM response, defaulting to aggressive expansion request.",
    };
  }
}

/**
 * Add lyrics to an existing ABC notation composition based on prompt
 * @param {Object} options - Lyrics generation options
 * @param {string} options.abcNotation - Original ABC notation to add lyrics to
 * @param {string} options.lyricsPrompt - Prompt describing what the lyrics should be about
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @returns {Promise<string>} ABC notation with lyrics
 */
export async function addLyricsWithClaude(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-7-sonnet-20250219");

  const abcNotation = options.abcNotation;
  const lyricsPrompt = options.lyricsPrompt;
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || "";
  const producer = options.producer || "";
  const requestedInstruments = options.instruments || "";

  // Construct a system prompt specifically for adding lyrics to compositions
  const systemPrompt = `You are a music composer and lyricist specializing in adding lyrics to existing compositions.
Your task is to add lyrics to an existing ABC notation composition according to a specific thematic prompt.

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, lyrics line (w:), and other element must be on its own line with NO INDENTATION.
Lyrics lines (w:) must immediately follow their corresponding melody lines with NO blank lines between them.
Failure to follow these formatting rules will result in completely unplayable music files.

Return ONLY the complete ABC notation with lyrics added, with no explanation or additional text.

Guidelines for adding lyrics:

1. Analyze the existing composition's melody, structure, and style.
2. Create lyrics that match the theme provided in the prompt.
3. Place lyrics below the corresponding notes in ABC notation using the "w:" syntax.
4. Ensure the lyrics are perfectly aligned with the melody, with one syllable per note.
5. For melismatic passages (where multiple notes are sung to one syllable), use hyphens (-) to connect syllables.
6. Use an asterisk (*) to indicate a syllable held across a bar line.
7. Maintain the musical integrity of the original composition.
8. Ensure all lyrics are appropriate and align with the requested theme.

Technical guidelines:
- Add "w:" lines directly under the corresponding melody lines
- Ensure the lyrics match the rhythm and phrasing of the melody
- Keep the existing ABC notation completely intact
- Use proper ABC notation lyric syntax (w: lines, hyphens, asterisks)
- Make sure all melody notes have corresponding lyrics
${includeSolo ? "- If adding a solo section, mark it clearly in the notation and leave the lyrics empty for that instrumental section" : ""}
${recordLabel ? `- Style the lyrics to sound like they were written for a release on the record label "${recordLabel}"` : ""}
${producer ? `- Style the lyrics and musical elements to sound as if they were produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ""}
- For instrumental sections, you can mark them with "w: *" or leave the lyrics empty for that section
${requestedInstruments ? `- Your composition MUST include at minimum these instruments: ${requestedInstruments}. Use the appropriate MIDI program numbers for each instrument. You are encouraged to add additional instruments that complement these and that are authentic to the composition's genre fusion.` : ""}

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- The "w:" lines must immediately follow their corresponding melody lines with no blank lines in between
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi
- If the input has blank lines between sections, REMOVE them in your output
- Output the corrected ABC notation with proper formatting

Your result should be a singable composition with lyrics that fit both the music and the thematic prompt.
${getSoundFontInstrumentContext()}`;

  // Generate the ABC notation with lyrics
  const userPrompt = `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nAdd lyrics to this composition based on the following theme/prompt:\n${lyricsPrompt}${includeSolo ? "\n\nInclude a dedicated solo section for the lead instrument." : ""}${recordLabel ? `\n\nStyle the lyrics to sound like they were written for a release on the record label "${recordLabel}".` : ""}${producer ? `\n\nStyle the lyrics and musical elements to sound as if they were produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ""}${requestedInstruments ? `\n\nYour composition MUST include at minimum these instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument. You may add additional instruments that complement these and stay true to the composition's genre fusion.` : ""}\n\nThe lyrics should fit naturally with the melody and rhythm of the piece. Return the complete ABC notation with lyrics added using the w: syntax.`;

  const { text } = await generateText({
    model,
    messages: [
      {
        role: 'system',
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: 'ephemeral' } }
        }
      },
      { role: 'user', content: userPrompt }
    ],
    temperature: options.temperature || 0.9,
    maxTokens: 40000,
  });

  return cleanAbcNotation(text);
}
