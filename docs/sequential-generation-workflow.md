# Sequential Generation Workflow

This document describes the complete workflow when generating music compositions using the `--sequential` and `--stream-text` CLI flags.

## Command Example

```bash
mediocre generate --genre "Baroque_x_Synthwave" --sequential --stream-text
```

## Overview

The sequential generation workflow consists of three main phases:
1. **Initial Generation** - Create the first draft composition
2. **Validation & Fix Loop** - Ensure abc2midi compatibility
3. **Expansion Loop** - Iteratively expand until composition is complete

---

## ASCII Flow Chart

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SEQUENTIAL GENERATION WORKFLOW                       │
└─────────────────────────────────────────────────────────────────────────────┘

                              ┌──────────────┐
                              │  CLI START   │
                              │  mediocre    │
                              │  generate    │
                              └──────┬───────┘
                                     │
                                     ▼
                    ┌────────────────────────────────┐
                    │  Parse CLI Options             │
                    │  --sequential, --stream-text   │
                    │  --genre, --style, etc.        │
                    └────────────────┬───────────────┘
                                     │
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 1: INITIAL GENERATION                                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────┐                               │
│   │  generateMusicWithClaude()              │                               │
│   │  ┌─────────────────────────────────┐    │                               │
│   │  │ --stream-text enabled?          │    │                               │
│   │  └──────────┬──────────────────────┘    │                               │
│   │             │                           │                               │
│   │      ┌──────┴──────┐                    │                               │
│   │      │             │                    │                               │
│   │      ▼             ▼                    │                               │
│   │  ┌────────┐   ┌──────────────┐          │                               │
│   │  │ YES    │   │ NO           │          │                               │
│   │  │        │   │              │          │                               │
│   │  │streamText()│generateText()│          │                               │
│   │  │        │   │              │          │                               │
│   │  │ Chunks │   │ Single call  │          │                               │
│   │  │ arrive │   │ blocks until │          │                               │
│   │  │ as they│   │ complete     │          │                               │
│   │  │ stream │   │              │          │                               │
│   │  │        │   │ Risk: may    │          │                               │
│   │  │ Shows  │   │ timeout on   │          │                               │
│   │  │ dots   │   │ large comps  │          │                               │
│   │  └───┬────┘   └──────┬───────┘          │                               │
│   │      │               │                  │                               │
│   │      └───────┬───────┘                  │                               │
│   │              ▼                          │                               │
│   │  ┌─────────────────────────────────┐    │                               │
│   │  │ Raw ABC notation from Claude    │    │                               │
│   │  └──────────────┬──────────────────┘    │                               │
│   └─────────────────┼───────────────────────┘                               │
│                     │                                                       │
│                     ▼                                                       │
│   ┌─────────────────────────────────────────┐                               │
│   │ cleanAbcNotation()                      │                               │
│   │ • Remove ``` markdown blocks            │                               │
│   │ • Strip UTF-8 BOM                       │                               │
│   │ • Fix Windows line endings              │                               │
│   │ • Remove control characters             │                               │
│   │ • Fix malformed bar lines               │                               │
│   │ • Remove invalid MIDI directives        │                               │
│   └────────────────┬────────────────────────┘                               │
│                    │                                                        │
│                    ▼                                                        │
│   ┌─────────────────────────────────────────┐                               │
│   │ validateAbcNotation()                   │                               │
│   │ • Check required headers (X:,T:,M:,K:)  │                               │
│   │ • Detect blank lines                    │                               │
│   │ • Check voice declarations              │                               │
│   │ • Verify lyrics placement               │                               │
│   └────────────────┬────────────────────────┘                               │
│                    │                                                        │
│                    ▼                                                        │
│   ┌─────────────────────────────────────────┐                               │
│   │ Save .abc file to disk                  │                               │
│   │ Generate description JSON               │                               │
│   │ Create markdown summary                 │                               │
│   └────────────────┬────────────────────────┘                               │
│                    │                                                        │
└────────────────────┼────────────────────────────────────────────────────────┘
                     │
                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 2: abc2midi VALIDATION (--sequential only)                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────────────────────────────────┐                               │
│   │ validateWithAbc2Midi()                  │                               │
│   │ • Run: abc2midi file.abc -o temp.mid    │                               │
│   │ • 30 second timeout                     │                               │
│   │ • Detect SIGSEGV (segfault)             │                               │
│   │ • Check if MIDI file created            │                               │
│   └────────────────┬────────────────────────┘                               │
│                    │                                                        │
│                    ▼                                                        │
│           ┌───────────────────┐                                             │
│           │  Validation       │                                             │
│           │  passed?          │                                             │
│           └─────────┬─────────┘                                             │
│                     │                                                       │
│          ┌──────────┴──────────┐                                            │
│          │                     │                                            │
│          ▼                     ▼                                            │
│    ┌───────────┐        ┌───────────────────────────────────┐               │
│    │    YES    │        │              NO                   │               │
│    │           │        │                                   │               │
│    │ Continue  │        │  ┌────────────────────────────┐   │               │
│    │ to Phase 3│        │  │ modifyComposition()        │   │               │
│    │           │        │  │ with FIX instructions:     │   │               │
│    │           │        │  │ "FIX THIS ABC NOTATION -   │   │               │
│    │           │        │  │  IT FAILED abc2midi..."    │   │               │
│    │           │        │  └─────────────┬──────────────┘   │               │
│    │           │        │                │                  │               │
│    │           │        │                ▼                  │               │
│    │           │        │  ┌────────────────────────────┐   │               │
│    │           │        │  │ validateWithAbc2Midi()     │   │               │
│    │           │        │  │ on fixed file              │   │               │
│    │           │        │  └─────────────┬──────────────┘   │               │
│    │           │        │                │                  │               │
│    │           │        │         ┌──────┴──────┐           │               │
│    │           │        │         │             │           │               │
│    │           │        │         ▼             ▼           │               │
│    │           │        │    ┌─────────┐  ┌──────────────┐  │               │
│    │           │        │    │  PASS   │  │    FAIL      │  │               │
│    │           │        │    │         │  │              │  │               │
│    │           │        │    │Continue │  │ FATAL ERROR  │  │               │
│    │           │        │    │to next  │  │ Skip this    │  │               │
│    │           │        │    │phase    │  │ composition  │  │               │
│    │           │        │    └─────────┘  └──────────────┘  │               │
│    │           │        │                                   │               │
│    └───────────┘        └───────────────────────────────────┘               │
│          │                              │                                   │
└──────────┼──────────────────────────────┼───────────────────────────────────┘
           │                              │
           └──────────────┬───────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│ PHASE 3: EXPANSION LOOP (--sequential only)                                 │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌────────────────────────────────────────────────────────────────────┐    │
│   │                     EXPANSION LOOP (max 10 passes)                 │    │
│   │                                                                    │    │
│   │   ┌───────────────────────────────────────────────────────────┐    │    │
│   │   │ evaluateCompositionCompleteness()                         │    │    │
│   │   │ • Claude evaluates if composition is "complete"           │    │    │
│   │   │ • Considers genre traditions (Classical + Modern)         │    │    │
│   │   │ • Returns JSON: {needsExpansion, reasoning, instructions} │    │    │
│   │   │ • Very demanding on passes 1-3                            │    │    │
│   │   │ • Slightly lenient after pass 6                           │    │    │
│   │   └───────────────────────────┬───────────────────────────────┘    │    │
│   │                               │                                    │    │
│   │                               ▼                                    │    │
│   │                      ┌────────────────────┐                        │    │
│   │                      │ needsExpansion?    │                        │    │
│   │                      └─────────┬──────────┘                        │    │
│   │                                │                                   │    │
│   │                 ┌──────────────┴──────────────┐                    │    │
│   │                 │                             │                    │    │
│   │                 ▼                             ▼                    │    │
│   │          ┌─────────────┐             ┌──────────────────┐          │    │
│   │          │    FALSE    │             │      TRUE        │          │    │
│   │          │             │             │                  │          │    │
│   │          │ Composition │             │ modifyComposition│          │    │
│   │          │ is COMPLETE │             │ with expansion   │          │    │
│   │          │             │             │ instructions     │          │    │
│   │          │ Exit loop   │             │                  │          │    │
│   │          └──────┬──────┘             └────────┬─────────┘          │    │
│   │                 │                             │                    │    │
│   │                 │                             ▼                    │    │
│   │                 │        ┌─────────────────────────────────────┐   │    │
│   │                 │        │ validateWithAbc2Midi()              │   │    │
│   │                 │        │ on modified file                    │   │    │
│   │                 │        └───────────────┬─────────────────────┘   │    │
│   │                 │                        │                         │    │
│   │                 │                 ┌──────┴──────┐                  │    │
│   │                 │                 │             │                  │    │
│   │                 │                 ▼             ▼                  │    │
│   │                 │          ┌───────────┐  ┌──────────────────┐     │    │
│   │                 │          │   PASS    │  │      FAIL        │     │    │
│   │                 │          │           │  │                  │     │    │
│   │                 │          │ Continue  │  │ modifyComposition│     │    │
│   │                 │          │ to next   │  │ with FIX         │     │    │
│   │                 │          │ pass      │  │ instructions     │     │    │
│   │                 │          │           │  │                  │     │    │
│   │                 │          │           │  │ Then re-validate │     │    │
│   │                 │          │           │  │                  │     │    │
│   │                 │          │           │  │ If still fails:  │     │    │
│   │                 │          │           │  │ FATAL - stop     │     │    │
│   │                 │          └─────┬─────┘  └─────────┬────────┘     │    │
│   │                 │                │                  │              │    │
│   │                 │                └────────┬─────────┘              │    │
│   │                 │                         │                        │    │
│   │                 │                         ▼                        │    │
│   │                 │              ┌───────────────────────┐           │    │
│   │                 │              │ passNumber++          │           │    │
│   │                 │              │ Loop back to evaluate │◄──────────┘    │
│   │                 │              └───────────────────────┘                │
│   │                 │                                                       │
│   │                 │                                                       │
│   └─────────────────┼───────────────────────────────────────────────────────┘
│                     │                                                       │
└─────────────────────┼───────────────────────────────────────────────────────┘
                      │
                      ▼
            ┌─────────────────────────┐
            │  FINAL OUTPUT           │
            │                         │
            │  • final.abc file       │
            │  • description.json     │
            │  • summary.md           │
            │                         │
            │  Ready for conversion   │
            │  to MIDI/WAV/PDF        │
            └─────────────────────────┘
```

---

## Detailed Phase Descriptions

### Phase 1: Initial Generation

**Entry Point:** `src/commands/generate-abc.js` → `generateAbc()`

1. **Parse Genre** - Split hybrid genre (e.g., `Baroque_x_Synthwave`) into classical and modern components

2. **Call Claude API**
   - If `--stream-text` is enabled: Uses `streamText()` from Vercel AI SDK
     - Chunks arrive as they're generated
     - Progress dots shown every 1000 characters
     - Avoids timeout errors on large generations (40k tokens)
   - If not enabled: Uses `generateText()` (single blocking call)

3. **Clean ABC Notation** - `cleanAbcNotation()` removes:
   - Markdown code blocks (` ``` `)
   - UTF-8 BOM characters
   - Windows line endings (`\r\n` → `\n`)
   - Control characters
   - Malformed bar lines
   - Invalid MIDI directives

4. **Validate ABC Notation** - `validateAbcNotation()` checks:
   - Required headers: `X:`, `T:`, `M:`, `K:`
   - No blank lines between elements
   - Proper voice declarations
   - Lyrics follow melody lines

5. **Save Files**
   - `.abc` - The ABC notation file
   - `_description.json` - AI-generated description
   - `.md` - Human-readable summary

### Phase 2: abc2midi Validation

**Only runs with `--sequential` flag**

**Entry Point:** `src/index.js` sequential mode handler

1. **Run abc2midi** - `validateWithAbc2Midi()`:
   ```bash
   abc2midi "file.abc" -o "temp.mid"
   ```
   - 30 second timeout
   - Detects SIGSEGV (segfault)
   - Checks if MIDI output was created

2. **If Validation Fails**:
   - Call `modifyComposition()` with fix instructions
   - Re-validate the fixed file
   - If still fails: Skip this composition (FATAL)

### Phase 3: Expansion Loop

**Only runs with `--sequential` flag**

**Entry Point:** `src/index.js` expansion loop

1. **Evaluate Completeness** - `evaluateCompositionCompleteness()`:
   - Claude analyzes if composition meets genre standards
   - Returns JSON: `{needsExpansion, reasoning, instructions}`
   - Very demanding on passes 1-3
   - Slightly lenient after pass 6

2. **If Needs Expansion**:
   - Call `modifyComposition()` with expansion instructions
   - Validate with abc2midi
   - If validation fails: attempt fix, then re-validate
   - Loop back to evaluate

3. **Exit Conditions**:
   - `needsExpansion: false` - Composition complete
   - `passNumber >= 10` - Maximum passes reached
   - Fatal validation error - Cannot fix ABC

---

## Key Functions Reference

| Function | File | Purpose |
|----------|------|---------|
| `generateAbc()` | `src/commands/generate-abc.js` | Entry point for generation |
| `generateMusicWithClaude()` | `src/utils/claude.js` | Claude API call (streaming/non-streaming) |
| `modifyCompositionWithClaude()` | `src/utils/claude.js` | Claude API for modifications |
| `cleanAbcNotation()` | `src/utils/claude.js` | Removes invalid characters/formatting |
| `validateAbcNotation()` | `src/utils/claude.js` | Checks ABC structure validity |
| `validateWithAbc2Midi()` | `src/utils/claude.js` | Runs abc2midi to test compilation |
| `evaluateCompositionCompleteness()` | `src/utils/claude.js` | Claude evaluates if piece is complete |
| `modifyComposition()` | `src/commands/modify-composition.js` | Apply modifications to ABC file |

---

## CLI Flags Summary

| Flag | Effect |
|------|--------|
| `--sequential` | Enable expansion loop + abc2midi validation |
| `--stream-text` | Use streaming API calls (prevents timeouts) |
| `--genre <name>` | Hybrid genre format: `Classical_x_Modern` |
| `--style <style>` | Music style (e.g., "standard", "epic") |
| `--solo` | Include instrumental solo section |
| `--instruments <list>` | Comma-separated instrument list |
| `--record-label <name>` | Style after specific record label |
| `--producer <name>` | Style after specific producer |

---

## Error Handling

### Timeout Errors
- **Solution:** Use `--stream-text` flag
- Streaming mode receives chunks incrementally, avoiding connection timeouts

### abc2midi Segfaults
- **Cause:** Malformed ABC notation
- **Solution:** `cleanAbcNotation()` now removes 15+ patterns that cause crashes
- Sequential mode auto-fixes failed validations

### Expansion Loop Stuck
- **Safety:** Maximum 10 passes enforced
- **Fallback:** Keeps last valid file if fix attempts fail

---

## Example Output

```
$ mediocre generate --genre "Baroque_x_Synthwave" --sequential --stream-text

Generating Baroque_x_Synthwave composition in standard style...
Fusing Baroque with Synthwave...
Using streaming mode for generation...
.....................
Streaming complete.
✅ ABC notation validation passed for Baroque_x_Synthwave-score1-1735123456.abc

🔗 Sequential expansion mode enabled - LLM will evaluate and expand until complete...

📝 Evaluating composition 1/1: ./output/Baroque_x_Synthwave-score1-1735123456.abc
  🔧 Validating initial generation with abc2midi...
  ✅ Initial generation passes abc2midi validation

  🔍 Pass 1: Evaluating composition completeness...
  📊 Evaluation: The piece is currently 32 bars which is short for Baroque standards...
  📝 Expanding: Add a full development section with counterpoint and modulation...
  🔧 Validating with abc2midi...
  ✅ abc2midi validation passed
  ✅ Pass 1 complete: ./output/Baroque_x_Synthwave-modified-1735123460.abc

  🔍 Pass 2: Evaluating composition completeness...
  📊 Evaluation: Good development but needs a proper recapitulation...
  📝 Expanding: Add recapitulation and coda sections...
  🔧 Validating with abc2midi...
  ✅ abc2midi validation passed
  ✅ Pass 2 complete: ./output/Baroque_x_Synthwave-modified-1735123465.abc

  🔍 Pass 3: Evaluating composition completeness...
  📊 Evaluation: The composition now has full Baroque form with Synthwave elements...
  ✅ Composition is complete!

  🎵 Final composition after 3 passes: ./output/Baroque_x_Synthwave-modified-1735123465.abc

🎵 Sequential expansion complete!

Generated 1 composition(s) total
```
