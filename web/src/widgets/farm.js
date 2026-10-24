// @ts-check
// The farm and the session: weather, time, money, map and player name.

import { valueWidget } from "./widget.js";
import {
  clock as clockOf, farmMoney, seasonName, temperatureRange, WEATHER_NAMES, weatherName,
} from "../data/selectors.js";
import { moneyText, tempUnit, tempValue, unitsFrom, unitsOf } from "../data/units.js";
import { h } from "../ui/dom.js";
import { icon } from "../ui/icons.js";

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

/**
 * The status bar's centre pill: "Spring · Day 6" then the time.
 * @type {import("./widget.js").CreateWidget}
 */
export function dayClock(store, opts = {}) {
  const when = h("span", { className: "day-clock-when" });
  const time = h("span", { className: "day-clock-time" });
  const root = h("span", { className: "day-clock" }, when, time);
  if (opts.id) root.id = opts.id;
  store.subscribe("env", (env) => {
    const t = clockOf(env);
    root.hidden = t === undefined;
    const day = typeof env?.day === "number" ? `Day ${env.day}` : "";
    when.textContent = [seasonName(env), day].filter(Boolean).join(" · ");
    time.textContent = t || "";
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
