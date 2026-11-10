# 0013: Vehicle page, calm

Status: live-checked (2026-11-07; Precision Farming off not checked: NEXT.md), with revisions 2 (a light field panel), 3 (your fields, a trail only while working, every mower) 4 (what Precision Farming's nozzles spray) 5 (the cards from the front of the rig to the back; no mod change; live-checked 2026-11-08) and 6 (a failed answer shows only on its button; live-checked 2026-11-09)
Mod: 0.15.0 (revision 4; 0.14.0 revision 3; no change before) · Started: 2026-11-03 · Design: the canvas [FS25 Companion: Vehicle screen, calm](https://claude.ai/artifact/JApsdXjoSFwsddKv2kNYZ3) (private, on claude.ai; approved by Vincent on 2026-11-03), a THEMES.md section at build; specs [0003](0003-implement-screen.md) (the page), [0010](0010-tidy-states-and-motion.md) (the states), [0012](0012-card-buttons.md) (the buttons)

## Goal

The Vehicle page is distracting (Vincent, 2026-11-02):
- yellow means five things at once: the selected strip tile, the card's
  ring, the section bars, the coupling chips and the tab;
- the selected tool shows twice (a tile and a card), speed and wear
  twice;
- a lone card stretches into a large empty box;
- its buttons stretch to 430 px.

Only the control column reads well: one shape of button, in labelled
groups. This spec gives every part of the page one job, so each one
stands on its own:
- the rig strip shows the rig and where you are;
- a card shows a tool's state and its buttons, drawn like the column's;
- a field panel shows the field you're working;
- the column holds the cab's controls and the rig-wide ones;
- the bottom bar holds the tractor's numbers, as on the Map screen.

The night palette gets darker and less blue, and yellow goes: an "on"
button is outlined by day and steel grey at night.

## Revision 2: a light field panel

Drafted, approved by Vincent, built and checked on his iPad on
2026-11-07. This section is the revision whole; Behaviour, Data contract, Plan,
Acceptance and Decisions below say the same where they changed.

**Why.** On Vincent's iPad Pro (M4, Safari) the Vehicle page has been
slow since this spec was built. Opening it from Map, or getting into
another vehicle, waits about 100–300 ms, then everything appears at once.
The Harvester and Loader pages, without the field panel, show at once.
The likely cause is the panel's map:
- it draws the whole 4096 px `overview.png` (about 64 MB decoded) to show
  one field, and dims it with an SVG filter at night. Safari seems to
  decode it again each time the page is shown;
- each vehicles message (about 2 a second) rewrites the newest trail line
  (up to 500 points) and redraws the SVG with the image under it.

The browser pane on Windows never shows the wait. Taps there paint in
16–24 ms, even with a full 20,000-point trail, a fresh load or the night.
So the cause is likely, not proven, and only the iPad can say this
revision fixes it. Performance comes first for this panel (Vincent).

**What the player sees.**
- **No map image.** The map area shows the field's outline on the card's
  colour, as it already does before the map is converted: no roads, trees
  or neighbouring fields. No dimming at night, since there's no image.
- **The view is fixed to the field:** its bounds plus 15 % of its size on
  each side, at least 25 m, so a headland turn stays in view. It doesn't
  move with the tractor. There are no map controls (there never were:
  the panel isn't the Leaflet map).
- **The tractor's arrow and a sprayer's boom** move over it, as today: a
  dark dot with a white ring and a heading arrow, the boom behind it with
  its off sections grey.
- **The work progress:** the trail and "This run ≈ 54 % of the field", as
  today. The band is a solid colour (no see-through layer), the same green
  or pale yellow it looks today over the card. Overlapping passes look the
  same as one, as today. As built: each band is drawn one screen pixel
  wider, so passes side by side leave no seam.
- **Off a field:** the panel keeps showing the last field it showed (its
  outline, trail and rows), with the arrow wherever the tractor is, until
  you drive into another field. So a headland turn doesn't change it.
  This replaces "the map around the rig" (Decisions, 2026-11-03), which
  meant the map image.
- **No field yet** (just got in, or on the road since): "Not on a field",
  an empty map area, no arrow.
- Everything else is unchanged: the rows under the map, when the panel
  shows (on foot it hides; three working tools or more hide it), the
  trail's rules (`coverage.js`).

**How it stays light: three layers in the map box, each with one job.**
1. **The outline:** an SVG with the field's polygon. It's written once
   when the field changes; vehicles messages never touch it.
2. **The trail:** a canvas the box's size. Each message paints only the
   newest stretch: for each run that grew, its last three points (so the
   bend joins up), in the run's width. It's drawn in full only when the
   field, the box's size or the palette changes, or a tool's trail goes.
   It's clipped to the outline.
3. **The arrow:** one small element moved by a CSS transform
   (`will-change: transform`), so moving it redraws neither the outline
   nor the trail. The boom is drawn inside it, again only when the
   sections change.

The box's size comes from a ResizeObserver, never read during a message.
While the page is hidden the box is 0 × 0 and nothing is drawn; on show,
the stretch missed meanwhile is painted then (all of it only if the field
changed).

So a vehicles message does: find the field (microseconds), update the
trail's cells (about 0.2 ms, measured), paint one short stretch, move the
arrow, and change the % text when its rounded value changes. No element
is added and no SVG attribute is written.

**Data contract.** No mod change, no new topic or field.
- The panel no longer reads `mapAssets`, `hello` or `meta.json`, and asks
  for no map image.
- `coverage.js` is unchanged: the panel reads `trails`, `percent` and
  `version` as today.
- Theme tokens: `--trail-work` and `--trail-mow`, opaque, day and night,
  set to today's look over the card.

**Plan.**
- `widgets/fieldPanel.js`: the three layers above. The image, the night
  filter, the clip path, the polylines, `metaOf`, `aroundView` and the
  per-message `clientWidth` read go. `fieldView` gets the 25 m minimum.
- `map/overviewLayer.js`: `imageName` is private again.
- `themes/newholland/theme.css`: the trail tokens; the panel's image,
  filter and `data-image` rules go; the arrow's layer.
- Docs: THEMES.md's "Vehicle page, calm" section (the panel without the
  image); Behaviour, Data contract, Plan, Acceptance and Decisions here;
  `docs/NEXT.md`'s entry closes once the iPad says so.
- The design system on claude.ai is refreshed, since theme.css changes.
- Golden: no viewer message changes.

**Acceptance.**

Automated (written first):
- [x] `web/test.html`, field panel light:
  - no `<image>`, no SVG filter, and no request for `meta.json` or
    `overview*.png` from the panel;
  - the viewBox is the field's bounds plus 15 %, at least 25 m a side;
  - 20 vehicles messages on the same field write nothing in the outline's
    SVG and add no element to the panel (a MutationObserver);
  - the arrow's transform follows the tractor (its pixel position from
    the view);
  - after a pass, the canvas has the trail's colour in the pass's middle
    and not outside the field;
  - a message paints only its run's newest stretch (at most three points a
    run: a counting canvas context);
  - messages while the box is 0 × 0 paint nothing; on show the missed
    stretch is painted;
  - leaving the field keeps it shown with the arrow; entering another
    switches to it; no field yet shows "Not on a field" and no arrow.
- [x] The existing coverage and field panel tests pass, updated where this
  revision changes them (the viewBox, "Not on a field").
- [x] Replay in the browser pane (the sample sprayer on field 120), day
  and night at 1180×820 and once at 1133×744.
- [x] `python -m pytest mod/tests companion/tests tests` passes, the
  golden unchanged.

Live check (Vincent, iPad Pro, Safari):
- [x] Map ↔ Vehicle back and forth quickly: the Vehicle page shows as fast
  as Harvester and Loader.
- [x] Get out and into another tractor, then back: the page shows at once.
- [x] Spray two passes on a field: the arrow and the trail follow, the %
  as before; a headland turn leaves the panel on the field. The same at
  night.

**Later, in a spec of its own** (agreed 2026-11-07, not this revision):
contracts and helping another farm: the game's land-access check, a mod
change and a live check. (Progress kept by the companion per field and
per tool, with a "Show Field 2" prompt, was dropped by Vincent on
2026-11-10.)

## Revision 3: your fields, a trail only while working, every mower

Drafted 2026-11-07 from Vincent's live check (the Log), approved by him the same day,
built the same day. This section is the revision whole; Behaviour, Data
contract, Plan, Acceptance and Decisions below say the same where they
changed.

**Why.** Three things in the live check didn't hold:
1. The panel takes any field, ours or not, and since revision 2 keeps the
   last one however far the rig drives off it, across the whole map.
2. The trail drew with the Vantage folded and not spraying. In the game's
   `Attachable.lua`, `getIsLowered(default)` returns the default for a
   tool on a joint that doesn't lower (a trailed sprayer), and the mod
   asks `getIsLowered(true)`. So the Vantage always reads lowered, and the
   rule "lowered or turned on" holds whatever it does. The Area counter
   (`rates.js`) uses the same rule, so it counts those hectares too.
3. The rear butterfly mower left no trail of its own. Its `workWidth` is
   the widest single work area (`getAIWorkAreaWidth`, about 3 m) and the
   band sits on the rig's track, so its two wings were never drawn and its
   middle hid under the front mower's band. Area counts it 3 m wide too.

**What the player sees.**
- **Only your fields.** The panel shows a field only when your farm owns
  its farmland. On anyone else's field it's as off a field. Contracts and
  helping another farm stay for their own spec (step 3 below).
- **Leaving a field.** The panel keeps the field while the rig is inside
  the panel's view: the field plus its margin (15 % of its size a side, at
  least 25 m), the same box the arrow is drawn in. So a headland turn
  keeps it; driving off past the margin shows "Not on your field" with no
  outline and no arrow. Back on the field, its outline and trail come
  back: trails are kept per field until you change vehicles, as today.
- **"Not on your field"** replaces "Not on a field" (just got in, on the
  road, or on a field that isn't yours).
- **A trail only while a tool works.** A tool works when everything it has
  says so:
  - it turns on (its card has Turn on): it's on;
  - it lowers (its card has Lower): it's lowered;
  - neither: it's on (the game's reading), as today;
  - and, as today, the rig moves faster than 0.5 km/h, with a working
    width, and it isn't loader gear.
  So a sprayer needs Turn on (the game won't turn one on folded); a mower
  needs both lowered and on; a plough or cultivator, lowered. Fold isn't
  part of the rule: some tools lower through their fold. Area counts by
  the same rule.
- **Every part of a wide tool.** A tool's trail is drawn from its work
  areas, each a band at its place across the rig: a butterfly mower draws
  its two wings left and right of the tractor, the front mower the middle.
  A tool with sections (a sprayer) keeps today's band: its sections that
  are on, across its whole span. Where a tool's areas overlap or touch,
  they're one band. Area counts the bands' total width.
- Unchanged: the trail stays on the rig's track lengthwise (a rear tool's
  band isn't moved back), its colours, the %, the panel's three layers.

**Data contract.**

| Topic, field | What | Game source | Verified |
|---|---|---|---|
| `fields[].farmlandId` | the field's farmland | `field.farmland.id` | in use (the field info panel) |
| `farmlands[].farmId` | its owner farm, 0 = none | `farmland.farmId` | yes (GAME-API.md) |
| `hello.farmId` / `myFarmId` | your farm | `g_localPlayer.farmId` | in use |
| `vehicles` implement `workSpans` (new) | `[[from, to], ...]` metres across the rig, right of its centre line positive, one per work area, rounded to 0.1 m | each `spec_workArea.workAreas[i]`'s `start`, `width` and `height` nodes, `localToLocal` into the controlled vehicle's root component, x | **no**: the nodes and the sign of x (GIANTS' local +x is believed to be left), through `Api.lua`, checked live |
| cab rig `can` (`lower`, `turnOn`), `lowered`, `turnedOn` | what the rule reads | as today | yes; `lowered` is only meaningful with `lower` (the game's source, above) |

No new topic. `workWidth` stays as it is (the Harvester page shows it). A
mod without `workSpans` gets today's band, `workWidth` wide on the track.
Mod 0.14.0.

**Plan.**
- `mod/src/collectors/vehicles/Tools.lua`: `workSpansOf(object, root)`,
  through `Api.lua` for the nodes; `mod/tests`: a fake mower with two
  wings and a sprayer with one area; the version.
- `web/src/data/selectors.js`: `isWorking(entry, impl)` (the rule above)
  and `ownFieldAt(store, x, z)` (fieldAt, only your farm's fields);
  `bandsOf(impl, entry)`: the merged spans, or today's sprayer band.
- `web/src/data/coverage.js`: records with `isWorking`, on `ownFieldAt`,
  a band per span (a run per tool and span).
- `web/src/data/rates.js`: Area with `isWorking` and the bands' total width.
- `web/src/widgets/fieldPanel.js`: the held field is let go outside the
  view; "Not on your field"; the boom stays as it is.
- Docs: Behaviour, Data contract, Plan, Acceptance, Decisions here;
  THEMES.md's panel text; GAME-API.md after the live check.
- Golden: `fixtures/golden_viewer.ndjson` doesn't change (the replay's mod
  has no `workSpans`).

**Acceptance.**

Automated (written first):
- [x] `isWorking`: a trailed sprayer (no `lower`) reading lowered and off
  doesn't work, on it does; a mower lowered and off doesn't, lowered and on
  does; a plough (lower only) lowered does; a tool with neither works by
  its `turnedOn`; loader gear never.
- [x] Coverage and Area: the folded, off Vantage moving over a field leave
  no trail and count no hectares.
- [x] Bands: spans `[[-4.6, -1.5], [1.5, 4.6]]` draw two bands and leave
  the middle 3 m unpainted; overlapping or touching spans make one band;
  a sprayer with sections off keeps today's band; without `workSpans`,
  today's band. Area counts 6.2 m for the two wings.
- [x] Ownership: a field on a farmland of another farm (or none) shows
  "Not on your field" and records no trail; your field shows as today.
- [x] Leaving: inside the margin the field stays (a headland turn); past
  it "Not on your field", no arrow, the outline hidden; back on the field
  its trail is still there.
- [x] `mod/tests`: `workSpans` from a fake two-wing mower and a one-area
  sprayer, in the vehicles collector's output; the version bumped.
- [x] Replay in the browser pane, day and night at 1180×820 (a T7 with a
  raised front mower and a butterfly mowing field 120, made ours).
- [x] `python -m pytest mod/tests companion/tests tests` passes, the golden
  unchanged.

As built: the Area test's wings read ≈ 8 %, not 6.2 %: on 2 m cells a 3.1 m
band covers two; one 9.2 m band would read ≈ 10 %. Area also takes a
sprayer's sections that are on now (its band), not its whole width.

Live check (in game; Solek, mod 0.14.0):
- [x] **T7.300 with the KDF 341 S front and the butterfly rear, mowing a
  pass:** three bands, the wings left and right of the middle, the same
  width as the game's mown swaths; Area counts the full width.
- [x] **The Vantage folded, then unfolded and off, driven over a field:**
  no trail, Area doesn't move. **Turned on:** the trail starts. **Two
  sections off on one side:** the band is on the side still on (the sign
  of `workSpans`).
- [x] **A field that isn't yours:** "Not on your field". **Drive off yours
  onto the road:** the field stays through a headland turn, goes past the
  margin, and comes back with its trail when you return.

**Later, in a spec of its own** (unchanged from revision 2): contracts
and helping another farm (the game's land-access check).

## Revision 4: what the nozzles spray (Precision Farming on and off)

Drafted 2026-11-07 from revision 3's live check (the Log), approved by
Vincent and built the same day. This section is the revision whole;
Behaviour, Data contract, Plan, Acceptance and Decisions below say the
same where they changed.

**Why.** With Precision Farming's automatic spraying, the game sprayed
with about three of the Vantage's nine sections, while the card's strip
said 9 of 9 and the trail stayed full width. In Precision Farming's Lua
(`ExtendedSprayerEffects`, `WeedSpotSpray`, `ExtendedSprayer`):
- the boom's nozzles are switched one by one (pulse width modulation, spot
  spraying: weeds, bare ground, ground already fertilized), or a whole
  section at a time without those, each frame;
- a nozzle on a section you switched off by hand is always off;
- the boom's sections (`leftSide`, `rightSide`), all the mod reads, never
  change.

The dashboard must work the same with Precision Farming off (a save
without it), where today's sections are the truth.

**What the player sees.**
- **Precision Farming on, the sprayer turned on:**
  - the card's section strip lights a section while any of its nozzles
    sprays, and the line under it says so ("3 / 9 sections · 11 / 33 m");
  - the field panel's boom lights the same sections;
  - the trail is drawn only where nozzles spray: a band per stretch of
    nozzles side by side that are on, so a spot-sprayed pass leaves
    patches, an edge pass a narrower band;
  - Area counts the width that sprays.
- **The sprayer turned off** (Precision Farming on or off): the strip shows
  the sections you've set by hand, as today, so you see what will spray.
- **Precision Farming off, or a tool without its nozzles** (a spreader, a
  slurry tanker): exactly revision 3, the sections you've set by hand.
- Nothing else changes: the width buttons still set the sections by hand
  (spec 0011), Precision Farming switches nozzles within them.

**Data contract.**

| Topic, field | What | Game source | Verified |
|---|---|---|---|
| `vehicles` implement `spraySpans` (new) | while the tool has Precision Farming's nozzles: `[[from, to], ...]` metres right of the controlled vehicle's centre line (as `workSpans`), the stretches whose nozzles are on, left first, rounded to 0.1 m; `[]` when none is on; absent without those nozzles | the tool's `spec_<Precision Farming's mod name>.extendedSprayerEffects` (found by its suffix, as the yield's table is), its `sprayerEffects`: each `effectData.isActive` and `effectData.effectNode`, `localToLocal` into the root | **no**: the table, its fields, and that the ground is sprayed only under nozzles that are on (`updateWorkAreaSubSectionData`); checked live |
| a nozzle's width | half the gap to each neighbour (the boom's two ends: the gap to the one beside) | the nozzles' positions | our estimate |

Sent at the vehicles topic's 2 Hz, not in the cab: spot spraying switches
nozzles many times a second, and the cab is sent when it changes. No new
topic. Mod 0.15.0.

**How the web uses it** (`selectors.js`):
- `bandsOf`: `spraySpans` when sent, merged as `workSpans` are; `[]`
  draws nothing. Before them, as revision 3: the sections set by hand,
  else `workSpans`, else `workWidth`.
- `sectionsSpraying(entry, impl)` (new), for the strip and the boom: while
  the tool is on and `spraySpans` is sent, a section is lit when a span
  covers at least a quarter of it (its metres from `width.sections`, else
  the working width split evenly, the boom centred on the rig); otherwise
  `widthSegments`, as today.

**Plan.**
- Mod: `Tools.lua`'s `spraySpansOf(object, root)` beside `workSpansOf`,
  through `Api.lua`; the nozzle table found once by its suffix;
  `mod/tests`: a fake boom of nine nozzles, three on, and a tool without
  nozzles; the version.
- Web: `bandsOf` and `sectionsSpraying` in `selectors.js`; the card's
  strip and `widthLine` (`vehicleTools.js`) and the panel's boom
  (`fieldPanel.js`) use `sectionsSpraying`; `coverage.js` and `rates.js` unchanged (they take
  `bandsOf`).
- Docs: Behaviour, Data contract, Plan, Acceptance, Decisions here; spec
  0011's strip (a pointer here); THEMES.md's panel text.
- Golden: unchanged (the replay sends no `spraySpans`).

**Acceptance.**

Automated (written first):
- [x] `mod/tests`: nine nozzles across a 27 m boom, the middle three on:
  `spraySpans` is one span of about 9 m in the middle; none on: `[]`;
  a tool without the nozzle table: no `spraySpans`.
- [x] `bandsOf`: `spraySpans` win over the sections and `workSpans`; two
  stretches give two bands; `[]` gives none; without them, revision 3's
  bands (the existing checks still pass).
- [x] `sectionsSpraying`: on, spans over three middle sections light
  those three; off, the sections set by hand; no `spraySpans`, the
  sections set by hand.
- [x] Coverage and Area: a pass with three of nine sections spraying draws
  one band a third wide and counts a third of the width; `[]` draws and
  counts nothing.
- [x] The card's strip and the panel's boom light the sections spraying
  (a rig with `spraySpans`), and the sections set by hand without them.
- [x] Replay in the browser pane, day and night at 1180×820 (a 6R with a
  33 m boom on field 120, its nozzles spraying the middle or the left
  third in turn).
- [x] `python -m pytest mod/tests companion/tests tests` passes, the golden
  unchanged.

Live check (in game; Solek, mod 0.15.0):
- [x] **The Vantage with Precision Farming's automatic spraying, a pass
  where the game sprays with only some sections:** the strip lights those
  sections and the count says so; the trail is as wide as what sprays and
  sits on that side; it matches the game's sprayed map.
- [x] **Turned off:** the strip shows the sections set by hand.
- [x] **Two sections off by hand, Precision Farming's automation off (if
  the sprayer allows):** the strip and trail as revision 3.
- [x] **Leaving a field and coming back** (revision 3's fix): the outline
  and the trail both go past the margin, and both come back.
- [ ] **Precision Farming off** (a save without it, if one can be made):
  the strip and trail follow the sections set by hand. Otherwise this stays
  in NEXT.md with the four width buttons.

## Behaviour

**Layout (1180×820).** The usual chrome. The content area has:
- the rig strip across the top (60 tall);
- under it, the tools on the left and the field panel on the right
  (320 wide);
- the column on the right, as on every screen.

Nothing stretches to fill the height: cards are as tall as their content
and the ground shows under them.

**The rig strip** replaces the band (spec 0002):
- **Where:** on the ground, with no dark readout card.
- **Gone:** the band's "Vehicle · CLAAS" label, the job ("Parked"), Speed,
  Fuel, DEF, Wear and the Engine hot chip. They move to the bottom bar.
- **Tiles:** every rig member in driving order, as today: the badge, the
  model, the state line, and a thin bar per fill unit across the tile.
  - The tiles share the strip's width, at least 150 px each; past that
    the strip scrolls sideways (five tiles or more at 1180×820).
  - A tile is a card's surface (`--card`) with lift, because a tap
    selects that tool in game (spec 0003); the page stays.
- **Links:** 64 px wide, with the coupling's name (3-point, Drawbar) in a
  neutral chip. The line is solid while the tool is lowered and dashed
  while raised.
- **The game's selected tool** is shown here, and only here: its tile gets
  "where you are", a tint with a 2 px ring (`--sel-tint`, `--select`).
  - No yellow fill.
  - Cards get no selection ring or tint any more (spec 0010's
    selected-card look goes).
- **The tractor's tile** shows no warnings: low fuel or a hot engine turns
  its number orange in the bottom bar, so it isn't shown twice.

**Tool cards** (a card per working thing, spec 0003), stacked from the
front of the rig to the back: the strip's driving order read from the
tractor, so the trailer on the tractor is above the one behind it and a
front mower above the rear one (revision 5, Vincent, 2026-11-08):
- **Head:** the badge (the "on" look while working, below), the model
  (18 px), "Berthoud · Sprayers · Rear" under it. The Working chip goes:
  the badge says it.
- **Stats:** Speed against the tool's limit, Width, Area this run and the
  tool's own wear, as now.
  - Each one sits on a small quiet tile: the line colour as its
    background, 10 px corners, 6 × 10 padding, an 11 px label and a 15 px
    value. No bar under Speed or Wear (the canvas has none): over the
    tool's limit Speed's value turns orange.
  - They're context, not the point (Vincent, 2026-11-03), so they go first
    when space runs out: two stacked cards on a screen under 800 px tall
    (the iPad mini's 1133×744) show none.
- **Tanks:** for each, the name, the percentage (22 px), an 8 px meter,
  the litres, and "≈ 18 min left" while it's emptying ("full in ≈ 4 min"
  while it fills, as before). No box round each tank.
- **Section strip:** as specs 0011 and 0012 have it.
  - On sections are the muted colour and off ones the line colour, not
    yellow.
  - Under it: "7 / 9 sections".
- **Buttons:** drawn exactly as the column's (84 × 80, icon over a 13 px
  label), in one row from the left, never stretched to the card's width.
  - What they are, their labels and their fading are spec 0012's.
  - A press the game answers not ok shows **"Failed"** in place of the
    button's label for a few seconds, the reason only in its title
    (`ui/control.js`). Nothing else: no note on the card or under the All
    tools group, no toast or notification anywhere (revision 6, Vincent,
    2026-11-08).
  - **More** (spec 0012) is the row's last button: a chevron, "More",
    and its count ("2") as the button's value line under it; a tap opens
    or closes the More row under the main one (its buttons 84 × 80 too).
- **Also attached** (a tool with no card, a weight): a slim card each, at
  the bottom of the tools column. It has the badge, the model, a line
  with brand, category, side and state, and its buttons (Lower / Raise,
  Detach) at 84 × 80.

**How many fit (1180×820, no scrolling):**
- With one or two working tools, the cards stack in the tools column next
  to the field panel.
- With three or more, the field panel goes and the cards take the whole
  width in spec 0003's compact grid (three in a row, four two by two).
  Their buttons stay 84 × 80, wrapping to a second row if a card is too
  narrow.
- At 1133×744 the same, with two stacked cards' stats gone (above).

**The field panel** (none, one or two working tools: with none, a
tractor alone or with a weight, it shows too, the tools column then holding
only Also attached or "Nothing attached"; hidden on foot):
- **The map** (revision 2: no map image), fixed to the field the rig is
  in (its bounds plus 15 % of its size on each side, at least 25 m): the
  field's outline (the muted colour, 2 px) on the card's colour, and the
  rig as a dark dot with a white ring and a heading arrow. It doesn't move
  with the rig.
- **A sprayer's boom:** a line in the text colour behind the dot at the
  tool's working width. Its sections that are off are grey: while it
  sprays with Precision Farming's nozzles, those none of whose nozzles
  spray (revision 4), else those set off by hand.
- **The trail (new):** where the rig's tools have worked on this field,
  drawn as solid bands (revision 3: a band per work area, so a butterfly
  mower's two wings are drawn either side of the tractor; a sprayer's band
  is the sections that are on, so a narrower pass is narrower and sits on
  the side still on; revision 4: with Precision Farming's nozzles, only
  where they spray), clipped to the field's outline. A band goes on while
  its edges move less than 1 m (a trailed boom swings behind the tractor);
  a new one overlaps the last stretch, so no seam or wedge shows. A tool draws only
  while it works: on if it turns on, lowered if it lowers (revision 3). It's pale yellow for mowers and green for every
  other tool (spraying, sowing...): `--trail-mow` and `--trail-work`.
  - It's our estimate (Data contract), never the game's own map.
  - A trail is kept while the page is open. It's cleared when its tool is
    detached, as Area is (`rates.js`), and, as Area, when you change
    vehicles or get out; another map clears them all.
- **Under the map:**
  - the field's number and area ("Field 23", "1.8 ha");
  - the crop and its stage ("Wheat", "Growing · stage 3 of 7") over a
    bar of its stages;
  - "Needs" with a chip for each thing the field needs (the Map's field
    panel's words: Weeding, Fertilizer, Lime...), or "Nothing" in muted
    text;
  - "This run ≈ 54 % of the field", while there's a trail.
- **Only your fields** (revision 3): a field shows, and its trail records,
  only when your farm owns its farmland.
- **Off a field** (revisions 2 and 3): the field stays (its outline, trail
  and rows), the arrow wherever the rig is, while the rig is inside the
  panel's view (the field plus its margin). Past it, or with no field yet
  (just got in), or on a field that isn't yours: "Not on your field", an
  empty map, no arrow, no crop or needs. Back on the field its trail is
  still there. Without the rig's position (an older mod), the same.
- **What a vehicles message does** (revision 2): paints each run's newest
  stretch on the trail's canvas, moves the arrow by a transform, and
  changes the % when its rounded value moves. The outline is written only
  when the field changes; the trail is drawn in full only when the field,
  the box's size or the palette changes or a tool's trail goes. While the
  page is hidden nothing is drawn; on show, the stretch missed meanwhile.
- A tap does nothing (open question 4).

**The column:**
- Lights and Drive, as on every screen.
- With two or more working tools, a third group, **All tools**, holds
  today's All row (spec 0003; spec 0012's rules): Lower all / Raise all,
  Fold all / Unfold all, Turn on all / Turn off all, Tip all / Stop all.
  These are the buttons the tools share.
  - It sits under Drive, three to a row.
  - A failed answer's note shows under the group.
  - The group comes with the rig, not with the tools' live state: it
    doesn't come and go while the rig stays the same.
  - The page's own All row goes.

**The bottom bar:**
- **Readout:** as on the Map screen, the tractor's numbers on the right:
  speed, gear, fuel (with its small bar, orange when low), DEF, wear, and
  engine temperature (orange when hot).
  - Wear reads "23 % wear", so the bare number says what it is.
  - When space runs out: temperature goes first (under 1000 px wide), then
    gear (compact keeps speed, fuel and DEF; a phone speed and fuel).
  - Rpm, fuel usage and the cruise speed stay Map-only. The cruise speed
    is already on the Cruise button.
  - The band's fuel and DEF ranges in hours ("≈ 5 h", spec 0002) go with
    the band: the readout shows them as the Map does, a % and a bar.
- **The Loader page** (spec 0002) gets the same strip and readout. Its
  Load and Target cards are unchanged. The Harvester page keeps its own
  band (spec 0001).

**"On", where you are, and the night palette:** these are tokens of the
theme, so they change on every screen, and the column stays the same
everywhere (Vincent, 2026-11-03).
- **"On" by day:** an outline instead of the blue fill. The button keeps
  its surface, its edge and ink take the "on" blue (`#0C4DB8`), and a
  14 % tint of it shows inside.
  - Hazard and the turn arrows take their red and green the same way.
  - A working badge is outlined in the "on" blue.
  - What's "on" without being a control (Settings' Screen switches, the
    Harvester's chips) takes the same outlined look.
- **"On" at night:** a steel grey fill instead of yellow: `#4B5A78 →
  #3C4966`, white ink, a `#62739A` edge.
  - Hazard and the turn arrows still fill red and green.
  - A working badge takes the steel fill.
- **Pending** (spec 0010) is unchanged: the edge takes the colour the
  button is going to, with a faint tint of it breathing inside.
- **Where you are at night:** a light ring (`#C9D4E8`) with a 7 % white
  tint, instead of yellow. The selected tab and the selected tile use it;
  day is unchanged.
- **The rest of the night's yellow goes too** (Vincent, 2026-11-03):
  - These take the steel fill with white ink: the field number badges on
    the Map screen and in its field panel, the Harvester's readout badge,
    and the open Settings button.
  - Accent text and the farmland badge's text take the muted colour.
  - The Harvester's "until full" stays orange: it's the warn colour, not
    the accent.
  - The status bar's sun (the weather) takes the bar's ink at night.
  - By day these are unchanged.
- **The darker night**, closer to black and less blue (the day palette
  doesn't change):

  | Token | Night today | Night (this spec) |
  |---|---|---|
  | Ground | `#0B2149 → #06142E` | `#0C121E → #070B13` |
  | Bar and tab bar | `#0A1C40 → #04112A` | `#0B1120 → #070B14` |
  | Card | `#163370 → #0D224B` | `#141C2C → #101727` |
  | Card (flat) | `#12295A` | `#121A29` |
  | Button (off) | `#163370 → #0D224B` | `#1A2438 → #131B2C` |
  | Pill (status bar) | `#0F2550` | `#161F31` |
  | Border | `#24427C` | `#273349` |
  | Line, meter track | `#1C3566` | `#1D2638` |
  | Text / muted | `#EAF0FA` / `#9DB0CF` | `#E8EDF5` / `#97A3B9` |
  | Badge (idle) | `#24427C → #1C3566` | `#222C40 → #1B2436` |
  | Chip (on) | `#1C3566`, `#8DB9FF` | `#1D2638`, `#A9C3F2` |
  | Glass (map overlays) | `rgba(4,17,42,0.85)` | `rgba(7,11,19,0.82)` |
  | Lift | `… 0 4px 14px rgba(0,0,0,0.4)` | `inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.5)` |

  Muted text on a card is 6.7:1 (WCAG AA). OK, warn and alarm stay.

**Day and Night** as above. **Compact (portrait):** one column. The strip
scrolls sideways, then come the cards, then the field panel (240 tall),
then the column docked under them, as today.

## Data contract

No new topic. Revision 3 adds one field (mod 0.14.0); everything else this
page shows was already sent and live.
- **Mod → companion:**
  - `vehicles`: the controlled vehicle's `x`, `z`, `heading`, `speed`,
    and each implement's `workWidth` and (revision 3) `workSpans`: each
    work area's `[from, to]`, metres right of the controlled vehicle's
    centre line, rounded to 0.1 m, left first; the AI's area types only;
    and (revision 4, mod 0.15.0) `spraySpans`, the stretches Precision
    Farming's nozzles spray, the same way (`[]` none; absent without its
    nozzles).
  - `cab.rig`: `can`, `lowered`, `turnedOn`, `width`, `selected`.
  - `fields` (`farmlandId`), `farmlands` (`farmId`), `field_outlines`,
    `crop_types`.
  - The map's `meta.json` and image: no longer read by the field panel
    (revision 2); the Map screen's own.
- **Web** (`web/src/types.js`): no topic changes.
- **Web** (data, widgets):
  - `data/selectors.js`: `fieldAt(store, x, z)`, the outline
    (`{id, points}`) of the field that holds the point (`field_outlines`,
    even-odd rule), or undefined. `widthSegments` and `widthMetres` (spec
    0011) moved here from `vehicleTools.js`, which the trail needs too.
  - `data/coverage.js` (new, beside `rates.js` and fed the same way):
    - **When it records:** while a tool works, by `isWorking` (revision 3,
      Area's rule too): on if it can turn on, lowered if it can lower, by
      its `turnedOn` with neither, never loader gear; without the cab's
      entry, lowered or on. And moving faster than 0.5 km/h, on a field of
      yours (`ownFieldAt`), with a band.
    - **What it records:** for the field under the rig, the rig's path as
      segments, a run per band (`bandsOf`): a sprayer's sections that are
      on (spec 0011's `width`), else each work area (`workSpans`, those
      that touch or overlap as one), else `workWidth` on the track.
    - **The percentage:** the share of the field's 2 m cells under any
      segment, so passes that overlap count once.
    - **Its limits:** in memory only, at most 20,000 points per field
      (the oldest runs lose every other point; the percentage is kept in
      the cells, so it doesn't move), cleared when the tool is detached,
      on another vehicle or map. A step over 30 m is a jump, not a pass.
    - **What it gives** (`coverageOf(store)`): `trails(field)`, a list per
      tool with its kind ("work" or "mow") and runs (a width and its
      middle line, x and z in turn, cut every 500 points); `percent(field)`,
      undefined without a trail; `points(field)`; `version(field)`, which
      changes with its trails (the panel redraws by it).
  - `widgets/fieldPanel.js` (new): the panel. Revision 2: three layers in
    the map box, no map image.
    - The outline: an SVG in world metres, its viewBox `fieldView` (the
      field's bounds plus 15 % of its size on each side, at least 25 m).
    - The trail: a canvas, its transform `fitView` (the same fit as the
      SVG's "xMidYMid meet"), clipped to the outline.
    - The rig: a `.field-rig` element moved by a CSS transform
      (`will-change: transform`), the dot, arrow and boom in it.
    - The box's size from a ResizeObserver (`watchSize`; the tests pass
      their own, as they pass `coverage`).
    - It isn't the Leaflet map, so the map frame stays on the Map
      screen.
    - Field rows: `fieldNeeds` and the growth stages from
      `fieldInfoPanel.js`.

The values above are read through names that are already verified, but
for revision 3's work areas:
- `workWidth` from `getAIWorkAreaWidth`: GAME-API.md, the Implement screen's readings, as
  built; live in spec 0003's mowers.
- The field outlines from `polygonPoints`: GAME-API.md, Phase 4, mod 0.4.0.
- A farmland's `farmId`: GAME-API.md, Phase 0.

| Name | Where from | State |
|---|---|---|
| `spec_workArea.workAreas[i].start`, `.width`, `.height` (nodes), `.type` | WorkArea.lua (the game's source) | verified 2026-11-07 (GAME-API.md) |
| `localToLocal(node, root, 0, 0, 0)`, its x (GIANTS' +x left) | engine; `Api.localX` | verified 2026-11-07: +x left (GAME-API.md) |
| `g_workAreaTypeManager:getWorkAreaTypeIsAIArea(type)` | WorkArea.lua (`getAIWorkAreaWidth`) | verified 2026-11-07 (GAME-API.md) |
| `spec_<mod>.extendedSprayerEffects.sprayerEffects[i]`: `isActive`, `effectNode` | Precision Farming's ExtendedSprayerEffects.lua | verified 2026-11-07 (GAME-API.md) |

## Commands

None new.
- All tools sends today's All row actions (`implement.lowerAll`, Fold
  all, Turn on all, Tip all; spec 0003), with the same answers and notes.
- The cards' buttons are spec 0012's.

## Plan

- **Theme** (`web/src/themes/newholland/theme.css`):
  - the night tokens (the table);
  - "on" by day (outline) and at night (steel), and "where you are" at
    night;
  - the night's other yellow: `--badge`, `--settings-open`, `--tab-sel`,
    `--accent` and `--accent-2` at night;
  - the strip on the ground and tiles that share the width;
  - the cards' stats as small tiles, and buttons fixed at 84 px;
  - Also attached as slim cards;
  - the field panel;
  - the night readout card (`--readout`, still used by the Harvester's
    band): `#18223A → #0F1626`, so it isn't the old blue.
- **Theme** (`theme.js`):
  - The Vehicle page's slots: the strip, then a group with `toolCards`,
    `toolsAlso` and `fieldPanel`.
  - Its `controls` slot `add`s the All tools group.
  - A `readout` list on the Vehicle and Loader pages.
- **Widgets:**
  - `vehicleScreen.js`: `vehicleBand` becomes the strip alone
    (`bandReadouts`, `vehicleJob` and `engineHot` go from the page).
  - `vehicleTools.js`:
    - cards drop the selection look;
    - More becomes a button;
    - `toolsAll` moves into the column as a control group, using
      `controls.js`'s group with buttons from the rig.
  - `fieldPanel.js` (new); `index.js` registers it.
- **Data:** `selectors.js` (`fieldAt`) and `coverage.js` (new).
- **Docs:**
  - THEMES.md gets a "Vehicle page, calm (spec 0013)" section, and its
    Palettes table and the specs/0010 lines change.
  - Spec 0012's More row is drawn as a button (that spec's Behaviour, in
    the same change).
  - Spec 0002's band moves to the bottom bar (its Behaviour gets a
    pointer here).
- **The design system** (`FS25 Companion` on claude.ai) is refreshed in
  the same change, because theme.css changes (THEMES.md, Design system).
- **Golden:** no viewer message changes, so `fixtures/golden_viewer.ndjson`
  stays.
- **As built** (2026-11-07), where the code went beyond the list above:
  - `vehicleBand` is now `rigStrip` (the strip alone), and the Loader page
    uses it too; `rates.js` lost the fuel and DEF use the band's ranges
    needed.
  - `render.js`: a column's `add` takes a widget as well as a group of
    controls (`{ widget: "toolsAll" }`); `toolsAll` draws a
    `.control-group` titled "All tools".
  - `widget.js`: a `readoutUnit` for the readout variant (wear's
    "% wear"); `fieldInfoPanel.js` exports `growthProgress`.
    (`overviewLayer.js` exported `imageName` until revision 2.)
  - Revision 2 (2026-11-07): `fieldPanel.js` as three layers, the
    `--trail-work` and `--trail-mow` tokens; the panel's image, filter,
    clip path and polylines gone.
  - The theme's tokens: `--on` is the lit layer and `--on-tint` how much
    of it shows (0.14 by day, 1 at night); `--on-fill` for what's on and
    isn't a control; `--work-badge`, `--work-badge-ink`,
    `--work-badge-ring` for a working badge.
  - Revision 3 (2026-11-07): `Tools.lua`'s `workSpansOf` and
    `Api.localX` (mod 0.14.0); `selectors.js`'s `isWorking`, `bandsOf`,
    `sectionBand` (coverage's `bandOf`, moved), `isOwnField` and
    `ownFieldAt`; `coverage.js` a run per band; `rates.js` Area by
    `isWorking` over the bands' width; `fieldPanel.js` lets the field go
    past its view and says "Not on your field".
  - Revision 4 (2026-11-07): `Tools.lua`'s `nozzlesOf` and `spraySpansOf`
    (mod 0.15.0); `selectors.js`'s `bandsOf` takes `spraySpans` first,
    `sectionsSpraying` (new); `vehicleTools.js`'s strip and `widthLine` and
    `fieldPanel.js`'s boom light the sections spraying. The panel clears
    its canvas out of the field's fit (revision 3's live check).
- **Risks:**
  - the "on" look changes on every screen (Map, Harvester, Loader);
  - the field panel and three cards at 1133×744 (iPad mini);
  - the trail's memory on a long session (the cap);
  - how close our trail is to the game's own sprayed map, which only the
    live check can say.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [x] `web/test.html`, `fieldAt`: a point inside a concave outline, one
  in its notch, and one outside; no outlines gives undefined.
- [x] `web/test.html`, coverage:
  - a 100 m straight pass at 10 m width over a 100 × 100 m field gives
    ≈ 10 %;
  - the same pass twice still gives ≈ 10 %;
  - nothing is recorded while raised, turned off, or below 0.5 km/h;
  - two sections off out of nine record 7/9 of the width;
  - detaching clears that tool's trail;
  - the point cap merges and keeps the percentage within 1 %.
- [x] `web/test.html`, field panel:
  - its viewBox is the field's bounds plus 15 % (at least 25 m since
    revision 2);
  - off the field, inside its margin, the field stays (revision 2; past
    it "Not on your field" since revision 3), with no field yet "Not on
    your field";
  - the Needs chips match `fieldNeeds`;
  - no percentage without a trail.
- [x] `web/test.html`, the page:
  - no band readouts or job;
  - the strip's tiles share its width;
  - the selected tool's tile has the "where you are" look and its card
    doesn't;
  - card buttons are 84 px wide and More is a button with its count;
  - with three working tools the field panel is hidden.
- [x] `web/test.html`, the column: All tools shows with two working
  tools, not with one, and holds the same actions as today's All row.
- [x] `web/test.html`, the readout: the Vehicle and Loader pages list
  speed, gear, fuel, DEF, wear and engine temperature.
- [x] `web/test.html`, tokens:
  - at night an "on" button's background is the steel fill and no
    computed colour on the Vehicle page is the old yellow (`#FFC72C`,
    `#FFD65C`);
  - by day an "on" button has no blue fill and an `#0C4DB8` edge.
- [x] Replay in the browser pane (`replay-solek`, a sample driven tractor
  patched in, per the usual trick), each screen at 1180×820 day and
  night and once at 1133×744:
  - the sprayer rig (ARION 410, Vantage 4300, W 600);
  - two mowers;
  - three tools;
  - the Map, Harvester and Loader screens, for the new "on" look.
- [x] `python -m pytest mod/tests companion/tests tests` passes, the
  golden unchanged.

Live check (in game; Solek):
- [x] **ARION 410, Berthoud Vantage 4300, W 600, parked by a field:**
  - the strip shows the three in order, the Vantage selected;
  - pressing G in game moves the ring to the next tile;
  - the bottom bar shows speed, gear, fuel, DEF, wear and temperature;
  - the panel says "Not on your field" (revision 3).
- [x] **Drive into a field:** the panel switches to it, with its number,
  crop and needs as the game's PDA field info shows them.
- [x] **Unfold, Turn on and spray two passes,** one with two sections
  off:
  - the trail follows the passes at the boom's width, the narrower pass
    narrower;
  - "≈ % of the field" is close to the share the game's map shows
    sprayed.
- [x] **Detach the Vantage:** its card and its trail go; the W 600 stays
  under Also attached.
- [x] **Samasz KDF 341 S front and XT 390 rear, mowing:**
  - All tools is in the column;
  - Raise all, Fold all and Turn off all act as today's All row did;
  - the trail is pale yellow.
- [x] **At night,** on every screen: nothing on screen is yellow (the
  orange "until full" aside); "on" buttons and the field number badges
  are steel grey. **By day,** "on" buttons are outlined.

## Decisions

Made while drafting; the review or the live check can change them.
- **The field panel is plain layers in world metres, not a second Leaflet
  map.** The map frame stays the Map screen's (its toolbar, popups and
  saved view), and the panel needs no pan or zoom. Revision 2
  (2026-11-07, Vincent): no map image either, for speed on the iPad.
- **The field panel shows with one or two working tools only.** Three or
  more need the width (spec 0003's grid).
- **More is a button** at the end of the button row, not a row of its own
  (spec 0012's More row opens under it).
- **The trail lives in the viewer's memory,** like Area: it starts when
  the page opens and goes on a reload or a detach (Vincent, 2026-11-03:
  not kept by the companion).
- **Off a field, the panel keeps the field while the rig is in its view**
  (revision 3, Vincent, 2026-11-07). Revision 2 kept the last field
  however far the rig went; before that it showed the map around the rig
  (2026-11-03), which needed the map image. The view's margin keeps a
  headland turn from changing the panel.
- **Only your fields** (revision 3, Vincent, 2026-11-07): contracts and
  helping another farm come in a spec of their own.
- **Precision Farming on and off** (revision 4, Vincent, 2026-11-07):
  its nozzles are an extra the dashboard uses only when the mod sends
  them; without them, the sections set by hand. Turned off, the strip
  shows the sections set by hand, so you see what will spray.
- **A tool works when everything it has says so** (revision 3): fold isn't
  part of it, since some tools lower through their fold, and a folded
  sprayer can't be turned on.
- **The bottom bar's readout:** speed, gear, fuel, DEF, wear and engine
  temperature. Rpm, fuel usage and cruise stay on the Map screen.
- **The Loader page** takes the same strip and readout, so the band is
  gone everywhere but the Harvester.
- **Made while building (2026-11-07):**
  - The field panel shows with no working tool too (a tractor alone, a
    weight): the width is there, and where you are is still useful.
  - The trail ends at the field's edge (clipped to its outline), so a turn
    on the headland stays off the map.
  - Pale yellow for mowers only; every other tool's trail is green.
  - Stats go first on a short screen: two stacked cards at 1133×744 were
    68 px too tall with them (the trailers).
  - No bar under the stats, as on the canvas.

## Out of scope / open questions

- **Out of scope:** a trail kept by the companion, shared between tablets
  or surviving a reload; the game's own sprayed or mowed map.
- **Open: a tap on the field panel.** Nothing (as drafted), or open the
  Map screen on that field with its panel?

Answered on 2026-11-03: the new "on" and the darker night apply on every
screen; the night's other yellow goes neutral; the trail stays in the
page's memory; off a field the panel shows the map around the rig.

## Log

- 2026-11-03: drafted from the canvas Vincent approved (comments: the
  tractor's numbers in the bottom bar, a full-width strip, small stat
  tiles, no yellow at night, steel grey for "on", the outline by day).
  Vincent answered four open questions the same day (Out of scope).
- 2026-11-03: approved by Vincent; the tap on the field panel stays open
  (nothing, as drafted).
- 2026-11-07: built (dashboard only, no mod change). `web/test.html` all
  green (298), pytest 119 passed, the golden unchanged. Checked in the
  browser pane on the Solek replay with a driven ARION patched in (the
  Vantage spraying 7 of 9 sections on field 120, the two Samasz mowers,
  three made-up tools; the Map, Loader and Harvester screens), day and
  night at 1180×820 and at 1133×744: every rig fits, nothing yellow at
  night. Differences from the draft are in Behaviour and Decisions (the
  panel with no working tool, the trail clipped to the field, stats gone
  on a short screen, "% wear" in the bar, the band's fuel range gone).
  The design system on claude.ai is refreshed the same day (its tokens,
  the controls' "on", working badges and the rig on the ground; its
  components' code unchanged).
- 2026-11-07: Vincent: the Vehicle page is slow on the iPad Pro (Safari),
  about 100–300 ms to show, Harvester and Loader not; the field panel. Not
  reproduced in the browser pane (taps paint in 16–24 ms). Revision 2
  drafted with Vincent: a light field panel (no map image; outline, trail
  canvas and arrow as three layers; the last field kept off a field).
- 2026-11-07: revision 2 approved by Vincent and built (web only, no mod
  change). `web/test.html` all green (301), pytest 119 passed, the golden
  unchanged. Checked in the browser pane on the Solek replay with a sample
  sprayer (24 m) on field 120, day and night at 1180×820 and at 1133×744:
  outline, solid trail and arrow; a palette change or a resize repaints
  the trail; 200 vehicles messages took 26 ms in all, painting included;
  a tap from Map shows the Vehicle page in 24 ms. Each band is drawn a
  pixel wider, so passes side by side leave no seam. The iPad check is
  Vincent's (the revision's Live check).
- 2026-11-07: revision 2 checked by Vincent on his iPad Pro (Safari): Map ↔
  Vehicle and switching tractors show the page at once; spraying passes,
  the arrow and trail keep up and a headland turn leaves the panel on the
  field; the same at night. All three boxes ticked. Spec 0013's own live
  check stays open.
- 2026-11-07: Vincent saw the Loader page's cards had no surface. This
  spec's first build left a stray `.veh-card {` in theme.css, so the rest
  of the file sat inside it and never matched: the Load and Target cards
  lost their background, border and padding, and every rule after them
  (Engine two columns wide, the compact layouts) was dropped. Fixed;
  `tests/test_theme_css.py` now fails on a style rule inside another.
- 2026-11-07: Vincent ran the live check on Solek (no livewatch; the
  stream had rotated by the time we looked). Passed: drive into a field
  (number, crop, needs as the PDA), detach the Vantage, day and night on
  every screen; mowing: All tools in the column, Raise, Fold and Turn off
  all. Not passed:
  - The panel takes any field, ours or not, and keeps the last one however
    far the rig drives off it (revision 2's rule), so "Not on a field"
    never comes back.
  - The trail drew with the Vantage folded and not spraying. The cause, in
    the game's Lua: the mod reads `getIsLowered(true)`, and for a tool on
    a joint that doesn't lower (a trailed sprayer)
    `Attachable:getIsLowered` returns that default, so the Vantage always
    reads lowered and "lowered or turned on" holds.
  - The rear mower (the butterfly behind the T7.300) left no trail of its
    own: `workWidth` is `getAIWorkAreaWidth`, the widest single work area,
    and the band sits on the rig's track, so its two side wings were never
    drawn and the middle merged with the front mower's band.
  The three are revision 3 (drafted the same day).
- 2026-11-07: revision 3 approved and built (mod 0.14.0): only your
  fields, the field let go past the panel's view, "Not on your field";
  `isWorking` for the trail and Area; a band per work area (`workSpans`).
  test.html all green (four new checks, the panel's off-field checks
  moved inside the margin), pytest 120, the golden unchanged; in the pane
  a butterfly behind a T7 leaves two wings and an unmown middle, day and
  night. The live check is Vincent's (the revision's three boxes).
- 2026-11-07: Vincent ran revision 3's live check (mod 0.14.0, Solek).
  Passed: the T7.300's mowers draw three bands, the wings either side, and
  Area counts the full width; the Vantage folded or off draws nothing,
  turned on it draws; a field that isn't ours says "Not on your field", a
  headland turn keeps ours, the road past the margin lets it go. Ticked
  with them: the page's first box ("Not on your field") and the mowing box
  (pale yellow). Not passed:
  - Leaving the field hid the outline but left the trail. The clear ran in
    the field's fit and clip, in world metres near the map's origin, so on
    Solek (fields 800 m from it) it missed. Fixed the same day: out of the
    fit and clip before the clear; a test with a field far from the origin
    (test.html all green). Back on the field still to be seen live.
  - Precision Farming's automatic spraying: the game sprayed with about
    three sections, the card's strip said 9 of 9 and the trail stayed full
    width. In Precision Farming's Lua (`ExtendedSprayerEffects`,
    `WeedSpotSpray`), its spot spraying and pulse width modulation turn
    each nozzle on and off (`effectData.isActive`, its `sectionIndex`) and
    never touch the boom's sections (`leftSide`, `rightSide`), which are all
    the mod reads. Revision 4 drafted the same day (Precision Farming on and
    off, Vincent).
- 2026-11-07: revision 4 approved and built (mod 0.15.0): `spraySpans` from
  Precision Farming's nozzles; the trail, Area, the card's strip and line
  and the panel's boom follow them while the sprayer is on, the sections
  set by hand otherwise or without Precision Farming. test.html all green
  (three new checks), pytest 120, the golden unchanged; in the pane a 33 m
  boom spraying a third leaves 11 m bands and "3 / 9 sections · 11 / 33 m",
  day and night. The live check is Vincent's (the revision's five boxes).
- 2026-11-07: Vincent saw the trail as thin lines with mod 0.15.0. A
  recorder on the stream showed the nozzles right (about 27 m sprayed of
  33, one stretch), but the trailed Vantage's edges moved 0.1–1 m every
  message, so the trail began a new run almost every sample (41 runs in 85)
  and the square ends left seams, wedges in turns. Fixed (web only): a run
  goes on while its edges move under 1 m, at its own band; a new run starts
  from the old one's last two spots. The recorded pass now makes one solid
  band through its U-turn; a swinging-boom test (test.html all green,
  pytest 120).
- 2026-11-07: Vincent confirmed in game that the trail draws solid bands
  with the fix.
- 2026-11-07: Vincent checked revision 4 in game (mod 0.15.0): automatic
  spraying lights the sections that spray and the trail matches the game's
  sprayed map; turned off, the strip shows the sections set by hand; two
  sections off by hand follow; leaving a field takes the outline and trail
  away and back. Ticked with them: revision 3's Vantage and fields boxes
  and the page's spraying box. Precision Farming off stays open (NEXT.md,
  with the four width buttons). The names verified move to GAME-API.md; spec
  live-checked.
- 2026-11-08: small fix from NEXT.md: the rig strip's key now holds each
  tile's model name (`entryModel`), so a new vehicle's name shows once the
  `vehicles` topic brings it after the cab. A test.html check for it
  (failed before the fix); test.html all green, pytest 120.
- 2026-11-08: revision 5 (Vincent, during spec 0015's live check on the
  Vestrum 100 with two EDK 650): the cards read backwards. They were
  stacked in the strip's driving order, the trailer farthest from the
  tractor on top. Now from the front of the rig to the back
  (`cardsOf` reverses `drivingOrder`): the first trailer on top, a front
  mower above the rear one, a tipper truck above its container. The strip
  is unchanged. `test.html` "tool cards: front of the rig to the back"
  (failed before); the mowers and truck fixtures' expected cards swapped
  in `fixtures/rig_fixtures.py` and regenerated; two card-tap checks follow
  the new order. test.html all green (315), pytest 120. Seen live on the
  Vestrum: parsnips (first trailer) on top, wheat below.
- 2026-11-08: revision 5 live-checked (Vincent: "card order works
  perfectly").
- 2026-11-08: revision 6 (Vincent): a failed answer shows only on its
  button ("Failed"). The card's dark note over its foot and the line
  under All tools ("Nothing moved", the game's words) are gone
  (`reasonNote` and its `onWhy` plumbing in `vehicleTools.js`, the
  `.tool-note` rules in theme.css). test.html: the failed-answer check
  now reads "Failed" on the tapped button and no note anywhere; 315
  green. Seen live on the Vestrum: no note element, no console error.
- 2026-11-09: revision 6 live-checked (Solek, mod 0.17.1, the Vestrum 100
  with two EDK 650, the first on the Grain door blocked by the second):
  Tip answered "Nothing moved"; its button read "Failed" (red) about 1 s
  after the press, the reason only in its title, no note on the card or
  under All tools. Vincent: the same on his screen, and the game's own
  warning in game.
