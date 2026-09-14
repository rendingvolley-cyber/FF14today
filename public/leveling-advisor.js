const GROUP_LABELS={battle:"戦闘ジョブ",crafter:"クラフター",gatherer:"ギャザラー"};
const JOBS={PLD:{group:"battle",role:"tank"},WAR:{group:"battle",role:"tank"},DRK:{group:"battle",role:"tank"},GNB:{group:"battle",role:"tank"},WHM:{group:"battle",role:"healer"},SCH:{group:"battle",role:"healer"},AST:{group:"battle",role:"healer"},SGE:{group:"battle",role:"healer"},MNK:{group:"battle",role:"dps"},DRG:{group:"battle",role:"dps"},NIN:{group:"battle",role:"dps"},SAM:{group:"battle",role:"dps"},RPR:{group:"battle",role:"dps"},VPR:{group:"battle",role:"dps"},BRD:{group:"battle",role:"dps"},MCH:{group:"battle",role:"dps"},DNC:{group:"battle",role:"dps"},BLM:{group:"battle",role:"dps"},SMN:{group:"battle",role:"dps"},RDM:{group:"battle",role:"dps"},PCT:{group:"battle",role:"dps"},BLU:{group:"battle",role:"limited",cap:80},CRP:{group:"crafter",role:"crafter"},BSM:{group:"crafter",role:"crafter"},ARM:{group:"crafter",role:"crafter"},GSM:{group:"crafter",role:"crafter"},LTW:{group:"crafter",role:"crafter"},WVR:{group:"crafter",role:"crafter"},ALC:{group:"crafter",role:"crafter"},CUL:{group:"crafter",role:"crafter"},MIN:{group:"gatherer",role:"gatherer"},BTN:{group:"gatherer",role:"gatherer"},FSH:{group:"gatherer",role:"fisher"}};
const NAME_TO_CODE=new Map(Object.entries({ナイト:"PLD",戦士:"WAR",暗黒騎士:"DRK",ガンブレイカー:"GNB",白魔道士:"WHM",学者:"SCH",占星術師:"AST",賢者:"SGE",モンク:"MNK",竜騎士:"DRG",忍者:"NIN",侍:"SAM",リーパー:"RPR",ヴァイパー:"VPR",吟遊詩人:"BRD",機工士:"MCH",踊り子:"DNC",黒魔道士:"BLM",召喚士:"SMN",赤魔道士:"RDM",ピクトマンサー:"PCT",青魔道士:"BLU",木工師:"CRP",鍛冶師:"BSM",甲冑師:"ARM",彫金師:"GSM",革細工師:"LTW",裁縫師:"WVR",錬金術師:"ALC",調理師:"CUL",採掘師:"MIN",園芸師:"BTN",漁師:"FSH"}));
const DUNGEONS=[
[15,"天然要害 サスタシャ浸食洞"],[16,"地下霊殿 タムタラの墓所"],[17,"封鎖坑道 カッパーベル銅山"],[20,"魔獣領域 ハラタリ修練所"],[24,"監獄廃墟 トトラクの千獄"],[28,"名門屋敷 ハウケタ御用邸"],[32,"奪還支援 ブレイフロクスの野営地"],[35,"遺跡探索 カルン埋没寺院"],[38,"流砂迷宮 カッターズクライ"],[41,"城塞攻略 ストーンヴィジル"],[44,"掃討作戦 ゼーメル要塞"],[47,"霧中行軍 オーラムヴェイル"],[51,"廃砦捜索 ダスクヴィジル"],[53,"霊峰踏破 ソーム・アル"],[55,"邪竜血戦 ドラゴンズエアリー"],[57,"強硬突入 イシュガルド教皇庁"],[59,"禁書回収 グブラ幻想図書館"],[61,"漂流海域 セイレーン海"],[63,"海底宮殿 紫水宮"],[65,"伝統試練 バルダム覇道"],[67,"解放決戦 ドマ城"],[69,"巨砲要塞 カストルム・アバニア"],[71,"殺戮郷村 ホルミンスター"],[73,"水妖幻園 ドォーヌ・メグ"],[75,"古跡探索 キタンナ神影洞"],[77,"爽涼離宮 マリカの大井戸"],[79,"偽造天界 グルグ火山"],[81,"異形楼閣 ゾットの塔"],[83,"魔導神門 バブイルの塔"],[85,"終末樹海 ヴァナスパティ"],[87,"創造環境 ヒュペルボレア造物院"],[89,"星海潜航 アイティオン星晶鏡"],[91,"濁流遡上 イフイカ・トゥム"],[93,"山嶺登頂 ウォーコー・ゾーモー"],[95,"遺産踏査 天深きセノーテ"],[97,"外征前哨 ヴァンガード"],[99,"魂魄工廠 オリジェニクス"]
];
function normalizedCode(job){const direct=String(job?.code||"").toUpperCase();if(JOBS[direct])return direct;return NAME_TO_CODE.get(String(job?.name_ja||job?.name||"").trim())||direct}
export function jobInfo(job){const code=normalizedCode(job),base=JOBS[code];if(!base)return null;const level=Number(job?.level||0);return {...job,code,level:Number.isFinite(level)?level:0,cap:base.cap||100,group:base.group,role:base.role,name:String(job?.name_ja||job?.name||code)}}
export function levelableJobs(jobs){const order={battle:0,crafter:1,gatherer:2};return(Array.isArray(jobs)?jobs:[]).map(jobInfo).filter(j=>j&&j.level>0&&j.level<j.cap).sort((a,b)=>(order[a.group]-order[b.group])||(b.level-a.level)||a.name.localeCompare(b.name,"ja"))}
export function groupLabel(group){return GROUP_LABELS[group]||group}
function method(rank,title,reason,tag="",steps=[],completion=""){return{rank,title,reason,tag,steps,completion}}
export function dungeonForLevel(level){let current=null;for(const row of DUNGEONS){if(level>=row[0])current={level:row[0],name:row[1]};else break}return current}
function battleMethods(job){
 if(job.role==="limited")return[method(1,"青魔道士は通常ルートから分離","青魔法の修得状況で最適解が変わるため、自動で通常IDを勧めません。","青魔専用",["未修得の重要青魔法を先に確認","レベル上げだけなら自分より高いフィールド敵を対象にする","協力者がいる場合はパワーレベリングを使う"],"Lv80到達")];
 if(job.level<15)return[method(1,"クラス／ジョブクエスト＋討伐手帳","Lv15までをまず作る。","今やる",["受注可能なクラス／ジョブクエストを完了","討伐手帳の未達成対象を上から処理","Lv15になったらサスタシャへ切り替え"],"Lv15到達")];
 const d=dungeonForLevel(job.level);const queue=job.role==="dps"?"DPS待ちが長ければ、対応IDはコンテンツサポーターで即開始。CF申請するなら待ち時間だけFATEを1個ずつ処理。":"CFで申請。タンク／ヒーラーは待ち時間が短いことが多いのでID周回を優先。";
 const steps=[`コンテンツファインダーで「${d.name}」を開く`,queue,"1周クリアする",`Lv${job.level+1}になったらジョブを再選択し、次の適正IDへ更新する`];
 const primary=method(1,`${d.name}を1周 → レベルが上がるまで繰り返す`,`Lv${job.level}で経験値が入る中で、現在Lv以下の最高レベルのレベリングIDを具体指定。`,`主力`,steps,`Lv${job.level+1}到達`);
 const rows=[primary];
 if(job.role==="dps")rows.push(method(2,"CF待ち中だけFATEを処理","IDをやめてFATE周回するのではなく、待ち時間を空白にしない用途。","待ち時間用",["IDをCF申請","現在地の適正FATEを1つ処理","シャキったら即IDへ戻る"],"ID突入"));
 if(job.code==="SMN"||job.code==="SCH")rows.unshift(method(0,"召喚士／学者はレベル共有","どちらで経験値を稼いでも同じ巴術士レベルが上がる。","固有",["使いたい方で上記IDへ行く"],"共有レベル上昇"));
 return rows;
}
function crafterMethods(job){
 const band=job.level>=90?"黄金エリア":job.level>=80?"暁月エリア":"現在レベル帯";
 return[
  method(1,"収集品を『今のLv以下で一番高いもの』に固定して納品",`${job.name} Lv${job.level}は、何を作るか探し回らず収集品窓口の最上位対象を1種類に固定する。`,`主力`,["収集品取引窓口を開く",`${job.name}の一覧でLv${job.level}以下の最上位対象を1つ選ぶ`,`製作手帳でその品だけをお気に入り登録`,`必要素材をまとめて用意し、最低納品ライン以上の収集価値で連続製作`,`収集品取引窓口へまとめて納品`,`レベルが上がったら一覧を開き直し、より上位が解禁された時だけ品を変更`],`Lv${job.level+1}到達`),
  method(2,`${band}の一度きり納品が残っていれば先に消化`,"一度きり報酬は反復製作より先に回収する。",job.level>=90?"ワチュメキメキ":"クラス系",[job.level>=90?"ワチュメキメキ万貨街の対象系統に未完了納品があるか確認":"未完了のクラス／系統クエストを確認","残っていれば先に完了","終わったら収集品連続納品へ戻る"],"未完了一度きり報酬を消化")
 ];
}
function gathererMethods(job){
 if(job.role==="fisher")return[
  method(1,"オーシャンフィッシングに参加","開催枠が合うなら、漁師の経験値稼ぎをこれに固定する。","主力",["リムサ・ロミンサ：下甲板層 X:3.0 Y:12.7へ移動","Dryskthotaに話しかけて『航路を確認』","出航受付中なら参加申請","餌が無ければ隣のMerchant & MenderでVersatile Lure等を購入","3海域を最後まで釣る","帰港後、次の出航まで2時間あるので別作業へ切り替える"],"1航海完了。次の開催枠まで別作業"),
  method(2,"開催待ちは釣り手帳の未取得を埋める","何を釣るか探す時間を減らすため、未取得マークが付いた穴を上から埋める。","待ち時間用",["釣り手帳を開く","現在Lv以下の未取得魚がある釣り場を選択","マップ表示して現地へ移動","未取得が消えるまで釣る"],"次のオーシャン受付開始")
 ];
 return[
  method(1,"収集品を『今のLv以下で一番高いもの』に固定して採る",`${job.name} Lv${job.level}は、収集品取引の最上位対象1種類だけを回す。`,`主力`,["収集品取引窓口でギャザラー欄を開く",`${job.name}でLv${job.level}以下の最上位対象を1つ選ぶ`,`採集手帳でその素材を検索し『採集場所を表示』`,`現地で収集品採集を有効にして必要数を採る`,`収集品取引窓口へまとめて納品`,`レベルが上がったら最上位対象だけ更新`],`Lv${job.level+1}到達`),
  method(2,"時限対象なら下の『時限採集を取得』を使う","時間条件がある素材だけは現在時刻から候補を自動表示する。","補助",["時限採集を取得を押す","『いま採れる』を優先","表示された場所・座標へ移動して採集"],"必要数採集")
 ];
}
export function levelingRecommendations(rawJob){const job=jobInfo(rawJob);if(!job)return{job:null,methods:[]};if(job.level>=job.cap)return{job,methods:[method(0,"レベル上限到達","このジョブはレベル上げ不要。","完了",[],`Lv${job.cap}`)]};const methods=job.group==="battle"?battleMethods(job):job.group==="crafter"?crafterMethods(job):gathererMethods(job);return{job,methods}}
