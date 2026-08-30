(()=>{
  const KEY='pokemon-round-robin-v5-six';
  const button=document.getElementById('randomSixButton');
  if(!button)return;

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

  function shufflePlayers(){
    const state=readState();
    if(tournamentStarted(state)){
      updateButton();
      return;
    }
    const players=[...state.players];
    for(let i=players.length-1;i>0;i--){
      const j=Math.floor(Math.random()*(i+1));
      [players[i],players[j]]=[players[j],players[i]];
    }
    state.players=players;
    localStorage.setItem(KEY,JSON.stringify(state));
    location.reload();
  }

  button.onclick=shufflePlayers;
  updateButton();

  const recommended=document.getElementById('recommended');
  if(recommended)new MutationObserver(updateButton).observe(recommended,{childList:true,subtree:true});
})();
