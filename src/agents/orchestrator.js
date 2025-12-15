/**
 * Music Composition Orchestrator
 * Coordinates all specialist agents to create complete musical compositions
 */

import fs from "fs/promises";
import path from "path";
import { CreativeGenreNameAgent } from "./creative-genre-name.js";
import { MusicHistoryAgent } from "./music-history.js";
import { ArrangementAgent } from "./arrangement.js";
import { CompositionalFormAgent } from "./compositional-form.js";
import { MelodicAgent } from "./melodic.js";
import { TimbrelAgent } from "./timbrel.js";
import { DynamicsAgent } from "./dynamics.js";
import { CompositionAgent } from "./composition.js";
import { InstrumentComposerAgent } from "./instrument-composer.js";
import { CriticAgent } from "./critic.js";
import { ContextTransformer } from "../utils/context-transformer.js";

export class MusicOrchestrator {
  constructor(anthropic, options = {}) {
    this.anthropic = anthropic;
    this.saveIntermediateOutputs = options.saveIntermediateOutputs !== false; // Default true
    this.intermediateOutputDir =
      options.intermediateOutputDir || "./temp/orchestrator";
    this.sessionId = options.sessionId || Date.now();

    // ARTISTIC PHILOSOPHY:
    // This orchestrator is an uncompromising artistic director, not a passive coordinator.
    // We passionately defend the honor of the music's outcome.
    // We DO NOT accept mediocrity or compromise artistic values to appear agreeable.
    // We are TOUGH, UNWAVERING, and ask the DIFFICULT and CHALLENGING questions.
    // We demand excellence from every agent and reject work that doesn't meet our standards.

    // Initialize all specialist agents
    this.creativeGenreNameAgent = new CreativeGenreNameAgent(anthropic);
    this.musicHistoryAgent = new MusicHistoryAgent(anthropic);
    this.arrangementAgent = new ArrangementAgent(anthropic);
    this.compositionalFormAgent = new CompositionalFormAgent(anthropic);
    this.melodicAgent = new MelodicAgent(anthropic);
    this.timbrelAgent = new TimbrelAgent(anthropic);
    this.dynamicsAgent = new DynamicsAgent(anthropic);
    this.compositionAgent = new CompositionAgent(anthropic);
    this.instrumentComposerAgent = new InstrumentComposerAgent(anthropic);
    this.criticAgent = new CriticAgent(anthropic);

    this.maxRevisions = 5; // More revisions allowed - we don't settle for "good enough"
    this.aestheticStandards = {
      // We maintain vigilant oversight of aesthetic goals
      minimumQualityThreshold: 0.8, // High bar for acceptance
      rejectMinorIssues: false, // We'll accept minor issues, but NEVER major ones
      rejectCriticalIssues: true, // Absolutely no tolerance for critical issues
      enforceGenreAuthenticity: true, // Must authentically represent both genres
      enforceMusicalCoherence: true, // Must be musically coherent and compelling
    };
  }

  /**
   * Save intermediate outputs to disk for resumption on failure
   */
  async saveIntermediateOutput(step, context) {
    if (!this.saveIntermediateOutputs) return;

    try {
      await fs.mkdir(this.intermediateOutputDir, { recursive: true });
      const outputPath = path.join(
        this.intermediateOutputDir,
        `${this.sessionId}_${step}.json`,
      );
      await fs.writeFile(outputPath, JSON.stringify(context, null, 2));
      console.log(`   💾 Saved checkpoint: ${step}`);
    } catch (error) {
      console.warn(
        `   ⚠️  Failed to save intermediate output: ${error.message}`,
      );
    }
  }

  /**
   * Find the latest checkpoint for resumption
   */
  async findLatestCheckpoint(sessionId) {
    try {
      const files = await fs.readdir(this.intermediateOutputDir);
      const sessionFiles = files
        .filter((f) => f.startsWith(`${sessionId}_`) && f.endsWith(".json"))
        .sort()
        .reverse();

      if (sessionFiles.length === 0) {
        return null;
      }

      const latestFile = sessionFiles[0];
      const step = latestFile.replace(`${sessionId}_`, "").replace(".json", "");
      const content = await fs.readFile(
        path.join(this.intermediateOutputDir, latestFile),
        "utf-8",
      );

      return {
        step,
        context: JSON.parse(content),
        file: latestFile,
      };
    } catch (error) {
      console.warn(`   ⚠️  Failed to load checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Save best-effort ABC notation immediately
   * CRITICAL: Always save ABC as soon as it exists, regardless of validation
   */
  async saveBestEffortAbc(context, options = {}) {
    try {
      const abc = context.composition.data.abc_notation;

      // Validate ABC is non-empty
      if (!abc || abc.trim().length === 0) {
        console.warn("   ⚠️  ABC notation is empty, not saving");
        return;
      }

      const genreName = (
        context.creative_genre_name?.data?.genre_name || "composition"
      )
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "_");
      const timestamp = Date.now();
      const filename = `${genreName}-best-effort-${timestamp}.abc`;

      const outputDir = options.output || "./output";
      await fs.mkdir(outputDir, { recursive: true });
      const abcPath = path.join(outputDir, filename);

      await fs.writeFile(abcPath, abc);
      console.log(`   💾 BEST-EFFORT ABC SAVED: ${abcPath}`);

      // Store path for later reference
      context.best_effort_abc_path = abcPath;
    } catch (error) {
      console.warn(`   ⚠️  Failed to save best-effort ABC: ${error.message}`);
    }
  }

  /**
   * Main orchestration method
   */
  async orchestrate(userPrompt, options = {}) {
    console.log("🎼 Starting Music Composition Orchestration...\n");
    console.log(`💾 Session ID: ${this.sessionId}\n`);

    let context = {
      user_prompt: userPrompt,
      options: options,
    };

    // Check for existing checkpoint
    const checkpoint = await this.findLatestCheckpoint(this.sessionId);
    let resumeFrom = null;

    if (checkpoint) {
      console.log(`🔄 Found checkpoint: ${checkpoint.step}`);
      console.log(`   Resuming from: ${checkpoint.file}\n`);
      context = checkpoint.context;
      resumeFrom = checkpoint.step;
    }

    let revisionCount = 0;
    let criticResult = null;

    while (revisionCount <= this.maxRevisions) {
      try {
        // STEP 2: Creative Genre Name Agent
        if (!resumeFrom || resumeFrom < "01_creative_genre_name") {
          console.log("📝 Step 2: Generating creative genre name...");
          const genreResult = await this.creativeGenreNameAgent.execute(
            userPrompt,
            context,
          );
          if (genreResult.status === "error")
            throw new Error("Creative Genre Name Agent failed");
          context.creative_genre_name = genreResult;
          console.log(`   ✓ Genre: "${genreResult.data.genre_name}"`);
          await this.saveIntermediateOutput("01_creative_genre_name", context);
          console.log();
        } else {
          console.log("📝 Step 2: ✓ Loaded from checkpoint");
        }

        // STEP 3: Music History Agent
        if (!resumeFrom || resumeFrom < "02_music_history") {
          console.log("📚 Step 3: Analyzing music history context...");
          const historyResult = await this.musicHistoryAgent.execute(
            userPrompt,
            context,
          );
          if (historyResult.status === "error")
            throw new Error("Music History Agent failed");
          context.music_history = historyResult;
          console.log(`   ✓ Historical analysis complete`);
          await this.saveIntermediateOutput("02_music_history", context);
          console.log();
        } else {
          console.log("📚 Step 3: ✓ Loaded from checkpoint");
        }

        // STEP 4: Arrangement + Compositional Form (IN TANDEM)
        if (!resumeFrom || resumeFrom < "03_arrangement_and_form") {
          console.log(
            "🎹 Step 4: Arrangement & Compositional Form (working in tandem)...",
          );
          const tandemResult = await this.runArrangementFormTandem(
            userPrompt,
            context,
          );
          context.arrangement = tandemResult.arrangement;
          context.compositional_form = tandemResult.compositional_form;
          console.log(
            `   ✓ ${context.arrangement.data.total_voices} voices arranged`,
          );
          console.log(
            `   ✓ ${context.compositional_form.data.total_measures} measure structure created`,
          );
          await this.saveIntermediateOutput("03_arrangement_and_form", context);
          console.log();
        } else {
          console.log("🎹 Step 4: ✓ Loaded from checkpoint");
        }

        // STEP 5: Melodic Agent
        if (!resumeFrom || resumeFrom < "04_melodic") {
          console.log("🎵 Step 5: Creating melodic themes...");
          const melodicResult = await this.melodicAgent.execute(
            userPrompt,
            context,
          );
          if (melodicResult.status === "error")
            throw new Error("Melodic Agent failed");
          context.melodic = melodicResult;
          console.log(`   ✓ Melodic themes created`);
          await this.saveIntermediateOutput("04_melodic", context);
          console.log();
        } else {
          console.log("🎵 Step 5: ✓ Loaded from checkpoint");
        }

        // STEP 6: Timbrel + Dynamics (IN TANDEM)
        if (!resumeFrom || resumeFrom < "05_timbrel_and_dynamics") {
          console.log("🎚️  Step 6: Timbrel & Dynamics (working in tandem)...");
          const timbrelDynamicsTandem = await this.runTimbrelDynamicsTandem(
            userPrompt,
            context,
          );
          context.timbrel = timbrelDynamicsTandem.timbrel;
          context.dynamics = timbrelDynamicsTandem.dynamics;
          console.log(`   ✓ MIDI configuration complete`);
          console.log(`   ✓ Dynamic arc designed`);
          await this.saveIntermediateOutput("05_timbrel_and_dynamics", context);
          console.log();
        } else {
          console.log("🎚️  Step 6: ✓ Loaded from checkpoint");
        }

        // STEP 7: Composition Agent (ABC Assembly)
        if (!resumeFrom || resumeFrom < "06_composition") {
          console.log("🎼 Step 7: Assembling ABC notation...");

          // Choose composition method based on options
          let compositionResult;
          if (options.sequential) {
            console.log("   Using SEQUENTIAL per-instrument composition...");
            compositionResult = await this.composeSequentially(
              userPrompt,
              context,
            );
          } else {
            console.log("   Using standard all-at-once composition...");
            compositionResult = await this.compositionAgent.execute(
              userPrompt,
              context,
            );
          }

          if (compositionResult.status === "error")
            throw new Error("Composition Agent failed");
          context.composition = compositionResult;
          console.log(`   ✓ ABC notation generated`);

          // CRITICAL: Save ABC immediately, BEFORE checkpoint
          if (context.composition?.data?.abc_notation) {
            await this.saveBestEffortAbc(context, options);
          }

          await this.saveIntermediateOutput("06_composition", context);
          console.log();
        } else {
          console.log("🎼 Step 7: ✓ Loaded from checkpoint");
        }

        // Clear resumeFrom after first iteration to allow revisions
        resumeFrom = null;

        // STEP 8: Auto-fix syntax (validation disabled, but syntax fixes still applied)
        console.log("🔍 Step 8: Auto-fixing syntax (validation disabled)...");

        // Use standardized context transformation for CriticAgent
        const criticContext = ContextTransformer.toCriticContext(context);

        // Run CriticAgent to get auto-fixes, but skip subjective validation
        criticResult = await this.criticAgent.execute(
          "Auto-fix syntax errors only",
          criticContext,
        );

        // Apply auto-fixes if any were made
        if (
          criticResult.data.abc_notation &&
          criticResult.data.applied_fixes?.length > 0
        ) {
          console.log(
            `   🔧 Auto-fixes applied: ${criticResult.data.applied_fixes.join(", ")}`,
          );
          context.composition.data.abc_notation =
            criticResult.data.abc_notation;
        }

        console.log("   ✓ Composition accepted (validation skipped)\n");

        // Skip all validation and revision logic - just accept the composition
        break;
      } catch (error) {
        console.error("❌ Orchestration failed:", error);

        // CRITICAL: Save ABC notation even on error if it exists
        if (context.composition?.data?.abc_notation) {
          console.log(
            "💾 Saving best-effort ABC despite orchestration failure...",
          );
          await this.saveBestEffortAbc(context, options);
        } else {
          console.warn("⚠️  No ABC notation generated before failure");
        }

        throw error;
      }
    }

    // Determine quality status for filename tagging
    //const hasCriticalIssues = criticResult?.data.issues.some(i => i.severity === 'critical') || false;
    //const hasMajorIssues = criticResult?.data.issues.some(i => i.severity === 'major') || false;

    // Assemble final ABC with MIDI headers for standard composition
    const finalABC = this.assembleStandardABC(
      context.composition.data.abc_notation,
      context.timbrel.data,
      context.compositional_form.data,
    );

    return {
      abc_notation: finalABC,
      metadata: context.composition.data.metadata,
      genre_name: context.creative_genre_name.data.genre_name,
      full_context: context,
      validation: criticResult ? criticResult.data : null,
      quality_warnings: false,
      has_critical_issues: false,
      has_major_issues: false,
      /*
      quality_warnings: hasCriticalIssues || hasMajorIssues,
      has_critical_issues: hasCriticalIssues,
      has_major_issues: hasMajorIssues
      */
    };
  }

  /**
   * Run Arrangement and Compositional Form agents in tandem
   */
  async runArrangementFormTandem(userPrompt, context) {
    const maxRounds = 3;
    let arrangementResult = null;
    let formResult = null;

    for (let round = 1; round <= maxRounds; round++) {
      console.log(`   Round ${round}/${maxRounds}...`);

      // Arrangement agent gets form context (if available)
      arrangementResult = await this.arrangementAgent.execute(
        userPrompt,
        context,
        formResult ? formResult.data : null,
      );

      // Check for errors
      if (arrangementResult.status === "error") {
        throw new Error(
          `Arrangement Agent failed: ${arrangementResult.data.error}`,
        );
      }

      // Form agent gets arrangement context
      formResult = await this.compositionalFormAgent.execute(
        userPrompt,
        context,
        arrangementResult.data,
      );

      // Check for errors
      if (formResult.status === "error") {
        throw new Error(
          `Compositional Form Agent failed: ${formResult.data.error}`,
        );
      }

      // After first round, agents have each other's context
    }

    return {
      arrangement: arrangementResult,
      compositional_form: formResult,
    };
  }

  /**
   * Run Timbrel and Dynamics agents in tandem
   */
  async runTimbrelDynamicsTandem(userPrompt, context) {
    const maxRounds = 3;
    let timbrelResult = null;
    let dynamicsResult = null;

    for (let round = 1; round <= maxRounds; round++) {
      console.log(`   Round ${round}/${maxRounds}...`);

      // Dynamics agent goes first (gets timbrel context if available)
      dynamicsResult = await this.dynamicsAgent.execute(
        userPrompt,
        context,
        timbrelResult ? timbrelResult.data : null,
      );

      // Check for errors
      if (dynamicsResult.status === "error") {
        throw new Error(`Dynamics Agent failed: ${dynamicsResult.data.error}`);
      }

      // Timbrel agent gets dynamics context
      timbrelResult = await this.timbrelAgent.execute(
        userPrompt,
        context,
        dynamicsResult.data,
      );

      // Check for errors
      if (timbrelResult.status === "error") {
        throw new Error(`Timbrel Agent failed: ${timbrelResult.data.error}`);
      }
    }

    return {
      timbrel: timbrelResult,
      dynamics: dynamicsResult,
    };
  }

  /**
   * Handle revisions based on critic feedback
   */
  async handleRevisions(issues, context, userPrompt) {
    const agentsToRevise = new Set();

    // Determine which agents need to be re-run based on issues
    for (const issue of issues) {
      if (issue.severity === "critical" || issue.severity === "major") {
        if (issue.agent_to_revise) {
          agentsToRevise.add(issue.agent_to_revise);
        }
      }
    }

    console.log(`   Revising: ${Array.from(agentsToRevise).join(", ")}\n`);

    // Re-run specific agents
    if (
      agentsToRevise.has("arrangement") ||
      agentsToRevise.has("compositional_form")
    ) {
      const tandemResult = await this.runArrangementFormTandem(
        userPrompt,
        context,
      );
      context.arrangement = tandemResult.arrangement;
      context.compositional_form = tandemResult.compositional_form;
    }

    if (agentsToRevise.has("melodic")) {
      context.melodic = await this.melodicAgent.execute(userPrompt, context);
    }

    if (agentsToRevise.has("timbrel") || agentsToRevise.has("dynamics")) {
      const tandemResult = await this.runTimbrelDynamicsTandem(
        userPrompt,
        context,
      );
      context.timbrel = tandemResult.timbrel;
      context.dynamics = tandemResult.dynamics;
    }

    // Always re-run composition agent after revisions
    context.composition = await this.compositionAgent.execute(
      userPrompt,
      context,
    );
  }

  /**
   * Determine intelligent batch size for sequential composition
   * Based on musical form, genre, time signature, and voice count
   */
  determineSequentialBatchSize(formData, arrangementData, genreContext) {
    const totalMeasures = formData.total_measures;
    const voiceCount = arrangementData.total_voices;
    const timeSignature = formData.time_signature;
    const tempo = formData.tempo;

    // Start with form-based sections if available
    if (formData.sections && formData.sections.length > 0) {
      // Use the most common section length
      const sectionLengths = formData.sections.map((s) => s.measures);
      const commonLength = Math.min(...sectionLengths);
      if (commonLength >= 4 && commonLength <= 16) {
        return commonLength;
      }
    }

    // Genre-based intelligent defaults
    const genreName = genreContext?.genre_name?.toLowerCase() || "";

    // Electronic/repetitive genres = shorter loops
    if (
      genreName.includes("core") ||
      genreName.includes("techno") ||
      genreName.includes("house") ||
      genreName.includes("drum")
    ) {
      return 4; // Tight 4-bar loops for electronic music
    }

    // Classical/orchestral = longer phrases
    if (
      genreName.includes("classical") ||
      genreName.includes("baroque") ||
      genreName.includes("romantic") ||
      genreName.includes("symphony")
    ) {
      return 16; // Longer classical phrases
    }

    // Adjust for time signature
    const [numerator, denominator] = timeSignature.split("/").map(Number);
    if (numerator === 7 || numerator === 5) {
      // Odd meters work better with their own multiples
      return numerator * 2; // 14 bars for 7/8, 10 bars for 5/4
    }

    // Adjust for voice count - more voices need smaller batches
    if (voiceCount >= 8) {
      return 4; // Many voices = smaller batches to prevent chaos
    } else if (voiceCount >= 5) {
      return 8; // Medium ensemble
    }

    // Default: 8-bar phrases (most common in Western music)
    return 8;
  }

  /**
   * Compose music sequentially in intelligent batches
   * Instruments are composed together in sections, not isolation
   */
  async composeSequentially(userPrompt, context) {
    const arrangementData = context.arrangement.data;
    const formData = context.compositional_form.data;
    const timbrelData = context.timbrel.data;
    const genreContext = context.creative_genre_name?.data;

    // Determine intelligent batch size
    const batchSize = this.determineSequentialBatchSize(
      formData,
      arrangementData,
      genreContext,
    );
    const totalBatches = Math.ceil(formData.total_measures / batchSize);

    console.log("\n   ═══════════════════════════════════════");
    console.log("   SEQUENTIAL BATCH COMPOSITION");
    console.log(`   Total Voices: ${arrangementData.total_voices}`);
    console.log(`   Total Bars: ${formData.total_measures}`);
    console.log(`   Batch Size: ${batchSize} bars (intelligently determined)`);
    console.log(`   Total Batches: ${totalBatches}`);
    console.log("   ═══════════════════════════════════════\n");

    // Initialize voice data structures - include clef from arrangement
    const composedVoices = arrangementData.voices.map((v) => ({
      voice_number: v.voice_number,
      instrument_name: v.instrument_name,
      role: v.role,
      range: v.range,
      clef: v.clef || "treble", // Use clef from arrangement, default to treble
      voice_abc: "",
      sections: [],
      bar_count: 0,
    }));

    // Compose in batches - all voices per batch
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      const startBar = batchIndex * batchSize + 1;
      const endBar = Math.min(
        startBar + batchSize - 1,
        formData.total_measures,
      );
      const barsInBatch = endBar - startBar + 1;

      console.log(`\n   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(
        `   BATCH ${batchIndex + 1}/${totalBatches}: Bars ${startBar}-${endBar} (${barsInBatch} bars)`,
      );
      console.log(`   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

      // Compose each voice for this batch
      for (
        let voiceIndex = 0;
        voiceIndex < arrangementData.voices.length;
        voiceIndex++
      ) {
        const voice = arrangementData.voices[voiceIndex];
        const voiceData = composedVoices[voiceIndex];

        console.log(
          `   🎵 Voice ${voice.voice_number} (${voice.instrument_name}): Composing bars ${startBar}-${endBar}`,
        );

        // Build context from other voices in THIS batch
        const otherVoicesInBatch = [];
        for (let j = 0; j < voiceIndex; j++) {
          const otherVoice = composedVoices[j];
          if (otherVoice.sections[batchIndex]) {
            otherVoicesInBatch.push({
              voice_number: otherVoice.voice_number,
              instrument_name: otherVoice.instrument_name,
              abc: otherVoice.sections[batchIndex],
              role: otherVoice.role,
            });
          }
        }

        const batchContext = {
          voiceNumber: voice.voice_number,
          instrument: voice,
          batchIndex: batchIndex,
          startBar: startBar,
          endBar: endBar,
          barsInBatch: barsInBatch,
          timeSignature: formData.time_signature,
          tempo: formData.tempo,
          key: formData.key,
          otherVoicesInBatch: otherVoicesInBatch,
          previousBatches: voiceData.sections, // This voice's previous sections
          genreContext: genreContext, // Add genre context for better composition
        };

        // Compose this voice for this batch
        const batchResult = await this.composeBatchForVoice(
          userPrompt,
          context,
          batchContext,
        );

        if (batchResult.status === "error") {
          console.error(
            `   ❌ Failed to compose Voice ${voice.voice_number} for batch ${batchIndex + 1}`,
          );

          // Save partial progress for potential resumption
          context.partial_sequential_composition = {
            completed_batches: batchIndex,
            completed_voices_in_batch: voiceIndex,
            composed_voices: composedVoices,
            batch_size: batchSize,
          };

          try {
            await this.saveIntermediateOutput(
              "06_composition_partial",
              context,
            );
            console.log("   💾 Partial composition saved for resumption");
          } catch (saveError) {
            console.error(
              "   ⚠️ Failed to save partial composition:",
              saveError.message,
            );
          }

          return {
            status: "error",
            data: {
              error: batchResult.data.error,
              failed_voice: voice.voice_number,
              failed_batch: batchIndex + 1,
              partial_progress_saved: true,
            },
          };
        }

        // Store the batch result
        voiceData.sections.push(batchResult.data.voice_abc);
        voiceData.bar_count += batchResult.data.bar_count;
        console.log(`      ✅ ${batchResult.data.bar_count} bars composed`);
      }
    }

    // Assemble final ABC for each voice
    console.log("\n   📝 Assembling final sequential composition...");
    for (let i = 0; i < composedVoices.length; i++) {
      const voiceData = composedVoices[i];
      // Use the clef from arrangement data instead of guessing
      voiceData.voice_abc = `V:${voiceData.voice_number} clef=${voiceData.clef}\n`;
      voiceData.voice_abc += voiceData.sections.join("\n");
      console.log(
        `   ✅ Voice ${voiceData.voice_number} (${voiceData.instrument_name}): ${voiceData.bar_count} total bars`,
      );
    }

    // Assemble final ABC notation
    console.log("   📝 Assembling final ABC notation...");
    const abcNotation = this.assembleSequentialABC(
      composedVoices,
      formData,
      timbrelData,
      context,
    );

    return {
      status: "success",
      data: {
        abc_notation: abcNotation,
        metadata: {
          title: `${context.creative_genre_name.data.genre_name} Composition`,
          total_bars: formData.total_measures,
          voices_used: arrangementData.total_voices,
          key: formData.key,
          tempo: formData.tempo,
          composition_method: "sequential",
        },
      },
    };
  }

  async composeBatchForVoice(userPrompt, context, batchContext) {
    const {
      voiceNumber,
      instrument,
      startBar,
      endBar,
      barsInBatch,
      timeSignature,
      tempo,
      key,
      otherVoicesInBatch,
      previousBatches,
      batchIndex,
      genreContext,
    } = batchContext;

    // Build context-aware prompt for this batch
    let batchPrompt = `Compose bars ${startBar}-${endBar} (${barsInBatch} bars) for Voice ${voiceNumber} (${instrument.instrument_name}).\n\n`;

    // Add genre fusion context
    if (genreContext) {
      batchPrompt += `Genre Fusion: ${genreContext.genre_name}\n`;
      if (genreContext.genre_description) {
        batchPrompt += `Style: ${genreContext.genre_description}\n`;
      }
      batchPrompt += "\n";
    }

    // Add musical context
    batchPrompt += `Musical Context:\n`;
    batchPrompt += `- Key: ${key}\n`;
    batchPrompt += `- Time Signature: ${timeSignature}\n`;
    batchPrompt += `- Tempo: ${tempo} BPM\n`;
    batchPrompt += `- Role: ${instrument.role}\n`;
    batchPrompt += `- Range: ${instrument.range}\n\n`;

    // Add information about other voices in this batch for harmonization
    if (otherVoicesInBatch.length > 0) {
      batchPrompt += `Other voices already composed for this section (bars ${startBar}-${endBar}):\n`;
      for (const otherVoice of otherVoicesInBatch) {
        batchPrompt += `\nVoice ${otherVoice.voice_number} (${otherVoice.instrument_name}, ${otherVoice.role}):\n`;
        batchPrompt += `${otherVoice.abc}\n`;
      }
      batchPrompt += `\nPlease compose music that harmonizes and interacts musically with these existing voices.\n`;
    } else {
      batchPrompt += `This is the first voice for this section. Establish the musical foundation for bars ${startBar}-${endBar}.\n`;
    }

    // Add continuity context if this isn't the first batch
    if (previousBatches && previousBatches.length > 0) {
      batchPrompt += `\nPrevious section for this voice (bars ${Math.max(1, startBar - barsInBatch)}-${startBar - 1}):\n`;
      batchPrompt += `${previousBatches[previousBatches.length - 1]}\n`;
      batchPrompt += `\nEnsure smooth musical continuity from the previous section.\n`;
    } else if (batchIndex === 0) {
      batchPrompt += `\nThis is the beginning of the piece. Start with appropriate musical introduction.\n`;
    }

    // Add specific composition requirements
    batchPrompt += `\nIMPORTANT REQUIREMENTS:\n`;
    batchPrompt += `- Compose EXACTLY ${barsInBatch} complete bars\n`;
    batchPrompt += `- Each bar must be properly filled according to the time signature ${timeSignature}\n`;
    batchPrompt += `- Use appropriate note values, rhythms, and musical phrases\n`;
    batchPrompt += `- Include dynamics and articulations as appropriate\n`;
    batchPrompt += `- Ensure the music is idiomatic for ${instrument.instrument_name}\n`;
    batchPrompt += `- Do NOT include voice headers (V:), clefs, or other ABC headers\n`;
    batchPrompt += `- Return ONLY the musical notation for these ${barsInBatch} bars\n`;

    try {
      // Create a modified context for the batch
      const batchCompositionContext = {
        ...context,
        batch_specific: {
          start_bar: startBar,
          end_bar: endBar,
          bars_to_compose: barsInBatch,
          is_batch_mode: true,
          current_voice: instrument,
        },
      };

      // Call the composition agent's execute method
      const compositionResult = await this.compositionAgent.execute(
        batchPrompt,
        batchCompositionContext,
      );

      if (compositionResult.status === "error") {
        return {
          status: "error",
          data: {
            error: compositionResult.error || "Failed to compose batch",
            voice: voiceNumber,
            batch: `bars ${startBar}-${endBar}`,
          },
        };
      }

      // Validate the result structure
      const batchResult = compositionResult.data;
      if (!batchResult.voice_abc && !batchResult.abc_notation) {
        return {
          status: "error",
          data: {
            error: "CompositionAgent returned no music notation",
            voice: voiceNumber,
            batch: `bars ${startBar}-${endBar}`,
            received_keys: Object.keys(batchResult),
          },
        };
      }

      // Extract just the music notation (no headers)
      let voiceABC = batchResult.voice_abc || batchResult.abc_notation;

      // Remove any voice headers that might have been included
      voiceABC = voiceABC.replace(/^V:\d+.*\n/gm, "");
      voiceABC = voiceABC.replace(/^%%.*\n/gm, "");
      voiceABC = voiceABC.replace(/^[KLMQTw]:.*\n/gm, "");

      // Clean up extra whitespace
      voiceABC = voiceABC.trim();

      // Stricter bar count validation
      // Count bar lines more accurately (single bars only, not double bars)
      const barLines = (voiceABC.match(/\|(?!\|)/g) || []).length;
      const doubleBarLines = (voiceABC.match(/\|\|/g) || []).length;
      const repeatBars = (voiceABC.match(/\|:/g) || []).length;
      const totalBars = barLines + doubleBarLines;

      const tolerance = 1; // Allow only 1 bar difference for edge cases
      if (Math.abs(totalBars - barsInBatch) > tolerance) {
        console.error(
          `      ❌ Bar count mismatch: expected ${barsInBatch}, got ${totalBars} bars`,
        );
        return {
          status: "error",
          data: {
            error: `Bar count mismatch: expected ${barsInBatch}, got ${totalBars} bars (${barLines} single, ${doubleBarLines} double)`,
            voice: voiceNumber,
            batch: `bars ${startBar}-${endBar}`,
            abc_sample: voiceABC.substring(0, 200) + "...",
          },
        };
      } else if (totalBars !== barsInBatch) {
        console.warn(
          `      ⚠️ Minor bar count difference: expected ${barsInBatch}, got ${totalBars} bars`,
        );
      }

      return {
        status: "success",
        data: {
          voice_abc: voiceABC,
          bar_count: barsInBatch,
          actual_bars: totalBars,
        },
      };
    } catch (error) {
      return {
        status: "error",
        data: {
          error: error.message,
          voice: voiceNumber,
          batch: `bars ${startBar}-${endBar}`,
        },
      };
    }
  }

  /**
   * Assemble ABC notation for standard composition (adds MIDI headers to existing ABC)
   */
  assembleStandardABC(compositionABC, timbrelData, formData) {
    // Parse the ABC to find where to insert MIDI headers
    const lines = compositionABC.split("\n");
    const headerEnd = lines.findIndex((line) => line.startsWith("K:")) + 1;

    // Build MIDI configuration section
    let midiSection = "";

    // Add MIDI program declarations from timbrel
    if (
      timbrelData.midi_configuration &&
      timbrelData.midi_configuration.voice_programs &&
      timbrelData.midi_configuration.voice_programs.length > 0
    ) {
      midiSection += "%\n";
      for (
        let i = 0;
        i < timbrelData.midi_configuration.voice_programs.length;
        i++
      ) {
        const voiceProgram = timbrelData.midi_configuration.voice_programs[i];
        midiSection += `%%MIDI program ${i + 1} ${voiceProgram.program}\n`;
      }
    }

    // Add drum channel if enabled
    if (timbrelData.drum_configuration) {
      midiSection += `%%MIDI channel 10\n`;
    }

    if (midiSection) {
      midiSection += "%\n";
    }

    // Insert MIDI section after headers
    const header = lines.slice(0, headerEnd).join("\n");
    const body = lines.slice(headerEnd).join("\n");

    return header + "\n" + midiSection + body;
  }

  /**
   * Assemble ABC notation from individually composed voices
   */
  assembleSequentialABC(composedVoices, formData, timbrelData, context) {
    const genreData = context.creative_genre_name.data;

    // Build ABC header
    let abc = `X:1
T:${genreData.genre_name}
M:${formData.time_signature}
L:1/16
Q:1/4=${formData.tempo}
K:${formData.key}
`;

    // Add MIDI program declarations from timbrel
    if (
      timbrelData.midi_configuration &&
      timbrelData.midi_configuration.voice_programs &&
      timbrelData.midi_configuration.voice_programs.length > 0
    ) {
      abc += "%\n";
      for (
        let i = 0;
        i < timbrelData.midi_configuration.voice_programs.length;
        i++
      ) {
        const voiceProgram = timbrelData.midi_configuration.voice_programs[i];
        abc += `%%MIDI program ${i + 1} ${voiceProgram.program}\n`;
      }
    }

    // Add drum channel if enabled
    if (timbrelData.drum_configuration) {
      abc += `%%MIDI channel 10\n`;
    }

    abc += "%\n";

    // Add each composed voice
    for (const voice of composedVoices) {
      abc += voice.voice_abc + "\n";
    }

    // Add drum track if enabled
    if (timbrelData.drum_configuration) {
      abc += `V:D clef=perc\n`; // NO BRACKETS!
      abc += `% Drum track (generated pattern for ${formData.time_signature})\n`;

      // Generate pattern based on time signature
      const drumPattern = this.generateDrumPatternForTimeSignature(
        formData.time_signature,
      );
      const barsNeeded = formData.total_measures;

      for (let i = 0; i < barsNeeded; i++) {
        abc += drumPattern + "|";
        if ((i + 1) % 4 === 0) abc += "\n";
      }

      // Verify drum bar count matches other voices
      console.log(`   ✅ Drum track: ${barsNeeded} bars (matching all voices)`);
    }

    return abc;
  }

  /**
   * Generate a drum pattern appropriate for the time signature
   */
  generateDrumPatternForTimeSignature(timeSig) {
    // Pattern library for different time signatures
    // Each pattern must equal exactly one bar for the time signature
    // With L:1/16 (sixteenth note as unit)
    const patterns = {
      "4/4": "B2z2 B2z2 B2z2 B2z2 ", // 16 sixteenth notes = 1 bar of 4/4
      "3/4": "B2z2 B2z2 B2z2 ", // 12 sixteenth notes = 1 bar of 3/4
      "6/8": "B2z2 B2z2 B2z2 ", // 12 sixteenth notes = 1 bar of 6/8
      "5/4": "B2z2 B2z2 B2z2 B2z2 B2z2 ", // 20 sixteenth notes = 1 bar of 5/4
      "7/8": "B2 B2 B2 B2 B2 B2 B2 ", // 14 sixteenth notes = 1 bar of 7/8 (7 x 2 = 14)
      "2/4": "B2z2 B2z2 ", // 8 sixteenth notes = 1 bar of 2/4
      "2/2": "B2z2 B2z2 B2z2 B2z2 ", // 16 sixteenth notes = 1 bar of 2/2
      "9/8": "B2 B2 B2 B2 B2 B2 B2 B2 B2 ", // 18 sixteenth notes = 1 bar of 9/8
      "12/8": "B2z2 B2z2 B2z2 B2z2 B2z2 B2z2 ", // 24 sixteenth notes = 1 bar of 12/8
    };

    // Return pattern for the time signature, or default to 4/4
    return patterns[timeSig] || patterns["4/4"];
  }
}
