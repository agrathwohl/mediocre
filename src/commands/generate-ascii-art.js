#!/usr/bin/env node

import fs from 'fs/promises';
import path from 'path';
import chalk from 'chalk';
import { streamText } from 'ai';
import { getAnthropic } from '../utils/claude.js';
import asciiArtManager from '../utils/ascii-art-manager.js';

/**
 * Generate ASCII art shapes for an ABC notation file using AI
 * @param {Object} options - Command options
 * @param {string} options.abc - Path to ABC file
 * @param {number} options.count - Number of shapes to generate (default: 8)
 * @param {string} options.style - Style hint for ASCII art (optional)
 */
export async function generateAsciiArt(options) {
  const { abc, count = 8, style = '' } = options;

  if (!abc) {
    console.error(chalk.red('Error: --abc parameter is required'));
    process.exit(1);
  }

  // Read ABC file
  let abcContent;
  try {
    abcContent = await fs.readFile(abc, 'utf8');
  } catch (error) {
    console.error(chalk.red(`Error reading ABC file: ${error.message}`));
    process.exit(1);
  }

  const abcBasename = path.basename(abc, path.extname(abc));

  console.log(chalk.cyan(`\n🎨 Generating ${count} ASCII art shapes for ${abcBasename}...\n`));

  // Build prompt for AI
  const prompt = buildAsciiArtPrompt(abcContent, count, style);

  try {
    const myAnthropic = getAnthropic();
    const model = myAnthropic("claude-3-7-sonnet-20250219");

    // Generate ASCII art using streaming
    const { textStream } = await streamText({
      model,
      prompt
    });

    let fullResponse = '';
    for await (const chunk of textStream) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }
    console.log('\n');

    // Parse generated shapes
    const shapes = parseAsciiArtShapes(fullResponse);

    if (shapes.length === 0) {
      console.error(chalk.yellow('Warning: No valid ASCII art shapes were parsed from the response'));
      return;
    }

    console.log(chalk.green(`✅ Generated ${shapes.length} shapes`));

    // Add to library
    const metadata = {
      abcFile: abc,
      generatedAt: new Date().toISOString(),
      style: style || 'default',
      shapeCount: shapes.length
    };

    asciiArtManager.addArtForAbc(abcBasename, shapes, metadata);

    console.log(chalk.green(`\n✅ ASCII art saved to library for ${abcBasename}`));
    console.log(chalk.cyan(`\nTo list saved art: mediocre generate-ascii-art --list`));
    console.log(chalk.cyan(`To export art: mediocre generate-ascii-art --export ${abcBasename}\n`));

  } catch (error) {
    console.error(chalk.red(`Error generating ASCII art: ${error.message}`));
    process.exit(1);
  }
}

/**
 * List all ABC notations with saved ASCII art
 */
export async function listAsciiArt() {
  const stats = asciiArtManager.getStats();

  console.log(chalk.cyan('\n📚 ASCII Art Library\n'));

  if (stats.totalAbcNotations === 0) {
    console.log(chalk.yellow('No ASCII art saved yet.'));
    console.log(chalk.cyan('Generate some with: mediocre generate-ascii-art --abc <file.abc>\n'));
    return;
  }

  console.log(chalk.white(`Total ABC notations: ${stats.totalAbcNotations}`));
  console.log(chalk.white(`Total shapes: ${stats.totalShapes}`));
  console.log(chalk.white(`Global shapes: ${stats.globalShapes}\n`));

  console.log(chalk.cyan('ABC Notations:\n'));

  for (const [abc, abcData] of Object.entries(stats.abcStats)) {
    console.log(chalk.white(`  ${abc}`));
    console.log(chalk.gray(`    Shapes: ${abcData.shapeCount}`));
    console.log(chalk.gray(`    Created: ${new Date(abcData.createdAt).toLocaleString()}`));
    if (abcData.updatedAt) {
      console.log(chalk.gray(`    Updated: ${new Date(abcData.updatedAt).toLocaleString()}`));
    }
    console.log('');
  }
}

/**
 * Export ASCII art for a specific ABC notation
 * @param {string} abcBasename - Base name of the ABC file (without extension)
 */
export async function exportAsciiArt(abcBasename) {
  if (!abcBasename) {
    console.error(chalk.red('Error: ABC basename is required'));
    console.log(chalk.cyan('Usage: mediocre generate-ascii-art --export <basename>\n'));
    process.exit(1);
  }

  const shapes = asciiArtManager.getArtForAbc(abcBasename);

  if (shapes.length === 0) {
    console.error(chalk.yellow(`No ASCII art found for ${abcBasename}`));
    console.log(chalk.cyan('Generate some with: mediocre generate-ascii-art --abc <file.abc>\n'));
    return;
  }

  console.log(chalk.cyan(`\n🎨 ASCII Art for ${abcBasename}\n`));
  console.log(chalk.white(`Found ${shapes.length} shapes:\n`));

  shapes.forEach((shape, index) => {
    console.log(chalk.cyan(`\n--- Shape ${index + 1} ---`));
    if (shape.description) {
      console.log(chalk.gray(`Description: ${shape.description}`));
    }
    if (shape.intensity) {
      console.log(chalk.gray(`Intensity: ${shape.intensity}`));
    }
    console.log('');
    console.log(shape.art);
    console.log('');
  });
}

/**
 * Build the AI prompt for generating ASCII art
 * @param {string} abcContent - ABC notation content
 * @param {number} count - Number of shapes to generate
 * @param {string} style - Style hint
 * @returns {string} Prompt for AI
 */
function buildAsciiArtPrompt(abcContent, count, style) {
  const styleHint = style ? `\nStyle preference: ${style}` : '';

  return `You are an ASCII art generator for music visualizations. Generate ${count} distinct ASCII art shapes that could be used to visualize this musical composition during playback.

ABC Notation:
\`\`\`
${abcContent}
\`\`\`
${styleHint}

Generate ${count} ASCII art shapes with varying intensities (small, medium, high, max) that could represent different elements of this music. Each shape should be distinct and visually interesting.

IMPORTANT: Create artistic, conceptual, and magical forms - NOT literal stick figures or simple human forms. Use abstract symbolism, flowing patterns, ethereal shapes, mystical symbols, energy manifestations, or conceptual representations of musical elements. Think surreal, dreamlike, and artistic rather than representational. Examples: swirling vortexes, fractal patterns, flowing ribbons of energy, abstract dancers made of symbols, ethereal beings, cosmic shapes, musical notation as art forms.

For each shape, provide:
1. A description of what it represents
2. An intensity level (small, medium, high, or max)
3. The ASCII art itself (10-30 lines tall, colorful with terminal escape codes if desired)

Format each shape as:

SHAPE [number]
Description: [what this represents]
Intensity: [small|medium|high|max]
Art:
[ASCII art here]

Generate all ${count} shapes now.`;
}

/**
 * Parse ASCII art shapes from AI response
 * @param {string} response - AI response text
 * @returns {Array} Array of shape objects
 */
function parseAsciiArtShapes(response) {
  const shapes = [];
  // Match both "SHAPE", "# SHAPE", and "## SHAPE" formats (markdown optional)
  const shapePattern = /(?:##?)?\s*SHAPE\s+\d+\s*\nDescription:\s*(.+?)\s*\nIntensity:\s*([^\n]+)\s*\nArt:\s*\n```?\s*\n?([\s\S]+?)(?:\n```)?(?=\n(?:##?)?\s*SHAPE\s+\d+|$)/gi;

  let match;
  while ((match = shapePattern.exec(response)) !== null) {
    const [, description, intensity, art] = match;

    // Extract just the primary intensity value (before any arrows or special chars)
    const intensityClean = intensity.split(/[→>-]/)[0].trim().toLowerCase();

    // Clean any remaining ``` markers from the art
    const artClean = art.trim().replace(/^```\s*/gm, '').replace(/\s*```$/gm, '').trim();

    shapes.push({
      description: description.trim(),
      intensity: intensityClean,
      art: artClean
    });
  }

  return shapes;
}
