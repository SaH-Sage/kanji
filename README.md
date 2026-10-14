# Kanji Grid

A kanji reference card grid inspired by [Kanshudo](https://www.kanshudo.com),
displaying the top 13 most frequent kanji with stroke-order animation, readings,
example words, variants, and components.

```
kanji-grid/
├── index.html          entry point
├── css/
│   └── style.css       all styles and design tokens
├── js/
│   └── main.js         card rendering, SVG loading, animation
└── data/
    └── kanji.json      kanji data (sourced from Kanshudo)
```

---

## Local server required

`kanji.json` is loaded via `fetch()`, which browsers block on the `file://`
protocol. You need a local HTTP server.

**VS Code — Live Server** (recommended)
1. Install the [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer) extension
2. Right-click `index.html` → **Open with Live Server**

**Python**
```bash
python -m http.server
# then open http://localhost:8000
```

**Node.js**
```bash
npx serve
# then open http://localhost:3000
```

---

## Data format (`kanji.json`)

Each entry in the array:

| Field | Type | Description |
|---|---|---|
| `char` | string | The kanji character |
| `order` | number | Fixed reference index, set once (original array position) and never edited afterward. Used only as a stable tiebreak when two kanji share a `position` — see [Grid ordering & density](#grid-ordering--density) |
| `position` | number | The kanji's actual grid slot (0 = first). Mutable — this is what editing "position" in the UI changes |
| `variants` | string[] | Visual variants (e.g. Kangxi radical forms, traditional forms). `(漢字)` suffix denotes Chinese-specific forms (Kanshudo's `(Chinese)` label, shortened) |
| `components` | string[] | Sub-elements the kanji is composed of, per Kanshudo |
| `on` | string[] | Main On'yomi (音読み) readings |
| `onAdd` | string[] | Additional On'yomi readings |
| `kun` | string[] | Main Kun'yomi (訓読み) readings |
| `kunMeaning` | string[] | English gloss for each `kun` reading, same index — sourced from Kanshudo's Common readings table. Empty string where Kanshudo shows no gloss for that reading (e.g. a bare stem/prefix form); intended for a mouse-over tooltip |
| `kunAdd` | string[] | Additional Kun'yomi readings |
| `kunAddMeaning` | string[] | Same idea as `kunMeaning`, but for `kunAdd`. Only present on the handful of kanji where `kun` is empty — Kanshudo glosses an Additional Kun reading inline only when it's the sole one shown (i.e. there's no ambiguity about which reading it labels), which in practice only happens when the main Kun row is empty. Omitted entirely on every other kanji, same convention as `frequentWordKana` |
| `name` | string[] | Name readings (名乗り) |
| `meaning` | string | English meaning |
| `frequentWord` | string[] | Top 3 example words (kanji form) |
| `frequentWordKana` | string[] | Readings for the above |
| `frequentWordMeaning` | string[] | English meanings for the above |

Note: `id` is not stored — it is computed as `"kc-" + char` in `main.js`.

---

## Editing / adding kanji in-page

The nav bar at the top of the page has three controls:

- **+ Add kanji** — prompts for a character and appends a brand-new,
  blank card at the end of the grid.
- **Confirm before editing existing kanji** — a safety toggle (on by
  default). While on, changing a field on a *real* kanji asks you to
  confirm first. Fields on a kanji you added yourself never prompt,
  regardless of this toggle.
- **Export additions** — enabled once you've made at least one edit or
  addition; see below.

Click any field on a card — meaning, readings, variants, components, or
a word's kanji/meaning — to edit it in place (Enter or click away to
save, Escape to cancel; comma-separate multiple values for list fields
like readings). A word slot opens a small popup instead, since it holds
several fields at once (word, kana, pitch accent, part of speech, JLPT
level, meaning). An empty field shows a "+" you can click to fill it in
— this is how you build out a newly-added kanji's card, and how a word
slot's "+ word" button adds a slot it doesn't have yet (custom kanji
only, up to 3). Every word you create or edit this way is marked
`selfAdded: true`, the same convention `words.json` already uses for
hand-typed entries — those show the existing "unverified" badge in the
info popup.

This is a static site with no backend to write to, so nothing here
touches `kanji.json` or `words.json` directly — every change is saved to
that browser's `localStorage` immediately (every future page load in
that browser sees it). **Export additions** downloads two files:

- `kanjiOverrides.json` — field-level edits to existing kanji, plus any
  kanji you added from scratch, both shaped to merge straight into
  `kanji.json`.
- `wordOverrides.json` — word-slot edits/additions, shaped to merge
  straight into `words.json`.

Each download reflects the full current merged state — already-committed
overrides plus this browser's own — not just what changed in this
session. Save them as `data/kanjiOverrides.json` and
`data/wordOverrides.json` (replacing any existing copies) and commit so
every browser picks up the changes, not just the one they were made in.
Both files are optional — their absence is handled the same as a missing
`words.json`. Priority when a value has both: this browser's
`localStorage` > the committed override file > the base data.

---

## Sources

- Frequency ranking and word data: [Kanshudo — 100 Most Frequent Kanji](https://www.kanshudo.com/100mostfrequent)
- Stroke-order SVG paths: [KanjiVG](https://kanjivg.tagaini.net/), used under its [CC BY-SA 3.0 licence](https://creativecommons.org/licenses/by-sa/3.0/). Vendored locally in `data/strokes/<codepoint>.svg` for every kanji currently in use, with a live fetch from KanjiVG's GitHub repo as a fallback for anything not yet vendored (see `fetchStrokeSVG()` in `main.js`)

---

## Grid ordering & density

Every kanji has two position-related fields (see the data format table
above): `order` (fixed, set once) and `position` (mutable — what
actually controls where it renders). Cards are sorted by effective
`position` ascending at render time, tie-broken by `order`.

### Moving a kanji (implemented)

`position` is editable two ways: a quick popup under each card's edit
button (hover it, then hover straight down onto the popup that appears
1em below), or the `position` field in the full edit modal. Both route
through `moveKanjiToPosition(char, targetIndex)` (`main.js`), which
performs a real array move — not just "give this one kanji a new
number." Every kanji currently between the old and new slot shifts by
exactly one to make room, the same way reordering any list works, so
`position` always stays a dense, unique `0..N-1` ranking. Editing a
real kanji's position goes through the normal confirm-before-overwrite
prompt like any other field; a custom kanji never prompts.

### Density-based reordering (implemented)

A kanji whose reading fields are unusually wide pushes its card wider
than the grid's other cards. To keep those clustered together rather
than scattered, each kanji gets a computed **density** score, and
kanji with density > 0 are moved to the end of the grid (sorted by
density ascending, ties broken by `order`). Kanji with density 0 stay
in `order` overall, but not always in their exact original position: a
kanji that only fits next to a *different* neighbor than the one it
started beside is physically moved to sit next to that neighbor
instead (see "Resolution order" below) — density isn't just a
pass/fail label, it can also change where a density-0 kanji actually
renders.

**Width formula.** For each of the five reading fields — `on`/`kun`
(rendered as `l1`/`r1`, bigger font) and `onAdd`/`kunAdd`/`name`
(rendered as `l2`/`l3`/`r2`, smaller "add" font) — the field may wrap
into more than one physical column once it has enough readings (this
is the same column-wrapping the "…" overflow feature already measures
via `capReadingOverflow`'s edge-detection). A field's width is the sum,
across each of its columns, of that column's single longest reading's
character length — **plus 1 per column**, for every field: a column
costs something just by existing (spacing, the visual break between
columns) regardless of font size, so `onAdd`/`kunAdd`/`name` get this
the same as `on`/`kun` do.

**Last-column rescue.** A field's raw width above can overstate how
much room a kanji actually needs, but only at the margin: `l1`/`r1`'s
column capacity isn't a fixed number (`r1`/`r2` share a flexible
height budget within the card — a kanji with a short `name` lets
`kun` grow further than one with a long `name`), and the *specific
reading* that widens a field the most may sit right next to a
neighbor with nothing there to collide with. The rescue is
deliberately **not** a general exemption for wide fields: every
column of a field except its very last one always counts at full
width, no matter what any neighbor looks like, since that content is
needed regardless of who's next door. Only the **last column** of a
field is rescue-eligible, checked against the corresponding **last
column** of a neighboring kanji's own field (the two columns
physically closest to the shared card boundary) — `l1`↔prev's `r1`,
`l3`↔prev's `r2`, mirrored for `r1`/`r2` against the *next* kanji's
`l1`/`l3`. `kun` has one extra case: when it spans 2+ columns, its
last column sits past `l1`'s own reach entirely and is checked
against the next kanji's `l2` instead, matching the row-swap's own
overflow redirect.

**Combined width, directly.** A row of mine and its paired row on the
neighbor are added together — `mine.length + partner.length`, where a
position past the neighbor's own field length counts as an empty
(zero-length) partner — and that sum **is** the width contribution,
full stop. There's no separate pass/fail rescue check: when a field
has more readings than the neighbor's real content, my longest
readings are assigned to the neighbor's empty slots first (they
benefit most from the room), and whatever's left pairs against the
neighbor's real readings, longest-of-mine against shortest-of-theirs
— the arrangement that minimizes the resulting maximum. The last
column's width contribution is that maximum — the per-column bonus
above only applies to the solid (non-last) columns, not this one.

Density itself steps directly off this combined width — **6, 12,
18** for `on`/`kun`, **8, 16, 24** for `onAdd`/`kunAdd`/`name` (and
`kun`'s `l2`-redirect case) — inclusive: a combined value of exactly
6 (or 8) already counts as density 1, not just anything past it.
`on`/`kun` keep the tighter step purely because of their bigger font,
which costs more room per character on top of the per-column bonus
every field now gets equally.

**Resolution order — deterministic rounds, not a sweep.** Density
resolves in ordered **rounds**, one per tier boundary — round 0 decides
dense-vs-not, round 1 decides stay-dense-1-vs-escalate-to-2. Each round
runs a forward pass, then an internal stabilization pass, then a queue-
block resolution. None of these is a sweep that re-checks everything
until nothing changes, which can genuinely oscillate forever when three
or more kanji's density depends on each other's in a loop — a forward
pass can't cycle by construction, and both later passes are built to
only ever shrink a sequence, never re-admit to it, which rules out
cycling the same way.

**The forward pass.** Walk the round's candidates in order (round 0:
every kanji by `order`; round 1: the round-0 dense tail, by density
then `order`, after round 0's own queue-block resolution below has
repositioned whatever needed it). A kanji that fits against its
immediate neighbor settles within-tier right away. A kanji that doesn't
fit, but *could* in principle with a better neighbor — its best case,
checked against an empty/absent partner on every rescue-eligible side,
is still within tier — is **held** rather than settled, and the pass
moves on without it. A kanji whose best case is already past the tier
even with an empty partner is settled immediately at that best case; no
neighbor could ever help it, so there's no point holding it — it's
genuinely, **unconditionally** dense, regardless of who it ever ends up
next to.

Every kanji that *does* settle checks the held queue, earliest-held
first: the first held kanji that now fits — against the newly-settled
kanji as its prospective new neighbor — is resolved on the spot and
**physically spliced in right after it** (not just marked as passing —
actually repositioned there), and both kanji, plus the rest of the
queue against the freshly-spliced one, are re-verified in turn using
their new mutual adjacency. This is the fix for cases like 名, which
fails against its own immediate neighbor but fits fine once inserted
after 金 — 名 ends up rendering next to 金, not at its own original
position. A kanji still held when the forward pass ends never makes it
into this round's sequence at all.

**The internal stabilization pass.** Splicing can move a kanji into a
*different* kanji's way, so a kanji that settled cleanly on the forward
pass can still end up next to something other than what justified its
density, when a later splice lands between it and the neighbor its own
check actually used. This re-verifies every non-last entry against its
*real* current neighbor and removes any that no longer holds up,
repeating since a removal can expose a fresh gap right next to it —
monotonic (removal only ever shrinks the sequence, nothing removed is
ever re-admitted), so it's guaranteed to terminate. The sequence's own
last entry is skipped here — it never had a real next to check at all —
and handled by the next pass instead.

**The queue-block resolution.** The round's own last entry is checked
against the true first **unconditionally** dense candidate (best case
still past tier — no possible rescue by anyone, ever) as its real
eventual right-side neighbor. If that fails, it's peeled off the
sequence and prepended to a queue block, repeating since peeling
exposes a new last entry with the same gap — so every kanji genuinely
stuck at the boundary ends up in this block together, not just whichever
one happens to sit at the exact edge. Combined with anyone still sitting
in the forward pass's own leftover queue (never rescued by a real
front-section settlement), the whole block is resolved by **searching
every arrangement** of its members — the same permutation search
already used elsewhere for finding the best row order — picking
whichever arrangement resolves the most members to true density 0,
tie-broken by the lowest worst remaining density, tie-broken again by
staying closest to natural `order`. Densities from the winning
arrangement are applied directly, each member checked against its real
block-neighbors (or the true boundary on either side). Only the block's
**last** member borders the unconditionally-dense group, on its right
side — the block is never spliced into or mixed with that group itself,
since none of its members could ever have been rescued by anyone in the
first place, unlike the queue block's own members.

This is the fix for cases like 所, 政, and 現 (today's whole queue
block): checked one at a time against only 上 (the naive first
candidate by order), each looks dense on its own. But 所, 政, and 現 are
none of them unconditionally dense — every one of them could in
principle be rescued by *some* neighbor — so all three get resolved
together. The winning arrangement is `所, 政, 現`: 所 genuinely resolves
to density 0 there (its own fields clear completely against 取 on one
side and 政 on the other), while 政 and 現 both remain density 1
regardless of arrangement — but 現, last in the block, is the one that
borders 上 on its right, exactly as the block's own resolution
determined, not 所 or 政. None of the three ever gets spliced into the
middle of 上/下/理/明/生; each of those five is unconditionally dense
(confirmed by best case alone, before any neighbor is even considered)
and stays entirely outside the block's search.

A kanji arriving through the queue block is also exempt from the next
round's floor (below) — it was never actually confirmed at that tier by
round 0's own tier-0 forward pass, only resolved by the block's separate
search, so its real computed density there is trusted as-is, even if
that comes out *lower* than the floor.

**Round 1 (stay dense-1 vs. escalate to dense-2)** runs the exact same
three-pass mechanism one tier up, over the round-0 dense tail — can a
kanji currently forced past dense-1 (today, only 生) stay at dense-1
with a better neighbor instead, the same way round 0 gave 所 a second
chance at dense-0? Two adjustments keep this from disturbing what round
0 already settled: a **floor** of 1, so a kanji round 0 genuinely
confirmed at dense-1 can never be pulled back down to dense-0 here just
because its tail neighbors happen to be short (that's not this round's
question to answer) — except round 0's own resolved queue-block members
(see above), which skip the floor entirely; and a **seed neighbor** —
the real front-section kanji immediately before the tail in the
eventual render order — so the tail's first entry isn't evaluated as if
it had no left neighbor at all. Whatever round 1 doesn't place (today,
only 生) is past dense-1 with no further round to reposition it, so it
just sorts by (density, `order`) like the dense tail always has.

A future kanji dense enough to need a dense-2-vs-3 check would need a
third round built the same way; nothing in the current dataset goes
past density 2, so only two rounds exist today.

This is a one-time computation baked into each kanji's stored
`position` — unlike the row-swap below, which runs live against
whoever a kanji actually ends up next to, every render.

### Collision-avoidance row-swap (implemented)

Because `.kc-left`/`.kc-right` are `position: absolute` and
deliberately overflow past their own card's border (see "Card layout"
below), a card with wide reading columns can visually collide with
its actual left-hand neighbor's `.kc-right` content. The fix is a
**separate render-time pass** (`applyRowRescueSwaps()` in `main.js`,
run after every full render and after every card edit) — it does not
feed back into `position`/density at all, since a successful rescue
means there was never a real conflict to move away from in the first
place.

**Row correspondence** (this kanji's `.kc-left` vs. the previous
kanji's `.kc-right`, checked only when they're actually on the same
grid row): `r1` pairs with `l1` as the baseline. If `r1` grows past
its own first (baseline) column, its overflow (the rest of it) instead
pairs with `l2`. `r2` pairs directly with `l3` (both are
bottom-anchored, growing upward). `r1` and `l3` never interact — same
correspondence the density computation above uses, since it's checking
the exact same physical adjacency.

**Combined width, same arrangement logic as density.** A row of mine
plus its paired neighbor row, combined, against a flat budget — **6**
for the `l1`/`r1` pairing, **10** for `l2`/`l3`/`r2` — using the exact
same combined-width, empty-slot, longest-to-shortest arrangement logic
as density's own last-column rescue (see above), but checking one row
in isolation rather than a whole field's columns, so there's no
per-column bonus here to mirror density's `l2`/`l3`/`r2` bonus — these
budgets are independent of density's own step values (8/16/24) and
stay as-is. A swap only actually happens here if there's a **real
conflict** to resolve — natural (unreordered) order has to already be
at or over the budget, *and* some reordering has to be able to bring
it back under. If natural order was already fine, or if even the best
possible arrangement still can't clear the budget, nothing is
reordered — there's no point straying from natural reading order for
a change that wouldn't avoid anything either way.

**Sequential vs. joint.** When more than one arrangement ties for that
best achievable width, *which* one gets used is chosen by the nav
bar's "Sequential density fit" toggle — sequential prefers reordering
only `kun`'s own column if that alone reaches the best width, falling
back to reordering both sides (minimizing total changes across both)
only if `kun` alone can't get there; joint searches both sides
together from the start, with no preference for leaving either one
alone. This toggle is the *only* thing that changes visually — density
itself (and therefore the grid's kanji order) never differs between
the two strategies, so flipping it never moves a single card.

This all runs live, every render (`applyRowRescueSwaps()` in
`main.js`), against whoever a kanji *actually* ends up next to at the
current viewport width — unlike density's own last-column check above,
which is a one-time computation against a kanji's natural or
tail-adjacent neighbor, baked into `position`. A successful rescue
here never feeds back into either.

---

## Card layout

```
┌──────────────────────────────────────────────────────────────┐
│  r-top:  variants   components   word₁  word₂  word₃        │
├────────────────┬─────────────────────┬────────────────────── │
│   kc-left      │      SVG (kanji)    │   kc-right            │
│                │                     │                        │
│ l1  On'yomi   │  ┼ ─ ─ ─ ─ ─ ─ ─  │  r1  Kun'yomi         │
│ ─ ─ ─ ─ ─ ─  │  │                  │  ─ ─ ─ ─ ─ ─ ─ ─ ─   │
│ l2  On (add)  │  │   [Animate]      │  r2  Name readings     │
│               │  │                  │                        │
│ l3  Kun (add) │                     │                        │
├────────────────┴─────────────────────┴────────────────────── │
│  r-bot:  meaning   meaning₁   meaning₂   meaning₃           │
└──────────────────────────────────────────────────────────────┘
```
