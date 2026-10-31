/* roam Travel Guide: per-trip, device-local preparation. No checkout or coverage is inferred. */
(() => {
  'use strict';
  if (window.RoamGuide || typeof S === 'undefined') return;
  const KEY = 'roam.travel-guide.v1';
  const icon = name => `<i data-lucide="${({ "sim-card":"smartphone", "suitcase-rolling":"luggage", "shield-heart":"shield-check", "mobile-screen-button":"smartphone", "triangle-exclamation":"triangle-alert", "arrow-up-right-from-square":"arrow-up-right", "xmark":"x", "bed":"bed-double" })[name] || name}" aria-hidden="true"></i>`;
  const html = esc;
  const copy = value => structuredClone(value);
  const dayMs = 86400000;
  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && Number.isFinite(Date.parse(value + 'T00:00:00Z'));
  const nights = (a, b) => validDate(a) && validDate(b) ? Math.max(0, Math.round((dateUTC(b) - dateUTC(a)) / dayMs)) : 0;
  const datePlus = (value, amount) => new Date(dateUTC(value) + amount * dayMs).toISOString().slice(0, 10);
  const nice = value => validDate(value) ? new Date(dateUTC(value)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }) : 'Choose dates';
  const base = { trip, trips, render, sheetContent, snapshotTrip, persistActiveTrip, openSavedTrip, generate, addTemplateTrip };
  let guides = Object.create(null), storageOK = true, editor = null, error = '', remaining = false;
  const prep = [
    ['documents', 'Check travel documents', 'Review passport or ID validity and official entry requirements.'],
    ['offline', 'Keep the essentials offline', 'Save your tickets, accommodation confirmations and important contacts.'],
    ['arrival', 'Plan your arrival', 'Work out how to reach your first stay and check its check-in time.']
  ];
  const sections = {
    packing: ['suitcase-rolling', 'Your packing list', 'A little preparation. A lot less forgetting.'],
    stays: ['bed', 'Where you\'re staying', 'Give every night a place to land.'],
    esim: ['sim-card', 'Stay connected', 'Sort your mobile data before you go.'],
    insurance: ['shield-heart', 'Travel insurance', 'Explore options, then review the details with the provider.']
  };

  try {
    const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
    if (saved && saved.version === 1) {
      if (saved.guides && typeof saved.guides === 'object' && !Array.isArray(saved.guides)) guides = Object.assign(Object.create(null), saved.guides);
      if (Array.isArray(saved.trips)) {
        const currentIds = new Set(S.savedTrips.map(t => t.id));
        S.savedTrips.push(...saved.trips.filter(t => t && typeof t.id === 'string' && /^[a-zA-Z0-9_-]+$/.test(t.id) && Array.isArray(t.activities) && typeof t.destination === 'string' && validDate(t.startDate) && validDate(t.endDate) && t.days >= 1 && t.days <= 30 && !currentIds.has(t.id)).slice(0, 100));
      }
    }
  } catch (_) { storageOK = false; }

  function saveDisk() {
    try {
      localStorage.setItem(KEY, JSON.stringify({ version: 1, trips: S.savedTrips, guides }));
      storageOK = true;
    } catch (_) { storageOK = false; }
  }
  function packingDefaults() {
    const list = [
      ['passport', 'Documents', 'Passport or photo ID'], ['confirmations', 'Documents', 'Tickets and booking confirmations'],
      ['wallet', 'Documents', 'Payment cards and travel wallet'], ['phone', 'Tech', 'Phone and charger'],
      ['adapter', 'Tech', 'Compatible power adapter'], ['powerbank', 'Tech', 'Power bank and charging cable'],
      ['clothes', 'Clothes', 'Outfits for ' + S.days + ' days'], ['underwear', 'Clothes', 'Underwear and socks'],
      ['shoes', 'Clothes', 'Comfortable walking shoes'], ['layers', 'Clothes', 'Layers for the forecast'],
      ['washbag', 'Personal care', 'Toiletries and toothbrush'], ['personal', 'Personal care', 'Personal essentials and prescribed medicines'],
      ['daybag', 'Day bag', 'Small day bag'], ['bottle', 'Day bag', 'Reusable water bottle']
    ];
    if (S.hasKids === true) {
      list.push(['kids-docs', 'For the kids', 'Children\'s travel documents'], ['kids-spare', 'For the kids', 'Spare outfits and snacks'], ['kids-comfort', 'For the kids', 'Favorite comfort item or activity']);
      if ((S.kidAges || []).some(age => ['0\u20132', '3\u20135', '0-2', '3-5'].includes(age))) list.push(['kids-stroller', 'For the kids', 'Stroller or carrier, if needed'], ['kids-care', 'For the kids', 'Nappies, wipes and feeding essentials, if needed']);
    }
    return list.map(([id, group, text]) => ({ id, group, text, done: false, custom: false }));
  }
  function state() {
    if (!S.activeTripId) S.activeTripId = uid();
    let g = guides[S.activeTripId];
    if (!g || !Array.isArray(g.items) || !Array.isArray(g.stays)) {
      g = guides[S.activeTripId] = {
        items: packingDefaults(), prep: {}, esim: {}, insurance: {},
        stays: nights(S.startDate, S.endDate) ? [{ id: uid(), city: S.destination, area: '', name: '', start: S.startDate, end: S.endDate, booked: false }] : []
      };
    }
    g.prep ||= {}; g.esim ||= {}; g.insurance ||= {};
    return g;
  }
  function metrics(g = state()) {
    const totalNights = nights(S.startDate, S.endDate), planned = new Set(), booked = new Set();
    for (const stay of g.stays) {
      if (!validDate(stay.start) || !validDate(stay.end) || !stay.city) continue;
      for (let i = 0; i < Math.min(nights(stay.start, stay.end), 31); i++) {
        const date = datePlus(stay.start, i);
        if (date >= S.startDate && date < S.endDate) { planned.add(date); if (stay.booked) booked.add(date); }
      }
    }
    const packed = g.items.filter(item => item.done).length;
    const done = {
      packing: g.items.length > 0 && packed === g.items.length,
      stays: totalNights === 0 || booked.size === totalNights,
      esim: Boolean(g.esim.compatible && g.esim.arranged && g.esim.instructions),
      insurance: Boolean(g.insurance.reviewed && g.insurance.arranged)
    };
    return { totalNights, planned: planned.size, booked: booked.size, packed, done,
      completed: Object.values(done).filter(Boolean).length + prep.filter(([key]) => g.prep[key]).length, total: 7 };
  }
  function refresh() {
    const body = document.querySelector('.vaul-scroll-body');
    const top = body?.scrollTop || 0, y = window.scrollY, focus = document.activeElement?.id;
    persistActiveTrip(); render();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const next = document.querySelector('.vaul-scroll-body');
      if (next) next.scrollTop = top;
      if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
      window.scrollTo(0, y);
    }));
  }
  function external(url, title, subtitle, symbol = 'arrow-up-right-from-square') {
    return `<a class="guide-provider" href="${html(url)}" target="_blank" rel="noopener noreferrer" aria-label="${html(title + ' (opens a new tab)')}"><span><strong>${html(title)}</strong><small>${html(subtitle)}</small></span>${icon(symbol)}</a>`;
  }
  function check(scope, key, title, sub, checked) {
    return `<label class="guide-check"><input type="checkbox" id="guide-${scope}-${html(key)}" data-guide-check="${scope}" data-key="${html(key)}" ${checked ? 'checked' : ''}><span><strong>${html(title)}</strong>${sub ? `<small>${html(sub)}</small>` : ''}</span></label>`;
  }
  function dashboard() {
    const g = state(), m = metrics(g), percent = Math.round(m.completed / m.total * 100);
    const summaries = {
      packing: `${m.packed} of ${g.items.length} items packed`,
      stays: m.totalNights ? `${m.booked} of ${m.totalNights} nights marked booked` : 'No overnight stay needed',
      esim: m.done.esim ? 'Mobile data is sorted' : 'Compare plans or use your own roaming',
      insurance: m.done.insurance ? 'Cover marked as arranged' : 'Explore quotes or check existing cover'
    };
    return `<section class="travel-guide" aria-labelledby="guide-title"><div class="guide-intro"><h2 id="guide-title">Before you go.</h2><p>The little things that make a big difference.</p></div><div class="guide-readiness"><div class="guide-readiness-top"><span class="guide-ready-icon">${icon('list-check')}</span><div><strong>${m.completed === m.total ? 'Your checklist is complete' : 'Let\'s get you ready'}</strong><small>${m.completed} of ${m.total} preparations complete</small></div><span class="guide-percent">${percent}%</span></div><progress max="${m.total}" value="${m.completed}" aria-label="Preparation progress"></progress><p>Your checklist, not a booking confirmation.</p></div><h3 class="guide-label">TRIP ESSENTIALS</h3><div class="guide-list">${Object.entries(sections).map(([key, [symbol, title]]) => `<button type="button" class="guide-row" data-guide-open="${key}"><span class="guide-symbol ${key}">${icon(symbol)}</span><span class="guide-row-copy"><strong>${title}</strong><small>${html(summaries[key])}</small></span><span class="guide-row-end">${m.done[key] ? icon('circle-check') : icon('chevron-right')}</span></button>`).join('')}</div><h3 class="guide-label">A FEW MORE THINGS</h3><div class="guide-list guide-check-list">${prep.map(([key, title, sub]) => check('prep', key, title, sub, g.prep[key])).join('')}</div><p class="guide-local" ${storageOK ? '' : 'role="alert"'}>${icon(storageOK ? 'mobile-screen-button' : 'triangle-exclamation')} ${storageOK ? 'Saved on this device, separately for each trip.' : 'Browser storage is unavailable. Changes will only last for this session.'}</p></section>`;
  }
  function packingSheet() {
    const g = state(), m = metrics(g);
    const groups = [...new Set(g.items.map(item => item.group))];
    return `<div class="guide-pack-summary"><strong>${m.packed}<span> / ${g.items.length} packed</span></strong><button type="button" class="guide-text-button" data-guide-action="filter" aria-pressed="${remaining}">${remaining ? 'Show all' : 'Show remaining'}</button></div><progress class="guide-pack-progress" value="${m.packed}" max="${Math.max(1, g.items.length)}" aria-label="Packing progress"></progress>${groups.map(group => {
      const items = g.items.filter(item => item.group === group && (!remaining || !item.done));
      return items.length ? `<h3 class="guide-label">${html(group)}</h3><div class="guide-list">${items.map(item => `<div class="guide-pack-row ${item.done ? 'is-done' : ''}">${check('packing', item.id, item.text, '', item.done)}${item.custom ? `<button class="guide-delete" data-guide-remove-item="${html(item.id)}" aria-label="${html('Remove ' + item.text)}">${icon('xmark')}</button>` : ''}</div>`).join('')}</div>` : '';
    }).join('')}${remaining && m.packed === g.items.length ? `<p class="guide-empty">${icon('circle-check')} Everything on your list is packed.</p>` : ''}<form class="guide-add-item" id="guide-item-form"><label class="field" for="guide-new-item">Something else to bring?</label><div><input class="input" id="guide-new-item" name="item" placeholder="e.g. Camera or favorite book" maxlength="80" required autocomplete="off"><button type="submit" class="btn" aria-label="Add packing item">${icon('plus')}</button></div></form><p class="guide-note">A starting list for ${S.days} days${S.hasKids ? ' with children' : ''}. Add personal essentials and check the forecast before packing.</p>`;
  }
  function connectivitySheet() {
    const g = state();
    const destination = (typeof travelTemplates !== 'undefined' && travelTemplates.find(t => t.city.toLowerCase() === S.destination.toLowerCase())?.country) || S.destination;
    return `<div class="guide-context">${icon('earth-europe')} ${html(destination)} <span>&middot; ${S.days} days</span></div><div class="guide-list">${external('https://www.airalo.com/', 'Airalo', 'Browse destination, regional and global eSIM plans')}${external('https://esim.holafly.com/', 'Holafly', 'Choose a destination and trip duration')}</div><p class="guide-note">Purchase on the provider's website. Check data allowance, validity, hotspot support and every country you will visit. Prices and availability are set by the provider.</p><h3 class="guide-label">GET CONNECTED IN THREE STEPS</h3><div class="guide-list guide-check-list">${check('esim', 'compatible', 'Check your phone', 'Confirm eSIM support and that your phone is carrier-unlocked.', g.esim.compatible)}${check('esim', 'arranged', 'Arrange your data plan', 'Buy an eSIM or confirm that your existing roaming covers the trip.', g.esim.arranged)}${check('esim', 'instructions', 'Save the activation instructions', 'Follow your provider\'s installation and activation timing.', g.esim.instructions)}</div><div class="guide-link-line">${external('https://www.airalo.com/how-airalo-works/device-compatibility', 'Check device compatibility', 'View Airalo\'s compatibility guide', 'arrow-up-right-from-square')}</div>`;
  }
  function insuranceSheet() {
    const g = state();
    return `<div class="guide-context">${icon('calendar-days')} ${html(nice(S.startDate))} &ndash; ${html(nice(S.endDate))}</div><div class="guide-list">${external('https://www.worldnomads.com/travel-insurance/get-a-quote', 'World Nomads', 'Explore available plans and request a quote')}${external('https://safetywing.com/nomad-insurance', 'SafetyWing', 'Review plan options and eligibility')}</div><p class="guide-note">These are provider links, not quotes or recommendations of suitability. Availability and cover depend on residence, ages, destinations and policy terms. No insurance is sold inside roam.</p><h3 class="guide-label">BEFORE YOU CHOOSE</h3><div class="guide-info-block"><p>Compare medical cover, cancellation, baggage and planned activities. Review exclusions, excesses, pre-existing condition rules and travel advisories with the provider.</p><p>Enter your country of residence and full trip details on their website. Save their emergency contact details after purchase.</p></div><h3 class="guide-label">YOUR OWN CHECKLIST</h3><div class="guide-list guide-check-list">${check('insurance', 'reviewed', 'I reviewed the cover and dates', 'Check every traveler, destination and planned activity.', g.insurance.reviewed)}${check('insurance', 'arranged', 'I have arranged suitable cover', 'This may be a new policy or existing cover you have checked.', g.insurance.arranged)}</div><p class="guide-note">These checks are your own record; roam cannot verify or activate a policy.</p>`;
  }
  function bookingUrl(stay) {
    const url = new URL('https://www.booking.com/searchresults.html');
    url.searchParams.set('ss', [stay.city, stay.area].filter(Boolean).join(', '));
    url.searchParams.set('checkin', stay.start); url.searchParams.set('checkout', stay.end);
    return url.href;
  }
  function newStay() {
    const g = state(), occupied = new Set();
    for (const stay of g.stays) for (let i = 0; i < Math.min(nights(stay.start, stay.end), 31); i++) occupied.add(datePlus(stay.start, i));
    let start = S.startDate;
    while (start < S.endDate && occupied.has(start)) start = datePlus(start, 1);
    let end = start;
    if (start < S.endDate) { end = datePlus(start, 1); while (end < S.endDate && !occupied.has(end)) end = datePlus(end, 1); }
    return { id: uid(), city: '', area: '', name: '', start: start < S.endDate ? start : S.startDate, end: end > start ? end : S.endDate, booked: false };
  }
  function stayEditor() {
    const s = editor;
    if (!s) return '';
    return `<form id="guide-stay-form" class="guide-stay-form"><h3>${state().stays.some(x => x.id === s.id) ? 'Edit your stay' : 'Add a city stay'}</h3><label class="field" for="guide-stay-city">Which city will you sleep in?</label><input class="input" id="guide-stay-city" name="city" required maxlength="90" value="${html(s.city)}" placeholder="e.g. Paris"><label class="field" for="guide-stay-area">Neighborhood <span class="muted">(optional)</span></label><input class="input" id="guide-stay-area" name="area" maxlength="90" value="${html(s.area)}" placeholder="e.g. Le Marais"><div class="date-range"><div><label for="guide-stay-start">Check-in</label><input class="input" id="guide-stay-start" name="start" type="date" required min="${html(S.startDate)}" max="${html(S.endDate)}" value="${html(s.start)}"></div><div><label for="guide-stay-end">Check-out</label><input class="input" id="guide-stay-end" name="end" type="date" required min="${html(S.startDate)}" max="${html(S.endDate)}" value="${html(s.end)}"></div></div><label class="field" for="guide-stay-name">Hotel or accommodation <span class="muted">(optional)</span></label><input class="input" id="guide-stay-name" name="name" maxlength="120" value="${html(s.name)}" placeholder="Add a name once you know it"><label class="guide-check"><input type="checkbox" name="booked" ${s.booked ? 'checked' : ''}><span><strong>I have booked this stay</strong><small>A personal reminder, not a confirmation from the provider.</small></span></label><p id="guide-stay-error" class="guide-error" role="alert">${html(error)}</p><div class="guide-form-actions"><button type="button" class="btn ghost" data-guide-action="cancel-stay">Cancel</button><button type="submit" class="btn">Save stay</button></div></form>`;
  }
  function staysSheet() {
    const g = state(), m = metrics(g);
    return `<div class="guide-context">${icon('moon')} ${m.totalNights} ${m.totalNights === 1 ? 'night' : 'nights'} <span>&middot; ${html(nice(S.startDate))} &ndash; ${html(nice(S.endDate))}</span></div>${m.totalNights ? `<p class="guide-note">${m.planned} of ${m.totalNights} nights planned. ${m.booked} marked booked by you.</p>${m.planned < m.totalNights ? `<p class="guide-inline-notice">${icon('circle-info')} ${m.totalNights - m.planned} ${m.totalNights - m.planned === 1 ? 'night still needs' : 'nights still need'} a place to stay.</p>` : ''}${g.stays.map(stay => `<article class="guide-stay"><div class="guide-stay-top"><span class="guide-symbol stays">${icon('bed')}</span><div><h3>${html(stay.city)}</h3><p>${html(stay.area || 'Choose a neighborhood you like')}</p></div><button class="guide-edit" data-guide-edit-stay="${html(stay.id)}" aria-label="${html('Edit stay in ' + stay.city)}">${icon('pen')}</button></div><div class="guide-stay-dates"><strong>${html(nice(stay.start))} &ndash; ${html(nice(stay.end))}</strong><span>${nights(stay.start, stay.end)} nights</span></div>${stay.name ? `<p class="guide-stay-name">${icon('hotel')} ${html(stay.name)}</p>` : ''}<div class="guide-stay-bottom"><span class="guide-status">${icon(stay.booked ? 'circle-check' : 'circle')} ${stay.booked ? 'Marked booked by you' : 'Not booked yet'}</span><button class="guide-delete" data-guide-remove-stay="${html(stay.id)}" aria-label="${html('Remove stay in ' + stay.city)}">${icon('trash-can')}</button></div>${external(bookingUrl(stay), 'Find places to stay', 'Search on Booking.com for this city and these dates')}</article>`).join('')}${editor ? stayEditor() : `<button class="btn secondary full guide-add-stay" data-guide-action="add-stay">${icon('plus')} Add another city or stay</button>`}<p class="guide-note">To split a trip, shorten the first stay and add the next city. Check-out is not counted as a night. Confirm dates, rooms, guests and children's ages on the booking site.</p><p class="guide-note">Stay changes do not automatically move itinerary activities. Keep booking references and private documents outside this demo.</p>` : '<p class="guide-empty">This is a same-day trip. No overnight stay is needed.</p>'}`;
  }
  function sheet() {
    const key = S.sheet.slice(6), section = sections[key];
    if (!section) return '';
    const content = { packing: packingSheet, stays: staysSheet, esim: connectivitySheet, insurance: insuranceSheet }[key]();
    return `<div class="travel-guide guide-sheet"><div class="guide-sheet-bar"><span>TRAVEL GUIDE</span><button type="button" class="close" onclick="closeSheet()" aria-label="Close travel guide">${icon('xmark')}</button></div><span class="guide-symbol guide-sheet-symbol ${key}">${icon(section[0])}</span><h2 class="guide-sheet-title">${section[1]}</h2><p class="guide-sheet-subtitle">${section[2]}</p>${content}<p class="guide-local">${storageOK ? 'Changes save automatically on this device.' : 'Storage unavailable: changes last for this session only.'}</p></div>`;
  }

  window.RoamGuide = {
    open(key) { if (!sections[key]) return; state(); editor = null; error = ''; remaining = false; S.lockHelpOpen = false; S.ticketTarget = null; openSheet('guide-' + key); },
    show(id) { if (id) openSavedTrip(id); if (!S.tripCreated) return; state(); S.view = 'guide'; S.page = 'trip'; S.sheet = null; render(); window.scrollTo(0, 0); },
    state, metrics, bookingUrl
  };

  snapshotTrip = function () { return { ...base.snapshotTrip(), hasKids: S.hasKids, kidAges: copy(S.kidAges || []), diet: S.diet, interests: copy(S.interests || []), notes: S.notes || '' }; };
  persistActiveTrip = function () { if (S.tripCreated && !S.activeTripId) S.activeTripId = uid(); base.persistActiveTrip(); saveDisk(); };
  openSavedTrip = function (id) {
    const target = S.savedTrips.find(t => t.id === id); if (!target) return;
    const extra = copy({ hasKids: target.hasKids ?? null, kidAges: target.kidAges || [], diet: target.diet || 'Anything', interests: target.interests || [], notes: target.notes || '' });
    base.openSavedTrip(id); Object.assign(S, extra); persistActiveTrip(); render();
  };
  generate = function () {
    if (!validDates()) return;
    persistActiveTrip(); S.activeTripId = uid(); S.tripCreated = false; S.view = 'timeline';
    base.generate(); if (S.tripCreated) { state(); persistActiveTrip(); }
  };
  addTemplateTrip = function () {
    const previous = S.activeTripId; base.addTemplateTrip();
    if (S.activeTripId !== previous) { S.hasKids = null; S.kidAges = []; S.diet = 'Anything'; S.interests = []; S.notes = ''; state(); persistActiveTrip(); render(); }
  };
  trip = function () {
    const template = document.createElement('template'); template.innerHTML = base.trip();
    const tabs = template.content.querySelector('.tabs');
    if (!tabs) return base.trip();
    tabs.insertAdjacentHTML('beforeend', `<button class="tab ${S.view === 'guide' ? 'active' : ''}" onclick="RoamGuide.show()">${icon('book-open')} Guide</button>`);
    tabs.setAttribute('aria-label', 'Trip view');
    if (S.view === 'guide') {
      while (tabs.nextSibling) tabs.nextSibling.remove();
      tabs.insertAdjacentHTML('afterend', dashboard());
    }
    return template.innerHTML;
  };
  trips = function () {
    const template = document.createElement('template'); template.innerHTML = base.trips();
    template.content.querySelectorAll('.tripCard').forEach((card, i) => {
      const t = S.savedTrips[i]; if (!t) return;
      const button = document.createElement('button'); button.className = 'guide-trip-entry'; button.type = 'button'; button.dataset.guideTrip = t.id;
      button.innerHTML = `${icon('book-open')} <span>Travel guide</span>${icon('chevron-right')}`;
      card.querySelector('.content')?.appendChild(button);
    });
    return template.innerHTML;
  };
  sheetContent = function () { return typeof S.sheet === 'string' && S.sheet.startsWith('guide-') ? sheet() : base.sheetContent(); };
  render = function () { base.render(); if (S.tripCreated && S.page === 'trip') persistActiveTrip(); };

  document.addEventListener('click', event => {
    const target = event.target.closest('[data-guide-open],[data-guide-trip],[data-guide-action],[data-guide-edit-stay],[data-guide-remove-stay],[data-guide-remove-item]');
    if (!target) return;
    event.preventDefault(); event.stopPropagation();
    if (target.dataset.guideTrip) { RoamGuide.show(target.dataset.guideTrip); return; }
    if (target.dataset.guideOpen) { RoamGuide.open(target.dataset.guideOpen); return; }
    const g = state();
    if (target.dataset.guideRemoveItem) g.items = g.items.filter(item => !item.custom || item.id !== target.dataset.guideRemoveItem);
    if (target.dataset.guideEditStay) { editor = copy(g.stays.find(s => s.id === target.dataset.guideEditStay)); error = ''; }
    if (target.dataset.guideRemoveStay) {
      const stay = g.stays.find(s => s.id === target.dataset.guideRemoveStay);
      if (stay && !window.confirm('Remove ' + stay.city + ' from your stay plan? This does not cancel any reservation.')) return;
      g.stays = g.stays.filter(s => s.id !== target.dataset.guideRemoveStay); editor = null;
    }
    if (target.dataset.guideAction === 'filter') remaining = !remaining;
    if (target.dataset.guideAction === 'add-stay') { editor = newStay(); error = ''; }
    if (target.dataset.guideAction === 'cancel-stay') { editor = null; error = ''; }
    refresh();
  }, true);
  document.addEventListener('change', event => {
    const input = event.target.closest('[data-guide-check]'); if (!input) return;
    const g = state(), group = input.dataset.guideCheck, key = input.dataset.key;
    if (group === 'packing') { const item = g.items.find(i => i.id === key); if (item) item.done = input.checked; }
    else if (['esim', 'insurance', 'prep'].includes(group) && !['__proto__', 'constructor', 'prototype'].includes(key)) g[group][key] = input.checked;
    refresh();
  });
  document.addEventListener('submit', event => {
    const form = event.target;
    if (!['guide-item-form', 'guide-stay-form'].includes(form.id)) return;
    event.preventDefault(); if (!form.reportValidity()) return;
    const data = new FormData(form), g = state();
    if (form.id === 'guide-item-form') {
      const text = String(data.get('item') || '').trim().slice(0, 80);
      if (!text || g.items.length >= 120) return;
      g.items.push({ id: uid(), group: 'My extras', text, custom: true, done: false }); remaining = false; refresh(); return;
    }
    const stay = { id: editor?.id || uid(), city: String(data.get('city') || '').trim().slice(0, 90), area: String(data.get('area') || '').trim().slice(0, 90), name: String(data.get('name') || '').trim().slice(0, 120), start: String(data.get('start') || ''), end: String(data.get('end') || ''), booked: data.get('booked') === 'on' };
    error = !stay.city ? 'Enter the city you will sleep in.' : !validDate(stay.start) || !validDate(stay.end) || stay.end <= stay.start ? 'Choose a check-out after check-in.' : stay.start < S.startDate || stay.end > S.endDate ? 'Keep the stay inside your trip dates.' : g.stays.some(s => s.id !== stay.id && stay.start < s.end && stay.end > s.start) ? 'These nights overlap another stay. Edit that stay first or choose different dates.' : '';
    if (error) { editor = stay; const node = document.getElementById('guide-stay-error'); node.textContent = error; node.scrollIntoView({ block: 'nearest' }); return; }
    const i = g.stays.findIndex(s => s.id === stay.id); if (i >= 0) g.stays[i] = stay; else g.stays.push(stay);
    g.stays.sort((a, b) => a.start.localeCompare(b.start)); editor = null; refresh();
  });
  window.addEventListener('pagehide', () => { if (S.tripCreated) persistActiveTrip(); });
  render();
})();
