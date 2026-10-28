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

The first visit asks “Are you an EU citizen?” with no answer preselected. Yes shows five steps; No shows six, including the residence permit step. **Change EU answer** lets users correct their answer. Saving or cancelling that change preserves completed steps and document ticks; hidden residence-permit progress returns if the answer changes to No.

Tap a step title to open its reason, timing, packing checklist and official guidance. The overview checkbox and detail completion button update the same saved record. Completed steps stay in order, gain a Done badge and a crossed-out title, and update the progress count. Document ticks are shared across steps using the same document ID; ticking a document does not complete a step. **Back to overview** restores focus and scroll position.

The **About** entry in the overview header opens a simple view with the supplied press-release description, eight FAQ pairs and team credit. Its back button returns to the overview. The existing checklist and detail navigation still uses show/hide on the same page.

All user-facing copy, step guidance, packing lists and source links live in `data/steps.json`. Keep stable IDs when editing existing items. The loader validates required copy, unique IDs, packing references and HTTPS source URLs before rendering. Preserve `TO VERIFY` markers until the team has checked the claim against official guidance; only update review dates after a real review.

## Brand and press copy

The brand update uses the exact supplied `assets/brand/amigro-icon.png` and `assets/brand/amigro-logo.png`, copied without image edits. The wordmark is left aligned at 32 px high; the icon is used for the browser favicon and Apple touch icon. The interface uses white, mint `#83FFA9`, dark green `#10984E` and near-black text. Primary buttons use large bold white text on dark green. Onboarding, the overview line, detail headings, packing reminder and About copy come from the JSON UI content. Step records, document records, order, deadlines, source links, review dates and saved-progress fields are unchanged.

The supplied press copy claims a fixed order, complete packing lists and an appointment outcome that the existing step data does not promise. The About view flags this with `TO VERIFY`: health insurance and residence requirements may need attention immediately, document lists are starting lists, and the tax ID step has no documents to bring for automatic allocation. The original guidance remains in the step details.

This checkout is the plain HTML/CSS/JavaScript app. It has no Expo project or Expo dependencies. Native app-icon, Android adaptive-icon and splash configuration, `npx expo start`, and Expo Go verification on iOS and Android require the Expo project path. No Expo configuration or framework migration was added. The web app uses the GitHub Pages setup and public URL above.

## Saved data and recovery

The `amigro.progress.v1` localStorage record contains the EU answer, completed step IDs, document ticks and any previously saved move-in date. Older records without an EU answer show the welcome while retaining their other data. Dates are preserved but are not displayed by this interface.

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
.nojekyll              Static GitHub Pages publishing marker
tests/model.test.js    Persistence, date and content checks
```

## Checks

With Node.js installed, run:

```sh
npm run check
```

No package installation is needed. This runs JavaScript syntax checks and 15 automated tests covering saved-data migration, filtered totals, answer changes, reset, storage failures, ordered writes, content integrity and date utilities.

The local review on **27 October 2026** ran those checks successfully and exercised the app in the in-app browser at **375 × 812** and **1280 × 900**. All six detail views fit without horizontal scrolling at both widths. Browser checks also covered first visit, reload persistence, shared document ticks, completion from both views, answer changes and cancellation, legacy records, corrupt storage, blocked reads/writes, reset confirmation, invalid content and malformed JSON. Welcome, overview and a long-title detail were checked at 375 px with 200% root text size. A temporary `/amigro/` hosting prefix returned HTTP 200 for the shell, CSS, JavaScript modules, JSON, SVG and `.nojekyll`; the app worked under that prefix. All six official-source URLs were opened during that review.

The live GitHub Pages site was checked on **28 October 2026**. All 15 automated tests passed again. The seven deployed app resources returned HTTP 200, had the expected content types and matched the local source byte for byte. Live browser checks covered first-visit onboarding, EU and non-EU lists, answer changes and cancellation, document ticks shared across steps, completion from both views and reload persistence. All six detail views were opened at **375 × 812** and **1280 × 900**, with correct source links, unchanged page URLs and no horizontal overflow. The browser reported no console warnings or errors. Test step and document ticks were cleared afterwards. Physical-device and cross-browser checks have not been run.

The later local brand update on **28 October 2026** passed JavaScript syntax checks and all 15 tests, including validation of the new JSON copy and FAQ entries. Browser checks covered the new first-visit copy, EU filtering, the eight FAQ pairs and footer, Back focus, document ticks shared across steps, completion from both views, reload persistence, and About plus all six detail views at **375 × 812** and **1280 × 900**. The local preview had no horizontal overflow or browser console warnings or errors. Both PNGs matched the supplied files byte for byte. These checks used the web app; Expo Go was not tested.

The branded version was published to the public URL on **28 October 2026**. All 15 tests passed before publication. Its eight app resources returned HTTP 200 with the expected content types and matched the local source, including both original PNGs. Live checks covered About and all six detail views at **375 × 812** and **1280 × 900**, EU filtering, cancellation, saved completion and shared document ticks after a reload. There was no horizontal overflow or browser console warning or error. Test changes were undone, restoring the previous checklist state. Physical-device and Expo Go checks remain unperformed.

For a manual smoke test after changes:

1. Use a fresh browser origin, select Yes and start: expect five steps. Change the EU answer to No: expect six. Cancel another answer change and confirm nothing changes.
2. Open a detail, tick a shared document and mark the step done. Return to the overview and mark another step done; check the count and Done badges. Reload, then undo completion from each view.
3. Check the tax-ID step’s empty packing list and the residence step’s applicability note. Open an official source and confirm it opens in a new tab.
4. Repeat at 375 px and desktop width, then increase browser text size and test on a physical phone. Use disposable saved data when testing reset or simulated storage faults.
5. Open **About**, check the FAQ, credit and `TO VERIFY` note, then return to the checklist and confirm its progress is unchanged.
