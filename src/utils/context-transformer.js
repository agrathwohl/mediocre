/**
 * Context Transformer Utility
 * Standardizes context structure across different orchestrator patterns
 */

export class ContextTransformer {
  /**
   * Transform full context to CriticAgent expected format
   * CriticAgent expects flatter structure without nested data objects
   */
  static toCriticContext(fullContext) {
    return {
      composition: {
        abc_notation: fullContext.composition?.data?.abc_notation ||
                     fullContext.instrument_parts?.data?.abc_notation
      },
      arrangement: fullContext.arrangement?.data || {},
      compositional_form: fullContext.compositional_form?.data || {},
      source_analysis: fullContext.source_analysis?.data || {}
    };
  }

  /**
   * Transform full context to generic agent format
   * Most agents expect to access data directly without the nested structure
   */
  static toAgentContext(fullContext) {
    const transformed = {};

    for (const [key, value] of Object.entries(fullContext)) {
      if (value && typeof value === 'object' && 'data' in value) {
        // Flatten the nested data structure
        transformed[key] = value.data;
      } else {
        // Pass through as-is
        transformed[key] = value;
      }
    }

    return transformed;
  }

  /**
   * Transform agent response back to orchestrator format
   * Wraps agent data in step/data structure
   */
  static toOrchestratorFormat(stepName, agentData) {
    return {
      step: stepName,
      data: agentData
    };
  }
}