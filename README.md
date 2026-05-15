# STS2 Bingo

A lightweight Slay the Spire 2 bingo/lockout web app served under `/sts2`.

## Features

- Login/register with arbitrary local accounts.
- Create/join rooms by ID/link, up to 4 players.
- Team switching, host-only settings.
- Normal mode: seed checklist, first team to complete `k` seeds wins.
- Task mode: 5x5 bingo board generated from S/A/B/C/D task library.
- Optional lockout: first completion owns a cell.
- Save-file JSON evaluation with 5 minute per-player cooldown.
- Submission detail pages; private to same team until the game ends.

## Run

```bash
PORT=8790 node server.js
```

The production deployment proxies `http://118.196.11.126/sts2` to this local service.

## Data

Runtime data is stored in `data/db.json` and is intentionally git-ignored.

## Task library

`tasks/catalog.json` is the canonical task list. Individual task descriptions are generated in `tasks/*.md`. Evaluator code is in `server.js` inside `evalTask`.
