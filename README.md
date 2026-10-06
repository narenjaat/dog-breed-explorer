# Dog Breed Explorer

An offline-first React Native app for browsing all 283 breeds from the
[Dog API v2](https://dogapi.dog/docs/api-v2), built for the Tripare AI
React Native assessment.

Built with React Native 0.86 (bare CLI, New Architecture) · TypeScript strict · Redux Toolkit ·
SQLite · React Navigation.

---

## Quick start

```bash
npm install
npm run pods             # iOS only: bundle install + pod install
cp .env.example .env     # optional — see "Environment" below
npm start                # Metro, in its own terminal
npm run ios              # or: npm run android
```

`npm test` runs the suite (196 tests). `npm run typecheck` runs `tsc --noEmit`, and
`npm run lint` / `npm run format:check` run ESLint and Prettier, as CI does.

**Requirements:** Node 22.11+, and Xcode + CocoaPods (iOS) or Android Studio +
JDK 17 (Android). The native projects live in `ios/` and `android/` and are
committed. The first `npm run ios` / `npm run android` compiles them and takes
a few minutes; subsequent runs are fast.

**Upgrading a device that had the old Expo build installed** (same bundle id):
uninstall it first, or clear the app's data. The Expo build's HTTP cache holds
zstd-encoded API responses that the RN networking stack cannot decode, which
shows up as "The Dog API returned data in an unexpected format."

### Environment

**The Dog API requires no key or auth token, so `.env` is optional** — the app
ships with working defaults and runs correctly without it. `.env.example`
exists only so the base URL and network tuning can be changed without editing
code (for example, pointing at a mock server):

| Variable | Default | Purpose |
|---|---|---|
| `DOG_API_BASE_URL` | `https://dogapi.dog/api/v2` | API base URL |
| `DOG_API_TIMEOUT_MS` | `15000` | Per-request timeout |
| `DOG_API_MAX_RETRIES` | `3` | Retry attempts (exponential backoff) |
| `DOG_API_PAGE_SIZE` | `48` | Records per page (see note below) |

These are inlined into the JS bundle at build time by `babel.config.js`, so
after changing `.env` restart Metro with `npm start -- --reset-cache`.
Values are validated, not trusted: a malformed number falls back to its default
rather than producing a `NaN` timeout.

---

## Architecture overview

The app is built around one rule: **SQLite is the source of truth for what the
user sees; the network is an optimisation.** On launch, the app reads its local
database and renders immediately — before any network call. Synchronisation is
a background process that updates that database, and the UI re-reads from it.
This is what makes a cold start in aeroplane mode behave identically to a cold
start on wifi.

Data flows in one direction. The API layer fetches all six pages concurrently,
narrows every untrusted JSON payload into typed domain objects through total
parsers (no `any`, no throwing), and merges the pages into one de-duplicated
dataset. The sync service writes that result to SQLite as a **transactional
upsert**, never a delete-and-replace. Repositories then read it back, Redux
holds a normalised projection, and memoised selectors derive the filtered,
grouped list the UI renders.

The consequence of that design is how failure behaves. If two of six pages
fail, the four that succeeded are written, the user keeps the breeds they
already had, a non-blocking banner names the failed pages, and the "last
synced" timestamp does *not* advance. If the first page fails, nothing is
written at all. **A failed sync never leaves the user worse off than before it
started.**

```mermaid
flowchart LR
    API["Dog API v2<br/>6 pages"] --> Client["API layer<br/>retry · backoff · parse"]
    Client --> Sync["Sync service<br/>merge · de-dupe"]
    Sync -->|transactional upsert| SQLite[("SQLite")]
    SQLite -->|hydrate on launch| Redux["Redux<br/>normalised cache"]
    Redux --> Selectors["Memoised selectors<br/>filter · group"]
    Selectors --> UI["List · Details · Gallery"]
    UI -->|pull to refresh| Sync
    Net["Connectivity"] --> Sync
```

**[docs/APPROACH.md](docs/APPROACH.md) is the best place to start** — how the
app was built, what probing the live API changed, and the three bugs that only
running it on both platforms revealed.

Full detail: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) ·
[docs/DECISIONS.md](docs/DECISIONS.md) ·
[docs/PERFORMANCE.md](docs/PERFORMANCE.md)

---

## Key technical decisions

**Why Redux Toolkit?** `createEntityAdapter` gives a normalised `{ids,
entities}` cache — O(1) detail lookup, a pre-sorted id array for the list — and
`createSelector` is the mechanism that keeps filtering off the render path.
Context+Reducer was ruled out because it cannot express "re-render only what
changed", which a 283-row list needs.

**Why SQLite?** AsyncStorage would mean deserialising all 283 rich records to
filter any of them, and rewriting the entire blob to update one breed. SQLite
makes a sync a transactional upsert and leaves filtering free to move into an
indexed query as the dataset grows. Columns the list filters on (`group_id`,
`size_band`, `coat_category`, `hypoallergenic`,
three trait scores) are scalar and indexed; rarely-queried nested structures
are JSON.

**Why filter in a selector, not in SQL?** At 283 rows a memoised
`createSelector` pass over pre-derived fields takes well under a frame, with no
async hop and no stale-result race. Every facet is already an indexed column,
so moving the filter into SQL once the dataset outgrows memory is a query
change, not a migration. See [DECISIONS.md §4](docs/DECISIONS.md).

**Why React Navigation?** Native stack navigator with a single
`RootStackParamList` as the source of truth, so a param rename is a compile
error at every call site rather than a runtime `undefined`.

**Offline sync strategy.** Render from cache first → probe connectivity → sync
only if the cache is empty or older than 6 hours → re-sync on the
offline→online *edge* and on foreground when stale. Writes are upserts inside a
transaction. A run that yields zero breeds is treated as an error, not a wipe.

**Image caching strategy.** Tiered by context, via
`@d11/react-native-fast-image`: list thumbnails are cached `immutable` (283
small files the user scrolls past every session — worth persisting for offline
relaunch); the detail hero is `immutable`; gallery slides use `web` caching
(they follow HTTP cache headers rather than being pinned), and only the
*active* slide upgrades to `large`.
Caching every variant of ~2,400 images would be hundreds of MB of
mostly-unviewed data.

---

## Notes on the source data

Probing the live API surfaced several things worth stating, because they
contradict or extend the brief:

- **Pagination.** The API's *default* page size is 30 (10 pages), not 48.
  `page[size]=48` is supported and yields the 6 pages the brief describes, so
  the app passes it explicitly and drives the loop from
  `meta.pagination.last`. Code that assumed "6 pages" without setting the size
  would have silently lost 103 breeds.
- **`exercise_minutes` is not a 1-5 score.** It ranges 20–120. It is rendered
  as a duration with its own scale, not crammed onto a 5-point bar.
- **"Wire" is a coat *type*, not a length.** The API splits `coat.type`
  (wire/curly/corded/…) from `coat.length` (short/medium/long/hairless). The
  single filter the brief asks for is derived from both.
- **Missing data uses empty objects, not nulls.** One breed (Bavarian Mountain
  Scent Hound) ships `traits: {}`, `coat: {}`, `origin: {}` and empty height
  objects. `origin.era` is absent on 104 breeds, `region` on 50.
- **Image counts run to 10**, not the "up to 9" the brief states.

A missing trait is modelled as `null`, never `0` — an empty bar reading
"scores lowest" is a different and false claim from "not rated".

---

## Features

**Breed list** — all 283 breeds, virtualised and grouped by breed group, with
debounced search across `name` and `other_names`, pull-to-refresh, thumbnails,
skeleton/empty/error states and a non-blocking sync banner.

**Filters** (multi-select, composable — values within a facet OR, facets AND):
breed group · size band · coat · hypoallergenic · trait threshold. So
`Sporting + Large + Hypoallergenic + good_with_children ≥ 4` is expressible.

**Breed details** — Overview (description, lifespan, weight/height for both
sexes, origin, other names, kennel clubs), Traits (11 traits as visual scales
plus temperament tags), Gallery (swipeable, with author/license/source
attribution surfaced per image).

**Offline** — full functionality after the first sync, background sync on
reconnect, "Last synced 2 hours ago" freshness, and partial-failure handling
that preserves cached data.

---

## Performance report

Measured figures and the commands that produced them are in
[docs/PERFORMANCE.md](docs/PERFORMANCE.md).

| Metric | Value |
|---|---|
| Android JS bundle (release) | **1.43 MB** minified JS / 2.09 MB Hermes bytecode, 909 modules (minified was 2.38 MB before removing unused dependencies) |
| Full sync, 6 pages / 283 breeds | **~4.4s** (concurrent), 0 duplicates, 0 parse failures |
| Partial failure (2 of 6 pages down) | **187 breeds recovered**, cache preserved |
| Test suite | **196 tests, 8 suites** |

Verified running on **both platforms**: iOS 26 simulator (iPhone 17 Pro) and
Android emulator (API 36), from the same source with no platform branching.

**Device profiling is not yet captured.** Time-to-interactive, sustained FPS
and memory must be recorded on a physical device; PERFORMANCE.md contains the
exact commands and `TODO` markers for each. No profiling number is estimated or
quoted here that was not actually measured.

---

## Screenshots

### Breed list — light and dark

| iOS (light) | iOS (dark) |
|---|---|
| ![Breed list, light mode](assets/screenshots/01-breed-list-light.png) | ![Breed list, dark mode](assets/screenshots/02-breed-list-dark.png) |

**Android** — same source, no platform branching:

![Breed list on Android](assets/screenshots/07-breed-list-android.png)

### Filters

Multi-select facets compose: selecting **Sporting + Large** narrows 283 breeds
to 16, with the count updating live on the Apply button.

| Filter sheet (2 facets active) | Result: every row is Sporting AND Large |
|---|---|
| ![Filters applied](assets/screenshots/03-filters-applied.png) | ![Filtered results](assets/screenshots/04-filtered-results.png) |

### Breed details

| Overview | Traits |
|---|---|
| ![Detail overview](assets/screenshots/06-details-overview.png) | ![Traits as visual scales](assets/screenshots/05-details-traits.png) |

The Traits tab shows the ten 1-5 scores as segmented scales, and
`exercise_minutes` as a **separate proportional bar labelled in real units**
("1 hr/day") — it ranges 20-120 in the source data, so a 5-point scale would
misrepresent it.

**Gallery with attribution** — author, licence and source surfaced per image,
as tappable links:

![Gallery with attribution](assets/screenshots/08-gallery-attribution.png)

## Testing

```bash
npm test                 # 196 tests, 8 suites
npm run test:coverage
npm run typecheck        # tsc --noEmit, strict
npm run lint             # ESLint (@react-native config), zero warnings allowed
npm run format:check     # Prettier
```

| Suite | Covers |
|---|---|
| `parsers` | Malformed payloads, sparse records, null-vs-zero traits, attribution retention, size-band and coat-category boundaries |
| `pagination` | 6-page merge, duplicate collapse, partial-page survival, page-1 failure |
| `client` | Retry policy, full-jitter backoff, timeout vs cancellation, error classification |
| `syncService` | Partial failure, cache preservation, empty-response guard, concurrency |
| `database` | Row mapping, corrupt-JSON tolerance, migrations |
| `upsert` | Shipped SQL against a **real** SQLite engine (`sql.js`) |
| `filters` | Search, every facet, composed filters, grouping, selector memoisation |
| `ui` | Trait scales, banner decision table, formatters, relative time, external-link allowlist |

The most load-bearing test is in `upsert.test.ts`: it runs the shipped
migrations and upsert statement against a real SQL engine and asserts that a
partial sync mentioning 1 of 3 breeds leaves the other 2 intact.

---

## Project structure

```
src/
├── api/
│   ├── client.ts       config, typed errors, fetch with timeout + retry
│   ├── dogApi.ts       breeds (all pages, merged) and groups endpoints
│   └── parsers.ts      unknown JSON -> domain objects, guards, derived facets
├── database/
│   ├── database.ts     connection + migrations (schema)
│   └── repository.ts   reads/writes for breeds, groups, sync state
├── store/
│   ├── index.ts        breeds / filters / sync slices + store
│   └── selectors.ts    memoised filtering and grouping
├── hooks/
│   ├── useOfflineSync.ts   launch from cache, connectivity, background sync
│   └── useBreedDetails.ts  one breed: cache first, then network refresh
├── screens/            BreedListScreen, BreedDetailsScreen (+ trait scales)
├── components/         list row, search bar, filter sheet, gallery,
│                       sync banner, loading/empty states + error boundary
├── syncService.ts      API -> SQLite sync, never makes the cache worse
├── navigation.tsx      typed routes + stack
├── theme.tsx           tokens, light/dark palettes, theme context
├── types.ts            domain model + sync state
├── format.ts           display formatting, safe external URLs
└── __tests__/          8 suites
docs/                   APPROACH · ARCHITECTURE · DECISIONS · PERFORMANCE · SCREENSHOTS
```

---

## Code quality

- TypeScript **strict**, plus `noUncheckedIndexedAccess`, `noUnusedLocals`,
  `noUnusedParameters`, `noImplicitOverride`.
- **No `any`.** Untrusted JSON enters as `unknown` and is narrowed by type
  guards at the top of `src/api/parsers.ts`.
- Business logic and database access stay out of UI components.
- Error boundaries around the app root, each screen, and the gallery
  separately. Crashes go through one seam, `reportError` in `src/components/States.tsx`,
  where Sentry or Crashlytics plugs in; raw error text is shown only in
  development builds.
- API-supplied links are untrusted: only `http(s)` URLs reach
  `Linking.openURL` (`toSafeExternalUrl` in `src/format.ts`).
- CI (`.github/workflows/ci.yml`) runs lint, format check, typecheck, tests
  and a release-mode Android bundle on every pull request.
- Accessibility: labelled controls, `accessibilityRole`/`State` on interactive
  elements, trait scales announced as "Energy, 3 out of 5", 44pt minimum touch
  targets, live regions on status text.

---

## Release

**Android signing.** `android/app/build.gradle` reads the upload key from
Gradle properties, so no keystore or password is ever committed:

```properties
# ~/.gradle/gradle.properties (local), or ORG_GRADLE_PROJECT_<name> env vars in CI
DOGBREEDS_UPLOAD_STORE_FILE=/absolute/path/to/upload.keystore
DOGBREEDS_UPLOAD_STORE_PASSWORD=...
DOGBREEDS_UPLOAD_KEY_ALIAS=upload
DOGBREEDS_UPLOAD_KEY_PASSWORD=...
```

Without them, a local release build falls back to the debug key so it still
runs, but that build cannot be uploaded to Play. With Play App Signing, this
is only the upload key: Google holds the app-signing key, so a leaked upload
key can be revoked and replaced.

**iOS signing.** Certificates and profiles are kept out of the repo (the
`.gitignore` already blocks `*.p12`, `*.p8` and `*.mobileprovision`). Planned:
`fastlane match`, with certificates in a private encrypted repo.

**Planned pipeline (Fastlane).** CI already gates every PR. The next step is
a release job on tags:

1. `fastlane android beta`: bump `versionCode` from the CI build number,
   `bundleRelease`, upload the AAB to the Play internal track.
2. `fastlane ios beta`: `match`, bump the build number, `gym`, upload to
   TestFlight.
3. Promote to production with a staged rollout (for example 10%, then 50%,
   then 100%), watching crash-free sessions between steps.

Secrets live in the CI secret store and reach Gradle and Fastlane as
environment variables.

