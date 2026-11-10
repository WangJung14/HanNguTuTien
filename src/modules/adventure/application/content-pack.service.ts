import packJson from '../content/adventure.vi.json' with { type: 'json' };
import { ADVENTURE_CONFIG } from '../domain/adventure.config.js';
import { AdventureError, type AdventurePack } from '../domain/adventure.types.js';

export class AdventureContentService{
 readonly pack:AdventurePack;
 constructor(value:unknown=packJson){this.pack=this.validate(value);}
 chapter(index:number){const value=this.pack.chapters[index];if(!value)throw new AdventureError('Chương Giang Hồ không tồn tại.');return value;}
 scene(chapter:number,scene:number){const value=this.chapter(chapter).scenes[scene];if(!value)throw new AdventureError('Cảnh Giang Hồ không tồn tại.');return value;}
 private validate(raw:unknown):AdventurePack{
  if(!raw||typeof raw!=='object')throw new AdventureError('Content Pack Giang Hồ không hợp lệ.');
  const value=raw as AdventurePack;
  if(value.version!==1||value.locale!=='vi-VN'||value.chapters?.length!==ADVENTURE_CONFIG.chapterCount)throw new AdventureError('Content Pack phải có đúng 3 chương phiên bản 1.');
  const ids=new Set<string>();
  for(const chapter of value.chapters){if(!chapter.id||ids.has(chapter.id)||chapter.scenes?.length!==ADVENTURE_CONFIG.scenesPerChapter)throw new AdventureError('Mỗi chương phải có ID duy nhất và đúng 5 cảnh.');ids.add(chapter.id);const sceneIds=new Set<string>();for(const scene of chapter.scenes){if(!scene.id||sceneIds.has(scene.id)||!scene.options?.length||!scene.options.some(o=>o.correct)||scene.options.some(o=>!o.id||!o.label||!o.feedback))throw new AdventureError(`Cảnh không hợp lệ trong chương ${chapter.id}.`);sceneIds.add(scene.id);}}
  return value;
 }
}
