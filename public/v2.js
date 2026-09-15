import { groupLabel, levelableJobs, levelingRecommendations } from "./leveling-advisor.js";
import { ISLAND_GUIDE, materialStorageKey } from "./island-guide.js";

const $=id=>document.getElementById(id);
const RANK_KEY="ff14_today_island_rank_v1";
const DAILY_PREFIX="ff14_today_island_daily_v2_";
const LEVEL_JOB_KEY="ff14_today_leveling_job_v1";
let currentLevelJobs=[];
const DAILY=[["workshop","工房の結果確認・次の予約"],["pasture","放牧地の回収・餌"],["garden","耕作地の収穫・種・水やり"],["granary","グラナリー回収・再派遣"]];
const JP_TEXT_REPLACEMENTS=[
  ["Bestestest Mammet-sized Builder's Tools","最上級マメット用建築工具"],
  ["Bestest Mammet-sized Builder's Tools","特級マメット用建築工具"],
  ["Better Mammet-sized Builder's Tools","改良型マメット用建築工具"],
  ["Basic Mammet-sized Builder's Tools","初級マメット用建築工具"],
  ["Best Mammet-sized Builder's Tools","上級マメット用建築工具"],
  ["Splendiferous Mammet-sized Spelunking Tools","特製マメット用探索工具"],
  ["Mammet-sized Spelunking Tools","マメット用探索工具"],
  ["Mammet-sized Builder's Tools","マメット用建築工具"],
  ["A Workshop of Wonders","工房開放クエスト"],
  ["The Perfect Paradise","施設拡張クエスト"],
  ["The Land, Wind, and Sea","飛行解放クエスト"],
  ["Passionate Pioneering","山中洞窟の開放クエスト"],
  ["A Far Eastern Yarn","山中洞窟の前提クエスト"],
  ["Delightful Discovery","山中洞窟の完了クエスト"],
  ["The Land of Luxury","豪華施設の進行クエスト"],
  ["An Ideal Marriage","大鉱脈エリアの前提クエスト"],
  ["A Subterranean Expansion","大鉱脈エリアの完了クエスト"],
  ["Pathological Pathfinder Mk. VI","開拓担当マメット第6段階"],
  ["Pathological Pathfinder Mk. V","開拓担当マメット第5段階"],
  ["Pathological Pathfinder Mk. IV","開拓担当マメット第4段階"],
  ["Pathological Pathfinder Mk. III","開拓担当マメット第3段階"],
  ["Pathological Pathfinder Mk. II","開拓担当マメット第2段階"],
  ["Pathological Pathfinder Mk. I","開拓担当マメット第1段階"],
  ["Pathfinder Mk. VI","開拓担当マメット第6段階"],
  ["Pathfinder Mk. V","開拓担当マメット第5段階"],
  ["Pathfinder Mk. IV","開拓担当マメット第4段階"],
  ["Pathfinder Mk. III","開拓担当マメット第3段階"],
  ["Pathfinder Mk. II","開拓担当マメット第2段階"],
  ["Pathfinder Mk. I","開拓担当マメット第1段階"],
  ["Determined Digger","掘削担当マメット"],
  ["Facility Plot","施設建築用地"],
  ["Quixotic Windmill","風車"],
  ["Boiling Bathhouse","温泉施設"],
  ["Bathhouse","温泉施設"],
  ["Cozy Cabin","拠点施設"],
  ["Cropland","耕作地"],
  ["Pasture","放牧地"],
  ["Workshop","工房"],
  ["Granary","グラナリー"],
  ["Landmark","ランドマーク"],
  ["Seafarer's Cowries","島貨"],
  ["Cowries","島貨"],
  ["Tualong/Mahogany系の木","原木が採れる木"],
  ["Smooth White Rock","白い岩"],
  ["Bluish Rock","青みがかった岩"],
  ["Submerged Sand","水中の砂地"],
  ["Pirate Bay","海賊湾"],
  ["Large Shell","大きな貝"],
  ["Mound of Dirt","土の盛り"],
  ["Spruce Log","スプルース原木"],
  ["Raw Garnet","ガーネット原石"],
  ["Mammet Tools","マメット用工具"],
  ["Iron Ore","鉄鉱"],
  ["Leucogranite","ロイコグラナイト"],
  ["Bronze Beakaxe","ブロンズビークアクス"],
  ["Resin","樹脂"],
  ["Wood Opal","ウッドオパール"],
  ["Quartz","クォーツ"],
  ["Leek Set","リークの種"],
  ["Paprika Seeds","パプリカの種"],
  ["Mountain Hollow","山中洞窟"],
  ["Cave Shrimp","洞窟エビ"],
  ["Spectrine","スペクトリン"],
  ["Mythril Ore","ミスリル鉱"],
  ["Marble","大理石"],
  ["Islewort","アイルワート"],
  ["Coal","石炭"],
  ["Steel Hammer","スチールハンマー"],
  ["Mother Lode","大鉱脈エリア"],
  ["Duty Support","コンテンツサポーター"],
  ["Trust","フェイス"]
];
function jpText(value){let text=String(value??"");for(const[from,to]of JP_TEXT_REPLACEMENTS)text=text.split(from).join(to);return text.replace(/\bRank\s*(\d+)/g,"開拓ランク$1").replace(/\bEXP\b/g,"経験値").replace(/\bCF\b/g,"コンテンツファインダー").replace(/\bVI\b/g,"6").replace(/\bIV\b/g,"4").replace(/\bIII\b/g,"3").replace(/\bII\b/g,"2").replace(/\bV\b/g,"5").replace(/\bI\b/g,"1")}
function jstDate(){return new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Tokyo",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date())}
function dailyKey(id){return`${DAILY_PREFIX}${jstDate()}_${id}`}
function escapeHtml(value){return String(value??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"}[ch]))}
function fmtDate(value){if(!value)return"未同期";try{return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",month:"numeric",day:"numeric",hour:"2-digit",minute:"2-digit"}).format(new Date(value))}catch{return value}}
function islandRank(){const value=Number(localStorage.getItem(RANK_KEY));return ISLAND_GUIDE[value]?value:3}
function dailyForRank(rank){return DAILY.filter(([id])=>id!=="granary"||rank>=5)}
function ownedMaterial(rank,name){const n=Number(localStorage.getItem(materialStorageKey(rank,name))||0);return Number.isFinite(n)&&n>0?Math.floor(n):0}
function shortage(target,owned){return Math.max(0,Number(target)-Number(owned))}
function shortageId(rank,index){return`island-shortage-${rank}-${index}`}
function renderMaterials(rank,data){const host=$("islandMaterials");if(!host)return;if(!data.materials.length){host.innerHTML='<p class="muted material-empty">この開拓ランクは固定の建築素材タスクなし。日課と工房経験値回収を進めます。</p>';return}host.innerHTML=`<p class="result-note">「所持」に今持っている数を入れると、不足数だけ残ります。端末内に保存します。</p><div class="material-grid">${data.materials.map(([name,target,where],index)=>{const owned=ownedMaterial(rank,name),need=shortage(target,owned);return`<article class="material-row${need===0?' complete':''}"><div><strong>${escapeHtml(jpText(name))} ×${target}</strong><small>${escapeHtml(jpText(where))}</small></div><label>所持 <input inputmode="numeric" min="0" type="number" value="${owned}" data-island-material="${escapeHtml(name)}" data-rank="${rank}" data-target="${target}" data-shortage-id="${shortageId(rank,index)}"></label><span id="${shortageId(rank,index)}" class="material-need">${need===0?'揃った':`不足 ${need}`}</span></article>`}).join("")}</div>`}
function renderIsland(){const rank=islandRank(),data=ISLAND_GUIDE[rank],daily=dailyForRank(rank);$("islandRank").value=String(rank);$("islandTitle").textContent=jpText(data.title);$("islandGranary").innerHTML=`<strong>グラナリー</strong><span>${escapeHtml(jpText(data.granary))}</span><small>完了条件：${escapeHtml(jpText(data.completion))}</small>`;$("islandRankTasks").innerHTML=`<ol class="action-steps">${data.steps.map(step=>`<li>${escapeHtml(jpText(step))}</li>`).join("")}</ol>`;renderMaterials(rank,data);$("islandDaily").innerHTML=daily.map(([id,label])=>{const done=localStorage.getItem(dailyKey(id))==="1";return`<label class="check-row${done?' done':''}"><input type="checkbox" data-island-daily="${id}" ${done?'checked':''}><span>${escapeHtml(label)}</span></label>`}).join("");const done=daily.filter(([id])=>localStorage.getItem(dailyKey(id))==="1").length;$("islandProgress").textContent=`今日 ${done}/${daily.length} 完了`}
async function api(path,options){const response=await fetch(path,options);let data={};try{data=await response.json()}catch{}if(!response.ok)throw new Error(data.detail||data.error||`通信エラー ${response.status}`);return data}
function renderLeveling(code){const selected=currentLevelJobs.find(job=>job.code===code);if(!selected){$("levelingChoice").innerHTML="<strong>ジョブを選んでください</strong><span>選択するまで育成方法は決めません。</span>";$("levelingResult").innerHTML="";return}const{job,methods}=levelingRecommendations(selected);$("levelingChoice").innerHTML=`<strong>${escapeHtml(job.name)} Lv${job.level} → Lv${job.cap}</strong><span>${escapeHtml(groupLabel(job.group))} / 画面どおりに実行</span>`;$("levelingResult").innerHTML=methods.map((row,index)=>`<article class="method-row"><span class="method-rank">${row.rank===0?'固有':index+1}</span><div><div class="method-title">${escapeHtml(jpText(row.title))}${row.tag?` <span class="pill">${escapeHtml(jpText(row.tag))}</span>`:""}</div><p>${escapeHtml(jpText(row.reason))}</p>${row.steps?.length?`<ol class="method-steps">${row.steps.map(step=>`<li>${escapeHtml(jpText(step))}</li>`).join("")}</ol>`:""}${row.completion?`<div class="completion"><strong>終わり：</strong>${escapeHtml(jpText(row.completion))}</div>`:""}</div></article>`).join("")}
function populateLeveling(rawJobs){currentLevelJobs=levelableJobs(rawJobs);const select=$("levelJobSelect");const maxCount=(Array.isArray(rawJobs)?rawJobs:[]).filter(job=>Number(job?.level)>=100).length;$("levelingMeta").textContent=`育成候補 ${currentLevelJobs.length} / Lv100 ${maxCount}`;if(!currentLevelJobs.length){select.innerHTML='<option value="">育成できるジョブがありません</option>';select.disabled=true;renderLeveling("");return}const groups=["battle","crafter","gatherer"],parts=['<option value="">ジョブを選ぶ</option>'];for(const group of groups){const rows=currentLevelJobs.filter(job=>job.group===group);if(!rows.length)continue;parts.push(`<optgroup label="${escapeHtml(groupLabel(group))}">`,...rows.map(job=>`<option value="${escapeHtml(job.code)}">${escapeHtml(job.name)}　Lv${job.level}</option>`),"</optgroup>")}select.innerHTML=parts.join("");select.disabled=false;const saved=localStorage.getItem(LEVEL_JOB_KEY)||"";if(currentLevelJobs.some(job=>job.code===saved)){select.value=saved;renderLeveling(saved)}else{select.value="";renderLeveling("")}}
function renderProfile(data){const c=data?.character;if(c){$("characterName").textContent=c.name||"Kanade";$("characterWorld").textContent=[c.world,c.data_center].filter(Boolean).join(" · ");$("syncText").textContent=`最終同期 ${fmtDate(c.synced_at)}`;populateLeveling(c.jobs||[])}else{$("characterName").textContent="Lodestone未同期";$("characterWorld").textContent="同期すると現在Lvから育成方法を選べます。";$("syncText").textContent="未同期";populateLeveling([])}}
async function loadProfile(){try{renderProfile(await api("/api/profile"))}catch(error){$("status").textContent=`読み込み失敗：${error.message}`}}
function setBusy(button,busy,label){if(!button)return;button.disabled=busy;if(label)button.textContent=label}
function timeLabel(ms){if(!ms)return"";return new Intl.DateTimeFormat("ja-JP",{timeZone:"Asia/Tokyo",hour:"2-digit",minute:"2-digit"}).format(new Date(ms))}
async function loadGathering(){const button=$("gatherButton");setBusy(button,true,"取得中…");$("gatherResult").innerHTML="";try{const data=await api("/api/gathering/timed");$("gatherResult").innerHTML=`<p class="result-note">押した時点から12時間以内。名前・場所・座標・ETをそのまま使えます。</p><div class="result-list">${(data.rows||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(jpText(row.title))}</strong><small>${row.time_window?.state==="open"?'<span class="pill">いま採れる</span>':`<span class="pill">${timeLabel(row.time_window?.start_at_ms)}〜</span>`}${escapeHtml(jpText(row.reason))}</small></div>`).join("")||'<div class="result-row"><small>現在のLvで表示できる時限候補はありません。</small></div>'}</div>`}catch(error){$("gatherResult").innerHTML=`<p class="result-note">取得失敗：${escapeHtml(error.message)}</p>`}finally{setBusy(button,false,"時限採集を取得")}}
async function loadFishing(mode="all"){document.querySelectorAll("[data-fish-mode]").forEach(b=>b.disabled=true);$("fishResult").innerHTML="";try{const data=await api(`/api/fishing/candidates?mode=${encodeURIComponent(mode)}`);const exp=(data.experience||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(jpText(row.title))}</strong><small>${escapeHtml(jpText(row.reason))}</small></div>`).join("");const big=(data.big_fish||[]).map(row=>`<div class="result-row"><strong>${escapeHtml(jpText(row.name))}</strong><small><span class="pill">${timeLabel(row.start_at_ms)}〜</span>${escapeHtml(jpText([row.zone,row.location,row.weather,row.bait?.length?`餌: ${row.bait.join(" → ")}`:""].filter(Boolean).join(" / ")))}</small></div>`).join("");$("fishResult").innerHTML=`<p class="result-note">漁師Lv${data.fisher_level||0} / 釣り候補データ</p><div class="result-list">${exp}${big||(!exp?'<div class="result-row"><small>現在24時間以内に表示できるヌシ候補はありません。</small></div>':"")}</div>`}catch(error){$("fishResult").innerHTML=`<p class="result-note">取得失敗：${escapeHtml(error.message)}</p>`}finally{document.querySelectorAll("[data-fish-mode]").forEach(b=>b.disabled=false)}}
$("levelJobSelect")?.addEventListener("change",event=>{const code=event.target.value||"";if(code)localStorage.setItem(LEVEL_JOB_KEY,code);else localStorage.removeItem(LEVEL_JOB_KEY);renderLeveling(code)});
$("islandRank")?.addEventListener("change",event=>{localStorage.setItem(RANK_KEY,event.target.value);renderIsland()});
document.addEventListener("change",event=>{const id=event.target?.dataset?.islandDaily;if(!id)return;localStorage.setItem(dailyKey(id),event.target.checked?"1":"0");renderIsland()});
document.addEventListener("input",event=>{const input=event.target;if(!input?.dataset?.islandMaterial)return;const rank=Number(input.dataset.rank),name=input.dataset.islandMaterial,target=Number(input.dataset.target),owned=Math.max(0,Number(input.value)||0);localStorage.setItem(materialStorageKey(rank,name),String(Math.floor(owned)));const node=$(input.dataset.shortageId);if(node){const need=shortage(target,owned);node.textContent=need===0?"揃った":`不足 ${need}`;input.closest(".material-row")?.classList.toggle("complete",need===0)}});
$("syncButton")?.addEventListener("click",async()=>{const b=$("syncButton");setBusy(b,true,"同期中…");try{await api("/api/sync",{method:"POST"});await loadProfile();$("status").textContent="Lodestone同期が完了しました。"}catch(error){$("status").textContent=`同期失敗：${error.message}`}finally{setBusy(b,false,"Lodestone同期")}});
$("gatherButton")?.addEventListener("click",loadGathering);document.querySelectorAll("[data-fish-mode]").forEach(button=>button.addEventListener("click",()=>loadFishing(button.dataset.fishMode)));
renderIsland();void loadProfile();