// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { loftProfileFromSvg } from "@/lib/loftSvgImport";
import { createLoftGeometry, loftFieldsFromMeasures, loftMiddlesWithCount, loftMeasures, loftMeasuresPatch, loftProfileLoops, loftStoredMeasures } from "@/lib/loftGeometry";
import { normalizeLoftSvgProfile, insetLoftSvg } from "@/lib/loftSvgGeometry";
import { validateClosedSolidTriangleSoup } from "@/lib/svgImport";
import { editorHistoryEntry } from "@/lib/editorHistory";
import { DEFAULT_SNAP_GRID, DEFAULT_WORKPLANE_WORKSPACE } from "@/lib/workplaneSettings";
import { canonicalizeShape } from "@/lib/workplaneShapes";
import { exportLylProject, importLylProject } from "@/lib/lylProject";
import type { WorkplaneShape } from "@/types/layerling";
const svg=(drawing:string)=>`<svg xmlns="http://www.w3.org/2000/svg">${drawing}</svg>`;
const outline=svg('<path d="M0 0 H40 V10 H20 V30 H0 Z"/>');
function loft(extra:Partial<WorkplaneShape>={}):WorkplaneShape {
  return canonicalizeShape({id:"svg-loft",name:"SVG loft",kind:"loft",x:0,z:0,size:40,width:40,depth:30,height:30,rotation:0,color:"#ff8800",loftBottomOutline:"svg",loftTopOutline:"svg",loftBottomSvg:loftProfileFromSvg(outline,"L.svg"),loftTopSvg:loftProfileFromSvg(outline,"L.svg"),loftBottomWidth:40,loftTopWidth:40,loftBottomDepth:30,loftTopDepth:30,...extra});
}
function solid(shape:WorkplaneShape) {
 const g=createLoftGeometry(shape), a=g.getAttribute("position");

 try { return validateClosedSolidTriangleSoup(Array.from(a.array)); } finally {g.dispose();}
}
describe("SVG loft outlines",()=>{
 it("quality refines SVG-to-curve correspondence and twisted display walls",()=>{
   const base=loft({loftTopOutline:"round",loftTwist:60});
   const low=createLoftGeometry({...base,loftSegments:24}),high=createLoftGeometry({...base,loftSegments:240});
   try {
     expect(high.getAttribute('position').count).toBeGreaterThan(low.getAttribute('position').count*2);
     expect(validateClosedSolidTriangleSoup(Array.from(high.getAttribute('position').array)).volume).toBeGreaterThan(0);
     const coarse=loftProfileLoops({...base,loftSegments:24}),fine=loftProfileLoops({...base,loftSegments:240});
     expect(fine.loops[0].segments.length).toBeGreaterThan(coarse.loops[0].segments.length);
   }finally{low.dispose();high.dispose();}
 });
 it("samples curved SVG imports accurately without bloating straight edges",()=>{
   const circle=loftProfileFromSvg(svg('<circle r="100"/>'),"circle.svg");
   expect(circle.points.length).toBeGreaterThan(64);
   expect(circle.points.length).toBeLessThanOrEqual(512);
   for(let i=0;i<circle.points.length;i++){
     const a=circle.points[i],b=circle.points[(i+1)%circle.points.length];
     expect(.5-Math.hypot((a.x+b.x)/2,(a.z+b.z)/2)).toBeLessThan(.0003);
   }
   expect(loftProfileFromSvg(svg('<rect width="20" height="10"/>'),"box.svg").points).toHaveLength(4);
 });
 it("uses existing SVG transforms, preserves concavity and normalizes the frame",()=>{
   const profile=loftProfileFromSvg(svg('<g transform="translate(100,200) scale(2)"><path d="M0 0 H40 V10 H20 V30 H0 Z"/></g>'),"L.svg");
   expect(profile.points).toHaveLength(6);
   expect(Math.max(...profile.points.map(p=>p.x))).toBeCloseTo(.5);
   expect(solid(loft()).volume).toBeCloseTo(800*30,0);
 });
 it("accepts SVG curves and keeps their sampled outline on both ends",()=>{
   const profile=loftProfileFromSvg(svg('<path d="M0 0 C0 -20 40 -20 40 0 L40 20 L0 20 Z"/>'),"curve.svg");
   expect(profile.points.length).toBeGreaterThan(10);
   expect(solid(loft({loftBottomSvg:profile,loftTopSvg:profile})).volume).toBeGreaterThan(0);
 });
 it("rejects holes, multiple islands, open strokes, invalid markup and intersecting outlines",()=>{
   for(const drawing of ['<path fill-rule="evenodd" d="M0 0H40V40H0Z M10 10V30H30V10Z"/>','<rect width="10" height="10"/><rect x="20" width="10" height="10"/>','<path fill="none" stroke="black" d="M0 0 L20 20"/>','<path d="M0 0L30 30L0 30L30 0Z"/>']) expect(()=>loftProfileFromSvg(svg(drawing),"bad.svg")).toThrow();
   expect(normalizeLoftSvgProfile({points:[{x:NaN,z:0},{x:1,z:0},{x:0,z:1}]})).toBeUndefined();
 });
 it("lofts SVGs to primitives and preserves profiles through resizing and replacement",()=>{
   const shape=loft({loftTopOutline:"round",loftTopWidth:20,loftTopDepth:20});
   expect(solid(shape).volume).toBeGreaterThan(0);
   const before=loftProfileLoops(shape);expect(before.loops[0].segments.length).toBe(before.topLoops[0].segments.length);
   const changed=loftMeasuresPatch(shape,{bottomWidth:60});
   expect(changed.patch.loftBottomSvg).toEqual(shape.loftBottomSvg);
   expect(loftMeasures({...shape,...changed.patch}).bottomWidth).toBeCloseTo(60);
 });
 it("keeps a hollow SVG loft watertight and clamps collapsing wall widths",()=>{
   expect(solid(loft({loftWall:1})).volume).toBeGreaterThan(0);
   expect(solid(loft({loftWall:100})).volume).toBeGreaterThan(0);
 });
 it("handles middle sections, smooth sides and twist without changing vertex correspondence",()=>{
   expect(solid(loft({loftTwist:20,loftSmooth:.5})).volume).toBeGreaterThan(0);
   expect(solid(loft({loftSections:[{at:.5,outline:"round",width:30,depth:30}]})).volume).toBeGreaterThan(0);
 });
 it("keeps useful wall thickness when a tiny SVG edge disappears in the inset",()=>{
   const profile=loftProfileFromSvg(svg('<path d="M0 0 H39.999 L40 .001 V30 H0 Z"/>'),"tiny-corner.svg");
   const shape=loft({loftBottomSvg:profile,loftTopSvg:profile,loftWall:2});
   expect(loftMeasures(shape).wall).toBeCloseTo(2);
   const points=insetLoftSvg(profile.points.map(p=>({x:p.x*40,z:p.z*30})),2);
   expect(Math.min(...points.map(p=>p.x))).toBeCloseTo(-18);
   expect(Math.max(...points.map(p=>p.x))).toBeCloseTo(18);
   expect(solid(shape).volume).toBeGreaterThan(0);
 });
 it("adds every supported number of SVG middle sections to a hollow loft without throwing",()=>{
   const shape=loft({loftWall:1});
   for(const count of [1,2,5,12]) {
     const middles=loftMiddlesWithCount(loftMeasures(shape),count);
     const patch=loftMeasuresPatch(shape,{middles}).patch;
     expect(patch.loftSections).toHaveLength(count);
     expect(loftMeasures({...shape,...patch}).wall).toBeCloseTo(1);
     expect(solid({...shape,...patch}).volume).toBeGreaterThan(0);
   }
 });
 it("round-trips the profile through project export/import without an external file dependency",async()=>{
   const shape=loft();
   const bytes=await exportLylProject({projectId:"demo",projectName:"demo",createdAt:1,modifiedAt:1,shapes:[shape],history:[editorHistoryEntry([shape],[])],historyIndex:0,assets:[],workspace:DEFAULT_WORKPLANE_WORKSPACE,snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
   const restored=await importLylProject(bytes);
   expect(restored.shapes[0].loftBottomSvg).toEqual(shape.loftBottomSvg);
   expect(loftFieldsFromMeasures(loftStoredMeasures(restored.shapes[0])).loftBottomOutline).toBe("svg");
 });
});
