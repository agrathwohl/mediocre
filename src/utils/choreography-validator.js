/**
 * Choreography validation utilities
 * Ensures template references match template definitions
 */

/**
 * Validate that all template references have corresponding definitions
 * @param {Object} choreography - The choreography data structure
 * @returns {Object} Validation result with valid flag and errors array
 */
export function validateTemplateReferences(choreography) {
  const errors = [];
  const definedTemplates = new Set(
    Object.keys(choreography.templates?.objects || {})
  );

  // Check main timeline actions
  choreography.timeline?.forEach((event, idx) => {
    event.actions?.forEach((action, actionIdx) => {
      if (action.template && !definedTemplates.has(action.template)) {
        errors.push({
          template: action.template,
          location: `timeline[${idx}].actions[${actionIdx}]`,
          trigger: event.trigger,
          time: event.trigger?.at || event.trigger?.every || 'unknown'
        });
      }
    });
  });

  // Check threads for v1.1
  choreography.threads?.forEach((thread, threadIdx) => {
    thread.timeline?.forEach((event, idx) => {
      event.actions?.forEach((action, actionIdx) => {
        if (action.template && !definedTemplates.has(action.template)) {
          errors.push({
            template: action.template,
            location: `threads[${threadIdx}].timeline[${idx}].actions[${actionIdx}]`,
            thread: thread.name || thread.id,
            trigger: event.trigger
          });
        }
      });
    });
  });

  // Check scenes for v1.1
  choreography.scenes?.forEach((scene, sceneIdx) => {
    scene.timeline?.forEach((event, idx) => {
      event.actions?.forEach((action, actionIdx) => {
        if (action.template && !definedTemplates.has(action.template)) {
          errors.push({
            template: action.template,
            location: `scenes[${sceneIdx}].timeline[${idx}].actions[${actionIdx}]`,
            scene: scene.name,
            trigger: event.trigger
          });
        }
      });
    });
  });

  return {
    valid: errors.length === 0,
    errors,
    missing: [...new Set(errors.map(e => e.template))],
    definedTemplates: Array.from(definedTemplates)
  };
}

/**
 * Auto-fix missing templates by adding defaults
 * @param {Object} choreography - The choreography to fix
 * @param {Array} missingTemplates - List of missing template names
 * @returns {Object} Fixed choreography
 */
export function autoFixMissingTemplates(choreography, missingTemplates) {
  if (!choreography.templates) {
    choreography.templates = { objects: {} };
  }
  if (!choreography.templates.objects) {
    choreography.templates.objects = {};
  }

  missingTemplates.forEach(templateName => {
    // Create a default template
    choreography.templates.objects[templateName] = {
      shape: ["●"], // Default to a simple circle
      defaultColor: "#FFFFFF",
      defaultScale: 1,
      bounds: { width: 1, height: 1 },
      physics: {
        mass: 1,
        friction: 0.1,
        elasticity: 0.8
      }
    };
  });

  return choreography;
}