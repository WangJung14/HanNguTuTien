import 'dotenv/config';
import { openPostgres } from './postgres-common.js';

const [attemptId, userId] = process.argv.slice(2);
if (!attemptId || !userId) throw new Error('Usage: tsx src/scripts/check-breakthrough-reward.ts <attempt-id> <user-id>');
const rewardKey = `sect:breakthrough:${attemptId}:${userId}`;
const sql = openPostgres();
try {
  const attempts = await sql<{ status:string; guildId:string; userId:string; completedAt:string|null }[]>`
    SELECT status,guild_id AS "guildId",user_id AS "userId",completed_at AS "completedAt"
    FROM breakthrough_attempts WHERE id=${attemptId}
  `;
  const claims = await sql`SELECT 1 FROM sect_contribution_claims WHERE reward_key=${rewardKey}`;
  const ledgers = await sql<{ amount:number }[]>`SELECT amount FROM sect_contribution_ledger WHERE reward_key=${rewardKey}`;
  console.log(JSON.stringify({ attempt:attempts[0]??null, claimExists:claims.length>0, ledger:ledgers[0]??null }));
} finally { await sql.end({timeout:5}); }
