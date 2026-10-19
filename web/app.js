// FS25 Companion dashboard (vanilla JS, no build step)
//
// URL parameters:
//   ?pair=123456   pairing code (required)
//   ?map=amdream   map config id (see maps/<id>.json)
//   ?backend=…     relay WebSocket URL (optional; default is the page's
//                  own origin — the backend serves this dashboard, so
//                  it usually just works. Only needed if you host the
//                  dashboard elsewhere, e.g. `python -m http.server`.)

const params = new URLSearchParams(location.search);
const PAIR = (params.get("pair") || "").trim();
const MAP_ID = params.get("map") || "amdream";
const BACKEND = params.get("backend") ||
  `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}`;

const WEATHER_NAMES = ["Sunny", "Light clouds", "Cloudy", "Fog", "Rain", "Storm"];

const state = {
  pos: null,      // {x, z}
  heading: 0,
  trail: [],
};

let mapConfig = null;
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
};

function setConn(connected) {
  els.conn.textContent = connected ? "connected" : "disconnected";
  els.conn.className = "conn " + (connected ? "connected" : "disconnected");
  if (connected) els.hint.hidden = true;
}

// --- map ---------------------------------------------------------------

async function loadMap() {
  try {
    const res = await fetch(`maps/${MAP_ID}.json`, { cache: "no-store" });
    if (!res.ok) throw new Error(res.status);
    mapConfig = await res.json();
  } catch (e) {
    console.warn(`could not load map config "${MAP_ID}":`, e);
    return;
  }
  mapImage = new Image();
  mapImage.src = mapConfig.image;
  mapImage.onload = draw;
}

function worldToImage(x, z) {
  const p = mapConfig.projection;
  return [
    (x - p.worldMinX) / (p.worldMaxX - p.worldMinX) * p.imageWidth,
    (z - p.worldMinZ) / (p.worldMaxZ - p.worldMinZ) * p.imageHeight,
  ];
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

  const scale = Math.min(W / mapImage.naturalWidth, H / mapImage.naturalHeight);
  const ox = (W - mapImage.naturalWidth * scale) / 2;
  const oy = (H - mapImage.naturalHeight * scale) / 2;
  ctx.drawImage(mapImage, ox, oy, mapImage.naturalWidth * scale, mapImage.naturalHeight * scale);

  const toScreen = (wx, wz) => {
    const [ix, iy] = worldToImage(wx, wz);
    return [ox + ix * scale, oy + iy * scale];
  };

  if (state.trail.length > 1) {
    ctx.beginPath();
    state.trail.forEach(([x, z], i) => {
      const [px, py] = toScreen(x, z);
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.strokeStyle = "rgba(255, 193, 7, 0.8)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  if (state.pos) {
    const [px, py] = toScreen(state.pos.x, state.pos.z);
    ctx.save();
    ctx.translate(px, py);
    // heading: 0 = north (up), clockwise; calibrate via mapConfig.headingOffset
    ctx.rotate(((state.heading + (mapConfig.headingOffset || 0)) % 360) * Math.PI / 180);
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

// --- telemetry ---------------------------------------------------------

function onTelemetry(d) {
  const x = d.PositionX, z = d.PositionZ;
  if (typeof x === "number" && typeof z === "number") {
    const prev = state.pos;
    state.pos = { x, z };
    state.heading = d.Heading || 0;
    if (!prev || Math.hypot(x - prev.x, z - prev.z) > 0.5) {
      state.trail.push([x, z]);
      if (state.trail.length > 3000) state.trail.shift();
    }
  }

  const driving = d.IsDrivingVehicle;
  els.vehicleName.textContent = driving ? (d.VehicleName || "Vehicle") : "On foot";
  els.speed.textContent = driving ? Math.round(d.Speed || 0) : "–";
  els.rpm.textContent = driving ? Math.round(d.RPM || 0) : "–";
  els.gear.textContent = driving ? (d.Gear || 0) : "–";
  els.fuel.textContent = driving && d.FuelMax > 0
    ? Math.round(100 * (d.Fuel / d.FuelMax)) + "%" : "–";
  els.wear.textContent = driving ? Math.round(100 * (d.Wear || 0)) + "%" : "–";
  els.temp.textContent = driving && d.MotorTemperature
    ? Math.round(d.MotorTemperature) + "°C" : "–";
  els.hours.textContent = driving && d.OperationTimeMinutes
    ? (d.OperationTimeMinutes / 60).toFixed(1) + " h" : "–";
  els.pos.textContent = state.pos ? `${x.toFixed(0)}, ${z.toFixed(0)}` : "–";

  els.weather.textContent = WEATHER_NAMES[d.WeatherCurrent] || "–";
  els.temperature.textContent =
    `${Math.round(d.TemperatureMin || 0)} / ${Math.round(d.TemperatureMax || 0)}°C`;
  const mins = d.DayTimeMinutes || 0;
  els.clock.textContent =
    `${String(Math.floor(mins / 60) % 24).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
  els.day.textContent = d.Day || "–";
  els.money.textContent = "$" + Math.round(d.Money || 0).toLocaleString();
  els.mapName.textContent = d.MapName || "–";
  els.playerName.textContent = d.PlayerName || "–";

  // implements: tables arrive as arrays aligned by slot index
  const slots = d.AttachedImplementsPosition || [];
  if (slots.length) {
    els.implCard.hidden = false;
    els.impls.innerHTML = slots.map((slot, i) => {
      const lowered = (d.AttachedImplementsLowered || [])[i];
      const on = (d.AttachedImplementsTurnedOn || [])[i];
      const wear = (d.AttachedImplementsWear || [])[i];
      const bits = [];
      if (lowered) bits.push("lowered");
      if (on) bits.push("on");
      if (wear > 0) bits.push(`wear ${Math.round(100 * wear)}%`);
      return `<li>slot ${slot}${bits.length ? " — " + bits.join(", ") : ""}</li>`;
    }).join("");
  } else {
    els.implCard.hidden = true;
  }

  draw();
}

// --- websocket ---------------------------------------------------------

function connect() {
  if (!PAIR) {
    els.conn.textContent = "no pairing code (?pair=…)";
    els.conn.className = "conn disconnected";
    return;
  }
  const ws = new WebSocket(`${BACKEND}/ws?pair=${encodeURIComponent(PAIR)}`);
  ws.onopen = () => {
    setConn(true);
    ws.send(JSON.stringify({ type: "hello", role: "viewer" }));
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    if (msg.type === "telemetry") onTelemetry(msg.data);
    else if (msg.type === "client_status") setConn(msg.connected);
  };
  ws.onclose = () => { setConn(false); setTimeout(connect, 2000); };
  ws.onerror = () => ws.close();
}

window.addEventListener("resize", resizeCanvas);
loadMap();
resizeCanvas();
connect();
