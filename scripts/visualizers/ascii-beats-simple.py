#!/usr/bin/env python3
"""
INSANE ASCII BEATS VISUALIZER - SIMPLIFIED VERSION
Using manual beat timing for testing
"""

import sys
import os
import time
import random
import threading
from asciimatics.screen import Screen
from asciimatics.scene import Scene
from asciimatics.effects import Stars, Print, Cycle, Matrix
from asciimatics.particles import (
    RingFirework, SerpentFirework, StarFirework, PalmFirework
)
from asciimatics.renderers import FigletText, Rainbow, Plasma
import pygame

def demo(screen):
    """Main visualization function with manual beat simulation"""

    audio_file = sys.argv[1] if len(sys.argv) > 1 else "woah-dope8.wav"

    # Start audio playback
    pygame.mixer.init()
    pygame.mixer.music.load(audio_file)
    pygame.mixer.music.play()

    # Create persistent background effects
    effects = []

    # Matrix rain effect
    effects.append(Matrix(screen))

    # Plasma background
    plasma = Plasma(screen.height, screen.width, 16)
    effects.append(
        Print(screen, plasma, x=0, y=0, transparent=True, colour=Screen.COLOUR_GREEN)
    )

    # Title with rainbow effect
    title_text = FigletText("BEATS!", font='banner3')
    effects.append(
        Cycle(screen, Rainbow(screen, title_text), screen.height // 2 - 5)
    )

    # Manual beat timing (approximate BPM)
    beat_interval = 0.5  # 120 BPM
    last_beat_time = time.time()
    beat_count = 0

    # Active explosions list
    active_explosions = []

    # Color schemes
    color_schemes = [
        [Screen.COLOUR_RED, Screen.COLOUR_YELLOW],
        [Screen.COLOUR_BLUE, Screen.COLOUR_CYAN],
        [Screen.COLOUR_GREEN, Screen.COLOUR_WHITE],
        [Screen.COLOUR_MAGENTA, Screen.COLOUR_YELLOW],
    ]
    current_scheme = 0

    frame = 0
    start_time = time.time()

    while pygame.mixer.music.get_busy():
        screen.clear()

        # Check for beat timing
        current_time = time.time()
        if current_time - last_beat_time >= beat_interval:
            last_beat_time = current_time
            beat_count += 1

            # Change color scheme every 8 beats
            if beat_count % 8 == 0:
                current_scheme = (current_scheme + 1) % len(color_schemes)

            # Create multiple fireworks on beat
            num_fireworks = random.randint(3, 8)
            for _ in range(num_fireworks):
                x = random.randint(5, screen.width - 5)
                y = random.randint(5, screen.height - 5)

                # Random firework type
                firework_types = [
                    RingFirework, SerpentFirework,
                    StarFirework, PalmFirework
                ]
                firework_class = random.choice(firework_types)
                lifetime = random.randint(15, 25)

                effect = firework_class(screen, x, y, lifetime, 20)
                active_explosions.append({
                    'effect': effect,
                    'birth': frame,
                    'lifetime': 40
                })

            # Flash screen on beat
            if beat_count % 2 == 0:
                flash_char = random.choice(['*', '#', '@', '█'])
                flash_color = random.choice(color_schemes[current_scheme])
                for y in range(0, screen.height, 3):
                    for x in range(0, screen.width, 5):
                        screen.print_at(flash_char, x, y, colour=flash_color)

            # Add crazy text every 4 beats
            if beat_count % 4 == 0:
                crazy_texts = ["BOOM!", "BANG!", "WOW!", "CRAZY!", "INSANE!"]
                text = random.choice(crazy_texts)
                text_color = random.choice([
                    Screen.COLOUR_RED, Screen.COLOUR_YELLOW,
                    Screen.COLOUR_MAGENTA, Screen.COLOUR_CYAN
                ])
                x_pos = random.randint(0, max(0, screen.width - 30))
                y_pos = random.randint(5, max(5, screen.height - 10))

                figlet = FigletText(text, font='banner')
                for i, line in enumerate(str(figlet).split('\n')):
                    if y_pos + i < screen.height - 2:
                        screen.print_at(line, x_pos, y_pos + i, colour=text_color)

        # Random sparkles
        for _ in range(20):
            x = random.randint(0, screen.width - 1)
            y = random.randint(0, screen.height - 1)
            spark_char = random.choice(['*', '+', '.', '·'])
            spark_color = random.choice([
                Screen.COLOUR_WHITE, Screen.COLOUR_YELLOW,
                Screen.COLOUR_CYAN
            ])
            screen.print_at(spark_char, x, y, colour=spark_color)

        # Update persistent effects
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

        # Display info
        elapsed = time.time() - start_time
        info_text = f"Time: {elapsed:.1f}s | Beats: {beat_count} | FPS: {int(frame/elapsed)}"
        screen.print_at(info_text, 2, screen.height - 2, colour=Screen.COLOUR_WHITE)

        # Beat indicator
        if (current_time - last_beat_time) < 0.1:  # Show for 100ms after beat
            beat_indicator = "████ BEAT! ████"
            screen.print_at(beat_indicator,
                          screen.width - len(beat_indicator) - 2,
                          screen.height - 2,
                          colour=Screen.COLOUR_RED,
                          bg=Screen.COLOUR_YELLOW)

        screen.refresh()

        # Check for quit
        event = screen.get_event()
        if event and event.key_code in [ord('q'), ord('Q'), Screen.ctrl('c')]:
            break

        frame += 1
        time.sleep(0.03)  # ~30 FPS

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
║  Prepare for EXPLOSIVE colors and CRAZY animations!         ║
║  Audio: {audio_file:50} ║
║                                                              ║
║  Press Q or Ctrl+C to quit                                 ║
╚══════════════════════════════════════════════════════════════╝
    """)

    time.sleep(1)

    try:
        Screen.wrapper(demo)
    except KeyboardInterrupt:
        print("\n👋 Stopped!")
    except Exception as e:
        print(f"Error: {e}")