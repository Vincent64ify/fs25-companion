// FS25 Companion dashboard (vanilla JS, no build step)
//
// URL parameters:
//   ?pair=123456   pairing code (optional with a local backend, which
//                  advertises its code at /api/info)
//   ?map=…         force a map config id (optional; normally the map is
//                  chosen from the mod's hello message -> maps/<mapId>.json)
//   ?backend=…     relay WebSocket URL (optional; default is the page's
//                  own origin — the backend serves this dashboard, so
//                  it usually just works. Only needed if you host the
//                  dashboard elsewhere, e.g. `python -m http.server`.)

const params = new URLSearchParams(location.search);
const PAIR = (params.get("pair") || "").trim();
const MAP_OVERRIDE = params.get("map");   // optional: force a map config id
const BACKEND = params.get("backend") ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

const WEATHER_NAMES = ["Sunny", "Light clouds", "Cloudy", "Fog", "Rain", "Storm"];

const state = {
  pos: null,      // {x, z}
  heading: 0,
};

let mapConfig = null;    // config of the currently loaded map image
let mapLoading = null;   // map id whose config fetch is in flight
const mapMissing = new Map();  // map id -> time of the last failed fetch
const MAP_RETRY_MS = 3000;     // the client may still be importing the map
let mapImage = null;

// --- DOM ---------------------------------------------------------------

const $ = (id) => document.getElementById(id);
const els = {
  conn: $("connection"),
  hint: $("map-hint"),
  vehicleName: $("vehicle-name"),
  speed: $("speed"), rpm: $("rpm"), gear: $("gear"),
  fuel: $("fuel"), wear: $("wear"), temp: $("temp"),
  hours: $("hours"), pos: $("pos"),
  weather: $("weather"), temperature: $("temperature"),
  clock: $("clock"), day: $("day"), money: $("money"),
  mapName: $("map-name"), playerName: $("player-name"),
  implCard: $("impl-card"), impls: $("implements"),
  banner: $("banner"),
};

// --- map ---------------------------------------------------------------

async function fetchMapConfig(id) {
  const res = await fetch(`maps/${encodeURIComponent(id)}.json`, { cache: "no-store" });
  if (!res.ok) throw new Error(res.status);
  return res.json();
}

function applyMapConfig(cfg) {
  mapConfig = cfg;
  mapImage = new Image();
  mapImage.onload = draw;
  mapImage.src = cfg.image;
}

// Which map to show: an explicit ?map= override wins; otherwise the map the
// mod reports in hello (the client imports its assets into web/maps/ when
// that hello arrives, so a missing config is retried for a while).
function ensureMap(id) {
  if (!id) return;
  if (mapConfig && mapConfig.id !== id) {
    // another savegame: never draw this map's position on the old image
    mapConfig = null;
    mapImage = null;
  }
  if (mapConfig || mapLoading === id) return;
  if (Date.now() - (mapMissing.get(id) || 0) < MAP_RETRY_MS) return;
  mapLoading = id;
  fetchMapConfig(id)
    .then((cfg) => {
      mapMissing.delete(id);
      if (mapLoading === id) applyMapConfig(cfg);
    })
    .catch(() => mapMissing.set(id, Date.now()))
    .finally(() => { if (mapLoading === id) mapLoading = null; });
}

// The world→image mapping uses the map image's "view" rectangle: the part
// of the texture that corresponds to the playable terrain. The FS25 PDA
// overview image covers *twice* the terrain size, so the playable area is
// the central quarter of the texture (e.g. texture 1024..3072 of 4096 for
// a 2048 world) — the outer ring (clouds/vignette) is never displayed by
// the game. Configs without a view rect map over the whole image.
function mapView(p) {
  if (p.view) return p.view;
  return { x: 0, y: 0, w: p.imageWidth, h: p.imageHeight };
}

function worldToImage(x, z) {
  const p = mapConfig.projection;
  if (mapConfig.flipX) x = p.worldMinX + p.worldMaxX - x;
  if (mapConfig.flipZ) z = p.worldMinZ + p.worldMaxZ - z;
  const v = mapView(p);
  let ix = (x - p.worldMinX) / (p.worldMaxX - p.worldMinX) * v.w;
  let iy = (z - p.worldMinZ) / (p.worldMaxZ - p.worldMinZ) * v.h;
  const rot = ((mapConfig.rotateDeg || 0) % 360 + 360) % 360;
  if (rot) {
    // rotate around the view centre (calibration knob in <id>.json)
    const rad = rot * Math.PI / 180;
    const cx = v.w / 2, cy = v.h / 2;
    const a = Math.atan2(iy - cy, ix - cx);
    const r = Math.hypot(ix - cx, iy - cy);
    ix = cx + r * Math.cos(a + rad);
    iy = cy + r * Math.sin(a + rad);
  }
  return [ix, iy];
}

function resizeCanvas() {
  const canvas = $("map");
  const wrap = canvas.parentElement;
  canvas.width = wrap.clientWidth;
  canvas.height = wrap.clientHeight;
  draw();
}

function draw() {
  const canvas = $("map");
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!mapImage || !mapImage.complete || !mapImage.naturalWidth) return;

  // display only the playable view rect of the texture (1:1 with the
  // in-game PDA, which crops away the outer clouds/vignette ring)
  const v = mapView(mapConfig.projection);
  const scale = Math.min(W / v.w, H / v.h);
  const ox = (W - v.w * scale) / 2;
  const oy = (H - v.h * scale) / 2;
  ctx.drawImage(mapImage, v.x, v.y, v.w, v.h, ox, oy, v.w * scale, v.h * scale);

  const toScreen = (wx, wz) => {
    const [ix, iy] = worldToImage(wx, wz);
    return [ox + ix * scale, oy + iy * scale];
  };

  if (state.pos) {
    const [px, py] = toScreen(state.pos.x, state.pos.z);
    // position arrow: drawn as if the world pivot sits at the vehicle, tip
    // pointing where it faces (the old full-image "offset" was eventually
    // traced to the projection bug, so the arrow can be centered again)
    ctx.save();
    ctx.translate(px, py);
    // heading: 0 = north (up on the map), clockwise; headingOffset and
    // rotateDeg are calibration knobs in the map config (rotateDeg rotates
    // the image, so "north on the image" turns with it)
    ctx.rotate(((state.heading + (mapConfig.headingOffset || 0) +
                 (mapConfig.rotateDeg || 0)) % 360) * Math.PI / 180);
    ctx.beginPath();
    ctx.moveTo(0, -11);
    ctx.lineTo(8, 9);
    ctx.lineTo(0, 4);
    ctx.lineTo(-8, 9);
    ctx.closePath();
    ctx.fillStyle = "#22d3ee";
    ctx.strokeStyle = "#0e7490";
    ctx.lineWidth = 1.5;
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
}

// --- topics ------------------------------------------------------------
//
// The backend sends a snapshot of every topic on connect (and when a new
// game session starts), then one update per envelope. Each topic is "latest
// wins": topics.player is the last player envelope's data, and so on.

let topics = {};
let lastUpdateAt = 0;
let clientConnected = false;
const STALE_MS = 5000;

function onSnapshot(envelopes) {
  topics = {};
  for (const [topic, envelope] of Object.entries(envelopes)) {
    topics[topic] = envelope.data;
  }
  if (Object.keys(topics).length) lastUpdateAt = Date.now();
  render();
}

function onUpdate(envelope) {
  topics[envelope.topic] = envelope.data;
  lastUpdateAt = Date.now();
  if (envelope.topic === "player") onPlayer(envelope.data);
  render();
}

function onPlayer(p) {
  if (typeof p.x === "number" && typeof p.z === "number") {
    state.pos = { x: p.x, z: p.z };
    if (typeof p.heading === "number") state.heading = p.heading;
  }
}

const fmt = (v, digits = 0) => (typeof v === "number" ? v.toFixed(digits) : "–");

function render() {
  const hello = topics.hello || {};
  const player = topics.player || {};
  const env = topics.env || {};
  const weather = env.weather || {};
  const vehicles = (topics.vehicles && topics.vehicles.vehicles) || [];
  const controlledId = topics.vehicles && topics.vehicles.controlledId;
  const v = vehicles.find((x) => x.id === controlledId);

  ensureMap(MAP_OVERRIDE || hello.mapId || hello.mapTitle);
  onPlayer(player);

  els.vehicleName.textContent = v ? (v.name || v.typeName || "Vehicle") : "On foot";
  els.speed.textContent = v ? fmt(v.speed) : "–";
  els.rpm.textContent = v ? fmt(v.rpm) : "–";
  els.gear.textContent = v && v.gear != null ? v.gear : "–";
  els.fuel.textContent = v && v.fuelCapacity > 0
    ? Math.round(100 * (v.fuel / v.fuelCapacity)) + "%" : "–";
  els.wear.textContent = v && typeof v.wear === "number" ? Math.round(100 * v.wear) + "%" : "–";
  els.temp.textContent = v && typeof v.motorTemp === "number" ? Math.round(v.motorTemp) + "°C" : "–";
  els.hours.textContent = v && typeof v.operatingHours === "number"
    ? v.operatingHours.toFixed(1) + " h" : "–";
  els.pos.textContent = state.pos ? `${fmt(state.pos.x)}, ${fmt(state.pos.z)}` : "–";

  els.weather.textContent = typeof weather.current === "number"
    ? (WEATHER_NAMES[weather.current] || "–") : (weather.current || "–");
  els.temperature.textContent = typeof weather.tempMin === "number"
    ? `${Math.round(weather.tempMin)} / ${Math.round(weather.tempMax)}°C` : "–";
  const mins = env.dayTimeMinutes;
  els.clock.textContent = typeof mins === "number"
    ? `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`
    : "–";
  els.day.textContent = env.day ?? "–";
  const farmId = String(hello.farmId ?? player.farmId ?? 1);
  const money = env.money && env.money[farmId];
  els.money.textContent = typeof money === "number" ? "$" + Math.round(money).toLocaleString() : "–";
  els.mapName.textContent = hello.mapTitle || hello.mapId || "–";
  els.playerName.textContent = hello.playerName || "–";

  const impls = (v && v.implements) || [];
  els.implCard.hidden = impls.length === 0;
  els.impls.replaceChildren(...impls.map((impl) => {
    const bits = [];
    if (impl.lowered) bits.push("lowered");
    if (impl.turnedOn) bits.push("on");
    if (impl.wear > 0) bits.push(`wear ${Math.round(100 * impl.wear)}%`);
    const li = document.createElement("li");
    li.textContent = "  ".repeat(Math.max(0, (impl.depth || 1) - 1)) +
      (impl.name || "Implement") + (bits.length ? " — " + bits.join(", ") : "");
    return li;
  }));

  updateStatus();
  draw();
}

// --- connection --------------------------------------------------------

function setStatus(text, kind) {
  els.conn.textContent = text;
  els.conn.className = "conn " + kind;
}

function updateStatus() {
  if (!clientConnected) {
    setStatus("companion offline", "disconnected");
  } else if (Date.now() - lastUpdateAt > STALE_MS) {
    setStatus("waiting for game", "waiting");
  } else {
    setStatus("live", "connected");
  }
  els.hint.hidden = Object.keys(topics).length > 0;
}

function showBanner(message) {
  els.banner.textContent = message || "";
  els.banner.hidden = !message;
}

async function resolvePairing() {
  if (PAIR) return PAIR;
  // a backend started by the client with --local advertises its code
  try {
    const info = await (await fetch("api/info", { cache: "no-store" })).json();
    return info.localPairing || "";
  } catch {
    return "";
  }
}

function connect(pair) {
  const ws = new WebSocket(`${BACKEND}/ws?pair=${encodeURIComponent(pair)}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: "hello", role: "viewer" }));
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "snapshot") onSnapshot(msg.topics || {});
    else if (msg.type === "update") onUpdate(msg.envelope);
    else if (msg.type === "client_status") { clientConnected = msg.connected; updateStatus(); }
    else if (msg.type === "protocol_error") showBanner(msg.message);
  };
  ws.onclose = () => {
    clientConnected = false;
    setStatus("backend offline", "disconnected");
    setTimeout(() => connect(pair), 2000);
  };
  ws.onerror = () => ws.close();
}

window.addEventListener("resize", resizeCanvas);
if (MAP_OVERRIDE) ensureMap(MAP_OVERRIDE);  // static choice without telemetry
resizeCanvas();
setInterval(() => {
  updateStatus();
  // retry a map whose assets are still being imported
  if (!mapConfig && topics.hello) ensureMap(MAP_OVERRIDE || topics.hello.mapId);
}, 1000);
resolvePairing().then((pair) => {
  if (pair) connect(pair);
  else setStatus("no pairing code (?pair=…)", "disconnected");
});
