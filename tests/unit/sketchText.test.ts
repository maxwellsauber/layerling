import {beforeAll,describe,expect,it} from 'vitest';
import manifoldModule from 'manifold-3d';
import {loadTextFonts,textFont,registerCustomFont,resetCustomFontsForTests} from '@/lib/textFonts';
import {strokedSketchProfile} from '@/lib/sketchStroke';
import {rememberManifoldRuntime,loadedManifoldRuntime} from '@/lib/manifoldHandle';
import {newSketchText,attachSketchTextPath,setSketchTextPathGuide,regenerateSketchTexts,convertSketchTextToOutlines,carrySketchTexts,sketchTextPathStart,sketchTextPathPosition,sketchTextBaseline,sketchTextPathSelection,detachSketchTextPath} from '@/lib/sketchText';
import {sketchRaisedTextPlan} from '@/lib/sketchRaisedText';
import {sketchPrimitiveGeometry} from '@/lib/sketchPrimitives';
import {cadSketchRegions} from '@/lib/sketchCadProfile';
import {cloneSketchProfile} from '@/lib/sketchSmoothHandles';
import {copySketchSelection,pasteSketchClipboard} from '@/lib/sketchClipboard';
import {applySketchConstraints} from '@/lib/sketchConstraints';
import {turnedSketchProfile,sketchEditTurn} from '@/lib/sketchEditTurn';
import {stretchedSketchProfile} from '@/lib/sketchResize';
import {importLylProject,exportLylProject} from '@/lib/lylProject';
import {editorHistoryEntry} from '@/lib/editorHistory';
import {readFileSync} from 'node:fs';
import type {SketchProfile} from '@/types/layerling';
let count=0;const id=(prefix='id')=>`${prefix}-${++count}`;
const text=(content='MAX GALLOWS')=>({...newSketchText('text'),content,size:6});
const line=():SketchProfile=>({points:[{id:'a',x:0,z:0},{id:'b',x:150,z:0}],segments:[{id:'rail',startId:'a',endId:'b',construction:true}],texts:[{...text(),pathSegmentIds:['rail']}]});
const valid=(p:SketchProfile)=>{expect(p.points.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.z))).toBe(true);expect(new Set(p.points.map(p=>p.id)).size).toBe(p.points.length);expect(new Set(p.segments.map(s=>s.id)).size).toBe(p.segments.length);};
const extent=(p:SketchProfile)=>{const ids=new Set(p.texts![0].pointIds);const x=p.points.filter(q=>ids.has(q.id)).map(q=>q.x);return Math.max(...x)-Math.min(...x);};
beforeAll(async()=>{await loadTextFonts();const runtime=await manifoldModule();runtime.setup();rememberManifoldRuntime(runtime);});
describe('native sketch lettering',()=>{
 it('separates a connected backer and editable raised letters without consuming the baseline',()=>{
  const p=line();p.texts![0].content='BO';p.texts![0].connections={mode:'backer',width:1,padding:1,railOffset:1};p.texts![0].raised={backerThickness:1.5,letterHeight:2};
  const live=regenerateSketchTexts(p),plan=sketchRaisedTextPlan(live);
  expect(plan.stacks).toHaveLength(1);expect(plan.stacks[0].backerHeight).toBe(1.5);expect(plan.stacks[0].letterHeight).toBe(2);
  expect(plan.profile.segments.map(s=>s.id)).toEqual(['rail']);
  expect(cadSketchRegions(plan.stacks[0].backer)).toHaveLength(1);
  expect(cadSketchRegions(plan.stacks[0].letters).reduce((n,r)=>n+r.holes.length,0)).toBeGreaterThan(0);
  expect(live.texts![0].connections!.mode).toBe('backer');expect(live.texts![0].pathSegmentIds).toEqual(['rail']);
 });

 it.each(['join','rail','backer'] as const)('connects straight and curved text into one region in %s mode',mode=>{
  for(const curved of [false,true]){
   const p=line();p.texts![0].content='Hi Max!';p.texts![0].size=10;
   p.texts![0].connections={mode,width:1,padding:1,railOffset:1};
   if(curved){p.segments[0].kind='smooth';p.points[0].handleOut={x:40,z:-40};p.points[1].handleIn={x:110,z:40};}
   const live=regenerateSketchTexts(p);valid(live);
   expect(live.texts![0].connectionParts).toBe(1);
   expect(cadSketchRegions(live)).toHaveLength(1);
   const changed=cloneSketchProfile(live);changed.texts![0].content='New idea';changed.points[1].z=20;
   expect(regenerateSketchTexts(changed).texts![0].connectionParts).toBe(1);
   const outline=convertSketchTextToOutlines(live,'text');expect(outline.points).toEqual(live.points);expect(outline.texts).toHaveLength(0);
  }
 });
 it('connects reversed text around a closed path, including detached dots',()=>{
  const circle=sketchPrimitiveGeometry('circle',{x:0,z:0},()=>id('circle'),100);
  const p=regenerateSketchTexts({...circle,segments:circle.segments.map(s=>({...s,construction:true})),texts:[{...text('Hi Max'),size:8,pathSegmentIds:circle.segments.map(s=>s.id),reverse:true,flip:true,pathPosition:65,connections:{mode:'rail',width:1,padding:1,railOffset:1}}]});
  expect(p.texts![0].connectionParts).toBe(1);expect(cadSketchRegions(p)).toHaveLength(1);valid(p);
 });

 it('cuts real stencil channels through letter counters and regenerates after editing',()=>{
  const p=line();p.texts![0].content='ABOPR';p.texts![0].size=12;
  const normal=regenerateSketchTexts(p),bridged=regenerateSketchTexts({...p,texts:[{...p.texts![0],bridges:{width:.6,count:2}}]});
  expect(cadSketchRegions(normal).reduce((sum,r)=>sum+r.holes.length,0)).toBeGreaterThan(0);
  expect(cadSketchRegions(bridged).reduce((sum,r)=>sum+r.holes.length,0)).toBe(0);
  expect(bridged.texts![0].bridgeUnheld).toBe(0);valid(bridged);
  const updated=cloneSketchProfile(bridged);updated.points[1].z=20;updated.texts![0].content='BO';
  const changed=regenerateSketchTexts(updated);expect(changed.texts![0].content).toBe('BO');expect(changed.texts![0].bridgeUnheld).toBe(0);valid(changed);
  const restored=regenerateSketchTexts({...normal,texts:[{...normal.texts![0],bridges:undefined}]});
  expect(restored.points).toEqual(normal.points);
 });

 it('strokes the baseline without stroking any live lettering a second time',()=>{
  const p=line();p.texts![0].content='ABOPR';p.texts![0].baselineOffset=-20;
  p.texts!.push({...newSketchText('other'),content:'O',size:8,matrix:[1,0,0,1,160,-20]});
  const live=regenerateSketchTexts(p),runtime=loadedManifoldRuntime()!;
  const result=(width:number,guide:boolean)=>strokedSketchProfile(runtime,{...live,segments:live.segments.map(s=>s.id==='rail'?{...s,construction:guide}:s),stroke:{width,align:'center',join:'miter',cap:'flat'}})!;
  const area=(q:SketchProfile)=>{const points=new Map(q.points.map(v=>[v.id,v]));return Math.abs(q.segments.reduce((sum,s)=>{const a=points.get(s.startId)!,b=points.get(s.endId)!;return sum+(a.x*b.z-b.x*a.z)/2;},0));};
  const textOnly=result(2,true),thin=result(2,false),wide=result(8,false);
  expect(area(thin)-area(textOnly)).toBeCloseTo(150*2,4);
  expect(area(wide)-area(textOnly)).toBeCloseTo(150*8,4);
  expect(area(result(8,true))).toBeCloseTo(area(textOnly),6);
  expect(cadSketchRegions(textOnly).reduce((n,r)=>n+r.holes.length,0)).toBeGreaterThanOrEqual(6);
 });

 it('uses real construction geometry for new text guides and keeps the source editable',()=>{
  const p=line();p.texts![0].pathSegmentIds=undefined;p.segments[0].construction=false;
  p.constraints=[{id:'h',kind:'horizontal',a:'a',b:'b'}];
  const guide=attachSketchTextPath(p,'text',['rail']);
  expect(guide.segments[0].construction).toBe(true);expect(guide.points).toEqual(p.points);expect(guide.constraints).toEqual(p.constraints);
  expect(p.segments[0].construction).toBe(false);
  const live=regenerateSketchTexts(guide),next=cloneSketchProfile(live);next.points[1].z=20;
  expect(regenerateSketchTexts(next).points.filter(v=>v.id.startsWith('text:'))).not.toEqual(live.points.filter(v=>v.id.startsWith('text:')));
  const geometry=setSketchTextPathGuide(live,['rail'],false);
  expect(geometry.segments[0].construction).not.toBe(true);expect(geometry.texts).toEqual(live.texts);
 });
 it('shares the baseline role across texts and preserves it when attaching another text',()=>{
  const p=line();p.segments[0].construction=false;
  p.texts!.push({...newSketchText('second'),content:'OTHER'});
  const shared=attachSketchTextPath(p,'second',['rail']);
  expect(shared.segments[0].construction).toBe(false);
  const guide=setSketchTextPathGuide(shared,['rail'],true);
  expect(guide.texts!.every(t=>t.pathSegmentIds?.includes('rail'))).toBe(true);
  expect(guide.segments[0].construction).toBe(true);
  expect(setSketchTextPathGuide(shared,['missing'],true)).toBe(shared);
 });

 it('moves letters across the baseline without mirroring or reversing their order',()=>{
  const p=line();p.texts![0].content='Fgp';p.texts![0].pathPosition=25;
  const normal=regenerateSketchTexts(p),flipped=regenerateSketchTexts({...p,texts:[{...p.texts![0],flip:true}]});
  const owned=new Set(normal.texts![0].pointIds),a=normal.points.filter(v=>owned.has(v.id)),b=flipped.points.filter(v=>owned.has(v.id));
  const shift=b[0].z-a[0].z;expect(shift).toBeGreaterThan(0);
  a.forEach((v,i)=>{expect(b[i].x).toBeCloseTo(v.x,7);expect(b[i].z-v.z).toBeCloseTo(shift,7);});
  expect(Math.min(...b.map(v=>v.z))).toBeCloseTo(-Math.max(...a.map(v=>v.z)),7);
 });
 it('reverses reading direction within the same occupied arc instead of jumping to the far end',()=>{
  const p=line();p.texts![0].content='Fg';p.texts![0].pathPosition=20;
  const normal=regenerateSketchTexts(p),reversed=regenerateSketchTexts({...p,texts:[{...p.texts![0],reverse:true}]});
  const owned=new Set(normal.texts![0].pointIds),a=normal.points.filter(v=>owned.has(v.id)),b=reversed.points.filter(v=>owned.has(v.id));
  const min=(q:typeof a)=>Math.min(...q.map(v=>v.x)),max=(q:typeof a)=>Math.max(...q.map(v=>v.x));
  expect(min(b)).toBeCloseTo(min(a),6);expect(max(b)).toBeCloseTo(max(a),6);
  a.forEach((v,i)=>{expect(b[i].x+v.x).toBeCloseTo(min(a)+max(a),6);expect(b[i].z).toBeCloseTo(-v.z,6);});
 });

 it('positions text by percentage of the complete path and follows length changes',()=>{
  const p=line();p.texts![0].pathPosition=25;
  expect(sketchTextPathStart(p.texts![0],150)).toBe(37.5);
  const a=regenerateSketchTexts(p),owned=new Set(a.texts![0].pointIds);
  const minX=(q:SketchProfile)=>Math.min(...q.points.filter(v=>owned.has(v.id)).map(v=>v.x));
  p.points[1].x=200;
  const b=regenerateSketchTexts(p);
  expect(minX(b)-minX(a)).toBeCloseTo(12.5,6);
  expect(sketchTextPathPosition(p.texts![0],p)).toBeCloseTo(25);
  expect(sketchTextPathStart({...p.texts![0],pathPosition:100},200)).toBe(200);
  expect(sketchTextPathStart({...p.texts![0],pathPosition:undefined,align:'end'},200,40)).toBe(160);
 });

 it('starts an open baseline in its saved drawing direction',()=>{const b=sketchTextBaseline(line(),['rail'])!;expect(b.curve.getPointAt(0).x).toBe(0);expect(b.curve.getPointAt(1).x).toBe(150);});
 it('A: makes exact glyph curves with counters, font changes, spacing and every existing fill',()=>{
  const p=regenerateSketchTexts({points:[],segments:[],texts:[text('ABOPR')]});valid(p);expect(p.segments.some(s=>s.kind==='bezier')).toBe(true);
  expect(cadSketchRegions(p).reduce((sum,r)=>sum+r.holes.length,0)).toBe(6);
  const sans=regenerateSketchTexts({points:[],segments:[],texts:[text()]});
  const serif=regenerateSketchTexts({...sans,texts:[{...sans.texts![0],font:'Serif'}]});expect(serif.points).not.toEqual(sans.points);
  const spaced=regenerateSketchTexts({...sans,texts:[{...sans.texts![0],spacing:30}]});expect(extent(spaced)).toBeGreaterThan(extent(sans));
  for(const align of ['center','inside','outside','grow'] as const){const filled=regenerateSketchTexts({...p,texts:[{...p.texts![0],stroke:{width:.3,join:'round',cap:'flat',align}}]});valid(filled);expect(cadSketchRegions(filled).length).toBeGreaterThan(0);}
  const silhouette=regenerateSketchTexts({...p,texts:[{...p.texts![0],silhouette:true}]});expect(cadSketchRegions(silhouette).every(r=>r.holes.length===0)).toBe(true);
 });
 it('B: follows a semicircle with reversible flow, side flipping, alignment and editable radius',()=>{
  const k=4*(Math.sqrt(2)-1)/3;
  const p:SketchProfile={points:[{id:'a',x:-60,z:0,handleOut:{x:-60,z:-60*k}},{id:'b',x:0,z:-60,handleIn:{x:-60*k,z:-60},handleOut:{x:60*k,z:-60}},{id:'c',x:60,z:0,handleIn:{x:60,z:-60*k}}],segments:[{id:'ab',startId:'a',endId:'b',kind:'bezier',construction:true},{id:'bc',startId:'b',endId:'c',kind:'bezier',construction:true}],texts:[{...text(),pathSegmentIds:['ab','bc'],align:'center'}]};
  const original=regenerateSketchTexts(p);valid(original);expect(sketchTextBaseline(p,['ab','bc'])!.length).toBeCloseTo(Math.PI*60,1);
  for(const patch of [{reverse:true},{flip:true},{align:'end' as const},{baselineOffset:5}]){const next=regenerateSketchTexts({...original,texts:[{...original.texts![0],...patch}]});valid(next);expect(next.points).not.toEqual(original.points);}
  const larger=cloneSketchProfile(original);for(const point of larger.points.filter(q=>['a','b','c'].includes(q.id))){point.x*=1.2;point.z*=1.2;for(const h of [point.handleIn,point.handleOut])if(h){h.x*=1.2;h.z*=1.2;}}
  expect(regenerateSketchTexts(larger).points).not.toEqual(original.points);
 });
 it('C: updates lettering when an S-curve handle moves, retaining the baseline',()=>{
  const p=line();p.points[0].handleOut={x:50,z:-80};p.points[1].handleIn={x:100,z:80};p.segments[0].kind='bezier';p.texts![0].content='LAYERLING ROCKS';
  const first=regenerateSketchTexts(p),next=cloneSketchProfile(first);next.points[0].handleOut!.z=-110;
  const result=regenerateSketchTexts(next);valid(result);expect(result.points.slice(2)).not.toEqual(first.points.slice(2));expect(result.points[0]).toEqual(next.points[0]);
 });
 it('D: handles closed seams once, fitting and overflow without repeating letters',()=>{
  const circle=sketchPrimitiveGeometry('circle',{x:0,z:0},id,80);const p:SketchProfile={...circle,segments:circle.segments.map(s=>({...s,construction:true})),texts:[{...text('MADE WITH LAYERLING'),pathSegmentIds:circle.segments.map(s=>s.id),startOffset:20}]};
  const first=regenerateSketchTexts(p);valid(first);expect(first.texts![0].warning).toBeUndefined();
  expect(regenerateSketchTexts({...p,texts:[{...p.texts![0],startOffset:20+sketchTextBaseline(p,p.texts![0].pathSegmentIds!)!.length}]}).points.length).toBe(first.points.length);
  const short=line();short.points[1].x=15;const overflow=regenerateSketchTexts(short);expect(overflow.texts![0].warning).toBe('overflow');
  const fit=regenerateSketchTexts({...short,texts:[{...short.texts![0],fit:true}]});expect(fit.texts![0].warning).toBeUndefined();expect(fit.texts![0].pointIds.length).toBeGreaterThan(overflow.texts![0].pointIds.length);
 });
 it('E: explicitly converts MG to ordinary extrudable outlines; undo restores live editing',()=>{
  const live=regenerateSketchTexts({points:[],segments:[],texts:[text('MG')]}),undo=cloneSketchProfile(live);
  const converted=convertSketchTextToOutlines(live,'text');expect(converted.texts).toHaveLength(0);expect(converted.points).toEqual(live.points);expect(cadSketchRegions(converted).length).toBeGreaterThan(0);expect(undo.texts![0].content).toBe('MG');
 });
 it('keeps affine moves, resize, rotated editing and copy/paste parametric',()=>{
  const original=regenerateSketchTexts({points:[],segments:[],texts:[text()]});const moved=cloneSketchProfile(original);for(const p of moved.points){p.x+=17;p.z-=8;for(const h of [p.handleIn,p.handleOut])if(h){h.x+=17;h.z-=8;}}
  const regenerated=regenerateSketchTexts(carrySketchTexts(moved,original));expect(regenerated.texts![0].matrix[4]).toBeCloseTo(17);expect(regenerated.points[0].x).toBeCloseTo(original.points[0].x+17);
  const resized=stretchedSketchProfile(original,1.4,1.4);expect(regenerateSketchTexts(resized).points[0].x).toBeCloseTo(resized.points[0].x);
  const turn=sketchEditTurn({x:20,z:30},{x:0,z:1},{x:-1,z:0})!;
  const round=turnedSketchProfile(turnedSketchProfile(original,turn,'toPlate'),turn,'toBody');expect(regenerateSketchTexts(round).points[0].x).toBeCloseTo(original.points[0].x);
  const clipboard=copySketchSelection(original,{kind:'segment',id:original.segments[0].id})!;expect(clipboard.texts).toHaveLength(1);
  const pasted=pasteSketchClipboard(original,clipboard,{x:0,z:30},id).profile;expect(pasted.texts).toHaveLength(2);expect(pasted.texts![0].id).not.toBe(pasted.texts![1].id);valid(pasted);
 });
 it('preserves a constrained copied baseline and handles deleting its path without corrupting geometry',()=>{
  const source=line();source.constraints=[{id:'h',kind:'horizontal',a:'a',b:'b'}];const live=regenerateSketchTexts(source);
  const copy=copySketchSelection(live,{kind:'multiple',pointIds:live.points.map(p=>p.id),segmentIds:live.segments.map(s=>s.id)})!;
  const pasted=pasteSketchClipboard(live,copy,{x:0,z:25},id).profile;expect(pasted.texts![1].pathSegmentIds![0]).not.toBe('rail');valid(pasted);
  const before=cloneSketchProfile(live);const deleted=regenerateSketchTexts({...live,segments:live.segments.filter(s=>s.id!=='rail')});expect(deleted.texts![0].warning).toBe('missing-path');expect(deleted.points.filter(p=>p.id.startsWith('text:'))).toEqual(before.points.filter(p=>p.id.startsWith('text:')));
  const changed=cloneSketchProfile(live);changed.points.find(p=>p.id==='b')!.z=20;const solved=applySketchConstraints(changed,new Set(['b']));expect(solved.ok).toBe(true);valid(regenerateSketchTexts(solved.profile));
  expect(sketchTextPathSelection(live,live.texts![0].segmentIds[0])).toBeNull();
 });
 it('F: save/reload and history preserve text and constrained path associations',async()=>{
  const template=await importLylProject(readFileSync('apps/web/public/demo-examples/mounting-plate.lyl'));
  const p=line();p.texts![0].pathPosition=27.5;p.texts![0].bridges={width:.6,count:2};p.texts![0].connections={mode:"backer",width:1,padding:1,railOffset:1};p.texts![0].raised={backerThickness:1.5,letterHeight:2};p.constraints=[{id:'h',kind:'horizontal',a:'a',b:'b'}];const live=regenerateSketchTexts(p);template.shapes[0].sketchProfile=live;
  const history=editorHistoryEntry(template.shapes,[]);const restored=await importLylProject(await exportLylProject({...template,history:[history],historyIndex:0}));
  expect(restored.shapes[0].sketchProfile!.texts).toEqual(live.texts);
  const updated=restored.shapes[0].sketchProfile!;updated.texts![0].content='LAYERLING ROCKS';updated.points.find(p=>p.id==='b')!.x=180;valid(regenerateSketchTexts(updated));
 });
 it('retains custom font outlines and capital-size calibration in a saved project',async()=>{
  const font='custom:0123456789abcdef';registerCustomFont({id:font,name:'Demo font',data:structuredClone(textFont('Serif').data)},true);
  const template=await importLylProject(readFileSync('apps/web/public/demo-examples/mounting-plate.lyl'));
  const p=regenerateSketchTexts({points:[],segments:[],texts:[{...text('MG'),font}]});template.shapes[0].sketchProfile=p;
  const bytes=await exportLylProject({...template,history:[editorHistoryEntry(template.shapes,[])],historyIndex:0});
  resetCustomFontsForTests();const restored=await importLylProject(bytes);const next=regenerateSketchTexts(restored.shapes[0].sketchProfile!);
  expect(next.points).toEqual(p.points);expect(next.texts![0].font).toBe(font);
 });
 it('keeps multiline spacing and vertical lettering editable, including on a path',()=>{
  for(const p of [{points:[],segments:[],texts:[{...text('AB\nOR'),lineGap:3}]},{...line(),texts:[{...text('MAX'),vertical:true,pathSegmentIds:['rail']}]}]){
    const result=regenerateSketchTexts(p);valid(result);expect(result.texts![0].pointIds.length).toBeGreaterThan(0);expect(cadSketchRegions(result).length).toBeGreaterThan(0);
  }
 });
 it('disables path following near the existing baseline instead of jumping to the origin',()=>{
  const p=line();p.points.forEach(point=>{point.x+=300;point.z+=80;});p.texts![0].align='center';const live=regenerateSketchTexts(p);
  const detached=detachSketchTextPath(live.texts![0],live);expect(detached.pathSegmentIds).toBeUndefined();
  expect(detached.matrix[4]).toBeCloseTo(375);expect(detached.matrix[5]).toBeCloseTo(80);
  valid(regenerateSketchTexts({...live,texts:[detached]}));
 });

 it('moves path lettering using its offsets rather than detaching it from the baseline',()=>{
  const original=regenerateSketchTexts(line()),moved=cloneSketchProfile(original);const owned=new Set(original.texts![0].pointIds);
  for(const p of moved.points.filter(p=>owned.has(p.id))){p.x+=10;for(const h of [p.handleIn,p.handleOut])if(h)h.x+=10;}
  const next=regenerateSketchTexts(carrySketchTexts(moved,original));expect(next.texts![0].matrix).toEqual(original.texts![0].matrix);expect(next.texts![0].startOffset).toBeCloseTo(10);expect(next.texts![0].baselineOffset).toBeCloseTo(0);
 });

 it.each(['smooth',undefined] as const)('follows the displayed curved baseline for %s segments, not its straight chords',kind=>{
  const points=[
   {id:'a',x:-55,z:0,handleIn:{x:-65,z:18},handleOut:{x:-40,z:-22}},
   {id:'b',x:0,z:-50,handleIn:{x:-15,z:-48},handleOut:{x:18,z:-47}},
   {id:'c',x:50,z:12,handleIn:{x:45,z:-10},handleOut:{x:48,z:30}},
   {id:'d',x:-5,z:60,handleIn:{x:20,z:57},handleOut:{x:-24,z:56}},
   {id:'e',x:-43,z:28,handleIn:{x:-35,z:45},handleOut:{x:-65,z:8}}
  ];
  const segments=points.map((p,i)=>({id:p.id+'-edge',startId:p.id,endId:points[(i+1)%points.length].id,kind,construction:true}));
  const p:SketchProfile={points,segments,texts:[{...text('Omg this is some text on a path'),size:4,pathSegmentIds:segments.map(s=>s.id)}]};
  const reference={...p,segments:segments.map(s=>({...s,kind:'bezier' as const}))};
  const actual=sketchTextBaseline(p,segments.map(s=>s.id))!,expected=sketchTextBaseline(reference,segments.map(s=>s.id))!;
  expect(actual.length).toBeCloseTo(expected.length,8);
  for(let i=0;i<=100;i++){
   const u=i/100;expect(actual.curve.getPointAt(u).distanceTo(actual.curve.getPoint(u))).toBeLessThan(1e-10);
   let distance=u*actual.length;
   for(const component of actual.curve.curves){const length=component.getLength();if(distance<=length+1e-8){expect(actual.curve.getTangentAt(u).distanceTo(component.getTangentAt(Math.min(1,distance/length)))).toBeLessThan(1e-7);break;}distance-=length;}
  }
  for(let i=0;i<=100;i++){expect(actual.curve.getPointAt(i/100).distanceTo(expected.curve.getPointAt(i/100))).toBeLessThan(1e-7);expect(actual.curve.getTangentAt(i/100).distanceTo(expected.curve.getTangentAt(i/100))).toBeLessThan(1e-7);}
  const result=regenerateSketchTexts(p),correct=regenerateSketchTexts(reference);
  expect(result.points).toEqual(correct.points);
 });
 it('matches the editor when a Bezier segment is missing a required handle',()=>{
  const p=line();p.segments[0].kind='bezier';p.points[0].handleOut={x:20,z:-50};
  const b=sketchTextBaseline(p,['rail'])!;expect(b.length).toBeCloseTo(150,8);expect(b.curve.getPointAt(.5).y).toBeCloseTo(0,8);
 });

});
