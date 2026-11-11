import 'dotenv/config';
import { SectContributionService } from '../modules/sects/application/sect.service.js';
import { PostgresSectRepository } from '../modules/sects/infrastructure/postgres-sect.repository.js';
import { openPostgres } from './postgres-common.js';

if (process.env.CONFIRM_SECT_CP_REPAIR !== 'REPAIR_MISSING_SECT_CP') throw new Error('Set CONFIRM_SECT_CP_REPAIR=REPAIR_MISSING_SECT_CP for this one-off repair.');
const [attemptId,userId]=process.argv.slice(2);if(!attemptId||!userId)throw new Error('Usage: ... <attempt-id> <user-id>');
const sql=openPostgres();
try{
 const rows=await sql<{guildId:string;userId:string;status:string;completedAt:string|null}[]>`SELECT guild_id AS "guildId",user_id AS "userId",status,completed_at AS "completedAt" FROM breakthrough_attempts WHERE id=${attemptId}`;
 const attempt=rows[0];if(!attempt||attempt.userId!==userId||attempt.status!=='passed'||!attempt.completedAt)throw new Error('Passed breakthrough attempt not found or owner mismatch.');
 const award=await new SectContributionService(new PostgresSectRepository(sql)).breakthrough(attempt.guildId,userId,attemptId,new Date(attempt.completedAt));
 console.log(JSON.stringify({attemptId,userId,...award}));
}finally{await sql.end({timeout:5});}
