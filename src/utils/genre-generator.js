/**
 * Genre name generation utility
 * Generates hybrid genre names by combining classical/traditional and modern genres
 */

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