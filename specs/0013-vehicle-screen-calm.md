# 0013: Vehicle page, calm

Status: built (live check open); revision 2 built (a light field panel; its iPad check open)
Mod: no change · Started: 2026-11-03 · Design: the canvas [FS25 Companion: Vehicle screen, calm](https://claude.ai/artifact/JApsdXjoSFwsddKv2kNYZ3) (private, on claude.ai; approved by Vincent on 2026-11-03), a THEMES.md section at build; specs [0003](0003-implement-screen.md) (the page), [0010](0010-tidy-states-and-motion.md) (the states), [0012](0012-card-buttons.md) (the buttons)

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

Drafted, approved by Vincent and built on 2026-11-07; the iPad check is
open. This section is the revision whole; Behaviour, Data contract, Plan,
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
- [ ] Map ↔ Vehicle back and forth quickly: the Vehicle page shows as fast
  as Harvester and Loader.
- [ ] Get out and into another tractor, then back: the page shows at once.
- [ ] Spray two passes on a field: the arrow and the trail follow, the %
  as before; a headland turn leaves the panel on the field. The same at
  night.

**Later, in specs of their own** (agreed 2026-11-07, not this revision):
- Progress kept by the companion, per field and per tool, for the game
  session (Safari pauses the page, so it misses messages); the panel
  never switching field by itself ("Working Field 2? · Show Field 2");
  only fields you own; the % per tool.
- Contracts and helping another farm: the game's land-access check, a mod
  change and a live check.

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

**Tool cards** (a card per working thing, spec 0003), stacked in driving
order:
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
  tool's working width. Its sections that are off are grey.
- **The trail (new):** where the rig's tools have worked on this field,
  drawn as a solid band at the working width (the sections that are on,
  so a narrower pass is narrower and sits on the side still on), clipped
  to the field's outline. It's pale yellow for mowers and green for every
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
- **Off a field** (revision 2): the last field stays (its outline, trail
  and rows), the arrow wherever the rig is, until the rig is in another
  field. With no field yet (just got in, or not on one since): "Not on a
  field", an empty map, no arrow, no crop or needs. Without the rig's
  position (an older mod), the same.
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

No mod change, and no new topic or field: everything this page shows is
already sent and live.
- **Mod → companion:** unchanged.
  - `vehicles`: the controlled vehicle's `x`, `z`, `heading`, `speed`,
    and each implement's `workWidth`.
  - `cab.rig`: `lowered`, `turnedOn`, `width`, `selected`.
  - `fields`, `field_outlines`, `crop_types`.
  - The map's `meta.json` and image: no longer read by the field panel
    (revision 2); the Map screen's own.
- **Web** (`web/src/types.js`): no topic changes.
- **Web** (data, widgets):
  - `data/selectors.js`: `fieldAt(store, x, z)`, the outline
    (`{id, points}`) of the field that holds the point (`field_outlines`,
    even-odd rule), or undefined. `widthSegments` and `widthMetres` (spec
    0011) moved here from `vehicleTools.js`, which the trail needs too.
  - `data/coverage.js` (new, beside `rates.js` and fed the same way):
    - **When it records:** while a tool works. That's the same rule as
      Area: lowered or turned on, moving faster than 0.5 km/h, with a
      `workWidth`.
    - **What it records:** for the field under the rig, the rig's path
      as segments at that width, with the side sections that are off
      left out (spec 0011's `width`).
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

No game API names are new. The values above are read through names that
are already verified:
- `workWidth` from `getAIWorkAreaWidth`: THEMES.md, Implement screen as
  built; live in spec 0003's mowers.
- The field outlines from `polygonPoints`: DONE.md, Phase 4, mod 0.4.0.

| Name | Where from | State |
|---|---|---|
| (none new) | | |

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
  - off the field the last field stays (revision 2; "Not on a field"
    before), with no field yet "Not on a field";
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
- [ ] **ARION 410, Berthoud Vantage 4300, W 600, parked by a field:**
  - the strip shows the three in order, the Vantage selected;
  - pressing G in game moves the ring to the next tile;
  - the bottom bar shows speed, gear, fuel, DEF, wear and temperature;
  - the panel says "Not on a field".
- [ ] **Drive into a field:** the panel switches to it, with its number,
  crop and needs as the game's PDA field info shows them.
- [ ] **Unfold, Turn on and spray two passes,** one with two sections
  off:
  - the trail follows the passes at the boom's width, the narrower pass
    narrower;
  - "≈ % of the field" is close to the share the game's map shows
    sprayed.
- [ ] **Detach the Vantage:** its card and its trail go; the W 600 stays
  under Also attached.
- [ ] **Samasz KDF 341 S front and XT 390 rear, mowing:**
  - All tools is in the column;
  - Raise all, Fold all and Turn off all act as today's All row did;
  - the trail is pale yellow.
- [ ] **At night,** on every screen: nothing on screen is yellow (the
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
- **Off a field, the panel keeps the last field** (revision 2, Vincent,
  2026-11-07). It showed the map around the rig before (Vincent,
  2026-11-03), which needed the map image; the last field also keeps a
  headland turn from changing the panel.
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
