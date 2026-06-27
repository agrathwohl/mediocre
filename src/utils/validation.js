import fs from "fs";
import path from "path";
import { execa } from "execa";
import { parse as parseMusicXml } from "musicxml-io";
import { getAbc2midiBinary } from "./llm-client.js";

export async function validateAbcNotation(abcNotation) {
  const result = {
    isValid: true,
    issues: [],
    warnings: [],
    lineIssues: [],
    fixedNotation: null,
  };

  const tempFile = path.join('/tmp', `validate-${Date.now()}.abc`);
  await fs.promises.writeFile(tempFile, abcNotation);

  try {
    const { stdout, stderr, signal, exitCode } = await execa(getAbc2midiBinary(), [tempFile, '-c'], { reject: false });

    const crashed = signal === 'SIGSEGV' || signal === 'SIGABRT' || (exitCode !== null && exitCode > 128);
    if (crashed) {
      result.isValid = false;
      result.issues = [`abc2midi crashed (${signal || 'exit ' + exitCode}) - ABC notation caused a fatal error`];
    } else {
      const combined = `${stdout || ''}\n${stderr || ''}`;
      const lines = combined.split('\n');
      const errorLines = lines.filter(line => line.includes('Error'));
      const warningLines = lines.filter(line => line.includes('Warning'));

      result.warnings = warningLines;
      if (errorLines.length > 0) {
        result.isValid = false;
        result.issues = errorLines;
      }
    }
  } catch (error) {
    result.isValid = false;
    const combined = `${error.stdout || ''}\n${error.stderr || ''}`;
    const lines = combined.split('\n');
    const errorLines = lines.filter(line => line.includes('Error'));
    const warningLines = lines.filter(line => line.includes('Warning'));
    result.warnings = warningLines;
    result.issues = errorLines.length > 0 ? errorLines : [error.message];
  } finally {
    try {
      await fs.promises.unlink(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  if (!result.isValid) {
    result.fixedNotation = cleanAbcNotation(abcNotation);
  }

  return result;
}

export function cleanAbcNotation(abcNotation) {
  // Drop leading model reasoning before the X: tune header. Text-mode generation
  // and self-correction passes sometimes emit chain-of-thought prose before the ABC,
  // which crashes abc2midi (SIGSEGV) — nothing valid precedes the X: header.
  const headerIndex = abcNotation.search(/^X:\s*\d/m);
  if (headerIndex > 0) {
    abcNotation = abcNotation.slice(headerIndex);
  }

  let cleanedText = abcNotation
    .replace(/^```(?:abc|ABC|text)?\s*\n?/gm, "")
    .replace(/\n?```\s*$/gm, "")
    .replace(/```/g, "")
    .replace(/^\uFEFF/, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .replace(/[^\x09\x0A\x20-\x7E\xC0-\xFF]/g, "")
    .replace(/\n\s*\n/g, "\n")
    .replace(/\n\s*(\[V:)/g, "\n$1")
    .replace(/\n\s*(V:)/g, "\nV:")
    .replace(/\n\s*(%\s*Section)/g, "\n$1")
    .replace(/\n\s*(w:)/g, "\nw:")
    .replace(/\|\s+\|/g, "||")
    .replace(/:\s*\|/g, ":|")
    .replace(/\|\s*:/g, "|:")
    .replace(/\|\]\s+/g, "|]")
    .replace(/\s+\[\|/g, "[|")
    .replace(/::\s*/g, "::")
    .replace(/\|1\s+/g, "|1")
    .replace(/\|2\s+/g, "|2")
    .replace(/\[\s*1/g, "[1")
    .replace(/\[\s*2/g, "[2")
    .replace(/\]\s*\n\s*\[/g, "]\n[")
    .replace(/\n\s+/g, "\n")
    .replace(/\[Q:([^\]]+)\]/g, "Q:$1")
    .replace(/%%MIDI\s+program\s+(\d+)\s+(\d+)/g, "%%MIDI program $1 $2")
    .replace(/%%MIDI\s+program\s*\n/g, "")
    .replace(/%%MIDI\s+channel\s*\n/g, "")
    .replace(/%%MIDI\s+transpose\s*\n/g, "")
    .replace(/%%MIDI\s+gchord\s*\n/g, "")
    .replace(/%%MIDI\s+program\s+(\d+)\s+(\d+)/g, (match, channel, program) => {
      const prog = parseInt(program, 10);
      if (prog < 1 || prog > 128) {
        return `%%MIDI program ${channel} 1`;
      }
      return match;
    })
    .trim();

  // Validate %%MIDI drum directives — abc2midi segfaults when counts don't match
  cleanedText = cleanedText.split('\n').map(line => {
    const drumMatch = line.match(/^(%%MIDI\s+drum\s+)(\S+)(\s+.+)$/);
    if (!drumMatch) return line;
    const pattern = drumMatch[2];
    const rest = drumMatch[3].trim().split(/\s+/).map(Number);
    const dCount = (pattern.match(/d/g) || []).length;
    if (dCount === 0) return '';
    if (rest.length !== dCount * 2) {
      const programs = rest.slice(0, dCount).map(n => isNaN(n) ? 36 : n);
      const velocities = rest.slice(dCount, dCount * 2).map(n => isNaN(n) ? 90 : n);
      while (programs.length < dCount) programs.push(36);
      while (velocities.length < dCount) velocities.push(90);
      return `%%MIDI drum ${pattern} ${programs.join(' ')} ${velocities.join(' ')}`;
    }
    return line;
  }).join('\n');

  return cleanedText + "\n";
}

export async function validateWithAbc2Midi(abcFilePath) {
  const tempMidiPath = abcFilePath.replace(".abc", "_validation_temp.mid");
  try {
    const result = await execa(getAbc2midiBinary(), [abcFilePath, '-o', tempMidiPath], {
      timeout: 30000,
      reject: false,
    });
    try {
      await fs.promises.access(tempMidiPath);
      await fs.promises.unlink(tempMidiPath);
      return { valid: true, error: null };
    } catch (e) {
      return { valid: false, error: "abc2midi did not produce output file" };
    }
  } catch (error) {
    if (
      error.code === "ENOENT" ||
      (error.message && error.message.includes("command not found"))
    ) {
      return {
        valid: true,
        error: null,
        warning:
          "abc2midi not installed - skipping validation (install abcmidi package for validation)",
      };
    }
    const isSegfault =
      error.signal === "SIGSEGV" ||
      error.signal === "SIGABRT" ||
      (error.status && error.status > 128) ||
      (error.message && error.message.includes("segmentation fault")) ||
      (error.stderr && error.stderr.includes("segmentation fault"));
    if (isSegfault) {
      try { await fs.promises.unlink(tempMidiPath); } catch (e) { /* doesn't exist */ }
      return {
        valid: false,
        error: "abc2midi SEGFAULTED - ABC notation is invalid",
      };
    }
    if (error.killed) {
      try { await fs.promises.unlink(tempMidiPath); } catch (e) { /* doesn't exist */ }
      return {
        valid: false,
        error: "abc2midi timed out - ABC notation may be malformed",
      };
    }
    try {
      await fs.promises.access(tempMidiPath);
      await fs.promises.unlink(tempMidiPath);
      return { valid: true, error: null };
    } catch (e) {
      // File doesn't exist - real error
    }
    const actualError = error.stdout || error.stderr || error.message;
    return { valid: false, error: `abc2midi errors:\n${actualError}` };
  }
}

export function validateMusicXml(musicXml) {
  const issues = [];
  let isValid = true;

  try {
    const parsed = parseMusicXml(musicXml);

    if (!parsed) {
      issues.push("Failed to parse MusicXML");
      isValid = false;
      return { isValid, issues };
    }

    if (!parsed.partList || parsed.partList.length === 0) {
      issues.push("No parts defined in part-list");
      isValid = false;
    }

    if (!parsed.parts || Object.keys(parsed.parts).length === 0) {
      issues.push("No part content found");
      isValid = false;
    }

    for (const partId in parsed.parts) {
      const measures = parsed.parts[partId];
      if (!measures || measures.length === 0) {
        issues.push(`Part ${partId} has no measures`);
        isValid = false;
      }
    }

    if (issues.length === 0) {
      console.log(`  ✓ MusicXML parsed successfully with ${Object.keys(parsed.parts).length} part(s)`);
    }

  } catch (error) {
    issues.push(`MusicXML parsing error: ${error.message}`);
    isValid = false;
  }

  return {
    isValid,
    issues,
  };
}

export async function validateWithMusicXmlParser(mxmlFilePath) {
  try {
    let musicXmlContent;
    try {
      musicXmlContent = await fs.promises.readFile(mxmlFilePath, "utf8");
    } catch (e) {
      if (e.code === 'ENOENT') {
        return { valid: false, error: "MusicXML file not found", warning: null };
      }
      throw e;
    }

    const validation = validateMusicXml(musicXmlContent);

    if (validation.isValid) {
      return { valid: true, error: null, warning: null };
    } else {
      return {
        valid: false,
        error: validation.issues.join("; "),
        warning: null,
      };
    }
  } catch (error) {
    return {
      valid: false,
      error: `MusicXML validation error: ${error.message}`,
      warning: null,
    };
  }
}
