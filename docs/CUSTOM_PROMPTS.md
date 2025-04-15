# Using Custom Prompts with Mediocre

Mediocre now supports custom system and user prompts for the Claude AI model when generating music compositions. This feature allows you to have more control over the creative direction of the generated pieces.

## What are System Prompts and User Prompts?

- **System Prompt**: Sets the overall context, capabilities, and constraints for the AI model. It defines the "role" and general instructions for the AI.
- **User Prompt**: The specific request or instruction for generating the current piece. This is more focused on the particular task at hand.

## Using Custom Prompts

To use custom prompts, create text files containing your prompts and pass them to the `generate` command using the `--system-prompt` and/or `--user-prompt` options:

```bash
mediocre generate -g "baroque_x_jazz" --system-prompt my-system-prompt.txt --user-prompt my-user-prompt.txt
```

You can use either one or both of these options.

## Guidelines for Custom System Prompts

When writing a custom system prompt, make sure to include:

1. Clear instructions to output only valid ABC notation
2. Information about supported MIDI extensions
3. Guidelines for the musical structure

Here's an example custom system prompt structure:

```
You are a composer specializing in [style/genre].

Your task is to create a composition that [goals/constraints].
Return ONLY the ABC notation format for the composition, with no explanation or additional text.

Guidelines for the composition:

1. [Guideline 1]
2. [Guideline 2]
3. [Guideline 3]

Technical guidelines:
- Create a composition that is at least 64 measures long
- Use appropriate time signatures, key signatures, and tempos
- Include appropriate articulations, dynamics, and other musical notations
- Ensure the ABC notation is properly formatted and playable
- Use ONLY the following well-supported abc2midi syntax extensions:

ONLY USE THESE SUPPORTED EXTENSIONS:

1. Channel and Program selection:
   - %%MIDI program [channel] n   
     Example: %%MIDI program 1 40
   
2. Dynamics:
   - Use standard ABC dynamics notation: !p!, !f!, etc.
   - %%MIDI beat a b c n   
     Example: %%MIDI beat 90 80 65 1
   
3. Transposition (if needed):
   - %%MIDI transpose n   
     Example: %%MIDI transpose -12
   
4. Simple chord accompaniment:
   - %%MIDI gchord string   
     Example: %%MIDI gchord fzczfzcz

DO NOT use any unsupported extensions or commands.
```

## Guidelines for Custom User Prompts

Custom user prompts should be more specific and focused on the particular piece you want to generate. They can include:

1. Specific stylistic elements to include
2. Emotional qualities or moods to convey
3. Structural elements or form
4. Technical challenges or constraints

Example user prompt:

```
Create a composition that fuses baroque counterpoint with jazz harmonies. The piece should start with a fugue-like exposition using a syncopated subject, then transition into a middle section with extended jazz chords and walking bass, before concluding with a recapitulation that combines both elements. Include ornamentation typical of baroque music but with jazz-influenced rhythmic flexibility. The mood should shift from formal and structured to improvisational and back again.
```

## Example Files

You can find example custom prompt files in the `examples/` directory:

- `examples/custom-system-prompt.txt`
- `examples/custom-user-prompt.txt`

Feel free to modify these examples or create your own to experiment with different musical directions.

## Tips for Effective Custom Prompts

1. Be specific about what musical elements you want to include
2. Provide clear structure and constraints
3. Don't contradict the technical requirements for ABC notation
4. Include specific instrumentation guidance if desired
5. Mention specific musical techniques or theory concepts
6. Consider referencing specific composers or pieces as stylistic guides