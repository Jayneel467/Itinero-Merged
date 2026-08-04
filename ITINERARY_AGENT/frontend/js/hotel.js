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

    _bindMoreToggles(container);
  }

  function _hotelCardHTML(h, idx) {
    const stars    = '⭐'.repeat(Math.round(h.rating));
    const dist     = `📍 ${h.distance_from_center_km} km from centre`;
    const amenList = (h.amenities || []).slice(0, 5)
                       .map(a => `<span class="amenity-chip">${_esc(a)}</span>`).join('');
    const isSelected = _selections[_currentDay]?.hotel_id === h.hotel_id;
    const badge    = idx === 0 ? `<div class="flight-card-badge value">🏆 Top Pick</div>` : '';
    const more     = _hotelMoreHTML(h, `hotel-more-${idx}`);

    return `
      <div class="hotel-card${isSelected ? ' selected' : ''}" data-hotel-id="${h.hotel_id}">
        ${badge}
        ${_thumbHTML(_hotelHero(h))}
        <div class="hotel-name">${_esc(h.name)}</div>
        <div class="hotel-rating">
          <span class="stars">${stars}</span>
          <span class="rating-num">${h.rating} / 5</span>
        </div>
        <div class="hotel-address">📍 ${_esc(h.address)}</div>
        <div class="hotel-distance">${dist}</div>
        <div class="hotel-amenities">${amenList}</div>
        <button type="button" class="btn-more-toggle" data-more="hotel-more-${idx}"${more ? '' : ' style="display:none"'}>ℹ️ Details More</button>
        ${more}
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
    const hero = _hotelHero(h);
    const more = h ? _hotelMoreHTML(h, 'hotel-more-block') : '';
    container.innerHTML = `
      <div class="room-offers-header">
        ${_thumbHTML(hero, 'thumb-sm')}
        <div>
          <div class="hotel-name">${_esc(h ? h.name : 'Hotel')}</div>
          <div class="hotel-rating">${h ? '⭐'.repeat(Math.round(h.rating)) : ''} ${h && h.rating ? h.rating + ' / 5' : ''}</div>
          <div class="hotel-address">📍 ${_esc(h ? h.address : '')}</div>
          ${more ? `<button type="button" class="btn-more-toggle" data-more="hotel-more-block">ℹ️ Details More</button>` : ''}
        </div>
      </div>
      ${more ? more.replace('class="card-more"', 'class="card-more hotel-more-row"') : ''}
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
    _bindMoreToggles(container);
  }

  function _offerCardHTML(o, idx) {
    const refund = o.refundable ? '🔄 Refundable' : '🔒 Non-refundable';
    const img    = (o.room_images || []).find(_isUrl) || '';
    const more   = _roomMoreHTML(o, `room-more-${idx}`);
    return `
      <div class="hotel-card room-card" data-idx="${idx}">
        <div class="room-badge">🛏️ Room ${idx}</div>
        <div class="room-thumb">${img
          ? `<img src="${img}" alt="${_esc(o.room_type)}" loading="lazy" onerror="this.remove();var t=this.parentElement;t.classList.add('img-fallback');t.textContent='🛏️'">`
          : '🛏️'}</div>
        <div class="hotel-name">${_esc(o.room_type)}</div>
        <div class="hotel-address">${_esc(o.board_name || 'Room Only')}</div>
        <div class="hotel-distance">${refund}</div>
        ${o.cancel_policy ? `<div class="hotel-distance">${_esc(o.cancel_policy)}</div>` : ''}
        <button type="button" class="btn-more-toggle" data-more="room-more-${idx}"${more ? '' : ' style="display:none"'}>ℹ️ Details More</button>
        ${more}
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

  function _isUrl(v) {
    return typeof v === 'string' && /^https?:\/\/\S+$/.test(v);
  }

  /** Strip HTML tags then escape — safe plain-text rendering of LiteAPI fields. */
  function _cleanHtml(v) {
    const d = document.createElement('div');
    d.innerHTML = v || '';
    return _esc(d.textContent);
  }

  /** First available hotel image URL (or '' → emoji fallback). */
  function _hotelHero(h) {
    if (!h) return '';
    if (Array.isArray(h.hotel_images) && _isUrl(h.hotel_images[0])) return h.hotel_images[0];
    if (_isUrl(h.image_placeholder)) return h.image_placeholder;
    return '';
  }

  /** Thumbnail block — renders an <img> when a URL is present, else the emoji. */
  function _thumbHTML(url, cls) {
    if (!url) return `<div class="hotel-thumb${cls ? ' ' + cls : ''}">🏨</div>`;
    return `
      <div class="hotel-thumb${cls ? ' ' + cls : ''} img">
        <img src="${url}" alt="" loading="lazy"
          onerror="this.remove();var t=this.parentElement;t.classList.add('img-fallback');t.textContent='🏨'">
      </div>`;
  }

  /** Expandable "Details More" section for a hotel ('' when nothing to show). */
  function _hotelMoreHTML(h, id) {
    if (!h) return '';
    const desc     = _cleanHtml(h.hotel_description);
    const facs     = (h.hotel_facilities || []).filter(Boolean);
    const info     = _cleanHtml(h.important_information);
    const times    = h.checkin_checkout_times || {};
    const gallery  = (h.hotel_images || []).filter(_isUrl);
    const hasTimes = !!(times.checkin_start || times.checkin_end || times.checkout);

    if (!desc && !facs.length && !info && !gallery.length && !hasTimes) return '';

    const parts = [];
    if (desc) {
      parts.push(`<div class="more-section"><div class="more-label">Description</div><div class="more-text">${desc}</div></div>`);
    }
    if (hasTimes) {
      const t = [
        (times.checkin_start ? `Check-in ${times.checkin_start}` + (times.checkin_end ? ` – ${times.checkin_end}` : '') : ''),
        (times.checkout ? `Check-out ${times.checkout}` : ''),
      ].filter(Boolean).join(' · ');
      parts.push(`<div class="more-section"><div class="more-label">Timings</div><div class="more-text">${_esc(t)}</div></div>`);
    }
    if (facs.length) {
      parts.push(`<div class="more-section"><div class="more-label">Hotel Facilities</div><div class="more-chips">${facs.slice(0, 12).map(f => `<span class="more-chip">${_esc(f)}</span>`).join('')}</div></div>`);
    }
    if (info) {
      parts.push(`<div class="more-section"><div class="more-label">Important Information</div><div class="more-text">${info}</div></div>`);
    }
    if (gallery.length > 1) {
      parts.push(`<div class="more-section"><div class="more-label">Gallery</div><div class="more-gallery">${gallery.slice(0, 8).map(u => `<img src="${u}" alt="" loading="lazy">`).join('')}</div></div>`);
    }
    return `<div class="card-more" id="${id}">${parts.join('')}</div>`;
  }

  /** Expandable "Details More" section for a room offer ('' when nothing). */
  function _roomMoreHTML(o, id) {
    if (!o) return '';
    const parts = [];
    if (o.room_description) {
      parts.push(`<div class="more-section"><div class="more-label">Description</div><div class="more-text">${_cleanHtml(o.room_description)}</div></div>`);
    }

    const meta = [];
    if (o.room_size) meta.push(`<span class="more-chip">📐 ${_esc(o.room_size)}</span>`);
    if (o.max_occupancy) meta.push(`<span class="more-chip">👥 Up to ${o.max_occupancy}</span>`);
    (o.bed_types || []).forEach(b => meta.push(`<span class="more-chip">🛏️ ${_esc(b)}</span>`));
    (o.room_views || []).forEach(v => meta.push(`<span class="more-chip">👁️ ${_esc(v)}</span>`));
    if (meta.length) {
      parts.push(`<div class="more-section"><div class="more-label">Room Info</div><div class="more-chips">${meta.join('')}</div></div>`);
    }

    const am = (o.room_amenities || []).slice(0, 12).map(a => `<span class="more-chip">${_esc(a)}</span>`).join('');
    if (am) {
      parts.push(`<div class="more-section"><div class="more-label">Amenities</div><div class="more-chips">${am}</div></div>`);
    }
    return parts.length ? `<div class="card-more" id="${id}">${parts.join('')}</div>` : '';
  }

  /** Wire up every "Details More" toggle inside a container. */
  function _bindMoreToggles(container) {
    container.querySelectorAll('.btn-more-toggle').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const target = document.getElementById(btn.dataset.more);
        if (!target) return;
        const expanded = target.classList.toggle('open');
        btn.classList.toggle('active', expanded);
        btn.textContent = expanded ? '↑ Hide Details' : 'ℹ️ Details More';
      });
    });
  }

  /** Expose current selections for app.js to read. */
  function getSelections() { return { ..._selections }; }

  return { render, showRoomOffers, showSummary, openConfirmModal, getSelections };
})();
