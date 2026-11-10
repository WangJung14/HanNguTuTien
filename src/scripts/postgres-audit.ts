import 'dotenv/config';
import { openPostgres, progressTables } from './postgres-common.js';
import { assertPostgresReady } from '../shared/database/postgres-readiness.js';

const pg = openPostgres('migration');
let failed = false;
function check(label: string, ok: boolean, details = ''): void {
  failed ||= !ok;
  console.log(`${ok ? 'OK' : 'FAIL'} ${label}${details ? `: ${details}` : ''}`);
}

try {
  await assertPostgresReady(pg);
  check('runtime schema', true);

  for (const table of progressTables) {
    const rows = await pg.unsafe<{ count: string }[]>(`SELECT count(*)::text AS count FROM "${table}"`);
    console.log(`INFO ${table}: ${rows[0]?.count ?? '0'} rows`);
  }

  const duplicateRewards = await pg<{ count: string }[]>`
    SELECT count(*)::text AS count FROM (
      SELECT reward_key FROM xp_ledger GROUP BY reward_key HAVING count(*) > 1
    ) duplicated
  `;
  check('XP reward keys unique', Number(duplicateRewards[0]?.count ?? 0) === 0);

  const invalidProfiles = await pg<{ count: string }[]>`
    SELECT count(*)::text AS count FROM cultivation_profiles
    WHERE total_xp < 0 OR major_index < 0 OR role_sync_pending NOT IN (0, 1)
  `;
  check('cultivation profiles valid', Number(invalidProfiles[0]?.count ?? 0) === 0);

  const activeDuplicates = await pg<{ count: string }[]>`
    SELECT count(*)::text AS count FROM (
      SELECT guild_id,user_id FROM dictation_sessions WHERE status='active'
      GROUP BY guild_id,user_id HAVING count(*) > 1
      UNION ALL
      SELECT guild_id,user_id FROM breakthrough_attempts WHERE status='active'
      GROUP BY guild_id,user_id HAVING count(*) > 1
      UNION ALL
      SELECT guild_id,user_id FROM meditation_sessions WHERE status='active'
      GROUP BY guild_id,user_id HAVING count(*) > 1
    ) duplicated
  `;
  check('single active sessions', Number(activeDuplicates[0]?.count ?? 0) === 0);

  const orphanRows = await pg<{ count: string }[]>`
    SELECT (
      (SELECT count(*) FROM deck_words child LEFT JOIN decks parent ON parent.id=child.deck_id WHERE parent.id IS NULL) +
      (SELECT count(*) FROM dictation_results child LEFT JOIN dictation_sessions parent ON parent.id=child.session_id WHERE parent.id IS NULL) +
      (SELECT count(*) FROM meditation_rewards child LEFT JOIN meditation_sessions parent ON parent.id=child.session_id WHERE parent.id IS NULL) +
      (SELECT count(*) FROM mountain_players child LEFT JOIN mountain_matches parent ON parent.id=child.match_id WHERE parent.id IS NULL) +
      (SELECT count(*) FROM pve_players child LEFT JOIN pve_runs parent ON parent.id=child.run_id WHERE parent.id IS NULL)
    )::text AS count
  `;
  check('no orphan progress rows', Number(orphanRows[0]?.count ?? 0) === 0);
} finally {
  await pg.end({ timeout: 5 });
}
if (failed) process.exitCode = 1;
