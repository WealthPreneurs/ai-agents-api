# ai-agents-api
Ai consulting agents automation API

## Setup

```bash
npm install
cp .env.example .env   # add your real Anthropic key
npm start
```

The server starts on `http://localhost:3000` (override with `PORT`).
Health check: `GET /health`. Agent endpoint: `POST /agent` with a JSON body
of `{ "agent": "<name>", "message": "<text>" }`.
