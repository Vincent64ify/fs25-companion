// @ts-check
// Farm card: weather, time, money, map and player name.

import { $, fmt } from "./dom.js";

const WEATHER_NAMES = ["Sunny", "Light clouds", "Cloudy", "Fog", "Rain", "Storm"];

/** @param {import("../store.js").Store} store */
export function createEnvPanel(store) {
  const els = {
    weather: $("weather"), temperature: $("temperature"), clock: $("clock"),
    day: $("day"), money: $("money"), mapName: $("map-name"), playerName: $("player-name"),
  };

  function render() {
    const hello = store.get("hello") || {};
    const player = store.get("player") || {};
    const env = store.get("env") || {};
    const weather = env.weather || {};

    els.weather.textContent = typeof weather.current === "number"
      ? (WEATHER_NAMES[weather.current] || "–") : (weather.current || "–");
    els.temperature.textContent = typeof weather.tempMin === "number"
      ? `${Math.round(weather.tempMin)} / ${Math.round(weather.tempMax)}°C` : "–";
    const mins = env.dayTimeMinutes;
    els.clock.textContent = typeof mins === "number"
      ? `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
      : "–";
    els.day.textContent = env.day != null ? String(env.day) : "–";
    const farmId = String(hello.farmId ?? player.farmId ?? 1);
    const money = env.money && env.money[farmId];
    els.money.textContent = typeof money === "number" ? "$" + Math.round(money).toLocaleString() : "–";
    els.mapName.textContent = hello.mapTitle || hello.mapId || "–";
    els.playerName.textContent = hello.playerName || "–";
  }

  store.subscribe("hello", render);
  store.subscribe("env", render);
  store.subscribe("player", render);
}
