# 0010: Tidy states, surfaces and motion

Status: live-checked (revision 2: selecting)
Mod: no change (web only) · Started: 2026-11-01 · Design: the "The details" boards (Control states, Surfaces, Motion) of the canvas [FS25 Companion: Design refresh](https://claude.ai/artifact/LtAHhHVshYSZsYceF8hHv7), approved by Vincent on 2026-11-01

## Goal

Not a redesign: the same look, tidied. Every state of a button looks one
way on every screen, raised means "you can press it", and the dashboard
moves less and more calmly. The spinning dash round a waiting button goes;
waiting looks the same on buttons, rig tiles, rows and steps. It should be
clear at a glance, without being in your face.

## Behaviour

All of it in both palettes, at every size; nothing moves or resizes.

**Controls** (the control column, the tool cards' buttons, the Harvester
tiles: everything drawn by `ui/control.js`):
- **Off:** as now.
- **On:** as now, but the lit colour fades in and out over 180 ms instead
  of snapping.
- **Hazard and the turn arrows:** neutral (text colour) while off; while on
  they fill with alarm (Hazard) or ok (turn arrows), not with the blue /
  yellow "on" colour. Dark ink on them at night, white by day.
- **Unavailable:** a flat, dashed outline in the muted colour, no fill, no
  shadow, icon and label muted, at full opacity (today: the off style at
  45 %).
- **Pending** (a command is out, or settling): the border takes the colour
  the button is going to (the "on" border, or alarm / ok for Hazard and the
  turn arrows) and a faint tint of that colour breathes inside the button,
  from 8 % to 28 % and back, every 1.2 s. Nothing outside the button's
  edge: no ring, no glow. When the game answers it fills in (180 ms).
- **Failed** and the hint ("Nothing in range"): as now.
- **Press:** the button gives a little (96 %) while the finger is on it,
  120 ms, whatever the state except unavailable.
- **Labels and icons:** 13 px labels (from 12) and 28 px icons (from 26).

**Where you are vs. what is on:** a filled blue (day) or yellow (night)
only ever means "on". Where you are is a tinted outline: a pale accent
tint, a 2 px accent ring inside the edge, the label in the accent ink
(dark blue by day, yellow at night).
- the selected tab;
- the map toolbar's pressed tools (Recentre while following, Layers while
  open), the ring inset so the toolbar's rounded edge never clips it;
- the Vehicle tab's screen menu (Vehicle, Loader, Harvester).

**Surfaces:** a shadow ("lift") only on what you can press (controls, the
map toolbar, the column-style buttons such as Show on map and Reset, the
steps) and on what floats over the map or the screen (the map box, the
Layers panel, the field panel, popups, Settings, the tab menu). Readout
cards, the Vehicle and Harvester bands, and display cards (conditions,
loads, target, tool cards and their notes, the "Also attached" rows,
Harvester cards) go flat: their border stays, the shadow goes. A selected
tool card keeps its 2 px selection ring.

**Selecting a tool** (revision 2, after the live check): the game answers
in a frame or two, so a selection has no waiting look at all: an
animation that short only jittered. A tap on a rig tile, an implement row
or **anywhere on a tool card** (not only its head) selects that tool in
game; a tap on one of the card's buttons only presses that button. The
game's selected tool card shows as selected all over: a faint accent tint
over the whole card (blue by day, yellow at night) with the 2 px accent
ring round it.

**Other things that wait for the game** (a step, Detach): a thin accent
outline, 2 px outside the edge, that breathes between strong and faint
every 1.2 s. They used to sit at 60 %.

**Attention** (the Harvester's "until full" when it's time to call a
trailer): the orange value's colour eases between the warn colour and a
lighter one every 2 s; the text never fades (today it pulses to 45 %).

**Motion, one set:**

| Token | Value | Used for |
|---|---|---|
| `--t-fast` | 120 ms | a press |
| `--t-base` | 180 ms | a state changes (on / off, tabs, selection) |
| `--t-slow` | 300 ms | meters and bars |
| `--t-breathe` | 1.2 s | waiting for the game |
| (attention) | 2 s | needs your attention |
| `--ease` | `cubic-bezier(0.2, 0.7, 0.3, 1)` | everything |

**Reduced motion** (`prefers-reduced-motion`): no transitions and no
animations. Pending keeps its border and a still 18 % tint; waiting keeps
a still outline; attention keeps the warn colour.

## Data contract

None: web only, no topic or field changes, no mod change.

Game API names used: none.

## Commands

None change. Controls send what they send today; only how pending,
unavailable and on look changes.

## Plan

- `web/src/themes/newholland/theme.css`:
  - motion tokens on `:root`; the night ink for alarm / ok fills
    (`--alarm-ink`, `--ok-ink`) and the selection tokens (`--sel-tint`,
    `--sel-ink`) in both palettes;
  - `.control`: a `::before` layer holding the lit colour (`--on`, alarm or
    ok by tint) that fades with opacity; on / pending / unavailable /
    `:active` as above; 13 px labels, 28 px icons; drop `.control-ring` and
    `control-pulse`;
  - `.tab[aria-pressed]`, `.tool[aria-pressed|aria-expanded]`,
    `.tab-menu button[aria-checked]`: the tinted outline (the Settings
    panel's Screen toggles are switches, so they keep the fill);
  - `box-shadow: var(--lift)` and `var(--readout-lift)` taken off the
    display surfaces listed above (overlays keep theirs);
  - one `waiting` look (`[data-pending="true"]`, `.impl-step` /
    `.impl-detach[data-state="pending"]`) and the attention keyframes for
    `.harv-ro[data-alert]`; meters' width transition on `--t-slow`;
  - the reduced-motion block replaced by one covering all of it.
- `web/src/ui/control.js`: drop `loadingRing()` and its comment; the
  header comment says how pending looks now.
- `web/test.html`: the "running border" check becomes the new checks below.
- `docs/THEMES.md`: Palettes, Depth and a short Motion section updated, with
  a link here; the design system artifact refreshed from `theme.css` (its
  README, tokens and `bundle.css`), as THEMES.md asks.
- Risk: the `::before` layer needs `isolation: isolate` on `.control` so it
  paints under the icon and label; the Engine button's live dot
  (`.readout-engine.control::after`) already uses `::after`, so it's kept
  clear of `::before`.
- Risk: the layout test's 48 px minimum and no-overflow checks must still
  pass with the bigger labels and icons.

## Acceptance

Automated (each one a test that exists before the work is called built):
- [x] `web/test.html`: a control has no ring element (`.control-ring` is gone).
- [x] `web/test.html` (layout frame, theme CSS loaded, day and night): an
      unavailable control has opacity 1, a dashed border and no box-shadow.
- [x] `web/test.html`: a pending control's border colour is `--on-border`
      (alarm for Hazard), its `::before` runs the wait animation, and
      nothing animates its box-shadow.
- [x] `web/test.html`: Hazard off draws its icon in the text colour; Hazard
      on has its `::before` in the alarm colour at opacity 1.
- [x] `web/test.html`: the selected tab and a pressed map tool have no
      `--on` background image and an inset ring; an "on" control still has
      the filled `--on` layer.
- [x] `web/test.html`: `--t-fast`, `--t-base`, `--t-slow`, `--t-breathe` and
      `--ease` are defined; the Vehicle band has no box-shadow and a tool
      card no lift (a selected one keeps its ring); a control has one.
- [x] `web/test.html`: a pending step has the waiting outline and keeps
      full opacity.
- [x] `web/test.html` (revision 2): a rig tile or tool head waiting for a
      selection has no outline and no animation; the selected tool card's
      background differs from an unselected one's, in both palettes.
- [x] `web/test.html` (revision 2): a tap on a tool card's stats selects
      its tool (`implement.select` with its id); a tap on one of its
      buttons sends that button's command and no selection.
- [x] `web/test.html`: the layout checks still pass (no overflow, buttons
      48 px or more) at 1180 × 820, day and night.
- [x] `python -m pytest mod/tests companion/tests tests` green (golden
      unchanged: no viewer message changes).
- [x] Replay in the browser pane (`replay-solek`), 1180 × 820, day and
      night: the Map and Vehicle screens with a sample vehicle (on, off,
      unavailable, Hazard and turn arrows), the selected tab, Recentre and
      Layers pressed, Settings; screenshots look like the "The details"
      boards.

Live check (in game, on the PC browser and the tablet; any map, the T7 or
any tractor with a tool):
- [x] Lights, beacon and Hazard: tap each; the button breathes faintly
      inside its own edge until the game answers, then fills; no ring.
- [x] Engine start (it settles for a while): the waiting look holds until
      the engine runs, and isn't distracting.
- [x] On foot, the whole column is the dashed unavailable look, clearly
      different from off buttons in a vehicle.
- Dropped: "tap a rig tile: the outline breathes until the game selects
  it". It failed (selecting is so quick the outline only jittered) and
  revision 2 replaced it with the three checks below.
- [x] Revision 2: tap a rig tile, then another tool card's body (not its
      head): each selects at once, with no flicker.
- [x] Revision 2: the selected tool card reads as selected all over,
      without shouting, by day and at night.
- [x] Revision 2: a tap on a card's button (Lower, Work...) presses only
      that button and doesn't change the selection.
- [x] The press feels taken on the tablet (the small give under the finger).
- [x] Day and night both read clearly from the seat.

## Decisions

- The Vehicle tab's screen menu (Vehicle, Loader, Harvester) counts as
  "where you are", so it gets the tinted outline too, not the filled
  "on" colour.
- The press give is on controls and the map toolbar only, not on tabs, rig
  tiles or cards (those keep their `:active` background).
- The readout card and rig band keep their dark gradient; only the shadow
  goes.
- Overlays (the map box, the field panel, popups, the Layers panel) keep
  their lift, against the spec's first draft: they float over the busy
  map, and the shadow is what lifts them off it. Only cards inside the
  screen went flat.
- Unavailable draws a 1.5 px dashed border in the muted colour at 55 %
  (`color-mix`, with the plain border colour first for older browsers).

## Out of scope / open questions

- The other boards of the canvas (calmer map, the Vehicle screen's empty
  states, the hero numbers) and the Dim palette: not in this spec.
- Open: should Hazard on keep a slow blink like a real hazard switch, or
  stay a steady red? This spec says steady.
- Open: the "Failed" state could fade in its red border too (180 ms); the
  spec keeps it as is.

## Log

- 2026-11-01: drafted from the approved "The details" boards; approved.
- 2026-11-01: built. `theme.css` (tokens, controls, selection, surfaces,
  waiting, attention, reduced motion) and `control.js` (no ring); test.html
  green (one new check over both palettes), pytest 111 green; the replay
  at 1180 × 820 checked by day and at night with the controls pinned in
  each state. The Settings Screen toggles kept their fill (switches, not
  "where you are"); overlays kept their lift (Decisions).
- 2026-11-01: live check (Solek, T7.300 with the Samasz KDF 341 S and KDD
  941 STH), on the PC and the tablet: Lights (all three stages), High beam,
  Beacon, Hazard and the turn signals wait calmly inside their edge and
  fill when the game answers; the engine start held the waiting look for
  its 4 s; the press give feels taken. Confirmed by Vincent.
- 2026-11-01: live check, the rest: on foot and day / night confirmed.
  Selecting a rig tile or a tool card jittered (the game answers too fast
  for a waiting look). Vincent asked for revision 2: no animation on a
  selection, the selected card tinted all over, and a tap anywhere on a
  card selects it.
- 2026-11-01: revision 2 built. No waiting look on a selection (rig tiles,
  tool heads, implement rows); steps and Detach keep the outline. The
  selected card gets `--sel-card` over its background (day 7 % blue, night
  8 % yellow) inside the ring. A tap anywhere on a card that isn't a button
  forwards to its head (`toolCard`, vehicleTools.js); the head keeps the
  keyboard and the label. test.html and pytest green; seen on the live
  dashboard with the KDD 941 STH selected, by day and at night.
- 2026-11-01: revision 2 confirmed in game by Vincent (Solek, T7.300 with
  the KDD 941 STH and KDF 341 S): rig tiles and card bodies select at once
  with no flicker (the watcher shows each `implement.select` answered in
  the same second), the selected card reads as selected by day and at
  night, and a card's buttons press only themselves. Live-checked.
