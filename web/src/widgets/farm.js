// @ts-check
// The farm and the session: weather, time, money, map and player name.

import { valueWidget } from "./widget.js";
import { clock as clockOf, farmMoney, temperatureRange, weatherName } from "../data/selectors.js";

export const weather = valueWidget({
  label: "Weather", topics: ["env"],
  read: (store) => weatherName(store.get("env")),
  text: String,
});

export const temperature = valueWidget({
  label: "Temp", unit: "°C", topics: ["env"],
  read: (store) => temperatureRange(store.get("env")),
  text: ([min, max]) => `${Math.round(min)} / ${Math.round(max)}°C`,
  number: ([min, max]) => `${Math.round(min)} / ${Math.round(max)}`,
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
  text: (v) => "$" + Math.round(v).toLocaleString(),
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
