#!/usr/bin/env node

/**
 * Validate and auto-fix choreography template references
 * Usage: node scripts/fix-choreography-templates.js <choreography-file>
 *
 * This tool checks that all template references in timeline, threads, and scenes
 * have corresponding definitions in templates.objects
 */

import fs from 'fs';
import path from 'path';
import { validateTemplateReferences, autoFixMissingTemplates } from '../src/utils/choreography-validator.js';

function processFile(filePath) {
  console.log(`\n🔍 Validating: ${path.basename(filePath)}`);
  console.log('═'.repeat(60));

  if (!fs.existsSync(filePath)) {
    console.error(`❌ File not found: ${filePath}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const validation = validateTemplateReferences(data);

  console.log(`\n📊 Statistics:`);
  console.log(`   Version: ${data.metadata?.version || 'unknown'}`);
  console.log(`   Name: ${data.metadata?.name || 'untitled'}`);
  console.log(`   Defined templates: ${validation.definedTemplates.length}`);
  console.log(`   Template references: ${validation.errors.length + validation.definedTemplates.length}`);

  if (validation.valid) {
    console.log(`\n✅ All template references are valid!`);
    return { fixed: false, data };
  }

  console.log(`\n⚠️  Found ${validation.errors.length} missing template reference(s):`);
  validation.errors.forEach(err => {
    console.log(`\n   Template: "${err.template}"`);
    console.log(`   Location: ${err.location}`);
    if (err.thread) console.log(`   Thread: ${err.thread}`);
    if (err.scene) console.log(`   Scene: ${err.scene}`);
    if (err.time !== undefined) console.log(`   Time: ${err.time}s`);
  });

  console.log(`\n📝 Unique missing templates: ${validation.missing.join(', ')}`);

  // Ask for confirmation before fixing (or use --auto flag)
  const autoFix = process.argv.includes('--auto');

  if (!autoFix) {
    console.log(`\n💡 To auto-fix, run with --auto flag`);
    console.log(`   node scripts/fix-choreography-templates.js ${filePath} --auto`);
    return { fixed: false, data };
  }

  // Auto-fix missing templates
  console.log(`\n🔧 Auto-fixing missing templates...`);
  const fixedData = autoFixMissingTemplates(data, validation.missing);

  validation.missing.forEach(templateName => {
    console.log(`   ✅ Added default template for: ${templateName}`);
  });

  return { fixed: true, data: fixedData };
}

// Main execution
function main() {
  const args = process.argv.slice(2).filter(arg => !arg.startsWith('--'));

  if (args.length === 0) {
    console.log('Usage: node scripts/fix-choreography-templates.js <file.json> [--auto]');
    console.log('\nOptions:');
    console.log('  --auto    Automatically fix missing templates');
    console.log('\nExamples:');
    console.log('  node scripts/fix-choreography-templates.js output/song.choreography.json');
    console.log('  node scripts/fix-choreography-templates.js output/*.choreography.json --auto');
    process.exit(1);
  }

  const pattern = args[0];

  // Support glob patterns
  if (pattern.includes('*')) {
    console.log(`\n🔍 Processing multiple files...`);
    // Would need glob package for this
    console.log(`⚠️  Glob patterns not yet supported. Please specify individual files.`);
    process.exit(1);
  }

  const result = processFile(pattern);

  if (result.fixed) {
    const outputFile = pattern.replace('.json', '.fixed.json');
    fs.writeFileSync(outputFile, JSON.stringify(result.data, null, 2));
    console.log(`\n💾 Fixed choreography saved to: ${outputFile}`);
    console.log(`\n🎭 To play the fixed choreography:`);
    console.log(`   node play-choreography-v1.1.js <audio.wav> ${outputFile}`);
  } else if (!validation.valid && !process.argv.includes('--auto')) {
    console.log(`\n💡 No changes made. Use --auto flag to apply fixes.`);
  }
}

// Run the tool
main();