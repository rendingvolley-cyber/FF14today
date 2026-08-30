(()=>{
  const KEY='pokemon-round-robin-v4';
  const BACKUP_KEY='pokemon-round-robin-v4-pre-six-backup';
  const SIZE=6;
  const defaultNames=()=>Array.from({length:SIZE},(_,i)=>`プレイヤー${i+1}`);
  const initial=()=>({title:'ポケモン総当たり戦',players:defaultNames(),results:{},active:[]});
  const isObject=v=>v&&typeof v==='object'&&!Array.isArray(v);
  const validMatchKey=k=>{
    const parts=String(k).split('-').map(Number);
    return parts.length===2&&parts.every(Number.isInteger)&&parts[0]>=0&&parts[1]>=0&&parts[0]<SIZE&&parts[1]<SIZE&&parts[0]!==parts[1];
  };
  function toSix(raw){
    if(!isObject(raw)||!Array.isArray(raw.players))return initial();
    const players=raw.players.slice(0,SIZE).map((v,i)=>String(v||`プレイヤー${i+1}`));
    while(players.length<SIZE)players.push(`プレイヤー${players.length+1}`);
    const results={};
    if(isObject(raw.results))for(const [key,value] of Object.entries(raw.results))if(validMatchKey(key))results[key]=String(value);
    const active=Array.isArray(raw.active)?[...new Set(raw.active.map(String).filter(validMatchKey).filter(key=>!(key in results)))]:[];
    return{title:String(raw.title||'ポケモン総当たり戦'),players,results,active};
  }
  function migrateStoredState(){
    try{
      const text=localStorage.getItem(KEY);
      if(!text){localStorage.setItem(KEY,JSON.stringify(initial()));return;}
      const raw=JSON.parse(text);
      if(Array.isArray(raw?.players)&&raw.players.length===SIZE)return;
      if(!localStorage.getItem(BACKUP_KEY))localStorage.setItem(BACKUP_KEY,text);
      localStorage.setItem(KEY,JSON.stringify(toSix(raw)));
    }catch{
      localStorage.setItem(KEY,JSON.stringify(initial()));
    }
  }
  migrateStoredState();

  window.addEventListener('DOMContentLoaded',()=>{
    const count=document.getElementById('playerCount');
    if(count){count.value=String(SIZE);count.disabled=true;count.title='この大会は6人固定です';}

    const importFile=document.getElementById('importFile');
    if(importFile)importFile.onchange=async e=>{
      const file=e.target.files?.[0];
      if(!file)return;
      try{
        const raw=JSON.parse(await file.text());
        if(!isObject(raw)||!Array.isArray(raw.players)||raw.players.length!==SIZE||!isObject(raw.results))throw new Error();
        localStorage.setItem(KEY,JSON.stringify(toSix(raw)));
        location.reload();
      }catch{
        alert('読み込めないバックアップです。参加人数は6人のデータを使用してください。');
      }
      e.target.value='';
    };

    const resetAll=document.getElementById('resetAll');
    if(resetAll)resetAll.onclick=()=>{
      if(!confirm('大会設定をすべて初期化しますか？'))return;
      localStorage.setItem(KEY,JSON.stringify(initial()));
      location.reload();
    };
  });
})();
