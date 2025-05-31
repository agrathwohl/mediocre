import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from './config.js';
import { generateTextWithOllama } from './ollama.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Validates ABC notation using abc2midi -c for real validation
 * @param {string} abcNotation - ABC notation to validate
 * @param {number} [maxRetries=3] - Maximum number of fix attempts
 * @returns {Promise<Object>} Validation results with issues array and isValid flag
 */
export async function validateAbcNotation(abcNotation, maxRetries = 3) {
  // Initialize result object
  const result = {
    isValid: true,
    issues: [],
    lineIssues: [],
    fixedNotation: null,
    abc2midiErrors: []
  };

  // First do basic formatting validation
  const basicValidation = validateBasicAbcFormatting(abcNotation);
  result.issues = [...basicValidation.issues];
  result.lineIssues = [...basicValidation.lineIssues];
  result.isValid = basicValidation.isValid;

  // Clean the notation first
  let currentNotation = cleanAbcNotation(abcNotation);
  
  // Now test with abc2midi -c
  let attempts = 0;
  while (attempts < maxRetries) {
    const abc2midiValidation = await validateWithAbc2midi(currentNotation);
    
    if (abc2midiValidation.isValid) {
      // Success! abc2midi accepts it
      result.isValid = true;
      result.fixedNotation = currentNotation;
      result.abc2midiErrors = [];
      break;
    } else {
      // abc2midi found errors
      result.isValid = false;
      result.abc2midiErrors = abc2midiValidation.errors;
      result.abc2midiRawOutput = abc2midiValidation.rawOutput;  // Store raw output
      
      if (attempts < maxRetries - 1) {
        // Try to fix with Claude 4
        console.log(`ABC validation failed, attempting fix (attempt ${attempts + 1}/${maxRetries})...`);
        try {
          currentNotation = await fixAbcWithClaude(currentNotation, abc2midiValidation.errors);
        } catch (error) {
          console.error('Error fixing ABC with Claude:', error.message);
          break;
        }
      } else {
        // Max retries reached
        result.fixedNotation = currentNotation;
        break;
      }
    }
    attempts++;
  }

  return result;
}

/**
 * Basic ABC formatting validation (original logic)
 * @param {string} abcNotation - ABC notation to validate
 * @returns {Object} Basic validation results
 */
function validateBasicAbcFormatting(abcNotation) {
  const result = {
    isValid: true,
    issues: [],
    lineIssues: []
  };

  const lines = abcNotation.split('\n');
  const requiredHeaders = ['X:', 'T:', 'M:', 'K:'];
  const foundHeaders = [];
  let prevLine = '';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check for blank lines
    if (line.trim() === '') {
      result.issues.push(`Line ${lineNum}: Blank line detected`);
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }

    // Check for indentation
    if (line !== '' && (line.startsWith(' ') || line.startsWith('\t'))) {
      result.issues.push(`Line ${lineNum}: Line starts with whitespace`);
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }

    // Check for voice declarations not at start of line
    if (line.match(/\s+\[?V:/)) {
      result.issues.push(`Line ${lineNum}: Voice declaration not at start of line`);
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
    if (line.startsWith('w:') && !prevLine.match(/^\[?V:/)) {
      const prevLineHasNotes = prevLine.match(/[A-Ga-g]/) !== null;
      if (!prevLineHasNotes) {
        result.issues.push(`Line ${lineNum}: Lyrics line not following melody line`);
        result.lineIssues.push(lineNum);
        result.isValid = false;
      }
    }

    prevLine = line;
  }

  // Check for missing required headers
  for (const header of requiredHeaders) {
    if (!foundHeaders.includes(header)) {
      result.issues.push(`Missing required header: ${header}`);
      result.isValid = false;
    }
  }

  return result;
}

/**
 * Validates ABC notation using abc2midi -c command
 * @param {string} abcNotation - ABC notation to validate
 * @returns {Promise<Object>} abc2midi validation results
 */
async function validateWithAbc2midi(abcNotation) {
  const tempDir = path.join(__dirname, '../../temp');
  
  // Ensure temp directory exists
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  const tempFile = path.join(tempDir, `validation_${Date.now()}.abc`);
  
  try {
    // Write ABC to temp file
    fs.writeFileSync(tempFile, abcNotation);
    
    // Run abc2midi -c for validation only
    const result = execSync(`abc2midi "${tempFile}" -c`, { 
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe'] 
    });
    
    // If we get here, abc2midi succeeded
    return {
      isValid: true,
      errors: []
    };
    
  } catch (error) {
    // abc2midi failed - parse the error output
    const errorOutput = error.stderr || error.stdout || error.message;
    const errors = parseAbc2midiErrors(errorOutput);
    
    return {
      isValid: false,
      errors: errors,
      rawOutput: errorOutput  // Include raw abc2midi output
    };
  } finally {
    // Clean up temp file
    try {
      if (fs.existsSync(tempFile)) {
        fs.unlinkSync(tempFile);
      }
    } catch (cleanupError) {
      console.warn('Failed to clean up temp file:', cleanupError.message);
    }
  }
}

/**
 * Parse abc2midi error messages into structured format
 * @param {string} errorOutput - Raw error output from abc2midi
 * @returns {Array} Parsed error objects
 */
function parseAbc2midiErrors(errorOutput) {
  const errors = [];
  const lines = errorOutput.split('\n');
  
  for (const line of lines) {
    if (line.includes('Error in line-char')) {
      // Parse format: "Error in line-char 25-74 : Bad pitch specifier ' after note C"
      const match = line.match(/Error in line-char (\d+)-(\d+) : (.+)/);
      if (match) {
        errors.push({
          type: 'error',
          line: parseInt(match[1]),
          char: parseInt(match[2]),
          message: match[3]
        });
      }
    } else if (line.includes('Warning in line-char')) {
      // Parse warnings too
      const match = line.match(/Warning in line-char (\d+)-(\d+) : (.+)/);
      if (match) {
        errors.push({
          type: 'warning',
          line: parseInt(match[1]),
          char: parseInt(match[2]),
          message: match[3]
        });
      }
    }
  }
  
  return errors;
}

/**
 * Use Claude 4 to fix ABC notation based on abc2midi errors
 * @param {string} abcNotation - Original ABC notation
 * @param {Array} errors - Errors from abc2midi
 * @returns {Promise<string>} Fixed ABC notation
 */
async function fixAbcWithClaude(abcNotation, errors) {
  const generator = getAIGenerator();
  
  const errorSummary = errors.map(err => 
    `Line ${err.line}, Char ${err.char}: ${err.message}`
  ).join('\n');
  
  const systemPrompt = `You are an ABC notation expert specializing in fixing abc2midi compatibility issues.

Your task is to fix ABC notation so that it passes abc2midi validation without errors.

⚠️ CRITICAL REQUIREMENTS ⚠️
1. Return ONLY the corrected ABC notation with no explanation
2. Preserve the musical intent as much as possible
3. Fix ALL abc2midi errors reported
4. Ensure proper ABC formatting with NO blank lines between sections
5. Limit octave markers to reasonable ranges (maximum 3 octaves: ''', minimum 3 octaves: ,,,)
6. Use only valid abc2midi syntax extensions

Common fixes needed:
- Remove excessive octave markers (more than 3 ' or , characters)
- Fix invalid pitch specifiers
- Ensure proper bar line placement
- Fix timing/rhythm issues
- Correct chord notation
- Fix voice declaration problems

The output must be valid ABC notation that abc2midi can process without errors.`;
  
  const userPrompt = `Fix the following ABC notation to resolve these abc2midi errors:

ERRORS:
${errorSummary}

ABC NOTATION TO FIX:
${abcNotation}

Return the corrected ABC notation:`;
  
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic' 
    ? 'claude-4-sonnet-20250514'  // Use Claude 4 for fixing
    : config.get('ollamaModel');
  
  const { text } = await generator({
    model: model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: 0.3,  // Lower temperature for more conservative fixes
    maxTokens: 20000
  });
  
  return cleanAbcNotation(text);
}

/**
 * Cleans up ABC notation to ensure proper formatting for abc2midi
 * @param {string} abcNotation - ABC notation to clean
 * @returns {string} Cleaned ABC notation
 */
export function cleanAbcNotation(abcNotation) {
  let cleanedText = abcNotation
    // Remove ALL blank lines between ANY content (most aggressive approach)
    .replace(/\n\s*\n/g, '\n')

    // Ensure proper voice, lyric, and section formatting
    .replace(/\n\s*(\[V:)/g, '\n$1')      // Fix spacing before bracketed voice declarations
    .replace(/\n\s*(V:)/g, '\nV:')        // Fix spacing before unbracketed voice declarations
    .replace(/\n\s*(%\s*Section)/g, '\n$1')  // Fix spacing before section comments
    .replace(/\n\s*(w:)/g, '\nw:')        // Fix spacing before lyrics lines

    // Fix common notation issues
    .replace(/\]\s*\n\s*\[/g, ']\n[')     // Ensure clean line breaks between bracketed elements
    .replace(/\n\s+/g, '\n')              // Remove leading whitespace on any line
    .replace(/\[Q:([^\]]+)\]/g, 'Q:$1')   // Fix Q: tempo markings
    .replace(/%%MIDI\s+program\s+(\d+)\s+(\d+)/g, '%%MIDI program $1 $2') // Fix MIDI program spacing
    .trim();                               // Remove any trailing whitespace

  // Ensure the file ends with a single newline
  return cleanedText + '\n';
}

/**
 * Creates a custom Anthropic instance with the provided API key
 * @returns {object} The Anthropic provider instance
 */
export function getAnthropic() {
  const apiKey = config.get('anthropicApiKey');

  if (!apiKey) {
    throw new Error('Anthropic API key not found. Please set ANTHROPIC_API_KEY in your environment variables or configuration.');
  }

  return createAnthropic({
    apiKey
  });
}

/**
 * Returns the appropriate AI generation function based on the configured provider
 * @returns {Function} The generation function to use
 */
export function getAIGenerator() {
  const provider = config.get('aiProvider');

  if (provider === 'ollama') {
    return async (options) => {
      const result = await generateTextWithOllama({
        model: options.model || config.get('ollamaModel'),
        system: options.system,
        prompt: options.prompt,
        temperature: options.temperature,
        maxTokens: options.maxTokens
      });
      return result;
    };
  } else {
    // Default to Anthropic/Claude
    return async (options) => {
      const myAnthropic = getAnthropic();
      // Only use claude models with Anthropic, never Ollama models
      const modelName = options.model || 'claude-4-opus-20250514';
      // Ensure we're using a Claude model
      const safeModelName = modelName.startsWith('llama') ? 'claude-4-opus-20250514' : modelName;
      const model = myAnthropic(safeModelName);

      console.log('USING THIS MODEL', safeModelName)
      return generateText({
        model,
        system: options.system,
        prompt: options.prompt,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        providerOptions: options.providerOptions
      });
    };
  }
}

/**
 * Generate ABC notation using configured AI provider
 * @param {Object} options - Generation options
 * @param {string} [options.genre] - Hybrid genre in format "Classical_x_Modern"
 * @param {string} [options.creativeGenre] - Creative genre name to use as primary compositional consideration
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {string} [options.style] - Music style
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @param {string} [options.people] - Comma-separated list of NON-MUSICIAN names to include in generation context
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @param {string} [options.customSystemPrompt] - Custom system prompt override
 * @param {string} [options.model] - Specific model to use (overrides default)
 * @returns {Promise<string>} Generated ABC notation
 */
export async function generateMusicWithClaude(options) {
  const generator = getAIGenerator();
  const genre = options.genre || 'Classical_x_Contemporary';
  const creativeGenre = options.creativeGenre || null;
  const classicalGenre = options.classicalGenre || 'Classical';
  const modernGenre = options.modernGenre || 'Contemporary';
  const style = options.style || 'standard';
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';
  const people = options.people || '';
  
  // Detect if this is a beat-driven genre that requires drums
  const beatDrivenGenres = [
    'house', 'techno', 'garage', 'future garage', 'trap', 'dubstep', 'drum & bass', 'drum and bass',
    'breakbeat', 'hip-hop', 'hip hop', 'rap', 'rock', 'metal', 'funk', 'jazz', 'latin',
    'pop', 'r&b', 'rnb', 'electronic', 'edm', 'dance', 'disco', 'trance', 'ambient',
    'downtempo', 'trip-hop', 'trip hop', 'jungle', 'hardstyle', 'hardcore', 'gabber'
  ];
  
  const requiresDrums = beatDrivenGenres.some(beatGenre => 
    modernGenre.toLowerCase().includes(beatGenre) || 
    genre.toLowerCase().includes(beatGenre) ||
    (creativeGenre && creativeGenre.toLowerCase().includes(beatGenre))
  );

  // Use custom system prompt if provided, otherwise use the default
  const systemPrompt = options.customSystemPrompt ||
    `You are a music composer specializing in ${creativeGenre ? `creating music in the "${creativeGenre}" genre` : `fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}`}.
${creativeGenre
  ? `Your task is to create a composition that authentically captures the essence of the "${creativeGenre}" genre, while subtly incorporating elements of both ${classicalGenre} and ${modernGenre} musical traditions as background influences.`
  : `Your task is to create a composition that authentically blends elements of both ${classicalGenre} and ${modernGenre} musical traditions.`
}
${people ? `The following NON-MUSICIAN names are provided: ${people}\nDo with these names whatever you think would be appropriate given your other context.` : ''}

🎵 PRODUCTION PIPELINE INFORMATION 🎵
Your ABC notation will be processed through this exact pipeline:
1. abc2midi infile.abc -OCC -HARP → Convert ABC to MIDI
2. timidity infile.mid -E wpvseozt -a --output-stereo -Ow infile.mid.wav → Convert MIDI to WAV

The -OCC flag enables old chord convention and -HARP makes ornaments=roll for harpist.
The timidity command uses high-quality effects processing for stereo output.

⚠️ CRITICAL ABC2MIDI COMPATIBILITY REQUIREMENTS ⚠️
Your ABC notation MUST be compatible with abc2midi. Violations will cause generation failure.

AUDIBILITY REQUIREMENTS:
- All notes must be audible to the average human auditory system (roughly 20Hz to 20kHz)
- Stay within practical ranges for real instruments when possible
- Avoid extreme octave markings that would create inaudible frequencies
- Consider that very high notes may sound shrill and very low notes may be muddy

FORMATTING RULES:
- NO BLANK LINES between ANY elements
- Each voice/section on its own line with NO INDENTATION
- Voice declarations: [V:1], [V:2], etc.
- Section comments: % Section A

Return ONLY the ABC notation format for the composition, with no explanation or additional text.

${creativeGenre
  ? `Guidelines for the "${creativeGenre}" composition:

1. The creative genre "${creativeGenre}" should be the PRIMARY compositional consideration.
   - Interpret what musical elements would best represent this creative genre
   - Let your imagination explore what this genre name suggests or evokes
   - Be bold and experimental in your approach

2. As secondary influences, subtly incorporate elements from:
   - ${classicalGenre}: Perhaps in harmonic choices, form, or melodic development
   - ${modernGenre}: Perhaps in rhythmic elements, production techniques, or texture

The composition should primarily feel like an authentic "${creativeGenre}" piece, with the classical and modern elements serving only as subtle background influences.`
  : `Guidelines for the ${genre} fusion:

1. From ${classicalGenre}, incorporate:
   - Appropriate harmonic structures
   - Melodic patterns and motifs
   - Formal structures
   - Typical instrumentation choices

2. From ${modernGenre}, incorporate:
   - Rhythmic elements
   - Textural approaches
   - Production aesthetics
   - Distinctive sounds or techniques`
}

3. Technical guidelines:
   - Create a composition that is 64 or more measures long
   - Use appropriate time signatures, key signatures, and tempos that bridge both genres
   - Include appropriate articulations, dynamics, and other musical notations
   ${includeSolo ? '- Include a dedicated solo section for the lead instrument, clearly marked in the notation' : ''}
   ${recordLabel ? `- Style the composition to sound like it was released on the record label "${recordLabel}"` : ''}
   ${producer ? `- Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ''}
   ${requestedInstruments ? `- Your composition MUST include these specific instruments: ${requestedInstruments}. Use the appropriate MIDI program numbers for each instrument.` : ''}
   ${requiresDrums ? `- ⚠️ CRITICAL: This genre (${modernGenre}) is BEAT-DRIVEN and MUST include substantial drum patterns using %%MIDI drum commands. The rhythm and groove are ESSENTIAL to the genre's identity.` : ''}
   - Ensure the ABC notation is properly formatted and playable

🎼 ABC2MIDI SYNTAX EXTENSIONS (USE THESE CREATIVELY!) 🎼

CHANNEL & PROGRAM CONTROL:
- %%MIDI channel n                     (select channel 1-16)
- %%MIDI program [channel] n           (select instrument 0-127)

DYNAMICS & EXPRESSION:
- %%MIDI beat a b c n                  (velocity control: strong/medium/weak notes)
- %%MIDI beatmod n                     (modify velocities by ±n)
- %%MIDI nobeataccents                 (flat dynamics for organs)
- %%MIDI beataccents                   (restore normal accenting)
- %%MIDI beatstring fmpfmp             (custom accent patterns: f=forte, m=medium, p=piano)
- %%MIDI deltaloudness n               (crescendo/diminuendo sensitivity)
- Standard dynamics: !ppp! !pp! !p! !mp! !mf! !f! !ff! !fff!
- Crescendo/Diminuendo: !crescendo(! !crescendo)! !diminuendo(! !diminuendo)!

PITCH & TUNING:
- %%MIDI transpose n                   (transpose by n semitones)
- %%MIDI rtranspose n                  (relative transpose)
- %%MIDI c n                          (set MIDI pitch for middle C, default 60)

CHORD & ACCOMPANIMENT:
- %%MIDI gchord fzczfzcz              (chord patterns: f=fundamental, c=chord, z=rest, b=bass+chord)
- %%MIDI gchord ghihGHIH              (arpeggiated chords: g,h,i,j=individual notes, CAPS=octave lower)
- %%MIDI chordname name n1 n2 n3...   (define custom chord types)
- %%MIDI chordprog n [octave=±2]      (set chord instrument & octave)
- %%MIDI bassprog n [octave=±2]       (set bass instrument & octave)
- %%MIDI chordvol n                   (chord velocity)
- %%MIDI bassvol n                    (bass velocity)
- %%MIDI gchordon / %%MIDI gchordoff  (enable/disable chords)

SPECIAL EFFECTS:
- %%MIDI grace a/b                    (grace note timing)
- %%MIDI gracedivider n               (fixed grace note duration)
- %%MIDI droneon / %%MIDI droneoff    (bagpipe-style drone)
- %%MIDI drone prog pitch1 pitch2 vel1 vel2  (configure drone)

RHYTHM & PERCUSSION:
- %%MIDI drum dzdd 35 38 38 100 50 50 (drum patterns: d=strike, z=rest + programs + velocities)
- %%MIDI drumon / %%MIDI drumoff      (enable/disable drums)
- %%MIDI drumbars n                   (spread drum pattern over n bars)
- %%MIDI gchordbars n                 (spread chord pattern over n bars)

🥁 GENRE-SPECIFIC DRUM REQUIREMENTS 🥁
If the modern genre includes ANY of these beat-driven styles, you MUST include appropriate drum patterns:
- Electronic genres (house, techno, garage, future garage, trap, dubstep, drum & bass, breakbeat): Complex programmed beats
- Hip-hop/rap: Strong kick-snare patterns with hi-hats
- Rock/metal: Traditional drum kit patterns
- Funk: Syncopated groove-heavy patterns  
- Jazz: Swing or complex polyrhythmic patterns
- Latin: Appropriate cultural rhythm patterns
- Pop: Four-on-the-floor or contemporary pop beats
- R&B: Groove-oriented with emphasis on the pocket

For beat-driven genres, use %%MIDI drum patterns extensively and make rhythm a PRIMARY compositional element, not an afterthought!

COMMON DRUM PATTERN EXAMPLES:
- Four-on-the-floor: "dddd 36 36 36 36 127 127 127 127" (kick every beat)
- Hip-hop: "dzdz 36 42 36 42 127 100 127 100" (kick-snare alternating)
- Breakbeat: "dzddzddd 36 42 36 36 42 36 36 36 127 100 127 100 100 127 100 100"
- Garage shuffle: "dzddzd 36 42 36 36 42 36 127 100 100 127 100 127"

Use General MIDI drum map (Channel 10):
- 36: Kick drum, 38: Snare, 42: Hi-hat closed, 46: Hi-hat open
- 49: Crash cymbal, 51: Ride cymbal, 35: Acoustic bass drum
- 40: Electric snare, 44: Pedal hi-hat

TIME SIGNATURES AUTO-SET GCHORD DEFAULTS:
- 2/4, 4/4: fzczfzcz
- 3/4: fzczcz  
- 6/8: fzcfzc
- 9/8: fzcfzcfzc

CREATIVE USAGE ENCOURAGEMENT:
- Use these extensions to create rich, layered compositions
- Experiment with custom chord patterns and drum rhythms
- Try different velocity patterns for expressive dynamics
- Use drones for atmospheric effects
- Create complex arrangements with multiple voices and accompaniment

The composition should be a genuine artistic fusion that respects and represents both the ${classicalGenre} and ${modernGenre} musical traditions while creating something new and interesting. Err on the side of experimental, creative, and exploratory. Make full use of abc2midi's capabilities to create rich, dynamic compositions.`;

  // Use custom user prompt if provided, otherwise use the default
  const userPrompt = options.customUserPrompt ||
    `${creativeGenre
      ? `Compose a piece in the "${creativeGenre}" genre, with subtle background influences from ${classicalGenre} and ${modernGenre}.`
      : `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}.`
    }${includeSolo ? ' Include a dedicated solo section for the lead instrument.' : ''}${recordLabel ? ` Style the composition to sound like it was released on the record label "${recordLabel}".` : ''}${producer ? ` Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${requestedInstruments ? ` Your composition MUST include these specific instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument.` : ''} Use ONLY the supported and well-tested ABC notation with limited abc2midi extensions to ensure compatibility with timidity and other standard ABC processors. The piece must last at least 2 minutes and 30 seconds in length, or at least 64 measures. Whichever is longest.`;

  // Generate the ABC notation using the configured AI provider
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-3-7-sonnet-20250219')  // Use Claude model for Anthropic provider
    : options.model;  // Use provided model for Ollama

  const { text } = await generator({
    model: model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: options.temperature || 0.7,
    maxTokens: 20000,
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
 * @param {string} [options.model] - Specific model to use (overrides default)
 * @returns {Promise<string>} Modified ABC notation
 */
export async function modifyCompositionWithClaude(options) {
  const generator = getAIGenerator();

  const abcNotation = options.abcNotation;
  const instructions = options.instructions;
  const genre = options.genre || 'Classical_x_Contemporary';
  const classicalGenre = options.classicalGenre || 'Classical';
  const modernGenre = options.modernGenre || 'Contemporary';
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';

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
${includeSolo ? '- Include a dedicated solo section for the lead instrument, clearly marked in the notation' : ''}
${recordLabel ? `- Style the composition to sound like it was released on the record label "${recordLabel}"` : ''}
${producer ? `- Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ''}
${requestedInstruments ? `- Your composition MUST include these specific instruments: ${requestedInstruments}. Use the appropriate MIDI program numbers for each instrument.` : ''}
- Use ONLY the following well-supported abc2midi syntax extensions:

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi
- When fixing existing music, carefully remove any blank lines between voice sections
- Output the corrected ABC notation with proper formatting

ONLY USE THESE SUPPORTED EXTENSIONS:

1. Channel and Program selection:
   - %%MIDI program [channel] n
     Example: %%MIDI program 1 40

2. Dynamics:
   - Use standard ABC dynamics notation: !p!, !f!, etc.
   - %%MIDI beat a b c n
     Example: %%MIDI beat 90 80 65 1

3. Transposition (if needed):
   - %%MIDI transpose n
     Example: %%MIDI transpose -12

4. Simple chord accompaniment:
   - %%MIDI gchord string
     Example: %%MIDI gchord fzczfzcz

DO NOT use any unsupported MIDI extensions.

Your modifications should respect both the user's instructions and the musical integrity of the original piece. If the instructions are unclear or contradictory, prioritize creating a musically coherent result.`;

  // Generate the modified ABC notation
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-3-7-sonnet-20250219')  // Use Claude model for Anthropic provider
    : options.model;  // Use provided model for Ollama

  const { text } = await generator({
    model: model,
    system: systemPrompt,
    prompt: `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nModify this composition according to these instructions:\n${instructions}${includeSolo ? '\n\nInclude a dedicated solo section for the lead instrument.' : ''}${recordLabel ? `\n\nStyle the composition to sound like it was released on the record label "${recordLabel}".` : ''}${producer ? `\n\nStyle the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${requestedInstruments ? `\n\nYour composition MUST include these specific instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument.` : ''}\n\nReturn the complete modified ABC notation.`,
    temperature: options.temperature || 0.7,
    maxTokens: 20000,
  });

  // Clean up using our standard ABC notation cleaner
  const cleanedText = cleanAbcNotation(text);

  return cleanedText;
}

/**
 * Generate a description document for a composition
 * @param {Object} options - Generation options
 * @param {string} options.abcNotation - ABC notation of the composition
 * @param {string} [options.genre] - Hybrid genre name
 * @param {string} [options.creativeGenre] - Creative genre name
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {string} [options.style] - Music style
 * @param {string} [options.model] - Specific model to use (overrides default)
 * @returns {Promise<Object>} Description document
 */
export async function generateDescription(options) {
  const generator = getAIGenerator();
  const abcNotation = options.abcNotation;
  const genre = options.genre || 'Classical_x_Contemporary';
  const creativeGenre = options.creativeGenre || null;
  const classicalGenre = options.classicalGenre || 'Classical';
  const modernGenre = options.modernGenre || 'Contemporary';
  const style = options.style || 'standard';

  let systemPrompt = '';
  let promptText = '';

  if (creativeGenre) {
    // System prompt for creative genre
    systemPrompt = `You are a music analyst specializing in creative and experimental genres.
Examine the provided ABC notation and analyze how this composition embodies the creative genre "${creativeGenre}".

Please pay special attention to:
1. The musical structure and form
2. Harmonic progressions and melodic patterns
3. How the composition creatively interprets the "${creativeGenre}" concept
4. Elements that might be subtly influenced by ${classicalGenre} traditions
5. Elements that might be subtly influenced by ${modernGenre} traditions
6. What makes this composition unique and interesting

Organize your analysis into these sections:
1. Overview of the "${creativeGenre}" interpretation
2. Musical characteristics and notable elements
3. Subtle background influences (if any) from ${classicalGenre} and ${modernGenre}
4. Technical elements (instrumentation, structure)
5. Artistic assessment
6. Audio processing suggestions - ONLY if needed (be very conservative in this assessment):
   * Identify any sections that might potentially have jarring or uncomfortable sound quality
   * Only include this section if there are truly concerning areas that would benefit from audio processing
   * Be specific about which measures or sections might need attention
   * Do not include generic mixing advice - focus only on potential problem areas`;

    promptText = `Analyze this "${creativeGenre}" composition with subtle background influences from ${classicalGenre} and ${modernGenre}. Pay attention to how the music interprets and embodies the creative genre concept.\n\nIn your analysis, include a section on audio processing suggestions ONLY if you identify specific sections that might have jarring or uncomfortable sound quality. Be very conservative in this assessment - only mention potential problems if they are likely to be significant.\n\n${abcNotation}`;
  } else {
    // System prompt for hybrid genre
    systemPrompt = `You are a music analyst specializing in hybrid genre fusion.
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

    promptText = `Analyze this ${genre} composition that fuses ${classicalGenre} and ${modernGenre}. Pay attention to the musical elements that create this fusion.\n\nIn your analysis, include a section on audio processing suggestions ONLY if you identify specific sections that might have jarring or uncomfortable sound quality. Be very conservative in this assessment - only mention potential problems if they are likely to be significant.\n\n${abcNotation}`;
  }

  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-3-7-sonnet-20250219')  // Use Claude model for Anthropic provider
    : options.model;  // Use provided model for Ollama

  const { text } = await generator({
    model: model,
    system: systemPrompt,
    prompt: promptText,
    temperature: 0.5,
    maxTokens: 2000,
    providerOptions: provider === 'anthropic' ? {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    } : undefined,
  });

  return {
    genre,
    creativeGenre,
    classicalGenre,
    modernGenre,
    style,
    analysis: text,
    timestamp: new Date().toISOString()
  };
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
 * @param {string} [options.model] - Specific model to use (overrides default)
 * @returns {Promise<string>} ABC notation with lyrics
 */
export async function addLyricsWithClaude(options) {
  const generator = getAIGenerator();

  const abcNotation = options.abcNotation;
  const lyricsPrompt = options.lyricsPrompt;
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || '';
  const producer = options.producer || '';
  const requestedInstruments = options.instruments || '';

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
${includeSolo ? '- If adding a solo section, mark it clearly in the notation and leave the lyrics empty for that instrumental section' : ''}
${recordLabel ? `- Style the lyrics to sound like they were written for a release on the record label "${recordLabel}"` : ''}
${producer ? `- Style the lyrics and musical elements to sound as if they were produced by ${producer}, with very noticeable production characteristics and techniques typical of their work` : ''}
- For instrumental sections, you can mark them with "w: *" or leave the lyrics empty for that section
${requestedInstruments ? `- Your composition MUST include these specific instruments: ${requestedInstruments}. Use the appropriate MIDI program numbers for each instrument.` : ''}

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
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-4-sonnet-20250514')  // Use Claude model for Anthropic provider
    : options.model;  // Use provided model for Ollama

  const { text } = await generator({
    model: model,
    system: systemPrompt,
    prompt: `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nAdd lyrics to this composition based on the following theme/prompt:\n${lyricsPrompt}${includeSolo ? '\n\nInclude a dedicated solo section for the lead instrument.' : ''}${recordLabel ? `\n\nStyle the lyrics to sound like they were written for a release on the record label "${recordLabel}".` : ''}${producer ? `\n\nStyle the lyrics and musical elements to sound as if they were produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${requestedInstruments ? `\n\nYour composition MUST include these specific instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument.` : ''}\n\nThe lyrics should fit naturally with the melody and rhythm of the piece. Return the complete ABC notation with lyrics added using the w: syntax.`,
    temperature: options.temperature || 0.9,
    maxTokens: 40000,
  });

  // Clean up using our standard ABC notation cleaner
  const cleanedText = cleanAbcNotation(text);

  return cleanedText;
}
