/**
 * app.js — Main application controller.
 *
 * Wires together: session management, chat, flight UI, hotel UI,
 * itinerary rendering, versioning, comparison, panel navigation,
 * loading states, and toasts.
 */

// ════════════════════════════════════════════════════════
// Application State
// ════════════════════════════════════════════════════════

const AppState = {
  sessionId: null,
  workflowStep: 'collect_requirements',
  tripRequirements: {},
  flights: [],
  selectedFlight: null,
  flightPrebook: null,
  hotels: [],
  selectedHotels: {},     // { "1": hotel, "2": hotel, … }
  hotelPrebooks: {},     // { "1": HotelPrebook, … }
  draftItinerary: null,
  finalItinerary: null,
  numDays: 1,
  // Versioning state
  itineraryVersions: [],     // array of ItineraryVersionSummary objects
  activeVersionNumber: 0,      // 0 = none active yet
  pendingComparisonData: null,   // last comparison response while user decides
};

// ════════════════════════════════════════════════════════
// Utilities
// ════════════════════════════════════════════════════════

function showLoading(msg = 'Processing…') {
  const el = document.getElementById('loading-overlay');
  const text = document.getElementById('loading-text');
  if (el) el.classList.add('visible');
  if (text) text.textContent = msg;
}

function hideLoading() {
  document.getElementById('loading-overlay')?.classList.remove('visible');
}

/**
 * Show a toast notification.
 * @param {string} msg
 * @param {'success'|'error'|'warning'|''} type
 * @param {number} duration - ms
 */
function showToast(msg, type = '', duration = 3500) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = { success: '✅', error: '❌', warning: '⚠️' }[type] || 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.animation = 'toastOut .3s ease forwards';
    setTimeout(() => toast.remove(), 300);
  }, duration);
}

// ════════════════════════════════════════════════════════
// Panel navigation
// ════════════════════════════════════════════════════════

const PANELS = ['chat', 'flights', 'draft', 'compare', 'hotels', 'final'];

function showPanel(name) {
  PANELS.forEach(p => {
    const el = document.getElementById(`panel-${p}`);
    if (el) el.classList.toggle('active', p === name);
  });
  // Close requirements modal if open and showing a different panel
  if (name !== 'requirements') {
    _closeRequirementsModal();
  }
  _updateProgressSteps(name);
  document.querySelector('.main-content')?.scrollTo(0, 0);
}

function _openRequirementsModal() {
  document.getElementById('modal-requirements')?.classList.add('active');
}

function _closeRequirementsModal() {
  document.getElementById('modal-requirements')?.classList.remove('active');
}

function _updateProgressSteps(activePanel) {
  const stepMap = {
    requirements: 'requirements',
    chat: 'requirements',
    flights: 'flights',
    draft: 'draft',
    compare: 'compare',
    hotels: 'hotels',
    final: 'final',
  };
  const active = stepMap[activePanel] || 'requirements';
  const order = ['requirements', 'flights', 'draft', 'compare', 'hotels', 'final'];
  const idx = order.indexOf(active);

  document.querySelectorAll('.progress-steps .step').forEach(el => {
    const step = el.dataset.step;
    const stepIdx = order.indexOf(step);
    el.classList.remove('active', 'completed');
    if (step === active) el.classList.add('active');
    else if (stepIdx < idx) el.classList.add('completed');
  });
}

// ════════════════════════════════════════════════════════
// Trip summary sidebar
// ════════════════════════════════════════════════════════

function updateTripSummary(req) {
  if (!req) return;
  const card = document.getElementById('trip-summary-card');
  const content = document.getElementById('trip-summary-content');
  if (!card || !content) return;

  function _cleanEnum(val) {
    if (!val) return '';
    const s = String(val);
    const last = s.includes('.') ? s.split('.').pop() : s;
    return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
  }

  const fields = [
    req.departure_city && `🛫 <strong>From:</strong> ${req.departure_city}`,
    req.destination && `🛬 <strong>To:</strong> ${req.destination}`,
    req.departure_date && `📅 <strong>Depart:</strong> ${req.departure_date}`,
    req.return_date && `📅 <strong>Return:</strong> ${req.return_date}`,
    req.num_travelers && `👥 <strong>Travellers:</strong> ${req.num_travelers}`,
    req.budget && `💰 <strong>Budget:</strong> &#8377;${Number(req.budget).toLocaleString('en-IN')}`,
    req.trip_type && `🎯 <strong>Type:</strong> ${_cleanEnum(req.trip_type)}`,
  ].filter(Boolean);

  if (!fields.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  content.innerHTML = fields.join('<br>');
}

// ════════════════════════════════════════════════════════
// Requirements Form handling
// ════════════════════════════════════════════════════════

function _getRequirementsFormData() {
  const dest = _getInputVal('req-destination');
  const depCity = _getInputVal('req-departure-city');
  const depDate = _getInputVal('req-departure-date');
  const retDate = _getInputVal('req-return-date');
  const travelers = _getInputVal('req-travelers');
  const budget = _getInputVal('req-budget');
  const tripType = document.getElementById('req-trip-type')?.value || '';
  const special = _getInputVal('req-special-requests');

  // Validate required fields
  if (!depCity) { showToast('Please enter your departure city.', 'warning'); return null; }
  if (!dest) { showToast('Please enter your destination.', 'warning'); return null; }
  if (!depDate) { showToast('Please select your departure date.', 'warning'); return null; }
  if (!retDate) { showToast('Please select your return date.', 'warning'); return null; }
  if (!travelers || Number(travelers) < 1) { showToast('Please enter number of travellers.', 'warning'); return null; }
  if (!budget || Number(budget) <= 0) { showToast('Please enter your budget.', 'warning'); return null; }
  if (!tripType) { showToast('Please select your trip type.', 'warning'); return null; }

  return {
    departure_city: depCity,
    destination: dest,
    departure_date: depDate,
    return_date: retDate,
    num_travelers: Number(travelers),
    budget: Number(budget),
    trip_type: tripType,
    special_requests: special || null,
  };
}

async function handleRequirementsSubmit() {
  const data = _getRequirementsFormData();
  if (!data) return;

  showLoading('Planning your perfect trip… ✈️');

  try {
    const res = await apiSubmitRequirements(AppState.sessionId, data);

    hideLoading();

    // Update local state
    AppState.tripRequirements = {
      departure_city: data.departure_city,
      destination: data.destination,
      departure_date: data.departure_date,
      return_date: data.return_date,
      num_travelers: data.num_travelers,
      budget: data.budget,
      trip_type: data.trip_type,
      special_requests: data.special_requests,
    };
    AppState.workflowStep = res.workflow_step;
    updateTripSummary(AppState.tripRequirements);

    // Show the trip summary in chat and start flight search
    Chat.addMessage('assistant', res.assistant_message);
    showPanel('chat');
    showToast('Trip requirements saved! Now searching for flights…', 'success');

    // Trigger automatic flight search
    await _autoSearchFlights();

  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Could not save trip requirements: ${err.message}`);
  }
}

async function _autoSearchFlights() {
  showLoading('Searching for the best flights… ✈️');
  try {
    const req = AppState.tripRequirements;
    const res = await apiSearchFlights(AppState.sessionId, {
      origin: req.departure_city || '',
      destination: req.destination || '',
      departure_date: req.departure_date || '',
      num_passengers: req.num_travelers || 1,
      max_price: req.budget || undefined,
    });
    hideLoading();
    AppState.flights = res.flights || [];
    if (AppState.flights.length) {
      Chat.addMessage('assistant',
        `✈️ Found **${res.count} flights** from ${req.departure_city} to ${req.destination}! Please select one below.`);
      _showFlights(AppState.flights);
    }
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
  }
}

// ════════════════════════════════════════════════════════
// Chat handling
// ════════════════════════════════════════════════════════

async function handleUserMessage(text) {
  Chat.addMessage('user', text);
  Chat.setInputDisabled(true);
  Chat.showTyping();
  showLoading('Thinking…');

  try {
    const res = await apiChat(AppState.sessionId, text);
    Chat.removeTyping();
    hideLoading();

    if (res.assistant_message) {
      Chat.addMessage('assistant', res.assistant_message);
    }

    AppState.workflowStep = res.workflow_step;
    AppState.tripRequirements = res.trip_requirements || AppState.tripRequirements;
    updateTripSummary(AppState.tripRequirements);

    await _handleUiAction(res);

  } catch (err) {
    Chat.removeTyping();
    hideLoading();
    Chat.addMessage('assistant', `❌ Something went wrong: ${err.message}\n\nPlease try again.`);
    showToast(err.message, 'error');
  } finally {
    Chat.setInputDisabled(false);
    Chat.focusInput();
  }
}

async function _handleUiAction(res) {
  const action = res.ui_action;

  if (action === 'show_flights' || res.flight_results?.length) {
    AppState.flights = res.flight_results || [];
    if (AppState.flights.length) _showFlights(AppState.flights);
  }

  if (action === 'show_draft_itinerary' && res.draft_itinerary) {
    _applyDraftToState(res.draft_itinerary);
    Itinerary.renderDraft(AppState.draftItinerary);
    showPanel('draft');
  }

  if (action === 'show_hotels' || res.hotel_results?.length) {
    AppState.hotels = res.hotel_results || [];
    if (AppState.hotels.length) await _showHotels(AppState.hotels);
  }

  if (action === 'show_final_itinerary' && res.final_itinerary) {
    _applyFinalToState(res.final_itinerary);
    Itinerary.renderFinal(AppState.finalItinerary);
    showPanel('final');
  }
}

// ════════════════════════════════════════════════════════
// Itinerary state helpers
// ════════════════════════════════════════════════════════

function _applyDraftToState(draft, reqOverride) {
  AppState.draftItinerary = draft;
  const effectiveReq = reqOverride || AppState.tripRequirements;
  AppState.draftItinerary._req = effectiveReq;
  AppState.draftItinerary._flight = AppState.selectedFlight;
  AppState.draftItinerary._web_data = draft.web_data || draft._web_data || null;
  AppState.draftItinerary._draft_hotel = draft.draft_hotel || draft._draft_hotel || null;
  if (!AppState.draftItinerary.trip_title) {
    const dest = effectiveReq.destination || 'Your Trip';
    AppState.draftItinerary.trip_title =
      `✈️ ${dest.charAt(0).toUpperCase() + dest.slice(1)} Travel Itinerary`;
  }
}

function _applyFinalToState(final) {
  AppState.finalItinerary = final;
  AppState.finalItinerary._req = AppState.tripRequirements;
  AppState.finalItinerary._flight = AppState.selectedFlight;
  AppState.finalItinerary._prebook = AppState.flightPrebook;
  if (AppState.hotelPrebooks && Object.keys(AppState.hotelPrebooks).length) {
    AppState.finalItinerary._prebooks = AppState.hotelPrebooks;
  } else {
    AppState.finalItinerary._prebooks = Object.fromEntries(
      Object.entries(AppState.selectedHotels).map(([day, hotel]) => [
        day,
        { hotel, prebook_id: '—', status: 'pending', total_charged: hotel.total_price || 0 },
      ])
    );
  }
  AppState.finalItinerary._web_data = final.web_data || final._web_data || null;
}

// ════════════════════════════════════════════════════════
// Flight flow
// ════════════════════════════════════════════════════════

function _showFlights(flights) {
  showPanel('flights');
  Flight.render(flights, (selectedFlight) => {
    AppState.selectedFlight = selectedFlight;
    Flight.openConfirmModal(selectedFlight, _confirmFlightPrebook);
  });
}

async function _confirmFlightPrebook(flight) {
  showLoading('Pre-booking your flight…');
  try {
    const res = await apiPrebookFlight(
      AppState.sessionId,
      flight.flight_id,
      AppState.tripRequirements.num_travelers || 1,
    );
    AppState.flightPrebook = res;
    AppState.selectedFlight = flight;
    hideLoading();
    showToast(`Flight booked! ID: ${res.prebook_id}`, 'success');
    Chat.addMessage('assistant', res.assistant_message || '✅ Flight pre-booked!');
    await _fetchAndShowDraft();
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Flight booking failed: ${err.message}`);
  }
}

async function _fetchAndShowDraft() {
  showLoading('Generating your draft itinerary…');
  try {
    const res = await apiGetDraftItinerary(AppState.sessionId);
    _applyDraftToState(res.draft);
    // Refresh version list
    await _refreshVersions();
    Itinerary.renderDraft(AppState.draftItinerary);
    showPanel('draft');
    showToast('Draft itinerary ready!', 'success');
    Chat.addMessage('assistant', '📋 **Draft Itinerary ready!** Review it below, then book hotels or edit it.');
  } catch (err) {
    Chat.addMessage('assistant', `❌ Could not generate itinerary: ${err.message}`);
  } finally {
    hideLoading();
  }
}

// ════════════════════════════════════════════════════════
// Versioning helpers
// ════════════════════════════════════════════════════════

async function _refreshVersions() {
  try {
    const res = await apiGetVersions(AppState.sessionId);
    AppState.itineraryVersions = res.versions || [];
    AppState.activeVersionNumber = res.active_version || 0;
  } catch (e) {
    // Non-critical — version list just won't refresh
  }
}

// ════════════════════════════════════════════════════════
// Edit & Regeneration flow
// ════════════════════════════════════════════════════════

function _openEditModal() {
  const req = AppState.tripRequirements || {};
  // Pre-fill form with current values
  _setInputVal('edit-destination', req.destination || '');
  _setInputVal('edit-budget', req.budget || '');
  _setInputVal('edit-departure-date', req.departure_date || '');
  _setInputVal('edit-return-date', req.return_date || '');
  _setInputVal('edit-travelers', req.num_travelers || '');
  _setInputVal('edit-special-requests', req.special_requests || '');

  const tripTypeEl = document.getElementById('edit-trip-type');
  if (tripTypeEl) {
    const rawType = String(req.trip_type || '');
    const cleaned = rawType.includes('.') ? rawType.split('.').pop().toLowerCase() : rawType.toLowerCase();
    tripTypeEl.value = cleaned || '';
  }

  document.getElementById('modal-edit-itinerary')?.classList.add('active');
}

function _closeEditModal() {
  document.getElementById('modal-edit-itinerary')?.classList.remove('active');
}

function _setInputVal(id, value) {
  const el = document.getElementById(id);
  if (el) el.value = value;
}

function _getInputVal(id) {
  return document.getElementById(id)?.value?.trim() || null;
}

async function _confirmRegenerate() {
  _closeEditModal();

  // Collect overrides — only send fields that were actually changed
  const req = AppState.tripRequirements || {};
  const overrides = {};

  const dest = _getInputVal('edit-destination');
  const budget = _getInputVal('edit-budget');
  const depDate = _getInputVal('edit-departure-date');
  const retDate = _getInputVal('edit-return-date');
  const travelers = _getInputVal('edit-travelers');
  const tripType = document.getElementById('edit-trip-type')?.value || '';
  const special = _getInputVal('edit-special-requests');

  if (dest && dest !== (req.destination || '')) overrides.destination = dest;
  if (budget && Number(budget) !== (req.budget || 0)) overrides.budget = Number(budget);
  if (depDate && depDate !== (req.departure_date || '')) overrides.departure_date = depDate;
  if (retDate && retDate !== (req.return_date || '')) overrides.return_date = retDate;
  if (travelers && Number(travelers) !== (req.num_travelers || 0)) overrides.num_travelers = Number(travelers);
  if (tripType && tripType !== '') overrides.trip_type = tripType;
  if (special && special !== (req.special_requests || '')) overrides.special_requests = special;

  showLoading('Generating new itinerary version…');
  try {
    const res = await apiRegenerateItinerary(AppState.sessionId, overrides);
    hideLoading();

    Chat.addMessage('assistant', res.assistant_message);
    showToast(`Version ${res.version_number} generated!`, 'success');

    // Apply overrides to local AppState immediately so new req values are
    // available when the comparison or draft panel re-renders.
    if (Object.keys(overrides).length) {
      AppState.tripRequirements = { ...AppState.tripRequirements, ...overrides };
      updateTripSummary(AppState.tripRequirements);
    }

    // Refresh versions list
    await _refreshVersions();

    // Auto-compare the previous active version vs new version
    const prevVersion = AppState.activeVersionNumber || 1;
    const newVersion = res.version_number;

    await _showComparison(prevVersion, newVersion);
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Regeneration failed: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════
// Comparison flow
// ════════════════════════════════════════════════════════

async function _showComparison(v1Number, v2Number) {
  showLoading('Comparing versions…');
  try {
    const res = await apiCompareVersions(AppState.sessionId, v1Number, v2Number);
    hideLoading();

    AppState.pendingComparisonData = res.comparison;
    Chat.addMessage('assistant', res.assistant_message);

    Itinerary.renderComparison(
      res.comparison,
      // onKeepOriginal
      async (versionNumber) => {
        await _selectVersion(versionNumber, 'Original version kept.');
      },
      // onUseUpdated
      async (versionNumber) => {
        await _selectVersion(versionNumber, 'Updated version selected!');
      },
    );

    showPanel('compare');
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Comparison failed: ${err.message}`);
  }
}

async function _selectVersion(versionNumber, toastMsg) {
  showLoading('Saving your selection…');
  try {
    const res = await apiSetActiveVersion(AppState.sessionId, versionNumber);
    AppState.activeVersionNumber = versionNumber;
    AppState.pendingComparisonData = null;

    // Sync trip requirements to the selected version's requirements FIRST,
    // so _applyDraftToState uses the correct req when rendering.
    const selectedVersion = AppState.itineraryVersions.find(v => v.version_number === versionNumber);
    if (selectedVersion?.trip_requirements) {
      AppState.tripRequirements = selectedVersion.trip_requirements;
      updateTripSummary(AppState.tripRequirements);
    }

    // Update local draft to the selected version (uses updated AppState.tripRequirements)
    if (res.draft && Object.keys(res.draft).length) {
      _applyDraftToState(res.draft);
    }

    await _refreshVersions();
    hideLoading();

    showToast(toastMsg, 'success');
    Chat.addMessage('assistant', res.assistant_message);

    // Re-render the active draft and go back to the draft panel
    Itinerary.renderDraft(AppState.draftItinerary);
    showPanel('draft');
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Could not set active version: ${err.message}`);
  }
}

// ════════════════════════════════════════════════════════
// Version History modal
// ════════════════════════════════════════════════════════

async function _openVersionHistory() {
  await _refreshVersions();
  Itinerary.renderVersionHistory(
    AppState.itineraryVersions,
    AppState.activeVersionNumber,
    async (versionNumber) => {
      // Close modal and restore the selected version
      _closeVersionHistory();
      await _selectVersion(versionNumber, `Version ${versionNumber} restored!`);
    },
  );
  document.getElementById('modal-version-history')?.classList.add('active');
}

function _closeVersionHistory() {
  document.getElementById('modal-version-history')?.classList.remove('active');
}

// ════════════════════════════════════════════════════════
// Hotel flow
// ════════════════════════════════════════════════════════

async function _showHotels(hotels) {
  showPanel('hotels');
  const days = _calcNumDays();
  AppState.numDays = days;

  Hotel.render(
    hotels,
    days,
    async (hotel, dayNumber) => {
      try {
        await apiSelectHotel(AppState.sessionId, hotel.hotel_id, dayNumber);
      } catch (e) {
        // Non-critical
      }
    },
    (selections) => {
      Hotel.openConfirmModal(selections, _confirmHotelPrebooks);
    },
  );
}

async function _confirmHotelPrebooks(selections) {
  const payload = Object.entries(selections).map(([day, h]) => ({
    hotel_id: h.hotel_id,
    day_number: parseInt(day),
  }));

  showLoading('Pre-booking your hotels…');
  try {
    const res = await apiPrebookHotels(AppState.sessionId, payload);
    hideLoading();
    showToast('All hotels booked!', 'success');
    Chat.addMessage('assistant', res.assistant_message || '✅ Hotels pre-booked!');
    AppState.selectedHotels = selections;
    AppState.hotelPrebooks = res.prebooks || {};
    await _fetchAndShowFinal();
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Hotel booking failed: ${err.message}`);
  }
}

async function _fetchAndShowFinal() {
  showLoading('Generating your final itinerary…');
  try {
    const res = await apiGetFinalItinerary(AppState.sessionId);
    _applyFinalToState(res.final);
    Itinerary.renderFinal(AppState.finalItinerary);
    showPanel('final');
    showToast('Your complete itinerary is ready! 🎉', 'success');
  } catch (err) {
    Chat.addMessage('assistant', `❌ Could not generate final itinerary: ${err.message}`);
  } finally {
    hideLoading();
  }
}

function _calcNumDays() {
  const req = AppState.tripRequirements;
  if (req.departure_date && req.return_date) {
    try {
      const d1 = new Date(req.departure_date);
      const d2 = new Date(req.return_date);
      const diff = Math.round((d2 - d1) / 86400000);
      return Math.max(1, diff);
    } catch { /* fall through */ }
  }
  return AppState.numDays || 1;
}

// ════════════════════════════════════════════════════════
// Button event wiring
// ════════════════════════════════════════════════════════

function _bindButtons() {
  // Sidebar toggle (mobile)
  const toggleBtn = document.getElementById('btn-toggle-sidebar');
  const sidebar = document.querySelector('.sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');

  toggleBtn?.addEventListener('click', () => {
    sidebar?.classList.toggle('active');
    sidebarOverlay?.classList.toggle('active');
  });
  sidebarOverlay?.addEventListener('click', () => {
    sidebar?.classList.remove('active');
    sidebarOverlay.classList.remove('active');
  });

  // New Trip buttons
  [
    document.getElementById('btn-new-trip'),
    document.getElementById('btn-start-new-trip-final'),
  ].forEach(btn => btn?.addEventListener('click', _startNewTrip));

  // Requirements form submit
  document.getElementById('btn-submit-requirements')?.addEventListener('click', handleRequirementsSubmit);

  // Allow Enter key to submit the form when focus is on any text input (not textarea)
  document.querySelectorAll('#modal-requirements input, #modal-requirements select').forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleRequirementsSubmit();
      }
    });
  });

  // Draft panel: continue to hotels
  document.getElementById('btn-continue-hotels')?.addEventListener('click', async () => {
    showPanel('chat');
    showLoading('Searching for hotels…');
    try {
      const req = AppState.tripRequirements;
      const days = _calcNumDays();
      const maxPPN = req.budget ? Math.round((req.budget / Math.max(days, 1)) * 0.4) : undefined;
      const res = await apiSearchHotels(AppState.sessionId, {
        destination: req.destination || '',
        check_in: req.departure_date || '',
        check_out: req.return_date || '',
        num_guests: req.num_travelers || 1,
        max_price_per_night: maxPPN,
      });
      AppState.hotels = res.hotels;
      hideLoading();
      Chat.addMessage('assistant',
        `Found **${res.count} hotels** in ${req.destination || 'your destination'}! 🏨`);
      await _showHotels(res.hotels);
    } catch (err) {
      hideLoading();
      showToast(err.message, 'error');
    }
  });

  // Draft panel: edit — opens the edit modal (NOT just back to chat)
  document.getElementById('btn-edit-draft')?.addEventListener('click', () => {
    if (!AppState.draftItinerary) {
      showToast('Please generate a draft itinerary first.', 'warning');
      return;
    }
    _openEditModal();
  });

  // Draft panel: version history
  document.getElementById('btn-version-history')?.addEventListener('click', _openVersionHistory);

  // Edit modal: cancel
  document.getElementById('btn-cancel-edit')?.addEventListener('click', _closeEditModal);
  document.getElementById('btn-close-edit-modal')?.addEventListener('click', _closeEditModal);

  // Edit modal: confirm regenerate
  document.getElementById('btn-confirm-regenerate')?.addEventListener('click', _confirmRegenerate);

  // Compare panel: back to draft
  document.getElementById('btn-back-to-draft')?.addEventListener('click', () => {
    showPanel('draft');
  });

  // Version History modal: close
  document.getElementById('btn-close-history-modal')?.addEventListener('click', _closeVersionHistory);
  document.getElementById('btn-close-history')?.addEventListener('click', _closeVersionHistory);

  // Hotels: pre-book all
  document.getElementById('btn-prebook-hotels')?.addEventListener('click', () => {
    const selections = Hotel.getSelections();
    if (!Object.keys(selections).length) {
      showToast('Please select a hotel for each night.', 'warning');
      return;
    }
    Hotel.openConfirmModal(selections, _confirmHotelPrebooks);
  });

  // Final: download
  document.getElementById('btn-download-itinerary')?.addEventListener('click', () => {
    if (AppState.finalItinerary) {
      Itinerary.download(AppState.finalItinerary);
      showToast('Itinerary downloaded!', 'success');
    }
  });

  // Close modals on overlay click
  document.getElementById('modal-edit-itinerary')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) _closeEditModal();
  });
  document.getElementById('modal-version-history')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) _closeVersionHistory();
  });
  document.getElementById('modal-requirements')?.addEventListener('click', (e) => {
    if (e.target === e.currentTarget) _closeRequirementsModal();
  });

  // Sidebar step clicks — include compare step
  document.querySelectorAll('.progress-steps .step').forEach(el => {
    el.addEventListener('click', () => {
      const step = el.dataset.step;
      const panel = {
        requirements: 'chat',
        flights: 'flights',
        draft: 'draft',
        compare: 'compare',
        hotels: 'hotels',
        final: 'final',
      }[step];
      if (panel) {
        showPanel(panel);
        sidebar?.classList.remove('active');
        sidebarOverlay?.classList.remove('active');
      }
    });
  });
}

// ════════════════════════════════════════════════════════
// New trip
// ════════════════════════════════════════════════════════

async function _startNewTrip() {
  if (!confirm('Start a new trip? Your current session will be reset.')) return;
  showLoading('Starting fresh…');
  try {
    if (AppState.sessionId) {
      await apiDeleteSession(AppState.sessionId).catch(() => { });
    }
    await _initSession();
    _openRequirementsModal();
    showToast('New trip started!', 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    hideLoading();
  }
}

// ════════════════════════════════════════════════════════
// Session initialisation
// ════════════════════════════════════════════════════════

async function _initSession() {
  Object.assign(AppState, {
    sessionId: null, workflowStep: 'collect_requirements',
    tripRequirements: {}, flights: [], selectedFlight: null,
    flightPrebook: null, hotels: [], selectedHotels: {},
    hotelPrebooks: {}, draftItinerary: null, finalItinerary: null,
    numDays: 1,
    // Reset versioning
    itineraryVersions: [], activeVersionNumber: 0, pendingComparisonData: null,
  });

  const chatWin = document.getElementById('chat-window');
  if (chatWin) chatWin.innerHTML = '';
  ['flight-cards', 'hotel-cards', 'draft-content', 'final-content', 'compare-content'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.innerHTML = '';
  });
  const summaryCard = document.getElementById('trip-summary-card');
  if (summaryCard) summaryCard.style.display = 'none';

  const res = await apiCreateSession();
  AppState.sessionId = res.session_id;
  Chat.addMessage('assistant', res.welcome_message);
}

// ════════════════════════════════════════════════════════
// Bootstrap
// ════════════════════════════════════════════════════════

document.addEventListener('DOMContentLoaded', async () => {
  if (typeof marked !== 'undefined') {
    marked.setOptions({ breaks: true, gfm: true });
  }

  Chat.init(handleUserMessage);
  _bindButtons();

  showLoading('Connecting to AI Travel Planner…');
  try {
    await _initSession();
    _openRequirementsModal();
  } catch (err) {
    Chat.addMessage(
      'assistant',
      `❌ Could not connect to the server.\n\n**${err.message}**\n\nMake sure the backend is running:  \n\`uvicorn backend.main:app --reload --port 8000\``,
    );
  } finally {
    hideLoading();
    Chat.focusInput();
  }
});
