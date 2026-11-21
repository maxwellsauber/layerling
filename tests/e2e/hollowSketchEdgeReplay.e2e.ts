import {beforeAll,expect,it} from 'vitest';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OcctKernel} from 'occt-wasm';
import * as THREE from 'three';
import {shellSolid} from '@/lib/cadShell';
import {sketchMappedEdges} from '@/lib/sketchEdgeMapping';
import {matchingEdgeIds} from '@/lib/edgeMatching';
import {sketchToWorldMatrix} from '@/lib/sketchPlacement';
import type {WorkplaneShape} from '@/types/layerling';
let cad:OcctKernel;
beforeAll(async()=>{cad=await OcctKernel.init({wasm:join(dirname(fileURLToPath(import.meta.resolve('occt-wasm'))),'occt-wasm.wasm')});});
it('finds and fillets every corresponding edge of a hollow triangle after a large outline change',()=>{
 const source:WorkplaneShape={id:'triangle',name:'Triangle',kind:'mesh',x:0,z:0,width:100,depth:60,size:100,height:10,rotation:0,color:'#f00',sketchOperation:'extrude',sketchProfile:{points:[{id:'a',x:0,z:0},{id:'b',x:100,z:0},{id:'c',x:0,z:60}],segments:[{id:'ab',startId:'a',endId:'b'},{id:'bc',startId:'b',endId:'c'},{id:'ca',startId:'c',endId:'a'}]}};
 const make=(shape:WorkplaneShape)=>{
  const matrix=sketchToWorldMatrix(shape);
  const points=shape.sketchProfile!.points.map(p=>new THREE.Vector3(p.x,0,p.z).applyMatrix4(matrix)).map(p=>({x:p.x,y:p.y,z:p.z}));
  const lines=points.map((p,i)=>cad.makeLineEdge(p,points[(i+1)%points.length]));
  const wire=cad.makeWire(lines),face=cad.makeFace(wire),solid=cad.extrude(face,0,10,0);
  const hollow=shellSolid(cad,solid,2,'top-bottom');
  const handles=cad.getSubShapes(hollow,'edge');
  const edges=handles.map((edge,id)=>({id,points:cad.getSubShapes(edge,'vertex').flatMap(v=>{const p=cad.vertexPosition(v);cad.release(v);return [p.x,p.y,p.z];}),display:true,selectable:true,angle:90,boundary:false,manifold:true}));
  return {hollow,handles,edges,release:()=>{for(const h of [...handles,hollow,solid,face,wire,...lines])cad.release(h);}};
 };
 const changed={...source,width:60,size:60,sketchProfile:{...source.sketchProfile!,points:[{id:'a',x:0,z:0},{id:'b',x:60,z:0},{id:'c',x:40,z:60}]}};
 const old=make(source),fresh=make(changed);
 try{
  const mapped=sketchMappedEdges(old.edges,source,changed)!;
  for(const edge of old.edges){
   const ids=matchingEdgeIds(mapped,[edge.id],fresh.edges,fresh.edges.map(e=>e.id));
   expect(ids,`edge ${edge.id}`).not.toBeNull();
   const rounded=cad.fillet(fresh.hollow,ids!.map(id=>fresh.handles[id]),.25);
   expect(cad.isValid(rounded)).toBe(true);cad.release(rounded);
  }
 }finally{old.release();fresh.release();}
});
