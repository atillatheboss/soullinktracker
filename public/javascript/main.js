// ═══════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════
const ICE=[{urls:'stun:stun.l.google.com:19302'}];
const NB=8,BS=30;
const PC=[['#7c6aff','rgba(124,106,255,.14)'],['#ff6a8a','rgba(255,106,138,.14)'],['#6affcc','rgba(106,255,204,.14)']];

let socket,myId,myName,myPI,mySocketId="",myPP=null;
let localStream=null,isSharing=false;
let myReadonly=false;
let badgeStates=[{},{},{}];
let levelCaps={};
let runStatus='lobby',runCounter=0,runStartedAt=null,runElapsed=0;
let runHistory=[];
let runPassword=null;
let rulesText='';
let rulesTitle='';
let rulesetId=null;
let trainerCapsText='';
let rulesets=[];
let _rulesDebounce=null;
let _rulesIgnoreInput=false;
const collapsedRunHistory = new Set();
let _timerInterval=null;
const peers=new Map();
const slotUsed=[false,false];

let team=Array.from({length:3},()=>Array(6).fill(null).map(es));
let deathCounts=[0,0,0];
let totalDeathCounts=[0,0,0];
let box=Array.from({length:3},()=>Array.from({length:NB},()=>Array(BS).fill(null)));
let routes=[{},{},{}];
let links=[];
let selectedEdition=null;

const colAssign={};
function es(){return{pokeId:null,name:'',nickname:'',shiny:false,alive:true,missed:false};}

// ═══════════════════════════════════════════════
// PAGES
// ═══════════════════════════════════════════════
function setPage(n){
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nt').forEach(t=>t.classList.remove('active'));
  document.getElementById('page-'+n).classList.add('active');
  document.getElementById('tab-'+n).classList.add('active');
  if(n==='soullink'){renderSL();}
  if(n==='box'){renderBoxSB();renderBoxMain();}
  if(n==='routes'){renderRoutes();}
  if(n==='battle'){renderBattle();}
  if(n==='map'){renderMap();}
  if(n==='run-history'){renderRunHistory();}
  if(n==='rules'){renderRulesTab();}
}

// ═══════════════════════════════════════════════
// JOIN
// ═══════════════════════════════════════════════
function applyReadonlyUI(){
  if(!myReadonly)return;
  const shbtn=document.getElementById('shbtn');
  if(shbtn)shbtn.style.display='none';
  const edsel=document.getElementById('edition-sel');
  if(edsel){edsel.disabled=true;edsel.style.opacity='.4';edsel.style.cursor='not-allowed';}
  const nr=document.querySelector('.nr');
  if(nr&&!document.getElementById('ro-badge')){
    const b=document.createElement('span');b.id='ro-badge';
    b.style.cssText='font-size:.68rem;font-family:Space Mono,monospace;padding:3px 9px;border-radius:6px;background:rgba(250,204,21,.1);border:1px solid rgba(250,204,21,.3);color:var(--yw);white-space:nowrap';
    b.textContent='👁 Zuschauer';nr.insertBefore(b,nr.firstChild);
  }
  if(!document.getElementById('readonly-style')){
    const s=document.createElement('style');s.id='readonly-style';
    s.textContent='.es,.bs,.ts,.editor-slot,.es-acts,.rt-slot-acts-simple button,.dc-btn,.dc-edit,.lb-sel,.shiny-swap-btn,button.btn-xs,button.btn-sm{pointer-events:none!important;opacity:.4!important}.nt,#dbgb,.min-btn,#rt-lang,#rt-search-input,#rt-route-search,.rt-card-h{pointer-events:auto!important;opacity:1!important}';
    document.head.appendChild(s);
  }
}

let _pendingPassphrase = null;
let _pendingRunPassword = '';
let _createProtectedEnabled = false;
const _runProtectionByPassphrase = new Map();

function switchLoginTab(tab){
  document.getElementById('login-create').style.display=tab==='create'?'':'none';
  document.getElementById('login-join').style.display=tab==='join'?'':'none';
  document.getElementById('login-passphrase-box').style.display='none';
  document.getElementById('login-error').style.display='none';
  if(tab==='create'){
    toggleCreateProtected(false);
  }
  const section=document.getElementById('slot-picker-section');
  if(section)section.style.display='none';
  document.getElementById('tab-create').style.background=tab==='create'?'var(--a)':'var(--sf2)';
  document.getElementById('tab-create').style.color=tab==='create'?'#fff':'var(--txd)';
  document.getElementById('tab-join').style.background=tab==='join'?'var(--a)':'var(--sf2)';
  document.getElementById('tab-join').style.color=tab==='join'?'#fff':'var(--txd)';
  if(tab==='join'){
    const joinPw=document.getElementById('join-password-input');
    if(joinPw) joinPw.value='';
    setJoinPasswordVisibility(false);
  }
  if(tab==='join') loadActiveRuns();
}

function setJoinPasswordVisibility(visible){
  const wrap=document.getElementById('join-password-wrap');
  const inp=document.getElementById('join-password-input');
  if(!wrap||!inp) return;
  wrap.style.display=visible?'':'none';
  inp.required=!!visible;
  if(!visible) inp.value='';
}

async function loadActiveRuns(){
  const list=document.getElementById('active-runs-list');
  if(!list) return;
  try{
    const r=await fetch('/api/runs/active');
    const runs=await r.json();
    _runProtectionByPassphrase.clear();
    if(!runs.length){
      list.innerHTML='<div class="active-runs-empty">Keine Runs vorhanden</div>';
      return;
    }
    list.innerHTML=runs.map(run=>{
      _runProtectionByPassphrase.set(run.passphrase, !!run.isProtected);
      const hasPlayers=run.playerCount>0||run.spectatorCount>0;
      const dot=hasPlayers
        ?'<div class="active-run-dot"></div>'
        :'<div style="width:7px;height:7px;border-radius:50%;background:var(--bd);flex-shrink:0"></div>';
      const lock=run.isProtected?' 🔒':'';
      const playerLabel=hasPlayers
        ?(run.playerCount===1?'1 Spieler':`${run.playerCount} Spieler`)+(run.spectatorCount>0?` · ${run.spectatorCount} 👁`:'')
        :'Niemand online';
      return `<div class="active-run-item" data-passphrase="${run.passphrase.replace(/"/g,'&quot;')}" onclick="selectActiveRun('${run.passphrase.replace(/'/g,"\\'")}')">
        <div style="display:flex;align-items:center;gap:8px;min-width:0">
          ${dot}
          <div class="active-run-item-name" style="${hasPlayers?'':'color:var(--txm)'}">${run.name.replace(/</g,'&lt;')}${lock}</div>
        </div>
        <div class="active-run-item-badge" style="${hasPlayers?'':'color:var(--bd2)'}">${playerLabel}</div>
      </div>`;
    }).join('');
  }catch(e){
    list.innerHTML='<div class="active-runs-empty">Fehler beim Laden</div>';
  }
}

function selectActiveRun(passphrase){
  const inp=document.getElementById('pp-input');
  if(!inp) return;
  inp.value=passphrase;
  inp.dispatchEvent(new Event('input'));
  onPassphraseInput(passphrase);
  setJoinPasswordVisibility(!!_runProtectionByPassphrase.get(passphrase));
  inp.scrollIntoView({behavior:'smooth',block:'nearest'});
  inp.focus();
}
function toggleCreateProtected(forceState){
  const wrap=document.getElementById('create-password-wrap');
  const inp=document.getElementById('create-password-input');
  const btn=document.getElementById('create-protected-toggle');
  const next=typeof forceState==='boolean'?forceState:!_createProtectedEnabled;
  _createProtectedEnabled=next;
  if(wrap&&inp){
    wrap.style.display=next?'':'none';
    inp.required=!!next;
    if(!next) inp.value='';
  }
  if(btn){
    btn.classList.toggle('on',next);
    btn.setAttribute('aria-pressed',next?'true':'false');
  }
}

// ── ADMIN ──────────────────────────────────────────────────────────────────
let _adminPw = null;

function openAdminLogin(){
  const overlay=document.getElementById('admin-overlay');
  overlay.classList.add('open');
  if(_adminPw){
    document.getElementById('admin-login-section').style.display='none';
    document.getElementById('admin-runs-section').style.display='';
    loadAdminRuns();
  } else {
    document.getElementById('admin-login-section').style.display='';
    document.getElementById('admin-runs-section').style.display='none';
    setTimeout(()=>document.getElementById('admin-pw-input')?.focus(),80);
  }
}

function closeAdmin(){
  document.getElementById('admin-overlay').classList.remove('open');
}

async function verifyAdmin(){
  const pw=document.getElementById('admin-pw-input').value;
  const errEl=document.getElementById('admin-login-error');
  errEl.style.display='none';
  try{
    const r=await fetch('/api/admin/verify',{method:'POST',headers:{'Content-Type':'application/json','x-admin-password':pw},body:JSON.stringify({adminPassword:pw})});
    if(!r.ok){errEl.textContent='Falsches Passwort.';errEl.style.display='block';return;}
    _adminPw=pw;
    document.getElementById('admin-pw-input').value='';
    document.getElementById('admin-login-section').style.display='none';
    document.getElementById('admin-runs-section').style.display='';
    loadAdminRuns();
  }catch(e){errEl.textContent='Verbindungsfehler.';errEl.style.display='block';}
}

async function loadAdminRuns(){
  const list=document.getElementById('admin-runs-list');
  const countEl=document.getElementById('admin-run-count');
  list.innerHTML='<div style="color:var(--txd);font-size:.75rem;text-align:center;padding:12px;font-family:\'Space Mono\',monospace">Wird geladen…</div>';
  try{
    const r=await fetch('/api/runs/active');
    const runs=await r.json();
    countEl.textContent=runs.length;
    if(!runs.length){
      list.innerHTML='<div style="color:var(--txd);font-size:.75rem;text-align:center;padding:16px;font-family:\'Space Mono\',monospace">Keine Runs vorhanden</div>';
      return;
    }
    list.innerHTML=runs.map(run=>{
      const hasPlayers=run.playerCount>0||run.spectatorCount>0;
      const lock=run.isProtected?' 🔒':'';
      const badge=hasPlayers
        ?`<span style="color:var(--gr)">● ${run.playerCount} online</span>`
        :`<span style="color:var(--txd)">○ leer</span>`;
      const pwBtnLabel=run.isProtected?'🔓 Passwort aufheben':'🔒 Passwort setzen';
      return `<div class="admin-run-row" id="admin-row-${CSS.escape(run.passphrase)}">
        <div class="admin-run-info">
          <div class="admin-run-name">${run.name.replace(/</g,'&lt;')}${lock}</div>
          <div class="admin-run-pp">${run.passphrase} &nbsp;·&nbsp; ${badge}</div>
        </div>
        <button class="admin-pw-btn" onclick="manageAdminRunPassword('${run.passphrase.replace(/'/g,"\\'")}', ${run.isProtected?'true':'false'}, this)">${pwBtnLabel}</button>
        <button class="admin-del-btn" onclick="deleteAdminRun('${run.passphrase.replace(/'/g,"\\'")}', this)">🗑 Löschen</button>
      </div>`;
    }).join('');
  }catch(e){
    list.innerHTML='<div style="color:var(--rd);font-size:.75rem;text-align:center;padding:12px;font-family:\'Space Mono\',monospace">Fehler beim Laden</div>';
  }
}

async function manageAdminRunPassword(passphrase, isProtected, btn){
  if(!btn) return;
  btn.disabled=true;
  const oldTxt=btn.textContent;
  btn.textContent='…';
  try{
    let runPassword='';
    if(isProtected){
      if(!confirm(`Passwortschutz für "${passphrase}" aufheben?`)){btn.disabled=false;btn.textContent=oldTxt;return;}
    } else {
      const pw=prompt(`Neues Passwort für "${passphrase}" eingeben:`);
      if(pw===null){btn.disabled=false;btn.textContent=oldTxt;return;}
      runPassword=String(pw).trim();
      if(!runPassword){toast('Passwort darf nicht leer sein',1);btn.disabled=false;btn.textContent=oldTxt;return;}
    }
    const r=await fetch(`/api/admin/runs/${encodeURIComponent(passphrase)}/password`,{
      method:'POST',
      headers:{'Content-Type':'application/json','x-admin-password':_adminPw},
      body:JSON.stringify({runPassword})
    });
    const d=await r.json().catch(()=>({}));
    if(!r.ok){
      if(r.status===401){_adminPw=null;closeAdmin();return;}
      toast(d.error||'Fehler beim Passwort-Update',1);
      btn.disabled=false;btn.textContent=oldTxt;
      return;
    }
    toast(d.isProtected?'Run geschützt':'Passwortschutz aufgehoben');
    loadAdminRuns();
    if(document.getElementById('login-join')?.style.display!=='none') loadActiveRuns();
  }catch(e){
    toast('Verbindungsfehler',1);
    btn.disabled=false;btn.textContent=oldTxt;
  }
}

async function deleteAdminRun(passphrase, btn){
  if(!confirm(`Run "${passphrase}" wirklich löschen?`)) return;
  btn.disabled=true; btn.textContent='…';
  try{
    const r=await fetch(`/api/admin/runs/${encodeURIComponent(passphrase)}`,{method:'DELETE',headers:{'x-admin-password':_adminPw}});
    if(!r.ok){
      if(r.status===401){_adminPw=null;closeAdmin();return;}
      btn.disabled=false; btn.textContent='🗑 Löschen';
      toast('Fehler beim Löschen'); return;
    }
    const row=document.getElementById(`admin-row-${CSS.escape(passphrase)}`);
    if(row){row.style.transition='opacity .3s';row.style.opacity='0';setTimeout(()=>row.remove(),300);}
    const countEl=document.getElementById('admin-run-count');
    if(countEl) countEl.textContent=Math.max(0,(parseInt(countEl.textContent)||1)-1);
    // Refresh active runs list on login screen if visible
    if(document.getElementById('login-join')?.style.display!=='none') loadActiveRuns();
    toast('Run gelöscht');
  }catch(e){btn.disabled=false;btn.textContent='🗑 Löschen';toast('Verbindungsfehler');}
}

function showLoginError(msg){
  const el=document.getElementById('login-error');el.textContent=msg;el.style.display='block';
}

async function createRun(){
  const name=document.getElementById('ni').value.trim();
  const runName=document.getElementById('run-name').value.trim();
  const passwordEnabled=_createProtectedEnabled===true;
  const runPassword=document.getElementById('create-password-input')?.value||'';
  if(!name){showLoginError('Bitte deinen Namen eingeben.');return;}
  if(!runName){showLoginError('Bitte einen Run-Namen eingeben.');return;}
  if(passwordEnabled&&!runPassword.trim()){showLoginError('Bitte ein Run-Passwort eingeben.');return;}
  try{
    const r=await fetch('/api/runs/create',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:runName,passwordEnabled,runPassword})});
    const d=await r.json();
    if(!r.ok){showLoginError(d.error||'Fehler');return;}
    _pendingPassphrase=d.passphrase;
    _pendingRunPassword=passwordEnabled?runPassword:'';
    document.getElementById('login-passphrase-val').textContent=d.passphrase;
    document.getElementById('login-passphrase-box').style.display='block';
    document.getElementById('login-create').style.display='none';
    document.getElementById('login-error').style.display='none';
  }catch(e){showLoginError('Verbindungsfehler.');}
}

let _selectedSlot = 0; // default: Spieler 1
let _createSelectedSlot = 0;
let _slotDebounce = null;

function selectSlot(idx) {
  _selectedSlot = idx;
  [0,1,2].forEach(i => {
    const btn = document.getElementById('slot-btn-'+i);
    if (btn) btn.classList.toggle('selected', i === idx);
  });
  const spec = document.getElementById('slot-btn-spec');
  if (spec) spec.classList.toggle('selected', idx === -1);
}

function selectCreateSlot(idx) {
  _createSelectedSlot = idx;
  [0,1,2].forEach(i => {
    const btn = document.getElementById('create-slot-btn-'+i);
    if (btn) btn.classList.toggle('selected', i === idx);
  });
  const spec = document.getElementById('create-slot-btn-spec');
  if (spec) spec.classList.toggle('selected', idx === -1);
}

async function loadSlots(pp) {
  try {
    const r = await fetch('/api/runs/slots/'+encodeURIComponent(pp));
    if (!r.ok) { setJoinPasswordVisibility(false); return; }
    const {usedSlots,isProtected} = await r.json();
    setJoinPasswordVisibility(!!isProtected);
    const section = document.getElementById('slot-picker-section');
    if (section) section.style.display = '';
    // Update buttons
    [0,1,2].forEach(i => {
      const btn = document.getElementById('slot-btn-'+i);
      const st  = document.getElementById('slot-status-'+i);
      if (!btn) return;
      const taken = usedSlots.includes(i);
      btn.disabled = taken;
      if (st) st.textContent = taken ? 'belegt' : 'frei';
      if (taken && _selectedSlot === i) {
        // Deselect if currently selected slot got taken
        const nextFree = [0,1,2].find(x => !usedSlots.includes(x));
        selectSlot(nextFree !== undefined ? nextFree : -1);
      }
    });
    // Auto-select first free slot if nothing valid selected
    const allFull = usedSlots.length >= 3;
    if (allFull) {
      selectSlot(-1);
      document.getElementById('slot-btn-spec').classList.add('selected');
    } else if (_selectedSlot >= 0 && usedSlots.includes(_selectedSlot)) {
      selectSlot([0,1,2].find(x => !usedSlots.includes(x)) ?? -1);
    }
  } catch(e) {}
}

function onPassphraseInput(val) {
  clearTimeout(_slotDebounce);
  const section = document.getElementById('slot-picker-section');
  if (section) section.style.display = 'none';
  setJoinPasswordVisibility(false);
  const pp = val.trim();

  // Highlight matching run in the list
  document.querySelectorAll('#active-runs-list .active-run-item').forEach(el => {
    const matches = pp.length > 0 && el.getAttribute('data-passphrase') === pp;
    el.classList.toggle('matched', matches);
    if (matches) el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  if (pp.length < 5) return;
  _slotDebounce = setTimeout(() => loadSlots(pp), 500);
}

function copyPassphrase(){
  navigator.clipboard?.writeText(_pendingPassphrase).then(()=>toast('Passphrase kopiert!')).catch(()=>{});
}

function enterRunAfterCreate(){
  const name=document.getElementById('ni').value.trim();
  if(!name||!_pendingPassphrase)return;
  connectToRun(name,_pendingPassphrase, _createSelectedSlot, _pendingRunPassword||'');
}

async function joinRun(){
  const name=document.getElementById('ni').value.trim();
  const pp=document.getElementById('pp-input').value.trim();
  const runPassword=document.getElementById('join-password-input')?.value||'';
  if(!name){showLoginError('Bitte deinen Namen eingeben.');return;}
  if(!pp){showLoginError('Bitte eine Passphrase eingeben.');return;}
  try{
    const r=await fetch('/api/runs/join',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({passphrase:pp,runPassword})});
    const d=await r.json();
    if(!r.ok){showLoginError(d.error||'Run nicht gefunden.');return;}
    connectToRun(name,pp, _selectedSlot, runPassword);
  }catch(e){showLoginError('Verbindungsfehler.');}
}

function connectToRun(name, passphrase, requestedPlayerIndex, joinRunPassword=''){
  myName=name; myPP=passphrase; socket=io();
  socket.on('run-not-found',()=>{ showLoginError('Run nicht gefunden.'); socket.disconnect(); });
  socket.on('run-auth-failed',()=>{ showLoginError('Falsches Run-Passwort.'); socket.disconnect(); });
  socket.on('joined',({socketId,peers:ex,playerIndex,readonly,team:t,box:b,links:l,routes:r,selectedEdition:ed,deathCounts:dc,totalDeathCounts:tdc,badgeStates:bs,levelCaps:lc,runStatus:rs,runCounter:rc,runStartedAt:rsa,runElapsed:rel,runHistory:rh,runPassword:rp,rulesText:rt,rulesTitle:rttl,rulesetId:rsid,trainerCapsText:tct})=>{
    myId=socketId; mySocketId=socketId; myPI=playerIndex;team=t;box=b;links=l;routes=r||[{},{},{}];selectedEdition=ed;
    if(dc)deathCounts=dc;
    if(tdc)totalDeathCounts=tdc;
    if(bs)badgeStates=bs;
    if(lc)levelCaps=lc;
    if(rs!==undefined){runStatus=rs;runCounter=rc||0;runStartedAt=rsa||null;runElapsed=rel||0;}
    runHistory=Array.isArray(rh)?rh:[];
    runPassword=rp||null;
    rulesText=String(rt||'');
    rulesTitle=String(rttl||'');
    rulesetId=Number.isInteger(rsid)?rsid:null;
    trainerCapsText=String(tct||'');
    myReadonly=!!readonly;
    setTimeout(applyReadonlyUI,100);
    document.getElementById('js').style.display='none';
    document.getElementById('mn').style.display='flex';
    document.getElementById('mnb').textContent=myName;
    document.getElementById('ll').textContent=myName+' (Du)';
    dlog('Beigetreten als '+myName+' P'+playerIndex+' sid='+socketId.slice(0,8),'ok');
    dlog('[SYS] UA='+navigator.userAgent.slice(0,120),'i');
    dlog('[SYS] peers='+ex.length+' readonly='+readonly+' platform='+navigator.platform,'i');
    if(myPI<0) resetSlots(); // spectator: reset slot tracking before registering peers
    ex.forEach(p=>regPeer(p.id,p.name,p.sharing,p.playerIndex));
    if(myPI>=0) setTimeout(()=>{let d=0;ex.forEach(p=>{setTimeout(()=>negotiate(p.id),d);d+=300;});},100);
    assignCols();updateAllBars();updateUI();
    const rb=document.getElementById('run-bar-pp');if(rb)rb.textContent='Run: '+passphrase;
    updateRunUI();
    // Spectator: build grid immediately so ro-slots exist before ontrack fires
    if(myPI<0) buildReadonlyGrid();
    if(ed){document.getElementById('edition-sel').value=ed;if(ed!==selectedEdition||!routeData.length)loadEditionRoutes(ed);}
  });
  socket.on('peer-joined',({id,name,playerIndex,readonly})=>{
    regPeer(id,name,false,playerIndex);
    toast(name+' beigetreten');
    assignCols();updateAllBars();updateUI();
    // New peer will send us an offer from their joined handler.
    // We only renegotiate if we're already sharing so they get our stream.
    if(localStream) setTimeout(()=>negotiate(id),300);
  });
  socket.on('peer-left',({id})=>{const p=peers.get(id);if(p){toast(p.name+' weg');remPeer(id);}assignCols();updateAllBars();updateUI();});
  socket.on('send-offer-to',({peerId})=>{ setTimeout(()=>negotiate(peerId),200); });
  socket.on('peer-sharing-state',({id,sharing})=>{ const p=peers.get(id);if(p)p.sharing=sharing; updateUI(); });
  socket.on('offer',async({from,offer})=>{
    if(!peers.has(from)) regPeer(from,'?',false,-1);
    const p=peers.get(from); if(!p) return;
    if(p.pc.signalingState==='closed')return;
    try{
      // Glare: if both sent offers simultaneously, lower socket-id wins
      if(p.pc.signalingState==='have-local-offer'){
        if(mySocketId>from){ await p.pc.setLocalDescription({type:'rollback'}).catch(()=>{}); }
        else { return; }
      }
      await p.pc.setRemoteDescription(new RTCSessionDescription(offer));
      // Flush buffered ICE candidates
      if(p._iceBuf){for(const c of p._iceBuf)try{await p.pc.addIceCandidate(new RTCIceCandidate(c));}catch(e){}p._iceBuf=null;}
      if(localStream) repAdd(p.pc,localStream);
      const a=await p.pc.createAnswer();
      const aVP9=new RTCSessionDescription({type:a.type,sdp:preferVP9(a.sdp)});
      await p.pc.setLocalDescription(aVP9);
      socket.emit('answer',{to:from,answer:aVP9});
      dlog('answer→'+p.name,'i');
    }catch(e){dlog('ans err:'+e.message,'e');}
  });
  socket.on('answer',async({from,answer})=>{
    const p=peers.get(from);if(!p)return;
    try{
      await p.pc.setRemoteDescription(new RTCSessionDescription(answer));
      if(p._iceBuf){for(const c of p._iceBuf)try{await p.pc.addIceCandidate(new RTCIceCandidate(c));}catch(e){}p._iceBuf=null;}
    }catch(e){dlog('setRem:'+e.message,'e');}
  });
  socket.on('ice-candidate',async({from,candidate})=>{
    const p=peers.get(from);if(!p||!candidate)return;
    if(p.pc.remoteDescription){try{await p.pc.addIceCandidate(new RTCIceCandidate(candidate));}catch(e){}}
    else{if(!p._iceBuf)p._iceBuf=[];p._iceBuf.push(candidate);}
  });
  socket.on('use-relay',({peerId})=>{const p=peers.get(peerId);if(!p)return;p.relayMode=true;dlog('Relay '+p.name,'w');if(isSharing&&localStream)startRelay(peerId);});
  socket.on('relay-frame',({from,frame})=>{const p=peers.get(from);if(!p||!p.relayMode)return;renderRelay(from,frame,p.slotIndex,p.name);});
  socket.on('soullink-state',({team:t,box:b,links:l,routes:r,selectedEdition:ed,deathCounts:dc,totalDeathCounts:tdc,badgeStates:bs,levelCaps:lc,runStatus:rs,runCounter:rc,runStartedAt:rsa,runElapsed:rel,runHistory:rh,runPassword:rp,rulesText:rt,rulesTitle:rttl,rulesetId:rsid,trainerCapsText:tct})=>{
    team=t;box=b;links=l;routes=r||[{},{},{}];
    if(dc)deathCounts=dc;
    if(tdc)totalDeathCounts=tdc;
    if(bs)badgeStates=bs;
    if(lc)levelCaps=lc;
    if(rs!==undefined){runStatus=rs;runCounter=rc||0;runStartedAt=rsa||null;runElapsed=rel||0;updateRunUI();}
    if(Array.isArray(rh)) runHistory=rh;
    runPassword=rp||null;
    rulesText=String(rt||'');
    rulesTitle=String(rttl||'');
    rulesetId=Number.isInteger(rsid)?rsid:null;
    trainerCapsText=String(tct||'');
    // Sync edition dropdown + load routes locally (no server reset) when edition changes
    if(ed && ed!==selectedEdition){
      selectedEdition=ed;
      const sel=document.getElementById('edition-sel');
      if(sel&&sel.value!==ed){sel.value=ed;loadEditionRoutes(ed);}
    } else {
      selectedEdition=ed;
    }
    updateAllBars();
    const ap=document.querySelector('.page.active')?.id;
    if(ap==='page-soullink')renderSL();
    if(ap==='page-box'){renderBoxSB();renderBoxMain();}
    if(ap==='page-routes')renderRoutes();
    if(ap==='page-battle')renderBattle();
    if(ap==='page-map')renderMap();
    if(ap==='page-run-history')renderRunHistory();
    if(ap==='page-rules')renderRulesTab();
  });
  socket.on('link-error',msg=>toast(msg,1));
  socket.on('debug-remote',({label,msg,t})=>{
    const p=document.getElementById('dbgp'); if(!p)return;
    const d=document.createElement('div'); d.className='dl '+(t||'');
    const ts=new Date().toLocaleTimeString();
    d.innerHTML='<span style="opacity:.45">'+ts+'</span> <span style="font-weight:700;color:var(--a)">['+label+']</span> <span>'+String(msg).replace(/</g,'&lt;')+'</span>';
    p.appendChild(d); if(p.children.length>800)p.removeChild(p.children[0]); p.scrollTop=p.scrollHeight;
  });
  socket.on('run-started',({runCounter:rc,startedAt})=>{runStatus='active';runCounter=rc;runStartedAt=startedAt;runElapsed=0;updateRunUI();});
  socket.on('run-stopped',()=>{runStatus='paused';runStartedAt=null;updateRunUI();});
  socket.on('run-reset',()=>{runStatus='lobby';runCounter=0;runElapsed=0;updateRunUI();});
  socket.emit('join',{name,passphrase,requestedPlayerIndex:requestedPlayerIndex??0,runPassword:joinRunPassword});
}

function joinRoom(){ connectToRun(document.getElementById('ni').value.trim(), _pendingPassphrase||document.getElementById('pp-input')?.value.trim(), _selectedSlot, document.getElementById('join-password-input')?.value||_pendingRunPassword||''); }

// ═══════════════════════════════════════════════
// COLUMNS
// ═══════════════════════════════════════════════
function updateSgCols(){
  const sg=document.getElementById('sg');if(!sg)return;

  // Count active players (non-spectators)
  const activePeerCount=[...peers.values()].filter(p=>p.playerIndex>=0).length;
  const totalPlayers=myPI>=0?1+activePeerCount:activePeerCount;
  const cols=Math.max(1,Math.min(totalPlayers,3));

  // Show/hide col-1 and col-2 based on player count
  const col1=document.getElementById('col-1');
  const col2=document.getElementById('col-2');
  if(col1) col1.style.display=cols>=2?'':'none';
  if(col2) col2.style.display=cols>=3?'':'none';

  if(_minimized){
    // Minimized: own col is strip, peers fill the rest
    sg.style.gridTemplateColumns='';
    const pr=document.getElementById('peers-row');
    if(pr) pr.classList.toggle('one-peer',cols<=2);
  } else {
    // Normal: set grid columns to match player count
    sg.style.gridTemplateColumns=`repeat(${cols},1fr)`;
  }
}

function assignCols(){
  if(myPI>=0){
    // Normal player: own stream in col-0, peers in col-1/2
    colAssign[myPI]=0; let c=1;
    for(let i=0;i<3;i++){if(i===myPI)continue;colAssign[i]=c++;}
    // Show normal grid
    document.getElementById('sg').style.display='';
    document.getElementById('ro-sg')?.remove();
    document.getElementById('col-0').style.display='';
  } else {
    // Readonly: hide the whole normal grid, show a dedicated readonly grid
    document.getElementById('sg').style.display='none';
    buildReadonlyGrid();
    // colAssign for teambar rendering
    let c=0;
    const sorted=[...peers.values()].filter(p=>p.playerIndex>=0).sort((a,b)=>a.playerIndex-b.playerIndex);
    sorted.forEach(p=>{colAssign[p.playerIndex]=c++;});
  }
  if(myPI>=0){
    // col-0 label = own name
    const lbl0=document.getElementById('col-lbl-0');
    if(lbl0) lbl0.innerHTML=`<span class="pi-badge pi-${myPI}">${myPI+1}</span>${myName}`;

    // col-1 and col-2: labels must match the peer whose video is in slot-peer-0 / slot-peer-1
    // i.e. follow slotIndex order, not playerIndex order
    const peersBySlot=[...peers.values()]
      .filter(p=>p.playerIndex>=0)
      .sort((a,b)=>a.slotIndex-b.slotIndex);
    peersBySlot.forEach((p,i)=>{
      const ci=i+1; // col-1, col-2
      colAssign[p.playerIndex]=ci;
      const el=document.getElementById('col-lbl-'+ci);
      if(el) el.innerHTML=`<span class="pi-badge pi-${p.playerIndex}">${p.playerIndex+1}</span>${p.name}`;
    });

    // Show col-2 only when 3 players are connected
    const activePIs=new Set([myPI,...[...peers.values()].filter(p=>p.playerIndex>=0).map(p=>p.playerIndex)]);
    const col2=document.getElementById('col-2');
    if(col2) col2.style.display=activePIs.size>=3?'':'none';
  }
  if(typeof renderBadgeBars==='function') renderBadgeBars();
  updateSgCols();
}

function buildReadonlyGrid(){
  // Build or refresh a grid of up to 3 columns for readonly viewers.
  // We create ro-col-0..2 with their own screen slots (ro-slot-0..2).
  // regPeer still uses slot-peer-0/1/2 in the hidden original HTML —
  // we MIRROR the video srcObject into ro-slot-N via a MutationObserver/interval.
  let rsg=document.getElementById('ro-sg');
  if(!rsg){
    rsg=document.createElement('div');
    rsg.id='ro-sg';
    rsg.style.cssText='display:grid;grid-template-columns:repeat(3,1fr);gap:11px;padding:13px 18px 6px;flex:1';
    const pb=document.getElementById('peer-bar');
    pb.parentNode.insertBefore(rsg,pb.nextSibling);
  }
  // Don't wipe if videos already exist — just update labels
  const existingVideos=rsg.querySelectorAll('video[src-bound]');
  if(existingVideos.length>0) return; // grid already has active streams, don't destroy
  rsg.innerHTML='';
  const sorted=[...peers.values()].filter(p=>p.playerIndex>=0).sort((a,b)=>a.playerIndex-b.playerIndex);

  // Always show 3 placeholder slots (filled as peers connect)
  const activePIs=[0,1,2];
  activePIs.forEach((pi,i)=>{
    const peer=sorted.find(p=>p.playerIndex===pi);
    const col=document.createElement('div');col.className='scol';
    const lbl=document.createElement('div');lbl.className='scol-lbl';
    lbl.id='ro-lbl-'+pi;
    if(peer){lbl.innerHTML=`<span class="pi-badge pi-${pi}">${pi+1}</span>${peer.name}`;}
    else{lbl.innerHTML=`<span style="color:var(--txd);font-size:.72rem;font-family:Space Mono,monospace">Spieler ${pi+1}</span>`;}
    col.appendChild(lbl);

    // Create a mirror screen slot
    const slot=document.createElement('div');
    slot.className='ss'+(peer?.sharing?' has-stream':'');
    slot.id='ro-slot-'+pi;
    slot.style.cssText='background:var(--sf);border:1px solid var(--bd);border-radius:12px;overflow:hidden;aspect-ratio:16/9;position:relative';
    if(!peer){
      slot.innerHTML='<div class="sse"><div style="font-size:1.8rem;opacity:.16">👤</div><span style="font-size:.7rem;font-family:Space Mono,monospace;color:var(--txd)">Spieler '+(pi+1)+'…</span></div>';
    } else {
      // Mirror the video from the original slot-peer-N
      const srcSlot=document.getElementById('slot-peer-'+peer.slotIndex);
      const srcVid=srcSlot?.querySelector('video');
      if(srcVid&&srcVid.srcObject){
        const v=document.createElement('video');v.autoplay=true;v.playsinline=true;v.muted=true;
        v.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:5';
        v.srcObject=srcVid.srcObject;v.play().catch(()=>{});
        slot.appendChild(v);
        slot.classList.add('has-stream');
      } else {
        slot.innerHTML=`<div class="sse"><div style="font-size:1.8rem;opacity:.16">👤</div><span style="font-size:.7rem;font-family:Space Mono,monospace;color:var(--txd)">${peer.name} (kein Stream)</span></div>`;
      }
      // Also mirror ice badge
      const srcIce=srcSlot?.querySelector('.iceb');
      if(srcIce){const ib=srcIce.cloneNode(true);slot.appendChild(ib);}
    }
    col.appendChild(slot);
    rsg.appendChild(col);
  });

  // Poll: mirror srcObjects from hidden slot-peer-N into visible ro-slot-N
  // Uses live peers map so it works even if peers join after buildReadonlyGrid runs
  clearInterval(window._roPoll);
  window._roPoll=setInterval(()=>{
    if(myPI>=0){clearInterval(window._roPoll);return;} // no longer spectator
    peers.forEach(p=>{
      if(p.playerIndex<0)return;
      const srcSlot=document.getElementById('slot-peer-'+p.slotIndex);
      if(!srcSlot)return;
      // Ensure ro-slot exists — create it if missing but NEVER destroy existing ones
      let roSlot=document.getElementById('ro-slot-'+p.playerIndex);
      if(!roSlot){
        // Only rebuild if the grid container exists but slot is missing
        const rsg=document.getElementById('ro-sg');
        if(rsg){
          const col=document.createElement('div');col.className='scol';
          const lbl=document.createElement('div');lbl.className='scol-lbl';lbl.id='ro-lbl-'+p.playerIndex;
          lbl.innerHTML=`<span class="pi-badge pi-${p.playerIndex}">${p.playerIndex+1}</span>${p.name}`;
          roSlot=document.createElement('div');
          roSlot.className='ss';roSlot.id='ro-slot-'+p.playerIndex;
          roSlot.style.cssText='background:var(--sf);border:1px solid var(--bd);border-radius:12px;overflow:hidden;aspect-ratio:16/9;position:relative';
          roSlot.innerHTML=`<div class="sse"><div style="font-size:1.8rem;opacity:.16">👤</div><span style="font-size:.7rem;font-family:Space Mono,monospace;color:var(--txd)">${p.name} (kein Stream)</span></div>`;
          col.appendChild(lbl);col.appendChild(roSlot);rsg.appendChild(col);
        } else {
          buildReadonlyGrid(); roSlot=document.getElementById('ro-slot-'+p.playerIndex);
        }
      }
      if(!roSlot)return;

      const srcVid=srcSlot.querySelector('video');
      let roVid=roSlot.querySelector('video');

      if(srcVid?.srcObject){
        if(!roVid){
          roVid=document.createElement('video');
          roVid.autoplay=true;roVid.playsinline=true;roVid.muted=true;
          roVid.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:5';
          // Clear placeholder, add video
          roSlot.querySelectorAll('.sse').forEach(e=>e.remove());
          roSlot.appendChild(roVid);
          roSlot.classList.add('has-stream');
        }
        if(roVid.srcObject!==srcVid.srcObject){
          roVid.srcObject=srcVid.srcObject;
          roVid.setAttribute('src-bound','1');
          roVid.play().catch(()=>{});
        }
        // Update label
        const lbl2=document.getElementById('ro-lbl-'+p.playerIndex);
        if(lbl2){lbl2.innerHTML=`<span class="pi-badge pi-${p.playerIndex}">${p.playerIndex+1}</span>${p.name}`;}
      } else if(!srcVid?.srcObject && roSlot.classList.contains('has-stream')){
        // Stream stopped
        roVid?.remove();
        roSlot.classList.remove('has-stream');
        roSlot.innerHTML='<div class="sse"><div style="font-size:1.8rem;opacity:.16">👤</div><span style="font-size:.7rem;font-family:Space Mono,monospace;color:var(--txd)">'+p.name+' (kein Stream)</span></div>';
      }
    });
  },300);
}

// ═══════════════════════════════════════════════
// PEERS / WebRTC
// ═══════════════════════════════════════════════
const slotUsed3=[false,false,false];
function allocSlot(){const arr=myPI<0?slotUsed3:slotUsed;for(let i=0;i<arr.length;i++)if(!arr[i]){arr[i]=true;return i;}return null;}
function resetSlots(){slotUsed3[0]=slotUsed3[1]=slotUsed3[2]=false;}
function freeSlotFor(i){if(myPI<0)slotUsed3[i]=false;else slotUsed[i]=false;}
function freeSlot(i){freeSlotFor(i);}

function regPeer(id,name,sharing,pi){
  if(peers.has(id))return;
  const si=allocSlot();if(si===null){dlog('no slot','e');return;}
  const pc=makePc(id,si,name);
  peers.set(id,{name,sharing,playerIndex:pi,pc,slotIndex:si,relayMode:false});
  const s=document.getElementById('slot-peer-'+si);
  if(s){let l=s.querySelector('.ssl');if(!l){l=document.createElement('div');l.className='ssl';s.appendChild(l);}l.textContent=name;const e=s.querySelector('.sse span');if(e)e.textContent=name+' (kein Stream)';setIce(si,'checking');}
}
function remPeer(id){
  const p=peers.get(id);if(!p)return;
  _negotiating.delete(id);
  // Remove senders from shared budget tracking
  p.pc.getSenders().forEach(s=>{
    for(const [tid,arr] of _senders){
      const idx=arr.indexOf(s);if(idx>=0)arr.splice(idx,1);
      if(!arr.length)_senders.delete(tid);
    }
  });
  _applyEncodingBudget();
  p.pc.close();
  const s=document.getElementById('slot-peer-'+p.slotIndex);
  if(s){s.classList.remove('has-stream');const v=s.querySelector('video');if(v){v.srcObject=null;v.style.display='none';}s.querySelector('.ssl')?.remove();s.querySelector('.iceb')?.remove();const e=s.querySelector('.sse');if(e){e.style.display='flex';e.querySelector('span').textContent='Wartet…';}}
  freeSlot(p.slotIndex);peers.delete(id);
}
function makePc(pid,si,name){
  const pc=new RTCPeerConnection({
    iceServers: ICE,
    bundlePolicy: 'max-bundle',      // one transport for all tracks = less overhead
    rtcpMuxPolicy: 'require',        // mux RTCP into RTP channel, halves connections
    iceTransportPolicy: 'all',
    sdpSemantics: 'unified-plan',
  });
  pc.onicecandidate=({candidate})=>{if(candidate)socket.emit('ice-candidate',{to:pid,candidate});};
  pc.oniceconnectionstatechange=()=>{
    const st=pc.iceConnectionState;const p=peers.get(pid);if(p)p.iceState=st;
    dlog('ICE '+name+':'+st,st==='connected'||st==='completed'?'ok':st==='failed'?'e':'i');
    if(st==='connected'||st==='completed') setTimeout(_applyEncodingBudget,200);
    setIce(si,st);if(st==='failed'||st==='disconnected')socket.emit('ice-status',{to:pid,status:st});updateSBar();
  };
  pc.ontrack=({track,streams})=>{
    dlog('track '+name+' '+track.kind,'ok');if(track.kind!=='video')return;
    const stream=(streams&&streams.length)?streams[0]:new MediaStream([track]);

    // For spectators: wire directly to the visible ro-slot (skip hidden slot-peer-N)
    const peer=peers.get(pid);
    dlog('ontrack: myPI='+myPI+' pid='+pid+' peerPI='+(peer?.playerIndex)+' si='+si,'ok');

    let targetSlotId;
    if(myPI<0 && peer?.playerIndex>=0){
      // Spectator: use ro-slot, build grid if missing
      if(!document.getElementById('ro-slot-'+peer.playerIndex)) buildReadonlyGrid();
      targetSlotId='ro-slot-'+peer.playerIndex;
    } else {
      targetSlotId='slot-peer-'+si;
    }
    dlog('ontrack target='+targetSlotId+' exists='+!!document.getElementById(targetSlotId),'ok');
    const s=document.getElementById(targetSlotId)||document.getElementById('slot-peer-'+si);
    if(!s)return;
    let v=s.querySelector('video');
    if(!v){
      v=document.createElement('video');v.autoplay=true;v.playsinline=true;
      v.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:5;display:none;';
      s.appendChild(v);
    }
    v.srcObject=stream;v.setAttribute('src-bound','1');v.style.display='block';
    const act=()=>{s.classList.add('has-stream');const e=s.querySelector('.sse');if(e)e.style.display='none';if(peer)peer.sharing=true;updateUI();};
    v.addEventListener('loadedmetadata',()=>{v.play().catch(()=>{});act();},{once:true});
    track.addEventListener('unmute',()=>{v.play().catch(()=>{});if(v.readyState>=1)act();});
    v.play().catch(()=>{});
    let n=0;const poll=setInterval(()=>{n++;if(v.readyState>=1||v.videoWidth>0){clearInterval(poll);v.play().catch(()=>{});act();}if(n>=60)clearInterval(poll);},300);
  };
  if(localStream) repAdd(pc,localStream);
  // No local stream: add recvonly transceiver so remote can send to us
  else { try{ pc.addTransceiver('video',{direction:'recvonly'}); }catch(e){} }
  return pc;
}
// negotiate: create offer and send to peer. Safe to call multiple times.
const _negotiating = new Set();
async function negotiate(pid){
  const p=peers.get(pid);if(!p)return;
  if(p.pc.signalingState==='closed')return; // PC gone
  // If already negotiating, mark for retry after current round
  if(_negotiating.has(pid)){p._renegotiate=true;return;}
  _negotiating.add(pid);
  try{
    if(localStream) repAdd(p.pc,localStream);
    // Ensure a transceiver exists
    if(!p.pc.getTransceivers().length) p.pc.addTransceiver('video',{direction:'sendrecv'});
    // Wait for stable (up to 3s)
    for(let i=0;i<30&&p.pc.signalingState!=='stable';i++)
      await new Promise(r=>setTimeout(r,100));
    if(p.pc.signalingState!=='stable'){dlog('negotiate skip ('+p.pc.signalingState+'): '+p.name,'w');_negotiating.delete(pid);return;}
    const o=await p.pc.createOffer();
    const sdp=new RTCSessionDescription({type:o.type,sdp:preferVP9(o.sdp)});
    await p.pc.setLocalDescription(sdp);
    socket.emit('offer',{to:pid,offer:sdp});
    dlog('offer→'+p.name,'i');
  }catch(e){dlog('negotiate err:'+e.message,'e');}
  _negotiating.delete(pid);
  // Retry if renegotiation was requested while we were busy
  if(p?._renegotiate){p._renegotiate=false;setTimeout(()=>negotiate(pid),100);}
}
function sendOffer(pid){ negotiate(pid); }
// ── SFU-style: shared encoding across all PeerConnections ────────────────────
// Instead of each PC encoding independently, we reuse the same MediaStreamTrack
// and cap bitrate/framerate so all PCs share one encode budget.
const _senders = new Map(); // trackId → [RTCRtpSender]

function repAdd(pc, stream) {
  stream.getTracks().forEach(t => {
    const existing = pc.getSenders().find(s => s.track?.kind === t.kind);
    if (existing) {
      existing.replaceTrack(t).catch(() => {});
      _trackSender(t, existing);
    } else {
      const sender = pc.addTrack(t, stream);
      _trackSender(t, sender);
    }
  });
}

function _trackSender(track, sender) {
  if (!_senders.has(track.id)) _senders.set(track.id, []);
  if (!_senders.get(track.id).includes(sender)) _senders.get(track.id).push(sender);
  _applyEncodingBudget();
}

// Apply equal budget across all active senders for this track
// Each sender gets maxBitrate / N so total stays constant regardless of peer count
async function _applyEncodingBudget() {
  for (const [, senders] of _senders) {
    const active = senders.filter(s => s.track && s.track.readyState === 'live');
    const n = Math.max(1, active.length);
    // Total budget: 1500 kbps split equally across all peers
    const perPeer = Math.floor(1500_000 / n);
    for (const sender of active) {
      if (sender.track?.kind !== 'video') continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings?.length) params.encodings = [{}];
        params.encodings.forEach(e => {
          e.maxBitrate            = perPeer;
          e.maxFramerate          = 60;
          e.networkPriority       = 'high';
          e.priority              = 'high';
          e.degradationPreference = 'maintain-resolution'; // drop fps before blurring
        });
        await sender.setParameters(params);
      } catch (_) {}
    }
  }
}

// Prefer VP9 in SDP — better compression than VP8, lower CPU at same quality
function preferVP9(sdp) {
  const sep = sdp.includes('\r\n') ? '\r\n' : '\n';
  const lines = sdp.split(sep);
  let mLineIdx = -1, vp9Pts = [], h264Pts = [];
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('m=video')) { mLineIdx = i; vp9Pts = []; h264Pts = []; }
    if (mLineIdx >= 0) {
      if (/^a=rtpmap:\d+ VP9/.test(lines[i])) {
        const pt = lines[i].match(/^a=rtpmap:(\d+)/)?.[1];
        if (pt) vp9Pts.push(pt);
      }
    }
  }
  if (mLineIdx < 0 || !vp9Pts.length) return sdp;
  // Move VP9 to front of m= line, strip RTX for VP9 (reduces overhead)
  const parts = lines[mLineIdx].split(' ');
  const rest = parts.slice(3).filter(p => !vp9Pts.includes(p));
  lines[mLineIdx] = [...parts.slice(0, 3), ...vp9Pts, ...rest].join(' ');
  // Remove a=fmtp lines for non-VP9 video codecs to trim SDP size (optional)
  return lines.join(sep);
}

const rtimers=new Map(),rels=new Map();
function startRelay(pid){
  if(rtimers.has(pid))return;
  const c=document.createElement('canvas');c.width=640;c.height=360;
  const ctx=c.getContext('2d'),vid=document.getElementById('lv');
  const tid=setInterval(()=>{if(!localStream){clearInterval(tid);rtimers.delete(pid);return;}ctx.drawImage(vid,0,0,640,360);c.toBlob(b=>{if(!b)return;b.arrayBuffer().then(buf=>socket.emit('relay-frame',{to:pid,frame:buf}));},'image/webp',.6);},100);
  rtimers.set(pid,tid);
}
function renderRelay(fid,frame,si,name){
  let c=rels.get(fid);const s=document.getElementById('slot-peer-'+si);if(!s)return;
  if(!c){c=document.createElement('canvas');c.style.cssText='position:absolute;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:5;';s.appendChild(c);rels.set(fid,c);s.classList.add('has-stream');const e=s.querySelector('.sse');if(e)e.style.display='none';setIce(si,'relay');}
  const blob=new Blob([frame],{type:'image/webp'}),url=URL.createObjectURL(blob),img=new Image();
  img.onload=()=>{c.width=img.width;c.height=img.height;c.getContext('2d').drawImage(img,0,0);URL.revokeObjectURL(url);};img.src=url;
}
function setIce(si,st){
  const s=document.getElementById('slot-peer-'+si);if(!s)return;
  let b=s.querySelector('.iceb');if(!b){b=document.createElement('div');b.className='iceb';s.appendChild(b);}
  b.className='iceb';
  if(st==='connected'||st==='completed'){b.classList.add('connected');b.textContent='P2P ✓';}
  else if(st==='relay'){b.classList.add('relay');b.textContent='Relay ✓';}
  else if(st==='failed'){b.classList.add('failed');b.textContent='!';}
  else if(st==='checking'){b.classList.add('checking');b.textContent='…';}
}

// ─── Screen share ─────────────────────────────
async function toggleShare(){
  if(!isSharing){
    try{
      localStream=await navigator.mediaDevices.getDisplayMedia({
        video:{
          frameRate:{ideal:60,max:60},
          width:{ideal:1280,max:1920},
          height:{ideal:720,max:1080},
          displaySurface:'monitor',
          cursor:'always',
        },
        audio:false,
        selfBrowserSurface:'exclude',
        systemAudio:'exclude',
      });
      // contentHint='detail' tells encoder to prioritize sharpness over motion smoothness
      // — ideal for game screenshots with static UI (PokéHUD, text, sprites)
      localStream.getVideoTracks().forEach(t=>{ t.contentHint='detail'; });
      const v=document.getElementById('lv');v.srcObject=localStream;v.style.display='block';
      document.getElementById('slot-local').querySelector('.sse').style.display='none';
      document.getElementById('slot-local').classList.add('has-stream');
      // Add tracks first, then renegotiate with ALL peers
      peers.forEach((p,id)=>{
        repAdd(p.pc,localStream);
        if(p.relayMode) startRelay(id);
      });
      setTimeout(()=>{
        peers.forEach((p,id)=>{repAdd(p.pc,localStream);negotiate(id);});
        setTimeout(_applyEncodingBudget,1500);
      },50);
      localStream.getVideoTracks()[0].onended=stopShare;
      isSharing=true;document.getElementById('shbtn').textContent='⏹ Stopp';document.getElementById('shbtn').classList.add('active');
      socket.emit('sharing-state',{sharing:true});updateUI();
    }catch(e){dlog('getDisplayMedia:'+e.message,'e');toast('Screen-Sharing abgebrochen.',1);}
  }else stopShare();
}
function stopShare(){
  localStream?.getTracks().forEach(t=>t.stop());localStream=null;
  const v=document.getElementById('lv');v.srcObject=null;v.style.display='none';
  document.getElementById('slot-local').querySelector('.sse').style.display='flex';
  document.getElementById('slot-local').classList.remove('has-stream');
  rtimers.forEach((tid,id)=>{clearInterval(tid);rtimers.delete(id);});
  isSharing=false;document.getElementById('shbtn').textContent='🖥 Teilen';document.getElementById('shbtn').classList.remove('active');
  socket.emit('sharing-state',{sharing:false});updateUI();
}

// ═══════════════════════════════════════════════
// HELPERS: link queries
// ═══════════════════════════════════════════════
function locStr(loc,si){
  if(loc==='team')return'team:'+si;
  if(typeof loc==='object'){if('box'in loc)return`box:${loc.box}:${loc.slot}`;if('route'in loc)return`route:${loc.route}`;}
  return String(loc);
}
function slotLocStr(s){return locStr(s.location,s.slotIndex);}
function isLinked(pi,locS){return links.some(lk=>lk.slots.some(s=>s.playerIndex===pi&&slotLocStr(s)===locS));}
function isBroken(pi,locS){return links.some(lk=>lk.broken&&lk.slots.some(s=>s.playerIndex===pi&&slotLocStr(s)===locS));}

// ═══════════════════════════════════════════════
// TEAM BARS
// ═══════════════════════════════════════════════
// ── Arena/Badge data per version-group ───────────────────────────────────────
// Format: { id, name, color, sprite? } — sprite from PokeAPI item sprites
// Badge images from Bulbapedia via Special:FilePath (stable redirects, no hash needed)
const BADGE_IMG = (filename) => `https://bulbapedia.bulbagarden.net/wiki/Special:FilePath/${encodeURIComponent(filename)}`;

// Retry a failed image up to maxRetries times with exponential backoff
function imgWithRetry(img, src, maxRetries=4){
  let attempts=0;
  function tryLoad(){
    img.src=''; // force reload
    // small delay before setting src to avoid browser caching the failure
    setTimeout(()=>{ img.src=src+'?_r='+attempts; },50);
  }
  img.onerror=()=>{
    if(attempts<maxRetries){
      attempts++;
      const delay=500*Math.pow(2,attempts-1); // 500ms, 1s, 2s, 4s
      setTimeout(tryLoad, delay);
    }
    // after all retries exhausted, let caller's own onerror handle it
    // (we leave img.src as the last attempt so the browser error shows)
  };
  img.src=src;
}

const BADGE_DATA = {
  'red-blue': [
    {id:'boulder-badge',name:'Boulder',color:'#a0522d',img:'Boulder_Badge.png'},
    {id:'cascade-badge',name:'Cascade',color:'#4169e1',img:'Cascade_Badge.png'},
    {id:'thunder-badge',name:'Thunder',color:'#ffd700',img:'Thunder_Badge.png'},
    {id:'rainbow-badge',name:'Rainbow',color:'#ff69b4',img:'Rainbow_Badge.png'},
    {id:'soul-badge',name:'Soul',color:'#9370db',img:'Soul_Badge.png'},
    {id:'marsh-badge',name:'Marsh',color:'#8fbc8f',img:'Marsh_Badge.png'},
    {id:'volcano-badge',name:'Volcano',color:'#ff4500',img:'Volcano_Badge.png'},
    {id:'earth-badge',name:'Earth',color:'#556b2f',img:'Earth_Badge.png'},
    {id:'e4-lorelei',name:'Lorelei',color:'#aaddff',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/lorelei-gen3.png'},
    {id:'e4-bruno',name:'Bruno',color:'#cc4444',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/bruno.png'},
    {id:'e4-agatha',name:'Agatha',color:'#9966cc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/agatha-gen3.png'},
    {id:'e4-lance',name:'Lance',color:'#cc2222',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/lance.png'},
    {id:'champion-blue',name:'Blue',color:'#4466cc',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/blue.png'},
  ],
  'yellow': 'red-blue',
  'firered-leafgreen': 'red-blue',
  'gold-silver': [
    {id:'zephyr-badge',name:'Zephyr',color:'#aaaacc',img:'Zephyr_Badge.png'},
    {id:'hive-badge',name:'Hive',color:'#ddcc44',img:'Hive_Badge.png'},
    {id:'plain-badge',name:'Plain',color:'#88cc88',img:'Plain_Badge.png'},
    {id:'fog-badge',name:'Fog',color:'#9988aa',img:'Fog_Badge.png'},
    {id:'storm-badge',name:'Storm',color:'#4488ff',img:'Storm_Badge.png'},
    {id:'mineral-badge',name:'Mineral',color:'#aaaaaa',img:'Mineral_Badge.png'},
    {id:'glacier-badge',name:'Glacier',color:'#88ccff',img:'Glacier_Badge.png'},
    {id:'rising-badge',name:'Rising',color:'#cc4444',img:'Rising_Badge.png'},
    {id:'e4-will',name:'Will',color:'#9966cc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/will.png'},
    {id:'e4-koga',name:'Koga',color:'#446644',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/koga.png'},
    {id:'e4-bruno2',name:'Bruno',color:'#cc4444',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/bruno.png'},
    {id:'e4-karen',name:'Karen',color:'#334466',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/karen.png'},
    {id:'champion-lance',name:'Lance',color:'#cc2222',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/lance.png'},
  ],
  'crystal': 'gold-silver',
  'heartgold-soulsilver': 'gold-silver',
  'ruby-sapphire': [
    {id:'stone-badge',name:'Stone',color:'#aaaaaa',img:'Stone_Badge.png'},
    {id:'knuckle-badge',name:'Knuckle',color:'#cc4444',img:'Knuckle_Badge.png'},
    {id:'dynamo-badge',name:'Dynamo',color:'#ffdd44',img:'Dynamo_Badge.png'},
    {id:'heat-badge',name:'Heat',color:'#ff6622',img:'Heat_Badge.png'},
    {id:'balance-badge',name:'Balance',color:'#44aa44',img:'Balance_Badge.png'},
    {id:'feather-badge',name:'Feather',color:'#88aaff',img:'Feather_Badge.png'},
    {id:'mind-badge',name:'Mind',color:'#cc66cc',img:'Mind_Badge.png'},
    {id:'rain-badge',name:'Rain',color:'#4466ff',img:'Rain_Badge.png'},
    {id:'e4-sidney',name:'Sidney',color:'#333344',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/sidney.png'},
    {id:'e4-phoebe',name:'Phoebe',color:'#8855aa',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/phoebe.png'},
    {id:'e4-glacia',name:'Glacia',color:'#99ccff',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/glacia.png'},
    {id:'e4-drake',name:'Drake',color:'#cc3322',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/drake.png'},
    {id:'champion-steven',name:'Steven',color:'#aaaacc',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/steven.png'},
  ],
  'emerald': 'ruby-sapphire',
  'omega-ruby-alpha-sapphire': 'ruby-sapphire',
  'diamond-pearl': [
    {id:'coal-badge',name:'Coal',color:'#555544',img:'Coal_Badge.png'},
    {id:'forest-badge',name:'Forest',color:'#44aa44',img:'Forest_Badge.png'},
    {id:'cobble-badge',name:'Cobble',color:'#888877',img:'Cobble_Badge.png'},
    {id:'fen-badge',name:'Fen',color:'#4488cc',img:'Fen_Badge.png'},
    {id:'relic-badge',name:'Relic',color:'#aa9955',img:'Relic_Badge.png'},
    {id:'mine-badge',name:'Mine',color:'#555566',img:'Mine_Badge.png'},
    {id:'icicle-badge',name:'Icicle',color:'#99ddff',img:'Icicle_Badge.png'},
    {id:'beacon-badge',name:'Beacon',color:'#ffdd44',img:'Beacon_Badge.png'},
    {id:'e4-aaron',name:'Aaron',color:'#55aa33',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/aaron.png'},
    {id:'e4-bertha',name:'Bertha',color:'#aa7733',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/bertha.png'},
    {id:'e4-flint',name:'Flint',color:'#cc4411',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/flint.png'},
    {id:'e4-lucian',name:'Lucian',color:'#7755cc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/lucian.png'},
    {id:'champion-cynthia',name:'Cynthia',color:'#ffd700',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/cynthia.png'},
  ],
  'platinum': 'diamond-pearl',
  'black-white': [
    {id:'trio-badge',name:'Trio',color:'#4499cc',img:'Trio_Badge.png'},
    {id:'basic-badge',name:'Basic',color:'#777766',img:'Basic_Badge.png'},
    {id:'insect-badge',name:'Insect',color:'#88aa44',img:'Insect_Badge.png'},
    {id:'bolt-badge',name:'Bolt',color:'#ffdd22',img:'Bolt_Badge.png'},
    {id:'quake-badge',name:'Quake',color:'#aa7733',img:'Quake_Badge.png'},
    {id:'jet-badge',name:'Jet',color:'#aabbcc',img:'Jet_Badge.png'},
    {id:'freeze-badge',name:'Freeze',color:'#99eeff',img:'Freeze_Badge.png'},
    {id:'legend-badge',name:'Legend',color:'#ddcc44',img:'Legend_Badge.png'},
    {id:'e4-shauntal',name:'Shauntal',color:'#7755aa',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/shauntal.png'},
    {id:'e4-marshal',name:'Marshal',color:'#cc4433',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/marshal.png'},
    {id:'e4-grimsley',name:'Grimsley',color:'#333344',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/grimsley.png'},
    {id:'e4-caitlin',name:'Caitlin',color:'#ffaacc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/caitlin.png'},
    {id:'champion-alder',name:'Alder',color:'#cc4422',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/alder.png'},
  ],
  'black-2-white-2': 'black-white',
  'x-y': [
    {id:'bug-badge',name:'Bug',color:'#88aa44',img:'Bug_Badge.png'},
    {id:'cliff-badge',name:'Cliff',color:'#aa7733',img:'Cliff_Badge.png'},
    {id:'rumble-badge',name:'Rumble',color:'#cc4411',img:'Rumble_Badge.png'},
    {id:'plant-badge',name:'Plant',color:'#44aa66',img:'Plant_Badge.png'},
    {id:'voltage-badge',name:'Voltage',color:'#ffdd22',img:'Voltage_Badge.png'},
    {id:'fairy-badge',name:'Fairy',color:'#ff88cc',img:'Fairy_Badge.png'},
    {id:'psychic-badge',name:'Psychic',color:'#cc66bb',img:'Psychic_Badge.png'},
    {id:'iceberg-badge',name:'Iceberg',color:'#88ddff',img:'Iceberg_Badge.png'},
    {id:'e4-malva',name:'Malva',color:'#cc4411',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/malva.png'},
    {id:'e4-siebold',name:'Siebold',color:'#4488ff',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/siebold.png'},
    {id:'e4-wikstrom',name:'Wikstrom',color:'#aaaaaa',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/wikstrom.png'},
    {id:'e4-drasna',name:'Drasna',color:'#886633',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/drasna.png'},
    {id:'champion-diantha',name:'Diantha',color:'#ddaacc',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/diantha.png'},
  ],
  'sun-moon': [
    {id:'iki-stamp',name:'Melemele',color:'#ffcc44'},
    {id:'akala-stamp',name:'Akala',color:'#ff6644'},
    {id:'ula-stamp',name:"Ula'ula",color:'#cc44cc'},
    {id:'poni-stamp',name:'Poni',color:'#4477ff'},
    {id:'e4-hala',name:'Hala',color:'#cc4444',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/hala.png'},
    {id:'e4-olivia',name:'Olivia',color:'#cc66aa',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/olivia.png'},
    {id:'e4-acerola',name:'Acerola',color:'#9966cc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/acerola.png'},
    {id:'e4-kahili',name:'Kahili',color:'#557799',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/kahili.png'},
    {id:'champion-kukui',name:'Kukui',color:'#ffd700',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/kukui.png'},
  ],
  'ultra-sun-ultra-moon': 'sun-moon',
  'sword-shield': [
    {id:'turffield-badge',name:'Turffield',color:'#44aa44'},
    {id:'hulbury-badge',name:'Hulbury',color:'#4488ff'},
    {id:'motostoke-badge',name:'Motostoke',color:'#cc4411'},
    {id:'stow-badge',name:'Stow-on-Side',color:'#99eeff'},
    {id:'ballonlea-badge',name:'Ballonlea',color:'#9944cc'},
    {id:'circhester-badge',name:'Circhester',color:'#aaaacc'},
    {id:'spikemuth-badge',name:'Spikemuth',color:'#cc3333'},
    {id:'hammerlocke-badge',name:'Hammerlocke',color:'#7733ff'},
    {id:'e4-bede',name:'Bede',color:'#ffaacc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/bede.png'},
    {id:'e4-marnie',name:'Marnie',color:'#ff44aa',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/marnie.png'},
    {id:'e4-nessa',name:'Nessa',color:'#4499cc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/nessa.png'},
    {id:'e4-raihan',name:'Raihan',color:'#8855cc',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/raihan.png'},
    {id:'champion-leon',name:'Leon',color:'#cc4422',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/leon.png'},
  ],
  'scarlet-violet': [
    {id:'cortondo-badge',name:'Cortondo',color:'#88aa44'},
    {id:'artazon-badge',name:'Artazon',color:'#44aa88'},
    {id:'levincia-badge',name:'Levincia',color:'#ffdd22'},
    {id:'cascarrafa-badge',name:'Cascarrafa',color:'#4499cc'},
    {id:'medali-badge',name:'Medali',color:'#888877'},
    {id:'montenevera-badge',name:'Montenevera',color:'#9966cc'},
    {id:'alfornada-badge',name:'Alfornada',color:'#cc4488'},
    {id:'glaseado-badge',name:'Glaseado',color:'#aaddff'},
    {id:'e4-rika',name:'Rika',color:'#886633',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/rika.png'},
    {id:'e4-poppy',name:'Poppy',color:'#aaaaaa',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/poppy.png'},
    {id:'e4-larry',name:'Larry',color:'#555566',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/larry.png'},
    {id:'e4-hassel',name:'Hassel',color:'#cc4422',e4:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/hassel.png'},
    {id:'champion-geeta',name:'Geeta',color:'#ffd700',champion:true,sprite:'https://play.pokemonshowdown.com/sprites/trainers/geeta.png'},
  ],
};

function getBadgesForEdition(edition){
  if(!edition)return null;
  let d=BADGE_DATA[edition];
  if(typeof d==='string')d=BADGE_DATA[d]; // alias
  return d||null;
}

function updateAllBars(){
  for(let pi=0;pi<3;pi++){const ci=colAssign[pi];if(ci!==undefined&&pi>=0)renderTBar(pi,ci);}
  assignCols();
  renderDCBars();
  renderBadgeBars();
}

function renderBadgeBars(){
  const cbar=document.getElementById('central-badge-bar');
  if(!cbar)return;
  const badges=getBadgesForEdition(selectedEdition);
  const toggleBtn=document.getElementById('badge-toggle-btn');
  if(!badges){cbar.classList.remove('open');cbar.innerHTML='';if(toggleBtn)toggleBtn.classList.remove('visible');return;}
  if(toggleBtn)toggleBtn.classList.add('visible');
  cbar.innerHTML='';
  // Keep open state if already open, otherwise stay collapsed

  // One shared row — use myPI's badge states (the local player clicks for themselves)
  // All players see the same central bar; clicking advances YOUR own badge state
  const pi = myPI >= 0 ? myPI : (getAPIs()[0] ?? 0);
  const pState = badgeStates[pi] || {};
  const row = document.createElement('div');
  row.className = 'player-badge-row';
  row.style.cssText = 'display:flex;gap:5px;flex-wrap:wrap;align-items:center;justify-content:center;width:100%';

  badges.forEach(b => {
    const state = pState[b.id] || 0;
    const cap = levelCaps[b.id];

    // Wrapper: cap label on top, badge below
    const wrap = document.createElement('div');
    wrap.className = 'lc-wrap';

    // Level cap input
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = '1'; inp.max = '100';
    inp.className = 'lc-inp';
    inp.placeholder = '--';
    inp.title = 'Level Cap für ' + b.name;
    if(cap) inp.value = cap;
    inp.disabled = !!myReadonly;
    inp.addEventListener('change', () => {
      const v = inp.value.trim();
      socket.emit('set-level-cap', { badgeId: b.id, cap: v===''?null:parseInt(v)||null });
    });
    inp.addEventListener('click', e => e.stopPropagation());
    wrap.appendChild(inp);

    const el = document.createElement('div');
    el.className = 'gym-badge state-' + state;
    el.title = b.name + (b.e4 ? ' (Top 4)' : b.champion ? ' (Champion)' : '');

    if (b.sprite) {
      const img = document.createElement('img');
      img.style.cssText = 'width:40px;height:40px;object-fit:contain;image-rendering:pixelated';
      img.alt = b.name;
      // Final fallback after retries exhausted
      const fallback=()=>{ try{img.replaceWith(document.createTextNode(b.name[0]));}catch(_){} el.style.background=b.color+'44'; };
      imgWithRetry(img, b.sprite, 4);
      img.addEventListener('error', fallback, {once:true}); // fires only after retries give up
      el.appendChild(img);
      el.style.width = '44px'; el.style.height = '44px'; el.style.borderRadius = '4px';
      if (b.champion) { el.style.outline = '2px solid gold'; el.style.outlineOffset = '2px'; }
    } else if (b.img) {
      const img = document.createElement('img');
      img.alt = b.name;
      const fallback=()=>{ el.innerHTML=`<div style="width:28px;height:28px;border-radius:50%;background:${b.color};display:flex;align-items:center;justify-content:center;font-size:.62rem;font-weight:800;color:#fff">${b.name[0]}</div>`; };
      imgWithRetry(img, BADGE_IMG(b.img), 4);
      img.addEventListener('error', fallback, {once:true});
      el.appendChild(img);
    } else {
      el.innerHTML = `<div style="width:30px;height:30px;border-radius:50%;background:${b.color};display:flex;align-items:center;justify-content:center;font-size:.65rem;font-weight:800;color:#fff">${b.name[0]}</div>`;
    }

    if (state === 2) { el.style.borderColor = b.color; el.style.boxShadow = `0 0 8px ${b.color}88`; }

    if (!myReadonly) {
      el.onclick = () => {
        const cur = badgeStates[pi]?.[b.id] || 0;
        socket.emit('set-badge', { playerIndex: pi, badgeId: b.id, state: (cur + 1) % 3 });
      };
    } else {
      el.style.cursor = 'default';
    }
    wrap.appendChild(el);
    row.appendChild(wrap);
  });
  cbar.appendChild(row);
}

function renderDCBars(){
  for(let pi=0;pi<3;pi++){
    const ci=colAssign[pi];if(ci===undefined)continue;
    const bar=document.getElementById('dc-'+ci);if(!bar)continue;
    const count=deathCounts[pi]||0;
    const total=totalDeathCounts[pi]||0;
    bar.innerHTML=`
      <div class="dc-skull">💀</div>
      <button class="dc-btn" onclick="adjustDC(${pi},-1)">−</button>
      <input class="dc-edit" type="number" min="0" value="${count}"
        onchange="setDC(${pi},this.value)"
        onclick="this.select()"
        style="color:${count>0?'var(--rd)':'var(--txd)'}">
      <button class="dc-btn" onclick="adjustDC(${pi},+1)">+</button>
      <div title="Kumulierte Tode (wird nicht zurückgesetzt)" style="margin-left:4px;display:flex;flex-direction:column;align-items:center;justify-content:center;min-width:32px">
        <div style="font-size:.55rem;font-family:'Space Mono',monospace;color:var(--txd);line-height:1;margin-bottom:2px">TOTAL</div>
        <div style="font-size:.88rem;font-weight:800;font-family:'Space Mono',monospace;color:${total>0?'rgba(239,68,68,.55)':'var(--bd2)'};line-height:1">${total}</div>
      </div>`;
  }
}

function adjustDC(pi, delta){
  const cur=deathCounts[pi]||0;
  const next=Math.max(0, cur+delta);
  deathCounts[pi]=next;
  socket.emit('set-death-count',{playerIndex:pi,count:next});
  renderDCBars();
}

function setDC(pi, val){
  const next=Math.max(0, parseInt(val)||0);
  deathCounts[pi]=next;
  socket.emit('set-death-count',{playerIndex:pi,count:next});
  renderDCBars();
}
function renderTBar(pi,ci){
  const bar=document.getElementById('tb-'+ci);if(!bar)return;
  bar.innerHTML='';
  for(let si=0;si<6;si++){
    const pk=team[pi]?.[si];
    const ls=locStr('team',si);
    const lnk=isLinked(pi,ls),brk=isBroken(pi,ls);
    const d=document.createElement('div');
    d.className='ts'+(lnk?' linked':'')+(brk?' broken':'')+(pk?.missed?' missed':'')+(pk?.pokeId&&!pk.alive?' dead':'');
    if(lnk||brk)d.innerHTML+=`<div class="ts-ld${brk?' broken':lnk&&pk?.missed?' missed':''}"></div>`;
    if(pk?.shiny)d.innerHTML+=`<div class="ts-sh">✨</div>`;
    if(pk?.pokeId)d.innerHTML+=`<img class="tss" src="${spr(pk.pokeId,pk.shiny)}" loading="lazy">`;
    else if(pk?.missed)d.innerHTML+=`<div class="tsmt">✗</div>`;
    else d.innerHTML+=`<div class="tsmt">·</div>`;
    d.innerHTML+=`<div class="tsnm">${pk?.missed?'nicht gef.':(pk?pkName(pk):'')}</div>`;
    if(pk?.pokeId&&!pk.alive)d.innerHTML+=`<div class="ts-dd">💀</div>`;
    bar.appendChild(d);
  }
}

// ═══════════════════════════════════════════════
// SOULLINK PAGE
// ═══════════════════════════════════════════════
function renderSL(){renderTE();renderLSG();renderLL();}
function getAPIs(){const s=new Set();if(myPI>=0)s.add(myPI);peers.forEach(p=>{if(p.playerIndex>=0)s.add(p.playerIndex);});return[...s].sort();}
function getPN(pi){if(pi===myPI)return myName;for(const[,p]of peers)if(p.playerIndex===pi)return p.name;return'Spieler '+(pi+1);}

function renderTE(){
  const ed=document.getElementById('te');ed.innerHTML='<div class="sec-t">Team-Verwaltung</div>';
  // Always show all 3 player slots, not just connected ones
  [0,1,2].forEach(pi=>{
    const isConnected=pi===myPI||[...peers.values()].some(p=>p.playerIndex===pi);
    const blk=document.createElement('div');blk.className='pb';
    if(!isConnected) blk.style.opacity='.45';
    blk.innerHTML=`<div class="pb-h"><span class="pi-badge pi-${pi}">${pi+1}</span><span>${getPN(pi)}</span>${pi===myPI?'<span style="font-size:.62rem;color:var(--txd);font-family:Space Mono,monospace;margin-left:3px">(du)</span>':!isConnected?'<span style="font-size:.62rem;color:var(--txd);font-family:Space Mono,monospace;margin-left:3px">(nicht dabei)</span>':''}</div>`;
    const grid=document.createElement('div');grid.className='pb-g';
    for(let si=0;si<6;si++){
      const pk=team[pi]?.[si];
      const ls=locStr('team',si);const lnk=isLinked(pi,ls),brk=isBroken(pi,ls);
      const el=document.createElement('div');
      el.className='es'+(pk?.pokeId||pk?.missed?' ep':'')+(pk?.shiny?' esh':'')+(pk?.pokeId&&!pk.alive?' ed':'')+(lnk?' el':'')+(brk?' ebr':'')+(pk?.missed?' em':'');
      el.innerHTML=`<div class="esn">${si+1}</div>`;
      if(lnk||brk)el.innerHTML+=`<div class="esld${brk?' broken':lnk&&pk?.missed?' missed':''}"></div>`;
      if(pk?.shiny)el.innerHTML+=`<div class="essh">✨</div>`;
      if(pk?.pokeId&&!pk.alive)el.innerHTML+=`<div class="esdd">💀</div>`;
      if(pk?.pokeId)el.innerHTML+=`<img class="esr" src="${spr(pk.pokeId,pk.shiny)}" loading="lazy">`;
      else if(pk?.missed)el.innerHTML+=`<div class="ese" style="font-size:1.8rem;opacity:.4">✗</div>`;
      else el.innerHTML+=`<div class="ese">＋</div>`;
      el.innerHTML+=`<div class="esnm">${pk?.missed?'nicht gef.':(pk?pkName(pk):'leer')}</div>`;
      el.onclick=()=>openPicker('team',pi,si);
      if(pk?.pokeId&&!pk?.missed){
        const tb=document.createElement('button');
        tb.className='es-tot-btn '+(pk.alive?'alive':'dead');
        tb.textContent=pk.alive?'💀 Tot':'♻ Ok';
        tb.onclick=(e)=>{e.stopPropagation();socket.emit('set-alive',{playerIndex:pi,slotIndex:si,alive:!pk.alive});};
        el.appendChild(tb);
        // Async: add evolve button if pokemon has next evolution
        (async()=>{
          const nextEvos = await getNextEvolutions(pk.pokeId);
          if(!nextEvos.length) return;
          // If multiple evolutions (e.g. Eevee), cycle through or show first
          const evo = nextEvos[0];
          const eb = document.createElement('button');
          eb.className = 'es-evo-btn';
          const deName = _deNames?.get(evo.id);
          eb.textContent = '→ '+(deName||evo.name);
          eb.title = 'Entwickeln zu '+(deName||evo.name);
          eb.onclick = (e) => {
            e.stopPropagation();
            // Replace pokemon data, keep nickname/shiny/alive, update pokeId+name
            const newPk = {...pk, pokeId: evo.id, name: evo.name};
            socket.emit('set-pokemon', {playerIndex:pi, slotIndex:si, pokemon:newPk});
          };
          el.appendChild(eb);
        })();
      }
      grid.appendChild(el);
    }
    blk.appendChild(grid);
    ed.appendChild(blk);
  });
}

function renderLSG(){
  const g=document.getElementById('lsg');if(!g)return;g.innerHTML='';
  getAPIs().forEach(pi=>{
    const row=document.createElement('div');row.className='lb-row';
    row.innerHTML=`<div class="lb-lbl" style="color:${PC[pi][0]}">${getPN(pi)}</div>`;
    const sel=document.createElement('select');sel.className='lb-sel';sel.id='lsel-'+pi;
    sel.innerHTML='<option value="">— kein —</option>';
    for(let si=0;si<6;si++){const pk=team[pi]?.[si];sel.innerHTML+=`<option value="team:${si}:${si}">Team ${si+1}: ${pk?.missed?'✗ nicht gef.':(pk?.pokeId?(pkName(pk)||'#'+pk.pokeId):'leer')}${pk?.shiny?' ✨':''}</option>`;}
    for(let b=0;b<NB;b++)for(let s=0;s<BS;s++){const pk=box[pi]?.[b]?.[s];if(!pk?.pokeId&&!pk?.missed)continue;sel.innerHTML+=`<option value="box:${b}:${s}">Box${b+1}[${s+1}]: ${pk?.missed?'✗ nicht gef.':pkName(pk)}${pk?.shiny?' ✨':''}</option>`;}
    for(const[rid,pk]of Object.entries(routes[pi]||{})){if(!pk?.pokeId&&!pk?.missed)continue;sel.innerHTML+=`<option value="route:${rid}:">Route ${rid.replace(/-/g,' ')}: ${pk?.missed?'✗ nicht gef.':(pk.nickname||pk.name||'#'+pk.pokeId)}${pk?.shiny?' ✨':''}</option>`;}
    row.appendChild(sel);g.appendChild(row);
  });
}

// ── Link-Kategorisierung ──────────────────────────────────────────────────────
// "Im Team"  = mind. ein Slot des Links ist location:'team'
// "Boxed"    = alle Slots in Box/Route, broken:false
// "Tot"      = broken:true (Slots können überall sein)
function linkCategory(lk){
  // Priority: if ANY slot is in the team → show in "Im Team" regardless of broken state
  if(lk.slots.some(s=>s.location==='team')) return 'team';
  if(lk.broken) return 'dead';
  return 'boxed';
}

// ── Shiny-Tausch Modal ───────────────────────────────────────────────────────
// Sammelt ALLE Shiny-Pokémon aus anderen Links für die Spieler dieses Links.
// Gibt zurück: { available, blocked, outgoing }
// outgoing = this link has a shiny → other links/box as swap targets
function collectShinySwapCandidates(lk){
  const available=[], blocked=[];
  const myPis = new Set(lk.slots.map(s=>s.playerIndex));

  // Direction A: shinies IN other links → swap into this link
  links.forEach(otherLk=>{
    if(otherLk.id===lk.id) return;
    otherLk.slots.forEach(otherSlot=>{
      if(!myPis.has(otherSlot.playerIndex)) return;
      const otherPk=getPAt(otherSlot);
      if(!otherPk?.shiny||!otherPk?.pokeId||otherPk?.missed) return;

      const mySlot=lk.slots.find(s=>s.playerIndex===otherSlot.playerIndex);
      if(!mySlot) return;
      const myPk=getPAt(mySlot);

      const linkDead = lk.broken || otherLk.broken;
      const pkDead   = !otherPk.alive || (myPk && !myPk.alive);

      const entry={pi:otherSlot.playerIndex,mySlot,myPk,otherLinkId:otherLk.id,otherSlot,otherPk};
      if(linkDead||pkDead){
        entry.reason = linkDead ? (lk.broken?'dieser Link ist tot':'anderer Link ist tot') : 'Pokémon ist tot';
        blocked.push(entry);
      } else {
        available.push(entry);
      }
    });
  });

  // Direction A2: standalone box shinies → swap into this link
  myPis.forEach(pi=>{
    for(let b=0;b<NB;b++) for(let sl=0;sl<BS;sl++){
      const pk=box[pi]?.[b]?.[sl];
      if(!pk?.shiny||!pk?.pokeId||pk?.missed) continue;
      const loc='box:'+b+':'+sl;
      if(isLinked(pi,loc)||isBroken(pi,loc)) continue;
      const mySlot=lk.slots.find(s=>s.playerIndex===pi);
      if(!mySlot) continue;
      const myPk=getPAt(mySlot);
      const pkDead=!pk.alive||(myPk&&!myPk.alive);
      const entry={pi,mySlot,myPk,otherLinkId:null,otherSlot:{playerIndex:pi,location:{box:b,slot:sl}},otherPk:pk,standalone:true};
      if(lk.broken||pkDead){
        entry.reason=lk.broken?'dieser Link ist tot':'Pokémon ist tot';
        blocked.push(entry);
      } else {
        available.push(entry);
      }
    }
  });

  return {available,blocked};
}

// Direction B: collect targets for swapping a shiny OUT of this link
// shinySlot = slot in this link that has a shiny
// targets = all other link slots of that player (NOT standalone box — those appear in section A)
function collectOutgoingSwapTargets(lk){
  // Find shiny slots in this link
  const shinySlots=[];
  lk.slots.forEach(s=>{
    const pk=getPAt(s);
    if(pk?.shiny&&pk?.pokeId&&!pk?.missed) shinySlots.push({s,pk});
  });
  if(!shinySlots.length) return [];

  const results=[];
  shinySlots.forEach(({s:shinySlot,pk:shinyPk})=>{
    const pi=shinySlot.playerIndex;
    // Only other link slots — NOT standalone box pokemon (those are already in section A)
    links.forEach(otherLk=>{
      if(otherLk.id===lk.id) return;
      otherLk.slots.forEach(otherSlot=>{
        if(otherSlot.playerIndex!==pi) return;
        const otherPk=getPAt(otherSlot);
        if(!otherPk?.pokeId||otherPk?.missed) return;
        const dead=lk.broken||otherLk.broken||!shinyPk.alive||!otherPk.alive;
        results.push({pi,shinySlot,shinyPk,targetSlot:otherSlot,targetPk:otherPk,targetLinkId:otherLk.id,dead,reason:dead?(lk.broken?'dieser Link tot':otherLk.broken?'anderer Link tot':'Pokémon tot'):null});
      });
    });
  });
  return results;
}

// Collect links where this player's slot contains a swapped-in shiny (has shinySwapOriginId)
function collectRestorableCandidates(lk){
  const restorables=[];
  lk.slots.forEach(s=>{
    const pk=getPAt(s);
    if(!pk?.shinySwapOriginId) return;
    // Find the box slot holding the original
    const pi=s.playerIndex;
    for(let b=0;b<NB;b++) for(let sl=0;sl<BS;sl++){
      const bpk=box[pi]?.[b]?.[sl];
      if(bpk?.shinySwapRestoreTo){
        const d=bpk.shinySwapRestoreTo;
        if(d.playerIndex===pi&&JSON.stringify(d.location)===JSON.stringify(s.location)&&d.slotIndex===s.slotIndex){
          restorables.push({s,pk,pi,bn:b,slotNum:sl,origPk:bpk});
        }
      }
    }
  });
  return restorables;
}

let _swapLinkId=null;
function openShinySwapModal(linkId){
  _swapLinkId=linkId;
  const lk=links.find(l=>l.id===linkId);if(!lk)return;
  const {available,blocked}=collectShinySwapCandidates(lk);
  const restorables=collectRestorableCandidates(lk);
  const outgoing=collectOutgoingSwapTargets(lk);
  const outAvail=outgoing.filter(x=>!x.dead);
  const outBlocked=outgoing.filter(x=>x.dead);
  const body=document.getElementById('ssm-body');
  body.innerHTML='';

  // Track shown slot keys to avoid duplicates across sections
  const shownKeys=new Set();
  function slotKey(s){ return s.playerIndex+':'+(s.location==='team'?'team:'+s.slotIndex:JSON.stringify(s.location)); }

  const hasAnything=available.length||blocked.length||restorables.length||outAvail.length||outBlocked.length;
  if(!hasAnything){
    body.innerHTML='<div class="empty-state">Keine Shiny-Tausch-Optionen verfügbar.</div>';
  }

  // ── Section A: shinies from other links/box → swap INTO this link ──────────
  if(available.length){
    const t=document.createElement('div');t.className='lbl';t.style.marginBottom='8px';t.textContent='Shiny eintauschen (in diesen Link)';body.appendChild(t);
    available.forEach(e=>{
      const key=slotKey(e.otherSlot);
      shownKeys.add(key);
      const row=buildSwapRow(e,false);body.appendChild(row);
    });
  }
  if(blocked.length){
    const t=document.createElement('div');t.className='lbl';t.style.margin='12px 0 8px';t.textContent='Nicht verfügbar';body.appendChild(t);
    blocked.forEach(e=>{
      const key=slotKey(e.otherSlot);
      shownKeys.add(key);
      const row=buildSwapRow(e,true);body.appendChild(row);
    });
  }

  // ── Section B: shiny in this link → swap OUT to other links ──────────────
  // Only show if not already shown in section A (avoid duplicates)
  const outAvailFiltered=outAvail.filter(x=>!shownKeys.has(slotKey(x.targetSlot)));
  const outBlockedFiltered=outBlocked.filter(x=>!shownKeys.has(slotKey(x.targetSlot)));
  if(outAvailFiltered.length||outBlockedFiltered.length){
    const t=document.createElement('div');t.className='lbl';t.style.margin='14px 0 8px';t.textContent='Shiny austauschen (aus diesem Link)';body.appendChild(t);
    outAvailFiltered.forEach(function({pi,shinySlot,shinyPk,targetSlot,targetPk,targetLinkId}){
      shownKeys.add(slotKey(targetSlot));
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;border-radius:9px;border:1px solid var(--bd);margin-bottom:6px;background:var(--sf2)';
      const sn=pkName(shinyPk);const tn=pkName(targetPk);
      row.innerHTML='<span class="pi-badge pi-'+pi+'">'+(pi+1)+'</span>'
        +'<img src="'+spr(shinyPk.pokeId,true)+'" style="width:32px;height:32px;image-rendering:pixelated">'
        +'<span style="font-size:.72rem">✨ '+sn+'</span>'
        +'<span style="color:var(--txd);font-size:.8rem;padding:0 4px">↔</span>'
        +'<img src="'+spr(targetPk.pokeId,targetPk.shiny)+'" style="width:32px;height:32px;image-rendering:pixelated">'
        +'<div style="flex:1"><div style="font-size:.72rem;font-weight:700">'+tn+(targetPk.shiny?'✨':'')+'</div>'
        +'<div style="font-size:.6rem;color:var(--txd);font-family:Space Mono,monospace">Link #'+targetLinkId+'</div></div>';
      const btn=document.createElement('button');btn.className='btn btn-xs btn-w';btn.textContent='Tauschen';
      btn.onclick=function(){
        setPAt(shinySlot,Object.assign({},targetPk));
        setPAt(targetSlot,Object.assign({},shinyPk));
        toast('✨ '+sn+' ↔ '+tn);
        document.getElementById('ssm').classList.remove('open');
      };
      row.appendChild(btn);body.appendChild(row);
    });
    outBlockedFiltered.forEach(function({pi,shinyPk,targetPk,reason}){
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;border-radius:9px;border:1px solid var(--bd);margin-bottom:6px;background:var(--sf2);opacity:.5';
      const sn=pkName(shinyPk);const tn=pkName(targetPk);
      row.innerHTML='<span class="pi-badge pi-'+pi+'">'+(pi+1)+'</span>'
        +'<img src="'+spr(shinyPk.pokeId,true)+'" style="width:32px;height:32px;image-rendering:pixelated">'
        +'<span style="font-size:.72rem">✨ '+sn+'</span>'
        +'<span style="color:var(--txd);font-size:.8rem;padding:0 4px">↔</span>'
        +'<img src="'+spr(targetPk.pokeId,targetPk.shiny)+'" style="width:32px;height:32px;image-rendering:pixelated">'
        +'<span style="font-size:.72rem">'+tn+'</span>';
      const badge=document.createElement('span');badge.className='lbadge broken';badge.style.fontSize='.58rem';badge.textContent=reason||'gesperrt';row.appendChild(badge);
      body.appendChild(row);
    });
  }

  // ── Section C: restore previous swaps ─────────────────────────────────────
  // Also scan box for shinySwapRestoreTo pointing to slots in THIS link
  const extraRestorables=[];
  lk.slots.forEach(s=>{
    const pi=s.playerIndex;
    for(let b=0;b<NB;b++) for(let sl=0;sl<BS;sl++){
      const bpk=box[pi]?.[b]?.[sl];
      if(!bpk?.shinySwapRestoreTo) continue;
      const d=bpk.shinySwapRestoreTo;
      if(d.playerIndex!==pi) continue;
      if(JSON.stringify(d.location)!==JSON.stringify(s.location)&&!(d.location==='team'&&s.location==='team'&&d.slotIndex===s.slotIndex)) continue;
      // Check not already in restorables
      if(restorables.some(r=>r.pi===pi&&r.bn===b&&r.slotNum===sl)) continue;
      // The current occupant of the link slot
      const curPk=getPAt(s);
      extraRestorables.push({s,pk:curPk,pi,bn:b,slotNum:sl,origPk:bpk});
    }
  });

  const allRestorables=[...restorables,...extraRestorables];
  if(allRestorables.length){
    const rt=document.createElement('div');rt.className='lbl';rt.style.margin='14px 0 8px';rt.textContent='Tausch rückgängig machen';body.appendChild(rt);
    allRestorables.forEach(function({s,pk,pi,bn,slotNum,origPk}){
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;border-radius:9px;border:1px solid rgba(250,204,21,.3);margin-bottom:6px;background:rgba(250,204,21,.05)';
      const pn=pk?pkName(pk):'?';const on=pkName(origPk);
      row.innerHTML='<span class="pi-badge pi-'+pi+'">'+(pi+1)+'</span>'
        +(pk?.pokeId?'<img src="'+spr(pk.pokeId,pk.shiny)+'" style="width:32px;height:32px;image-rendering:pixelated">':'')
        +'<div style="flex:1"><div style="font-size:.72rem;font-weight:700">'+(pk?.shiny?'✨ ':'')+pn+'</div>'
        +'<div style="font-size:.6rem;color:var(--txd);font-family:Space Mono,monospace">zurück gegen: '+on+'</div></div>';
      const btn=document.createElement('button');btn.className='btn btn-xs btn-s';btn.textContent='↩ Zurück';
      btn.onclick=function(){
        const origClean=Object.assign({},origPk);delete origClean.shinySwapRestoreTo;
        setPAt(s,origClean);
        if(pk?.pokeId){
          const curClean=Object.assign({},pk);
          delete curClean.shinySwapOriginId;delete curClean.shinySwapOriginName;
          delete curClean.shinySwapBoxPi;delete curClean.shinySwapBoxBn;delete curClean.shinySwapBoxSlot;
          socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum:slotNum,pokemon:curClean});
        }
        toast('↩ Tausch rückgängig');
        document.getElementById('ssm').classList.remove('open');
      };
      row.appendChild(btn);body.appendChild(row);
    });
  }

  document.getElementById('ssm').classList.add('open');
}

function buildSwapRow(e,isBlocked){
  const row=document.createElement('div');
  row.style.cssText=`display:flex;align-items:center;gap:8px;padding:8px;border-radius:9px;border:1px solid var(--bd);margin-bottom:6px;background:var(--sf2);${isBlocked?'opacity:.5':''}`;
  // My pokemon
  const myName=e.myPk?.nickname||e.myPk?.name||'?';
  const otherName=e.otherPk?pkName(e.otherPk)||'?':'?';
  const standaloneLbl=e.standalone?'<span style="font-size:.56rem;background:rgba(250,204,21,.15);color:var(--yw);border:1px solid rgba(250,204,21,.35);border-radius:4px;padding:1px 5px;margin-left:4px">Box ✨</span>':'';
  row.innerHTML=`
    <span class="pi-badge pi-${e.pi}">${e.pi+1}</span>
    <div style="display:flex;align-items:center;gap:4px;flex:1">
      ${e.myPk?.pokeId?`<img src="${spr(e.myPk.pokeId,e.myPk.shiny)}" style="width:32px;height:32px;image-rendering:pixelated">`:'<div style="width:32px;height:32px">?</div>'}
      <span style="font-size:.72rem">${myName}</span>
      <span style="color:var(--txd);font-size:.8rem;padding:0 4px">↔</span>
      <img src="${spr(e.otherPk.pokeId,true)}" style="width:32px;height:32px;image-rendering:pixelated">
      <span style="font-size:.72rem">✨ ${otherName}</span>${standaloneLbl}
    </div>`;
  if(isBlocked){
    const badge=document.createElement('span');badge.className='lbadge broken';badge.style.fontSize='.58rem';badge.textContent=e.reason;row.appendChild(badge);
  } else {
    const btn=document.createElement('button');btn.className='btn btn-xs btn-w';btn.textContent='Tauschen';
    btn.onclick=()=>{
      if(e.standalone){
        // Standalone box shiny: mark swap metadata for restore
        const boxLoc=e.otherSlot.location;
        const newLinkPk=Object.assign({},e.otherPk,{shinySwapOriginId:e.myPk?.pokeId,shinySwapOriginName:e.myPk?.name,shinySwapBoxPi:e.pi,shinySwapBoxBn:boxLoc.box,shinySwapBoxSlot:boxLoc.slot});
        const newBoxPk=Object.assign({},e.myPk||{},{shinySwapRestoreTo:{location:e.mySlot.location,slotIndex:e.mySlot.slotIndex,playerIndex:e.mySlot.playerIndex}});
        setPAt(e.mySlot,newLinkPk);
        socket.emit('set-box-pokemon',{playerIndex:e.pi,boxNum:boxLoc.box,slotNum:boxLoc.slot,pokemon:newBoxPk});
      } else {
        setPAt(e.mySlot,{...e.otherPk});
        setPAt(e.otherSlot,{...e.myPk});
      }
      toast('✨ '+myName+' ↔ '+otherName);
      document.getElementById('ssm').classList.remove('open');
    };
    row.appendChild(btn);
  }
  return row;
}

function setPAt(s,pk){
  if(s.location==='team') socket.emit('set-pokemon',{playerIndex:s.playerIndex,slotIndex:s.slotIndex,pokemon:pk});
  else if(typeof s.location==='object'&&'box'in s.location) socket.emit('set-box-pokemon',{playerIndex:s.playerIndex,boxNum:s.location.box,slotNum:s.location.slot,pokemon:pk});
  else if(typeof s.location==='object'&&'route'in s.location) socket.emit('set-route-pokemon',{playerIndex:s.playerIndex,routeId:s.location.route,pokemon:pk});
}

// ── Link-Karte bauen ─────────────────────────────────────────────────────────
function buildLinkItem(lk){
  const isRoute=!!lk.routeId;
  const hasShiny=lk.slots.some(s=>getPAt(s)?.shiny);
  const cat=linkCategory(lk);
  const item=document.createElement('div');
  item.className='li'+(lk.broken?' broken':'')+(isRoute?' route-link':'');

  // ── Sprites ──
  const spr_wrap=document.createElement('div');spr_wrap.className='lspr';
  lk.slots.forEach((s,i)=>{
    if(i>0){const ch=document.createElement('span');ch.className='lch';ch.textContent='⟷';spr_wrap.appendChild(ch);}
    const pk=getPAt(s);
    const ent=document.createElement('div');ent.className='lse'+(pk&&!pk.alive?' dead':'');
    // Show location hint (T=Team, B=Box, R=Route)
    const locHint = s.location==='team'?'T':typeof s.location==='object'&&'box'in s.location?'B':'R';
    if(pk?.missed){
      ent.innerHTML=`<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;font-size:1.1rem;opacity:.5">✗</div><span style="color:${PC[s.playerIndex][0]}">${getPN(s.playerIndex)}</span><span>nicht gef.</span>`;
    } else if(pk?.pokeId){
      const isOwn = s.playerIndex===myPI;
      const typeBadgesHtml = ''; // filled async below
      ent.innerHTML=`<img src="${spr(pk.pokeId,pk.shiny)}" style="width:${isOwn?'56':'44'}px;height:${isOwn?'56':'44'}px;image-rendering:pixelated${isOwn?';outline:2px solid '+PC[s.playerIndex][0]+';outline-offset:2px;border-radius:4px':''}">`
        +`<span style="color:${PC[s.playerIndex][0]};font-size:${isOwn?'.78':'.68'}rem;font-weight:${isOwn?'800':'600'}">${getPN(s.playerIndex)} <span style="color:var(--txd);font-size:.5rem">[${locHint}]</span></span>`
        +`<span style="font-size:${isOwn?'.75':'.65'}rem;font-weight:${isOwn?'700':'400'}">${pkName(pk)||pk.name||''}</span>`
        +`<span class="lse-types-${lk.id}-${s.playerIndex}" style="display:flex;flex-wrap:wrap;gap:2px;margin-top:2px"></span>`;
      (async()=>{try{const dt=await fetchPokeTypes(pk.pokeId);const th=dt.filter(t=>getActiveTypes().includes(t)).map(t=>typeBadge(t,true)).join('');const sp2=ent.querySelector('[class*="lse-types-"]');if(sp2)sp2.innerHTML=th;}catch(e){}})();
      // Async: fetch types and append badges
      (async()=>{
        try{
          const dt=await fetchPokeTypes(pk.pokeId);
          const activeT=getActiveTypes?getActiveTypes():[...dt];
          const badges=dt.filter(t=>activeT.includes(t)).map(t=>typeBadge(t,true)).join('');
          const ntEl=ent.querySelector('.lse-name-types');
          if(ntEl) ntEl.innerHTML=(pkName(pk)||pk.name||'')+' '+badges;
        }catch(_){}
      })();
    } else {
      ent.innerHTML=`<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;opacity:.2">?</div><span style="color:${PC[s.playerIndex][0]}">${getPN(s.playerIndex)}</span>`;
    }
    spr_wrap.appendChild(ent);
  });
  item.appendChild(spr_wrap);

  // ── Badges ──
  if(lk.broken){const b=document.createElement('span');b.className='lbadge broken';b.textContent='💀 Gebrochen';item.appendChild(b);}
  if(isRoute){const b=document.createElement('span');b.className='lbadge route';b.textContent='🗺 Route';item.appendChild(b);}
  if(hasShiny){const b=document.createElement('span');b.className='lbadge shiny';b.textContent='✨';item.appendChild(b);}

  // ── Action-Buttons: nur noch 2 ──
  const actRow=document.createElement('div');
  actRow.style.cssText='display:flex;align-items:center;gap:5px;margin-top:6px;width:100%;flex-wrap:wrap';

  // Button 1: → Team (immer verfügbar, öffnet Slot-Auswahl)
  const toTeamBtn=document.createElement('button');
  toTeamBtn.className='btn btn-s btn-xs';
  toTeamBtn.textContent='🎮 → Team';
  toTeamBtn.onclick=()=>openLinkToTeam(lk.id);
  actRow.appendChild(toTeamBtn);

  // Button 2: → Box (nur wenn Link im Team ist + freie Box-Slots existieren)
  const inTeam = lk.slots.some(s=>s.location==='team');
  const toBoxBtn=document.createElement('button');
  toBoxBtn.className='btn btn-g btn-xs';
  toBoxBtn.textContent='📦 → Box';
  if(inTeam){
    // Check if all players have at least one free box slot
    const canBox = lk.slots.every(s=>{
      for(let b=0;b<NB;b++) for(let sl=0;sl<BS;sl++) if(!box[s.playerIndex]?.[b]?.[sl]?.pokeId) return true;
      return false;
    });
    if(canBox){ toBoxBtn.onclick=()=>moveLinkToBox(lk.id); }
    else { toBoxBtn.disabled=true; toBoxBtn.title='Keine freien Box-Slots'; }
  } else {
    toBoxBtn.disabled=true; toBoxBtn.title='Link ist nicht im Team';
  }
  actRow.appendChild(toBoxBtn);

  if(!isRoute){const del=document.createElement('button');del.className='btn btn-d btn-xs';del.textContent='✕';del.onclick=()=>socket.emit('remove-link',{linkId:lk.id});actRow.appendChild(del);}
  item.appendChild(actRow);

  // ── Shiny-Tausch Button (immer anzeigen wenn andere Links Shinies haben) ──
  const {available:swapAvail,blocked:swapBlocked}=collectShinySwapCandidates(lk);
  const restAvail=collectRestorableCandidates(lk);
  const outgoing=collectOutgoingSwapTargets(lk);
  const outAvail=outgoing.filter(x=>!x.dead);
  const outBlocked=outgoing.filter(x=>x.dead);
  if(swapAvail.length||swapBlocked.length||restAvail.length||outAvail.length||outBlocked.length){
    const swBtn=document.createElement('button');
    swBtn.className='btn btn-w btn-xs';
    swBtn.innerHTML='✨ Shiny-Tausch';
    swBtn.style.marginTop='5px';
    swBtn.onclick=()=>openShinySwapModal(lk.id);
    item.appendChild(swBtn);
  }

  return item;
}

function renderLL(){
  const list=document.getElementById('ll-list');if(!list)return;
  list.innerHTML='';

  const teamLinks  = links.filter(lk=>linkCategory(lk)==='team');
  const boxedLinks = links.filter(lk=>linkCategory(lk)==='boxed');

  function section(title, icon, arr, emptyMsg){
    const wrap=document.createElement('div');wrap.style.marginBottom='4px';
    const t=document.createElement('div');t.className='ll-section-title';
    t.innerHTML=`${icon} ${title} <span class="ll-count">${arr.length}</span>`;
    wrap.appendChild(t);
    if(!arr.length){const e=document.createElement('div');e.className='empty-state';e.style.paddingTop='10px';e.textContent=emptyMsg;wrap.appendChild(e);}
    else arr.forEach(lk=>wrap.appendChild(buildLinkItem(lk)));
    return wrap;
  }

  list.appendChild(section('Im Team','👥',teamLinks,'Keine Links im Team.'));
  list.appendChild(section('In der Box','📦',boxedLinks,'Keine Links in der Box.'));
}

function getPAt(s){
  if(s.location==='team')return team[s.playerIndex]?.[s.slotIndex];
  if(typeof s.location==='object'){if('box'in s.location)return box[s.playerIndex]?.[s.location.box]?.[s.location.slot];if('route'in s.location)return routes[s.playerIndex]?.[s.location.route];}
  return null;
}

function createLink(){
  const pis=getAPIs();const slots=[];
  pis.forEach(pi=>{
    const sel=document.getElementById('lsel-'+pi);if(!sel||!sel.value)return;
    const[type,a,b]=sel.value.split(':');
    if(type==='team')slots.push({playerIndex:pi,location:'team',slotIndex:parseInt(a)});
    else if(type==='box')slots.push({playerIndex:pi,location:{box:parseInt(a),slot:parseInt(b)}});
    else if(type==='route')slots.push({playerIndex:pi,location:{route:a}});
  });
  if(slots.length<2){toast('Mindestens 2 auswählen.',1);return;}
  socket.emit('add-link',{slots});
  pis.forEach(pi=>{const s=document.getElementById('lsel-'+pi);if(s)s.value='';});
}

// ═══════════════════════════════════════════════
// BOX PAGE
// ═══════════════════════════════════════════════
let bv={pi:0,bn:0};
function initBV(){if(bv.pi<0||bv.pi>2)bv={pi:myPI>=0?myPI:0,bn:0};}
function renderGraveyard(){
  const sec=document.getElementById('graveyard-section');if(!sec)return;
  const deadLinks=links.filter(lk=>lk.broken);

  // Determine "culprit" per link: slots where pokemon is dead
  // A culprit is the slot whose pokemon triggered the death (alive=false)
  sec.innerHTML='';

  const titleEl=document.createElement('div');titleEl.className='graveyard-title';
  titleEl.innerHTML=`💀 Friedhof <span class="gy-count">${deadLinks.length}</span> <span style="margin-left:auto;font-size:.7rem">${sec._open?'▴':'▾'}</span>`;
  titleEl.onclick=()=>{sec._open=!sec._open;renderGraveyard();};
  sec.appendChild(titleEl);

  if(!deadLinks.length){
    if(sec._open!==false) sec._open=false; // collapsed by default if empty
    return;
  }
  if(sec._open===undefined)sec._open=true; // open by default when links exist

  const body=document.createElement('div');
  body.className='graveyard-body'+(sec._open?'':' collapsed');

  deadLinks.forEach(lk=>{
    const row=document.createElement('div');row.className='dead-link-row';
    const spritesDiv=document.createElement('div');spritesDiv.className='dead-link-sprites';

    const culprits=[]; // player names whose pokemon died
    // Determine culprit from server-stored lk.culprit
    const culpritPI = lk.culprit?.playerIndex;
    const culpritPokeId = lk.culprit?.pokeId;

    lk.slots.forEach((s,i)=>{
      if(i>0){const ch=document.createElement('span');ch.className='dead-link-chain';ch.textContent='⟷';spritesDiv.appendChild(ch);}
      const pk=getPAt(s);
      // This slot is the culprit if it matches the stored culprit playerIndex + pokeId
      const isCulprit = lk.culprit &&
        s.playerIndex === culpritPI &&
        (culpritPokeId ? pk?.pokeId === culpritPokeId : true);
      const wrap=document.createElement('div');wrap.className='dead-link-sprite';
      if(pk?.pokeId){
        const img=document.createElement('img');
        img.src=spr(pk.pokeId,pk.shiny);
        img.loading='lazy';
        if(isCulprit) img.className='culprit';
        wrap.appendChild(img);
        const nameEl=document.createElement('div');nameEl.className='dls-name';nameEl.textContent=pkName(pk);wrap.appendChild(nameEl);
        const plEl=document.createElement('div');plEl.className='dls-player';plEl.style.color=PC[s.playerIndex][0];plEl.textContent=getPN(s.playerIndex);wrap.appendChild(plEl);
        if(isCulprit) culprits.push(`${getPN(s.playerIndex)}: ${pkName(pk)}`);
      } else {
        wrap.innerHTML=`<div style="width:40px;height:40px;display:flex;align-items:center;justify-content:center;font-size:1.2rem;opacity:.3">💀</div>
          <div class="dls-player" style="color:${PC[s.playerIndex][0]}">${getPN(s.playerIndex)}</div>`;
      }
      spritesDiv.appendChild(wrap);
    });
    row.appendChild(spritesDiv);

    if(culprits.length){
      const cause=document.createElement('div');cause.className='dead-link-cause';
      cause.innerHTML=`💔 Auslöser: ${culprits.join(' · ')}`;
      row.appendChild(cause);
    }
    body.appendChild(row);
  });
  sec.appendChild(body);
}

function renderBoxSB(){
  initBV();
  renderGraveyard();
  const sb=document.getElementById('box-sb');if(!sb)return;sb.innerHTML='<div class="box-sb-t">Boxen</div>';
  // Always show all 3 players, not just connected ones
  [0,1,2].forEach(pi=>{
    const isConnected=pi===myPI||[...peers.values()].some(p=>p.playerIndex===pi);
    const sec=document.createElement('div');sec.className='box-ps';
    if(!isConnected) sec.style.opacity='.45';
    sec.innerHTML=`<div class="box-pl"><span class="pi-badge pi-${pi}">${pi+1}</span>${getPN(pi)}${!isConnected?'<span style="font-size:.6rem;color:var(--txd);margin-left:4px">(nicht dabei)</span>':''}</div>`;
    for(let b=0;b<NB;b++){
      const cnt=(box[pi]||[])[b]?.filter(s=>s?.pokeId||s?.missed).length||0;
      const t=document.createElement('div');t.className='boxt'+(bv.pi===pi&&bv.bn===b?' active':'');
      t.innerHTML=`Box ${b+1} <span>${cnt}/30</span>`;t.onclick=()=>{bv={pi,bn:b};renderBoxSB();renderBoxMain();};
      sec.appendChild(t);
    }
    sb.appendChild(sec);
  });
}
function renderBoxMain(){
  const main=document.getElementById('box-main');if(!main)return;
  const{pi,bn}=bv;
  const cnt=box[pi][bn].filter(s=>s?.pokeId||s?.missed).length;
  main.innerHTML=`<div class="box-hdr">
    <div><div class="box-ttl">Box ${bn+1} · <span style="color:${PC[pi][0]}">${getPN(pi)}</span></div><div class="box-sub">${cnt}/30 Pokémon</div></div>
    <div class="box-actions"><button class="btn btn-g btn-sm" onclick="openPicker('box',${pi},-1,${bn})">+ Hinzufügen</button></div>
  </div><div class="bgrid" id="bgrid"></div>`;
  const grid=document.getElementById('bgrid');
  for(let s=0;s<BS;s++){
    const pk=box[pi][bn][s];
    const ls=`box:${bn}:${s}`;const lnk=isLinked(pi,ls),brk=isBroken(pi,ls);
    const d=document.createElement('div');
    const isStandaloneShiny=pk?.shiny&&pk?.pokeId&&!lnk&&!brk&&!pk?.missed;
    const isSwappedIn=!!pk?.shinySwapOriginId;
    d.className='bs'+(pk?.pokeId||pk?.missed?' bp':'')+(pk?.shiny&&!isStandaloneShiny?' bsh':'')+(pk?.pokeId&&!pk.alive?' bd':'')+(lnk?' bl':'')+(brk?' bbr':'')+(pk?.missedInitiator?' bm-initiator':pk?.missed?' bm':'')+(isStandaloneShiny?' bsh-standalone':'')+(isSwappedIn?' bsh-swapped':'');
    d.innerHTML=`<div class="bsn">${s+1}</div>`;
    if(lnk||brk)d.innerHTML+=`<div class="bsld${brk?' broken':lnk&&pk?.missed?' missed':''}"></div>`;
    if(pk?.shiny)d.innerHTML+=`<div class="bssh">✨</div>`;
    if(pk?.pokeId&&!pk.alive)d.innerHTML+=`<div class="bsdd">💀</div>`;
    if(pk?.pokeId)d.innerHTML+=`<img class="bspr" src="${spr(pk.pokeId,pk?.missed?false:pk.shiny)}" loading="lazy" style="${pk?.missed?'opacity:.5;filter:grayscale(.5)':''}">`;
    else if(pk?.missed)d.innerHTML+=`<div class="bsmt" style="font-size:1.4rem;opacity:.5">✗</div>`;
    else d.innerHTML+=`<div class="bsmt">·</div>`;
    const missedBadge=pk?.missedInitiator?'<span style="font-size:.5rem;background:rgba(250,204,21,.25);color:var(--yw);border:1px solid rgba(250,204,21,.6);border-radius:3px;padding:0 3px;display:block;text-align:center;margin-top:1px">⚡</span>':'';
    d.innerHTML+=`<div class="bsnm">${pk?.missed?'nicht gef.':(pk?pkName(pk):'')}${missedBadge}</div>`;
    if(pk?.pokeId||pk?.missed)d.onclick=()=>openBoxMenu(pi,bn,s);
    else d.onclick=()=>openPicker('box',pi,s,bn);
    grid.appendChild(d);
  }
}
function isStandaloneShiny(pi,bn,slotNum){
  const pk=box[pi]?.[bn]?.[slotNum];
  if(!pk?.shiny||!pk?.pokeId||pk?.missed) return false;
  const loc='box:'+bn+':'+slotNum;
  return !isLinked(pi,loc)&&!isBroken(pi,loc);
}

function openStandaloneShinySwap(pi,bn,slotNum){
  const shinyPk=box[pi][bn][slotNum];
  if(!shinyPk) return;
  const body=document.getElementById('sbsm-body');
  body.innerHTML='';
  const candidates=[];
  links.forEach(lk=>{
    if(lk.broken) return;
    lk.slots.forEach(s=>{
      if(s.playerIndex!==pi) return;
      const pk=getPAt(s);
      if(!pk?.pokeId||pk?.missed) return;
      candidates.push({lk,s,pk});
    });
  });
  const shinyName=pkName(shinyPk);
  const hdr=document.createElement('div');
  hdr.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:14px;padding-bottom:10px;border-bottom:1px solid var(--bd)';
  hdr.innerHTML='<img src="'+spr(shinyPk.pokeId,true)+'" style="width:36px;height:36px;image-rendering:pixelated"><span style="font-size:.78rem;font-weight:700">✨ '+shinyName+'</span><span style="color:var(--txd);font-size:.68rem;font-family:Space Mono,monospace">Box '+(bn+1)+'['+(slotNum+1)+']</span>';
  body.appendChild(hdr);
  if(!candidates.length){
    const emp=document.createElement('div');emp.className='empty-state';emp.textContent='Keine verlinkten Pokémon verfügbar.';body.appendChild(emp);
  } else {
    const lbl=document.createElement('div');lbl.style.cssText='font-size:.62rem;color:var(--txd);font-family:Space Mono,monospace;margin-bottom:8px';lbl.textContent='Mit welchem Pokémon tauschen?';body.appendChild(lbl);
    candidates.forEach(function({lk,s,pk}){
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;gap:8px;padding:8px;border-radius:9px;border:1px solid var(--bd);margin-bottom:6px;background:var(--sf2)';
      const pn=pkName(pk);
      const locLabel=s.location==='team'?'Team '+(s.slotIndex+1):typeof s.location==='object'&&'box'in s.location?'Box '+(s.location.box+1)+'['+(s.location.slot+1)+']':'Route';
      row.innerHTML='<span class="pi-badge pi-'+s.playerIndex+'">'+(s.playerIndex+1)+'</span>'
        +'<img src="'+spr(pk.pokeId,pk.shiny)+'" style="width:32px;height:32px;image-rendering:pixelated">'
        +'<div style="flex:1"><div style="font-size:.72rem;font-weight:700">'+pn+(pk.shiny?'✨':'')+'</div>'
        +'<div style="font-size:.6rem;color:var(--txd);font-family:Space Mono,monospace">'+locLabel+' · '+(lk.routeId||'Link #'+lk.id)+'</div></div>'
        +'<span style="color:var(--txd);font-size:.8rem">↔</span>'
        +'<img src="'+spr(shinyPk.pokeId,true)+'" style="width:32px;height:32px;image-rendering:pixelated">';
      const btn=document.createElement('button');btn.className='btn btn-xs btn-w';btn.textContent='Tauschen';
      btn.onclick=function(){
        const newLinkPk=Object.assign({},shinyPk,{shinySwapOriginId:pk.pokeId,shinySwapOriginName:pk.name,shinySwapBoxPi:pi,shinySwapBoxBn:bn,shinySwapBoxSlot:slotNum});
        const newBoxPk=Object.assign({},pk,{shinySwapRestoreTo:{location:s.location,slotIndex:s.slotIndex,playerIndex:s.playerIndex}});
        setPAt(s,newLinkPk);
        socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum:slotNum,pokemon:newBoxPk});
        toast('✨ '+pn+' ↔ '+shinyName+' getauscht');
        document.getElementById('sbsm').classList.remove('open');
      };
      row.appendChild(btn);body.appendChild(row);
    });
  }
  document.getElementById('sbsm').classList.add('open');
}

function restoreShinySwap(pi,bn,slotNum){
  const boxPk=box[pi][bn][slotNum];
  if(!boxPk?.shinySwapRestoreTo) return;
  const dest=boxPk.shinySwapRestoreTo;
  let shinyPk=null;
  if(dest.location==='team') shinyPk=team[dest.playerIndex]?.[dest.slotIndex];
  else if(typeof dest.location==='object'&&'box'in dest.location) shinyPk=box[dest.playerIndex]?.[dest.location.box]?.[dest.location.slot];
  const origPk=Object.assign({},boxPk);
  delete origPk.shinySwapRestoreTo;
  setPAt({playerIndex:dest.playerIndex,location:dest.location,slotIndex:dest.slotIndex},origPk);
  if(shinyPk){
    const cleanShiny=Object.assign({},shinyPk);
    delete cleanShiny.shinySwapOriginId; delete cleanShiny.shinySwapOriginName;
    delete cleanShiny.shinySwapBoxPi; delete cleanShiny.shinySwapBoxBn; delete cleanShiny.shinySwapBoxSlot;
    socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum:slotNum,pokemon:cleanShiny});
  }
  toast('↩ Tausch rükgängig gemacht');
}

function openBoxMenu(pi,bn,slotNum){
  const pk=box[pi][bn][slotNum];if(!pk)return;
  const nm=pk.missed?'nicht gefangen':(pkName(pk)||'?');
  const standalone=isStandaloneShiny(pi,bn,slotNum);
  const canRestore=!!pk.shinySwapRestoreTo;
  const opts=['[1] Bearbeiten','[2] Status: '+(pk.alive?'→ Tot':'→ Lebendig'),'[3] → Team verschieben','[4] Slot leeren'];
  if(standalone) opts.push('[5] ✨ Shiny-Tausch mit Link');
  if(canRestore) opts.push('[6] ↩ Tausch rükgängig');
  const a=prompt('"'+nm+'" — Aktion:\n'+opts.join('\n')+'\n\nNummer eingeben:');
  if(a==='1')openPicker('box',pi,slotNum,bn);
  else if(a==='2')socket.emit('set-box-alive',{playerIndex:pi,boxNum:bn,slotNum,alive:!pk.alive});
  else if(a==='3')openMv('toTeam',pi,-1,bn,slotNum);
  else if(a==='4')socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum,pokemon:null});
  else if(a==='5'&&standalone)openStandaloneShinySwap(pi,bn,slotNum);
  else if(a==='6'&&canRestore)restoreShinySwap(pi,bn,slotNum);
}

// ═══════════════════════════════════════════════
// ROUTES PAGE
// ═══════════════════════════════════════════════
let routeData=[];// [{id,name,nameDe?}]
let _routeDeNames=new Map(); // locationId → german name
const openRoutes=new Set();

async function loadEditions(){
  const sel=document.getElementById('edition-sel');
  try{
    const r=await fetch('https://pokeapi.co/api/v2/version-group?limit=100');
    const d=await r.json();
    d.results.forEach(vg=>{
      const o=document.createElement('option');o.value=vg.name;o.textContent=vg.name.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());sel.appendChild(o);
    });
    if(selectedEdition)sel.value=selectedEdition;
  }catch(e){dlog('editions err:'+e,'e');}
}

let _pendingEdition = null;

// Called from dropdown — informs server (which broadcasts to all peers)
async function changeEdition(val){
  if(!val||myReadonly)return;
  // If an edition is already selected and it's different, show confirmation modal
  if(selectedEdition && val !== selectedEdition){
    _pendingEdition = val;
    const fromLabel = selectedEdition.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    const toLabel   = val.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
    document.getElementById('edition-change-from').textContent = fromLabel;
    document.getElementById('edition-change-to').textContent   = toLabel;
    document.getElementById('edition-change-modal').classList.add('open');
    // Revert dropdown visually until user confirms
    document.getElementById('edition-sel').value = selectedEdition;
    return;
  }
  await _applyEditionChange(val, false);
}

function cancelEditionChange(){
  document.getElementById('edition-change-modal').classList.remove('open');
  _pendingEdition = null;
}

async function confirmEditionChange(){
  document.getElementById('edition-change-modal').classList.remove('open');
  const val = _pendingEdition;
  _pendingEdition = null;
  if(!val) return;
  await _applyEditionChange(val);
}

async function _applyEditionChange(val){
  socket.emit('clear-edition-data', {edition: val});
  document.getElementById('edition-sel').value = val;
  await loadEditionRoutes(val);
}

// Only loads route list locally — does NOT reset server state or emit set-edition.
// Used when receiving a sync from another player.
async function loadEditionRoutes(val){
  if(!val)return;
  const loading=document.getElementById('rt-loading');loading.style.display='inline';
  routeData=[];_routeDeNames=new Map();
  document.getElementById('rt-list').innerHTML='<div class="empty-state">Lade Routen…</div>';
  try{
    const r=await fetch(`https://pokeapi.co/api/v2/version-group/${val}`);
    const d=await r.json();
    const regionUrls=d.regions?.map(r=>r.url)||[];
    let locations=[];
    for(const url of regionUrls){
      const rd=await fetch(url).then(r=>r.json());
      // Prefer location_areas order (reflects game progression)
      const locs=rd.locations?.map(l=>({id:l.name,name:l.name.replace(/-/g,' ')}));
      if(locs)locations=locations.concat(locs);
    }
    if(!locations.length&&d.versions?.length){
      const laR=await fetch(`https://pokeapi.co/api/v2/location-area?limit=300`).then(r=>r.json());
      locations=laR.results.map(l=>({id:l.name,name:l.name.replace(/-/g,' ')}));
    }
    routeData=locations.slice(0,200);
    loading.style.display='none';
    renderRoutes();
    renderBadgeBars(); // refresh badge bars now that edition is set
    // Load German names in background
    loadRouteDeNames(routeData);
  }catch(e){
    loading.style.display='none';
    dlog('route load err:'+e,'e');
    document.getElementById('rt-list').innerHTML='<div class="empty-state">Fehler beim Laden.</div>';
  }
}

async function loadRouteDeNames(locs){
  const batchSize=20;
  for(let i=0;i<locs.length;i+=batchSize){
    const batch=locs.slice(i,i+batchSize);
    await Promise.all(batch.map(async loc=>{
      try{
        const d=await fetch(`https://pokeapi.co/api/v2/location/${loc.id}`).then(r=>r.json());
        const deName=d.names?.find(n=>n.language.name==='de');
        if(deName)_routeDeNames.set(loc.id,deName.name);
      }catch(e){}
    }));
    // Re-render periodically as German names arrive
    if(document.getElementById('rt-lang')?.value==='de') renderRoutes();
  }
}

function getRouteName(loc){
  const lang=document.getElementById('rt-lang')?.value||'en';
  if(lang==='de'){const de=_routeDeNames.get(loc.id);if(de)return de;}
  return loc.name;
}

// ── "Offen"-Logik ─────────────────────────────────────────
// Returns per-player status of a pokemon species (by pokeId or name):
// 'open' = never encountered, 'caught' = caught alive, 'dead' = caught but died,
// 'missed' = encountered but not caught (gesperrt for this player)
// ── Status-Logik ──────────────────────────────────────────────────────────────
// Regeln:
//
// 1. Hat IRGENDEIN Spieler diesen Typ GEFANGEN (alive oder dead):
//    → für ALLE Spieler gesperrt (Link besteht/bestand, Typ ist vergeben).
//    Ausnahme: der Spieler selbst zeigt seinen eigenen Status (caught/dead).
//
// 2. Hat Spieler X diesen Typ ENCOUNTERED aber NICHT GEFANGEN (missed):
//    → nur für X gesperrt. Y, Z etc. können ihn noch fangen (sofern Regel 1 nicht greift).
//
// 3. Hat niemand diesen Typ gefangen UND X hat ihn nicht encountered:
//    → offen für X.
//
// Status-Werte zurückgegeben pro Spieler:
//   'open'        = noch verfügbar für diesen Spieler
//   'caught'      = dieser Spieler hat ihn gefangen, lebt
//   'dead'        = dieser Spieler hat ihn gefangen, gestorben
//   'missed'      = dieser Spieler hat encountered, nicht gefangen
//   'locked'      = ein anderer Spieler hat gefangen → für diesen gesperrt
// ── Evo-Chain Cache ───────────────────────────────────────────────────────────
// pokeId (number) → Set<number> of all pokeIds in the same evolution chain.
// Populated lazily when a search is performed.
const evoChainCache = new Map(); // pokeId → Set<number>
const evoFetchQueue = new Map(); // pokeId → Promise (avoid duplicate fetches)

async function getEvoChain(pokeId) {
  if (evoChainCache.has(pokeId)) return evoChainCache.get(pokeId);
  if (evoFetchQueue.has(pokeId)) return evoFetchQueue.get(pokeId);

  const p = (async () => {
    try {
      // 1. get species to find evo chain url
      const sp = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokeId}`).then(r=>r.json());
      const chainUrl = sp.evolution_chain?.url;
      if (!chainUrl) { const s=new Set([pokeId]); evoChainCache.set(pokeId,s); return s; }

      // 2. fetch chain
      const ch = await fetch(chainUrl).then(r=>r.json());

      // 3. collect all species names from chain
      const names = [];
      function walk(node) {
        if (!node) return;
        names.push(node.species.name);
        (node.evolves_to||[]).forEach(walk);
      }
      walk(ch.chain);

      // 4. resolve names → pokeIds  (use species endpoint which has id)
      const ids = new Set();
      await Promise.all(names.map(async n => {
        try {
          const s = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${n}`).then(r=>r.json());
          ids.add(s.id);
        } catch(e) {}
      }));
      if (!ids.size) ids.add(pokeId);

      // Store for all members of the chain
      ids.forEach(id => evoChainCache.set(id, ids));
      return ids;
    } catch(e) {
      const s = new Set([pokeId]);
      evoChainCache.set(pokeId, s);
      return s;
    }
  })();

  evoFetchQueue.set(pokeId, p);
  const result = await p;
  evoFetchQueue.delete(pokeId);
  return result;
}

// Returns the direct next evolution(s) of a pokemon as [{id, name}]
// Uses a cache to avoid redundant fetches
const nextEvoCache = new Map(); // pokeId → [{id, name}] | []

async function getNextEvolutions(pokeId) {
  if (nextEvoCache.has(pokeId)) return nextEvoCache.get(pokeId);
  try {
    const sp = await fetch(`https://pokeapi.co/api/v2/pokemon-species/${pokeId}`).then(r=>r.json());
    const chainUrl = sp.evolution_chain?.url;
    if (!chainUrl) { nextEvoCache.set(pokeId, []); return []; }
    const ch = await fetch(chainUrl).then(r=>r.json());
    // Walk chain to find this pokemon's node, then return its evolves_to
    const results = [];
    function walk(node) {
      if (!node) return false;
      if (node.species.url.includes('/'+pokeId+'/') || node.species.url.endsWith('/'+pokeId)) {
        // Found our node — collect direct evolutions
        (node.evolves_to||[]).forEach(n => {
          const idMatch = n.species.url.match(/\/(\d+)\/?$/);
          if (idMatch) results.push({id:parseInt(idMatch[1]), name:n.species.name});
        });
        return true;
      }
      return (node.evolves_to||[]).some(walk);
    }
    walk(ch.chain);
    // Also cache by name lookup in case url id doesn't match pokeId directly
    if (!results.length) {
      // Try matching by species name
      const spName = sp.name;
      function walkByName(node) {
        if (!node) return false;
        if (node.species.name === spName) {
          (node.evolves_to||[]).forEach(n => {
            const idMatch = n.species.url.match(/\/(\d+)\/?$/);
            if (idMatch) results.push({id:parseInt(idMatch[1]), name:n.species.name});
          });
          return true;
        }
        return (node.evolves_to||[]).some(walkByName);
      }
      walkByName(ch.chain);
    }
    nextEvoCache.set(pokeId, results);
    return results;
  } catch(e) {
    nextEvoCache.set(pokeId, []);
    return [];
  }
}
// Accepts an optional chainIds Set; if provided, matches any member of the chain.
function getPokeStatusForPlayer(pi, pokeId, pokeName, chainIds) {
  // Build a matcher that checks pokeId, name, OR any chain member
  function matches(pk) {
    if (!pk) return false;
    if (chainIds && pk.pokeId && chainIds.has(pk.pokeId)) return true;
    if (pokeId && pk.pokeId === pokeId) return true;
    const lname = pokeName ? pokeName.toLowerCase() : '';
    if (lname && pk.name && pk.name.toLowerCase() === lname) return true;
    return false;
  }

  function searchPlayerData(targetPi) {
    for (const pk of Object.values(routes[targetPi]||{})) { if (matches(pk)) return pk; }
    for (let si=0; si<6; si++) { const pk=team[targetPi]?.[si]; if (matches(pk)) return pk; }
    for (let b=0; b<NB; b++) for (let s=0; s<BS; s++) { const pk=box[targetPi]?.[b]?.[s]; if (matches(pk)) return pk; }
    return null;
  }

  const ownEntry = searchPlayerData(pi);
  if (ownEntry) {
    if (ownEntry.missed) return 'missed';
    if (!ownEntry.alive) return 'dead';
    return 'caught';
  }

  const allPIs = getAPIs();
  for (const otherPI of allPIs) {
    if (otherPI === pi) continue;
    const otherEntry = searchPlayerData(otherPI);
    if (otherEntry && !otherEntry.missed) return 'locked';
  }

  return 'open';
}

function renderRoutes(){
  const list=document.getElementById('rt-list');if(!list)return;
  // Respect active route search filter
  const routeQ=(document.getElementById('rt-route-search')?.value||'').trim();
  if(routeQ){searchRoutes(routeQ);return;}
  if(!routeData.length){list.innerHTML='<div class="empty-state">Wähle eine Edition um Routen zu laden.</div>';return;}
  const pis=getAPIs();
  list.innerHTML='';

  // Count route states
  let cntOpen=0,cntPartial=0,cntDone=0;
  routeData.forEach(loc=>{
    const pEntries=pis.map(pi=>routes[pi]?.[loc.id]);
    const anyEntry=pEntries.some(e=>e?.pokeId||e?.missed);
    const allEntered=pEntries.filter(e=>e).length===pis.length;
    if(!anyEntry) cntOpen++;
    else if(allEntered) cntDone++;
    else cntPartial++;
  });
  const ctrEl=document.getElementById('rt-counters');
  if(ctrEl){
    document.getElementById('rt-cnt-open').textContent=cntOpen+' offen';
    document.getElementById('rt-cnt-partial').textContent=cntPartial+' teilweise';
    document.getElementById('rt-cnt-done').textContent=cntDone+' fertig';
  }

  // Starter slot — rendered exactly like a normal route, always at top
  {
    const rid='__starter__';
    const pEntries=pis.map(pi=>routes[pi]?.[rid]);
    const anyEntry=pEntries.some(e=>e?.pokeId||e?.missed);
    const allEntered=pEntries.filter(e=>e&&(e.pokeId||e.missed)).length===pis.length;
    const hasAutoLink=links.some(lk=>lk.routeId===rid);
    const anyMissed=pEntries.some(e=>e?.missed);
    const locked=anyMissed&&allEntered;
    const open=openRoutes.has(rid);
    const card=document.createElement('div');
    card.className='rt-card'+(locked?' locked':'')+(hasAutoLink?' linked':'');
    let statusTxt='',statusCls='open';
    if(locked){statusTxt='gesperrt';statusCls='locked';}
    else if(hasAutoLink){statusTxt='verlinkt ✓';statusCls='linked';}
    else if(anyEntry){statusTxt='teilweise';statusCls='open';}
    card.innerHTML=`<div class="rt-card-h" onclick="toggleRoute('${rid}')">
      <div class="rt-name">⭐ Starter</div>
      ${statusTxt?`<span class="rt-status ${statusCls}">${statusTxt}</span>`:''}
      <div class="rt-toggle">${open?'▴':'▾'}</div>
    </div>`;
    const body=document.createElement('div');body.className='rt-body'+(open?' open':'');
    pis.forEach(pi=>{
      const pk=routes[pi]?.[rid];
      const pdiv=document.createElement('div');pdiv.className='rt-player';
      pdiv.innerHTML=`<div class="rt-player-lbl"><span class="pi-badge pi-${pi}">${pi+1}</span>${getPN(pi)}</div>`;
      const slot=document.createElement('div');
      let slotCls='rt-slot';
      if(pk?.missed)slotCls+=pk.missedInitiator?' missed-initiator':' missed';
      else if(pk?.pokeId&&!pk.alive)slotCls+=' dead';
      else if(pk?.pokeId)slotCls+=' caught';
      slot.className=slotCls;
      if(pk?.missed){
        const sprHtml=pk.pokeId?`<img src="${spr(pk.pokeId,false)}" loading="lazy" style="opacity:.5;filter:grayscale(.5)">`:`<div class="rt-slot-empty" style="font-size:1.6rem;opacity:.5">✗</div>`;
        const nameTxt=pk.pokeId?pkName(pk):'nicht gefangen';
        const initiatorBadge=pk.missedInitiator?'<span style="font-size:.6rem;background:rgba(250,204,21,.25);color:var(--yw);border:1px solid rgba(250,204,21,.6);border-radius:4px;padding:1px 5px;font-family:Space Mono,monospace;font-weight:700;margin-left:4px">⚡ Auslöser</span>':'';
        slot.innerHTML=`${sprHtml}<div class="rt-slot-info"><div class="rt-slot-name">${nameTxt}${initiatorBadge}</div><div class="rt-slot-status missed">✗ nicht gefangen</div><div class="rt-slot-acts-simple"><button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">✎</button></div></div>`;
      } else if(pk?.pokeId){
        slot.innerHTML=`<img src="${spr(pk.pokeId,pk.shiny)}" loading="lazy"><div class="rt-slot-info"><div class="rt-slot-name">${pkName(pk)}</div>${pk.nickname?`<div class="rt-slot-nick">"${pk.nickname}"</div>`:''}${pk.shiny?'<div style="font-size:.68rem">✨ Shiny</div>':''}<div class="rt-slot-status ${pk.alive?'caught':'dead'}">${pk.alive?'✓ gefangen':'💀 gestorben'}</div><div class="rt-slot-acts-simple"><button class="btn btn-xs ${pk.alive?'btn-d':'btn-s'}" onclick="socket.emit('set-route-alive',{playerIndex:${pi},routeId:'${rid}',alive:${!pk.alive}})">${pk.alive?'💀 Tot':'♻ Ok'}</button><button class="btn btn-xs btn-y" onclick="markRouteMissed(${pi},'${rid}')">✗ n.gef.</button><button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">✎</button></div></div>`;
      } else {
        slot.innerHTML=`<div class="rt-slot-empty">＋</div><div class="rt-slot-info"><div class="rt-slot-name" style="color:var(--txd)">nicht eingetragen</div><div class="rt-slot-acts-simple"><button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">Eintragen</button></div></div>`;
      }
      pdiv.appendChild(slot);body.appendChild(pdiv);
    });
    card.appendChild(body);list.appendChild(card);
  }

  routeData.forEach((loc,routeIndex)=>{
    const rid=loc.id;
    const pEntries=pis.map(pi=>routes[pi]?.[rid]);
    const anyEntry=pEntries.some(e=>e?.pokeId||e?.missed);
    const anyMissed=pEntries.some(e=>e?.missed);
    const allEntered=pEntries.filter(e=>e).length===pis.length;
    const locked=anyMissed&&allEntered;
    const hasAutoLink=links.some(lk=>lk.routeId===rid);
    const open=openRoutes.has(rid);

    const card=document.createElement('div');
    card.className='rt-card'+(locked?' locked':'')+(hasAutoLink?' linked':'');
    let statusTxt='',statusCls='open';
    if(locked){statusTxt='gesperrt';statusCls='locked';}
    else if(hasAutoLink){statusTxt='verlinkt ✓';statusCls='linked';}
    else if(anyEntry){statusTxt='teilweise';statusCls='open';}

    card.innerHTML=`<div class="rt-card-h" onclick="toggleRoute('${rid}')">
      <div class="rt-name">${getRouteName(loc)}</div>
      ${statusTxt?`<span class="rt-status ${statusCls}">${statusTxt}</span>`:''}
      <div class="rt-toggle">${open?'▴':'▾'}</div>
    </div>`;

    const body=document.createElement('div');body.className='rt-body'+(open?' open':'');
    pis.forEach(pi=>{
      const pk=routes[pi]?.[rid];
      const pdiv=document.createElement('div');pdiv.className='rt-player';
      pdiv.innerHTML=`<div class="rt-player-lbl"><span class="pi-badge pi-${pi}">${pi+1}</span>${getPN(pi)}</div>`;
      const slot=document.createElement('div');
      let slotCls='rt-slot';
      if(pk?.missed)slotCls+=pk.missedInitiator?' missed-initiator':' missed';
      else if(pk?.pokeId&&!pk.alive)slotCls+=' dead';
      else if(pk?.pokeId)slotCls+=' caught';
      slot.className=slotCls;

      if(pk?.missed){
        // Nicht gefangen — missed hat Vorrang, auch wenn pokeId gesetzt ist
        const sprHtml = pk.pokeId
          ? `<img src="${spr(pk.pokeId,false)}" loading="lazy" style="opacity:.35;filter:grayscale(1)">`
          : `<div class="rt-slot-empty">✗</div>`;
        const nameTxt = pk.pokeId ? (pk.nickname||pk.name) : 'nicht gefangen';
        slot.innerHTML=`${sprHtml}<div class="rt-slot-info">
          <div class="rt-slot-name">${nameTxt}</div>
          <div class="rt-slot-status missed">✗ nicht gefangen</div>
          <div class="rt-slot-acts-simple">
            <button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">✎</button>
          </div></div>`;
      } else if(pk?.pokeId){
        // Encountered + caught (or dead)
        slot.innerHTML=`<img src="${spr(pk.pokeId,pk.shiny)}" loading="lazy"><div class="rt-slot-info">
          <div class="rt-slot-name">${pk.nickname||pk.name}</div>
          ${pk.nickname?`<div class="rt-slot-nick">"${pk.nickname}"</div>`:''}
          ${pk.shiny?'<div style="font-size:.68rem">✨ Shiny</div>':''}
          <div class="rt-slot-status ${pk.alive?'caught':'dead'}">${pk.alive?'✓ gefangen':'💀 gestorben'}</div>
          <div class="rt-slot-acts-simple">
            <button class="btn btn-xs ${pk.alive?'btn-d':'btn-s'}" onclick="socket.emit('set-route-alive',{playerIndex:${pi},routeId:'${rid}',alive:${!pk.alive}})">${pk.alive?'💀 Tot':'♻ Ok'}</button>
            <button class="btn btn-xs btn-y" onclick="markRouteMissed(${pi},'${rid}')">✗ n.gef.</button>
            <button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">✎</button>
          </div></div>`;
      } else {
        // Not yet entered
        slot.innerHTML=`<div class="rt-slot-empty">＋</div><div class="rt-slot-info">
          <div class="rt-slot-name" style="color:var(--txd)">nicht eingetragen</div>
          <div class="rt-slot-acts-simple">
            <button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">Eintragen</button>
          </div></div>`;
      }
      pdiv.appendChild(slot);body.appendChild(pdiv);
    });
    card.appendChild(body);list.appendChild(card);
  });
}

function markRouteMissed(pi,rid){
  // Server handles cascade + initiator flag
  socket.emit('mark-route-missed',{playerIndex:pi,routeId:rid});
}
function clearRouteMissed(pi,rid){
  socket.emit('set-route-pokemon',{playerIndex:pi,routeId:rid,pokemon:null});
}

function toggleRoute(rid){
  if(openRoutes.has(rid))openRoutes.delete(rid);else openRoutes.add(rid);
  renderRoutes();
}

// ── Pokémon-Suche auf Routen-Seite ───────────────────────
let searchPokeTmo=null;
function searchRoutes(q){
  const lq=(q||'').toLowerCase().trim();
  const list=document.getElementById('rt-list');
  if(!lq){renderRoutes();return;} // empty → show all
  if(!routeData.length) return;

  const pis=getAPIs();
  const filtered=routeData.filter(loc=>{
    const enName=loc.name.toLowerCase();
    const deName=(_routeDeNames.get(loc.id)||'').toLowerCase();
    return enName.includes(lq)||deName.includes(lq);
  });

  list.innerHTML='';
  if(!filtered.length){list.innerHTML='<div class="empty-state">Keine Route gefunden.</div>';return;}

  const statusLabels={open:'⬜ offen',partial:'🟧 teilweise',done:'✅ fertig'};
  filtered.forEach(loc=>{
    const rid=loc.id;
    const pEntries=pis.map(pi=>routes[pi]?.[rid]);
    const anyEntry=pEntries.some(e=>e?.pokeId||e?.missed);
    const allEntered=pis.length>0&&pEntries.filter(e=>e).length===pis.length;
    const status=!anyEntry?'open':allEntered?'done':'partial';
    const isOpen=openRoutes.has(rid);

    const card=document.createElement('div');
    card.className='rt-card'+(links.some(lk=>lk.routeId===rid)?' linked':'');
    card.innerHTML=`<div class="rt-card-h" onclick="toggleRoute('${rid}')">
      <div class="rt-name">${getRouteName(loc)}</div>
      <span class="rt-status ${status==='open'?'open':status==='done'?'linked':'open'}">${statusLabels[status]}</span>
      <div class="rt-toggle">${isOpen?'▴':'▾'}</div>
    </div>`;

    const body=document.createElement('div');body.className='rt-body'+(isOpen?' open':'');
    pis.forEach(pi=>{
      const pk=routes[pi]?.[rid];
      const pdiv=document.createElement('div');pdiv.className='rt-player';
      pdiv.innerHTML=`<div class="rt-player-lbl"><span class="pi-badge pi-${pi}">${pi+1}</span>${getPN(pi)}</div>`;
      const slot=document.createElement('div');slot.className='rt-slot'+(pk?.missed?' missed':pk?.pokeId&&!pk.alive?' dead':pk?.pokeId?' caught':'');
      if(pk?.missed){slot.innerHTML=`<div class="rt-slot-empty">✗</div><div class="rt-slot-info"><div class="rt-slot-name">nicht gefangen</div><div class="rt-slot-status missed">✗ nicht gefangen</div><div class="rt-slot-acts-simple"><button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">✎</button></div></div>`;}
      else if(pk?.pokeId){slot.innerHTML=`<img src="${spr(pk.pokeId,pk.shiny)}" loading="lazy"><div class="rt-slot-info"><div class="rt-slot-name">${pk.nickname||pk.name}</div><div class="rt-slot-status ${pk.alive?'caught':'dead'}">${pk.alive?'✓ gefangen':'💀 gestorben'}</div><div class="rt-slot-acts-simple"><button class="btn btn-xs ${pk.alive?'btn-d':'btn-s'}" onclick="socket.emit('set-route-alive',{playerIndex:${pi},routeId:'${rid}',alive:${!pk.alive}})">${pk.alive?'💀 Tot':'♻ Ok'}</button><button class="btn btn-xs btn-y" onclick="markRouteMissed(${pi},'${rid}')">✗ n.gef.</button><button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">✎</button></div></div>`;}
      else{slot.innerHTML=`<div class="rt-slot-empty">＋</div><div class="rt-slot-info"><div class="rt-slot-name" style="color:var(--txd)">nicht eingetragen</div><div class="rt-slot-acts-simple"><button class="btn btn-xs btn-g" onclick="openPicker('route',${pi},'${rid}')">Eintragen</button></div></div>`;}
      pdiv.appendChild(slot);body.appendChild(pdiv);
    });
    card.appendChild(body);list.appendChild(card);
  });
}

function hideSearchRes(){
  // Small delay so clicking a result inside still registers before hiding
  setTimeout(()=>{
    const resEl=document.getElementById('rt-search-res');
    if(resEl)resEl.classList.remove('show');
  },150);
}

function searchRoutesPoke(q){
  const resEl=document.getElementById('rt-search-res');
  if(!q||q.length<1){resEl.classList.remove('show');resEl.innerHTML='';return;}
  clearTimeout(searchPokeTmo);
  searchPokeTmo=setTimeout(async()=>{
    const lq=q.toLowerCase().trim();
    let matches=[];
    try{
      const all=await getAllPokemon();
      const byNum=!isNaN(lq)?all.filter(p=>p.id===parseInt(lq)):[];
      const byName=all.filter(p=>p.name.includes(lq));
      const byDE=searchByGerman(lq);
      matches=[...new Map([...byNum,...byDE,...byName].map(p=>[p.id,p])).values()].slice(0,10);
    }catch(e){}
    if(!matches.length){resEl.innerHTML='<div style="color:var(--txd);font-size:.76rem;font-family:Space Mono,monospace">Kein Ergebnis.</div>';resEl.classList.add('show');return;}
    const pis=getAPIs();
    resEl.innerHTML=`<div style="font-size:.7rem;font-weight:700;margin-bottom:6px">Ergebnisse für "${lq}":</div>`;
    // Fetch evo chains for all matches in parallel, then render
    const statusLabels={open:'✓ offen',caught:'● gefangen',dead:'💀 gestorben',missed:'✗ gesperrt (nicht gef.)',locked:'🔒 gesperrt (anderer hat gef.)'};
    await Promise.all(matches.map(async m=>{
      const chainIds = await getEvoChain(m.id);
      const chainNames = [...chainIds].map(id=>{
        // find name from already loaded results or cache
        const r=matches.find(x=>x.id===id);
        return r?.name||null;
      }).filter(Boolean);

      const block=document.createElement('div');
      block.style.cssText='background:var(--sf2);border:1px solid var(--bd);border-radius:10px;padding:10px 12px;margin-bottom:6px';
      const chainLabel = chainIds.size > 1
        ? `<span style="font-size:.6rem;color:var(--txd);font-family:'Space Mono',monospace;margin-left:6px">(+ ${chainIds.size-1} Evo)</span>`
        : '';
      const deName=_deNames?.get(m.id);
      const displayName=deName?`${deName} <span style="color:var(--txd);font-size:.65rem">/ ${m.name}</span>`:m.name;
      block.innerHTML=`<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <img src="${spr(m.id,false)}" style="width:36px;height:36px;image-rendering:pixelated">
        <span style="font-size:.82rem;font-weight:700">${displayName}</span>${chainLabel}
      </div>`;
      const playerRows=document.createElement('div');playerRows.style.cssText='display:flex;flex-direction:column;gap:4px';
      pis.forEach(pi=>{
        const status=getPokeStatusForPlayer(pi,m.id,m.name,chainIds);
        const row=document.createElement('div');
        row.style.cssText='display:flex;align-items:center;gap:8px';
        row.innerHTML=`<span class="pi-badge pi-${pi}" style="flex-shrink:0">${pi+1}</span>
          <span style="font-size:.72rem;color:${PC[pi][0]};min-width:70px">${getPN(pi)}</span>
          <span class="rt-sr-status ${status}">${statusLabels[status]||status}</span>`;
        playerRows.appendChild(row);
      });
      block.appendChild(playerRows);
      resEl.appendChild(block);
    }));
    resEl.classList.add('show');
  },300);
}

// ═══════════════════════════════════════════════
// MOVE MODAL
// ═══════════════════════════════════════════════
let mvCtx=null;
function openMv(dir,pi,si,bn,sn,rid){
  mvCtx={dir,pi,si,bn,sn,rid};
  const t=document.getElementById('mvt'),f=document.getElementById('mvf');
  if(dir==='toBox'){
    t.textContent='📦 Team → Box';
    f.innerHTML=`<div class="lbl">Ziel-Box</div>
    <select class="msel" id="mv-bn">${Array.from({length:NB},(_,i)=>`<option value="${i}">Box ${i+1}</option>`).join('')}</select>
    <div class="lbl">Ziel-Slot</div>
    <select class="msel" id="mv-sn">${Array.from({length:BS},(_,i)=>{const pk=box[pi]?.[0]?.[i];return`<option value="${i}">Slot ${i+1}${pk?.pokeId?' ('+( pk.nickname||pk.name)+')':' (leer)'}</option>`;}).join('')}</select>`;
    document.getElementById('mv-bn').onchange=function(){
      const bn2=parseInt(this.value);
      document.getElementById('mv-sn').innerHTML=Array.from({length:BS},(_,i)=>{const pk=box[pi]?.[bn2]?.[i];return`<option value="${i}">Slot ${i+1}${pk?.pokeId?' ('+( pk.nickname||pk.name)+')':' (leer)'}</option>`;}).join('');
    };
  }else if(dir==='toTeam'){
    t.textContent='⬆️ Box → Team';
    f.innerHTML=`<div class="lbl">Ziel-Slot im Team</div>
    <select class="msel" id="mv-tsi">${Array.from({length:6},(_,i)=>{const pk=team[pi]?.[i];return`<option value="${i}">Slot ${i+1}${pk?.pokeId?' ('+( pk.nickname||pk.name)+')':' (leer)'}</option>`;}).join('')}</select>`;
  }else if(dir==='routeToTeam'){
    t.textContent='⬆️ Route → Team';
    f.innerHTML=`<div class="lbl">Ziel-Slot im Team</div>
    <select class="msel" id="mv-tsi">${Array.from({length:6},(_,i)=>{const pk=team[pi]?.[i];return`<option value="${i}">Slot ${i+1}${pk?.pokeId?' ('+( pk.nickname||pk.name)+')':' (leer)'}</option>`;}).join('')}</select>`;
  }else if(dir==='routeToBox'){
    t.textContent='📦 Route → Box';
    f.innerHTML=`<div class="lbl">Ziel-Box</div>
    <select class="msel" id="mv-bn">${Array.from({length:NB},(_,i)=>`<option value="${i}">Box ${i+1}</option>`).join('')}</select>
    <div class="lbl">Ziel-Slot</div>
    <select class="msel" id="mv-sn">${Array.from({length:BS},(_,i)=>{const pk=box[pi]?.[0]?.[i];return`<option value="${i}">Slot ${i+1}${pk?.pokeId?' ('+( pk.nickname||pk.name)+')':' (leer)'}</option>`;}).join('')}</select>`;
  }
  document.getElementById('mvm').classList.add('open');
}
function closeMv(){document.getElementById('mvm').classList.remove('open');}
function confirmMv(){
  if(!mvCtx)return;
  const{dir,pi,si,bn,sn,rid}=mvCtx;
  if(dir==='toBox'){socket.emit('move-to-box',{playerIndex:pi,slotIndex:si,boxNum:parseInt(document.getElementById('mv-bn').value),slotNum:parseInt(document.getElementById('mv-sn').value)});}
  else if(dir==='toTeam'){socket.emit('move-to-team',{playerIndex:pi,boxNum:bn,slotNum:sn,slotIndex:parseInt(document.getElementById('mv-tsi').value)});}
  else if(dir==='routeToTeam'){
    const tsi=parseInt(document.getElementById('mv-tsi').value);
    const pk=routes[pi]?.[rid];if(!pk)return;
    // move-from-route: copies pokemon to team AND updates link location, route data stays
    socket.emit('move-from-route',{playerIndex:pi,routeId:rid,toLocation:'team',toSlotIndex:tsi});
  }
  else if(dir==='routeToBox'){
    const bnv=parseInt(document.getElementById('mv-bn').value),snv=parseInt(document.getElementById('mv-sn').value);
    const pk=routes[pi]?.[rid];if(!pk)return;
    socket.emit('move-from-route',{playerIndex:pi,routeId:rid,toLocation:{box:bnv,slot:snv}});
  }
  closeMv();
}

// ─── Link-Move Modal ──────────────────────────
let lmCtx=null;
function openLinkMove(linkId){
  lmCtx={linkId};
  const lk=links.find(l=>l.id===linkId);if(!lk)return;
  const f=document.getElementById('lmf');f.innerHTML='';
  lk.slots.forEach(s=>{
    const pk=getPAt(s);const nm=pk?.nickname||pk?.name||'?';
    const row=document.createElement('div');row.className='mrow';
    row.innerHTML=`<div class="mrow-lbl" style="color:${PC[s.playerIndex][0]}">${getPN(s.playerIndex)}: ${nm}</div>`;
    const bsel=document.createElement('select');bsel.className='lb-sel';bsel.id=`lm-b-${s.playerIndex}`;
    bsel.innerHTML=Array.from({length:NB},(_,i)=>`<option value="${i}">Box ${i+1}</option>`).join('');
    const ssel=document.createElement('select');ssel.className='lb-sel';ssel.id=`lm-s-${s.playerIndex}`;
    const updateSsel=()=>{const bn=parseInt(bsel.value);ssel.innerHTML=Array.from({length:BS},(_,i)=>{const pk2=box[s.playerIndex]?.[bn]?.[i];return`<option value="${i}">Slot ${i+1}${pk2?.pokeId?' ('+( pk2.nickname||pk2.name)+')':' (leer)'}</option>`;}).join('');};
    updateSsel();bsel.onchange=updateSsel;
    row.appendChild(bsel);row.appendChild(ssel);f.appendChild(row);
  });
  document.getElementById('lmm').classList.add('open');
}
function confirmLinkMove(){
  const lk=links.find(l=>l.id===lmCtx.linkId);if(!lk)return;
  const targets=lk.slots.map(s=>({playerIndex:s.playerIndex,boxNum:parseInt(document.getElementById(`lm-b-${s.playerIndex}`).value),slotNum:parseInt(document.getElementById(`lm-s-${s.playerIndex}`).value)}));
  socket.emit('move-link-to-box',{linkId:lmCtx.linkId,boxTargets:targets});
  document.getElementById('lmm').classList.remove('open');
}

// ═══════════════════════════════════════════════
// POKEMON PICKER
// ═══════════════════════════════════════════════
let pCtx=null,pPoke=null,sTmo=null;
function spr(id,sh=false){return sh?`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/shiny/${id}.png`:`https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/${id}.png`;}
function openPicker(kind,pi,si,bn){
  pCtx={kind,pi,si,bn};pPoke=null;
  let ex=null;
  if(kind==='team')ex=team[pi]?.[si];
  else if(kind==='box')ex=si>=0?box[pi]?.[bn]?.[si]:null;
  else if(kind==='route')ex=routes[pi]?.[si];// si=routeId here
  document.getElementById('pnick').value=ex?.nickname||'';
  document.getElementById('psh').checked=ex?.shiny||false;
  document.getElementById('pdd').checked=!!ex?.pokeId&&!ex.alive;
  document.getElementById('pms').checked=ex?.missed||false;
  document.getElementById('pq').value='';
  if(ex?.pokeId){pPoke={pokeId:ex.pokeId,name:ex.name};updPrev();}
  else document.getElementById('pprev').innerHTML='<span style="color:var(--txd);font-size:.76rem;font-family:Space Mono,monospace">Nichts ausgewählt</span>';
  loadG1();
  document.getElementById('pm').classList.add('open');
}
function closePicker(){document.getElementById('pm').classList.remove('open');}
// Cache of all pokemon (loaded once)
let _allPokemon = null;
let _deNames = null; // Map: id → german name

// Returns display name for a pokemon object — german name if loaded, else nickname/name
function pkName(pk){
  if(!pk) return '';
  if(pk.nickname) return pk.nickname;
  if(pk.pokeId && _deNames?.has(pk.pokeId)) return _deNames.get(pk.pokeId);
  return pk.name || '';
}

async function getAllPokemon(){
  if(_allPokemon) return _allPokemon;
  const r=await fetch('https://pokeapi.co/api/v2/pokemon?limit=1302&offset=0');
  const d=await r.json();
  _allPokemon=d.results.map((p,i)=>({id:i+1,name:p.name}));
  // Load German names in background (don't block)
  loadGermanNames();
  return _allPokemon;
}

// Fetch all German names from pokemon-species list in chunks
async function loadGermanNames(){
  if(_deNames) return;
  _deNames = new Map();
  try{
    const r=await fetch('https://pokeapi.co/api/v2/pokemon-species?limit=1302&offset=0');
    const d=await r.json();
    // Fetch species data in parallel batches of 50
    const batchSize=50;
    for(let i=0;i<d.results.length;i+=batchSize){
      const batch=d.results.slice(i,i+batchSize);
      await Promise.all(batch.map(async (s,bi)=>{
        try{
          const sd=await fetch(s.url).then(r=>r.json());
          const deName=sd.names.find(n=>n.language.name==='de');
          if(deName) _deNames.set(i+bi+1, deName.name);
        }catch(e){}
      }));
    }
    console.log('[i18n] German names loaded:', _deNames.size);
    // Update picker if open
    const grid=document.getElementById('prg');
    if(grid&&grid.children.length>0&&!document.getElementById('pq')?.value){
      _pickerPage=0; renderPRVirtual();
    }
  }catch(e){ console.warn('German names failed:', e); }
}

function searchByGerman(lq){
  if(!_deNames||!_allPokemon) return [];
  return _allPokemon.filter(p=>{
    const de=_deNames.get(p.id);
    return de&&de.toLowerCase().includes(lq);
  });
}

function getDisplayName(p){
  const de = _deNames?.get(p.id);
  return de ? `${de} / ${p.name}` : p.name;
}

// Virtual scroll state for the picker
let _pickerAllItems = [];
let _pickerPage = 0;
const PICKER_PAGE_SIZE = 60;

async function loadG1(){
  // Show placeholder immediately
  renderPR(Array.from({length:30},(_,i)=>({id:i+1,name:'#'+(i+1)})));
  try{
    const all = await getAllPokemon();
    _pickerAllItems = all;
    _pickerPage = 0;
    renderPRVirtual(); // render first page
    setupPickerScroll(); // attach scroll listener
  }catch(e){}
}

function renderPRVirtual(){
  const grid = document.getElementById('prg');
  if(!grid) return;
  const start = _pickerPage * PICKER_PAGE_SIZE;
  const slice = _pickerAllItems.slice(start, start + PICKER_PAGE_SIZE);
  if(start === 0) {
    grid.innerHTML = '';
    _pickerPage = 0;
  }
  const sh = document.getElementById('psh')?.checked || false;
  slice.forEach(item => {
    const d = document.createElement('div');
    d.className = 'pr' + (pPoke?.pokeId === item.id ? ' sel' : '');
    const deName=_deNames?.get(item.id);
    const label=deName?deName:item.name;
    d.innerHTML = `<img src="${spr(item.id, sh)}" loading="lazy"><span>${label}</span>`;
    d.onclick = () => {
      pPoke = {pokeId: item.id, name: item.name};
      document.querySelectorAll('.pr').forEach(x => x.classList.remove('sel'));
      d.classList.add('sel');
      updPrev();
    };
    grid.appendChild(d);
  });
  _pickerPage++;
}

function setupPickerScroll(){
  const grid = document.getElementById('prg');
  if(!grid || grid._scrollBound) return;
  grid._scrollBound = true;
  grid.addEventListener('scroll', () => {
    // Load more when within 60px of bottom
    if(grid.scrollHeight - grid.scrollTop - grid.clientHeight < 60){
      const hasMore = _pickerPage * PICKER_PAGE_SIZE < _pickerAllItems.length;
      if(hasMore) renderPRVirtual();
    }
  });
}
function searchPoke(q){
  clearTimeout(sTmo);if(!q){loadG1();return;}
  sTmo=setTimeout(async()=>{
    const lq=q.toLowerCase().trim();
    if(!isNaN(lq)){renderPR([{id:parseInt(lq),name:'#'+lq}]);return;}
    try{
      const all=await getAllPokemon();
      const byNum=!isNaN(lq)?all.filter(p=>p.id===parseInt(lq)):[];
      const byName=all.filter(p=>p.name.includes(lq));
      const byDE=searchByGerman(lq);
      const matches=[...new Map([...byNum,...byDE,...byName].map(p=>[p.id,p])).values()].slice(0,60);
      renderPR(matches);
    }catch(e){}
  },200);
}
function renderPR(items){
  // Reset virtual scroll when search is active
  _pickerAllItems = items;
  _pickerPage = 0;
  const c=document.getElementById('prg');c.innerHTML='';
  const sh=document.getElementById('psh')?.checked||false;
  items.forEach(item=>{
    const d=document.createElement('div');d.className='pr'+(pPoke?.pokeId===item.id?' sel':'');
    const deName=_deNames?.get(item.id);
    const label=deName?deName:item.name;
    d.innerHTML=`<img src="${spr(item.id,sh)}" loading="lazy"><span>${label}</span>`;
    d.onclick=()=>{pPoke={pokeId:item.id,name:item.name};document.querySelectorAll('.pr').forEach(x=>x.classList.remove('sel'));d.classList.add('sel');updPrev();};
    c.appendChild(d);
  });
}
function updPrev(){
  if(!pPoke)return;
  const sh=document.getElementById('psh')?.checked||false;
  const ni=document.getElementById('pnick')?.value||'';
  const dd=document.getElementById('pdd')?.checked||false;
  const ms=document.getElementById('pms')?.checked||false;
  document.getElementById('pprev').innerHTML=`<img src="${spr(pPoke.pokeId,sh)}"><div><div class="pp-n">${pPoke.name}</div>${ni?`<div class="pp-ni">"${ni}"</div>`:''}
    <div class="pp-fl">${sh?'<span class="ppf sh">✨</span>':''}${dd?'<span class="ppf dd">💀</span>':''}${ms?'<span class="ppf ms">✗ nicht gef.</span>':''}</div></div>`;
}
['psh','pdd','pms'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>{updPrev();if(document.getElementById('pq').value)searchPoke(document.getElementById('pq').value);else loadG1();}));
document.getElementById('pnick')?.addEventListener('input',updPrev);
function confirmPicker(){
  const ms=document.getElementById('pms').checked;
  if(!ms&&!pPoke){toast('Kein Pokémon ausgewählt.',1);return;}
  // If "nicht gefangen" is checked, still store the pokemon species if one was selected
  // so the search can identify which pokemon was missed for this player.
  const pk = ms
    ? { pokeId: pPoke?.pokeId||null, name: pPoke?.name||'', nickname: document.getElementById('pnick').value.trim(), shiny: document.getElementById('psh').checked, alive: true, missed: true }
    : { pokeId: pPoke.pokeId, name: pPoke.name, nickname: document.getElementById('pnick').value.trim(), shiny: document.getElementById('psh').checked, alive: !document.getElementById('pdd').checked, missed: false };
  const{kind,pi,si,bn}=pCtx;
  if(kind==='team')socket.emit('set-pokemon',{playerIndex:pi,slotIndex:si,pokemon:pk});
  else if(kind==='box'){if(si<0){const fs=box[pi][bn].findIndex(s=>!s?.pokeId&&!s?.missed);if(fs<0){toast('Box voll!',1);return;}socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum:fs,pokemon:pk});}else socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum:si,pokemon:pk});}
  else if(kind==='route')socket.emit('set-route-pokemon',{playerIndex:pi,routeId:si,pokemon:pk});
  closePicker();
}
function clearPSlot(){
  const{kind,pi,si,bn}=pCtx;
  if(kind==='team')socket.emit('set-pokemon',{playerIndex:pi,slotIndex:si,pokemon:null});
  else if(kind==='box')socket.emit('set-box-pokemon',{playerIndex:pi,boxNum:bn,slotNum:si,pokemon:null});
  else if(kind==='route')socket.emit('set-route-pokemon',{playerIndex:pi,routeId:si,pokemon:null});
  closePicker();
}
// Entfernt alle Pokémon eines Links aus dem Team → verschiebt sie in die Box (erster freier Slot).
// ── Link → Box (auto, ersetzt removeLinkFromTeam) ────────────────────────────
function moveLinkToBox(linkId){
  const lk=links.find(l=>l.id===linkId);if(!lk)return;
  let allOk=true;
  lk.slots.forEach(s=>{
    if(s.location!=='team')return;
    const pk=getPAt(s);if(!pk?.pokeId)return;
    let found=false;
    for(let b=0;b<NB&&!found;b++) for(let sl=0;sl<BS&&!found;sl++){
      if(!box[s.playerIndex]?.[b]?.[sl]?.pokeId){
        socket.emit('move-to-box',{playerIndex:s.playerIndex,slotIndex:s.slotIndex,boxNum:b,slotNum:sl});
        found=true;
      }
    }
    if(!found){toast('Keine freie Box für '+getPN(s.playerIndex)+'!',1);allOk=false;}
  });
  if(allOk)toast('Link in Box verschoben.');
}

// Keeps old name as alias so any leftover calls don't crash
function removeLinkFromTeam(linkId){ moveLinkToBox(linkId); }

// ── Link → Team modal ─────────────────────────────────────────────────────────
let _ltLinkId = null;
const _ltSelectedSlots = {}; // playerIndex → slotIndex

function openLinkToTeam(linkId){
  const lk=links.find(l=>l.id===linkId);if(!lk)return;
  _ltLinkId=linkId;
  const f=document.getElementById('ltf');f.innerHTML='';

  // Default: first slot index where ALL players either have it free, or fallback to 0
  const firstFreeForAll=[0,1,2,3,4,5].find(si=>
    lk.slots.every(s=>!team[s.playerIndex]?.[si]?.pokeId)
  )??0;
  lk.slots.forEach(s=>{ _ltSelectedSlots[s.playerIndex]=firstFreeForAll; });

  // Hint: show which slots are free for ALL players
  const slotFreeForAll=Array.from({length:6},(_,si)=>
    lk.slots.every(s=>!team[s.playerIndex]?.[si]?.pokeId)
  );

  // Build ONE shared slot grid (one selection controls all players)
  const sharedSec=document.createElement('div');sharedSec.className='lt-player-section';
  sharedSec.innerHTML=`<div class="lt-player-lbl" style="margin-bottom:4px">🎯 Ziel-Slot (gilt für alle Spieler)</div>
    <p style="font-size:.7rem;color:var(--txd);font-family:'Space Mono',monospace;margin-bottom:9px">Belegte Slots werden 1:1 ersetzt — gelb = wird überschrieben</p>`;

  const grid=document.createElement('div');grid.className='lt-slots-grid';grid.id='lt-shared-grid';
  for(let i=0;i<6;i++){
    const btn=document.createElement('button');
    btn.id=`lt-shared-slot-${i}`;
    // Show all players' pokemon at this slot
    const sprites=lk.slots.map(s=>{
      const t=team[s.playerIndex]?.[i];
      return t?.pokeId
        ? `<img class="lt-slot-sprite" src="${spr(t.pokeId,t.shiny)}" title="${getPN(s.playerIndex)}: ${t.nickname||t.name}" style="width:22px;height:22px">`
        : `<div style="width:22px;height:22px;opacity:.18;font-size:.9rem;display:flex;align-items:center;justify-content:center">○</div>`;
    }).join('');
    const anyOccupied=lk.slots.some(s=>team[s.playerIndex]?.[i]?.pokeId);
    btn.className='lt-slot-btn'+(i===firstFreeForAll?' selected':'')+(anyOccupied?' will-replace':'');
    btn.innerHTML=`<div style="display:flex;gap:1px;align-items:center">${sprites}</div>
      <span class="lt-slot-num">Slot ${i+1}</span>
      <span class="lt-slot-name" style="color:${slotFreeForAll[i]?'var(--gr)':'var(--yw)'}">${slotFreeForAll[i]?'alle frei':'wird ersetzt'}</span>`;
    btn.onclick=()=>selectLtSlotAll(i, lk);
    grid.appendChild(btn);
  }
  sharedSec.appendChild(grid);
  f.appendChild(sharedSec);

  // Per-player summary (read-only, shows what will happen)
  const sumSec=document.createElement('div');sumSec.className='lt-player-section';
  sumSec.innerHTML=`<div class="lt-player-lbl" style="margin-top:4px">👥 Vorschau</div>`;
  sumSec.id='lt-preview';
  f.appendChild(sumSec);
  _renderLtPreview(lk, firstFreeForAll);

  document.getElementById('ltm').classList.add('open');
}

function selectLtSlot(pi, si){ selectLtSlotAll(si, links.find(l=>l.id===_ltLinkId)); }

function selectLtSlotAll(si, lk){
  if(!lk)return;
  // Apply same slot to all players
  lk.slots.forEach(s=>{ _ltSelectedSlots[s.playerIndex]=si; });
  // Update shared grid visuals
  for(let i=0;i<6;i++){
    const btn=document.getElementById(`lt-shared-slot-${i}`);
    if(!btn)continue;
    const anyOccupied=lk.slots.some(s=>team[s.playerIndex]?.[i]?.pokeId);
    btn.className='lt-slot-btn'+(i===si?' selected':'')+(anyOccupied?' will-replace':'');
  }
  _renderLtPreview(lk, si);
}

function _renderLtPreview(lk, si){
  const sec=document.getElementById('lt-preview');if(!sec)return;
  // Keep the header, replace content after it
  const hdr=sec.querySelector('.lt-player-lbl');
  sec.innerHTML='';
  if(hdr)sec.appendChild(hdr);
  lk.slots.forEach(s=>{
    const pk=getPAt(s);
    const t=team[s.playerIndex]?.[si];
    const row=document.createElement('div');
    row.style.cssText='display:flex;align-items:center;gap:8px;padding:5px 0;border-bottom:1px solid var(--bd);font-size:.75rem';
    const incoming=pk?.pokeId?`<img src="${spr(pk.pokeId,pk.shiny)}" style="width:26px;height:26px;image-rendering:pixelated"> <span>${pk.nickname||pk.name}</span>`:'<span style="color:var(--txd)">?</span>';
    const existing=t?.pokeId?`<img src="${spr(t.pokeId,t.shiny)}" style="width:26px;height:26px;image-rendering:pixelated"> <span style="color:var(--yw)">${t.nickname||t.name} wird ersetzt</span>`:'<span style="color:var(--gr);font-size:.68rem">leerer Slot</span>';
    row.innerHTML=`<span class="pi-badge pi-${s.playerIndex}" style="flex-shrink:0">${s.playerIndex+1}</span>
      <span style="color:${PC[s.playerIndex][0]};min-width:60px;flex-shrink:0">${getPN(s.playerIndex)}</span>
      <span style="display:flex;align-items:center;gap:4px">${incoming}</span>
      <span style="color:var(--txd);font-size:.8rem;margin:0 2px">→</span>
      <span style="display:flex;align-items:center;gap:4px">${existing}</span>`;
    sec.appendChild(row);
  });
}

function confirmLinkToTeam(){
  const linkId=_ltLinkId;
  const lk=links.find(l=>l.id===linkId);if(!lk)return;
  const si=_ltSelectedSlots[lk.slots[0].playerIndex]??0;
  // Single event handles everything atomically on the server,
  // preserving all other links when displacing pokemon.
  socket.emit('move-link-to-team',{linkId,slotIndex:si});
  document.getElementById('ltm').classList.remove('open');
}

// Kept for any legacy callers
function moveLinkToTeamSlot(linkId, targetSlotIndex){
  const lk=links.find(l=>l.id===linkId);if(!lk)return;
  lk.slots.forEach(s=>{
    const pk=getPAt(s);if(!pk)return;
    if(s.location==='team'){
      const src=s.slotIndex;
      if(src!==targetSlotIndex){
        socket.emit('set-pokemon',{playerIndex:s.playerIndex,slotIndex:targetSlotIndex,pokemon:{...pk}});
        socket.emit('set-pokemon',{playerIndex:s.playerIndex,slotIndex:src,pokemon:null});
      }
    } else if(typeof s.location==='object'&&'box'in s.location){
      socket.emit('move-to-team',{playerIndex:s.playerIndex,boxNum:s.location.box,slotNum:s.location.slot,slotIndex:targetSlotIndex});
    } else if(typeof s.location==='object'&&'route'in s.location){
      socket.emit('move-from-route',{playerIndex:s.playerIndex,routeId:s.location.route,toLocation:'team',toSlotIndex:targetSlotIndex});
    }
  });
}

document.getElementById('pm')?.addEventListener('click',e=>{if(e.target===document.getElementById('pm'))closePicker();});
document.getElementById('mvm')?.addEventListener('click',e=>{if(e.target===document.getElementById('mvm'))closeMv();});
document.getElementById('lmm')?.addEventListener('click',e=>{if(e.target===document.getElementById('lmm'))document.getElementById('lmm').classList.remove('open');});
document.getElementById('ssm')?.addEventListener('click',e=>{if(e.target===document.getElementById('ssm'))document.getElementById('ssm').classList.remove('open');});

// ═══════════════════════════════════════════════
// UI
// ═══════════════════════════════════════════════
function updateUI(){updPBar();updateSBar();}
function updPBar(){
  const bar=document.getElementById('peer-bar');
  const right=document.getElementById('peer-bar-right');
  bar.querySelectorAll('.pc').forEach(c=>c.remove());
  const mk=(n,s)=>{const c=document.createElement('div');c.className='pc'+(s?' sharing':'');c.innerHTML=`<div class="pcd${s?' sharing':''}"></div>${n}`;return c;};
  bar.appendChild(mk(myName+' (Du)',isSharing));peers.forEach(p=>bar.appendChild(mk(p.name,p.sharing)));
  if(right) bar.appendChild(right);
}
function backToLogin(){
  try{
    if(localStream){ localStream.getTracks().forEach(t=>t.stop()); localStream=null; }
    if(socket&&socket.connected) socket.disconnect();
  }catch(_){}
  window.location.reload();
}
function updateSBar(){
  const sh=(isSharing?1:0)+[...peers.values()].filter(p=>p.sharing).length;
  document.getElementById('str').textContent=sh+'/3 teilen';
  document.getElementById('stl').textContent=(1+peers.size)+' verbunden';
}
let _minimized=false;
function popoutStreams(){
  // Build a small picker modal showing which peers are currently active
  const existing=document.getElementById('popout-picker');
  if(existing){existing.remove();return;}

  const modal=document.createElement('div');
  modal.id='popout-picker';
  modal.style.cssText='position:fixed;bottom:40px;right:18px;background:var(--sf);border:1px solid var(--bd);border-radius:12px;padding:14px 16px;z-index:9999;min-width:220px;box-shadow:0 8px 32px rgba(0,0,0,.5)';

  const title=document.createElement('div');
  title.style.cssText='font-size:.7rem;font-weight:700;font-family:"Space Mono",monospace;color:var(--txd);margin-bottom:10px;text-transform:uppercase;letter-spacing:.06em';
  title.textContent='Stream pop-out';
  modal.appendChild(title);

  // Collect all popout-able streams: peers + own stream
  const targets=[];
  // Own stream
  if(isSharing && localStream){
    targets.push({label:'Ich ('+myName+')', slotId:'slot-local', pi:myPI});
  }
  // Peers by slot order
  [...peers.values()].filter(p=>p.playerIndex>=0).sort((a,b)=>a.slotIndex-b.slotIndex).forEach(p=>{
    targets.push({label:'P'+(p.playerIndex+1)+': '+p.name, slotId:'slot-peer-'+p.slotIndex, pi:p.playerIndex});
  });

  if(!targets.length){
    const msg=document.createElement('div');
    msg.style.cssText='font-size:.72rem;color:var(--txd);font-family:"Space Mono",monospace';
    msg.textContent='Keine aktiven Streams.';
    modal.appendChild(msg);
  } else {
    targets.forEach(t=>{
      const row=document.createElement('div');
      row.style.cssText='display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:7px';
      const lbl=document.createElement('span');
      lbl.style.cssText='font-size:.74rem;font-family:"Space Mono",monospace;color:var(--tx)';
      lbl.textContent=t.label;
      const btn=document.createElement('button');
      btn.className='btn btn-xs btn-g';
      btn.textContent='⧉ öffnen';
      btn.onclick=()=>_openOnePopout(t);
      row.appendChild(lbl);
      row.appendChild(btn);
      modal.appendChild(row);
    });

    if(targets.length>1){
      const sep=document.createElement('div');
      sep.style.cssText='border-top:1px solid var(--bd);margin:8px 0';
      modal.appendChild(sep);
      const allBtn=document.createElement('button');
      allBtn.className='btn btn-xs btn-s';
      allBtn.style.cssText='width:100%';
      allBtn.textContent='⧉ Alle öffnen';
      allBtn.onclick=()=>{ targets.forEach(t=>_openOnePopout(t)); modal.remove(); };
      modal.appendChild(allBtn);
    }
  }

  const closeBtn=document.createElement('div');
  closeBtn.style.cssText='text-align:right;margin-top:10px;font-size:.65rem;color:var(--txd);cursor:pointer;font-family:"Space Mono",monospace';
  closeBtn.textContent='✕ schließen';
  closeBtn.onclick=()=>modal.remove();
  modal.appendChild(closeBtn);

  document.body.appendChild(modal);
  // Close on outside click
  setTimeout(()=>document.addEventListener('click',function h(e){if(!modal.contains(e.target)&&e.target.id!=='popoutbtn'){modal.remove();document.removeEventListener('click',h);}},),50);
}

// Track open popout windows so we don't open duplicates
const _popoutWindows={};
let _popoutOffset=0;
// Native video PiP handles: slotId → PiP video element
const _pipVideos={};

async function _openOnePopout(t){
  const slotId=t.slotId;

  // ── Native video Picture-in-Picture (works for multiple simultaneously) ───
  // Each video element can have its own PiP window independently
  try{
    // Find the source video
    const srcSlot=document.getElementById(slotId);
    const srcVid=srcSlot&&srcSlot.querySelector('video[src-bound]');

    if(srcVid&&srcVid.srcObject&&document.pictureInPictureEnabled){
      // If already in PiP, exit it
      if(document.pictureInPictureElement===srcVid){
        await document.exitPictureInPicture();
        delete _pipVideos[slotId];
        return;
      }
      // Create a hidden clone video in the main document that we send into PiP
      // (we can't PiP the slot video directly as it's inside a transformed container)
      let pipVid=document.getElementById('pip-clone-'+slotId);
      if(!pipVid){
        pipVid=document.createElement('video');
        pipVid.id='pip-clone-'+slotId;
        pipVid.autoplay=true; pipVid.playsInline=true; pipVid.muted=true;
        pipVid.style.cssText='position:fixed;width:1px;height:1px;opacity:.01;pointer-events:none;z-index:-1;top:0;left:0';
        document.body.appendChild(pipVid);
      }
      pipVid.srcObject=srcVid.srcObject;
      await pipVid.play().catch(()=>{});

      await pipVid.requestPictureInPicture();
      _pipVideos[slotId]=pipVid;

      // Keep srcObject in sync
      const iv=setInterval(()=>{
        if(document.pictureInPictureElement!==pipVid){clearInterval(iv);return;}
        const s=document.getElementById(slotId);
        const sv=s&&s.querySelector('video[src-bound]');
        if(sv&&sv.srcObject!==pipVid.srcObject){
          pipVid.srcObject=sv.srcObject;
          pipVid.play().catch(()=>{});
        }
      },500);

      pipVid.addEventListener('leavepictureinpicture',()=>{
        clearInterval(iv);
        delete _pipVideos[slotId];
      },{once:true});
      return;
    }
  }catch(e){
    dlog('[PiP] native video PiP failed: '+e.message,'w');
  }

  // ── Fallback: window.open ─────────────────────────────────────────────────
  if(_popoutWindows[slotId]&&!_popoutWindows[slotId].closed){
    try{_popoutWindows[slotId].focus();}catch(_){} return;
  }
  const label=t.label;
  const sw=screen.availWidth,sh=screen.availHeight;
  const ww=Math.min(720,sw*0.5),wh=Math.min(460,sh*0.55);
  const base=(_popoutOffset++)%4;
  const left=Math.round((sw-ww)/2+base*40-60);
  const top=Math.round((sh-wh)/2+base*40-60);
  const features='width='+Math.round(ww)+',height='+Math.round(wh)+',left='+left+',top='+top
    +',resizable=yes,scrollbars=no,toolbar=no,menubar=no,location=no,status=no';
  const w=window.open('about:blank','soullink-po-'+slotId,features);
  if(!w){toast('Pop-out blockiert — Popup-Blocker erlauben',1);return;}
  _popoutWindows[slotId]=w;
  w.document.open();
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8">'
    +'<title>'+label+' \xb7 SoulLink</title>'
    +'<style>html,body{margin:0;padding:0;background:#000;width:100%;height:100%;overflow:hidden}'
    +'body{display:flex;flex-direction:column;font-family:monospace}'
    +'#bar{background:#111;padding:4px 8px;display:flex;align-items:center;justify-content:space-between;flex-shrink:0;border-bottom:1px solid #222}'
    +'#lbl{font-size:.68rem;color:rgba(255,255,255,.4)}'
    +'#fitbtn{font-size:.62rem;background:#1a1a2e;color:rgba(255,255,255,.4);border:1px solid #333;border-radius:4px;padding:2px 6px;cursor:pointer}'
    +'#fitbtn:hover{color:#fff}'
    +'#vw{flex:1;position:relative;background:#000}'
    +'video{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}'
    +'#empty{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;color:rgba(255,255,255,.1);font-size:.8rem}'
    +'</style></head><body>'
    +'<div id="bar"><span id="lbl">'+label+'</span>'
    +'<button id="fitbtn" onclick="tf()">fill</button></div>'
    +'<div id="vw"><div id="empty">kein stream</div>'
    +'<video id="v" autoplay playsinline muted style="display:none"></video></div>'
    +'<script>'
    +'var v=document.getElementById("v"),em=document.getElementById("empty"),ls=null,fm="contain";'
    +'function tf(){fm=fm=="contain"?"cover":"contain";v.style.objectFit=fm;document.getElementById("fitbtn").textContent=fm=="contain"?"fill":"fit";}'
    +'function sync(){var op=window.opener;if(!op||op.closed){clearInterval(iv);return;}'
    +'try{var sl=op.document.getElementById("'+slotId+'");var sv=sl&&sl.querySelector("video");var st=sv&&sv.srcObject;'
    +'if(st&&st!==ls){v.srcObject=st;v.play().catch(function(){});ls=st;em.style.display="none";v.style.display="block";}'
    +'else if(!st&&ls){v.srcObject=null;ls=null;em.style.display="flex";v.style.display="none";}'
    +'try{op.peers.forEach(function(p){if("slot-peer-"+p.slotIndex=="'+slotId+'"){var n="P"+(p.playerIndex+1)+": "+p.name;document.getElementById("lbl").textContent=n;document.title=n+" \xb7 SoulLink";}});}catch(e){}'
    +'}catch(e){}}'
    +'var iv=setInterval(sync,400);sync();'
    +'<\/script></body></html>');
  w.document.close();
}

function toggleMinimize(){
  _minimized=!_minimized;
  const sg=document.getElementById('sg');
  const peersRow=document.getElementById('peers-row');
  sg.classList.toggle('minimized',_minimized);
  document.getElementById('minbtn').textContent=_minimized?'⊞ maximieren':'⊟ minimieren';
  updateSgCols();
  // In minimized mode the peers-row needs to be a grid inside the flex column
  // CSS handles this via .peers-row selector
}

// ── Local map files per edition ───────────────────────────────────────────────
const LOCAL_MAPS = {
  'red-blue': [
    {file:'reed_blue_region.jpg',        label:'Kanto Region'},
    {file:'ceruleancave_red_blue.jpg',   label:'Zerulean Höhle'},
    {file:'mtmoon_red_blue.jpg',         label:'Mt. Moon'},
    {file:'pokemansion_red_blue.jpg',    label:'Pokémon Mansion'},
    {file:'poketower_red_blue.jpg',      label:'Pokémon Turm'},
    {file:'power_plant_red_blue.jpg',    label:'Kraftwerk'},
    {file:'rockethideout_red_blue.jpg',  label:'Rocket Versteck'},
    {file:'rocktunnel_red_blue.jpg',     label:'Felsentunnel'},
    {file:'safarizone_red_blue.jpg',     label:'Safari Zone'},
    {file:'seafoamisland_red_blue.jpg',  label:'Seafoam Islands'},
    {file:'silphco_red_blue.jpg',        label:'Silph Co.'},
    {file:'veridianforrrest_red_blue.jpg',label:'Viridian Wald'},
    {file:'victoryroad_red_blue.jpg',    label:'Siegesstraße'},
  ],
  'yellow': [
    {file:'yellow_region.jpg',           label:'Kanto Region'},
    {file:'ceruleancave_yellow.jpg',     label:'Zerulean Höhle'},
    {file:'mtmoon_yellow.jpg',           label:'Mt. Moon'},
    {file:'pokemansion_yellow.jpg',      label:'Pokémon Mansion'},
    {file:'poketower_yellow.jpg',        label:'Pokémon Turm'},
    {file:'power_plant_yellow.jpg',      label:'Kraftwerk'},
    {file:'rockethideout_yellow.jpg',    label:'Rocket Versteck'},
    {file:'rocktunnel_yellow.jpg',       label:'Felsentunnel'},
    {file:'safarizone_yellow.jpg',       label:'Safari Zone'},
    {file:'seafoamisland_yellow.jpg',    label:'Seafoam Islands'},
    {file:'silphco_yellow.jpg',          label:'Silph Co.'},
    {file:'veridianforrest_yellow.jpg',  label:'Viridian Wald'},
    {file:'victoryroad_yellow.jpg',      label:'Siegesstraße'},
  ],
  'gold-silver': [
    {file:'fullregion.jpg',              label:'Johto + Kanto (komplett)'},
    {file:'johtoregion.jpg',             label:'Johto Region'},
    {file:'kantoregion.jpg',             label:'Kanto Region'},
    {file:'darkcave.jpg',                label:'Dunkelhöhle'},
    {file:'icepath.jpg',                 label:'Eispfad'},
    {file:'ilexforrest.jpg',             label:'Ilex Wald'},
    {file:'mtmoon.jpg',                  label:'Mt. Moon'},
    {file:'mtmortar.jpg',                label:'Mt. Mörser'},
    {file:'mtsilver.jpg',                label:'Mt. Silber'},
    {file:'rocktunnel.jpg',              label:'Felsentunnel'},
    {file:'slowpokewell.jpg',            label:'Flegmabrunnen'},
    {file:'tintowers.jpg',               label:'Zinn-Türme'},
    {file:'unioncave.jpg',               label:'Unionshöhle'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'whirlislands.jpg',            label:'Wirbelinseln'},
  ],
  'crystal': [
    {file:'fullregion.jpg',              label:'Johto + Kanto (komplett)'},
    {file:'johtoregion.jpg',             label:'Johto Region'},
    {file:'kantoregion.jpg',             label:'Kanto Region'},
    {file:'darkcave.jpg',                label:'Dunkelhöhle'},
    {file:'icepath.jpg',                 label:'Eispfad'},
    {file:'ilexforrest.jpg',             label:'Ilex Wald'},
    {file:'mtmoon.jpg',                  label:'Mt. Moon'},
    {file:'mtmortar.jpg',                label:'Mt. Mörser'},
    {file:'mtsilver.jpg',                label:'Mt. Silber'},
    {file:'rocktunnel.jpg',              label:'Felsentunnel'},
    {file:'slowpokewell.jpg',            label:'Flegmabrunnen'},
    {file:'tintowers.jpg',               label:'Zinn-Türme'},
    {file:'unioncave.jpg',               label:'Unionshöhle'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'whirlislands.jpg',            label:'Wirbelinseln'},
  ],
  'heartgold-soulsilver': [
    {file:'fullregionmap.jpg',           label:'Johto + Kanto (komplett)'},
    {file:'regionmapjohto.jpg',          label:'Johto Region'},
    {file:'regionmapkanto.jpg',          label:'Kanto Region'},
    {file:'belltower.jpg',               label:'Glockenturm'},
    {file:'ceruleancave.jpg',            label:'Zerulean Höhle'},
    {file:'darkcave.jpg',                label:'Dunkelhöhle'},
    {file:'icepath.jpg',                 label:'Eispfad'},
    {file:'ilexforest.jpg',              label:'Ilex Wald'},
    {file:'mtmoon.jpg',                  label:'Mt. Moon'},
    {file:'mtmortar.jpg',                label:'Mt. Mörser'},
    {file:'mtsilver.jpg',                label:'Mt. Silber'},
    {file:'rocktunnel.jpg',              label:'Felsentunnel'},
    {file:'seafoamislands.jpg',          label:'Seafoam Islands'},
    {file:'slowpokewell.jpg',            label:'Flegmabrunnen'},
    {file:'unioncave.jpg',               label:'Unionshöhle'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'viridianforrest.jpg',         label:'Viridian Wald'},
    {file:'whirlislands.jpg',            label:'Wirbelinseln'},
  ],
  'ruby-sapphire': [
    {file:'ruby_sapphire_region.jpg',    label:'Hoenn Region'},
    {file:'abandonedship.jpg',           label:'Verlassenes Schiff'},
    {file:'aquahideout.jpg',             label:'Aqua Versteck'},
    {file:'caveoforigin.jpg',            label:'Höhle des Ursprungs'},
    {file:'granitecave.jpg',             label:'Granithöhle'},
    {file:'magmahideout_ruby.jpg',       label:'Magma Versteck'},
    {file:'mewmauvile.jpg',              label:'Mewmauvile'},
    {file:'safarizonr.jpg',              label:'Safari Zone'},
    {file:'seafloorcavern.jpg',          label:'Meeresgrundkaverne'},
    {file:'shoalcave.jpg',               label:'Küstenhöhle'},
    {file:'skypillar.jpg',               label:'Himmelsturm'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
  ],
  'emerald': [
    {file:'emerald_region.jpg',          label:'Hoenn Region'},
    {file:'abandonedship.jpg',           label:'Verlassenes Schiff'},
    {file:'aquahideout.jpg',             label:'Aqua Versteck'},
    {file:'caveoforigin.jpg',            label:'Höhle des Ursprungs'},
    {file:'granitecave.jpg',             label:'Granithöhle'},
    {file:'magmahideout_emerald.jpg',    label:'Magma Versteck'},
    {file:'mewmauvile.jpg',              label:'Mewmauvile'},
    {file:'safarizonr.jpg',              label:'Safari Zone'},
    {file:'seafloorcavern.jpg',          label:'Meeresgrundkaverne'},
    {file:'shoalcave.jpg',               label:'Küstenhöhle'},
    {file:'skypillar.jpg',               label:'Himmelsturm'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
  ],
  'firered-leafgreen': [
    {file:'regionmap.jpg',               label:'Kanto Region'},
    {file:'ceruleancave.jpg',            label:'Zerulean Höhle'},
    {file:'mtmoon.jpg',                  label:'Mt. Moon'},
    {file:'pokemansion.jpg',             label:'Pokémon Mansion'},
    {file:'pokemontower.jpg',            label:'Pokémon Turm'},
    {file:'powerplant.jpg',              label:'Kraftwerk'},
    {file:'rockethideout.jpg',           label:'Rocket Versteck'},
    {file:'rocketwarehouse.jpg',         label:'Rocket Lager'},
    {file:'rocktunnel.jpg',              label:'Felsentunnel'},
    {file:'safarizone.jpg',              label:'Safari Zone'},
    {file:'seafoamislands.jpg',          label:'Seafoam Islands'},
    {file:'seviiislands.jpg',            label:'Sevii Inseln'},
    {file:'silphco.jpg',                 label:'Silph Co.'},
    {file:'veridianforrest.jpg',         label:'Viridian Wald'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
  ],
  'diamond-pearl': [
    {file:'diamond_pearl_region.jpg',    label:'Sinnoh Region'},
    {file:'amitysquare.jpg',             label:'Freundschaftsplatz'},
    {file:'fuegoironworks.jpg',          label:'Feuereisenwerk'},
    {file:'ironisland.jpg',              label:'Eiseninsel'},
    {file:'mtcoronet.jpg',               label:'Mt. Coronet'},
    {file:'snowpointtemple.jpg',         label:'Schneeorttempel'},
    {file:'solaceanruins.jpg',           label:'Florenthia Ruinen'},
    {file:'starkmountain.jpg',           label:'Starkberg'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'waywardcave.jpg',             label:'Irrwegshöhle'},
  ],
  'platinum': [
    {file:'platinum_region.jpg',         label:'Sinnoh Region'},
    {file:'amitysquare.jpg',             label:'Freundschaftsplatz'},
    {file:'fuegoironworks.jpg',          label:'Feuereisenwerk'},
    {file:'ironisland.jpg',              label:'Eiseninsel'},
    {file:'mtcoronet.jpg',               label:'Mt. Coronet'},
    {file:'snowpointtemple.jpg',         label:'Schneeorttempel'},
    {file:'solaceanruins.jpg',           label:'Florenthia Ruinen'},
    {file:'starkmountain.jpg',           label:'Starkberg'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'waywardcave.jpg',             label:'Irrwegshöhle'},
  ],
  'brilliant-diamond-and-shining-pearl': [
    {file:'regionmap.jpg',               label:'Sinnoh Region'},
    {file:'eternaforrest.jpg',           label:'Ewigwald'},
    {file:'fuegoironworks.jpg',          label:'Feuereisenwerk'},
    {file:'ironisland.jpg',              label:'Eiseninsel'},
    {file:'mtcoronet.jpg',               label:'Mt. Coronet'},
    {file:'snowpointtemple.jpg',         label:'Schneeorttempel'},
    {file:'solaceanruins.jpg',           label:'Florenthia Ruinen'},
    {file:'starkmountain.jpg',           label:'Starkberg'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'waywardcave.jpg',             label:'Irrwegshöhle'},
  ],
  'black-white': [
    {file:'black_region.jpg',            label:'Einall Region (Schwarz)'},
    {file:'white_region.jpg',            label:'Einall Region (Weiß)'},
    {file:'abyssalruins.jpg',            label:'Abyssalruinen'},
    {file:'casteliacity.jpg',            label:'Castelia City'},
    {file:'celestialtower.jpg',          label:'Celestial Turm'},
    {file:'challengerscave.jpg',         label:'Herausforderer Höhle'},
    {file:'chargestonecave.jpg',         label:'Donnersteinkaverene'},
    {file:'coldstorage.jpg',             label:'Kühllager'},
    {file:'dragonspiraltower.jpg',       label:'Drachenspiralturm'},
    {file:'dreamyard.jpg',               label:'Traumhof'},
    {file:'giantchasm.jpg',              label:'Riesenabgrund'},
    {file:'mistraltoncave.jpg',          label:'Mistraltonhöhle'},
    {file:'pinwheelforres.jpg',          label:'Windradwald'},
    {file:'reliccastle.jpg',             label:'Reliktschloss'},
    {file:'route1718p2lab.jpg',          label:'Route 17/18 + P2 Labor'},
    {file:'twistmountain.jpg',           label:'Schraubenberg'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'wellspringcave.jpg',          label:'Quellhöhle'},
  ],
  'black-2-white-2': [
    {file:'blackregion.jpg',             label:'Einall Region (Schwarz 2)'},
    {file:'whiteregion.jpg',             label:'Einall Region (Weiß 2)'},
    {file:'abyssalruins.jpg',            label:'Abyssalruinen'},
    {file:'casteliacity.jpg',            label:'Castelia City'},
    {file:'casteliasewers.jpg',          label:'Castelia Kanalisation'},
    {file:'caveofbeing.jpg',             label:'Höhle des Seins'},
    {file:'celestialtower.jpg',          label:'Celestial Turm'},
    {file:'chargestonecave.jpg',         label:'Donnersteinkaverene'},
    {file:'claytunnel.jpg',              label:'Lehmtunnel'},
    {file:'dragonspiraltower.jpg',       label:'Drachenspiralturm'},
    {file:'dreamyard.jpg',               label:'Traumhof'},
    {file:'giantchasm.jpg',              label:'Riesenabgrund'},
    {file:'mistraltoncave.jpg',          label:'Mistraltonhöhle'},
    {file:'pinwheelforrest.jpg',         label:'Windradwald'},
    {file:'reliccastle.jpg',             label:'Reliktschloss'},
    {file:'relicpassage.jpg',            label:'Reliktgang'},
    {file:'reversalmountain.jpg',        label:'Umkehrberg'},
    {file:'route1718p2lab.jpg',          label:'Route 17/18 + P2 Labor'},
    {file:'twistmountain.jpg',           label:'Schraubenberg'},
    {file:'undergroundruins.jpg',        label:'Untergrundruinen'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
    {file:'wellspringcave.jpg',          label:'Quellhöhle'},
  ],
  'x-y': [
    {file:'regionmap.jpg',               label:'Kalos Region'},
    {file:'connectingcave.jpg',          label:'Verbindungshöhle'},
    {file:'frostcavern.jpg',             label:'Frosthöhle'},
    {file:'glitteringcave.jpg',          label:'Glitzerhöhle'},
    {file:'kalospowerplant.jpg',         label:'Kalos Kraftwerk'},
    {file:'losthotel.jpg',               label:'Verlassenes Hotel'},
    {file:'lumiosecity.jpg',             label:'Illumina City'},
    {file:'megastonelocations.png',      label:'Mega-Stein Fundorte'},
    {file:'pokeballfactory.jpg',         label:'Pokéball-Fabrik'},
    {file:'reflectioncave.jpg',          label:'Spiegelhöhle'},
    {file:'terminuscave.jpg',            label:'Endpunkthöhle'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
  ],
  'omega-ruby-alpha-sapphire': [
    {file:'regionmap.jpg',               label:'Hoenn Region'},
    {file:'fierypath.jpg',               label:'Feuriger Pfad'},
    {file:'granitecave.jpg',             label:'Granithöhle'},
    {file:'jaggedpass.jpg',              label:'Felspass'},
    {file:'mauvilecity.jpg',             label:'Malvenfroh City'},
    {file:'meteorfalls.jpg',             label:'Meteorfälle'},
    {file:'mtchimney.jpg',               label:'Mt. Schlot'},
    {file:'mtpyre.jpg',                  label:'Mt. Pyre'},
    {file:'route126_sootopoliscity.jpg', label:'Route 126 + Himmelblaue Stadt'},
    {file:'route128.jpg',                label:'Route 128'},
    {file:'rusturftunnel.jpg',           label:'Maskenrasen Tunnel'},
    {file:'seamauvile.jpg',              label:'Seeblau'},
    {file:'shoalcave.jpg',               label:'Küstenhöhle'},
    {file:'teamaquahideout.jpg',         label:'Aqua Versteck'},
    {file:'teammagmahideout.jpg',        label:'Magma Versteck'},
    {file:'victoryroad.jpg',             label:'Siegesstraße'},
  ],
  'sun-moon': [
    {file:'island_layout.jpg',           label:'Alola Inseln Übersicht'},
    {file:'melemeleisland.jpg',          label:'Melemele Island'},
    {file:'akalaisland.jpg',             label:'Akala Island'},
    {file:'ulaulaisland.jpg',            label:'Ula\'ula Island'},
    {file:'poniisland.jpg',              label:'Poni Island'},
    {file:'digletttunnel.jpg',           label:'Digda Tunnel'},
    {file:'lushjungle.jpg',              label:'Üppiger Dschungel'},
    {file:'melemelemeadows_seawardcave_kalaebay.jpg', label:'Melemele Wiesen / Meeresblickhöhle'},
    {file:'mountlanakila_pokemonleague.jpg', label:'Mt. Lanakila / Pokémon Liga'},
    {file:'ponimeadows_resolutioncave.jpg',  label:'Poni Wiesen / Entschlossenheitshöhle'},
    {file:'tencarathill.jpg',            label:'Zehnkarat Hügel'},
    {file:'vastponicanyon.jpg',          label:'Weitläufiger Poni Canyon'},
    {file:'welavolcanicpark.jpg',        label:'Wela Vulkanpark'},
  ],
  'ultra-sun-ultra-moon': [
    {file:'islandlayout.jpg',            label:'Alola Inseln Übersicht'},
    {file:'melemeleisland.jpg',          label:'Melemele Island'},
    {file:'akalaisland.jpg',             label:'Akala Island'},
    {file:'ulaulaisland.jpg',            label:'Ula\'ula Island'},
    {file:'poniislandmap.jpg',           label:'Poni Island'},
    {file:'digletttunnel.jpg',           label:'Digda Tunnel'},
    {file:'lushjungle.jpg',              label:'Üppiger Dschungel'},
    {file:'melemelemeadows_seawardcave_kalaebay.jpg', label:'Melemele Wiesen / Meeresblickhöhle'},
    {file:'mountlanakila_pokemonleague.jpg', label:'Mt. Lanakila / Pokémon Liga'},
    {file:'ponimeadows_resolutioncave.jpg',  label:'Poni Wiesen / Entschlossenheitshöhle'},
    {file:'tencarathill.jpg',            label:'Zehnkarat Hügel'},
    {file:'vastponicanyon.jpg',          label:'Weitläufiger Poni Canyon'},
    {file:'welavolcanicpark.jpg',        label:'Wela Vulkanpark'},
  ],
  'sword-shield': [
    {file:'galarregionmap.jpg',          label:'Galar Region'},
    {file:'centralareamap.jpg',          label:'Wildnis (Zentrum)'},
    {file:'northareamap.jpg',            label:'Wildnis (Norden)'},
    {file:'southareamap.jpg',            label:'Wildnis (Süden)'},
    {file:'galaringamemap.jpg',          label:'Galaring'},
    {file:'galarmine.jpg',              label:'Galar Mine 1'},
    {file:'galarmine2.jpg',             label:'Galar Mine 2'},
    {file:'glimwoodtangle.jpg',          label:'Leuchtwald'},
    {file:'hammerlocke.jpg',             label:'Turffield'},
    {file:'motostoke.jpg',               label:'Feuerfels'},
    {file:'route8.jpg',                  label:'Route 8'},
    {file:'wildarea.jpg',                label:'Wildnis'},
    {file:'wyndon.jpg',                  label:'Hammerlocke'},
  ],
  'legends-arceus': [
    {file:'hisuiregionmap.jpg',          label:'Hisui Region'},
    {file:'obsidianfiledlandsarea.jpg',  label:'Obsidian Fluren'},
    {file:'crimsonmirelands.jpg',        label:'Purpurrote Moorgründe'},
    {file:'cobaltcoastlands.jpg',        label:'Kobaltküstenland'},
    {file:'coronethighlands.jpg',        label:'Coronet Hochland'},
    {file:'alabastericelands.jpg',       label:'Alabaster Eisland'},
    {file:'jubilifevillagearea.jpg',     label:'Jubelstadt'},
    {file:'bothersomebidoofsideqquest8.jpg', label:'Lästige Bidoof Quest'},
    {file:'wispandunknownobsidian.jpg',  label:'Irrlichter (Obsidian)'},
    {file:'wispandunknownscoronethighlands.jpg', label:'Irrlichter (Coronet)'},
    {file:'wispandunknownscrimsonmirelands.jpg', label:'Irrlichter (Purpur)'},
    {file:'wispandunknowncobaltcoastlands.jpg',  label:'Irrlichter (Kobalt)'},
    {file:'wispandunknownsalabastericelands.jpg', label:'Irrlichter (Alabaster)'},
    {file:'wispandunknownjubilife.jpg',  label:'Irrlichter (Jubelstadt)'},
  ],
};

// Map edition key → subfolder in /maps/
const EDITION_TO_FOLDER = {
  'red-blue':                           'red_blue',
  'yellow':                             'yellow',
  'gold-silver':                        'gold_silver_crystal',
  'crystal':                            'gold_silver_crystal',
  'heartgold-soulsilver':               'heartgold_soulsilver',
  'ruby-sapphire':                      'ruby_sapphire_emerald',
  'emerald':                            'ruby_sapphire_emerald',
  'firered-leafgreen':                  'firered_leafgreen',
  'diamond-pearl':                      'diamond_pearl_platinum',
  'platinum':                           'diamond_pearl_platinum',
  'brilliant-diamond-and-shining-pearl':'brilliantdiwamond_shinypearl',
  'black-white':                        'black_white_1',
  'black-2-white-2':                    'black_white_2',
  'x-y':                                'xy',
  'omega-ruby-alpha-sapphire':          'omegaruby_alphassaphire',
  'sun-moon':                           'sun_moon',
  'ultra-sun-ultra-moon':               'ultrasun_ultramoon',
  'sword-shield':                       'sword_shield',
  'legends-arceus':                     'legendsarceus',
};

let _mapZoom=1, _mapDrag=false, _mapDx=0, _mapDy=0, _mapLx=0, _mapLy=0;
let _activeMapFile=null;
let _mapMode='local';
const FRLG_INTERACTIVE_MAP_URL='https://mapgenie.io/pokemon-firered-leafgreen/maps/kanto?embed=light';

function setMapMode(mode){
  _mapMode=mode;
  renderMap();
}

function renderMapModeToggle(){
  const host=document.getElementById('map-mode-toggle-host');
  if(!host)return;
  host.innerHTML='';
  if(selectedEdition!=='firered-leafgreen'){
    if(_mapMode!=='local') _mapMode='local';
    return;
  }

  const toggle=document.createElement('div');
  toggle.className='map-mode-toggle';

  const localBtn=document.createElement('button');
  localBtn.className='map-mode-btn'+(_mapMode==='local'?' active':'');
  localBtn.textContent='Standardkarten';
  localBtn.onclick=()=>setMapMode('local');

  const interactiveBtn=document.createElement('button');
  interactiveBtn.className='map-mode-btn'+(_mapMode==='interactive'?' active':'');
  interactiveBtn.textContent='Interaktive Karte';
  interactiveBtn.onclick=()=>setMapMode('interactive');

  toggle.appendChild(localBtn);
  toggle.appendChild(interactiveBtn);
  host.appendChild(toggle);
}

function renderMap(){
  const thumbList=document.getElementById('map-thumb-list');
  const edLabel=document.getElementById('map-sidebar-edition');
  if(!thumbList)return;

  const folder=selectedEdition?EDITION_TO_FOLDER[selectedEdition]:null;
  const maps=selectedEdition?LOCAL_MAPS[selectedEdition]:null;

  if(edLabel) edLabel.textContent=selectedEdition
    ? selectedEdition.replace(/-/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
    : '';

  renderMapModeToggle();

  if(!maps||!folder){
    thumbList.innerHTML='<div style="color:var(--txd);font-size:.72rem;font-family:\'Space Mono\',monospace;padding:12px 8px">'+(selectedEdition?`Keine Karten für "${selectedEdition}".`:'Wähle eine Edition in den Routen aus.')+'</div>';
    _activeMapFile=null;
    const viewer=document.getElementById('map-viewer');
    if(viewer){viewer.innerHTML='<div class="map-mode-toggle-host" id="map-mode-toggle-host"></div><div id="map-no-edition" style="display:flex;align-items:center;justify-content:center;flex:1;color:var(--txd);font-family:\'Space Mono\',monospace;font-size:.82rem">Wähle eine Karte aus der Seitenleiste.</div>';}
    renderMapModeToggle();
    return;
  }

  if(selectedEdition==='firered-leafgreen' && _mapMode==='interactive'){
    thumbList.innerHTML='<div class="map-mode-note">Die interaktive Kanto-Karte wird im Viewer angezeigt. Wechsle auf "Standardkarten", um wieder die bisherigen Karten zu nutzen.</div>';
    renderInteractiveMap();
    return;
  }

  // Rebuild thumbnail list
  thumbList.innerHTML='';
  maps.forEach(({file,label})=>{
    const url=`/maps/${folder}/${file}`;
    const thumb=document.createElement('div');
    thumb.className='map-thumb'+(file===_activeMapFile?' active':'');
    thumb.dataset.file=file;
    const img=document.createElement('img');
    img.className='map-thumb-img';
    img.src=url;
    img.alt=label;
    img.loading='lazy';
    const lbl=document.createElement('span');
    lbl.className='map-thumb-name';
    lbl.textContent=label;
    thumb.appendChild(img);
    thumb.appendChild(lbl);
    thumb.onclick=()=>loadMapImage(url, label, file);
    thumbList.appendChild(thumb);
  });

  // Auto-load first map if none selected or active file not in this edition
  const stillValid=maps.some(m=>m.file===_activeMapFile);
  const viewer=document.getElementById('map-viewer');
  const needsImageRender=!viewer?.querySelector('.map-img') || !!viewer?.querySelector('.map-embed-frame');
  if(!stillValid || needsImageRender){
    const first=maps[0];
    const activeMap=(stillValid ? maps.find(m=>m.file===_activeMapFile) : null) || first;
    loadMapImage(`/maps/${folder}/${activeMap.file}`, activeMap.label, activeMap.file);
  } else {
    // Re-highlight active thumb
    thumbList.querySelectorAll('.map-thumb').forEach(t=>t.classList.toggle('active',t.dataset.file===_activeMapFile));
  }
}

function renderInteractiveMap(){
  const viewer=document.getElementById('map-viewer');
  if(!viewer)return;
  viewer.innerHTML='<div class="map-mode-toggle-host" id="map-mode-toggle-host"></div>';
  renderMapModeToggle();

  const title=document.createElement('div');
  title.className='map-viewer-title';
  title.textContent='Kanto Interaktive Karte';

  const wrap=document.createElement('div');
  wrap.className='map-embed-wrap';

  const iframe=document.createElement('iframe');
  iframe.className='map-embed-frame';
  iframe.src=FRLG_INTERACTIVE_MAP_URL;
  iframe.title='FireRed LeafGreen Interaktive Karte';
  iframe.loading='lazy';
  iframe.referrerPolicy='strict-origin-when-cross-origin';

  wrap.appendChild(iframe);
  viewer.appendChild(title);
  viewer.appendChild(wrap);
}

function loadMapImage(url, label, file){
  _activeMapFile=file;
  // Highlight in sidebar
  document.querySelectorAll('.map-thumb').forEach(t=>t.classList.toggle('active',t.dataset.file===file));

  const viewer=document.getElementById('map-viewer');
  if(!viewer)return;

  // Build viewer if not yet done
  let wrap=viewer.querySelector('.map-img-wrap');
  if(!wrap){
    viewer.innerHTML='<div class="map-mode-toggle-host" id="map-mode-toggle-host"></div>';
    renderMapModeToggle();
    wrap=document.createElement('div');
    wrap.className='map-img-wrap';
    viewer.appendChild(wrap);
    // Pan
    wrap.addEventListener('mousedown',e=>{_mapDrag=true;_mapLx=e.clientX;_mapLy=e.clientY;});
    window.addEventListener('mouseup',()=>{_mapDrag=false;});
    window.addEventListener('mousemove',e=>{
      if(!_mapDrag)return;
      _mapDx+=e.clientX-_mapLx;_mapDy+=e.clientY-_mapLy;
      _mapLx=e.clientX;_mapLy=e.clientY;
      applyMapTransform();
    });
    // Zoom
    wrap.addEventListener('wheel',e=>{
      e.preventDefault();
      _mapZoom=Math.max(.2,Math.min(8,_mapZoom*(e.deltaY<0?1.12:.9)));
      applyMapTransform();
    },{passive:false});
    // Controls overlay
    const ctrl=document.createElement('div');ctrl.className='map-viewer-controls';
    const zIn=document.createElement('button');zIn.className='map-viewer-btn';zIn.textContent='+';zIn.onclick=()=>{_mapZoom=Math.min(8,_mapZoom*1.2);applyMapTransform();};
    const zOut=document.createElement('button');zOut.className='map-viewer-btn';zOut.textContent='–';zOut.onclick=()=>{_mapZoom=Math.max(.2,_mapZoom*.8);applyMapTransform();};
    const rst=document.createElement('button');rst.className='map-viewer-btn';rst.textContent='↺';rst.onclick=()=>{_mapZoom=1;_mapDx=0;_mapDy=0;applyMapTransform();};
    ctrl.appendChild(zOut);ctrl.appendChild(zIn);ctrl.appendChild(rst);
    viewer.appendChild(ctrl);
  }

  // Title
  let title=viewer.querySelector('.map-viewer-title');
  if(!title){title=document.createElement('div');title.className='map-viewer-title';viewer.appendChild(title);}
  title.textContent=label;

  // Load image
  wrap.querySelectorAll('img.map-img,.map-loading').forEach(e=>e.remove());
  const loading=document.createElement('div');loading.className='map-loading';
  loading.style.cssText='color:var(--txd);font-family:Space Mono,monospace;font-size:.8rem;position:absolute';
  loading.textContent='Lade…';
  wrap.appendChild(loading);
  const img=document.createElement('img');
  img.className='map-img';
  img.style.cssText='max-width:none;max-height:none;image-rendering:auto;transform-origin:center;position:absolute;pointer-events:none';
  img.onload=()=>{loading.remove();_mapZoom=1;_mapDx=0;_mapDy=0;applyMapTransform();};
  img.onerror=()=>{loading.textContent='Karte nicht gefunden: '+url;};
  img.src=url;
  wrap.appendChild(img);
}

function applyMapTransform(){
  const img=document.querySelector('.map-img');
  if(img)img.style.transform=`translate(${_mapDx}px,${_mapDy}px) scale(${_mapZoom})`;
}

function startRun(){ if(socket)socket.emit('run-start'); }
function pauseRun(){  if(socket)socket.emit('run-pause');  }
function newRun(){   document.getElementById('reset-modal').classList.add('open'); }
function confirmReset(){ document.getElementById('reset-modal').classList.remove('open'); if(socket)socket.emit('run-new'); }

function revealRunPassword(el){
  if(!el) return;
  if(!runPassword){el.textContent='PW: *****************';return;}
  el.textContent='PW: '+runPassword;
}
function hideRunPassword(el){
  if(!el) return;
  el.textContent='PW: *****************';
}
function copyRunPassword(ev){
  ev?.stopPropagation?.();
  if(!runPassword){toast('Kein Passwort gesetzt',1);return;}
  navigator.clipboard?.writeText(runPassword).then(()=>toast('Run-Passwort kopiert')).catch(()=>toast('Kopieren fehlgeschlagen',1));
}
function updateRunPasswordUI(){
  const wrap=document.getElementById('run-bar-pw-wrap');
  const mask=document.getElementById('run-bar-pw-mask');
  if(!wrap||!mask) return;
  if(runPassword){
    wrap.style.display='inline-flex';
    hideRunPassword(mask);
  } else {
    wrap.style.display='none';
  }
}

function updateRunUI(){
  const canCtrl=myPI>=0; // active players only
  const badge=document.getElementById('run-status-badge');
  const timer=document.getElementById('run-timer');
  const btn=document.getElementById('run-btn');
  const bar=document.getElementById('run-bar');
  const barCounter=document.getElementById('run-bar-counter');
  const barCtrl=document.getElementById('run-bar-ctrl');

  if(bar) bar.style.display='flex';
  updateRunPasswordUI();

  if(runStatus==='active'){
    if(badge) badge.textContent='● Run #'+runCounter+' │';
    startRunTimer();
    if(btn&&canCtrl){btn.style.display='';btn.className='btn btn-d btn-xs';btn.textContent='⏸ Run pausieren';btn.onclick=pauseRun;}
    else if(btn) btn.style.display='none';
    if(barCounter) barCounter.textContent='Run #'+runCounter+' aktiv';
    if(barCtrl&&canCtrl) barCtrl.innerHTML='<button class="btn btn-d btn-xs" onclick="pauseRun()">⏸ Pausieren</button><button class="btn btn-g btn-xs" onclick="newRun()" style="margin-left:5px">⟳ Reset</button>';
    else if(barCtrl) barCtrl.innerHTML='';
  } else if(runStatus==='paused'){
    stopRunTimer();
    if(badge) badge.textContent='⏸ Run #'+runCounter+' │';
    if(timer) timer.textContent=fmtElapsed(runElapsed);
    if(btn&&canCtrl){btn.style.display='';btn.className='btn btn-s btn-xs';btn.textContent='▶ Run fortsetzen';btn.onclick=startRun;}
    else if(btn) btn.style.display='none';
    if(barCounter) barCounter.textContent='Run #'+runCounter+' pausiert';
    if(barCtrl&&canCtrl) barCtrl.innerHTML='<button class="btn btn-s btn-xs" onclick="startRun()">▶ Fortsetzen</button><button class="btn btn-g btn-xs" onclick="newRun()" style="margin-left:5px">⟳ Reset</button>';
    else if(barCtrl) barCtrl.innerHTML='';
  } else {
    stopRunTimer();
    if(timer) timer.textContent='';
    if(badge) badge.textContent='';
    if(runStatus==='lobby'){
      if(btn&&canCtrl){btn.style.display='';btn.className='btn btn-s btn-xs';btn.textContent='▶ Run starten';btn.onclick=startRun;}
      else if(btn) btn.style.display='none';
      if(barCounter) barCounter.textContent=runCounter>0?'Letzter: Run #'+runCounter:'Bereit';
      if(barCtrl&&canCtrl) barCtrl.innerHTML='<button class="btn btn-s btn-xs" onclick="startRun()">▶ Run starten</button>';
      else if(barCtrl) barCtrl.innerHTML='';
    } else { // ended (legacy)
      if(btn&&canCtrl){btn.style.display='';btn.className='btn btn-s btn-xs';btn.textContent='▶ Neu starten';btn.onclick=startRun;}
      else if(btn) btn.style.display='none';
      if(barCounter) barCounter.textContent='Run #'+runCounter+' beendet';
      if(barCtrl&&canCtrl) barCtrl.innerHTML='<button class="btn btn-s btn-xs" onclick="startRun()">▶ Neu starten</button><button class="btn btn-g btn-xs" onclick="newRun()" style="margin-left:5px">⟳ Reset</button>';
      else if(barCtrl) barCtrl.innerHTML='';
    }
  }
}
function fmtElapsed(sec){
  return String(Math.floor(sec/3600)).padStart(2,'0')+':'+String(Math.floor((sec%3600)/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
}
function startRunTimer(){
  stopRunTimer();
  if(!runStartedAt)return;
  function tick(){
    const el=document.getElementById('run-timer');
    if(!el||runStatus!=='active'){stopRunTimer();return;}
    const sec=runElapsed+Math.floor((Date.now()-runStartedAt)/1000);
    el.textContent=fmtElapsed(sec);
  }
  tick();_timerInterval=setInterval(tick,1000);
}
function stopRunTimer(){clearInterval(_timerInterval);_timerInterval=null;}

function escHtml(s){return String(s??'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));}
function fmtSecShort(sec){
  sec=Math.max(0,parseInt(sec)||0);
  return String(Math.floor(sec/3600)).padStart(2,'0')+':'+String(Math.floor((sec%3600)/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0');
}
const RH_I18N = {
  de: {
    title:'Run Verlauf', runs1:'Run', runsN:'Runs', events:'Events', start:'Start', end:'Ende', running:'laufend',
    noHistory:'Noch kein Run-Verlauf vorhanden.', noEvents:'Keine Ereignisse.', unknown:'unbekannt',
    runStarted:'Run gestartet.', runResumed:'Run fortgesetzt.', runPaused:'Run pausiert.', runReset:'Run zurückgesetzt / beendet.',
    teamFights:'Das Team bekämpft Arenaleiter', teamWins:'Das Team besiegt Arenaleiter',
    route:'Route', teamSlot:'Team Slot', box:'Box', caught:'fing auf', linkOk:'Link auf', linkOk2:'zustande gekommen',
    linkFail:'Kein Link auf', linkFail2:'hat nicht gefangen', manualLink:'Manueller Link',
    died:'ist gestorben', linkDied:'Link', trigger:'Auslöser',
    exportTitle:'SoulLink Run Verlauf', exportAt:'Export', imgErr:'Bild-Export fehlgeschlagen.'
  },
  en: {
    title:'Run History', runs1:'Run', runsN:'Runs', events:'Events', start:'Start', end:'End', running:'ongoing',
    noHistory:'No run history yet.', noEvents:'No events.', unknown:'unknown',
    runStarted:'Run started.', runResumed:'Run resumed.', runPaused:'Run paused.', runReset:'Run reset / ended.',
    teamFights:'The team starts battling Gym Leader', teamWins:'The team defeated Gym Leader',
    route:'Route', teamSlot:'Team Slot', box:'Box', caught:'caught on', linkOk:'Link on', linkOk2:'was established',
    linkFail:'No link on', linkFail2:'did not catch', manualLink:'Manual link',
    died:'fainted', linkDied:'Link', trigger:'Trigger',
    exportTitle:'SoulLink Run History', exportAt:'Export', imgErr:'Image export failed.'
  }
};
function getRunHistoryLang(){ return document.getElementById('rh-lang')?.value || 'de'; }
function rhT(k){ const l=getRunHistoryLang(); return RH_I18N[l]?.[k] || RH_I18N.de[k] || k; }
function rhLocale(){ return getRunHistoryLang()==='en' ? 'en-US' : 'de-DE'; }
function routeLabelById(routeId,lang=getRunHistoryLang()){
  if(routeId==='__starter__') return lang==='en' ? 'Starter' : 'Starter';
  const loc=routeData.find(r=>r.id===routeId);
  if(loc){
    if(lang==='de'){
      const de=_routeDeNames.get(loc.id);
      return de || loc.name;
    }
    return loc.name;
  }
  return String(routeId||'').replace(/-/g,' ');
}
function badgeNameById(badgeId){
  const badges=getBadgesForEdition(selectedEdition)||[];
  const b=badges.find(x=>x.id===badgeId);
  return b?.name||badgeId||'Arena';
}
function playerLabel(pi){return `P${(pi??0)+1} (${getPN(pi??0)})`;}
function pokeLabel(pk,lang=getRunHistoryLang()){
  if(!pk) return rhT('unknown');
  const baseName = pk.nickname
    ? pk.nickname
    : (lang==='de' && pk.pokeId && _deNames?.has(pk.pokeId))
      ? _deNames.get(pk.pokeId)
      : (pk.name || (pk.pokeId ? `#${pk.pokeId}` : rhT('unknown')));
  return baseName+(pk.shiny?' ✨':'')+(pk.missed?(lang==='de'?' (nicht gef.)':' (not caught)'):'');
}
function locLabel(loc,lang=getRunHistoryLang()){
  if(!loc) return rhT('unknown');
  if(loc.type==='team') return `${rhT('teamSlot')} ${((loc.slotIndex||0)+1)}`;
  if(loc.type==='box') return `${rhT('box')} ${((loc.box||0)+1)} [${((loc.slot||0)+1)}]`;
  if(loc.type==='route') return `${rhT('route')} ${routeLabelById(loc.routeId,lang)}`;
  return loc.type||rhT('unknown');
}
function runEventVisual(type){
  switch(type){
    case 'route-catch': return {icon:'🎯',cls:'rh-type-catch'};
    case 'route-link-created':
    case 'manual-link-created':
    case 'link-team-swapped': return {icon:'🔗',cls:'rh-type-link'};
    case 'route-link-failed': return {icon:'❌',cls:'rh-type-fail'};
    case 'gym-started':
    case 'gym-defeated': return {icon:'🏟️',cls:'rh-type-gym'};
    case 'pokemon-died':
    case 'link-died': return {icon:'💀',cls:'rh-type-death'};
    case 'run-started':
    case 'run-resumed':
    case 'run-paused':
    case 'run-reset': return {icon:'⏱️',cls:'rh-type-run'};
    default: return {icon:'•',cls:'rh-type-run'};
  }
}
function runEventText(evt,lang=getRunHistoryLang()){
  const d=evt?.details||{};
  switch(evt?.type){
    case 'run-started': return rhT('runStarted');
    case 'run-resumed': return rhT('runResumed');
    case 'run-paused': return rhT('runPaused');
    case 'run-reset': return rhT('runReset');
    case 'route-catch':
      return lang==='de'
        ? `${playerLabel(d.playerIndex)} ${rhT('caught')} ${routeLabelById(d.routeId,lang)}: ${pokeLabel(d.pokemon,lang)}.`
        : `${playerLabel(d.playerIndex)} ${rhT('caught')} ${routeLabelById(d.routeId,lang)}: ${pokeLabel(d.pokemon,lang)}.`;
    case 'route-link-created': {
      const parts=(d.players||[]).map(p=>`${playerLabel(p.playerIndex)}: ${pokeLabel(p.pokemon,lang)}`).join(' ⟷ ');
      return `${rhT('linkOk')} ${routeLabelById(d.routeId,lang)} ${rhT('linkOk2')}${parts?` (${parts})`:''}.`;
    }
    case 'manual-link-created': {
      const parts=(d.slots||[]).map(p=>`${playerLabel(p.playerIndex)}: ${pokeLabel(p.pokemon,lang)}`).join(' ⟷ ');
      return `${rhT('manualLink')} #${d.linkId||'?'}${lang==='de'?' erstellt':' created'}${parts?` (${parts})`:''}.`;
    }
    case 'link-team-swapped': {
      const chunks=(d.changes||[]).map(c=>{
        const inName=pokeLabel(c.incoming,lang);
        const oldName=c.replaced?.pokeId?pokeLabel(c.replaced,lang):(lang==='de'?'leer':'empty');
        return `${playerLabel(c.playerIndex)}: ${oldName} → ${inName}`;
      }).join(' | ');
      return lang==='de'
        ? `Link #${d.linkId||'?'} Team-Wechsel auf Slot ${(d.targetSlotIndex??0)+1}${chunks?` (${chunks})`:''}.`
        : `Link #${d.linkId||'?'} team swap on slot ${(d.targetSlotIndex??0)+1}${chunks?` (${chunks})`:''}.`;
    }
    case 'route-link-failed': {
      const by=playerLabel(d.failedByPlayerIndex);
      const details=(d.players||[]).map(p=>`${playerLabel(p.playerIndex)}: ${pokeLabel(p.pokemon,lang)}`).join(' | ');
      return `${rhT('linkFail')} ${routeLabelById(d.routeId,lang)}: ${by} ${rhT('linkFail2')}.${details?` (${details})`:''}`;
    }
    case 'gym-started':
      return `${rhT('teamFights')} (${badgeNameById(d.badgeId)}).`;
    case 'gym-defeated':
      return `${rhT('teamWins')} (${badgeNameById(d.badgeId)}).`;
    case 'pokemon-died':
      return `${playerLabel(d.playerIndex)}: ${pokeLabel(d.pokemon,lang)} ${rhT('died')} (${locLabel(d.location,lang)}).`;
    case 'link-died': {
      const culprit=d.culprit
        ? `${playerLabel(d.culprit.playerIndex)} ${lang==='de'?'mit':'with'} ${(d.culprit.nickname||d.culprit.name||'#'+(d.culprit.pokeId||'?'))}`
        : rhT('unknown');
      const triggerLoc=locLabel(d.trigger?.location,lang);
      return `${rhT('linkDied')} #${d.linkId||'?'} ${lang==='de'?'gestorben':'fainted'}. ${rhT('trigger')}: ${culprit} (${triggerLoc}).`;
    }
    default:
      return evt?.type ? `[${evt.type}]` : (lang==='de'?'Unbekanntes Ereignis':'Unknown event');
  }
}
function renderTeamSnapshot(snapshot, playerIndex, lang) {
  if (!Array.isArray(snapshot)) return '';
  const team = snapshot[playerIndex] || [];
  // Always render 6 slots
  const slots = Array.from({ length: 6 }, (_, idx) => {
    const pk = team[idx];
    if (!pk || !pk.pokeId) {
      return `<div class="rh-snap-slot rh-snap-slot-empty" title="leer"><div style="font-size:.6rem;color:var(--txd)">–</div></div>`;
    }
    const baseName = pk.nickname
      ? pk.nickname
      : (lang === 'de' && pk.pokeId && _deNames?.has(pk.pokeId))
        ? _deNames.get(pk.pokeId)
        : (pk.name || `#${pk.pokeId}`);
    const sprUrl = spr(pk.pokeId, pk.shiny);
    return `<div class="rh-snap-slot" title="${escHtml(baseName)}">
      <img src="${sprUrl}" class="rh-snap-sprite" loading="lazy" alt="${escHtml(baseName)}">
      <div class="rh-snap-name">${escHtml(baseName)}${pk.shiny ? '✨' : ''}</div>
    </div>`;
  }).join('');
  return `<div class="rh-team-snapshot">${slots}</div>`;
}

function renderSwapSnapshots(evt, lang) {
  if (evt.type !== 'link-team-swapped') return '';
  const d = evt.details || {};
  if (!d.teamsBeforeSnapshot || !d.teamsAfterSnapshot) {
    return '';
  }
  const playerIndices = new Set();
  (d.changes || []).forEach(c => playerIndices.add(c.playerIndex));
  if (playerIndices.size === 0) return '';
  
  const playerList = Array.from(playerIndices).sort((a, b) => a - b);
  const snapId = `snap-${Date.now()}-${Math.random().toString(36).slice(2,6)}`;
  
  // Vorher - alle Spieler nebeneinander
  const beforeRow = playerList.map(pi => `
    <div class="rh-snap-player-col">
      <div class="rh-snap-player-label">${playerLabel(pi)}</div>
      ${renderTeamSnapshot(d.teamsBeforeSnapshot, pi, lang)}
    </div>
  `).join('');
  
  // Nachher - alle Spieler nebeneinander
  const afterRow = playerList.map(pi => `
    <div class="rh-snap-player-col">
      <div class="rh-snap-player-label">${playerLabel(pi)}</div>
      ${renderTeamSnapshot(d.teamsAfterSnapshot, pi, lang)}
    </div>
  `).join('');
  
  return `<div class="rh-snapshots" data-snap-id="${snapId}">
    <div class="rh-snap-toggle" onclick="toggleSnapshots('${snapId}')">▸ Teams</div>
    <div class="rh-snap-content" style="display:none">
      <div class="rh-snap-section">
        <div class="rh-snap-title">${lang === 'de' ? 'Vorher' : 'Before'}:</div>
        <div class="rh-snap-row">${beforeRow}</div>
      </div>
      <div class="rh-snap-section">
        <div class="rh-snap-title">${lang === 'de' ? 'Nachher' : 'After'}:</div>
        <div class="rh-snap-row">${afterRow}</div>
      </div>
    </div>
  </div>`;
}
function toggleSnapshots(snapId) {
  const snapshots = document.querySelector(`[data-snap-id="${snapId}"]`);
  if (!snapshots) return;
  const content = snapshots.querySelector('.rh-snap-content');
  const toggle = snapshots.querySelector('.rh-snap-toggle');
  if (!content || !toggle) return;
  const isHidden = content.style.display === 'none';
  content.style.display = isHidden ? 'flex' : 'none';
  toggle.textContent = isHidden ? '▾ Teams' : '▸ Teams';
}
function toggleRunHistory(runNumber){
  if(runNumber==null) return;
  if(collapsedRunHistory.has(runNumber)) collapsedRunHistory.delete(runNumber);
  else collapsedRunHistory.add(runNumber);
  renderRunHistory();
}
function renderRunHistory(){
  const list=document.getElementById('rh-list');
  const meta=document.getElementById('rh-meta');
  const title=document.getElementById('rh-title');
  if(!list||!meta) return;
  const lang=getRunHistoryLang();
  if(lang==='de' && !_deNames){
    loadGermanNames().then(()=>{ if(document.getElementById('page-run-history')?.classList.contains('active')) renderRunHistory(); }).catch(()=>{});
  }
  if(title) title.textContent=rhT('title');
  const runs=[...(Array.isArray(runHistory)?runHistory:[])].sort((a,b)=>(a.runNumber||0)-(b.runNumber||0));
  meta.textContent=`${runs.length} ${runs.length===1?rhT('runs1'):rhT('runsN')}`;
  if(!runs.length){list.innerHTML=`<div class="rh-empty">${escHtml(rhT('noHistory'))}</div>`;return;}
  list.innerHTML='';
  runs.forEach(r=>{
    const runDiv=document.createElement('div');runDiv.className='rh-run';
    const events=[...(r.events||[])].sort((a,b)=>(a.at||0)-(b.at||0));
    const startTxt=r.startedAt?new Date(r.startedAt).toLocaleString(rhLocale()):'–';
    const endTxt=r.endedAt?new Date(r.endedAt).toLocaleString(rhLocale()):rhT('running');
    const collapsed=collapsedRunHistory.has(r.runNumber);
    runDiv.innerHTML=`<div class="rh-run-h" onclick="toggleRunHistory(${r.runNumber||0})"><b>Run #${r.runNumber||'?'}</b><span>${rhT('start')}: ${startTxt}</span><span>•</span><span>${rhT('end')}: ${endTxt}</span><span>${events.length} ${rhT('events')}</span><span class="rh-toggle">${collapsed?'▸':'▾'}</span></div>`;
    const evWrap=document.createElement('div');evWrap.className='rh-events';
    if(collapsed) evWrap.classList.add('collapsed');
    if(!events.length){
      evWrap.innerHTML=`<div class="rh-empty" style="padding:8px">${escHtml(rhT('noEvents'))}</div>`;
    } else {
      events.forEach(evt=>{
        const row=document.createElement('div');row.className='rh-evt';
        const ts=fmtSecShort(evt.elapsedSec||0);
        const vis=runEventVisual(evt?.type);
        
        // Create inner grid container
        const innerDiv = document.createElement('div');
        innerDiv.className = 'rh-evt-inner';
        
        // Create time cell
        const timeDiv = document.createElement('div');
        timeDiv.className = 'rh-time';
        timeDiv.textContent = ts;
        
        // Create node cell
        const nodeDiv = document.createElement('div');
        nodeDiv.className = 'rh-node';
        nodeDiv.innerHTML = `<div class="rh-line"></div><div class="rh-dot ${vis.cls}">${vis.icon}</div>`;
        
        // Create text cell
        const textDiv = document.createElement('div');
        textDiv.className = 'rh-text';
        const textContent = document.createElement('span');
        textContent.textContent = runEventText(evt, lang);
        textDiv.appendChild(textContent);
        
        innerDiv.appendChild(timeDiv);
        innerDiv.appendChild(nodeDiv);
        innerDiv.appendChild(textDiv);
        
        // Add snapshots inside text div
        const snapshots = evt.type === 'link-team-swapped' ? renderSwapSnapshots(evt, lang) : '';
        if (snapshots) {
          const snapshotDiv = document.createElement('div');
          snapshotDiv.innerHTML = snapshots;
          textDiv.appendChild(snapshotDiv);
        }
        
        row.appendChild(innerDiv);
        
        evWrap.appendChild(row);
      });
    }
    runDiv.appendChild(evWrap);
    list.appendChild(runDiv);
  });
}
function buildRunHistoryText(){
  const lang=getRunHistoryLang();
  const runs=[...(Array.isArray(runHistory)?runHistory:[])].sort((a,b)=>(a.runNumber||0)-(b.runNumber||0));
  const lines=[rhT('exportTitle'),`${rhT('exportAt')}: ${new Date().toLocaleString(rhLocale())}`,''];
  runs.forEach(r=>{
    lines.push(`Run #${r.runNumber||'?'}`);
    lines.push(`${rhT('start')}: ${r.startedAt?new Date(r.startedAt).toLocaleString(rhLocale()):'-'}`);
    lines.push(`${rhT('end')}: ${r.endedAt?new Date(r.endedAt).toLocaleString(rhLocale()):rhT('running')}`);
    const events=[...(r.events||[])].sort((a,b)=>(a.at||0)-(b.at||0));
    if(!events.length) lines.push(`  - ${rhT('noEvents')}`);
    events.forEach(evt=>lines.push(`  [${fmtSecShort(evt.elapsedSec||0)}] ${runEventText(evt,lang)}`));
    lines.push('');
  });
  if(!runs.length) lines.push(rhT('noHistory'));
  return lines.join('\n');
}
function downloadBlob(filename,mime,content){
  const blob=new Blob([content],{type:mime});
  const url=URL.createObjectURL(blob);
  const a=document.createElement('a');
  a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();
  setTimeout(()=>URL.revokeObjectURL(url),500);
}
function downloadRunHistoryText(){
  downloadBlob(`run-verlauf-${myPP||'run'}.txt`,'text/plain;charset=utf-8',buildRunHistoryText());
}
function downloadRunHistoryJson(){
  downloadBlob(`run-verlauf-${myPP||'run'}.json`,'application/json;charset=utf-8',JSON.stringify(runHistory||[],null,2));
}
async function ensureHtml2Canvas(){
  if(window.html2canvas) return window.html2canvas;
  await new Promise((resolve,reject)=>{
    const s=document.createElement('script');
    s.src='https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js';
    s.onload=resolve;
    s.onerror=reject;
    document.head.appendChild(s);
  });
  return window.html2canvas;
}
async function downloadRunHistoryImage(){
  const wrap=document.getElementById('rh-wrap');
  if(!wrap) return;
  try{
    // Expand all snapshots before export
    const allSnapshots = wrap.querySelectorAll('[data-snap-id] .rh-snap-content');
    const originalStates = Array.from(allSnapshots).map(el => el.style.display);
    allSnapshots.forEach((el, idx) => {
      el.style.display = 'flex';
      const toggle = el.closest('[data-snap-id]')?.querySelector('.rh-snap-toggle');
      if (toggle) toggle.textContent = '▾ Teams';
    });
    
    const html2canvas=await ensureHtml2Canvas();
    const canvas=await html2canvas(wrap,{
      backgroundColor:getComputedStyle(document.body).backgroundColor||'#0b0b11',
      scale:2,
      useCORS:true,
      width:wrap.scrollWidth,
      height:wrap.scrollHeight,
      onclone:(doc)=>{
        const el=doc.getElementById('rh-wrap');
        if(el){
          el.style.overflow='visible';
          el.style.maxHeight='none';
          el.style.height='auto';
        }
      }
    });
    canvas.toBlob((blob)=>{
      // Restore original states
      allSnapshots.forEach((el, idx) => {
        el.style.display = originalStates[idx];
        const toggle = el.closest('[data-snap-id]')?.querySelector('.rh-snap-toggle');
        if (toggle) toggle.textContent = originalStates[idx] === 'none' ? '▸ Teams' : '▾ Teams';
      });
      
      if(!blob){toast(rhT('imgErr'),1);return;}
      const url=URL.createObjectURL(blob);
      const a=document.createElement('a');
      a.href=url;
      a.download=`run-verlauf-${myPP||'run'}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(()=>URL.revokeObjectURL(url),600);
    },'image/png');
  }catch(e){
    toast(rhT('imgErr'),1);
  }
}

// ═══════════════════════════════════════════════
// RULES TAB
// ═══════════════════════════════════════════════
function parseRulesBundle(raw){
  const text=String(raw??'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const trimEnd=(s)=>String(s??'').replace(/\n+$/,'');

  const mdMatch=text.match(/^#\s*Regeln\s*\n+([\s\S]*?)\n+---\n+#\s*Trainer\s*Caps\s*\n+([\s\S]*)$/i)
    || text.match(/^#\s*Regeln\s*\n+([\s\S]*?)\n+#\s*Trainer\s*Caps\s*\n+([\s\S]*)$/i);
  if(mdMatch){
    return {rules:trimEnd(mdMatch[1]),caps:trimEnd(mdMatch[2]),split:true};
  }

  const txtMatch=text.match(/^={3,}\s*Regeln\s*={3,}\n+([\s\S]*?)\n+={3,}\s*Trainer\s*Caps\s*={3,}\n+([\s\S]*)$/i);
  if(txtMatch){
    return {rules:trimEnd(txtMatch[1]),caps:trimEnd(txtMatch[2]),split:true};
  }

  const lines=text.split('\n');
  const key=(line)=>line.trim().toLowerCase()
    .replace(/^[#=\-\[\]\s:]+|[#=\-\[\]\s:]+$/g,'')
    .replace(/\s+/g,'');
  let rulesHdr=-1, capsHdr=-1;
  for(let i=0;i<lines.length;i++){
    const k=key(lines[i]);
    if(k==='regeln'&&rulesHdr<0){rulesHdr=i;continue;}
    if((k==='trainercaps'||k==='trainercap')&&capsHdr<0){capsHdr=i;}
  }
  if(rulesHdr>=0&&capsHdr>=0){
    if(rulesHdr<capsHdr){
      return {rules:trimEnd(lines.slice(rulesHdr+1,capsHdr).join('\n')),caps:trimEnd(lines.slice(capsHdr+1).join('\n')),split:true};
    }
    return {rules:trimEnd(lines.slice(rulesHdr+1).join('\n')),caps:trimEnd(lines.slice(capsHdr+1,rulesHdr).join('\n')),split:true};
  }

  return {rules:trimEnd(text),caps:'',split:false};
}
function buildRulesBundle(ext){
  const r=String(rulesText||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  const c=String(trainerCapsText||'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  if(ext==='md'){
    return `# Regeln\n\n${r}\n\n---\n\n# Trainer Caps\n\n${c}\n`;
  }
  return `=== REGELN ===\n\n${r}\n\n=== TRAINER CAPS ===\n\n${c}\n`;
}
function ensureRulesBindings(){
  const editor=document.getElementById('rules-editor');
  const trainerCapsEditor=document.getElementById('trainer-caps-editor');
  const titleInput=document.getElementById('rules-title');
  const importInput=document.getElementById('rules-import-input');
  if(editor&&!editor._bound){
    editor._bound=true;
    editor.addEventListener('input',()=>{
      if(_rulesIgnoreInput) return;
      rulesText=editor.value;
      queueRulesBroadcast();
    });
  }
  if(titleInput&&!titleInput._bound){
    titleInput._bound=true;
    titleInput.addEventListener('input',()=>{
      if(_rulesIgnoreInput) return;
      rulesTitle=titleInput.value;
      queueRulesBroadcast();
    });
  }
  if(trainerCapsEditor&&!trainerCapsEditor._bound){
    trainerCapsEditor._bound=true;
    trainerCapsEditor.addEventListener('input',()=>{
      if(_rulesIgnoreInput) return;
      trainerCapsText=trainerCapsEditor.value;
      queueRulesBroadcast();
    });
  }
  if(importInput&&!importInput._bound){
    importInput._bound=true;
    importInput.addEventListener('change', async (e)=>{
      const f=e.target.files?.[0];
      if(!f) return;
      try{
        const txt=await f.text();
        const parsed=parseRulesBundle(txt);
        rulesText=parsed.rules||'';
        trainerCapsText=parsed.caps||'';
        if(!rulesTitle){
          const base=(f.name||'').replace(/\.(md|txt)$/i,'').trim();
          if(base) rulesTitle=base;
        }
        pushRulesToUI();
        queueRulesBroadcast(true);
        toast(parsed.split?'Regeln + Trainer Caps importiert':'Regeln importiert');
      }catch(_){ toast('Import fehlgeschlagen',1); }
      e.target.value='';
    });
  }
}
function pushRulesToUI(){
  ensureRulesBindings();
  const editor=document.getElementById('rules-editor');
  const trainerCapsEditor=document.getElementById('trainer-caps-editor');
  const titleInput=document.getElementById('rules-title');
  _rulesIgnoreInput=true;
  if(editor&&editor.value!==rulesText) editor.value=rulesText||'';
  if(trainerCapsEditor&&trainerCapsEditor.value!==trainerCapsText) trainerCapsEditor.value=trainerCapsText||'';
  if(titleInput&&titleInput.value!==rulesTitle) titleInput.value=rulesTitle||'';
  _rulesIgnoreInput=false;
  if(editor){
    editor.disabled=!!myReadonly;
    editor.style.opacity=myReadonly?'.8':'1';
  }
  if(trainerCapsEditor){
    trainerCapsEditor.disabled=!!myReadonly;
    trainerCapsEditor.style.opacity=myReadonly?'.8':'1';
  }
  if(titleInput){
    titleInput.disabled=!!myReadonly;
    titleInput.style.opacity=myReadonly?'.8':'1';
  }
}
function queueRulesBroadcast(immediate=false){
  if(!socket||!socket.connected||myReadonly) return;
  const send=()=>socket.emit('set-rules-content',{text:rulesText||'',title:rulesTitle||'',rulesetId:Number.isInteger(rulesetId)?rulesetId:null,trainerCapsText:trainerCapsText||''});
  clearTimeout(_rulesDebounce);
  if(immediate){ send(); return; }
  _rulesDebounce=setTimeout(send,180);
}
async function loadRulesets(){
  try{
    const r=await fetch('/api/rulesets');
    const d=await r.json();
    rulesets=Array.isArray(d)?d:[];
  }catch(_){ rulesets=[]; }
  renderRulesetList();
}
function renderRulesetList(){
  const list=document.getElementById('ruleset-list');
  if(!list) return;
  if(!rulesets.length){list.innerHTML='<div class="rh-empty">Keine Regelsets vorhanden.</div>';return;}
  list.innerHTML=rulesets.map(rs=>{
    const active=(rulesetId&&rs.id===rulesetId)?' active':'';
    const dt=rs.updated_at?new Date(rs.updated_at*1000).toLocaleString('de-DE'):'';
    return `<div class="rl-item${active}" onclick="applyRuleset(${rs.id})"><div class="rl-item-main"><div class="rl-item-name">${escHtml(rs.name)}</div><div class="rl-item-meta">${escHtml(dt)}</div></div><button class="rl-item-del" onclick="deleteRuleset(event,${rs.id})" title="Regelset löschen">Löschen</button></div>`;
  }).join('');
}
async function applyRuleset(id){
  if(myReadonly){toast('Nur Spieler können importieren',1);return;}
  if(!id) return;
  try{
    const r=await fetch('/api/rulesets/'+encodeURIComponent(id));
    const d=await r.json();
    if(!r.ok){toast(d.error||'Ruleset nicht gefunden',1);return;}
    const parsed=parseRulesBundle(String(d.content||''));
    rulesText=parsed.rules||'';
    trainerCapsText=parsed.caps||'';
    rulesTitle=String(d.name||'');
    rulesetId=d.id||null;
    pushRulesToUI();
    queueRulesBroadcast(true);
    renderRulesetList();
    toast('Regelset importiert');
  }catch(_){toast('Laden fehlgeschlagen',1);}
}
async function saveRulesetPrompt(){
  if(myReadonly){toast('Nur Spieler können speichern',1);return;}
  const def=(rulesTitle||'').trim();
  const name=prompt('Regelset-Name:',def);
  if(name===null) return;
  const clean=String(name).trim();
  if(!clean){toast('Name erforderlich',1);return;}
  try{
    const r=await fetch('/api/rulesets',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:clean,content:buildRulesBundle('md')})});
    const d=await r.json();
    if(!r.ok){toast(d.error||'Speichern fehlgeschlagen',1);return;}
    rulesTitle=d.name||clean;
    rulesetId=d.id||null;
    pushRulesToUI();
    queueRulesBroadcast(true);
    await loadRulesets();
    toast('Regelset gespeichert');
  }catch(_){toast('Verbindungsfehler',1);}
}
async function deleteRuleset(ev,id){
  ev?.stopPropagation?.();
  if(myReadonly){toast('Nur Spieler können löschen',1);return;}
  if(!id) return;
  const rs=rulesets.find(x=>x.id===id);
  const name=rs?.name||`#${id}`;
  if(!confirm(`Regelset "${name}" wirklich löschen?`)) return;
  try{
    const r=await fetch('/api/rulesets/'+encodeURIComponent(id),{method:'DELETE'});
    const d=await r.json().catch(()=>({}));
    if(!r.ok){toast(d.error||'Löschen fehlgeschlagen',1);return;}
    if(rulesetId===id){
      rulesetId=null;
      queueRulesBroadcast(true);
    }
    await loadRulesets();
    toast('Regelset gelöscht');
  }catch(_){toast('Verbindungsfehler',1);}
}
function triggerRulesImport(){
  if(myReadonly){toast('Nur Spieler können importieren',1);return;}
  const input=document.getElementById('rules-import-input');
  if(input) input.click();
}
function downloadRulesFile(ext){
  const txt=buildRulesBundle(ext);
  const base=((rulesTitle||'regeln').trim()||'regeln').replace(/[^\w\-äöüÄÖÜß]+/g,'_');
  const mime=ext==='md'?'text/markdown;charset=utf-8':'text/plain;charset=utf-8';
  downloadBlob(`${base}.${ext}`,mime,txt);
}
function renderRulesTab(){
  pushRulesToUI();
  if(!Array.isArray(rulesets)||!rulesets.length) loadRulesets();
  else renderRulesetList();
}

function dlog(msg,t){
  t=t||'';
  const p=document.getElementById('dbgp'); if(!p)return;
  const d=document.createElement('div'); d.className='dl'+(t?' '+t:'');
  const ts=new Date().toLocaleTimeString();
  d.textContent=ts+' '+String(msg);
  p.appendChild(d);
  if(p.children.length>800)p.removeChild(p.children[0]);
  p.scrollTop=p.scrollHeight;
  // Broadcast to all peers in the run
  if(socket&&socket.connected&&myPP){
    try{socket.emit('debug-log',{msg:String(msg),t});}catch(_){}
  }
}

// ── Debug helpers ──────────────────────────────────────────────────────
function dbgPeerState(pid,lbl){
  const peer=peers.get(pid); if(!peer)return;
  const pc=peer.pc;
  const snd=pc.getSenders().map(s=>(s.track?s.track.kind:'null')+'('+(s.track?s.track.readyState:'-')+')').join(',');
  const rcv=pc.getReceivers().map(r=>(r.track?r.track.kind:'null')+'('+(r.track?r.track.readyState:'-')+')').join(',');
  const trx=pc.getTransceivers().map(tr=>tr.direction+'/'+(tr.currentDirection||'?')).join(',');
  dlog('[PC:'+(lbl||peer.name)+'] sig='+pc.signalingState+' ice='+pc.iceConnectionState+' conn='+pc.connectionState+' snd=['+snd+'] rcv=['+rcv+'] trx=['+trx+']','i');
}
function dbgAllPeers(lbl){
  dlog('-- '+(lbl||'peers')+' ('+peers.size+') myPI='+myPI+' sharing='+isSharing+' --','i');
  peers.forEach((peer,id)=>dbgPeerState(id,peer.name));
}
function dbgPerf(){
  try{const m=performance.memory;if(m)dlog('[MEM] used='+(m.usedJSHeapSize/1048576).toFixed(1)+'MB limit='+(m.jsHeapSizeLimit/1048576).toFixed(1)+'MB','i');}catch(_){}
}

// Catch tab-crashing errors and relay to all peers
window.onerror=function(msg,src,line,col,err){
  dlog('[CRASH] '+String(msg)+' @ '+(src||'?').split('/').pop()+':'+line+':'+col,'e');
  if(err&&err.stack)dlog('[STACK] '+err.stack.split('\n').slice(0,4).join(' | '),'e');
  return false;
};
window.onunhandledrejection=function(ev){
  const r=ev.reason;
  dlog('[PROMISE] '+(r&&r.message?r.message:String(r)),'e');
  if(r&&r.stack)dlog('[STACK] '+r.stack.split('\n').slice(0,3).join(' | '),'e');
};

// Periodic status every 30s
setInterval(function(){
  if(!socket||!document.getElementById('dbgp'))return;
  var conn=[...peers.values()].filter(function(p){return p.iceState==='connected'||p.iceState==='completed';}).length;
  dlog('[PING] peers='+peers.size+' iceDone='+conn+'/'+peers.size+' myPI='+myPI+' sharing='+isSharing,'i');
  dbgPerf();
  if(peers.size>0)dbgAllPeers('PING');
},30000);

function toggleBadgeBar(){
  const wrap=document.getElementById('badge-bar-wrap');
  const btn=document.getElementById('badge-toggle-btn');
  const open=wrap.classList.toggle('open');
  if(btn) btn.textContent=open?'Arenen ▴':'Arenen ▾';
}
function toggleDbg(){const p=document.getElementById('dbgp');p.classList.toggle('open');document.getElementById('dbgb').textContent=p.classList.contains('open')?'debug ▴':'debug ▾';}
function toast(msg,err=0){const t=document.getElementById('toast');t.textContent=msg;t.className=err?'te':'';t.classList.add('show');clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove('show'),3500);}
document.getElementById('ni')?.addEventListener('keydown',e=>{if(e.key!=='Enter')return;if(document.getElementById('login-join').style.display!=='none')joinRun();else createRun();});
document.getElementById('pp-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')joinRun();});
document.getElementById('run-name')?.addEventListener('keydown',e=>{if(e.key==='Enter')createRun();});
document.getElementById('join-password-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')joinRun();});
document.getElementById('create-password-input')?.addEventListener('keydown',e=>{if(e.key==='Enter')createRun();});
toggleCreateProtected(false);

// Load editions on page init
loadEditions();


// ═══════════════════════════════════════════════════════════
// POKEMON TYPE CHART
// ═══════════════════════════════════════════════════════════

const TYPES = ['normal','fire','water','grass','electric','ice','fighting','poison',
  'ground','flying','psychic','bug','rock','ghost','dragon','dark','steel','fairy'];

// Map edition slug → generation number
const EDITION_GEN = {
  'red-blue':1,'red':1,'blue':1,'yellow':1,
  'gold-silver':2,'crystal':2,
  'ruby-sapphire':3,'emerald':3,'firered-leafgreen':3,
  'diamond-pearl':4,'platinum':4,'heartgold-soulsilver':4,
  'black-white':5,'black-2-white-2':5,
  'x-y':6,'omega-ruby-alpha-sapphire':6,
  'sun-moon':7,'ultra-sun-ultra-moon':7,'lets-go-pikachu-lets-go-eevee':7,
  'sword-shield':8,'brilliant-diamond-and-shining-pearl':8,'legends-arceus':8,
  'scarlet-violet':9,
};

function getEditionGen(){
  if(!selectedEdition) return 9; // default to modern
  return EDITION_GEN[selectedEdition] || 9;
}

// Returns the active TYPES array for the current edition
function getActiveTypes(){
  const gen=getEditionGen();
  return TYPES.filter(t=>{
    if(t==='dark'||t==='steel') return gen>=2;
    if(t==='fairy') return gen>=6;
    return true;
  });
}

// Returns a gen-aware effectiveness lookup
// Key rule changes:
// Gen 1: ghost has NO effect on psychic (bug in Gen 1, we use Gen 2+ for ghost/psychic)
// Gen 1: no dark/steel types exist
// Gen 1-5: no fairy type; poison and steel don't interact with fairy
// Gen 2-5: ghost resists nothing special from dark (dark is not resisted by ghost)
// Gen 1-5: steel is not immune to poison (added in Gen 6? No — steel immune to poison since Gen 2)
// Exact changes:
//   Gen 1: ghost → psychic = 0 (glitch), dark/steel don't exist
//   Gen 2-5: ghost → dark = 0.5 (ghost resists dark)  ← this is gen 2+
//   Gen 2-5: dark → steel = 0.5 (dark resisted by steel) ← gen 2+
//   Gen 6+: fairy added; steel loses poison immunity (poison → steel was 0 until gen 6, then 0.5? No:
//     steel lost its ghost and dark resistances in gen 6, not poison. Poison was never effective on steel.
//     Actually in Gen 6: steel lost resistances to ghost and dark.
//   So Gen 2-5: steel resists ghost and dark
//   Gen 6+: steel does NOT resist ghost or dark

function buildGenTC(gen){
  const tc={};
  function s(atk,pairs){ pairs.forEach(([def,m])=>{ if(!tc[atk])tc[atk]={}; tc[atk][def]=m; }); }

  s('normal',  [['rock',.5],['steel',.5],['ghost',0]]);
  s('fire',    [['fire',.5],['water',.5],['rock',.5],['dragon',.5],['grass',2],['ice',2],['bug',2],['steel',2]]);
  s('water',   [['water',.5],['grass',.5],['dragon',.5],['fire',2],['ground',2],['rock',2]]);
  s('grass',   [['fire',.5],['grass',.5],['poison',.5],['flying',.5],['bug',.5],['steel',.5],['dragon',.5],['water',2],['ground',2],['rock',2]]);
  s('electric',[['grass',.5],['electric',.5],['dragon',.5],['ground',0],['water',2],['flying',2]]);
  s('ice',     [['water',.5],['ice',.5],['steel',.5],['fire',.5],['grass',2],['ground',2],['flying',2],['dragon',2]]);
  s('ground',  [['grass',.5],['bug',.5],['flying',0],['fire',2],['electric',2],['poison',2],['rock',2],['steel',2]]);
  s('flying',  [['electric',.5],['rock',.5],['steel',.5],['ground',2],['grass',2],['fighting',2],['bug',2]]);
  s('psychic', [['psychic',.5],['steel',.5],['dark',0],['fighting',2],['poison',2]]);
  s('bug',     [['fire',.5],['fighting',.5],['flying',.5],['ghost',.5],['steel',.5],['grass',2],['psychic',2],['dark',2]]);
  s('rock',    [['fighting',.5],['ground',.5],['steel',.5],['fire',2],['ice',2],['flying',2],['bug',2]]);
  s('dragon',  [['steel',.5],['dragon',2]]);

  if(gen===1){
    // Gen 1: no dark/steel; ghost → psychic has no effect (the famous glitch)
    s('ghost',   [['normal',0],['ghost',2]]);
    // psychic has no dark immunity in gen 1 (dark doesn't exist)
    // psychic only resists psychic, effective against fighting/poison
    s('fighting',[['poison',.5],['flying',.5],['psychic',.5],['bug',.5],['ghost',0],['normal',2],['ice',2],['rock',2]]);
    s('poison',  [['poison',.5],['ground',.5],['rock',.5],['ghost',.5],['grass',2]]);
    s('bug',     [['fire',.5],['fighting',.5],['flying',.5],['ghost',.5],['grass',2],['psychic',2]]);
  } else if(gen<=5){
    // Gen 2-5: dark and steel exist, no fairy
    s('ghost',   [['dark',.5],['normal',0],['ghost',2],['psychic',2]]);
    s('dragon',  [['steel',.5],['dragon',2]]); // no fairy immunity yet
    s('dark',    [['fighting',.5],['dark',.5],['steel',.5],['psychic',2],['ghost',2]]);
    // steel resists ghost and dark in gen 2-5
    s('steel',   [['steel',.5],['fire',.5],['water',.5],['electric',.5],['ghost',.5],['dark',.5],['ice',2],['rock',2]]);
    s('fighting',[['poison',.5],['flying',.5],['psychic',.5],['bug',.5],['ghost',0],['normal',2],['ice',2],['rock',2],['dark',2],['steel',2]]);
    s('poison',  [['poison',.5],['ground',.5],['rock',.5],['ghost',.5],['steel',0],['grass',2]]);
    s('bug',     [['fire',.5],['fighting',.5],['flying',.5],['ghost',.5],['steel',.5],['grass',2],['psychic',2],['dark',2]]);
  } else {
    // Gen 6+: fairy added; steel loses ghost and dark resistances
    s('ghost',   [['dark',.5],['normal',0],['ghost',2],['psychic',2]]);
    s('dragon',  [['steel',.5],['fairy',0],['dragon',2]]);
    s('dark',    [['fighting',.5],['dark',.5],['fairy',.5],['psychic',2],['ghost',2]]);
    s('steel',   [['steel',.5],['fire',.5],['water',.5],['electric',.5],['ice',2],['rock',2],['fairy',2]]);
    s('fairy',   [['fire',.5],['poison',.5],['steel',.5],['fighting',2],['dragon',2],['dark',2]]);
    s('fighting',[['poison',.5],['flying',.5],['psychic',.5],['bug',.5],['fairy',.5],['ghost',0],['normal',2],['ice',2],['rock',2],['dark',2],['steel',2]]);
    s('poison',  [['poison',.5],['ground',.5],['rock',.5],['ghost',.5],['steel',0],['grass',2],['fairy',2]]);
    s('bug',     [['fire',.5],['fighting',.5],['flying',.5],['ghost',.5],['steel',.5],['fairy',.5],['grass',2],['psychic',2],['dark',2]]);
  }
  return tc;
}

// Gen-aware type effectiveness
function typeEffGen(atk, def, genTC){
  return (genTC[atk]?.[def]) ?? 1;
}
function combinedEffGen(atk, defTypes, genTC){
  return defTypes.reduce((m,t)=>m*typeEffGen(atk,t,genTC),1);
}

const TYPE_COLORS = {
  normal:{bg:'#A8A878',text:'#fff'}, fire:{bg:'#F08030',text:'#fff'},
  water:{bg:'#6890F0',text:'#fff'}, grass:{bg:'#78C850',text:'#fff'},
  electric:{bg:'#F8D030',text:'#333'}, ice:{bg:'#98D8D8',text:'#333'},
  fighting:{bg:'#C03028',text:'#fff'}, poison:{bg:'#A040A0',text:'#fff'},
  ground:{bg:'#E0C068',text:'#333'}, flying:{bg:'#A890F0',text:'#fff'},
  psychic:{bg:'#F85888',text:'#fff'}, bug:{bg:'#A8B820',text:'#fff'},
  rock:{bg:'#B8A038',text:'#fff'}, ghost:{bg:'#705898',text:'#fff'},
  dragon:{bg:'#7038F8',text:'#fff'}, dark:{bg:'#705848',text:'#fff'},
  steel:{bg:'#B8B8D0',text:'#333'}, fairy:{bg:'#EE99AC',text:'#333'},
};

function typeBadge(t, small=false){
  const c=TYPE_COLORS[t]||{bg:'#888',text:'#fff'};
  const sz=small?'font-size:.55rem;padding:1px 5px;border-radius:3px':'font-size:.65rem;padding:2px 8px;border-radius:4px';
  return `<span style="background:${c.bg};color:${c.text};${sz};font-weight:700;font-family:Syne,sans-serif;white-space:nowrap;display:inline-block">${t}</span>`;
}

// TYPE_CHART[attacker][defender] = multiplier
// Rows = attacker type, Cols = defender type
const TC = {};
function setTC(atk, pairs){ pairs.forEach(([def,m])=>{ if(!TC[atk])TC[atk]={}; TC[atk][def]=m; }); }

setTC('normal',  [['rock',.5],['steel',.5],['ghost',0]]);
setTC('fire',    [['fire',.5],['water',.5],['rock',.5],['dragon',.5],['grass',2],['ice',2],['bug',2],['steel',2]]);
setTC('water',   [['water',.5],['grass',.5],['dragon',.5],['fire',2],['ground',2],['rock',2]]);
setTC('grass',   [['fire',.5],['grass',.5],['poison',.5],['flying',.5],['bug',.5],['steel',.5],['dragon',.5],['water',2],['ground',2],['rock',2]]);
setTC('electric',[['grass',.5],['electric',.5],['dragon',.5],['ground',0],['water',2],['flying',2]]);
setTC('ice',     [['water',.5],['ice',.5],['steel',.5],['fire',.5],['grass',2],['ground',2],['flying',2],['dragon',2]]);
setTC('fighting',[['poison',.5],['flying',.5],['psychic',.5],['bug',.5],['fairy',.5],['ghost',0],['normal',2],['ice',2],['rock',2],['dark',2],['steel',2]]);
setTC('poison',  [['poison',.5],['ground',.5],['rock',.5],['ghost',.5],['steel',0],['grass',2],['fairy',2]]);
setTC('ground',  [['grass',.5],['bug',.5],['flying',0],['fire',2],['electric',2],['poison',2],['rock',2],['steel',2]]);
setTC('flying',  [['electric',.5],['rock',.5],['steel',.5],['ground',2],['grass',2],['fighting',2],['bug',2]]);
setTC('psychic', [['psychic',.5],['steel',.5],['dark',0],['fighting',2],['poison',2]]);
setTC('bug',     [['fire',.5],['fighting',.5],['flying',.5],['ghost',.5],['steel',.5],['fairy',.5],['grass',2],['psychic',2],['dark',2]]);
setTC('rock',    [['fighting',.5],['ground',.5],['steel',.5],['fire',2],['ice',2],['flying',2],['bug',2]]);
setTC('ghost',   [['dark',.5],['normal',0],['ghost',2],['psychic',2]]);
setTC('dragon',  [['steel',.5],['fairy',0],['dragon',2]]);
setTC('dark',    [['fighting',.5],['dark',.5],['fairy',.5],['psychic',2],['ghost',2]]);
setTC('steel',   [['steel',.5],['fire',.5],['water',.5],['electric',.5],['ice',2],['rock',2],['fairy',2]]);
setTC('fairy',   [['fire',.5],['poison',.5],['steel',.5],['fighting',2],['dragon',2],['dark',2]]);

function typeEff(atk, def) {
  return (TC[atk]?.[def]) ?? 1;
}

// Combined effectiveness against a pokemon with 1 or 2 types
function combinedEff(atk, defTypes) {
  return defTypes.reduce((m, t) => m * typeEff(atk, t), 1);
}

// ── Fetch pokemon types from PokeAPI ──────────────────────────────────────────
const pokeTypeCache = new Map(); // pokeId → [type1, type2?]

async function fetchPokeTypes(pokeId) {
  if (pokeTypeCache.has(pokeId)) return pokeTypeCache.get(pokeId);
  try {
    const d = await fetch(`https://pokeapi.co/api/v2/pokemon/${pokeId}`).then(r=>r.json());
    const types = d.types.map(t => t.type.name);
    pokeTypeCache.set(pokeId, types);
    return types;
  } catch(e) { return ['normal']; }
}

// ── Collect all pokemon in a player's active team+box ────────────────────────
let battleScope = 'team'; // 'team' | 'all'
let battleView = 'flat';  // 'flat' | 'grouped'

// ── Battle analysis pop-out ───────────────────────────────────────────────────
let _battlePopout = null;
let _battleObserver = null;

function _pushBattleUpdate() {
  if (!_battlePopout || _battlePopout.closed) return;
  const src = document.getElementById('bt-analysis');
  if (!src) return;
  const target = _battlePopout.document.getElementById('bt-po-content');
  if (!target) return;
  target.innerHTML = src.innerHTML;
  // Remove all player blocks except own
  target.querySelectorAll('.bt-player-block').forEach(block => {
    const badge = block.querySelector('.pi-badge');
    const pi = badge ? parseInt(badge.textContent) - 1 : -1;
    if (pi !== myPI) block.remove();
  });
  // Expand own block and remove collapse header
  target.querySelectorAll('.bt-player-body').forEach(b => b.classList.remove('collapsed'));
  target.querySelectorAll('.bt-player-header').forEach(h => {
    h.style.cursor = 'default';
    h.onclick = null;
    const icon = h.querySelector('.bt-collapse-icon');
    if (icon) icon.remove();
  });
}

async function popoutBattle() {
  if (_battlePopout && !_battlePopout.closed) { _battlePopout.focus(); return; }

  // Collect all CSS from the main page
  const cssText = [...document.styleSheets].map(ss => {
    try { return [...ss.cssRules].map(r => r.cssText).join('\n'); } catch(_) { return ''; }
  }).join('\n');

  const sw=screen.availWidth, sh=screen.availHeight;
  const ww=Math.round(sw*0.82), wh=Math.round(sh*0.88);
  const left=Math.round((sw-ww)/2), top=Math.round((sh-wh)/2);
  const features='width='+ww+',height='+wh+',left='+left+',top='+top+',resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no';

  const w=window.open('about:blank','soullink-battle-po',features);
  if(!w){toast('Pop-out blockiert',1);return;}
  _battlePopout=w;

  const scopeTeamActive=battleScope==='team'?'active':'';
  const scopeAllActive=battleScope==='all'?'active':'';
  w.document.open();
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8">'
    +'<title>Typen-Analyse \xb7 SoulLink</title>'
    +'<style>'
    +':root{--bg:#0d0d14;--sf:#13131f;--sf2:#1a1a2e;--bd:rgba(255,255,255,.08);--tx:#f0f0ff;--txd:rgba(240,240,255,.4);--txm:rgba(240,240,255,.6);--a:#7c6aff;--gr:#22c55e;--rd:#ef4444;--yw:#fbbf24;--or:#fb923c}'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'html,body{background:var(--bg);color:var(--tx);font-family:Syne,sans-serif;min-height:100%;width:100%}'
    +'body{padding:14px 18px;overflow-y:auto}'
    +'#hdr{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid var(--bd);flex-wrap:wrap;gap:8px}'
    +'#ttl{font-size:.72rem;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--txd)}'
    +'.bt-scope-toggle{display:flex;background:var(--sf2);border:1px solid var(--bd);border-radius:8px;overflow:hidden}'
    +'.bt-scope-btn{padding:5px 12px;font-size:.68rem;font-weight:700;border:none;background:transparent;color:var(--txd);cursor:pointer;white-space:nowrap;font-family:Syne,sans-serif}'
    +'.bt-scope-btn.active{background:var(--a);color:#fff}'
    +cssText
    +'</style></head><body>'
    +'<div id="hdr"><span id="ttl">Typen-Analyse</span>'
    +'<div style="display:flex;gap:8px;flex-wrap:wrap">'
    +'<div class="bt-scope-toggle">'
    +'<button class="bt-scope-btn '+scopeTeamActive+'" id="s-team" onclick="go(\'scope\',\'team\')">&#127918; Team</button>'
    +'<button class="bt-scope-btn '+scopeAllActive+'" id="s-all" onclick="go(\'scope\',\'all\')">&#128230; Alle</button>'
    +'</div>'
    +'</div></div>'
    +'<div id="bt-po-content"><div style="color:var(--txd);font-size:.72rem;padding:20px">Wird geladen\u2026</div></div>'
    +'<script>'
    +'function go(type,val){'
    +'  var op=window.opener; if(!op||op.closed)return;'
    +'  if(type==="scope")op.setBattleScope(val);'
    +'}'
    +'function sync(){'
    +'  var op=window.opener; if(!op||op.closed){clearInterval(iv);return;}'
    +'  var s=op.battleScope;'
    +'  [["s-team","team"],["s-all","all"]]'
    +'  .forEach(function(x){var el=document.getElementById(x[0]);if(el)el.classList.toggle("active",s===x[1]);});'
    +'}'
    +'var iv=setInterval(sync,800);'
    +'<\/script>'
    +'</body></html>');
  w.document.close();

  setTimeout(_pushBattleUpdate, 400);

  if(_battleObserver) _battleObserver.disconnect();
  const src=document.getElementById('bt-analysis');
  if(src){
    _battleObserver=new MutationObserver(function(){
      if(_battlePopout&&!_battlePopout.closed) _pushBattleUpdate();
      else{_battleObserver.disconnect();_battleObserver=null;}
    });
    _battleObserver.observe(src,{childList:true,subtree:true,characterData:true});
  }

  // Polling fallback: push every 2s in case observer misses async renders
  const _bpiv=setInterval(function(){
    if(!_battlePopout||_battlePopout.closed){clearInterval(_bpiv);return;}
    _pushBattleUpdate();
  },2000);

  w.addEventListener('beforeunload',function(){
    clearInterval(_bpiv);
    if(_battleObserver){_battleObserver.disconnect();_battleObserver=null;}
    _battlePopout=null;
  });
}

function setBattleScope(scope) {
  battleScope = scope;
  document.getElementById('bt-scope-team').classList.toggle('active', scope === 'team');
  document.getElementById('bt-scope-all').classList.toggle('active', scope === 'all');
  renderBattle();
}


function getPlayerPokemon(pi) {
  const result = [];
  // Always include team pokemon
  for (let si=0; si<6; si++) {
    const pk = team[pi]?.[si];
    if (pk?.pokeId && pk.alive && !pk.missed) result.push(pk);
  }
  if (battleScope === 'all') {
    // Box (only alive, non-missed)
    for (let b=0; b<NB; b++) for (let s=0; s<BS; s++) {
      const pk = box[pi]?.[b]?.[s];
      if (pk?.pokeId && pk.alive && !pk.missed) result.push(pk);
    }
  }
  return result;
}

// ── Ideal counters ────────────────────────────────────────────────────────────
async function getIdealCounters(pokes, atkType, genTC) {
  const scored = await Promise.all(pokes.map(async pk => {
    const defTypes = await fetchPokeTypes(pk.pokeId);
    const activeT = getActiveTypes();
    const filteredDef = defTypes.filter(t => activeT.includes(t) || !['dark','steel','fairy'].includes(t));
    const taken = combinedEffGen(atkType, filteredDef, genTC);
    const bestOffense = Math.max(...filteredDef.map(myType => typeEffGen(myType, atkType, genTC)));
    if (taken > 0.5 || bestOffense < 2) return null;
    const score = bestOffense * (taken === 0 ? 4 : taken <= 0.25 ? 3 : 2);
    return { pk, taken, bestOffense, score, defTypes:filteredDef };
  }));
  return scored.filter(Boolean).sort((a,b) => b.score - a.score);
}

// ── Render battle page ────────────────────────────────────────────────────────
async function renderBattle() {
  const el = document.getElementById('bt-analysis');
  el.innerHTML = '<div class="empty-state" style="padding:20px">Lade Typen…</div>';
  renderTypeTable();

  const pis = getAPIs();
  if (!pis.length) { el.innerHTML = '<div class="empty-state">Keine Spieler.</div>'; return; }

  const allPokes = [];
  pis.forEach(pi => getPlayerPokemon(pi).forEach(pk => allPokes.push(pk)));
  await Promise.all([...new Set(allPokes.map(pk=>pk.pokeId))].map(id => fetchPokeTypes(id)));

  el.innerHTML = '';
  for (const pi of pis) {
    const pokes = getPlayerPokemon(pi);
    const block = document.createElement('div');
    block.className = 'bt-player-block';
    const header = document.createElement('div');
    header.className = 'bt-player-header';
    header.innerHTML = `<span class="pi-badge pi-${pi}">${pi+1}</span>${getPN(pi)}<span style="font-size:.65rem;color:var(--txd);margin-left:4px;font-family:'Space Mono',monospace">(${pokes.length} ${battleScope==='team'?'im Team':'Pokémon'})</span><span class="bt-collapse-icon">${pi===myPI?'▼':'▶'}</span>`;
    const body = document.createElement('div');
    body.className = 'bt-player-body' + (pi===myPI ? ' collapsed' : '');
    header.onclick = () => {
      const nowCollapsed = body.classList.toggle('collapsed');
      header.querySelector('.bt-collapse-icon').textContent = nowCollapsed ? '▶' : '▼';
    };
    block.appendChild(header);

    if (!pokes.length) {
      body.innerHTML = '<div class="empty-state" style="padding:14px">Keine lebenden Pokémon.</div>';
      block.appendChild(body); el.appendChild(block); continue;
    }

    const gen = getEditionGen();
    const activeTypes = getActiveTypes();
    const genTC = buildGenTC(gen);

    // Per-type defensive stats using gen-aware chart
    const typeStats = {};
    for (const atkType of activeTypes) {
      const effs = await Promise.all(pokes.map(async pk => {
        const defTypes = await fetchPokeTypes(pk.pokeId);
        // Filter out fairy from defTypes if pre-gen6 (API returns modern types)
        const filteredDef = defTypes.filter(t => activeTypes.includes(t) || !['dark','steel','fairy'].includes(t));
        return combinedEffGen(atkType, filteredDef, genTC);
      }));
      typeStats[atkType] = { max: Math.max(...effs), pokes: pokes.map((pk,i)=>({pk,eff:effs[i]})) };
    }

    const groups = { veryWeak:[], weak:[], normal:[], resist:[], veryResist:[], immune:[] };
    for (const [t, s] of Object.entries(typeStats)) {
      if (s.max === 0)        groups.immune.push(t);
      else if (s.max <= 0.25) groups.veryResist.push(t);
      else if (s.max <= 0.5)  groups.resist.push(t);
      else if (s.max >= 4)    groups.veryWeak.push(t);
      else if (s.max >= 2)    groups.weak.push(t);
      else                    groups.normal.push(t);
    }

    // Helper: one pokemon chip — sprite + type badges (50% bigger sprites: 36px)
    const pokeChip = (pk, defTypes) => {
      const typeBdgs = (defTypes||[]).map(dt=>typeBadge(dt,true)).join('');
      return `<span style="display:inline-flex;align-items:center;gap:4px;margin:2px 6px 2px 0;white-space:nowrap">` +
        `<img src="${spr(pk.pokeId,pk.shiny)}" title="${pkName(pk)}" style="width:36px;height:36px;image-rendering:pixelated;flex-shrink:0">${typeBdgs}</span>`;
    };

    const dash = '<span style="color:var(--txd);font-size:.6rem;font-family:\'Space Mono\',monospace">–</span>';
    const thStyle = 'padding:6px 10px;text-align:left;font-size:.6rem;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--txd);border-bottom:2px solid var(--bd);border-right:1px solid var(--bd);background:var(--sf2)';
    const subThStyle = 'padding:4px 10px;font-size:.58rem;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--txd);border-bottom:1px solid var(--bd);border-right:1px solid var(--bd);background:var(--sf2);white-space:nowrap';
    const tdStyle = 'padding:5px 10px;border-bottom:1px solid rgba(255,255,255,.05);border-right:1px solid rgba(255,255,255,.04);vertical-align:middle';

    // ── Single unified table ──────────────────────────────────────────────────
    // Structure:
    //   Typ | Schwach [Effekt | Pokémon] | Konter [Effekt | Pokémon] | Normal [Pokémon]
    // Each type = 5 rows (4×, 2×, ½×, ¼×, 0×) with the type badge spanning all 5

    const tbl = document.createElement('table');
    tbl.style.cssText='width:100%;border-collapse:collapse;font-size:.72rem';

    // Top header row
    const thead=tbl.createTHead();
    const hr1=thead.insertRow();
    const makeTopTh=(txt,cols,extraStyle='')=>{
      const th=document.createElement('th'); th.textContent=txt; th.colSpan=cols;
      th.style.cssText=thStyle+extraStyle; hr1.appendChild(th);
    };
    makeTopTh('Typ',1);
    makeTopTh('Schwach',2,';border-left:2px solid var(--bd)');
    makeTopTh('Konter',2,';border-left:2px solid var(--bd)');
    makeTopTh('Normal (1×)',1,';border-left:2px solid var(--bd)');

    // Sub-header row
    const hr2=thead.insertRow();
    const makeSubTh=(txt,extraStyle='')=>{
      const th=document.createElement('th'); th.textContent=txt;
      th.style.cssText=subThStyle+extraStyle; hr2.appendChild(th);
    };
    makeSubTh(''); // typ placeholder
    makeSubTh('Effekt',';border-left:2px solid var(--bd)');
    makeSubTh('Pokémon');
    makeSubTh('Effekt',';border-left:2px solid var(--bd)');
    makeSubTh('Pokémon');
    makeSubTh('Pokémon',';border-left:2px solid var(--bd)');

    const tbody=tbl.createTBody();

    // Rows for weak: 4× and 2×
    const weakRows  =[{eff:'4×',cls:'eff-4',  filter:(e)=>e>=4},
                      {eff:'2×',cls:'eff-2',  filter:(e)=>e>=2&&e<4}];
    // Rows for counters: ½×, ¼×, 0×
    const counterRows=[{eff:'½×',cls:'eff-05',    filter:(c)=>c.taken>0.25&&c.taken<=0.5},
                       {eff:'¼×',cls:'eff-025',   filter:(c)=>c.taken>0&&c.taken<=0.25},
                       {eff:'0×',cls:'eff-immune',filter:(c)=>c.taken===0}];
    const NROWS=5; // max(2 weak rows, 3 counter rows) — use 5 rows per type but merge

    for(const t of activeTypes){
      const s=typeStats[t];
      const counters=await getIdealCounters(pokes,t,genTC);
      const normalPokes=s.pokes.filter(({eff})=>eff===1);

      // Precompute async pokemon chips for each sub-row
      const weakChips=[];
      for(const wr of weakRows){
        const pks=s.pokes.filter(({eff})=>wr.filter(eff));
        let h='';
        for(const {pk} of pks){const dt=(await fetchPokeTypes(pk.pokeId)).filter(x=>activeTypes.includes(x));h+=pokeChip(pk,dt);}
        weakChips.push({label:wr.eff,cls:wr.cls,html:h||dash});
      }
      const counterChips=[];
      for(const cr of counterRows){
        const cks=counters.filter(cr.filter);
        let h='';
        for(const {pk,defTypes} of cks){const dt=defTypes.filter(x=>activeTypes.includes(x));h+=pokeChip(pk,dt);}
        counterChips.push({label:cr.eff,cls:cr.cls,html:h||dash});
      }
      let normalHtml='';
      for(const {pk} of normalPokes){const dt=(await fetchPokeTypes(pk.pokeId)).filter(x=>activeTypes.includes(x));normalHtml+=pokeChip(pk,dt);}

      // Build rows: 3 rows per type (to fit 3 counter sub-rows), merge weak[1] into row[0]+row[1]
      for(let ri=0;ri<3;ri++){
        const row=tbody.insertRow();
        row.style.cssText='border-bottom:'+(ri===2?'2px solid rgba(255,255,255,.12)':'1px solid rgba(255,255,255,.04)');

        // Col 1: type badge — rowspan 3 on first row
        if(ri===0){
          const td=document.createElement('td'); td.rowSpan=3;
          td.style.cssText=tdStyle+';border-right:2px solid var(--bd);white-space:nowrap;vertical-align:middle';
          td.innerHTML=typeBadge(t);
          row.appendChild(td);
        }

        // Col 2+3: weak — rows 0=4×, 1=2×, row 2 empty
        if(ri<2){
          const tde=document.createElement('td');
          tde.style.cssText=tdStyle+';border-left:2px solid var(--bd);white-space:nowrap';
          tde.innerHTML=`<span class="bt-eff-badge ${weakChips[ri].cls}">${weakChips[ri].label}</span>`;
          row.appendChild(tde);
          const tdp=document.createElement('td'); tdp.style.cssText=tdStyle;
          tdp.innerHTML=weakChips[ri].html; row.appendChild(tdp);
        } else {
          const empty=document.createElement('td'); empty.colSpan=2;
          empty.style.cssText=tdStyle+';border-left:2px solid var(--bd)'; row.appendChild(empty);
        }

        // Col 4+5: counters — rows 0=½×, 1=¼×, 2=0×
        const tdc=document.createElement('td');
        tdc.style.cssText=tdStyle+';border-left:2px solid var(--bd);white-space:nowrap';
        tdc.innerHTML=`<span class="bt-eff-badge ${counterChips[ri].cls}">${counterChips[ri].label}</span>`;
        row.appendChild(tdc);
        const tdcp=document.createElement('td'); tdcp.style.cssText=tdStyle;
        tdcp.innerHTML=counterChips[ri].html; row.appendChild(tdcp);

        // Col 6: normal — rowspan 3 on first row
        if(ri===0){
          const tdn=document.createElement('td'); tdn.rowSpan=3;
          tdn.style.cssText=tdStyle+';border-left:2px solid var(--bd);vertical-align:middle';
          tdn.innerHTML=normalHtml||dash; row.appendChild(tdn);
        }
      }
    }
    body.appendChild(tbl);
    block.appendChild(body);
    el.appendChild(block);
  }
}

// ── Type table ────────────────────────────────────────────────────────────────
function renderTypeTable() {
  const table = document.getElementById('bt-type-table');
  if (!table) return;
  table.innerHTML = '';

  const activeTypes = getActiveTypes();
  const genTC = buildGenTC(getEditionGen());

  // Header row
  const thead = table.createTHead();
  const hr = thead.insertRow();
  const corner = document.createElement('th');
  corner.className = 'th-col th-row corner';
  corner.innerHTML = '<span style="font-size:.55rem;color:var(--txd)">ATK→<br>DEF↓</span>';
  hr.appendChild(corner);

  activeTypes.forEach((t, ci) => {
    const th = document.createElement('th');
    th.className = 'th-row';
    th.innerHTML = typeBadge(t, true);
    th.dataset.col = ci;
    hr.appendChild(th);
  });

  // Body
  const tbody = table.createTBody();
  activeTypes.forEach((defType, ri) => {
    const row = tbody.insertRow();
    row.dataset.row = ri;

    const th = document.createElement('th');
    th.className = 'th-col';
    th.innerHTML = typeBadge(defType, true);
    row.appendChild(th);

    activeTypes.forEach((atkType, ci) => {
      const eff = typeEffGen(atkType, defType, genTC);
      const td = row.insertCell();
      td.dataset.col = ci;

      if (eff === 0)    { td.className='immune'; td.textContent='0×'; }
      else if (eff<=.25){ td.className='quarter'; td.textContent='¼×'; }
      else if (eff<=.5) { td.className='half';    td.textContent='½×'; }
      else if (eff===1) { td.className='normal';  td.textContent=''; }
      else if (eff>=4)  { td.className='quad';    td.textContent='4×'; }
      else if (eff>=2)  { td.className='double';  td.textContent='2×'; }
    });
  });

  // Hover highlighting
  table.addEventListener('mouseover', e => {
    const td = e.target.closest('td,th');
    if (!td) return;
    const col = td.dataset.col;
    const row = td.closest('tr')?.dataset.row;
    // Clear previous
    table.querySelectorAll('.col-hover').forEach(el=>el.classList.remove('col-hover'));
    table.querySelectorAll('.row-hover').forEach(el=>el.classList.remove('row-hover'));
    if (col !== undefined) table.querySelectorAll(`[data-col="${col}"]`).forEach(el=>el.classList.add('col-hover'));
    if (row !== undefined) table.querySelectorAll(`tr[data-row="${row}"] td, tr[data-row="${row}"] th`).forEach(el=>el.classList.add('row-hover'));
  });
  table.addEventListener('mouseleave', () => {
    table.querySelectorAll('.col-hover,.row-hover').forEach(el=>el.classList.remove('col-hover','row-hover'));
  });
}
