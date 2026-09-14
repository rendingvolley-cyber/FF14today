export const ISLAND_GUIDE = {
  3: {
    title: "Workshop Iを2棟完成して『A Workshop of Wonders』を完了",
    steps: [
      "開拓用ストーンハンマーを製作する（石3・原木2・つる4）",
      "ストーンハンマーで石灰岩を採れる状態にする",
      "Pathological Pathfinder Mk. Iに話してFacility Plot I/IIを開放する",
      "Workshop Iを2棟建てる。1棟目は即時、2棟目は1〜2時間",
      "1棟目完成後に『A Workshop of Wonders』を報告して完了"
    ],
    completion: "Workshop Iが2棟あり、『A Workshop of Wonders』報告済み",
    materials: [
      ["パームリーフ",20,"ヤシ系の採集ポイント"],["砂",10,"浜辺の砂"],["石",3,"岩系ポイント"],["原木",22,"Tualong/Mahogany系の木"],["つる",14,"つる植物"],["石灰岩",20,"Smooth White Rock／ストーンハンマー必須"]
    ],
    granary: "まだ未解放"
  },
  4: {
    title: "拠点拡張＋最初のランドマークを完成",
    steps: [
      "Cozy Cabin IIへ改築する",
      "Cozy Cabin II完成後、Cropland IIとPasture IIへ拡張する",
      "Basic Mammet-sized Builder's Toolsを製作する",
      "Pathological Pathfinder Mk. IIへ工具＋Seafarer's Cowries 500を渡しLandmark Plot Iを開放する",
      "迷わない既定案としてQuixotic Windmillを建てる（11〜12時間）"
    ],
    completion: "Cozy Cabin II・Cropland II・Pasture II・Landmark Iが完成",
    materials: [
      ["Seafarer's Cowries",2500,"拠点拡張等に使用"],["パームリーフ",5,"ヤシ系採集"],["原木",25,"通常進行10＋風車15"],["パーム原木",25,"通常進行15＋風車10"],["つる",25,"通常進行20＋風車5"],["銅鉱",20,"通常進行15＋風車5／Bluish Rock"],["石灰岩",35,"通常進行20＋風車15／Smooth White Rock"]
    ],
    granary: "まだ未解放。Rank 5で開放"
  },
  5: {
    title: "3棟目Workshop＋Granary Iを建てる",
    steps: [
      "開拓用シャベルを製作する（原木3・つる3・銅鉱4）",
      "シャベルで粘土とティンサンドを採れる状態にする",
      "Better Mammet-sized Builder's Toolsを製作する",
      "Pathological Pathfinder Mk. IIIへ工具＋Cowries 1,000を渡す",
      "3棟目のWorkshop Iと1棟目のGranary Iを同時に建築する（各1〜2時間）",
      "2つ目のランドマークを建てる。既定案はBoiling Bathhouse"
    ],
    completion: "Workshop I×3、Granary I×1、Landmark×2が完成",
    materials: [
      ["Seafarer's Cowries",1000,"拡張費"],["パームリーフ",20,"通常進行10＋Bathhouse10"],["砂",5,"浜辺"],["原木",38,"通常進行23＋Bathhouse15"],["パーム原木",20,"ヤシ"],["つる",13,"つる植物"],["銅鉱",24,"Bluish Rock"],["石灰岩",35,"通常進行20＋Bathhouse15"],["粘土",30,"通常進行20＋Bathhouse10／シャベル必須"],["ティンサンド",10,"Submerged Sand／シャベル必須"],["クラム",3,"Pirate Bay付近のLarge Shell"]
    ],
    granary: "Granary I建築後、まず森林系へ派遣。Rank 8用Spruce Log×6を先取り"
  },
  6: {
    title: "Workshop II×3＋Granary IIへ一斉改築",
    steps: [
      "開拓用カッパーサイズを製作する",
      "カッパーサイズでヘンプを採れる状態にする",
      "Workshop I×3をWorkshop IIへ同時改築する（各6〜7時間）",
      "Granary IをGranary IIへ改築する（6〜7時間）",
      "完成した4施設のEXPを回収して次ランクへ進む"
    ],
    completion: "Workshop II×3、Granary II×1が完成",
    materials: [["原木",60,"木"],["パーム原木",15,"ヤシ"],["銅鉱",15,"Bluish Rock"],["石灰岩",45,"Smooth White Rock"],["粘土",20,"Mound of Dirt"],["ティンサンド",5,"Submerged Sand"],["ヘンプ",40,"カッパーサイズ必須"]],
    granary: "Spruce Logが6未満なら森林系を継続。次にRaw Garnet×9を狙う"
  },
  7: {
    title: "拠点自動化＋2棟目Granaryを完成",
    steps: [
      "開拓用ブロンズギグを製作する",
      "Cozy Cabin IIIへ改築する",
      "Cropland III/Pasture IIIへ拡張し、それぞれ専用Mammet Toolsを製作して自動化する",
      "Best Mammet-sized Builder's Toolsを製作し、Pathfinder Mk. IVへ工具＋Cowries 1,500を渡す",
      "2棟目Granary Iを建て、続けてGranary IIへ改築する",
      "3つ目のランドマークを建てる"
    ],
    completion: "畑・放牧地が最大拡張＆自動化、Granary II×2、Landmark×3",
    materials: [["Seafarer's Cowries",4500,"自動化＋拡張"],["パームリーフ",6,"ヤシ"],["原木",54,"木"],["パーム原木",31,"ヤシ"],["つる",5,"つる"],["銅鉱",25,"Bluish Rock"],["石灰岩",10,"Smooth White Rock"],["粘土",30,"土"],["ティンサンド",30,"水中砂"],["コットンボール",20,"採集"],["ヘンプ",34,"採集"]],
    granary: "Rank 8改築用にSpruce Log×6、Raw Garnet×9を最優先"
  },
  8: {
    title: "Workshop III×3＋Granary III×2へ改築",
    steps: [
      "開拓用ブロンズビークアクスを製作する",
      "Iron OreとLeucograniteを必要数まで採る",
      "Workshop II×3をWorkshop IIIへ改築する",
      "Granary II×2をGranary IIIへ改築する",
      "完成EXPを回収して不足分だけ採集する"
    ],
    completion: "Workshop III×3、Granary III×2が完成",
    materials: [["原木",60,"木"],["粘土",20,"土"],["ヘンプ",30,"採集"],["鉄鉱",75,"Bronze Beakaxe必須"],["ロイコグラナイト",65,"Bronze Beakaxe必須"],["Spruce Log",6,"Granary遠征"],["Raw Garnet",9,"Granary遠征"]],
    granary: "Spruce Log×6 / Raw Garnet×9が不足している方へ派遣"
  },
  9: {
    title: "Landmark Plot IVを開けて4つ目のランドマークを完成",
    steps: [
      "Bestest Mammet-sized Builder's Toolsを製作する",
      "Pathfinder Mk. Vへ工具＋Cowries 3,000を渡す",
      "Landmark Plot IVにランドマークを建築する（11〜12時間）",
      "Workshop×3 / Granary×2 / Landmark×4を確認して『The Perfect Paradise』を報告",
      "『The Land, Wind, and Sea』を完了してRank 10の飛行解放条件を済ませる"
    ],
    completion: "ランドマーク4つ＋The Perfect Paradise＋The Land, Wind, and Sea完了",
    materials: [["Seafarer's Cowries",3000,"拡張費"],["粘土",10,"土"],["ヘンプ",10,"採集"],["鉄鉱",10,"採掘"],["クォーツ",10,"採掘"],["ロイコグラナイト",10,"採掘"]],
    granary: "Rank 12用のResin / Wood Opalなど不足素材を先取り"
  },
  10: {
    title: "飛行を解放し、固定タスクがない期間は工房EXPを回収",
    steps: ["『The Land, Wind, and Sea』完了済みならマウント飛行を確認する","工房を止めず毎サイクル予約する","畑・放牧地・Granaryを回収する","Rank 12到達まで不足EXPのみ採集で補う"],
    completion: "飛行解放を確認し、Rank 11へ進む",
    materials: [], granary: "Rank 12以降の素材を先取り"
  },
  11: {
    title: "施設改築なし。Rank 12まで固定収入＋EXPを回収",
    steps: ["工房予約を切らさない","畑・放牧地・Granaryを回収する","Leek Set / Paprika Seedsの新規種を必要なら確保","Rank 12まで不足EXPだけ採集する"],
    completion: "Rank 12到達", materials: [], granary: "Resin / Wood Opal / QuartzなどRank 12用を補充"
  },
  12: {
    title: "Mountain Hollowを解放",
    steps: ["Rank 12到達で『Passionate Pioneering』を報告","『A Far Eastern Yarn』を完了する","Mammet-sized Spelunking Toolsを製作する","Determined Diggerへ渡してMountain Hollowを解放する","『Delightful Discovery』を報告する"],
    completion: "Mountain Hollow解放＋Delightful Discovery報告済み",
    materials: [["パーム原木",10,"ヤシ"],["鉄鉱",10,"採掘"],["クォーツ",10,"採掘"],["Resin",10,"木系採集"],["Wood Opal",10,"採集"]], granary: "Cave Shrimp等の洞窟遠征素材が必要なら洞窟系へ"
  },
  13: {
    title: "Cozy Cabin IV＋Granary IV×2へ改築",
    steps: ["開拓用スチールハンマーを製作する","Spectrine / Mythril Ore / Marbleを必要数まで採る","Cozy Cabin IVへ改築する（11〜12時間）","Granary III×2をGranary IVへ同時改築する（11〜12時間）","完成EXPを回収する"],
    completion: "Cozy Cabin IV、Granary IV×2完成",
    materials: [["Islewort",10,"採集"],["原木",3,"木"],["パーム原木",45,"ヤシ"],["鉄鉱",18,"採掘"],["Wood Opal",3,"採集"],["Coal",44,"洞窟採集"],["Spectrine",30,"Steel Hammer必須"],["Mythril Ore",20,"Steel Hammer必須"],["Marble",20,"Steel Hammer必須"]], granary: "不足しやすい洞窟素材を優先"
  },
  14: {
    title: "Workshop IV×3へ一斉改築",
    steps: ["原木30・鉄鉱30・Coal45・Spectrine30・Marble45を先に揃える","Workshop III×3をWorkshop IVへ同時改築する（11〜12時間）","3棟すべて完成後にEXPを回収する","Rank 15まで不足EXPのみ採集する"],
    completion: "Workshop IV×3完成",
    materials: [["原木",30,"木"],["鉄鉱",30,"採掘"],["Coal",45,"洞窟採集"],["Spectrine",30,"採掘"],["Marble",45,"採掘"]], granary: "Rank 15用Raw Garnet×3など不足素材へ"
  },
  15: {
    title: "4棟目Workshop＋5つ目Landmark＋Mother Lodeを解放",
    steps: ["Bestestest Mammet-sized Builder's Toolsを製作しPathfinder Mk. VIへ工具＋Cowries 3,000を渡す","4棟目Workshop Iを建築→II→III→IVまで順番に改築する","5つ目のランドマークを建てる","Workshop×4 / Granary×2 / Landmark×5を確認し『The Land of Luxury』を報告","『An Ideal Marriage』を完了する","Splendiferous Mammet-sized Spelunking Toolsを製作しDetermined Diggerへ渡してMother Lodeを解放","『A Subterranean Expansion』を報告する"],
    completion: "Workshop IV×4、Landmark×5、Mother Lode解放",
    materials: [["Seafarer's Cowries",3000,"拡張費"],["パームリーフ",10,"ヤシ"],["砂",5,"浜辺"],["原木",45,"木"],["つる",5,"つる"],["銅鉱",5,"採掘"],["石灰岩",25,"採掘"],["粘土",5,"土"],["ヘンプ",20,"採集"],["鉄鉱",25,"採掘"],["ロイコグラナイト",15,"採掘"],["Coal",15,"洞窟"],["Spectrine",10,"採掘"],["Marble",25,"採掘"],["Raw Garnet",3,"Granary"],["パーム原木",10,"ヤシ"],["Resin",10,"木系"],["Wood Opal",10,"採集"],["Mythril Ore",10,"採掘"]], granary: "Mother Lode解放素材の不足分を優先"
  }
};

export function materialStorageKey(rank, name) {
  return `ff14_today_island_material_v1_${rank}_${name}`;
}
