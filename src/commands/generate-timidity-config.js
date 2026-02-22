import fs from 'fs';
import path from 'path';
import { arrangeSoundfontsAndGenerateConfig } from '../agents/timidity-config/index.js';

/**
 * Generate TiMidity config for an existing ABC file
 * @param {string} abcFilePath - Path to ABC file
 * @param {Object} options - Command options
 */
export async function generateTimidityConfig(abcFilePath, options = {}) {
  if (!fs.existsSync(abcFilePath)) {
    throw new Error(`ABC file not found: ${abcFilePath}`);
  }

  // Read ABC file
  const abcNotation = fs.readFileSync(abcFilePath, 'utf-8');
  const abcDir = path.dirname(abcFilePath);
  const abcBasename = path.basename(abcFilePath, '.abc');

  // Look for companion JSON file
  const jsonPath = path.join(abcDir, `${abcBasename}_description.json`);
  let genre = 'Classical_x_Contemporary';
  let classicalGenre = 'Classical';
  let modernGenre = 'Contemporary';

  if (fs.existsSync(jsonPath)) {
    try {
      const description = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (description.genre) genre = description.genre;
      if (description.classicalGenre) classicalGenre = description.classicalGenre;
      if (description.modernGenre) modernGenre = description.modernGenre;
      console.log(`📄 Found companion JSON: ${path.basename(jsonPath)}`);
      console.log(`   Genre: ${genre} (${classicalGenre} × ${modernGenre})`);
    } catch (err) {
      console.warn(`⚠️ Could not parse JSON file: ${err.message}`);
    }
  } else {
    console.log(`ℹ️ No companion JSON found, using defaults`);
  }

  // Override with CLI options if provided
  if (options.genre) genre = options.genre;
  if (options.classicalGenre) classicalGenre = options.classicalGenre;
  if (options.modernGenre) modernGenre = options.modernGenre;

  console.log(`\n🎛️ Generating TiMidity config for ${abcBasename}...`);

  const result = await arrangeSoundfontsAndGenerateConfig({
    abcNotation,
    genre,
    classicalGenre,
    modernGenre,
    outputDir: options.output || abcDir,
    baseFilename: abcBasename,
  });

  console.log(`\n✅ TiMidity config saved: ${result.configPath}`);
  console.log(`   Soundfonts: ${result.soundfonts.length}`);
  console.log(`   Strategy: ${result.layeringStrategy}`);

  return result;
}
