/**
 * Transformations Module Barrel Export
 * 
 * Exports all transformation modules for easy importing.
 * 
 * @module playback/transformations
 * 
 * @example
 * import { 
 *   scaleArt, rotateArt, 
 *   glitchArt, shatterArt,
 *   vortexArt, wormholeArt 
 * } from './transformations/index.js';
 */

export {
  scaleArt,
  rotateArt,
  mirrorArt,
  invertArt,
  flipArt,
  composeTransforms,
  getArtDimensions,
  padArt,
  cropArt,
  centerArt,
} from './basic-transforms.js';

export {
  glitchArt,
  shatterArt,
  pixelateArt,
  corruptArt,
  dissolveArt,
  explodeArt,
  meltArt,
  rainbowArt,
  noiseArt,
  morphArt,
} from './effect-transforms.js';

export {
  vortexArt,
  liquifyArt,
  crystallizeArt,
  wormholeArt,
  electricArt,
  fractalArt,
  quantumArt,
  plasmaArt,
  singularityArt,
  inversionArt,
} from './advanced-transforms.js';

export {
  transformArt,
  isBorder,
  getArtDimensions as getManipulatorDimensions,
  convertShapeToArt,
  findBorders,
  findInterior,
  modifyArt,
  blendArt,
  replaceChar,
} from './art-manipulator.js';
