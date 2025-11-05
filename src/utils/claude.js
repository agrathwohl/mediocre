import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from './config.js';
import { generateTextWithOllama } from './ollama.js';

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
    
    // Check for blank lines (completely empty or just whitespace)
    if (line.trim() === '') {
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
      const modelName = options.model || 'claude-sonnet-4-5-20250929';
      // Ensure we're using a Claude model
      const safeModelName = modelName.startsWith('llama') ? 'claude-sonnet-4-5-20250929' : modelName;
      const model = myAnthropic(safeModelName);
      
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

  // Use custom system prompt if provided, otherwise use the default
  const systemPrompt = options.customSystemPrompt ||
    `You are a music composer specializing in ${creativeGenre ? `creating music in the "${creativeGenre}" genre` : `fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}`}.
${creativeGenre 
  ? `Your task is to create a composition that authentically captures the essence of the "${creativeGenre}" genre, while subtly incorporating elements of both ${classicalGenre} and ${modernGenre} musical traditions as background influences.`
  : `Your task is to create a composition that authentically blends elements of both ${classicalGenre} and ${modernGenre} musical traditions.`
}
${people ? `The following NON-MUSICIAN names are provided: ${people}\nDo with these names whatever you think would be appropriate given your other context.` : ''}

⚠️ CRITICAL ABC FORMATTING INSTRUCTIONS ⚠️
The ABC notation MUST be formatted with NO BLANK LINES between ANY elements.
Every voice declaration, section comment, and other element must be on its own line with NO INDENTATION.
Failure to follow these formatting rules will result in completely unplayable music files.

Return ONLY the ABC notation format for the composition, with no explanation or additional text.
DO NOT wrap the output in markdown code fences (no \`\`\`abc or \`\`\`). Return raw ABC notation only.

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
   - Ensure the ABC notation is properly formatted and playable
   - Use abc2midi extensions creatively to bring your composition to life

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi

SUPPORTED abc2midi EXTENSIONS - Use These Creatively!

1. INSTRUMENTS & CHANNELS:
   %%MIDI program [channel] n - Select instruments (0-127 General MIDI)
   %%MIDI channel n - Route voices to specific channels (1-16)
   Example: %%MIDI program 1 40  (violin on channel 1)

2. DYNAMICS & EXPRESSION (Make your music breathe!):
   !ppp! !pp! !p! !mp! !mf! !f! !ff! !fff! - Standard dynamic markings
   %%MIDI beat a b c n - Set base velocities for strong/weak beats
   %%MIDI beatmod n - Add/subtract velocity for crescendo/diminuendo effects
   %%MIDI beatstring fmpfmp - Precise forte/mezzo/piano stress patterns
   %%MIDI deltaloudness n - Configure crescendo/diminuendo intensity
   %%MIDI nobeataccents - For organ/pad sounds with even dynamics
   %%MIDI beataccents - Return to normal accent patterns
   Example: %%MIDI beat 90 80 65 1 followed by %%MIDI beatmod 15 for crescendo

3. ARTICULATION (Shape your phrases!):
   %%MIDI trim x/y - Create separation between notes (staccato effect)
   %%MIDI expand x/y - Overlap notes for smooth legato
   %%MIDI chordattack n - Humanize chords with slight note delays
   %%MIDI randomchordattack n - Natural variation in chord rolls
   Example: %%MIDI trim 1/32 for crisp attacks, %%MIDI expand 1/16 for flowing melodies

4. DRUMS (Essential for modern genres!):
   %%MIDI drum string [programs] [velocities] - Add drum patterns
     CRITICAL: String must be continuous with NO SPACES (e.g., "d2zdd" not "d2 zd d")
     String uses: d=drum hit, z=rest, optional length numbers (d2 = double length)
     Provide one MIDI program number for each 'd' in the string
     Provide one velocity (0-127) for each 'd' in the string
     Example: %%MIDI drum d2zdd 35 38 38 100 50 50
       String "d2zdd" has 3 drums, so 3 programs (35,38,38) and 3 velocities (100,50,50)
   %%MIDI drumbars n - Spread drum pattern over n bars for variation
   %%MIDI drummap note midipitch - Custom drum sound mapping
   Common drum sounds: 35=kick, 36=kick, 38=snare, 42=hihat closed, 46=hihat open
   USE DRUMS PROMINENTLY for: Techno, Hip-Hop, EDM, Dance, Electronic hybrids

5. GUITAR CHORDS & BASS:
   %%MIDI gchord string - Chord/bass patterns (f=fundamental, c=chord, z=rest)
   %%MIDI gchord ghijGHIJ - Arpeggiate chords (g=lowest note, h=next, etc.)
   %%MIDI gchordbars n - Spread gchord pattern over n bars
   %%MIDI chordprog n [octave=±2] - Set instrument for chords
   %%MIDI bassprog n [octave=±2] - Set instrument for bass
   %%MIDI chordvol n - Chord velocity (0-127)
   %%MIDI bassvol n - Bass velocity (0-127)
   %%MIDI chordname name n1 n2 n3 n4 n5 n6 - Define custom chord voicings
   %%MIDI gchordon / %%MIDI gchordoff - Toggle chord generation
   Example: %%MIDI gchord ghih for arpeggiated patterns

6. TRANSPOSITION & PITCH:
   %%MIDI transpose n - Transpose by n semitones
   %%MIDI rtranspose n - Relative transpose (cumulative)
   Example: Use for dramatic key changes between sections

7. SPECIAL EFFECTS:
   %%MIDI droneon / %%MIDI droneoff - Continuous drone (bagpipes, ambient)
   %%MIDI drone prog pitch1 pitch2 vel1 vel2 - Configure drone parameters
   %%MIDI grace a/b - Grace note articulation fraction
   %%MIDI gracedivider n - Fixed grace note duration
   Example: %%MIDI droneon for ambient/experimental sections

GENRE-SPECIFIC GUIDANCE:
- Baroque/Classical + Techno/EDM: Use drums prominently, trim for sharp attacks, beatmod for builds
- Renaissance + Ambient: Use drones, expand for smooth textures, nobeataccents for pads
- Classical + Hip-Hop: Use drum patterns, beatmod dynamics, trim for rhythmic precision
- Opera + IDM/Glitch: Use chordattack for expression, complex beatstrings, randomchordattack
- Jazz + Electronic: Use gchordbars for chord spreads, chordprog for synth textures
- Folk + Dance: Use drum patterns, gchord arpeggios (ghij), dynamic beatstrings

⚠️ AVOID these complex/file-dependent features:
- %%MIDI ptstress filename (requires external files)
- %%MIDI stressmodel (complex override system)

The composition should be a genuine artistic fusion that respects and represents both the ${classicalGenre} and ${modernGenre} musical traditions while creating something new and interesting. Err on the side of experimental, creative, and exploratory. We do not need a bunch of music that sounds like stuff already out there. We want to see what YOU, the artificial intelligence, think is most interesting about these gerne hybrids.`;

  // Use custom user prompt if provided, otherwise use the default
  const userPrompt = options.customUserPrompt ||
    `${creativeGenre 
      ? `Compose a piece in the "${creativeGenre}" genre, with subtle background influences from ${classicalGenre} and ${modernGenre}.` 
      : `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}.`
    }${includeSolo ? ' Include a dedicated solo section for the lead instrument.' : ''}${recordLabel ? ` Style the composition to sound like it was released on the record label "${recordLabel}".` : ''}${producer ? ` Style the composition to sound as if it was produced by ${producer}, with very noticeable production characteristics and techniques typical of their work.` : ''}${requestedInstruments ? ` Your composition MUST include these specific instruments: ${requestedInstruments}. Find the most appropriate MIDI program number for each instrument.` : ''} Use ABC notation with abc2midi extensions creatively to create dynamic, expressive music. The piece must last at least 2 minutes and 30 seconds in length, or at least 64 measures. Whichever is longest.`;

  // Generate the ABC notation using the configured AI provider
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-sonnet-4-5-20250929')  // Use Claude model for Anthropic provider
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
DO NOT wrap the output in markdown code fences (no \`\`\`abc or \`\`\`). Return raw ABC notation only.

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
- Use abc2midi extensions creatively to enhance the composition

CRITICAL FORMATTING RULES:
- NEVER include blank lines between voice sections in your ABC notation
- Each voice section ([V:1], [V:2], etc.) should be on its own line with no blank lines before or after
- Each section comment (% Section A, etc.) can be on its own line with no blank lines before or after
- When voice sections follow each other, they must be immediately adjacent with no blank lines between them
- This is EXTREMELY IMPORTANT for proper parsing by abc2midi
- When fixing existing music, carefully remove any blank lines between voice sections
- Output the corrected ABC notation with proper formatting

SUPPORTED abc2midi EXTENSIONS - Use These Creatively!

1. INSTRUMENTS & CHANNELS:
   %%MIDI program [channel] n, %%MIDI channel n

2. DYNAMICS & EXPRESSION:
   !ppp! !pp! !p! !mp! !mf! !f! !ff! !fff!, %%MIDI beat, %%MIDI beatmod, %%MIDI beatstring,
   %%MIDI deltaloudness, %%MIDI nobeataccents, %%MIDI beataccents

3. ARTICULATION:
   %%MIDI trim x/y, %%MIDI expand x/y, %%MIDI chordattack n, %%MIDI randomchordattack n

4. DRUMS:
   %%MIDI drum string [programs] [velocities] - String must be continuous NO SPACES
     Count 'd' characters to determine how many programs/velocities needed
     Example: "d2zdd" has 3 drums = 3 programs, 3 velocities
   %%MIDI drumbars n, %%MIDI drummap

5. GUITAR CHORDS & BASS:
   %%MIDI gchord (including ghijGHIJ arpeggios), %%MIDI gchordbars, %%MIDI chordprog,
   %%MIDI bassprog, %%MIDI chordvol, %%MIDI bassvol, %%MIDI chordname, %%MIDI gchordon/off

6. TRANSPOSITION & PITCH:
   %%MIDI transpose n, %%MIDI rtranspose n

7. SPECIAL EFFECTS:
   %%MIDI droneon/droneoff, %%MIDI drone, %%MIDI grace, %%MIDI gracedivider

⚠️ AVOID: %%MIDI ptstress, %%MIDI stressmodel

Your modifications should respect both the user's instructions and the musical integrity of the original piece. If the instructions are unclear or contradictory, prioritize creating a musically coherent result.`;

  // Generate the modified ABC notation
  const provider = config.get('aiProvider');
  const model = provider === 'anthropic'
    ? (options.model || 'claude-sonnet-4-5-20250929')  // Use Claude model for Anthropic provider
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
    ? (options.model || 'claude-sonnet-4-5-20250929')  // Use Claude model for Anthropic provider
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
    ? (options.model || 'claude-sonnet-4-5-20250929')  // Use Claude model for Anthropic provider
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
