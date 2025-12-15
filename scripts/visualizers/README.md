# ASCII Beat Visualizer

Terminal-based music visualization with beat-synchronized ASCII animations.

## ⚠️ IMPORTANT LIMITATION

**Beat detection is currently SIMULATED at 120 BPM, not synced to actual audio!**

The visualizations will flash and animate at a fixed rate regardless of the actual beats in your music. This is a known issue - proper beat detection requires fixing the librosa/aubio integration.

## Features

- 🎆 Multiple firework types (Ring, Serpent, Star, Palm)
- 🌈 Rainbow cycling effects
- 💚 Matrix rain background
- 🎨 Plasma psychedelic effects
- ⚡ Beat-synchronized screen flashes (simulated)
- 📊 Real-time performance stats

## Installation

### Requirements

- Python 3.13+
- pygame
- asciimatics

### NixOS Setup

```bash
# Enter the nix shell (provides system libraries)
nix-shell

# Install Python packages
uv pip install pygame asciimatics
```

### Other Systems

```bash
pip install pygame asciimatics
```

## Usage

### Direct Python Execution

```bash
# Standard mode (balanced effects)
python scripts/visualizers/ascii-beats.py woah-dope8.wav

# Simple mode (low CPU usage)
python scripts/visualizers/ascii-beats.py woah-dope8.wav --mode simple

# Insane mode (maximum effects)
python scripts/visualizers/ascii-beats.py woah-dope8.wav --mode insane
```

### Via Mediocre CLI

```bash
# After building the project
npm run build

# Run visualizer
mediocre visualize woah-dope8.wav
mediocre visualize woah-dope8.wav --mode simple
mediocre visualize woah-dope8.wav --mode insane
```

## Modes

| Mode | Description | CPU Usage | Effects |
|------|-------------|-----------|---------|
| **simple** | Minimal effects | Low | Matrix rain, basic fireworks |
| **standard** | Balanced visuals | Medium | + Plasma, rainbow text, sparkles |
| **insane** | Maximum chaos | High | + Stars, all firework types, screen flashes |

## Controls

- **Q** or **Ctrl+C**: Quit the visualizer

## Architecture

### Current Implementation (Simulated)

```
Audio File → Pygame Playback
    ↓
Fixed Timer (120 BPM) → Visual Effects
```

### Desired Implementation (Not Working)

```
Audio File → Beat Detector (librosa/aubio)
    ↓
Real Beat Times → Synchronized Visual Effects
```

## Known Issues

1. **No Real Beat Detection**: All animations are timed to 120 BPM regardless of actual music
2. **librosa Import Error**: The "insane" version fails with coverage/numba compatibility issues
3. **No Audio Analysis**: Amplitude and frequency data are not used for visualization

## File Structure

```
scripts/visualizers/
├── ascii-beats.py           # Unified visualizer with modes
├── ascii-beats-simple.py    # Legacy simple version (deprecated)
├── ascii-beats-working.py   # Legacy working version (deprecated)
├── ascii-beats-insane.py    # Legacy insane version (broken)
└── README.md               # This file
```

## Future Improvements

### Short Term
- [ ] Fix librosa integration for real beat detection
- [ ] Add amplitude-based visual intensity
- [ ] Implement frequency spectrum visualization

### Long Term
- [ ] Rewrite in JavaScript using blessed (native to project)
- [ ] Use existing audio-analyzer.js for beat detection
- [ ] Add configuration file support
- [ ] Support for MIDI file visualization
- [ ] Lyric synchronization from ABC notation

## Technical Details

### Beat Simulation Logic

```python
# Current implementation (NOT synced to audio)
beat_interval = 0.5  # Fixed 120 BPM
if current_time - last_beat_time >= beat_interval:
    trigger_beat_effects()
```

### Performance

- Target FPS: 30-40 depending on mode
- Frame sleep: 25-33ms
- Particle limits: 20-100 explosions based on mode

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `ModuleNotFoundError: pygame` | Run `pip install pygame asciimatics` |
| Screen corruption after quit | Run `reset` command |
| Low FPS | Use `--mode simple` |
| No audio | Check audio file path and format |

## Contributing

To add new visual effects:

1. Create effect class inheriting from asciimatics Effect
2. Add to `create_effects()` function
3. Configure intensity scaling in mode settings

## Credits

Built with:
- [asciimatics](https://github.com/peterbrittain/asciimatics) - Terminal effects library
- [pygame](https://www.pygame.org/) - Audio playback

Part of the [mediocre-music](https://github.com/yourusername/mediocre) project.