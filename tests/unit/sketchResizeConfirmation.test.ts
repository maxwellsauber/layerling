import { describe, expect, it } from "vitest";
import { edgeTreatmentAppliedFrame } from "@/lib/edgeTreatmentHistory";
import { constrainedSketchResizeIds, withoutResizedSketchConstraints } from "@/lib/sketchResizeConfirmation";
import type { WorkplaneShape } from "@/types/layerling";
const body = (id="sketch"): WorkplaneShape => ({id,name:"Sketch",kind:"mesh",width:20,depth:20,height:10,size:20,x:0,z:0,elevation:0,rotation:0,color:"#123456",locked:false,hidden:false,
  sketchProfile:{points:[{id:"a",x:0,z:0},{id:"b",x:20,z:0}],segments:[{id:"ab",startId:"a",endId:"b"}],constraints:[{id:"length",kind:"distance",a:"a",b:"b",value:20}]}} as WorkplaneShape);
describe("3D resize constraint confirmation",()=>{
  it.each(["width","depth","size"] as const)("detects %s edits without mutating the current sketch",key=>{
    const original=body(),before=structuredClone(original),next={...original,[key]:30};
    expect(constrainedSketchResizeIds([original],[next])).toEqual([original.id]);expect(original).toEqual(before);
  });
  it("allows extrusion height changes while keeping every sketch constraint",()=>{
    const original=body(),next={...original,height:30,elevation:5};
    expect(constrainedSketchResizeIds([original],[next])).toEqual([]);
    expect(next.sketchProfile).toBe(original.sketchProfile);
    expect(constrainedSketchResizeIds([original],[{...next,width:25}])).toEqual([original.id]);
  });
  it.each(["revolve","sweep"] as const)("still protects the outline when resizing a %s body",sketchOperation=>{
    const original={...body(),sketchOperation};
    expect(constrainedSketchResizeIds([original],[{...original,height:30}])).toEqual([original.id]);
  });
  it("allows height on a flat hollowed extrusion, but protects a tilted baked sketch",()=>{
    const original={...body(),sketchPose:{height:10,anchor:{x:10,z:0},transform:[1,0,0,0,0,1,0,0,0,0,1,0]}};
    expect(constrainedSketchResizeIds([original],[{...original,height:30}])).toEqual([]);
    const tilted={...original,sketchPose:{...original.sketchPose,transform:[1,0,0,0,0,0,-1,0,0,1,0,0]}};
    expect(constrainedSketchResizeIds([tilted],[{...tilted,height:30}])).toEqual([original.id]);
  });
  it("does not warn for placement, rotation, unchanged size, or unconstrained bodies",()=>{
    const original=body();expect(constrainedSketchResizeIds([original],[{...original,x:30,rotation:45}])).toEqual([]);
    expect(constrainedSketchResizeIds([original],[original])).toEqual([]);
    const free={...original,sketchProfile:{...original.sketchProfile!,constraints:[]}};
    expect(constrainedSketchResizeIds([free],[{...free,width:30}])).toEqual([]);
  });
  it.each(["fillet", "chamfer", "shell"] as const)("allows a recorded %s without removing constraints, even when the bounds change", kind => {
    const original=body();
    const next={...original,width:19,depth:18,size:19};
    const entry={id:"modifier",createdAt:1,before:original,feature:{kind,amount:1,edgeCount:3},appliedFrame:edgeTreatmentAppliedFrame(next)};
    const treated={...next,edgeTreatments:[entry.feature],edgeTreatmentHistory:[entry]};
    expect(constrainedSketchResizeIds([original],[treated])).toEqual([]);
    expect(treated.sketchProfile?.constraints).toEqual(original.sketchProfile?.constraints);
    expect(constrainedSketchResizeIds([treated],[{...treated,width:30}])).toEqual([original.id]);
    expect(constrainedSketchResizeIds([original],[{...treated,width:30}])).toEqual([original.id]);
  });
  it("does not exempt a modifier whose source was resized first",()=>{
    const original=body(),resized={...original,width:30};
    const entry={id:"modifier",createdAt:1,before:resized,feature:{kind:"fillet" as const,amount:1,edgeCount:3},appliedFrame:edgeTreatmentAppliedFrame(resized)};
    expect(constrainedSketchResizeIds([original],[{...resized,edgeTreatmentHistory:[entry]}])).toEqual([original.id]);
  });
  it("removes only the approved bodies' constraints and preserves geometry and the original history snapshot",()=>{
    const original=body(),other=body("other"),next={...original,width:30};
    const approved=withoutResizedSketchConstraints([next,other],[original.id]);
    expect(approved[0].width).toBe(30);expect(approved[0].sketchProfile?.constraints).toBeUndefined();
    expect(approved[0].sketchProfile?.points).toEqual(original.sketchProfile?.points);
    expect(approved[1]).toBe(other);expect(original.sketchProfile?.constraints).toHaveLength(1);
  });
  it("detects every affected sketch in a selection, ignoring newly created geometry",()=>{
    const first=body(),second=body("second"),newBody=body("new");
    expect(constrainedSketchResizeIds([first,second],[{...first,width:30},{...second,depth:40},newBody])).toEqual([first.id,second.id]);
  });
});
