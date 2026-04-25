# Test assets

One-time-fetch external artifacts used during demo rehearsal and integration tests. Checked-in items go under `test-assets/` directly; items that are licensed or too large are documented here with fetch instructions and kept out of git via `.gitignore`.

## Grundfos NB-G 65-250 — installation and operating instructions (PDF)

Used by the onboarding-wizard demo scene (see `docs/planning/M9-polish-e2e/demo-plant-design.md §8`). The wizard uploads this PDF, the KB Builder reads it with Opus 4.7 vision, and calibrates alert thresholds from the extracted content. A real manufacturer PDF produces a more convincing demo than a synthetic one — the vision extraction is the scene-stealer of the onboarding beat.

**Expected path:** `test-assets/grundfos-nb-g-65-250-iom.pdf` (~2 MB).

**Not checked into git.** Grundfos's manuals are copyrighted and redistribution would need explicit licensing — the presenter fetches once before demo day.

### How to fetch

1. Open <https://product-selection.grundfos.com/> (or `net.grundfos.com/Appl/WebCAPS`).
2. Search for `NB-G 65-250`.
3. Navigate to the product page → "Downloads" / "Installation and operating instructions".
4. Save the PDF as `test-assets/grundfos-nb-g-65-250-iom.pdf` in this repo.

Alternative: any Grundfos pump IOM of similar vintage produces comparable extraction quality. The demo narrative does not pin the exact model — "Grundfos pump manual" is enough. Use `CR 32-2` if that's easier to find — the existing P-02 KB was calibrated against that model.

### Expected KB Builder extraction against this PDF

- Manufacturer: `Grundfos`
- Model family: `NB-G`
- Vibration alert / trip thresholds per ISO 10816-7 class II (`2.8 mm/s` alert, `4.5 mm/s` trip)
- Bearing reference numbers, lubrication interval, design flow rate

### Demo-narrative framing

The demo plant is labelled as a bottled-water line; the onboarding scene frames the cell as a `Bottle Labeler`. Using a pump IOM for a labeler is a deliberate demo simplification — the wizard is showing *the process of reading a manual*, not the specifics of a labeler. The extraction pipeline is manufacturer-agnostic; swapping the PDF swaps the KB without any code change. See `docs/planning/M9-polish-e2e/demo-plant-design.md §8` for rationale.

## Adding a new asset

1. Stage the artifact under `test-assets/<your-asset>.<ext>`.
2. If it is licensed or over ~10 MB, add the filename to the repo `.gitignore` and document the fetch here.
3. If it is freely redistributable and small, check it in directly.
4. Add a short subsection above with: purpose, path, fetch instructions, expected consumer behaviour.
