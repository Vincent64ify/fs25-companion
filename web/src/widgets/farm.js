// @ts-check
// The farm and the session: weather, time, money, map and player name.

import { valueWidget } from "./widget.js";
import {
  clock as clockOf, farmMoney, seasonName, temperatureRange, WEATHER_NAMES, weatherName,
} from "../data/selectors.js";
import { moneyText, tempUnit, tempValue, unitsFrom, unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";
import { createSpeedPanel, speedText } from "../ui/speedPanel.js";
import { sendCommand } from "../connection.js";

// the icon for each weather name (selectors.js WEATHER_NAMES)
const WEATHER_ICONS = ["sun", "cloudy", "cloudy", "fog", "rain", "storm"];

export const weather = valueWidget({
  label: "Weather", topics: ["env"],
  read: (store) => weatherName(store.get("env")),
  text: String,
});

/** Today's range in the player's unit: "12 / 21". @param {[number, number]} range @param {any} env */
const rangeText = ([min, max], env) => {
  const u = unitsFrom(env);
  return `${Math.round(tempValue(min, u))} / ${Math.round(tempValue(max, u))}`;
};

export const temperature = valueWidget({
  label: "Temp", unit: (store) => tempUnit(unitsOf(store)), topics: ["env"],
  read: (store) => temperatureRange(store.get("env")),
  text: (r, store) => rangeText(r, store.get("env")) + tempUnit(unitsOf(store)),
  number: (r, store) => rangeText(r, store.get("env")),
});

export const clock = valueWidget({
  label: "Time", topics: ["env"],
  read: (store) => clockOf(store.get("env")),
  text: String,
});

export const day = valueWidget({
  label: "Day", topics: ["env"],
  read: (store) => store.get("env")?.day ?? undefined,
  text: String,
});

export const money = valueWidget({
  label: "Money", topics: ["env", "hello", "player"],
  read: farmMoney,
  text: (v, store) => moneyText(v, unitsOf(store)),
});

export const mapName = valueWidget({
  label: "Map", topics: ["hello"],
  read: (store) => store.get("hello")?.mapTitle || store.get("hello")?.mapId || undefined,
  text: String,
});

export const playerName = valueWidget({
  label: "Player", topics: ["hello"],
  read: (store) => store.get("hello")?.playerName || undefined,
  text: String,
});

/** how long an ok speed holds on the pill while env still says the old one (specs/0017) */
export const SPEED_HOLD_MS = 2000;

/**
 * The status bar's centre pill: "Spring · Day 6", the time, then the game
 * speed after a hairline ("×5", specs/0017). With the game's steps the pill
 * is a button that opens the speed panel (ui/speedPanel.js) in the main
 * area, under the status bar; without a speed it's as before, not a button.
 * The returned element is a wrapper (display: contents) holding either the
 * plain pill or the button. opts.send: the command sender (tests).
 * @type {import("./widget.js").CreateWidget}
 */
export function dayClock(store, opts = {}) {
  /** @type {(action: string, value?: number) => Promise<import("../commands.js").CommandResult>} */
  const send = /** @type {any} */ (opts).send || sendCommand;
  const when = h("span", { className: "day-clock-when" });
  const time = h("span", { className: "day-clock-time" });
  const speed = h("span", { className: "day-clock-speed" });
  const plain = h("span", { className: "day-clock" });
  const button = /** @type {HTMLButtonElement} */ (h("button", { className: "day-clock" }));
  button.type = "button";
  button.setAttribute("aria-controls", "speed-panel");
  button.setAttribute("aria-expanded", "false");
  const root = h("span", { className: "day-clock-slot" });
  if (opts.id) root.id = opts.id;

  /** @type {any} */
  let env;
  /** @type {number|undefined} the speed the mod checked, until env agrees or SPEED_HOLD_MS */
  let held;
  /** @type {ReturnType<typeof setTimeout>|undefined} */
  let holdTimer;

  const panel = createSpeedPanel({
    ask: (v) => send("timeScale.set", v),
    onOk: (v) => {
      held = v;
      clearTimeout(holdTimer);
      holdTimer = setTimeout(() => { held = undefined; draw(); }, SPEED_HOLD_MS);
      draw();
    },
    onOpen: (open) => {
      button.setAttribute("aria-expanded", String(open));
      draw();
    },
  });

  /** the main area under the status bar this pill sits in */
  function host() {
    const app = root.closest(".status-bar")?.parentElement;
    return app?.querySelector(":scope > .screens") || document.body;
  }

  function draw() {
    const t = clockOf(env);
    const scale = typeof env?.timeScale === "number" && env.timeScale > 0 ? env.timeScale : undefined;
    if (held !== undefined && scale !== undefined && Math.abs(scale - held) < 0.001) {
      held = undefined;
      clearTimeout(holdTimer);
    }
    const shown = held ?? scale;
    const steps = Array.isArray(env?.timeScaleSteps)
      ? env.timeScaleSteps.filter((/** @type {unknown} */ v) => typeof v === "number" && v > 0) : [];
    const opens = shown !== undefined && steps.length > 0;
    const pill = opens ? button : plain;
    if (pill.parentElement !== root) {
      pill.append(when, time, speed);
      root.replaceChildren(pill);
    }
    root.hidden = t === undefined;
    const day = typeof env?.day === "number" ? `Day ${env.day}` : "";
    when.textContent = [seasonName(env), day].filter(Boolean).join(" · ");
    time.textContent = t || "";
    speed.textContent = shown !== undefined ? `×${speedText(shown)}` : "";
    speed.hidden = shown === undefined;
    if (opens) {
      panel.setSteps(steps);
      panel.setCurrent(shown);
      button.setAttribute("aria-label", `${when.textContent} ${time.textContent}, game speed ×${speedText(shown)}, ` +
        (panel.isOpen() ? "close the speed panel" : "open the speed panel"));
    } else {
      panel.setOpen(false);
    }
  }

  button.addEventListener("click", () => {
    if (!panel.isOpen()) {
      const where = host();
      if (panel.layer.parentElement !== where) where.append(panel.layer);
      // under the pill (wide screens; compact the panel is full width)
      const b = button.getBoundingClientRect();
      const m = where.getBoundingClientRect();
      if (b.width && m.width) panel.layer.style.setProperty("--speed-x", `${Math.round(b.left + b.width / 2 - m.left)}px`);
    }
    panel.setOpen(!panel.isOpen());
  });
  store.subscribe("env", (next) => {
    env = next;
    draw();
  });
  return root;
}

/**
 * Today's weather as an icon, with the day's temperatures.
 * @type {import("./widget.js").CreateWidget}
 */
export function weatherNow(store, opts = {}) {
  const temp = h("span", { className: "weather-temp" });
  const root = h("span", { className: "weather-now" });
  if (opts.id) root.id = opts.id;
  store.subscribe("env", (env) => {
    const name = weatherName(env);
    const range = temperatureRange(env);
    root.hidden = name === undefined && range === undefined;
    const i = WEATHER_NAMES.indexOf(name || "");
    const glyph = icon(i >= 0 ? WEATHER_ICONS[i] : "temperature", name ? { title: name } : {});
    const u = unitsFrom(env);
    temp.textContent = range
      ? `${Math.round(tempValue(range[0], u))}–${Math.round(tempValue(range[1], u))}${tempUnit(u)}` : "";
    root.replaceChildren(glyph, temp);
    root.title = name || "Temperature";
  });
  return root;
}
