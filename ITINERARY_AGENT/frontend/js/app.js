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
    draft: 'draft',
    compare: 'compare',
    flights: 'flights',
    hotels: 'hotels',
    final: 'final',
  };
  const active = stepMap[activePanel] || 'requirements';
  const order = ['requirements', 'draft', 'compare', 'flights', 'hotels', 'final'];
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

    // Show the trip summary in chat and start draft generation
    Chat.addMessage('assistant', res.assistant_message);
    showPanel('chat');
    showToast('Trip requirements saved! Now generating your draft itinerary…', 'success');

    // Trigger automatic draft generation
    await _fetchAndShowDraft();

  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Could not save trip requirements: ${err.message}`);
  }
}

/**
 * "Continue to Flights" from the draft panel → resume the workflow at the
 * draft confirmation with "yes" so the graph proceeds to flight search.
 * The ranked flight list is returned and rendered for selection.
 */
async function _continueToFlights() {
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
    AppState.flights = res.flights || res.flight_results || [];
    if (AppState.flights.length) {
      Chat.addMessage('assistant',
        `✈️ Found **${res.count || AppState.flights.length} flights** from ${req.departure_city} to ${req.destination}! Please select one below.`);
      _showFlights(AppState.flights);
    } else {
      await _handleUiAction(res);
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

  if (action === 'show_flights') {
    AppState.flights = res.flight_results || [];
    if (AppState.flights.length) _showFlights(AppState.flights);
  }

  if (action === 'flight_passenger_details' && res.ui_payload) {
    PassengerForm.open(res.ui_payload, _submitPassengerDetails);
  }

  if (action === 'flight_prebooked' && res.ui_payload) {
    AppState.flightPrebook = res.ui_payload.prebook || AppState.flightPrebook;
    PrebookConfirmation.show(res.ui_payload, _continueToBooking);
  }

  if (action === 'flight_prebook_error') {
    const reason = res.ui_payload?.message || 'Flight pre-booking failed. Please try again.';
    showToast('Flight pre-booking failed. Please re-select the flight and try again.', 'error', 6000);
    Chat.addMessage('assistant', `${reason}\n\nPlease re-select the flight to try again.`);
    apiChat(AppState.sessionId, 'cancel')
      .then(r => {
        if (r?.assistant_message) Chat.addMessage('assistant', r.assistant_message);
        if (r) return _handleUiAction(r);
      })
      .catch(() => {});
  }

  if (action === 'show_draft_itinerary' && res.draft_itinerary) {
    _applyDraftToState(res.draft_itinerary);
    Itinerary.renderDraft(AppState.draftItinerary);
    showPanel('draft');
  }

  if (action === 'show_hotels' && res.hotel_results?.length) {
    AppState.hotels = res.hotel_results || [];
    if (AppState.hotels.length) await _showHotels(res);
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
    Flight.openConfirmModal(selectedFlight, _onFlightConfirmed);
  });
}

/**
 * Flight chosen in the confirm modal → persist the selection in the graph.
 * The graph interrupts at `flight_passenger_details` and the response opens
 * the Passenger Details form (pre-booking is NOT called yet).
 */
async function _onFlightConfirmed(flight) {
  showLoading('Saving your flight selection…');
  try {
    const res = await apiSelectFlight(AppState.sessionId, flight.flight_id);
    hideLoading();
    AppState.selectedFlight = flight;
    await _handleUiAction(res);
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Could not select flight: ${err.message}`);
  }
}

/**
 * Submit the Passenger Details form → resume the workflow → real LiteAPI
 * pre-booking happens server-side.
 */
async function _submitPassengerDetails(data) {
  showLoading('Pre-booking your flight… ✈️');
  try {
    const res = await apiSubmitPassengerDetails(
      AppState.sessionId,
      data.contact,
      data.passengers,
    );
    hideLoading();

    // Backend validation errors → show them inline and keep the form open
    if (res.ui_payload?.errors?.length) {
      PassengerForm.showErrors(res.ui_payload.errors);
      Chat.addMessage('assistant', '❌ Some passenger details are invalid. Please fix them and try again.');
      return;
    }

    PassengerForm.close();
    await _handleUiAction(res);
  } catch (err) {
    hideLoading();
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Flight pre-booking failed: ${err.message}`);
  }
}

/**
 * "Continue to Hotels" on the pre-book confirmation → resume the workflow
 * with "yes" to continue directly to the hotel flow (the draft itinerary
 * is NOT regenerated — it was already committed before flight selection).
 */
async function _continueToBooking() {
  Chat.setInputDisabled(true);
  Chat.showTyping();
  showLoading('Searching for hotels…');
  try {
    const res = await apiChat(AppState.sessionId, 'yes');
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
    showToast(err.message, 'error');
    Chat.addMessage('assistant', `❌ Could not continue: ${err.message}`);
  } finally {
    Chat.setInputDisabled(false);
    Chat.focusInput();
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
    Chat.addMessage('assistant', '📋 **Draft Itinerary ready!** Review it below, then continue to flight selection.');
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
// Hotel flow (per-night: hotel → room offers → summary → prebook)
// ════════════════════════════════════════════════════════

async function _showHotels(res) {
  showPanel('hotels');

  const hotels    = res.hotels || res.hotel_results || [];
  const totalN    = res.total_nights || _calcNumDays();
  const currentN  = res.current_night || 1;
  AppState.hotels = hotels;
  AppState.numDays = totalN;

  // Interrupt payload from the graph (error / no-results / no-rooms)
  const payload = res.ui_payload;
  if (payload && ['hotel_search_error', 'hotel_no_results', 'hotel_no_rooms'].includes(payload.type)) {
    _showHotelIssueModal(payload);
    return;
  }

  Hotel.render(
    hotels,
    totalN,
    currentN,
    res.night_selections || [],
    async (hotel) => {
      // User picked a hotel for the current night → fetch its room offers
      try {
        const r = await apiSelectHotel(AppState.sessionId, hotel.hotel_id);
        if (r.room_offers && r.room_offers.length) {
          // Prefer the server-side enriched hotel (images / details) from the
          // interrupt payload; fall back to the card's hotel object.
          const payloadHotel = r.ui_payload && r.ui_payload.hotel;
          const enriched = (payloadHotel && payloadHotel.hotel_id === hotel.hotel_id) ? payloadHotel : hotel;
          Hotel.showRoomOffers(r.room_offers, r.current_night || currentN, enriched, _handleRoomPick);
        } else {
          showToast('No bookable rooms for this hotel — try another.', 'warning');
          Chat.addMessage('assistant', r.assistant_message || 'No rooms available for this hotel.');
        }
      } catch (e) {
        showToast(e.message, 'error');
      }
    },
  );
}

async function _handleRoomPick(offer, idx) {
  showLoading('Saving your room choice…');
  try {
    const r = await apiSelectHotelRoom(AppState.sessionId, idx);
    hideLoading();
    _afterRoomSelect(r);
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
  }
}

/**
 * Handle the response after a room offer is picked:
 *  - next night's hotel list (flow continues)
 *  - combined summary (all nights done)
 *  - issue payloads (search errors / no rooms)
 */
async function _afterRoomSelect(res) {
  const payload = res.ui_payload;

  if (payload && payload.type === 'hotel_summary') {
    Hotel.showSummary(payload.selections || [], payload.grand_total || 0, _confirmHotelPrebooks);
    Chat.addMessage('assistant', payload.message || 'Your hotel selections are ready for pre-booking.');
    return;
  }

  if (payload && payload.type === 'hotel_reuse_decision') {
    _showHotelReuseModal(payload);
    Chat.addMessage('assistant', payload.message || '');
    return;
  }

  if (payload && ['hotel_search_error', 'hotel_no_results', 'hotel_no_rooms'].includes(payload.type)) {
    _showHotelIssueModal(payload);
    return;
  }

  // Otherwise the next night's hotels are ready (or retry of the current one)
  if (res.hotels && res.hotels.length) {
    await _showHotels(res);
  } else if (payload) {
    _showHotelIssueModal(payload);
  } else {
    showToast('Something went wrong — try again.', 'error');
  }
}

/**
 * Modal when the next day's activities are far from the current hotel —
 * ask whether to search a new hotel, keep the same one, or skip the night.
 */
function _showHotelReuseModal(payload) {
  const modal = document.getElementById('modal-hotel-reuse');
  if (!modal) return;

  const body = document.getElementById('modal-hotel-reuse-body');
  if (body) {
    body.innerHTML = `
      <p style="white-space:pre-line">${payload.message || ''}</p>`;
  }

  const close = () => modal.classList.remove('open');
  document.getElementById('btn-close-hotel-reuse')?.addEventListener('click', close, { once: true });
  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });

  const decide = async (decision) => {
    close();
    showLoading('Working on your hotels…');
    try {
      const res = await apiSearchHotels(AppState.sessionId, { decision });
      hideLoading();
      if (res.hotels && res.hotels.length) await _showHotels(res);
      else _afterRoomSelect(res);
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  };

  document.getElementById('btn-hotel-reuse-search')?.addEventListener('click', () => decide('search'), { once: true });
  document.getElementById('btn-hotel-reuse-keep')?.addEventListener('click', () => decide('keep'), { once: true });
  document.getElementById('btn-hotel-reuse-skip')?.addEventListener('click', () => decide('skip'), { once: true });

  modal.classList.add('open');
}

/** Modal for hotel search / room-availability issues with retry/skip/cancel actions. */
function _showHotelIssueModal(payload) {
  const modal = document.getElementById('modal-hotel-issue');
  if (!modal) return;

  const body = document.getElementById('modal-hotel-issue-body');
  if (body) {
    body.innerHTML = `
      <p style="white-space:pre-line">${payload.message || 'Hotel search encountered an issue.'}</p>`;
  }

  const close = () => modal.classList.remove('open');
  document.getElementById('btn-close-hotel-issue')?.addEventListener('click', close, { once: true });
  document.getElementById('btn-hotel-issue-retry')?.addEventListener('click', async () => {
    close();
    showLoading('Retrying…');
    try {
      const res = await apiSearchHotels(AppState.sessionId, { decision: 'retry' });
      hideLoading();
      if (res.hotels && res.hotels.length) await _showHotels(res);
      else _afterRoomSelect(res);
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, { once: true });

  document.getElementById('btn-hotel-issue-skip')?.addEventListener('click', async () => {
    close();
    showLoading('Skipping this night…');
    try {
      const res = await apiSearchHotels(AppState.sessionId, { decision: 'skip' });
      hideLoading();
      if (res.hotels && res.hotels.length) await _showHotels(res);
      else _afterRoomSelect(res);
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, { once: true });

  document.getElementById('btn-hotel-issue-cancel')?.addEventListener('click', () => {
    close();
    showToast('Hotel booking cancelled.', 'info');
  }, { once: true });

  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
  modal.classList.add('open');
}

async function _confirmHotelPrebooks(selections) {
  const payload = (selections || []).map(s => ({
    hotel_id: s.hotel_id,
    day_number: parseInt(s.night),
  }));

  showLoading('Pre-booking your hotels (one by one)…');
  try {
    const res = await apiPrebookHotels(AppState.sessionId, payload, 'yes');
    hideLoading();
    _afterPrebook(res);
  } catch (e) {
    hideLoading();
    showToast(e.message, 'error');
    Chat.addMessage('assistant', `❌ Hotel pre-booking failed: ${e.message}`);
  }
}

/** Handle the pre-book response: results, or a per-night failure decision. */
async function _afterPrebook(res) {
  const payload = res.ui_payload;

  if (payload && payload.type === 'hotel_prebook_error') {
    _showPrebookErrorModal(payload);
    return;
  }

  AppState.hotelPrebooks = res.prebooks || {};
  const results = res.prebook_results || res.night_selections || [];

  const ok = results.filter(s => s.prebook_status === 'confirmed' || s.prebook_id);
  const bad = results.filter(s => s.prebook_status === 'failed' && !s.prebook_id);

  Chat.addMessage('assistant',
    res.assistant_message ||
    `✅ Hotels pre-booked: ${ok.length} of ${results.length || 1} confirmed.`);

  showToast(ok.length ? 'Hotels pre-booked!' : 'No hotels were pre-booked.', ok.length ? 'success' : 'warning');
  await _fetchAndShowFinal();
}

/** Modal when a night's pre-book fails — retry / skip / abort. */
function _showPrebookErrorModal(payload) {
  const modal = document.getElementById('modal-prebook-error');
  if (!modal) return;

  const body = document.getElementById('modal-prebook-error-body');
  if (body) {
    body.innerHTML = `
      <p style="white-space:pre-line">${payload.message || 'A hotel pre-book failed.'}</p>`;
  }

  const close = () => modal.classList.remove('open');
  document.getElementById('btn-close-prebook-error')?.addEventListener('click', close, { once: true });
  document.getElementById('btn-prebook-error-retry')?.addEventListener('click', async () => {
    close();
    showLoading('Retrying pre-book…');
    try {
      const res = await apiPrebookHotels(AppState.sessionId, [], 'retry');
      hideLoading();
      _afterPrebook(res);
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, { once: true });

  document.getElementById('btn-prebook-error-skip')?.addEventListener('click', async () => {
    close();
    showLoading('Skipping failed night…');
    try {
      const res = await apiPrebookHotels(AppState.sessionId, [], 'skip');
      hideLoading();
      _afterPrebook(res);
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, { once: true });

  document.getElementById('btn-prebook-error-abort')?.addEventListener('click', async () => {
    close();
    showLoading('Stopping pre-booking…');
    try {
      const res = await apiPrebookHotels(AppState.sessionId, [], 'abort');
      hideLoading();
      _afterPrebook(res);
    } catch (e) {
      hideLoading();
      showToast(e.message, 'error');
    }
  }, { once: true });

  modal.addEventListener('click', (e) => { if (e.target === modal) close(); }, { once: true });
  modal.classList.add('open');
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

  // Draft panel: continue to flight search
  document.getElementById('btn-continue-flights')?.addEventListener('click', async () => {
    await _continueToFlights();
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

  // Hotels: pre-book all (opens the combined summary modal)
  document.getElementById('btn-prebook-hotels')?.addEventListener('click', () => {
    const selections = Object.values(Hotel.getSelections());
    if (!selections.length) {
      showToast('Please select a hotel for each night.', 'warning');
      return;
    }
    const grand = selections.reduce((sum, s) => sum + (s.total_price || s.price_per_night || 0), 0);
    Hotel.openConfirmModal(selections, grand, _confirmHotelPrebooks);
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
  // Close any open booking modals
  ['modal-passenger-details', 'modal-prebook-confirmation', 'modal-flight-confirm'].forEach(id => {
    document.getElementById(id)?.classList.remove('open');
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
