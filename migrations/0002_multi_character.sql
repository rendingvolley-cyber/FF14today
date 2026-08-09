DROP TABLE IF EXISTS user_preferences;
DROP TABLE IF EXISTS daily_plans;

CREATE TABLE user_preferences (
  lodestone_id TEXT PRIMARY KEY,
  available_minutes INTEGER NOT NULL DEFAULT 60,
  energy INTEGER NOT NULL DEFAULT 2,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_plans (
  lodestone_id TEXT NOT NULL,
  plan_date TEXT NOT NULL,
  generated_at TEXT NOT NULL,
  available_minutes INTEGER NOT NULL,
  energy INTEGER NOT NULL,
  planner_kind TEXT NOT NULL,
  plan_json TEXT NOT NULL,
  PRIMARY KEY (lodestone_id, plan_date)
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_lodestone
ON daily_plans(lodestone_id, generated_at);
