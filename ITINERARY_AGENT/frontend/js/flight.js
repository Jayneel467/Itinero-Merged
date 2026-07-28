/**
 * flight.js — Flight card rendering, sorting, and selection UI.
 */

const Flight = (() => {
  let _flights     = [];        // current ranked list
  let _selectedId  = null;      // selected flight_id
  let _onSelect    = null;      // callback(flight)

  // ─── Public: render list ──────────────────────────────────────────────────

  /**
   * Render flight cards in #flight-cards.
   * @param {Array}    flights   - flight objects from API
   * @param {Function} onSelect  - called with the chosen flight object
   */
  function render(flights, onSelect) {
    _flights    = flights || [];
    _onSelect   = onSelect;
    _selectedId = null;
    _renderCards(_flights);
    _bindSortButtons();
  }

  // ─── Private: card builder ────────────────────────────────────────────────

  function _renderCards(list) {
    const container = document.getElementById('flight-cards');
    if (!container) return;

    if (!list.length) {
      container.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1">
          <div class="empty-icon">✈️</div>
          <h3>No flights found</h3>
          <p>Try adjusting your search criteria.</p>
        </div>`;
      return;
    }

    container.innerHTML = list.map((f, idx) => _flightCardHTML(f, idx)).join('');

    // Bind select buttons
    container.querySelectorAll('.btn-select-flight').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const id = btn.dataset.flightId;
        _handleSelect(id);
      });
    });

    // Clicking the whole card also selects
    container.querySelectorAll('.flight-card').forEach(card => {
      card.addEventListener('click', () => {
        _handleSelect(card.dataset.flightId);
      });
    });
  }

  function _flightCardHTML(f, idx) {
    const badge    = _badge(f, idx);
    const stops    = f.stops === 0
      ? `<span class="route-nonstop">Non-stop</span>`
      : `<span class="route-stops">${f.stops} stop${f.stops > 1 ? 's' : ''}</span>`;
    const depTime  = _formatTime(f.departure_time);
    const arrTime  = _formatTime(f.arrival_time);
    const dur      = _formatDuration(f.duration_minutes);
    const refund   = f.refundable  ? '<span class="meta-chip green">✓ Refundable</span>'   : '<span class="meta-chip">Non-refundable</span>';
    const baggage  = f.baggage_included ? '<span class="meta-chip blue">✓ Baggage</span>'  : '<span class="meta-chip amber">No baggage</span>';
    const cabin    = `<span class="meta-chip">${f.cabin}</span>`;
    const selected = _selectedId === f.flight_id ? ' selected' : '';

    return `
      <div class="flight-card${selected}" data-flight-id="${f.flight_id}">
        ${badge}
        <div class="flight-airline">
          <span class="airline-icon">✈️</span>
          <div>
            <div class="airline-name">${_esc(f.airline)}</div>
            <div class="flight-number">${_esc(f.flight_number)}</div>
          </div>
        </div>

        <div class="flight-route">
          <div class="route-endpoint">
            <div class="route-code">${_esc(f.departure_airport)}</div>
            <div class="route-time">${depTime}</div>
          </div>
          <div class="route-middle">
            <div class="route-duration">${dur}</div>
            <div class="route-line"></div>
            ${stops}
          </div>
          <div class="route-endpoint">
            <div class="route-code">${_esc(f.arrival_airport)}</div>
            <div class="route-time">${arrTime}</div>
          </div>
        </div>

        <div class="flight-meta">
          ${refund}${baggage}${cabin}
        </div>

        <div class="flight-price">
          <div>
            <div class="price-amount">&#8377;${_fmt(f.total_price)}</div>
            <div class="price-per">&#8377;${_fmt(f.price_per_person)}/person · ${f.stops === 0 ? 'Direct' : f.stops + ' stop(s)'}</div>
          </div>
          <button class="btn btn-primary btn-sm btn-select-flight" data-flight-id="${f.flight_id}">
            ${_selectedId === f.flight_id ? '✓ Selected' : 'Select'}
          </button>
        </div>
      </div>`;
  }

  function _badge(f, idx) {
    if (idx === 0) return `<div class="flight-card-badge value">⭐ Best Value</div>`;
    if (f.stops === 0) return `<div class="flight-card-badge fast">⚡ Non-stop</div>`;
    return '';
  }

  // ─── Selection ────────────────────────────────────────────────────────────

  function _handleSelect(flightId) {
    const flight = _flights.find(f => f.flight_id === flightId);
    if (!flight) return;
    _selectedId = flightId;
    _renderCards(_flights);  // re-render to show selected state
    if (_onSelect) _onSelect(flight);
  }

  // ─── Sort buttons ─────────────────────────────────────────────────────────

  function _bindSortButtons() {
    const byPrice    = document.getElementById('btn-sort-price');
    const byDuration = document.getElementById('btn-sort-duration');
    const byValue    = document.getElementById('btn-sort-value');

    [byPrice, byDuration, byValue].forEach(b => b && b.classList.remove('btn-active'));

    byPrice?.addEventListener('click', () => {
      [byPrice, byDuration, byValue].forEach(b => b && b.classList.remove('btn-active'));
      byPrice.classList.add('btn-active');
      const sorted = [..._flights].sort((a, b) => a.total_price - b.total_price);
      _renderCards(sorted);
    });

    byDuration?.addEventListener('click', () => {
      [byPrice, byDuration, byValue].forEach(b => b && b.classList.remove('btn-active'));
      byDuration.classList.add('btn-active');
      const sorted = [..._flights].sort((a, b) => a.duration_minutes - b.duration_minutes);
      _renderCards(sorted);
    });

    byValue?.addEventListener('click', () => {
      [byPrice, byDuration, byValue].forEach(b => b && b.classList.remove('btn-active'));
      byValue.classList.add('btn-active');
      const sorted = [..._flights].sort((a, b) => (b.ranking_score || 0) - (a.ranking_score || 0));
      _renderCards(sorted);
    });
  }

  // ─── Modal: confirm pre-book ──────────────────────────────────────────────

  /**
   * Open the flight confirmation modal for the given flight.
   * @param {object}   flight
   * @param {Function} onConfirm  - called when user clicks Pre-book
   */
  function openConfirmModal(flight, onConfirm) {
    const modal  = document.getElementById('modal-flight-confirm');
    const body   = document.getElementById('modal-flight-body');
    const btnOk  = document.getElementById('btn-confirm-prebook-flight');
    const btnCx  = document.getElementById('btn-cancel-flight');
    const btnCl  = document.getElementById('btn-close-flight-modal');
    if (!modal || !body) return;

    body.innerHTML = `
      <table class="detail-table">
        <tr><td>✈️ Airline</td><td><strong>${_esc(flight.airline)}</strong></td></tr>
        <tr><td>🔢 Flight</td><td>${_esc(flight.flight_number)}</td></tr>
        <tr><td>🛫 From</td><td>${_esc(flight.departure_airport)} at ${_formatTime(flight.departure_time)}</td></tr>
        <tr><td>🛬 To</td><td>${_esc(flight.arrival_airport)} at ${_formatTime(flight.arrival_time)}</td></tr>
        <tr><td>⏱ Duration</td><td>${_formatDuration(flight.duration_minutes)}</td></tr>
        <tr><td>🛑 Stops</td><td>${flight.stops === 0 ? 'Non-stop' : flight.stops + ' stop(s)'}</td></tr>
        <tr><td>💺 Cabin</td><td>${_esc(flight.cabin)}</td></tr>
        <tr><td>↩️ Refundable</td><td>${flight.refundable ? '✅ Yes' : '❌ No'}</td></tr>
        <tr><td>🧳 Baggage</td><td>${flight.baggage_included ? '✅ Included' : '❌ Not included'}</td></tr>
        <tr><td>💰 Total Price</td><td><strong>&#8377;${_fmt(flight.total_price)}</strong></td></tr>
      </table>`;

    const close = () => modal.classList.remove('open');
    btnCl && btnCl.addEventListener('click', close, { once: true });
    btnCx && btnCx.addEventListener('click', close, { once: true });
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });

    btnOk && (btnOk.onclick = () => {
      close();
      if (onConfirm) onConfirm(flight);
    });

    modal.classList.add('open');
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  function _formatTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch { return iso; }
  }

  function _formatDuration(mins) {
    if (!mins) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function _fmt(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { render, openConfirmModal };
})();
