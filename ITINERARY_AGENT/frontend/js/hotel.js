/**
 * hotel.js — Hotel card rendering, day-by-day selection, and pre-book UI.
 */

const Hotel = (() => {
  let _hotels      = [];             // full hotel list
  let _numDays     = 1;              // total trip nights
  let _currentDay  = 1;             // currently active day tab
  let _selections  = {};            // { "1": hotelObj, "2": hotelObj, … }
  let _onDayFull   = null;          // callback when all days are selected
  let _onSelect    = null;          // callback(hotel, dayNumber)

  // ─── Public: render ───────────────────────────────────────────────────────

  /**
   * Render hotel cards and day tabs.
   * @param {Array}    hotels    - hotel objects from API
   * @param {number}   numDays   - how many nights to book
   * @param {Function} onSelect  - called when a hotel is chosen for a day
   * @param {Function} onAllDone - called when every day has a hotel
   */
  function render(hotels, numDays, onSelect, onAllDone) {
    _hotels     = hotels || [];
    _numDays    = numDays || 1;
    _selections = {};
    _onSelect   = onSelect;
    _onDayFull  = onAllDone;
    _currentDay = 1;

    _renderDayTabs();
    _renderCards(_hotels);
    _bindSortButtons();
    _updateSelectionInfo();
    _updateSummary();
  }

  // ─── Day tabs ─────────────────────────────────────────────────────────────

  function _renderDayTabs() {
    const container = document.getElementById('day-tabs');
    if (!container) return;
    container.innerHTML = '';
    for (let d = 1; d <= _numDays; d++) {
      const tab = document.createElement('button');
      tab.className = `day-tab${d === _currentDay ? ' active' : ''}${_selections[d] ? ' done' : ''}`;
      tab.dataset.day = d;
      tab.textContent = `Night ${d}${_selections[d] ? ' ✓' : ''}`;
      tab.addEventListener('click', () => {
        _currentDay = d;
        _updateDayTabs();
        _updateSelectionInfo();
      });
      container.appendChild(tab);
    }
  }

  function _updateDayTabs() {
    document.querySelectorAll('.day-tab').forEach(t => {
      const d = parseInt(t.dataset.day);
      t.className = `day-tab${d === _currentDay ? ' active' : ''}${_selections[d] ? ' done' : ''}`;
      t.textContent = `Night ${d}${_selections[d] ? ' ✓' : ''}`;
    });
  }

  function _updateSelectionInfo() {
    const el = document.getElementById('hotel-selection-info');
    if (!el) return;
    const sel = _selections[_currentDay];
    if (sel) {
      el.innerHTML = `Night ${_currentDay}: <strong style="color:var(--clr-success)">✅ ${_esc(sel.name)}</strong> — change below if needed.`;
    } else {
      el.textContent = `Select a hotel for Night ${_currentDay}:`;
    }
  }

  // ─── Cards ────────────────────────────────────────────────────────────────

  function _renderCards(list) {
    const container = document.getElementById('hotel-cards');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🏨</div>
          <h3>No hotels found</h3>
          <p>Try adjusting your filters.</p>
        </div>`;
      return;
    }

    container.innerHTML = list.map((h, i) => _hotelCardHTML(h, i)).join('');

    container.querySelectorAll('.btn-select-hotel').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _handleSelect(btn.dataset.hotelId);
      });
    });

    container.querySelectorAll('.hotel-card').forEach(card => {
      card.addEventListener('click', () => _handleSelect(card.dataset.hotelId));
    });
  }

  function _hotelCardHTML(h, idx) {
    const stars    = '⭐'.repeat(Math.round(h.rating));
    const dist     = `📍 ${h.distance_from_center_km} km from centre`;
    const amenList = (h.amenities || []).slice(0, 5)
                       .map(a => `<span class="amenity-chip">${_esc(a)}</span>`).join('');
    const isSelected = _selections[_currentDay]?.hotel_id === h.hotel_id;
    const badge    = idx === 0 ? `<div class="flight-card-badge value">🏆 Top Pick</div>` : '';

    return `
      <div class="hotel-card${isSelected ? ' selected' : ''}" data-hotel-id="${h.hotel_id}">
        ${badge}
        <div class="hotel-thumb">🏨</div>
        <div class="hotel-name">${_esc(h.name)}</div>
        <div class="hotel-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num">${h.rating} / 5</span>
        </div>
        <div class="hotel-address">📍 ${_esc(h.address)}</div>
        <div class="hotel-distance">${dist}</div>
        <div class="hotel-amenities">${amenList}</div>
        <div class="hotel-price">
          <div>
            <div class="hotel-price-amount">&#8377;${_fmt(h.price_per_night)}</div>
            <div class="hotel-price-label">per night · ${_esc(h.room_type)}</div>
          </div>
          <button class="btn btn-secondary btn-sm btn-select-hotel" data-hotel-id="${h.hotel_id}">
            ${isSelected ? '✓ Selected' : 'Select'}
          </button>
        </div>
      </div>`;
  }

  // ─── Selection logic ──────────────────────────────────────────────────────

  function _handleSelect(hotelId) {
    const hotel = _hotels.find(h => h.hotel_id === hotelId);
    if (!hotel) return;

    _selections[_currentDay] = hotel;

    // Advance to next unselected day
    const nextDay = _findNextUnselectedDay();
    if (nextDay) {
      _currentDay = nextDay;
    }

    _renderDayTabs();
    _renderCards(_hotels);
    _updateSelectionInfo();
    _updateSummary();

    if (_onSelect) _onSelect(hotel, _currentDay);

    // Check if all days are selected
    const allDone = Object.keys(_selections).length >= _numDays;
    if (allDone && _onDayFull) _onDayFull(_selections);
  }

  function _findNextUnselectedDay() {
    for (let d = 1; d <= _numDays; d++) {
      if (!_selections[d]) return d;
    }
    return null;
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  function _updateSummary() {
    const summaryEl = document.getElementById('selected-hotels-summary');
    const listEl    = document.getElementById('selected-hotels-list');
    if (!summaryEl || !listEl) return;

    if (!Object.keys(_selections).length) {
      summaryEl.style.display = 'none';
      return;
    }

    summaryEl.style.display = 'block';
    listEl.innerHTML = Object.entries(_selections)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([day, h]) => `
        <div class="selected-hotel-row">
          <span class="selected-hotel-night">Night ${day}</span>
          <span class="selected-hotel-name">${_esc(h.name)}</span>
          <span class="selected-hotel-price">&#8377;${_fmt(h.price_per_night)}/night</span>
        </div>`).join('');

    const prebookBtn = document.getElementById('btn-prebook-hotels');
    if (prebookBtn) {
      prebookBtn.style.display =
        Object.keys(_selections).length >= _numDays ? 'block' : 'none';
    }
  }

  // ─── Sort buttons ─────────────────────────────────────────────────────────

  function _bindSortButtons() {
    const byRating = document.getElementById('btn-sort-hotel-rating');
    const byPrice  = document.getElementById('btn-sort-hotel-price');
    const byValue  = document.getElementById('btn-sort-hotel-value');

    byRating?.addEventListener('click', () => {
      _setActive(byRating, [byRating, byPrice, byValue]);
      _renderCards([..._hotels].sort((a, b) => b.rating - a.rating));
    });
    byPrice?.addEventListener('click', () => {
      _setActive(byPrice, [byRating, byPrice, byValue]);
      _renderCards([..._hotels].sort((a, b) => a.price_per_night - b.price_per_night));
    });
    byValue?.addEventListener('click', () => {
      _setActive(byValue, [byRating, byPrice, byValue]);
      _renderCards([..._hotels].sort((a, b) => (b.ranking_score || 0) - (a.ranking_score || 0)));
    });
  }

  function _setActive(active, all) {
    all.forEach(b => b && b.classList.remove('btn-active'));
    active && active.classList.add('btn-active');
  }

  // ─── Modal: bulk confirm ──────────────────────────────────────────────────

  /**
   * Open hotel bulk-confirm modal.
   * @param {object}   selections  - { "1": hotelObj, … }
   * @param {Function} onConfirm   - called with selections when confirmed
   */
  function openConfirmModal(selections, onConfirm) {
    const modal = document.getElementById('modal-hotel-confirm');
    const body  = document.getElementById('modal-hotel-body');
    const btnOk = document.getElementById('btn-confirm-prebook-hotels');
    const btnCx = document.getElementById('btn-cancel-hotel');
    const btnCl = document.getElementById('btn-close-hotel-modal');
    if (!modal || !body) return;

    const rows = Object.entries(selections)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([day, h]) => `
        <tr>
          <td>Night ${day}</td>
          <td><strong>${_esc(h.name)}</strong></td>
          <td>&#8377;${_fmt(h.price_per_night)}/night</td>
        </tr>`).join('');

    body.innerHTML = `
      <p style="margin-bottom:.75rem">You are about to pre-book the following hotels:</p>
      <table class="detail-table">
        <tr style="font-weight:700"><td>Night</td><td>Hotel</td><td>Price</td></tr>
        ${rows}
      </table>`;

    const close = () => modal.classList.remove('open');
    btnCl && btnCl.addEventListener('click', close, { once: true });
    btnCx && btnCx.addEventListener('click', close, { once: true });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });

    btnOk && (btnOk.onclick = () => {
      close();
      if (onConfirm) onConfirm(selections);
    });

    modal.classList.add('open');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _fmt(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  /** Expose current selections for app.js to read. */
  function getSelections() { return { ..._selections }; }

  return { render, openConfirmModal, getSelections };
})();
