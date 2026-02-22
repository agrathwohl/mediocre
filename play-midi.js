#!/usr/bin/env node
/**
 * Simple MIDI player using FluidSynth
 * Renders MIDI through FluidSynth and plays audio output
 *
 * Usage: node play-midi.js <midi-file> [--reverse|--random]
 *
 * Soundfont ordering:
 *   Default: First soundfont in config = highest priority (FluidSynth native behavior)
 *   --reverse: Last soundfont in config = highest priority (TiMidity-compatible)
 *   --random: Randomized order for experimental sound combinations
 */

import { FluidSynthPlayback } from "./src/utils/fluidsynth-playback.js";
import { execa } from "execa";
import path from "path";
import fs from "fs";

// Parse arguments
const args = process.argv.slice(2);
const reverseOrder = args.includes("--reverse");
const randomOrder = args.includes("--random");
const midiFile = args.find((arg) => !arg.startsWith("--"));

if (!midiFile) {
  console.error("Usage: node play-midi.js <midi-file> [--reverse|--random]");
  console.error("");
  console.error("Options:");
  console.error(
    "  --reverse    Reverse soundfont order (TiMidity-compatible: last = highest priority)",
  );
  console.error(
    "  --random     Randomize soundfont order (experimental sound combinations)",
  );
  console.error(
    "               Default: first = highest priority (FluidSynth native)",
  );
  process.exit(1);
}

if (!fs.existsSync(midiFile)) {
  console.error(`❌ File not found: ${midiFile}`);
  process.exit(1);
}

console.log(`🎵 Playing: ${path.basename(midiFile)}\n`);

// Parse soundfonts from timidity-sanitized.cfg
function parseTimidityCfg(configPath) {
  const content = fs.readFileSync(configPath, "utf-8");
  const soundfonts = [];

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    // Match: soundfont "filename.sf2"
    // Skip commented lines
    if (trimmed.startsWith("soundfont ") && !trimmed.startsWith("#")) {
      const match = trimmed.match(/soundfont\s+"([^"]+)"/);
      if (match) {
        soundfonts.push(match[1]);
      }
    }
  }

  return soundfonts;
}

// Shuffle array in place (Fisher-Yates algorithm)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

// Load soundfonts from timidity-sanitized.cfg
let soundfontList = parseTimidityCfg("./timidity-sanitized.cfg");

// Apply ordering mode
if (randomOrder) {
  soundfontList = shuffleArray(soundfontList);
  console.log(`🎲 Randomized soundfont order (experimental combinations)\n`);
} else if (reverseOrder) {
  soundfontList = soundfontList.reverse();
  console.log(
    `🔄 Reversed soundfont order (TiMidity-compatible: last in config = highest priority)\n`,
  );
} else {
  console.log(
    `📋 Using FluidSynth default order (first in config = highest priority)\n`,
  );
}

console.log(
  `📋 Loaded ${soundfontList.length} soundfonts from timidity-sanitized.cfg\n`,
);

const soundfontSelection = {
  soundfonts: soundfontList,
  categories: {
    general: [],
    drums: [],
    bass: [],
    strings: [],
    synth: [],
    specialty: [],
  },
};

try {
  // Initialize FluidSynth
  const fluidsynth = new FluidSynthPlayback({
    sampleRate: 44100,
    gain: 0.9,
  });

  await fluidsynth.initialize(soundfontSelection);

  // Render MIDI to WAV using FluidSynth CLI
  const wavPath = midiFile.replace(/\.mid$/, ".wav");
  await fluidsynth.playMIDI(midiFile, wavPath);

  console.log(`\n✅ WAV rendered: ${wavPath}`);

  // Clean up
  fluidsynth.close();

  // Play the WAV through speakers
  console.log("🔊 Playing audio...\n");

  try {
    // Try mpv first (best quality, from package.json)
    await execa("mpv", ["--really-quiet", wavPath]);
  } catch (error) {
    // Fallback to aplay
    try {
      await execa("aplay", [wavPath]);
    } catch (error2) {
      // Fallback to sox
      try {
        await execa("play", [wavPath]);
      } catch (error3) {
        console.error("⚠️  No audio player found (tried mpv, aplay, sox)");
        console.error(`   Play manually: mpv ${wavPath}`);
      }
    }
  }

  console.log("\n✅ Playback complete!\n");
} catch (error) {
  console.error("\n❌ Error:", error.message);
  console.error(error.stack);
  process.exit(1);
}
