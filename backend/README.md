# Relay backend

Tiny FastAPI WebSocket relay. One game client and any number of browser
viewers per pairing code. No accounts, no persistence — everything lives in
memory.

## Run

```bash
pip install -r requirements.txt
python -m uvicorn main:app --host 0.0.0.0 --port 8123
```

## Deploy

Any WebSocket-capable PaaS works (Railway, Fly.io, Render, a VPS with a
reverse proxy). The app needs no environment variables. Make sure the
platform supports WebSockets (most do by default) and that the client and
browser can reach the same host.

## Protocol

See the docstring in `main.py`. The pairing code is whatever the client was
started with (or a random 6 digits it prints). The dashboard is opened with
`?pair=<CODE>`.
