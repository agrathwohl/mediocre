/**
 * @fileoverview Shared external tool availability checking
 */

import { execa } from 'execa';

/**
 * Installation instructions for common external tools
 */
const TOOL_INSTALL_INSTRUCTIONS = {
  timidity: {
    name: 'TiMidity++',
    ubuntu: 'sudo apt-get install timidity',
    macos: 'brew install timidity',
    arch: 'sudo pacman -S timidity++',
    nix: 'nix-shell -p timidity'
  },
  mpv: {
    name: 'mpv',
    ubuntu: 'sudo apt-get install mpv',
    macos: 'brew install mpv',
    arch: 'sudo pacman -S mpv',
    nix: 'nix-shell -p mpv'
  },
  abc2midi: {
    name: 'abc2midi (abcmidi)',
    ubuntu: 'sudo apt-get install abcmidi',
    macos: 'brew install abcmidi',
    arch: 'yay -S abcmidi',
    nix: 'nix-shell -p abcmidi'
  },
  sox: {
    name: 'SoX',
    ubuntu: 'sudo apt-get install sox',
    macos: 'brew install sox',
    arch: 'sudo pacman -S sox',
    nix: 'nix-shell -p sox'
  },
  ffmpeg: {
    name: 'FFmpeg',
    ubuntu: 'sudo apt-get install ffmpeg',
    macos: 'brew install ffmpeg',
    arch: 'sudo pacman -S ffmpeg',
    nix: 'nix-shell -p ffmpeg'
  },
  aubio: {
    name: 'Aubio tools',
    ubuntu: 'sudo apt-get install aubio-tools',
    macos: 'brew install aubio',
    arch: 'sudo pacman -S aubio',
    nix: 'nix-shell -p aubio'
  },
  abcm2ps: {
    name: 'abcm2ps',
    ubuntu: 'sudo apt-get install abcm2ps',
    macos: 'brew install abcm2ps',
    arch: 'yay -S abcm2ps',
    nix: 'nix-shell -p abcm2ps'
  }
};

/**
 * Check if an external tool is available
 * @param {string} toolName - Name of the tool to check
 * @returns {Promise<boolean>} True if tool is available
 */
export async function checkTool(toolName) {
  try {
    await execa('which', [toolName]);
    return true;
  } catch {
    return false;
  }
}

/**
 * Show installation instructions for a missing tool
 * @param {string} toolName - Name of the tool
 */
export function showToolInstallHelp(toolName) {
  const instructions = TOOL_INSTALL_INSTRUCTIONS[toolName];
  const displayName = instructions?.name || toolName;

  console.error(`\n❌ ${displayName} not found`);
  console.error(`Please install ${displayName}:`);

  if (instructions) {
    console.error(`  Ubuntu/Debian: ${instructions.ubuntu}`);
    console.error(`  macOS: ${instructions.macos}`);
    console.error(`  Arch: ${instructions.arch}`);
    console.error(`  NixOS: ${instructions.nix}`);
  } else {
    console.error(`  Please install '${toolName}' using your system package manager`);
  }
}

/**
 * Require a tool to be available, exit if not
 * @param {string} toolName - Name of the tool to check
 */
export async function requireTool(toolName) {
  if (!await checkTool(toolName)) {
    showToolInstallHelp(toolName);
    process.exit(1);
  }
}

/**
 * Check multiple tools and report all missing ones
 * @param {string[]} toolNames - Array of tool names to check
 * @returns {Promise<{available: string[], missing: string[]}>}
 */
export async function checkTools(toolNames) {
  const results = await Promise.all(
    toolNames.map(async (name) => ({
      name,
      available: await checkTool(name)
    }))
  );

  return {
    available: results.filter(r => r.available).map(r => r.name),
    missing: results.filter(r => !r.available).map(r => r.name)
  };
}

export default { checkTool, showToolInstallHelp, requireTool, checkTools };
