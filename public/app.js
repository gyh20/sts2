const BASE = location.pathname.startsWith('/sts2') ? '/sts2' : '';
const $ = sel => document.querySelector(sel);
const app = $('#app');
let state = { user:null, room:null, submission:null, tasks:[], characters:[], error:'', ok:'' };
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
  const m = location.pathname.match(/\/room\/([A-Z0-9]+)/i); if(m && state.user) await loadRoom(m[1], false);
  const ev = location.pathname.match(/\/eval\/([A-Za-z0-9_-]+)/); if(ev && state.user) await loadSubmission(ev[1]);
  render();
}
function layout(body){
  app.innerHTML = `<div class="wrap"><div class="top"><div class="brand"><h1>STS2 Bingo</h1><p>Slay the Spire 2 存档自动评测 · 房间对战 · Lockout</p></div><div class="row">${state.user?`<span class="pill">👤 ${esc(state.user.username)}</span><button class="btn secondary" id="logout">退出</button>`:''}</div></div>${state.error?`<div class="error">${esc(state.error)}</div><br>`:''}${state.ok?`<div class="ok">${esc(state.ok)}</div><br>`:''}${body}</div>`;
  $('#logout')?.addEventListener('click', async()=>{ await post('/logout'); state.user=null; state.room=null; history.pushState(null,'',BASE+'/'); render(); });
}
function render(){ if(!state.user) return renderLogin(); if(state.submission) return renderEval(); if(state.room) return renderRoom(); return renderHome(); }
function renderLogin(){
  layout(`<div class="grid two"><div class="card"><h2>登录 / 注册</h2><p class="muted">用户名随便注册，密码只是用来区分玩家。</p><label>用户名</label><input id="u" placeholder="例如 gyh20"><label>密码</label><input id="p" type="password" placeholder="至少 3 位"><br><br><div class="row"><button class="btn" id="login">登录</button><button class="btn secondary" id="reg">注册并登录</button></div></div><div class="card"><h2>怎么玩</h2><p>创建房间后分享链接。房主设定种子、进阶、角色、普通/任务模式与 lockout。玩家提交 STS2 存档 JSON，系统自动判定格子。</p><p class="muted">提交间隔：同一玩家每 5 分钟一次。游戏结束后所有提交公开。</p></div></div>`);
  const go = async mode => { try{ const data=await post('/'+mode,{username:$('#u').value,password:$('#p').value}); state.user=data.user; state.error=''; renderHome(); }catch(e){ setMsg('error',e.message); } };
  $('#login').onclick=()=>go('login'); $('#reg').onclick=()=>go('register');
}
function renderHome(){
  layout(`<div class="grid two"><div class="card"><h2>房间</h2><div class="row"><button class="btn" id="create">创建房间</button><input id="rid" placeholder="输入房间 ID"><button class="btn secondary" id="join">加入</button></div><p class="muted small">房间链接形如 ${location.origin}${BASE}/room/ABC123</p></div><div class="card"><h2>任务库</h2><p>已内置 ${state.tasks.length} 条任务，支持 S/A/B/C/D 难度抽取。后续只需要更新 tasks/catalog.json 即可动态扩展。</p></div></div>`);
  $('#create').onclick=async()=>{ try{ const d=await post('/rooms'); state.room=d.room; history.pushState(null,'',`${BASE}/room/${d.room.id}`); render(); }catch(e){setMsg('error',e.message);} };
  $('#join').onclick=async()=>{ const id=$('#rid').value.trim().toUpperCase(); if(!id)return; await loadRoom(id,true); };
}
async function loadRoom(id, join=true){
  const d = await api(`/rooms/${id}`); state.room=d.room; state.submission=null;
  if(join && !state.room.members?.[state.user.id]) state.room=(await post(`/rooms/${id}/join`,{})).room;
  history.pushState(null,'',`${BASE}/room/${id}`);
}
async function loadSubmission(id){
  const d = await api(`/submissions/${id}`); state.submission=d.submission; state.room=d.room;
}
function renderEval(){
  const s=state.submission, r=state.room;
  layout(`<div class="card"><div class="row" style="justify-content:space-between"><h2>评测 ${esc(s.id)}</h2><a class="pill" href="${BASE}/room/${r.id}">返回房间 ${r.id}</a></div><div class="grid three"><div><b>提交者</b><p>${esc(r.users[s.userId]?.username||s.userId)}</p></div><div><b>队伍</b><p>${esc(teamName(s.teamId))}</p></div><div><b>时间</b><p>${date(s.createdAt)}</p></div></div><div class="hr"></div><h3>${s.result?.ok?'✅ 通过':'❌ 未通过'}</h3><p>${esc(s.result?.reason||'')}</p><p class="muted">通过格子：${(s.passedCells||[]).join(', ')||'无'}</p><pre class="card" style="white-space:pre-wrap;overflow:auto">${esc(JSON.stringify(s.summary,null,2))}</pre></div>`);
}
function teamName(id){ return state.room.teams.find(t=>t.id===id)?.name || id || '未分队'; }
function teamColor(id){ return state.room.teams.find(t=>t.id===id)?.color || '#888'; }
function roomHeader(){ const r=state.room; return `<div class="card"><div class="row" style="justify-content:space-between"><div><h2>房间 ${r.id} <span class="pill">${r.status}</span></h2><p class="muted">分享链接：${location.origin}${BASE}/room/${r.id}</p></div><div class="row"><button class="btn secondary" id="copy">复制链接</button>${r.viewerRole==='host'?`<button class="btn" id="start">开始/重开</button><button class="btn danger" id="finish">结束</button>`:''}</div></div><div class="teams">${r.teams.map(t=>`<div class="team"><div class="row"><span class="dot" style="background:${t.color}"></span><b>${esc(t.name)}</b></div><div class="small muted">${Object.entries(r.members||{}).filter(([u,tid])=>tid===t.id).map(([u])=>esc(r.users[u]?.username||u)).join('、')||'空'}</div>${r.viewerTeam!==t.id?`<button class="btn secondary small" data-team="${t.id}">加入/切换</button>`:`<span class="pill">你在这里</span>`}</div>`).join('')}</div>${r.status==='finished'?`<div class="notice">游戏已结束。胜者：${r.winnerTeamId?teamName(r.winnerTeamId):'时间到/手动结束'}。提交记录已公开。</div>`:''}</div>`; }
function renderRoom(){
  const r=state.room;
  layout(`${roomHeader()}<br><div class="grid two"><div>${renderBoard()}</div><div class="grid"><div>${r.viewerRole==='host'?renderSettings():renderReadonlySettings()}</div>${renderSubmit()}${renderSubmissions()}</div></div>`);
  bindRoom();
}
function renderBoard(){ const r=state.room; return `<div class="card"><h2>${r.settings.mode==='normal'?'种子进度':'任务棋盘'}</h2>${r.settings.mode==='normal'?normalBoard():taskBoard()}</div>`; }
function paints(cell){ const ids=Object.keys(cell?.teams||{}); if(!ids.length)return ''; return `<div class="paint">${ids.map(id=>`<span style="background:${teamColor(id)}"></span>`).join('')}</div>`; }
function normalBoard(){ const r=state.room; return `<div class="board normal">${r.settings.seeds.map((s,i)=>{ const c=r.board[`seed${i}`]||{}; return `<div class="cell ${Object.keys(c.teams||{}).length?'done':''}">${paints(c)}<div class="id">#${i+1}</div><div><b>${esc(s.seed)}</b></div><div class="small muted">A${s.ascension} ${s.character?esc(s.character.replace('CHARACTER.','')):'随机角色'}</div>${Object.keys(c.teams||{}).map(teamName).join(' / ')}</div>` }).join('')}</div><p class="muted small">目标：先完成 ${r.settings.k} 个种子。Lockout：${r.settings.lockout?'开':'关'}</p>`; }
function taskBoard(){ const r=state.room; const board=r.settings.board?.length?r.settings.board:[]; return `<div class="board tasks">${board.map(cell=>{ const c=r.board[cell.cellId]||{}; return `<div class="cell ${Object.keys(c.teams||{}).length?'done':''}">${paints(c)}<div class="id">${esc(cell.id||cell.taskId)} · ${esc(cell.difficulty)}</div><div class="desc">${esc(cell.description)}</div><div class="small muted">${Object.keys(c.teams||{}).map(teamName).join(' / ')}</div></div>` }).join('')}</div><p class="muted small">目标：完成 ${r.settings.requiredLines} 条线。Lockout：${r.settings.lockout?'开':'关'}</p>`; }
function renderSettings(){ const r=state.room,s=r.settings; return `<div class="card settings"><h2>房主设置</h2><div class="grid three"><div><label>种子数量 n</label><input id="seedCount" type="number" min="1" max="50" value="${s.seedCount}"></div><div><label>模式</label><select id="mode"><option value="normal" ${s.mode==='normal'?'selected':''}>普通模式</option><option value="tasks" ${s.mode==='tasks'?'selected':''}>任务模式</option></select></div><div><label>时长(分钟，0=unlimited)</label><input id="duration" type="number" min="0" value="${s.durationMinutes||0}"></div></div><div class="grid three"><div><label>普通模式 k</label><input id="k" type="number" min="1" value="${s.k}"></div><div><label>任务模式需要线数 a</label><input id="lines" type="number" min="1" max="12" value="${s.requiredLines}"></div><div><label>Lockout</label><select id="lockout"><option value="0" ${!s.lockout?'selected':''}>关闭</option><option value="1" ${s.lockout?'selected':''}>开启</option></select></div></div><div class="hr"></div><div class="grid three"><div><label>一键进阶</label><input id="allAsc" type="number" min="0" max="10" value="${s.seeds[0]?.ascension||0}"></div><div><label>一键角色(留空随机)</label>${charSelect('allChar','')}</div><div><label>&nbsp;</label><button class="btn secondary" id="generate">生成种子/任务</button></div></div><table class="seed-table"><thead><tr><th>#</th><th>Seed</th><th>A</th><th>角色</th></tr></thead><tbody>${s.seeds.map((x,i)=>`<tr><td>${i+1}</td><td><input data-seed="${i}" value="${esc(x.seed)}"></td><td><input data-asc="${i}" type="number" min="0" max="10" value="${x.ascension}"></td><td>${charSelect(`char${i}`,x.character,`data-char="${i}"`)}</td></tr>`).join('')}</tbody></table><div class="hr"></div><h3>任务数量</h3><div class="grid three">${['S','A','B','C','D'].map(d=>`<div><label>${d}</label><input data-diff="${d}" type="number" min="0" value="${s.taskCounts[d]||0}"></div>`).join('')}</div><br><button class="btn" id="saveSettings">保存设置</button></div>`; }
function charSelect(id,val,extra=''){ return `<select id="${id}" ${extra}><option value="">随机</option>${state.characters.map(c=>`<option value="${c}" ${val===c?'selected':''}>${c.replace('CHARACTER.','')}</option>`).join('')}</select>`; }
function renderReadonlySettings(){ const s=state.room.settings; return `<div class="card"><h2>设置</h2><p>模式：${s.mode==='normal'?'普通':'任务'} · Lockout：${s.lockout?'开':'关'} · 时长：${s.durationMinutes||'unlimited'}</p><p class="muted small">只有房主能修改种子、任务和胜利条件。</p></div>`; }
function renderSubmit(){ return `<div class="card"><h2>提交评测</h2><p class="muted small">上传 current_run.save 或 history/*.run。也可以直接粘贴 JSON。</p><input type="file" id="file" accept=".save,.run,.json,.txt"><br><br><textarea id="saveText" placeholder="存档 JSON"></textarea><br><br><button class="btn" id="submit">提交评测</button></div>`; }
function renderSubmissions(){ const subs=state.room.submissions||[]; return `<div class="card submissions"><h2>提交记录</h2>${subs.length?subs.slice().reverse().map(s=>`<div class="sub"><div class="row"><b>${esc(state.room.users[s.userId]?.username||s.userId)}</b><span class="pill">${esc(teamName(s.teamId))}</span><span class="small muted">${date(s.createdAt)}</span></div><div>${s.result?.ok?'✅':'❌'} ${esc(s.result?.reason||'')}</div><div class="small muted">seed ${esc(s.seed||'未知')} · ${s.summary?.win?'胜利':'未胜利'} · ${s.summary?fmtTime(s.summary.runTime):''}</div><a href="${BASE}/eval/${s.id}" target="_blank">评测链接</a></div>`).join(''):'<p class="muted">暂无提交</p>'}</div>`; }
function collectSettings(){ const s=state.room.settings; const seedCount=Number($('#seedCount').value); const seeds=[]; document.querySelectorAll('[data-seed]').forEach(inp=>{ const i=Number(inp.dataset.seed); seeds[i]={ seed:inp.value, ascension:Number(document.querySelector(`[data-asc="${i}"]`).value), character:document.querySelector(`[data-char="${i}"]`).value }; }); const taskCounts={}; document.querySelectorAll('[data-diff]').forEach(i=>taskCounts[i.dataset.diff]=Number(i.value)); return { seedCount, seeds, mode:$('#mode').value, durationMinutes:Number($('#duration').value), k:Number($('#k').value), requiredLines:Number($('#lines').value), lockout:$('#lockout').value==='1', taskCounts }; }
function bindRoom(){
  $('#copy')?.addEventListener('click', async()=>{ await navigator.clipboard.writeText(location.href); setMsg('ok','房间链接已复制'); });
  document.querySelectorAll('[data-team]').forEach(b=>b.onclick=async()=>{ try{ state.room=(await post(`/rooms/${state.room.id}/team`,{teamId:b.dataset.team})).room; render(); }catch(e){setMsg('error',e.message);} });
  $('#saveSettings')?.addEventListener('click', async()=>{ try{ state.room=(await post(`/rooms/${state.room.id}/settings`, collectSettings())).room; setMsg('ok','设置已保存'); }catch(e){setMsg('error',e.message);} });
  $('#generate')?.addEventListener('click', async()=>{ try{ await post(`/rooms/${state.room.id}/settings`, collectSettings()); const d=await post(`/rooms/${state.room.id}/generate`, { ascension:$('#allAsc').value, character:$('#allChar').value }); state.room=d.room; setMsg('ok','已生成种子/任务'); }catch(e){setMsg('error',e.message);} });
  $('#start')?.addEventListener('click', async()=>{ try{ state.room=(await post(`/rooms/${state.room.id}/start`,{})).room; render(); }catch(e){setMsg('error',e.message);} });
  $('#finish')?.addEventListener('click', async()=>{ if(!confirm('确定结束游戏并公开提交记录？'))return; try{ state.room=(await post(`/rooms/${state.room.id}/finish`,{})).room; render(); }catch(e){setMsg('error',e.message);} });
  $('#file')?.addEventListener('change', async e=>{ const f=e.target.files[0]; if(f) $('#saveText').value=await f.text(); });
  $('#submit')?.addEventListener('click', async()=>{ try{ const d=await post(`/rooms/${state.room.id}/submit`, { saveText:$('#saveText').value }); state.room=d.room; setMsg('ok',`评测完成：${d.submission.result.reason}，ID ${d.submissionId}`); window.open(`${BASE}/eval/${d.submissionId}`,'_blank'); }catch(e){setMsg('error',e.message);} });
}
window.addEventListener('popstate',()=>location.reload());
boot();
