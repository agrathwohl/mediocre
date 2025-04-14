#!/usr/bin/env node

/**
 * This script generates TypeScript declaration files from JSDoc comments.
 * It copies the generated .d.ts files from the dist directory to the types directory.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const projectRoot = path.resolve(__dirname, '..');
const distDir = path.join(projectRoot, 'dist');
const typesDir = path.join(projectRoot, 'types');

// Create types directory if it doesn't exist
if (!fs.existsSync(typesDir)) {
  fs.mkdirSync(typesDir, { recursive: true });
}

/**
 * Recursively copies .d.ts files from source to destination
 * @param {string} src - Source directory
 * @param {string} dest - Destination directory
 */
function copyTypeDefinitions(src, dest) {
  const entries = fs.readdirSync(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      if (!fs.existsSync(destPath)) {
        fs.mkdirSync(destPath, { recursive: true });
      }
      copyTypeDefinitions(srcPath, destPath);
    } else if (entry.name.endsWith('.d.ts')) {
      fs.copyFileSync(srcPath, destPath);
      console.log(`Copied: ${srcPath} -> ${destPath}`);
    }
  }
}

try {
  copyTypeDefinitions(distDir, typesDir);
  console.log('Type definitions generated successfully!');
} catch (error) {
  console.error('Error generating type definitions:', error);
  process.exit(1);
}