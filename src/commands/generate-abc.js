import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  generateMusicWithClaude,
  generateDescription,
  cleanAbcNotation,
  validateAbcNotation,
} from "../utils/claude.js";
import { generateCreativeGenreName } from "../utils/genre-generator.js";
import { config } from "../utils/config.js";
import { extractInstrumentsFromAbc } from "../utils/gm-instruments.js";
import * as logger from "../utils/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Parse hybrid genre name into components
 * @param {string} genreName - Hybrid genre name (format: Classical_x_Modern)
 * @returns {Object} Object with classical and modern components
 */
function parseHybridGenre(genreName) {
  // Default components
  const components = {
    classical: "Classical",
    modern: "Contemporary",
  };

  // Check if follows the hybrid format
  const parts = genreName.toLowerCase().split("_x_");

  if (parts.length === 2) {
    // Preserve original case for display, but match case-insensitive
    const lowerGenreName = genreName.toLowerCase();
    const splitIndex = lowerGenreName.indexOf("_x_");
    components.classical = genreName.substring(0, splitIndex);
    components.modern = genreName.substring(splitIndex + 3);
  }

  return components;
}

/**
 * Generate ABC notation files using Claude
 * @param {Object} options - Command options
 * @param {string} [options.genre] - Music genre (hybrid format preferred: Classical_x_Modern)
 * @param {string} [options.creativeGenre] - Creative genre name to use as primary compositional consideration
 * @param {string} [options.style] - Music style
 * @param {number} [options.count=1] - Number of compositions to generate
 * @param {string} [options.output] - Output directory
 * @param {string} [options.systemPrompt] - Custom system prompt for Claude
 * @param {string} [options.userPrompt] - Custom user prompt for Claude
 * @param {boolean} [options.solo] - Include a musical solo section for the lead instrument
 * @param {string} [options.recordLabel] - Make it sound like it was released on this record label
 * @param {string} [options.producer] - Make it sound as if it was produced by this record producer
 * @param {string} [options.instruments] - Comma-separated list of instruments the output ABC notations must include
 * @param {string} [options.people] - Comma-separated list of NON-MUSICIAN names to include in generation context
 * @returns {Promise<string[]>} Array of generated file paths
 */
export async function generateAbc(options) {
  const count = parseInt(options.count || "1", 10);
  const genre = options.genre || "Classical_x_Contemporary";
  const creativeGenre = options.creativeGenre || null; // Get creative genre if provided
  const style = options.style || "standard";
  const outputDir = options.output || config.get("outputDir");
  const customSystemPrompt = options.systemPrompt;
  const customUserPrompt = options.userPrompt;
  const useCreativeNames = options.creativeNames === true; // Default to false unless explicitly specified
  const includeSolo = options.solo || false;
  const recordLabel = options.recordLabel || "";
  const producer = options.producer || "";
  const requestedInstruments = options.instruments || "";
  const people = options.people || "";

  // Get explicitly passed classical/modern genres or parse from the hybrid genre
  const explicitClassicalGenre = options.classicalGenre;
  const explicitModernGenre = options.modernGenre;
  // Parse the hybrid genre as fallback
  const genreComponents = parseHybridGenre(genre);

  // Ensure the output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const generatedFiles = [];

  for (let i = 0; i < count; i++) {
    // Generate a timestamp
    const timestamp = Date.now();

    try {
      // Generate a creative genre name if requested
      let displayGenre = genre;
      let creativeGenreName = null;

      if (useCreativeNames) {
        console.log("EXPERIMENTAL FEATURE: Generating creative genre name...");
        console.log(
          "WARNING: Creative genre names may produce unpredictable results",
        );
        try {
          const creativeResult = await generateCreativeGenreName({
            classicalGenre: genreComponents.classical,
            modernGenre: genreComponents.modern,
            temperature: 0.9,
            model: options.model,
          });

          creativeGenreName = creativeResult.creativeName;
          console.log(`Generated creative genre name: ${creativeGenreName}`);

          // Use the creative name in the filename but keep the original genres internally
          displayGenre = creativeGenreName;
        } catch (error) {
          console.error("Error generating creative genre name:", error.message);
          // Fall back to standard genre format if creative name generation fails
        }
      }

      // If a creative genre is specified, use it for the filename and display
      const displayCreativeGenre =
        creativeGenre || creativeGenreName || displayGenre;

      // Generate a filename based on genre and style
      const filename = `${displayCreativeGenre}-score${i + 1}-${timestamp}`;

      // Use the explicitly passed classicalGenre and modernGenre from options,
      // or fall back to parsed components from the genre string
      const classicalComponent =
        explicitClassicalGenre || genreComponents.classical;
      const modernComponent = explicitModernGenre || genreComponents.modern;

      // Generate the ABC notation with special attention to genre fusion or creative genre
      if (creativeGenre) {
        console.log(
          `Generating "${creativeGenre}" composition in ${style} style...`,
        );
        console.log(
          `(with background elements from ${classicalComponent} and ${modernComponent})`,
        );
      } else {
        console.log(
          `Generating ${displayGenre} composition in ${style} style...`,
        );
        console.log(`Fusing ${classicalComponent} with ${modernComponent}...`);
      }

      // Log if using a custom system prompt
      if (customSystemPrompt) {
        console.log("Using custom system prompt...");
      }

      // Log which AI provider is being used
      const provider = config.get("aiProvider");
      if (provider === "ollama") {
        console.log(
          `Using Ollama with model: ${options.model || config.get("ollamaModel")}`,
        );
      } else {
        console.log("Using Anthropic Claude");
      }

      const abcNotation = await generateMusicWithClaude({
        genre: creativeGenreName || genre, // Use creative name if available
        creativeGenre: creativeGenre, // Pass the creative genre if specified
        classicalGenre: classicalComponent,
        modernGenre: modernComponent,
        style,
        temperature: 0.7,
        customSystemPrompt,
        customUserPrompt,
        solo: includeSolo,
        recordLabel: recordLabel,
        producer: producer,
        instruments: requestedInstruments,
        people: people,
        model: options.model
      });

      // Extract the instruments used in the composition
      const instruments = extractInstrumentsFromAbc(abcNotation);
      const instrumentString =
        instruments.length > 0 ? instruments.join(", ") : "Default Instrument";

      logger.music(`Using instruments: ${instrumentString}`);

      // Validate requested instruments if specified
      if (requestedInstruments) {
        const requested = requestedInstruments.split(',').map(s => s.trim().toLowerCase());
        const foundLower = instruments.map(i => i.toLowerCase());
        const missing = requested.filter(r => !foundLower.some(f => f.includes(r) || r.includes(f)));

        if (missing.length > 0) {
          logger.warn(`Requested instruments not found: ${missing.join(', ')}`);
          logger.warn(`  Requested: ${requestedInstruments}`);
          logger.warn(`  Found: ${instrumentString}`);
        }
      }

      // First pass: clean the notation with genre-aware handling
      let cleanedAbcNotation = cleanAbcNotation(abcNotation, {
        modernGenre: modernComponent
      });

      // Validate the ABC notation
      const validation = validateAbcNotation(cleanedAbcNotation);

      // If there are issues, log and use the fixed version
      if (!validation.isValid) {
        logger.warn(
          `ABC notation validation issues found for ${filename}.abc:`,
        );
        validation.issues.forEach((issue) => logger.warn(`  - ${issue}`));
        logger.warn(`Auto-fixing ${validation.issues.length} issues...`);
        cleanedAbcNotation = validation.fixedNotation;
      } else {
        logger.success(`ABC notation validation passed for ${filename}.abc`);
      }

      // Save the cleaned and validated ABC notation to a file
      const abcFilePath = path.join(outputDir, `${filename}.abc`);
      fs.writeFileSync(abcFilePath, cleanedAbcNotation);
      generatedFiles.push(abcFilePath);

      // Generate and save the description
      logger.generate("Generating description document...");
      const description = await generateDescription({
        abcNotation,
        genre: creativeGenreName || genre, // Use creative name if available
        creativeGenre: creativeGenre, // Pass the creative genre if specified
        classicalGenre: classicalComponent,
        modernGenre: modernComponent,
        style,
        // Only pass model for Ollama, let Anthropic use its default
        model: options.aiProvider === 'ollama' ? options.model : undefined,
      });

      // Add creative genre name to the description if one was generated or provided
      if (creativeGenre) {
        description.creativeGenre = creativeGenre;
      } else if (creativeGenreName) {
        description.creativeGenreName = creativeGenreName;
      }

      // Save the description as JSON
      const descriptionFilePath = path.join(
        outputDir,
        `${filename}_description.json`,
      );
      fs.writeFileSync(
        descriptionFilePath,
        JSON.stringify(description, null, 2),
      );

      // Create a markdown file with both the ABC notation and description
      let titleGenre = creativeGenre || creativeGenreName || genre;

      const mdContent = `# ${titleGenre} Composition in ${style} Style
      
## Genre Information${creativeGenre ? `\n- Creative Genre: "${creativeGenre}" (primary compositional consideration)` : ""}${creativeGenreName ? `\n- Creative Genre Name: "${creativeGenreName}"` : ""}
- Classical Element: ${classicalComponent}
- Modern Element: ${modernComponent}

## Instruments
${instrumentString}

## ABC Notation

\`\`\`
${abcNotation}
\`\`\`

## Analysis

${description.analysis}
`;
      const mdFilePath = path.join(outputDir, `${filename}.md`);
      fs.writeFileSync(mdFilePath, mdContent);

      logger.success(`Generated ${abcFilePath}`);
    } catch (error) {
      logger.error(`Error generating composition ${i + 1}:`, error);
    }
  }

  return generatedFiles;
}

// If called directly from the command line
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const options = {
    genre: args[0],
    style: args[1],
    count: args[2] || "1",
    output: args[3] || config.get("outputDir"),
  };

  generateAbc(options)
    .then((files) => {
      console.log(`Generated ${files.length} composition(s)`);
      process.exit(0);
    })
    .catch((error) => {
      console.error("Error:", error);
      process.exit(1);
    });
}

