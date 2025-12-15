#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { getAIGenerator } from "../utils/claude.js";
import asciiArtManager from "../utils/ascii-art-manager.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate AI ASCII art based on ABC notation description
 * @param {Object} options - Command options
 */
export async function generateAsciiArt(options) {
  const { description, abc, count = 8, theme } = options;

  console.log("🎨 Generating ASCII art from ABC notation description...");

  // Read description file if provided
  let descriptionText = "";
  if (description && fs.existsSync(description)) {
    descriptionText = fs.readFileSync(description, "utf8");
    console.log(`📖 Read description from ${description}`);
  } else if (typeof description === "string") {
    descriptionText = description;
  } else {
    throw new Error("Description file not found or no description provided");
  }

  // Extract ABC basename
  let abcBasename = abc;
  if (abc && abc.endsWith(".abc")) {
    abcBasename = path.basename(abc, ".abc");
  }

  if (!abcBasename) {
    throw new Error("ABC notation basename is required");
  }

  // Read actual ABC file if it exists to get additional context
  let abcContent = "";
  const abcPath = abc.endsWith(".abc") ? abc : `${abc}.abc`;
  if (fs.existsSync(abcPath)) {
    abcContent = fs.readFileSync(abcPath, "utf8");
    console.log(`🎵 Read ABC notation from ${abcPath}`);
  }

  // Prepare the prompt for Claude
  const prompt = `You are a master visual artist, set designer, and visual storyteller. You are being tasked with creating ASCII art shapes for a music visualization system. Based on the following musical composition description and ABC notation, generate ${count} unique ASCII art shapes that capture the essence, mood, and rhythm of the music. Envision a visual and choreographic STORYTELLING concept that could be developed from these shapes/characters/objects/designs that you compose for the piece of music. Make reference to time, place, historical event, and other relevant factors in the musical history of the genres, references, and inspirations that the piece of music highlights in its description, BUT DO NOT do so literally. Rather, make reference to plot points that are reasonably connected to the given time period, artists, influences, etc. and tell us a story through the choices you make. In addition to the visual elements you design, you are to map out a one-sentence-long story for each movement of the musical piece, as well as an overall summary that is no greater than 1-2 sentences in length that tells the full plot of your creation.

## Music Description:
${descriptionText}

${
  abcContent
    ? `## ABC Notation:
\`\`\`abc
${abcContent}
\`\`\`
`
    : ""
}

## Requirements:
1. Create ${count} different ASCII art shapes
2. Shapes should vary in size: 2 small (3-5 lines), 2 medium (6-8 lines), 2 large (9-12 lines), 2 extra-large (13-20 lines)
3. Use creative ASCII characters including: basic (-, |, /, \\, _, ^), special (♪, ♫, ♬, ♩, ◊, ○, ●, △, ▲, ▽, ▼), box drawing (┌, ┐, └, ┘, ─, │, ├, ┤), UTF-8 symbols, and other characters that are available in the *Nerd Fonts* glyphs
4. Each shape should reflect the musical characteristics AND/OR your story you wish to tell through the music and your designs.
5. ${theme ? `Follow the theme: ${theme}` : "Be creative with themes"}
6. Make shapes that would look good when animated (moving, scaling, rotating)

Return ONLY a JSON array with this exact structure, no other text:
[
  {
    "art": "multi-line\\nascii\\nart\\nhere",
    "intensity": "small|medium|high|max",
    "theme": "descriptive-theme-name",
    "description": "Brief description of what this represents"
  }
]`;

  try {
    console.log("🤖 Requesting AI-generated ASCII art...");

    const aiGenerator = getAIGenerator();
    const response = await aiGenerator({
      prompt: prompt,
      maxTokens: 4000,
      temperature: 0.9, // Higher creativity for art generation
    });

    // Parse the response
    let shapes;
    try {
      // Handle both object and string responses
      const responseText =
        typeof response === "string" ? response : response.text;
      // Extract JSON from response (in case there's extra text)
      const jsonMatch = responseText.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        throw new Error("No JSON array found in response");
      }
      shapes = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      console.error("Response was:", response);
      throw new Error("Failed to parse AI-generated shapes");
    }

    // Validate shapes
    if (!Array.isArray(shapes) || shapes.length === 0) {
      throw new Error("AI did not generate valid shapes array");
    }

    console.log(`✨ Generated ${shapes.length} ASCII art shapes`);

    // Add metadata from the ABC notation if available
    const metadata = {
      description: descriptionText.slice(0, 500), // First 500 chars
      theme: theme || "auto-generated",
      generatedAt: new Date().toISOString(),
    };

    if (abcContent) {
      // Extract title and other metadata from ABC
      const titleMatch = abcContent.match(/T:([^\n]+)/);
      const composerMatch = abcContent.match(/C:([^\n]+)/);
      const meterMatch = abcContent.match(/M:([^\n]+)/);
      const keyMatch = abcContent.match(/K:([^\n]+)/);

      if (titleMatch) metadata.title = titleMatch[1].trim();
      if (composerMatch) metadata.composer = composerMatch[1].trim();
      if (meterMatch) metadata.meter = meterMatch[1].trim();
      if (keyMatch) metadata.key = keyMatch[1].trim();
    }

    // Store in library
    const entry = asciiArtManager.addArtForAbc(abcBasename, shapes, metadata);

    // Display sample of generated art
    console.log("\n📊 Sample of generated shapes:\n");
    shapes.slice(0, 2).forEach((shape, index) => {
      console.log(`Shape ${index + 1} (${shape.intensity}):`);
      console.log("---");
      console.log(shape.art);
      console.log(`Theme: ${shape.theme}`);
      console.log(`Description: ${shape.description}`);
      console.log("---\n");
    });

    // Show statistics
    const stats = asciiArtManager.getStats();
    console.log("📈 Library Statistics:");
    console.log(`  • Total ABC notations: ${stats.totalAbcNotations}`);
    console.log(`  • Total shapes: ${stats.totalShapes}`);
    console.log(`  • Shapes for ${abcBasename}: ${entry.shapes.length}`);

    return {
      abcBasename,
      shapes: entry.shapes,
      metadata,
    };
  } catch (error) {
    console.error("❌ Error generating ASCII art:", error);
    throw error;
  }
}

/**
 * List all ABC notations with generated art
 */
export function listAsciiArt() {
  const stats = asciiArtManager.getStats();

  console.log("🎨 ASCII Art Library\n");
  console.log(`Total ABC notations: ${stats.totalAbcNotations}`);
  console.log(`Total shapes: ${stats.totalShapes}`);
  console.log(`Global shapes: ${stats.globalShapes}\n`);

  if (stats.totalAbcNotations === 0) {
    console.log(
      'No ASCII art generated yet. Use "mediocre generate-ascii-art" to create some!',
    );
    return;
  }

  console.log("ABC Notations with Generated Art:");
  console.log("─".repeat(50));

  Object.entries(stats.abcStats).forEach(([abc, data]) => {
    console.log(`\n📄 ${abc}`);
    console.log(`   Shapes: ${data.shapeCount}`);
    console.log(`   Created: ${new Date(data.createdAt).toLocaleDateString()}`);
    if (data.updatedAt) {
      console.log(
        `   Updated: ${new Date(data.updatedAt).toLocaleDateString()}`,
      );
    }
  });
}

/**
 * Export shapes for a specific ABC notation
 * @param {string} abcBasename - ABC file basename
 */
export function exportAsciiArt(abcBasename) {
  const shapes = asciiArtManager.getArtForAbc(abcBasename);

  if (shapes.length === 0) {
    console.log(`No ASCII art found for ${abcBasename}`);
    return;
  }

  const formatted = asciiArtManager.formatShapesForVisualization(shapes);
  const outputPath = `${abcBasename}-ascii-art.json`;

  fs.writeFileSync(outputPath, JSON.stringify(formatted, null, 2));
  console.log(`✅ Exported ${shapes.length} shapes to ${outputPath}`);
}
