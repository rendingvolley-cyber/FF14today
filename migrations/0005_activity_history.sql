CREATE TABLE IF NOT EXISTS activity_history (
  completion_id TEXT PRIMARY KEY,
  lodestone_id TEXT NOT NULL,
  activity_date TEXT NOT NULL,
  task_key TEXT NOT NULL,
  task_title TEXT NOT NULL,
  task_kind TEXT NOT NULL DEFAULT 'todo',
  daily_key TEXT,
  job_code TEXT,
  job_level INTEGER,
  planned_minutes INTEGER NOT NULL,
  actual_minutes INTEGER,
  completed_at TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ff14_today'
);

CREATE INDEX IF NOT EXISTS idx_activity_history_date
ON activity_history(lodestone_id, activity_date, completed_at);
