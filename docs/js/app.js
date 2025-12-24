/**
 * MEDIOCRE-MUSIC Site - Main Application
 */

import './components/music-card.js';
import './components/music-player.js';
import './components/music-gallery.js';

class App {
  constructor() {
    this.gallery = document.getElementById('gallery');
    this.modal = document.getElementById('composition-modal');
    this.modalPlayer = document.getElementById('modal-player');
    this.modalDetails = document.getElementById('modal-details');
    this.genreFilter = document.getElementById('genre-filter');
    this.sortBy = document.getElementById('sort-by');

    this.compositions = [];
    this.genres = new Set();

    this.init();
  }

  async init() {
    await this.loadCompositions();
    this.populateGenreFilter();
    this.setupEventListeners();
  }

  async loadCompositions() {
    try {
      const response = await fetch('data/compositions.json');
      if (!response.ok) {
        throw new Error('Failed to load compositions');
      }
      this.compositions = await response.json();

      // Extract unique genres
      this.compositions.forEach(c => {
        if (c.classicalGenre) this.genres.add(c.classicalGenre);
        if (c.modernGenre) this.genres.add(c.modernGenre);
      });

      // Update gallery
      if (this.gallery) {
        this.gallery.compositions = this.compositions;
      }
    } catch (error) {
      console.error('Error loading compositions:', error);
      // Show empty state
      if (this.gallery) {
        this.gallery.compositions = [];
      }
    }
  }

  populateGenreFilter() {
    if (!this.genreFilter) return;

    const sortedGenres = [...this.genres].sort();
    sortedGenres.forEach(genre => {
      const option = document.createElement('option');
      option.value = genre;
      option.textContent = genre;
      this.genreFilter.appendChild(option);
    });
  }

  setupEventListeners() {
    // Filter change
    if (this.genreFilter) {
      this.genreFilter.addEventListener('change', (e) => {
        if (this.gallery) {
          this.gallery.setFilter(e.target.value);
        }
      });
    }

    // Sort change
    if (this.sortBy) {
      this.sortBy.addEventListener('change', (e) => {
        if (this.gallery) {
          this.gallery.setSort(e.target.value);
        }
      });
    }

    // Card clicks
    document.addEventListener('card-click', (e) => {
      this.openModal(e.detail);
    });

    // Modal close
    if (this.modal) {
      const closeBtn = this.modal.querySelector('.modal-close');
      const backdrop = this.modal.querySelector('.modal-backdrop');

      if (closeBtn) {
        closeBtn.addEventListener('click', () => this.closeModal());
      }

      if (backdrop) {
        backdrop.addEventListener('click', () => this.closeModal());
      }

      // Escape key
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && !this.modal.hidden) {
          this.closeModal();
        }
      });
    }
  }

  openModal(compositionData) {
    if (!this.modal || !compositionData) return;

    // Find full composition data
    const fullData = this.compositions.find(c =>
      c.title === compositionData.title ||
      c.mediaSrc === compositionData.mediaSrc
    ) || compositionData;

    // Set player source
    if (this.modalPlayer && fullData.mediaSrc) {
      this.modalPlayer.setAttribute('src', fullData.mediaSrc);
      this.modalPlayer.setAttribute('title', fullData.title || 'Now Playing');
    }

    // Render details
    if (this.modalDetails) {
      this.modalDetails.innerHTML = this.renderDetails(fullData);
    }

    // Show modal
    this.modal.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  closeModal() {
    if (!this.modal) return;

    // Stop player
    if (this.modalPlayer) {
      this.modalPlayer.pause();
    }

    // Hide modal
    this.modal.hidden = true;
    document.body.style.overflow = '';
  }

  /**
   * Parse markdown to terminal-styled HTML
   */
  parseMarkdown(text) {
    if (!text) return '';

    let html = text;

    // Escape HTML first
    html = html.replace(/&/g, '&amp;')
               .replace(/</g, '&lt;')
               .replace(/>/g, '&gt;');

    // Code blocks (``` ... ```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<div class="term-codeblock"><span class="term-lang">${lang || 'code'}</span><pre>${code.trim()}</pre></div>`;
    });

    // Inline code (`code`)
    html = html.replace(/`([^`]+)`/g, '<code class="term-inline">$1</code>');

    // Headers
    html = html.replace(/^### (.+)$/gm, '<h3 class="term-h3">$1</h3>');
    html = html.replace(/^## (.+)$/gm, '<h2 class="term-h2-parsed">$1</h2>');
    html = html.replace(/^# (.+)$/gm, '<h1 class="term-h1-parsed">$1</h1>');

    // Bold and italic
    html = html.replace(/\*\*\*(.+?)\*\*\*/g, '<strong class="term-bold"><em>$1</em></strong>');
    html = html.replace(/\*\*(.+?)\*\*/g, '<strong class="term-bold">$1</strong>');
    html = html.replace(/\*(.+?)\*/g, '<em class="term-italic">$1</em>');
    html = html.replace(/_(.+?)_/g, '<em class="term-italic">$1</em>');

    // Blockquotes
    html = html.replace(/^&gt; (.+)$/gm, '<blockquote class="term-blockquote">$1</blockquote>');

    // Horizontal rules
    html = html.replace(/^[-*_]{3,}$/gm, '<hr class="term-rule">');

    // Unordered lists
    html = html.replace(/^[\-\*] (.+)$/gm, '<li class="term-li">$1</li>');
    html = html.replace(/(<li class="term-li">.*<\/li>\n?)+/g, '<ul class="term-ul">$&</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li class="term-li-num">$1</li>');
    html = html.replace(/(<li class="term-li-num">.*<\/li>\n?)+/g, '<ol class="term-ol">$&</ol>');

    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" class="term-link" target="_blank">$1</a>');

    // Line breaks - convert double newlines to paragraph breaks
    html = html.replace(/\n\n+/g, '</p><p class="term-p">');
    html = `<p class="term-p">${html}</p>`;

    // Clean up empty paragraphs
    html = html.replace(/<p class="term-p"><\/p>/g, '');
    html = html.replace(/<p class="term-p">(<[huo])/g, '$1');
    html = html.replace(/(<\/[huo][l1-3]>)<\/p>/g, '$1');

    return html;
  }

  renderDetails(data) {
    const formatDate = (dateStr) => {
      if (!dateStr) return 'Unknown';
      return new Date(dateStr).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    };

    const escapeHtml = (text) => {
      if (!text) return '';
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    };

    const genreDisplay = data.genre || `${data.classicalGenre || ''} × ${data.modernGenre || ''}`;

    const metaItems = [
      { label: 'Genre', value: genreDisplay },
      { label: 'Key', value: data.key },
      { label: 'Tempo', value: data.tempo ? `${data.tempo} BPM` : null },
      { label: 'Meter', value: data.meter },
      { label: 'Composed', value: formatDate(data.timestamp || data.date) },
      { label: 'Instruments', value: data.instruments },
      { label: 'Style', value: data.style },
    ].filter(item => item.value);

    return `
      <div class="term-content">
        <div class="term-h1">${escapeHtml(data.title || 'Untitled Composition')}</div>

        ${data.classicalGenre || data.modernGenre ? `
          <div class="term-badges">
            ${data.classicalGenre ? `<span class="term-badge genre-classical">${escapeHtml(data.classicalGenre)}</span>` : ''}
            ${data.modernGenre ? `<span class="term-badge genre-modern">${escapeHtml(data.modernGenre)}</span>` : ''}
          </div>
        ` : ''}

        <div class="term-section">
          <div class="term-section-header">METADATA</div>
          <table class="term-table">
            ${metaItems.map(item => `
              <tr>
                <td>${item.label}</td>
                <td>${escapeHtml(String(item.value))}</td>
              </tr>
            `).join('')}
          </table>
        </div>

        ${data.prompt ? `
          <div class="term-section">
            <div class="term-section-header">PROMPT</div>
            <div class="term-content-block term-prompt">${this.parseMarkdown(data.prompt)}</div>
          </div>
        ` : ''}

        ${data.analysis ? `
          <div class="term-section">
            <div class="term-section-header">ANALYSIS</div>
            <div class="term-content-block">${this.parseMarkdown(data.analysis)}</div>
          </div>
        ` : ''}

        ${data.timidityCfg ? `
          <div class="term-section">
            <div class="term-section-header">TIMIDITY CONFIG</div>
            <div class="term-codeblock"><pre>${escapeHtml(data.timidityCfg)}</pre></div>
          </div>
        ` : ''}

        ${data.pdfSrc ? `
          <div class="term-section term-score-section">
            <div class="term-section-header">SCORE</div>
            <div class="term-score-container">
              <a href="${data.pdfSrc}" target="_blank" class="term-score-link">
                <span class="term-score-icon">♫</span>
                <span class="term-score-text">
                  <span class="term-score-title">Download Sheet Music</span>
                  <span class="term-score-subtitle">PDF Score • Print-Ready</span>
                </span>
                <span class="term-score-arrow">→</span>
              </a>
              <div class="term-score-preview">
                <object data="${data.pdfSrc}" type="application/pdf" class="term-pdf-embed">
                  <p class="term-pdf-fallback">PDF preview not supported. <a href="${data.pdfSrc}" target="_blank">Download PDF</a></p>
                </object>
              </div>
            </div>
          </div>
        ` : ''}

        <div class="term-footer">
          <span class="term-cursor">█</span> END OF FILE
        </div>
      </div>
    `;
  }
}

// Initialize app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
