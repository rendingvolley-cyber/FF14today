CREATE TABLE IF NOT EXISTS character_state (
  lodestone_id TEXT PRIMARY KEY,
  lodestone_url TEXT NOT NULL,
  name TEXT NOT NULL,
  world TEXT NOT NULL,
  data_center TEXT,
  jobs_json TEXT NOT NULL,
  bozja_rank INTEGER,
  synced_at TEXT NOT NULL,
  parser_version TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  available_minutes INTEGER NOT NULL DEFAULT 60,
  energy INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_plans (
  plan_date TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  available_minutes INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  planner_kind TEXT NOT NULL,
  plan_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS progress_facts (
  fact_key TEXT PRIMARY KEY,
  fact_value TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  observed_at TEXT NOT NULL
);

INSERT OR IGNORE INTO user_preferences (id, available_minutes, energy, updated_at)
VALUES (1, 60, 2, datetime('now'));
