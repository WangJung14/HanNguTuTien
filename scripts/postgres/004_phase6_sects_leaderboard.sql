BEGIN;

CREATE TABLE IF NOT EXISTS sects (
  id TEXT PRIMARY KEY, guild_id TEXT NOT NULL, name TEXT NOT NULL, name_key TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '', max_members INTEGER NOT NULL DEFAULT 50 CHECK(max_members BETWEEN 2 AND 500),
  reputation INTEGER NOT NULL DEFAULT 0 CHECK(reputation >= 0), founded_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE','DISBANDED')), disbanded_at TEXT, updated_at TEXT NOT NULL,
  UNIQUE(guild_id,name_key)
);
CREATE INDEX IF NOT EXISTS idx_sects_guild_rank ON sects(guild_id,status,reputation DESC,founded_at,id);

CREATE TABLE IF NOT EXISTS sect_members (
  sect_id TEXT NOT NULL REFERENCES sects(id) ON DELETE CASCADE, guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('MASTER','DEPUTY','DISCIPLE')), joined_at TEXT NOT NULL,
  PRIMARY KEY(sect_id,user_id), UNIQUE(guild_id,user_id)
);
CREATE INDEX IF NOT EXISTS idx_sect_members_roster ON sect_members(sect_id,role,joined_at,user_id);

CREATE TABLE IF NOT EXISTS sect_join_requests (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text, sect_id TEXT NOT NULL REFERENCES sects(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','APPROVED','REJECTED','CANCELLED')),
  created_at TEXT NOT NULL, resolved_at TEXT, resolved_by TEXT
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sect_request_pending ON sect_join_requests(guild_id,user_id) WHERE status='PENDING';
CREATE INDEX IF NOT EXISTS idx_sect_request_queue ON sect_join_requests(sect_id,status,created_at);

CREATE TABLE IF NOT EXISTS sect_contribution_ledger (
  id TEXT PRIMARY KEY, sect_id TEXT NOT NULL REFERENCES sects(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, amount INTEGER NOT NULL CHECK(amount >= 0),
  source TEXT NOT NULL, reward_key TEXT NOT NULL UNIQUE, earned_date TEXT NOT NULL,
  week_key TEXT NOT NULL, created_at TEXT NOT NULL
);
ALTER TABLE sect_contribution_ledger ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
CREATE INDEX IF NOT EXISTS idx_sect_cp_daily ON sect_contribution_ledger(guild_id,user_id,earned_date);
CREATE INDEX IF NOT EXISTS idx_sect_cp_weekly ON sect_contribution_ledger(guild_id,sect_id,week_key,amount);
CREATE TABLE IF NOT EXISTS sect_contribution_claims (
  reward_key TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sect_quests (
  sect_id TEXT NOT NULL REFERENCES sects(id) ON DELETE CASCADE, week_key TEXT NOT NULL,
  quest_key TEXT NOT NULL, target INTEGER NOT NULL CHECK(target > 0), reward_reputation INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, PRIMARY KEY(sect_id,week_key,quest_key)
);
CREATE TABLE IF NOT EXISTS sect_quest_progress (
  sect_id TEXT NOT NULL REFERENCES sects(id) ON DELETE CASCADE, week_key TEXT NOT NULL,
  quest_key TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0 CHECK(progress >= 0),
  completed_at TEXT, rewarded_at TEXT, updated_at TEXT NOT NULL,
  PRIMARY KEY(sect_id,week_key,quest_key),
  FOREIGN KEY(sect_id,week_key,quest_key) REFERENCES sect_quests(sect_id,week_key,quest_key) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS sect_quest_events (
  event_key TEXT PRIMARY KEY, sect_id TEXT NOT NULL REFERENCES sects(id) ON DELETE CASCADE,
  guild_id TEXT NOT NULL, user_id TEXT NOT NULL, week_key TEXT NOT NULL,
  correct_delta INTEGER NOT NULL DEFAULT 0, session_delta INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sect_quest_active ON sect_quest_events(sect_id,week_key,user_id);

CREATE TABLE IF NOT EXISTS guild_cultivation_leaderboard_config (
  guild_id TEXT PRIMARY KEY, channel_id TEXT, message_id TEXT, enabled BOOLEAN NOT NULL DEFAULT FALSE,
  dirty BOOLEAN NOT NULL DEFAULT TRUE, last_updated_at TEXT, updated_at TEXT NOT NULL
);

INSERT INTO app_schema_migrations(version) VALUES(4) ON CONFLICT(version) DO NOTHING;

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['sects','sect_members','sect_join_requests','sect_contribution_ledger','sect_contribution_claims',
    'sect_quests','sect_quest_progress','sect_quest_events','guild_cultivation_leaderboard_config']
  LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t); END LOOP;
END $$;

COMMIT;
