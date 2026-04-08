/**
 * Genre Research Cache
 *
 * File-based cache for genre research briefings. Stores individual genre
 * profiles and pair-specific mixture strategies as markdown files so we
 * don't re-research the same genres on every generation.
 *
 * Cache structure:
 *   data/genre-research-cache/
 *     {genre-slug}.md          — individual genre profile (reusable across all pairings)
 *     _pairs/{a}_x_{b}.md     — pair-specific mixture strategy
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CACHE_DIR = path.resolve(__dirname, '../../data/genre-research-cache');
const PAIRS_DIR = path.join(CACHE_DIR, '_pairs');

// ── Normalization ───────────────────────────────────────────────────────

/**
 * Normalize a genre/artist name to a filesystem-safe slug.
 * "Aphex Twin" → "aphex-twin", "Oneohtrix Point Never" → "oneohtrix-point-never"
 */
export function normalizeGenreName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// ── Path helpers ────────────────────────────────────────────────────────

function componentPath(genreName) {
  return path.join(CACHE_DIR, `${normalizeGenreName(genreName)}.md`);
}

function pairPath(classical, modern) {
  return path.join(PAIRS_DIR, `${normalizeGenreName(classical)}_x_${normalizeGenreName(modern)}.md`);
}

function ensureCacheDir() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
  fs.mkdirSync(PAIRS_DIR, { recursive: true });
}

// ── Read ────────────────────────────────────────────────────────────────

async function readFileOrNull(filePath) {
  try {
    return await fs.promises.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Check the cache for both genre components and their pair mixture strategy.
 * Returns { classical, modern, pair } — each is the cached text or null.
 */
export async function getCachedResearch(classicalGenre, modernGenre) {
  const [classical, modern, pair] = await Promise.all([
    readFileOrNull(componentPath(classicalGenre)),
    readFileOrNull(componentPath(modernGenre)),
    readFileOrNull(pairPath(classicalGenre, modernGenre)),
  ]);
  return { classical, modern, pair };
}

// ── Write ───────────────────────────────────────────────────────────────

export async function cacheComponent(genreName, content) {
  ensureCacheDir();
  await fs.promises.writeFile(componentPath(genreName), content, 'utf-8');
}

export async function cachePair(classical, modern, content) {
  ensureCacheDir();
  await fs.promises.writeFile(pairPath(classical, modern), content, 'utf-8');
}

/**
 * Cache all parsed sections at once. Skips any section that's null/undefined.
 */
export async function cacheAllSections(classicalGenre, modernGenre, sections) {
  ensureCacheDir();
  const writes = [];
  if (sections.classical) writes.push(cacheComponent(classicalGenre, sections.classical));
  if (sections.modern) writes.push(cacheComponent(modernGenre, sections.modern));
  if (sections.mixture) writes.push(cachePair(classicalGenre, modernGenre, sections.mixture));
  await Promise.all(writes);
  return writes.length;
}

// ── Section Parsing ─────────────────────────────────────────────────────

/**
 * Parse a full genre research text into its constituent sections.
 *
 * The research agent outputs:
 *   ## SECTION 1: {classicalGenre}   — classical genre profile
 *   ## SECTION 2: {modernGenre}      — modern genre profile
 *   ## SECTION 3: MIXTURE STRATEGY   — pair-specific strategy
 *   ## SECTION 4: FLAG ASSESSMENT    — session-specific (not cached)
 *
 * Returns { classical, modern, mixture, flagAssessment, preamble }
 * where each is the text content of that section, or undefined if absent.
 */
export function parseResearchSections(fullText) {
  // Match: "## SECTION 1: TITLE" or "# SECTION 1: TITLE" or "SECTION 1: TITLE"
  // Also handles "- SECTION 1:" prefix from the prompt format instruction
  const sectionRegex = /^(?:#{1,3}\s*)?(?:-\s*)?SECTION\s+(\d+)\s*:\s*(.*?)$/gim;

  const markers = [];
  let match;
  while ((match = sectionRegex.exec(fullText)) !== null) {
    markers.push({
      number: parseInt(match[1]),
      title: match[2].trim(),
      start: match.index,
      headerEnd: match.index + match[0].length,
    });
  }

  if (markers.length === 0) {
    // Can't parse sections — return raw text so caller can still use it
    return { raw: fullText };
  }

  const result = {};

  // Extract preamble (text before first section header)
  const preamble = fullText.slice(0, markers[0].start).trim();
  if (preamble) result.preamble = preamble;

  // Extract each section's content
  for (let i = 0; i < markers.length; i++) {
    const contentStart = markers[i].headerEnd;
    const contentEnd = i < markers.length - 1 ? markers[i + 1].start : fullText.length;
    const content = fullText.slice(contentStart, contentEnd).trim();

    switch (markers[i].number) {
      case 1: result.classical = content; break;
      case 2: result.modern = content; break;
      case 3: result.mixture = content; break;
      case 4: result.flagAssessment = content; break;
    }
  }

  return result;
}

// ── Assembly ────────────────────────────────────────────────────────────

/**
 * Reassemble a full research briefing from cached components.
 * Produces the same format that the composition agent expects.
 */
export function assembleBriefing(classicalName, modernName, classicalResearch, modernResearch, mixtureResearch, flags = {}) {
  let text = '';
  text += `## SECTION 1: ${classicalName.toUpperCase()}\n\n${classicalResearch}\n\n`;
  text += `## SECTION 2: ${modernName.toUpperCase()}\n\n${modernResearch}\n\n`;
  text += `## SECTION 3: MIXTURE STRATEGY RECOMMENDATION\n\n${mixtureResearch}`;

  // Append session-specific flags as notes (no API call needed — the composition
  // agent is Sonnet and can interpret these in context with the cached research)
  const { solo, recordLabel, producer, instruments, style, userInstructions } = flags;
  const hasFlags = solo || recordLabel || producer || instruments || style;

  if (hasFlags) {
    text += '\n\n## SECTION 4: CLI FLAG NOTES\n';
    text += 'The user specified these flags. Assess how they interact with the genre requirements above:\n';
    if (solo) text += '- --solo: Include a dedicated solo section\n';
    if (recordLabel) text += `- --record-label: "${recordLabel}"\n`;
    if (producer) text += `- --producer: "${producer}"\n`;
    if (instruments) text += `- --instruments: "${instruments}"\n`;
    if (style) text += `- style: "${style}"\n`;
  }

  if (userInstructions) {
    text += `\n\n## HARD USER REQUIREMENTS\n${userInstructions}\n`;
  }

  return text;
}
