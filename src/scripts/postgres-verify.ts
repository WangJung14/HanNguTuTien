import 'dotenv/config';
import Database from 'better-sqlite3';
import { resolve } from 'node:path';
import { openPostgres, progressTables } from './postgres-common.js';

const sqlite = new Database(resolve(process.env.PROGRESS_DB_PATH || './data/progress.sqlite'), { readonly: true });
const pg = openPostgres();
let failed = false;
try {
  const sourceTables = new Set((sqlite.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all() as { name: string }[]).map(x => x.name));
  for (const table of progressTables) {
    if (!sourceTables.has(table)) continue;
    const source = (sqlite.prepare(`SELECT count(*) AS count FROM "${table}"`).get() as { count: number }).count;
    const countRows = await pg.unsafe<{ count: string }[]>(`SELECT count(*)::text AS count FROM "${table}"`);
    const target = Number(countRows[0]?.count ?? 0);
    const ok = source === target;
    failed ||= !ok;
    console.log(`${ok ? 'OK' : 'MISMATCH'} ${table}: sqlite=${source} postgres=${target}`);
  }
  const sourceXp = (sqlite.prepare(`SELECT COALESCE(sum(amount),0) AS value FROM xp_ledger`).get() as { value: number }).value;
  const targetXpRows = await pg<{ value: string }[]>`SELECT COALESCE(sum(amount),0)::text AS value FROM xp_ledger`;
  const sourceProfiles = (sqlite.prepare(`SELECT COALESCE(sum(total_xp),0) AS value FROM cultivation_profiles`).get() as { value: number }).value;
  const targetProfileRows = await pg<{ value: string }[]>`SELECT COALESCE(sum(total_xp),0)::text AS value FROM cultivation_profiles`;
  const rewardSource = (sqlite.prepare(`SELECT count(DISTINCT reward_key) AS value FROM xp_ledger`).get() as { value: number }).value;
  const rewardTargetRows = await pg<{ value: string }[]>`SELECT count(DISTINCT reward_key)::text AS value FROM xp_ledger`;
  for (const [name, a, b] of [['xp_sum', sourceXp, Number(targetXpRows[0]?.value ?? 0)], ['profile_xp_sum', sourceProfiles, Number(targetProfileRows[0]?.value ?? 0)], ['unique_reward_keys', rewardSource, Number(rewardTargetRows[0]?.value ?? 0)]] as const) {
    const ok = a === b; failed ||= !ok; console.log(`${ok ? 'OK' : 'MISMATCH'} ${name}: sqlite=${a} postgres=${b}`);
  }
} finally {
  sqlite.close(); await pg.end({ timeout: 5 });
}
if (failed) process.exitCode = 1;

