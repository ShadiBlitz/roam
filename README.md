# roam

An iOS-inspired, static travel planner prototype hosted on GitHub Pages.

## Source layout

- `_includes/roam-shell.html`: the existing app, preserved from the previous `index.html` without changes (itinerary, templates, tickets, maps and Vaul drawers).
- `assets/travel-guide.js`: per-trip packing, connectivity, insurance handoffs, accommodation planning and device-local persistence.
- `assets/travel-guide.css`: mobile guide UI using the existing Font Awesome CDN.
- `index.html`: a small Jekyll entry point that includes the app and adds the guide stylesheet and script. GitHub Pages' normal Jekyll build produces one ordinary HTML page; there is no runtime HTML fetch or iframe.

Keep the GitHub Pages source set to main / root. Do not add `.nojekyll`: the entry point uses Jekyll includes. For a standalone local HTML file, take `_includes/roam-shell.html`, add a link to `assets/travel-guide.css` before `</head>`, and a classic script for `assets/travel-guide.js` before `</body>`.

## Travel guide

Open a saved trip and select **Guide** beside Timeline and Map, or use **Travel guide** on its My Trips card. Checklists and saved trips are stored in this browser's localStorage under `roam.travel-guide.v1`; they do not sync between devices. Clearing website data removes them. Avoid storing sensitive personal documents or policy references.

Provider links open external websites. Roam does not sell eSIMs or insurance, make reservations, verify payments or automatically mark items purchased. Travelers must confirm dates, guests, eligibility, coverage and availability with the provider. Stay edits do not automatically re-route itinerary activities.

## Validation

The guide JavaScript passes Node syntax checking. Its flows were exercised in Chromium at mobile widths using the earlier mounted iOS app shell, a local sheet host and a localStorage shim: custom packing and escaping, trip isolation, restore, multi-city dates, overlap rejection, explicit readiness checks, kids, same-day trips and no horizontal overflow from 320 to 460 CSS pixels. This is not a physical-iPhone or live-provider checkout test. Existing Vaul components remain responsible for production sheets.
