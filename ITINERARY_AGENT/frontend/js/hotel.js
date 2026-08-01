/**
 * hotel.js — Per-night hotel flow: hotel cards → room-offer cards → summary.
 */

const Hotel = (() => {
  let _hotels      = [];             // current night's hotel list
  let _numDays     = 1;              // total trip nights
  let _currentDay  = 1;              // current night being worked on
  let _selections  = {};             // { night: selectionObj, … } (server truth)
  let _onSelect    = null;           // callback(hotel) when a hotel is picked
  let _onRoomSelect = null;          // callback(offer, idx1based) when an offer is picked
  let _offers      = [];             // room offers for the picked hotel
  let _offerHotel  = null;           // hotel the offers belong to

  // ─── Public: render ───────────────────────────────────────────────────────

  /**
   * Render hotel cards + day tabs for the CURRENT night.
   * @param {Array}  hotels           - hotel objects from API (current night)
   * @param {number} numDays          - total nights
   * @param {number} currentNight     - night being worked on
   * @param {Array}  serverSelections - completed night selections [{night, hotel_name, …}]
   * @param {Function} onSelect       - called when a hotel is chosen
   */
  function render(hotels, numDays, currentNight, serverSelections, onSelect) {
    _hotels      = hotels || [];
    _numDays     = numDays || 1;
    _currentDay  = currentNight || 1;
    _onSelect    = onSelect;
    _onRoomSelect = null;
    _offers      = [];
    _offerHotel  = null;

    _selections = {};
    (serverSelections || []).forEach(s => { _selections[s.night] = s; });

    _renderDayTabs();
    _renderCards(_hotels);
    _bindSortButtons();
    _updateSelectionInfo();
    _updateSummary();
  }

  /**
   * Switch the card area to room-offer cards for the picked hotel.
   * @param {Array}  offers       - [{offer_id, room_type, board_name, price_per_night, total_price, currency, refundable, cancel_policy}]
   * @param {number} night        - night these offers belong to
   * @param {object} hotel        - the selected hotel
   * @param {Function} onRoomSelect - called with (offer, idx1based)
   */
  function showRoomOffers(offers, night, hotel, onRoomSelect) {
    _offers       = offers || [];
    _offerHotel   = hotel || null;
    _onRoomSelect = onRoomSelect || null;
    _currentDay   = night || _currentDay;

    _renderDayTabs();
    _renderOfferCards();
    _updateSelectionInfo();
  }

  /**
   * Show the combined summary panel + confirm modal.
   * @param {Array}  selections  - [{night, hotel_name, room_type, total_price, …}]
   * @param {number} grandTotal  - sum of all nights
   * @param {Function} onConfirm - called when the user confirms
   */
  function showSummary(selections, grandTotal, onConfirm) {
    _selections = {};
    (selections || []).forEach(s => { _selections[s.night] = s; });
    _renderDayTabs();
    _renderCards([]);
    _updateSelectionInfo();
    _updateSummary();
    openConfirmModal(selections || [], grandTotal, onConfirm);
  }

  // ─── Day tabs ─────────────────────────────────────────────────────────────

  function _renderDayTabs() {
    const container = document.getElementById('day-tabs');
    if (!container) return;
    container.innerHTML = '';
    for (let d = 1; d <= _numDays; d++) {
      const tab = document.createElement('button');
      const done = !!_selections[d];
      tab.className = `day-tab${d === _currentDay ? ' active' : ''}${done ? ' done' : ''}`;
      tab.dataset.day = d;
      tab.textContent = `Night ${d}${done ? ' ✓' : ''}`;
      tab.addEventListener('click', () => {
        _currentDay = d;
        _renderDayTabs();
        _updateSelectionInfo();
      });
      container.appendChild(tab);
    }
  }

  function _updateSelectionInfo() {
    const el = document.getElementById('hotel-selection-info');
    if (!el) return;

    if (_offers.length) {
      const h = _offerHotel;
      el.innerHTML = `Night ${_currentDay}: <strong style="color:var(--clr-success)">✅ ${_esc(h ? h.name : '')}</strong> — now pick a <strong>room type</strong>:`;
    } else if (_selections[_currentDay]) {
      const s = _selections[_currentDay];
      el.innerHTML = `Night ${_currentDay}: <strong style="color:var(--clr-success)">✅ ${_esc(s.hotel_name)}</strong>${s.room_type ? ` — ${_esc(s.room_type)}` : ''}`;
    } else {
      el.textContent = `Select a hotel for Night ${_currentDay} of ${_numDays}:`;
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

  // ─── Room offer cards ─────────────────────────────────────────────────────

  function _renderOfferCards() {
    const container = document.getElementById('hotel-cards');
    if (!container) return;

    if (!_offers.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">🛏️</div>
          <h3>No rooms available</h3>
          <p>This hotel has no bookable rooms for the selected dates.</p>
        </div>`;
      return;
    }

    const h = _offerHotel;
    container.innerHTML = `
      <div class="room-offers-header">
        <div class="hotel-thumb">🏨</div>
        <div>
          <div class="hotel-name">${_esc(h ? h.name : 'Hotel')}</div>
          <div class="hotel-rating">${h ? '⭐'.repeat(Math.round(h.rating)) : ''} ${h && h.rating ? h.rating + ' / 5' : ''}</div>
          <div class="hotel-address">📍 ${_esc(h ? h.address : '')}</div>
        </div>
      </div>
      <div class="room-offers-grid">
        ${_offers.map((o, i) => _offerCardHTML(o, i + 1)).join('')}
      </div>`;

    container.querySelectorAll('.btn-select-room').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        _handleRoomSelect(parseInt(btn.dataset.idx));
      });
    });
    container.querySelectorAll('.room-card').forEach(card => {
      card.addEventListener('click', () => _handleRoomSelect(parseInt(card.dataset.idx)));
    });
  }

  function _offerCardHTML(o, idx) {
    const refund = o.refundable ? '🔄 Refundable' : '🔒 Non-refundable';
    return `
      <div class="hotel-card room-card" data-idx="${idx}">
        <div class="room-badge">🛏️ Room ${idx}</div>
        <div class="hotel-name">${_esc(o.room_type)}</div>
        <div class="hotel-address">${_esc(o.board_name || 'Room Only')}</div>
        <div class="hotel-distance">${refund}</div>
        ${o.cancel_policy ? `<div class="hotel-distance">${_esc(o.cancel_policy)}</div>` : ''}
        <div class="hotel-price">
          <div>
            <div class="hotel-price-amount">&#8377;${_fmt(o.price_per_night)}</div>
            <div class="hotel-price-label">per night · <strong>&#8377;${_fmt(o.total_price)}</strong> total</div>
          </div>
          <button class="btn btn-primary btn-sm btn-select-room" data-idx="${idx}">Choose</button>
        </div>
      </div>`;
  }

  // ─── Selection logic ──────────────────────────────────────────────────────

  function _handleSelect(hotelId) {
    const hotel = _hotels.find(h => h.hotel_id === hotelId);
    if (!hotel || !_onSelect) return;
    _onSelect(hotel);
  }

  function _handleRoomSelect(idx) {
    const offer = _offers[idx - 1];
    if (!offer || !_onRoomSelect) return;
    _onRoomSelect(offer, idx);
  }

  // ─── Summary ─────────────────────────────────────────────────────────────

  function _updateSummary() {
    const summaryEl = document.getElementById('selected-hotels-summary');
    const listEl    = document.getElementById('selected-hotels-list');
    if (!summaryEl || !listEl) return;

    const nights = Object.keys(_selections).length;
    if (!nights) {
      summaryEl.style.display = 'none';
      return;
    }

    summaryEl.style.display = 'block';
    listEl.innerHTML = Object.entries(_selections)
      .sort(([a], [b]) => parseInt(a) - parseInt(b))
      .map(([day, s]) => `
        <div class="selected-hotel-row">
          <span class="selected-hotel-night">Night ${day}</span>
          <span class="selected-hotel-name">${_esc(s.hotel_name)}${s.room_type ? ' · ' + _esc(s.room_type) : ''}</span>
          <span class="selected-hotel-price">&#8377;${_fmt(s.total_price || s.price_per_night)}</span>
        </div>`).join('');

    const prebookBtn = document.getElementById('btn-prebook-hotels');
    if (prebookBtn) {
      prebookBtn.style.display = nights >= _numDays ? 'block' : 'none';
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

  // ─── Modal: combined summary confirm ──────────────────────────────────────

  /**
   * Open the combined summary confirm modal.
   * @param {Array}    selections  - [{night, hotel_name, room_type, total_price, …}]
   * @param {number}   grandTotal  - sum of all nights
   * @param {Function} onConfirm   - called with selections when confirmed
   */
  function openConfirmModal(selections, grandTotal, onConfirm) {
    const modal = document.getElementById('modal-hotel-confirm');
    const body  = document.getElementById('modal-hotel-body');
    const btnOk = document.getElementById('btn-confirm-prebook-hotels');
    const btnCx = document.getElementById('btn-cancel-hotel');
    const btnCl = document.getElementById('btn-close-hotel-modal');
    if (!modal || !body) return;

    const list = selections || [];
    const rows = list
      .sort((a, b) => a.night - b.night)
      .map(s => `
        <tr>
          <td>Night ${s.night}</td>
          <td><strong>${_esc(s.hotel_name)}</strong><br>${_esc(s.room_type || '')}</td>
          <td>&#8377;${_fmt(s.total_price)}</td>
        </tr>`).join('');

    body.innerHTML = `
      <p style="margin-bottom:.75rem">You are about to pre-book the following rooms:</p>
      <table class="detail-table">
        <tr style="font-weight:700"><td>Night</td><td>Hotel / Room</td><td>Total</td></tr>
        ${rows}
        <tr style="font-weight:700;border-top:2px solid var(--clr-border)">
          <td colspan="2">Grand Total</td>
          <td>&#8377;${_fmt(grandTotal)}</td>
        </tr>
      </table>`;

    const close = () => modal.classList.remove('open');
    btnCl && btnCl.addEventListener('click', close, { once: true });
    btnCx && btnCx.addEventListener('click', close, { once: true });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });

    btnOk && (btnOk.onclick = () => {
      close();
      if (onConfirm) onConfirm(list);
    });

    modal.classList.add('open');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _fmt(n) {
    return Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  /** Expose current selections for app.js to read. */
  function getSelections() { return { ..._selections }; }

  return { render, showRoomOffers, showSummary, openConfirmModal, getSelections };
})();
