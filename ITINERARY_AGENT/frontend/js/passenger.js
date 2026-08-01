/**
 * passenger.js — Passenger Details form and Prebook Confirmation UI.
 *
 * PassengerForm       : collects LiteAPI-required contact + traveller data
 *                       (supports multiple passengers) and submits it via
 *                       POST /api/flight/passenger-details.
 * PrebookConfirmation : shows the result of a successful pre-book with a
 *                       "Continue to Booking" action.
 */

const PassengerForm = (() => {
  let _onSubmit = null;   // callback(contact, passengers)

  // ─── Public: open the form ──────────────────────────────────────────────

  /**
   * Open the passenger details modal.
   * @param {object}   payload   - ui_payload from the workflow interrupt
   * @param {Function} onSubmit  - called with { contact, passengers }
   */
  function open(payload, onSubmit) {
    _onSubmit = onSubmit;
    _renderFlightSummary(payload?.flight || {});
    _resetErrors();

    const modal = document.getElementById('modal-passenger-details');
    if (!modal) return;

    _renderPassengerRows(payload?.num_passengers || 1);
    _bindActions();
    modal.classList.add('open');
  }

  function close() {
    document.getElementById('modal-passenger-details')?.classList.remove('open');
  }

  function isOpen() {
    return document.getElementById('modal-passenger-details')?.classList.contains('open');
  }

  // ─── Public: show backend validation errors ─────────────────────────────

  function showErrors(errors) {
    const box = document.getElementById('passenger-form-errors');
    if (!box) return;
    if (!Array.isArray(errors) || !errors.length) {
      box.style.display = 'none';
      box.innerHTML = '';
      return;
    }
    box.innerHTML = `
      <strong>Please fix the following:</strong>
      <ul>${errors.map(e => `<li>${_esc(e)}</li>`).join('')}</ul>`;
    box.style.display = 'block';
  }

  // ─── Public: collect + validate form data ───────────────────────────────

  /**
   * Validate the whole form. Returns { contact, passengers } or null.
   * Marks invalid fields in red and toasts the first error.
   */
  function collect() {
    _clearFieldErrors();
    _resetErrors();

    const contact = _collectContact();
    const passengers = _collectPassengers();

    if (!contact || passengers === null) return null;

    return { contact, passengers };
  }

  // ─── Private: contact section ───────────────────────────────────────────

  function _collectContact() {
    const errors = [];
    const first = _val('pax-contact-first');
    const last  = _val('pax-contact-last');
    const email = _val('pax-contact-email');
    const phone = _val('pax-contact-phone');
    const countryCode = _val('pax-contact-country-code');

    if (!first) { _markError('pax-contact-first'); errors.push('Contact first name is required.'); }
    if (!last)  { _markError('pax-contact-last');  errors.push('Contact last name is required.'); }
    if (!email) { _markError('pax-contact-email'); errors.push('Contact email is required.'); }
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      _markError('pax-contact-email');
      errors.push('Contact email is invalid.');
    }
    if (!countryCode) { _markError('pax-contact-country-code'); errors.push('Phone country code is required (e.g. 91).'); }
    else if (!/^\d{1,4}$/.test(countryCode)) {
      _markError('pax-contact-country-code');
      errors.push('Phone country code must be numeric (e.g. 91).');
    }
    if (!phone) { _markError('pax-contact-phone'); errors.push('Contact phone number is required.'); }
    else if (!/^\d{7,15}$/.test(phone)) {
      _markError('pax-contact-phone');
      errors.push('Phone number must be 7-15 digits without country code (e.g. 9876543210).');
    }
    else if (_isPlaceholderPhone(phone)) {
      _markError('pax-contact-phone');
      errors.push('Phone number appears to be a placeholder (sequential digits). Please provide a valid phone number.');
    }

    if (errors.length) {
      showErrors(errors);
      return null;
    }

    return {
      firstName:         first,
      lastName:          last,
      email,
      phone,
      phoneCountryCode:  countryCode,
    };
  }

  // ─── Private: passenger rows ────────────────────────────────────────────

  function _renderPassengerRows(count) {
    const container = document.getElementById('passenger-rows');
    if (!container) return;
    container.innerHTML = '';
    for (let i = 0; i < count; i++) {
      container.appendChild(_passengerRowHTML(i));
    }
    _syncRemoveButtons();
  }

  function _passengerRowHTML(idx) {
    const row = document.createElement('div');
    row.className = 'passenger-row';
    row.dataset.idx = idx;
    row.innerHTML = `
      <div class="passenger-row-head">
        <h5>🧑 Traveler ${idx + 1}</h5>
        <button class="btn-remove-passenger" type="button" title="Remove traveler" aria-label="Remove traveler">✕</button>
      </div>
      <div class="passenger-form-row">
        <div class="passenger-form-group">
          <label>Type *</label>
          <select class="passenger-input pax-type">
            <option value="ADULT">Adult</option>
            <option value="CHILD">Child</option>
            <option value="INFANT">Infant</option>
          </select>
        </div>
        <div class="passenger-form-group">
          <label>First Name *</label>
          <input type="text" class="passenger-input pax-first" placeholder="e.g. Manish" />
        </div>
        <div class="passenger-form-group">
          <label>Last Name *</label>
          <input type="text" class="passenger-input pax-last" placeholder="e.g. Raikwar" />
        </div>
      </div>
      <div class="passenger-form-row">
        <div class="passenger-form-group">
          <label>Gender *</label>
          <select class="passenger-input pax-gender">
            <option value="M">Male</option>
            <option value="F">Female</option>
            <option value="X">Other</option>
          </select>
        </div>
        <div class="passenger-form-group">
          <label>Date of Birth *</label>
          <input type="date" class="passenger-input pax-birthday" />
        </div>
        <div class="passenger-form-group">
          <label>Document Type *</label>
          <select class="passenger-input pax-doc-type">
            <option value="passport">Passport</option>
            <option value="id">National ID</option>
          </select>
        </div>
      </div>
      <div class="passenger-form-row">
        <div class="passenger-form-group">
          <label>Document Number *</label>
          <input type="text" class="passenger-input pax-doc-number" placeholder="e.g. P1234567" />
        </div>
        <div class="passenger-form-group">
          <label>Expiry Date *</label>
          <input type="date" class="passenger-input pax-doc-expiry" />
        </div>
        <div class="passenger-form-group">
          <label>Issuing Country (ISO-2) *</label>
          <input type="text" class="passenger-input pax-doc-issuing" maxlength="2" placeholder="e.g. IN" />
        </div>
      </div>
      <div class="passenger-form-row">
        <div class="passenger-form-group">
          <label>Nationality (ISO-2) *</label>
          <input type="text" class="passenger-input pax-doc-nationality" maxlength="2" placeholder="e.g. IN" />
        </div>
      </div>`;
    return row;
  }

  function _collectPassengers() {
    const rows = [...document.querySelectorAll('#passenger-rows .passenger-row')];
    if (!rows.length) {
      showErrors(['At least one passenger is required.']);
      return null;
    }

    const passengers = [];
    const errors = [];
    const today = new Date();

    rows.forEach((row, i) => {
      const $ = sel => row.querySelector(sel);

      const first    = _valOf($('.pax-first'));
      const last     = _valOf($('.pax-last'));
      const type     = $('.pax-type')?.value || 'ADULT';
      const gender   = $('.pax-gender')?.value || '';
      const birthday = _valOf($('.pax-birthday'));
      const docNum   = _valOf($('.pax-doc-number'));
      const docExp   = _valOf($('.pax-doc-expiry'));
      const issuing  = _valOf($('.pax-doc-issuing'));
      const national = _valOf($('.pax-doc-nationality'));

      const label = `Traveler ${i + 1}`;

      if (!first) { _markField(row, '.pax-first');      errors.push(`${label}: first name is required.`); }
      if (!last)  { _markField(row, '.pax-last');       errors.push(`${label}: last name is required.`); }
      if (!gender){ _markField(row, '.pax-gender');     errors.push(`${label}: gender is required.`); }

      if (!birthday) { _markField(row, '.pax-birthday'); errors.push(`${label}: date of birth is required.`); }
      else if (new Date(birthday) >= today) {
        _markField(row, '.pax-birthday');
        errors.push(`${label}: date of birth must be in the past.`);
      }

      if (!docNum) { _markField(row, '.pax-doc-number'); errors.push(`${label}: document number is required.`); }
      if (!docExp) { _markField(row, '.pax-doc-expiry'); errors.push(`${label}: document expiry date is required.`); }
      else if (new Date(docExp) <= today) {
        _markField(row, '.pax-doc-expiry');
        errors.push(`${label}: document expiry must be in the future.`);
      }

      if (!/^[A-Za-z]{2}$/.test(issuing || '')) {
        _markField(row, '.pax-doc-issuing');
        errors.push(`${label}: issuing country must be a 2-letter ISO code (e.g. IN).`);
      }
      if (!/^[A-Za-z]{2}$/.test(national || '')) {
        _markField(row, '.pax-doc-nationality');
        errors.push(`${label}: nationality must be a 2-letter ISO code (e.g. IN).`);
      }

      passengers.push({
        type,
        firstName: first || '',
        lastName:  last || '',
        gender,
        birthday,
        nationality: national ? national.toUpperCase() : '',
        documentType: $('.pax-doc-type')?.value || 'passport',
        documentIssueCountry: issuing ? issuing.toUpperCase() : '',
        documentNumber: docNum || '',
        documentExpiry: docExp || '',
        document: {
          number:         docNum || '',
          expiryDate:     docExp || '',
          issuingCountry: issuing ? issuing.toUpperCase() : '',
          nationality:    national ? national.toUpperCase() : '',
          type:           $('.pax-doc-type')?.value || 'passport',
        },
      });
    });

    if (errors.length) {
      showErrors(errors.slice(0, 8));
      return null;
    }
    return passengers;
  }

  // ─── Private: rendering helpers ─────────────────────────────────────────

  function _renderFlightSummary(flight) {
    const el = document.getElementById('passenger-flight-summary');
    if (!el) return;
    const stops = flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop(s)`;
    el.innerHTML = `
      <div class="pax-summary-line">✈️ <strong>${_esc(flight.airline)} ${_esc(flight.flight_number)}</strong></div>
      <div class="pax-summary-line">
        ${_esc(flight.departure_airport)} → ${_esc(flight.arrival_airport)} ·
        ${_fmtTime(flight.departure_time)} → ${_fmtTime(flight.arrival_time)} ·
        ${stops}
      </div>
      <div class="pax-summary-line price">Total: <strong>&#8377;${_fmt(flight.total_price)}</strong></div>`;
  }

  function _bindActions() {
    const btnAdd = document.getElementById('btn-add-passenger');
    if (btnAdd && !btnAdd.dataset.bound) {
      btnAdd.dataset.bound = '1';
      btnAdd.addEventListener('click', () => {
        const rows = document.getElementById('passenger-rows');
        if (!rows) return;
        rows.appendChild(_passengerRowHTML(rows.children.length));
        _syncRemoveButtons();
      });
    }

    // Remove buttons (delegated)
    const container = document.getElementById('passenger-rows');
    if (container && !container.dataset.bound) {
      container.dataset.bound = '1';
      container.addEventListener('click', (e) => {
        const btn = e.target.closest('.btn-remove-passenger');
        if (!btn) return;
        const rows = container.querySelectorAll('.passenger-row');
        if (rows.length <= 1) {
          showToast('At least one traveler is required.', 'warning');
          return;
        }
        btn.closest('.passenger-row')?.remove();
        _renumberRows();
        _syncRemoveButtons();
      });
    }

    const btnClose = document.getElementById('btn-close-passenger-modal');
    if (btnClose && !btnClose.dataset.bound) {
      btnClose.dataset.bound = '1';
      btnClose.addEventListener('click', () => {
        if (confirm('Cancel passenger details? The selected flight will be cleared.')) {
          close();
          apiChat(AppState.sessionId, 'cancel').catch(() => {});
        }
      });
    }

    const btnCancel = document.getElementById('btn-cancel-passenger');
    if (btnCancel && !btnCancel.dataset.bound) {
      btnCancel.dataset.bound = '1';
      btnCancel.addEventListener('click', () => {
        if (confirm('Cancel passenger details? The selected flight will be cleared.')) {
          close();
          apiChat(AppState.sessionId, 'cancel').catch(() => {});
        }
      });
    }

    const btnSubmit = document.getElementById('btn-submit-passengers');
    if (btnSubmit && !btnSubmit.dataset.bound) {
      btnSubmit.dataset.bound = '1';
      btnSubmit.addEventListener('click', () => {
        const data = collect();
        if (data && _onSubmit) _onSubmit(data);
      });
    }
  }

  function _syncRemoveButtons() {
    document.querySelectorAll('#passenger-rows .btn-remove-passenger').forEach((btn, i) => {
      btn.style.visibility = document.querySelectorAll('#passenger-rows .passenger-row').length <= 1 ? 'hidden' : 'visible';
    });
  }

  function _renumberRows() {
    const rows = document.querySelectorAll('#passenger-rows .passenger-row');
    rows.forEach((row, i) => {
      row.querySelector('h5').textContent = `🧑 Traveler ${i + 1}`;
    });
  }

  function _clearFieldErrors() {
    document.querySelectorAll('#modal-passenger-details .input-error').forEach(el => el.classList.remove('input-error'));
  }

  function _markField(row, selector) {
    const el = row.querySelector(selector);
    if (el) el.classList.add('input-error');
  }

  function _markError(id) {
    const el = document.getElementById(id);
    if (el) el.classList.add('input-error');
  }

  function _resetErrors() {
    showErrors(null);
    _clearFieldErrors();
  }

  function _val(id) {
    return document.getElementById(id)?.value?.trim() || '';
  }

  /**
   * Detect placeholder phone numbers (ascending/descending digit runs like
   * 1234567890 / 9876543210) — LiteAPI rejects these at pre-booking time.
   */
  function _isPlaceholderPhone(phone) {
    const d = String(phone).trim();
    if (d.length < 8) return false;
    let asc = 0, desc = 0;
    for (let i = 0; i < d.length - 1; i++) {
      if ((+d[i + 1] - +d[i]) % 10 === 1) asc++;
      if ((+d[i] - +d[i + 1]) % 10 === 1) desc++;
    }
    return asc >= d.length - 2 || desc >= d.length - 2;
  }

  function _valOf(el) {
    return el ? (el.value || '').trim() : '';
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  function _fmt(n) {
    return Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function _esc(str) {
    const d = document.createElement('div');
    d.textContent = str || '';
    return d.innerHTML;
  }

  return { open, close, isOpen, showErrors, collect };
})();

// ════════════════════════════════════════════════════════════════════════
// Prebook Confirmation
// ════════════════════════════════════════════════════════════════════════

const PrebookConfirmation = (() => {
  let _onContinue = null;

  /**
   * Show the pre-book confirmation modal.
   * @param {object}   payload    - ui_payload from the workflow interrupt
   * @param {Function} onContinue - called when the user clicks "Continue to Booking"
   */
  function show(payload, onContinue) {
    _onContinue = onContinue;
    const modal = document.getElementById('modal-prebook-confirmation');
    const body  = document.getElementById('modal-prebook-body');
    if (!modal || !body) return;

    const prebook = payload?.prebook || {};
    const flight  = payload?.flight || prebook?.flight || {};
    const status  = prebook.booking_status || prebook.status || 'confirmed';
    const names   = payload?.passenger_names
      || (Array.isArray(prebook.passenger_details)
        ? prebook.passenger_details.map(p => `${p.first_name} ${p.last_name}`).join(', ')
        : `${prebook.passengers || 1} passenger(s)`);

    const stops = flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop(s)`;
    const statusClass = ['wait', 'hold'].includes(String(status).toLowerCase()) ? 'pax-status-wait' : 'pax-status-ok';

    body.innerHTML = `
      <div class="pax-prebook-id">
        <span class="pax-label">Prebook ID</span>
        <code class="pax-id">${_esc(prebook.prebook_id || '—')}</code>
      </div>
      <div class="pax-status ${statusClass}">Status: <strong>${_esc(status)}</strong></div>

      <table class="detail-table">
        <tr><td>✈️ Airline</td><td><strong>${_esc(flight.airline)} ${_esc(flight.flight_number)}</strong></td></tr>
        <tr><td>🛫 From</td><td>${_esc(flight.departure_airport)} · ${_fmtTime(flight.departure_time)}</td></tr>
        <tr><td>🛬 To</td><td>${_esc(flight.arrival_airport)} · ${_fmtTime(flight.arrival_time)}</td></tr>
        <tr><td>⏱ Duration</td><td>${_fmtDuration(flight.duration_minutes)} · ${stops}</td></tr>
        <tr><td>🧑 Passengers</td><td>${_esc(names)}</td></tr>
        <tr><td>💰 Total Price</td><td><strong>&#8377;${_fmt(prebook.total_charged)}</strong></td></tr>
      </table>`;

    _bindActions();
    modal.classList.add('open');
  }

  function hide() {
    document.getElementById('modal-prebook-confirmation')?.classList.remove('open');
  }

  function isOpen() {
    return document.getElementById('modal-prebook-confirmation')?.classList.contains('open');
  }

  // ─── Private ────────────────────────────────────────────────────────────

  function _bindActions() {
    const btnContinue = document.getElementById('btn-continue-booking');
    if (btnContinue && !btnContinue.dataset.bound) {
      btnContinue.dataset.bound = '1';
      btnContinue.addEventListener('click', () => {
        hide();
        if (_onContinue) _onContinue();
      });
    }

    const closeButtons = [
      document.getElementById('btn-close-prebook-modal'),
      document.getElementById('btn-close-prebook'),
    ];
    closeButtons.forEach(btn => {
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = '1';
        btn.addEventListener('click', hide);
      }
    });
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  }

  function _fmtDuration(mins) {
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

  return { show, hide, isOpen };
})();
