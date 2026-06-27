/**
 * Generate a structure file from a formal template.
 * Outputs partial ABC with pre-written structural voices and content slots.
 *
 * Usage:
 *   mediocre template --form ritual --key Dmin --meter 7/8 --bars 96
 *   mediocre template --form stack-overflow --key Emin --tempo 175
 *   mediocre template --form source-transfer --source-a "gregorian chant" --source-b "acid techno"
 *   mediocre template --form accumulative --exit-strategy reverse --entry-interval 12
 */

import fs from 'fs';
import path from 'path';
import { FORMS, FORM_NAMES, DRUMMAP_ARCS } from '../utils/template-forms.js';

export async function generateTemplate(options) {
  const formName = options.form;
  if (!formName || !FORMS[formName]) {
    console.error(`Error: --form is required. Available forms: ${FORM_NAMES.join(', ')}`);
    process.exit(1);
  }

  const generator = FORMS[formName];

  // Build params from CLI options
  const params = {};
  if (options.key) params.key = options.key;
  if (options.meter) params.meter = options.meter;
  if (options.noteLen) params.noteLen = options.noteLen;
  if (options.tempo) params.tempo = parseInt(options.tempo);
  if (options.bars) params.bars = parseInt(options.bars);
  if (options.voices) params.voices = options.voices;
  if (options.drumarc) params.drumarc = options.drumarc;
  if (options.exitStrategy) params.exitStrategy = options.exitStrategy;
  if (options.entryInterval) params.entryInterval = parseInt(options.entryInterval);
  if (options.sourceA) params.sourceA = options.sourceA;
  if (options.sourceB) params.sourceB = options.sourceB;
  if (options.pushBars) params.pushBars = parseInt(options.pushBars);
  if (options.enhanced) {
    params.pneuma = options.pneuma || 'organic';
    params.ensemble = 'chamber';
    params.spatial = 'none';
    params.transform = 'none';
  } else {
    params.pneuma = 'none';
    params.ensemble = 'none';
    params.spatial = 'none';
    params.transform = 'none';
  }
  if (options.instruments) params.instruments = options.instruments;

  const abc = generator(params);

  // Output
  const outputDir = options.output || '.';
  const filename = options.filename || `template-${formName}.abc`;
  const outpath = path.join(outputDir, filename);

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outpath, abc);

  // Count content slots
  const slots = (abc.match(/CONTENT SLOT/g) || []).length;
  const prewritten = (abc.match(/PRE-WRITTEN/g) || []).length;
  const lines = abc.split('\n').length;

  console.log(`✓ ${outpath}`);
  console.log(`  Form: ${formName}`);
  console.log(`  ${lines} lines, ${abc.length} chars`);
  console.log(`  ${slots} content slots (LLM fills these)`);
  console.log(`  ${prewritten} pre-written sections (structural)`);
  console.log(`  Params: ${JSON.stringify(params)}`);

  if (Object.keys(DRUMMAP_ARCS).length > 0 && !options.drumarc) {
    console.log(`  Available drum arcs: ${Object.keys(DRUMMAP_ARCS).join(', ')}`);
  }
}
