const $ = id => document.getElementById(id);
const RANK_KEY = "ff14_today_island_rank_v1";
const DAILY_PREFIX = "ff14_today_island_daily_v2_";

const ISLAND = {
  3:{title:"開拓工房を2棟動かす",tasks:["開拓用ストーンハンマーを製作","開拓工房Iを2棟建築","ねこみみさんへ報告","不足素材だけ採集"],granary:"まだ未解放"},
  4:{title:"拠点と放牧地を拡張",tasks:["アイランドホールIIへ改築","耕作地・放牧地を拡張","土地を拡張","ランドマークを1つ建築"],granary:"まだ未解放"},
  5:{title:"3棟目の工房とグラナリー",tasks:["開拓用シャベルを製作","土地を拡張","3棟目の開拓工房を建築","グラナリーオフィスを建築"],granary:"森林へ派遣してスプルース原木×6を先取り"},
  6:{title:"工房IIへ改築",tasks:["開拓用カッパーサイズを製作","開拓工房3棟をIIへ改築","グラナリーをIIへ改築","不足EXPだけ採集"],granary:"森林→渓流の順でR8素材を集める"},
  7:{title:"ホールIIIと2棟目グラナリー",tasks:["アイランドホールIIIへ改築","耕作地・放牧地を最大拡張","2棟目のグラナリーを建築","ランドマークを追加"],granary:"スプルース原木×6→ガーネット原石×9"},
  8:{title:"工房III・グラナリーIII",tasks:["開拓用ブロンズピックを製作","開拓工房3棟をIIIへ改築","グラナリー2棟をIIIへ改築","固定EXP回収後に不足分だけ採集"],granary:"必要素材が揃ったら山で銀鉱×3を先取り"},
  9:{title:"土地拡張と灯台",tasks:["土地を拡張","ランドマーク『灯台』を建築","ねこみみさん関連クエストを進行","R10用素材を準備"],granary:"山で銀鉱×3→草原でアリッサム×5"},
  10:{title:"フライング解放",tasks:["フライング解放条件を完了","工房を止めない","採集EXPは余裕がある日にまとめる"],granary:"草原でアリッサム×5を確保"},
  11:{title:"短時間日課でR12へ",tasks:["工房・畑・放牧地・グラナリーを優先","R12までの採集EXPは余裕がある日にまとめる"],granary:"アリッサム不足なら草原、足りていれば自由"},
  12:{title:"とんがり山の洞窟を解放",tasks:["ねこみみさんのクエストを最優先","魔法人形用の砕岩装備を製作","とんがり山の洞窟を解放","固定報酬を回収してから採集"],granary:"必須希少素材が揃っていれば不足素材の場所へ"},
  13:{title:"ホールIV・グラナリーIV",tasks:["開拓用スチールハンマーを製作","アイランドホールIVへ改築","グラナリー2棟をIVへ改築","R14用素材を多めに採集"],granary:"工房で不足しやすい素材の探索地へ"},
  14:{title:"工房IVからR15へ",tasks:["開拓工房3棟をIVへ改築","完成EXPをすべて回収","R15までの採集は余裕がある日にまとめる"],granary:"工房で不足する素材を補充"},
  15:{title:"R15到達",tasks:["ランク15到達で今回の目標達成","続ける場合だけ追加工房・ランドマークへ進む"],granary:"不足素材の補充用として自由に派遣"}
};

const DAILY = [
  ["workshop","工房の結果確認・次の予約"],
  ["pasture","放牧地の回収・餌"],
  ["garden","耕作地の収穫・種・水やり"],
  ["granary","グラナリー回収・再派遣"]
];

function jstDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function dailyKey(id){return `${DAILY_PREFIX}${jstDate()}_${id}`}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function fmtDate(value){if(!value)return"未同期";try{return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}catch{return value}}

function islandRank(){const value=Number(localStorage.getItem(RANK_KEY));return ISLAND[value]?value:3}
function dailyForRank(rank){return DAILY.filter(([id])=>id!=="granary"||rank>=5)}
function renderIsland(){
  const rank=islandRank(),data=ISLAND[rank],daily=dailyForRank(rank);
  $("islandRank").value=String(rank);
  $("islandTitle").textContent=data.title;
  $("islandGranary").innerHTML=`<strong>グラナリー</strong>${escapeHtml(data.granary)}`;
  $("islandRankTasks").innerHTML=data.tasks.map(task=>`<div class="rank-row"><span>${escapeHtml(task)}</span></div>`).join("");
  $("islandDaily").innerHTML=daily.map(([id,label])=>{
    const done=localStorage.getItem(dailyKey(id))==="1";
    return `<label class="check-row${done?" done":""}"><input type="checkbox" data-island-daily="${id}" ${done?"checked":""}><span>${escapeHtml(label)}</span></label>`;
  }).join("");
  const done=daily.filter(([id])=>localStorage.getItem(dailyKey(id))==="1").length;
  $("islandProgress").textContent=`今日 ${done}/${daily.length} 完了`;
}

async function api(path, options){
  const response=await fetch(path,options);
  let data={};try{data=await response.json()}catch{}
  if(!response.ok)throw new Error(data.detail||data.error||`HTTP ${response.status}`);
  return data;
}

function renderProfile(data){
  const c=data?.character;
  if(c){
    $("characterName").textContent=c.name||"Kanade";
    $("characterWorld").textContent=[c.world,c.data_center].filter(Boolean).join(" · ");
    $("syncText").textContent=`最終同期 ${fmtDate(c.synced_at)}`;
    const jobs=(c.jobs||[]).filter(j=>Number(j.level)>0).sort((a,b)=>Number(b.level)-Number(a.level));
    $("jobsSummary").textContent=`Lv100 ${jobs.filter(j=>Number(j.level)>=100).length} / 解放 ${jobs.length}`;
    $("jobsList").innerHTML=jobs.slice(0,12).map(j=>`<span class="job">${escapeHtml(j.name_ja||j.name||j.code)} Lv${Number(j.level)||0}</span>`).join("");
  } else {
    $("characterName").textContent="Lodestone未同期";
    $("characterWorld").textContent="同期すると採集・釣り候補を現在Lvに合わせます。";
    $("syncText").textContent="未同期";
  }
  const a=data?.achievements;
  $("achievementCount").textContent=a?.total_achievements??"—";
  $("achievementPoints").textContent=a?.achievement_points??"—";
}

async function loadProfile(){
  try{renderProfile(await api("/api/profile"))}catch(error){$("status").textContent=`読み込み失敗：${error.message}`}
}

function setBusy(button,busy,label){if(!button)return;button.disabled=busy;if(label)button.textContent=label}

async function loadAchievements(){
  const button=$("achievementButton");setBusy(button,true,"取得中…");
  $("achievementResult").innerHTML="";
  try{
    const data=await api("/api/achievements/candidates?limit=12");
    $("achievementResult").innerHTML=`<p class="result-note">${escapeHtml(data.basis||"")}</p><div class="result-list">${(data.candidates||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(row.name)}</strong><small>${escapeHtml(row.description)}</small><small><span class="pill">${row.points||0}pt</span>取りやすさ指標 ${row.distance_score}</small></div>`).join("")||'<div class="result-row"><small>候補を取得できませんでした。</small></div>'}</div>`;
    await loadProfile();
  }catch(error){$("achievementResult").innerHTML=`<p class="result-note">取得失敗：${escapeHtml(error.message)}</p>`}
  finally{setBusy(button,false,"アチーブ候補を取得")}
}

function timeLabel(ms){if(!ms)return"";return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"}).format(new Date(ms))}
async function loadGathering(){
  const button=$("gatherButton");setBusy(button,true,"取得中…");$("gatherResult").innerHTML="";
  try{
    const data=await api("/api/gathering/timed");
    $("gatherResult").innerHTML=`<p class="result-note">押した時点から12時間以内の時限採集候補です。</p><div class="result-list">${(data.rows||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(row.title)}</strong><small>${row.time_window?.state==="open"?'<span class="pill">いま採れる</span>':`<span class="pill">${timeLabel(row.time_window?.start_at_ms)}〜</span>`}${escapeHtml(row.reason)}</small></div>`).join("")||'<div class="result-row"><small>現在のLvで表示できる時限候補はありません。</small></div>'}</div>`;
  }catch(error){$("gatherResult").innerHTML=`<p class="result-note">取得失敗：${escapeHtml(error.message)}</p>`}
  finally{setBusy(button,false,"時限採集を取得")}
}

async function loadFishing(mode="all"){
  document.querySelectorAll("[data-fish-mode]").forEach(b=>b.disabled=true);$("fishResult").innerHTML="";
  try{
    const data=await api(`/api/fishing/candidates?mode=${encodeURIComponent(mode)}`);
    const exp=(data.experience||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(row.title)}</strong><small>${escapeHtml(row.reason)}</small></div>`).join("");
    const big=(data.big_fish||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(row.name)}</strong><small><span class="pill">${timeLabel(row.start_at_ms)}〜</span>${escapeHtml([row.zone,row.location,row.weather,row.bait?.length?`餌: ${row.bait.join(" → ")}`:""].filter(Boolean).join(" / "))}</small></div>`).join("");
    $("fishResult").innerHTML=`<p class="result-note">漁師Lv${data.fisher_level||0} / ${escapeHtml(data.source||"")}</p><div class="result-list">${exp}${big||(!exp?'<div class="result-row"><small>現在24時間以内に表示できるヌシ候補はありません。</small></div>':"")}</div>`;
  }catch(error){$("fishResult").innerHTML=`<p class="result-note">取得失敗：${escapeHtml(error.message)}</p>`}
  finally{document.querySelectorAll("[data-fish-mode]").forEach(b=>b.disabled=false)}
}

$("islandRank")?.addEventListener("change",event=>{localStorage.setItem(RANK_KEY,event.target.value);renderIsland()});
document.addEventListener("change",event=>{const id=event.target?.dataset?.islandDaily;if(!id)return;localStorage.setItem(dailyKey(id),event.target.checked?"1":"0");renderIsland()});
$("syncButton")?.addEventListener("click",async()=>{const b=$("syncButton");setBusy(b,true,"同期中…");try{await api("/api/sync",{method:"POST"});await loadProfile();$("status").textContent="Lodestone同期が完了しました。"}catch(error){$("status").textContent=`同期失敗：${error.message}`}finally{setBusy(b,false,"Lodestone同期")}});
$("achievementButton")?.addEventListener("click",loadAchievements);
$("gatherButton")?.addEventListener("click",loadGathering);
document.querySelectorAll("[data-fish-mode]").forEach(button=>button.addEventListener("click",()=>loadFishing(button.dataset.fishMode)));

renderIsland();
void loadProfile();
