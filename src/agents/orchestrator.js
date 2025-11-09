/**
 * Music Composition Orchestrator
 * Coordinates all specialist agents to create complete musical compositions
 */

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
  constructor(anthropic) {
    this.anthropic = anthropic;

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

    this.maxRevisions = 3;
  }

  /**
   * Main orchestration method
   */
  async orchestrate(userPrompt, options = {}) {
    console.log('🎼 Starting Music Composition Orchestration...\n');

    const context = {
      user_prompt: userPrompt,
      options: options
    };

    let revisionCount = 0;
    let criticResult = null;

    while (revisionCount <= this.maxRevisions) {
      try {
        // STEP 2: Creative Genre Name Agent
        console.log('📝 Step 2: Generating creative genre name...');
        const genreResult = await this.creativeGenreNameAgent.execute(userPrompt, context);
        if (genreResult.status === 'error') throw new Error('Creative Genre Name Agent failed');
        context.creative_genre_name = genreResult;
        console.log(`   ✓ Genre: "${genreResult.data.genre_name}"\n`);

        // STEP 3: Music History Agent
        console.log('📚 Step 3: Analyzing music history context...');
        const historyResult = await this.musicHistoryAgent.execute(userPrompt, context);
        if (historyResult.status === 'error') throw new Error('Music History Agent failed');
        context.music_history = historyResult;
        console.log(`   ✓ Historical analysis complete\n`);

        // STEP 4: Arrangement + Compositional Form (IN TANDEM)
        console.log('🎹 Step 4: Arrangement & Compositional Form (working in tandem)...');
        const tandemResult = await this.runArrangementFormTandem(userPrompt, context);
        context.arrangement = tandemResult.arrangement;
        context.compositional_form = tandemResult.compositional_form;
        console.log(`   ✓ ${context.arrangement.data.total_voices} voices arranged`);
        console.log(`   ✓ ${context.compositional_form.data.total_measures} measure structure created\n`);

        // STEP 5: Melodic Agent
        console.log('🎵 Step 5: Creating melodic themes...');
        const melodicResult = await this.melodicAgent.execute(userPrompt, context);
        if (melodicResult.status === 'error') throw new Error('Melodic Agent failed');
        context.melodic = melodicResult;
        console.log(`   ✓ Melodic themes created\n`);

        // STEP 6: Timbrel + Dynamics (IN TANDEM)
        console.log('🎚️  Step 6: Timbrel & Dynamics (working in tandem)...');
        const timbrelDynamicsTandem = await this.runTimbrelDynamicsTandem(userPrompt, context);
        context.timbrel = timbrelDynamicsTandem.timbrel;
        context.dynamics = timbrelDynamicsTandem.dynamics;
        console.log(`   ✓ MIDI configuration complete`);
        console.log(`   ✓ Dynamic arc designed\n`);

        // STEP 7: Composition Agent (ABC Assembly)
        console.log('🎼 Step 7: Assembling ABC notation...');
        const compositionResult = await this.compositionAgent.execute(userPrompt, context);
        if (compositionResult.status === 'error') throw new Error('Composition Agent failed');
        context.composition = compositionResult;
        console.log(`   ✓ ABC notation generated\n`);

        // STEP 8: Critic Agent (Validation)
        console.log('🔍 Step 8: Validating composition...');
        criticResult = await this.criticAgent.execute(userPrompt, context);
        if (criticResult.status === 'error') throw new Error('Critic Agent failed');

        if (criticResult.data.recommendation === 'accept') {
          console.log(`   ✅ Composition validated successfully!\n`);
          break;
        } else {
          revisionCount++;
          console.log(`   ⚠️  Issues found (${criticResult.data.issues.length}). Revision ${revisionCount}/${this.maxRevisions}...\n`);

          if (revisionCount > this.maxRevisions) {
            console.log(`   ⚠️  Max revisions reached. Accepting with issues.\n`);
            break;
          }

          // Determine which agents need to be re-run
          await this.handleRevisions(criticResult.data.issues, context, userPrompt);
        }

      } catch (error) {
        console.error('❌ Orchestration failed:', error);
        throw error;
      }
    }

    return {
      abc_notation: context.composition.data.abc_notation,
      metadata: context.composition.data.metadata,
      genre_name: context.creative_genre_name.data.genre_name,
      full_context: context,
      validation: criticResult ? criticResult.data : null
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

      // Form agent gets arrangement context
      formResult = await this.compositionalFormAgent.execute(
        userPrompt,
        context,
        arrangementResult.data
      );

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

      // Timbrel agent gets dynamics context
      timbrelResult = await this.timbrelAgent.execute(
        userPrompt,
        context,
        dynamicsResult.data
      );
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
