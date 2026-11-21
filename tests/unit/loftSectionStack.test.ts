import { makeShapeFromAsset, toolbarShapeAssets } from "@/lib/shapeCatalog";
import { loftMeasures } from "@/lib/loftGeometry";
import { describe, expect, it } from "vitest";
import { addLoftSection, loftStackSections, reorderLoftSections } from "@/lib/loftSectionStack";
import { normalizeLoftMeasures } from "@/lib/loftGeometry";
const svg={name:"triangle.svg",points:[{x:-.5,z:-.5},{x:.5,z:-.5},{x:0,z:.5}]};
const measures=()=>normalizeLoftMeasures({bottomWidth:40,topWidth:30,offsetX:10,wall:1,middles:[{at:.3,outline:"polygon",width:20,depth:20,corner:0,sides:5,offsetX:2,offsetZ:0},{at:.6,outline:"svg",svg,width:25,depth:25,corner:0,sides:6,offsetX:4,offsetZ:0}]});
describe("loft layer ordering",()=>{
 it("starts a fresh loft with a circle and a sharp square",()=>{
   const fresh=makeShapeFromAsset(toolbarShapeAssets.find(asset=>asset.kind==="loft")!);
   const m=loftMeasures(fresh);
   expect(m.topOutline).toBe("round");expect(m.bottomOutline).toBe("rectangle");
   expect(m.bottomWidth).toBe(m.bottomDepth);expect(m.bottomCorner).toBe(0);expect(m.middles).toHaveLength(0);
 });
 it("moves a whole profile between height slots, including SVG and polygon parameters",()=>{
   const before=measures(), next=normalizeLoftMeasures({...before,...reorderLoftSections(before,2,1)});
   expect(next.middles.map(m=>m.at)).toEqual([.3,.6]);
   expect(next.middles[0]).toMatchObject({outline:"svg",svg:{name:"triangle.svg"},width:25,offsetX:4});
   expect(next.middles[1]).toMatchObject({outline:"polygon",sides:5,width:20,offsetX:2});
   expect(next.wall).toBe(1);expect(before.middles[0].width).toBe(20);
 });
 it("can move an end to the other end, rebasing offsets to the new bottom",()=>{
   const before=measures(),next=normalizeLoftMeasures({...before,...reorderLoftSections(before,3,0)});
   expect(next.bottomWidth).toBe(30);expect(next.topWidth).toBe(25);
   expect(next.offsetX).toBe(-6);expect(next.middles[0].offsetX).toBe(-10);
   expect(loftStackSections(next).map(s=>s.at)).toEqual([0,.3,.6,1]);
 });
 it("adds one editable profile without removing or reordering existing profiles",()=>{
   const before=measures(),{middles,added}=addLoftSection(before);
   expect(middles).toHaveLength(3);expect(added).toBeDefined();expect(added).toMatchObject({outline:"polygon",sides:6});expect(added?.svg).toBeUndefined();
   for(const original of before.middles)expect(middles).toContainEqual(original);
 });
 it("ignores invalid and unchanged moves",()=>{
   for(const [from,to] of [[-1,0],[0,8],[1,1],[.5,1]])expect(reorderLoftSections(measures(),from,to)).toEqual({});
 });
});
