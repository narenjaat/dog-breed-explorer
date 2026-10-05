# Approach

A note on how I built this and why it is shaped the way it is. The detailed
reasoning per decision is in [DECISIONS.md](./DECISIONS.md); this is the
narrative that connects them.

---

## The one rule everything follows

**SQLite is the source of truth for what the user sees. The network is an
optimisation.**

Almost every non-obvious choice in this codebase falls out of that sentence.

An offline-first app is not an online app with a cache bolted on. If the app
renders from the network and falls back to a cache, then the cache path is the
rare path — it is under-exercised, and it breaks. So I inverted it: on launch
the app reads SQLite and renders, *before any network call exists*. Sync is a
background process that updates the database; the UI re-reads from it. A cold
start in aeroplane mode runs the identical code path as a cold start on wifi,
which is why it works.

The corollary is that a sync must never make the user worse off than they were
before it started. That single requirement is what forced the upsert (§3),
the `Promise.allSettled` fetch (§6), the page-1 failure guard, and the rule
that a zero-breed result is an error rather than a wipe.

---

## How I actually worked

### 1. I probed the API before writing any code

This mattered more than anything else I did. The brief describes the data, and
in four places the live API disagrees with it:

| Brief says | API actually does | Consequence if trusted |
|---|---|---|
| "48 per page, 6 pages" | Default page size is **30** → 10 pages | Stopping at page 6 loses **103 breeds** |
| 11 numeric trait scores | `exercise_minutes` is **20–120**, not 1–5 | A 5-point bar renders 120 minutes meaninglessly |
| `short/medium/long/wire` coat filter | `wire` is a `coat.type`; the others are `coat.length` | Filtering one field never matches wire breeds |
| Missing data | Ships as **empty objects** `{}`, not `null` | Naive null-checks pass, then property access yields `undefined` |

Each of those is a silent, plausible-looking bug. None would throw. The 283
count would still look right in three of the four cases. I would not have found
them by reading the spec more carefully — only by hitting the endpoint.

So: **probe first, then design the types, then write the code.** Every number
in this repo came from a request I actually made.

### 2. I built in phases and kept the app runnable

Fourteen phases, foundation upward: types → API layer → database → sync → store
→ UI. The app launched and did something real at the end of each one. The point
is not tidiness; it is that when something breaks you know which phase
introduced it. The Fabric crash below was located in minutes for exactly this
reason.

### 3. I ran it on both platforms, not just one

This caught a bug the bundle could never have revealed — see below.

---

## Three things that only running it could teach me

**The `removeClippedSubviews` crash.** I set it on both lists initially; it is
standard advice for long lists. On Android under the New Architecture it kills
the app:

```
addViewAt: failed to insert view [532] into parent [116] at index 12
```

It detaches native views behind Fabric's back. **iOS never reproduced it.** Had
I verified on one platform, or trusted a successful build, I would have shipped
a crash that fires only after enough rows mount. Fabric recycles views anyway,
so removing it costs nothing measurable.

**Blank list thumbnails.** The list query deliberately hydrates zero image rows
— materialising ~2,400 image objects to render 283 thumbnails is the single
biggest performance win in the app. But the shared image resolver was being
handed that empty array and correctly returning "no image". The optimisation
and the renderer were each right in isolation. Fixed with a dedicated
`resolveListThumbnail()` that reads the denormalised `thumbnail_url` column.

**The offline screenshot that could not be taken.** Disabling wifi on a debug
build also kills the `adb reverse` tunnel to Metro, so the app cannot download
its JS bundle and shows React Native's red "Unable to load script" screen —
never its own offline UI. This is a debug-tooling artifact, not an app bug, but
it means **offline behaviour is only demonstrable on a release build**.
Documented in [SCREENSHOTS.md](./SCREENSHOTS.md) so a reviewer does not hit the
same wall.

---

## Where I deliberately did not follow the brief

Three places. In each, I did what the brief asked for and named the divergence
rather than silently "fixing" it:

1. **`page[size]=48` is passed explicitly.** The brief's 6 pages are reachable
   but are not the default. Passing it makes the brief's contract true, and the
   loop is driven from `meta.pagination.last` so it stays correct if the API
   changes.

2. **`exercise_minutes` gets its own scale.** The brief says render 11 traits as
   visual scales. Ten are 1–5 segmented bars; this one is a proportional bar
   labelled in real units ("1 hr/day"). Same requirement, honest presentation.

3. **A missing trait is `null`, never `0`.** One breed ships `traits: {}`.
   Defaulting to zero renders an empty bar that reads as *scores lowest* — a
   different and false claim from *not rated*. Those breeds are excluded from
   threshold filters for the same reason: we do not know that they score badly.

---

## On the numbers in this repo

Every figure is either measured or marked `TODO`. Nothing is estimated and then
rounded into looking measured.

Measured and reproducible: bundle size (from `react-native bundle` output, read by a
script rather than copied), sync timing against the live API, the partial-failure
recovery count, the test suite. Not yet captured: time-to-interactive, sustained
FPS, and memory — these need a release build on real hardware, and
[PERFORMANCE.md](./PERFORMANCE.md) carries the exact commands next to each
`TODO` marker.

I would rather hand over a document with honest gaps than one with numbers that
cannot be reproduced. A fabricated benchmark is worse than a missing one: it
survives review and fails in production.

---

## What I would do next

- **Capture the device profiling.** The release build makes this possible; it is
  the one genuinely incomplete piece.
- **Detail-screen prefetch.** Sync prefetches the first 24 thumbnails. The
  obvious next step is prefetching the hero image of whatever is on screen.
- **Incremental sync.** Currently a full 6-page refresh. If the API grows an
  `updated_since` parameter this becomes cheap; without one, full sync is the
  honest option.
- **A schema v2 migration exercised in a test.** The migration runner and
  `PRAGMA user_version` are in place, but only v1 exists, so the upgrade path
  is written and not yet proven.
