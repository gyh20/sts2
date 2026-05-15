const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
const PUBLIC = path.resolve(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const TASKS = JSON.parse(fs.readFileSync(path.join(ROOT, 'tasks', 'catalog.json'), 'utf8'));
const PORT = Number(process.env.PORT || 8790);
const SAVE_LIMIT = 3 * 1024 * 1024;
const MIN_SUBMIT_INTERVAL_MS = 5 * 60 * 1000;
const CHARACTERS = ['CHARACTER.IRONCLAD','CHARACTER.SILENT','CHARACTER.DEFECT','CHARACTER.NECROBINDER','CHARACTER.REGENT'];
const TEAM_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#f59e0b', '#a855f7', '#14b8a6'];
const SESSION_COOKIE = 'sts2_session';
const SESSION_COOKIE_PATH = '/sts2';
const ROOT_USER_ID = 'root';
const ROOT_USERNAME = 'root';
const ROOT_PASSWORD_HASH = 'root-admin-v1-2026-05-16$9529edbdfb42e1fbc792a3b09403e4487d906b4711d6c2b8286a0b795fc1f312';

fs.mkdirSync(DATA_DIR, { recursive: true });

function now(){ return Date.now(); }
function rid(len=8){ return crypto.randomBytes(Math.ceil(len*0.75)).toString('base64url').slice(0,len); }
function roomId(len=6){
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s = '';
  for(let i=0;i<len;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}
function readDb(){
  if(!fs.existsSync(DB_FILE)) return { users: [], rooms: [], sessions: {}, submissions: [] };
  try{
    const db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    db.users ||= []; db.rooms ||= []; db.sessions ||= {}; db.submissions ||= [];
    const fallbackTeams = defaultTeams();
    for(const room of db.rooms){
      const existing = new Set((room.teams || []).map(t => t.id));
      room.teams = [...(room.teams || []), ...fallbackTeams.filter(t => !existing.has(t.id))];
    }
    return db;
  }catch(e){ return { users: [], rooms: [], sessions: {}, submissions: [] }; }
}
function writeDb(db){
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2));
  fs.renameSync(tmp, DB_FILE);
}
function hashPassword(pw, salt=rid(16)){ return `${salt}$${crypto.scryptSync(String(pw), salt, 32).toString('hex')}`; }
function verifyPassword(pw, stored){
  const [salt, h] = String(stored||'').split('$');
  if(!salt || !h) return false;
  const got = crypto.scryptSync(String(pw), salt, 32).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(got));
}
function parseCookies(req){
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('='); if(i < 0) return;
    try{
      out[part.slice(0,i).trim()] = decodeURIComponent(part.slice(i+1).trim());
    }catch{
      // Ignore malformed cookie values instead of letting one bad header crash the service.
    }
  });
  return out;
}
function sessionCookie(token){
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; HttpOnly; Path=${SESSION_COOKIE_PATH}; SameSite=Lax`;
}
function clearSessionCookie(){
  return `${SESSION_COOKIE}=; Max-Age=0; Path=${SESSION_COOKIE_PATH}; SameSite=Lax`;
}
function send(res, code, body, headers={}){
  const isJson = typeof body !== 'string' && !Buffer.isBuffer(body);
  const data = isJson ? JSON.stringify(body) : body;
  res.writeHead(code, { 'content-type': isJson ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8', ...headers });
  res.end(data);
}
function json(res, code, body, headers={}){ send(res, code, body, headers); }
function fail(res, code, message){ json(res, code, { error: message }); }
function readBody(req, limit=SAVE_LIMIT){
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if(size > limit){ reject(new Error('请求太大')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
async function readJson(req, limit=SAVE_LIMIT){
  const raw = await readBody(req, limit);
  if(!raw) return {};
  try{ return JSON.parse(raw); }catch{ throw new Error('JSON 格式错误'); }
}
function getUser(req, db){
  const token = parseCookies(req)[SESSION_COOKIE];
  const uid = token && db.sessions[token];
  if(!uid) return null;
  return db.users.find(u => u.id === uid) || null;
}
function isRootUser(u){ return !!u && (u.role === 'root' || u.id === ROOT_USER_ID || String(u.username || '').toLowerCase() === ROOT_USERNAME); }
function publicUser(u){ return u ? { id:u.id, username:u.username, createdAt:u.createdAt, isRoot:isRootUser(u) } : null; }
function ensureRootUser(db){
  let changed = false;
  let root = db.users.find(u => u.id === ROOT_USER_ID || String(u.username || '').toLowerCase() === ROOT_USERNAME);
  if(!root){
    root = { id:ROOT_USER_ID, username:ROOT_USERNAME, passwordHash:ROOT_PASSWORD_HASH, role:'root', createdAt:now() };
    db.users.unshift(root);
    changed = true;
  }
  if(root.id !== ROOT_USER_ID){ root.id = ROOT_USER_ID; changed = true; }
  if(root.username !== ROOT_USERNAME){ root.username = ROOT_USERNAME; changed = true; }
  if(root.role !== 'root'){ root.role = 'root'; changed = true; }
  if(root.passwordHash !== ROOT_PASSWORD_HASH){ root.passwordHash = ROOT_PASSWORD_HASH; changed = true; }
  return changed;
}
function roomForClient(room, db, viewer){
  const users = Object.fromEntries(db.users.map(u => [u.id, publicUser(u)]));
  const teamByUser = room.members || {};
  const canSeeAllSubmissions = room.status === 'finished' || isRootUser(viewer);
  const viewerTeam = viewer ? teamByUser[viewer.id] : null;
  return {
    ...room,
    users,
    viewerRole: isRootUser(viewer) ? 'root' : (viewer && room.hostUserId === viewer.id ? 'host' : 'player'),
    viewerTeam,
    submissions: db.submissions.filter(s => s.roomId === room.id && (canSeeAllSubmissions || s.teamId === viewerTeam)).map(s => ({
      id:s.id, roomId:s.roomId, userId:s.userId, teamId:s.teamId, seed:s.seed, createdAt:s.createdAt,
      passedCells:s.passedCells, summary:s.summary, result:s.result, public: canSeeAllSubmissions || s.teamId === viewerTeam
    }))
  };
}
function adminSummary(db){
  const userById = Object.fromEntries(db.users.map(u => [u.id, publicUser(u)]));
  return {
    users: db.users.map(u => ({
      id:u.id, username:u.username, role:isRootUser(u) ? 'root' : 'player', createdAt:u.createdAt,
      roomsHosted: db.rooms.filter(r => r.hostUserId === u.id).length,
      roomsJoined: db.rooms.filter(r => r.members?.[u.id]).length,
      submissions: db.submissions.filter(s => s.userId === u.id).length
    })),
    rooms: db.rooms.map(r => ({
      id:r.id, status:r.status, createdAt:r.createdAt, startedAt:r.startedAt, endedAt:r.endedAt,
      hostUserId:r.hostUserId, hostUsername:userById[r.hostUserId]?.username || r.hostUserId,
      memberCount:Object.keys(r.members || {}).length,
      members:Object.entries(r.members || {}).map(([userId, teamId]) => ({ userId, username:userById[userId]?.username || userId, teamId })),
      mode:r.settings?.mode, seedCount:r.settings?.seedCount, k:r.settings?.k, requiredLines:r.settings?.requiredLines,
      lockout:!!r.settings?.lockout, durationMinutes:r.settings?.durationMinutes || 0,
      boardClaims:Object.keys(r.board || {}).length, winnerTeamId:r.winnerTeamId || null,
      submissions: db.submissions.filter(s => s.roomId === r.id).length,
      latestSubmissionAt: Math.max(0, ...db.submissions.filter(s => s.roomId === r.id).map(s => s.createdAt || 0)) || null
    })).sort((a,b)=>(b.createdAt||0)-(a.createdAt||0)),
    submissions: {
      total: db.submissions.length,
      passed: db.submissions.filter(s => s.result?.ok).length,
      failed: db.submissions.filter(s => !s.result?.ok).length
    },
    generatedAt: now()
  };
}
function randomSeed(){
  const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  let s=''; for(let i=0;i<10;i++) s += alphabet[Math.floor(Math.random()*alphabet.length)];
  return s;
}
function defaultTeams(){ return Array.from({ length: 6 }, (_, i) => ({ id:`team${i+1}`, name:`队伍 ${i+1}`, color:TEAM_COLORS[i] })); }
function defaultRoom(userId){
  const id = roomId();
  return {
    id, hostUserId:userId, createdAt:now(), status:'lobby', startedAt:null, endedAt:null,
    teams: defaultTeams(), members: { [userId]:'team1' },
    settings: {
      seedCount: 5,
      seeds: Array.from({length:5}, () => ({ seed: randomSeed(), ascension: 0, character: '' })),
      mode: 'normal', k: 3, lockout: false, durationMinutes: 0,
      taskCounts: { S:1, A:4, B:8, C:8, D:4 }, requiredLines: 1,
      board: []
    },
    board: {}, aggregate: {}, winnerTeamId: null
  };
}
function newGameFromRoom(oldRoom, userId){
  const room = defaultRoom(userId);
  const old = oldRoom.settings || room.settings;
  room.settings = {
    ...JSON.parse(JSON.stringify(old)),
    seedCount: old.seedCount || 5,
    seeds: Array.from({length: old.seedCount || 5}, (_, i) => ({
      seed: randomSeed(),
      ascension: old.seeds?.[i]?.ascension ?? 0,
      character: old.seeds?.[i]?.character ?? ''
    })),
    board: []
  };
  room.settings.k = Math.max(1, Math.min(room.settings.seedCount, Number(room.settings.k || 1)));
  return room;
}
function normalizeSettings(input, old){
  const s = JSON.parse(JSON.stringify(old));
  if(Number.isFinite(Number(input.seedCount))){
    s.seedCount = Math.max(1, Math.min(50, Math.floor(Number(input.seedCount))));
  }
  if(Array.isArray(input.seeds)){
    s.seeds = input.seeds.slice(0, s.seedCount).map((x, i) => ({
      seed: String(x.seed || randomSeed()).trim().toUpperCase().slice(0, 20),
      ascension: Math.max(0, Math.min(10, Math.floor(Number(x.ascension ?? 0)))),
      character: String(x.character || '').trim().toUpperCase()
    }));
  }
  while(s.seeds.length < s.seedCount) s.seeds.push({ seed: randomSeed(), ascension: 0, character: '' });
  s.seeds = s.seeds.slice(0, s.seedCount);
  if(input.mode === 'normal' || input.mode === 'tasks') s.mode = input.mode;
  if(Number.isFinite(Number(input.k))) s.k = Math.max(1, Math.min(s.seedCount, Math.floor(Number(input.k))));
  s.lockout = !!input.lockout;
  if(input.durationMinutes === '' || input.durationMinutes === null) s.durationMinutes = 0;
  else if(Number.isFinite(Number(input.durationMinutes))) s.durationMinutes = Math.max(0, Math.floor(Number(input.durationMinutes)));
  if(input.taskCounts && typeof input.taskCounts === 'object'){
    for(const d of ['S','A','B','C','D']) s.taskCounts[d] = Math.max(0, Math.floor(Number(input.taskCounts[d] || 0)));
  }
  if(Number.isFinite(Number(input.requiredLines))) s.requiredLines = Math.max(1, Math.min(12, Math.floor(Number(input.requiredLines))));
  return s;
}
function resolveSeedCharacters(settings){
  for(const seed of settings.seeds || []){
    if(!seed.character){
      seed.character = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
    }
  }
}
function generateTaskBoard(counts){
  const chosen = [];
  for(const d of ['S','A','B','C','D']){
    const pool = TASKS.filter(t => t.difficulty === d);
    const shuffled = [...pool].sort(() => Math.random() - 0.5);
    chosen.push(...shuffled.slice(0, Math.max(0, Number(counts[d] || 0))));
  }
  const fallback = [...TASKS].sort(() => Math.random() - 0.5);
  for(const t of fallback){ if(chosen.length >= 25) break; if(!chosen.find(x=>x.id===t.id)) chosen.push(t); }
  return chosen.slice(0,25).sort(() => Math.random() - 0.5).map((t, i) => ({ cellId:`task${i}`, taskId:t.id, ...t }));
}
function getLastStats(run, playerIndex=0){
  const pid = run.players?.[playerIndex]?.id || run.players?.[playerIndex]?.net_id || playerIndex+1;
  let last = {};
  for(const act of run.map_point_history || []) for(const mp of act || []) for(const ps of mp.player_stats || []){
    if(ps.player_id == null || ps.player_id === pid) last = { ...last, ...ps };
  }
  return last;
}
function allPlayerSummaries(run){
  const players = Array.isArray(run.players) && run.players.length ? run.players : [{}];
  return players.map((p, idx) => {
    const last = getLastStats(run, idx);
    const deck = p.deck || [];
    const relics = p.relics || [];
    const badges = p.badges || [];
    const cardCounts = {};
    deck.forEach(c => { const id = String(c.id||'').replace(/\+.*/, ''); cardCounts[id] = (cardCounts[id]||0)+1; });
    return {
      idx, character: p.character || p.character_id || '', currentHp: p.current_hp ?? last.current_hp ?? null,
      maxHp: p.max_hp ?? last.max_hp ?? null, gold: p.gold ?? last.current_gold ?? 0,
      deckCount: deck.length, relicCount: relics.length, badgeCount: badges.length,
      maxDuplicateCard: Math.max(0, ...Object.values(cardCounts)), cardCounts
    };
  });
}
function collectStats(run){
  const bossTurns = [], bossDamage = [], fightRewards = [], removed = [], upgraded = [], restChoices = [];
  const roomCounts = {};
  let bossRewardCardOffered = 0, bossRewardCardPicked = 0;
  for(const act of run.map_point_history || []) for(const mp of act || []){
    const typ = mp.map_point_type || mp.rooms?.[0]?.room_type || '';
    roomCounts[typ] = (roomCounts[typ] || 0) + 1;
    const room = mp.rooms?.[0] || {};
    if(typ === 'boss') bossTurns.push(Number(room.turns_taken || 0));
    for(const ps of mp.player_stats || []){
      if(typ === 'boss') bossDamage.push(Number(ps.damage_taken || 0));
      if(['monster','elite','boss'].includes(typ)) fightRewards.push({ typ, picked:(ps.cards_gained||[]).length>0 || (ps.card_choices||[]).some(c=>c.was_picked) });
      for(const c of ps.cards_removed || []) removed.push(c.id || c);
      for(const c of ps.transformed_cards || []) removed.push(c.id || c);
      upgraded.push(...(ps.upgraded_cards || []));
      restChoices.push(...(ps.rest_site_choices || []));
      if(typ === 'boss' && ps.card_choices?.length){
        bossRewardCardOffered++;
        if(ps.card_choices.some(c=>c.was_picked)) bossRewardCardPicked++;
      }
    }
  }
  return { bossTurns, bossDamage, fightRewards, removed, upgraded, restChoices, roomCounts, bossRewardCardOffered, bossRewardCardPicked };
}
function extractRun(raw){
  let run;
  try{ run = JSON.parse(raw); }catch(e){ return { ok:false, error:'存档不是合法 JSON' }; }
  const players = allPlayerSummaries(run);
  const stats = collectStats(run);
  const seed = String(run.seed || run.rng?.seed || '').toUpperCase();
  const win = run.win === true || Number(run.win_time || 0) > 0;
  return { ok:true, run, summary:{
    seed, ascension: Number(run.ascension ?? -1), win, runTime:Number(run.run_time || 0),
    character: players[0]?.character || '', players, bossTurns:stats.bossTurns, bossDamage:stats.bossDamage,
    upgradedCount: stats.upgraded.length, removed: stats.removed, restChoices: stats.restChoices,
    startedAt: run.start_time || null, schemaVersion: run.schema_version || null,
    maxBadgeCount: Math.max(0, ...players.map(p=>p.badgeCount)), maxGold: Math.max(0, ...players.map(p=>p.gold)),
    maxRelicCount: Math.max(0, ...players.map(p=>p.relicCount)), minDeckCount: Math.min(...players.map(p=>p.deckCount)),
    maxDeckCount: Math.max(0, ...players.map(p=>p.deckCount)), maxDuplicateCard: Math.max(0, ...players.map(p=>p.maxDuplicateCard)),
    currentHpMaxPair: players.map(p=>[p.currentHp,p.maxHp])
  }, stats };
}
function passResult(pass, reason, value=null){ return { pass:!!pass, reason, value }; }
function evalTask(task, ex, room, teamId){
  const s = ex.summary, p = task.params || {}, st = ex.stats;
  const any = fn => s.players.some(fn);
  switch(task.kind){
    case 'badges_single': return passResult((!p.win || s.win) && any(x=>x.badgeCount >= p.count), `徽章 ${s.maxBadgeCount}/${p.count}`, s.maxBadgeCount);
    case 'win_time': return passResult(s.win && s.runTime <= p.seconds, `用时 ${Math.floor(s.runTime/60)}:${String(s.runTime%60).padStart(2,'0')} / ${Math.floor(p.seconds/60)}:00`, s.runTime);
    case 'win_gold': return passResult(s.win && any(x=>x.gold >= p.gold), `金币 ${s.maxGold}/${p.gold}`, s.maxGold);
    case 'gold': return passResult(any(x=>x.gold >= p.gold), `金币 ${s.maxGold}/${p.gold}`, s.maxGold);
    case 'relics': return passResult(any(x=>x.relicCount >= p.count), `遗物 ${s.maxRelicCount}/${p.count}`, s.maxRelicCount);
    case 'deck_max': return passResult(s.win && any(x=>x.deckCount <= p.count), `最小牌组 ${s.minDeckCount}/${p.count}`, s.minDeckCount);
    case 'deck_min': return passResult(s.win && any(x=>x.deckCount >= p.count), `最大牌组 ${s.maxDeckCount}/${p.count}`, s.maxDeckCount);
    case 'boss_turn_le': return passResult(st.bossTurns.some(x=>x <= p.turns), `Boss 回合 ${st.bossTurns.join(', ') || '无'}`, st.bossTurns.length ? Math.min(...st.bossTurns) : null);
    case 'boss_turn_ge': return passResult(st.bossTurns.some(x=>x >= p.turns), `Boss 回合 ${st.bossTurns.join(', ') || '无'}`, st.bossTurns.length ? Math.max(...st.bossTurns) : null);
    case 'all_boss_no_damage': return passResult(s.win && st.bossDamage.length>0 && st.bossDamage.every(x=>x===0), `Boss 战受伤 ${st.bossDamage.join(', ') || '无'}`, st.bossDamage.reduce((a,b)=>a+b,0));
    case 'one_boss_no_damage': return passResult(st.bossDamage.some(x=>x===0), `Boss 战受伤 ${st.bossDamage.join(', ') || '无'}`, st.bossDamage.filter(x=>x===0).length);
    case 'full_hp_win': return passResult(s.win && s.players.some(x => x.currentHp != null && x.maxHp != null && x.currentHp >= x.maxHp), `最终 HP ${s.currentHpMaxPair.map(x=>x.join('/')).join(', ')}`, null);
    case 'starter_cards_intact': {
      const starterRemoved = st.removed.some(id => /STRIKE_|DEFEND_|BASH/.test(String(id)));
      return passResult(s.win && !starterRemoved, starterRemoved ? '检测到初始牌被移除/变化' : '未检测到初始牌移除记录', starterRemoved ? 0 : 1);
    }
    case 'take_card_after_each_fight': return passResult(s.win && st.fightRewards.length>0 && st.fightRewards.every(x=>x.picked), `战斗抓牌 ${st.fightRewards.filter(x=>x.picked).length}/${st.fightRewards.length}`, st.fightRewards.filter(x=>x.picked).length);
    case 'no_rare_card_pick': return passResult(s.win, '存档缺少卡牌稀有度字段，当前仅验证胜利；金卡抓取需后续补充卡库', s.win ? 1 : 0);
    case 'no_rest_smith': return passResult(s.win && !st.restChoices.includes('SMITH'), `篝火升级 ${st.restChoices.filter(x=>x==='SMITH').length} 次`, st.restChoices.filter(x=>x==='SMITH').length);
    case 'duplicate_card': return passResult(s.win && s.maxDuplicateCard >= p.count, `同名卡最大 ${s.maxDuplicateCard}/${p.count}`, s.maxDuplicateCard);
    case 'skip_boss_cards': return passResult(s.win && st.bossRewardCardPicked === 0, `Boss 奖励抓取 ${st.bossRewardCardPicked}/${st.bossRewardCardOffered}`, st.bossRewardCardPicked);
    case 'upgrades': return passResult(st.upgraded.length >= p.count, `升级 ${st.upgraded.length}/${p.count}`, st.upgraded.length);
    case 'room_count': {
      const got = st.roomCounts?.[p.roomType] || 0;
      return passResult((!p.win || s.win) && got >= p.count, `${p.roomType} 房间 ${got}/${p.count}`, got);
    }
    case 'badges_total': {
      const seedCount = room.settings.seeds.length;
      const target = p.perSeed * seedCount;
      const agg = room.aggregate?.[teamId]?.[task.id]?.values || {};
      const total = Object.values({ ...agg, [s.seed]: Math.max(Number(agg[s.seed]||0), s.maxBadgeCount) }).reduce((a,b)=>a+Number(b||0),0);
      return passResult(total >= target, `累计徽章 ${total}/${target}`, s.maxBadgeCount);
    }
    case 'wins_total': {
      const seedCount = room.settings.seeds.length;
      const target = p.mode === 'all' ? seedCount : p.mode === 'half' ? Math.ceil(seedCount/2) : Number(p.fixed || 1);
      const agg = room.aggregate?.[teamId]?.[task.id]?.values || {};
      const values = { ...agg, [s.seed]: (agg[s.seed] || s.win) ? true : false };
      const total = Object.values(values).filter(Boolean).length;
      return passResult(total >= target, `通关种子 ${total}/${target}`, s.win ? 1 : 0);
    }
    default: return passResult(false, `暂不支持的任务类型 ${task.kind}`);
  }
}
function seedMatches(setting, s){
  if(!setting) return { ok:false, reason:'不属于本房间种子' };
  if(setting.seed && s.seed !== String(setting.seed).toUpperCase()) return { ok:false, reason:`种子不匹配：${s.seed || '未知'} ≠ ${setting.seed}` };
  if(Number.isFinite(Number(setting.ascension)) && Number(setting.ascension) !== s.ascension) return { ok:false, reason:`进阶不匹配：${s.ascension} ≠ ${setting.ascension}` };
  if(setting.character){
    const want = String(setting.character).toUpperCase();
    const got = String(s.character || '').toUpperCase();
    if(!got) return { ok:false, reason:`角色缺失：需要 ${want}` };
    if(got !== want) return { ok:false, reason:`角色不匹配：${got} ≠ ${want}` };
  }
  return { ok:true, reason:'匹配' };
}
function claimCell(room, teamId, cellId, value){
  room.board[cellId] ||= { teams: {}, firstTeamId: null, values: {} };
  const cell = room.board[cellId];
  if(room.settings.lockout && cell.firstTeamId && cell.firstTeamId !== teamId) return false;
  if(!cell.firstTeamId) cell.firstTeamId = teamId;
  cell.teams[teamId] = true;
  if(value != null) cell.values[teamId] = Math.max(Number(cell.values[teamId]||0), Number(value || 0));
  return true;
}
function updateAggregate(room, teamId, task, seed, value){
  if(!['badges_total','wins_total'].includes(task.kind)) return;
  room.aggregate[teamId] ||= {}; room.aggregate[teamId][task.id] ||= { values: {} };
  if(task.kind === 'badges_total') room.aggregate[teamId][task.id].values[seed] = Math.max(Number(room.aggregate[teamId][task.id].values[seed]||0), Number(value||0));
  if(task.kind === 'wins_total') room.aggregate[teamId][task.id].values[seed] = !!(room.aggregate[teamId][task.id].values[seed] || value);
}
function lineCountForTeam(room, teamId){
  const wins = new Set(Object.entries(room.board).filter(([id,c]) => c.teams?.[teamId]).map(([id])=>id));
  const lines = [];
  for(let r=0;r<5;r++) lines.push([0,1,2,3,4].map(c=>`task${r*5+c}`));
  for(let c=0;c<5;c++) lines.push([0,1,2,3,4].map(r=>`task${r*5+c}`));
  lines.push([0,6,12,18,24].map(i=>`task${i}`), [4,8,12,16,20].map(i=>`task${i}`));
  return lines.filter(line => line.every(id => wins.has(id))).length;
}
function checkWinner(room){
  if(room.status === 'finished') return;
  const byTeam = room.teams.map(t => [t.id, Object.values(room.board).filter(c=>c.teams?.[t.id]).length]);
  if(room.settings.mode === 'normal'){
    const hit = byTeam.find(([_, c]) => c >= room.settings.k);
    if(hit){ room.status='finished'; room.endedAt=now(); room.winnerTeamId=hit[0]; }
  } else {
    const hit = room.teams.find(t => lineCountForTeam(room, t.id) >= room.settings.requiredLines);
    if(hit){ room.status='finished'; room.endedAt=now(); room.winnerTeamId=hit.id; }
  }
  if(room.status !== 'finished' && room.settings.durationMinutes && room.startedAt && now() >= room.startedAt + room.settings.durationMinutes*60000){
    room.status='finished'; room.endedAt=now(); room.winnerTeamId=null;
  }
}
function evaluateSubmission(room, user, raw){
  const teamId = room.members[user.id];
  const ex = extractRun(raw);
  if(!ex.ok) return { ex, passedCells: [], result: { ok:false, reason:ex.error } };
  const s = ex.summary;
  const passedCells = [];
  if(room.settings.mode === 'normal'){
    for(let i=0;i<room.settings.seeds.length;i++){
      const setting = room.settings.seeds[i];
      const m = seedMatches(setting, s);
      if(!m.ok) continue;
      const pass = s.win;
      if(pass && claimCell(room, teamId, `seed${i}`, 1)) passedCells.push(`seed${i}`);
      break;
    }
    if(!passedCells.length) return { ex, passedCells, result:{ ok:false, reason: s.win ? '未匹配到本房间测试点种子/进阶/角色' : '存档未通关' } };
    return { ex, passedCells, result:{ ok:true, reason:`普通模式通过 ${passedCells.length} 个种子` } };
  }
  const setting = room.settings.seeds.find(x => String(x.seed).toUpperCase() === s.seed);
  const m = seedMatches(setting, s);
  if(!m.ok) return { ex, passedCells, result:{ ok:false, reason:m.reason } };
  for(const cell of room.settings.board || []){
    const task = TASKS.find(t => t.id === cell.taskId) || cell;
    const r = evalTask(task, ex, room, teamId);
    if(r.value != null) updateAggregate(room, teamId, task, s.seed, r.value);
    const r2 = evalTask(task, ex, room, teamId);
    if(r2.pass && claimCell(room, teamId, cell.cellId, r2.value)) passedCells.push(cell.cellId);
  }
  return { ex, passedCells, result:{ ok:passedCells.length>0, reason: passedCells.length ? `任务模式通过 ${passedCells.length} 格` : '没有任务满足条件' } };
}

function serveStatic(req, res, pathname){
  let p = pathname.replace(/^\/sts2(?=\/|$)/, '') || '/';
  if(p === '/') p = '/index.html';
  const file = path.resolve(path.join(PUBLIC, p));
  if(file !== PUBLIC && !file.startsWith(PUBLIC + path.sep)) return fail(res, 403, 'forbidden');
  if(!fs.existsSync(file) || fs.statSync(file).isDirectory()) return false;
  const ext = path.extname(file).toLowerCase();
  const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'application/javascript; charset=utf-8', '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml' };
  send(res, 200, fs.readFileSync(file), { 'content-type': types[ext] || 'application/octet-stream', ...(ext === '.html' ? { 'cache-control':'no-store' } : {}) });
  return true;
}

async function handleApi(req, res, pathname){
  const db = readDb();
  const rootChanged = ensureRootUser(db);
  const user = getUser(req, db);
  if(rootChanged) writeDb(db);
  const parts = pathname.replace(/^\/sts2/, '').split('/').filter(Boolean); // api, ...
  try{
    if(req.method === 'GET' && parts[1] === 'tasks') return json(res, 200, { tasks:TASKS, characters:CHARACTERS });
    if(req.method === 'POST' && parts[1] === 'register'){
      const b = await readJson(req, 64*1024);
      const username = String(b.username || '').trim().slice(0,30);
      const password = String(b.password || '');
      if(!/^[\w\u4e00-\u9fa5-]{2,30}$/.test(username)) return fail(res, 400, '用户名需 2-30 位，可含中文/字母/数字/_/-');
      if(password.length < 3) return fail(res, 400, '密码至少 3 位');
      if(db.users.some(u => u.username.toLowerCase() === username.toLowerCase())) return fail(res, 409, '用户名已存在');
      const u = { id:rid(10), username, passwordHash:hashPassword(password), createdAt:now() };
      const token = rid(32); db.users.push(u); db.sessions[token] = u.id; writeDb(db);
      return json(res, 200, { user:publicUser(u) }, { 'set-cookie': sessionCookie(token) });
    }
    if(req.method === 'POST' && parts[1] === 'login'){
      const b = await readJson(req, 64*1024);
      const u = db.users.find(x => x.username.toLowerCase() === String(b.username || '').trim().toLowerCase());
      if(!u || !verifyPassword(String(b.password || ''), u.passwordHash)) return fail(res, 401, '用户名或密码错误');
      const token = rid(32); db.sessions[token] = u.id; writeDb(db);
      return json(res, 200, { user:publicUser(u) }, { 'set-cookie': sessionCookie(token) });
    }
    if(req.method === 'POST' && parts[1] === 'logout'){
      const token = parseCookies(req)[SESSION_COOKIE]; if(token) delete db.sessions[token]; writeDb(db);
      return json(res, 200, { ok:true }, { 'set-cookie':clearSessionCookie() });
    }
    if(req.method === 'GET' && parts[1] === 'me') return json(res, 200, { user:publicUser(user) });
    if(!user) return fail(res, 401, '请先登录');

    if(parts[1] === 'admin'){
      if(!isRootUser(user)) return fail(res, 403, '只有 root 可以访问后台');
      if(req.method === 'GET' && parts.length === 2) return json(res, 200, adminSummary(db));
      if(req.method === 'POST' && parts[2] === 'rooms' && parts[3] && parts[4] === 'delete'){
        const id = String(parts[3] || '').toUpperCase();
        const idx = db.rooms.findIndex(r => r.id === id);
        if(idx < 0) return fail(res, 404, '房间不存在');
        const removed = db.rooms.splice(idx, 1)[0];
        const before = db.submissions.length;
        db.submissions = db.submissions.filter(s => s.roomId !== id);
        writeDb(db);
        return json(res, 200, { ok:true, deletedRoomId:id, deletedSubmissions: before - db.submissions.length, room: { id:removed.id, status:removed.status } });
      }
      return fail(res, 404, 'admin not found');
    }

    if(req.method === 'GET' && parts[1] === 'rooms' && parts.length === 2) return json(res, 200, { rooms: db.rooms.map(r => ({ id:r.id, status:r.status, hostUserId:r.hostUserId, createdAt:r.createdAt, members:Object.keys(r.members||{}).length, mode:r.settings.mode })) });
    if(req.method === 'POST' && parts[1] === 'rooms' && parts.length === 2){
      const room = defaultRoom(user.id); db.rooms.push(room); writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
    }
    if(parts[1] === 'rooms' && parts[2]){
      const room = db.rooms.find(r => r.id === parts[2].toUpperCase());
      if(!room) return fail(res, 404, '房间不存在');
      checkWinner(room);
      if(req.method === 'GET' && parts.length === 3){ writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) }); }
      if(req.method === 'POST' && parts[3] === 'new-game'){
        if(room.status !== 'finished') return fail(res, 400, '只有结束的游戏可以开新的一局');
        if(!room.members[user.id]) return fail(res, 403, '只有房间成员可以基于本局创建新房间');
        const nextRoom = newGameFromRoom(room, user.id);
        db.rooms.push(nextRoom); writeDb(db); return json(res, 200, { room:roomForClient(nextRoom, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'join'){
        const b = await readJson(req, 64*1024);
        if(room.status !== 'lobby' && !room.members[user.id]) return fail(res, 400, '游戏开始后不能再加入房间');
        const maxMembers = Math.max(4, room.teams.length);
        if(!room.members[user.id] && Object.keys(room.members).length >= maxMembers) return fail(res, 400, `房间最多 ${maxMembers} 个人`);
        const teamId = room.teams.find(t=>t.id===b.teamId)?.id || room.teams[0].id;
        room.members[user.id] = teamId; writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'team'){
        const b = await readJson(req, 64*1024);
        if(room.status !== 'lobby') return fail(res, 400, '游戏开始后不能切换队伍');
        if(!room.members[user.id]) room.members[user.id] = room.teams[0].id;
        const teamId = room.teams.find(t=>t.id===b.teamId)?.id;
        if(!teamId) return fail(res, 400, '队伍不存在');
        room.members[user.id] = teamId; writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'settings'){
        if(room.hostUserId !== user.id) return fail(res, 403, '只有房主可以修改设置');
        if(room.status !== 'lobby') return fail(res, 400, '游戏开始后不能修改设置');
        const b = await readJson(req, 256*1024);
        room.settings = normalizeSettings(b, room.settings);
        room.board = {}; room.aggregate = {}; room.winnerTeamId = null; room.status = 'lobby'; room.startedAt = null; room.endedAt = null;
        writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'generate'){
        if(room.hostUserId !== user.id) return fail(res, 403, '只有房主可以生成');
        if(room.status !== 'lobby') return fail(res, 400, '游戏开始后不能修改设置/重新生成');
        const b = await readJson(req, 64*1024);
        const allAsc = b.ascension === '' || b.ascension == null ? null : Math.max(0, Math.min(10, Math.floor(Number(b.ascension))));
        const allChar = String(b.character || '').trim().toUpperCase();
        room.settings.seeds = Array.from({length:room.settings.seedCount}, () => ({ seed:randomSeed(), ascension: allAsc ?? 0, character: allChar }));
        if(room.settings.mode === 'tasks') room.settings.board = generateTaskBoard(room.settings.taskCounts);
        room.board = {}; room.aggregate = {}; writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'start'){
        if(room.hostUserId !== user.id) return fail(res, 403, '只有房主可以开始');
        if(room.status !== 'lobby') return fail(res, 400, '游戏已经开始，不能重复开始或修改设置');
        resolveSeedCharacters(room.settings);
        if(room.settings.mode === 'tasks' && (!room.settings.board || room.settings.board.length !== 25)) room.settings.board = generateTaskBoard(room.settings.taskCounts);
        room.board = {}; room.aggregate = {};
        db.submissions = db.submissions.filter(s => s.roomId !== room.id);
        room.status='playing'; room.startedAt=now(); room.endedAt=null; room.winnerTeamId=null; writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'finish'){
        if(room.hostUserId !== user.id) return fail(res, 403, '只有房主可以结束');
        room.status='finished'; room.endedAt=now(); writeDb(db); return json(res, 200, { room:roomForClient(room, db, user) });
      }
      if(req.method === 'POST' && parts[3] === 'submit'){
        if(!room.members[user.id]) return fail(res, 403, '请先加入房间');
        if(room.status !== 'playing') return fail(res, 400, room.status === 'finished' ? '游戏已结束' : '游戏尚未开始');
        const last = db.submissions.filter(s => s.roomId === room.id && s.userId === user.id).sort((a,b)=>b.createdAt-a.createdAt)[0];
        if(last && now() - last.createdAt < MIN_SUBMIT_INTERVAL_MS) return fail(res, 429, `两次评测至少间隔 5 分钟，还需 ${Math.ceil((MIN_SUBMIT_INTERVAL_MS - (now()-last.createdAt))/1000)} 秒`);
        const b = await readJson(req, SAVE_LIMIT);
        const raw = String(b.saveText || ''); if(!raw.trim()) return fail(res, 400, '请上传/粘贴存档 JSON');
        const ev = evaluateSubmission(room, user, raw);
        const sub = { id:rid(10), roomId:room.id, userId:user.id, teamId:room.members[user.id], createdAt:now(), seed:ev.ex.summary?.seed || '', summary:ev.ex.summary || null, result:ev.result, passedCells:ev.passedCells, raw: room.status === 'finished' ? raw : undefined };
        db.submissions.push(sub); checkWinner(room); writeDb(db);
        return json(res, 200, { submissionId:sub.id, submission:sub, room:roomForClient(room, db, user) });
      }
    }
    if(req.method === 'GET' && parts[1] === 'submissions' && parts[2]){
      const sub = db.submissions.find(s => s.id === parts[2]); if(!sub) return fail(res, 404, '评测不存在');
      const room = db.rooms.find(r => r.id === sub.roomId); if(!room) return fail(res, 404, '房间不存在');
      const viewerTeam = room.members[user.id];
      if(room.status !== 'finished' && viewerTeam !== sub.teamId) return fail(res, 403, '提交记录仅同队可见，游戏结束后公开');
      return json(res, 200, { submission:sub, room:roomForClient(room, db, user) });
    }
    return fail(res, 404, 'not found');
  }catch(e){ return fail(res, 400, e.message || '请求失败'); }
}

let mutationQueue = Promise.resolve();
async function route(req, res){
  let pathname;
  try{
    const u = new URL(req.url, 'http://localhost');
    pathname = decodeURIComponent(u.pathname);
  }catch{
    return fail(res, 400, 'URL 格式错误');
  }
  if(pathname === '/sts2') return send(res, 301, '', { location:'/sts2/' });
  const norm = pathname.replace(/^\/sts2(?=\/|$)/, '') || '/';
  if(norm.startsWith('/api/')) return handleApi(req, res, pathname);
  if(norm.startsWith('/admin')) return serveStatic(req, res, '/index.html');
  if(norm.startsWith('/eval/')) return serveStatic(req, res, '/index.html');
  if(norm.startsWith('/room/')) return serveStatic(req, res, '/index.html');
  if(serveStatic(req, res, pathname)) return;
  return serveStatic(req, res, '/index.html');
}
const server = http.createServer(async (req, res) => {
  try{
    if(req.method !== 'GET' && req.url.includes('/api/')){
      const prev = mutationQueue.catch(()=>{});
      let release;
      mutationQueue = new Promise(resolve => { release = resolve; });
      await prev;
      try{ await route(req, res); }
      finally{ release(); }
    }else{
      await route(req, res);
    }
  }catch(e){
    if(!res.headersSent) fail(res, 500, '服务器错误');
    else res.end();
  }
});
server.listen(PORT, '127.0.0.1', () => console.log(`sts2 listening on http://127.0.0.1:${PORT}`));
