(()=>{
  const KEY='pokemon-round-robin-v5-six';
  const button=document.getElementById('randomSixButton');
  const dialog=document.getElementById('randomSixDialog');
  const list=document.getElementById('randomSixList');
  const again=document.getElementById('randomSixAgain');
  const done=document.getElementById('randomSixDone');
  const close=document.getElementById('randomSixClose');
  if(!button||!dialog||!list||!again||!done||!close)return;

  let shuffledPending=false;

  function readState(){
    try{return JSON.parse(localStorage.getItem(KEY)||'null')}catch{return null}
  }

  function tournamentStarted(state){
    return !state||!Array.isArray(state.players)||state.players.length!==6||Object.keys(state.results||{}).length>0||(Array.isArray(state.active)&&state.active.length>0);
  }

  function updateButton(){
    const state=readState();
    const started=tournamentStarted(state);
    button.textContent='プレイヤー順をランダム';
    button.disabled=started;
    button.title=started?'対戦開始後はプレイヤー順を変更できません':'登録した6人の並び順をランダムに変更';
  }

  function renderList(players){
    list.innerHTML='';
    for(const name of players){
      const li=document.createElement('li');
      li.textContent=name;
      list.append(li);
    }
  }

  function shuffleAndSave(){
    const state=readState();
    if(tournamentStarted(state)){
      updateButton();
      return false;
    }
    const players=[...state.players];
    for(let i=players.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [players[i],players[j]]=[players[j],players[i]];
    }
    state.players=players;
    localStorage.setItem(KEY,JSON.stringify(state));
    renderList(players);
    shuffledPending=true;
    return true;
  }

  function openShuffle(){
    if(!shuffleAndSave())return;
    dialog.hidden=false;
    document.body.classList.add('modal-open');
    again.focus();
  }

  function finishShuffle(){
    dialog.hidden=true;
    document.body.classList.remove('modal-open');
    if(shuffledPending){
      shuffledPending=false;
      location.reload();
    }else{
      button.focus();
    }
  }

  button.onclick=openShuffle;
  again.onclick=()=>shuffleAndSave();
  done.onclick=finishShuffle;
  close.onclick=finishShuffle;
  dialog.onclick=e=>{if(e.target===dialog)finishShuffle()};
  document.addEventListener('keydown',e=>{
    if(e.key==='Escape'&&!dialog.hidden){
      e.preventDefault();
      e.stopImmediatePropagation();
      finishShuffle();
    }
  },true);

  updateButton();
  const recommended=document.getElementById('recommended');
  if(recommended)new MutationObserver(updateButton).observe(recommended,{childList:true,subtree:true});
})();
