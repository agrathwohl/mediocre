/**
 * Music Card Web Component
 * Displays a composition card with title, genre info, and play button
 * TRIANGULAR WEIRD EDITION
 */
class MusicCard extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'classical-genre', 'modern-genre', 'date', 'media-src'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() {
    this.render();
    this.setupEventListeners();
  }

  attributeChangedCallback() {
    if (this.shadowRoot) {
      this.render();
      this.setupEventListeners();
    }
  }

  get compositionData() {
    return {
      title: this.getAttribute('title') || 'Untitled',
      classicalGenre: this.getAttribute('classical-genre') || '',
      modernGenre: this.getAttribute('modern-genre') || '',
      date: this.getAttribute('date') || '',
      mediaSrc: this.getAttribute('media-src') || '',
      key: this.getAttribute('key') || '',
      tempo: this.getAttribute('tempo') || '',
      instruments: this.getAttribute('instruments') || ''
    };
  }

  formatDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  render() {
    const data = this.compositionData;
    const formattedDate = this.formatDate(data.date);

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .card {
          background: linear-gradient(135deg, #0c0c14 0%, #0f0f1a 100%);
          border: 1px solid #1a1a2e;
          padding: 1.5rem;
          cursor: pointer;
          transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
          position: relative;
          overflow: hidden;
          clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
        }

        .card::before {
          content: '';
          position: absolute;
          top: 0;
          right: 0;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 0 20px 20px 0;
          border-color: transparent #ff2d6a transparent transparent;
          opacity: 0.6;
          transition: opacity 300ms ease;
        }

        .card::after {
          content: '';
          position: absolute;
          bottom: 0;
          left: 0;
          width: 0;
          height: 0;
          border-style: solid;
          border-width: 20px 0 0 20px;
          border-color: transparent transparent transparent #00f0ff;
          opacity: 0.3;
          transition: opacity 300ms ease;
        }

        .card:hover {
          background: linear-gradient(135deg, #141420 0%, #1a1a28 100%);
          border-color: #2a2a44;
          transform: translateY(-4px) skewX(-1deg);
          box-shadow:
            0 10px 40px rgba(255, 45, 106, 0.15),
            0 0 60px rgba(0, 240, 255, 0.1);
        }

        .card:hover::before {
          opacity: 1;
        }

        .card:hover::after {
          opacity: 0.6;
        }

        .card:hover .play-overlay {
          opacity: 1;
        }

        .play-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: linear-gradient(135deg, rgba(255, 45, 106, 0.1) 0%, rgba(0, 240, 255, 0.05) 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          transition: opacity 300ms ease;
        }

        .play-icon {
          width: 60px;
          height: 60px;
          background: linear-gradient(135deg, #ff2d6a 0%, #b347ff 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow:
            0 4px 20px rgba(255, 45, 106, 0.5),
            0 0 40px rgba(179, 71, 255, 0.3);
          clip-path: polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%);
          animation: pulse-hex 2s ease-in-out infinite;
        }

        @keyframes pulse-hex {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.05); }
        }

        .play-icon svg {
          width: 24px;
          height: 24px;
          fill: white;
          margin-left: 3px;
          filter: drop-shadow(0 0 5px rgba(255, 255, 255, 0.5));
        }

        .title {
          font-size: 1.15rem;
          font-weight: 700;
          margin-bottom: 0.75rem;
          color: #f0f0ff;
          line-height: 1.3;
          position: relative;
          padding-left: 0.75rem;
        }

        .title::before {
          content: '';
          position: absolute;
          left: 0;
          top: 0.2em;
          bottom: 0.2em;
          width: 3px;
          background: linear-gradient(180deg, #ff2d6a, #00f0ff);
          clip-path: polygon(0 0, 100% 20%, 100% 80%, 0 100%);
        }

        .genres {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-bottom: 0.75rem;
        }

        .genre-tag {
          display: inline-flex;
          padding: 0.3rem 0.75rem;
          font-size: 0.65rem;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
          position: relative;
        }

        .genre-tag.classical {
          background: linear-gradient(135deg, rgba(255, 170, 0, 0.25), rgba(255, 170, 0, 0.1));
          color: #ffaa00;
          border-left: 2px solid #ffaa00;
        }

        .genre-tag.modern {
          background: linear-gradient(135deg, rgba(0, 240, 255, 0.25), rgba(0, 240, 255, 0.1));
          color: #00f0ff;
          border-left: 2px solid #00f0ff;
        }

        .meta {
          display: flex;
          gap: 1rem;
          font-size: 0.8rem;
          color: #9090b0;
          font-family: 'JetBrains Mono', monospace;
          margin-top: 0.5rem;
        }

        .meta-item {
          display: flex;
          align-items: center;
          gap: 0.25rem;
          padding: 0.2rem 0.5rem;
          background: rgba(255, 255, 255, 0.03);
          clip-path: polygon(4px 0, 100% 0, calc(100% - 4px) 100%, 0 100%);
        }

        .date {
          margin-top: 0.75rem;
          font-size: 0.7rem;
          color: #505070;
          font-family: 'JetBrains Mono', monospace;
          text-transform: uppercase;
          letter-spacing: 0.1em;
        }
      </style>

      <div class="card" role="button" tabindex="0">
        <div class="play-overlay">
          <div class="play-icon">
            <svg viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </div>
        </div>

        <h3 class="title">${this.escapeHtml(data.title)}</h3>

        <div class="genres">
          ${data.classicalGenre ? `<span class="genre-tag classical">${this.escapeHtml(data.classicalGenre)}</span>` : ''}
          ${data.modernGenre ? `<span class="genre-tag modern">${this.escapeHtml(data.modernGenre)}</span>` : ''}
        </div>

        ${data.key || data.tempo ? `
          <div class="meta">
            ${data.key ? `<span class="meta-item">${this.escapeHtml(data.key)}</span>` : ''}
            ${data.tempo ? `<span class="meta-item">${this.escapeHtml(data.tempo)} BPM</span>` : ''}
          </div>
        ` : ''}

        ${formattedDate ? `<div class="date">${formattedDate}</div>` : ''}
      </div>
    `;
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  setupEventListeners() {
    const card = this.shadowRoot.querySelector('.card');
    if (card) {
      card.addEventListener('click', () => this.handleClick());
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          this.handleClick();
        }
      });
    }
  }

  handleClick() {
    this.dispatchEvent(new CustomEvent('card-click', {
      bubbles: true,
      composed: true,
      detail: this.compositionData
    }));
  }
}

customElements.define('music-card', MusicCard);

export default MusicCard;
