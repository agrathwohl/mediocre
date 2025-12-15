import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from './config.js';
import { generateTextWithOllama } from './ollama.js';
import { AbcValidator } from './abc-validators.js';
import { getSystemPrompt, getUserPrompt, getModifySystemPrompt } from './claude-new-prompt.js';

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
    fixedNotation: null
  };

  // Split the notation into lines for analysis
  const lines = abcNotation.split('\n');
  
  // Check for basic header fields
  const requiredHeaders = ['X:', 'T:', 'M:', 'K:'];
  const foundHeaders = [];
  
  // Detect pattern issues
  let inVoiceSection = false;
  let prevLine = '';
  
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    // Check if we've entered a voice section
    if (line.match(/^V:\d+/)) {
      inVoiceSection = true;
    }

    // CRITICAL: Check for MIDI directives inside voice sections (causes segfaults!)
    if (inVoiceSection && line.match(/^%%MIDI/) && !line.match(/^%%MIDI\s+program\s+\d+\s+\d+/)) {
      result.issues.push(`Line ${lineNum}: MIDI directive inside voice section (causes abc2midi segfault!)`);
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }

    // Check for blank lines (completely empty or just whitespace)
    // Skip the last line if it's empty (normal file ending)
    if (line.trim() === '' && i < lines.length - 1) {
      result.issues.push(`Line ${lineNum}: Blank line detected - will cause ABC parsing errors`);
      result.lineIssues.push(lineNum);
      result.isValid = false;
    }
    
    // Check for indentation (line starts with whitespace)
    if (line !== '' && line.startsWith(' ') || line.startsWith('\t')) {
      result.issues.push(`Line ${lineNum}: Line starts with whitespace - may cause ABC parsing errors`);
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
      // This is a heuristic - not 100% reliable but catches obvious issues
      const prevLineHasNotes = prevLine.match(/[A-Ga-g]/) !== null;
      if (!prevLineHasNotes) {
        result.issues.push(`Line ${lineNum}: Lyrics line (w:) not immediately following a melody line`);
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
 * Validates and fixes %%MIDI drum syntax
 * @param {string} abcNotation - ABC notation to fix
 * @returns {string} ABC notation with corrected drum syntax
 */
export function fixDrumSyntax(abcNotation) {
  // Regex to match %%MIDI drum lines
  // Format: %%MIDI drum <pattern> <programs...> <velocities...> [bar_count]
  // Capture everything up to the end of the numbers, but not subsequent %%MIDI directives
  const drumRegex = /%%MIDI\s+drum\s+([a-z0-9]+)\s+([\d\s]+?)(?=\s*%%MIDI|\s*\n|$)/gi;

  return abcNotation.replace(drumRegex, (match, pattern, numbers) => {
    // CRITICAL: Limit pattern length to prevent absurdly long patterns
    const MAX_PATTERN_LENGTH = 64; // Reasonable max for drum patterns
    if (pattern.length > MAX_PATTERN_LENGTH) {
      console.warn(`⚠️ Drum pattern too long (${pattern.length} chars) - truncating to ${MAX_PATTERN_LENGTH}`);
      pattern = pattern.substring(0, MAX_PATTERN_LENGTH);
    }

    // Count the number of 'd' characters in the pattern
    const drumCount = (pattern.match(/d/g) || []).length;

    // Split the numbers into an array
    const nums = numbers.trim().split(/\s+/).map(n => parseInt(n, 10));

    if (nums.length === 0) {
      console.warn(`⚠️ Warning: %%MIDI drum line has no numbers: ${match}`);
      return match;
    }

    // Determine if there's a bar count at the end
    // Bar count is typically 1-4, while velocities are 60-127
    // If the last number is <= 10, it's likely a bar count
    let barCount = 1; // default
    let values = nums;

    if (nums.length > drumCount * 2 && nums[nums.length - 1] <= 10) {
      barCount = nums[nums.length - 1];
      values = nums.slice(0, -1);
    } else if (nums.length === drumCount * 2) {
      // No bar count provided, that's fine
      barCount = 1;
      values = nums;
    } else {
      // Ambiguous - could be with or without bar count
      // Check if treating last number as bar count makes the math work
      if ((nums.length - 1) === drumCount * 2) {
        barCount = nums[nums.length - 1];
        values = nums.slice(0, -1);
      } else {
        // No valid bar count, use default
        barCount = 1;
        values = nums;
      }
    }

    // We need drumCount programs + drumCount velocities
    const expectedCount = drumCount * 2;
    const actualCount = values.length;

    if (actualCount !== expectedCount) {
      console.warn(`⚠️ Fixing %%MIDI drum syntax error:`);
      console.warn(`   Pattern "${pattern}" has ${drumCount} 'd' characters`);
      console.warn(`   Expected ${drumCount} programs + ${drumCount} velocities = ${expectedCount} numbers`);
      console.warn(`   Found ${actualCount} numbers`);

      // Split into programs and velocities
      // The structure is: [prog1, prog2, ..., progN, vel1, vel2, ..., velN]
      const halfway = Math.floor(actualCount / 2);
      let programs = values.slice(0, halfway);
      let velocities = values.slice(halfway);

      console.warn(`   Detected ${programs.length} programs, ${velocities.length} velocities`);

      // Adjust programs
      if (programs.length > drumCount) {
        console.warn(`   Truncating programs from ${programs.length} to ${drumCount}`);
        programs = programs.slice(0, drumCount);
      } else if (programs.length < drumCount) {
        const needed = drumCount - programs.length;
        console.warn(`   Padding programs with ${needed} default values (38=snare)`);
        while (programs.length < drumCount) {
          programs.push(38); // Acoustic snare
        }
      }

      // Adjust velocities
      if (velocities.length > drumCount) {
        console.warn(`   Truncating velocities from ${velocities.length} to ${drumCount}`);
        velocities = velocities.slice(0, drumCount);
      } else if (velocities.length < drumCount) {
        const needed = drumCount - velocities.length;
        console.warn(`   Padding velocities with ${needed} default values (100)`);
        while (velocities.length < drumCount) {
          velocities.push(100);
        }
      }

      // Recombine
      values = [...programs, ...velocities];

      // Reconstruct the line with newline
      const fixed = `%%MIDI drum ${pattern} ${values.join(' ')} ${barCount}\n`;
      console.warn(`   Fixed: ${fixed}`);
      return fixed;
    }

    // Syntax is correct - but ensure bar count is present and add newline
    const fixed = `%%MIDI drum ${pattern} ${values.join(' ')} ${barCount}\n`;
    return fixed;
  });
}

/**
 * Cleans up ABC notation to ensure proper formatting for abc2midi
 * @param {string} abcNotation - ABC notation to clean
 * @param {Object} options - Generation options for genre-specific handling
 * @returns {string} Cleaned ABC notation
 */
export function cleanAbcNotation(abcNotation, options = {}) {
  let cleanedText = abcNotation
    // First, ensure %%MIDI directives that are on the same line are separated
    .replace(/(%%MIDI[^\n]+)(\s*)(%%MIDI)/g, '$1\n$3')

    // Remove ALL blank lines - multiple passes to ensure complete removal
    .replace(/\n\s*\n+/g, '\n')      // Remove multiple consecutive newlines with optional whitespace
    .replace(/^\s*\n/gm, '')         // Remove blank lines at the start
    .replace(/\n\s*$/gm, '\n')       // Remove trailing whitespace on lines

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

    // Fix invalid pitch specifiers - remove commas after notes
    .replace(/([A-Ga-g][',]*),/g, '$1')    // Remove commas after notes with octave marks
    .trim();                               // Remove any trailing whitespace

  // Apply AbcValidator fixes
  cleanedText = AbcValidator.fixUppercaseApostrophes(cleanedText);
  cleanedText = AbcValidator.limitOctaveMarkers(cleanedText);
  cleanedText = AbcValidator.fixInvalidDynamics(cleanedText);

  // Fix invalid trailing ] on voice lines - these cause segfaults in abc2midi
  // Note: |] is meant to be a final bar line in ABC, but AI often generates it
  // incorrectly at the end of EVERY voice line, causing abc2midi to crash.
  // The multiline flag (m) is intentional - we remove ALL occurrences, not just the last one.
  cleanedText = cleanedText.replace(/\|\]$/gm, '|');  // Remove trailing ] after bar lines

  // Fix voice declarations with invalid name attributes - abc2midi doesn't support name="..."
  cleanedText = cleanedText.replace(/^(V:\d+.*) name="[^"]*"/gm, '$1');  // Remove name="..." from voice declarations

  // Handle drum directives - ALWAYS fix and limit to prevent crashes
  // First fix any syntax errors
  cleanedText = fixDrumSyntax(cleanedText);

  // Then limit the number of drum directives to prevent abc2midi crashes
  const drumDirectiveLimit = 3;
  const drumLines = cleanedText.split('\n').filter(line => line.match(/^%%MIDI\s+drum/));

  if (drumLines.length > drumDirectiveLimit) {
    console.warn(`⚠️ Limiting drum directives from ${drumLines.length} to ${drumDirectiveLimit} to prevent crashes`);
    // Remove excess drum directives
    let drumCount = 0;
    cleanedText = cleanedText.split('\n').filter(line => {
      if (line.match(/^%%MIDI\s+drum/)) {
        drumCount++;
        return drumCount <= drumDirectiveLimit;
      }
      return true;
    }).join('\n');
  }

  // Remove directives that cause abc2midi segfaults
  cleanedText = removeCrashTriggers(cleanedText);

  // Final aggressive blank line removal
  cleanedText = cleanedText
    .replace(/\n\s*\n+/g, '\n')      // Remove any remaining blank lines
    .replace(/^\s*\n/gm, '')         // Remove blank lines at the start
    .replace(/\n\s*$/gm, '\n');      // Remove trailing whitespace

  // Ensure the file ends with a single newline
  return cleanedText + '\n';
}

/**
 * Remove MIDI directives that are known to cause abc2midi crashes
 * @param {string} abcNotation - ABC notation to clean
 * @returns {string} Safer ABC notation
 */
function removeCrashTriggers(abcNotation) {
  let cleaned = abcNotation;

  // 1. Remove %%MIDI transpose (common segfault trigger)
  const transposeMatches = cleaned.match(/%%MIDI\s+(r)?transpose\s+-?\d+/g);
  if (transposeMatches && transposeMatches.length > 0) {
    console.warn(`⚠️ Removing ${transposeMatches.length} %%MIDI transpose directive(s) (known to cause crashes)`);
    cleaned = cleaned.replace(/%%MIDI\s+(r)?transpose\s+-?\d+\s*\n/g, '');
  }

  // 2. Remove %%MIDI nobeataccents/beataccents toggling (can cause crashes)
  const beatAccentMatches = cleaned.match(/%%MIDI\s+(no)?beataccents/g);
  if (beatAccentMatches && beatAccentMatches.length > 0) {
    console.warn(`⚠️ Removing ${beatAccentMatches.length} %%MIDI (no)beataccents directive(s) (known to cause crashes)`);
    cleaned = cleaned.replace(/%%MIDI\s+(no)?beataccents\s*\n/g, '');
  }

  // 3. Remove %%MIDI program changes on channel 10 (drum channel)
  // Channel 10 is reserved for drums and doesn't support program changes
  const channel10ProgMatches = cleaned.match(/%%MIDI\s+program\s+10\s+\d+/g);
  if (channel10ProgMatches && channel10ProgMatches.length > 0) {
    console.warn(`⚠️ Removing ${channel10ProgMatches.length} %%MIDI program directive(s) on channel 10 (drum channel - programs not allowed)`);
    cleaned = cleaned.replace(/%%MIDI\s+program\s+10\s+\d+\s*\n/g, '');
  }

  // 4. Remove invalid drummap directives
  // Valid syntax: %%MIDI drummap <note_letter> <midi_pitch>
  // Example: %%MIDI drummap c 36 (maps note 'c' to kick drum)
  const validDrummapPattern = /^%%MIDI\s+drummap\s+[a-gA-G]\s+\d{1,3}\s*$/;
  const allDrummapLines = cleaned.match(/%%MIDI\s+drummap\s+.*$/gm) || [];
  const invalidDrummaps = allDrummapLines.filter(line => !validDrummapPattern.test(line));

  if (invalidDrummaps.length > 0) {
    console.warn(`⚠️ Removing ${invalidDrummaps.length} invalid %%MIDI drummap directive(s)`);
    console.warn(`  Valid syntax: %%MIDI drummap <note> <midi_pitch> (e.g., "%%MIDI drummap c 36")`);
    // Remove each invalid drummap line
    for (const invalid of invalidDrummaps) {
      cleaned = cleaned.replace(invalid + '\n', '');
    }
  }

  // 5. Fix MIDI directive placement using AbcValidator (critical segfault fix)
  cleaned = AbcValidator.fixMidiDirectivePlacement(cleaned);

  // Also fix high velocities that could cause issues
  cleaned = AbcValidator.fixHighVelocities(cleaned);

  // Remove orphaned MIDI declarations
  cleaned = AbcValidator.fixOrphanedMidiDeclarations(cleaned);

  return cleaned;
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
    // Default to Anthropic/Claude with prompt caching and optional extended thinking
    return async (options) => {
      const myAnthropic = getAnthropic();
      // Only use claude models with Anthropic, never Ollama models
      const modelName = options.model || 'claude-sonnet-4-5';
      // Validate model matches provider
      if (modelName.startsWith('llama') || modelName.includes('qwen') || modelName.includes(':')) {
        console.warn(`⚠️ Warning: Model "${modelName}" appears to be an Ollama model but provider is "anthropic"`);
        console.warn(`   Switching to default Claude model: claude-sonnet-4-5`);
      }
      // Ensure we're using a Claude model
      const safeModelName = (modelName.startsWith('llama') || modelName.includes('qwen') || modelName.includes(':'))
        ? 'claude-sonnet-4-5'
        : modelName;
      const model = myAnthropic(safeModelName);

      // Enable prompt caching by default (min 1024 tokens for Sonnet)
      const enableCache = options.enableCache !== false;
      const enableThinking = options.enableThinking || false;
      const thinkingBudget = options.thinkingBudget || 10000;

      // Build messages array with cache control on system prompt
      const messages = [
        {
          role: 'system',
          content: options.system,
          ...(enableCache && {
            providerOptions: {
              anthropic: { cacheControl: { type: 'ephemeral' } }
            }
          })
        },
        {
          role: 'user',
          content: options.prompt
        }
      ];

      // Build provider options for thinking
      const providerOptions = enableThinking ? {
        anthropic: {
          thinking: { type: 'enabled', budgetTokens: thinkingBudget }
        }
      } : options.providerOptions;

      const result = await generateText({
        model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        ...(providerOptions && { providerOptions })
      });

      // Log cache stats if available
      if (result.providerMetadata?.anthropic?.cacheCreationInputTokens) {
        console.log(`  📦 Cache created: ${result.providerMetadata.anthropic.cacheCreationInputTokens} tokens`);
      }
      if (result.providerMetadata?.anthropic?.cacheReadInputTokens) {
        console.log(`  ♻️  Cache hit: ${result.providerMetadata.anthropic.cacheReadInputTokens} tokens`);
      }

      return result;
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

  // Use custom system prompt if provided, otherwise use the new clean prompt
  const systemPrompt = options.customSystemPrompt || getSystemPrompt({
    creativeGenre,
    classicalGenre,
    modernGenre,
    genre,
    includeSolo,
    recordLabel,
    producer,
    requestedInstruments,
    people
  });

  const userPrompt = options.customUserPrompt || getUserPrompt({
    creativeGenre,
    genre,
    classicalGenre,
    modernGenre,
    includeSolo,
    recordLabel,
    producer,
    requestedInstruments
  });

  // Generate the ABC notation using the configured AI provider
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-sonnet-4-5')  // Use Claude model for Anthropic provider
    : (options.model || 'qwen2.5:7b-instruct');  // Use provided model or default for Ollama

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

  // Use the clean system prompt for modifying compositions
  const systemPrompt = getModifySystemPrompt({
    genre,
    classicalGenre,
    modernGenre,
    includeSolo,
    recordLabel,
    producer,
    requestedInstruments
  });

  // Generate the modified ABC notation
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-sonnet-4-5')  // Use Claude model for Anthropic provider
    : (options.model || 'qwen2.5:7b-instruct');  // Use provided model or default for Ollama
    
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
    ? (options.model || 'claude-sonnet-4-5')  // Use Claude model for Anthropic provider
    : (options.model || 'qwen2.5:7b-instruct');  // Use provided model or default for Ollama

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

⚠️ CRITICAL: DO NOT MODIFY THE EXISTING RHYTHM OR TIMING ⚠️
Keep all bars exactly as they are - do not add or remove notes.
All bars must maintain their correct beat counts.

Return ONLY the complete ABC notation with lyrics added, with no explanation or additional text.
DO NOT wrap the output in markdown code fences (no \`\`\`abc or \`\`\`). Return raw ABC notation only.

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
    ? (options.model || 'claude-sonnet-4-5')  // Use Claude model for Anthropic provider
    : (options.model || 'qwen2.5:7b-instruct');  // Use provided model or default for Ollama

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
