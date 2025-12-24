/**
 * Music Player Web Component
 * Audio/video player for WebM files with custom controls
 * TRIANGULAR WEIRD EDITION
 */
class MusicPlayer extends HTMLElement {
  static get observedAttributes() {
    return ['src', 'title'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._isPlaying = false;
    this._duration = 0;
    this._currentTime = 0;
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  disconnectedCallback() {
    const video = this.shadowRoot.querySelector('video');
    if (video) {
      video.pause();
    }
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.shadowRoot) {
      if (name === 'src') {
        const video = this.shadowRoot.querySelector('video');
        if (video) {
          video.src = newValue;
          video.load();
        }
      } else if (name === 'title') {
        const titleEl = this.shadowRoot.querySelector('.player-title');
        if (titleEl) {
          titleEl.textContent = newValue;
        }
      }
    }
  }

  get src() {
    return this.getAttribute('src') || '';
  }

  set src(value) {
    this.setAttribute('src', value);
  }

  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  render() {
    const title = this.getAttribute('title') || 'Now Playing';
    const src = this.getAttribute('src') || '';

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .player {
          background: linear-gradient(135deg, #0f0f1a 0%, #141420 100%);
          padding: 1.5rem;
          position: relative;
          clip-path: polygon(15px 0, 100% 0, 100% calc(100% - 15px), calc(100% - 15px) 100%, 0 100%, 0 15px);
        }

        .player::before {
          content: '';
          position: absolute;
          top: 0;
          left: 0;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 15px 15px 0 0;
          border-color: #00f0ff transparent transparent transparent;
          opacity: 0.5;
        }

        .player::after {
          content: '';
          position: absolute;
          bottom: 0;
          right: 0;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 0 15px 15px;
          border-color: transparent transparent #ff2d6a transparent;
          opacity: 0.5;
        }

        .player-title {
          font-size: 1.25rem;
          font-weight: 700;
          margin-bottom: 1.25rem;
          color: #f0f0ff;
          position: relative;
          padding-left: 1rem;
        }

        .player-title::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0;
          bottom: 0;
          width: 4px;
          background: linear-gradient(180deg, #ff2d6a, #b347ff);
          clip-path: polygon(0 0, 100% 15%, 100% 85%, 0 100%);
        }

        video {
          width: 100%;
          display: none;
        }

        .waveform-placeholder {
          height: 100px;
          background:
            linear-gradient(135deg, rgba(255, 45, 106, 0.1) 0%, transparent 50%),
            linear-gradient(225deg, rgba(0, 240, 255, 0.1) 0%, transparent 50%),
            linear-gradient(90deg,
              #0a0a12 0%,
              #ff2d6a 25%,
              #b347ff 50%,
              #00f0ff 75%,
              #0a0a12 100%);
          background-size: 100% 100%, 100% 100%, 300% 100%;
          margin-bottom: 1.25rem;
          animation: wave-flow 3s linear infinite;
          clip-path: polygon(
            0 50%, 5% 30%, 10% 60%, 15% 20%, 20% 70%, 25% 40%, 30% 80%,
            35% 25%, 40% 65%, 45% 35%, 50% 75%, 55% 30%, 60% 60%,
            65% 20%, 70% 70%, 75% 40%, 80% 80%, 85% 25%, 90% 65%, 95% 35%, 100% 50%,
            100% 100%, 0 100%
          );
          position: relative;
        }

        .waveform-placeholder.playing {
          animation: wave-flow 1.5s linear infinite, wave-pulse 0.5s ease-in-out infinite;
        }

        @keyframes wave-flow {
          0% { background-position: 0 0, 0 0, 0% 0; }
          100% { background-position: 0 0, 0 0, 300% 0; }
        }

        @keyframes wave-pulse {
          0%, 100% { opacity: 0.8; }
          50% { opacity: 1; }
        }

        .controls {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .play-button {
          width: 56px;
          height: 56px;
          background: linear-gradient(135deg, #ff2d6a 0%, #b347ff 100%);
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
          flex-shrink: 0;
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          box-shadow: 0 0 30px rgba(255, 45, 106, 0.3);
        }

        .play-button:hover {
          transform: scale(1.1) rotate(15deg);
          box-shadow:
            0 0 40px rgba(255, 45, 106, 0.5),
            0 0 60px rgba(179, 71, 255, 0.3);
        }

        .play-button svg {
          width: 22px;
          height: 22px;
          fill: white;
          filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.5));
        }

        .play-button .play-icon {
          margin-left: 3px;
        }

        .play-button .pause-icon {
          display: none;
        }

        .play-button.playing .play-icon {
          display: none;
        }

        .play-button.playing .pause-icon {
          display: block;
        }

        .progress-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .progress-bar {
          width: 100%;
          height: 8px;
          background: #0a0a12;
          cursor: pointer;
          position: relative;
          overflow: hidden;
          clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
        }

        .progress-fill {
          height: 100%;
          background: linear-gradient(90deg, #ff2d6a, #b347ff, #00f0ff);
          width: 0%;
          transition: width 100ms linear;
          position: relative;
        }

        .progress-fill::after {
          content: '';
          position: absolute;
          right: 0;
          top: -4px;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 8px 0 8px 8px;
          border-color: transparent transparent transparent #00f0ff;
        }

        .time-display {
          display: flex;
          justify-content: space-between;
          font-size: 0.75rem;
          font-family: 'JetBrains Mono', monospace;
          color: #505070;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }

        .volume-control {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .volume-icon {
          width: 22px;
          height: 22px;
          fill: #9090b0;
          cursor: pointer;
          transition: fill 300ms ease;
        }

        .volume-icon:hover {
          fill: #00f0ff;
        }

        .volume-slider {
          width: 80px;
          height: 6px;
          -webkit-appearance: none;
          appearance: none;
          background: #0a0a12;
          cursor: pointer;
          clip-path: polygon(3px 0, 100% 0, calc(100% - 3px) 100%, 0 100%);
        }

        .volume-slider::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px;
          height: 14px;
          background: linear-gradient(135deg, #00f0ff, #b347ff);
          cursor: pointer;
          clip-path: polygon(50% 0%, 100% 50%, 50% 100%, 0% 50%);
          box-shadow: 0 0 10px rgba(0, 240, 255, 0.5);
        }

        .error-message {
          color: #ff2d6a;
          font-size: 0.9rem;
          text-align: center;
          padding: 1rem;
          display: none;
          font-family: 'JetBrains Mono', monospace;
        }

        .error-message.visible {
          display: block;
        }
      </style>

      <div class="player">
        <h4 class="player-title">${this.escapeHtml(title)}</h4>

        <video preload="metadata">
          <source src="${src}" type="video/webm">
        </video>

        <div class="waveform-placeholder"></div>

        <div class="error-message"></div>

        <div class="controls">
          <button class="play-button" aria-label="Play">
            <svg class="play-icon" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
            <svg class="pause-icon" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
            </svg>
          </button>

          <div class="progress-container">
            <div class="progress-bar">
              <div class="progress-fill"></div>
            </div>
            <div class="time-display">
              <span class="current-time">0:00</span>
              <span class="total-time">0:00</span>
            </div>
          </div>

          <div class="volume-control">
            <svg class="volume-icon" viewBox="0 0 24 24">
              <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z"/>
            </svg>
            <input type="range" class="volume-slider" min="0" max="100" value="80">
          </div>
        </div>
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setupEventListeners() {
    const video = this.shadowRoot.querySelector('video');
    const playButton = this.shadowRoot.querySelector('.play-button');
    const progressBar = this.shadowRoot.querySelector('.progress-bar');
    const progressFill = this.shadowRoot.querySelector('.progress-fill');
    const currentTimeEl = this.shadowRoot.querySelector('.current-time');
    const totalTimeEl = this.shadowRoot.querySelector('.total-time');
    const volumeSlider = this.shadowRoot.querySelector('.volume-slider');
    const waveform = this.shadowRoot.querySelector('.waveform-placeholder');
    const errorMessage = this.shadowRoot.querySelector('.error-message');

    if (!video) return;

    // Set initial volume
    video.volume = 0.8;

    // Play/Pause
    playButton.addEventListener('click', () => {
      if (video.paused) {
        video.play();
      } else {
        video.pause();
      }
    });

    video.addEventListener('play', () => {
      playButton.classList.add('playing');
      waveform.classList.add('playing');
      this._isPlaying = true;
    });

    video.addEventListener('pause', () => {
      playButton.classList.remove('playing');
      waveform.classList.remove('playing');
      this._isPlaying = false;
    });

    video.addEventListener('ended', () => {
      playButton.classList.remove('playing');
      waveform.classList.remove('playing');
      this._isPlaying = false;
    });

    // Time update
    video.addEventListener('timeupdate', () => {
      const progress = (video.currentTime / video.duration) * 100;
      progressFill.style.width = `${progress}%`;
      currentTimeEl.textContent = this.formatTime(video.currentTime);
      this._currentTime = video.currentTime;
    });

    video.addEventListener('loadedmetadata', () => {
      totalTimeEl.textContent = this.formatTime(video.duration);
      this._duration = video.duration;
    });

    // Seek
    progressBar.addEventListener('click', (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = (e.clientX - rect.left) / rect.width;
      video.currentTime = percent * video.duration;
    });

    // Volume
    volumeSlider.addEventListener('input', (e) => {
      video.volume = e.target.value / 100;
    });

    // Error handling
    video.addEventListener('error', () => {
      errorMessage.textContent = 'Unable to load audio file';
      errorMessage.classList.add('visible');
    });
  }

  play() {
    const video = this.shadowRoot.querySelector('video');
    if (video) video.play();
  }

  pause() {
    const video = this.shadowRoot.querySelector('video');
    if (video) video.pause();
  }
}

customElements.define('music-player', MusicPlayer);

export default MusicPlayer;
