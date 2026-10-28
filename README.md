# Amigro

Amigro is a mobile-first checklist that helps newcomers organise their first bureaucratic steps in Berlin.

Public URL placeholder: `https://YOUR-USERNAME.github.io/YOUR-REPOSITORY/`

Plain HTML, CSS and vanilla JavaScript. No framework, build step, runtime dependencies or application backend.

## Run locally

From the project folder:

```sh
python3 -m http.server 8000 --bind 0.0.0.0
```

Open [Amigro locally](http://localhost:8000/). On a physical phone on the same network, use `http://YOUR-COMPUTER-LAN-IP:8000/`. Serve the files over HTTP: opening `index.html` directly does not reliably support JSON fetching and JavaScript modules. This version runs in a browser; Expo Go is not used.

## Publish with GitHub Pages

1. Push the project files to a GitHub repository, keeping `index.html`, `data/` and `.nojekyll` in the repository root. No install or build command is needed.
2. In the repository, open **Settings → Pages**. Choose **Deploy from a branch**, select the branch containing these files, choose **/(root)**, then save.
3. Wait for GitHub to report the published URL. Replace the placeholder above with that URL.
4. Open the published site and check that the welcome, all applicable steps and official source links work. Reload after marking a step done to confirm progress is retained.

See GitHub’s [publishing-source instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site). The empty `.nojekyll` file tells Pages to serve this static project without Jekyll processing. Publishing has not been performed as part of this review.

App assets, imports and the JSON request use relative paths, including when hosted under `/YOUR-REPOSITORY/`. Official source links intentionally use absolute HTTPS URLs. Views share one page and use show/hide; no server rewrites or routing library are required. Localhost progress is separate from the published site’s browser storage.

## App behaviour

The first visit asks “Are you an EU citizen?” with no answer preselected. Yes shows five steps; No shows six, including the residence permit step. **Change EU answer** lets users correct their answer. Saving or cancelling that change preserves completed steps and document ticks; hidden residence-permit progress returns if the answer changes to No.

Tap a step title to open its reason, timing, packing checklist and official guidance. The overview checkbox and detail completion button update the same saved record. Completed steps stay in order, gain a Done badge and a crossed-out title, and update the progress count. Document ticks are shared across steps using the same document ID; ticking a document does not complete a step. **Back to overview** restores focus and scroll position.

All user-facing copy, step guidance, packing lists and source links live in `data/steps.json`. Keep stable IDs when editing existing items. The loader validates required copy, unique IDs, packing references and HTTPS source URLs before rendering. Preserve `TO VERIFY` markers until the team has checked the claim against official guidance; only update review dates after a real review.

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
assets/mark.svg        Decorative brand mark
.nojekyll              Static GitHub Pages publishing marker
tests/model.test.js    Persistence, date and content checks
```

## Checks

With Node.js installed, run:

```sh
npm run check
```

No package installation is needed. This runs JavaScript syntax checks and 15 automated tests covering saved-data migration, filtered totals, answer changes, reset, storage failures, ordered writes, content integrity and date utilities.

The review ran those checks successfully and exercised the app in the in-app browser at **375 × 812** and **1280 × 900**. All six detail views fit without horizontal scrolling at both widths. Browser checks also covered first visit, reload persistence, shared document ticks, completion from both views, answer changes and cancellation, legacy records, corrupt storage, blocked reads/writes, reset confirmation, invalid content and malformed JSON. Welcome, overview and a long-title detail were checked at 375 px with 200% root text size. A temporary `/amigro/` hosting prefix returned HTTP 200 for the shell, CSS, JavaScript modules, JSON, SVG and `.nojekyll`; the app worked under that prefix. All six official-source URLs were opened during the review. Physical-device and cross-browser checks have not been run.

For a manual smoke test after changes:

1. Use a fresh browser origin, select Yes and start: expect five steps. Change the EU answer to No: expect six. Cancel another answer change and confirm nothing changes.
2. Open a detail, tick a shared document and mark the step done. Return to the overview and mark another step done; check the count and Done badges. Reload, then undo completion from each view.
3. Check the tax-ID step’s empty packing list and the residence step’s applicability note. Open an official source and confirm it opens in a new tab.
4. Repeat at 375 px and desktop width, then increase browser text size and test on a physical phone. Use disposable saved data when testing reset or simulated storage faults.
