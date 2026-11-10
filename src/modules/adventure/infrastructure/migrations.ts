import type Database from 'better-sqlite3';
export function applyAdventureMigrations(db:Database.Database){const v=db.pragma('user_version',{simple:true})as number;if(v>10)throw new Error(`Progress DB version ${v} is newer than this bot.`);if(v<9)throw new Error('Run Phase 6 migration before Phase 7.');if(v===9)db.transaction(()=>{db.exec(`
CREATE TABLE adventure_progress(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,chapter_index INTEGER NOT NULL DEFAULT 0,scene_index INTEGER NOT NULL DEFAULT 0,status TEXT NOT NULL DEFAULT 'ACTIVE',version INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,PRIMARY KEY(guild_id,user_id));
CREATE TABLE adventure_answers(event_key TEXT PRIMARY KEY,guild_id TEXT NOT NULL,user_id TEXT NOT NULL,chapter_index INTEGER NOT NULL,scene_index INTEGER NOT NULL,option_id TEXT NOT NULL,correct INTEGER NOT NULL,created_at TEXT NOT NULL);
CREATE INDEX idx_adventure_answers_player ON adventure_answers(guild_id,user_id,created_at DESC);
CREATE TABLE adventure_chapter_completions(guild_id TEXT NOT NULL,user_id TEXT NOT NULL,chapter_index INTEGER NOT NULL,completed_at TEXT NOT NULL,xp_awarded INTEGER NOT NULL DEFAULT 0,reward_claimed INTEGER NOT NULL DEFAULT 0,PRIMARY KEY(guild_id,user_id,chapter_index));
`);db.pragma('user_version=10');})();}
