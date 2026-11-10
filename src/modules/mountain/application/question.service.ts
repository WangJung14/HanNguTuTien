import type {DeckService} from '../../decks/index.js';
import {MountainError,type MountainQuestion} from '../domain/mountain.types.js';

type Candidate={entryId:number;hanzi:string;meaning:string};
export class MountainQuestionService{
 constructor(private readonly decks:DeckService){}
 async build(guildId:string,userId:string,deckId:number,random:()=>number=Math.random):Promise<{deckName:string;questions:MountainQuestion[]}>{
  const deck=await this.decks.getVisible(guildId,userId,deckId);const first=await this.decks.view(guildId,userId,deckId,1);const entries=[...first.items.map(x=>x.entry)];
  for(let p=2;p<=first.totalPages;p++)entries.push(...(await this.decks.view(guildId,userId,deckId,p)).items.map(x=>x.entry));
  const raw:Candidate[]=entries.flatMap(entry=>{const meanings=entry.meanings.filter(x=>x.trim()&&!/^LT:/u.test(x)).map(x=>x.normalize('NFC').trim());const unique=[...new Map(meanings.map(x=>[key(x),x])).values()];if(!/^\p{Script=Han}+$/u.test(entry.simplified)||unique.length!==1||!validReading(entry.pinyinRaw))return[];return[{entryId:entry.id,hanzi:entry.simplified,meaning:unique[0]!}];});
  const meaningCounts=new Map<string,number>();const hanCounts=new Map<string,number>();for(const c of raw){meaningCounts.set(key(c.meaning),(meaningCounts.get(key(c.meaning))??0)+1);hanCounts.set(c.hanzi,(hanCounts.get(c.hanzi)??0)+1);}
  const pool=raw.filter(c=>meaningCounts.get(key(c.meaning))===1&&hanCounts.get(c.hanzi)===1);
  if(pool.length<10)throw new MountainError(`Bộ từ chỉ có ${pool.length}/10 từ trắc nghiệm không mơ hồ. Cần ít nhất 10 từ có một nghĩa và một cách đọc rõ ràng.`);
  const selected=shuffle(pool,random).slice(0,10);const questions=selected.map((correct,index)=>{
    const direction:indexDirection=index%2===0?'han_vi':'vi_han';const distractors=shuffle(pool.filter(c=>c.entryId!==correct.entryId),random).slice(0,3);
    const optionCandidates=shuffle([correct,...distractors],random);const correctIndex=optionCandidates.findIndex(c=>c.entryId===correct.entryId);
    return{entryId:correct.entryId,direction,prompt:direction==='han_vi'?correct.hanzi:correct.meaning,
      options:optionCandidates.map(c=>direction==='han_vi'?c.meaning:c.hanzi),correctIndex,hanzi:correct.hanzi,meaning:correct.meaning};
  });
  return{deckName:deck.name,questions};
 }
}
type indexDirection='han_vi'|'vi_han';
function key(x:string){return x.normalize('NFKC').toLocaleLowerCase('vi-VN').replace(/\s+/gu,' ').trim();}
function validReading(raw:string){const s=raw.trim().toLowerCase();return Boolean(s)&&!/[;,|/，；、()[\]{}]/u.test(s)&&s.split(/\s+/u).every(x=>/^[a-züv:]+[0-5]?$/u.test(x));}
function shuffle<T>(input:T[],random:()=>number):T[]{const a=[...input];for(let i=a.length-1;i>0;i--){const r=random();if(!Number.isFinite(r)||r<0||r>=1)throw new MountainError('Nguồn ngẫu nhiên không hợp lệ.');const j=Math.floor(r*(i+1));[a[i],a[j]]=[a[j]!,a[i]!];}return a;}
