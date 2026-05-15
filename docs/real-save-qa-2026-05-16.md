# Real save upload QA - 2026-05-16

This run specifically tested the save-submission evaluator using real `run/history/*.run` and `run/current_run.save` files supplied in the repository.

## Selected winning saves

| file | seed | ascension | character | result | time | badges | relics | deck |
|---|---:|---:|---|---|---:|---:|---:|---:|
| `run/history/1778432003.run` | `EVKMHYSCV6` | 9 | `CHARACTER.REGENT` | win | 3589s | 3 | 10 | 27 |
| `run/history/1773239971.run` | `10RZFTGHF6` | 5 | `CHARACTER.NECROBINDER` | win | 1449s | 0 | 20 | 17 |
| `run/history/1773367785.run` | `7UGETWZXCQ` | 6 | `CHARACTER.REGENT` | win | 1450s | 0 | 22 | 23 |

## Normal mode test

Created a disposable room with exactly these three seeds, ascensions, and characters:

1. `EVKMHYSCV6`, A9, Regent
2. `10RZFTGHF6`, A5, Necrobinder
3. `7UGETWZXCQ`, A6, Regent

Set `k = 3`, started the room, and submitted the three real save files with three same-team users to avoid the 5-minute per-user cooldown.

Result:

- save 1 claimed `seed0`
- save 2 claimed `seed1`
- save 3 claimed `seed2`
- room ended with `winnerTeamId = team1`

## Negative normal-mode tests

- Submitted `1778432003.run` to a room with the same seed and character but wrong ascension: correctly rejected.
- Submitted `run/current_run.save` to a room with its exact current seed/ascension/character: correctly rejected because the save is unfinished / not won.

## Task mode test

Created a disposable task-mode room with exact seeds for:

- `EVKMHYSCV6`, A9, Regent
- `10RZFTGHF6`, A5, Necrobinder

Patched the task board deterministically for QA and submitted the real saves.

Expected and observed passes:

- `1778432003.run` passed:
  - `D01`: win with >=1 badge
  - `C01`: win with >=3 badges
  - `D02`: win within 75 minutes
  - `D04`: have >=10 relics
- `1773239971.run` passed:
  - `B02`: win within 30 minutes
  - `B06`: have >=20 relics
  - `C06`: win with <=20 cards
  - `C05`: have >=15 relics

## Summary

14 real-save submission checks passed; no failures. Disposable QA accounts, rooms, and submissions were removed from production data after the test.
