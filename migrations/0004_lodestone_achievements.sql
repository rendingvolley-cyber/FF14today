CREATE TABLE IF NOT EXISTS lodestone_achievement_state (
  lodestone_id TEXT PRIMARY KEY,
  total_achievements INTEGER NOT NULL,
  achievement_points INTEGER,
  page_total INTEGER NOT NULL,
  history_json TEXT NOT NULL,
  synced_at TEXT NOT NULL,
  parser_version TEXT NOT NULL
);
