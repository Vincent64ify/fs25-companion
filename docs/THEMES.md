# Themes and layouts

The design of the dashboard: how it looks, how it's laid out, and why. A
theme recreates the in-cab terminal of a tractor brand with a modern
finish. There is one for now: **New Holland style**, after the IntelliView
12, in a day and a night palette.

What a screen does (its behaviour, data and checks) is in its spec; this
file has its look, with a link to the spec. The values here are the ones
in `web/src/themes/newholland/theme.css`: change them together.

- [Words](#words) and [Decisions](#decisions)
- [Research: the IntelliView 12](#research-the-intelliview-12)
- [The look](#the-look)
- [Layout](#layout)
- [Screens](#screens): Map, and the Vehicle tab's pages
- [The map in themes](#the-map-in-themes)
- [Icons](#icons), [Controls](#controls), [Settings](#settings)
- [Design system](#design-system): type, palettes, depth, motion, radii,
  measurements, the layout grid
- [Responsive](#responsive)
- [How a theme is built](#how-a-theme-is-built)
- [Later](#later)

## Words

| Word | Meaning |
|---|---|
| Theme | A complete look: chrome, screens, palettes. "New Holland style". |
| Palette | A theme's colours for day or for night. |
| Size class | compact, regular or wide. Layouts adapt to the screen's size, not to a device model. |
| Chrome | The parts around the screens: status bar, control column, tab bar. |
| Screen | One page of the terminal, picked with a tab: Map, Vehicle. A tab can hold several pages (Vehicle, Loader, Harvester), picked by what you drive. |
| Slot | A place in the chrome or on a screen that holds a widget, a control or the map. |
| Widget | A live value or list: speed, fuel, the tool cards, the clock... |
| Control | A button for a game action. It shows the game's state, and a press sends a command. |
| Map frame | The one Leaflet map plus its overlays (land panel, notes), moved into whichever map slot is visible. |

## Decisions

| Topic | Decision |
|---|---|
| First theme | New Holland style, based on the IntelliView 12 (T7 LWB, T7 HD, T8, T9). It is the only theme, and the default, until more brands come. |
| Naming | Brand + "style" in the selector, with the note "Inspired by the IntelliView 12. Not affiliated with New Holland." Internal id: `newholland`. |
| Trademarks | Brand names as text only. No logos, emblems, photos or official artwork, in the app or on a design canvas. |
| What a theme changes | Everything: its own chrome and screens, not just colours. |
| Look | Modern first. The IntelliView 12 gives the structure, colours and feel; dated parts are modernised. |
| Night mode | A manual Day / Night switch, saved per device. Nothing switches by itself. |
| Targets | Landscape tablets of any brand and second PC monitors. Phones keep working (compact class) but aren't a design target. |
| Controls | Every screen has the control column: Lights and Drive. A tool is worked from its card, never from the column ([specs/0012](../specs/0012-card-buttons.md)). |
| Icons | Our own SVG set, drawn in the cab-symbol style. Nothing is extracted from the game for icons (see Icons). |
| Customising | Fixed layouts. Layouts are stored as data, so an edit mode can come later. |
| Theme choice | Per device (localStorage), with a URL override for bookmarks. |
| Design tool | Claude Design: a screen is drawn on a canvas, built from the design system, and approved before code follows it. |

## Research: the IntelliView 12

- **Standard layout,** per New Holland's guide:
  - a dark top bar for machine and operation settings, with GNSS and
    connectivity status;
  - a left column of value tiles the user can set (fuel rate, wheel slip);
  - a central area for the selected run screen;
  - a bottom bar of run-screen buttons, seven of them preset and
    customisable.
- **A real run screen** (the photo in Sources):
  - **Left:** white tiles with a green icon, a small label, a big value and
    a unit. Then a transmission block with a big "N" in a blue box, gear
    ratios, and speed in km/h.
  - **Centre:** the map as a tall rectangle, with vertical toolbars of
    square blue icon buttons along both edges.
  - **Right:** control rows with a green icon, a label, a value, then blue
    arrow or −/+ buttons, some with a slider.
  - **Top:** a dark bar: icons on the left, the clock in a pill in the
    centre, and status icons plus a green on/off pill on the right.
  - **Bottom:** RUN 1–7 tabs, the active one underlined in blue.
- **InfoView,** the screen in the steering wheel of the Horizon Ultra cab:
  big digital readouts of speed, rpm and gear. It's the model for our "hero"
  readout.
- **Look:** a light grey and white work area under the dark bar, New Holland
  blue for buttons and selection, green for OK states, and yellow used
  sparingly. The 2023 brand identity is a rich dark blue, white and yellow,
  with no published colour values.
- **Not documented:**
  - the UI font: photos show a neutral sans;
  - whether there's a day/night mode;
  - exact colours.

  We choose our own values in T0.
- **GIANTS' in-game version:** the game ships readable textures of New
  Holland cab screens. `data/vehicles/newHolland/cr11/cr11Display_diffuse.dds`
  is the CR11's IntelliView; also `tk4/tk4Display_diffuse.dds` and
  `t8/t8DashboardBar*_diffuse.dds`. They show how players already see the
  terminal in game. They're viewed locally only and uploaded nowhere.
- **Sources:**
  - [IntelliView 12](https://agriculture.newholland.com/africa/en-za/precision-land-management/products/displays/intelliview-12-display)
  - [IntelliView IV](https://agriculture.newholland.com/apac/en/precision-land-management/products/displays/intelliview-iv-display)
  - [IntelliView 12 guide (Russells)](https://russells.uk.com/wp-content/uploads/2023/03/ata1087419-r1-nh-intelliview-12-guide-f2.pdf)
  - [FWI T7.300 test](https://www.fwi.co.uk/machinery/tractors/201-300hp/on-test-fresh-cab-makes-300hp-new-holland-the-best-t7-yet)
  - [Farmers Guide on InfoView](https://www.farmersguide.co.uk/machinery/tractors/latest-model-impresses-potential-customers/)
  - [New Holland identity 2023](https://agriculture.newholland.com/en-gb/europe/new-holland-world/news/2023/new-holland-of-the-future)
  - [run screen photo](https://media.sandhills.com/img.axd?id=10028904894&wid=4326205933&rwl=False&p=&ext=&w=614&h=460&t=&lp=&c=True&wt=False&sz=Max&rt=0&checksum=LfPvtNsn%2bRPkTxxY45H4VcrUI49ZutZ2vu3WMvGZiPw%3d)

## The look

- **Keep from the IntelliView 12:**
  - the structure: status bar, main area, control column, tabs;
  - dark blue, white and yellow;
  - big numbers, ✓ states, icon toolbars on the map's edge.
- **Modernise:**
  - generous spacing and a clear type scale;
  - softer radii and subtle elevation instead of bevels and grid lines;
  - one colour per state (ok, warn, alarm, on);
  - short transitions;
  - gauges as clean arcs or bars, not dials;
  - one icon weight throughout;
  - night as a palette of its own, not an inversion.
- **Controls first:** game controls are the main content of the chrome, as
  a button grid that reflows to its width. Speed, fuel and the other values
  are a slim readout in the tab bar.
- **One look per state** ([specs/0010](../specs/0010-tidy-states-and-motion.md)):
  a lit fill only ever means "on"; lift only on what you can press or what
  floats; readouts and cards are flat. The values are under Palettes, Depth
  and Motion.
- **Calm** ([specs/0013](../specs/0013-vehicle-screen-calm.md)): every part
  of a page has one job, the tractor's numbers stay in the bottom bar, and
  the night palette has no yellow.
- **Readable in a cab:** values readable at arm's length, WCAG AA contrast
  in both palettes, and touch targets of at least 44 px.
- **Light on older tablets:** no blur, and `prefers-reduced-motion`
  respected.

## Layout

The regular layout, for tablets:

```
┌──────────────────────────────── status bar ─────────────────────────────────┐
│ ⚙ Settings  map · ⚠ alerts    ( Spring · Day 6 · 09:44 )    ☁ 20°C  $  ◉  ⛶ │
├────────────────────────────────────────────────────────────┬────────────────┤
│                                                            │ LIGHTS         │
│                        main area                           │ ▢ ▢ ▢          │
│              the selected screen fills it                  │ ▢ ▢ ▢          │
│                                                            │ DRIVE          │
│   Map: the map, with a toolbar on its edge                 │ ▢ ▢ ▢          │
│   Vehicle: the rig strip, the tool cards, the field panel  │ ▢ ▢            │
├────────────────────────────────────────────────────────────┴────────────────┤
│  [ MAP ]  [ VEHICLE ▾ ]            speed · gear · fuel · …   (the readout)  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Status bar:** the Settings button, the map's name and the alerts (low
  fuel, hot engine, wear); the season, day and time in a centre pill;
  weather and temperature, money, the connection to the game (live,
  waiting or offline) and the full-screen button.
- **Control column:** labelled groups of buttons, the same on every
  screen: Lights (Lights, High beam, Beacon, Hazard, Turn L, Turn R) and
  Drive (Cruise −, Cruise, Cruise +, Engine, AI worker, Attach: two rows
  of three, [spec 0016](../specs/0016-attach.md)). The Vehicle page
  adds All tools with two working tools or more.
- **Tab bar:** one tab per screen, designed for up to seven like the real
  terminal. Every tab shows its icon and label whenever they fit; only
  when the bar runs out of room (compact) do the unselected tabs drop to
  icons. The rest of the bar is the readout: the tractor's numbers for the
  screen that shows (see Layout grid).
- **Compact** (narrower than 900 px, or portrait): the same status bar and
  tab bar; the screen on top, then the control groups docked under it,
  side by side.
- **Wide** (1600 px and up): the main area grows. Each tab stays one
  screen; Map and Vehicle side by side was tried and turned down.

## Screens

### Map

The map fills the main area, whatever its shape, beside the control
column. A toolbar floats on its left edge (zoom in and out; recentre,
which follows; whole map; layers), the Layers panel opens beside it, the
land panel sits top-right and a metric scale bottom-right. The tab bar's
readout: speed, gear, rpm, fuel, engine temperature, fuel usage and, while
cruise control holds one, its speed.

### The Vehicle tab

One tab, three pages: **Vehicle**, **Loader** and **Harvester**. The tab
picks the page from what you drive (Settings, "Screen for what I drive",
on by default), and its menu picks one by hand; the tab names its page.

#### Vehicle page

After the canvas
[FS25 Companion: Vehicle screen, calm](https://claude.ai/artifact/JApsdXjoSFwsddKv2kNYZ3)
(approved 2026-11-03). Behaviour, data and checks:
[specs/0013](../specs/0013-vehicle-screen-calm.md), and
[specs/0003](../specs/0003-implement-screen.md) for the cards.

- **Layout:** the rig strip across the top, on the ground; under it the
  tool cards (as tall as their content), and on the right Also attached's
  chips over the field panel (revision 7; with no card they top the tools
  column, with three cards they sit under them); the column as on every screen, with
  an All tools group under Drive for two working tools or more. Three
  working tools or more: no field panel, the cards in spec 0003's grid.
- **Strip:** tiles on a card's surface with lift, sharing the width; the
  game's selected tool is where you are (a tint and a 2 px ring). Links
  are a line with a neutral chip, dashed while raised; on a long rig the
  chip goes (a 24 px line, tiles down to 120), past that it scrolls with a
  fade at the edge.
- **Also attached:** no title; a chip per tool, 320 × 66, the model (15 px
  bold) and its line (12 px muted), its buttons 48 × 48, icon only.
- **Cards:** the badge (outlined while working by day, steel at night),
  the model, the line under it; the stats on small quiet tiles; the tanks
  with an 8 px meter; the section strip in the muted and line colours;
  buttons 84 × 80, More the row's last.
- **Field panel** (revision 2, 2026-11-07: no map image, for speed): the
  field's outline in the muted colour on the card, the view fixed to the
  field; the trail in solid `--trail-work` green (`--trail-mow` pale
  yellow for mowers) under it; the rig as a dark dot with a white ring and
  a heading arrow, a sprayer's boom; then the field's number, area, crop,
  stage bar, needs as chips and "This run ≈ 54 % of the field".
  Revision 3: only your fields, and "Not on your field" past the view's
  margin; a band per work area, so a butterfly mower draws two wings.
  Revision 4: with Precision Farming's nozzles, the trail, the boom and the
  card's section strip show what sprays.
- **Bottom bar:** the tractor's numbers, as on the Map screen.
- **Compact:** one column, the strip scrolling sideways, the cards, the
  field panel 240 tall (the outline beside the rows), the column docked under.

#### Tool cards

A card per tool on the Vehicle page
([specs/0012](../specs/0012-card-buttons.md) for its buttons,
[specs/0011](../specs/0011-sprayer.md) for a sprayer's section strip).

- **Buttons:** a fixed list, read from what the tool is, and only faded by
  the game's "not now"; a button never comes or goes. A label says what a
  tap will do ("Lower" / "Raise", "Unfold" / "Fold"). A press that failed
  says "Failed" on its button, nowhere else.
- **More:** the main row's last button, **More · n** (how many are under
  it, a chevron), lit while open. Open, its buttons are a lower row
  (64 px) under the main row, and the card shows its compact body (no
  stats, the main tank's meter alone) so they fit at 1180 × 820. Compact
  cards keep More's button, faded.
- **Tanks:** a meter per fill unit with its litres and a time estimate,
  shown as "≈" and hidden while the rate is unsteady. The tank that runs
  out first gets a "Runs out first" chip, a tank filling up "Call a
  trailer".
- **The weight limit** (the game's Trailer Fill Limit): a fill bar is
  shaded past the limit with a tick where it stops, and a lock + MAX badge
  sits beside the level once it's reached.
- **The hitch icon** is traced from the game's Attach Tool prompt (a bar
  into a ball, a thick ring open towards it), filled.

#### Loader page

For yard work with a loader, after the canvas
[FS25 Companion: Vehicle screen](https://claude.ai/artifact/UCGXbQrd4gTozRk67NcnWw).
Behaviour, data and checks: [specs/0002](../specs/0002-vehicle-screen.md).

- **Layout:** the rig strip over the Load card and the Target card, side
  by side; Load takes the full width when no Target shows. The column and
  the bottom bar are the Vehicle page's.
- **Rig strip:** the rig's tiles in driving order, joined by links: a line
  with a chip naming the coupling, solid while the tool is lowered, dashed
  while raised.
- **Cards:** Load: the load in 24 px type with its litres and tonnes, a
  big meter for a bucket, then This session with Reset (a column-style
  button). Target: badge, name, category and distance, "≈ n more loads"
  in the accent colour, the unit's meter and the weight meter; dimmed out
  of range; a green Full chip.
- **Compact:** one column, the strip scrolls sideways, Target under Load,
  the column docked under them.

#### Harvester page

For a combine, after the canvases
[FS25 Companion: Harvester screen](https://claude.ai/artifact/7arT5R4WwC9qJTTi3i99aL)
and
[FS25 Companion: Harvester with field panel](https://claude.ai/artifact/AK7xCVArrBaBXyhMWf2gT9).
Behaviour, data and checks: [specs/0001](../specs/0001-harvester-screen.md).
Combines first; forage, beet, potato and cotton harvesters later, once
their keys are seen in game.

- **Layout:** a band in the content area (the job; tank %, until full,
  yield, speed against the limit), then the Combine card (grain tank,
  Thresher / Pipe / Straw tiles, Yield, Throughput, This run, Total, wear)
  beside the Header card over the field panel. The grid's rows are
  88 | auto | 1fr: the Combine card spans both lower rows; on the right
  the Header card at its content's height (about 256 px) over the field
  panel (about 310, its map about 190). The column: Lights and Drive.
- **Tiles:** the combine's and the header's buttons are state tiles on
  their cards: the caption, the icon, the state in big type; lit when on.
- **Header card:** compact: the lift on one line (caption, state, bar),
  the Header and Fold tiles 80 tall (`.control-tiles[data-short]`),
  Width / Limit / Wear as small stat tiles like the tool cards'.
- **Field panel:** the Vehicle page's in its compact variant: no Needs
  row.
- **Call a trailer:** the meter turns orange, the chip shows and the
  band's "until full" turns orange and pulses.
- **Narrow screens:** one column, the panel 240 tall after the Header
  card.

## The map in themes

- **Any shape:** a map slot can be any rectangle: tall, wide or square.
  `constrainTo` and `coverZoom` in `map/mapView.js` fit any box: the
  playable area covers the slot, and you pan along the long side.
- **Edge toolbar:** zoom, recentre, whole map and layers are a vertical
  icon toolbar on the map's edge. Popups keep clear of it (76 px), and the
  land panel drops to the bottom-right corner when a popup would cover it.
- **Slot zoom:** the smaller the slot, the closer the default zoom, centred
  on the player or vehicle with follow on.
  - A pure `defaultZoom({x, y})` takes the slot's short side `s` and shows a
    span of `clamp(s² / 900, 80 m, whole map)` across it.
  - That's about 100 m across a 300 px mini-map, and about 1.1 km across a
    1000 px main area; about 505 m across the Map screen at 1180×820.
  - It never goes below the cover zoom.
- **Your zoom wins:**
  - You can zoom and pan any map slot.
  - Each slot remembers your zoom and whether follow is on.
  - Recentre turns follow on and goes back to the slot's default zoom.
  - When a slot changes size (rotation, window resize), it moves to the new
    default zoom, unless you zoomed by hand.
- **Small slots,** with a short side under about 400 px (none today; for
  later screens or a compact layout):
  - they keep zoom, pan and recentre, plus a button that opens the spot on
    the Map screen;
  - no Layers panel, land panel or popups, since those would cover the
    whole slot.
- **One map frame:**
  - There is one Leaflet map, with all layers, the legend, popups and the
    land panel. Its frame moves into the visible screen's map slot.
  - Rule: at most one map slot is visible at a time.
  - After every move the map re-measures itself, never while hidden.
- **Map colours** (hotspots, farmland shading, crops, vehicle markers) are
  the same in every theme and palette, so the map always reads like the
  PDA.

## Icons

- **Our own set.** Every icon is an SVG we draw and ship with the
  dashboard. Nothing is read from the game for icons.
  - **Why:** the goal is an installer that touches as little of the user's
    computer as it can. One look everywhere (live, replay, macOS), nothing
    written to disk, nothing to load, and no question about showing game
    artwork. The icons are ours, under the project's licence.
  - **What it costs:** the exact cab glyphs. Ours follow the same
    conventions (ISO 7000 and cab warning-light symbols are standard
    shapes), drawn from scratch, never traced from game textures. The one
    exception is the hitch icon, traced from the game's Attach Tool
    prompt.
- **Style:**
  - drawn on a 24 × 24 grid and scaled freely (28 px in controls);
  - 2 px strokes, round caps and joins, 2 px corner radius, solid fills
    only where the symbol needs a mass (fuel drop, battery);
  - one colour: `stroke` and `fill` use `currentColor`, so a theme colours
    an icon with CSS `color` (white on blue, ink on the yellow badge, OK /
    warn / alarm for states);
  - shapes follow the ISO 7000 / cab symbols (PTO, engine, coolant,
    warning triangle, area worked), simplified to the stroke style;
  - mirrored pairs (turn left / right, hitch up / down) are one drawing
    with a transform.
- **In code:** `web/src/ui/icons.js` holds the path data and exports
  `icon(name, {title})`, which returns an inline `<svg>` (`aria-hidden`
  unless it has a title). No sprite file, no fetch, so it works offline on
  a LAN. An unknown name returns an empty placeholder of the same size and
  logs once, so a layout never moves.
- **The set:** 81 icons, listed by group in `ICON_GROUPS`.
- **Contact sheet:** `web/tools/icons.html` shows every icon at 16, 26 and
  48 px, in both palettes, on a card and in a badge, and in context (the
  status bar, the map toolbar, the tab bar, the control column). It's how
  icons are reviewed before a screen uses them.

## Controls

- **Component:** `web/src/ui/control.js`, an icon button with four states:
  off, on, pending and unavailable. Their looks are under Palettes.
- **What it shows:** the game's state, from the `cab` topic. A press shows
  pending on touch-down, then the game's state once the answer is in; a
  press that failed says "Failed" on the button.
- **Steps and values:** the lights' stages show as dots under the label,
  one per stage the vehicle has, lit up to the current one; Cruise shows
  its set speed.
- **Cruise −, Cruise and Cruise +** always sit together, in that order.
- **One control per action:** nothing on screen at once offers the same
  action twice (the ground rules in [ARCHITECTURE.md](ARCHITECTURE.md#ground-rules)).

## Settings

- **Settings entry:** the same in every theme: a "Settings" button with
  the sliders icon, top-left in the status bar. The same button opens and
  closes the panel (shown pressed while open); the panel has no close
  button and sits in the main area, under the status bar, never over it.
  The backdrop and Escape close it too.
- **The panel:** Theme cards with layout thumbnails and the theme's note;
  Day / Night, applied at once; then Screen: Full screen, Keep screen on
  and "Screen for what I drive". Settings also shows the controls' round
  trip (tap to the game's answer).
- Choosing a theme saves it and reloads the page.

## Design system

The design system
[FS25 Companion](https://claude.ai/artifact/LBCPbVhewCFvKcYyEFE9GH)
(private, on claude.ai) is what new canvases are built from: the tokens of
both palettes, Archivo, the 81 icons of `web/src/ui/icons.js`, and the
shared parts as components (`Screen`, status bar, tab bar, control column
and groups, cards, readout card, rig tiles and links, tool cards, chips, meters).
The code stays the source of truth: **when `theme.css`, `icons.js` or the
values in this section change, refresh the design system in the same
change.** Built from commit `0ccf814`; refreshed for specs/0010 (2026-11-01) and specs/0013 (2026-11-07: the night palette, "on", where you are, working badges, the rig on the ground; revision 2's trail tokens) and for the tool card (2026-11-08: seven icons, 81 now; `ToolCard` with More, its open row and the width row of specs/0011 and 0012; no selected tint on the card).

### Type

- **Font:** Archivo (OFL), weights 400, 500, 600 and 700, self-hosted in
  `web/vendor/fonts/`. Live values use tabular numerals.
- **Scale (px):**

  | Size | Use |
  |---|---|
  | 88 | Hero speed (Vehicle screen; 80 in narrower columns) |
  | 36 | Gear box |
  | 32 | Condition tile values |
  | 24–26 | Engine rpm on the readout card |
  | 22 | Panel titles (Settings) |
  | 18 | Tab-bar readout values, vehicle name |
  | 16 | Card titles (field, implement, theme) |
  | 15 | Status bar, tab labels |
  | 14 | Body rows |
  | 13 | Secondary text, units, notes; control labels (specs/0010) |
  | 12 | Section labels in capitals with 0.08 em spacing |
  | 11 | Small tags |

### Palettes

Gradients run top to bottom unless noted. "Ink" is the dark text on yellow.
The night palette is spec 0013's (2026-11-07): darker, less blue, and no
yellow ([specs/0013](../specs/0013-vehicle-screen-calm.md)).

| Token | Day | Night |
|---|---|---|
| Bar (status bar), tab bar | `#154091 → #0C2D6B` (tab bar `#FFFFFF → #F4F7FC`) | `#0B1120 → #070B14` |
| Ground | `#F4F7FC → #E3EAF5` | `#0C121E → #070B13` |
| Card | `#FFFFFF → #F2F6FC` (flat `#FFFFFF`) | `#141C2C → #101727` (flat `#121A29`) |
| Button (off), map toolbar | `#FFFFFF → #EEF3FA` | `#1A2438 → #131B2C` |
| Pill (status bar) | `#1A3F85` | `#161F31` |
| Readout card (the Harvester's band) | `160deg #1B4A9E → #0C2D6B` | `160deg #18223A → #0F1626` |
| Border | `#D2DCEC` | `#273349` |
| Line, meter track | `#E3EAF5` | `#1D2638` |
| Text | `#0D1B33` | `#E8EDF5` |
| Muted text (6.7:1 on a night card) | `#55627A` | `#97A3B9` |
| Bar text, muted | `#FFFFFF`, `#BFD0EE` | `#E8EDF5`, `#97A3B9` |
| On (controls) | an outline: the button's surface, edge and ink `#0C4DB8`, a 14 % tint of it inside | steel `#4B5A78 → #3C4966`, white ink, edge `#62739A` |
| Working badge | outlined in `#0C4DB8` (1.5 px), no fill | the steel fill, white ink |
| Where you are (selected tab, the strip's selected tool, recentre while following, Layers open, the tab's menu) | tint `#DFE8F7`, 2 px ring `#0C4DB8`, ink `#0C2D6B` | tint `rgba(255,255,255,0.07)`, 2 px ring `#C9D4E8`, white ink |
| Settings button while open | `#FFFFFF`, text `#0C4DB8` | the steel fill, white ink |
| Icon badge (field numbers, the Harvester's readout badge, a tank's chip) | `#FFD65C → #FFC72C`, ink | the steel fill, white ink |
| Badge (idle) | `#E8EEF7 → #D2DCEC` | `#222C40 → #1B2436` |
| Chip (on) | `#E6EEFB`, `#0C4DB8` | `#1D2638`, `#A9C3F2` |
| Accent text, the farmland badge's text | `#0C4DB8`, `#FFC72C` | the muted colour |
| OK | `#12804A` (fill `#23A262 → #12804A`) | `#42D392` (fill `#4FE09C → #2DB876`) |
| Warn | `#A15800` (fill `#FFB648 → #E58A00`) | `#FFB648` |
| Alarm | `#C42B2B` | `#FF7070` |
| Live dot | `#4ADE80` | `#4ADE80` |
| Backdrop behind a panel | `rgba(4,17,42,0.45)` | `rgba(0,0,0,0.55)` |
| Map overlays (scale, labels) | white glass `rgba(255,255,255,0.85)` | dark glass `rgba(7,11,19,0.82)` |

- Map colours (hotspots, fields, crops, markers) are the same in both
  palettes and every theme.
- Turn arrows use OK, Hazard uses Alarm, only while on: off they are
  neutral; on, by day they're outlined in that colour as "on" is, at night
  they fill with it (ink `#0A1A33`). A lit fill only ever means "on"
  ([specs/0010](../specs/0010-tidy-states-and-motion.md)).
- In the CSS, `--on` is the lit layer and `--on-tint` how much of it shows
  (0.14 by day, 1 at night); `--on-fill` is the same look for what's on
  and isn't a control (Settings' Screen switches, the Harvester's chips);
  `--work-badge` and its ink and ring are a working badge's.
- Unavailable controls: a flat, dashed 1.5 px outline in the muted colour,
  no fill or shadow, muted icon and label (specs/0010; was the off style
  at 45 %).
- Pending: the border takes the colour the button is going to and a faint
  tint of it breathes inside (8 % to 28 %); no ring, no glow. Selecting a
  tool has no waiting look: the game answers too fast for one.
- The game's selected tool shows on the Vehicle page's rig strip only, as
  where you are (specs/0013); its card has no selection look any more
  (specs/0010's ring went). A tap anywhere on a card still selects its
  tool.
- At night the status bar's sun takes the bar's ink, so nothing on screen
  is yellow but the Harvester's orange "until full".

### Depth

- **Lift** only on what you can press (controls, the map toolbar, column
  buttons, steps) and on what floats over the map or the screen (the map,
  field panel, popups, Layers, the tab menu); readout bands and display
  cards are flat (specs/0010). Day
  `inset 0 1px 0 #FFFFFF, 0 2px 4px rgba(12,45,107,0.10), 0 6px 14px rgba(12,45,107,0.10)`;
  night `inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 14px rgba(0,0,0,0.5)`.
- **On buttons:** by day the button's own lift (an outline); at night
  `inset 0 1px 0 rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.4)`
  (specs/0013).
- **Panels over the screen:** `0 20px 60px` at 35 % (day) or 60 % (night).
- No blur anywhere, for older tablets.

### Motion (specs/0010)

| Token | Value | Use |
|---|---|---|
| `--t-fast` | 120 ms | a press (controls and the map toolbar give to 96 %) |
| `--t-base` | 180 ms | a state changes (the lit colour fades, tabs, selection) |
| `--t-slow` | 300 ms | meters and bars |
| `--t-breathe` | 1.2 s | waiting for the game (a control's tint, other things' outline) |
| (attention) | 2 s | the Harvester's "until full" eases to a lighter orange and back |
| `--ease` | `cubic-bezier(0.2, 0.7, 0.3, 1)` | everything |

- Nothing fades its text, and nothing glows past an element's edge.
- Reduced motion: no transitions or animations; waiting keeps a still
  tint or outline.

### Radii

| px | Use |
|---|---|
| 20 | Readout card, vehicle card, Settings panel |
| 16 | Cards, tiles, control buttons, map, toolbar group |
| 14 | Gear box, small cards |
| 12 | Icon buttons, toolbar buttons |
| 9–11 | Icon badges |
| 999 | Pills, tabs, chips |

### Measurements

- **Chrome:** status bar 56; tab bar 64 with 44-tall tab pills (padding
  0 16–18, gap 6); page padding 12; gaps between areas 12.
- **Controls:** a 268-wide column; labelled groups 14 apart; 3 columns of
  80-tall buttons with 8 gaps; 28 px icons, 13 px labels (specs/0010).
- **Map:** floating toolbar of 48 buttons, top-left inside the map, 12 in
  from the edges; field panel 248 wide, top-right; scale bottom-right.
- **Vehicle page** (specs/0013): the rig strip 60 tall (tiles 56, at
  least 150 wide, links 64; slim: 120 and 24); under it the cards, and
  Also attached's chips (320 × 66, buttons 48) over the field panel 320
  wide; card buttons 84 × 80, as the column's.
- **Settings panel:** 420 wide, in the main area (12 below the status bar,
  12 above the tab bar).
- **Touch targets:** at least 44, and 48 on the map toolbar.

### Layout grid

| Size class | When | Grid |
|---|---|---|
| Regular | 900–1599 px wide, landscape | rows `56 / 1fr / 64`; main columns `1fr` and `268` |
| Wide | 1600 px and up | as regular; the map grows |
| Compact | under 900 px, or portrait | rows `56 / 1fr / 64`; main rows `1fr / auto`, the control dock in 3 columns |

- **Tab bar readout:** on the Map screen speed, gear, rpm, fuel (with a
  small bar, warn-coloured when low), engine temp, fuel usage and the
  cruise speed; on the Vehicle and Loader pages (specs/0013) speed, gear,
  fuel, DEF, wear ("23 % wear") and engine temp. When space runs out,
  drop temp, then gear.
- **Tab labels:** shown whenever they fit (see Tab bar).

## Responsive

- **No standard tablet size.** Sizes in CSS pixels, landscape:

  | Device | Size |
  |---|---|
  | iPad mini | 1133×744 |
  | iPad 10.9" | 1180×820 |
  | iPad Pro 11" | 1194×834 |
  | iPad Pro 13" | 1376×1032 |
  | Android 16:10 tablets | about 1280×800 |
  | Monitors | 1366×768 up to 2560×1440, ultrawide 3440×1440 |

  Aspect ratios run from 4:3 to 21:9.
- **Fluid, not fixed:**
  - a CSS grid for the chrome;
  - `clamp()` for column widths and type;
  - container queries so each area adapts to its own size (tiles reflow,
    tabs go icon-only when narrow);
  - the map fills whatever box it gets.
- **Size classes, not devices:** compact below 900 px or portrait; regular
  for tablets; wide from 1600 px.
- **Browser bars:** a tablet browser's own bars take up part of the height
  (`dvh`, plus safe areas for the iPad home indicator). So:
  - **Full screen** (`ui/screenMode.js`): a button at the status bar's
    right end and a toggle in Settings, where the browser has full screen
    (not on iPhones, nor in the home-screen app, which has no bars
    anyway). Browsers leave full screen when the page reloads.
  - **Home screen** (`web/manifest.json`): on an iPad, Safari's Share →
    Add to Home Screen opens the dashboard without bars, on the LAN
    address too. Chrome on Android needs HTTPS or localhost for that; on
    the LAN it adds a plain shortcut.
  - **Keep screen on** (Settings): only on a secure page, `localhost` or
    HTTPS. A tablet on `http://<PC IP>:8123` doesn't get it; there the
    device's own auto-lock setting is the way.
  - **Safe areas:** the status bar and the tab bar grow into the iPad's
    status bar and home indicator, with their content kept clear.
- **Sizes checked,** each in day and night, with the Solek replay:
  1024×600, 1024×768, 1133×744, 1180×820 (the reference), 1194×834,
  1280×800, 1280×720, 1366×768, 1376×1032, 1920×1080, 2560×1440,
  3440×1440, 768×1024, 800×1280, 820×1180, 844×390 and 390×844. Nothing
  overflows, there's no horizontal scroll, and no button is under 44 px.
- **Input:** touch and mouse both work everywhere.
- **Browsers:** Safari 16+ (iPadOS 16), Chrome/Edge 110+ and Firefox 110+.
  They all support container queries, `dvh` and `:has`.

## How a theme is built

- **A theme is data** (`web/src/themes/<id>/theme.js`), drawn by the one
  renderer, `themes/render.js`:
  - `id`, `label`, `note`, `palettes`, `css`;
  - `chrome`: the status bar's widgets (`start`, `centre`, `end`) and the
    control groups;
  - `screens`: each with an `id`, `label`, `icon`, its `slots` and its
    `readout` for the tab bar. A slot is the map (`{map}`), a widget (its
    id, or `{widget, variant}`), a group of slots (`{group, slots}`, for
    the theme's CSS grid) or the control column (`{controls: true}`, with
    `add` for a group of its own). A screen may share another's tab
    (`tab`), name itself in the tab's menu (`choice`) and say when the tab
    picks it (`when`).
- `checkTheme()` reports unknown widgets, controls and icons, and a screen
  with more than one map slot. Screens are built once and switched with
  `hidden`.
- **CSS:** `themes/<id>/theme.css` holds the day palette on `:root` and
  the night palette under `[data-palette="night"]`, with a grid per size
  class. Only the active theme's CSS is loaded.
- **Widgets** (`web/src/widgets/`, listed by id in `index.js`): each takes
  the store and a variant and returns an element; the variants differ
  in markup only, and themes style them. A widget hides itself when its
  data is missing. **Selectors** (`web/src/data/selectors.js`) are the
  pure reads of the store they share.
- **Which theme:** the URL wins (`?theme=newholland&palette=night`, for
  bookmarks), then the device's saved choice, then the first theme in
  `registry.js`. Switching theme reloads the page.
- **Saved per device** (localStorage, every read and write through
  try/catch): `fs25companion.theme`, `.palette`, `.screen` (the last
  screen, per theme), `.mapSlots` (zoom and follow per theme and slot),
  `.legend` (the layers shown), `.keepAwake`, `.autoPick` (Screen for what
  I drive) and `.moreOpen` (the tool cards whose More is open).
- **Fonts:** Archivo, self-hosted in `web/vendor/fonts/`, never a CDN,
  because the dashboard may run on a LAN without internet.
- **A new theme** is a folder under `themes/` added to `THEMES` in
  `registry.js`, plus a design pass.

## Later

- **More screens** (brainstorm, 2026-10-24): four more tabs beside Map and
  Vehicle; the tab bar has room for seven. Not designed yet. Suggested
  order:
  1. **Fields:** the fields as a to-do list: crop, growth stage, ready to
     harvest, and what each needs (lime, fertiliser, plough, weeds,
     rolling), most urgent first; tap one to see it on the Map. The
     weather forecast and a crop calendar live here too. Needs no new mod
     data: the `fields` and `crop_types` topics have it.
  2. **Farm:** money and finances (loan, income and costs today and this
     year), what's in the silos and storage, and the market: where each
     crop sells best and what the stock is worth there. Needs the
     `prices` topic (PLAN.md, Later) and a storage and finance topic.
  3. **Work:** hired workers and contracts side by side: job, progress,
     time left, reward or hourly cost; plus vehicles that need fuel or
     repair. Workers are partly sent already; contracts, and fuel and
     wear for vehicles not being driven, are new.
  4. **Yard:** animals and production points, the buildings that need
     feeding: headcount, food, water, straw, health and outputs to
     collect for each barn; running or not, missing inputs and full
     outputs for each production. Needs the most new mod data.
- **The shop picture** on a vehicle's card: the same picture the in-game
  shop shows. Each vehicle's XML names its store image in
  `<storeData><image>`, shipped as a `.dds` next to the XML (base game
  `data/vehicles/newHolland/t7/store_t7.dds`; mod `FS25_volvoL90.zip` →
  `vehicles/volvo/l90/store_l90.dds`). It waits because it would be the
  only thing besides the map overview that reads the game install for
  images: one more read, conversion and cache. Paid DLCs are encrypted
  and a mod may have none, so the card must work without it. Like the
  overview, a picture would come from the user's own install and never be
  committed.
- **Layout editing.**
- **More brands:** Fendt FendtONE, John Deere G5, Massey Ferguson
  Datatronic, Case IH AFS Pro, CLAAS CEMIS. Each is a theme folder plus a
  design pass.
