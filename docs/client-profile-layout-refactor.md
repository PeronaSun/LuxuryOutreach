# Client profile layout refactor

Date: November 6, 2026. This is a UI-only change to the existing workspace.

## Result

The left column contains current client/scenario/product/occasion/context selections and the generation action. The full stored profile is in a compact, read-only card at the top of the right column. It shows only customer name, assigned advisor, birth month, and historical purchased products with preserved SKUs and dates. Internal IDs, preference tags, CRM notes, and conversation excerpts are not displayed in that card.

The three-message area remains below the profile. Profile rendering is independent of the empty, loading, error, candidate, and editor states. The existing blue palette and two-column/stacked breakpoints remain. Empty-state decoration is smaller to make room for the profile without lengthening the right column unnecessarily.

## Canonical purchase labels

The new presentation helper resolves the recorded SKU against the existing catalog, checks its Motif/Line relationship, and composes the label from the official Line name, Chinese Line name, and product category. Example: MUG-R-N01 becomes **Rosée du Matin（晨露）项链**. The SKU-level description is retained as a read-only title.

These are consistent display labels, not newly invented official SKU marketing names. Purchase-record productName values are not trusted for presentation, so shortened or inconsistent historical names cannot rename a catalog product. The same lookup is used for read-only history and the existing aftercare selection buttons. Original records, prices, dates, IDs, and generation inputs are unchanged. Unknown SKUs retain their identifier with a neutral catalog-missing label instead of an invented name.

## Files

- src/ClientProfile.jsx — new focused read-only profile component.
- src/product-display.mjs — new pure canonical display lookup.
- src/main.jsx — moves the profile to the right, reuses display labels for aftercare choices, and removes duplicate fixed birthday information from the input area.
- src/styles.css — compact right-side profile, natural results layout, smaller empty state, and responsive styling.
- tests/product-display.test.mjs — five checks for all SKUs, requested Rosée names, stale purchase labels, unknown SKUs, and invalid catalog relationships.
- tests/ui.test.mjs — verifies layout order, immediate client updates, read-only profile, canonical history, persistence across loading/errors/results, and existing copy/edit/regenerate/hierarchy behavior.

## Actual verification

| Check                  | Result                                                                                                                                                                              |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm test               | **84 passed, 0 failed**                                                                                                                                                             |
| npm run build          | Passed                                                                                                                                                                              |
| node scripts/smoke.mjs | Passed: production HTML/JS, nine clients, fifteen products, recommendation, birthday-month greeting, selected-purchase care and isolated record export                              |
| Protected-file hashes  | **94 files unchanged**, including **79 evaluation files** and all generation/server/catalog data, selection-state code, prior runtime records and prior evaluation outputs in scope |
| Browser visual QA      | Not performed: supported browser discovery returned an empty list                                                                                                                   |

No generation logic, prompts, API integration, recommendation ranking, validation rules, customer fixtures, product catalog, package dependencies, evaluation tooling, or frozen evaluation records were changed. The production build updates current dist assets as expected for the UI refactor; the frozen snapshot is preserved.

## Remaining limits

Real-browser pixel layout, mobile viewport appearance and native clipboard permissions are unverified; DOM interactions and responsive CSS are covered by the checks above. The earlier baseline verifier intentionally compares the current working UI to the old frozen UI and will now report that expected difference. It was not modified to hide the authorized UI change. Frozen generation evaluation continues to use its unchanged snapshot.
