/**
 * GM Percussion Reference - Rich annotated map of all 47 General MIDI percussion sounds
 *
 * Purpose: Give the drum arranger agent DEEP understanding of what each percussion
 * sound actually sounds like, so it can make informed genre-specific selections.
 * The LLM doesn't know what "Short Guiro" sounds like from the name alone — it needs
 * sonic descriptions, genre associations, and role classifications.
 *
 * GM Percussion lives on MIDI channel 10. Notes 35-81 map to specific drum sounds.
 */

/**
 * All 47 GM Percussion sounds with rich metadata
 *
 * Each entry contains:
 * - name: Official GM name
 * - sonic: What it actually SOUNDS like (critical for LLM understanding)
 * - genres: Array of genres where this sound is commonly used
 * - role: Functional category (foundation/timekeeping/accent/color/ethnic/novelty)
 * - warning: Optional caution about when this sound is inappropriate
 */
export const GM_PERCUSSION = {
  35: {
    name: 'Acoustic Bass Drum',
    sonic: 'Deep, resonant low thud with natural decay — the classic orchestral bass drum sound. Warm and boomy.',
    genres: ['orchestral', 'jazz', 'rock', 'pop', 'folk', 'country', 'blues', 'world'],
    role: 'foundation',
  },
  36: {
    name: 'Bass Drum 1',
    sonic: 'Punchy, tight kick drum — shorter decay than acoustic, more attack. The standard rock/pop/electronic kick.',
    genres: ['rock', 'pop', 'electronic', 'hip-hop', 'trap', 'house', 'techno', 'dnb', 'metal', 'punk', 'industrial', 'synthwave'],
    role: 'foundation',
  },
  37: {
    name: 'Side Stick',
    sonic: 'Sharp, woody click — stick hitting the rim of a snare drum. Dry and precise, like a metronome tick.',
    genres: ['jazz', 'bossa nova', 'latin', 'reggae', 'country', 'folk', 'pop', 'r&b'],
    role: 'timekeeping',
  },
  38: {
    name: 'Acoustic Snare',
    sonic: 'Classic snare crack with wire buzz — bright, full-bodied snap. The standard backbeat snare.',
    genres: ['rock', 'pop', 'jazz', 'funk', 'soul', 'country', 'blues', 'metal', 'punk', 'r&b'],
    role: 'foundation',
  },
  39: {
    name: 'Hand Clap',
    sonic: 'Sharp, snappy clap — bright transient with short reverb tail. Think drum machine clap.',
    genres: ['electronic', 'house', 'techno', 'hip-hop', 'pop', 'funk', 'disco', 'synthwave', 'trap'],
    role: 'accent',
  },
  40: {
    name: 'Electric Snare',
    sonic: 'Tight, crisp electronic snare — less wire buzz than acoustic, more focused crack. Punchier and drier.',
    genres: ['electronic', 'pop', 'hip-hop', 'synthwave', 'new wave', 'industrial', 'dnb', 'house'],
    role: 'foundation',
  },
  41: {
    name: 'Low Floor Tom',
    sonic: 'Deep, resonant tom hit — warm low-frequency boom with moderate sustain. Floor tom territory.',
    genres: ['rock', 'metal', 'orchestral', 'tribal', 'world', 'jazz', 'prog'],
    role: 'accent',
  },
  42: {
    name: 'Closed Hi-Hat',
    sonic: 'Tight, crisp metallic tick — short and controlled. The standard timekeeping sound for most genres.',
    genres: ['rock', 'pop', 'jazz', 'electronic', 'hip-hop', 'funk', 'metal', 'house', 'techno', 'dnb', 'synthwave', 'trap'],
    role: 'timekeeping',
  },
  43: {
    name: 'High Floor Tom',
    sonic: 'Mid-low resonant tom — slightly higher and tighter than low floor tom. Used in fills and patterns.',
    genres: ['rock', 'metal', 'jazz', 'prog', 'tribal', 'world'],
    role: 'accent',
  },
  44: {
    name: 'Pedal Hi-Hat',
    sonic: 'Soft, muted hi-hat chick — foot-controlled closing sound. Subtle timekeeping between beats.',
    genres: ['jazz', 'funk', 'blues', 'soul', 'r&b', 'pop'],
    role: 'timekeeping',
  },
  45: {
    name: 'Low Tom',
    sonic: 'Mid-range tom with moderate depth — standard rack tom sound. Versatile for fills.',
    genres: ['rock', 'metal', 'jazz', 'pop', 'prog', 'world'],
    role: 'accent',
  },
  46: {
    name: 'Open Hi-Hat',
    sonic: 'Sustained, shimmering metallic wash — loose hi-hat ringing out. Adds energy and openness.',
    genres: ['rock', 'pop', 'jazz', 'electronic', 'hip-hop', 'funk', 'house', 'techno', 'dnb', 'disco', 'trap'],
    role: 'timekeeping',
  },
  47: {
    name: 'Low-Mid Tom',
    sonic: 'Mid tom with moderate resonance — sits between low tom and high tom. Fill workhorse.',
    genres: ['rock', 'metal', 'jazz', 'pop', 'prog'],
    role: 'accent',
  },
  48: {
    name: 'Hi-Mid Tom',
    sonic: 'Higher-pitched tom — tighter, more focused attack. Upper register of tom fills.',
    genres: ['rock', 'metal', 'jazz', 'pop', 'prog', 'funk'],
    role: 'accent',
  },
  49: {
    name: 'Crash Cymbal 1',
    sonic: 'Bright, explosive cymbal wash — loud metallic burst with long sustain. Marks transitions and accents.',
    genres: ['rock', 'metal', 'pop', 'jazz', 'punk', 'prog', 'orchestral'],
    role: 'accent',
  },
  50: {
    name: 'High Tom',
    sonic: 'Highest standard tom — tight, quick decay, bright attack. Top of descending tom fills.',
    genres: ['rock', 'metal', 'jazz', 'pop', 'prog', 'funk'],
    role: 'accent',
  },
  51: {
    name: 'Ride Cymbal 1',
    sonic: 'Sustained, controlled metallic shimmer — clear ping with wash underneath. Steady rhythmic riding.',
    genres: ['jazz', 'rock', 'pop', 'blues', 'funk', 'prog', 'country'],
    role: 'timekeeping',
  },
  52: {
    name: 'Chinese Cymbal',
    sonic: 'Trashy, aggressive cymbal with fast decay — dark, cutting overtones. Exotic and abrasive.',
    genres: ['metal', 'punk', 'industrial', 'prog', 'experimental', 'world'],
    role: 'accent',
  },
  53: {
    name: 'Ride Bell',
    sonic: 'Clear, bright bell ping — focused metallic tone from the cymbal bell. Cutting and precise.',
    genres: ['jazz', 'latin', 'funk', 'rock', 'pop', 'bossa nova'],
    role: 'timekeeping',
  },
  54: {
    name: 'Tambourine',
    sonic: 'Bright jingle of metal discs — shimmering, rhythmic rattle. Adds sparkle and movement.',
    genres: ['pop', 'rock', 'folk', 'country', 'gospel', 'soul', 'r&b', 'world', 'disco'],
    role: 'color',
  },
  55: {
    name: 'Splash Cymbal',
    sonic: 'Quick, bright cymbal splash — short burst of shimmer, fast decay. Small accent cymbal.',
    genres: ['rock', 'metal', 'punk', 'jazz', 'pop'],
    role: 'accent',
  },
  56: {
    name: 'Cowbell',
    sonic: 'Dry, hollow metallic clank — focused mid-range tone. Iconic in funk, Latin, and some rock.',
    genres: ['funk', 'latin', 'disco', 'rock', 'salsa', 'afrobeat', 'world'],
    role: 'color',
  },
  57: {
    name: 'Crash Cymbal 2',
    sonic: 'Second crash with different character — slightly darker or brighter than crash 1. Variety in accents.',
    genres: ['rock', 'metal', 'pop', 'jazz', 'prog'],
    role: 'accent',
  },
  58: {
    name: 'Vibraslap',
    sonic: 'Rattling buzz that decays — like a jawbone rattle. Distinctive vibrating metallic sound.',
    genres: ['latin', 'world', 'experimental', 'funk'],
    role: 'color',
    warning: 'Very distinctive sound — use sparingly. Can sound gimmicky outside Latin/world contexts.',
  },
  59: {
    name: 'Ride Cymbal 2',
    sonic: 'Alternative ride tone — different weight or character from ride 1. Slightly different shimmer.',
    genres: ['jazz', 'rock', 'pop', 'funk', 'prog'],
    role: 'timekeeping',
  },
  60: {
    name: 'Hi Bongo',
    sonic: 'High-pitched, sharp hand drum pop — bright, quick slap with minimal sustain. Authentic Latin feel.',
    genres: ['latin', 'bossa nova', 'jazz', 'world', 'afrobeat', 'salsa'],
    role: 'color',
  },
  61: {
    name: 'Low Bongo',
    sonic: 'Deeper hand drum tone — warmer, rounder than hi bongo. Melodic hand percussion.',
    genres: ['latin', 'bossa nova', 'jazz', 'world', 'afrobeat', 'salsa'],
    role: 'color',
  },
  62: {
    name: 'Mute Hi Conga',
    sonic: 'Muted, dry slap on conga — short, controlled hit with dampened resonance. Tight and percussive.',
    genres: ['latin', 'salsa', 'afrobeat', 'jazz', 'funk', 'world'],
    role: 'color',
  },
  63: {
    name: 'Open Hi Conga',
    sonic: 'Resonant, open conga tone — warm, singing sustain from the drum head. Expressive hand percussion.',
    genres: ['latin', 'salsa', 'afrobeat', 'jazz', 'funk', 'world'],
    role: 'color',
  },
  64: {
    name: 'Low Conga',
    sonic: 'Deep, rich conga bass tone — full-bodied low thump with natural warmth. Foundation of conga patterns.',
    genres: ['latin', 'salsa', 'afrobeat', 'jazz', 'funk', 'world'],
    role: 'color',
  },
  65: {
    name: 'High Timbale',
    sonic: 'Bright, ringing metal shell hit — higher pitched, sharp attack. Cutting and authoritative.',
    genres: ['latin', 'salsa', 'mambo', 'jazz', 'world'],
    role: 'color',
  },
  66: {
    name: 'Low Timbale',
    sonic: 'Deeper metal shell tone — slightly warmer and fuller than high timbale. Pairs with high for fills.',
    genres: ['latin', 'salsa', 'mambo', 'jazz', 'world'],
    role: 'color',
  },
  67: {
    name: 'High Agogo',
    sonic: 'Bright, piercing double-bell tone — high-pitched metallic ring. Distinctive Brazilian percussion.',
    genres: ['latin', 'samba', 'bossa nova', 'afrobeat', 'world'],
    role: 'color',
    warning: 'Very distinctive — best in Latin/Brazilian/African contexts. Can sound out of place in Western rock/pop.',
  },
  68: {
    name: 'Low Agogo',
    sonic: 'Lower double-bell tone — warmer and rounder than high agogo. Pairs with high for melodic patterns.',
    genres: ['latin', 'samba', 'bossa nova', 'afrobeat', 'world'],
    role: 'color',
    warning: 'Very distinctive — best in Latin/Brazilian/African contexts. Can sound out of place in Western rock/pop.',
  },
  69: {
    name: 'Cabasa',
    sonic: 'Scraping, rattling texture — like beads sliding on a gourd. Adds rhythmic texture and movement.',
    genres: ['latin', 'bossa nova', 'jazz', 'funk', 'world', 'pop'],
    role: 'color',
  },
  70: {
    name: 'Maracas',
    sonic: 'Shaking rattle — bright, dry seed-filled shaker sound. Steady rhythmic texture.',
    genres: ['latin', 'salsa', 'country', 'pop', 'world', 'folk'],
    role: 'color',
  },
  71: {
    name: 'Short Whistle',
    sonic: 'A referee/sports whistle tweet — short, piercing, high-pitched blast. Sounds like a coach blowing a whistle at a game.',
    genres: ['novelty', 'comedy', 'sound effects'],
    role: 'novelty',
    warning: 'ALMOST NEVER appropriate for music. This is a literal sports whistle sound. Will ruin any serious composition. Only use in deliberately comedic or sound-effect contexts.',
  },
  72: {
    name: 'Long Whistle',
    sonic: 'Extended referee/sports whistle blast — longer, more sustained than short whistle. Same piercing, non-musical quality.',
    genres: ['novelty', 'comedy', 'sound effects'],
    role: 'novelty',
    warning: 'ALMOST NEVER appropriate for music. Extended sports whistle sound. Will ruin any serious composition. Only use in deliberately comedic or sound-effect contexts.',
  },
  73: {
    name: 'Short Guiro',
    sonic: 'Quick scraping rasp — stick dragged across a ridged gourd, short stroke. Dry, scratchy texture.',
    genres: ['latin', 'salsa', 'world'],
    role: 'ethnic',
    warning: 'Distinctive Latin percussion — appropriate in Latin, salsa, and world music contexts. Can sound jarring in Western genres without Latin influence.',
  },
  74: {
    name: 'Long Guiro',
    sonic: 'Extended scraping rasp — longer stroke across ridged gourd. More sustained scratching texture than short guiro.',
    genres: ['latin', 'salsa', 'world'],
    role: 'ethnic',
    warning: 'Distinctive Latin percussion — appropriate in Latin, salsa, and world music contexts. Can sound jarring in Western genres without Latin influence.',
  },
  75: {
    name: 'Claves',
    sonic: 'Sharp, bright wooden click — two hardwood sticks struck together. Clear, cutting, and rhythmically precise.',
    genres: ['latin', 'salsa', 'afrobeat', 'son', 'rumba', 'jazz', 'world'],
    role: 'color',
  },
  76: {
    name: 'Hi Wood Block',
    sonic: 'High-pitched, hollow wooden knock — bright, dry, and short. Precise rhythmic articulation.',
    genres: ['latin', 'orchestral', 'jazz', 'world', 'experimental'],
    role: 'color',
  },
  77: {
    name: 'Low Wood Block',
    sonic: 'Lower hollow wooden knock — deeper and warmer than hi wood block. Pairs for rhythmic patterns.',
    genres: ['latin', 'orchestral', 'jazz', 'world', 'experimental'],
    role: 'color',
  },
  78: {
    name: 'Mute Cuica',
    sonic: 'Muted squeaking friction drum — sounds like a muffled animal cry or squeaky toy. Unusual, vocal-like quality.',
    genres: ['samba', 'brazilian', 'experimental'],
    role: 'ethnic',
    warning: 'Very unusual sound — like a squeaking/moaning friction drum. Only appropriate in Brazilian samba or deliberately experimental contexts. Will sound bizarre in most Western genres.',
  },
  79: {
    name: 'Open Cuica',
    sonic: 'Open squeaking friction drum — louder, more resonant version of mute cuica. Wailing, vocal-like pitch bending.',
    genres: ['samba', 'brazilian', 'experimental'],
    role: 'ethnic',
    warning: 'Very unusual sound — like a wailing/moaning friction drum. Only appropriate in Brazilian samba or deliberately experimental contexts. Will sound bizarre in most Western genres.',
  },
  80: {
    name: 'Mute Triangle',
    sonic: 'Dampened metallic ting — short, muted triangle hit. Subtle, precise metallic accent.',
    genres: ['orchestral', 'jazz', 'pop', 'bossa nova', 'classical', 'folk'],
    role: 'color',
  },
  81: {
    name: 'Open Triangle',
    sonic: 'Bright, ringing metallic shimmer — open triangle sustaining freely. Clear, high-pitched sparkle.',
    genres: ['orchestral', 'jazz', 'pop', 'bossa nova', 'classical', 'folk', 'country'],
    role: 'color',
  },
};

/**
 * Get the full percussion reference formatted for the drum arranger agent's prompt.
 * Shows ALL 47 sounds with descriptions so the agent can make informed selections.
 * @returns {string} Formatted reference text
 */
export function getPercussionReference() {
  const lines = [
    'GENERAL MIDI PERCUSSION MAP (Channel 10, Notes 35-81)',
    'Each sound is described by what it ACTUALLY SOUNDS LIKE, its typical genre associations, and its role.',
    '',
    'Roles: foundation = core beat (kick/snare), timekeeping = steady pulse (hi-hats/ride),',
    '       accent = emphasis/fills (crashes/toms), color = texture/flavor (tambourine/congas),',
    '       ethnic = culturally specific (guiro/cuica), novelty = non-musical (whistles)',
    '',
  ];

  for (const [gm, info] of Object.entries(GM_PERCUSSION)) {
    let line = `  ${gm}: ${info.name} [${info.role}]`;
    line += `\n      Sound: ${info.sonic}`;
    line += `\n      Genres: ${info.genres.join(', ')}`;
    if (info.warning) {
      line += `\n      ⚠️ ${info.warning}`;
    }
    lines.push(line);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Format a selected drum kit for the composition agent's prompt.
 * This becomes the HARD CONSTRAINT enum that the composition agent sees.
 * @param {Array<{gm: number, name: string, role: string}>} drumKit - Selected drum sounds
 * @returns {string} Formatted drum kit listing for composition agent prompt
 */
export function formatDrumKitForPrompt(drumKit) {
  if (!drumKit || drumKit.length === 0) return '';

  const lines = [
    '## DRUM KIT — USE ONLY THESE GM PERCUSSION NUMBERS',
    'The drum arranger agent has selected these specific sounds for this genre fusion.',
    'You MUST use ONLY the GM numbers listed below in your %%MIDI drum patterns.',
    'Do NOT use any GM percussion number not in this list.',
    '',
  ];

  // Group by role for clarity
  const grouped = {};
  for (const sound of drumKit) {
    const role = sound.role || 'other';
    if (!grouped[role]) grouped[role] = [];
    grouped[role].push(sound);
  }

  const roleOrder = ['foundation', 'timekeeping', 'accent', 'color', 'ethnic'];
  for (const role of roleOrder) {
    if (grouped[role] && grouped[role].length > 0) {
      lines.push(`  ${role.toUpperCase()}:`);
      for (const sound of grouped[role]) {
        lines.push(`    ${sound.gm} = ${sound.name}`);
      }
    }
  }

  // Catch any roles not in the standard order
  for (const [role, sounds] of Object.entries(grouped)) {
    if (!roleOrder.includes(role) && sounds.length > 0) {
      lines.push(`  ${role.toUpperCase()}:`);
      for (const sound of sounds) {
        lines.push(`    ${sound.gm} = ${sound.name}`);
      }
    }
  }

  lines.push('');
  lines.push('ANY GM drum number NOT listed above is FORBIDDEN for this composition.');

  return lines.join('\n');
}
