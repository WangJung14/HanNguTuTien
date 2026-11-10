BEGIN;

CREATE TABLE IF NOT EXISTS adventure_progress (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL DEFAULT 0 CHECK(chapter_index BETWEEN 0 AND 2),
  scene_index INTEGER NOT NULL DEFAULT 0 CHECK(scene_index BETWEEN 0 AND 4),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN('ACTIVE','COMPLETED')),
  version INTEGER NOT NULL DEFAULT 0 CHECK(version >= 0),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(guild_id,user_id)
);

CREATE TABLE IF NOT EXISTS adventure_answers (
  event_key TEXT PRIMARY KEY,
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL,
  scene_index INTEGER NOT NULL,
  option_id TEXT NOT NULL,
  correct BOOLEAN NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_adventure_answers_player
  ON adventure_answers(guild_id,user_id,created_at DESC);

CREATE TABLE IF NOT EXISTS adventure_chapter_completions (
  guild_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  chapter_index INTEGER NOT NULL CHECK(chapter_index BETWEEN 0 AND 2),
  completed_at TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK(xp_awarded >= 0),
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  PRIMARY KEY(guild_id,user_id,chapter_index)
);

INSERT INTO app_schema_migrations(version) VALUES(5) ON CONFLICT(version) DO NOTHING;

ALTER TABLE adventure_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE adventure_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE adventure_chapter_completions ENABLE ROW LEVEL SECURITY;

COMMIT;
