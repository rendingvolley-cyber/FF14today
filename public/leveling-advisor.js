const GROUP_LABELS = {
  battle: "戦闘ジョブ",
  crafter: "クラフター",
  gatherer: "ギャザラー"
};

const JOBS = {
  PLD:{group:"battle",role:"tank"}, WAR:{group:"battle",role:"tank"}, DRK:{group:"battle",role:"tank"}, GNB:{group:"battle",role:"tank"},
  WHM:{group:"battle",role:"healer"}, SCH:{group:"battle",role:"healer"}, AST:{group:"battle",role:"healer"}, SGE:{group:"battle",role:"healer"},
  MNK:{group:"battle",role:"dps"}, DRG:{group:"battle",role:"dps"}, NIN:{group:"battle",role:"dps"}, SAM:{group:"battle",role:"dps"}, RPR:{group:"battle",role:"dps"}, VPR:{group:"battle",role:"dps"},
  BRD:{group:"battle",role:"dps"}, MCH:{group:"battle",role:"dps"}, DNC:{group:"battle",role:"dps"},
  BLM:{group:"battle",role:"dps"}, SMN:{group:"battle",role:"dps"}, RDM:{group:"battle",role:"dps"}, PCT:{group:"battle",role:"dps"},
  BLU:{group:"battle",role:"limited",cap:80},
  CRP:{group:"crafter",role:"crafter"}, BSM:{group:"crafter",role:"crafter"}, ARM:{group:"crafter",role:"crafter"}, GSM:{group:"crafter",role:"crafter"},
  LTW:{group:"crafter",role:"crafter"}, WVR:{group:"crafter",role:"crafter"}, ALC:{group:"crafter",role:"crafter"}, CUL:{group:"crafter",role:"crafter"},
  MIN:{group:"gatherer",role:"gatherer"}, BTN:{group:"gatherer",role:"gatherer"}, FSH:{group:"gatherer",role:"fisher"}
};

const NAME_TO_CODE = new Map(Object.entries({
  ナイト:"PLD",戦士:"WAR",暗黒騎士:"DRK",ガンブレイカー:"GNB",白魔道士:"WHM",学者:"SCH",占星術師:"AST",賢者:"SGE",
  モンク:"MNK",竜騎士:"DRG",忍者:"NIN",侍:"SAM",リーパー:"RPR",ヴァイパー:"VPR",吟遊詩人:"BRD",機工士:"MCH",踊り子:"DNC",
  黒魔道士:"BLM",召喚士:"SMN",赤魔道士:"RDM",ピクトマンサー:"PCT",青魔道士:"BLU",
  木工師:"CRP",鍛冶師:"BSM",甲冑師:"ARM",彫金師:"GSM",革細工師:"LTW",裁縫師:"WVR",錬金術師:"ALC",調理師:"CUL",
  採掘師:"MIN",園芸師:"BTN",漁師:"FSH"
}));

function normalizedCode(job){
  const direct=String(job?.code||"").toUpperCase();
  if(JOBS[direct]) return direct;
  const name=String(job?.name_ja||job?.name||"").trim();
  return NAME_TO_CODE.get(name)||direct;
}

export function jobInfo(job){
  const code=normalizedCode(job);
  const base=JOBS[code]||null;
  if(!base) return null;
  const level=Number(job?.level||0);
  const cap=base.cap||100;
  return {
    ...job,
    code,
    level:Number.isFinite(level)?level:0,
    cap,
    group:base.group,
    role:base.role,
    name:String(job?.name_ja||job?.name||code)
  };
}

export function levelableJobs(jobs){
  const order={battle:0,crafter:1,gatherer:2};
  return (Array.isArray(jobs)?jobs:[])
    .map(jobInfo)
    .filter(job=>job&&job.level>0&&job.level<job.cap)
    .sort((a,b)=>(order[a.group]-order[b.group])||(b.level-a.level)||a.name.localeCompare(b.name,"ja"));
}

export function groupLabel(group){return GROUP_LABELS[group]||group}

function method(rank,title,reason,tag="") { return {rank,title,reason,tag}; }

function battleMethods(job){
  const level=job.level;
  if(job.role==="limited"){
    return [
      method(1,"適正レベル以上のフィールド敵で青魔道士EXPを稼ぐ","青魔道士は通常ジョブと育成ルートが別。未修得青魔法を集めつつ、倒せる高レベル敵を回す。","青魔専用"),
      method(2,"青魔道士ジョブクエストを進める","レベル条件を満たしたらジョブクエストと必須青魔法を先に回収する。","優先"),
      method(3,"協力者がいるならフィールド狩りを高速化","パーティ条件に注意しつつ、育成だけを急ぐ日は高レベル側の支援を使う。","解放済みなら")
    ];
  }
  if(level<15){
    return [
      method(1,"クラス／ジョブクエストを進める",`Lv${level}帯は新アクション解放を優先。受注できるクエストを先に消化する。`,"最優先"),
      method(2,"討伐手帳を埋める","序盤は移動しながらまとまった経験値を取れる。未達成の低ランクから進める。","序盤向け"),
      method(3,"近いFATEを回る","次のクエストやダンジョン解放までの不足分を埋める用途。","繰り返し")
    ];
  }

  const queue = job.role==="dps"
    ? "DPSは待ち時間が出やすいので、対応しているIDならDuty Support／Trustも候補。待機中はFATEを挟む。"
    : "タンク／ヒーラーはマッチングしやすいので、適正ID周回を主軸にしやすい。";
  const dungeon = method(1,"現在Lvで入れる最高レベルのレベリングID",`Lv${level}ならレベルキャップIDではなく、経験値が入る適正レベルのダンジョンを優先。${queue}`,"主力");

  if(level<50){
    return [dungeon,method(2,"ジョブクエストを優先して消化","新アクション・装備解放を取りこぼさない。レベル条件に到達したら先に進める。","重要"),method(3,"ID待ちの間にFATE／攻略手帳","キュー待ちの空き時間だけフィールド経験値を足す。","待ち時間用")];
  }
  if(level<61){
    return [dungeon,method(2,"死者の宮殿（解放済みなら）","通常IDと気分を変えたい時の反復候補。装備更新に左右されにくい。","選択肢"),method(3,"FATE／攻略手帳で端数調整","次のレベルまで少しだけ足りない時に使う。","補助")];
  }
  if(level<71){
    return [dungeon,method(2,"アメノミハシラ（解放済みなら）","Lv61〜70帯の反復候補。マッチング待ちを避けたい時にも使える。","選択肢"),method(3,"FATEで不足分を埋める","適正エリアのFATEを移動ついでに回す。","補助")];
  }
  if(level<81){
    return [dungeon,method(2,"南方ボズヤ戦線／ザトゥノル高原（解放済みなら）","Lv71以降の別ルート。複数ジョブをまとめて上げたい時にも使いやすい。","選択肢"),method(3,"FATEでID待ち時間を埋める","DPSならキュー待ちと相性がいい。","補助")];
  }
  if(level<91){
    return [dungeon,method(2,"オルト・エウレカ（解放済みなら）","Lv81以降の反復候補。通常ID以外で育てたい日に使う。","選択肢"),method(3,"適正エリアFATE","次のID解放までの端数や待ち時間用。","補助")];
  }
  const shared = [dungeon,method(2,"黄金エリアのFATE","Lv90台の不足分・ID待ちを埋める。バイカラージェムも同時に進められる。","補助"),method(3,"ヴァリアントダンジョン『商客物語』（解放済みなら）","Lv90以上はクリア時に装備中ジョブへ経験値が入る。ロール制限なしで気分転換に使える。","選択肢")];
  if(job.code==="SMN"||job.code==="SCH") shared.unshift(method(0,"召喚士と学者はレベル共有","巴術士の経験値を共有するため、召喚士／学者どちらで稼いでも両方のレベルが上がる。","固有"));
  return shared;
}

function crafterMethods(job){
  const level=job.level;
  if(level<20) return [
    method(1,"製作手帳の初回製作ボーナスを回収","未製作レシピを1回ずつ作りながらクラスクエストを進める。","主力"),
    method(2,"クラスクエストを進める","新しいアクションや装備更新の節目を優先。","重要")
  ];
  if(level<50) return [
    method(1,"イシュガルド復興の製作（解放済みなら）","素材をまとめて用意できるなら反復しやすい。","主力候補"),
    method(2,"製作手帳の未製作を埋める","初回経験値を拾いながらレシピを広げる。","補助"),
    method(3,"クラスクエスト","レベル条件に到達したものは先に消化。","重要")
  ];
  if(level<80) return [
    method(1,"現在Lv帯の収集品納品","繰り返し可能で、素材を確保できるなら安定して経験値を積める。","主力"),
    method(2,"お得意様取引","週制限はあるが経験値効率が良い。上げたいクラフターにまとめて使う。","週制限"),
    method(3,"イシュガルド復興（解放済みなら）","収集品用素材が面倒な時の代替ルート。","選択肢")
  ];
  if(level<90) return [
    method(1,"現在Lv帯の収集品納品","Lv80台も繰り返しの軸。低すぎる収集品は避け、現在帯のものを選ぶ。","主力"),
    method(2,"シャーレアン魔法大学取引（未完了なら）","一度きりのまとまった経験値を、上げたい系統へ使う。","一度きり"),
    method(3,"お得意様取引","週分を集中投入。","週制限")
  ];
  return [
    method(1,"Lv90台の収集品納品","Lv90以下の古い収集品ではなく、黄金エリアの現在Lv帯を選ぶ。","主力"),
    method(2,"ワチュメキメキ万貨街取引（未完了なら）","Lv90台の一度きりの大量経験値。対象系統の納品を優先する。","一度きり"),
    method(3,"お得意様取引","週分をこのジョブへ集中して使う。","週制限")
  ];
}

function gathererMethods(job){
  const level=job.level;
  if(job.role==="fisher"){
    const rows=[method(1,"オーシャンフィッシング","漁師のレベル上げはこれを主軸にしやすい。開催タイミングが合う時にまとめて稼ぐ。","主力")];
    if(level<50) rows.push(method(2,"釣り手帳の新規魚＋クラスクエスト","新規魚の手帳経験値を拾いながら装備とアクションを更新。","補助"));
    else rows.push(method(2,"釣り手帳の未取得魚を埋める","待ち時間なしで進めたい時の常設候補。","補助"));
    if(level>=90) rows.push(method(3,"ワチュメキメキ万貨街取引（未完了なら）","漁師枠の一度きり経験値を回収する。","一度きり"));
    else if(level>=60) rows.push(method(3,"お得意様取引","週制限分を漁師に投入できる。","週制限"));
    return rows;
  }
  if(level<50) return [
    method(1,"採集手帳の未採集を埋める","適正レベル帯の新規採集ポイントを回り、初回経験値を回収する。","主力"),
    method(2,"クラスクエスト","装備・アクションの節目なので条件到達時に進める。","重要"),
    method(3,"ディアデム諸島（解放済みなら）","採集を止めずに連続で経験値を積みたい時の候補。","選択肢")
  ];
  if(level<80) return [
    method(1,"現在Lv帯の収集品採集・納品","採掘師／園芸師の安定した反復ルート。","主力"),
    method(2,"お得意様取引","週制限分を上げたいギャザラーへ集中。","週制限"),
    method(3,"ディアデム諸島（解放済みなら）","時間を気にせず採集だけ続けたい時に使う。","選択肢")
  ];
  if(level<90) return [
    method(1,"現在Lv帯の収集品採集・納品","Lv80台の主力。適正レベルの収集品を狙う。","主力"),
    method(2,"シャーレアン魔法大学取引（未完了なら）","採掘／園芸系統の一度きり経験値を回収。","一度きり"),
    method(3,"お得意様取引","週分を集中。","週制限")
  ];
  return [
    method(1,"黄金エリアの収集品採集・納品","Lv90台の主力。現在Lv帯の収集品を選ぶ。","主力"),
    method(2,"ワチュメキメキ万貨街取引（未完了なら）","採掘／園芸系統の一度きり経験値を回収。","一度きり"),
    method(3,"時限・未知の採集ポイントを回る","取得ボタンの時限採集候補と組み合わせ、経験値と素材回収を同時に進める。","併用")
  ];
}

export function levelingRecommendations(rawJob){
  const job=jobInfo(rawJob);
  if(!job) return {job:null,methods:[]};
  if(job.level>=job.cap) return {job,methods:[method(1,"現在のレベル上限です",`${job.name}はLv${job.cap}に到達済み。`,"MAX")]};
  const methods=job.group==="battle"?battleMethods(job):job.group==="crafter"?crafterMethods(job):gathererMethods(job);
  return {job,methods};
}
