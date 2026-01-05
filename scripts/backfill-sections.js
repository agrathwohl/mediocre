#!/usr/bin/env node
/**
 * Backfill sections for existing compositions
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractSectionsForJson } from '../src/utils/section-extractor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const COMPOSITIONS_FILE = path.join(__dirname, '../docs/data/compositions.json');
const ABC_DIR = '/home/gwohl/code/mediocre/output';

const compositions = JSON.parse(fs.readFileSync(COMPOSITIONS_FILE, 'utf-8'));

let updated = 0;
for (const comp of compositions) {
  if (comp.sections) continue; // Already has sections

  if (!comp.abcFile) {
    console.log(`SKIP: ${comp.title} - no abcFile`);
    continue;
  }

  const abcPath = path.join(ABC_DIR, comp.abcFile);
  if (!fs.existsSync(abcPath)) {
    console.log(`SKIP: ${comp.title} - file not found: ${abcPath}`);
    continue;
  }

  try {
    const abcContent = fs.readFileSync(abcPath, 'utf-8');
    const sections = extractSectionsForJson(abcContent);

    if (sections.length > 0) {
      comp.sections = sections;
      console.log(`OK: ${comp.title} - ${sections.length} sections`);
      sections.forEach(s => console.log(`    ${s.numeral}: ${s.title} @ ${s.startTime}s`));
      updated++;
    } else {
      console.log(`SKIP: ${comp.title} - no sections found in ABC`);
    }
  } catch (err) {
    console.log(`ERROR: ${comp.title} - ${err.message}`);
  }
}

fs.writeFileSync(COMPOSITIONS_FILE, JSON.stringify(compositions, null, 2));
console.log(`\nDone. Updated ${updated} compositions.`);
