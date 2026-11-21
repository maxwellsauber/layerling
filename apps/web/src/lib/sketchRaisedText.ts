import {regenerateSketchTexts} from '@/lib/sketchText';
import type {SketchProfile} from '@/types/layerling';
export type SketchTextStack={backer:SketchProfile;letters:SketchProfile;backerHeight:number;letterHeight:number};
function owned(profile:SketchProfile,id:string):SketchProfile{
 const text=profile.texts!.find(text=>text.id===id)!,points=new Set(text.pointIds),segments=new Set(text.segmentIds);
 return {points:profile.points.filter(p=>points.has(p.id)),segments:profile.segments.filter(s=>segments.has(s.id))};
}
/** All geometry stays in the sketch's own frame; the normal placement pipeline positions the result. */
export function sketchRaisedTextPlan(profile:SketchProfile):{profile:SketchProfile;stacks:SketchTextStack[]}{
 const raised=profile.texts?.filter(text=>text.connections?.mode==='backer'&&text.raised)??[];
 const pointIds=new Set(raised.flatMap(text=>text.pointIds)),segmentIds=new Set(raised.flatMap(text=>text.segmentIds));
 const stacks=raised.map(text=>{
  const lettering=regenerateSketchTexts({...profile,texts:[{...text,connections:undefined,raised:undefined}]});
  return {backer:owned(profile,text.id),letters:owned(lettering,text.id),backerHeight:text.raised!.backerThickness,letterHeight:text.raised!.letterHeight};
 });
 return {profile:{...profile,points:profile.points.filter(p=>!pointIds.has(p.id)),segments:profile.segments.filter(s=>!segmentIds.has(s.id)),texts:profile.texts?.filter(text=>!raised.includes(text))},stacks};
}
