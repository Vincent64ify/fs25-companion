# Backend

FastAPI app: pairing relay, per-session state store, and the dashboard's
web server. No accounts; the only thing kept on disk is uploaded map
images (`--assets-dir`, default `~/.fs25-companion/assets`).

## Run

From the repository root:

```bash
pip install -r backend/requirements.txt
python -m backend.app.main            # http://localhost:8123
```

Locally you usually don't run it yourself: `companion_client.py --local`
starts it in-process.

## Layout

```
app/main.py         app factory, /api/info, static dashboard
app/protocol.py     pydantic models: the envelope and each known topic
app/state_store.py  latest envelope per topic; a new sessionId resets it
app/sessions.py     pairing sessions (one client, many viewers)
app/ws.py           /ws?pair=<code> endpoint
app/assets.py       PUT/GET /api/maps/<mapId>/<hash>/<file>
```

## Protocol

See the docstring in `app/ws.py`. A viewer gets a `snapshot` of every
topic on connect, then one `update` per envelope. Envelopes with another
protocol version are rejected, and viewers get a `protocol_error` asking
to update the mod. Unknown topics pass through with only the envelope
validated, so a new collector needs no backend change.

Map images: the backend answers a client's hello with a `welcome` holding a
token. Only that token (while the client is connected) may `PUT` files to
`/api/maps/<mapId>/<hash>/{overview.png, overview_2048.png, meta.json}`.
Files are content-addressed, never replaced, and served with an immutable
cache header. The client then sends `map_assets` with the hash, and viewers
get it live and on connect.

## Deploy

Any host with WebSocket support (Railway, Fly.io, Render, a VPS behind a
reverse proxy). Start command: `python -m backend.app.main --port $PORT --assets-dir <persistent volume>`.

## Tests

```bash
python -m pytest backend/tests
```
