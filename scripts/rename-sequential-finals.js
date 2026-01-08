#!/usr/bin/env node
/**
 * Retroactively rename sequential generation final outputs to modified-final-
 *
 * Algorithm:
 * 1. Scan output dir for *-modified-*.abc files
 * 2. Filter to December 2025+ (timestamp > 1733011200000)
 * 3. Group by base name (everything before -modified-)
 * 4. Within each group, cluster by 30-minute windows
 * 5. For each cluster, rename the highest-timestamp file to modified-final-
 *
 * Usage: node scripts/rename-sequential-finals.js [output-dir] [--dry-run]
 */

import fs from 'fs';
import path from 'path';

// December 1, 2025 00:00:00 UTC
const DECEMBER_2025_TIMESTAMP = 1733011200000;

// 30 minutes in milliseconds
const CLUSTER_WINDOW_MS = 30 * 60 * 1000;

/**
 * Parse a modified filename to extract base name and timestamp
 * @param {string} filename - e.g., "serialism_x_squarepusher-modified-1767856207111.abc"
 * @returns {Object|null} { baseName, timestamp, fullPath }
 */
function parseModifiedFilename(filename) {
  // Match pattern: {base}-modified-{timestamp}.abc
  // But NOT: {base}-modified-final-{timestamp}.abc (already renamed)
  const match = filename.match(/^(.+)-modified-(\d+)\.abc$/);
  if (!match) return null;

  // Skip if it's already a modified-final file
  if (filename.includes('-modified-final-')) return null;

  const [, baseName, timestampStr] = match;
  const timestamp = parseInt(timestampStr, 10);

  return { baseName, timestamp, filename };
}

/**
 * Group files by base name
 * @param {Array} files - Array of parsed file objects
 * @returns {Map} baseName -> array of files
 */
function groupByBaseName(files) {
  const groups = new Map();

  for (const file of files) {
    if (!groups.has(file.baseName)) {
      groups.set(file.baseName, []);
    }
    groups.get(file.baseName).push(file);
  }

  return groups;
}

/**
 * Cluster files by 30-minute windows
 * @param {Array} files - Array of files with same base name, sorted by timestamp
 * @returns {Array} Array of clusters, each cluster is an array of files
 */
function clusterByTimeWindow(files) {
  if (files.length === 0) return [];

  // Sort by timestamp ascending
  const sorted = [...files].sort((a, b) => a.timestamp - b.timestamp);

  const clusters = [];
  let currentCluster = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prevTimestamp = sorted[i - 1].timestamp;
    const currTimestamp = sorted[i].timestamp;

    if (currTimestamp - prevTimestamp <= CLUSTER_WINDOW_MS) {
      // Within 30 minutes of previous, same cluster
      currentCluster.push(sorted[i]);
    } else {
      // New cluster
      clusters.push(currentCluster);
      currentCluster = [sorted[i]];
    }
  }

  // Don't forget the last cluster
  clusters.push(currentCluster);

  return clusters;
}

/**
 * Find the final file in a cluster (highest timestamp)
 * @param {Array} cluster - Array of files in the same cluster
 * @returns {Object} The file with the highest timestamp
 */
function findFinalInCluster(cluster) {
  return cluster.reduce((max, file) =>
    file.timestamp > max.timestamp ? file : max
  , cluster[0]);
}

/**
 * Generate the new filename for a final file
 * @param {string} filename - Original filename
 * @returns {string} New filename with modified-final-
 */
function generateFinalFilename(filename) {
  return filename.replace(/-modified-(\d+)\.abc$/, '-modified-final-$1.abc');
}

/**
 * Main execution
 */
async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const outputDir = args.find(arg => !arg.startsWith('--')) || '/home/gwohl/code/mediocre/output';

  console.log(`📁 Scanning: ${outputDir}`);
  console.log(`📅 Filter: December 2025+ (timestamp > ${DECEMBER_2025_TIMESTAMP})`);
  console.log(`⏱️  Cluster window: 30 minutes`);
  console.log(`🔧 Mode: ${dryRun ? 'DRY RUN (no changes)' : 'LIVE (will rename files)'}`);
  console.log('');

  // Step 1: Read all files in output dir
  if (!fs.existsSync(outputDir)) {
    console.error(`❌ Output directory not found: ${outputDir}`);
    process.exit(1);
  }

  const allFiles = fs.readdirSync(outputDir);

  // Step 2: Parse and filter modified files
  const modifiedFiles = allFiles
    .map(parseModifiedFilename)
    .filter(f => f !== null)
    .filter(f => f.timestamp >= DECEMBER_2025_TIMESTAMP);

  console.log(`📊 Found ${modifiedFiles.length} modified files from December 2025+`);
  console.log('');

  if (modifiedFiles.length === 0) {
    console.log('✅ No files to process');
    return;
  }

  // Step 3: Group by base name
  const groups = groupByBaseName(modifiedFiles);
  console.log(`📦 Grouped into ${groups.size} unique base names`);
  console.log('');

  // Step 4: Process each group
  let totalRenames = 0;
  const renameOperations = [];

  for (const [baseName, files] of groups) {
    // Cluster by 30-minute windows
    const clusters = clusterByTimeWindow(files);

    console.log(`📝 ${baseName}: ${files.length} files → ${clusters.length} cluster(s)`);

    for (let i = 0; i < clusters.length; i++) {
      const cluster = clusters[i];
      const finalFile = findFinalInCluster(cluster);
      const newFilename = generateFinalFilename(finalFile.filename);

      console.log(`   Cluster ${i + 1}: ${cluster.length} files`);
      console.log(`   └─ Final: ${finalFile.filename}`);
      console.log(`   └─ Rename to: ${newFilename}`);

      renameOperations.push({
        oldPath: path.join(outputDir, finalFile.filename),
        newPath: path.join(outputDir, newFilename),
        oldFilename: finalFile.filename,
        newFilename: newFilename
      });

      // Also check for associated files (.md, _description.json, .timidity.cfg)
      const baseWithoutExt = finalFile.filename.replace('.abc', '');
      const associatedExtensions = ['.md', '_description.json', '.timidity.cfg'];

      for (const ext of associatedExtensions) {
        const oldAssociated = baseWithoutExt + ext;
        const newAssociated = newFilename.replace('.abc', '') + ext;

        if (fs.existsSync(path.join(outputDir, oldAssociated))) {
          renameOperations.push({
            oldPath: path.join(outputDir, oldAssociated),
            newPath: path.join(outputDir, newAssociated),
            oldFilename: oldAssociated,
            newFilename: newAssociated
          });
          console.log(`   └─ Also: ${oldAssociated} → ${newAssociated}`);
        }
      }

      totalRenames++;
    }
    console.log('');
  }

  // Step 5: Execute renames (or dry run)
  console.log('═'.repeat(60));
  console.log(`📊 Summary: ${totalRenames} final files to rename (${renameOperations.length} total operations)`);
  console.log('');

  if (dryRun) {
    console.log('🔍 DRY RUN - No files were changed');
    console.log('   Run without --dry-run to apply changes');
  } else {
    let successCount = 0;
    let errorCount = 0;

    for (const op of renameOperations) {
      try {
        fs.renameSync(op.oldPath, op.newPath);
        console.log(`✅ ${op.oldFilename} → ${op.newFilename}`);
        successCount++;
      } catch (error) {
        console.error(`❌ Failed to rename ${op.oldFilename}: ${error.message}`);
        errorCount++;
      }
    }

    console.log('');
    console.log(`✅ Success: ${successCount} files renamed`);
    if (errorCount > 0) {
      console.log(`❌ Errors: ${errorCount} files failed`);
    }
  }
}

main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
