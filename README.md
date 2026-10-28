# Amigro

Amigro is a mobile-first checklist that helps newcomers organise their first bureaucratic steps in Berlin.

Public URL: [https://beaberlin.github.io/amigro/](https://beaberlin.github.io/amigro/)

Source repository: [BeaBerlin/amigro](https://github.com/BeaBerlin/amigro).

Plain HTML, CSS and vanilla JavaScript. No framework, build step, runtime dependencies or application backend.

## Run locally

From the project folder:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open [Amigro locally](http://localhost:8000/). On a physical phone on the same network, use `http://YOUR-COMPUTER-LAN-IP:8000/`. Serve the files over HTTP: opening `index.html` directly does not reliably support JSON fetching and JavaScript modules. This version runs in a browser; Expo Go is not used.

## Publish with GitHub Pages

Amigro was first published on 28 October 2026. Pages uses **Deploy from a branch → main → /(root)**. Changes committed to `main` publish automatically.

1. Push the project files to `BeaBerlin/amigro`, keeping `index.html`, `data/` and `.nojekyll` in the repository root. No install or build command is needed.
2. To review the publishing settings, open the repository’s **Settings → Pages** and keep **Deploy from a branch → main → /(root)** selected.
3. Wait for **pages build and deployment** in the repository’s **Actions** tab to finish successfully.
4. Open the published site and check that the welcome, all applicable steps and official source links work. Reload after marking a step done to confirm progress is retained.

See GitHub’s [publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The empty `.nojekyll` file tells Pages to serve this static project without Jekyll processing.

App assets, imports and the JSON request use relative paths, including under the live `/amigro/` path. Official source links intentionally use absolute HTTPS URLs. Views share one page and use show/hide; no server rewrites or routing library are required. Localhost progress is separate from the published site’s browser storage.

## App behaviour

The first visit asks four Yes/No questions: EU citizenship, moving in with a job contract, student status and bringing family. No answer is preselected, and all four are required before starting. **About → Edit answers** opens the same form later; **Edit answers** also remains available below the overview. Saving or cancelling returns to the view that opened the form and preserves completed steps and document ticks. Cancel discards the draft answers.

The **List / Path** toggle at the top of the overview changes how the same checklist is displayed. Path uses the existing short titles, numbered circles and a connecting line. Done circles are mint (`#83FFA9`); the first unfinished applicable step is dark green (`#10984E`) and labelled **Next step**. Tapping a circle opens its detail. Both modes keep the overview checkboxes and share the same completion state and progress bar. Back returns to the selected mode. Switching modes does not change saved data; reloading starts in List while retaining saved progress.

Checklist filtering reads the optional `applies_if` object on each step in `data/steps.json`. Supported condition keys are `eu`, `job`, `student` and `family`, with boolean values. Every listed condition must match. The reserved `_review: "TO VERIFY"` entry flags an unverified default for the team and is ignored by the filter. An empty object is unconditional; omitting the field retains the older `nonEuOnly` behaviour. Unknown answers do not hide steps in the model; the interface asks for all missing answers before showing the checklist.

The existing first five steps have no conditions. The residence permit has `eu: false`. All six defaults are marked `TO VERIFY`; job, student and family answers do not hide any existing step because no verified rules for them were supplied. EU citizens see five steps and non-EU citizens see six. Hidden residence-permit progress returns if the EU answer changes to No. This update adds no steps or bureaucracy guidance and leaves document lists, deadlines, source URLs and review dates unchanged.

Tap a step title to open its reason, timing, packing checklist and official guidance. The overview checkbox and detail completion button update the same saved record. Completed steps stay in order, gain a Done badge and a crossed-out title, and update the progress count. Document ticks are saved separately for each step, even when two steps list the same document. Ticking a document does not complete the step. **Back to overview** restores focus and scroll position.

Each packing list shows a document count and a green **Ready to go** badge once all its listed documents are ticked. List and Path cards show the same readiness count or badge. Unticking a document removes the ready badge immediately. Steps without documents retain the empty-list message and have no readiness badge or overview indicator.

The optional `common_mistakes` field on a step is an array of plain-text strings. Nonempty arrays appear under **Common mistakes** between the packing list and the official source. Empty or omitted arrays show no section. All six shipped arrays are empty; the team should fill them only from verified sources. No mistake guidance was added by this change.

The **About** entry in the overview header opens a simple view with the supplied press-release description, eight FAQ pairs and team credit. Its back button returns to the overview. The existing checklist and detail navigation still uses show/hide on the same page.

All user-facing copy, step guidance, packing lists and source links live in `data/steps.json`. Keep stable IDs when editing existing items. The loader validates required copy, unique IDs, packing references and HTTPS source URLs before rendering. Preserve `TO VERIFY` markers until the team has checked the claim against official guidance; only update review dates after a real review.

## Brand and press copy

The brand update uses the exact supplied `assets/brand/amigro-icon.png` and `assets/brand/amigro-logo.png`, copied without image edits. The wordmark is left aligned at 32 px high; the icon is used for the browser favicon and Apple touch icon. The interface uses white, mint `#83FFA9`, dark green `#10984E` and near-black text. Primary buttons use large bold white text on dark green. Onboarding, the overview line, detail headings, packing reminder and About copy come from the JSON UI content. That brand update left the step guidance and saved-progress fields unchanged; the later questionnaire update adds status fields and applicability rules as described above.

The supplied press copy claims a fixed order, complete packing lists and an appointment outcome that the existing step data does not promise. The About view flags this with `TO VERIFY`: health insurance and residence requirements may need attention immediately, document lists are starting lists, and the tax ID step has no documents to bring for automatic allocation. The original guidance remains in the step details.

This checkout is the plain HTML/CSS/JavaScript app. It has no Expo project or Expo dependencies. Native app-icon, Android adaptive-icon and splash configuration, `npx expo start`, and Expo Go verification on iOS and Android require the Expo project path. No Expo configuration or framework migration was added. The web app uses the GitHub Pages setup and public URL above.

## Saved data and recovery

The official AsyncStorage web implementation stores the `amigro.progress.v1` record through its Promise-based compatibility backend, which uses browser localStorage. Vendored modules and their MIT licenses live in `vendor/`; see [dependency provenance](vendor/README.md). There is no runtime CDN request, package installation, React dependency or build step.

The record contains `euCitizen`, `jobContract`, `student` and `bringingFamily` as boolean or null answers, alongside completed step IDs, `packedDocumentsByStep` (a map of step IDs to ticked document IDs) and any previously saved move-in date. Existing records use the same storage key and backend. Missing answers remain null and reopen onboarding with known answers prefilled. Hydration and migration do not write until the next user change. Dates and hidden ticks are preserved. Dates are not displayed by this interface.

For an older record without `packedDocumentsByStep`, the old shared `packedDocuments` ticks seed each step that lists those documents. After that, each step's ticks are independent. A present map, including an empty map, is authoritative, so clearing ticks cannot restore them from the old array on reload. The legacy array remains in the record for compatibility; the interface reads and changes only the per-step map. Restore removes retired step IDs and documents not listed for their step. Malformed maps pause editing and preserve the saved record for recovery.

Storage loads before edits are enabled, and writes run in order. A failed save leaves the latest changes in memory with a visible warning and **Try saving again** button. Keep the page open until saving succeeds. Failed or unreadable reads pause editing to protect the existing record. Users can retry loading or choose **Reset saved data**, which requires confirmation and clears the entire saved checklist. Cancelling the confirmation preserves it.

Progress belongs to this browser and origin. It is not synced across devices or merged between tabs. Clearing site data starts again. There is no account, personal-document upload or service worker.

If valid JSON is available but incomplete, the loader shows its error copy and retry control. If the JSON file cannot load or be parsed at all, the emergency shell can only expose its resource path and a retry icon: all human-readable copy belongs to that unavailable file. Without JavaScript, the shell exposes the JSON as a reference. The app needs its static files to be available; it does not promise offline access.

## Files

```text
index.html             Single-page shell
styles.css             Mobile-first styles
app.js                 Content loading and simple views
js/model.js            Content validation and ordered persistence
data/steps.json        All user-facing content and official sources
assets/brand/          Exact supplied PNG icon and wordmark
vendor/                AsyncStorage web modules, idb, licenses and provenance
.nojekyll              Static GitHub Pages publishing marker
tests/model.test.js    Persistence, date and content checks
```

## Checks

With Node.js installed, run:

```sh
npm run check
```

No package installation is needed. This runs JavaScript syntax checks and 24 automated tests covering saved-data migration, per-step packing and readiness, optional mistakes arrays, all 16 status profiles, optional and combined applicability rules, filtered totals, answer changes, reset, the actual AsyncStorage web adapter, storage failures, ordered writes, content integrity and date utilities.

The local review on **27 October 2026** ran those checks successfully and exercised the app in the in-app browser at **375 × 812** and **1280 × 900**. All six detail views fit without horizontal scrolling at both widths. Browser checks also covered first visit, reload persistence, shared document ticks, completion from both views, answer changes and cancellation, legacy records, corrupt storage, blocked reads/writes, reset confirmation, invalid content and malformed JSON. Welcome, overview and a long-title detail were checked at 375 px with 200% root text size. A temporary `/amigro/` hosting prefix returned HTTP 200 for the shell, CSS, JavaScript modules, JSON, SVG and `.nojekyll`; the app worked under that prefix. All six official-source URLs were opened during that review.

The live GitHub Pages site was checked on **28 October 2026**. All 15 automated tests passed again. The seven deployed app resources returned HTTP 200, had the expected content types and matched the local source byte for byte. Live browser checks covered first-visit onboarding, EU and non-EU lists, answer changes and cancellation, document ticks shared across steps, completion from both views and reload persistence. All six detail views were opened at **375 × 812** and **1280 × 900**, with correct source links, unchanged page URLs and no horizontal overflow. The browser reported no console warnings or errors. Test step and document ticks were cleared afterwards. Physical-device and cross-browser checks have not been run.

The later local brand update on **28 October 2026** passed JavaScript syntax checks and all 15 tests, including validation of the new JSON copy and FAQ entries. Browser checks covered the new first-visit copy, EU filtering, the eight FAQ pairs and footer, Back focus, document ticks shared across steps, completion from both views, reload persistence, and About plus all six detail views at **375 × 812** and **1280 × 900**. The local preview had no horizontal overflow or browser console warnings or errors. Both PNGs matched the supplied files byte for byte. These checks used the web app; Expo Go was not tested.

The branded version was published to the public URL on **28 October 2026**. All 15 tests passed before publication. Its eight app resources returned HTTP 200 with the expected content types and matched the local source, including both original PNGs. Live checks covered About and all six detail views at **375 × 812** and **1280 × 900**, EU filtering, cancellation, saved completion and shared document ticks after a reload. There was no horizontal overflow or browser console warning or error. Test changes were undone, restoring the previous checklist state. Physical-device and Expo Go checks remain unperformed.

The questionnaire update was checked locally on **28 October 2026**. JavaScript syntax checks and all 20 automated tests passed. This environment provided Node without npm, so the check script's commands were run directly. Browser checks covered four required answers, first visit, About and overview editing, saving and cancellation with focus return, EU filtering, hidden progress preservation, shared document ticks, completion from both views, reload persistence and migration of an EU-only legacy record with existing ticks and date. Simulated blocked reads and writes retained visible warnings; retry saved the latest answers. Corrupt-data reset cancellation and confirmation were checked, and reset cleared all four answers. The questionnaire and all six detail views had no horizontal overflow at **375 × 812** and **1280 × 900**, with answer targets at least 56 px high. The first-visit form also fit at 375 px with 200% root text size. No browser console warnings or errors were reported. These checks used a temporary `/app/` hosting prefix. These were local checks before publication; physical-device and Expo Go checks have not been run.

The Path view was checked locally on **28 October 2026**. Syntax checks and all 20 tests passed again. Browser checks at **375 × 812** and **1280 × 900** covered both modes, all six circle-to-detail links, Back focus, keyboard toggles, shared completion, out-of-order completion, undo, all-done states, EU filtering and reload persistence. Circles measured 56 × 56 px; toggle targets exceeded 48 px high. There was no horizontal overflow, including Path at 375 px with 200% root text size. Blocked storage reads kept the toggles disabled; failed-save warnings survived switching modes and cleared after retry. The browser reported no console warnings or errors. Those were local checks before publication.

The questionnaire and Path updates were published on **28 October 2026**. The [Pages deployment](https://github.com/BeaBerlin/amigro/actions/runs/40667414872) succeeded for commit `5cddad7`. All 12 deployed app resources returned HTTP 200 with the expected content types and matched the tested local files byte for byte. Live interaction checks in a private Safari window covered first-visit onboarding, List and Path, opening a step detail, completion from both views, Back, reload persistence, About editing and EU filtering. The in-app browser at 375 px confirmed that an existing EU-only record keeps its known answer and asks for the three missing answers, without horizontal overflow or console warnings or errors. The full responsive Path checks at 375 and 1280 px were run locally on these identical app files, as recorded above. Normal browser answers were not changed by the live checks. Physical-device and Expo Go checks remain unperformed.

The packing-readiness update was checked locally on **28 October 2026**. Syntax checks and all 24 tests passed. Browser checks covered independent ticks for the same document in two steps, reload persistence, ready/partial transitions in detail and both overview modes, preservation of old shared ticks during migration, clearing migrated ticks without restoring them on reload, and storage-failure warnings and retry. All six details and both overview modes fit at **375 × 812** and **1280 × 900**; ready detail and Path also fit at 375 px with 200% root text size. An unshipped fixture verified populated and omitted mistakes arrays, including literal rendering of HTML-like text. All shipped arrays remain empty. No browser console warnings or errors were reported. The existing guidance, packing lists, applicability rules, source URLs and review dates were unchanged.

For a manual smoke test after changes:

1. Use a fresh browser origin and answer three questions: Start should remain disabled. Answer the fourth and start. EU Yes shows five steps; No shows six. Open **About → Edit answers**, change the answers, save and return to the overview. Reload and reopen the editor to confirm all four answers were retained. Cancel another change and confirm the previous answers remain.
2. Open a detail, tick a document and mark the step done. Open another step listing that document: its tick should remain independent. Return to the overview and mark another step done; check the count and Done badges. Reload, then undo completion from each view.
3. Check the tax-ID step’s empty packing list and the residence step’s applicability note. Open an official source and confirm it opens in a new tab.
4. Repeat at 375 px and desktop width, then increase browser text size and test on a physical phone. Use disposable saved data when testing reset or simulated storage faults.
5. Open **About**, check the FAQ, credit and `TO VERIFY` note. Change EU No to Yes and back through the answer editor: hidden residence-permit ticks should return, and document ticks should remain unchanged. Existing EU-only saved records should prefill EU and ask for the other three answers.
6. Mark a step done in List, switch to **Path**, and check its mint circle and the dark-green **Next step**. Tap a circle, complete or reopen that step, and return. Switch to List and reload to confirm the same ticks remain. Complete all visible steps: every circle should be mint with no Next step highlight.
7. Tick every document for one step: **Ready to go** should appear in the detail and in both overview modes. Reload to confirm the ticks remain, then untick one document to remove readiness. Packing readiness should never complete the step. The tax ID step should have no readiness indicator. **Common mistakes** should stay hidden while the shipped arrays are empty.
