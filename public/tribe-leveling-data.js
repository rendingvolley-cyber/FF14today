const NORMAL_ROLES = new Set(["tank", "healer", "melee", "ranged", "caster"]);

export const TRIBE_LEVELING_GUIDES = [
  {
    id: "pixie",
    min_level: 70,
    max_level: 79,
    name: "ピクシー族",
    range_label: "Lv70〜79",
    unlock_quest: "夢と現の狭間で",
    start_location: "クリスタリウム X:13.1 Y:15.3",
    npc: "桃色のピクシー",
    prerequisite: "メインクエスト「運命はまた廻る」をコンプリート",
    first_step: "クリスタリウム X:13.1 Y:15.3へ行き、桃色のピクシーから「夢と現の狭間で」を受注する。",
    unlock_result: "「夢と現の狭間で」完了後、ピクシー族のデイリークエストが解放される。",
    steps: [
      "前提：メインクエスト「運命はまた廻る」を終えているか確認",
      "クリスタリウム X:13.1 Y:15.3の桃色のピクシーから「夢と現の狭間で」を受注",
      "クエストを完了したら、このガイドを「解放済み」にする"
    ]
  },
  {
    id: "arkasodara",
    min_level: 80,
    max_level: 89,
    name: "アルカソーダラ族",
    range_label: "Lv80〜89",
    unlock_quest: "爆走ヒッポ、島を駆る",
    start_location: "サベネア島 X:25.3 Y:31.2",
    npc: "カーンチャナ",
    prerequisite: "前提サブクエスト2系列を終え、「森へ吹き込む草原の風」をコンプリート",
    first_step: "まずサベネア島 X:25.5 Y:36.0のオグルから「アジムステップの若き冒険者」を受注する。",
    unlock_result: "前提2系列の合流後、「爆走ヒッポ、島を駆る」を完了するとデイリークエストが解放される。",
    steps: [
      "先に「アジムステップの若き冒険者」系列を開始：サベネア島 X:25.5 Y:36.0／オグル",
      "次に「錬金術師と赤ん坊」系列を開始：サベネア島 X:29.2 Y:15.2／イェザーン",
      "2系列を進めて「森へ吹き込む草原の風」を完了",
      "サベネア島 X:25.3 Y:31.2のカーンチャナから「爆走ヒッポ、島を駆る」を受注・完了"
    ]
  },
  {
    id: "pelupelu",
    min_level: 90,
    max_level: 99,
    name: "ペルペル族",
    range_label: "Lv90〜99",
    unlock_quest: "新事業！ トラル旅行公司",
    start_location: "トライヨラ X:13.6 Y:12.9",
    npc: "空色衣装のペルペル族",
    prerequisite: "メインクエスト「黄金のレガシー」をコンプリート",
    first_step: "トライヨラ X:13.6 Y:12.9へ行き、空色衣装のペルペル族から「新事業！ トラル旅行公司」を受注する。",
    unlock_result: "「新事業！ トラル旅行公司」完了後、ペルペル族のデイリークエストが解放される。",
    steps: [
      "前提：メインクエスト「黄金のレガシー」を終えているか確認",
      "トライヨラ X:13.6 Y:12.9の空色衣装のペルペル族から「新事業！ トラル旅行公司」を受注",
      "クエストを完了したら、このガイドを「解放済み」にする"
    ]
  }
];

export function tribeGuideForJob(job) {
  if (!job || !NORMAL_ROLES.has(job.role)) return null;
  const code = String(job.code || "").trim().toUpperCase();
  if (code === "BLU" || job.role === "limited") return null;
  const level = Number(job.level);
  if (!Number.isInteger(level)) return null;
  return TRIBE_LEVELING_GUIDES.find(guide => level >= guide.min_level && level <= guide.max_level) || null;
}
