import {readFileSync} from 'node:fs';
import {it,expect} from 'vitest';
import {importLylProject,exportLylProject} from '@/lib/lylProject';
import {applySketchConstraints,validSketchConstraints} from '@/lib/sketchConstraints';
import {updateSketchOffsets} from '@/lib/sketchOffsets';
import {sketchNotesFromBody,sketchNoteFrame} from '@/lib/sketchNotes';
import type {SketchProfile} from '@/types/layerling';
const file='apps/web/public/demo-examples/control-panel.lyl';
async function project(){return importLylProject(readFileSync(file));}
function solve(p:SketchProfile,moved?:Set<string>){const r=applySketchConstraints(p,moved);expect(r.ok,JSON.stringify(!r.ok&&r.failure)).toBe(true);expect(validSketchConstraints(r.profile)).toHaveLength(p.constraints!.length);expect(r.profile.points.every(q=>Number.isFinite(q.x)&&Number.isFinite(q.z))).toBe(true);return r.profile;}
function dimension(p:SketchProfile,id:string,value:number){const rule=p.constraints!.find(c=>c.id===id)!;if(!('value' in rule))throw Error(id);rule.value=value;return solve(p);}
it('supports the guided panel edits together, retaining centered display, symmetry and a sliding rectangular slot',async()=>{
 let p=(await project()).shapes[0].sketchProfile!;
 p=dimension(p,'display-width',56);p=dimension(p,'half-width',65);
 const point=(id:string)=>p.points.find(q=>q.id===id)!;
 expect(point('display-b').x-point('display-a').x).toBeCloseTo(56,3);
 expect((point('display-b').x+point('display-a').x)/2).toBeCloseTo(0,3);
 expect(point('display-c').z-point('display-b').z).toBeCloseTo(18,3);
 point('side-3').x+=4;p=solve(p,new Set(['side-3']));
 const symmetry=p.constraints!.filter(c=>c.kind==='symmetry');
 for(const rule of symmetry){if(rule.kind!=='symmetry')continue;for(const [a,b] of [[rule.a,rule.b],...(rule.pair?[rule.pair]:[])]){expect(point(a).x).toBeCloseTo(-point(b).x,3);expect(point(a).z).toBeCloseTo(point(b).z,3);}}
 const before=point('slot-a').x;
 for(let step=0;step<8;step++){point('slot-a').x+=1;p=solve(p,new Set(['slot-a']));}
 expect(point('slot-a').x).toBeCloseTo(before+8,3);expect(point('slot-a').z).toBeCloseTo(28,3);
 expect(point('slot-b').x-point('slot-a').x).toBeCloseTo(14,3);
 expect(point('slot-c').z-point('slot-b').z).toBeCloseTo(6,3);
 p=dimension(p,'left-button-diameter',12);
 expect(p.constraints!.some(c=>c.kind==='parallel')).toBe(true);expect(p.constraints!.some(c=>c.kind==='equal-length')).toBe(true);expect(p.constraints!.some(c=>c.kind==='perpendicular')).toBe(true);
});
it('updates the separate trim ring and associative bezel without claiming cross-body dependencies',async()=>{
 const {shapes}=await project();let ring=shapes[2].sketchProfile!;
 const diameter=ring.constraints!.find(c=>c.kind==='circle-diameter')!;ring=dimension(ring,diameter.id,12);
 const gap=ring.constraints!.find(c=>c.kind==='concentric')!;if(gap.kind!=='concentric')throw Error();
 const width=(ids:string[])=>{const xs=ring.points.filter(q=>ids.includes(q.id)).map(q=>q.x);return Math.max(...xs)-Math.min(...xs);};
 expect(width(gap.circles[1])).toBeCloseTo(18,3);gap.radialGap=4;ring=solve(ring);expect(width(gap.circles[1])).toBeCloseTo(20,3);
 const bezel=shapes[1].sketchProfile!;bezel.points.find(q=>q.id==='side-2')!.x+=5;bezel.offsets![0].distance=5;
 const rebuilt=updateSketchOffsets(bezel);expect(rebuilt.ok).toBe(true);expect(rebuilt.profile.offsets![0].distance).toBe(5);
 expect(shapes[0].sketchProfile!.points.find(q=>q.id==='side-2')!.x).toBe(60);
});
it('restores all guided notes in their owning sketches and retains notes and relationships through save/reload',async()=>{
 const original=await project();expect(original.notes).toHaveLength(8);
 for(const shape of original.shapes){const notes=sketchNotesFromBody(original.notes!,shape,sketchNoteFrame(shape,'extrude',shape.sketchProfile!));expect(notes.length).toBeGreaterThan(0);expect(notes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.z))).toBe(true);}
 const bytes=await exportLylProject({...original,projectId:'test-independent-panel',modifiedAt:Date.now()});const restored=await importLylProject(bytes);
 expect(restored.notes).toEqual(original.notes);expect(restored.shapes.map(s=>s.sketchProfile)).toEqual(original.shapes.map(s=>s.sketchProfile));
 expect(restored.notes!.every(n=>restored.shapes.some(s=>s.id===n.anchor?.shapeId))).toBe(true);
});
