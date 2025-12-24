/**
 * Music Gallery Web Component
 * Grid display of music cards with filtering and sorting
 */
class MusicGallery extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._compositions = [];
    this._filteredCompositions = [];
    this._currentFilter = '';
    this._currentSort = 'date-desc';
  }

  connectedCallback() {
    this.render();
  }

  set compositions(data) {
    this._compositions = data || [];
    this._filteredCompositions = [...this._compositions];
    this.applyFiltersAndSort();
    this.renderCards();
  }

  get compositions() {
    return this._compositions;
  }

  setFilter(genreFilter) {
    this._currentFilter = genreFilter;
    this.applyFiltersAndSort();
    this.renderCards();
  }

  setSort(sortBy) {
    this._currentSort = sortBy;
    this.applyFiltersAndSort();
    this.renderCards();
  }

  applyFiltersAndSort() {
    let result = [...this._compositions];

    // Filter by genre
    if (this._currentFilter) {
      result = result.filter(c =>
        c.classicalGenre?.toLowerCase().includes(this._currentFilter.toLowerCase()) ||
        c.modernGenre?.toLowerCase().includes(this._currentFilter.toLowerCase()) ||
        c.genre?.toLowerCase().includes(this._currentFilter.toLowerCase())
      );
    }

    // Sort
    switch (this._currentSort) {
      case 'date-desc':
        result.sort((a, b) => new Date(b.timestamp || b.date) - new Date(a.timestamp || a.date));
        break;
      case 'date-asc':
        result.sort((a, b) => new Date(a.timestamp || a.date) - new Date(b.timestamp || b.date));
        break;
      case 'title':
        result.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
    }

    this._filteredCompositions = result;
  }

  render() {
    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }

        .gallery-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
          gap: 1.5rem;
          padding: 1rem 0;
        }

        .empty-state {
          grid-column: 1 / -1;
          text-align: center;
          padding: 4rem 2rem;
          color: var(--text-muted, #606070);
        }

        .empty-state h3 {
          font-size: 1.25rem;
          margin-bottom: 0.5rem;
          color: var(--text-secondary, #a0a0b0);
        }

        .empty-state p {
          font-size: 0.9rem;
        }

        .loading {
          grid-column: 1 / -1;
          display: flex;
          justify-content: center;
          padding: 4rem;
        }

        .loading-spinner {
          width: 48px;
          height: 48px;
          border: 3px solid var(--bg-tertiary, #1a1a24);
          border-top-color: var(--accent-primary, #7c3aed);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .count {
          font-size: 0.9rem;
          color: var(--text-muted, #606070);
          margin-bottom: 1rem;
        }

        @media (max-width: 768px) {
          .gallery-grid {
            grid-template-columns: 1fr;
          }
        }
      </style>

      <div class="count"></div>
      <div class="gallery-grid">
        <div class="loading">
          <div class="loading-spinner"></div>
        </div>
      </div>
    `;
  }

  renderCards() {
    const grid = this.shadowRoot.querySelector('.gallery-grid');
    const countEl = this.shadowRoot.querySelector('.count');

    if (!grid) return;

    // Update count
    if (countEl) {
      const total = this._compositions.length;
      const showing = this._filteredCompositions.length;
      if (total > 0) {
        countEl.textContent = showing === total
          ? `${total} composition${total === 1 ? '' : 's'}`
          : `Showing ${showing} of ${total} compositions`;
      } else {
        countEl.textContent = '';
      }
    }

    // Empty state
    if (this._filteredCompositions.length === 0) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>${this._compositions.length === 0 ? 'No compositions yet' : 'No matches found'}</h3>
          <p>${this._compositions.length === 0
            ? 'Use the publish-composition script to add your first piece.'
            : 'Try adjusting your filter criteria.'}</p>
        </div>
      `;
      return;
    }

    // Render cards
    grid.innerHTML = '';

    this._filteredCompositions.forEach((composition, index) => {
      const card = document.createElement('music-card');
      card.setAttribute('title', composition.title || 'Untitled');
      card.setAttribute('classical-genre', composition.classicalGenre || '');
      card.setAttribute('modern-genre', composition.modernGenre || '');
      card.setAttribute('date', composition.timestamp || composition.date || '');
      card.setAttribute('media-src', composition.mediaSrc || '');
      card.setAttribute('key', composition.key || '');
      card.setAttribute('tempo', composition.tempo || '');
      card.setAttribute('instruments', composition.instruments || '');
      card.dataset.index = index;

      // Store full composition data
      card._compositionData = composition;

      grid.appendChild(card);
    });
  }

  getCompositionByIndex(index) {
    return this._filteredCompositions[index];
  }
}

customElements.define('music-gallery', MusicGallery);

export default MusicGallery;
