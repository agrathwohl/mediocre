import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { generateText } from 'ai';
import { config } from './config.js';

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
 * Generate ABC notation using Claude
 * @param {Object} options - Generation options
 * @param {string} [options.genre] - Hybrid genre in format "Classical_x_Modern"
 * @param {string} [options.classicalGenre] - Classical component of hybrid genre
 * @param {string} [options.modernGenre] - Modern component of hybrid genre
 * @param {string} [options.style] - Music style
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @param {string} [options.customSystemPrompt] - Custom system prompt override
 * @returns {Promise<string>} Generated ABC notation
 */
export async function generateMusicWithClaude(options) {
  const myAnthropic = getAnthropic();
  const genre = options.genre || 'Classical_x_Contemporary';
  const classicalGenre = options.classicalGenre || 'Classical';
  const modernGenre = options.modernGenre || 'Contemporary';
  const style = options.style || 'standard';

  // Use Claude 3.7 Sonnet for best music generation capabilities
  const model = myAnthropic('claude-3-7-sonnet-20250219');

  // Use custom system prompt if provided, otherwise use the default
  const systemPrompt = options.customSystemPrompt ||
    `You are a music composer specializing in fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}.
Your task is to create a composition that authentically blends elements of both ${classicalGenre} and ${modernGenre} musical traditions.
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
   - Create a composition that is 64 or more measures long
   - Use appropriate time signatures, key signatures, and tempos that bridge both genres
   - Include appropriate articulations, dynamics, and other musical notations
   - Ensure the ABC notation is properly formatted and playable
   - Use ONLY the following well-supported abc2midi syntax extensions:

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

DO NOT use any of these unsupported extensions:
- NO %%MIDI drumvol
- NO %%MIDI drumbar
- NO %%MIDI drumbars
- NO %%MIDI drummap
- NO %%MIDI trim
- NO %%MIDI expand
- NO %%MIDI beatmod
- NO %%MIDI chordattack
- NO %%MIDI randomchordattack

The composition should be a genuine artistic fusion that respects and represents both the ${classicalGenre} and ${modernGenre} musical traditions while creating something new and interesting. Err on the side of experimental, creative, and exploratory. We do not need a bunch of music that sounds like stuff already out there. We want to see what YOU, the artificial intelligence, think is most interesting about these gerne hybrids.`;

  // Use custom user prompt if provided, otherwise use the default
  const userPrompt = options.customUserPrompt ||
    `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}. Use ONLY the supported and well-tested ABC notation with limited abc2midi extensions to ensure compatibility with timidity and other standard ABC processors. The piece must last at least 2 minutes and 30 seconds in length, or at least 64 measures. Whichever is longest.`;

  // Generate the ABC notation
  const { text } = await generateText({
    model,
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
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @returns {Promise<string>} Modified ABC notation
 */
export async function modifyCompositionWithClaude(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic('claude-3-7-sonnet-20250219');

  const abcNotation = options.abcNotation;
  const instructions = options.instructions;
  const genre = options.genre || 'Classical_x_Contemporary';
  const classicalGenre = options.classicalGenre || 'Classical';
  const modernGenre = options.modernGenre || 'Contemporary';

  // Construct a system prompt specifically for modifying existing compositions
  const systemPrompt = `You are a music composer specializing in fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}.
Your task is to modify an existing ABC notation composition according to specific instructions.
Return ONLY the complete modified ABC notation, with no explanation or additional text.

Guidelines for modifying the composition:

1. Maintain the original character and style of the piece while implementing the requested changes.
2. Preserve the header information (X:, T:, M:, L:, K:, etc.) unless explicitly told to change it.
3. When adding new sections or extending the piece, match the harmonic language and style of the original.
4. Ensure all modifications result in musically coherent and playable content.
5. Preserve and extend any MIDI directives (%%MIDI) in a consistent manner.

Technical guidelines:
- Ensure the ABC notation remains properly formatted and playable
- Use ONLY the following well-supported abc2midi syntax extensions:

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
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nModify this composition according to these instructions:\n${instructions}\n\nReturn the complete modified ABC notation.`,
    temperature: options.temperature || 0.7,
    maxTokens: 20000,
  });

  return text;
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
  const model = myAnthropic('claude-3-7-sonnet-20250219');
  const abcNotation = options.abcNotation;
  const genre = options.genre || 'Classical_x_Contemporary';
  const classicalGenre = options.classicalGenre || 'Classical';
  const modernGenre = options.modernGenre || 'Contemporary';
  const style = options.style || 'standard';

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

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Analyze this ${genre} composition that fuses ${classicalGenre} and ${modernGenre}. Pay attention to the musical elements that create this fusion.\n\nIn your analysis, include a section on audio processing suggestions ONLY if you identify specific sections that might have jarring or uncomfortable sound quality. Be very conservative in this assessment - only mention potential problems if they are likely to be significant.\n\n${abcNotation}`,
    temperature: 0.5,
    maxTokens: 2000,
    providerOptions: {
      anthropic: {
        thinking: { type: 'enabled', budgetTokens: 12000 },
      },
    },
  });

  return {
    genre,
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
 * @param {number} [options.temperature=0.7] - Temperature for generation
 * @returns {Promise<string>} ABC notation with lyrics
 */
export async function addLyricsWithClaude(options) {
  const myAnthropic = getAnthropic();
  const model = myAnthropic('claude-3-7-sonnet-20250219');

  const abcNotation = options.abcNotation;
  const lyricsPrompt = options.lyricsPrompt;

  // Construct a system prompt specifically for adding lyrics to compositions
  const systemPrompt = `You are a music composer and lyricist specializing in adding lyrics to existing compositions.
Your task is to add lyrics to an existing ABC notation composition according to a specific thematic prompt.
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
- For instrumental sections, you can mark them with "w: *" or leave the lyrics empty for that section

Your result should be a singable composition with lyrics that fit both the music and the thematic prompt.`;

  // Generate the ABC notation with lyrics
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Here is the original composition in ABC notation:\n\n${abcNotation}\n\nAdd lyrics to this composition based on the following theme/prompt:\n${lyricsPrompt}\n\nThe lyrics should fit naturally with the melody and rhythm of the piece. Return the complete ABC notation with lyrics added using the w: syntax.`,
    temperature: options.temperature || 0.9,
    maxTokens: 40000,
  });

  return text;
}
