# Technical decisions

Each entry states the decision, the alternatives weighed, and why this one won.

---

## 1. Redux Toolkit for state

**Decision.** RTK with three slices and `createEntityAdapter`.

**Alternatives.** Zustand (less boilerplate, no normalisation helpers); Jotai
(atomic, awkward for a single large collection); Context + `useReducer` (every
consumer re-renders on any change — fatal for a 283-row list).

**Why.** Two things decided it. First, `createEntityAdapter` gives a normalised
`{ids, entities}` cache for free, which is exactly what the brief asks for and
what makes detail lookup O(1). Second, `createSelector` memoisation is the
mechanism that keeps filtering off the render path. Context+Reducer was
disqualified outright: it cannot express "re-render only what changed".

**Cost.** More ceremony than Zustand for the same result. Accepted, because the
normalisation and selector story is the actual requirement.

---

## 2. SQLite (expo-sqlite) for persistence

**Decision.** SQLite with a repository layer; no ORM.

**Alternatives.** AsyncStorage (one JSON blob); WatermelonDB (built for exactly
this, but a heavy dependency and its own sync model).

**Why.** AsyncStorage would mean deserialising all 283 rich records to filter
any of them, and rewriting the whole blob to update one breed. With SQLite,
filtering is an indexed query and a sync is a transactional upsert.
WatermelonDB is the better tool at 10x this scale; here it would be a large
dependency plus a second sync abstraction layered over the one the brief asks
me to build.

**Cost.** Hand-written SQL and mapping code. Mitigated by keeping it behind
repositories and testing the upsert against a real SQL engine (`sql.js`).

---

## 3. Upsert, never delete-then-insert

**Decision.** `INSERT ... ON CONFLICT(id) DO UPDATE`, inside a transaction.

**Alternatives.** `DELETE FROM breeds; INSERT ...` — simpler, and wrong.

**Why.** This is the decision the whole offline story rests on. If pages 3 and
5 fail, a delete-then-insert writes 187 breeds and silently destroys the 96 the
user already had. The upsert updates what it received and leaves everything
else untouched. Verified in `upsert.test.ts` against a real SQLite engine: a
partial sync mentioning 1 of 3 breeds leaves the other 2 intact.

Images are the one exception — a breed's images *are* replaced wholesale, but
scoped to that breed inside the same transaction, so images removed upstream do
not linger.

---

## 4. React Query is scoped to detail requests only

**Decision.** TanStack Query handles the single-breed detail request lifecycle.
The 283-breed catalogue is owned by the sync service and SQLite.

**Alternatives.** Putting everything in React Query with a persister.

**Why.** React Query is an excellent *server-state cache*, but it is an
in-memory cache with an optional persistence adapter. The catalogue must
survive process death, support indexed multi-facet filtering, and be written
transactionally from a partial result. That is a database's job. Using both
tools for what each is good at beats forcing one to do both.

Retries are disabled in the Query client: the API layer already retries with
backoff, and layering a second policy would multiply the attempts.

---

## 5. `page[size]=48` is passed explicitly

**Decision.** Request 48 records per page and drive the loop from
`meta.pagination.last`.

**Context — and a correction to the brief.** The brief states the API is
"paginated at 48/page (6 pages)". Probing the live API shows the **default page
size is 30, giving 10 pages**. `page[size]=48` is supported and does produce
exactly 6 pages of 283 records. So the brief's numbers are reachable but not
the default, and code that assumed 6 pages without setting the size would
silently fetch only 288 of 283... or rather, would stop at page 6 of 10 and
lose 103 breeds.

**Why.** Passing the size explicitly makes the brief's contract true, and
reading `last` from the response means the code stays correct if the API
changes. `resolvePageCount` falls back to deriving the count from
`meta.pagination.records`, then to a single page, and is clamped at 50 pages so
a malformed cursor cannot spawn thousands of requests.

---

## 6. Concurrent page fetch with `allSettled`

**Decision.** Page 1 sequentially (to learn the count), pages 2–N concurrently,
collected with `Promise.allSettled`.

**Alternatives.** Fully sequential (~6x slower); `Promise.all` (one rejection
discards five successful pages).

**Why.** Measured against the live API, the concurrent fetch completes in ~4.4s.
`allSettled` is the difference between "losing page 4 costs 48 breeds" and
"losing page 4 costs everything".

---

## 7. Full-jitter exponential backoff

**Decision.** `random() * min(maxDelay, base * 2^attempt)`, base 400ms, cap 8s.

**Alternatives.** Fixed delay; exponential without jitter.

**Why.** Sync fires up to 6 requests at once. Without jitter, their retries fire
in lockstep and recreate the burst that likely caused the failure. Full jitter
spreads them across the window. Only retryable failures are retried — a 404 is
not retried at all.

---

## 8. Size bands derived from weight, with a height fallback

**Decision.** small ≤10kg, medium ≤25kg, large ≤45kg, giant >45kg, applied to
the mean of the male and female midpoints.

**Alternatives.** Height-primary; equal-frequency quartiles.

**Why.** Weight is present for all 283 breeds; height is missing on 6. The
thresholds were chosen against the real distribution (p25=12, p50=25, p75=35,
p95=70) and produce a usable spread — **70 small / 114 medium / 72 large / 27
giant** — rather than dumping most breeds in one bucket. Quartiles would be
perfectly balanced but meaningless ("small" would shift as the dataset does).
Averaging the sexes avoids systematically over-sizing dimorphic breeds.

When neither weight nor height is known the band is `null`, so the UI can say
"unknown" instead of silently mis-filtering.

---

## 9. Coat category merges two API fields

**Decision.** One derived `coatCategory` of
`short | medium | long | wire | curly | hairless`.

**Context.** The brief asks for a `short/medium/long/wire` filter. The API
models these as **two** fields: `coat.type`
(wire/curly/corded/double/smooth/hairless/…) and `coat.length`
(short/medium/long/**hairless**). "Wire" is a *type*, not a length — so a
naive filter on `coat.length` would never match it.

**Why.** Texture wins where it is the distinguishing feature a user would
search for (a wire-haired breed is "wire" whether its hair is short or medium);
otherwise length is used. `hairless` is added because the API emits it and
silently dropping those 4 breeds would be wrong.

---

## 10. Virtualised list performance: payload richness, not row count

**Decision.** `SectionList` with fixed-height rows, `getItemLayout`, a custom
`memo` comparator, and stable callbacks.

**The trade-off the brief asks me to name.** 283 rows is not a large list. The
cost here is **per-row payload richness**: every record carries nested traits,
coat, origin, other names and up to 10 image records. Naively that means each
row holds a deep object graph, every filter pass walks it, and every re-render
re-derives from it.

Four things address that:

1. **Derived-at-parse-time facets.** `sizeBand`, `coatCategory` and
   `searchHaystack` are computed once and stored. A keystroke does a
   `String.includes` against a prebuilt lowercase string instead of
   re-lowercasing 283 names plus alias arrays.
2. **Images are not loaded for the list.** The list query hydrates zero image
   rows and reads the denormalised `thumbnail_url`. This is the single biggest
   win — it avoids materialising ~2,400 image objects to display 283
   thumbnails.
3. **Memoised selectors.** Filtering and grouping run in `createSelector`, so a
   scroll frame never re-filters. Cheap scalar checks are ordered before the
   substring search so excluded rows skip it.
4. **A custom `memo` comparator.** `BreedListItem` re-renders only when a field
   it actually displays changes; the parent passes one stable
   `onPress(id, name)` rather than a per-row closure, which would otherwise
   defeat `memo` entirely.

`getItemLayout` lets `SectionList` skip measurement and jump to any offset,
which is what makes the scrollbar and programmatic scrolling cheap.

---

## 11. Tiered image caching

**Decision.** Variant and cache tier chosen by where the image appears:

| Context | Variant | Cache |
|---|---|---|
| List row | `thumb` | `memory-disk` |
| Detail hero | `medium` | `memory-disk` |
| Gallery, off-screen slides | `medium` | `memory` |
| Gallery, active slide | `large` | `memory` |

**Alternatives.** Cache everything to disk; cache nothing.

**Why.** ~2,400 images x 4 variants is several hundred MB of mostly-unviewed
data. Thumbnails are worth persisting — 283 small files the user scrolls past
every session, and having them on disk is what makes an offline relaunch look
right. Large gallery images are memory-only: swiping through 9 photos should
not write 9 large files to disk for images seen once. Only the *active* slide
upgrades to `large`, which is what keeps memory flat while swiping.

Prefetching after a sync is capped at the first 24 thumbnails — prefetching all
283 would contend with the images actually being scrolled to.

---

## 12. `exercise_minutes` is not rendered as a 1-5 scale

**Decision.** Ten traits render as 5-segment scales; `exercise_minutes` renders
as a proportional bar labelled in real units.

**Why.** The brief lists 11 "numeric trait scores" to render as a visual scale.
The live data shows `exercise_minutes` ranges **20–120**, while the other ten
are 1–5. Rendering 120 minutes on a 5-point scale would be meaningless. It gets
its own presentation and its own scale ceiling.

---

## 13. A missing trait is `null`, never `0`

**Decision.** Absent scores parse to `null` and render as an em-dash; breeds
with no score are **excluded** from a trait-threshold filter.

**Why.** One breed in the live dataset (Bavarian Mountain Scent Hound) ships
`traits: {}`. Defaulting to 0 would render an empty bar that reads as "scores
lowest" — a different and false claim from "not rated". For the same reason it
is excluded from `>= 1` filters: we do not know that it scores badly.

---

## 14. Non-blocking sync UI

**Decision.** One slim banner above the list; never a modal or full-screen
error.

**Why.** The brief is explicit that a failed refresh must not stop browsing.
The banner resolves exactly one message from (status × connectivity × cache
state), with offline deliberately outranking a stale network error — "you are
offline" explains the situation better than the error it caused. The decision
table is a pure function (`resolveBannerContent`) and unit tested separately
from the component.

---

## 15. Expo over bare React Native

**Decision.** Expo SDK 57.

**Why.** The brief allows either and requires `npm run ios` to work in under
three minutes. Expo delivers that, plus `expo-sqlite`, `expo-image` (real disk
caching, which I would otherwise hand-roll) and `expo-network` as
version-matched modules. Nothing here needs a custom native module, so bare RN
would add setup cost for no capability gain.
