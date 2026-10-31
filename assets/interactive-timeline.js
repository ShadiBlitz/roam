/* roam: direct itinerary editing. Local recommendations, never live availability.
   Load after travel-guide.js and guide-state.js. No model or routing API is called. */
(() => {
  'use strict';
  if (window.RoamTimeline || typeof S === 'undefined') return;
  const original = { timeline, templatePage, sheetContent, trip, mapView, initRealMap };
  const E = esc, I = name => `<i class="fa-solid fa-${name}" aria-hidden="true"></i>`;
  const clone = value => structuredClone(value);
  const UI = { edit: '', alternatives: null, editor: null, pending: null, undo: null, notice: '', follow: new Set(), expanded: new Set(), drag: null };
  const BUFFER = 15; // Planning allowance, not a measured travel time.
  const dayMS = 86400000;
  const mins = time => /^([01]\d|2[0-3]):[0-5]\d$/.test(time || '') ? Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) : NaN;
  const clock = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
  const duration = a => Number.isFinite(a.durationMinutes) && a.durationMinutes > 0 ? a.durationMinutes : Number((a.desc || '').match(/(\d+)\s*min\b/i)?.[1]) || (a.mealType === 'dinner' ? 90 : a.mealType || a.category === 'food' ? 60 : 90);
  const anchor = a => Boolean(a.locked || a.fixedTime || a.reservationStatus === 'confirmed');
  const status = a => ['visited', 'skipped'].includes(a.visitStatus) ? a.visitStatus : 'planned';
  const key = c => `${c.scope}:${c.scope === 'template' ? S.selectedTemplate : S.activeTripId || 'draft'}`;
  const signature = activities => JSON.stringify(activities);
  const dayKey = c => `${key(c)}:${c.day}`;
  function context(scope = S.page === 'template' ? 'template' : 'trip') {
    if (scope === 'template') {
      const t = travelTemplates.find(x => x.id === S.selectedTemplate);
      const count = Math.round((dateUTC(S.templateEnd) - dateUTC(S.templateStart)) / dayMS) + 1;
      return { scope, activities: S.templateDraft || [], day: S.templatePreviewDay || 1, days: count > 0 && count <= 30 ? count : t?.days || 1, city: t?.city || '', start: S.templateStart };
    }
    return { scope: 'trip', activities: S.activities, day: S.day, days: S.days, city: S.destination, start: S.startDate };
  }
  const list = c => c.activities.filter(a => a.day === c.day).sort((a, b) => a.time.localeCompare(b.time));
  function button(action, text, attrs = '', cls = 'tl-text') { return `<button type="button" class="${cls}" data-tl-action="${action}" ${attrs}>${text}</button>`; }
  const idAttr = id => `data-id="${E(id)}"`;
  const scopeAttr = c => `data-scope="${c.scope}"`;
  const categoryIcon = a => ({food:'utensils',culture:'landmark',landmark:'landmark',outdoors:'tree',romantic:'heart',shopping:'bag-shopping',break:'mug-hot'})[a.category] || 'location-dot';
  function refresh(focusId) {
    const y = window.scrollY;
    const positions = [...document.querySelectorAll('.vaul-scroll-body')].map(el => el.scrollTop);
    render();
    requestAnimationFrame(() => requestAnimationFrame(() => {
      document.querySelectorAll('.vaul-scroll-body').forEach((el, i) => { el.scrollTop = positions[i] || 0; });
      if (focusId) document.getElementById(focusId)?.focus({ preventScroll: true });
      window.scrollTo(0, y);
    }));
  }
  function showSheet(type) {
    S.ticketTarget = null; S.lockHelpOpen = false; S.sheet = `timeline-${type}`; render();
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById('tl-sheet-title')?.focus({ preventScroll: true })));
  }
  function notice(message) { UI.notice = message; refresh(); }
  function reflow(items, start = 0) {
    const result = clone(items); let end = null;
    for (let i = 0; i < result.length; i++) {
      const a = result[i]; if (status(a) === 'skipped') continue;
      const t = mins(a.time), d = duration(a);
      if (!Number.isFinite(t) || !Number.isFinite(d) || d < 15 || d > 480) return { error: 'Choose a valid start time and a duration from 15 minutes to 8 hours.' };
      const earliest = end === null ? t : end + BUFFER;
      if (i >= start && earliest > t) {
        if (anchor(a) || status(a) === 'visited') return { error: `This would run into ${a.title} at ${a.time}. Shorten the earlier stop or choose another slot; its time will stay unchanged.` };
        a.time = clock(Math.ceil(earliest / 5) * 5);
      }
      if (mins(a.time) + d > 1439) return { error: 'This plan would run past midnight. Shorten a stop or move it to another day.' };
      end = mins(a.time) + d;
    }
    return { items: result };
  }
  function differences(before, after) {
    const rows = []; const fields = a => [a.title, a.day, a.time, duration(a), Boolean(a.fixedTime), status(a)];
    for (const b of before) {
      const a = after.find(x => x.id === b.id);
      if (!a) rows.push({ old:b, next:null });
      else if (JSON.stringify(fields(b)) !== JSON.stringify(fields(a))) rows.push({ old:b, next:a });
    }
    after.filter(a => !before.some(b => b.id === a.id)).forEach(a => rows.push({ old:null, next:a }));
    return rows;
  }
  function prepare(c, next, title, error = '') {
    UI.pending = { scope:c.scope, key:key(c), base:signature(c.activities), next, title, error, changes: differences(c.activities, next) };
    UI.notice = ''; showSheet('preview');
  }
  function proposeDay(c, items, start, title) {
    const planned = reflow(items, start);
    prepare(c, planned.items ? [...c.activities.filter(a => a.day !== c.day), ...planned.items] : clone(c.activities), title, planned.error);
  }
  function commit(next, title, scope, remember = true) {
    const c = context(scope), before = clone(c.activities);
    if (c.scope === 'template') S.templateDraft = clone(next);
    else {
      if (typeof recordRevision === 'function') recordRevision('Before ' + title.toLowerCase());
      S.history.push(before); S.activities = clone(next); S.revision++;
      if (S.tripCreated) persistActiveTrip();
    }
    if (remember) UI.undo = { key:key(c), scope:c.scope, before, after:signature(next), title };
    UI.pending = null; UI.editor = null; UI.alternatives = null; UI.notice = ''; S.sheet = null; refresh();
  }
  function apply() {
    const p = UI.pending; if (!p || p.error || !p.changes.length) return;
    const c = context(p.scope);
    if (key(c) !== p.key || signature(c.activities) !== p.base) { p.error = 'The itinerary has changed. Close this preview and try your edit again.'; refresh(); return; }
    commit(p.next, p.title, p.scope);
  }
  function revert() {
    const u = UI.undo; if (!u) return;
    const c = context(u.scope);
    if (key(c) !== u.key || signature(c.activities) !== u.after) { UI.undo = null; notice('There are newer changes. The earlier edit can no longer be reverted here.'); return; }
    commit(u.before, 'Reverted last edit', u.scope, false); UI.undo = null; refresh();
  }
  function undoRow(c) {
    const u = UI.undo;
    return u && u.key === key(c) ? `<div class="tl-revert" role="status"><span>${I('check')} ${E(u.title)}</span>${button('revert','Revert',scopeAttr(c))}</div>` : '';
  }
  function stayRow(c, ending = false) {
    if (c.scope !== 'trip' || !window.RoamGuide || !S.tripCreated || !c.start) return '';
    const date = new Date(dateUTC(c.start) + (c.day - 1) * dayMS).toISOString().slice(0, 10);
    const stay = RoamGuide.state().stays.find(s => s.start <= date && s.end > date);
    if (!stay) return '';
    if (!stay.name && !stay.area) return ending ? '' : `<div class="tl-stay">${I('bed')}<span>Choose your base in <strong>${E(stay.city)}</strong></span>${button('stay','Add stay',scopeAttr(c))}</div>`;
    return `<div class="tl-stay">${I('bed')}<span>${ending ? 'Return to' : 'Starting from'} <strong>${E(stay.name || stay.area || stay.city)}</strong></span>${button('stay','Edit',scopeAttr(c))}</div>`;
  }
  function renderTimeline(scope) {
    const c = context(scope), activities = list(c), editing = UI.edit === dayKey(c), following = UI.follow.has(dayKey(c));
    const previous = activities.filter(a => status(a) !== 'planned'), upcoming = activities.filter(a => status(a) === 'planned');
    const visible = following && !editing ? upcoming : activities;
    return `<section class="tl" ${scopeAttr(c)} aria-label="Interactive day itinerary"><div class="tl-toolbar"><div><strong>${editing ? 'Shape your day' : following ? 'One stop at a time' : 'Make room for the unexpected'}</strong><small>${editing ? 'Drag a handle, or use the arrows.' : following ? `Following Day ${c.day} &middot; ${previous.length} stops visited or skipped` : 'Tap a time to edit. Add a little something between stops.'}</small></div>${button('edit',editing?'Done':`${I('sliders')} Edit day`,scopeAttr(c),'tl-edit')}</div>${scope === 'trip' ? button('follow',following?`${I('list')} Back to planning`:`${I('play')} Follow this day`,`${scopeAttr(c)} aria-pressed="${following}"`,'tl-follow') : ''}${undoRow(c)}${UI.notice ? `<div class="tl-message" role="alert">${E(UI.notice)}${button('dismiss',I('xmark'),'aria-label="Dismiss message"')}</div>` : ''}${stayRow(c)}${following && !editing && previous.length ? `<details class="tl-earlier" ${UI.expanded.has(dayKey(c))?'open':''}><summary>Earlier stops <span>${previous.length}</span></summary>${previous.map(a=>card(a,c,false,false)).join('')}</details>`:''}<div class="tl-stops">${visible.length ? `${gap(null,visible[0],c,editing)}${visible.map((a,i)=>`${card(a,c,editing,following && i===0 && status(a)==='planned')}${gap(a,visible[i+1]||null,c,editing)}`).join('')}`:`<div class="tl-empty">${I('sun')}<strong>${following?'You have reached the end of your plan.':'A day full of possibilities.'}</strong><p>${following?'Leave the rest open, or find one more experience.':'Start with something you would love to do.'}</p>${button('add','Add an experience',`${scopeAttr(c)} data-after="" data-before=""`,'btn full')}</div>`}</div>${stayRow(c,true)}${following?button('adjust',`${I('wand-magic-sparkles')} Adjust the rest of today`,scopeAttr(c),'btn secondary full tl-adjust'):''}<p class="tl-footnote">${I('clock')} Transfer buffers are planning allowances, not live route estimates.</p></section>`;
  }
  function card(a,c,editing,current) {
    const alternatives = UI.alternatives && UI.alternatives.key === key(c) && UI.alternatives.id === a.id;
    const attrs = `${scopeAttr(c)} ${idAttr(a.id)}`;
    const ticket = typeof ticketForVisit === 'function' ? ticketForVisit(a,c.scope) : null;
    return `<article class="tl-card-row ${current?'is-current':''} ${status(a)!=='planned'?'is-past':''}" ${attrs}><div class="tl-rail"><span class="tl-dot">${I(status(a)==='visited'?'check':status(a)==='skipped'?'forward':categoryIcon(a))}</span></div><div class="tl-card"><div class="tl-card-top"><div class="tl-timing">${button('time',E(a.time),`${attrs} aria-label="${E('Change time for '+a.title)}"`,'tl-time')}${button('time',`${duration(a)} min`,`${attrs} aria-label="${E('Change duration for '+a.title)}"`,'tl-duration')}</div>${button('menu',I('ellipsis'),`${attrs} aria-label="${E('Options for '+a.title)}"`,'tl-menu')}</div>${current?'<span class="tl-next">UP NEXT</span>':''}${button('details',`<strong>${E(a.title)}</strong><span>${E((a.desc||'').replace(/\s*[\u00b7]\s*\d+\s*min/gi,''))}</span>`,attrs,'tl-card-details')}<div class="tl-badges">${anchor(a)?`<span>${I(a.locked?'lock':'clock')} ${a.locked?'Protected':a.reservationStatus==='confirmed'?'Booked time':'Fixed time'}</span>`:''}${status(a)!=='planned'?`<span>${status(a)==='visited'?'Visited':'Skipped'}</span>`:''}</div>${ticket?button('tickets',`${I('ticket')} ${ticketActionLabel(ticket)} ${I('arrow-up-right-from-square')}`,attrs,'tl-ticket'):''}${editing?`<div class="tl-reorder">${button('up',I('arrow-up'),`${attrs} aria-label="${E('Move '+a.title+' earlier')}" ${anchor(a)?'disabled':''}`)}${button('down',I('arrow-down'),`${attrs} aria-label="${E('Move '+a.title+' later')}" ${anchor(a)?'disabled':''}`)}${button('move',`${I('calendar-days')} Move day`,attrs)}<button type="button" class="tl-grip" data-tl-grip="${E(a.id)}" ${scopeAttr(c)} ${anchor(a)?'disabled':''} aria-label="${E('Reorder '+a.title+'. Use arrow keys or drag.')}" title="Drag to reorder">${I('grip-lines')}</button></div>`:''}${current?`<div class="tl-live-actions">${button('visited',`${I('check')} Visited`,attrs,'tl-visited')}${button('skip','Skip',attrs)}${button('directions',I('location-arrow'),`${attrs} aria-label="${E('Directions to '+a.title)}"`)}</div>`:''}${alternatives?alternativePanel(a,c):''}</div></article>`;
  }
  function gap(prev,next,c,editing) {
    if (editing) return '';
    const free = prev && next ? mins(next.time) - mins(prev.time) - duration(prev) : null;
    return `<div class="tl-gap"><div class="tl-rail"></div><div>${prev&&next?button('route',`${I('person-walking')} ${free > 0 ? free + ' min between stops' : 'Check the connection'} ${I('chevron-right')}`,`${scopeAttr(c)} data-after="${E(prev.id)}" data-before="${E(next.id)}"`,'tl-connection'):''}${button('add',`${I('plus')} ${prev ? next?'Add something here':'Add to this evening':'Add before your first stop'}`,`${scopeAttr(c)} data-after="${E(prev?.id||'')}" data-before="${E(next?.id||'')}"`,'tl-insert')}</div></div>`;
  }
  function suggestions(prompt='',mealType) {
    const p = prompt.toLowerCase();
    const food = mealType || /food|coffee|cafe|caf\u00e9|pastr|eat|lunch|dinner|breakfast/.test(p);
    const culture = /art|museum|galler|cultur/.test(p);
    const options = food ? [['A neighborhood cafe stop','food',30,'Coffee and a relaxed bite'],['A local food tasting','food',60,'Discover a few local flavors'],['An unhurried restaurant visit','food',75,'Make time to enjoy the meal']] : culture ? [['A small gallery visit','culture',60,'A focused dose of local art'],['An architecture walk','outdoors',45,'Explore the neighborhood at your pace'],['A local culture stop','culture',60,'Discover a different side of the city']] : [['A quiet garden break','outdoors',45,'Fresh air and room to slow down'],['A cozy coffee stop','food',30,'A little pause between adventures'],['A neighborhood discovery','outdoors',60,'Wander without rushing']];
    if (prompt.trim()) options.unshift([prompt.trim().slice(0,75),'custom',45,'Your idea, ready to fit into the day']);
    return options.map(([title,category,durationMinutes,desc])=>({ title,category,durationMinutes,desc, ...(mealType?{mealType}:{}) }));
  }
  function alternativePanel(a,c) {
    const al=UI.alternatives;
    return `<div class="tl-alternatives"><div class="tl-alternatives-heading"><strong>A different kind of moment</strong>${button('close-alternatives',I('xmark'),'aria-label="Close alternatives"')}</div><div class="tl-options">${al.options.map((o,i)=>button('choose-replacement',`<span class="tl-option-icon">${I(categoryIcon(o))}</span><span><strong>${E(o.title)}</strong><small>${o.durationMinutes} min &middot; ${E(o.desc)}</small></span>${I('chevron-right')}`,`${scopeAttr(c)} ${idAttr(a.id)} data-index="${i}"`,'tl-option')).join('')}</div><form data-tl-form="alternatives" ${scopeAttr(c)} ${idAttr(a.id)}><label class="field" for="tl-alternative-idea">Tell AI what you have in mind</label><div class="tl-input-row"><input class="input" id="tl-alternative-idea" name="idea" maxlength="160" placeholder="e.g. Something outdoors" required><button class="tl-send" aria-label="Find alternatives">${I('arrow-up')}</button></div></form><small class="tl-note">Demo ideas, not live venue recommendations.</small></div>`;
  }
  function sheetFrame(title,body) {
    return `<div class="tl-sheet"><div class="tl-sheet-bar"><span>YOUR DAY, YOUR WAY</span>${button('close-sheet',I('xmark'),'aria-label="Close editor"')}</div><h2 id="tl-sheet-title" tabindex="-1">${E(title)}</h2>${body}</div>`;
  }
  function editorSheet() {
    const ed=UI.editor,c=context(ed?.scope); if(!ed||ed.key!==key(c))return sheetFrame('This plan changed','<p>Close this sheet and select the activity again.</p>');
    const a=c.activities.find(x=>x.id===ed.id);
    if(ed.type==='add') {
      const prev=c.activities.find(x=>x.id===ed.after),next=c.activities.find(x=>x.id===ed.before);
      return sheetFrame('What would you like to do?',`<p class="tl-context">${E(prev&&next?`Between ${prev.title} and ${next.title}`:next?`Before ${next.title}`:prev?`After ${prev.title}`:`Day ${c.day} in ${c.city}`)}</p><form data-tl-form="add"><label class="field" for="tl-idea">A little inspiration for AI</label><textarea class="input" id="tl-idea" name="idea" rows="3" maxlength="160" placeholder="A cozy coffee stop, a local market, somewhere quiet...">${E(ed.prompt||'')}</textarea><button class="btn full tl-submit">${I('wand-magic-sparkles')} Find an experience</button></form>${ed.options?`<div class="tl-options">${ed.options.map((o,i)=>button('choose-add',`<span class="tl-option-icon">${I(categoryIcon(o))}</span><span><strong>${E(o.title)}</strong><small>${o.durationMinutes} min &middot; ${E(o.desc)}</small></span>${I('chevron-right')}`,`data-index="${i}"`,'tl-option')).join('')}</div><p class="tl-note">Local demo suggestions. Opening hours and venue availability are not checked.</p>`:''}${button('close-sheet','Keep this time free','','tl-keep-free')}`);
    }
    if(ed.type==='adjust')return sheetFrame('How is your day going?',`<p class="tl-context">Only remaining, flexible stops will be proposed for changes.</p><div class="tl-options">${[['late','clock','We are starting late','Shift remaining stops by 30 minutes'],['lighter','mug-hot','We need a lighter day','Skip one flexible activity; keep your meals'],['extra','plus','We have extra time','Find something else to enjoy']].map(([v,i,t,d])=>button('adjust-choice',`<span class="tl-option-icon">${I(i)}</span><span><strong>${t}</strong><small>${d}</small></span>${I('chevron-right')}`,`data-choice="${v}"`,'tl-option')).join('')}</div>`);
    if(ed.type==='route') {
      const from=c.activities.find(x=>x.id===ed.after),to=c.activities.find(x=>x.id===ed.before);
      const p=typeof parisMapPoints!=='undefined' && !from?.locationUnverified && c.city.toLowerCase()==='paris'?parisMapPoints[from?.id]:null;
      const q=typeof parisMapPoints!=='undefined' && !to?.locationUnverified && c.city.toLowerCase()==='paris'?parisMapPoints[to?.id]:null;
      const href=p&&q?`https://www.openstreetmap.org/directions?engine=fossgis_osrm_foot&route=${p.join(',')}%3B${q.join(',')}`:null;
      return sheetFrame('Between these stops',`<div class="tl-route-pair"><strong>${E(from?.title||'Your starting point')}</strong>${I('arrow-down')}<strong>${E(to?.title||'Your next stop')}</strong></div><p class="tl-context">The time between stops is free schedule space, not a calculated journey time. Check the route before adding another activity.</p>${href?`<a class="btn full tl-link" href="${E(href)}" target="_blank" rel="noopener noreferrer">${I('person-walking')} Open walking directions ${I('arrow-up-right-from-square')}</a><p class="tl-note">Uses approximate landmark locations. Check the exact entrance.</p>`:`<p class="tl-note">Exact locations are not available for these demo stops.</p>`}${c.scope==='trip'?button('show-map',`${I('map')} View day on map`,'','btn secondary full'):''}`);
    }
    if(!a)return sheetFrame('Activity unavailable','<p>This activity has changed. Please close the editor.</p>');
    if(ed.type==='time')return sheetFrame('Give it the right amount of time',`<p class="tl-context">${E(a.title)}</p>${a.locked?'<p class="tl-message">This activity is protected. Unlock it in its details before rescheduling.</p>':`<form data-tl-form="time"><div class="tl-time-grid"><div><label class="field" for="tl-time">Start time</label><input id="tl-time" name="time" class="input" type="time" required value="${E(a.time)}"></div><div><label class="field" for="tl-duration">Minutes to stay</label><input id="tl-duration" class="input" name="duration" type="number" inputmode="numeric" min="15" max="480" step="15" required value="${duration(a)}"></div></div><label class="tl-fixed"><span><strong>Fixed start time</strong><small>Keep this time when rearranging other stops.</small></span><input type="checkbox" name="fixed" ${a.fixedTime?'checked':''}></label><p class="tl-note">Editing the plan does not change an existing booking. Following flexible stops may move; protected stops stay put.</p><button class="btn full tl-submit">Preview time changes</button></form>`}`);
    if(ed.type==='move')return sheetFrame('Choose a day',`<p class="tl-context">Move ${E(a.title)} to another day.</p><div class="tl-day-options">${Array.from({length:c.days},(_,i)=>button('choose-day',`Day ${i+1}`,`data-day="${i+1}" ${i+1===a.day||anchor(a)?'disabled':''}`,'tl-day-choice')).join('')}</div>${anchor(a)?'<p class="tl-message">Unlock this activity or remove its fixed time before moving it.</p>':''}`);
    return sheetFrame(a.title,`<div class="tl-options">${[['time','clock','Change time or duration'],['replace','arrows-rotate','Find an alternative'],['move','calendar-days','Move to another day'],['visited','check',status(a)==='visited'?'Mark as planned':'Mark as visited'],['skip','forward',status(a)==='skipped'?'Put back in the plan':'Skip this stop'],['details','circle-info','Place details & tickets']].map(([action,ico,label])=>button(action,`${I(ico)} <span>${label}</span>${I('chevron-right')}`,`${scopeAttr(c)} ${idAttr(a.id)}`,'tl-menu-option')).join('')}</div>`);
  }
  function previewSheet() {
    const p=UI.pending;if(!p)return sheetFrame('No changes to apply','');
    const summary=a=>a?`Day ${a.day} &middot; ${E(a.time)} &middot; ${duration(a)} min${status(a)!=='planned'?' &middot; '+status(a):''}${a.fixedTime?' &middot; Fixed time':''}`:'';
    return sheetFrame(p.title,`<p class="tl-context">Review what will change. Everything else stays as it is.</p>${p.error?`<p class="tl-message" role="alert">${E(p.error)}</p>`:''}<div class="tl-changes">${p.changes.map(({old:a,next:b})=>`<div class="tl-change"><span class="tl-change-icon">${I(!a?'plus':!b?'minus':'arrows-rotate')}</span><div>${a?`<small>Before</small><p>${E(a.title)}</p><span>${summary(a)}</span>`:''}${b?`<small>${a?'After':'Add'}</small><p class="tl-change-after">${E(b.title)}</p><span>${summary(b)}</span>`:'<p>Removed from this plan</p>'}</div></div>`).join('')}</div>${!p.error&&!p.changes.length?'<p class="tl-context">The plan already matches this choice.</p>':''}<p class="tl-note">Schedule checks use a 15-minute transfer allowance, not live travel times or opening hours.</p>${button('apply',`${I('check')} Apply changes`,p.error||!p.changes.length?'disabled':'','btn full tl-submit')}${button('close-sheet','Keep my current plan','','tl-keep-free')}`);
  }
  function openEditor(type,c,id='',extra={}) { UI.editor={type,scope:c.scope,key:key(c),id,...extra};showSheet('edit'); }
  function openAlternatives(c,a,prompt='') {
    if(anchor(a)||status(a)!=='planned'){S.sheet=null;notice('Keep this protected or completed visit as it is, or update its status and protection first.');return;}
    UI.editor=null;UI.alternatives={key:key(c),scope:c.scope,id:a.id,options:suggestions(prompt,a.mealType)};S.sheet=null;refresh();
    requestAnimationFrame(()=>document.querySelector('.tl-alternatives')?.scrollIntoView({block:'nearest',behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'}));
  }
  function reorder(c,id,before) {
    const rows=list(c),a=rows.find(x=>x.id===id);if(!a||anchor(a)||status(a)!=='planned')return;
    const oldIndex=rows.findIndex(x=>x.id===id),targetIndex=before?rows.findIndex(x=>x.id===before):rows.length;
    if(before===id||targetIndex===oldIndex+1)return;
    const next=clone(rows.filter(x=>x.id!==id));let index=before?next.findIndex(x=>x.id===before):next.length;if(index<0)return;
    const moved=clone(a);moved.time=index<oldIndex?(next[index]?.time||a.time):next[index-1]?clock(mins(next[index-1].time)+duration(next[index-1])+BUFFER):a.time;
    next.splice(index,0,moved);proposeDay(c,next,Math.min(oldIndex,index),'Reorder your day');
  }
  function selectCandidate(index,replacing) {
    const ed=replacing?UI.alternatives:UI.editor;if(!ed)return;
    const c=context(ed.scope);if(ed.key!==key(c))return notice('Open this editor again for the current trip.');
    const o=ed.options?.[index];if(!o)return;
    const rows=clone(list(c));
    if(replacing){const at=rows.findIndex(a=>a.id===ed.id),old=rows[at];if(!old||anchor(old))return;rows[at]={...old,...o,locationUnverified:true};delete rows[at].placeId;delete rows[at].coordinates;proposeDay(c,rows,at,'Try a different experience');}
    else {
      const prev=rows.find(a=>a.id===ed.after),next=rows.find(a=>a.id===ed.before);
      const at=next?rows.findIndex(a=>a.id===next.id):rows.length;
      const time=prev?clock(mins(prev.time)+duration(prev)+BUFFER):next?clock(Math.max(0,mins(next.time)-o.durationMinutes-BUFFER)):'09:00';
      rows.splice(at,0,{...o,id:uid(),day:c.day,time,locked:false,visitStatus:'planned'});proposeDay(c,rows,at,'Add a little something');
    }
  }
  function dispatch(action,data={}) {
    const c=context(data.scope||UI.editor?.scope||undefined), a=c.activities.find(x=>x.id===data.id);
    if(action==='close-sheet'){UI.pending=null;UI.editor=null;closeSheet();return;}
    if(action==='dismiss'){UI.notice='';refresh();return;}
    if(action==='apply'){apply();return;}
    if(action==='revert'){revert();return;}
    if(action==='edit'){UI.edit=UI.edit===dayKey(c)?'':dayKey(c);UI.alternatives=null;UI.notice='';refresh();return;}
    if(action==='follow'){if(UI.follow.has(dayKey(c)))UI.follow.delete(dayKey(c));else UI.follow.add(dayKey(c));UI.edit='';refresh();return;}
    if(action==='add'){openEditor('add',c,'',{after:data.after||'',before:data.before||'',prompt:'',options:null});return;}
    if(action==='adjust'){openEditor('adjust',c);return;}
    if(action==='route'){openEditor('route',c,'',{after:data.after,before:data.before});return;}
    if(action==='show-map'){UI.editor=null;S.sheet=null;S.view='map';render();return;}
    if(action==='stay'){S.sheet=null;RoamGuide.open('stays');return;}
    if(action==='close-alternatives'){UI.alternatives=null;refresh();return;}
    if(action==='choose-replacement'||action==='choose-add'){selectCandidate(Number(data.index),action==='choose-replacement');return;}
    if(action==='adjust-choice') {
      const rows=clone(list(c)),remaining=rows.filter(x=>status(x)==='planned'&&!anchor(x));
      if(data.choice==='extra'){const after=rows.findLast(x=>status(x)!=='skipped');openEditor('add',c,'',{after:after?.id||'',before:'',prompt:'',options:null});return;}
      if(!remaining.length){prepare(c,clone(c.activities),'Adjust the rest of your day','There are no remaining flexible stops to adjust.');return;}
      if(data.choice==='lighter'){
        const a=remaining.findLast(x=>!x.mealType&&x.category!=='food');
        if(!a){prepare(c,clone(c.activities),'A lighter day','Only meals or protected stops remain. Your meals will stay in the plan.');return;}
        const next=clone(c.activities);next.find(x=>x.id===a.id).visitStatus='skipped';prepare(c,next,'Make room to relax');return;
      }
      const first=rows.findIndex(x=>x.id===remaining[0].id);rows[first].time=clock(mins(rows[first].time)+30);proposeDay(c,rows,first,'Start a little later');return;
    }
    if(action==='choose-day') {
      const ed=UI.editor,visit=c.activities.find(x=>x.id===ed?.id);const day=Number(data.day);if(!visit||anchor(visit)||!Number.isInteger(day)||day<1||day>c.days)return;
      const target={...c,day},rows=clone(list(target)),moved={...clone(visit),day};rows.push(moved);rows.sort((a,b)=>a.time.localeCompare(b.time));
      const out=reflow(rows,rows.findIndex(x=>x.id===visit.id));const next=out.items?[...c.activities.filter(x=>x.day!==day&&x.id!==visit.id),...out.items]:clone(c.activities);prepare(c,next,'Move to Day '+day,out.error);return;
    }
    if(!a)return;
    if(action==='details'){UI.editor=null;S.sheet=null;if(c.scope==='template')openTemplateActivity(a.id);else{S.selected=a.id;openSheet('activity');}return;}
    if(action==='tickets'){UI.editor=null;openVisitTickets(a.id,c.scope);return;}
    if(['menu','time','move'].includes(action)){openEditor(action,c,a.id);return;}
    if(action==='replace'){openAlternatives(c,a);return;}
    if(action==='up'||action==='down') {
      const rows=list(c),at=rows.findIndex(x=>x.id===a.id);if(action==='up'&&at>0)reorder(c,a.id,rows[at-1].id);else if(action==='down'&&at<rows.length-1)reorder(c,a.id,rows[at+2]?.id||'');return;
    }
    if(action==='visited'||action==='skip'){
      const next=clone(c.activities),item=next.find(x=>x.id===a.id);item.visitStatus=action==='visited'?(status(a)==='visited'?'planned':'visited'):(status(a)==='skipped'?'planned':'skipped');
      if(action==='skip'&&item.visitStatus==='skipped')prepare(c,next,'Skip this stop (no booking is cancelled)');else commit(next,item.visitStatus==='visited'?'Marked as visited':'Returned to the plan',c.scope);return;
    }
    if(action==='directions') {
      const url=new URL('https://www.openstreetmap.org/search');url.searchParams.set('query',a.title+', '+c.city);window.open(url.href,'_blank','noopener,noreferrer');
    }
  }
  document.addEventListener('click',event=>{
    const target=event.target.closest?.('[data-tl-action]');if(!target||target.disabled)return;
    event.preventDefault();event.stopImmediatePropagation();dispatch(target.dataset.tlAction,target.dataset);
  },true);
  document.addEventListener('submit',event=>{
    const form=event.target;if(!form.matches('[data-tl-form]'))return;event.preventDefault();event.stopPropagation();if(!form.reportValidity())return;
    const data=new FormData(form),ed=UI.editor,c=context(ed?.scope||form.dataset.scope);
    if(form.dataset.tlForm==='alternatives'){const a=c.activities.find(x=>x.id===form.dataset.id);if(a)openAlternatives(c,a,String(data.get('idea')||'').slice(0,160));return;}
    if(!ed||key(c)!==ed.key)return;
    if(form.dataset.tlForm==='add'){ed.prompt=String(data.get('idea')||'').trim().slice(0,160);ed.options=suggestions(ed.prompt);refresh();return;}
    if(form.dataset.tlForm==='time'){
      const rows=clone(list(c)),at=rows.findIndex(x=>x.id===ed.id),a=rows[at];if(!a||a.locked)return;
      const value=String(data.get('time')||''),d=Number(data.get('duration'));
      if(!Number.isFinite(mins(value))||!Number.isFinite(d)||d<15||d>480)return;
      a.time=value;a.durationMinutes=d;a.desc=(a.desc||'').replace(/\b\d+\s*min\b/i,d+' min');a.fixedTime=data.get('fixed')==='on';
      // An explicit chosen time may not be silently moved by the scheduler.
      const protectedCopy=clone(a);rows[at].fixedTime=true;
      const next=reflow(rows,at);if(next.items)next.items[at]=protectedCopy;
      prepare(c,next.items?[...c.activities.filter(x=>x.day!==c.day),...next.items]:clone(c.activities),'Update your timing',next.error);
    }
  });
  document.addEventListener('keydown',event=>{
    const grip=event.target.closest?.('[data-tl-grip]');if(!grip||grip.disabled)return;
    if(event.key==='ArrowUp'||event.key==='ArrowDown'){event.preventDefault();dispatch(event.key==='ArrowUp'?'up':'down',{scope:grip.dataset.scope,id:grip.dataset.tlGrip});}
  });
  document.addEventListener('pointerdown',event=>{
    const grip=event.target.closest?.('[data-tl-grip]');if(!grip||grip.disabled||event.button!==0)return;
    const c=context(grip.dataset.scope),a=c.activities.find(x=>x.id===grip.dataset.tlGrip);if(!a||anchor(a))return;
    UI.drag={scope:c.scope,key:key(c),id:a.id,pointer:event.pointerId,grip,startY:event.clientY,y:event.clientY,moved:false,before:null};grip.setPointerCapture(event.pointerId);
  });
  document.addEventListener('pointermove',event=>{
    const d=UI.drag;if(!d||event.pointerId!==d.pointer)return;
    d.y=event.clientY;if(Math.abs(d.y-d.startY)<8&&!d.moved)return;d.moved=true;
    const root=d.grip.closest('.tl');root.classList.add('is-dragging');
    const rows=[...root.querySelectorAll('.tl-card-row')];rows.forEach(el=>el.classList.remove('tl-drop-before','tl-dragging'));
    rows.find(el=>el.dataset.id===d.id)?.classList.add('tl-dragging');
    const target=rows.filter(el=>el.dataset.id!==d.id).find(el=>{const r=el.getBoundingClientRect();return d.y<r.top+r.height/2});
    d.before=target?.dataset.id||'';target?.classList.add('tl-drop-before');root.classList.toggle('tl-drop-end',!target);
    if(d.y<90)window.scrollBy(0,-14);else if(d.y>innerHeight-130)window.scrollBy(0,14);
  });
  function finishDrag(event,cancel=false){
    const d=UI.drag;if(!d||event.pointerId!==d.pointer)return;UI.drag=null;
    document.querySelectorAll('.tl-drop-before,.tl-dragging,.is-dragging,.tl-drop-end').forEach(el=>el.classList.remove('tl-drop-before','tl-dragging','is-dragging','tl-drop-end'));
    if(d.grip.hasPointerCapture(d.pointer))d.grip.releasePointerCapture(d.pointer);
    const c=context(d.scope);if(!cancel&&d.moved&&key(c)===d.key)reorder(c,d.id,d.before);
  }
  document.addEventListener('pointerup',event=>finishDrag(event));document.addEventListener('pointercancel',event=>finishDrag(event,true));
  document.addEventListener('toggle',event=>{if(event.target.matches?.('.tl-earlier')){const c=context();if(event.target.open)UI.expanded.add(dayKey(c));else UI.expanded.delete(dayKey(c));}},true);
  timeline=()=>renderTimeline('trip');
  templatePage=function(){const el=document.createElement('template');el.innerHTML=original.templatePage();const target=el.content.querySelector('.template-preview-activities');if(target)target.innerHTML=renderTimeline('template');return el.innerHTML;};
  sheetContent=function(){if(S.sheet==='timeline-edit')return editorSheet();if(S.sheet==='timeline-preview')return previewSheet();return original.sheetContent();};
  trip=function(){const el=document.createElement('template');el.innerHTML=original.trip();if(el.content.querySelector('.tl')){
    // Keep the contextual day AI control, but avoid a second large promotional panel.
    el.content.querySelectorAll('.panel').forEach(panel=>{if(panel.querySelector('[onclick="openSheet(\'ai\')"]'))panel.remove();});
  }return el.innerHTML;};
  // The legacy demo maps seed activity IDs. A replacement is a different place:
  // exclude its old point during the synchronous marker setup, then restore the
  // shared catalog so another saved trip using the original seed is unaffected.
  initRealMap=function(){
    const omitted={};
    if(typeof parisMapPoints!=='undefined')dayActs().filter(a=>a.locationUnverified).forEach(a=>{
      if(Object.prototype.hasOwnProperty.call(parisMapPoints,a.id)){omitted[a.id]=parisMapPoints[a.id];delete parisMapPoints[a.id];}
    });
    try{return original.initRealMap();}finally{if(typeof parisMapPoints!=='undefined')Object.assign(parisMapPoints,omitted);}
  };
  mapView=function(){return original.mapView()+(dayActs().some(a=>a.locationUnverified)?'<p class="tl-note">Your new experiences need exact locations before map pins and routes can be shown.</p>':'');};
  window.RoamTimeline=Object.freeze({dispatch,context,duration,reflow,render:renderTimeline,reorder,getProposal:()=>UI.pending?clone(UI.pending):null});
  render();
})();
