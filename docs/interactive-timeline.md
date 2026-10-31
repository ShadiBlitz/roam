# Interactive timeline

The timeline extension loads after the existing shell, travel-guide.js and guide-state.js. It reuses the existing Vaul sheet host and Font Awesome CDN and adds no library dependencies.

## Interactions

- Insert an experience before, between or after activities. The editor receives the adjacent activity IDs.
- Open the ellipsis menu for inline replacement options, time and duration editing, movement to another day, and visit status.
- Edit day exposes pointer drag handles and move-earlier/move-later buttons. Arrow keys on a handle provide another alternative.
- Follow this day emphasizes the next planned activity and collapses explicitly visited/skipped stops. Time passing alone never completes a visit.
- Adjust remaining stops for a late start, a lighter day or extra time.
- Preview changes, Apply, and context-scoped Revert. Stale proposals and stale reversions cannot overwrite a newer plan.
- The same editing controls work on Explore drafts before Add to My Trips. Draft changes remain separate from saved trips.

## Scheduling and data

Activity durationMinutes is authoritative when present. Legacy descriptions supply initial durations. fixedTime preserves an explicit start; locked and confirmed-reservation stops are also scheduling anchors. The scheduler shifts following flexible stops only as needed, refuses anchor conflicts and disallows crossing midnight. It uses a 15-minute planning allowance, NOT measured travel time. Earlier unchanged parts of an existing plan are not certified as feasible by this local edit checker.

All itinerary mutations are local. Saved trips use the existing device-local storage; Explore drafts remain session-local until saved. Reverting an itinerary is not cancelling or editing a reservation. Link clicks never imply a purchase. Replacement suggestions have locationUnverified set so the original landmark pin cannot be reused for an unrelated suggestion.

## Demo limitations

Recommendations are rule-based local examples; Gemini is not connected. Opening hours, weather, prices, inventory and actual journey times are not checked. OSM directions links appear only where the demo has approximate landmark coordinates. Other stops can be searched by name. Accommodation entries show the chosen base; they do not automatically reroute activities.

## Checks

Run `node --test tests/timeline-scheduling.test.cjs` with Node 18+ (Node 22 used during development).

The implementation also passed 21 offline Chromium interaction/layout checks using the deployed app artifact and the new assets at widths 320, 375, 390 and 430px. Because external CDN modules were unavailable in that environment, those checks used a DOM sheet fixture around the real sheetContent() output, not the Vaul runtime. They do not certify Safari momentum scrolling, Vaul gestures or physical iPhone behavior. Those remain device-test items.
