'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const noop = () => {};
const sandbox = { S: {}, window: {}, document: { addEventListener: noop }, structuredClone,
  esc: String, timeline: noop, templatePage: noop, sheetContent: noop, trip: noop,
  mapView: noop, initRealMap: noop, render: noop };
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(path.join(__dirname, '../assets/interactive-timeline.js'), 'utf8'), sandbox);
const { reflow, duration } = sandbox.window.RoamTimeline;
const stop = (id, time, length, extra = {}) => ({ id, title: id, day: 1, time, durationMinutes: length, ...extra });
test('moves a following flexible stop and adds a planning allowance', () => {
  const plan = reflow([stop('museum', '11:00', 120), stop('lunch', '13:00', 60)], 0);
  assert.equal(plan.items[1].time, '13:15');
});
test('does not mutate the source while proposing a change', () => {
  const source = [stop('a', '11:00', 120), stop('b', '13:00', 60)];
  const before = JSON.stringify(source); reflow(source, 0);
  assert.equal(JSON.stringify(source), before);
});
for (const constraint of ['locked', 'fixedTime']) {
  test(`blocks a conflict with ${constraint}`, () => {
    const plan = reflow([stop('museum', '11:00', 120), stop('reservation', '13:00', 60, { [constraint]: true })], 0);
    assert.match(plan.error, /reservation/); assert.equal(plan.items, undefined);
  });
}
test('confirmed reservations and visited stops are not shifted', () => {
  for (const extra of [{ reservationStatus: 'confirmed' }, { visitStatus: 'visited' }]) {
    assert.match(reflow([stop('a', '10:00', 120), stop('b', '11:00', 30, extra)], 0).error, /b/);
  }
});
test('keeps later fixed commitments when there is enough space', () => {
  const plan = reflow([stop('a', '10:00', 60), stop('b', '12:00', 30, { fixedTime: true })], 0);
  assert.equal(plan.items[1].time, '12:00');
});
test('rejects changes running into the next calendar day', () => {
  assert.match(reflow([stop('late', '23:45', 30)], 0).error, /midnight/);
});
test('skipped stops do not consume schedule space', () => {
  const plan = reflow([stop('skip', '10:00', 180, { visitStatus: 'skipped' }), stop('next', '11:00', 30)], 0);
  assert.equal(plan.items[1].time, '11:00');
});
test('reads existing demo durations and prioritizes explicit edits', () => {
  assert.equal(duration({ desc: 'Art and culture - 75 min' }), 75);
  assert.equal(duration({ desc: '90 min', durationMinutes: 120 }), 120);
});
test('rejects invalid times and unreasonable durations', () => {
  assert.match(reflow([stop('bad time', '25:00', 30)], 0).error, /valid/);
  assert.match(reflow([stop('bad duration', '09:00', 600)], 0).error, /duration/);
});
