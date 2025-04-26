/**
 * Genre name generation utility
 * Generates hybrid genre names by combining classical/traditional and modern genres
 * Also provides creative genre name generation using configured AI provider
 */

import { getAIGenerator } from './claude.js';

/**
 * Generate a hybrid genre name by combining elements from classical and modern genres
 * @param {string[]} classicalGenres - Array of classical/traditional music genres
 * @param {string[]} modernGenres - Array of modern music genres
 * @returns {Object} Object containing generated genre, components, and description
 */
export function generateHybridGenre(classicalGenres, modernGenres) {
  // If no genres provided, use defaults
  const classical = classicalGenres && classicalGenres.length > 0 
    ? classicalGenres 
    : [
        "Baroque", "Classical", "Romantic", "Renaissance", "Medieval",
        "Impressionist", "Serialist", "Minimalist", "Neoclassical", "Rococo",
        "Opera", "Cantata", "Oratorio", "Sonata", "Symphony",
        "Chamber", "Concerto", "Ballet", "Fugue", "Gregorian Chant"
      ];
  
  const modern = modernGenres && modernGenres.length > 0 
    ? modernGenres 
    : [
        "Techno", "House", "Drum and Bass", "Dubstep", "Ambient",
        "IDM", "Glitch", "Vaporwave", "Lo-fi", "Chillwave",
        "Trap", "Drill", "Grime", "Hip Hop", "R&B",
        "Rock", "Metal", "Punk", "Grunge", "Indie",
        "Jazz", "Funk", "Disco", "Soul", "Blues"
      ];
  
  // Select random genres from each list
  const classicalGenre = classical[Math.floor(Math.random() * classical.length)];
  const modernGenre = modern[Math.floor(Math.random() * modern.length)];
  
  // Format as hybrid name with "x" between genres
  const hybridName = `${classicalGenre}_x_${modernGenre}`;
  
  // Generate a basic description
  const description = `A fusion of ${classicalGenre} and ${modernGenre} musical elements`;
  
  return {
    name: hybridName,
    components: {
      classical: classicalGenre,
      modern: modernGenre
    },
    description
  };
}

/**
 * Generate multiple hybrid genres
 * @param {string[]} classicalGenres - Array of classical/traditional music genres
 * @param {string[]} modernGenres - Array of modern music genres
 * @param {number} count - Number of hybrid genres to generate
 * @returns {Array<Object>} Array of hybrid genre objects
 */
export function generateMultipleHybridGenres(classicalGenres, modernGenres, count = 1) {
  const genres = [];
  const usedCombinations = new Set();
  
  for (let i = 0; i < count; i++) {
    // Try to generate a unique hybrid genre (up to 10 attempts)
    let attempts = 0;
    let genre;
    
    do {
      genre = generateHybridGenre(classicalGenres, modernGenres);
      const key = `${genre.components.classical}_${genre.components.modern}`;
      
      // If we've already used this combination, try again (up to 10 times)
      if (!usedCombinations.has(key) || attempts >= 10) {
        usedCombinations.add(key);
        break;
      }
      
      attempts++;
    } while (attempts < 10);
    
    genres.push(genre);
  }
  
  return genres;
}

/**
 * Parse comma-separated genre list into array
 * @param {string} genreString - Comma-separated list of genres
 * @returns {string[]} Array of genres
 */
export function parseGenreList(genreString) {
  if (!genreString) return [];
  
  return genreString
    .split(',')
    .map(genre => genre.trim())
    .filter(genre => genre.length > 0);
}

/**
 * Generates a creative genre name for a hybrid composition
 * @param {Object} options - Options for genre name generation
 * @param {string} options.classicalGenre - The classical genre component
 * @param {string} options.modernGenre - The modern genre component
 * @param {number} [options.temperature=0.9] - Temperature for generation (higher = more creative)
 * @param {string} [options.model] - Specific model to use (overrides default)
 * @returns {Promise<Object>} Object containing creative name and original components
 */
export async function generateCreativeGenreName(options) {
  const generator = getAIGenerator();
  
  const classicalGenre = options.classicalGenre;
  const modernGenre = options.modernGenre;
  
  // System prompt specifically designed to generate creative genre names
  const systemPrompt = `You are a music branding expert specializing in creating evocative, memorable names for hybrid musical genres.
Given a classical/traditional genre and a modern genre, your task is to invent a creative portmanteau or fusion name that:

1. Cleverly combines elements of both genre names OR
2. Creates an entirely new term that evokes the essence of both genres OR
3. Uses wordplay, metaphor, or cultural references related to both genres

Your names should be:
- Catchy and memorable (1-3 words maximum)
- Evocative of the musical qualities of both genres
- Original and not generic
- Not simply "[Genre1] [Genre2]" or "[Genre1]tronica"

For example:
- Classical + Hip Hop → "Bachbeat" or "Symphorap" or "Orchestrill"
- Baroque + Techno → "Fugueture" or "Harpsichord Rave" or "BachBeat"
- Opera + Metal → "Aria Shred" or "Heldencore" or "Operatic Thrash"

IMPORTANT GUIDELINES:
- Create EXACTLY ONE creative genre name
- Return ONLY the creative name, with no explanation or additional text
- Keep the name SHORT - maximum 3 words, ideally 1-2 words
- Make it TRULY CREATIVE - avoid generic construction like "Classical Rock" or "[Genre]Fusion"
- Be DARING in your creativity - this is for experimental music
- The name should be pronounceable and memorable`;

  // User prompt with the specific genres
  const userPrompt = `Create a creative, catchy name for a hybrid genre combining ${classicalGenre} and ${modernGenre}. Make it evocative, original and memorable - not just a simple combination of the two words.`;

  // Generate the creative genre name
  const { text } = await generator({
    model: options.model,
    system: systemPrompt,
    prompt: userPrompt,
    temperature: options.temperature || 0.9,
    maxTokens: 50, // Short response is all we need
  });

  // Clean up any whitespace or quotes
  const creativeName = text.trim().replace(/^["']|["']$/g, '');
  
  return {
    creativeName,
    classicalGenre,
    modernGenre,
    originalGenre: `${classicalGenre}_x_${modernGenre}`
  };
}