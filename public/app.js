const BASE = location.pathname.startsWith('/sts2') ? '/sts2' : '';
const $ = sel => document.querySelector(sel);
const app = $('#app');
let state = { user:null, room:null, submission:null, admin:null, view:'board', tasks:[], characters:[], cards:[], cardCategories:[], cardRole:'Ironclad', cardTeam:null, error:'', ok:'' };
const api = async (path, opts={}) => {
  const res = await fetch(`${BASE}/api${path}`, { credentials:'include', headers:{'content-type':'application/json'}, ...opts });
  const data = await res.json().catch(()=>({error:'bad json'}));
  if(!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};
const post = (path, body={}) => api(path, { method:'POST', body:JSON.stringify(body) });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtTime = sec => `${Math.floor((sec||0)/60)}:${String((sec||0)%60).padStart(2,'0')}`;
const date = ms => ms ? new Date(ms).toLocaleString() : '—';
const setMsg = (type,msg) => { state.error = type==='error'?msg:''; state.ok = type==='ok'?msg:''; render(); };
async function boot(){
  try{ const [me, t] = await Promise.all([api('/me'), api('/tasks')]); state.user=me.user; state.tasks=t.tasks; state.characters=t.characters; }
  catch(e){ state.error=e.message; }
  if(state.user) await routeFromLocation(false);
  render();
}
async function routeFromLocation(joinRoom=false){
  try{
    if(location.pathname.match(/\/tasks\/?$/)) return loadTaskList(false);
    if(location.pathname.match(/\/admin\/?$/)) return await loadAdmin(false);
    const m = location.pathname.match(/\/room\/([A-Z0-9_-]+)/i);
    if(m) return await loadRoom(m[1].toUpperCase(), joinRoom);
    const ev = location.pathname.match(/\/eval\/([A-Za-z0-9_-]+)/);
    if(ev) return await loadSubmission(ev[1]);
  }catch(e){
    state.error = e.message;
  }
}
function layout(body){
  app.innerHTML = `<div class="wrap"><div class="top"><div class="brand"><h1>STS2 Bingo</h1><p>Slay the Spire 2 存档自动评测 · 房间对战 · Lockout</p></div><div class="row">${state.user?`<button class="btn secondary" id="taskListBtn">任务列表</button>${state.user.isRoot?`<button class="btn secondary" id="adminBtn">后台</button>`:''}<span class="pill">👤 ${esc(state.user.username)}${state.user.isRoot?' · root':''}</span><button class="btn secondary" id="logout">退出</button>`:''}</div></div>${state.error?`<div class="error">${esc(state.error)}</div><br>`:''}${state.ok?`<div class="ok">${esc(state.ok)}</div><br>`:''}${body}</div>`;
  $('#taskListBtn')?.addEventListener('click', ()=>{ loadTaskList(); render(); });
  $('#adminBtn')?.addEventListener('click', async()=>{ try{ await loadAdmin(); render(); }catch(e){ setMsg('error', e.message); } });
  $('#logout')?.addEventListener('click', async()=>{ await post('/logout'); state.user=null; state.room=null; state.submission=null; state.admin=null; history.pushState(null,'',BASE+'/'); render(); });
}
function render(){ if(!state.user) return renderLogin(); if(state.admin) return renderAdmin(); if(state.view==='tasks') return renderTaskList(); if(state.submission) return renderEval(); if(state.room) return renderRoom(); return renderHome(); }
function renderLogin(){
  layout(`<div class="grid two"><div class="card"><h2>登录 / 注册</h2><p class="muted">用户名随便注册，密码只是用来区分玩家。</p><label>用户名</label><input id="u" placeholder="例如 gyh20"><label>密码</label><input id="p" type="password" placeholder="至少 3 位"><br><br><div class="row"><button class="btn" id="login">登录</button><button class="btn secondary" id="reg">注册并登录</button></div></div><div class="card"><h2>怎么玩</h2><p>创建房间后分享链接。房主设定种子、进阶、角色、普通/任务模式与 lockout。玩家提交 STS2 存档 JSON，系统自动判定格子。</p><p class="muted">提交间隔：同一玩家每 5 分钟一次。游戏结束后所有提交公开。</p></div></div>`);
  const go = async mode => { try{ const data=await post('/'+mode,{username:$('#u').value,password:$('#p').value}); state.user=data.user; state.error=''; await routeFromLocation(true); render(); }catch(e){ setMsg('error',e.message); } };
  $('#login').onclick=()=>go('login'); $('#reg').onclick=()=>go('register');
}
function renderHome(){
  layout(`<div class="grid two"><div class="card"><h2>房间</h2><div class="row"><button class="btn" id="create">创建房间</button><input id="rid" placeholder="输入房间 ID"><button class="btn secondary" id="join">加入</button></div><p class="muted small">房间链接形如 ${location.origin}${BASE}/room/ABC123</p></div><div class="card"><h2>任务库</h2><p>已内置 ${state.tasks.length} 条任务，支持 S/A/B/C/D 难度抽取。后续只需要更新 tasks/catalog.json 即可动态扩展。</p><div class="row"><button class="btn secondary" id="taskListHome">查看全部任务 / 留建议</button>${state.user?.isRoot?`<button class="btn secondary" id="adminHome">进入 root 后台</button>`:''}</div></div></div>`);
  $('#create').onclick=async()=>{ try{ const d=await post('/rooms'); state.room=d.room; state.view='board'; history.pushState(null,'',`${BASE}/room/${d.room.id}`); render(); }catch(e){setMsg('error',e.message);} };
  $('#join').onclick=async()=>{ try{ const id=$('#rid').value.trim().toUpperCase(); if(!id)return; await loadRoom(id,true); render(); }catch(e){setMsg('error',e.message);} };
  $('#taskListHome')?.addEventListener('click', ()=>{ loadTaskList(); render(); });
  $('#adminHome')?.addEventListener('click', async()=>{ try{ await loadAdmin(); render(); }catch(e){ setMsg('error', e.message); } });
}
function loadTaskList(push=true){
  state.view='tasks'; state.room=null; state.submission=null; state.admin=null;
  if(push) history.pushState(null,'',`${BASE}/tasks`);
}
async function loadRoom(id, join=true){
  const d = await api(`/rooms/${id}`); state.room=d.room; state.submission=null; state.admin=null; state.view='board';
  if(join && !state.room.members?.[state.user.id]) state.room=(await post(`/rooms/${id}/join`,{})).room;
  history.pushState(null,'',`${BASE}/room/${id}`);
}
async function loadSubmission(id){
  const d = await api(`/submissions/${id}`); state.submission=d.submission; state.room=d.room; state.admin=null;
}
async function loadAdmin(push=true){
  const d = await api('/admin');
  state.admin=d; state.room=null; state.submission=null; state.view='admin';
  if(push) history.pushState(null,'',`${BASE}/admin`);
}
async function ensureCards(){
  if(state.cards.length) return;
  const d = await api('/cards');
  state.cards = d.cards || [];
  state.cardCategories = d.categories || [];
}
function taskKindLabel(kind){
  const labels={badges_single:'单局徽章',win_time:'限时通关',win_gold:'胜利金币',gold:'金币',relics:'遗物',deck_max:'小牌组',deck_min:'大牌组',boss_turn_le:'Boss快杀',boss_turn_ge:'Boss持久',all_boss_no_damage:'全Boss无伤',one_boss_no_damage:'单Boss无伤',starter_cards_intact:'保留初始牌',take_card_after_each_fight:'战斗抓牌',no_rare_card_pick:'不抓金卡',no_source_card_type:'禁抓牌型',no_rest_smith:'不升级',duplicate_card:'同名卡',skip_boss_cards:'跳过Boss牌',upgrades:'升级',room_count:'房间数',badges_total:'累计徽章',wins_total:'累计通关',card_collection:'卡牌收集'};
  return labels[kind] || kind;
}
function renderTaskList(){
  const grouped={};
  for(const t of state.tasks) (grouped[t.difficulty] ||= []).push(t);
  const taskOptions=state.tasks.map(t=>`<option value="${esc(t.id)}">${esc(t.id)} · ${esc(t.description)}</option>`).join('');
  const groups=['S','A','B','C','D'].map(d=>`<div class="card"><div class="row" style="justify-content:space-between"><h2>${d} 级任务</h2><span class="pill">${(grouped[d]||[]).length} 条</span></div><div class="task-list">${(grouped[d]||[]).map(t=>`<div class="sub task-item"><div class="row" style="justify-content:space-between"><b>${esc(t.id)}</b><span class="pill">${esc(taskKindLabel(t.kind))}</span></div><div>${esc(t.description)}</div><div class="small muted">evaluator: ${esc(t.kind)} · params: ${esc(JSON.stringify(t.params||{}))}</div></div>`).join('')}</div></div>`).join('');
  layout(`<div class="row" style="justify-content:space-between"><h2>任务列表</h2><button class="btn secondary" id="taskBackHome">返回首页</button></div><div class="card"><h2>给管理员留言</h2><p class="muted small">可以选择具体任务，也可以留整体建议。管理员会在后台看到。</p><label>关联任务（可选）</label><select id="commentTask"><option value="">整体建议 / 不指定任务</option>${taskOptions}</select><label>建议内容</label><textarea id="commentText" placeholder="例如：这个任务难度偏高，建议调到 A 级……"></textarea><button class="btn" id="sendTaskComment">提交建议</button></div><br>${groups}`);
  $('#taskBackHome')?.addEventListener('click', ()=>{ state.view='home'; history.pushState(null,'',`${BASE}/`); render(); });
  $('#sendTaskComment')?.addEventListener('click', async()=>{
    try{
      await post('/task-comments', { taskId:$('#commentTask').value, message:$('#commentText').value });
      $('#commentText').value=''; setMsg('ok','建议已提交，管理员后台可以看到');
    }catch(e){ setMsg('error', e.message); }
  });
}
function renderEval(){
  const s=state.submission, r=state.room;
  layout(`<div class="card"><div class="row" style="justify-content:space-between"><h2>评测 ${esc(s.id)}</h2><a class="pill" href="${BASE}/room/${r.id}">返回房间 ${r.id}</a></div><div class="grid three"><div><b>提交者</b><p>${esc(r.users[s.userId]?.username||s.userId)}</p></div><div><b>队伍</b><p>${esc(teamName(s.teamId))}</p></div><div><b>时间</b><p>${date(s.createdAt)}</p></div></div><div class="hr"></div><h3>${s.result?.ok?'✅ 通过':'❌ 未通过'}</h3><p>${esc(s.result?.reason||'')}</p><p class="muted">通过格子：${(s.passedCells||[]).join(', ')||'无'}</p><pre class="card" style="white-space:pre-wrap;overflow:auto">${esc(JSON.stringify(s.summary,null,2))}</pre></div>`);
}
function renderAdmin(){
  const a=state.admin;
  const active=a.rooms.filter(r=>r.status!=='finished').length;
  const comments=a.taskComments||[];
  layout(`<div class="grid three"><div class="card"><h2>用户</h2><p class="big">${a.users.length}</p><p class="muted small">注册用户总数</p></div><div class="card"><h2>房间</h2><p class="big">${a.rooms.length}</p><p class="muted small">${active} 个未结束</p></div><div class="card"><h2>提交</h2><p class="big">${a.submissions.total}</p><p class="muted small">通过 ${a.submissions.passed} / 未通过 ${a.submissions.failed}</p></div></div><br><div class="card"><div class="row" style="justify-content:space-between"><h2>任务建议</h2><button class="btn secondary" id="refreshAdmin0">刷新</button></div><div class="admin-list">${comments.map(c=>`<div class="sub"><div class="row" style="justify-content:space-between"><div><b>${esc(c.username)}</b> ${c.taskId?`<span class="pill">${esc(c.taskId)} ${esc(c.taskDifficulty||'')}</span>`:'<span class="pill">整体建议</span>'}</div><span class="small muted">${date(c.createdAt)}</span></div>${c.taskDescription?`<div class="small muted">${esc(c.taskDescription)}</div>`:''}<div>${esc(c.message)}</div></div>`).join('')||'<p class="muted">暂无任务建议</p>'}</div></div><br><div class="grid two admin-grid"><div class="card"><div class="row" style="justify-content:space-between"><h2>所有用户</h2><button class="btn secondary" id="refreshAdmin1">刷新</button></div><div class="admin-list">${a.users.map(u=>`<div class="sub"><div class="row" style="justify-content:space-between"><b>${esc(u.username)}</b><span class="pill">${esc(u.role)}</span></div><div class="small muted">ID: ${esc(u.id)} · 注册: ${date(u.createdAt)}</div><div class="small muted">主持 ${u.roomsHosted} · 加入 ${u.roomsJoined} · 提交 ${u.submissions}</div></div>`).join('')||'<p class="muted">暂无用户</p>'}</div></div><div class="card"><div class="row" style="justify-content:space-between"><h2>所有游戏/房间</h2><button class="btn secondary" id="refreshAdmin2">刷新</button></div><div class="admin-list">${a.rooms.map(r=>`<div class="sub"><div class="row" style="justify-content:space-between"><div><b>${esc(r.id)}</b> <span class="pill">${esc(r.status)}</span> <span class="pill">${esc(r.mode)}</span></div><button class="btn danger small" data-delete-room="${esc(r.id)}">删除房间</button></div><div class="small muted">房主: ${esc(r.hostUsername)} · 成员 ${r.memberCount} · 提交 ${r.submissions} · 占格 ${r.boardClaims}</div><div class="small muted">创建: ${date(r.createdAt)} · 开始: ${date(r.startedAt)} · 结束: ${date(r.endedAt)}</div><div class="small muted">设置: n=${r.seedCount}, k=${r.k}, lines=${r.requiredLines}, lockout=${r.lockout?'开':'关'}, 时长=${r.durationMinutes||'unlimited'}</div><div class="small muted">成员: ${r.members.map(m=>`${esc(m.username)}(${esc(m.teamId)})`).join('、')||'无'}</div><div class="row"><a class="pill" href="${BASE}/room/${esc(r.id)}">打开房间</a></div></div>`).join('')||'<p class="muted">暂无房间</p>'}</div></div></div>`);
  const refresh=async()=>{ try{ await loadAdmin(false); render(); }catch(e){ setMsg('error', e.message); } };
  $('#refreshAdmin0')?.addEventListener('click', refresh);
  $('#refreshAdmin1')?.addEventListener('click', refresh);
  $('#refreshAdmin2')?.addEventListener('click', refresh);
  document.querySelectorAll('[data-delete-room]').forEach(btn=>btn.addEventListener('click', async()=>{
    const id=btn.dataset.deleteRoom;
    if(!confirm(`确定删除房间 ${id}？相关提交记录也会删除。这个操作不可撤销。`)) return;
    try{ await post(`/admin/rooms/${id}/delete`,{}); await loadAdmin(false); setMsg('ok',`已删除房间 ${id}`); }
    catch(e){ setMsg('error', e.message); }
  }));
}
function teamName(id){ return state.room.teams.find(t=>t.id===id)?.name || id || '未分队'; }
function teamColor(id){ return state.room.teams.find(t=>t.id===id)?.color || '#888'; }
function characterLabel(seed){ return seed.character ? seed.character.replace('CHARACTER.','') : (state.room?.status === 'lobby' ? '默认随机' : '角色未记录'); }
function roomHeader(){ const r=state.room; const canSet=r.viewerRole==='host' && r.status==='lobby'; return `<div class="card"><div class="row" style="justify-content:space-between"><div><h2>房间 ${r.id} <span class="pill">${r.status}</span></h2><p class="muted">分享链接：${location.origin}${BASE}/room/${r.id}</p></div><div class="row"><button class="btn secondary" id="copy">复制链接</button>${r.status!=='lobby'?`<button class="btn secondary" id="openSeedList">种子列表</button><button class="btn secondary" id="openCards">卡牌图鉴</button>`:''}${canSet?`<button class="btn secondary" id="openSettings">设置</button><button class="btn" id="start">开始游戏</button>`:''}${r.viewerRole==='host' && r.status==='playing'?`<button class="btn danger" id="finish">结束</button>`:''}${r.status==='finished' && r.viewerTeam?`<button class="btn" id="newGame">新的一局</button>`:''}</div></div><div class="teams">${r.teams.map(t=>`<div class="team"><div class="row"><span class="dot" style="background:${t.color}"></span><b>${esc(t.name)}</b></div><div class="small muted">${Object.entries(r.members||{}).filter(([u,tid])=>tid===t.id).map(([u])=>esc(r.users[u]?.username||u)).join('、')||'空'}</div>${r.viewerTeam!==t.id && r.status==='lobby'?`<button class="btn secondary small" data-team="${t.id}">加入/切换</button>`:r.viewerTeam===t.id?`<span class="pill">你在这里</span>`:''}</div>`).join('')}</div>${r.status==='lobby'?`<div class="notice">等待房主开始游戏。开始前不能提交评测；开始后设置会锁定。</div>`:''}${r.status==='finished'?`<div class="notice">游戏已结束。胜者：${r.winnerTeamId?teamName(r.winnerTeamId):'时间到/手动结束'}。提交记录已公开。要继续玩请点“新的一局”，会创建一个新的房间。</div>`:''}</div>`; }
function renderRoom(){
  const r=state.room;
  const canSet=r.viewerRole==='host' && r.status==='lobby';
  const settingView=state.view==='settings' && canSet;
  const seedListView=state.view==='seeds' && r.status!=='lobby';
  const cardsView=state.view==='cards' && r.status!=='lobby';
  const body=settingView
    ? `${roomHeader()}<br><div class="row"><button class="btn secondary" id="backBoard">返回棋盘</button></div><br>${renderSettings()}`
    : seedListView
      ? `${roomHeader()}<br><div class="row"><button class="btn secondary" id="backBoard">返回棋盘</button></div><br>${renderSeedList()}`
      : cardsView
        ? `${roomHeader()}<br><div class="row"><button class="btn secondary" id="backBoard">返回棋盘</button></div><br>${renderCardAtlas()}`
        : `${roomHeader()}<br>${renderBoard()}${r.status==='playing'?`<br><div class="grid two">${renderSubmit()}${renderSubmissions()}</div>`:r.status==='finished'?`<br>${renderSubmissions()}`:''}`;
  layout(body);
  bindRoom();
}
function renderBoard(){ const r=state.room; return `<div class="card"><h2>${r.settings.mode==='normal'?'种子进度':'任务棋盘'}</h2>${r.settings.mode==='normal'?normalBoard():taskBoard()}</div>`; }
function paints(cell){ const ids=Object.keys(cell?.teams||{}); if(!ids.length)return ''; return `<div class="paint">${ids.map(id=>`<span style="background:${teamColor(id)}"></span>`).join('')}</div>`; }
function normalBoard(){ const r=state.room; return `<div class="board normal">${r.settings.seeds.map((s,i)=>{ const c=r.board[`seed${i}`]||{}; return `<div class="cell ${Object.keys(c.teams||{}).length?'done':''}">${paints(c)}<div class="id">#${i+1}</div><div><b>${esc(s.seed)}</b></div><div class="small muted">A${s.ascension} ${esc(characterLabel(s))}</div>${Object.keys(c.teams||{}).map(teamName).join(' / ')}</div>` }).join('')}</div><p class="muted small">目标：先完成 ${r.settings.k} 个种子。Lockout：${r.settings.lockout?'开':'关'}</p>`; }
function taskBoard(){ const r=state.room; const board=r.settings.board?.length?r.settings.board:[]; return `<div class="board tasks">${board.map(cell=>{ const c=r.board[cell.cellId]||{}; return `<div class="cell ${Object.keys(c.teams||{}).length?'done':''}">${paints(c)}<div class="id">${esc(cell.id||cell.taskId)} · ${esc(cell.difficulty)}</div><div class="desc">${esc(cell.description)}</div>${taskProgress(cell)}<div class="small muted">${Object.keys(c.teams||{}).map(teamName).join(' / ')}</div></div>` }).join('')}</div><p class="muted small">目标：完成 ${r.settings.requiredLines} 条线。Lockout：${r.settings.lockout?'开':'关'}</p>`; }
function collectionIds(teamId, category){ const v=state.room.cardCollections?.[teamId]?.[category]; return Array.isArray(v)?v:Object.keys(v||{}); }
function taskProgress(cell){
  const r=state.room, kind=cell.kind, p=cell.params||{};
  if(!['badges_total','wins_total','card_collection'].includes(kind)) return '';
  const seeds=(r.settings.seeds||[]).map(s=>String(s.seed||'').toUpperCase());
  const target=kind==='badges_total' ? Number(p.perSeed||0)*seeds.length : kind==='wins_total' ? (p.mode==='all' ? seeds.length : p.mode==='half' ? Math.ceil(seeds.length/2) : Number(p.fixed||1)) : Number(p.count||0);
  const taskId=cell.taskId||cell.id;
  const lines=[];
  for(const t of r.teams||[]){
    if(kind==='card_collection'){
      const cats=state.cardCategories.length?state.cardCategories:['Ironclad','Silent','Defect','Necrobinder','Regent'];
      const counts=cats.map(cat=>({cat,count:collectionIds(t.id,cat).length}));
      const best=counts.slice().sort((a,b)=>b.count-a.count)[0] || {cat:'',count:0};
      if(best.count>0 || r.board?.[cell.cellId]?.teams?.[t.id]) lines.push(`${esc(teamName(t.id))} ${esc(best.cat)} ${best.count}/${target}`);
      continue;
    }
    const values=r.aggregate?.[t.id]?.[taskId]?.values||{};
    const hasProgress=seeds.some(seed=>kind==='badges_total'?Number(values[seed]||0)>0:!!values[seed]);
    if(!hasProgress && !r.board?.[cell.cellId]?.teams?.[t.id]) continue;
    if(kind==='badges_total'){
      const nums=seeds.map(seed=>Number(values[seed]||0));
      const total=nums.reduce((a,b)=>a+b,0);
      lines.push(`${esc(teamName(t.id))} ${total}/${target}（种子最大值 ${nums.join('/') || '无'}）`);
    }else{
      const marks=seeds.map(seed=>values[seed]?'✓':'·');
      const total=marks.filter(x=>x==='✓').length;
      lines.push(`${esc(teamName(t.id))} ${total}/${target}（${marks.join('') || '无'}）`);
    }
  }
  return `<div class="small muted">进度：${lines.length?lines.join('<br>'):'暂无'}</div>`;
}
function renderCardAtlas(){
  const r=state.room;
  const cats=state.cardCategories.length?state.cardCategories:['Ironclad','Silent','Defect','Necrobinder','Regent'];
  if(!cats.includes(state.cardRole)) state.cardRole=cats[0]||'Ironclad';
  const teamIds=(r.teams||[]).map(t=>t.id);
  const teamId=teamIds.includes(state.cardTeam)?state.cardTeam:(r.viewerTeam||teamIds[0]);
  state.cardTeam=teamId;
  const got=new Set(collectionIds(teamId,state.cardRole));
  const cards=state.cards.filter(c=>c.category===state.cardRole);
  const obtained=cards.filter(c=>got.has(c.save_id));
  const missing=cards.filter(c=>!got.has(c.save_id));
  const roleButtons=cats.map(cat=>`<button class="btn ${cat===state.cardRole?'':'secondary'} small" data-card-role="${esc(cat)}">${esc(cat)}</button>`).join('');
  const teamSelect=`<select id="cardTeam">${(r.teams||[]).map(t=>`<option value="${esc(t.id)}" ${t.id===teamId?'selected':''}>${esc(t.name)}</option>`).join('')}</select>`;
  const cardPill=(c,ok)=>`<span class="pill card-pill ${ok?'got':'miss'}" title="${esc(c.key)} · ${esc(c.rarity||'')} · ${esc(c.type||'')}">${ok?'✓':'·'} ${esc(c.name_chs||c.name_eng||c.key)}</span>`;
  return `<div class="card"><div class="row" style="justify-content:space-between"><div><h2>卡牌图鉴</h2><p class="muted small">按队伍累计：每次有效提交会把存档里出现/获得过的卡牌取并集。</p></div><div style="min-width:180px">${teamSelect}</div></div><div class="row">${roleButtons}</div><div class="hr"></div><h3>${esc(teamName(teamId))} · ${esc(state.cardRole)}：已获得 ${obtained.length}/${cards.length}</h3><p class="muted small">卡名使用你提供的中文卡牌数据。</p><h3>已获得</h3><div class="card-list">${obtained.map(c=>cardPill(c,true)).join('')||'<span class="muted">暂无</span>'}</div><h3>未获得</h3><div class="card-list">${missing.map(c=>cardPill(c,false)).join('')}</div></div>`;
}
function renderSeedList(){ const r=state.room; const subs=r.submissions||[]; return `<div class="card"><h2>种子列表</h2><p class="muted small">提交 ID 按当前可见权限显示：游戏中仅同队可见，游戏结束后全部公开。</p><div class="grid">${r.settings.seeds.map((seed,i)=>{ const matched=subs.filter(s=>String(s.seed||'').toUpperCase()===String(seed.seed||'').toUpperCase()); const cell=r.board[`seed${i}`]||{}; const completed=r.settings.mode==='normal'?Object.keys(cell.teams||{}).length>0:matched.some(s=>s.result?.ok); const ids=matched.map(s=>`<a class="pill" href="${BASE}/eval/${s.id}" target="_blank">${esc(s.id)}</a>`).join(' '); return `<div class="sub"><div class="row" style="justify-content:space-between"><div><b>#${i+1} ${esc(seed.seed)}</b> <span class="pill">A${seed.ascension}</span> <span class="pill">${esc(characterLabel(seed))}</span></div><span class="pill">${completed?'已完成':'未完成'}</span></div><div class="small muted">提交记录 ID：${ids||'暂无'}</div>${r.settings.mode==='normal' && Object.keys(cell.teams||{}).length?`<div class="small muted">完成队伍：${Object.keys(cell.teams||{}).map(teamName).join(' / ')}</div>`:''}</div>`}).join('')}</div></div>`; }
function renderSettings(){ const r=state.room,s=r.settings; return `<div class="card settings"><h2>房主设置</h2><p class="muted small">只有房主能在游戏开始前修改。点击“开始游戏”后设置会锁定。</p><div class="grid three"><div><label>种子数量 n</label><input id="seedCount" type="number" min="1" max="50" value="${s.seedCount}"></div><div><label>模式</label><select id="mode"><option value="normal" ${s.mode==='normal'?'selected':''}>普通模式</option><option value="tasks" ${s.mode==='tasks'?'selected':''}>任务模式</option></select></div><div><label>时长(分钟，0=unlimited)</label><input id="duration" type="number" min="0" value="${s.durationMinutes||0}"></div></div><div class="grid three"><div><label>普通模式 k</label><input id="k" type="number" min="1" value="${s.k}"></div><div><label>任务模式需要线数 a</label><input id="lines" type="number" min="1" max="12" value="${s.requiredLines}"></div><div><label>Lockout</label><select id="lockout"><option value="0" ${!s.lockout?'selected':''}>关闭</option><option value="1" ${s.lockout?'selected':''}>开启</option></select></div></div><div class="hr"></div><div class="grid three"><div><label>一键进阶</label><input id="allAsc" type="number" min="0" max="10" value="${s.seeds[0]?.ascension||0}"></div><div><label>一键角色(留空随机)</label>${charSelect('allChar','')}</div><div><label>&nbsp;</label><button class="btn secondary" id="generate">生成种子/任务</button></div></div><table class="seed-table"><thead><tr><th>#</th><th>Seed</th><th>A</th><th>角色</th></tr></thead><tbody>${s.seeds.map((x,i)=>`<tr><td>${i+1}</td><td><input data-seed="${i}" value="${esc(x.seed)}"></td><td><input data-asc="${i}" type="number" min="0" max="10" value="${x.ascension}"></td><td>${charSelect(`char${i}`,x.character,`data-char="${i}"`)}</td></tr>`).join('')}</tbody></table><div class="hr"></div><h3>任务数量</h3><div class="grid three">${['S','A','B','C','D'].map(d=>`<div><label>${d}</label><input data-diff="${d}" type="number" min="0" value="${s.taskCounts[d]||0}"></div>`).join('')}</div><br><button class="btn" id="saveSettings">保存设置</button></div>`; }
function charSelect(id,val,extra=''){ return `<select id="${id}" ${extra}><option value="">默认随机</option>${state.characters.map(c=>`<option value="${c}" ${val===c?'selected':''}>${c.replace('CHARACTER.','')}</option>`).join('')}</select>`; }
function renderReadonlySettings(){ const s=state.room.settings; return `<div class="card"><h2>设置</h2><p>模式：${s.mode==='normal'?'普通':'任务'} · Lockout：${s.lockout?'开':'关'} · 时长：${s.durationMinutes||'unlimited'}</p><p class="muted small">只有房主能修改种子、任务和胜利条件。</p></div>`; }
function renderSubmit(){ return `<div class="card"><h2>提交评测</h2><p class="muted small">上传 current_run.save 或 history/*.run。也可以直接粘贴 JSON。</p><input type="file" id="file" accept=".save,.run,.json,.txt"><br><br><textarea id="saveText" placeholder="存档 JSON"></textarea><br><br><button class="btn" id="submit">提交评测</button></div>`; }
function renderSubmissions(){ const subs=state.room.submissions||[]; return `<div class="card submissions"><h2>提交记录</h2>${subs.length?subs.slice().reverse().map(s=>`<div class="sub"><div class="row"><b>${esc(state.room.users[s.userId]?.username||s.userId)}</b><span class="pill">${esc(teamName(s.teamId))}</span><span class="small muted">${date(s.createdAt)}</span></div><div>${s.result?.ok?'✅':'❌'} ${esc(s.result?.reason||'')}</div><div class="small muted">seed ${esc(s.seed||'未知')} · ${s.summary?.win?'胜利':'未胜利'} · ${s.summary?fmtTime(s.summary.runTime):''}</div><a href="${BASE}/eval/${s.id}" target="_blank">评测链接</a></div>`).join(''):'<p class="muted">暂无提交</p>'}</div>`; }
function collectSettings(){ const s=state.room.settings; const seedCount=Number($('#seedCount').value); const seeds=[]; document.querySelectorAll('[data-seed]').forEach(inp=>{ const i=Number(inp.dataset.seed); seeds[i]={ seed:inp.value, ascension:Number(document.querySelector(`[data-asc="${i}"]`).value), character:document.querySelector(`[data-char="${i}"]`).value }; }); const taskCounts={}; document.querySelectorAll('[data-diff]').forEach(i=>taskCounts[i.dataset.diff]=Number(i.value)); return { seedCount, seeds, mode:$('#mode').value, durationMinutes:Number($('#duration').value), k:Number($('#k').value), requiredLines:Number($('#lines').value), lockout:$('#lockout').value==='1', taskCounts }; }
function bindRoom(){
  $('#copy')?.addEventListener('click', async()=>{
    try{
      await navigator.clipboard.writeText(location.href);
      setMsg('ok','房间链接已复制');
    }catch{
      prompt('复制这个房间链接：', location.href);
    }
  });
  $('#openSettings')?.addEventListener('click', ()=>{ state.view='settings'; render(); });
  $('#openSeedList')?.addEventListener('click', ()=>{ state.view='seeds'; render(); });
  $('#openCards')?.addEventListener('click', async()=>{ try{ await ensureCards(); state.view='cards'; render(); }catch(e){ setMsg('error', e.message); } });
  $('#backBoard')?.addEventListener('click', ()=>{ state.view='board'; render(); });
  document.querySelectorAll('[data-card-role]').forEach(b=>b.addEventListener('click', ()=>{ state.cardRole=b.dataset.cardRole; render(); }));
  $('#cardTeam')?.addEventListener('change', e=>{ state.cardTeam=e.target.value; render(); });
  document.querySelectorAll('[data-team]').forEach(b=>b.onclick=async()=>{ try{ state.room=(await post(`/rooms/${state.room.id}/team`,{teamId:b.dataset.team})).room; render(); }catch(e){setMsg('error',e.message);} });
  $('#saveSettings')?.addEventListener('click', async()=>{ try{ state.room=(await post(`/rooms/${state.room.id}/settings`, collectSettings())).room; state.view='board'; setMsg('ok','设置已保存'); }catch(e){setMsg('error',e.message);} });
  $('#generate')?.addEventListener('click', async()=>{ try{ await post(`/rooms/${state.room.id}/settings`, collectSettings()); const d=await post(`/rooms/${state.room.id}/generate`, { ascension:$('#allAsc').value, character:$('#allChar').value }); state.room=d.room; state.view='board'; setMsg('ok','已生成种子/任务'); }catch(e){setMsg('error',e.message);} });
  $('#start')?.addEventListener('click', async()=>{ try{ state.room=(await post(`/rooms/${state.room.id}/start`,{})).room; state.view='board'; render(); }catch(e){setMsg('error',e.message);} });
  $('#finish')?.addEventListener('click', async()=>{ if(!confirm('确定结束游戏并公开提交记录？'))return; try{ state.room=(await post(`/rooms/${state.room.id}/finish`,{})).room; render(); }catch(e){setMsg('error',e.message);} });
  $('#newGame')?.addEventListener('click', async()=>{ try{ const d=await post(`/rooms/${state.room.id}/new-game`,{}); state.room=d.room; state.view='board'; history.pushState(null,'',`${BASE}/room/${d.room.id}`); setMsg('ok','已创建新的一局'); }catch(e){setMsg('error',e.message);} });
  $('#file')?.addEventListener('change', async e=>{ const f=e.target.files[0]; if(f) $('#saveText').value=await f.text(); });
  $('#submit')?.addEventListener('click', async()=>{ try{ const d=await post(`/rooms/${state.room.id}/submit`, { saveText:$('#saveText').value }); state.room=d.room; setMsg('ok',`评测完成：${d.submission.result.reason}，ID ${d.submissionId}`); window.open(`${BASE}/eval/${d.submissionId}`,'_blank'); }catch(e){setMsg('error',e.message);} });
}
window.addEventListener('popstate',()=>location.reload());
boot();
