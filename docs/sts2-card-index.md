# STS2 Card Index

Generated from the uploaded card JSON folder. This is the format we should use for future card-aware tasks.

## Files

- `resources/cards/sts2-cards-full.json`: complete bundle with arrays, counts, alias lookup, and card text.
- `resources/cards/sts2-cards-by-save-id.json`: direct lookup by save-file id, e.g. `CARD.BASH`.
- `resources/cards/sts2-cards.jsonl`: one card per line, convenient for streaming/search tools.
- `resources/cards/sts2-cards.csv`: spreadsheet-friendly summary.
- Generator: `scripts/build-card-index.js`.

## Save-file mapping

Save JSON uses ids like `CARD.STRIKE_IRONCLAD`. The index derives `save_id` from the database card `key` by converting CamelCase to SCREAMING_SNAKE and adding `CARD.`.

Examples:

- CARD.STRIKE_IRONCLAD => StrikeIronclad / 打击 / Strike / Ironclad / Basic / Attack
- CARD.DEFEND_IRONCLAD => DefendIronclad / 防御 / Defend / Ironclad / Basic / Skill
- CARD.BASH => Bash / 痛击 / Bash / Ironclad / Basic / Attack
- CARD.IMPERVIOUS => Impervious / 岿然不动 / Impervious / Ironclad / Rare / Skill

## Counts

Total cards: **577**

### Category

- Colorless: 64
- Curse: 18
- Defect: 88
- Deprecated: 1
- Event: 27
- Ironclad: 87
- Necrobinder: 88
- Quest: 3
- Regent: 88
- Silent: 88
- Status: 11
- Token: 14

### Rarity

- Ancient: 18
- Basic: 19
- Common: 100
- Curse: 18
- Deprecated: 1
- Event: 17
- Quest: 3
- Rare: 155
- Status: 15
- Token: 10
- Uncommon: 220
- Unknown: 1

### Type

- (blank): 1
- Attack: 197
- Curse: 18
- Power: 112
- Quest: 3
- Skill: 230
- Status: 15
- Unknown: 1
