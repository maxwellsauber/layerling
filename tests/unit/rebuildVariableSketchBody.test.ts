import { describe, expect, it, vi } from "vitest";
import { rebuildVariableSketchBody } from "@/lib/rebuildVariableSketchBody";
import { edgeTreatmentAppliedFrame } from "@/lib/edgeTreatmentHistory";
import type { EdgeTreatmentHistoryEntry, SketchProfile, WorkplaneShape } from "@/types/layerling";

const profile: SketchProfile = {points:[{id:'a',x:0,z:0},{id:'b',x:40,z:0},{id:'c',x:0,z:30}],segments:[]};
const source: WorkplaneShape = {id:'triangle',name:'My triangle',kind:'mesh',x:10,z:20,elevation:5,width:40,depth:30,size:40,height:10,rotation:25,color:'#ff0000',sketchProfile:profile};
const shell: EdgeTreatmentHistoryEntry = {id:'shell',createdAt:1,before:source,appliedFrame:edgeTreatmentAppliedFrame(source),feature:{kind:'shell',amount:1.5,openings:'top',edgeCount:0,shellEdges:'sharp',shellDividers:{x:1,z:0}}};
const hollow:WorkplaneShape = {...source,edgeTreatments:[shell.feature],edgeTreatmentHistory:[shell]};
const changed:SketchProfile = {...profile,points:profile.points.map(p=>({...p,x:p.x*2}))};

describe('variable-driven sketch body rebuild',()=>{
 it('rebuilds the original source then reapplies Hollow at its original thickness and placement',async()=>{
  const build=vi.fn(async(base:WorkplaneShape,p:SketchProfile)=>({...base,width:80,sketchProfile:p,edgeTreatments:undefined,edgeTreatmentHistory:undefined}));
  const replay=vi.fn(async(body:WorkplaneShape,entry:EdgeTreatmentHistoryEntry)=>({...body,edgeTreatments:[entry.feature],edgeTreatmentHistory:[{...entry,before:body}]}));
  const result=await rebuildVariableSketchBody(hollow,changed,build,replay);
  expect(build.mock.calls[0][0]).toMatchObject({height:10,x:10,z:20,elevation:5,rotation:25});
  expect(build.mock.calls[0][0].edgeTreatmentHistory).toBeUndefined();
  expect(result.width).toBe(80);
  expect(result.edgeTreatments).toEqual([shell.feature]);
  expect(result.edgeTreatmentHistory![0].before.sketchProfile).toBe(changed);
  expect(hollow.sketchProfile).toBe(profile);
 });
 it('replays modifiers sequentially, passing the hollow body to the following fillet',async()=>{
  const fillet:EdgeTreatmentHistoryEntry={id:'fillet',createdAt:2,before:hollow,feature:{kind:'fillet',amount:.5,edgeCount:1,edgeIds:[2]}};
  const order:string[]=[];
  await rebuildVariableSketchBody({...hollow,edgeTreatments:[shell.feature,fillet.feature],edgeTreatmentHistory:[shell,fillet]},changed,
   async(base)=>({...base,edgeTreatments:[]}),async(body,entry)=>{
    if(entry.feature.kind==='fillet')expect(body.edgeTreatments).toEqual([shell.feature]);
    order.push(entry.feature.kind);
    return {...body,edgeTreatments:[...(body.edgeTreatments??[]),entry.feature]};
   });
  expect(order).toEqual(['shell','fillet']);
 });
 it('preserves twist, lean and proportional taper applied after Hollow',async()=>{
  const deformed={...hollow,extrudeTwist:45,extrudeTopOffsetX:3,extrudeTopOffsetZ:-2,taperTopWidth:20,taperTopDepth:15};
  const result=await rebuildVariableSketchBody(deformed,changed,
    async(base,p)=>({...base,width:80,depth:30,size:80,sketchProfile:p}),async(body)=>body);
  expect(result).toMatchObject({extrudeTwist:45,extrudeTopOffsetX:3,extrudeTopOffsetZ:-2,taperTopWidth:40,taperTopDepth:15});
 });
 it('propagates replay failure without mutating the original body',async()=>{
  const before=JSON.stringify(hollow);
  await expect(rebuildVariableSketchBody(hollow,changed,async(base)=>base,async()=>{throw Error('Walls no longer fit');})).rejects.toThrow('Walls no longer fit');
  expect(JSON.stringify(hollow)).toBe(before);
 });
 it('refuses unsupported or incomplete history before rebuilding instead of dropping operations',async()=>{
  const build=vi.fn(async(base:WorkplaneShape)=>base);
  const replay=vi.fn(async(base:WorkplaneShape)=>base);
  await expect(rebuildVariableSketchBody({...hollow,edgeTreatmentHistory:[]},changed,build,replay)).rejects.toThrow('preserve');
  await expect(rebuildVariableSketchBody({...hollow,edgeTreatmentHistory:[{...shell,feature:{kind:'deleteFace',amount:0,edgeCount:0}}]},changed,build,replay)).rejects.toThrow('preserve');
  expect(build).not.toHaveBeenCalled();
 });
});
