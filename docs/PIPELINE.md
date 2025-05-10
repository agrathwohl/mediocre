# Mediocre Pipeline Command

The pipeline command allows you to run a sequence of mediocre commands in a single operation, where the output of each step becomes input for the next step. This enables complex workflows for generating, modifying, and processing musical compositions.

## Usage

```bash
mediocre pipeline -c /path/to/pipeline-config.json
```

## Configuration File Format

The pipeline is defined in a JSON configuration file with the following structure:

```json
{
  "name": "Pipeline Name",
  "description": "Description of what this pipeline does",
  "output_dir": "./pipeline_output",
  "steps": [
    {
      "name": "Step Name",
      "command": "command-name",
      "abort_on_error": false,
      "args": {
        "argument1": "value1",
        "argument2": "value2"
      }
    },
    {
      "name": "Another Step",
      "command": "another-command",
      "args": {
        "argument1": "value1"
      }
    }
  ]
}
```

### Top-level Fields

- `name`: The name of the pipeline (optional)
- `description`: A description of what the pipeline does (optional)
- `output_dir`: Directory where all pipeline output will be stored
- `steps`: Array of step objects that define the pipeline sequence

### Step Fields

- `name`: Name of the step (optional, but recommended for clarity)
- `command`: The mediocre command to run (required)
- `abort_on_error`: If true, the pipeline will stop if this step fails (optional, defaults to false)
- `args`: Object containing arguments for the command (optional)

## How It Works

1. Each step runs in sequence
2. Files produced by a step are automatically passed to the next step
3. Each step has its own directory within the output directory
4. A results file is generated at the end with details about each step

## File Handling Between Steps

The pipeline automatically adapts files between steps:

1. **generate → any**: No input files, generates ABC files
2. **convert → any**: Takes ABC files, produces MIDI/WAV/PDF files
3. **modify → any**: Takes an ABC file, produces a modified ABC file
4. **combine → any**: Takes WAV files from directory, produces new ABC files
5. **mix-and-match → any**: Takes ABC files, produces a new ABC file
6. **rearrange → any**: Takes an ABC file, produces a rearranged ABC file
7. **lyrics → any**: Takes MIDI and ABC files, produces an ABC file with lyrics

## Example Pipelines

See the `examples` directory for sample pipeline configurations:

- `pipeline-config.json`: Basic pipeline for generating and modifying compositions
- `advanced-pipeline-config.json`: Complex pipeline with multiple generation steps, mixing, rearranging, and lyrics

## Tips and Best Practices

1. **Start Simple**: Begin with a few steps and test before adding more
2. **Create Step Groups**: Organize pipelines into logical groups of steps
3. **Handle Errors**: Use `abort_on_error` for critical steps
4. **Use Meaningful Names**: Give each step a descriptive name
5. **Check Results**: Review the pipeline_results.json file after execution

## Limitations

- Each step must produce files that can be consumed by the next step
- Some commands may require specific file formats as input
- Very long pipelines may take significant time to execute

## Troubleshooting

If a pipeline fails:

1. Check the console output for error messages
2. Look for the last successful step in pipeline_results.json
3. Verify that the expected files were produced by each step
4. Run each command manually to isolate issues