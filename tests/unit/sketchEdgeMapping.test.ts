import { expect, it } from "vitest";
import * as THREE from "three";
import { sketchMappedEdges } from "@/lib/sketchEdgeMapping";
import { sketchToWorldMatrix } from "@/lib/sketchPlacement";
import { matchingEdgeIds } from "@/lib/edgeMatching";
import type { CadModifierEdge } from "@/lib/cadModifierTypes";
import type { WorkplaneShape } from "@/types/layerling";

const body:WorkplaneShape={id:'triangle',name:'Triangle',kind:'mesh',x:12,z:8,elevation:3,width:40,depth:30,size:40,height:10,rotation:20,sketchOperation:'extrude',color:'#f00',sketchProfile:{points:[{id:'a',x:0,z:0},{id:'b',x:40,z:0},{id:'c',x:0,z:30}],segments:[]}};
function edges(shape:WorkplaneShape):CadModifierEdge[]{
 const matrix=sketchToWorldMatrix(shape),points=shape.sketchProfile!.points;
 const world=(i:number,y:number)=>new THREE.Vector3(points[i].x,y,points[i].z).applyMatrix4(matrix).toArray();
 return points.flatMap((_,i)=>[
  {id:i*3,points:[...world(i,0),...world((i+1)%3,0)]},
  {id:i*3+1,points:[...world(i,shape.height),...world((i+1)%3,shape.height)]},
  {id:i*3+2,points:[...world(i,0),...world(i,shape.height)]},
 ].map(edge=>({...edge,display:true,selectable:true,angle:90,boundary:false,manifold:true})));
}
it('finds the same selected edges when a triangle changes shape rather than merely scaling its bounds',()=>{
 const next={...body,width:80,size:80,sketchProfile:{...body.sketchProfile!,points:[{id:'a',x:0,z:0},{id:'b',x:80,z:0},{id:'c',x:40,z:30}]}};
 const old=edges(body),fresh=edges(next).map(edge=>({...edge,id:edge.id+20}));
 expect(matchingEdgeIds(old,[8],fresh,fresh.map(e=>e.id))).toBeNull();
 const mapped=sketchMappedEdges(old,body,next)!;
 expect(mapped).not.toBeNull();
 expect(matchingEdgeIds(mapped,[2,5,8],fresh,fresh.map(e=>e.id))).toEqual([22,25,28]);
 expect(old).toEqual(edges(body));
});
it('refuses missing sketch correspondence instead of inventing an edge',()=>{
 expect(sketchMappedEdges(edges(body),body,{...body,sketchProfile:undefined})).toBeNull();
});
