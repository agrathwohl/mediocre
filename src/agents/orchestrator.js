/**
 * Music Composition Orchestrator
 * Coordinates all specialist agents to create complete musical compositions
 */

import fs from 'fs/promises';
import path from 'path';
import { CreativeGenreNameAgent } from './creative-genre-name.js';
import { MusicHistoryAgent } from './music-history.js';
import { ArrangementAgent } from './arrangement.js';
import { CompositionalFormAgent } from './compositional-form.js';
import { MelodicAgent } from './melodic.js';
import { TimbrelAgent } from './timbrel.js';
import { DynamicsAgent } from './dynamics.js';
import { CompositionAgent } from './composition.js';
import { CriticAgent } from './critic.js';

export class MusicOrchestrator {
  constructor(anthropic, options = {}) {
    this.anthropic = anthropic;
    this.saveIntermediateOutputs = options.saveIntermediateOutputs !== false; // Default true
    this.intermediateOutputDir = options.intermediateOutputDir || './temp/orchestrator';
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
    this.criticAgent = new CriticAgent(anthropic);

    this.maxRevisions = 5;  // More revisions allowed - we don't settle for "good enough"
    this.aestheticStandards = {
      // We maintain vigilant oversight of aesthetic goals
      minimumQualityThreshold: 0.8,  // High bar for acceptance
      rejectMinorIssues: false,  // We'll accept minor issues, but NEVER major ones
      rejectCriticalIssues: true,  // Absolutely no tolerance for critical issues
      enforceGenreAuthenticity: true,  // Must authentically represent both genres
      enforceMusicalCoherence: true   // Must be musically coherent and compelling
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
        `${this.sessionId}_${step}.json`
      );
      await fs.writeFile(outputPath, JSON.stringify(context, null, 2));
      console.log(`   💾 Saved checkpoint: ${step}`);
    } catch (error) {
      console.warn(`   ⚠️  Failed to save intermediate output: ${error.message}`);
    }
  }

  /**
   * Find the latest checkpoint for resumption
   */
  async findLatestCheckpoint(sessionId) {
    try {
      const files = await fs.readdir(this.intermediateOutputDir);
      const sessionFiles = files
        .filter(f => f.startsWith(`${sessionId}_`) && f.endsWith('.json'))
        .sort()
        .reverse();

      if (sessionFiles.length === 0) {
        return null;
      }

      const latestFile = sessionFiles[0];
      const step = latestFile.replace(`${sessionId}_`, '').replace('.json', '');
      const content = await fs.readFile(
        path.join(this.intermediateOutputDir, latestFile),
        'utf-8'
      );

      return {
        step,
        context: JSON.parse(content),
        file: latestFile
      };
    } catch (error) {
      console.warn(`   ⚠️  Failed to load checkpoint: ${error.message}`);
      return null;
    }
  }

  /**
   * Main orchestration method
   */
  async orchestrate(userPrompt, options = {}) {
    const refinementRounds = options.refinements || 0;

    console.log('🎼 Starting Music Composition Orchestration...\n');
    console.log(`💾 Session ID: ${this.sessionId}`);
    if (refinementRounds > 0) {
      console.log(`🔁 Refinement rounds: ${refinementRounds}\n`);
    } else {
      console.log();
    }

    let context = {
      user_prompt: userPrompt,
      options: options
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
        if (!resumeFrom || resumeFrom < '01_creative_genre_name') {
          console.log('📝 Step 2: Generating creative genre name...');
          const genreResult = await this.creativeGenreNameAgent.execute(userPrompt, context);
          if (genreResult.status === 'error') throw new Error('Creative Genre Name Agent failed');
          context.creative_genre_name = genreResult;
          console.log(`   ✓ Genre: "${genreResult.data.genre_name}"`);
          await this.saveIntermediateOutput('01_creative_genre_name', context);
          console.log();
        } else {
          console.log('📝 Step 2: ✓ Loaded from checkpoint');
        }

        // STEP 3: Music History Agent
        if (!resumeFrom || resumeFrom < '02_music_history') {
          console.log('📚 Step 3: Analyzing music history context...');
          const historyResult = await this.musicHistoryAgent.execute(userPrompt, context);
          if (historyResult.status === 'error') throw new Error('Music History Agent failed');
          context.music_history = historyResult;
          console.log(`   ✓ Historical analysis complete`);
          await this.saveIntermediateOutput('02_music_history', context);
          console.log();
        } else {
          console.log('📚 Step 3: ✓ Loaded from checkpoint');
        }

        // STEP 4: Arrangement + Compositional Form (IN TANDEM)
        if (!resumeFrom || resumeFrom < '03_arrangement_and_form') {
          console.log('🎹 Step 4: Arrangement & Compositional Form (working in tandem)...');
          const tandemResult = await this.runArrangementFormTandem(userPrompt, context);
          context.arrangement = tandemResult.arrangement;
          context.compositional_form = tandemResult.compositional_form;
          console.log(`   ✓ ${context.arrangement.data.total_voices} voices arranged`);
          console.log(`   ✓ ${context.compositional_form.data.total_measures} measure structure created`);
          await this.saveIntermediateOutput('03_arrangement_and_form', context);
          console.log();
        } else {
          console.log('🎹 Step 4: ✓ Loaded from checkpoint');
        }

        // STEP 5: Melodic Agent
        if (!resumeFrom || resumeFrom < '04_melodic') {
          console.log('🎵 Step 5: Creating melodic themes...');
          const melodicResult = await this.melodicAgent.execute(userPrompt, context);
          if (melodicResult.status === 'error') throw new Error('Melodic Agent failed');
          context.melodic = melodicResult;
          console.log(`   ✓ Melodic themes created`);
          await this.saveIntermediateOutput('04_melodic', context);
          console.log();
        } else {
          console.log('🎵 Step 5: ✓ Loaded from checkpoint');
        }

        // STEP 6: Timbrel + Dynamics (IN TANDEM)
        if (!resumeFrom || resumeFrom < '05_timbrel_and_dynamics') {
          console.log('🎚️  Step 6: Timbrel & Dynamics (working in tandem)...');
          const timbrelDynamicsTandem = await this.runTimbrelDynamicsTandem(userPrompt, context);
          context.timbrel = timbrelDynamicsTandem.timbrel;
          context.dynamics = timbrelDynamicsTandem.dynamics;
          console.log(`   ✓ MIDI configuration complete`);
          console.log(`   ✓ Dynamic arc designed`);
          await this.saveIntermediateOutput('05_timbrel_and_dynamics', context);
          console.log();
        } else {
          console.log('🎚️  Step 6: ✓ Loaded from checkpoint');
        }

        // STEP 7: Composition Agent (ABC Assembly)
        if (!resumeFrom || resumeFrom < '06_composition') {
          console.log('🎼 Step 7: Assembling ABC notation...');
          const compositionResult = await this.compositionAgent.execute(userPrompt, context);
          if (compositionResult.status === 'error') throw new Error('Composition Agent failed');
          context.composition = compositionResult;
          console.log(`   ✓ ABC notation generated`);
          await this.saveIntermediateOutput('06_composition', context);
          console.log();
        } else {
          console.log('🎼 Step 7: ✓ Loaded from checkpoint');
        }

        // Clear resumeFrom after first iteration to allow revisions
        resumeFrom = null;

        // STEP 8: Critic Agent (DISABLED - Skipping validation)
        console.log('🔍 Step 8: Skipping validation (Critic agent disabled)...');
        console.log('   ✓ Composition accepted without validation\n');

        // Create a dummy critic result for compatibility
        criticResult = {
          status: 'success',
          data: {
            validation_status: 'pass',
            issues: [],
            syntax_errors: {},
            musical_quality_notes: 'Validation skipped by user request',
            recommendation: 'accept'
          }
        };

        // Skip all validation and revision logic - just accept the composition
        break;

      } catch (error) {
        console.error('❌ Orchestration failed:', error);
        throw error;
      }
    }

    // Determine quality status for filename tagging
    const hasCriticalIssues = criticResult?.data.issues.some(i => i.severity === 'critical') || false;
    const hasMajorIssues = criticResult?.data.issues.some(i => i.severity === 'major') || false;

    // REFINEMENT ROUNDS: Expand and improve the composition
    if (refinementRounds > 0) {
      for (let refinementRound = 1; refinementRound <= refinementRounds; refinementRound++) {
        console.log(`\n${'═'.repeat(60)}`);
        console.log(`🔁 REFINEMENT ROUND ${refinementRound}/${refinementRounds}`);
        console.log(`${'═'.repeat(60)}\n`);

        // Store previous composition as context for refinement
        const previousComposition = context.composition.data.abc_notation;
        const previousMetadata = context.composition.data.metadata;

        context.previous_composition = {
          abc_notation: previousComposition,
          metadata: previousMetadata,
          refinement_round: refinementRound
        };

        // Build refinement prompt
        const refinementPrompt = `${userPrompt}

REFINEMENT ROUND ${refinementRound}:
You are refining and EXPANDING upon a previous composition. Your goal is to:
1. EXPAND the length significantly (add more measures/sections)
2. ENHANCE the existing musical ideas with more variation and development
3. ADD new musical material that complements what exists
4. IMPROVE the overall quality and coherence
5. MAINTAIN the core aesthetic and genre fusion

Previous composition: ${previousMetadata.total_bars} measures
Target for this refinement: Aim for at least ${Math.floor(previousMetadata.total_bars * 1.5)} measures

Build upon the previous work, don't just repeat it. Add NEW sections, NEW variations, and DEEPER development.`;

        // Re-run all agents with previous composition as context
        // Skip genre name agent - keep the same genre
        console.log('📚 Step 3: Refining music history analysis...');
        const historyResult = await this.musicHistoryAgent.execute(refinementPrompt, context);
        if (historyResult.status === 'error') throw new Error('Music History Agent failed');
        context.music_history = historyResult;
        console.log(`   ✓ Historical analysis refined\n`);

        console.log('🎹 Step 4: Expanding arrangement & form...');
        const tandemResult = await this.runArrangementFormTandem(refinementPrompt, context);
        context.arrangement = tandemResult.arrangement;
        context.compositional_form = tandemResult.compositional_form;
        console.log(`   ✓ ${context.arrangement.data.total_voices} voices arranged`);
        console.log(`   ✓ ${context.compositional_form.data.total_measures} measure structure created\n`);

        console.log('🎵 Step 5: Developing melodic themes...');
        const melodicResult = await this.melodicAgent.execute(refinementPrompt, context);
        if (melodicResult.status === 'error') throw new Error('Melodic Agent failed');
        context.melodic = melodicResult;
        console.log(`   ✓ Melodic themes developed\n`);

        console.log('🎚️  Step 6: Refining timbrel & dynamics...');
        const timbrelDynamicsTandem = await this.runTimbrelDynamicsTandem(refinementPrompt, context);
        context.timbrel = timbrelDynamicsTandem.timbrel;
        context.dynamics = timbrelDynamicsTandem.dynamics;
        console.log(`   ✓ MIDI configuration refined`);
        console.log(`   ✓ Dynamic arc enhanced\n`);

        console.log('🎼 Step 7: Assembling expanded ABC notation...');
        const compositionResult = await this.compositionAgent.execute(refinementPrompt, context);
        if (compositionResult.status === 'error') throw new Error('Composition Agent failed');
        context.composition = compositionResult;
        console.log(`   ✓ ABC notation expanded from ${previousMetadata.total_bars} to ${compositionResult.data.metadata.total_bars} measures\n`);

        await this.saveIntermediateOutput(`07_refinement_${refinementRound}_composition`, context);
      }
    }

    return {
      abc_notation: context.composition.data.abc_notation,
      metadata: context.composition.data.metadata,
      genre_name: context.creative_genre_name.data.genre_name,
      full_context: context,
      validation: criticResult ? criticResult.data : null,
      quality_warnings: hasCriticalIssues || hasMajorIssues,
      has_critical_issues: hasCriticalIssues,
      has_major_issues: hasMajorIssues,
      refinements_completed: refinementRounds
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
        formResult ? formResult.data : null
      );

      // Check for errors
      if (arrangementResult.status === 'error') {
        throw new Error(`Arrangement Agent failed: ${arrangementResult.data.error}`);
      }

      // Form agent gets arrangement context
      formResult = await this.compositionalFormAgent.execute(
        userPrompt,
        context,
        arrangementResult.data
      );

      // Check for errors
      if (formResult.status === 'error') {
        throw new Error(`Compositional Form Agent failed: ${formResult.data.error}`);
      }

      // After first round, agents have each other's context
    }

    return {
      arrangement: arrangementResult,
      compositional_form: formResult
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
        timbrelResult ? timbrelResult.data : null
      );

      // Check for errors
      if (dynamicsResult.status === 'error') {
        throw new Error(`Dynamics Agent failed: ${dynamicsResult.data.error}`);
      }

      // Timbrel agent gets dynamics context
      timbrelResult = await this.timbrelAgent.execute(
        userPrompt,
        context,
        dynamicsResult.data
      );

      // Check for errors
      if (timbrelResult.status === 'error') {
        throw new Error(`Timbrel Agent failed: ${timbrelResult.data.error}`);
      }
    }

    return {
      timbrel: timbrelResult,
      dynamics: dynamicsResult
    };
  }

  /**
   * Handle revisions based on critic feedback
   */
  async handleRevisions(issues, context, userPrompt) {
    const agentsToRevise = new Set();

    // Determine which agents need to be re-run based on issues
    for (const issue of issues) {
      if (issue.severity === 'critical' || issue.severity === 'major') {
        if (issue.agent_to_revise) {
          agentsToRevise.add(issue.agent_to_revise);
        }
      }
    }

    console.log(`   Revising: ${Array.from(agentsToRevise).join(', ')}\n`);

    // Re-run specific agents
    if (agentsToRevise.has('arrangement') || agentsToRevise.has('compositional_form')) {
      const tandemResult = await this.runArrangementFormTandem(userPrompt, context);
      context.arrangement = tandemResult.arrangement;
      context.compositional_form = tandemResult.compositional_form;
    }

    if (agentsToRevise.has('melodic')) {
      context.melodic = await this.melodicAgent.execute(userPrompt, context);
    }

    if (agentsToRevise.has('timbrel') || agentsToRevise.has('dynamics')) {
      const tandemResult = await this.runTimbrelDynamicsTandem(userPrompt, context);
      context.timbrel = tandemResult.timbrel;
      context.dynamics = tandemResult.dynamics;
    }

    // Always re-run composition agent after revisions
    context.composition = await this.compositionAgent.execute(userPrompt, context);
  }
}
