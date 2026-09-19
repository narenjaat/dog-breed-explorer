# Performance

> **On the numbers in this document.** Everything under "Measured" was produced
> by running the commands shown, on the machine and simulator named. Everything
> under "To capture" is marked `TODO` and must be recorded on a real device
> before it is quoted anywhere. No figure in this file is estimated,
> extrapolated or invented — if it is not measured, it says so.

## Targets

| Metric | Target | Status |
|---|---|---|
| Time to interactive (warm cache) | < 3s | TODO — capture on device |
| List scroll | 60fps sustained | TODO — capture on device |
| Memory under normal use | < 150MB | TODO — capture on device |
| Full sync (6 pages, 283 breeds) | — | **Measured: ~4.4s** |
| Android JS bundle | — | **Measured: 3.44 MB** |

---

## Measured

### Bundle size

```bash
npx expo export --platform android --output-dir dist
node scripts/bundle-size.js
```

Recorded 2026-09-19, Expo SDK 57.0.24 / React Native 0.86.3, release export:

```
JS bundles
------------------------------------------------------------
     3.44 MB  _expo/static/js/android/index-<hash>.hbc

Assets
------------------------------------------------------------
      7.3 KB  18 file(s)

Total
------------------------------------------------------------
     3.44 MB  19 file(s)
```

- **3.44 MB** Hermes bytecode (`.hbc`), Android, release.
- **1,407 modules** in the graph.
- iOS export is equivalent in size (3.6 MB reported by the exporter's own
  rounding).
- Assets are only React Navigation's bundled icons; this app ships no bundled
  imagery — all breed photos are remote and cached at runtime.

`scripts/bundle-size.js` reads whatever `expo export` actually produced, so
re-running it always reports real figures rather than a copied constant.

### Source size

| | Files | Lines |
|---|---|---|
| Source (`src`, excl. tests) | 45 | 6,422 |
| Tests (`src/__tests__`) | 11 | 2,408 |

### Full synchronisation against the live API

Measured with a direct harness against `dogapi.dog` over residential wifi:

| | |
|---|---|
| Pages requested | 6 (`page[size]=48`) |
| Breeds assembled | 283 |
| Duplicates dropped | 0 |
| Records skipped (parse failures) | 0 |
| Wall clock | **~4.4s** |

Pages 2–6 are fetched concurrently; a sequential fetch of the same data would
cost roughly six serial round trips.

### Partial-failure recovery

With pages 3 and 5 forced to fail at the transport layer (4 attempts each,
confirming retry + backoff fired):

| | |
|---|---|
| Breeds recovered | **187 of 283** |
| Pages succeeded | 4 of 6 |
| Status | `partial`, failed pages reported |
| Rows written | 187 (upsert — existing rows preserved) |

### Test suite

```
Test Suites: 9 passed, 9 total
Tests:       197 passed, 197 total
Time:        ~4.3s
```

Includes `upsert.test.ts`, which runs the shipped migrations and upsert
statement against a real in-memory SQLite (`sql.js`) to prove a partial sync
does not delete unmentioned rows.

### Build

| Platform | Result |
|---|---|
| iOS, debug build to simulator | **0 errors**, 1 warning; app launches and runs |
| iOS, `expo export` | 1,411 modules |
| Android, `expo export` | **3.44 MB**, 1,407 modules |
| Android, Gradle build to emulator | see below |

Both platforms bundle from the same source with **no platform branching** —
there is no `Platform.select`, and no `.ios.tsx` / `.android.tsx` files in
`src`.

---

## What was optimised, and why

The row count here (283) is not the interesting number — see
[DECISIONS.md §10](./DECISIONS.md). The cost is **payload richness per row**:
nested traits, coat, origin, alternate names and up to 10 image records each.

| Optimisation | Mechanism | What it avoids |
|---|---|---|
| Derived facets persisted | `size_band`, `coat_category`, `search_haystack` computed once at parse time, stored and indexed | Re-deriving band/category and re-lowercasing 283 names + alias arrays on every keystroke |
| List loads no image rows | List query passes `[]` for images; row reads denormalised `thumbnail_url` | Materialising ~2,400 image objects to render 283 thumbnails |
| Memoised selectors | `createSelector` for filter + group | Re-filtering the dataset on every render and every scroll frame |
| Custom `memo` comparator | `BreedListItem` compares only displayed fields | Re-rendering all visible rows when an unrelated store slice changes |
| Stable callbacks | One `onPress(id, name)` for all rows | Per-row closures giving every row a new prop identity, defeating `memo` |
| `getItemLayout` | Fixed row (92pt) and header (40pt) heights | Measurement passes; enables O(1) scroll-to-offset |
| Debounced search | Input value and committed query are separate store fields | Refiltering on every keystroke |
| Windowed virtualisation | `initialNumToRender 12`, `maxToRenderPerBatch 12`, `windowSize 9`, `removeClippedSubviews` | Long render bursts and unbounded mounted rows |
| Tiered image cache | thumb/medium/large by context; only the active gallery slide loads `large` | Holding 9 decoded large bitmaps while swiping |
| Native-driven skeleton | `useNativeDriver: true` on the pulse | The loading state itself costing frames |
| WAL journal mode | `PRAGMA journal_mode = WAL` | List reads blocking on the sync transaction's writes |
| Serializable check off | Disabled in `configureStore` | RTK deep-walking 283 nested records on every dispatch in dev |

---

## To capture on a device

These require a physical device or profiler session. **Do not quote any of
these numbers until the capture is done** — replace each `TODO` with the real
reading and attach the screenshot.

### Startup time to interactive

```bash
npx expo run:android --variant release
```

Measure from process start to the first interactive frame with a warm cache
(launch once to populate SQLite, kill, relaunch):

```bash
adb shell am start -W -n ai.tripare.dogbreeds/.MainActivity
```

Record `TotalTime` from the output.

- **TODO: capture on physical Android device (warm cache, release build).**
- **TODO: capture on physical iOS device (warm cache, release build).**

### FPS during scroll

Use the Expo dev-client performance monitor, or on Android:

```bash
adb shell dumpsys gfxinfo ai.tripare.dogbreeds framestats
```

Scroll the full list top-to-bottom, then with filters applied.

- **TODO: capture sustained FPS scrolling all 283 rows.**
- **TODO: capture FPS while typing in the search field.**
- **TODO: capture janky-frame percentage from `gfxinfo`.**
- **TODO: attach screenshot of the FPS overlay.**

### Memory

Android Studio Profiler → Memory, or Xcode Instruments → Allocations.

- **TODO: capture steady-state memory after a full sync.**
- **TODO: capture peak memory while scrolling the full list.**
- **TODO: capture peak memory while swiping a 10-image gallery** (this is the
  path most likely to approach the 150MB budget).
- **TODO: attach memory profiler screenshot.**

### React render profiling

React DevTools Profiler, recording a scroll and a filter change.

- **TODO: confirm only newly-visible rows render during a scroll.**
- **TODO: confirm a filter change does not re-render unaffected rows.**
- **TODO: attach flame-graph screenshot of the 283-breed list render.**

---

## Expected bottlenecks

Where I would look first if a target is missed:

1. **First sync on a cold cache.** 6 concurrent requests, parsing 283 rich
   records, then a single write transaction. The transaction is the most
   likely stall; splitting it into chunks would trade atomicity for
   responsiveness, so it should only be done if profiling shows it matters.
2. **Gallery memory.** 10 images per breed at `large` is the most plausible way
   to approach 150MB. Mitigated by memory-only caching, a 3-slide window, and
   upgrading only the active slide — but this is the path to profile first.
3. **Section header stickiness.** `stickySectionHeadersEnabled` adds per-frame
   work on Android. If scroll misses 60fps, this is a cheap thing to test
   disabling.
4. **Search on very short queries.** A single character matches nearly all 283
   breeds, so the result set barely shrinks and grouping re-runs over
   everything. Acceptable at this size; at 10k records it would want an index.
5. **Cold image loads over a slow connection.** Not a rendering problem, but it
   is what a user perceives as slowness. The prefetch of the first 24
   thumbnails after a sync targets exactly this.
