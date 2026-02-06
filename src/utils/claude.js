import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, streamText } from "ai";
import { config } from "./config.js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  exploreSoundFontsForComposition,
  generateTimidityConfig,
  getCompactSoundFontGuidance,
  getSoundFontsForGenre,
  BANNED_SOUNDFONTS,
} from "./soundfont-tools.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Load existing composition titles from docs/data/compositions.json
 * Used to prevent LLM from reusing titles
 * @returns {Set<string>} Set of existing titles (lowercase for comparison), or empty set if file doesn't exist
 */
function getExistingTitlesSet() {
  const possiblePaths = [
    path.join(__dirname, "../../docs/data/compositions.json"),
    path.join(process.cwd(), "docs/data/compositions.json"),
  ];

  for (const compositionsPath of possiblePaths) {
    try {
      if (fs.existsSync(compositionsPath)) {
        const content = fs.readFileSync(compositionsPath, "utf8");
        const compositions = JSON.parse(content);
        if (Array.isArray(compositions)) {
          const titles = compositions
            .map((c) => c.title)
            .filter((t) => t && typeof t === "string")
            .map((t) => t.toLowerCase().trim());
          return new Set(titles);
        }
      }
    } catch (error) {
      // Continue to next path or return empty
    }
  }

  return new Set();
}

/**
 * Extract title from ABC notation
 * @param {string} abcNotation - ABC notation
 * @returns {string|null} Title or null if not found
 */
function extractTitleFromAbc(abcNotation) {
  const match = abcNotation.match(/^T:\s*(.+)$/m);
  return match ? match[1].trim() : null;
}

/**
 * Check if a title already exists in compositions.json
 * @param {string} title - Title to check
 * @returns {boolean} True if title exists
 */
function titleExists(title) {
  const existingTitles = getExistingTitlesSet();
  return existingTitles.has(title.toLowerCase().trim());
}

/**
 * Generate a unique title for a composition if the current one is taken
 * Makes a small API call to rename the title, with retry if new title also collides
 * @param {string} abcNotation - ABC notation with potentially duplicate title
 * @param {string} genre - Genre for context
 * @returns {Promise<string>} ABC notation with unique title
 */
async function ensureUniqueTitle(abcNotation, genre) {
  let currentTitle = extractTitleFromAbc(abcNotation);
  let result = abcNotation;
  let attempts = 0;
  const maxAttempts = 3;

  while (currentTitle && titleExists(currentTitle) && attempts < maxAttempts) {
    attempts++;
    console.log(`Title "${currentTitle}" already exists, generating unique title (attempt ${attempts})...`);

    const myAnthropic = getAnthropic();
    const model = myAnthropic("claude-3-5-haiku-20241022"); // Use Haiku for this tiny task

    const { text } = await generateText({
      model,
      messages: [
        {
          role: "user",
          content: `The title "${currentTitle}" is already taken. Generate ONE new unique creative title for this ${genre} composition. Return ONLY the new title, nothing else. Be specific and inventive - avoid generic titles like "Serialist Chaos" or "Prepared Noise".`,
        },
      ],
      temperature: 0.9 + (attempts * 0.05), // Increase randomness on retries
      maxTokens: 50,
    });

    const newTitle = text.trim().replace(/^["']|["']$/g, ''); // Remove any quotes
    console.log(`New title: "${newTitle}"`);

    // Replace the title in the ABC notation
    result = result.replace(/^T:\s*.+$/m, `T:${newTitle}`);
    currentTitle = newTitle;
  }

  if (attempts >= maxAttempts && titleExists(currentTitle)) {
    // Last resort: append timestamp to make unique
    const uniqueTitle = `${currentTitle} (${Date.now()})`;
    console.log(`Max attempts reached, using timestamped title: "${uniqueTitle}"`);
    result = result.replace(/^T:\s*.+$/m, `T:${uniqueTitle}`);
  }

  return result;
}
/**
 * Have the LLM select appropriate soundfonts for a genre hybrid
 * This is the first step before generating ABC notation
 * @param {Object} options - Selection options
 * @param {string} options.genre - Hybrid genre (e.g., "baroque_x_synthwave")
 * @param {string} options.classicalGenre - Classical component
 * @param {string} options.modernGenre - Modern component
 * @param {string} [options.instruments] - Requested instruments (comma-separated)
 * @returns {Promise<{soundfonts: Array<string>, reasoning: string}>} Selected soundfonts and reasoning
 */
export async function selectSoundfontsWithClaude(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-5-haiku-20241022"); // Use Haiku for this quick selection task

  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";
  const requestedInstruments = options.instruments || "";

  // Get soundfont recommendations based on genre
  const exploration = exploreSoundFontsForComposition({
    genreHybrid: genre,
    requiredInstruments: requestedInstruments ? requestedInstruments.split(',').map(i => i.trim()) : [],
    style: ''
  });

  // Format the available soundfonts for the LLM
  const availableSoundfonts = `
## Primary Recommendations (Best matches for ${genre}):
${exploration.genreRecommendations.primary.map(sf => `- ${sf.filename} (score: ${sf.score}, presets: ${sf.presetCount}) - Keywords: ${sf.matchedKeywords.join(', ')}`).join('\n')}

## Secondary Options:
${exploration.genreRecommendations.secondary.map(sf => `- ${sf.filename}`).join('\n')}

## Auto-Suggested Selection:
${exploration.suggestedSelection.join(', ')}

## Categories Available:
- Drums: ${exploration.categoryResults.drums.slice(0, 3).map(sf => sf.filename).join(', ')}
- Bass: ${exploration.categoryResults.bass.slice(0, 3).map(sf => sf.filename).join(', ')}
- Strings: ${exploration.categoryResults.strings.slice(0, 3).map(sf => sf.filename).join(', ')}
`;

  const systemPrompt = `You are a music producer selecting soundfonts for a composition.
Given a genre hybrid and available soundfonts, select the BEST soundfonts for this specific fusion.

IMPORTANT RULES:
1. Always include at least ONE general GM soundfont as a base (e.g., "GeneralUser GS v1.471.sf2", "FluidR3 GM + GS.sf2")
2. Select 15-30 soundfonts for proper layering - BUILD A RICH PALETTE
3. Later soundfonts in the list OVERRIDE earlier ones for the same instruments
4. Put general soundfonts FIRST, then add many specialty soundfonts to override specific instruments
5. Consider the specific instruments needed for both ${classicalGenre} and ${modernGenre}
6. Include soundfonts for: drums/percussion, bass, strings, pads, leads, and genre-specific instruments
7. MORE IS BETTER - each soundfont adds depth and character to the final mix

You MUST respond in this EXACT JSON format:
{
  "soundfonts": ["soundfont1.sf2", "soundfont2.sf2", ...],
  "reasoning": "Brief explanation of why these soundfonts work for this genre"
}`;

  const userPrompt = `Select soundfonts for a ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}).

${requestedInstruments ? `Required instruments: ${requestedInstruments}` : ''}

Available soundfonts and recommendations:
${availableSoundfonts}

Select the optimal soundfont combination. Return ONLY the JSON response.`;

  try {
    const { text } = await generateText({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    });

    // Parse the JSON response
    let jsonStr = text.trim();
    if (jsonStr.startsWith("```")) {
      jsonStr = jsonStr.replace(/```json?\n?/g, "").replace(/```\n?/g, "");
    }

    const result = JSON.parse(jsonStr);

    // Validate soundfonts exist and add .sf2 extension if missing
    let validatedSoundfonts = result.soundfonts.map(sf => {
      if (!sf.endsWith('.sf2')) {
        return sf + '.sf2';
      }
      return sf;
    });

    // Filter out banned soundfonts that crash TiMidity
    const bannedFound = validatedSoundfonts.filter(sf => BANNED_SOUNDFONTS.includes(sf));
    if (bannedFound.length > 0) {
      console.warn(`⚠️ Filtering out banned soundfonts that crash TiMidity: ${bannedFound.join(', ')}`);
      validatedSoundfonts = validatedSoundfonts.filter(sf => !BANNED_SOUNDFONTS.includes(sf));
    }

    return {
      soundfonts: validatedSoundfonts,
      reasoning: result.reasoning || "Soundfonts selected based on genre compatibility"
    };
  } catch (error) {
    console.warn("Failed to get LLM soundfont selection, using auto-suggested selection:", error.message);
    // Fall back to auto-suggested selection, also filtering banned soundfonts
    const fallbackSoundfonts = exploration.suggestedSelection.filter(sf => !BANNED_SOUNDFONTS.includes(sf));
    return {
      soundfonts: fallbackSoundfonts,
      reasoning: "Auto-selected based on genre keyword matching"
    };
  }
}

/**
 * Generate a custom TiMidity config for a composition and save it
 * @param {Object} options - Config generation options
 * @param {Array<string>} options.soundfonts - Selected soundfont filenames
 * @param {string} options.outputDir - Directory to save the config
 * @param {string} options.baseFilename - Base filename (without extension)
 * @param {string} [options.title] - Composition title
 * @param {string} [options.genre] - Genre name
 * @returns {string} Path to the saved config file
 */
export function saveCustomTimidityConfig(options) {
  const { soundfonts, outputDir, baseFilename, title = 'Composition', genre = '' } = options;

  // Generate the config content
  const configContent = generateTimidityConfig(soundfonts, { title, genre });

  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Save the config file
  const configPath = path.join(outputDir, `${baseFilename}.timidity.cfg`);
  fs.writeFileSync(configPath, configContent);

  return configPath;
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
 * Prevents segfaults by removing malformed content that crashes the parser
 * @param {string} abcNotation - ABC notation to clean
 * @returns {string} Cleaned ABC notation
 */
export function cleanAbcNotation(abcNotation) {
  let cleanedText = abcNotation
    // === SEGFAULT PREVENTION: Remove LLM artifacts ===
    // Remove markdown code block markers (LLM often wraps ABC in these)
    .replace(/^```(?:abc|ABC|text)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .replace(/```/g, "") // Catch any remaining backticks

    // Remove UTF-8 BOM if present (causes silent parsing failures)
    .replace(/^\uFEFF/, "")

    // Remove carriage returns (Windows line endings cause issues)
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")

    // Remove control characters except newline and tab (cause segfaults)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")

    // Remove any non-ASCII characters that aren't valid ABC notation
    // Keep: standard ASCII, common accidentals, and typical music symbols
    .replace(/[^\x09\x0A\x20-\x7E\xC0-\xFF]/g, "")

    // === BLANK LINE HANDLING ===
    // Remove ALL blank lines between ANY content (most aggressive approach)
    .replace(/\n\s*\n/g, "\n")

    // === VOICE AND LYRIC FORMATTING ===
    .replace(/\n\s*(\[V:)/g, "\n$1") // Fix spacing before bracketed voice declarations
    .replace(/\n\s*(V:)/g, "\nV:") // Fix spacing before unbracketed voice declarations
    .replace(/\n\s*(%\s*Section)/g, "\n$1") // Fix spacing before section comments
    .replace(/\n\s*(w:)/g, "\nw:") // Fix spacing before lyrics lines

    // === SEGFAULT PREVENTION: Fix malformed bar lines ===
    // Fix double bar lines with spaces (causes parser confusion)
    .replace(/\|\s+\|/g, "||")
    .replace(/:\s*\|/g, ":|") // Fix repeat endings
    .replace(/\|\s*:/g, "|:") // Fix repeat beginnings
    .replace(/\|\]\s+/g, "|]") // Fix thick-thin bar lines
    .replace(/\s+\[\|/g, "[|") // Fix thin-thick bar lines

    // Fix repeat bars with extra spaces or malformed patterns
    .replace(/::\s*/g, "::") // Double repeat
    .replace(/\|1\s+/g, "|1") // First ending
    .replace(/\|2\s+/g, "|2") // Second ending
    .replace(/\[\s*1/g, "[1") // Alternative first ending notation
    .replace(/\[\s*2/g, "[2") // Alternative second ending notation

    // === COMMON NOTATION ISSUES ===
    .replace(/\]\s*\n\s*\[/g, "]\n[") // Ensure clean line breaks between bracketed elements
    .replace(/\n\s+/g, "\n") // Remove leading whitespace on any line
    .replace(/\[Q:([^\]]+)\]/g, "Q:$1") // Fix Q: tempo markings (Q: should not be in brackets)
    .replace(/%%MIDI\s+program\s+(\d+)\s+(\d+)/g, "%%MIDI program $1 $2") // Fix MIDI program spacing

    // === SEGFAULT PREVENTION: Fix incomplete/malformed MIDI directives ===
    // Remove MIDI directives with missing values (cause segfaults)
    .replace(/%%MIDI\s+program\s*\n/g, "") // Empty program directive
    .replace(/%%MIDI\s+channel\s*\n/g, "") // Empty channel directive
    .replace(/%%MIDI\s+transpose\s*\n/g, "") // Empty transpose directive
    .replace(/%%MIDI\s+gchord\s*\n/g, "") // Empty gchord directive

    // Fix MIDI directives with invalid program numbers (must be 1-128)
    .replace(/%%MIDI\s+program\s+(\d+)\s+(\d+)/g, (match, channel, program) => {
      const prog = parseInt(program, 10);
      if (prog < 1 || prog > 128) {
        return `%%MIDI program ${channel} 1`; // Default to piano
      }
      return match;
    })

    // === TRAILING WHITESPACE ===
    .trim();

  // Ensure the file ends with a single newline (required by abc2midi)
  return cleanedText + "\n";
}

/**
 * Validates ABC notation by running it through abc2midi
 * Detects segfaults, timeouts, and other fatal errors
 * @param {string} abcFilePath - Path to the ABC file to validate
 * @returns {Promise<{valid: boolean, error: string|null}>} Validation result
 */
export async function validateWithAbc2Midi(abcFilePath) {
  const { execSync } = await import("child_process");
  const fs = await import("fs");
  const tempMidiPath = abcFilePath.replace(".abc", "_validation_temp.mid");

  try {
    // Run abc2midi and capture output
    execSync(`abc2midi "${abcFilePath}" -o "${tempMidiPath}" 2>&1`, {
      timeout: 30000, // 30 second timeout
      encoding: "utf8",
    });

    // Check if MIDI file was created
    if (fs.existsSync(tempMidiPath)) {
      // Clean up temp file
      fs.unlinkSync(tempMidiPath);
      return { valid: true, error: null };
    } else {
      return { valid: false, error: "abc2midi did not produce output file" };
    }
  } catch (error) {
    // Check if abc2midi is not installed (command not found)
    if (error.code === 'ENOENT' || (error.message && error.message.includes('command not found'))) {
      return {
        valid: true, // Don't fail validation if tool is missing
        error: null,
        warning: 'abc2midi not installed - skipping validation (install abcmidi package for validation)'
      };
    }

    // Check for segfault - multiple ways to detect it
    const isSegfault = error.signal === "SIGSEGV" ||
                       error.signal === "SIGABRT" ||
                       (error.status && error.status > 128) ||  // Signals add 128 to exit code
                       (error.message && error.message.includes("segmentation fault")) ||
                       (error.stderr && error.stderr.includes("segmentation fault"));

    if (isSegfault) {
      if (fs.existsSync(tempMidiPath)) {
        fs.unlinkSync(tempMidiPath);
      }
      return {
        valid: false,
        error: "abc2midi SEGFAULTED - ABC notation is invalid",
      };
    }

    if (error.killed) {
      if (fs.existsSync(tempMidiPath)) {
        fs.unlinkSync(tempMidiPath);
      }
      return {
        valid: false,
        error: "abc2midi timed out - ABC notation may be malformed",
      };
    }

    // CRITICAL: If MIDI file was created, it's VALID even with warnings!
    // abc2midi returns non-zero for warnings too, but the file is still usable
    if (fs.existsSync(tempMidiPath)) {
      fs.unlinkSync(tempMidiPath);
      return { valid: true, error: null };
    }

    // Only fail if no MIDI file was created (real errors, not just warnings)
    const actualError = error.stdout || error.stderr || error.message;
    return { valid: false, error: `abc2midi errors:\n${actualError}` };
  }
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

  // Use Claude Sonnet 3.7 for best music generation capabilities
  // const model = myAnthropic("claude-3-7-sonnet-20250219");
  // const model = myAnthropic("claude-sonnet-4-20250514");
  const model = myAnthropic("claude-haiku-4-5-20251001");

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
    ? `
   You are NOT LIKELY to be the only agent working on this piece. If you are beginning a new piece from scratch you are only the first agent in a chain of agents. Another AI agent may expand and develop your work based upon the findings of the "Composition Completion" agent once your work has finished. So, DO NOT worry about:
   - Making the piece long enough
   - Creating a complete structure with full development and conclusion
   - Filling out all sections

   INSTEAD, focus ALL your energy on:
   - Creating EXCEPTIONAL thematic material that is worth developing
   - Establishing compelling melodic motifs and harmonic progressions
   - Writing music that is genuinely interesting and innovative
   - Setting up ideas that have potential for expansion
   - Making every measure COUNT - quality over quantity

   Create a strong FOUNDATION with brilliant ideas or expanding upon the brilliant ideas of the agents that came before you. The next agent, if the composition completion agent decides it is necessary, will expand it to get closer to completion.`
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
   
   CRITICAL - DRUM KIT SELECTION (Channel 10 program changes):
   When selecting drum KITS via %%MIDI program 10 N, you MUST ONLY use these available programs:
   0-66, 76-77, 80, 85, 95-96, 99-110, 118, 125-127
   DO NOT use programs: 67-75, 78-79, 81-84, 86-94, 97-98, 111-117, 119-124
   These missing programs do not exist in our soundfont collection and will cause playback failures.
    Safest choice: Use programs 0-56 (standard GM drum kits guaranteed in all soundfonts).

    BANNED MELODIC INSTRUMENTS - NEVER USE THESE PROGRAMS:
    78 (Whistle), 120 (Guitar Fret Noise), 121 (Breath Noise), 122 (Seashore),
    123 (Bird Tweet), 124 (Telephone Ring), 125 (Helicopter), 126 (Applause), 127 (Gunshot)
    These are novelty sound effects that sound terrible in compositions. DO NOT USE THEM.

    BANNED DRUM NOTES - NEVER USE THESE IN %%MIDI drum OR %%MIDI drummap:
    71 (Short Whistle - B4), 72 (Long Whistle - C5), 73 (Short Guiro - C#5), 74 (Long Guiro - D5),
    78 (Mute Cuica - F#5), 79 (Open Cuica - G5)
    These percussion sounds are annoying novelty effects.

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
  const messages = [
    {
      role: "system",
      content: systemPrompt,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    { role: "user", content: userPrompt },
  ];

  // Use streaming if requested - helps avoid timeout errors on large generations
  if (options.useStreaming) {
    console.log("Using streaming mode for generation...");
    const result = await streamText({
      model,
      messages,
      temperature: options.temperature || 0.7,
      maxTokens: 40000,
    });

    // Collect the full response from the stream
    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
      // Show progress indicator
      if (text.length % 1000 === 0) {
        process.stdout.write(".");
      }
    }
    console.log("\nStreaming complete.");
    // Ensure unique title before returning
    return await ensureUniqueTitle(text, genre);
  }

  // Non-streaming mode (original behavior)
  const { text } = await generateText({
    model,
    messages,
    temperature: options.temperature || 0.7,
    maxTokens: 40000,
  });

  // Ensure unique title before returning
  return await ensureUniqueTitle(text, genre);
}

/**
 * Generate music with custom soundfont selection - full workflow
 * This is the main entry point for music generation that includes:
 * 1. LLM-based soundfont selection for the genre
 * 2. ABC notation generation with soundfont awareness
 * 3. Returns both ABC and selected soundfonts for config generation
 *
 * @param {Object} options - All options from generateMusicWithClaude plus:
 * @param {boolean} [options.skipSoundFontSelection=false] - Skip soundfont selection and use defaults
 * @returns {Promise<{abcNotation: string, soundfonts: Array<string>, soundfontReasoning: string}>}
 */
export async function generateMusicWithSoundfonts(options) {
  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";

  // Step 1: Select soundfonts for this genre (unless skipped)
  let soundfontSelection;
  if (options.skipSoundFontSelection) {
    // Use a basic set of general GM soundfonts
    soundfontSelection = {
      soundfonts: [
        "GeneralUser GS v1.471.sf2",
        "FluidR3 GM + GS.sf2",
        "SGM-128 v1.17.sf2"
      ],
      reasoning: "Using default GM soundfonts (soundfont selection skipped)"
    };
  } else {
    console.log(`Selecting soundfonts for ${genre}...`);
    soundfontSelection = await selectSoundfontsWithClaude({
      genre,
      classicalGenre,
      modernGenre,
      instruments: options.instruments
    });
    console.log(`Selected ${soundfontSelection.soundfonts.length} soundfonts: ${soundfontSelection.soundfonts.slice(0, 3).join(', ')}...`);
    console.log(`Reasoning: ${soundfontSelection.reasoning}`);
  }

  // Step 2: Create a soundfont context section for the prompt
  const soundfontContext = `
## SELECTED SOUNDFONTS FOR THIS COMPOSITION
The following soundfonts have been selected specifically for this ${genre} composition.
Your instrument choices will be rendered using these soundfonts, in this priority order (later ones override earlier):

${soundfontSelection.soundfonts.map((sf, i) => `${i + 1}. ${sf}`).join('\n')}

Selection reasoning: ${soundfontSelection.reasoning}

IMPORTANT: Standard GM instruments (programs 0-127) will sound great with these soundfonts.
Focus on creating excellent music - the soundfont selection ensures your instruments will render well.
`;

  // Step 3: Add soundfont context to the system prompt
  const enhancedSystemPrompt = options.customSystemPrompt
    ? options.customSystemPrompt + "\n\n" + soundfontContext
    : undefined; // Let generateMusicWithClaude use its default, we'll inject context differently

  // If no custom prompt, we need to modify the generation call to include context
  // For now, pass it through the options and let the function handle it
  const abcNotation = await generateMusicWithClaude({
    ...options,
    // Add soundfont context to the user prompt since we can't easily inject into system prompt
    customUserPrompt: options.customUserPrompt
      ? options.customUserPrompt + "\n\n" + soundfontContext
      : `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}.

${soundfontContext}

${options.solo ? "Include a dedicated solo section for the lead instrument." : ""}
${options.recordLabel ? `Style the composition to sound like it was released on the record label "${options.recordLabel}".` : ""}
${options.producer ? `Style the composition to sound as if it was produced by ${options.producer}, with very noticeable production characteristics and techniques typical of their work.` : ""}
${options.instruments ? `Your composition MUST include at minimum these instruments: ${options.instruments}. Find the most appropriate MIDI program number for each instrument. You may add additional instruments that complement these and stay true to the ${classicalGenre} and ${modernGenre} fusion.` : ""}
${options.sequentialMode ? "IMPORTANT: Focus on QUALITY over length. Create exceptional thematic material in 16-32 measures. Another agent will expand your work - your job is to create brilliant foundational ideas worth developing." : "Use ONLY the supported and well-tested ABC notation with limited abc2midi extensions to ensure compatibility with timidity and other standard ABC processors. The piece must last at least 2 minutes and 30 seconds in length, or at least 64 measures. Whichever is longest."}`
  });

  return {
    abcNotation,
    soundfonts: soundfontSelection.soundfonts,
    soundfontReasoning: soundfontSelection.reasoning
  };
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
  // const model = myAnthropic("claude-sonnet-4-20250514");
  const model = myAnthropic("claude-haiku-4-5-20251001");

  const abcNotation = options.abcNotation;
  const instructions = options.instructions;

  // Detect if this is a FIX operation (minimal prompt) vs MODIFY operation (full prompt)
  const isFixOperation = instructions.includes('FIX') &&
    (instructions.includes('abc2midi') || instructions.includes('VALIDATION') || instructions.includes('validation'));

  if (isFixOperation) {
    // MINIMAL prompt for fixing ABC syntax errors - NO composition rules, NO banned notes, JUST fix the syntax
    const fixSystemPrompt = `You are an ABC notation syntax expert. Your ONLY job is to fix ABC notation errors.

Given ABC notation that failed abc2midi validation, fix the SYNTAX ERRORS ONLY.
Do NOT change the music, do NOT add or remove notes, do NOT change instruments.
ONLY fix technical syntax issues that prevent abc2midi from parsing the file.

Return ONLY the fixed ABC notation, nothing else.`;

    const fixUserPrompt = `${instructions}

ABC NOTATION TO FIX:
${abcNotation}`;

    const { text } = await generateText({
      model,
      messages: [
        { role: 'system', content: fixSystemPrompt },
        { role: 'user', content: fixUserPrompt },
      ],
      temperature: 0.2,
      maxTokens: 32000,
    });

    return cleanAbcNotation(text);
  }

  // Regular MODIFY operation - use full prompt
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
   
   CRITICAL - DRUM KIT SELECTION (Channel 10 program changes):
   When selecting drum KITS via %%MIDI program 10 N, ONLY use these available programs:
   0-66, 76-77, 80, 85, 95-96, 99-110, 118, 125-127
   DO NOT use: 67-75, 78-79, 81-84, 86-94, 97-98, 111-117, 119-124 (not in soundfonts).
    Safest: Use programs 0-56 (standard GM drum kits).

    BANNED MELODIC INSTRUMENTS - NEVER USE: 78 (Whistle), 120-127 (Sound Effects)
    BANNED DRUM NOTES - NEVER USE IN %%MIDI drum OR %%MIDI drummap: 71 (Short Whistle), 72 (Long Whistle), 73 (Short Guiro), 74 (Long Guiro), 78 (Mute Cuica), 79 (Open Cuica)

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

  const messages = [
    {
      role: "system",
      content: systemPrompt,
      experimental_providerMetadata: {
        anthropic: { cacheControl: { type: "ephemeral" } },
      },
    },
    { role: "user", content: userPrompt },
  ];

  // Use streaming if requested - helps avoid timeout errors on large generations
  if (options.useStreaming) {
    console.log("Using streaming mode for modification...");
    const result = await streamText({
      model,
      messages,
      temperature: options.temperature || 0.7,
      maxTokens: 40000,
    });

    // Collect the full response from the stream
    let text = "";
    for await (const chunk of result.textStream) {
      text += chunk;
      // Show progress indicator
      if (text.length % 1000 === 0) {
        process.stdout.write(".");
      }
    }
    console.log("\nStreaming complete.");
    // Clean and ensure unique title before returning
    const cleaned = cleanAbcNotation(text);
    return await ensureUniqueTitle(cleaned, genre);
  }

  // Non-streaming mode (original behavior)
  const { text } = await generateText({
    model,
    messages,
    temperature: options.temperature || 0.7,
    maxTokens: 40000,
  });

  // Clean and ensure unique title before returning
  const cleaned = cleanAbcNotation(text);
  return await ensureUniqueTitle(cleaned, genre);
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
        role: "system",
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      { role: "user", content: userPrompt },
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
  const model = myAnthropic("claude-sonnet-4-20250514");

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
        role: "system",
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      { role: "user", content: userPrompt },
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

Your result should be a singable composition with lyrics that fit both the music and the thematic prompt.`;

  // Generate the ABC notation with lyrics
  const userPrompt = `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nAdd lyrics to this composition based on the following theme/prompt:\n${lyricsPrompt}${includeSolo ? "\n\nInclude a dedicated solo section for the lead instrument." : ""}${recordLabel ? `\n\nStyle the lyrics to sound like they were written for a release on the record label "${recordLabel}".` : ""}${producer ? `\n\nStyle the lyrics and musical elements to sound as if they were produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ""}${requestedInstruments ? `\n\nYour composition MUST include at minimum these instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument. You may add additional instruments that complement these and stay true to the composition's genre fusion.` : ""}\n\nThe lyrics should fit naturally with the melody and rhythm of the piece. Return the complete ABC notation with lyrics added using the w: syntax.`;

  const { text } = await generateText({
    model,
    messages: [
      {
        role: "system",
        content: systemPrompt,
        experimental_providerMetadata: {
          anthropic: { cacheControl: { type: "ephemeral" } },
        },
      },
      { role: "user", content: userPrompt },
    ],
    temperature: options.temperature || 0.9,
    maxTokens: 40000,
  });

  return cleanAbcNotation(text);
}
