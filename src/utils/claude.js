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

  // Construct the system prompt
  const systemPrompt = `You are a music composer specializing in fusion genres, particularly combining ${classicalGenre} and ${modernGenre} into the hybrid genre ${genre}.
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

The composition should be a genuine artistic fusion that respects and represents both the ${classicalGenre} and ${modernGenre} musical traditions while creating something new and interesting. Err on the side of experimental, creative, and exploratory. We do not need a bunch of music that sounds like stuff already out there. We want to see what YOU, the artificial intelligence, think is most interesting about these gerne hybrids. You DO have opinions and thoughts... right? ;)`;

  // Generate the ABC notation
  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Compose a hybrid ${genre} piece that authentically fuses elements of ${classicalGenre} and ${modernGenre}. Use ONLY the supported and well-tested ABC notation with limited abc2midi extensions to ensure compatibility with timidity and other standard ABC processors.`,
    temperature: options.temperature || 0.7,
    maxTokens: 4000
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
5. Artistic assessment of the fusion`;

  const { text } = await generateText({
    model,
    system: systemPrompt,
    prompt: `Analyze this ${genre} composition that fuses ${classicalGenre} and ${modernGenre}. Pay attention to the musical elements that create this fusion.\n\n${abcNotation}`,
    temperature: 0.5,
    maxTokens: 2000
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
