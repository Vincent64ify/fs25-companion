# Themes and layouts

> **Status:** plan accepted on 2026-10-22; T0 (design) done on 2026-10-23,
> see "Design result (T0)"; T1 (foundation) done on 2026-10-23, see "As
> built (T1)"; T2 (our icon set) done on 2026-10-23, see "As built (T2)";
> T3 (New Holland chrome and Map screen) done on 2026-10-23, see "As built
> (T3)"; T4 (Vehicle screen) done on 2026-10-23, see "As built (T4)"; T5
> (responsive pass, full screen, home screen) done on 2026-10-23, see "As
> built (T5)"; T6 (more data from the game) built on 2026-10-24, see "As
> built (T6)", and waiting for a live check.

## Goal

The user chooses how the dashboard looks. A theme recreates the in-cab
terminal of a tractor brand (layout, colours, feel) with a modern finish.
- **First theme:** New Holland style, after the IntelliView 12.
- **Default theme:** today's dashboard, which stays exactly as it is.

## Words used in this plan

| Word | Meaning |
|---|---|
| Theme | A complete look: chrome, screens, palettes. "Default", "New Holland style". |
| Palette | A theme's colours for day or for night. |
| Size class | compact, regular or wide. Layouts adapt to the screen's size, not to a device model. |
| Chrome | The parts around the screens: status bar, value column, control column, tab bar. |
| Screen | One page of the terminal, picked with a tab (the IntelliView's "run screens"): Map, Vehicle. |
| Slot | A place in the chrome or on a screen that holds a widget, a control or the map. |
| Widget | A live value or list: speed, fuel, implements, clock... |
| Control | A button for a game action. It shows state only until the "control the game" project wires it. |
| Map frame | The one Leaflet map plus its overlays (field panel, notes), moved into whichever map slot is visible. |

## Decisions

| Topic | Decision |
|---|---|
| Default theme | Today's layout, unchanged. Its only addition is a small Settings button at the header's left, which arrives with the second theme. |
| Settings entry | The same in every theme: a "Settings" button with the sliders icon, top-left, opening a panel that starts with Theme. The same button opens and closes it (shown pressed while open); the panel has no close button and sits in the main area, under the header, never over it (T0 review). |
| First theme | New Holland style, based on the IntelliView 12 (T7 LWB, T7 HD, T8, T9). |
| Naming | Brand + "style" in the selector, with the note "Inspired by the IntelliView 12. Not affiliated with New Holland." No logos, emblems or official artwork. Internal id: `newholland`. |
| What a theme changes | Everything: its own chrome and screens, not just colours. |
| Screens (v1) | Map and Vehicle. Implements, Fields and Farm screens come later. |
| Customising | Fixed layouts now. Layouts are stored as data, so an edit mode can come later. |
| Night mode | A manual Day / Night switch, saved per device. Nothing switches by itself. |
| Targets | Landscape tablets of any brand and second PC monitors. Phones keep working (compact class) but aren't a design target. |
| Look | Modern first. The IntelliView 12 gives the structure, colours and feel; dated parts are modernised. |
| Controls | Every theme reserves a control column now. |
| Icons | Our own SVG set, drawn in the cab-symbol style. Nothing is extracted from the game for icons (changed from "game first" on 2026-10-23; see Icons). |
| Design tool | Claude Design, before any theme code. |
| Theme choice | Per device (localStorage), with a URL override for bookmarks. |

## Out of scope

These are left out of this project:
- Wiring controls to the game: that's the separate "control the game"
  project. This one only shows their state.
- Guidance lines, ISOBUS implement screens, camera feeds.
- Implements, Fields and Farm screens; layout editing; other brands. All of
  these are under **Later**.
- A light palette for the Default theme.

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

## The New Holland style

### Regular layout (tablets)

```
┌──────────────────────────────── status bar ─────────────────────────────────┐
│ ⚙  ⚠ alerts          ( Day 6 · 09:44 )          ☁ 20°C   $999,999   ◉ live │
├───────────┬────────────────────────────────────────────────┬────────────────┤
│ value     │                                                │ controls       │
│ column    │                 main area                      │ (state only)   │
│           │        the selected screen fills it            │                │
│ speed     │                                                │ lights         │
│ gear      │   Map screen: the map in any shape, with a     │ high beam      │
│ rpm       │   toolbar on its edge (zoom, recentre,         │ beacon         │
│ fuel      │   whole map, layers)                           │ hazard         │
│ temp      │                                                │ implement ↓/↑  │
│ wear      │                                                │ implement on   │
├───────────┴────────────────────────────────────────────────┴────────────────┤
│   [ MAP ]   [ VEHICLE ]                                    room for 7 tabs  │
└─────────────────────────────────────────────────────────────────────────────┘
```

- **Status bar:**
  - a settings button, which opens a sheet with the theme and Day / Night;
  - alerts (low fuel, hot engine), from data we already have;
  - the in-game day and time in a centre pill;
  - weather and temperature, and money;
  - the connection to the game (live, waiting or offline), in the place of
    the terminal's signal icons.
- **Value column:** big-number tiles, each with an icon, label, value and
  unit.
- **Control column:** the control zone (see Controls).
- **Tab bar:** one tab per screen. It's designed for up to seven, like the
  real terminal; v1 has two.
  - Every tab shows its icon and label whenever they fit. Only when the bar
    runs out of room (compact) do the unselected tabs drop to icons; the
    selected one keeps its label (T0 review).

### Screens (v1)

- **Map:** the map fills the main area, whatever its shape. The field panel
  and farmland popups work as today.
- **Vehicle:**
  - an InfoView-style hero readout of speed, rpm and gear;
  - condition tiles: fuel, engine temp, wear, hours;
  - the attached implements, each lowered or raised, on or off, and its
    wear;
  - the vehicle card: its shop picture, name and brand, and a button that
    shows it on the Map screen. No mini-map: at that size it was too small
    to be useful (T0 review).
  - every tab shows its icon and label here, since this screen has no
    tab-bar readout.

### Compact and wide

- **Compact** (narrower than 900 px, or portrait):
  - the same status bar and tab bar;
  - the map on top, then a control dock under it with the three groups
    (Lights, Drive, Implement) side by side;
  - unselected tabs drop to icons, and the readout keeps speed, rpm and
    fuel.
- **Wide** (1600 px and up): the main area grows. Each tab stays one
  screen: the Map tab is the map and the controls, and Vehicle keeps its
  own tab. Showing Map and Vehicle side by side was tried in T0 and
  turned down.

## The map in themes

- **Default:** unchanged. It keeps the square box, the corner buttons, and
  today's follow zoom.
- **Any shape:** in the New Holland style, a map slot can be any rectangle:
  tall, wide or square.
  - `constrainTo` and `coverZoom` in `map/mapView.js` already fit any box:
    the playable area covers the slot, and you pan along the long side.
  - The square-box CSS (`#map-wrap` aspect-ratio) moves into the Default
    theme's CSS.
- **Edge toolbar:** zoom, recentre, whole map and layers become a vertical
  icon toolbar on the map's edge.
- **Slot zoom:** the smaller the slot, the closer the default zoom, centred
  on the player or vehicle with follow on.
  - A pure `defaultZoom({x, y})` takes the slot's short side `s` and shows a
    span of `clamp(s² / 900, 80 m, whole map)` across it.
  - That's about 100 m across a 300 px mini-map, and about 1.1 km across a
    1000 px main area.
  - It never goes below the cover zoom. T4 kept the numbers: with no
    mini-map, the only slot is the Map screen's (about 505 m across at
    1180×820). Whether that's close enough in a cab is checked in game.
- **Your zoom wins:**
  - You can zoom and pan any map slot.
  - Each slot remembers your zoom and whether follow is on.
  - Recentre turns follow on and goes back to the slot's default zoom.
  - When a slot changes size (rotation, window resize), it moves to the new
    default zoom, unless you zoomed by hand.
- **Small slots,** with a short side under about 400 px (none in v1; for
  later screens or a compact layout):
  - they keep zoom, pan and recentre, plus a button that opens the spot on
    the Map screen;
  - no Layers panel, field panel or popups, since those would cover the
    whole slot.
- **One map frame:**
  - There is one Leaflet map, with all layers, the legend, popups and the
    field panel. Its frame moves into the visible screen's map slot.
  - Rule: at most one map slot is visible at a time.
  - After every move, the map re-measures itself (`invalidateSize`).

## Icons

- **Our own set, decided 2026-10-23.** Every icon is an SVG we draw and
  ship with the dashboard. Nothing is read from the game for icons.
  - **Why:** the goal is an installer that touches as little of the user's
    computer as it can. Extracting the game's symbol sheet meant a DDS
    crop, a sprite, a cache on disk, an upload and an `icon_assets`
    message, all to save drawing 24 glyphs. The SVG fallback had to cover
    every icon anyway (macOS, replay), so the game sprite only added a
    second look to keep in step.
  - **What it gives:** one look everywhere (live, replay, macOS, hosted
    relay), nothing written to disk, nothing uploaded, no request to load
    icons, and no question about showing game artwork. The icons are ours,
    under the project's licence.
  - **What it costs:** the exact cab glyphs. Ours follow the same
    conventions (ISO 7000 and cab warning-light symbols are standard
    shapes), drawn from scratch, never traced from game textures.
  - T0 checked the game's sheets: `dashboardSymbols_diffuse.dds` is about
    110 white masks on a 128 px grid, and the HUD and key glyphs are inside
    the encrypted `dataS.gar`. The 24-icon map written from it,
    `client/icon_atlas.json`, is removed in T2.
- **Style:**
  - drawn on a 24 × 24 grid, shown at 26 px in controls (T0
    measurements) and scaled freely;
  - 2 px strokes, round caps and joins, 2 px corner radius, solid fills
    only where the symbol needs a mass (fuel drop, battery);
  - one colour: `stroke` and `fill` use `currentColor`, so a theme colours
    an icon with CSS `color` (white on blue, ink on the yellow badge, OK /
    warn / alarm for states);
  - mirrored pairs (turn left / right, hitch up / down) are one drawing
    with a transform.
- **In code:** `web/src/ui/icons.js` holds the path data and exports
  `icon(name, {title})`, which returns an inline `<svg>` (`aria-hidden`
  unless it has a title). No sprite file, no fetch, so it works offline on
  a LAN. An unknown name returns an empty placeholder of the same size and
  logs once, so a layout never moves.
- **First icon set** (49):
  - **Vehicle:** speed, rpm, gear, diesel, electric charge, methane, engine,
    engine temperature, wear, hours, position, tractor.
  - **Controls:** lights, high beam, beacon, hazard, turn left / right,
    cruise control, PTO, hitch up / down, implement on, AI worker, engine
    on.
  - **Alerts:** warning, battery, oil, check engine, frost.
  - **Status bar:** clock, day, season, sun, cloudy, rain, fog, storm,
    temperature, money, connection, settings, day / night.
  - **Map and tabs:** map, zoom in / out, recentre, whole map, layers.
  - **Vehicle types** (6, added in T4) for the vehicle card and the
    implement rows: harvester, loader, trailer, truck, implement, weight
    (the tractor is in Vehicle).
- **Contact sheet:** `web/tools/icons.html` shows every icon at 16, 26 and
  48 px, in both palettes, on a card and in a badge. It's how icons are
  reviewed, and the set is approved there before T3 uses it.

## Vehicle pictures

- **Where:** the vehicle card on the Vehicle screen, beside the readout
  card: the same picture the in-game shop shows, with the vehicle's name
  and brand. It's decoration, never needed.
- **Source:** each vehicle's XML names its store image in
  `<storeData><image>`, shipped as a `.dds` next to the XML. Checked in
  T0: base game `data/vehicles/newHolland/t7/store_t7.dds`; mod
  `FS25_volvoL90.zip` → `vehicles/volvo/l90/store_l90.dds`.
- **Decided 2026-10-23: later, not in T4.** This would be the only thing
  besides the map overview that reads the game install for images. Unlike
  icons, a shop picture can't be drawn by us, and the card works without
  one, so the pipeline below (one more read, cache and upload) waits (see
  Later). T4's card shows the vehicle's kind as a large icon, with the
  same layout, so a picture can take its place without moving anything.
- **Pipeline** (like the map overview):
  1. The mod adds the store item's image path to each vehicle (from the
     store manager, by the vehicle's config file). Today it sends only the
     name.
  2. The client reads it from the game folder or the mod's zip, converts
     DDS → PNG, hashes, caches and uploads it with the client token.
  3. The dashboard shows it when it arrives.
- **No picture:** paid DLCs are encrypted, and a mod may have none. Then
  the vehicle card keeps its place and shows a large icon for the
  vehicle's category (tractor, harvester, loader...) with the name and
  brand, so the layout doesn't move.
- **Rights:** like the overview image, pictures come from the user's own install,
  are served only by their own backend, and are never committed or
  uploaded to claude.ai.

## Controls (state only for now)

- **Component:** `web/src/ui/control.js`, an icon button with four states:
  off, on, pending, unavailable. Touch targets are at least 48 px.
- **First set,** from data the mod already sends:
  - lights, high beam, beacon, hazard, turn signals (`lights`);
  - engine on (`engineOn`);
  - implement lowered and implement on (`implements`).
- **Behaviour:** they show as indicators with no press feedback until the
  command channel exists. The controls project then wires them without
  changing the themes.

## Architecture (web)

- **Selectors** (`web/src/data/selectors.js`): pure functions moved out of
  the panels. Examples: `controlledVehicle(store)`, `fuelPct(v)`,
  `wearPct(v)`, `clock(env)`, `money(env, hello)`, `weatherName(env)`,
  `alerts(v)`.
- **Widgets** (`web/src/widgets/*.js`): one module per value or list. Each
  is `create(store, {variant})` and returns an element.
  - The variants (`row`, `tile`, `hero`, `strip`) differ in markup only;
    themes style them.
  - A widget hides itself when its data is missing.
- **Themes are data, rendered by one shared renderer**
  (`web/src/themes/render.js`):

  ```js
  // web/src/themes/newholland/theme.js
  export default {
    id: "newholland",
    label: "New Holland style",
    note: "Inspired by the IntelliView 12. Not affiliated with New Holland.",
    palettes: ["day", "night"],
    mapControls: "edge",                       // Default: "corners"
    chrome: {
      status: ["menu", "alerts", "clock", "weather", "money", "connection"],
      values: ["speed", "gear", "rpm", "fuel", "engineTemp", "wear"],
      controls: ["lights", "highBeam", "beacon", "hazard", "implementLowered", "implementOn"],
    },
    screens: [
      { id: "map", label: "Map", icon: "map", slots: [{ map: "full" }] },
      { id: "vehicle", label: "Vehicle", icon: "tractor", slots: [
        { widget: "speed", variant: "hero" }, /* ... */ { map: "mini" } ] },
    ],
  };
  ```

  - CSS lives in `themes/<id>/theme.css`, scoped to
    `[data-theme="<id>"][data-palette="day|night"]`, with a grid template
    per size class through container queries.
  - The data form is what makes a later layout editor possible.
- **Default is a theme with its own `build()`:** it recreates today's
  `index.html` markup exactly, so it can't drift. `index.html` shrinks to an
  empty `#app`.
- **Startup** (`main.js`):
  1. read the theme choice;
  2. build the chrome and screens;
  3. create the map frame in the visible map slot;
  4. add the layers, legend and follow as today;
  5. place the widgets;
  6. connect.

  Screens are built once and switched with `hidden`.
- **Split UI from logic,** so the New Holland style can put the controls on
  the map's edge:
  - `legend.js`: `buildLegend(map, layers)` returns the panel. Default wraps
    it in today's Leaflet control (same markup and classes); New Holland
    opens it from the edge toolbar.
  - `followControl.js`: the follow logic (state, `tick`, `onNewMap`, whole
    map, recentre) is separate from Default's corner buttons.
  - `createMapView(el, {zoomControl})`: New Holland draws its own zoom
    buttons.
- **Choice and persistence:**
  - localStorage keys:
    - `fs25companion.theme`: `default` or `newholland`
    - `fs25companion.palette`: `day` or `night`
    - `fs25companion.screen`: per theme
    - `fs25companion.mapSlots`: zoom and follow per theme and slot

    Every read and write goes through try/catch, as in `legend.js`.
  - The URL can override: `?theme=newholland&palette=night`, which combines
    with `?pair=` and `?backend=`.
  - Switching theme reloads the page.
- **Tokens:** move the hard-coded interface colours to tokens:
  - background, surfaces, text, muted, accent, second accent, ok, warn,
    alarm, active, border, radius, shadow, fonts;
  - Leaflet's controls and popups, the legend, the field panel.

  Default's token values are today's colours. Map colours (hotspots,
  farmland shading, crops, vehicle markers) stay the same in every theme, so
  the map always reads like the PDA.
- **Fonts:** chosen in T0. Either the system stack or a self-hosted OFL font
  in `web/vendor/fonts/`, never a CDN, because the dashboard may run on a
  LAN without internet. Live values use tabular numerals.
- **Browsers:** Safari 16+ (iPadOS 16), Chrome/Edge 110+ and Firefox 110+.
  They all support container queries, `dvh` and `:has`.

## Modern look (the design brief for T0)

- **Keep from the IntelliView 12:**
  - the structure: status bar, value column, main area, control column,
    tabs;
  - dark blue, white and yellow;
  - big-number tiles, ✓ states, icon toolbars on the map's edge.
- **Modernise:**
  - generous spacing and a clear type scale;
  - softer radii and subtle elevation instead of bevels and grid lines;
  - one colour per state (ok, warn, alarm, active);
  - short transitions;
  - gauges as clean arcs or bars, not dials;
  - one icon weight throughout;
  - night as a palette of its own, not an inversion.
- **Depth, not flat** (direction-board review, 2026-10-23): soft vertical
  gradients on surfaces, a light top highlight, a crisp edge and a real
  drop shadow; icons in colour-filled badges, like the IntelliView's menu
  cards.
- **Controls first** (same review): game controls are the main content of
  the chrome, as a button grid that reflows to its width. Speed, fuel and
  the other values are minor on the Map screen, a compact strip of chips;
  big hero numbers belong on the Vehicle screen.
- **Readable in a cab:** values readable at arm's length (hero numbers of
  40 px or more on tablets), WCAG AA contrast in both palettes, and touch
  targets of at least 48 px.
- **Light on older tablets:** no large blurs, and `prefers-reduced-motion`
  respected.
- **Check against** current car dashboards and the newest terminals
  (FendtONE, John Deere G5) for what "modern in a cab" looks like.

## Design result (T0)

Approved on 2026-10-23 in the Claude Design artifact
"FS25 Companion: NH style direction board" (private, on claude.ai). This
section is what T1 and T3 build from; the artboards are the picture.

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
  | 13 | Secondary text, units, notes |
  | 12 | Control labels; section labels in capitals with 0.08 em spacing |
  | 11 | Small tags |

### Palettes

Gradients run top to bottom unless noted. "Ink" is the dark text on yellow.

| Token | Day | Night |
|---|---|---|
| Bar (status bar) | `#154091 → #0C2D6B` | `#0A1C40 → #04112A` |
| Ground | `#F4F7FC → #E3EAF5` | `#0B2149 → #06142E` |
| Card | `#FFFFFF → #F2F6FC` | `#163370 → #0D224B` |
| Button (off), map toolbar | `#FFFFFF → #EEF3FA` | `#163370 → #0D224B` |
| Readout card | `160deg #1B4A9E → #0C2D6B` | `160deg #1A3B80 → #0D224B` |
| Border | `#D2DCEC` | `#24427C` |
| Line, meter track | `#E3EAF5` | `#1C3566` |
| Text | `#0D1B33` | `#EAF0FA` |
| Muted text | `#55627A` | `#9DB0CF` |
| Bar text, muted | `#FFFFFF`, `#BFD0EE` | `#EAF0FA`, `#9DB0CF` |
| On (controls, recentre, Working) | `#2B6BD6 → #0C4DB8`, white text | `#FFD65C → #FFC72C`, ink `#0A1A33` |
| Selected tab | `#1B4A9E → #0C2D6B`, white text | `#FFD65C → #FFC72C`, ink |
| Settings button while open | `#FFFFFF`, text `#0C4DB8` | `#FFD65C → #FFC72C`, ink |
| Icon badge | `#FFD65C → #FFC72C`, ink | the same |
| OK | `#12804A` (fill `#23A262 → #12804A`) | `#42D392` (fill `#4FE09C → #2DB876`) |
| Warn | `#A15800` (fill `#FFB648 → #E58A00`) | `#FFB648` |
| Alarm | `#C42B2B` | `#FF7070` |
| Live dot | `#4ADE80` | `#4ADE80` |
| Backdrop behind a panel | `rgba(4,17,42,0.45)` | `rgba(0,0,0,0.55)` |
| Map overlays (scale, labels) | white glass `rgba(255,255,255,0.85)` | dark glass `rgba(4,17,42,0.85)` |

- Map colours (hotspots, fields, crops, markers) are the same in both
  palettes and every theme.
- Turn arrows use OK, Hazard uses Alarm.
- Unavailable controls: the off style at 45 % opacity.

### Depth

- **Lift (cards, tiles, map, toolbar):** day
  `inset 0 1px 0 #FFFFFF, 0 2px 4px rgba(12,45,107,0.10), 0 6px 14px rgba(12,45,107,0.10)`;
  night `inset 0 1px 0 rgba(255,255,255,0.08), 0 4px 14px rgba(0,0,0,0.4)`.
- **On buttons:** day
  `inset 0 1px 0 rgba(255,255,255,0.25), 0 2px 4px rgba(12,45,107,0.18), 0 6px 14px rgba(12,45,107,0.18)`;
  night `inset 0 1px 0 rgba(255,255,255,0.45), 0 2px 10px rgba(255,199,44,0.22)`.
- **Panels over the screen:** `0 20px 60px` at 35 % (day) or 60 % (night).
- No blur anywhere, for older tablets.

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
  80-tall buttons with 8 gaps; 26 px icons, 12 px labels.
- **Map:** floating toolbar of 48 buttons, top-left inside the map, 12 in
  from the edges; field panel 248 wide, top-right; scale bottom-right.
- **Vehicle screen:** columns `1fr | 300`, rows `296 | 116 | 1fr`;
  implement rows about 68 tall.
- **Settings panel:** 420 wide, in the main area (12 below the status bar,
  12 above the tab bar).
- **Touch targets:** at least 44, and 48 on the map toolbar.

### Layout grid

| Size class | When | Grid |
|---|---|---|
| Regular | 900–1599 px wide, landscape | rows `56 / 1fr / 64`; main columns `1fr` and `268` |
| Wide | 1600 px and up | as regular; the map grows |
| Compact | under 900 px, or portrait | rows `56 / 1fr / 64`; main rows `1fr / auto`, the control dock in 3 columns |

- **Tab bar readout** (Map screen only): speed, gear, rpm, fuel (with a
  small bar, warn-coloured when low), engine temp. When space runs out,
  drop temp, then gear.
- **Tab labels:** shown whenever they fit (see Tab bar).

### Icons

- T0 mapped 24 icons to the game's dashboard symbol sheet and drew the
  rest as SVG (2 px strokes, round caps and joins). Since 2026-10-23 the
  whole set is our SVG, in the same style (see Icons).

## Responsive (tablets vary a lot)

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
  (`dvh`, plus safe areas for the iPad home indicator). In T5:
  - a fullscreen button, where the browser allows it;
  - a web-app manifest, so the dashboard can be added to the home screen
    and open without browser bars;
  - keep-awake where the browser allows it. That needs HTTPS, so not on a
    plain LAN address.
- **Input:** touch and mouse both work everywhere.

## Phases

Each phase ends with:
- tests green;
- an "As built" note in `docs/THEMES.md`;
- a commit (pushed on request).

### T0: Design in Claude Design

1. Done: this plan is `docs/THEMES.md`. PLAN.md links to it in place of the
   "Screens and themes" idea, and its controls idea is corrected (no key
   glyphs from `dataS.gar`).
2. Inspect the game's atlases locally: convert them in the scratchpad and
   look. Then write `client/icon_atlas.json`.
3. **Direction board:** two or three directions side by side, each a
   palette (day and night swatches), a type pairing, and a sample of the
   chrome (a status bar, a value tile, a control, a tab). One direction is
   picked, or parts of several are combined, before the style frame.
   Picked on 2026-10-23: **C · Deep Blue** (Archivo, soft radii, depth,
   pill tabs with icon-only inactive screens, values as a slim readout in
   the tab bar). It's a direction, not a final design: later artboards
   keep refining it.
4. **Style frame:** the Map screen at 1180×820 in the day palette, in the
   chosen direction, reviewed and revised until the look is approved.
   Approved on 2026-10-23: status bar, map with a floating edge toolbar
   and field panel, a 268 px control column in labelled groups (Lights,
   Drive, Implement), and the tab bar with the slim readout.
5. Then the Vehicle screen, the night palette, the settings sheet, and
   Default's Theme button.
   Vehicle screen approved on 2026-10-23: InfoView-style readout card
   (speed arc, gear, rpm), four condition tiles, the attached implements
   list, and the same chrome as the Map screen (no tab-bar readout on this
   screen). Revised after review: the vehicle card with its shop picture
   replaces the mini-map, and every tab shows its label.
   Night palette approved on 2026-10-23 (Map and Vehicle): deep navy
   surfaces, faint highlights and dark shadows; "on" states and the
   selected tab turn yellow with dark text; brighter state colours; map
   colours unchanged, map overlays on dark glass.
   Settings approved on 2026-10-23: the Settings panel (Theme cards with
   layout thumbnails, Day / Night switch) in the main area under the
   header, toggled by the header's Settings button; in Default, the same
   Settings button at the header's left with a small Theme panel.
6. Then the other sizes: 1280×800, compact at about 800 px wide, and
   1920×1080 (wide).
   Approved on 2026-10-23: 1280×800 and 1920×1080 keep the regular
   layout with a bigger map; compact (800×1280 portrait) docks the three
   control groups under the map.
7. Write the approved tokens, measurements and layout grid into
   `docs/THEMES.md`. Done: see "Design result (T0)".

- **How reviewing works:**
  - The artboards live in a private Claude Design artifact on claude.ai.
  - Comments on the artboards drive the revisions.
  - Each artboard is approved explicitly before code follows it.
- **Reference images:** the artifact holds links, written notes and our own
  wireframes. It holds no photos or game textures, since those belong to New
  Holland and GIANTS.
- **Done when:** a direction is picked, every artboard is approved, and `docs/THEMES.md` has the
  tokens, layouts and icon map.

### T1: Foundation (web, no visible change)

- Add selectors, widgets, the theme contract and renderer, and Default as a
  theme with its own `build()`.
- Split the legend and follow logic from their UI, move the map frame, and
  turn the colours into tokens.
- `vehiclePanel.js` and `envPanel.js` become widgets. `fieldInfoPanel.js`
  stays, placed in the map frame.
- **Done when:** Default's layout boxes and styles match the reference taken
  before T1 (see Verification), and test.html and pytest are green.

#### As built (T1)

Done on 2026-10-23. Default looks and behaves as before.
- **Startup** (`main.js`): choose the theme, set `data-theme` (and
  `data-palette`) on `<html>`, load the theme's stylesheet, build the
  theme into `#app`, then the map, its layers and the theme's map controls.
  `index.html` is an empty `#app`.
- **Theme contract** (`themes/render.js`): `id`, `label`, `note`,
  `palettes`, `mapControls` ("corners" or "edge"), `css`, then either
  `chrome` and `screens` as data or a `build(app, store, frame)` of its
  own. `checkTheme()` reports unknown widget ids and screens with more than
  one map slot. The renderer draws the status bar, value column, screens,
  an empty control column (controls come with T3) and the tab bar; it
  switches screens with `hidden` and moves the map frame. It's tested with
  a sample theme in test.html; T3 gives it its real markup.
- **Theme choice** (`themes/registry.js`): `?theme=` and `?palette=`, then
  `fs25companion.theme` and `fs25companion.palette`, then Default. Saving
  the choice comes with the Settings panel (T3).
- **Default** (`themes/default/`): `theme.js` builds the old markup from
  widgets, `theme.css` holds its layout (the square map box, header,
  cards), `mapControls.js` its corner buttons (Follow and Map, the Layers
  toggle). Only the active theme's CSS is loaded, so its selectors need no
  theme prefix.
- **Selectors** (`data/selectors.js`): `controlledVehicle`, `vehicleName`,
  `fuelPct`, `wearPct`, `engineTemp`, `operatingHours`, `implementsOf`,
  `clock`, `weatherName`, `temperatureRange`, `money`, `farmMoney`,
  `connectionStatus`. `alerts()` waits for the status bar (T3), which
  will set its thresholds.
- **Widgets** (`widgets/`): grouped by topic rather than one file per
  value: `vehicle.js` (vehicleName, speed, rpm, gear, fuel, wear,
  engineTemp, hours, position), `farm.js` (weather, temperature, clock, day,
  money, mapName, playerName), `implements.js`, `status.js` (connection,
  protocolError), all listed in `widgets/index.js`. Value widgets come from
  one `valueWidget()` with the variants `row`, `gauge`, `title` and `tile`;
  `hero` and `strip` come with T3 and T4. `whenMissing: "dash"` keeps
  Default's "–" where other themes hide the widget.
- **Map:** `map/mapFrame.js` is the frame (map, hint, field panel).
  `legend.js` builds the panel only (`buildLegend`), `followControl.js`
  is the follow logic only (`createFollow`, with `onChange`, `wholeMap`),
  and `createMapView(el, {zoomControl})` can leave out Leaflet's zoom
  buttons.
- **Tokens** (`style.css`): font, background, surface, border, text,
  muted, accent and its text, ok / warn / alarm with their fills, radii,
  shadow, map overlays, map buttons and Leaflet popups, with Default's
  values. Map colours (`--map-*`, markers, hotspots, fields) are fixed. A
  second accent waits for T3, the first theme to use one.
- **Backend:** the dashboard's files are served with `Cache-Control:
  no-cache` (a cheap 304 on each load). Testing showed a browser running the
  new `index.html` with a cached old `main.js`.
- **Checked:** `web/tools/layoutProbe.js` records the boxes and computed
  styles of the header, map, panel, cards and map controls. Run on fresh
  loads at 1280×800, 1920×1080 and 390×844 before and after: no box moved
  and no style changed, except that the map buttons, legend and popups now
  use the one `--font` stack (`system-ui` comes first in both, so the
  same font shows). The JS-only ids on the values (`#speed`, `#fuel`, ...)
  are gone. Follow, whole map, Layers, legend toggles, popups and the
  field panel work as before. test.html (87 checks) and pytest (75) pass.

### T2: Our icon set (web only)

- `web/src/ui/icons.js`: the 49 icons of the first set (see Icons) as path
  data, and `icon(name, {title})`.
- `web/tools/icons.html`: the contact sheet, every icon at 16, 26 and
  48 px, in both palettes, on a card and in a badge.
- Remove `client/icon_atlas.json`. No client or backend change.
- test.html: every name in the first set exists, each draws inside its
  24 × 24 box, and an unknown name gives a same-size placeholder.
- **Done when:** the set is approved on the contact sheet, and test.html is
  green.

#### As built (T2)

Done on 2026-10-23. All 49 icons approved, in five batches.
- **Module** (`ui/icons.js`): `icon(name, {title})` returns an inline
  `<svg>` (24 × 24 box, 2 px strokes, round caps and joins, currentColor),
  `aria-hidden` unless it has a title. `hasIcon(name)` checks a name, and
  `ICON_GROUPS` lists the set by group, in the sheet's order. An unknown
  name gives an empty icon of the same size and logs once.
- **Groups:** Vehicle (12), Alerts (5), Status bar (13), Map and tabs (6)
  and Controls (13). Engine on moved from Vehicle to Controls, since it's a
  control; it shares its drawing with Engine.
- **Shared drawings:** the engine block (engine, engine on, engine speed,
  engine fault), the dial (speed, cruise), the hitch arm (raise, lower),
  the small splined gear (PTO, implement on), the cloud (the weather), and
  `around()`, which turns one stroke round the centre (sun, frost). Dots
  are filled with no stroke, so they keep their size.
- **References:** the ISO symbols in the IntelliView 12 guide (InfoView
  warning lights and gauges on p. 4, the top bar on p. 8, the map toolbar
  on p. 9, transmission modes on p. 20, the armrest keypad and side menu
  on p. 23), drawn from scratch, never traced. The guide was viewed locally
  and uploaded nowhere. Symbols with no cab equivalent (weather, season,
  money, map) use common shapes in the same style.
- **Changed in review:** cruise, PTO, raise, lower, implement on and engine
  were redrawn after the guide; money became a wallet (a banknote read as
  a camera, a coin stack as a database), currency-free; whole map became
  view corners round a field (a framed ring also read as a camera).
- **Contact sheet** (`tools/icons.html`): the icons in context (value
  tiles, the map toolbar and tab bar, the status bar with a weather strip,
  alert chips, the control column) in day and night, then one card per
  icon with a keyline view, the sizes and the badge. It's published as the
  private artifact "FS25 Companion icon sheet", with `icons.js` beside it.
- **Removed:** `client/icon_atlas.json`. Nothing reads the game for icons.
- **Checked:** test.html (91 checks, 5 for icons: every listed icon is
  drawn, no name twice, each fits its box, the unknown-name placeholder,
  and the title handling). Every batch was rendered in the browser pane at
  120, 48, 26 and 16 px before review.

### T3: New Holland style: chrome and Map screen

- Status bar, value column, control column (indicators) and tab bar.
- The settings sheet with theme and Day / Night, and Default's Theme button.
- The Map screen: any shape, edge toolbar, slot zoom, and the Layers panel
  from the toolbar.
- `popupPlacement.js` gets the right box to avoid from the theme.
- **Done when:** the Map screen matches the approved artboards at all
  sizes, in both palettes.

#### As built (T3)

Done on 2026-10-23. Choose it in Settings, or with `?theme=newholland`.
- **Theme data** (`themes/newholland/theme.js`): the status bar in three
  parts (`start`: map name, alerts, protocol error; `centre`: day and
  time; `end`: weather, money, connection), the control groups, and two
  screens. Map is the map plus the control column, with the tab-bar
  readout (speed, gear, rpm, fuel, engine temp). Vehicle is, until T4, the
  vehicle's name, value tiles and the implements card.
- **Renderer** (`themes/render.js`): a status bar can be a list or
  `{start, centre, end}`; widgets are named by id or `{widget, variant}`; a
  screen slot can be `{controls: true}` (the theme's control groups); a
  screen's `readout` shows in the tab bar only while that screen does;
  tabs carry their icon. `checkTheme()` now also reports unknown controls
  and icons. No value column: the approved artboards moved the values to
  the readout, so `chrome.values` stays optional.
- **Controls** (`ui/control.js`, `widgets/controls.js`): a button with
  `data-state` off, on, pending or unavailable, `aria-pressed`, and
  `aria-disabled` until the controls project wires it. Thirteen controls
  read the mod's data: lights, high beam, beacon, hazard, turn left and
  right (`lights`), engine (`engineOn`), AI worker (`isAI`), raise, lower
  and work (`implements`); cruise and PTO show as unavailable until T6
  sends them. On foot, everything is unavailable. The Implement group's
  label adds the first implement's name. Fold and "next tool" from the
  artboard wait for data and icons.
- **New widgets and variants:** `dayClock` (the centre pill: season, day,
  time), `weatherNow` (weather icon and the day's temperatures), `alerts`
  (chips from `alerts()` in `selectors.js`: fuel under 15 % warns and
  under 5 % alarms, engine at 100 °C warns and at 110 °C alarms, wear from
  80 % warns), `connection` variant `dot`, and the value variants `text`
  and `readout` (with a meter for fuel). Value widgets gained an icon, a
  level (`data-level` warn / alarm) and a meter.
- **Settings** (`ui/settings.js`): the same button and panel in both
  themes. Theme cards with layout thumbnails, then Day / Night for a theme
  with palettes. Choosing a theme saves it, drops `?theme=` and
  `?palette=` from the URL (keeping `?pair=` and `?backend=`) and reloads.
  Day / Night applies at once and is saved. The panel sits in the main
  area under the header, with a backdrop; the backdrop, Escape or the
  button close it.
- **Default:** the Settings button at the header's left and a small Theme
  panel (no thumbnails). The button overhangs the header's padding, so the
  header keeps its height: `layoutProbe.js` at 1280×800, 1920×1080 and
  390×844 against the last commit shows only the title moving right of
  the button and `main` becoming `position: relative`.
- **Map** (`themes/newholland/mapControls.js`): one toolbar on the map's
  left edge (zoom in and out; recentre, which follows, and whole map;
  layers), the Layers panel opening beside it (closed at start), and a
  metric scale bottom-right. The field panel sits top-right and drops to
  the bottom-right corner when a popup would cover it.
- **Slot zoom** (`mapView.js` `defaultZoom`, `followControl.js`
  `slotZoom`): following zooms to the slot's own zoom and keeps it as the
  slot changes size, until you zoom by hand (wheel, pinch, double-click,
  the zoom buttons); recentre goes back to it. Measured: about 505 m
  across the 676 px map at 1180×820, 150 m across a phone's. The per-slot
  memory is T4.
- **Popups** (`popupPlacement.js`): the theme passes `inset`, the strip
  popups keep clear of (New Holland: 76 px for the toolbar). The class the
  field panel gets is now `moved`; each theme's CSS says where it goes.
- **Saved per device:** `fs25companion.screen` (the last screen, per
  theme), plus the theme and palette keys from T1.
- **Font:** Archivo 400, 500, 600 and 700 in `web/vendor/fonts/` (from
  `@fontsource/archivo` 5.2.8, Latin and Latin Extended subsets, about
  110 KB in all, with `OFL.txt`). `archivo.css` declares them and only
  New Holland's `theme.css` imports it, so Default keeps its system font.
  The browser fetches a weight or subset only when text uses it.
- **Checked:** test.html (113 checks, 22 new: season names, fuel levels,
  alerts, control states and labels, every control's icon, the readout and
  pill, theme checks, the renderer's parts, the Settings panel, the URL
  without theme, slot zoom, the popup inset) and pytest (75). In the
  browser pane with the replay and a sample vehicle: 1180×820 in day and
  night against the Map and Settings artboards; 1133×744, 1194×834,
  1280×800, 1366×768, 1376×1032, 1920×1080, 2560×1440, 3440×1440, 800×1280
  and 820×1180 portrait and 390×844, with no horizontal scroll, no
  overflowing column or tab bar, and every button 44 px or more. Phones
  scroll the screen, with the map at least as tall as its toolbar.
- **To confirm in game:** `env.season` is read as 0 = spring (like the
  game's Season enum); the replay says "Summer" on day 1, so check it
  against the in-game calendar.

### T4: Vehicle screen

- The hero readout, condition tiles and implements.
- The vehicle card with its shop picture (see Vehicle pictures) and its
  Show-on-map button.
- Per-slot map memory and recentre.
- Tune the slot-zoom numbers.
- **Done when:** it matches the artboards, and moving between screens keeps
  each map slot's view.

#### As built (T4)

Done on 2026-10-23. The shop picture is left for later (see Vehicle
pictures).
- **Layout** (`themes/newholland/theme.js`): the Vehicle screen is a
  `vehicle` group (columns `1fr | 300`, rows `296 | 116 | 1fr`) holding the
  readout card, the vehicle card, a `conditions` group of four tiles and the
  implements, then the same control column as the Map screen. Compact
  stacks them and docks the controls underneath; under 720 px it's one
  card per row and two tiles per row.
- **Renderer** (`themes/render.js`): a slot can be `{group, slots}`, drawn
  as a `.slot-group` with `data-group` for the theme's CSS, and a widget
  slot can set `whenMissing`. `checkTheme()` looks inside groups.
  `renderTheme()` also returns `mapScreen`, the first screen with a map
  slot.
- **Readout card** (`widgets/vehicleScreen.js` `vehicleReadout`): what the
  vehicle is doing (`activity()`: on foot, AI worker, working with the
  implement's name, driving, standing, parked), an Engine on / off pill,
  the speed arc (full scale 50, 80 or 120 km/h, kept per vehicle once
  reached), the gear box and engine speed with a bar of its top rpm. Under
  500 px of content the arc shrinks and the speed goes to 80 px; under
  420 px the gear and rpm go under the arc.
- **Vehicle card** (`vehicleCard`): the vehicle's kind as a large icon,
  the name without its brand ("T7.315 HD"), "Brand · Category", and Show
  on map, which dispatches a bubbling `showonmap` event; `main.js` shows
  the Map screen and recentres, so the map follows the vehicle at the
  slot's zoom.
- **Condition tiles:** a `condition` variant of the value widgets: badge
  and label, number, unit and a `detail` (fuel's litres, or kWh), then a
  bar (`bar`, or `meter`) or a `note` (hours: "Hour meter"). Engine temp's
  bar is full at 140 °C. Warn and alarm colour the border, badge, number
  and bar.
- **Implements:** a `rows` variant: kind icon (yellow while working),
  name, the shop category, Lowered / Raised and Working / Off chips, and a
  wear bar; "Nothing attached" when empty. Default's card is unchanged.
- **Mod** (`Vehicles.lua`): the controlled vehicle and each implement get
  `category` and `categoryTitle` from their store item
  (`g_storeManager:getItemByXMLFilename(configFileName)`,
  `getCategoryByName`), the vehicle also `brand`
  (`g_brandManager:getBrandByIndex`, skipping NONE), and implements their
  `typeName`. All guarded and cached per vehicle id, cleared per map;
  confirmed live the same day.
- **Gear** (fixed after the first live test): `getGear()` gave nothing in
  FS25, so the mod reads the vehicle's `getGearInfoToDisplay()` (the
  gear's name, group and automatic), and the dashboard shows reverse as
  "R1" or "R3H". Under the label the readout card shows "Automatic" (a
  CVT's "D") and the range, unless the gear's name already carries it
  ("3H").
- **Kinds** (`selectors.js` `vehicleKind`): the shop category first, then
  the type name, matched by pattern (tools, headers and wagons before
  loaders and harvesters); unknown motorized vehicles are tractors,
  anything else an implement. `kindLabel` uses the shop's category name
  when there is one.
- **Per-slot map memory** (`followControl.js`, key
  `fs25companion.mapSlots`, slot `newholland/map`): following or not, the
  zoom you chose while following, and the centre and zoom where you left
  it when not following, restored on the same map. Recentre clears your
  zoom. Only zooms you make count: framing a new map no longer overwrote
  it. Default keeps `fs25companion.follow`.
- **Hidden screens** (`mapView.js` `remeasure`): the map skips
  `invalidateSize` while its box is 0 × 0, so a hidden Map screen keeps its
  size and view, and switching back moves nothing.
- **Also fixed:** the phone rule that hid the tab-bar readout's fuel meter
  hid every meter; it's now scoped to the readout.
- **Checked:** test.html (127 checks, 14 new: kinds, labels, model name,
  activity, speed scale, rpm, the readout and vehicle cards on foot and
  driving, Show on map, condition tiles, implement rows, groups in the
  theme check and renderer, per-slot memory across reloads) and pytest
  (75, the mod's brand and category included). In the browser pane, with
  the replay plus a sample vehicle: 1180×820 in day and night against the
  Vehicle artboards; 1133×744, 1280×800, 1376×1032, 1920×1080, 800×1280
  portrait and 390×844 with no horizontal scroll, no card overflowing and
  every button 44 px or more; switching screens and reloading keep the
  map's view; Show on map follows at the slot's zoom. Default's
  `layoutProbe.js` at 1280×800 matches the last commit (one live value's
  text width aside).

### T5: Responsive pass and tablet polish

- Run the viewport matrix (see Verification) and fix what it finds.
- The compact class, the fullscreen button and the home-screen manifest.
- **Done when:** the matrix passes in both palettes.

#### As built (T5)

Done on 2026-10-23.
- **The matrix found one layout fault:** the Vehicle screen at 1024 px wide
  (1024×600 and 1024×768, small Android tablets and old iPads). The
  readout card's column is under 420 px there, so gear and rpm went under
  the arc and were cut off; at 600 tall the implements card was squeezed
  to 18 px.
  - The readout card now has three steps: under 500 px a 260 px arc; from
    340 to 419 px a 180 px arc, 52 px speed and a smaller gear box, still
    side by side; under 340 px (phones) the side under the arc.
  - The implements row is at least 150 px, and the Vehicle screen scrolls
    when the window is too short for that, instead of squeezing.
- **Full screen** (`ui/screenMode.js`): the Fullscreen API on the whole
  page (`requestFullscreen`, or Safari's prefixed one before 16.4). Two
  ways in, in New Holland: a button at the status bar's right end (widget
  `fullscreen`, `widgets/screen.js`, pressed and turned to "leave" while
  on), and a Full screen toggle in Settings under a new Screen group. Default
  has only the Settings toggle, so its header doesn't change. Neither
  shows where the browser has no full screen (iPhones) or in the home-screen
  app, which already has no browser bars. Browsers leave full screen when
  the page reloads, so switching theme leaves it too; the Settings note
  says so.
- **Keep screen on** (Settings, Screen): the Screen Wake Lock API, saved per
  device (`fs25companion.keepAwake`), taken again when the page shows
  after being hidden. It only shows on a secure page: `localhost`, or
  HTTPS. A tablet on `http://<PC IP>:8123` doesn't get it; there the
  device's own auto-lock setting is the way.
- **Home screen** (`web/manifest.json`, `index.html`): name, icons,
  `display: fullscreen` (iOS uses standalone), and the Apple meta tags
  (`apple-mobile-web-app-capable`, a translucent status bar). No
  `start_url`, so the app opens the address it was added from, keeping
  `?pair=` and `?theme=`. On iPad, Safari's Share → Add to Home Screen
  works on the LAN address too. Chrome on Android needs HTTPS (or
  localhost) to open it without bars; on the LAN it adds a plain shortcut.
- **Safe areas:** `viewport-fit=cover`, and both themes pad by
  `env(safe-area-inset-*)`: New Holland's status bar and tab bar grow into
  the iPad's status bar and home indicator, with their content kept clear;
  Default pads `#app`. The insets are 0 in a browser tab, so nothing moves
  there.
- **Icons:** `web/icons/icon.svg` (the favicon too) is our tractor icon on
  Default's slate. `scripts/app_icons.py` draws the PNGs with Pillow:
  192 and 512, rounded, and a maskable 512 and the 180 Apple touch icon,
  full-square with the drawing inside the safe zone. Three new icons in
  the set: `fullscreen`, `exitFullscreen` and `keepAwake`.
- **Checked:** test.html (135 checks, 8 new: when full screen is offered,
  keep-awake taking, releasing and saving the lock with a fake Wake Lock
  API, the Screen group and its toggles, no group where neither is
  supported, the status-bar button) and pytest (75). In the browser pane,
  with the replay and a sample vehicle, a script checked horizontal
  scroll, clipped content (both directions) and buttons under 44 px on
  the Map screen, the Vehicle screen and with Settings open, in day and
  night, at 1024×600, 1024×768, 1133×744, 1180×820, 1194×834, 1280×800,
  1280×720, 1366×768, 1376×1032, 1920×1080, 2560×1440, 3440×1440, 768×1024,
  800×1280, 820×1180, 844×390 and 390×844: all clean. Default's
  `layoutProbe.js` at 1280×800, 1920×1080 and 390×844 matches the last
  commit.
- **Not checked here:** entering full screen. The app's browser pane gets
  the request but never answers it, so it needs a real browser: Chrome or
  Edge on the PC, and the tablets. The safe areas and the home-screen app
  also need a real iPad.

### T6: More data from the game (mod, can start any time)

- Fuel usage, cruise control, DEF/AdBlue, fill levels of the vehicle and
  implements, PTO, hitch position, AI worker state.
- Units and currency from the game's settings, falling back to metric.
- These build on the fuel work: consumer fill units with
  `getFillUnitFillLevel`, and the spike's `controlledDetail` dump.
- **Done when:** the values are in the stream, with tests. Widgets show them
  as they arrive.

#### As built (T6)

Built on 2026-10-24. The names come from the FS22 script docs and are
guarded like the old telemetry mod's; none is confirmed in FS25 yet (see
PLAN.md, Open checks). A wrong guess leaves the value out, nothing breaks.
- **Stream** (`Vehicles.lua`, controlled vehicle): `fuelUsage` (l/h, kWh/h
  for electric: `spec_motorized.lastFuelUsageDisplay`, else
  `lastFuelUsage`); `def` and `defCapacity` (the DEF consumer fill unit);
  `cruise` `{state: off|on|full, speed, maxSpeed}` (km/h, from
  `getCruiseControlState/Speed/MaxSpeed`, else `spec_drivable.cruiseControl`);
  `pto` (true when an attached implement's PTO turns, missing without one);
  `fills` (the vehicle's own fill units without fuel, DEF and air, and
  without units the HUD hides: `{unit, level, capacity, fillType,
  fillTitle}`, no fill type when empty). Each implement adds `pto`
  (`spec_powerConsumer.ptoRpm > 0`, then `getDoConsumePtoPower()`), `hitch`
  (0 raised to 1 lowered: the attacher joint's `moveAlpha` between its
  `upperAlpha` and `lowerAlpha`; missing for a joint that doesn't move) and
  `fills`. Every vehicle a worker drives adds `ai` `{job, description,
  helper}` (`getJob()`, then `getCurrentHelper()`).
- **Units** (`Env.lua`): `env.units` `{miles, fahrenheit, acres, currency}`
  from `g_gameSettings:getValue` (`useMiles`, `useFahrenheit`, `useAcre`)
  and `g_i18n:getCurrencySymbol(true)`, else the `moneyUnit` setting. The
  mod keeps sending metric; `data/units.js` converts speeds, temperatures,
  areas and money on the dashboard, and falls back to metric and "$" (as
  before) without settings. Litres stay litres.
- **Dashboard:** new widgets `fuelUsage`, `def` (meter, warns under 10 %,
  alarm under 3 %, and an alert chip), `cruise` ("Off", "Full" or the set
  speed), `cruiseSpeed` (a readout shown only while cruise holds a speed)
  and `load` (the vehicle's first loaded unit). The Cruise and PTO controls
  show the game's state. Implement rows get a PTO chip, "Hitch 40%" while
  the hitch moves, and a meter per fill unit; the Default list says "PTO"
  and "seeds 58%". An AI worker's popup and the readout card name its job.
  Value widgets may take a `unit` function, so units follow the settings.
- **Layouts:** New Holland's Map readout adds fuel usage and the cruise
  speed (both dropped on compact); its condition row takes DEF and Load
  only when there is data, as one row of five or six tiles, with smaller
  numbers and no detail under 1100 px. Default's Vehicle card adds Fuel
  usage, DEF, Cruise and Load rows, each hidden without data, so on foot
  and with older mods it looks as before.
- **Spike:** the `controlledDetail` dump adds the cruise getters and the
  `spec_drivable`, `spec_attacherJoints`, `spec_powerConsumer` and
  `spec_aiJobVehicle` tables, for the live check.

### Implement screen (design, 2026-10-24)

Approved by Vincent on 2026-10-24 in the Claude Design canvas
"FS25 Companion: Implement screen" (board C · Hybrid, private, on
claude.ai). It's a third tab, **Implement**, after Map and Vehicle, and
answers "what is my tool doing and when must I act", where Vehicle
answers "how is my tractor". Not built yet.

- **Layout (regular):** the usual chrome. The main area has rows
  `132 | 1fr`; the detail row has columns `1fr | 250`; the control column
  is 268 wide, as on the other screens.
- **Rig band** (top, readout-card colours): the job in words ("Seeding",
  "Harvesting · Wheat", "Delivering · Grain mill" for an AI worker),
  speed, PTO and when the first tank runs out. Under it, the hitch chain
  as tiles in driving order: rear tools on the left, the tractor, front
  tools on the right. Each tile has its icon badge (yellow while
  working), name, state line and a thin bar per fill unit. The picked
  tile has a yellow outline. With one tool, the band shows just the
  tractor and that tool.
- **Implement card** (the picked tool): ‹ › buttons (and a swipe) to move
  between tools, icon, name, category and side, a Working chip; then
  four stat tiles: Lift (bar, Raised to Lowered, "Hitch 40%" while it
  moves), Work, PTO, Speed against the tool's working speed limit. Then
  the tool's own buttons: Raise, Lower, Work, PTO, Fold, Detach. Then its
  tanks: a big meter per fill unit with litres and a time estimate; the
  tank that runs out first gets a "Runs out first" chip.
- **Details card:** wear, working width, area done this run, folding,
  whether the game has this tool selected, Show on map.
- **Control column:** Lights and Drive as on Map and Vehicle, plus All
  implements (Raise all, Lower all, Attach). The per-tool buttons live on
  the implement card, so the column needs no Implement group here.
- **Combines:** the harvester's own grain tank is a tile and the
  implement card's tanks show it ("full in ≈ 3 min", "Call a trailer");
  Pipe and Unload join its buttons.
- **Trailers:** a Load stat (all trailers together) replaces Lift;
  Tipping and Cover replace Work and PTO.
- **Estimates** come from the dashboard alone: the fill level's change
  over the last 60 s gives litres per minute, then minutes to empty or
  full. Shown as "≈", hidden when the rate is unsteady or zero.
- **Data already sent (T6):** name, category, depth, lowered, turnedOn,
  pto, hitch, wear, fills, ai job.
- **New data the mod needs** (dashed purple on the boards):
  - front or rear: the attacher joint's type or side;
  - working speed limit (`getSpeedLimit`);
  - working width (the work areas);
  - folding state (`spec_foldable`);
  - the tool the game has selected (`getSelectedImplement`);
  - pipe out or in, tipping or not, cover state;
  - a combine's crop.
- **Controls:** C2 wires Raise, Lower, Work, PTO (they act on the game's
  selected implement, so a tap first selects the picked tool in game),
  Raise all, Lower all and Attach. C3 adds Fold, Detach, Pipe, Unload,
  Tipping and Cover. Until then those buttons show as unavailable.
- **Open:** whether picking a tile also selects the tool in game before
  any button is pressed; compact (portrait) layout, likely the band as a
  scrolling row and the card full width.

### Later

- Building the Implement screen (designed above); Fields and Farm screens.
- The shop picture on the vehicle card (see Vehicle pictures).
- Layout editing.
- More brands: Fendt FendtONE, John Deere G5, Massey Ferguson Datatronic,
  Case IH AFS Pro, CLAAS CEMIS. Each is a theme folder plus a design pass.

## Files

- **Changed:** `web/index.html`, `web/style.css`, `web/src/main.js`,
  `web/src/panels/*`, `web/src/map/legend.js`, `map/followControl.js`,
  `map/mapView.js`, `map/popupPlacement.js`, `web/test.html`,
  `mod/src/collectors/Vehicles.lua` (T4: brand and shop category).
- **New:** `web/src/data/selectors.js`, `web/src/widgets/`,
  `web/src/themes/render.js`, `themes/registry.js`, `themes/default/`,
  `themes/newholland/`, `web/src/map/mapFrame.js`, `web/src/ui/dom.js`
  (was `panels/dom.js`), `web/src/ui/icons.js`, `web/src/ui/control.js`,
  `web/src/ui/settings.js`, `web/src/widgets/controls.js`,
  `web/src/widgets/vehicleScreen.js`, `web/tools/layoutProbe.js`,
  `web/tools/icons.html`, `web/src/ui/screenMode.js` and
  `web/src/widgets/screen.js` (T5: full screen, keep-awake),
  `web/manifest.json`, `web/icons/` and `scripts/app_icons.py` (T5: home
  screen).
- **Removed:** `client/icon_atlas.json` (T2).
- **Docs:** `docs/THEMES.md` (this file), `docs/PLAN.md`.

## Verification

- **test.html:**
  - selectors;
  - theme registry, URL and localStorage parsing;
  - `defaultZoom`;
  - theme data checks: every widget id exists, and no screen has more than
    one map slot;
  - icons: every name used by a theme exists in `icons.js`.
- **Browser pane,** with the `replay-solek` launch config:
  - **Sizes:** 1133×744, 1180×820, 1194×834, 1280×800, 1376×1032,
    1366×768, 1920×1080, 2560×1440, 3440×1440, one portrait and one phone
    size. Each in day and night.
  - **Layout:** nothing overflows, there's no horizontal scroll, and touch
    targets are 48 px or more.
  - **Map slots:** tall, wide and square slots fill with map. The edge
    toolbar works. The slot zoom gets closer as the slot shrinks, your zoom
    is kept per slot, and recentre resets it.
  - Popups stay inside the map and clear of the field panel.
  - Icons look the same live and in replay.
  - Each screen matches its artboard.
- **Default unchanged:**
  - Before T1, a script records the position and size of the header, map
    box, panel and each card, plus key computed styles, at 1280×800,
    1920×1080 and 390×844.
  - After each phase, the same script runs and is compared, alongside
    screenshots.
  - It compares geometry, not pixels, because the replay keeps moving.
- **Live:**
  - FS25 with the client, on a tablet over the LAN (`http://<PC IP>:8123`)
    and on a second monitor.
  - Drive a New Holland tractor and check the values, the indicators
    (lights, beacon, implement), the icons and the Day / Night switch.

## Risks

| Risk | Handling |
|---|---|
| Our icons read less clearly than the game's | Standard symbol shapes, reviewed on the contact sheet at 16 px before T3. |
| Moving the map between slots breaks its size | Re-measure after every move, never while hidden; tested in T4. |
| The light day palette clashes with the map's PDA colours | Contrast checked in T0; map colours stay fixed. |
| Tablet browser bars eat height | Fullscreen and home-screen install in T5. |
| Older tablets are slow | Light effects, reduced motion, a test on the slowest tablet available. |
| Trademarks | Brand names as text only, with "Not affiliated"; no logos, photos or artwork in the app or the artifact. |
