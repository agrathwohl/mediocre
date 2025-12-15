/**
 * Music Combination Orchestrator
 * Coordinates specialist agents to intelligently combine existing musical compositions
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
import { InstrumentComposerAgent } from './instrument-composer.js';
import { CriticAgent } from './critic.js';
import { ContextTransformer } from '../utils/context-transformer.js';

export class CombineOrchestrator {
  constructor(anthropic, options = {}) {
    this.anthropic = anthropic;
    this.saveIntermediateOutputs = options.saveIntermediateOutputs !== false;
    this.intermediateOutputDir = options.intermediateOutputDir || './temp/combine-orchestrator';
    this.sessionId = options.sessionId || Date.now();

    // ARTISTIC PHILOSOPHY:
    // This orchestrator specializes in the art of musical combination and synthesis.
    // We don't create mashups - we create entirely new compositions inspired by existing works.
    // We extract the essence and spirit of source compositions to birth something unique.
    // We maintain the same uncompromising standards as the composition orchestrator.

    // Initialize specialist agents for combination workflow
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

    this.maxRevisions = 5;
    this.combinationStandards = {
      minimumQualityThreshold: 0.85, // Even higher bar for combinations
      rejectDirectCopying: true,      // Must not directly copy source material
      enforceOriginality: true,       // Must create something genuinely new
      enforceCoherence: true,         // Combined elements must form coherent whole
      respectSourceEssence: true      // Must honor the spirit of source pieces
    };
  }

  /**
   * Generate source-aware prompts for agents when combining compositions
   */
  getCombinationPrompt(basePrompt, agentType, sourcePieces) {
    if (!sourcePieces || sourcePieces.length === 0) {
      return basePrompt;
    }

    const sourceInstructions = {
      arrangement: `
COMBINATION MODE - Arrangement from ${sourcePieces.length} source compositions:
- PRESERVE voice structures from source pieces
- SYNTHESIZE instrumental combinations that appear across sources
- CREATE unified arrangement that respects source instrumentation`,

      melodic: `
COMBINATION MODE - Extract melodic material from ${sourcePieces.length} source compositions:
- EXTRACT melodic themes and motifs from source_analysis.source_abc_notations
- TRANSFORM and develop them into cohesive melodic narrative
- PRESERVE memorable melodies while creating variations`,

      timbrel: `
COMBINATION MODE - Timbrel synthesis from ${sourcePieces.length} source compositions:
- PRESERVE instruments that appear in source pieces (see source_analysis)
- BLEND timbral qualities from different sources naturally
- ADD complementary timbres only when needed for cohesion`,

      dynamics: `
COMBINATION MODE - Dynamic expression from ${sourcePieces.length} source compositions:
- ANALYZE dynamic patterns in source pieces
- CREATE new expression arc that honors source character
- PRESERVE distinctive dynamic features from sources`
    };

    const instruction = sourceInstructions[agentType] || '';
    return instruction ? `${basePrompt}\n${instruction}` : basePrompt;
  }

  /**
   * Save intermediate outputs for resumption
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
      // Directory doesn't exist, no checkpoints
      return null;
    }
  }

  /**
   * Save best-effort ABC notation immediately
   * CRITICAL: Always save ABC as soon as it exists, regardless of validation
   */
  async saveBestEffortAbc(context) {
    try {
      const abc = context.full_context.instrument_parts.data.abc_notation;

      // Validate ABC is non-empty
      if (!abc || abc.trim().length === 0) {
        console.warn('   ⚠️  ABC notation is empty, not saving');
        return;
      }

      const genreName = (context.full_context.combination_concept?.data?.genre_name || 'combined')
        .toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const timestamp = Date.now();
      const filename = `${genreName}-best-effort-${timestamp}.abc`;

      const outputDir = context.options?.output || './output';
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
   * Main orchestration method for combining compositions
   */
  async orchestrateCombination(sourcePieces, userPrompt, options = {}) {
    console.log('\n🎭 COMBINATION ORCHESTRATOR ACTIVATED');
    console.log('═══════════════════════════════════════════════════════\n');

    // Initialize context with source pieces
    let context = {
      source_pieces: sourcePieces,
      user_prompt: userPrompt,
      options,
      full_context: {}
    };

    // Check for resumption
    if (options.resume) {
      const checkpoint = await this.findLatestCheckpoint(options.resume);
      if (checkpoint) {
        console.log(`📂 Resuming from checkpoint: ${checkpoint.step}\n`);
        context = checkpoint.context;
      }
    }

    try {
      // Step 1: Analyze source compositions
      if (!context.full_context.source_analysis) {
        console.log('🔍 Step 1: Analyzing Source Compositions');
        console.log('   Agent: Source Analysis Specialist');

        const sourceAnalysis = await this.analyzeSourceCompositions(sourcePieces);
        context.full_context.source_analysis = {
          step: 'source_analysis',
          data: sourceAnalysis
        };

        await this.saveIntermediateOutput('01_source_analysis', context);
        console.log('   ✓ Source analysis complete\n');
      }

      // Step 2: Generate creative combination concept
      if (!context.full_context.combination_concept) {
        console.log('🎨 Step 2: Creating Combination Concept');
        console.log('   Agent: Creative Genre Name Agent');

        const conceptResult = await this.creativeGenreNameAgent.execute(
          userPrompt,
          context.full_context
        );

        // Validate that agent returned required fields
        if (!conceptResult.data.genre_name) {
          console.warn('   ⚠️  WARNING: Combination Concept agent returned incomplete data');
          console.warn('   Using fallback genre name: Experimental_Fusion');
          conceptResult.data.genre_name = 'Experimental_Fusion';
        }

        context.full_context.combination_concept = {
          step: 'combination_concept',
          data: conceptResult.data
        };

        await this.saveIntermediateOutput('02_combination_concept', context);
        console.log(`   ✓ Creative concept: ${conceptResult.data.genre_name}\n`);
      }

      // Step 3: Musical history and theory analysis
      if (!context.full_context.music_history) {
        console.log('📚 Step 3: Musical History & Theory Analysis');
        console.log('   Agent: Music History Agent');

        const historyResult = await this.musicHistoryAgent.execute(
          userPrompt,
          context.full_context
        );

        context.full_context.music_history = {
          step: 'music_history',
          data: historyResult.data
        };

        await this.saveIntermediateOutput('03_music_history', context);
        console.log('   ✓ Musical context established\n');
      }

      // Step 4: Arrangement design from combined sources
      if (!context.full_context.arrangement) {
        console.log('🎼 Step 4: Designing Combined Arrangement');
        console.log('   Agent: Arrangement Agent');

        const arrangementPrompt = this.getCombinationPrompt(userPrompt, 'arrangement', sourcePieces);
        const arrangementResult = await this.arrangementAgent.execute(
          arrangementPrompt,
          context.full_context,
          { sourceAnalysis: context.full_context.source_analysis.data }
        );

        context.full_context.arrangement = {
          step: 'arrangement',
          data: arrangementResult.data
        };

        await this.saveIntermediateOutput('04_arrangement', context);
        console.log(`   ✓ Arrangement: ${arrangementResult.data.total_voices} voices configured\n`);
      }

      // Step 5: Compositional form synthesis
      if (!context.full_context.compositional_form) {
        console.log('🏗️ Step 5: Synthesizing Compositional Form');
        console.log('   Agent: Compositional Form Agent');

        const formResult = await this.compositionalFormAgent.execute(
          userPrompt,
          context.full_context,
          { sourceAnalysis: context.full_context.source_analysis.data }
        );

        context.full_context.compositional_form = {
          step: 'compositional_form',
          data: formResult.data
        };

        await this.saveIntermediateOutput('05_compositional_form', context);
        console.log(`   ✓ Form: ${formResult.data.form_type}, ${formResult.data.total_measures} measures\n`);
      }

      // Step 6: Melodic transformation and development
      if (!context.full_context.melodic_content) {
        console.log('🎵 Step 6: Melodic Transformation');
        console.log('   Agent: Melodic Agent');

        const melodicPrompt = this.getCombinationPrompt(userPrompt, 'melodic', sourcePieces);
        const melodicResult = await this.melodicAgent.execute(
          melodicPrompt,
          context.full_context
        );

        context.full_context.melodic_content = {
          step: 'melodic_content',
          data: melodicResult.data
        };

        await this.saveIntermediateOutput('06_melodic_content', context);
        console.log('   ✓ Melodic themes transformed from sources\n');
      }

      // Step 7: Timbrel and texture synthesis
      if (!context.full_context.timbrel_elements) {
        console.log('🎨 Step 7: Texture & Timbrel Synthesis');
        console.log('   Agent: Timbrel Agent');

        const timbrelPrompt = this.getCombinationPrompt(userPrompt, 'timbrel', sourcePieces);
        const timbrelResult = await this.timbrelAgent.execute(
          timbrelPrompt,
          context.full_context
        );

        context.full_context.timbrel_elements = {
          step: 'timbrel_elements',
          data: timbrelResult.data
        };

        await this.saveIntermediateOutput('07_timbrel_elements', context);
        console.log('   ✓ Timbrel synthesis complete\n');
      }

      // Step 8: Dynamics and expression mapping
      if (!context.full_context.dynamics) {
        console.log('💫 Step 8: Dynamics & Expression');
        console.log('   Agent: Dynamics Agent');

        const dynamicsPrompt = this.getCombinationPrompt(userPrompt, 'dynamics', sourcePieces);
        const dynamicsResult = await this.dynamicsAgent.execute(
          dynamicsPrompt,
          context.full_context
        );

        context.full_context.dynamics = {
          step: 'dynamics',
          data: dynamicsResult.data
        };

        await this.saveIntermediateOutput('08_dynamics', context);
        console.log('   ✓ Dynamic expression mapped\n');
      }

      // Step 9: Final composition synthesis
      if (!context.full_context.composition) {
        console.log('🎼 Step 9: Final Composition Synthesis');
        console.log('   Agent: Composition Agent');

        // CRITICAL: Tell the agent to USE the actual source ABC notations!
        const combinationPrompt = `${userPrompt}

IMPORTANT: You MUST use the source ABC notations provided in source_analysis.source_abc_notations as your foundation:
1. EXTRACT actual melodies, harmonies, and rhythms from the source ABC notations
2. COMBINE and TRANSFORM these extracted elements into a cohesive composition
3. PRESERVE all instruments that appear in the source pieces
4. CREATE new transitional material and variations AS NEEDED to make the combination flow naturally
5. The source ABC notations contain the actual musical material - USE them as the PRIMARY BASIS while adding connective tissue for cohesion`;

        const compositionResult = await this.compositionAgent.execute(
          combinationPrompt,
          context.full_context
        );

        context.full_context.composition = {
          step: 'composition',
          data: compositionResult.data
        };

        await this.saveIntermediateOutput('09_composition', context);
        console.log('   ✓ Composition synthesis complete\n');
      }

      // Step 10: Instrument-specific refinement
      if (!context.full_context.instrument_parts) {
        console.log('🎻 Step 10: Instrument-Specific Refinement');
        console.log('   Agent: Instrument Composer Agent');

        // The InstrumentComposerAgent needs specific context for each instrument
        // For combination, we'll use the composition data directly instead of per-instrument refinement
        // since the composition agent already handled the combination
        const compositionData = context.full_context.composition?.data;

        if (compositionData && compositionData.abc_notation) {
          // Use the composition directly as it's already complete
          context.full_context.instrument_parts = {
            step: 'instrument_parts',
            data: {
              abc_notation: compositionData.abc_notation,
              title: compositionData.title || 'Combined Composition',
              complete: true,
              skipped_refinement: true,
              reason: 'Composition already complete from synthesis step'
            }
          };
        } else {
          // If we really need to refine, we'd need to compose each voice separately
          // For now, skip this step for combinations as the composition is already complete
          context.full_context.instrument_parts = {
            step: 'instrument_parts',
            data: context.full_context.composition?.data || {}
          };
        }

        // CRITICAL: Save ABC notation immediately, BEFORE checkpoint
        // This ensures we always have output even if validation or later steps fail
        if (context.full_context.instrument_parts?.data?.abc_notation) {
          await this.saveBestEffortAbc(context);
        }

        await this.saveIntermediateOutput('10_instrument_parts', context);
        console.log('   ✓ Instrument parts handled\n');
      }

      // Step 11: Critical validation
      let revisionCount = 0;
      let validationPassed = false;

      while (!validationPassed && revisionCount < this.maxRevisions) {
        console.log(`🔍 Step 11${revisionCount > 0 ? `.${revisionCount}` : ''}: Critical Validation`);
        console.log('   Agent: Critic Agent');

        // Use standardized context transformation for CriticAgent
        const criticContext = ContextTransformer.toCriticContext(context.full_context);

        const validationResult = await this.criticAgent.execute(
          `Validate this combined composition with standards: ${JSON.stringify(this.combinationStandards)}`,
          criticContext
        );

        context.full_context.validation = {
          step: 'validation',
          data: validationResult.data,
          revision: revisionCount
        };

        // CRITICAL: Apply auto-fixed ABC notation from CriticAgent
        if (validationResult.data.abc_notation && validationResult.data.applied_fixes?.length > 0) {
          console.log(`   🔧 Auto-fixes applied: ${validationResult.data.applied_fixes.join(', ')}`);
          context.full_context.instrument_parts.data.abc_notation = validationResult.data.abc_notation;
        }

        await this.saveIntermediateOutput(`11_validation_r${revisionCount}`, context);

        if (validationResult.data.validation_status === 'APPROVED' ||
            (validationResult.data.validation_status === 'APPROVED_WITH_WARNINGS' &&
             !this.combinationStandards.rejectMinorIssues)) {
          validationPassed = true;
          console.log('   ✓ Validation passed\n');
        } else if (validationResult.data.has_critical_issues && this.combinationStandards.rejectCriticalIssues) {
          console.log('   ❌ Critical issues found - rejecting\n');
          throw new Error('Composition has critical issues that cannot be resolved');
        } else {
          console.log(`   ⚠️  Issues found - revision ${revisionCount + 1}/${this.maxRevisions}\n`);

          // Apply revisions through composition agent
          const revisionPrompt = `Revise the composition to address these issues: ${JSON.stringify(validationResult.data.issues)}`;
          const revisedResult = await this.compositionAgent.execute(
            revisionPrompt,
            context.full_context
          );

          context.full_context.instrument_parts.data = revisedResult.data;

          // CRITICAL: Re-apply auto-fixes to the revision IMMEDIATELY
          // This ensures corrected ABC is used as the base for next iteration
          console.log('   🔧 Re-applying auto-fixes to revision...');

          try {
            // Update composition context for CriticAgent
            // Use instrument_parts as the composition source for combination workflows
            const tempContext = {
              ...context.full_context,
              composition: context.full_context.instrument_parts
            };

            // Use ContextTransformer for standardized context structure
            const criticContext = ContextTransformer.toCriticContext(tempContext);

            const autoFixResult = await this.criticAgent.execute(
              'Auto-fix syntax errors in revision',
              criticContext
            );

            // Apply auto-fixes to the revision
            if (autoFixResult.data.abc_notation && autoFixResult.data.applied_fixes?.length > 0) {
              console.log(`   🔧 Auto-fixes applied: ${autoFixResult.data.applied_fixes.join(', ')}`);
              context.full_context.instrument_parts.data.abc_notation = autoFixResult.data.abc_notation;
            }
          } catch (autoFixError) {
            console.warn(`   ⚠️  Auto-fix re-application failed: ${autoFixError.message}`);
            console.warn('   Continuing with un-fixed revision (fixes will be applied in final validation)');
          }

          revisionCount++;
        }
      }

      // Prepare final result
      const result = {
        abc_notation: context.full_context.instrument_parts.data.abc_notation,
        genre_name: context.full_context.combination_concept.data.genre_name,
        metadata: {
          title: context.full_context.instrument_parts.data.title ||
                 `Combined ${context.full_context.combination_concept.data.genre_name} Composition`,
          source_pieces: sourcePieces.map(p => p.title || p.filename),
          creation_method: 'orchestrated_combination',
          session_id: this.sessionId,
          revisions: revisionCount
        },
        validation: context.full_context.validation.data,
        has_critical_issues: context.full_context.validation.data.has_critical_issues || false,
        has_major_issues: context.full_context.validation.data.has_major_issues || false,
        applied_fixes: context.full_context.validation.data.applied_fixes || [],
        full_context: context.full_context
      };

      console.log('═══════════════════════════════════════════════════════');
      console.log('🎭 COMBINATION ORCHESTRATION COMPLETE');
      console.log('═══════════════════════════════════════════════════════');

      if (result.applied_fixes.length > 0) {
        console.log('\n🔧 Auto-fixes applied:');
        result.applied_fixes.forEach(fix => console.log(`   - ${fix}`));
      }

      console.log();

      return result;

    } catch (error) {
      console.error('\n❌ Combination orchestration failed:', error.message);

      // CRITICAL: Save ABC notation even on error if it exists
      if (context.full_context?.instrument_parts?.data?.abc_notation) {
        console.log('💾 Saving best-effort ABC despite orchestration failure...');
        await this.saveBestEffortAbc(context);
      } else if (context.full_context?.composition?.data?.abc_notation) {
        // Fallback: save composition ABC if instrument_parts doesn't exist
        console.log('💾 Saving composition ABC despite orchestration failure...');
        context.full_context.instrument_parts = {
          step: 'instrument_parts',
          data: {
            abc_notation: context.full_context.composition.data.abc_notation,
            title: context.full_context.composition.data.title ||
                   context.full_context.combination_concept?.data?.genre_name || 'Combined',
            complete: false,
            source: 'fallback_from_composition',
            reason: 'Orchestration failed before instrument refinement'
          }
        };
        await this.saveBestEffortAbc(context);
      } else {
        console.warn('⚠️  No ABC notation generated before failure');
      }

      // Save error state for debugging
      context.error = {
        message: error.message,
        stack: error.stack,
        step: Object.keys(context.full_context).pop() || 'initialization'
      };

      await this.saveIntermediateOutput('error', context);
      throw error;
    }
  }

  /**
   * Analyze source compositions to extract key musical elements
   */
  async analyzeSourceCompositions(sourcePieces) {
    // Extract and analyze musical patterns from source ABC notations
    const analysis = {
      // CRITICAL: Include the actual ABC notations for agents to use!
      source_abc_notations: sourcePieces.map(piece => ({
        title: piece.title || piece.filename,
        genre: piece.genre,
        abc_notation: piece.abc,  // THE ACTUAL MUSIC TO COMBINE!
        duration: piece.duration
      })),
      genres: [],
      keys: [],
      time_signatures: [],
      tempos: [],
      instruments: [],
      melodic_patterns: [],
      harmonic_progressions: [],
      structural_elements: [],
      distinctive_features: []
    };

    for (const piece of sourcePieces) {
      // Parse ABC notation to extract musical information
      const lines = piece.abc.split('\n');

      for (const line of lines) {
        // Extract key signatures
        if (line.startsWith('K:')) {
          analysis.keys.push(line.substring(2).trim());
        }
        // Extract time signatures
        if (line.startsWith('M:')) {
          analysis.time_signatures.push(line.substring(2).trim());
        }
        // Extract tempo markings
        if (line.startsWith('Q:')) {
          analysis.tempos.push(line.substring(2).trim());
        }
        // Extract MIDI program (instrument) information
        if (line.includes('%%MIDI program')) {
          const match = line.match(/%%MIDI program \d+ (\d+)/);
          if (match) {
            analysis.instruments.push(parseInt(match[1]));
          }
        }
      }

      // Add genre information if available
      if (piece.genre) {
        analysis.genres.push(piece.genre);
      }

      // Add any distinctive features noted
      if (piece.description) {
        analysis.distinctive_features.push({
          source: piece.title || piece.filename,
          features: piece.description
        });
      }
    }

    // Deduplicate and summarize
    analysis.genres = [...new Set(analysis.genres)];
    analysis.keys = [...new Set(analysis.keys)];
    analysis.time_signatures = [...new Set(analysis.time_signatures)];
    analysis.instruments = [...new Set(analysis.instruments)];

    // Add combination strategy based on analysis
    analysis.combination_strategy = this.determineCombinationStrategy(analysis);

    return analysis;
  }

  /**
   * Determine the best combination strategy based on source analysis
   */
  determineCombinationStrategy(analysis) {
    const strategies = [];

    // Check for compatible keys
    if (analysis.keys.length > 1) {
      const hasRelatedKeys = this.areKeysRelated(analysis.keys);
      if (hasRelatedKeys) {
        strategies.push('modulation_bridge');
      } else {
        strategies.push('key_transformation');
      }
    }

    // Check for rhythmic compatibility
    if (analysis.time_signatures.length > 1) {
      strategies.push('polyrhythmic_fusion');
    } else if (analysis.time_signatures.length === 1) {
      strategies.push('rhythmic_variation');
    }

    // Check for genre fusion potential
    if (analysis.genres.length > 1) {
      strategies.push('genre_synthesis');
    }

    // Check for instrumental diversity
    if (analysis.instruments.length > 3) {
      strategies.push('orchestral_layering');
    } else {
      strategies.push('intimate_ensemble');
    }

    return {
      primary_strategy: strategies[0] || 'thematic_development',
      secondary_strategies: strategies.slice(1),
      rationale: `Combining ${analysis.genres.join(' and ')} elements with ${analysis.instruments.length} unique instruments`
    };
  }

  /**
   * Check if keys are musically related (relative, parallel, or closely related)
   */
  areKeysRelated(keys) {
    // Simplified key relationship check
    // In a full implementation, this would check circle of fifths relationships
    const majorKeys = keys.filter(k => !k.includes('m') && !k.includes('min'));
    const minorKeys = keys.filter(k => k.includes('m') || k.includes('min'));

    // Check for relative major/minor relationships
    // This is simplified - full implementation would check actual key relationships
    return majorKeys.length > 0 && minorKeys.length > 0;
  }
}