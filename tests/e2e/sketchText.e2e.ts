import {afterAll,beforeAll,expect,it} from 'vitest';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import manifoldModule from 'manifold-3d';
import {rememberManifoldRuntime} from '@/lib/manifoldHandle';
import {strokedSketchProfile} from '@/lib/sketchStroke';
import {OcctKernel} from 'occt-wasm';
import {loadTextFonts} from '@/lib/textFonts';
import {newSketchText,attachSketchTextPath,setSketchTextPathGuide,regenerateSketchTexts,convertSketchTextToOutlines} from '@/lib/sketchText';
import {sketchRaisedTextPlan} from '@/lib/sketchRaisedText';
import {buildRaisedSketchTextSolid} from '@/lib/cadSketchRaisedText';
import {cadSketchRegions} from '@/lib/sketchCadProfile';
import {pathWire} from '@/lib/sketchCadWire';
import {sketchPrimitiveGeometry} from '@/lib/sketchPrimitives';
import type {SketchProfile} from '@/types/layerling';
let cad:OcctKernel;
beforeAll(async()=>{await loadTextFonts();cad=await OcctKernel.init({wasm:join(dirname(fileURLToPath(import.meta.resolve('occt-wasm'))),'occt-wasm.wasm')});});
afterAll(()=>cad?.releaseAll());
function extrude(profile:SketchProfile){const regions=cadSketchRegions(profile);expect(regions.length).toBeGreaterThan(0);for(const r of regions){let face=cad.makeFace(pathWire(cad,r.outer));if(r.holes.length)face=cad.addHolesInFace(face,r.holes.map(h=>pathWire(cad,h)));const solid=cad.extrude(face,0,3,0);expect(cad.isValid(solid)).toBe(true);const mesh=cad.tessellate(solid);expect(mesh.positions.length).toBeGreaterThan(0);expect([...mesh.positions].every(Number.isFinite)).toBe(true);}}
it.each(['Sans','Serif','Script','Multilanguage','Monospace','Rounded','Stencil'])('extrudes native and converted %s lettering with real OCCT solids',font=>{
 const p=regenerateSketchTexts({points:[],segments:[],texts:[{...newSketchText('text'),font,content:'MG ABOPR',size:8}]});
 extrude(p);extrude(convertSketchTextToOutlines(p,'text'));
});
it.each(['bezier','smooth',undefined] as const)('extrudes lettering after a %s curved baseline changes',kind=>{
 const p:SketchProfile={points:[{id:'a',x:0,z:0,handleOut:{x:50,z:-50}},{id:'b',x:160,z:0,handleIn:{x:110,z:50}}],segments:[{id:'curve',startId:'a',endId:'b',kind,construction:true}],texts:[{...newSketchText('brand'),content:'LAYERLING ROCKS',size:6,pathSegmentIds:['curve']}]};
 extrude(regenerateSketchTexts(p));p.points[0].handleOut!.z=-80;extrude(regenerateSketchTexts(p));
});
it.each([false,true])('extrudes reversed closed-circle text with other-side=%s without including its construction baseline',flip=>{
 let n=0;const circle=sketchPrimitiveGeometry('circle',{x:0,z:0},()=>`circle-${++n}`,100);
 const p=regenerateSketchTexts({...circle,segments:circle.segments.map(s=>({...s,construction:true})),texts:[{...newSketchText('closed'),content:'MADE WITH LAYERLING',size:6,pathSegmentIds:circle.segments.map(s=>s.id),startOffset:20,reverse:true,flip}]});
 extrude(p);
});

it('excludes a circular text guide from solids and restores the circle when included',()=>{
 let n=0;const circle=sketchPrimitiveGeometry('circle',{x:0,z:0},()=>`guide-${++n}`,100),ids=circle.segments.map(s=>s.id);
 const source:SketchProfile={...circle,texts:[{...newSketchText('guide-label'),content:'MG',size:6}]};
 const guide=regenerateSketchTexts(attachSketchTextPath(source,'guide-label',ids));
 expect(cadSketchRegions(guide).some(r=>r.outer.steps.some(s=>ids.includes(s.segment.id)))).toBe(false);
 extrude(guide);
 const included=regenerateSketchTexts(setSketchTextPathGuide(guide,ids,false));
 expect(cadSketchRegions(included).some(r=>r.outer.steps.some(s=>ids.includes(s.segment.id)))).toBe(true);
 extrude(included);
});

it('extrudes a stroked curved baseline with unchanged filled text and counters',async()=>{
 const runtime=await manifoldModule();runtime.setup();
 const p=regenerateSketchTexts({points:[{id:'a',x:0,z:0,handleOut:{x:40,z:-20}},{id:'b',x:150,z:0,handleIn:{x:110,z:20}}],segments:[{id:'rail',startId:'a',endId:'b',kind:'smooth'}],texts:[{...newSketchText('label'),content:'ABOPR',size:8,pathSegmentIds:['rail'],baselineOffset:-20}]});
 for(const width of [2,8]){
  const mixed=strokedSketchProfile(runtime,{...p,stroke:{width,align:'center',join:'round',cap:'round'}})!;
  expect(cadSketchRegions(mixed).reduce((sum,r)=>sum+r.holes.length,0)).toBeGreaterThanOrEqual(5);
  extrude(mixed);
 }
});

it('extrudes bridged text and preserves its stencil channels after conversion',async()=>{
 const runtime=await manifoldModule();runtime.setup();rememberManifoldRuntime(runtime);
 const p=regenerateSketchTexts({points:[],segments:[],texts:[{...newSketchText('stencil'),content:'ABOPR',size:12,bridges:{width:.6,count:2}}]});
 expect(p.texts![0].bridgeUnheld).toBe(0);expect(cadSketchRegions(p).every(r=>r.holes.length===0)).toBe(true);
 extrude(p);extrude(convertSketchTextToOutlines(p,'stencil'));
});

it.each(['join','rail','backer'] as const)('extrudes %s connected text as one valid solid',async mode=>{
 const runtime=await manifoldModule();runtime.setup();rememberManifoldRuntime(runtime);
 const p=regenerateSketchTexts({points:[{id:'a',x:0,z:0,handleOut:{x:40,z:-25}},{id:'b',x:180,z:0,handleIn:{x:140,z:25}}],segments:[{id:'curve',startId:'a',endId:'b',kind:'smooth',construction:true}],texts:[{...newSketchText('connected'),content:'Hi Max!',size:10,pathSegmentIds:['curve'],connections:{mode,width:1,padding:1,railOffset:1}}]});
 expect(p.texts![0].connectionParts).toBe(1);expect(cadSketchRegions(p)).toHaveLength(1);extrude(p);
 const regions=cadSketchRegions(p),loops=regions.flatMap(r=>[r.outer,...r.holes]).map(path=>path.points.map(v=>[v.x,v.z] as [number,number]));
 const section=new runtime.CrossSection(loops,'EvenOdd');const solid=section.extrude(3);const pieces=solid.decompose();
 try{expect(pieces).toHaveLength(1);expect(solid.volume()).toBeGreaterThan(0);}finally{pieces.forEach(piece=>piece.delete());solid.delete();section.delete();}
});

it.each([false,true])('builds a thin backer with raised editable lettering, curved=%s',async curved=>{
 const runtime=await manifoldModule();runtime.setup();rememberManifoldRuntime(runtime);
 const profile:SketchProfile={points:[{id:'a',x:0,z:0,handleOut:{x:30,z:-20}},{id:'b',x:100,z:0,handleIn:{x:70,z:20}}],segments:[{id:'baseline',startId:'a',endId:'b',kind:curved?'smooth':'line',construction:true}],texts:[{...newSketchText('badge'),content:'BO',size:10,pathSegmentIds:['baseline'],connections:{mode:'backer',width:1,padding:1,railOffset:1},raised:{backerThickness:1.5,letterHeight:2}}]};
 const live=regenerateSketchTexts(profile),plan=sketchRaisedTextPlan(live);
 const solid=buildRaisedSketchTextSolid(cad,plan.profile,10,plan.stacks);
 expect(cad.isValid(solid)).toBe(true);expect(cad.getVolume(solid)).toBeGreaterThan(0);
 const mesh=cad.tessellate(solid),ys=[...mesh.positions].filter((_,i)=>i%3===1);
 expect(Math.min(...ys)).toBeCloseTo(0,5);expect(Math.max(...ys)).toBeCloseTo(3.5,5);
 const levels=new Set(ys.map(y=>Math.round(y*1000)/1000));expect(levels.has(1.5)).toBe(true);
 const changed=regenerateSketchTexts({...live,texts:live.texts!.map(text=>({...text,raised:{backerThickness:2,letterHeight:3}}))});
 const next=sketchRaisedTextPlan(changed),updated=buildRaisedSketchTextSolid(cad,next.profile,10,next.stacks);
 expect(cad.isValid(updated)).toBe(true);expect(cad.getVolume(updated)).toBeGreaterThan(cad.getVolume(solid));
});
