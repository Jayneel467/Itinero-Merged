/**
 * itinerary.js — Rich HTML dashboard renderer for Draft & Final itineraries.
 *
 * Replaces the raw marked.js markdown dump with a structured, interactive
 * travel dashboard: accordion sections, info cards, badges, weather cards,
 * restaurant cards, budget progress bars, and collapsible day plans.
 *
 * Public API:
 *   Itinerary.renderDraft(draft)   — renders into #draft-content
 *   Itinerary.renderFinal(final)   — renders into #final-content
 *   Itinerary.download(itinerary)  — triggers .md file download
 */

const Itinerary = (() => {

  // ── Helpers ────────────────────────────────────────────────────────────────

  function _esc(s) {
    const d = document.createElement('div');
    d.textContent = String(s ?? '');
    return d.innerHTML;
  }

  function _fmt(n) {
    return Number(n ?? 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  }

  function _fmtDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleDateString('en-IN', {
        day: '2-digit', month: 'short', year: 'numeric',
      });
    } catch { return iso; }
  }

  function _fmtTime(iso) {
    if (!iso) return '';
    try {
      return new Date(iso).toLocaleTimeString('en-IN', {
        hour: '2-digit', minute: '2-digit', hour12: true,
      });
    } catch { return iso; }
  }

  function _fmtDuration(mins) {
    if (!mins) return '';
    const h = Math.floor(mins / 60), m = mins % 60;
    return h > 0 ? `${h}h ${m}m` : `${m}m`;
  }

  function _cleanEnum(val) {
    if (!val) return '';
    const s = String(val);
    const last = s.includes('.') ? s.split('.').pop() : s;
    return last.charAt(0).toUpperCase() + last.slice(1).toLowerCase();
  }

  function _starsHtml(rating) {
    const full  = Math.floor(Number(rating) || 0);
    const empty = 5 - full;
    return '★'.repeat(full) + '☆'.repeat(empty);
  }

  // ── Accordion builder ─────────────────────────────────────────────────────

  let _accordionId  = 0;
  let _renderPrefix = 'draft';   // set per render call to 'draft' or 'final'

  function _accordion(icon, title, colorClass, bodyHtml, openByDefault = false) {
    const id = `${_renderPrefix}-acc-${++_accordionId}`;
    return `
      <div class="itin-section ${colorClass}">
        <button class="itin-section-header${openByDefault ? ' open' : ''}"
                onclick="Itinerary._toggleSection('${id}', this)"
                aria-expanded="${openByDefault}" aria-controls="${id}">
          <span class="itin-section-icon">${icon}</span>
          <span class="itin-section-title">${_esc(title)}</span>
          <span class="itin-section-chevron">${openByDefault ? '▲' : '▼'}</span>
        </button>
        <div class="itin-section-body${openByDefault ? ' open' : ''}" id="${id}">
          ${bodyHtml}
        </div>
      </div>`;
  }

  function _toggleSection(id, btn) {
    const body = document.getElementById(id);
    if (!body) return;
    const isOpen = body.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', isOpen);
    btn.querySelector('.itin-section-chevron').textContent = isOpen ? '▲' : '▼';
  }

  // ── Trip header cards ─────────────────────────────────────────────────────

  function _tripHeaderHtml(data, isDraft) {
    const req = data._req || {};
    const dest        = _esc(req.destination   || data.trip_title || 'Trip');
    const dates       = `${req.departure_date || ''} → ${req.return_date || ''}`;
    const duration    = req.departure_date && req.return_date
      ? _calcDays(req.departure_date, req.return_date) + ' days'
      : '';
    const travellers  = req.num_travelers ? `${req.num_travelers} traveller${req.num_travelers > 1 ? 's' : ''}` : '';
    const tripType    = _cleanEnum(req.trip_type);
    const budget      = req.budget ? `&#8377;${_fmt(req.budget)}` : (data.total_cost ? `&#8377;${_fmt(data.total_cost)}` : '');

    const badge = isDraft
      ? `<span class="itin-badge badge-draft">📝 Draft</span>`
      : `<span class="itin-badge badge-final">✅ Final</span>`;

    const cards = [
      { icon: '📍', label: 'Destination', value: dest.charAt(0).toUpperCase() + dest.slice(1) },
      { icon: '📅', label: 'Dates',       value: dates },
      { icon: '🌙', label: 'Duration',    value: duration },
      { icon: '👥', label: 'Travellers',  value: travellers },
      { icon: '🎯', label: 'Trip Type',   value: tripType },
      { icon: '💰', label: isDraft ? 'Budget' : 'Total Cost', value: budget },
    ].filter(c => c.value);

    const cardsHtml = cards.map(c => `
      <div class="itin-info-card">
        <span class="itin-info-card-icon">${c.icon}</span>
        <div class="itin-info-card-body">
          <div class="itin-info-card-label">${c.label}</div>
          <div class="itin-info-card-value">${c.value}</div>
        </div>
      </div>`).join('');

    const summary = _esc(data.trip_summary || '');

    return `
      <div class="itin-header">
        <div class="itin-header-top">
          <h1 class="itin-title">${_esc(data.trip_title || dest + ' Itinerary')}</h1>
          <div class="itin-header-badges">
            ${badge}
            ${isDraft ? '<span class="itin-badge badge-info">✈️ Flight Pending</span>' : ''}
            ${isDraft ? '<span class="itin-badge badge-info">🏨 Hotel Pending</span>' : '<span class="itin-badge badge-success">🏨 Hotel Booked</span>'}
          </div>
        </div>
        ${summary ? `<p class="itin-summary">${summary}</p>` : ''}
        <div class="itin-info-cards">${cardsHtml}</div>
      </div>`;
  }

  function _calcDays(dep, ret) {
    try {
      return Math.max(1, Math.round((new Date(ret) - new Date(dep)) / 86400000));
    } catch { return 1; }
  }

  // ── Flight section ────────────────────────────────────────────────────────

  function _flightSectionHtml(flight, prebook) {
    if (!flight) {
      return '<p class="itin-empty">✈️ Flight selection comes next — choose your flight after reviewing this draft.</p>';
    }

    const dep = flight.departure_time ? new Date(flight.departure_time) : null;
    const arr = flight.arrival_time   ? new Date(flight.arrival_time)   : null;

    const rows = [
      { label: '✈️ Airline',        value: _esc(flight.airline) },
      { label: '🔢 Flight Number',  value: _esc(flight.flight_number) },
      { label: '🛫 Departure',      value: dep ? `${flight.departure_airport} — ${_fmtDate(dep)} at ${_fmtTime(dep)}` : flight.departure_airport },
      { label: '🛬 Arrival',        value: arr ? `${flight.arrival_airport} — ${_fmtDate(arr)} at ${_fmtTime(arr)}` : flight.arrival_airport },
      { label: '⏱ Duration',        value: _fmtDuration(flight.duration_minutes) },
      { label: '🛑 Stops',          value: flight.stops === 0 ? 'Non-stop' : `${flight.stops} stop(s)` },
      { label: '💺 Cabin',          value: _cleanEnum(flight.cabin) },
      { label: '💵 Total Fare',     value: `&#8377;${_fmt(prebook ? prebook.total_charged : flight.total_price)}` },
      { label: '🎒 Baggage',        value: flight.baggage_included ? 'Included' : 'Not included' },
      { label: '🔄 Refundable',     value: flight.refundable ? 'Yes' : 'No' },
    ];
    if (prebook) {
      rows.push({ label: '📋 Booking ID', value: `<code>${_esc(prebook.prebook_id)}</code>` });
      rows.push({ label: '✅ Status', value: _esc(prebook.status || 'confirmed') + ' — Demo Flight' });
    } else {
      rows.push({ label: '📋 Status', value: 'Demo Flight — For Planning Only' });
    }

    const table = `
      <table class="itin-table">
        ${rows.map(r => `<tr><th>${r.label}</th><td>${r.value}</td></tr>`).join('')}
      </table>`;

    return `<div class="itin-flight-card">${table}</div>`;
  }

  // ── Hotel section (final itinerary — confirmed hotel(s) only) ─────────────

  function _hotelSectionHtml(prebooks) {
    // Final: real booked hotel(s)
    if (!prebooks || !Object.keys(prebooks).length) {
      return '<p class="itin-empty">No hotel booked.</p>';
    }

    const first = Object.values(prebooks)[0];
    const h = first.hotel;
    const amenities = (h.amenities || []).slice(0, 5)
      .map(a => `<span class="itin-amenity-chip">${_esc(a)}</span>`).join('');

    let multiNight = '';
    if (Object.keys(prebooks).length > 1) {
      const nightRows = Object.entries(prebooks)
        .sort(([a], [b]) => Number(a) - Number(b))
        .map(([night, pb]) => `
          <tr>
            <td>Night ${night}</td>
            <td>${_esc(pb.hotel.name)}</td>
            <td>&#8377;${_fmt(pb.hotel.price_per_night)}/night</td>
            <td><code>${_esc(pb.prebook_id)}</code></td>
          </tr>`).join('');
      multiNight = `
        <div class="itin-table-wrap" style="margin-top:1rem">
          <table class="itin-table itin-table-striped">
            <thead><tr><th>Night</th><th>Hotel</th><th>Price</th><th>Booking ID</th></tr></thead>
            <tbody>${nightRows}</tbody>
          </table>
        </div>`;
    }

    return `
      <div class="itin-hotel-card">
        <div class="itin-hotel-card-header">
          <span class="itin-hotel-icon">🏨</span>
          <div>
            <div class="itin-hotel-name">${_esc(h.name)}</div>
            <div class="itin-hotel-stars">${_starsHtml(h.rating)}
              <span class="itin-hotel-rating-num">(${h.rating}/5)</span>
            </div>
          </div>
          <span class="itin-badge badge-success" style="margin-left:auto">Booked</span>
        </div>
        <table class="itin-table">
          <tr><th>📍 Location</th><td>${_esc(h.address)}</td></tr>
          <tr><th>🛏️ Room Type</th><td>${_esc(h.room_type)}</td></tr>
          <tr><th>📅 Check-in</th><td>${_esc(first.check_in)}</td></tr>
          <tr><th>📅 Check-out</th><td>${_esc(first.check_out)}</td></tr>
          <tr><th>💵 Price</th><td>&#8377;${_fmt(h.price_per_night)}/night</td></tr>
          <tr><th>📋 Booking ID</th><td><code>${_esc(first.prebook_id)}</code></td></tr>
          <tr><th>✅ Status</th><td>${_esc(first.status || 'confirmed')} — Demo Hotel</td></tr>
        </table>
        <div class="itin-amenities">${amenities}</div>
        ${multiNight}
      </div>`;
  }

  // ── Budget section ────────────────────────────────────────────────────────

  function _budgetSectionHtml(breakdown, totalBudget) {
    if (!breakdown) return '<p class="itin-empty">No budget data.</p>';

    const total = breakdown.total || totalBudget || 1;
    const items = [
      { icon: '✈️', label: 'Flights',          val: breakdown.flights    || 0, cls: 'clr-flight' },
      { icon: '🏨', label: 'Hotel',             val: breakdown.hotel      || 0, cls: 'clr-hotel'  },
      { icon: '🍽️', label: 'Food & Dining',     val: breakdown.food       || 0, cls: 'clr-food'   },
      { icon: '🚗', label: 'Local Transport',   val: breakdown.transport  || 0, cls: 'clr-transport' },
      { icon: '🎡', label: 'Activities',        val: breakdown.activities || 0, cls: 'clr-activities' },
      { icon: '🛍️', label: 'Shopping',          val: breakdown.shopping   || 0, cls: 'clr-shopping' },
      { icon: '🛡️', label: 'Buffer / Misc',     val: breakdown.buffer     || 0, cls: 'clr-buffer' },
    ].filter(it => it.val > 0);

    // Draft state: flights & hotels are selected after the draft — show a
    // note instead of zero-value rows.
    const travelPending = !(breakdown.flights > 0) && !(breakdown.hotel > 0);

    const bars = items.map(it => {
      const pct = Math.min(100, Math.round((it.val / total) * 100));
      return `
        <div class="itin-budget-row">
          <div class="itin-budget-label">
            <span>${it.icon} ${it.label}</span>
            <span class="itin-budget-amount">&#8377;${_fmt(it.val)}</span>
          </div>
          <div class="itin-progress-track">
            <div class="itin-progress-bar ${it.cls}" style="width:${pct}%"></div>
          </div>
        </div>`;
    }).join('');

    return `
      <div class="itin-budget-wrap">
        ${bars}
        <div class="itin-budget-total">
          <span>💳 Total Estimated</span>
          <span class="itin-budget-total-amount">&#8377;${_fmt(total)}</span>
        </div>
        ${travelPending ? '<p class="itin-hotel-pending" style="margin-top:.75rem">✈️ Flight &amp; 🏨 hotel costs are added after you select them — this breakdown covers your on-ground expenses only.</p>' : ''}
      </div>`;
  }

  // ── Weather section ───────────────────────────────────────────────────────

  function _weatherSectionHtml(weatherList) {
    if (!weatherList || !weatherList.length) return '<p class="itin-empty">No weather data.</p>';

    const condIcon = cond => {
      const c = (cond || '').toLowerCase();
      if (c.includes('rain') || c.includes('monsoon')) return '🌧️';
      if (c.includes('cloud') || c.includes('overcast')) return '☁️';
      if (c.includes('fog'))   return '🌫️';
      if (c.includes('hot') || c.includes('humid')) return '🌡️';
      if (c.includes('cool') || c.includes('cold')) return '🧥';
      return '☀️';
    };

    const cards = weatherList.map(w => `
      <div class="itin-weather-card">
        <div class="itin-weather-icon">${condIcon(w.condition)}</div>
        <div class="itin-weather-date">${_esc(w.date_str)}</div>
        <div class="itin-weather-temp">${w.temperature_c}°C</div>
        <div class="itin-weather-cond">${_esc(w.condition)}</div>
        <div class="itin-weather-humidity">💧 ${w.humidity_pct}%</div>
        <div class="itin-weather-advice">${_esc(w.advice)}</div>
      </div>`).join('');

    return `<div class="itin-weather-grid">${cards}</div>`;
  }

  // ── Destination highlights ────────────────────────────────────────────────

  function _highlightsSectionHtml(webData) {
    if (!webData) return '<p class="itin-empty">No highlights data.</p>';

    function _cleanItem(text) {
      // Strip URLs, article prefixes, excess whitespace
      let s = String(text || '').replace(/https?:\/\/\S+/g, '').trim();
      s = s.replace(/\s+/g, ' ');
      // Take first sentence if too long
      if (s.length > 130) {
        const first = s.split(/[.!?]/)[0].trim();
        s = first.length > 20 ? first : s.slice(0, 130) + '…';
      }
      return s;
    }

    const seen = new Set();
    function _unique(items, max) {
      const out = [];
      for (const item of (items || [])) {
        const clean = _cleanItem(item);
        const key   = clean.toLowerCase().slice(0, 50);
        if (clean.length > 15 && !seen.has(key)) {
          seen.add(key);
          out.push(clean);
          if (out.length >= max) break;
        }
      }
      return out;
    }

    const sections = [
      { key: 'top_places',  title: '🗺️ Top Attractions',      max: 5 },
      { key: 'activities',  title: '🎯 Must-Try Experiences',  max: 5 },
      { key: 'restaurants', title: '🍽️ Food & Dining',         max: 5 },
      { key: 'events',      title: '🎭 Events & Festivals',    max: 4 },
    ];

    const cols = sections.map(sec => {
      const items = _unique(webData[sec.key] || [], sec.max);
      if (!items.length) return '';
      const bullets = items.map(i => `
        <li class="itin-highlight-item">
          <span class="itin-highlight-dot">•</span>${_esc(i)}
        </li>`).join('');
      return `
        <div class="itin-highlight-col">
          <div class="itin-highlight-title">${sec.title}</div>
          <ul class="itin-highlight-list">${bullets}</ul>
        </div>`;
    }).join('');

    return `<div class="itin-highlights-grid">${cols}</div>`;
  }

  // ── Day plan (collapsible card) ───────────────────────────────────────────

  function _dayCardHtml(day, index) {
    const isFirst = index === 0;
    const id = `${_renderPrefix}-day-${index}-${day.day_number ?? index}`;

    // Timeline table
    const timelineHtml = (day.timeline && day.timeline.length) ? `
      <div class="itin-day-block">
        <div class="itin-day-block-title">🕐 Daily Timeline</div>
        <div class="itin-table-wrap">
          <table class="itin-table itin-table-striped">
            <thead><tr><th>Time</th><th>Activity</th></tr></thead>
            <tbody>
              ${day.timeline.map(t => `
                <tr>
                  <td class="itin-timeline-time">${_esc(t.time || '')}</td>
                  <td>${_esc(t.activity || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '';

    // Travel details table
    const travelHtml = (day.travel_details && day.travel_details.length) ? `
      <div class="itin-day-block">
        <div class="itin-day-block-title">🚌 Travel Details</div>
        <div class="itin-table-wrap">
          <table class="itin-table itin-table-striped">
            <thead><tr><th>From</th><th>To</th><th>Distance</th><th>Time</th><th>Transport</th></tr></thead>
            <tbody>
              ${day.travel_details.map(t => `
                <tr>
                  <td>${_esc(t.from_place || '')}</td>
                  <td>${_esc(t.to_place   || '')}</td>
                  <td>${_esc(t.distance   || '')}</td>
                  <td>${_esc(t.est_time   || '')}</td>
                  <td>${_esc(t.transport  || '')}</td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>` : '';

    // Restaurant cards
    const restHtml = (day.restaurants && day.restaurants.length) ? `
      <div class="itin-day-block">
        <div class="itin-day-block-title">🍽️ Restaurant Picks</div>
        <div class="itin-restaurant-grid">
          ${day.restaurants.map(r => `
            <div class="itin-restaurant-card">
              <div class="itin-restaurant-name">${_esc(r.name)}</div>
              <div class="itin-restaurant-meta">
                <span class="itin-cuisine-chip">${_esc(r.cuisine)}</span>
                <span class="itin-cost-chip">&#8377; ${_esc(r.approx_cost)}</span>
              </div>
              <div class="itin-restaurant-why">👍 ${_esc(r.why)}</div>
            </div>`).join('')}
        </div>
      </div>` : '';

    // Daily cost mini cards
    const dc = day.daily_cost;
    let costHtml = '';
    if (dc) {
      const total = (dc.food || 0) + (dc.transport || 0) + (dc.tickets || 0) + (dc.shopping || 0);
      costHtml = '<div class="itin-day-block">'
        + '<div class="itin-day-block-title">💸 Daily Cost Estimate</div>'
        + '<div class="itin-daily-cost-grid">'
        + '<div class="itin-cost-chip-card"><span>🍽️</span><b>&#8377;' + _fmt(dc.food) + '</b><small>Food</small></div>'
        + '<div class="itin-cost-chip-card"><span>🚗</span><b>&#8377;' + _fmt(dc.transport) + '</b><small>Transport</small></div>'
        + '<div class="itin-cost-chip-card"><span>🎟️</span><b>&#8377;' + _fmt(dc.tickets) + '</b><small>Tickets</small></div>'
        + '<div class="itin-cost-chip-card"><span>🛍️</span><b>&#8377;' + _fmt(dc.shopping) + '</b><small>Shopping</small></div>'
        + '<div class="itin-cost-chip-card itin-cost-total"><span>💳</span><b>&#8377;' + _fmt(total) + '</b><small>Total</small></div>'
        + '</div></div>';
    }

    // Activities summary
    const activitiesHtml = `
      <div class="itin-day-activities">
        ${day.morning       ? `<div class="itin-act-row itin-morning"><span class="itin-act-icon">🌅</span><div><strong>Morning:</strong> ${_esc(day.morning)}</div></div>` : ''}
        ${day.breakfast     ? `<div class="itin-act-row"><span class="itin-act-icon">🍳</span><div><strong>Breakfast:</strong> ${_esc(day.breakfast)}</div></div>` : ''}
        ${day.mid_morning   ? `<div class="itin-act-row"><span class="itin-act-icon">🚶</span><div><strong>Mid-Morning:</strong> ${_esc(day.mid_morning)}</div></div>` : ''}
        ${day.sightseeing   ? `<div class="itin-act-row itin-sightseeing"><span class="itin-act-icon">🗺️</span><div><strong>Sightseeing:</strong> ${_esc(day.sightseeing)}</div></div>` : ''}
        ${day.travel_time   ? `<div class="itin-act-row itin-travel"><span class="itin-act-icon">🚗</span><div><strong>Travel:</strong> ${_esc(day.travel_time)}</div></div>` : ''}
        ${day.lunch         ? `<div class="itin-act-row"><span class="itin-act-icon">🍽️</span><div><strong>Lunch:</strong> ${_esc(day.lunch)}</div></div>` : ''}
        ${day.afternoon_activities ? `<div class="itin-act-row itin-afternoon"><span class="itin-act-icon">☀️</span><div><strong>Afternoon:</strong> ${_esc(day.afternoon_activities)}</div></div>` : ''}
        ${day.evening_activities   ? `<div class="itin-act-row itin-evening"><span class="itin-act-icon">🌆</span><div><strong>Evening:</strong> ${_esc(day.evening_activities)}</div></div>` : ''}
        ${day.dinner        ? `<div class="itin-act-row"><span class="itin-act-icon">🍴</span><div><strong>Dinner:</strong> ${_esc(day.dinner)}</div></div>` : ''}
        ${day.night         ? `<div class="itin-act-row"><span class="itin-act-icon">🌙</span><div><strong>Night:</strong> ${_esc(day.night)}</div></div>` : ''}
        ${day.hotel_stay    ? `<div class="itin-act-row itin-hotel-stay"><span class="itin-act-icon">🏨</span><div><strong>Stay:</strong> ${_esc(day.hotel_stay)}</div></div>` : ''}
      </div>`;

    return `
      <div class="itin-day-card">
        <button class="itin-day-header${isFirst ? ' open' : ''}"
                onclick="Itinerary._toggleDay('${id}', this)"
                aria-expanded="${isFirst}">
          <div class="itin-day-header-left">
            <span class="itin-day-number">Day ${day.day_number}</span>
            <span class="itin-day-date">${_esc(day.date)}</span>
          </div>
          <div class="itin-day-header-right">
            ${dc ? '<span class="itin-day-cost">&#8377;' + _fmt((dc.food||0)+(dc.transport||0)+(dc.tickets||0)+(dc.shopping||0)) + '</span>' : ''}
            <span class="itin-day-chevron">${isFirst ? '&#9650;' : '&#9660;'}</span>
          </div>
        </button>
        <div class="itin-day-body${isFirst ? ' open' : ''}" id="${id}">
          ${activitiesHtml}
          ${timelineHtml}
          ${travelHtml}
          ${restHtml}
          ${costHtml}
        </div>
      </div>`;
  }

  function _toggleDay(id, btn) {
    const body = document.getElementById(id);
    if (!body) return;
    const isOpen = body.classList.toggle('open');
    btn.classList.toggle('open', isOpen);
    btn.setAttribute('aria-expanded', isOpen);
    btn.querySelector('.itin-day-chevron').textContent = isOpen ? '▲' : '▼';
  }

  // ── Travel Tips section ───────────────────────────────────────────────────

  function _tipsSectionHtml(tips, destination) {
    const dest = _esc(destination || 'your destination');

    const sections = [
      {
        title: '🎒 Things to Carry',
        items: [
          'Valid photo ID / passport and visa documents',
          'Travel insurance documents',
          'Portable charger and universal adapter',
          'Lightweight rain jacket or umbrella',
          'Comfortable walking shoes',
        ],
      },
      {
        title: '🛡️ Safety Tips',
        items: [
          'Keep emergency contacts saved offline',
          'Avoid displaying expensive jewellery in crowded areas',
          'Use registered taxis or ride-hailing apps (Ola / Uber)',
          'Keep a photocopy of your passport in a separate bag',
        ],
      },
      {
        title: `🚌 Local Transport in ${dest}`,
        items: [
          'Ride-hailing apps are the most reliable option',
          'Auto-rickshaws for short distances — negotiate before boarding',
          'Pre-paid taxi counters available at most airports',
        ],
      },
      {
        title: '⏰ Best Time to Visit',
        items: [
          'Temples & monuments: 7 AM – 10 AM (before crowds)',
          'Beaches: early morning 6–8 AM or late evening 5–7 PM',
          'Markets & bazaars: afternoon onwards',
        ],
      },
    ];

    // Prepend real distilled tips if present
    if (tips && tips.length) {
      sections.unshift({
        title: '💡 General Tips',
        items: tips.slice(0, 5),
      });
    }

    const cols = sections.map(sec => `
      <div class="itin-tips-col">
        <div class="itin-tips-title">${sec.title}</div>
        <ul class="itin-tips-list">
          ${sec.items.map(i => `<li>${_esc(i)}</li>`).join('')}
        </ul>
      </div>`).join('');

    return `<div class="itin-tips-grid">${cols}</div>`;
  }

  // ── Progress tracker ──────────────────────────────────────────────────────

  function _progressTrackerHtml(isDraft, hasHotel) {
    const steps = [
      { icon: '✅', label: 'Requirements', done: true  },
      { icon: isDraft ? '⏳' : '✅', label: 'Flight',       done: !isDraft },
      { icon: isDraft ? '⏳' : '✅', label: 'Hotel',  done: !isDraft || hasHotel },
      { icon: '✅', label: 'Itinerary',    done: true  },
    ];
    const items = steps.map(s => `
      <div class="itin-progress-step ${s.done ? 'done' : 'pending'}">
        <span class="itin-progress-step-icon">${s.icon}</span>
        <span>${s.label}</span>
      </div>`).join('<div class="itin-progress-connector"></div>');

    return `<div class="itin-progress-tracker">${items}</div>`;
  }

  // ── Trip Summary section ──────────────────────────────────────────────────

  function _tripSummarySectionHtml(final, req, days, flight, prebook, prebooks) {
    const dest      = _esc(req && req.destination ? req.destination : '');
    const flightStr = flight && prebook
      ? `${_esc(flight.airline)} ${_esc(flight.flight_number)} — <code>${_esc(prebook.prebook_id)}</code>`
      : 'Not booked';
    const hotelStr  = prebooks && Object.keys(prebooks).length
      ? Object.values(prebooks).slice(0, 2).map(pb => _esc(pb.hotel.name)).join(', ')
      : 'Not booked';
    const actCount  = (final.days || []).reduce((sum, d) => {
      return sum + [d.sightseeing, d.mid_morning, d.afternoon_activities, d.evening_activities].filter(Boolean).length;
    }, 0);
    const status    = prebooks && Object.keys(prebooks).length
      ? 'Fully Booked (Demo)'
      : 'Flight Booked (Demo)';

    const rows = [
      { label: '📍 Destination',        value: dest },
      { label: '🌙 Duration',           value: `${days} days` },
      { label: '✈️ Flight',             value: flightStr },
      { label: '🏨 Hotel',              value: hotelStr },
      { label: '🎡 Activities Planned', value: `${actCount} activities across ${days} days` },
      { label: '💰 Approx Budget',      value: `&#8377;${_fmt(final.total_cost)}` },
      { label: '📋 Booking Status',     value: status },
    ];

    const recommendation = dest
      ? `<div class="itin-recommendation">
           <strong>🌟 Overall Recommendation:</strong> ${dest} is an excellent choice for a
           ${_cleanEnum(req && req.trip_type)} trip. Pre-book popular attractions and restaurants
           for a seamless experience.
         </div>`
      : '';

    return `
      <table class="itin-table itin-table-striped">
        ${rows.map(r => `<tr><th>${r.label}</th><td>${r.value}</td></tr>`).join('')}
      </table>
      ${recommendation}`;
  }

  // ── Main render: Draft ────────────────────────────────────────────────────

  function renderDraft(draft) {
    const el = document.getElementById('draft-content');
    if (!el) return;
    _accordionId  = 0;
    _renderPrefix = 'draft';

    // draft._req is injected by app.js (trip requirements mirror)
    const req       = draft._req || {};
    const days      = _calcDays(req.departure_date, req.return_date) || (draft.days || []).length || 1;
    const destName  = (req.destination || 'Your').charAt(0).toUpperCase() + (req.destination || 'Your').slice(1);

    let html = '';
    html += _progressTrackerHtml(true, false);
    html += _tripHeaderHtml({ ...draft, _req: req, trip_title: `✈️ ${destName} Travel Itinerary` }, true);

    // Next-steps banner — flights & hotels are selected AFTER this draft,
    // so the draft intentionally shows no flight or hotel details.
    html += `
      <div class="itin-next-steps">
        <div class="itin-next-steps-title">🗺️ Your travel plan is ready</div>
        <p class="itin-next-steps-text">This draft covers your day-by-day plan, attractions, restaurants and budget.</p>
        <p class="itin-next-steps-text">
          ✈️ <strong>Flight</strong> &amp; 🏨 <strong>hotel</strong> details will be added
          after you select them in the next steps.
        </p>
      </div>`;

    html += _accordion('💰', 'Budget Breakdown',       'section-budget',    _budgetSectionHtml(draft.budget_breakdown, req.budget), true);
    html += _accordion('🌤️', 'Weather Forecast',       'section-weather',   _weatherSectionHtml(draft.weather),                    false);
    html += _accordion('🌟', 'Destination Highlights', 'section-highlights',_highlightsSectionHtml(draft._web_data),               false);

    // Day plans
    const dayCardsHtml = (draft.days || []).map((d, i) => _dayCardHtml(d, i)).join('');
    html += _accordion('📅', 'Day-by-Day Itinerary',  'section-days',      `<div class="itin-day-list">${dayCardsHtml}</div>`,     true);

    html += _accordion('💡', 'Travel Tips',            'section-tips',      _tipsSectionHtml(draft.travel_tips, req.destination),  false);

    el.innerHTML = html;
  }

  // ── Main render: Final ────────────────────────────────────────────────────

  function renderFinal(final) {
    const el = document.getElementById('final-content');
    if (!el) return;
    _accordionId  = 0;
    _renderPrefix = 'final';

    const req      = final._req      || {};
    const flight   = final._flight   || null;
    const prebook  = final._prebook  || null;
    const prebooks = final._prebooks || {};
    const days     = _calcDays(req.departure_date, req.return_date) || (final.days || []).length || 1;

    let html = '';
    html += _progressTrackerHtml(false, true);
    html += _tripHeaderHtml({ ...final, _req: req }, false);

    html += _accordion('✈️', 'Flight Information',     'section-flight',    _flightSectionHtml(flight, prebook),                    true);
    html += _accordion('🏨', 'Hotel Information',      'section-hotel',     _hotelSectionHtml(prebooks),                          true);
    html += _accordion('💰', 'Budget Breakdown',       'section-budget',    _budgetSectionHtml(final.budget_breakdown, final.total_cost), true);
    html += _accordion('🌤️', 'Weather Forecast',       'section-weather',   _weatherSectionHtml(final.weather),                   false);
    html += _accordion('🌟', 'Destination Highlights', 'section-highlights',_highlightsSectionHtml(final._web_data),              false);

    const dayCardsHtml = (final.days || []).map((d, i) => _dayCardHtml(d, i)).join('');
    html += _accordion('📅', 'Day-by-Day Itinerary',  'section-days',      `<div class="itin-day-list">${dayCardsHtml}</div>`,    true);

    html += _accordion('💡', 'Travel Tips',            'section-tips',      _tipsSectionHtml(final.travel_tips, req.destination), false);
    html += _accordion('📋', 'Trip Summary',           'section-summary',   _tripSummarySectionHtml(final, req, days, flight, prebook, prebooks), true);

    el.innerHTML = html;
  }

  // ── Download ──────────────────────────────────────────────────────────────

  function download(itinerary, filename) {
    const md   = itinerary.markdown || `# ${itinerary.trip_title || 'Itinerary'}\n\n${itinerary.trip_summary || ''}`;
    const name = filename
      || (itinerary.trip_title || 'itinerary').replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_') + '.md';
    const blob = new Blob([md], { type: 'text/markdown' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ── Comparison renderer ───────────────────────────────────────────────────

  /**
   * renderComparison(comparison, onKeepOriginal, onUseUpdated)
   *
   * Renders a full side-by-side comparison of two itinerary versions into
   * #compare-content.
   *
   * @param {object}   comparison   — the build_comparison() response from the backend
   * @param {function} onKeepOriginal — called when user clicks "Keep Original"
   * @param {function} onUseUpdated  — called when user clicks "Use Updated"
   */
  function renderComparison(comparison, onKeepOriginal, onUseUpdated) {
    const el = document.getElementById('compare-content');
    if (!el) return;

    const v1    = comparison.v1 || {};
    const v2    = comparison.v2 || {};
    const diff  = comparison.diff || {};
    const count = comparison.changes_count || 0;
    const benefits = diff.budget_benefits || [];

    const tableRows = _buildComparisonTableRows(diff, v1, v2);

    const v1Label = _esc(v1.label || `Version ${v1.version_number}`);
    const v2Label = _esc(v2.label || `Version ${v2.version_number}`);

    // Build benefits section
    let benefitsHTML = '';
    if (benefits.length > 0) {
      const benefitCards = benefits.map(b => {
        const typeClass = b.type === 'upgrade' ? 'cmp-benefit-upgrade'
                        : b.type === 'downgrade' ? 'cmp-benefit-downgrade'
                        : 'cmp-benefit-change';
        return `<div class="cmp-benefit-card ${typeClass}">
          <div class="cmp-benefit-icon">${b.icon}</div>
          <div class="cmp-benefit-info">
            <div class="cmp-benefit-title">${_esc(b.title)}</div>
            <div class="cmp-benefit-desc">${_esc(b.description)}</div>
          </div>
        </div>`;
      }).join('');

      benefitsHTML = `
        <div class="cmp-section cmp-benefits-section">
          <div class="cmp-section-title">✨ What You Get Extra</div>
          <div class="cmp-benefits-grid">${benefitCards}</div>
        </div>`;
    }

    el.innerHTML = `
      <div class="cmp-container">

        <div class="cmp-summary-row">
          <div class="cmp-summary-title">
            <span class="cmp-badge cmp-badge-info">${count} change${count !== 1 ? 's' : ''}</span>
            <span class="cmp-summary-label">v${v1.version_number} → v${v2.version_number}</span>
          </div>
        </div>

        <div class="cmp-section">
          <div class="cmp-table-wrap">
            <table class="cmp-table">
              <thead>
                <tr>
                  <th class="cmp-th-feature">Feature</th>
                  <th class="cmp-th-v1">v${v1.version_number}</th>
                  <th class="cmp-th-v2">v${v2.version_number}</th>
                </tr>
              </thead>
              <tbody>${tableRows}</tbody>
            </table>
          </div>
        </div>

        ${benefitsHTML}

        <div class="cmp-actions">
          <div class="cmp-action-buttons">
            <button class="btn cmp-btn-keep" id="btn-keep-original">
              <span class="cmp-btn-icon">←</span>
              <div class="cmp-btn-text">
                <strong>Keep Original</strong>
                <small>v${v1.version_number}</small>
              </div>
            </button>
            <button class="btn cmp-btn-use" id="btn-use-updated">
              <div class="cmp-btn-text">
                <strong>Use Updated</strong>
                <small>v${v2.version_number}</small>
              </div>
              <span class="cmp-btn-icon">→</span>
            </button>
          </div>
        </div>

      </div>`;

    document.getElementById('btn-keep-original')?.addEventListener('click', () => {
      _highlightSelection('v1');
      if (typeof onKeepOriginal === 'function') onKeepOriginal(v1.version_number);
    });
    document.getElementById('btn-use-updated')?.addEventListener('click', () => {
      _highlightSelection('v2');
      if (typeof onUseUpdated === 'function') onUseUpdated(v2.version_number);
    });
  }

  function _highlightSelection(chosen) {
    const keepBtn = document.getElementById('btn-keep-original');
    const useBtn  = document.getElementById('btn-use-updated');
    if (!keepBtn || !useBtn) return;
    keepBtn.classList.toggle('cmp-btn-selected', chosen === 'v1');
    useBtn.classList.toggle('cmp-btn-selected',  chosen === 'v2');
    keepBtn.classList.toggle('cmp-btn-dimmed', chosen === 'v2');
    useBtn.classList.toggle('cmp-btn-dimmed',  chosen === 'v1');
  }

  // Build summary change chips ("+4 Activities", "₹15,000 Budget Increase", etc.)
  function _buildSummaryChips(diff) {
    const chips = [];

    const actDiff = diff.activities_count?.diff || 0;
    if (actDiff > 0)  chips.push({ cls: 'chip-added',    text: `+${actDiff} Activities` });
    if (actDiff < 0)  chips.push({ cls: 'chip-removed',  text: `${actDiff} Activities` });

    const restDiff = diff.restaurants_count?.diff || 0;
    if (restDiff > 0) chips.push({ cls: 'chip-added',    text: `+${restDiff} Restaurants` });
    if (restDiff < 0) chips.push({ cls: 'chip-removed',  text: `${restDiff} Restaurants` });

    const budgetDiff = diff.budget?.diff || 0;
    if (budgetDiff > 0) chips.push({ cls: 'chip-modified', text: `+₹${_fmt(Math.abs(budgetDiff))} Budget` });
    if (budgetDiff < 0) chips.push({ cls: 'chip-modified', text: `-₹${_fmt(Math.abs(budgetDiff))} Budget` });

    const daysDiff = diff.days?.diff || 0;
    if (daysDiff > 0) chips.push({ cls: 'chip-added',    text: `+${daysDiff} Day${daysDiff > 1 ? 's' : ''}` });
    if (daysDiff < 0) chips.push({ cls: 'chip-removed',  text: `${daysDiff} Day${Math.abs(daysDiff) > 1 ? 's' : ''}` });

    if (diff.destination?.changed) chips.push({ cls: 'chip-modified', text: '📍 Destination Changed' });
    if (diff.hotel?.changed)       chips.push({ cls: 'chip-modified', text: '🏨 Hotel Changed' });
    if (diff.transport?.changed)   chips.push({ cls: 'chip-modified', text: '🚗 Transport Changed' });

    if (diff.airport_transfer?.changed) {
      const added = diff.airport_transfer.v2 && !diff.airport_transfer.v1;
      chips.push({ cls: added ? 'chip-added' : 'chip-removed', text: added ? '✈️ Airport Transfer Added' : '✈️ Airport Transfer Removed' });
    }

    const costDiff = diff.daily_cost_avg?.diff || 0;
    if (Math.abs(costDiff) > 100) {
      chips.push({
        cls: costDiff > 0 ? 'chip-modified' : 'chip-added',
        text: costDiff > 0 ? `+₹${_fmt(Math.abs(costDiff))} Daily Cost` : `-₹${_fmt(Math.abs(costDiff))} Daily Cost`,
      });
    }

    if (!chips.length) chips.push({ cls: 'chip-added', text: '✨ New Version' });

    return chips.map(c => `<span class="cmp-chip ${c.cls}">${c.text}</span>`).join('');
  }

  // Build comparison table rows
  function _buildComparisonTableRows(diff, v1Meta, v2Meta) {
    const rows = [
      {
        icon: '💰', feature: 'Budget',
        v1: diff.budget?.v1 != null ? `₹${_fmt(diff.budget.v1)}` : '—',
        v2: diff.budget?.v2 != null ? `₹${_fmt(diff.budget.v2)}` : '—',
        changed: diff.budget?.changed,
        indicator: diff.budget?.diff ? (diff.budget.diff > 0 ? '▲' : '▼') : '',
      },
      {
        icon: '📍', feature: 'Destination',
        v1: _esc(diff.destination?.v1 || '—'),
        v2: _esc(diff.destination?.v2 || '—'),
        changed: diff.destination?.changed,
      },
      {
        icon: '🌙', feature: 'Days',
        v1: diff.days?.v1 != null ? `${diff.days.v1} days` : '—',
        v2: diff.days?.v2 != null ? `${diff.days.v2} days` : '—',
        changed: diff.days?.changed,
        indicator: diff.days?.diff ? (diff.days.diff > 0 ? `+${diff.days.diff}` : `${diff.days.diff}`) : '',
      },
      {
        icon: '🏨', feature: 'Hotel',
        v1: _esc((diff.hotel?.v1 || '').slice(0, 50) || '—'),
        v2: _esc((diff.hotel?.v2 || '').slice(0, 50) || '—'),
        changed: diff.hotel?.changed,
      },
      {
        icon: '🎡', feature: 'Activities',
        v1: diff.activities_count?.v1 != null ? `${diff.activities_count.v1}` : '—',
        v2: diff.activities_count?.v2 != null ? `${diff.activities_count.v2}` : '—',
        changed: diff.activities_count?.changed,
        indicator: diff.activities_count?.diff ? (diff.activities_count.diff > 0 ? `+${diff.activities_count.diff}` : `${diff.activities_count.diff}`) : '',
      },
      {
        icon: '🍽️', feature: 'Restaurants',
        v1: diff.restaurants_count?.v1 != null ? `${diff.restaurants_count.v1}` : '—',
        v2: diff.restaurants_count?.v2 != null ? `${diff.restaurants_count.v2}` : '—',
        changed: diff.restaurants_count?.changed,
        indicator: diff.restaurants_count?.diff ? (diff.restaurants_count.diff > 0 ? `+${diff.restaurants_count.diff}` : `${diff.restaurants_count.diff}`) : '',
      },
      {
        icon: '🚗', feature: 'Transport',
        v1: _esc(diff.transport?.v1 || '—'),
        v2: _esc(diff.transport?.v2 || '—'),
        changed: diff.transport?.changed,
      },
      {
        icon: '✈️', feature: 'Airport Transfer',
        v1: diff.airport_transfer?.v1 ? '✅ Yes' : '❌ No',
        v2: diff.airport_transfer?.v2 ? '✅ Yes' : '❌ No',
        changed: diff.airport_transfer?.changed,
      },
      {
        icon: '📈', feature: 'Avg Daily Cost',
        v1: diff.daily_cost_avg?.v1 != null ? `₹${_fmt(diff.daily_cost_avg.v1)}` : '—',
        v2: diff.daily_cost_avg?.v2 != null ? `₹${_fmt(diff.daily_cost_avg.v2)}` : '—',
        changed: diff.daily_cost_avg?.changed,
        indicator: diff.daily_cost_avg?.diff ? (diff.daily_cost_avg.diff > 0 ? `+₹${_fmt(Math.abs(diff.daily_cost_avg.diff))}` : `-₹${_fmt(Math.abs(diff.daily_cost_avg.diff))}`) : '',
      },
    ];

    return rows.map(r => `
      <tr class="${r.changed ? 'cmp-row-changed' : ''}">
        <td class="cmp-td-feature">${r.icon} ${r.feature}</td>
        <td class="cmp-td-v1 ${r.changed ? 'cmp-cell-old' : ''}">${r.v1}</td>
        <td class="cmp-td-v2 ${r.changed ? 'cmp-cell-new' : ''}">
          ${r.v2}
          ${r.indicator ? `<span class="cmp-indicator">${r.indicator}</span>` : ''}
          ${r.changed ? '<span class="cmp-changed-dot">●</span>' : ''}
        </td>
      </tr>`).join('');
  }

  // Build the detail sections (added/removed activities, restaurant changes, etc.)
  function _buildDetailSections(diff) {
    const sections = [];

    // Activities
    const addedActs   = diff.added_activities   || [];
    const removedActs = diff.removed_activities || [];
    if (addedActs.length || removedActs.length) {
      let html = '<div class="cmp-detail-cols">';
      if (addedActs.length) {
        html += `<div class="cmp-detail-col">
          <div class="cmp-detail-col-title cmp-added-title">✅ Added Activities (${addedActs.length})</div>
          <ul class="cmp-detail-list cmp-added-list">
            ${addedActs.map(a => `<li>${_esc(a.slice(0, 100))}</li>`).join('')}
          </ul>
        </div>`;
      }
      if (removedActs.length) {
        html += `<div class="cmp-detail-col">
          <div class="cmp-detail-col-title cmp-removed-title">❌ Removed Activities (${removedActs.length})</div>
          <ul class="cmp-detail-list cmp-removed-list">
            ${removedActs.map(a => `<li>${_esc(a.slice(0, 100))}</li>`).join('')}
          </ul>
        </div>`;
      }
      html += '</div>';
      sections.push({ icon: '🎡', title: 'Activity Changes', html });
    }

    // Restaurants
    const addedRests   = diff.added_restaurants   || [];
    const removedRests = diff.removed_restaurants || [];
    if (addedRests.length || removedRests.length) {
      let html = '<div class="cmp-detail-cols">';
      if (addedRests.length) {
        html += `<div class="cmp-detail-col">
          <div class="cmp-detail-col-title cmp-added-title">✅ Added (${addedRests.length})</div>
          <ul class="cmp-detail-list cmp-added-list">
            ${addedRests.map(r => `<li>🍽️ ${_esc(r)}</li>`).join('')}
          </ul>
        </div>`;
      }
      if (removedRests.length) {
        html += `<div class="cmp-detail-col">
          <div class="cmp-detail-col-title cmp-removed-title">❌ Removed (${removedRests.length})</div>
          <ul class="cmp-detail-list cmp-removed-list">
            ${removedRests.map(r => `<li>🍽️ ${_esc(r)}</li>`).join('')}
          </ul>
        </div>`;
      }
      html += '</div>';
      sections.push({ icon: '🍽️', title: 'Restaurant Changes', html });
    }

    // Budget breakdown comparison
    const bb = diff.budget_breakdown || {};
    if (bb.v1 || bb.v2) {
      const v1bb = bb.v1 || {};
      const v2bb = bb.v2 || {};
      const cats = [
        { key: 'flights',    icon: '✈️', label: 'Flights' },
        { key: 'hotel',      icon: '🏨', label: 'Hotel' },
        { key: 'food',       icon: '🍽️', label: 'Food' },
        { key: 'transport',  icon: '🚗', label: 'Transport' },
        { key: 'activities', icon: '🎡', label: 'Activities' },
        { key: 'shopping',   icon: '🛍️', label: 'Shopping' },
        { key: 'buffer',     icon: '🛡️', label: 'Buffer' },
      ];
      const bbRows = cats.map(c => {
        const old = v1bb[c.key] || 0;
        const nw  = v2bb[c.key] || 0;
        const d   = nw - old;
        const changed = Math.abs(d) > 1;
        return `<tr class="${changed ? 'cmp-row-changed' : ''}">
          <td>${c.icon} ${c.label}</td>
          <td>₹${_fmt(old)}</td>
          <td>₹${_fmt(nw)} ${changed ? `<span class="cmp-indicator">${d > 0 ? '+' : ''}₹${_fmt(Math.abs(d))}</span>` : ''}</td>
        </tr>`;
      }).join('');
      const html = `<div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead><tr><th>Category</th><th>Original</th><th>Updated</th></tr></thead>
          <tbody>${bbRows}</tbody>
        </table>
      </div>`;
      sections.push({ icon: '💰', title: 'Budget Breakdown Comparison', html });
    }

    // Requirements changes
    const reqChanges = diff.req_changes || {};
    if (Object.keys(reqChanges).length) {
      const fieldLabels = {
        budget:           '💰 Budget',
        destination:      '📍 Destination',
        departure_date:   '📅 Departure',
        return_date:      '📅 Return',
        num_travelers:    '👥 Travellers',
        trip_type:        '🎯 Trip Type',
        special_requests: '📝 Special Requests',
      };
      const reqRows = Object.entries(reqChanges).map(([field, change]) => `
        <tr class="cmp-row-changed">
          <td>${fieldLabels[field] || field}</td>
          <td class="cmp-cell-old">${_esc(String(change.from ?? '—'))}</td>
          <td class="cmp-cell-new">${_esc(String(change.to ?? '—'))} <span class="cmp-changed-dot">●</span></td>
        </tr>`).join('');
      const html = `<div class="cmp-table-wrap">
        <table class="cmp-table">
          <thead><tr><th>Field</th><th>Original</th><th>Updated</th></tr></thead>
          <tbody>${reqRows}</tbody>
        </table>
      </div>`;
      sections.push({ icon: '📋', title: 'Trip Requirements Changes', html });
    }

    if (!sections.length) return '';

    return sections.map(s => `
      <div class="cmp-section">
        <div class="cmp-section-title">${s.icon} ${s.title}</div>
        ${s.html}
      </div>`).join('');
  }

  // ── Version History renderer ──────────────────────────────────────────────

  /**
   * renderVersionHistory(versions, activeVersion, onSelectVersion)
   *
   * Renders the version list into #modal-version-history-body.
   *
   * @param {Array}    versions       — array of ItineraryVersionSummary objects
   * @param {number}   activeVersion  — currently active version_number
   * @param {function} onSelectVersion — called with version_number when user clicks a version
   */
  function renderVersionHistory(versions, activeVersion, onSelectVersion) {
    const el = document.getElementById('modal-version-history-body');
    if (!el) return;

    if (!versions || !versions.length) {
      el.innerHTML = '<p class="itin-empty">No versions saved yet.</p>';
      return;
    }

    const items = versions.slice().reverse().map(v => {
      const isActive = v.version_number === activeVersion;
      const time     = v.created_at
        ? new Date(v.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
        : '';
      const req      = v.trip_requirements || {};

      const meta = [
        req.destination  && `📍 ${req.destination}`,
        req.budget       && `💰 ₹${Number(req.budget).toLocaleString('en-IN')}`,
        req.departure_date && req.return_date && `📅 ${req.departure_date} → ${req.return_date}`,
      ].filter(Boolean);

      return `
        <div class="vh-item ${isActive ? 'vh-item-active' : ''}">
          <div class="vh-item-left">
            <div class="vh-version-badge ${isActive ? 'vh-badge-active' : 'vh-badge-default'}">
              V${v.version_number}
            </div>
            <div class="vh-item-info">
              <div class="vh-item-label">
                ${_esc(v.label)}
                ${isActive ? '<span class="vh-active-chip">✓ Active</span>' : ''}
              </div>
              <div class="vh-item-time">${time}</div>
              ${meta.length ? `<div class="vh-item-meta">${meta.map(m => `<span>${_esc(m)}</span>`).join('')}</div>` : ''}
            </div>
          </div>
          <div class="vh-item-actions">
            ${!isActive ? `
              <button class="btn btn-outline btn-sm vh-btn-restore"
                      data-version="${v.version_number}"
                      aria-label="Restore Version ${v.version_number}">
                Restore
              </button>` : '<span class="vh-current-label">Current</span>'}
          </div>
        </div>`;
    }).join('');

    el.innerHTML = `
      <div class="vh-header-note">
        <strong>${versions.length} version${versions.length !== 1 ? 's' : ''}</strong> saved.
        Versions are immutable — restoring sets the selected version as active without deleting others.
      </div>
      <div class="vh-list">${items}</div>`;

    // Wire restore buttons
    el.querySelectorAll('.vh-btn-restore').forEach(btn => {
      btn.addEventListener('click', () => {
        const vNum = parseInt(btn.dataset.version, 10);
        if (typeof onSelectVersion === 'function') onSelectVersion(vNum);
      });
    });
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    renderDraft,
    renderFinal,
    renderComparison,
    renderVersionHistory,
    download,
    _toggleSection,
    _toggleDay,
  };
})();
