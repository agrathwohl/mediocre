#!/usr/bin/env python3
"""
INSANE ASCII BEATS VISUALIZER - WORKING VERSION
No librosa bullshit, just pure insanity with beat simulation
"""

import sys
import os
import time
import random
import threading
import math
from asciimatics.screen import Screen
from asciimatics.scene import Scene
from asciimatics.effects import Stars, Print, Cycle, Matrix, Snow
from asciimatics.particles import (
    RingFirework, SerpentFirework, StarFirework, PalmFirework,
    Rain, DropScreen
)
from asciimatics.renderers import FigletText, Rainbow, Plasma, Fire
import pygame

# ASCII art patterns from the URLs you wanted
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
    """
    ╔═══╗
    ║▓▓▓║
    ╚═══╝
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
    """
     ✦
    ✦ ✦
     ✦
    """,
]

FRACTAL_PATTERNS = [
    """
    ▲
   ▲ ▲
  ▲   ▲
 ▲ ▲ ▲ ▲
    """,
]

DICE_PATTERNS = [
    """
    ┌───┐
    │ ● │
    └───┘
    """,
    """
    ┌───┐
    │● ●│
    └───┘
    """,
]

def demo(screen):
    """Main visualization with simulated beats - NO LIBROSA BULLSHIT"""

    audio_file = sys.argv[1] if len(sys.argv) > 1 else "woah-dope8.wav"

    if not os.path.exists(audio_file):
        screen.print_at(f"Error: Audio file not found!", 0, 0)
        screen.refresh()
        time.sleep(2)
        return

    # Start audio playback
    pygame.mixer.init()
    pygame.mixer.music.load(audio_file)
    pygame.mixer.music.play()

    # Create background effects
    effects = []

    # Matrix rain background
    effects.append(Matrix(screen))

    # Plasma psychedelic background
    plasma = Plasma(screen.height, screen.width, 16)
    effects.append(
        Print(screen, plasma, x=0, y=0, transparent=True, colour=Screen.COLOUR_GREEN)
    )

    # Starfield
    effects.append(Stars(screen, screen.width * screen.height // 6))

    # Title with rainbow cycling
    title_text = FigletText("INSANE!", font='banner3')
    effects.append(
        Cycle(screen, Rainbow(screen, title_text), screen.height // 2 - 8)
    )

    # Variables for beat simulation
    frame = 0
    start_time = time.time()
    beat_count = 0
    active_explosions = []

    # Beat timing (simulate 120 BPM)
    beat_interval = 0.5
    last_beat_time = time.time()

    # Sub-beat timing for extra craziness
    sub_beat_interval = 0.125
    last_sub_beat = time.time()

    # Color schemes
    color_schemes = [
        [Screen.COLOUR_RED, Screen.COLOUR_YELLOW, Screen.COLOUR_WHITE],
        [Screen.COLOUR_BLUE, Screen.COLOUR_CYAN, Screen.COLOUR_WHITE],
        [Screen.COLOUR_GREEN, Screen.COLOUR_YELLOW, Screen.COLOUR_WHITE],
        [Screen.COLOUR_MAGENTA, Screen.COLOUR_YELLOW, Screen.COLOUR_CYAN],
    ]
    current_scheme_idx = 0

    # ASCII art cycling
    art_patterns = GEOMETRY_PATTERNS + STAR_PATTERNS + FRACTAL_PATTERNS + DICE_PATTERNS

    running = True
    intensity = 0.5

    while running and pygame.mixer.music.get_busy():
        screen.clear()

        current_time = time.time()
        elapsed = current_time - start_time

        # Main beat
        if current_time - last_beat_time >= beat_interval:
            last_beat_time = current_time
            beat_count += 1

            # EXPLOSION TIME!
            # Change color scheme every 4 beats
            if beat_count % 4 == 0:
                current_scheme_idx = (current_scheme_idx + 1) % len(color_schemes)

            # Intensity variations
            intensity = 0.8 + random.random() * 0.2

            # Create MASSIVE firework explosions
            num_fireworks = int(intensity * 12)
            for _ in range(num_fireworks):
                x = random.randint(5, screen.width - 5)
                y = random.randint(5, screen.height - 5)

                # Mix all firework types
                firework_types = [RingFirework, SerpentFireework, StarFirework, PalmFirework]
                for ft in random.sample(firework_types, 2):
                    effect = ft(screen, x + random.randint(-3, 3),
                               y + random.randint(-2, 2),
                               random.randint(20, 30), 25)
                    active_explosions.append({
                        'effect': effect,
                        'birth': frame,
                        'lifetime': 50
                    })

            # Screen flash on strong beats
            if beat_count % 2 == 0:
                flash_chars = ['█', '▓', '▒', '░', '*', '#', '@']
                flash_char = random.choice(flash_chars)
                current_colors = color_schemes[current_scheme_idx]

                for y in range(0, screen.height, 2):
                    for x in range(0, screen.width, 3):
                        if random.random() < intensity:
                            screen.print_at(flash_char, x, y,
                                          colour=random.choice(current_colors))

            # CRAZY TEXT EXPLOSIONS
            if beat_count % 4 == 0:
                crazy_texts = ["BOOM!", "BANG!", "WOW!", "CRAZY!", "INSANE!", "WILD!", "SICK!"]
                for _ in range(3):  # Multiple texts
                    text = random.choice(crazy_texts)
                    text_color = random.choice([
                        Screen.COLOUR_RED, Screen.COLOUR_YELLOW,
                        Screen.COLOUR_MAGENTA, Screen.COLOUR_CYAN,
                        Screen.COLOUR_WHITE
                    ])
                    x_pos = random.randint(0, max(0, screen.width - 30))
                    y_pos = random.randint(5, max(5, screen.height - 10))

                    figlet = FigletText(text, font='banner' if len(text) < 6 else 'standard')
                    for i, line in enumerate(str(figlet).split('\n')):
                        if y_pos + i < screen.height - 2:
                            screen.print_at(line, x_pos, y_pos + i, colour=text_color)

            # Display random ASCII art patterns
            if random.random() < 0.7:
                art = random.choice(art_patterns)
                art_x = random.randint(0, max(0, screen.width - 20))
                art_y = random.randint(0, max(0, screen.height - 10))
                art_color = random.choice(color_schemes[current_scheme_idx])

                for i, line in enumerate(art.strip().split('\n')):
                    if art_y + i < screen.height - 2:
                        screen.print_at(line, art_x, art_y + i, colour=art_color)

        # Sub-beats for continuous craziness
        if current_time - last_sub_beat >= sub_beat_interval:
            last_sub_beat = current_time

            # Sparkles and particles
            num_sparkles = int(intensity * 50)
            for _ in range(num_sparkles):
                x = random.randint(0, screen.width - 1)
                y = random.randint(0, screen.height - 1)
                spark_chars = ['*', '+', '.', '·', '°', '×', '÷']
                spark_char = random.choice(spark_chars)
                spark_color = random.choice([
                    Screen.COLOUR_WHITE, Screen.COLOUR_YELLOW,
                    Screen.COLOUR_CYAN, Screen.COLOUR_MAGENTA
                ])
                screen.print_at(spark_char, x, y, colour=spark_color)

            # Random color blocks
            if random.random() < 0.3:
                block_chars = ['▀', '▄', '█', '▌', '▐', '░', '▒', '▓']
                for _ in range(10):
                    x = random.randint(0, screen.width - 5)
                    y = random.randint(0, screen.height - 1)
                    block = random.choice(block_chars) * random.randint(3, 8)
                    color = random.choice(color_schemes[current_scheme_idx])
                    screen.print_at(block, x, y, colour=color)

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

        # Add rain effect periodically
        if beat_count % 8 == 0 and frame % 100 < 50:
            rain = Rain(screen, 100)
            rain.reset()
            rain._update(frame)

        # Status bar
        info_text = f"Time: {elapsed:.1f}s | Beats: {beat_count} | Explosions: {len(active_explosions)}"
        screen.print_at("═" * screen.width, 0, screen.height - 3,
                       colour=Screen.COLOUR_WHITE)
        screen.print_at(info_text, 2, screen.height - 2,
                       colour=Screen.COLOUR_WHITE)

        # Beat indicator with massive flash
        if (current_time - last_beat_time) < 0.1:
            beat_text = "████ BEAT! ████"
            for offset in range(-1, 2):
                screen.print_at(beat_text,
                              screen.width - len(beat_text) - 2,
                              screen.height - 2 + offset,
                              colour=Screen.COLOUR_RED,
                              bg=Screen.COLOUR_YELLOW)

        # Sine wave visualization
        wave_height = int(math.sin(elapsed * 3) * 5 + 10)
        wave_char = "~"
        for x in range(screen.width):
            y = int(math.sin(x * 0.2 + elapsed * 5) * wave_height + screen.height // 2)
            if 0 <= y < screen.height - 3:
                screen.print_at(wave_char, x, y,
                              colour=random.choice([Screen.COLOUR_CYAN, Screen.COLOUR_BLUE]))

        screen.refresh()

        # Check for quit
        event = screen.get_event()
        if event and event.key_code in [ord('q'), ord('Q'), Screen.ctrl('c')]:
            running = False

        frame += 1
        time.sleep(0.025)  # ~40 FPS for extra smoothness

    # Cleanup
    pygame.mixer.music.stop()
    pygame.quit()

if __name__ == "__main__":
    audio_file = sys.argv[1] if len(sys.argv) > 1 else "woah-dope8.wav"

    if not os.path.exists(audio_file):
        print(f"Error: Audio file '{audio_file}' not found!")
        sys.exit(1)

    print(f"""
╔══════════════════════════════════════════════════════════════╗
║           🎆 INSANE ASCII BEAT VISUALIZER 🎆                ║
║                                                              ║
║  MAXIMUM COLORS! MAXIMUM EXPLOSIONS! NO LIBROSA BULLSHIT!  ║
║  Audio: {audio_file:50} ║
║                                                              ║
║  Press Q or Ctrl+C to quit                                 ║
╚══════════════════════════════════════════════════════════════╝
    """)

    time.sleep(1)

    try:
        Screen.wrapper(demo)
        print("\n🎆 THAT WAS INSANE! 🎆")
    except KeyboardInterrupt:
        print("\n👋 Later!")
    except Exception as e:
        print(f"Error: {e}")