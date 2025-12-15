#!/usr/bin/env python3
"""
INSANE ASCII BEATS VISUALIZER
Explosive, colorful, beat-synchronized ASCII animations using asciimatics
"""

import sys
import os
import threading
import time
import random
import queue
from datetime import datetime
from asciimatics.screen import Screen
from asciimatics.scene import Scene
from asciimatics.effects import Stars, Print, Cycle, Snow, Matrix
from asciimatics.particles import (
    RingFirework, SerpentFirework, StarFirework, PalmFirework,
    ParticleEffect, Rain, DropScreen
)
from asciimatics.renderers import (
    FigletText, Fire, Rainbow, Plasma,
    ColourImageFile, Box
)
from asciimatics.exceptions import ResizeScreenError, StopApplication
import pygame
import numpy as np
import librosa
import soundfile as sf

# Global beat queue for thread communication
beat_queue = queue.Queue()
amplitude_queue = queue.Queue()
audio_file = None
onset_frames = []
onset_times = []
current_beat_index = 0
audio_duration = 0

def detect_onsets_and_amplitude(audio_path):
    """Use librosa to detect onsets (beats) and analyze amplitude"""
    global onset_frames, onset_times, audio_duration

    print("🎵 Loading audio file...")
    # Load audio file
    y, sr = librosa.load(audio_path, sr=None)
    audio_duration = len(y) / sr

    print("💥 Detecting beats and onsets...")
    # Detect onsets (beats)
    onset_frames = librosa.onset.onset_detect(
        y=y, sr=sr,
        backtrack=True,
        units='time'
    )

    # Also get onset strength for more detailed beat tracking
    onset_envelope = librosa.onset.onset_strength(y=y, sr=sr)

    # Get tempo and beat frames
    tempo, beats = librosa.beat.beat_track(y=y, sr=sr, onset_envelope=onset_envelope)
    beat_times = librosa.frames_to_time(beats, sr=sr)

    # Get spectral features for visual mapping
    spectral_centroids = librosa.feature.spectral_centroid(y=y, sr=sr)[0]

    # RMS energy for amplitude
    rms = librosa.feature.rms(y=y)[0]

    print(f"🎵 Tempo: {tempo:.1f} BPM")
    print(f"💥 Found {len(beat_times)} beats!")

    onset_times = beat_times.tolist()
    return beat_times, rms, spectral_centroids, tempo

def audio_player_thread(audio_path, beat_times, rms_values):
    """Play audio using pygame and send beat events"""
    global current_beat_index, onset_times

    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=512)
    pygame.mixer.music.load(audio_path)
    pygame.mixer.music.play()

    start_time = time.time()
    rms_frame_duration = audio_duration / len(rms_values)

    while pygame.mixer.music.get_busy():
        current_time = time.time() - start_time

        # Check for beats
        while current_beat_index < len(onset_times):
            if current_time >= onset_times[current_beat_index]:
                # Determine beat intensity based on surrounding amplitude
                frame_idx = min(int(current_time / rms_frame_duration), len(rms_values) - 1)
                intensity = float(rms_values[frame_idx])

                beat_queue.put({
                    'type': 'beat',
                    'time': onset_times[current_beat_index],
                    'index': current_beat_index,
                    'intensity': min(intensity * 5, 1.0)  # Normalize intensity
                })
                current_beat_index += 1
            else:
                break

        # Send amplitude updates
        if current_time < audio_duration:
            frame_idx = min(int(current_time / rms_frame_duration), len(rms_values) - 1)
            amplitude_queue.put({
                'type': 'amplitude',
                'value': float(rms_values[frame_idx]),
                'time': current_time
            })

        time.sleep(0.01)  # Small sleep to prevent CPU spinning

class CrazyFirework:
    """Custom crazy firework that changes colors"""
    def __init__(self, screen, x, y):
        self.screen = screen
        self.effects = []

        # Launch multiple fireworks with different colors
        colors = [
            Screen.COLOUR_RED, Screen.COLOUR_GREEN,
            Screen.COLOUR_YELLOW, Screen.COLOUR_MAGENTA,
            Screen.COLOUR_CYAN, Screen.COLOUR_WHITE
        ]

        for i in range(3):
            offset_x = x + random.randint(-5, 5)
            offset_y = y + random.randint(-3, 3)
            lifetime = random.randint(15, 25)

            if random.random() < 0.25:
                self.effects.append(RingFirework(screen, offset_x, offset_y, lifetime, 20))
            elif random.random() < 0.5:
                self.effects.append(SerpentFirework(screen, offset_x, offset_y, lifetime, 20))
            elif random.random() < 0.75:
                self.effects.append(StarFirework(screen, offset_x, offset_y, lifetime, 20))
            else:
                self.effects.append(PalmFirework(screen, offset_x, offset_y, lifetime, 20))

def demo(screen):
    """Main visualization function"""
    global audio_file

    if not audio_file or not os.path.exists(audio_file):
        screen.print_at(f"Error: Audio file not found!", 0, 0)
        screen.refresh()
        time.sleep(2)
        return

    # Analyze audio
    beat_times, rms, spectral_centroids, tempo = detect_onsets_and_amplitude(audio_file)

    # Start audio playback in separate thread
    audio_thread = threading.Thread(
        target=audio_player_thread,
        args=(audio_file, beat_times, rms)
    )
    audio_thread.daemon = True
    audio_thread.start()

    # Create persistent background effects
    effects = [
        # Stars(screen, screen.width * screen.height // 4),
        Matrix(screen)  # Matrix rain effect
    ]

    # Add plasma background
    plasma = Plasma(screen.height, screen.width, 16)
    effects.append(
        Print(screen, plasma, x=0, y=0, transparent=True, colour=Screen.COLOUR_GREEN)
    )

    # Title text with fire effect
    title_text = FigletText("BEATS!", font='banner3')
    fire_text = Fire(screen.height, 80, "BEATS!", 0.8, 60, screen.colours)

    effects.append(
        Cycle(screen, Rainbow(screen, title_text), screen.height // 2 - 5)
    )

    # Beat counter and info
    beat_count = 0
    last_beat_time = 0
    active_explosions = []

    # Color patterns
    color_schemes = [
        [Screen.COLOUR_RED, Screen.COLOUR_YELLOW],
        [Screen.COLOUR_BLUE, Screen.COLOUR_CYAN],
        [Screen.COLOUR_GREEN, Screen.COLOUR_WHITE],
        [Screen.COLOUR_MAGENTA, Screen.COLOUR_YELLOW],
    ]
    current_scheme = 0

    # Create initial scene
    scene = Scene(effects, -1, name="BeatVisualizer")
    scenes = [scene]

    frame = 0
    running = True
    start_time = time.time()

    try:
        while running:
            screen.clear()

            # Check for beats
            beat_triggered = False
            try:
                while not beat_queue.empty():
                    beat = beat_queue.get_nowait()
                    beat_triggered = True
                    beat_count += 1

                    # CRAZY EXPLOSION TIME!
                    intensity = beat['intensity']

                    # Change color scheme every 8 beats
                    if beat_count % 8 == 0:
                        current_scheme = (current_scheme + 1) % len(color_schemes)

                    # Create multiple fireworks
                    num_fireworks = min(int(intensity * 10) + 2, 8)
                    for _ in range(num_fireworks):
                        x = random.randint(5, screen.width - 5)
                        y = random.randint(5, screen.height - 5)

                        firework = CrazyFirework(screen, x, y)
                        for effect in firework.effects:
                            active_explosions.append({
                                'effect': effect,
                                'birth': frame,
                                'lifetime': 40
                            })

                    # Flash screen on strong beats
                    if intensity > 0.7:
                        flash_char = random.choice(['*', '#', '@', '█', '▓', '▒', '░'])
                        flash_color = random.choice(color_schemes[current_scheme])
                        for y in range(0, screen.height, 2):
                            for x in range(0, screen.width, 4):
                                screen.print_at(flash_char, x, y,
                                              colour=flash_color)

                    # Add crazy text on major beats
                    if beat_count % 4 == 0:
                        crazy_texts = ["BOOM!", "BANG!", "WOW!", "CRAZY!", "INSANE!"]
                        text = random.choice(crazy_texts)
                        text_color = random.choice([
                            Screen.COLOUR_RED, Screen.COLOUR_YELLOW,
                            Screen.COLOUR_MAGENTA, Screen.COLOUR_CYAN
                        ])
                        x_pos = random.randint(0, max(0, screen.width - len(text) * 6))
                        y_pos = random.randint(0, max(0, screen.height - 5))

                        figlet = FigletText(text, font='banner')
                        for i, line in enumerate(str(figlet).split('\n')):
                            if y_pos + i < screen.height:
                                screen.print_at(line, x_pos, y_pos + i,
                                              colour=text_color)

            except queue.Empty:
                pass

            # Check amplitude for continuous effects
            try:
                while not amplitude_queue.empty():
                    amp_data = amplitude_queue.get_nowait()
                    amplitude = amp_data['value']

                    # Create sparkles based on amplitude
                    if amplitude > 0.01 and random.random() < amplitude * 2:
                        for _ in range(int(amplitude * 20)):
                            x = random.randint(0, screen.width - 1)
                            y = random.randint(0, screen.height - 1)
                            spark_char = random.choice(['*', '+', '.', '·', '°'])
                            spark_color = random.choice([
                                Screen.COLOUR_WHITE,
                                Screen.COLOUR_YELLOW,
                                Screen.COLOUR_CYAN
                            ])
                            screen.print_at(spark_char, x, y, colour=spark_color)

            except queue.Empty:
                pass

            # Update and render persistent effects
            for effect in effects:
                effect.reset()
                effect._update(frame)

            # Update and render active explosions
            active_explosions = [
                exp for exp in active_explosions
                if frame - exp['birth'] < exp['lifetime']
            ]

            for exp in active_explosions:
                exp['effect'].reset()
                exp['effect']._update(frame)

            # Display info
            elapsed = time.time() - start_time
            info_text = f"Time: {elapsed:.1f}s | Beats: {beat_count} | Tempo: {tempo:.0f} BPM"
            screen.print_at(info_text, 2, screen.height - 2,
                          colour=Screen.COLOUR_WHITE)

            # Display beat flash indicator
            if beat_triggered:
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
                running = False

            frame += 1
            time.sleep(0.03)  # ~30 FPS

    except Exception as e:
        screen.print_at(f"Error: {e}", 0, 0)
        screen.refresh()
        time.sleep(2)

    # Stop music
    pygame.mixer.music.stop()
    pygame.quit()

# Entry point
if __name__ == "__main__":
    audio_file = sys.argv[1] if len(sys.argv) > 1 else "woah-dope8.wav"

    # Check if audio file exists
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
║  Controls: Q or Ctrl+C to quit                             ║
╚══════════════════════════════════════════════════════════════╝
    """)

    time.sleep(1)

    # Run with screen wrapper for proper terminal handling
    try:
        Screen.wrapper(demo)
    except KeyboardInterrupt:
        print("\n👋 Stopped!")
    except Exception as e:
        print(f"Error: {e}")