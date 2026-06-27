/**
 * Choreography density evaluation and metrics
 * Based on analysis of excellent choreographies (Subotnick_x_Aphex Twin)
 */

/**
 * Target density metrics for high-quality choreographies
 * Derived from analysis of Analog Quantum Flux (Subotnick_x_Aphex Twin)
 */
export const DENSITY_TARGETS = {
  // Core density metrics
  minEventsPerSecond: 0.15,
  targetEventsPerSecond: 0.18,

  minActionsPerSecond: 0.70,
  targetActionsPerSecond: 0.80,

  minActionsPerEvent: 3.5,
  targetActionsPerEvent: 4.4,

  // Richness metrics
  minTemplates: 15,
  targetTemplates: 20,

  // Coverage metrics
  maxGapBetweenEvents: 8.0,  // seconds
  minCoveragePercent: 90,

  // Overall quality threshold
  minDensityScore: 0.85,  // 85% of target metrics
};

/**
 * Evaluate choreography density metrics
 * @param {Object} choreography - Choreography object
 * @returns {Object} Density evaluation results
 */
export function evaluateChoreographyDensity(choreography) {
  const duration = choreography.metadata?.duration || 0;
  const timeline = choreography.timeline || [];
  const templates = choreography.templates?.objects || {};

  // Guard against invalid inputs
  if (duration === 0 || timeline.length === 0) {
    return {
      metrics: {
        duration: 0,
        totalEvents: 0,
        totalActions: 0,
        eventsPerSecond: 0,
        actionsPerSecond: 0,
        actionsPerEvent: 0,
        templateCount: 0,
        avgGap: 0,
        maxGap: 0,
        minGap: 0,
        coverageSpan: 0,
        coveragePercent: 0,
      },
      scores: {
        eventsScore: 0,
        actionsScore: 0,
        templatesScore: 0,
        coverageScore: 0,
        densityScore: 0,
      },
      meetsTarget: false,
      needsImprovement: ['events_per_second', 'actions_per_second', 'template_count', 'coverage'],
      gaps: [],
      eventTimes: [],
    };
  }

  // Core metrics
  const totalEvents = timeline.length;
  const totalActions = timeline.reduce((sum, event) => {
    return sum + (event.actions?.length || 0);
  }, 0);

  const eventsPerSecond = totalEvents / duration;
  const actionsPerSecond = totalActions / duration;
  const actionsPerEvent = totalActions / totalEvents;

  // Richness metrics
  const templateCount = Object.keys(templates).length;

  // Coverage metrics
  const eventTimes = timeline
    .map(e => e.trigger?.at)
    .filter(t => typeof t === 'number')
    .sort((a, b) => a - b);

  const gaps = eventTimes.slice(1).map((time, i) => time - eventTimes[i]);
  const avgGap = gaps.length > 0
    ? gaps.reduce((a, b) => a + b, 0) / gaps.length
    : 0;
  const maxGap = gaps.length > 0 ? Math.max(...gaps) : 0;
  const minGap = gaps.length > 0 ? Math.min(...gaps) : 0;

  const coverageSpan = eventTimes.length > 0
    ? eventTimes[eventTimes.length - 1] - eventTimes[0]
    : 0;
  const coveragePercent = (coverageSpan / duration) * 100;

  // Calculate density score (0-1 scale)
  const eventsScore = Math.min(eventsPerSecond / DENSITY_TARGETS.targetEventsPerSecond, 1);
  const actionsScore = Math.min(actionsPerSecond / DENSITY_TARGETS.targetActionsPerSecond, 1);
  const templatesScore = Math.min(templateCount / DENSITY_TARGETS.targetTemplates, 1);
  const coverageScore = Math.min(coveragePercent / 100, 1);

  const densityScore = (eventsScore + actionsScore + templatesScore + coverageScore) / 4;

  // Identify areas needing improvement
  const needsImprovement = [];
  if (eventsPerSecond < DENSITY_TARGETS.minEventsPerSecond) {
    needsImprovement.push('events_per_second');
  }
  if (actionsPerSecond < DENSITY_TARGETS.minActionsPerSecond) {
    needsImprovement.push('actions_per_second');
  }
  if (actionsPerEvent < DENSITY_TARGETS.minActionsPerEvent) {
    needsImprovement.push('actions_per_event');
  }
  if (templateCount < DENSITY_TARGETS.minTemplates) {
    needsImprovement.push('template_count');
  }
  if (maxGap > DENSITY_TARGETS.maxGapBetweenEvents) {
    needsImprovement.push('max_gap');
  }
  if (coveragePercent < DENSITY_TARGETS.minCoveragePercent) {
    needsImprovement.push('coverage');
  }

  return {
    metrics: {
      duration,
      totalEvents,
      totalActions,
      eventsPerSecond,
      actionsPerSecond,
      actionsPerEvent,
      templateCount,
      avgGap,
      maxGap,
      minGap,
      coverageSpan,
      coveragePercent,
    },
    scores: {
      eventsScore,
      actionsScore,
      templatesScore,
      coverageScore,
      densityScore,
    },
    meetsTarget: densityScore >= DENSITY_TARGETS.minDensityScore,
    needsImprovement,
    gaps: gaps.length > 0 ? gaps : [],
    eventTimes,
  };
}

/**
 * Identify large gaps in timeline that should be filled
 * @param {Object} evaluation - Result from evaluateChoreographyDensity
 * @returns {Array} Array of {start, end, duration} for gaps exceeding threshold
 */
export function identifyLargeGaps(evaluation) {
  const { eventTimes } = evaluation;
  const largeGaps = [];

  for (let i = 1; i < eventTimes.length; i++) {
    const gapSize = eventTimes[i] - eventTimes[i - 1];
    if (gapSize > DENSITY_TARGETS.maxGapBetweenEvents) {
      largeGaps.push({
        start: eventTimes[i - 1],
        end: eventTimes[i],
        duration: gapSize,
      });
    }
  }

  return largeGaps;
}

/**
 * Identify sparse events that need more actions
 * @param {Object} choreography - Choreography object
 * @param {Object} evaluation - Result from evaluateChoreographyDensity
 * @returns {Array} Array of event indices with fewer actions than target
 */
export function identifySparseEvents(choreography, evaluation) {
  const timeline = choreography.timeline || [];
  const sparseEvents = [];

  timeline.forEach((event, index) => {
    const actionCount = event.actions?.length || 0;
    if (actionCount < DENSITY_TARGETS.minActionsPerEvent) {
      sparseEvents.push({
        index,
        label: event.label,
        currentActions: actionCount,
        targetActions: DENSITY_TARGETS.targetActionsPerEvent,
        needsMoreActions: Math.ceil(DENSITY_TARGETS.targetActionsPerEvent - actionCount),
      });
    }
  });

  return sparseEvents;
}

/**
 * Generate improvement strategy based on evaluation
 * @param {Object} evaluation - Result from evaluateChoreographyDensity
 * @param {Object} choreography - Choreography object
 * @returns {Object} Strategy with prioritized actions
 */
export function generateImprovementStrategy(evaluation, choreography) {
  const largeGaps = identifyLargeGaps(evaluation);
  const sparseEvents = identifySparseEvents(choreography, evaluation);

  const strategy = {
    priority: [],
    actions: [],
  };

  // Prioritize based on which metrics are furthest from target
  const { scores, needsImprovement } = evaluation;

  // Actions per event is lowest priority but easiest to fix
  if (needsImprovement.includes('actions_per_event') && sparseEvents.length > 0) {
    strategy.priority.push('enrich_events');
    strategy.actions.push({
      type: 'enrich_events',
      targetCount: Math.min(5, sparseEvents.length),
      sparseEvents: sparseEvents.slice(0, 5),
    });
  }

  // Large gaps need filling
  if (needsImprovement.includes('max_gap') && largeGaps.length > 0) {
    strategy.priority.push('fill_gaps');
    strategy.actions.push({
      type: 'fill_gaps',
      targetCount: Math.min(3, largeGaps.length),
      gaps: largeGaps.slice(0, 3),
    });
  }

  // Template diversity
  if (needsImprovement.includes('template_count')) {
    strategy.priority.push('add_templates');
    strategy.actions.push({
      type: 'add_templates',
      currentCount: evaluation.metrics.templateCount,
      targetCount: DENSITY_TARGETS.minTemplates,
      needsMore: DENSITY_TARGETS.minTemplates - evaluation.metrics.templateCount,
    });
  }

  // Coverage expansion
  if (needsImprovement.includes('coverage')) {
    strategy.priority.push('extend_coverage');
    strategy.actions.push({
      type: 'extend_coverage',
      currentPercent: evaluation.metrics.coveragePercent,
      targetPercent: DENSITY_TARGETS.minCoveragePercent,
    });
  }

  return strategy;
}
