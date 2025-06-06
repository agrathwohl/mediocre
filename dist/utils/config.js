import Conf from 'conf';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..', '..');

// Load environment variables
dotenv.config();

/**
 * @typedef {Object} ConfigSchema
 * @property {string} anthropicApiKey - Anthropic API key
 * @property {string} outputDir - Directory for output files
 * @property {string} tempDir - Directory for temporary files
 * @property {string} datasetDir - Directory for the final dataset
 * @property {boolean} verbose - Whether to show verbose logs
 */

/**
 * Global application configuration
 * @type {Conf<ConfigSchema>}
 */
export const config = new Conf({
  projectName: 'mediocre',
  schema: {
    anthropicApiKey: {
      type: 'string',
      default: process.env.ANTHROPIC_API_KEY || ''
    },
    outputDir: {
      type: 'string',
      default: process.env.OUTPUT_DIR || path.join(projectRoot, 'output')
    },
    tempDir: {
      type: 'string',
      default: process.env.TEMP_DIR || path.join(projectRoot, 'temp')
    },
    datasetDir: {
      type: 'string',
      default: process.env.DATASET_DIR || path.join(projectRoot, 'dataset')
    },
    verbose: {
      type: 'boolean',
      default: process.env.VERBOSE === 'true'
    }
  }
});

// Create default directories if they don't exist
const ensureDirectories = () => {
  const directories = [
    config.get('outputDir'),
    config.get('tempDir'),
    config.get('datasetDir')
  ];

  for (const dir of directories) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
};

ensureDirectories();