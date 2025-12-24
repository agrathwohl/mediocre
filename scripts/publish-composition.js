#!/usr/bin/env node
/**
 * publish-composition.js
 *
 * Asset pipeline script for publishing compositions to the static site.
 *
 * Usage:
 *   node scripts/publish-composition.js <abc-file-path> [options]
 *   node scripts/publish-composition.js --unpublish <id-or-title>
 *   node scripts/publish-composition.js --list
 *
 * Options:
 *   --timidity-cfg <path>   Path to timidity config (default: timidity-test-config.cfg)
 *   --output-dir <path>     Site directory (default: site/)
 *   --skip-wav              Skip WAV generation (use existing)
 *   --skip-webm             Skip WebM encoding (use existing)
 *   --dry-run               Show what would be done without doing it
 *   --unpublish <id>        Remove a composition by ID or title
 *   --list                  List all published compositions
 *   --force                 Skip validation checks (dangerous!)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Default configuration
const CONFIG = {
  timidityCfg: path.join(PROJECT_ROOT, 'timidity-test-config.cfg'),
  siteDir: path.join(PROJECT_ROOT, 'site'),
  mediaDir: path.join(PROJECT_ROOT, 'site', 'media'),
  dataFile: path.join(PROJECT_ROOT, 'site', 'data', 'compositions.json'),
  skipWav: false,
  skipWebm: false,
  dryRun: false,
  force: false
};

/**
 * Parse command line arguments
 */
function parseArgs() {
  const args = process.argv.slice(2);
  let abcPath = null;
  let unpublishId = null;
  let listMode = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--timidity-cfg' && args[i + 1]) {
      CONFIG.timidityCfg = path.resolve(args[++i]);
    } else if (arg === '--output-dir' && args[i + 1]) {
      CONFIG.siteDir = path.resolve(args[++i]);
      CONFIG.mediaDir = path.join(CONFIG.siteDir, 'media');
      CONFIG.dataFile = path.join(CONFIG.siteDir, 'data', 'compositions.json');
    } else if (arg === '--skip-wav') {
      CONFIG.skipWav = true;
    } else if (arg === '--skip-webm') {
      CONFIG.skipWebm = true;
    } else if (arg === '--dry-run') {
      CONFIG.dryRun = true;
    } else if (arg === '--force') {
      CONFIG.force = true;
    } else if (arg === '--unpublish' && args[i + 1]) {
      unpublishId = args[++i];
    } else if (arg === '--list') {
      listMode = true;
    } else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    } else if (!arg.startsWith('-')) {
      abcPath = path.resolve(arg);
    }
  }

  return { abcPath, unpublishId, listMode };
}

function printHelp() {
  console.log(`
publish-composition.js - Publish ABC compositions to the static site

Usage:
  node scripts/publish-composition.js <abc-file-path> [options]
  node scripts/publish-composition.js --unpublish <id-or-title>
  node scripts/publish-composition.js --list

Options:
  --timidity-cfg <path>   Path to timidity config (default: timidity-test-config.cfg)
  --output-dir <path>     Site directory (default: site/)
  --skip-wav              Skip WAV generation (use existing)
  --skip-webm             Skip WebM encoding (use existing)
  --dry-run               Show what would be done without doing it
  --unpublish <id>        Remove a composition by ID or title
  --list                  List all published compositions
  --force                 Skip validation checks (dangerous!)
  --help, -h              Show this help message

Examples:
  # Publish a composition
  node scripts/publish-composition.js output/baroque_x_techno-score1.abc

  # List all published compositions
  node scripts/publish-composition.js --list

  # Remove the most recent composition
  node scripts/publish-composition.js --unpublish latest

  # Remove by title
  node scripts/publish-composition.js --unpublish "Baroque x Techno Fusion"

  # Remove by ID
  node scripts/publish-composition.js --unpublish baroque-x-techno-fusion-1234567890
`);
}

/**
 * Load existing compositions from JSON
 */
function loadCompositions() {
  if (!fs.existsSync(CONFIG.dataFile)) {
    return [];
  }

  try {
    const content = fs.readFileSync(CONFIG.dataFile, 'utf-8');
    return JSON.parse(content);
  } catch {
    return [];
  }
}

/**
 * Save compositions to JSON
 */
function saveCompositions(compositions) {
  const content = JSON.stringify(compositions, null, 2);
  fs.writeFileSync(CONFIG.dataFile, content, 'utf-8');
}

/**
 * List all published compositions
 */
function listCompositions() {
  const compositions = loadCompositions();

  if (compositions.length === 0) {
    console.log('\nNo compositions published yet.\n');
    return;
  }

  console.log(`\n📚 Published Compositions (${compositions.length} total):\n`);
  console.log('─'.repeat(80));

  compositions.forEach((c, i) => {
    const date = c.timestamp ? new Date(c.timestamp).toLocaleDateString() : 'Unknown';
    console.log(`${i + 1}. ${c.title}`);
    console.log(`   ID: ${c.id}`);
    console.log(`   Date: ${date} | Key: ${c.key || '?'} | Tempo: ${c.tempo || '?'}`);
    console.log(`   Media: ${c.mediaSrc}`);
    console.log('');
  });

  console.log('─'.repeat(80));
  console.log(`\nTo unpublish: node scripts/publish-composition.js --unpublish <id-or-title>`);
  console.log(`To unpublish latest: node scripts/publish-composition.js --unpublish latest\n`);
}

/**
 * Unpublish a composition by ID, title, or "latest"
 */
function unpublish(identifier) {
  const compositions = loadCompositions();

  if (compositions.length === 0) {
    console.error('\n❌ No compositions to unpublish.\n');
    process.exit(1);
  }

  let index = -1;
  let composition = null;

  // Handle "latest" keyword
  if (identifier.toLowerCase() === 'latest') {
    index = compositions.length - 1;
    composition = compositions[index];
  } else {
    // Try to find by ID first
    index = compositions.findIndex(c => c.id === identifier);

    // If not found, try title (case-insensitive partial match)
    if (index === -1) {
      index = compositions.findIndex(c =>
        c.title.toLowerCase().includes(identifier.toLowerCase())
      );
    }

    if (index >= 0) {
      composition = compositions[index];
    }
  }

  if (!composition) {
    console.error(`\n❌ Composition not found: "${identifier}"`);
    console.error('\nUse --list to see all published compositions.\n');
    process.exit(1);
  }

  console.log(`\n🗑️  Unpublishing: ${composition.title}`);
  console.log(`   ID: ${composition.id}`);

  if (CONFIG.dryRun) {
    console.log('\n[DRY RUN] Would remove:');
    console.log(`   - Entry from compositions.json`);
    console.log(`   - Media file: ${composition.mediaSrc}`);
    console.log('');
    return;
  }

  // Remove from compositions array
  compositions.splice(index, 1);
  saveCompositions(compositions);
  console.log('   ✓ Removed from compositions.json');

  // Delete media file if it exists
  const mediaPath = path.join(CONFIG.siteDir, composition.mediaSrc);
  if (fs.existsSync(mediaPath)) {
    fs.unlinkSync(mediaPath);
    console.log(`   ✓ Deleted: ${mediaPath}`);
  } else {
    console.log(`   ⚠ Media file not found: ${mediaPath}`);
  }

  console.log(`\n✅ Successfully unpublished "${composition.title}"\n`);
  console.log(`   Remaining compositions: ${compositions.length}\n`);
}

/**
 * Parse ABC file for metadata
 */
function parseAbcMetadata(abcContent) {
  const metadata = {
    title: null,
    composer: null,
    key: null,
    meter: null,
    tempo: null,
    noteLength: null
  };

  const lines = abcContent.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith('T:')) {
      metadata.title = trimmed.substring(2).trim();
    } else if (trimmed.startsWith('C:')) {
      metadata.composer = trimmed.substring(2).trim();
    } else if (trimmed.startsWith('K:')) {
      metadata.key = trimmed.substring(2).trim();
    } else if (trimmed.startsWith('M:')) {
      metadata.meter = trimmed.substring(2).trim();
    } else if (trimmed.startsWith('Q:')) {
      const tempoStr = trimmed.substring(2).trim();
      const match = tempoStr.match(/=(\d+)/);
      metadata.tempo = match ? match[1] : tempoStr.replace(/[^\d]/g, '');
    } else if (trimmed.startsWith('L:')) {
      metadata.noteLength = trimmed.substring(2).trim();
    }
  }

  return metadata;
}

/**
 * Find related files for an ABC file
 */
function findRelatedFiles(abcPath) {
  const dir = path.dirname(abcPath);
  const basename = path.basename(abcPath, '.abc');
  const cleanBasename = basename.replace(/\.fixed$/, '');

  const related = {
    abc: abcPath,
    midi: null,
    wav: null,
    webm: null,
    pdf: null,
    descriptionJson: null,
    markdown: null
  };

  const candidates = {
    midi: [
      `${cleanBasename}.mid`,
      `${cleanBasename}.abc.mid`,
      `${basename}.mid`,
      `${cleanBasename}1.mid`
    ],
    wav: [
      `${cleanBasename}.wav`,
      `${cleanBasename}.mid.wav`,
      `${cleanBasename}.abc.wav`,
      `${basename}.wav`
    ],
    webm: [
      `${cleanBasename}.webm`,
      `${basename}.webm`
    ],
    pdf: [
      `${cleanBasename}.pdf`,
      `${basename}.pdf`,
      `${cleanBasename}-score.pdf`,
      `${basename}-score.pdf`
    ],
    descriptionJson: [
      `${cleanBasename}_description.json`,
      `${basename}_description.json`
    ],
    markdown: [
      `${cleanBasename}.md`,
      `${basename}.md`
    ]
  };

  for (const [type, filenames] of Object.entries(candidates)) {
    for (const filename of filenames) {
      const fullPath = path.join(dir, filename);
      if (fs.existsSync(fullPath)) {
        related[type] = fullPath;
        break;
      }
    }
  }

  return related;
}

/**
 * VALIDATION: Check required files exist before publishing
 */
function validateRequiredFiles(abcPath, related) {
  const errors = [];
  const warnings = [];

  // ABC file is required
  if (!fs.existsSync(abcPath)) {
    errors.push(`ABC file not found: ${abcPath}`);
  }

  // MIDI is required (or must be generatable)
  if (!related.midi) {
    // Check if abc2midi is available
    try {
      execSync('which abc2midi', { stdio: 'pipe' });
      warnings.push('MIDI not found - will generate from ABC');
    } catch {
      errors.push('MIDI file not found and abc2midi is not installed');
    }
  }

  // Description JSON is strongly recommended
  if (!related.descriptionJson) {
    warnings.push('Description JSON not found - genre/style info will be missing');
  }

  // Markdown is optional but nice to have
  if (!related.markdown) {
    warnings.push('Markdown file not found - instrument info will be missing');
  }

  return { errors, warnings };
}

/**
 * Load description JSON if it exists
 */
function loadDescriptionJson(jsonPath) {
  if (!jsonPath || !fs.existsSync(jsonPath)) {
    return null;
  }

  try {
    const content = fs.readFileSync(jsonPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    console.warn(`Warning: Could not parse ${jsonPath}: ${error.message}`);
    return null;
  }
}

/**
 * Generate WAV from ABC using timidity
 */
async function generateWav(abcPath, outputWavPath, midiPath) {
  console.log('  Generating WAV...');

  // Check if MIDI exists, if not generate it
  if (!fs.existsSync(midiPath)) {
    console.log('    Converting ABC to MIDI...');
    try {
      execSync(`abc2midi "${abcPath}" -o "${midiPath}"`, { stdio: 'pipe' });
    } catch (error) {
      throw new Error(`abc2midi failed: ${error.message}`);
    }
  }

  // Generate WAV with timidity
  console.log('    Rendering MIDI to WAV with TiMidity...');
  try {
    execSync(`timidity -c "${CONFIG.timidityCfg}" -A100,120a -Ow -o "${outputWavPath}" "${midiPath}"`, {
      stdio: 'pipe',
      timeout: 300000
    });
  } catch (error) {
    throw new Error(`timidity failed: ${error.message}`);
  }

  return outputWavPath;
}

/**
 * Encode WAV to WebM using ffmpeg
 */
async function encodeWebm(wavPath, outputWebmPath) {
  console.log('  Encoding WebM...');

  const ffmpegCmd = [
    'ffmpeg',
    '-y',
    '-i', `"${wavPath}"`,
    '-c:a', 'libopus',
    '-b:a', '128k',
    '-vn',
    `"${outputWebmPath}"`
  ].join(' ');

  try {
    execSync(ffmpegCmd, { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`ffmpeg failed: ${error.message}`);
  }

  return outputWebmPath;
}

/**
 * Generate PDF score directly from MIDI using MuseScore
 */
async function generatePdfScore(midiPath, outputPdfPath, metadata) {
  console.log('  Generating PDF score from MIDI...');

  try {
    execSync(`mscore -o "${outputPdfPath}" "${midiPath}"`, { stdio: 'pipe' });
  } catch (error) {
    throw new Error(`mscore failed: ${error.message}`);
  }

  return outputPdfPath;
}

/**
 * Generate a unique slug for the composition
 */
function generateSlug(title, timestamp) {
  const base = (title || 'untitled')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50);

  const ts = timestamp ? new Date(timestamp).getTime() : Date.now();
  return `${base}-${ts}`;
}

/**
 * Read timidity config summary
 */
function getTimidityConfigSummary() {
  if (!fs.existsSync(CONFIG.timidityCfg)) {
    return null;
  }

  try {
    const content = fs.readFileSync(CONFIG.timidityCfg, 'utf-8');
    const lines = content.split('\n');
    const soundfonts = [];

    for (const line of lines) {
      const match = line.match(/^soundfont\s+"(.+)"/);
      if (match) {
        soundfonts.push(match[1]);
        if (soundfonts.length >= 10) break;
      }
    }

    if (soundfonts.length === 0) return null;

    return soundfonts.length < 10
      ? soundfonts.join(', ')
      : `${soundfonts.join(', ')}... (${lines.filter(l => l.startsWith('soundfont')).length} total)`;
  } catch {
    return null;
  }
}

/**
 * Main publish function
 */
async function publish(abcPath) {
  console.log(`\n📀 Publishing: ${abcPath}\n`);

  // Find related files FIRST
  console.log('1. Finding related files...');
  const related = findRelatedFiles(abcPath);
  console.log(`   ABC:  ${related.abc ? '✓' : '✗'}`);
  console.log(`   MIDI: ${related.midi ? '✓ ' + related.midi : '✗ Not found'}`);
  console.log(`   WAV:  ${related.wav ? '✓ ' + related.wav : '✗ Not found'}`);
  console.log(`   PDF:  ${related.pdf ? '✓ ' + related.pdf : '○ Will generate'}`);
  console.log(`   JSON: ${related.descriptionJson ? '✓' : '✗ Not found'}`);
  console.log(`   MD:   ${related.markdown ? '✓' : '✗ Not found'}`);

  // VALIDATION - fail fast!
  console.log('\n2. Validating requirements...');
  const { errors, warnings } = validateRequiredFiles(abcPath, related);

  // Show warnings
  for (const warning of warnings) {
    console.log(`   ⚠️  ${warning}`);
  }

  // Show errors and abort if any (unless --force)
  if (errors.length > 0) {
    console.log('');
    for (const error of errors) {
      console.error(`   ❌ ${error}`);
    }

    if (!CONFIG.force) {
      console.error('\n❌ ABORTING: Required files missing!');
      console.error('   Use --force to publish anyway (not recommended)');
      console.error('   Use --list to see existing compositions');
      console.error('   Use --unpublish latest to remove a failed publish\n');
      process.exit(1);
    } else {
      console.warn('\n⚠️  Continuing despite errors (--force flag set)...\n');
    }
  } else {
    console.log('   ✓ All requirements met');
  }

  // Ensure directories exist
  if (!CONFIG.dryRun) {
    fs.mkdirSync(CONFIG.mediaDir, { recursive: true });
    fs.mkdirSync(path.dirname(CONFIG.dataFile), { recursive: true });
  }

  // Parse ABC metadata
  console.log('\n3. Parsing ABC metadata...');
  const abcContent = fs.readFileSync(abcPath, 'utf-8');
  const abcMetadata = parseAbcMetadata(abcContent);
  console.log(`   Title: ${abcMetadata.title || 'Untitled'}`);
  console.log(`   Key: ${abcMetadata.key || 'Unknown'}`);
  console.log(`   Tempo: ${abcMetadata.tempo || 'Unknown'}`);

  // Load description JSON
  const descriptionData = loadDescriptionJson(related.descriptionJson);

  // Generate slug and output paths
  const timestamp = descriptionData?.timestamp || new Date().toISOString();
  const slug = generateSlug(abcMetadata.title, timestamp);
  const webmFilename = `${slug}.webm`;
  const webmPath = path.join(CONFIG.mediaDir, webmFilename);

  // Determine MIDI path
  const dir = path.dirname(abcPath);
  const basename = path.basename(abcPath, '.abc');
  const midiPath = related.midi || path.join(dir, `${basename}.mid`);

  // Generate WAV if needed
  let wavPath = related.wav;
  if (!CONFIG.skipWav && !wavPath) {
    console.log('\n4. Generating WAV audio...');
    if (CONFIG.dryRun) {
      console.log('   [DRY RUN] Would generate WAV');
      wavPath = path.join(dir, `${basename}.wav`);
    } else {
      wavPath = path.join(dir, `${basename}.wav`);
      await generateWav(abcPath, wavPath, midiPath);
      console.log(`   ✓ Created: ${wavPath}`);
    }
  } else if (wavPath) {
    console.log('\n4. Using existing WAV...');
    console.log(`   ${wavPath}`);
  } else {
    console.log('\n4. Skipping WAV generation (--skip-wav)');
  }

  // Encode WebM
  if (!CONFIG.skipWebm && wavPath) {
    console.log('\n5. Encoding WebM...');
    if (CONFIG.dryRun) {
      console.log(`   [DRY RUN] Would encode ${webmPath}`);
    } else {
      await encodeWebm(wavPath, webmPath);
      console.log(`   ✓ Created: ${webmPath}`);
    }
  } else {
    console.log('\n5. Skipping WebM encoding');
  }

  // Generate PDF score
  const pdfFilename = `${slug}-score.pdf`;
  const pdfPath = path.join(CONFIG.mediaDir, pdfFilename);
  let hasPdf = false;

  console.log('\n6. Generating PDF score...');
  if (related.pdf) {
    // Copy existing PDF
    console.log('   Using existing PDF...');
    if (!CONFIG.dryRun) {
      fs.copyFileSync(related.pdf, pdfPath);
      console.log(`   ✓ Copied: ${pdfPath}`);
    }
    hasPdf = true;
  } else {
    // Generate new PDF
    if (CONFIG.dryRun) {
      console.log(`   [DRY RUN] Would generate ${pdfPath}`);
      hasPdf = true;
    } else {
      try {
        await generatePdfScore(midiPath, pdfPath, abcMetadata);
        console.log(`   ✓ Created: ${pdfPath}`);
        hasPdf = true;
      } catch (error) {
        console.warn(`   ⚠ PDF generation failed: ${error.message}`);
        console.warn('   (Composition will be published without score PDF)');
        hasPdf = false;
      }
    }
  }

  // Build composition data
  console.log('\n7. Building composition data...');

  const compositionData = {
    id: slug,
    title: abcMetadata.title || 'Untitled',
    composer: abcMetadata.composer || 'AI Composer',
    key: abcMetadata.key,
    meter: abcMetadata.meter,
    tempo: abcMetadata.tempo,
    genre: descriptionData?.genre || null,
    classicalGenre: descriptionData?.classicalGenre || null,
    modernGenre: descriptionData?.modernGenre || null,
    style: descriptionData?.style || null,
    instruments: null,
    analysis: descriptionData?.analysis || null,
    timestamp: timestamp,
    mediaSrc: `media/${webmFilename}`,
    pdfSrc: hasPdf ? `media/${pdfFilename}` : null,
    abcFile: path.basename(abcPath),
    timidityCfg: getTimidityConfigSummary()
  };

  // Extract instruments from markdown if available
  if (related.markdown) {
    const mdContent = fs.readFileSync(related.markdown, 'utf-8');
    const instrumentMatch = mdContent.match(/## Instruments\n(.+)/);
    if (instrumentMatch) {
      compositionData.instruments = instrumentMatch[1].trim();
    }
  }

  console.log(`   ID: ${compositionData.id}`);
  console.log(`   Genre: ${compositionData.genre || 'Unknown'}`);
  console.log(`   PDF: ${compositionData.pdfSrc || 'Not available'}`);

  // Update compositions.json
  console.log('\n8. Updating compositions database...');
  if (CONFIG.dryRun) {
    console.log('   [DRY RUN] Would update compositions.json');
  } else {
    const compositions = loadCompositions();

    const existingIndex = compositions.findIndex(c =>
      c.id === compositionData.id || c.title === compositionData.title
    );

    if (existingIndex >= 0) {
      console.log('   Updating existing entry...');
      compositions[existingIndex] = compositionData;
    } else {
      console.log('   Adding new entry...');
      compositions.push(compositionData);
    }

    saveCompositions(compositions);
    console.log(`   ✓ Total compositions: ${compositions.length}`);
  }

  console.log('\n✅ Published successfully!\n');
  console.log(`   View at: file://${path.join(CONFIG.siteDir, 'index.html')}`);
  console.log(`   Media: ${webmPath}`);
  console.log(`\n   To unpublish: node scripts/publish-composition.js --unpublish "${compositionData.id}"\n`);

  return compositionData;
}

// Main execution
async function main() {
  const { abcPath, unpublishId, listMode } = parseArgs();

  // Handle --list
  if (listMode) {
    listCompositions();
    return;
  }

  // Handle --unpublish
  if (unpublishId) {
    unpublish(unpublishId);
    return;
  }

  // Handle publish
  if (!abcPath) {
    console.error('Error: No ABC file specified');
    printHelp();
    process.exit(1);
  }

  try {
    await publish(abcPath);
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    console.error('   To remove a failed publish: node scripts/publish-composition.js --unpublish latest\n');
    process.exit(1);
  }
}

main();
