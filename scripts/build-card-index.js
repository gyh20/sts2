const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const defaultSourceDir = path.resolve(root, '..', 'sts2_database', 'cards');
const cardsDir = path.resolve(process.argv[2] || defaultSourceDir);
const outDir = path.join(root, 'resources', 'cards');
const docsDir = path.join(root, 'docs');

function camelToScreamingSnake(key) {
  return String(key)
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
}

function saveIdForKey(key) {
  return `CARD.${camelToScreamingSnake(key)}`;
}

function cleanText(s) {
  return String(s || '')
    .replace(/\[\/?.+?\]/g, '')
    .replace(/\{[^}]+\}/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function csvCell(value) {
  const s = value == null ? '' : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function countBy(cards, field) {
  const m = new Map();
  for (const c of cards) m.set(c[field] || '(blank)', (m.get(c[field] || '(blank)') || 0) + 1);
  return Object.fromEntries([...m.entries()].sort((a, b) => String(a[0]).localeCompare(String(b[0]))));
}

if (!fs.existsSync(cardsDir)) {
  throw new Error(`cards dir not found: ${cardsDir}`);
}

fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(docsDir, { recursive: true });

const files = fs.readdirSync(cardsDir).filter(f => f.endsWith('.json')).sort((a, b) => a.localeCompare(b));
const cards = [];
for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf8'));
  const c = raw.card || {};
  const keywords = Array.isArray(c.variables?.keywords) ? c.variables.keywords : [];
  const key = c.key || path.basename(file, '.json');
  const save_id = saveIdForKey(key);
  const text_default_chs = c.text_default_chs || '';
  const text_upgraded_chs = c.text_upgraded_chs || '';
  const text_raw_chs = c.text_raw_chs || '';
  const text_raw_eng = c.text_raw_eng || '';
  const item = {
    save_id,
    key,
    file,
    aliases: [save_id, key, c.name_eng, c.name_chs].filter(Boolean),
    name_chs: c.name_chs || '',
    name_eng: c.name_eng || '',
    category: c.category || '',
    rarity: c.rarity || '',
    type: c.type || '',
    cost: c.cost,
    target_type: c.targetType || '',
    keywords,
    text: {
      default_chs: text_default_chs,
      upgraded_chs: text_upgraded_chs,
      raw_chs: text_raw_chs,
      raw_eng: text_raw_eng,
      default_chs_plain: cleanText(text_default_chs),
      upgraded_chs_plain: cleanText(text_upgraded_chs),
    },
    variables: c.variables || {},
    upgrades: c.upgrades || {},
    search_text: [save_id, key, c.name_chs, c.name_eng, c.category, c.rarity, c.type, keywords.join(' '), cleanText(text_default_chs), cleanText(text_upgraded_chs), cleanText(text_raw_eng)]
      .filter(Boolean)
      .join(' | '),
  };
  cards.push(item);
}

cards.sort((a, b) => {
  const ca = a.category.localeCompare(b.category);
  if (ca) return ca;
  const ra = a.rarity.localeCompare(b.rarity);
  if (ra) return ra;
  return a.key.localeCompare(b.key);
});

const bySaveId = Object.fromEntries(cards.map(c => [c.save_id, c]));
const byKey = Object.fromEntries(cards.map(c => [c.key, c.save_id]));
const aliasToSaveId = {};
for (const card of cards) {
  for (const alias of card.aliases) {
    aliasToSaveId[String(alias)] = card.save_id;
    aliasToSaveId[String(alias).toLowerCase()] = card.save_id;
  }
}

const sourceGameVersions = {};
for (const file of files) {
  const raw = JSON.parse(fs.readFileSync(path.join(cardsDir, file), 'utf8'));
  sourceGameVersions[raw.game_version || 'unknown'] = (sourceGameVersions[raw.game_version || 'unknown'] || 0) + 1;
}

const bundle = {
  schema_version: 1,
  generated_at: new Date().toISOString(),
  source: {
    cards_dir: path.relative(root, cardsDir).startsWith('..') ? cardsDir : path.relative(root, cardsDir),
    game_versions: sourceGameVersions,
    note: 'save_id is derived from card.key to match STS2 save JSON ids such as CARD.STRIKE_IRONCLAD.',
  },
  count: cards.length,
  counts: {
    category: countBy(cards, 'category'),
    rarity: countBy(cards, 'rarity'),
    type: countBy(cards, 'type'),
  },
  fields: ['save_id', 'key', 'name_chs', 'name_eng', 'category', 'rarity', 'type', 'cost', 'target_type', 'keywords', 'text', 'variables', 'upgrades', 'search_text'],
  cards,
  by_key: byKey,
  alias_to_save_id: aliasToSaveId,
};

fs.writeFileSync(path.join(outDir, 'sts2-cards-full.json'), JSON.stringify(bundle, null, 2));
fs.writeFileSync(path.join(outDir, 'sts2-cards-by-save-id.json'), JSON.stringify(bySaveId, null, 2));
fs.writeFileSync(path.join(outDir, 'sts2-cards.jsonl'), cards.map(c => JSON.stringify(c)).join('\n') + '\n');

const csvFields = ['save_id', 'key', 'name_chs', 'name_eng', 'category', 'rarity', 'type', 'cost', 'target_type', 'keywords', 'default_chs', 'upgraded_chs'];
const csv = [csvFields.join(',')]
  .concat(cards.map(c => [
    c.save_id,
    c.key,
    c.name_chs,
    c.name_eng,
    c.category,
    c.rarity,
    c.type,
    c.cost,
    c.target_type,
    c.keywords.join('|'),
    c.text.default_chs_plain,
    c.text.upgraded_chs_plain,
  ].map(csvCell).join(',')))
  .join('\n') + '\n';
fs.writeFileSync(path.join(outDir, 'sts2-cards.csv'), csv);

const cats = Object.entries(bundle.counts.category).map(([k, v]) => `- ${k}: ${v}`).join('\n');
const rarities = Object.entries(bundle.counts.rarity).map(([k, v]) => `- ${k}: ${v}`).join('\n');
const types = Object.entries(bundle.counts.type).map(([k, v]) => `- ${k}: ${v}`).join('\n');
const sampleKeys = ['CARD.STRIKE_IRONCLAD', 'CARD.DEFEND_IRONCLAD', 'CARD.BASH', 'CARD.IMPERVIOUS'];
const samples = sampleKeys.map(id => {
  const c = bySaveId[id];
  return c ? `- ${id} => ${c.key} / ${c.name_chs} / ${c.name_eng} / ${c.category} / ${c.rarity} / ${c.type}` : `- ${id} => (not found)`;
}).join('\n');
const doc = `# STS2 Card Index\n\nGenerated from the uploaded card JSON folder. This is the format we should use for future card-aware tasks.\n\n## Files\n\n- \`resources/cards/sts2-cards-full.json\`: complete bundle with arrays, counts, alias lookup, and card text.\n- \`resources/cards/sts2-cards-by-save-id.json\`: direct lookup by save-file id, e.g. \`CARD.BASH\`.\n- \`resources/cards/sts2-cards.jsonl\`: one card per line, convenient for streaming/search tools.\n- \`resources/cards/sts2-cards.csv\`: spreadsheet-friendly summary.\n- Generator: \`scripts/build-card-index.js\`.\n\n## Save-file mapping\n\nSave JSON uses ids like \`CARD.STRIKE_IRONCLAD\`. The index derives \`save_id\` from the database card \`key\` by converting CamelCase to SCREAMING_SNAKE and adding \`CARD.\`.\n\nExamples:\n\n${samples}\n\n## Counts\n\nTotal cards: **${cards.length}**\n\n### Category\n\n${cats}\n\n### Rarity\n\n${rarities}\n\n### Type\n\n${types}\n`;
fs.writeFileSync(path.join(docsDir, 'sts2-card-index.md'), doc);

console.log(`built ${cards.length} cards from ${cardsDir}`);
console.log(`wrote ${path.relative(root, outDir)}/sts2-cards-full.json`);
