CREATE TABLE IF NOT EXISTS anonymous_profiles (
  profile_hash TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS profile_characters (
  profile_hash TEXT NOT NULL,
  lodestone_id TEXT NOT NULL,
  linked_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  PRIMARY KEY (profile_hash, lodestone_id)
);

CREATE TABLE IF NOT EXISTS user_preferences_private (
  profile_hash TEXT NOT NULL,
  lodestone_id TEXT NOT NULL,
  available_minutes INTEGER NOT NULL DEFAULT 60,
  energy INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (profile_hash, lodestone_id)
);

CREATE TABLE IF NOT EXISTS daily_plans_private (
  profile_hash TEXT NOT NULL,
  lodestone_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  available_minutes INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  planner_kind TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  PRIMARY KEY (profile_hash, lodestone_id, plan_date)
);

CREATE TABLE IF NOT EXISTS progress_facts_private (
  profile_hash TEXT NOT NULL,
  lodestone_id TEXT NOT NULL,
  fact_key TEXT NOT NULL,
  fact_value TEXT NOT NULL,
  source TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 1.0,
  observed_at TEXT NOT NULL,
  PRIMARY KEY (profile_hash, lodestone_id, fact_key)
);

CREATE TABLE IF NOT EXISTS screenshot_imports (
  import_id TEXT PRIMARY KEY,
  profile_hash TEXT NOT NULL,
  lodestone_id TEXT NOT NULL,
  filename TEXT,
  mime_type TEXT NOT NULL,
  image_sha256 TEXT NOT NULL,
  status TEXT NOT NULL,
  model_id TEXT NOT NULL,
  page_type TEXT,
  category TEXT,
  created_at TEXT NOT NULL,
  confirmed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_screenshot_import_dedupe
ON screenshot_imports(profile_hash, lodestone_id, image_sha256);

CREATE TABLE IF NOT EXISTS screenshot_candidates (
  candidate_id TEXT PRIMARY KEY,
  import_id TEXT NOT NULL,
  achievement_name TEXT NOT NULL,
  current_value INTEGER,
  target_value INTEGER,
  completed INTEGER,
  confidence REAL NOT NULL,
  visible_progress_text TEXT,
  decision TEXT NOT NULL DEFAULT 'pending'
);

CREATE INDEX IF NOT EXISTS idx_screenshot_candidates_import
ON screenshot_candidates(import_id);

CREATE TABLE IF NOT EXISTS api_usage_daily (
  profile_hash TEXT NOT NULL,
  usage_date TEXT NOT NULL,
  screenshot_analyses INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (profile_hash, usage_date)
);
