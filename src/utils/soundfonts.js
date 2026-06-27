import fs from "fs";
import path from "path";
import { generateText } from "ai";
import { getAnthropic, stripMarkdownCodeFences } from "./llm-client.js";
import {
  exploreSoundFontsForComposition,
  generateTimidityConfig,
  BANNED_SOUNDFONTS,
} from "./soundfont-tools.js";

export const SOUNDFONT_PALETTE_INFO = `AVAILABLE SOUNDFONT PALETTE - Your compositions will be rendered with this layered soundfont stack:
   The soundfonts are LAYERED - later soundfonts override earlier ones for the same MIDI programs.
   This gives you a rich, hybrid sonic palette perfect for genre fusion.

   **BASE LAYER - Full GM/GS/GM2/XG Coverage**:
   - GeneralUser GS, FluidR3 GM+GS, Phoenix GS/XG, Yamaha S-YXG50, SGM-128
   - Comprehensive General MIDI foundation with extended banks

   **SYNTHS & ELECTRONIC** (Great for: Synthwave, Electronic, Ambient, Industrial):
   - FM Synthesis, OPL-3 FM, RetroHybrid, FatBoy
   - 80s/90s synth sounds, FM timbres, analog-style synthesis

   **DRUMS - Extensive Coverage** (Jazz/Rock/Electronic/Industrial/XG):
   - Slingerland (jazz), Linndrum (80s electronic), Tama RockSTAR (rock/metal)
   - Giant Drumkit GM-GS & XG extensions
   - Multiple drum kits available via MIDI program selection

   **GUITARS & BASS** (Rock, Metal, Jazz, Funk):
   - Electric guitars (JN v4.4, GM, Metal-specific)
   - Ibanez picked bass (articulate, modern sound)

   **ETHNIC & WORLD INSTRUMENTS**:
   - Asia/Ethnic soundfont (8850+ Asian and world instruments)
   - Expand your palette beyond Western instruments

   **CHIPTUNE & RETRO** (8-bit, NES, Game Boy aesthetics):
   - Chiptune Soundfont 3.0
   - Perfect for retro gaming fusion genres

   **ORCHESTRAL - High Quality** (Classical, Cinematic, Film):
   - Timbres of Heaven GM/GS/XG/SFX v3.4 & XGM 4.0
   - HQ Orchestral Collection v3.0
   - Rich, expressive classical instrument samples

   **HARDWARE EMULATION** (Authentic vintage sound):
   - Roland SC-55/SC-88 (iconic 90s GM sound)
   - Roland JV-1010, Edirol SD-20 (contemporary professional)

   **PREMIUM PIANO**:
   - Z-Doc Soundfont IV (concert grand quality)

   **PREMIUM GM BANKS** (Final override layer):
   - Airfont 380, SGMv2 (Yamaha Grand, Guitar, Bass)
   - Concert GM, HedsoundGMT, TrianGMGS, Compifont
   - Orpheus, Crisis GM 3.01 (comprehensive, high-quality)

   USE THIS KNOWLEDGE: When fusing genres, leverage the appropriate soundfonts:
   - "Baroque x Synthwave" → Combine orchestral instruments with FM synths and electronic drums
   - "Jazz x Chiptune" → Jazz drums/bass with chiptune leads and arpeggios
   - "Romantic x Industrial" → Orchestral strings/piano with distorted guitars and industrial drums
   - "Gamelan x Techno" → Ethnic percussion with electronic synth pads and bass

   The layered soundfont stack means standard GM program numbers will sound RICH and HYBRID.
   Don't be afraid to use conventional MIDI programs - they'll have character from the layering.`;

export async function selectSoundfontsWithClaude(options) {
  const { isAgentEnabled } = await import('./feature-flags.js');
  if (isAgentEnabled('soundfont')) {
    console.log('🤖 Using soundfont agent for selection...');
    const { selectSoundfontsWithAgent } = await import('../agents/soundfont/index.js');
    const agentResult = await selectSoundfontsWithAgent(options);

    let validatedSoundfonts = agentResult.soundfonts.map((sf) => {
      if (!sf.endsWith('.sf2')) {
        return sf + '.sf2';
      }
      return sf;
    });

    const bannedFound = validatedSoundfonts.filter((sf) =>
      BANNED_SOUNDFONTS.includes(sf),
    );
    if (bannedFound.length > 0) {
      console.warn(
        `⚠️ Filtering out banned soundfonts that crash TiMidity: ${bannedFound.join(', ')}`,
      );
      validatedSoundfonts = validatedSoundfonts.filter(
        (sf) => !BANNED_SOUNDFONTS.includes(sf),
      );
    }

    return {
      soundfonts: validatedSoundfonts,
      reasoning: agentResult.reasoning,
      categories: agentResult.categories,
      coverage: agentResult.coverage,
    };
  }

  console.log('📝 Using traditional soundfont selection...');
  const myAnthropic = getAnthropic();
  const model = myAnthropic("claude-3-5-haiku-20241022");

  const genre = options.genre || "Classical_x_Contemporary";
  const classicalGenre = options.classicalGenre || "Classical";
  const modernGenre = options.modernGenre || "Contemporary";
  const requestedInstruments = options.instruments || "";

  const exploration = await exploreSoundFontsForComposition({
    genreHybrid: genre,
    requiredInstruments: requestedInstruments
      ? requestedInstruments.split(",").map((i) => i.trim())
      : [],
    style: "",
  });

  const availableSoundfonts = `
## Primary Recommendations (Best matches for ${genre}):
${exploration.genreRecommendations.primary.map((sf) => `- ${sf.filename} (score: ${sf.score}, presets: ${sf.presetCount}) - Keywords: ${sf.matchedKeywords.join(", ")}`).join("\n")}

## Secondary Options:
${exploration.genreRecommendations.secondary.map((sf) => `- ${sf.filename}`).join("\n")}

## Auto-Suggested Selection:
${exploration.suggestedSelection.join(", ")}

## Categories Available:
- Drums: ${exploration.categoryResults.drums
    .slice(0, 3)
    .map((sf) => sf.filename)
    .join(", ")}
- Bass: ${exploration.categoryResults.bass
    .slice(0, 3)
    .map((sf) => sf.filename)
    .join(", ")}
- Strings: ${exploration.categoryResults.strings
    .slice(0, 3)
    .map((sf) => sf.filename)
    .join(", ")}
`;

  const systemPrompt = `You are a music producer selecting soundfonts for a composition.
Given a genre hybrid and available soundfonts, select the BEST soundfonts for this specific fusion.

IMPORTANT RULES:
1. Always include at least ONE general GM soundfont as a base (e.g., "GeneralUser GS v1.471.sf2", "FluidR3 GM + GS.sf2")
2. Select 15-30 soundfonts for proper layering - BUILD A RICH PALETTE
3. Later soundfonts in the list OVERRIDE earlier ones for the same instruments
4. Put general soundfonts FIRST, then add many specialty soundfonts to override specific instruments
5. Consider the specific instruments needed for both ${classicalGenre} and ${modernGenre}
6. Include soundfonts for: drums/percussion, bass, strings, pads, leads, and genre-specific instruments
7. MORE IS BETTER - each soundfont adds depth and character to the final mix

You MUST respond in this EXACT JSON format:
{
  "soundfonts": ["soundfont1.sf2", "soundfont2.sf2", ...],
  "reasoning": "Brief explanation of why these soundfonts work for this genre"
}`;

  const userPrompt = `Select soundfonts for a ${genre} composition (fusion of ${classicalGenre} and ${modernGenre}).

${requestedInstruments ? `Required instruments: ${requestedInstruments}` : ""}

Available soundfonts and recommendations:
${availableSoundfonts}

Select the optimal soundfont combination. Return ONLY the JSON response.`;

  try {
    const { text } = await generateText({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      maxTokens: 1000,
    });

    const jsonStr = stripMarkdownCodeFences(text);

    const result = JSON.parse(jsonStr);

    let validatedSoundfonts = result.soundfonts.map((sf) => {
      if (!sf.endsWith(".sf2")) {
        return sf + ".sf2";
      }
      return sf;
    });

    const bannedFound = validatedSoundfonts.filter((sf) =>
      BANNED_SOUNDFONTS.includes(sf),
    );
    if (bannedFound.length > 0) {
      console.warn(
        `⚠️ Filtering out banned soundfonts that crash TiMidity: ${bannedFound.join(", ")}`,
      );
      validatedSoundfonts = validatedSoundfonts.filter(
        (sf) => !BANNED_SOUNDFONTS.includes(sf),
      );
    }

    return {
      soundfonts: validatedSoundfonts,
      reasoning:
        result.reasoning || "Soundfonts selected based on genre compatibility",
    };
  } catch (error) {
    console.warn(
      "Failed to get LLM soundfont selection, using auto-suggested selection:",
      error.message,
    );
    const fallbackSoundfonts = exploration.suggestedSelection.filter(
      (sf) => !BANNED_SOUNDFONTS.includes(sf),
    );
    return {
      soundfonts: fallbackSoundfonts,
      reasoning: "Auto-selected based on genre keyword matching",
    };
  }
}

export async function saveCustomTimidityConfig(options) {
  const {
    soundfonts,
    outputDir,
    baseFilename,
    title = "Composition",
    genre = "",
  } = options;

  const configContent = generateTimidityConfig(soundfonts, { title, genre });

  await fs.promises.mkdir(outputDir, { recursive: true });
  const configPath = path.join(outputDir, `${baseFilename}.timidity.cfg`);
  await fs.promises.writeFile(configPath, configContent);

  return configPath;
}
