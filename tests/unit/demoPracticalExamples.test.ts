import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {importLylProject} from '@/lib/lylProject';
import {applySketchConstraints,validSketchConstraints} from '@/lib/sketchConstraints';
import {updateSketchOffsets} from '@/lib/sketchOffsets';
import type {SketchProfile} from '@/types/layerling';
const root='apps/web/public/demo-examples/';
async function profile(id:string){return (await importLylProject(readFileSync(root+id+'.lyl'))).shapes[0].sketchProfile!;}
function solved(p:SketchProfile){const r=applySketchConstraints(p);expect(r.ok).toBe(true);if(!r.ok)throw Error(JSON.stringify(r.failure));expect(validSketchConstraints(r.profile)).toHaveLength(p.constraints?.length??0);return r.profile;}
it('keeps mounting holes centered and 50 mm apart when width changes to 110 mm',async()=>{
 const p=await profile('mounting-plate');const width=p.constraints!.find(c=>c.id==='width')!;if(width.kind!=='distance')throw Error();width.value=110;
 const next=solved(p),point=(id:string)=>next.points.find(p=>p.id===id)!;
 expect(point('b').x-point('a').x).toBeCloseTo(110,3);
 const centers=['left','right'].map(side=>{const c=next.constraints!.find(c=>c.id===`${side}-diameter`)!;if(c.kind!=='circle-diameter')throw Error();const points=next.points.filter(p=>c.outline.includes(p.id));return {x:points.reduce((s,p)=>s+p.x/4,0),z:points.reduce((s,p)=>s+p.z/4,0)};});
 expect(centers[1].x-centers[0].x).toBeCloseTo(50,3);
 expect((centers[0].x+centers[1].x)/2).toBeCloseTo((point('a').x+point('b').x)/2,3);
 expect(centers[0].z).toBeCloseTo(0,3);expect(centers[1].z).toBeCloseTo(0,3);
});
it('grows the spacer to 54 mm outside for a 48 mm opening and then supports a 4 mm wall',async()=>{
 const p=await profile('spacer-ring');const d=p.constraints!.find(c=>c.kind==='circle-diameter')!;if(d.kind!=='circle-diameter')throw Error();d.value=48;
 let next=solved(p);const gap=next.constraints!.find(c=>c.kind==='concentric')!;if(gap.kind!=='concentric')throw Error();
 const diameter=(ids:string[],p:SketchProfile)=>{const x=p.points.filter(q=>ids.includes(q.id)).map(q=>q.x);return Math.max(...x)-Math.min(...x);};
 expect(diameter(gap.circles[1],next)).toBeCloseTo(54,3);gap.radialGap=4;next=solved(next);expect(diameter(gap.circles[1],next)).toBeCloseTo(56,3);
});
it('regenerates a label border after its source corner moves and distance becomes 5 mm',async()=>{
 const p=await profile('label-border'),before=structuredClone(p);p.points.find(q=>q.id==='tag-2')!.x+=10;
 const result=updateSketchOffsets(p);expect(result.ok).toBe(true);if(!result.ok)throw Error(result.message);
 expect(result.profile.points).not.toEqual(before.points);result.profile.offsets![0].distance=5;
 const wider=updateSketchOffsets(result.profile);expect(wider.ok).toBe(true);if(!wider.ok)throw Error(wider.message);
 expect(wider.profile.offsets![0].distance).toBe(5);expect(wider.profile.offsets![0].segmentIds.length).toBeGreaterThan(0);
 expect(wider.profile.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.z))).toBe(true);
});
it('keeps a picture-hanger outline symmetric when either shoulder moves, and detaches without losing geometry',async()=>{
 const original=await profile('symmetric-hanger');
 const symmetry=original.constraints!.filter(c=>c.kind==='symmetry');expect(symmetry.length).toBeGreaterThan(0);
 const pairs=symmetry.flatMap(c=>c.kind==='symmetry'?[[c.a,c.b],...(c.pair?[c.pair]:[])]:[]);
 const shoulder=pairs.find(([a,b])=>a==='side-2'||b==='side-2')!;expect(shoulder).toBeTruthy();
 for(const id of shoulder){const p=structuredClone(original);const point=p.points.find(q=>q.id===id)!;point.x+=Math.sign(point.x)*8;point.z+=3;
 const result=applySketchConstraints(p,new Set([id]));expect(result.ok).toBe(true);if(!result.ok)throw Error(JSON.stringify(result.failure));
 for(const [a,b] of pairs){const pa=result.profile.points.find(p=>p.id===a)!,pb=result.profile.points.find(p=>p.id===b)!;expect(pa.x).toBeCloseTo(-pb.x,4);expect(pa.z).toBeCloseTo(pb.z,4);}
 }
 const released={...original,constraints:original.constraints!.filter(c=>c.kind!=='symmetry')};expect(released.points).toEqual(original.points);expect(released.segments).toEqual(original.segments);
 const point=released.points.find(p=>p.id==='side-2')!;const independent=structuredClone(released);independent.points.find(p=>p.id===point.id)!.x+=8;
 const solved=applySketchConstraints(independent,new Set([point.id]));expect(solved.ok).toBe(true);
 expect(solved.profile.points.find(p=>p.id===shoulder[1])!.x).toBe(original.points.find(p=>p.id===shoulder[1])!.x);
});
