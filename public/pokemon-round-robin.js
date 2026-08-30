(()=>{
  const SIZE=6;
  const TOTAL_MATCHES=15;
  const KEY='pokemon-round-robin-v5-six';
  const LEGACY_KEYS=['pokemon-round-robin-v4','pokemon-round-robin-v3','pokemon-round-robin-v2'];
  const LEGACY_BACKUP_KEY='pokemon-round-robin-pre-six-backup';
  const $=id=>document.getElementById(id);

  const defaultNames=()=>Array.from({length:SIZE},(_,i)=>`プレイヤー${i+1}`);
  const matchKey=(a,b)=>[a,b].sort((x,y)=>x-y).join('-');
  const parseMatchKey=key=>String(key).split('-').map(Number);
  const validMatchKey=key=>{
    const parts=parseMatchKey(key);
    if(parts.length!==2)return false;
    const [a,b]=parts;
    return Number.isInteger(a)&&Number.isInteger(b)&&a>=0&&b>=0&&a<SIZE&&b<SIZE&&a!==b;
  };
  const baseMatchKeys=()=>{
    const keys=[];
    for(let a=0;a<SIZE;a++)for(let b=a+1;b<SIZE;b++)keys.push(matchKey(a,b));
    return keys;
  };
  const sameOrder=(a,b)=>Array.isArray(a)&&Array.isArray(b)&&a.length===b.length&&a.every((v,i)=>v===b[i]);
  const canonicalOrder=rawOrder=>{
    const fallback=baseMatchKeys();
    if(!Array.isArray(rawOrder)||rawOrder.length!==TOTAL_MATCHES)return fallback;
    const order=[];
    for(const rawKey of rawOrder){
      if(!validMatchKey(rawKey))return fallback;
      const [a,b]=parseMatchKey(rawKey);
      order.push(matchKey(a,b));
    }
    if(new Set(order).size!==TOTAL_MATCHES)return fallback;
    const allowed=new Set(fallback);
    if(order.some(key=>!allowed.has(key)))return fallback;
    return order;
  };
  const initial=()=>({
    title:'ポケモン総当たり戦',
    players:defaultNames(),
    results:{},
    active:[],
    matchOrder:baseMatchKeys()
  });
  const validSix=s=>s&&Array.isArray(s.players)&&s.players.length===SIZE&&s.results&&typeof s.results==='object'&&!Array.isArray(s.results);

  function normalize(raw){
    const players=Array.from({length:SIZE},(_,i)=>String(raw?.players?.[i]||`プレイヤー${i+1}`));
    const results={};
    if(raw?.results&&typeof raw.results==='object'){
      for(const [key,value] of Object.entries(raw.results)){
        if(!validMatchKey(key))continue;
        const [a,b]=parseMatchKey(key);
        const winner=Number(value);
        if(winner===a||winner===b)results[matchKey(a,b)]=String(winner);
      }
    }

    const active=[];
    const seen=new Set();
    if(Array.isArray(raw?.active)){
      for(const rawKey of raw.active){
        if(!validMatchKey(rawKey))continue;
        const [a,b]=parseMatchKey(rawKey);
        const key=matchKey(a,b);
        if(seen.has(key)||key in results)continue;
        seen.add(key);
        active.push(key);
      }
    }

    return{
      title:String(raw?.title||'ポケモン総当たり戦'),
      players,
      results,
      active,
      matchOrder:canonicalOrder(raw?.matchOrder)
    };
  }

  function load(){
    try{
      const current=JSON.parse(localStorage.getItem(KEY)||'null');
      if(validSix(current))return normalize(current);

      for(const legacyKey of LEGACY_KEYS){
        const text=localStorage.getItem(legacyKey);
        if(!text)continue;
        const legacy=JSON.parse(text);
        if(!legacy||!Array.isArray(legacy.players))continue;
        if(!localStorage.getItem(LEGACY_BACKUP_KEY))localStorage.setItem(LEGACY_BACKUP_KEY,text);
        return normalize(legacy);
      }
    }catch(e){
      console.warn('Tournament state could not be loaded.',e);
    }
    return initial();
  }

  let state=load();
  let storageOk=true;
  let editingMatch=null;

  function save(){
    try{
      localStorage.setItem(KEY,JSON.stringify(state));
      storageOk=true;
      return true;
    }catch(e){
      storageOk=false;
      console.warn('Tournament data could not be saved to localStorage.',e);
      return false;
    }
  }

  function fixtures(){
    state.matchOrder=canonicalOrder(state.matchOrder);
    return state.matchOrder.map((key,index)=>{
      const [a,b]=parseMatchKey(key);
      return{a,b,key,no:index+1};
    });
  }

  const getResult=(a,b)=>state.results[matchKey(a,b)]??null;
  const isActive=(a,b)=>state.active.includes(matchKey(a,b));

  function cleanActive(){
    const seen=new Set();
    state.active=state.active.filter(key=>{
      if(!validMatchKey(key))return false;
      const [a,b]=parseMatchKey(key);
      const canonical=matchKey(a,b);
      if(seen.has(canonical)||getResult(a,b)!==null)return false;
      seen.add(canonical);
      return true;
    }).map(key=>{
      const [a,b]=parseMatchKey(key);
      return matchKey(a,b);
    });
  }

  function records(){
    const rows=state.players.map((name,index)=>({name,index,w:0,l:0,direct:0,rank:0}));
    for(const m of fixtures()){
      const result=getResult(m.a,m.b);
      if(result===null)continue;
      const winner=Number(result);
      if(winner!==m.a&&winner!==m.b)continue;
      const loser=winner===m.a?m.b:m.a;
      rows[winner].w++;
      rows[loser].l++;
    }

    const groups=new Map();
    for(const row of rows){
      if(!groups.has(row.w))groups.set(row.w,[]);
      groups.get(row.w).push(row);
    }

    const sorted=[];
    [...groups.keys()].sort((a,b)=>b-a).forEach(wins=>{
      const group=groups.get(wins);
      const ids=new Set(group.map(r=>r.index));
      for(const row of group)row.direct=0;
      if(group.length>1){
        for(const m of fixtures()){
          if(!ids.has(m.a)||!ids.has(m.b))continue;
          const result=getResult(m.a,m.b);
          if(result===null)continue;
          const row=group.find(x=>x.index===Number(result));
          if(row)row.direct++;
        }
      }
      group.sort((a,b)=>b.direct-a.direct||a.index-b.index);
      sorted.push(...group);
    });

    let pos=1;
    for(let i=0;i<sorted.length;){
      let j=i+1;
      while(j<sorted.length&&sorted[j].w===sorted[i].w&&sorted[j].direct===sorted[i].direct)j++;
      for(let k=i;k<j;k++)sorted[k].rank=pos;
      pos+=j-i;
      i=j;
    }
    return sorted;
  }

  function busyPlayers(){
    const busy=new Set();
    for(const key of state.active){
      const [a,b]=parseMatchKey(key);
      if(Number.isInteger(a)&&Number.isInteger(b)){
        busy.add(a);
        busy.add(b);
      }
    }
    return busy;
  }

  function playedCounts(){
    const counts=Array(SIZE).fill(0);
    for(const m of fixtures()){
      if(getResult(m.a,m.b)!==null){
        counts[m.a]++;
        counts[m.b]++;
      }
    }
    return counts;
  }

  function candidates(){
    const busy=busyPlayers();
    const counts=playedCounts();
    const pending=fixtures().filter(m=>getResult(m.a,m.b)===null&&!isActive(m.a,m.b)&&!busy.has(m.a)&&!busy.has(m.b));
    pending.sort((x,y)=>(counts[x.a]+counts[x.b])-(counts[y.a]+counts[y.b])||Math.max(counts[x.a],counts[x.b])-Math.max(counts[y.a],counts[y.b])||x.no-y.no);

    const used=new Set();
    const picked=[];
    for(const m of pending){
      if(used.has(m.a)||used.has(m.b))continue;
      picked.push(m);
      used.add(m.a);
      used.add(m.b);
    }
    return picked;
  }

  function setActive(a,b,on){
    const key=matchKey(a,b);
    if(on){
      if(getResult(a,b)!==null)return;
      const busy=busyPlayers();
      if(busy.has(a)||busy.has(b))return;
      if(!state.active.includes(key))state.active.push(key);
    }else{
      state.active=state.active.filter(x=>x!==key);
    }
    save();
    render();
  }

  function setResult(a,b,winner){
    const key=matchKey(a,b);
    if(winner===null){
      delete state.results[key];
    }else{
      if(winner!==a&&winner!==b)return;
      state.results[key]=String(winner);
      state.active=state.active.filter(x=>x!==key);
    }
    save();
    render();
  }

  function matchCard(m,recommended=false){
    const result=getResult(m.a,m.b);
    const active=isActive(m.a,m.b);
    const box=document.createElement('div');
    box.className='match'+(recommended?' recommended':'')+(active?' playing':'')+(result!==null?' done':'');
    box.dataset.matchKey=m.key||matchKey(m.a,m.b);
    box.dataset.matchNo=String(m.no);

    const no=document.createElement('div');
    no.className='match-no';
    no.innerHTML=`#${m.no}${active?'<small>対戦中</small>':recommended?'<small>候補</small>':result!==null?'<small>確定</small>':''}`;
    box.append(no);

    const playerButton=(playerIndex,otherIndex)=>{
      const btn=document.createElement('button');
      btn.type='button';
      btn.className='player'+(result===String(playerIndex)?' winner':result===String(otherIndex)?' loser':'');
      btn.textContent=state.players[playerIndex];
      btn.title=active||result!==null?'勝者として確定':'この対戦を開始';
      btn.onclick=()=>active||result!==null?setResult(m.a,m.b,playerIndex):setActive(m.a,m.b,true);
      return btn;
    };

    box.append(playerButton(m.a,m.b));
    const vs=document.createElement('div');
    vs.className='vs';
    vs.textContent='VS';
    box.append(vs);
    box.append(playerButton(m.b,m.a));

    const actions=document.createElement('div');
    actions.className='match-actions';
    if(result!==null){
      const clear=document.createElement('button');
      clear.type='button';
      clear.className='mini';
      clear.textContent='↺';
      clear.title='結果を取消';
      clear.onclick=()=>setResult(m.a,m.b,null);
      actions.append(clear);
    }else if(active){
      const stop=document.createElement('button');
      stop.type='button';
      stop.className='mini stop';
      stop.textContent='中止';
      stop.onclick=()=>setActive(m.a,m.b,false);
      actions.append(stop);
    }else{
      const start=document.createElement('button');
      start.type='button';
      start.className='mini start';
      start.textContent='開始';
      const busy=busyPlayers();
      start.disabled=busy.has(m.a)||busy.has(m.b);
      start.onclick=()=>setActive(m.a,m.b,true);
      actions.append(start);
    }
    box.append(actions);
    return box;
  }

  function shuffleInPlace(items){
    for(let i=items.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [items[i],items[j]]=[items[j],items[i]];
    }
    return items;
  }

  function shuffledPlayerIndexes(){
    return shuffleInPlace(Array.from({length:SIZE},(_,i)=>i));
  }

  function buildRandomRoundRobinOrder(){
    const rotating=shuffledPlayerIndexes();
    const rounds=[];

    for(let round=0;round<SIZE-1;round++){
      const pairs=[];
      for(let i=0;i<SIZE/2;i++){
        pairs.push(matchKey(rotating[i],rotating[SIZE-1-i]));
      }
      shuffleInPlace(pairs);
      rounds.push(pairs);
      rotating.splice(1,0,rotating.pop());
    }

    shuffleInPlace(rounds);
    return rounds.flat();
  }

  function shuffleMatchOrder(){
    const underway=Object.keys(state.results).length>0||state.active.length>0;
    if(underway&&!confirm('対戦順だけをランダムに並べ替えます。入力済みの勝敗や対戦中状態はそのまま残ります。よろしいですか？'))return;
    state.matchOrder=buildRandomRoundRobinOrder();
    save();
    render();
  }

  function drawRandomSix(){
    const list=$('randomSixList');
    list.innerHTML='';
    for(const index of shuffledPlayerIndexes()){
      const li=document.createElement('li');
      li.textContent=state.players[index];
      li.dataset.playerIndex=String(index);
      list.append(li);
    }
  }

  function openRandomSix(){
    drawRandomSix();
    $('randomSixDialog').hidden=false;
    document.body.classList.add('modal-open');
    $('randomSixAgain').focus();
  }

  function closeRandomSix(){
    $('randomSixDialog').hidden=true;
    document.body.classList.remove('modal-open');
    $('randomSixButton').focus();
  }

  function openResultEditor(a,b){
    if(getResult(a,b)===null)return;
    [a,b]=[a,b].sort((x,y)=>x-y);
    editingMatch={a,b};
    $('resultMatchLabel').textContent=`${state.players[a]} vs ${state.players[b]}`;
    $('resultPlayerA').textContent=`${state.players[a]} の勝ち`;
    $('resultPlayerB').textContent=`${state.players[b]} の勝ち`;
    const winner=Number(getResult(a,b));
    $('resultPlayerA').classList.toggle('current-winner',winner===a);
    $('resultPlayerB').classList.toggle('current-winner',winner===b);
    $('resultEditor').hidden=false;
    document.body.classList.add('modal-open');
    (winner===a?$('resultPlayerA'):$('resultPlayerB')).focus();
  }

  function closeResultEditor(){
    editingMatch=null;
    $('resultEditor').hidden=true;
    document.body.classList.remove('modal-open');
  }

  function applyEditedResult(winner){
    if(!editingMatch)return;
    const {a,b}=editingMatch;
    closeResultEditor();
    setResult(a,b,winner);
  }

  function renderStandings(){
    const body=$('standings');
    body.innerHTML='';
    for(const row of records()){
      const tr=document.createElement('tr');
      tr.innerHTML=`<td class="rank">${row.rank}</td><td>${escapeHtml(row.name)}</td><td class="wins">${row.w}</td><td>${row.l}</td>`;
      body.append(tr);
    }
    const done=fixtures().filter(m=>getResult(m.a,m.b)!==null).length;
    $('progress').textContent=`${done}/${TOTAL_MATCHES}${storageOk?'':' ・未保存'}`;
  }

  function renderRecommended(){
    cleanActive();
    const activeList=fixtures().filter(m=>isActive(m.a,m.b));
    const summary=$('playingSummary');
    summary.innerHTML='';
    if(activeList.length){
      const pill=document.createElement('span');
      pill.className='playing-pill';
      pill.textContent='● 対戦中：勝った人をタップ';
      summary.append(pill);
    }

    const wrap=$('recommended');
    wrap.innerHTML='';
    for(const m of activeList)wrap.append(matchCard(m,true));
    for(const m of candidates())wrap.append(matchCard(m,true));
    if(!wrap.children.length)wrap.innerHTML='<div class="empty">空き組なし</div>';
  }

  function renderSchedule(){
    const wrap=$('schedule');
    wrap.innerHTML='';
    const list=fixtures().sort((x,y)=>{
      const xr=getResult(x.a,x.b),yr=getResult(y.a,y.b);
      const xs=isActive(x.a,x.b)?0:xr===null?1:2;
      const ys=isActive(y.a,y.b)?0:yr===null?1:2;
      return xs-ys||x.no-y.no;
    });
    for(const m of list)wrap.append(matchCard(m,false));
    const done=fixtures().filter(m=>getResult(m.a,m.b)!==null).length;
    $('scheduleCount').textContent=`残り ${TOTAL_MATCHES-done} / 全${TOTAL_MATCHES}`;
  }

  function makeEditableResultCell(td,i,j){
    td.tabIndex=0;
    td.setAttribute('role','button');
    td.title='結果を修正';
    td.setAttribute('aria-label',`${state.players[i]} 対 ${state.players[j]} の結果を修正`);
    td.onclick=()=>openResultEditor(i,j);
    td.onkeydown=e=>{
      if(e.key==='Enter'||e.key===' '){
        e.preventDefault();
        openResultEditor(i,j);
      }
    };
  }

  function renderMatrix(){
    const table=$('matrix');
    table.innerHTML='';
    const head=document.createElement('tr');
    head.innerHTML='<th></th>'+state.players.map(name=>`<th>${escapeHtml(name)}</th>`).join('');
    table.append(head);

    for(let i=0;i<SIZE;i++){
      const tr=document.createElement('tr');
      tr.innerHTML=`<th>${escapeHtml(state.players[i])}</th>`;
      for(let j=0;j<SIZE;j++){
        const td=document.createElement('td');
        if(i===j){
          td.className='self';
          td.textContent='—';
        }else{
          const result=getResult(i,j);
          if(isActive(i,j)){
            td.className='active';
            td.textContent='●';
          }else if(result===null){
            td.className='pending';
            td.textContent='·';
          }else if(Number(result)===i){
            td.className='win';
            td.textContent='W';
            makeEditableResultCell(td,i,j);
          }else{
            td.className='loss';
            td.textContent='L';
            makeEditableResultCell(td,i,j);
          }
        }
        tr.append(td);
      }
      table.append(tr);
    }
  }

  function escapeHtml(value){
    return String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function renderInputs(){
    const count=$('playerCount');
    count.innerHTML='<option value="6">6人</option>';
    count.value='6';
    count.disabled=true;
    $('titleInput').value=state.title;
    const wrap=$('playerInputs');
    wrap.innerHTML='';
    state.players.forEach(name=>{
      const input=document.createElement('input');
      input.className='text';
      input.value=name;
      wrap.append(input);
    });
  }

  function renderOrderStatus(){
    const status=$('matchOrderStatus');
    if(status)status.textContent=sameOrder(state.matchOrder,baseMatchKeys())?'標準順':'ランダム順';
  }

  $('applyButton').onclick=()=>{
    const newPlayers=[...$('playerInputs').querySelectorAll('input')].slice(0,SIZE).map((input,i)=>input.value.trim()||`プレイヤー${i+1}`);
    while(newPlayers.length<SIZE)newPlayers.push(`プレイヤー${newPlayers.length+1}`);
    state.title=$('titleInput').value.trim()||'ポケモン総当たり戦';
    state.players=newPlayers;
    cleanActive();
    save();
    render();
  };

  $('shuffleMatchesButton').onclick=shuffleMatchOrder;

  $('backupButton').onclick=()=>{
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`pokemon-round-robin-six-${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    setTimeout(()=>URL.revokeObjectURL(a.href),1000);
  };

  $('importButton').onclick=()=>$('importFile').click();
  $('importFile').onchange=async e=>{
    const file=e.target.files[0];
    if(!file)return;
    try{
      const imported=JSON.parse(await file.text());
      if(!validSix(imported))throw new Error('not-six');
      state=normalize(imported);
      cleanActive();
      save();
      render();
    }catch{
      alert('読み込めないバックアップです。6人総当たりのデータを使用してください。');
    }
    e.target.value='';
  };

  $('resetResults').onclick=()=>{
    if(confirm('対戦結果と対戦中状態をリセットしますか？')){
      state.results={};
      state.active=[];
      save();
      render();
    }
  };

  $('resetAll').onclick=()=>{
    if(confirm('大会設定をすべて初期化しますか？')){
      state=initial();
      save();
      render();
    }
  };

  $('randomSixButton').onclick=openRandomSix;
  $('randomSixAgain').onclick=drawRandomSix;
  $('randomSixClose').onclick=closeRandomSix;
  $('randomSixDone').onclick=closeRandomSix;
  $('randomSixDialog').onclick=e=>{if(e.target===$('randomSixDialog'))closeRandomSix()};

  $('resultClose').onclick=closeResultEditor;
  $('resultPlayerA').onclick=()=>editingMatch&&applyEditedResult(editingMatch.a);
  $('resultPlayerB').onclick=()=>editingMatch&&applyEditedResult(editingMatch.b);
  $('resultClear').onclick=()=>applyEditedResult(null);
  $('resultEditor').onclick=e=>{if(e.target===$('resultEditor'))closeResultEditor()};

  document.addEventListener('keydown',e=>{
    if(e.key!=='Escape')return;
    if(!$('randomSixDialog').hidden)closeRandomSix();
    else if(!$('resultEditor').hidden)closeResultEditor();
  });

  function render(){
    state.matchOrder=canonicalOrder(state.matchOrder);
    $('eventTitle').textContent=state.title;
    $('randomSixButton').disabled=false;
    $('randomSixButton').title='登録した6人をランダム順で表示';
    renderStandings();
    renderRecommended();
    renderSchedule();
    renderMatrix();
    renderInputs();
    renderOrderStatus();
  }

  cleanActive();
  save();
  render();
})();
