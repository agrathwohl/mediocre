/**
 * ASCII Art Frame Library
 * 
 * A collection of ASCII art frames used for choreography visualizations.
 * Frames are categorized by intensity level: small, medium, high, max
 * 
 * @module playback/data/ascii-frames
 */

/**
 * Array of ASCII art frames with type classification
 * @type {Array<{art: string, type: string}>}
 */
export const asciiFrames = [
  // Small/quiet frames (many variations)
  {
    art: `   .
  /|\
 / | \
'--|--'`,
    type: "small",
  },
  {
    art: `    ^
   /|\
  / | \
 /  |  \
'-.|.-'`,
    type: "small",
  },
  {
    art: `  ◊
 ╱ ╲
╱   ╲`,
    type: "small",
  },
  {
    art: ` △
╱ ╲`,
    type: "small",
  },
  {
    art: `  ☆
 ╱│╲
  │`,
    type: "small",
  },
  {
    art: ` ♪
╱|╲`,
    type: "small",
  },
  // Medium intensity (more variations)
  {
    art: `     A
     /I\
    //I\\\\
   ///I\\\\\\
  '//I\\\\'
     'I'`,
    type: "medium",
  },
  {
    art: `    .-^-.
   /     \
  /       \
 /         \
|           |
\           /
 \`-.___.-'`,
    type: "medium",
  },
  {
    art: `   ╱◆╲
   ╱ ◆ ╲
  │  ◆  │
   ╲ ◆ ╱
    ╲◆╱`,
    type: "medium",
  },
  {
    art: `  ╔═╗
 ╔╬═╬╗
╔╬╬═╬╬╗
 ╚╬═╬╝
  ╚═╝`,
    type: "medium",
  },
  {
    art: `   ♫♫♫
   ♪ ♪ ♪
  ♫  ♫  ♫
 ♪   ♪   ♪`,
    type: "medium",
  },
  {
    art: `  /╲╱╲
  ╱    ╲
 │  ○○  │
  ╲    ╱
   ╲╱╲╱`,
    type: "medium",
  },
  // High intensity (more variations)
  {
    art: `        A
        *I=
       **I==
      ***I===
     ****I====
    ''_**I==_''
       - I -`,
    type: "high",
  },
  {
    art: `      .-^-.
   ."       ".
."             ".
\               /
 \             /
  \           /
   \________/`,
    type: "high",
  },
  {
    art: `     /\\
    .'  \`.
  .'      \`.
 <          >
  \`.      .'
    \`.  .'
      \/`,
    type: "high",
  },
  {
    art: `    ╱▲╲
   ╱▲▲▲╲
  ╱▲▲▲▲▲╲
 ╱▲▲▲▲▲▲▲╲
╱▲▲▲▲▲▲▲▲▲╲`,
    type: "high",
  },
  {
    art: `   ┌─────┐
  ╱│     │╲
 ╱ │  ●  │ ╲
╱  │     │  ╲
───┴─────┴───`,
    type: "high",
  },
  // Maximum intensity
  {
    art: `             ^
            /A\\
           //I\\\\
          ///I\\\\\\
         ////I\\\\\\\\
        /////I\\\\\\\\\\
       //////I\\\\\\\\\\\\
      ///////I\\\\\\\\\\\\\\
     ////////I\\\\\\\\\\\\\\\\
    /////////I\\\\\\\\\\\\\\\\\\
   //////////I\\\\\\\\\\\\\\\\\\\\
    '////////I\\\\\\\\\\\\\\\\\\\\'
      '//////I\\\\\\\\\\\\\\\\\\\\'
        '////I\\\\\\\\'
          '//I\\\\'
            'I'`,
    type: "max",
  },
  {
    art: `            /A\\
           /*I=\\
          /**I==\\
         /*^*I===\\
        /*^**I====\\
       /*^***I=^^==\\
      /*^^^^^I^==^==\\
     /*^^***I^======\\
    /*^*^***I^=======\\
   /*^**^***I^========\\
    \\**^****I^=======/
     \\**^***I=^==^==/
       \\*^***I==^^==/
        \\^***I=====/
         \\***I====/
          \\**I===/
           \\*I==/
            \\I=/
              V`,
    type: "max",
  },
];

/**
 * Get all frames of a specific type
 * @param {string} type - Frame type: "small", "medium", "high", or "max"
 * @returns {Array<{art: string, type: string}>} Array of matching frames
 * @example
 * const smallFrames = getFramesByType("small");
 * // Returns all small intensity frames
 */
export function getFramesByType(type) {
  return asciiFrames.filter((frame) => frame.type === type);
}

/**
 * Get a random frame of a specific type
 * @param {string} type - Frame type: "small", "medium", "high", or "max"
 * @returns {{art: string, type: string}|undefined} Random frame of type, or undefined if none found
 * @example
 * const frame = getRandomFrame("medium");
 * console.log(frame.art); // Random medium intensity ASCII art
 */
export function getRandomFrame(type) {
  const framesOfType = getFramesByType(type);
  if (framesOfType.length === 0) return undefined;
  return framesOfType[Math.floor(Math.random() * framesOfType.length)];
}

/**
 * Get a random frame from all available frames
 * @returns {{art: string, type: string}} Random frame from entire collection
 * @example
 * const frame = getAnyRandomFrame();
 * console.log(frame.type); // "small", "medium", "high", or "max"
 */
export function getAnyRandomFrame() {
  return asciiFrames[Math.floor(Math.random() * asciiFrames.length)];
}

/**
 * Get frame by index
 * @param {number} index - Frame index (0-based)
 * @returns {{art: string, type: string}|undefined} Frame at index, or undefined if out of bounds
 * @example
 * const frame = getFrameByIndex(0);
 * // Returns first frame in collection
 */
export function getFrameByIndex(index) {
  if (index < 0 || index >= asciiFrames.length) return undefined;
  return asciiFrames[index];
}

/**
 * Get total count of frames
 * @returns {number} Total number of frames in library
 * @example
 * const count = getFrameCount();
 * console.log(count); // 20
 */
export function getFrameCount() {
  return asciiFrames.length;
}

/**
 * Get count of frames by type
 * @param {string} type - Frame type: "small", "medium", "high", or "max"
 * @returns {number} Number of frames of specified type
 * @example
 * const smallCount = getFrameCountByType("small");
 * console.log(smallCount); // 6
 */
export function getFrameCountByType(type) {
  return getFramesByType(type).length;
}

/**
 * Get intensity level from audio features
 * Maps amplitude/velocity to appropriate frame type
 * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
 * @param {number} velocity - Audio velocity/onset strength (0.0 to 1.0)
 * @returns {string} Frame type: "small", "medium", "high", or "max"
 * @example
 * const type = getIntensityLevel(0.8, 0.6);
 * // Returns "high" for high intensity audio
 */
export function getIntensityLevel(amplitude, velocity) {
  const intensity = Math.max(amplitude, velocity);
  
  if (intensity < 0.25) return "small";
  if (intensity < 0.5) return "medium";
  if (intensity < 0.75) return "high";
  return "max";
}

/**
 * Get a frame appropriate for audio intensity
 * Automatically selects frame type based on audio features
 * @param {number} amplitude - Audio amplitude (0.0 to 1.0)
 * @param {number} velocity - Audio velocity/onset strength (0.0 to 1.0)
 * @returns {{art: string, type: string}} Frame matching intensity level (falls back to first frame if type not found)
 * @example
 * const frame = getFrameForIntensity(0.9, 0.8);
 * // Returns a "max" intensity frame for loud audio
 */
export function getFrameForIntensity(amplitude, velocity) {
  const type = getIntensityLevel(amplitude, velocity);
  return getRandomFrame(type) || asciiFrames[0];
}

/**
 * Available frame types in the library
 * @type {string[]}
 */
export const FRAME_TYPES = ["small", "medium", "high", "max"];

/**
 * Frame type descriptions for documentation
 * @type {Object.<string, string>}
 */
export const FRAME_TYPE_DESCRIPTIONS = {
  small: "Quiet/subtle frames for low intensity moments",
  medium: "Moderate intensity frames for building energy",
  high: "High energy frames for intense moments",
  max: "Maximum intensity frames for climaxes",
};

export default {
  asciiFrames,
  getFramesByType,
  getRandomFrame,
  getAnyRandomFrame,
  getFrameByIndex,
  getFrameCount,
  getFrameCountByType,
  getIntensityLevel,
  getFrameForIntensity,
  FRAME_TYPES,
  FRAME_TYPE_DESCRIPTIONS,
};
