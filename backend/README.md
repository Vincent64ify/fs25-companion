# Backend

FastAPI app: pairing relay, per-session state store, and the dashboard's
web server. No accounts, no persistence.

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
```

## Protocol

See the docstring in `app/ws.py`. A viewer gets a `snapshot` of every
topic on connect, then one `update` per envelope. Envelopes with another
protocol version are rejected, and viewers get a `protocol_error` asking
to update the mod. Unknown topics pass through with only the envelope
validated, so a new collector needs no backend change.

## Deploy

Any host with WebSocket support (Railway, Fly.io, Render, a VPS behind a
reverse proxy). Start command: `python -m backend.app.main --port $PORT`.

## Tests

```bash
python -m pytest backend/tests
```
