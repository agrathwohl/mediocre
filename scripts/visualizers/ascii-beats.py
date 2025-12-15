#!/usr/bin/env python3
"""
UNIFIED ASCII BEAT VISUALIZER
Combines simple, standard, and insane modes into one configurable script
NOTE: Beat detection is currently SIMULATED at fixed BPM, not synced to actual audio
"""

import sys
import os
import time
import random
import argparse
from enum import Enum
from asciimatics.screen import Screen
from asciimatics.effects import Stars, Print, Cycle, Matrix, Snow
from asciimatics.particles import (
    RingFirework, SerpentFirework, StarFirework, PalmFirework,
    Rain, DropScreen
)
from asciimatics.renderers import FigletText, Rainbow, Plasma, Fire
import pygame

class VisualizerMode(Enum):
    SIMPLE = "simple"      # Minimal effects, low CPU
    STANDARD = "standard"  # Balanced effects
    INSANE = "insane"      # Maximum chaos

# ASCII art patterns
GEOMETRY_PATTERNS = [
    """
       ___
      /   \\
     /     \\
    /_______\\
    """,
    """
     ◆◇◆
    ◇◆◇◆◇
     ◆◇◆
    """,
]

STAR_PATTERNS = [
    """
      ★
     ★ ★
    ★   ★
     ★ ★
      ★
    """,
]

def create_effects(screen, mode):
    """Create persistent background effects based on mode"""
    effects = []

    # All modes get matrix rain
    effects.append(Matrix(screen))

    if mode in [VisualizerMode.STANDARD, VisualizerMode.INSANE]:
        # Add plasma for standard and insane
        plasma = Plasma(screen.height, screen.width, 16)
        effects.append(
            Print(screen, plasma, x=0, y=0, transparent=True, colour=Screen.COLOUR_GREEN)
        )

        # Add rainbow title
        title_text = FigletText("BEATS!" if mode == VisualizerMode.STANDARD else "INSANE!", font='banner3')
        effects.append(
            Cycle(screen, Rainbow(screen, title_text), screen.height // 2 - 5)
        )

    if mode == VisualizerMode.INSANE:
        # Add stars for insane mode
        effects.append(Stars(screen, screen.width * screen.height // 6))

    return effects

def create_fireworks(screen, x, y, intensity, mode):
    """Create firework effects based on mode and intensity"""
    explosions = []

    if mode == VisualizerMode.SIMPLE:
        # Simple mode: just one firework type
        num_fireworks = min(int(intensity * 3) + 1, 3)
        for _ in range(num_fireworks):
            fx = x + random.randint(-2, 2)
            fy = y + random.randint(-1, 1)
            effect = RingFirework(screen, fx, fy, random.randint(10, 15), 15)
            explosions.append(effect)

    elif mode == VisualizerMode.STANDARD:
        # Standard mode: mix of firework types
        num_fireworks = min(int(intensity * 6) + 2, 6)
        firework_types = [RingFirework, SerpentFirework, StarFirework]

        for _ in range(num_fireworks):
            fx = x + random.randint(-3, 3)
            fy = y + random.randint(-2, 2)
            firework_class = random.choice(firework_types)
            effect = firework_class(screen, fx, fy, random.randint(15, 20), 20)
            explosions.append(effect)

    else:  # INSANE
        # Insane mode: all firework types, maximum count
        num_fireworks = min(int(intensity * 12) + 3, 12)
        firework_types = [RingFirework, SerpentFirework, StarFirework, PalmFirework]

        for _ in range(num_fireworks):
            fx = x + random.randint(-5, 5)
            fy = y + random.randint(-3, 3)
            # Use multiple types at once for chaos
            for ft in random.sample(firework_types, min(2, len(firework_types))):
                effect = ft(screen, fx + random.randint(-2, 2),
                          fy + random.randint(-1, 1),
                          random.randint(20, 30), 25)
                explosions.append(effect)

    return explosions

def demo(screen, audio_file, mode):
    """Main visualization function with configurable mode"""

    if not os.path.exists(audio_file):
        screen.print_at(f"Error: Audio file '{audio_file}' not found!", 0, 0)
        screen.refresh()
        time.sleep(2)
        return

    # Start audio playback
    pygame.mixer.init()
    pygame.mixer.music.load(audio_file)
    pygame.mixer.music.play()

    # Create persistent background effects based on mode
    effects = create_effects(screen, mode)

    # Configuration based on mode
    if mode == VisualizerMode.SIMPLE:
        beat_interval = 0.5  # 120 BPM
        sub_beat_interval = 0.25
        target_fps = 30
        frame_sleep = 1.0 / target_fps
        max_explosions = 20
    elif mode == VisualizerMode.STANDARD:
        beat_interval = 0.5  # 120 BPM
        sub_beat_interval = 0.125
        target_fps = 40
        frame_sleep = 1.0 / target_fps
        max_explosions = 40
    else:  # INSANE
        beat_interval = 0.5  # 120 BPM
        sub_beat_interval = 0.125
        target_fps = 40
        frame_sleep = 1.0 / target_fps
        max_explosions = 100

    # Variables for beat simulation
    # WARNING: This is SIMULATED timing, not actual beat detection!
    # Real audio analysis would require working librosa/aubio integration
    frame = 0
    start_time = time.time()
    beat_count = 0
    active_explosions = []
    last_beat_time = time.time()
    last_sub_beat = time.time()

    # Color schemes
    color_schemes = [
        [Screen.COLOUR_RED, Screen.COLOUR_YELLOW, Screen.COLOUR_WHITE],
        [Screen.COLOUR_BLUE, Screen.COLOUR_CYAN, Screen.COLOUR_WHITE],
        [Screen.COLOUR_GREEN, Screen.COLOUR_YELLOW, Screen.COLOUR_WHITE],
        [Screen.COLOUR_MAGENTA, Screen.COLOUR_YELLOW, Screen.COLOUR_CYAN],
    ]
    current_scheme_idx = 0

    # ASCII art patterns
    art_patterns = GEOMETRY_PATTERNS + STAR_PATTERNS if mode != VisualizerMode.SIMPLE else []

    running = True
    intensity = 0.5

    try:
        while running and pygame.mixer.music.get_busy():
            screen.clear()

            current_time = time.time()
            elapsed = current_time - start_time

            # Main beat (SIMULATED - not synced to actual audio!)
            if current_time - last_beat_time >= beat_interval:
                last_beat_time = current_time
                beat_count += 1

                # Change color scheme periodically
                if beat_count % (8 if mode != VisualizerMode.SIMPLE else 16) == 0:
                    current_scheme_idx = (current_scheme_idx + 1) % len(color_schemes)

                # Vary intensity
                intensity = 0.7 + random.random() * 0.3 if mode != VisualizerMode.SIMPLE else 0.5

                # Create fireworks
                for _ in range(1 if mode == VisualizerMode.SIMPLE else 3):
                    x = random.randint(5, screen.width - 5)
                    y = random.randint(5, screen.height - 5)

                    new_explosions = create_fireworks(screen, x, y, intensity, mode)
                    for explosion in new_explosions:
                        if len(active_explosions) < max_explosions:
                            active_explosions.append({
                                'effect': explosion,
                                'birth': frame,
                                'lifetime': 30 if mode == VisualizerMode.SIMPLE else 50
                            })

                # Screen flash on strong beats (not in simple mode)
                if mode != VisualizerMode.SIMPLE and beat_count % 2 == 0:
                    flash_chars = ['█', '▓', '▒', '░'] if mode == VisualizerMode.INSANE else ['*', '#']
                    flash_char = random.choice(flash_chars)
                    current_colors = color_schemes[current_scheme_idx]

                    step = 3 if mode == VisualizerMode.INSANE else 4
                    for y in range(0, screen.height, step):
                        for x in range(0, screen.width, step + 1):
                            if random.random() < (intensity * 0.7):
                                screen.print_at(flash_char, x, y,
                                              colour=random.choice(current_colors))

                # Text explosions (standard and insane only)
                if mode != VisualizerMode.SIMPLE and beat_count % 4 == 0:
                    crazy_texts = ["BOOM!", "BANG!", "WOW!"] if mode == VisualizerMode.STANDARD else \
                                 ["BOOM!", "BANG!", "WOW!", "CRAZY!", "INSANE!", "WILD!", "SICK!"]
                    text = random.choice(crazy_texts)
                    text_color = random.choice([
                        Screen.COLOUR_RED, Screen.COLOUR_YELLOW,
                        Screen.COLOUR_MAGENTA, Screen.COLOUR_CYAN
                    ])
                    x_pos = random.randint(0, max(0, screen.width - 30))
                    y_pos = random.randint(5, max(5, screen.height - 10))

                    figlet = FigletText(text, font='banner' if len(text) < 6 else 'standard')
                    for i, line in enumerate(str(figlet).split('\n')):
                        if y_pos + i < screen.height - 2:
                            screen.print_at(line, x_pos, y_pos + i, colour=text_color)

                # Display ASCII art (standard and insane)
                if art_patterns and mode != VisualizerMode.SIMPLE and random.random() < 0.5:
                    art = random.choice(art_patterns)
                    art_x = random.randint(0, max(0, screen.width - 20))
                    art_y = random.randint(0, max(0, screen.height - 10))
                    art_color = random.choice(color_schemes[current_scheme_idx])

                    for i, line in enumerate(art.strip().split('\n')):
                        if art_y + i < screen.height - 2:
                            screen.print_at(line, art_x, art_y + i, colour=art_color)

            # Sub-beats for continuous effects (not in simple mode)
            if mode != VisualizerMode.SIMPLE and current_time - last_sub_beat >= sub_beat_interval:
                last_sub_beat = current_time

                # Sparkles
                num_sparkles = int(intensity * (30 if mode == VisualizerMode.STANDARD else 50))
                for _ in range(num_sparkles):
                    x = random.randint(0, screen.width - 1)
                    y = random.randint(0, screen.height - 1)
                    spark_chars = ['*', '+', '.'] if mode == VisualizerMode.STANDARD else \
                                 ['*', '+', '.', '·', '°', '×', '÷']
                    spark_char = random.choice(spark_chars)
                    spark_color = random.choice([
                        Screen.COLOUR_WHITE, Screen.COLOUR_YELLOW,
                        Screen.COLOUR_CYAN
                    ])
                    screen.print_at(spark_char, x, y, colour=spark_color)

            # Update persistent background effects
            for effect in effects:
                effect.reset()
                effect._update(frame)

            # Update active explosions
            active_explosions = [
                exp for exp in active_explosions
                if frame - exp['birth'] < exp['lifetime']
            ]

            for exp in active_explosions:
                exp['effect'].reset()
                exp['effect']._update(frame)

            # Status bar
            info_text = f"Time: {elapsed:.1f}s | Beats: {beat_count} | Mode: {mode.value} | FPS: {int(frame/elapsed if elapsed > 0 else 0)}"
            screen.print_at("═" * screen.width, 0, screen.height - 3,
                           colour=Screen.COLOUR_WHITE)
            screen.print_at(info_text, 2, screen.height - 2,
                           colour=Screen.COLOUR_WHITE)

            # Beat indicator
            if (current_time - last_beat_time) < 0.1:
                beat_text = "████ BEAT! ████"
                screen.print_at(beat_text,
                              screen.width - len(beat_text) - 2,
                              screen.height - 2,
                              colour=Screen.COLOUR_RED,
                              bg=Screen.COLOUR_YELLOW)

            # Warning about simulated beats
            if beat_count == 1:
                warning = "⚠️ SIMULATED BEATS @ 120 BPM - NOT SYNCED TO AUDIO ⚠️"
                screen.print_at(warning,
                              (screen.width - len(warning)) // 2,
                              2,
                              colour=Screen.COLOUR_YELLOW)

            screen.refresh()

            # Check for quit
            event = screen.get_event()
            if event and event.key_code in [ord('q'), ord('Q'), Screen.ctrl('c')]:
                running = False

            frame += 1
            time.sleep(frame_sleep)

    finally:
        # Cleanup
        pygame.mixer.music.stop()
        pygame.quit()

def main():
    parser = argparse.ArgumentParser(
        description="ASCII Beat Visualizer - Terminal animations synced to music",
        epilog="WARNING: Beat detection is currently SIMULATED at 120 BPM, not synced to actual audio!"
    )
    parser.add_argument('audio_file', help='Audio file to visualize (wav, mp3, etc)')
    parser.add_argument('-m', '--mode',
                       choices=['simple', 'standard', 'insane'],
                       default='standard',
                       help='Visualization mode: simple (low CPU), standard (balanced), insane (maximum effects)')

    args = parser.parse_args()

    audio_file = args.audio_file
    mode = VisualizerMode(args.mode)

    if not os.path.exists(audio_file):
        print(f"Error: Audio file '{audio_file}' not found!")
        sys.exit(1)

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           🎆 ASCII BEAT VISUALIZER 🎆                       ║
║                                                              ║
║  Mode: {mode.value.upper():10} | Audio: {audio_file:25} ║
║                                                              ║
║  ⚠️  NOTICE: Beat detection currently SIMULATED @ 120 BPM    ║
║  Press Q or Ctrl+C to quit                                  ║
╚══════════════════════════════════════════════════════════════╝
    """)

    time.sleep(1)

    try:
        Screen.wrapper(lambda screen: demo(screen, audio_file, mode))
        print("\n🎆 Thanks for watching! 🎆")
    except KeyboardInterrupt:
        print("\n👋 Stopped!")
    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()