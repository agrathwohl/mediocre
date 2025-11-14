#!/usr/bin/env node

/**
 * Validate that all soundfonts referenced in timidity configs actually exist
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

const configs = [
  'timidity-ultimate.cfg',
  'timidity-ultimate-simple.cfg',
  'timidity-maximum-overkill.cfg'
];

const soundfontDir = path.join(projectRoot, 'soundfonts/500-soundfonts-full-gm-sets');

let hasErrors = false;

console.log('Validating soundfont references in timidity configs...\n');

for (const config of configs) {
  const configPath = path.join(projectRoot, config);

  if (!fs.existsSync(configPath)) {
    console.warn(`⚠️  Config file not found: ${config}`);
    continue;
  }

  console.log(`Checking ${config}:`);

  const content = fs.readFileSync(configPath, 'utf-8');
  const soundfontLines = content.match(/^soundfont "(.+)"$/gm) || [];

  let configHasErrors = false;

  for (const line of soundfontLines) {
    const match = line.match(/soundfont "(.+)"/);
    if (!match) continue;

    const filename = match[1];
    const fullPath = path.join(soundfontDir, filename);

    if (!fs.existsSync(fullPath)) {
      console.error(`  ❌ "${filename}" - NOT FOUND`);

      // Try to suggest alternatives
      const baseName = filename.split('.')[0].toLowerCase();
      const suggestions = fs.readdirSync(soundfontDir)
        .filter(f => f.toLowerCase().includes(baseName.substring(0, 10)))
        .slice(0, 3);

      if (suggestions.length > 0) {
        console.log(`     Suggestions:`);
        suggestions.forEach(s => console.log(`       - ${s}`));
      }

      configHasErrors = true;
      hasErrors = true;
    } else {
      const stats = fs.statSync(fullPath);
      const sizeMB = Math.round(stats.size / 1024 / 1024);
      console.log(`  ✓ "${filename}" (${sizeMB}MB)`);
    }
  }

  if (!configHasErrors) {
    console.log(`  ✅ All soundfonts found!`);
  }

  console.log();
}

if (hasErrors) {
  console.error('❌ Validation failed! Some soundfonts are missing.');
  process.exit(1);
} else {
  console.log('✅ All soundfont references are valid!');
}