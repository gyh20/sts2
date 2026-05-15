# New task ideas (design only)

These are proposed additions only. They are **not** added to `tasks/catalog.json` and no evaluator code has been written for them yet.

## Seed / run completion tasks

- **Win streak:** Complete 2 different seeds in a row without a failed submission between them.
- **Comeback:** Win a run that at some point dropped to 10 HP or lower.
- **No reload run:** Win with `num_reloads == 0` when the field is present.
- **High ascension sweep:** Complete every generated seed at ascension 10.
- **Mixed roster:** Across all generated seeds, win with at least 3 different characters.

## Combat tasks

- **Perfect elite:** Defeat an elite while taking 0 damage.
- **Fast elites:** Defeat all elites in a winning run with <=3 turns each.
- **Long normal fight:** Have any non-boss combat last >=15 turns and still win the run.
- **No potion boss:** Win a boss fight without using a potion in that room.
- **Potion clutch:** Use at least 3 potions in one act and win the run.

## Deckbuilding tasks

- **Single-card stack:** End with at least 6 copies of the same non-starter card.
- **Starter purge:** Win after removing all basic Strike/Defend starter cards.
- **Starter loyalist:** Win while keeping every starter card and upgrading at least 3 of them.
- **No attacks / no skills / no powers:** Win while final deck contains no cards of a selected type. Needs card type data.
- **Tiny upgraded deck:** Win with <=12 cards and every non-curse card upgraded.

## Relic / economy tasks

- **Shopaholic:** Spend at least 1000 gold across shops in one run.
- **Big saver:** Finish with >=500 gold without buying any shop relics.
- **Relic collector by act:** Have at least 5 relics by the end of Act 1.
- **No shop:** Win without entering any shop room.
- **Potion economy:** Finish a winning run with all potion slots filled.

## Map / route tasks

- **Elite hunter:** Defeat at least 4 elites in a winning run.
- **Campfire smith:** Upgrade at every rest site visited and win.
- **Campfire rest:** Rest/heal at every rest site visited and win.
- **Eventful run:** Visit at least 8 event/unknown rooms and win.
- **Treasure route:** Open at least 4 treasure rooms in one run.

## Badge / aggregate tasks

- **Badge diversity:** Across all seeds, collect at least one badge of each rarity present in the save format.
- **Team badge pool:** Team collectively reaches `6n` total badges across `n` seeds.
- **Perfect badges:** Win a run with both a speed badge and a no-damage/perfect badge if those badge IDs are confirmed.

## UI/game-mode ideas

- **Hidden board mode:** Tasks are hidden until a team first submits a matching seed.
- **Drafted tasks:** Room owner drafts tasks from 3 random choices per square instead of pure random generation.
- **Bounty square:** One random square is worth 2 cells / 2 line credits.
- **Sudden death:** If time expires, the team with most cells wins; tie-breaker is earliest latest completion.

## Data needed before implementation

- Reliable card rarity/type mapping for STS2 cards.
- Confirmed starter card IDs for every character.
- More examples of potion usage, shop purchases, boss reward skip records, reload fields, and multiplayer save structures.
