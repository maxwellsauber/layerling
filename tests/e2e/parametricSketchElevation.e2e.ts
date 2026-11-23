import {beforeAll,expect,it} from 'vitest';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {OcctKernel} from 'occt-wasm';
import {cadSketchRegions} from '@/lib/sketchCadProfile';
import {projectParameterPatch} from '@/components/workplane/ShapeInspector';
import {compileVariableDraft,resolveProjectVariables,variableReferences,evaluateVariableExpression} from '@/lib/projectVariables';
import {resolveObjectRelationships} from '@/lib/objectRelationships';
import {DEFAULT_WORKPLANE_WORKSPACE as workspace} from '@/lib/workplaneSettings';
import type {WorkplaneShape} from '@/types/layerling';
let cad:OcctKernel;
beforeAll(async()=>{cad=await OcctKernel.init({wasm:join(dirname(fileURLToPath(import.meta.resolve('occt-wasm'))),'occt-wasm.wasm')});});
it('uses one variable for constrained extrusion height and a following sketch plane, with valid solids after updates',()=>{
 const variables=compileVariableDraft([],[{id:'h',name:'height',expression:'100',refs:{}}]);
 const profile={points:[{id:'a',x:0,z:0},{id:'b',x:20,z:0},{id:'c',x:20,z:10},{id:'d',x:0,z:10}],segments:[{id:'ab',startId:'a',endId:'b'},{id:'bc',startId:'b',endId:'c'},{id:'cd',startId:'c',endId:'d'},{id:'da',startId:'d',endId:'a'}],constraints:[{id:'width',kind:'distance' as const,a:'a',b:'b',value:20}]};
 const a:WorkplaneShape={id:'A',name:'A',kind:'mesh',x:0,z:0,elevation:0,width:20,depth:10,size:20,height:10,rotation:0,color:'#f00',sketchOperation:'extrude',sketchProfile:profile,parameterBindings:{height:variableReferences('height',variables)}};
 const b:WorkplaneShape={...a,id:'B',name:'B',parameterBindings:undefined,elevationRelationship:{parentId:'A',offset:variableReferences('height',variables)}};
 let scene=[a,b];
 for(const [height,parentZ] of [[100,0],[150,25]]){
  const defs=compileVariableDraft(variables,[{...variables[0],expression:String(height)}]);
  const values=resolveProjectVariables(defs);
  const source={...scene[0],elevation:parentZ};
  const sized={...source,...projectParameterPatch(source,'height',evaluateVariableExpression(source.parameterBindings!.height,values),workspace)};
  scene=resolveObjectRelationships([sized,scene[1]],values);
  expect(scene[1].elevation).toBe(parentZ+height);
  expect(scene[0].height).toBe(height);
  expect(scene[0].sketchProfile).toBe(profile);
  for(const shape of scene){
   const regions=cadSketchRegions(shape.sketchProfile!);
   const y=shape.elevation??0;
   const edges=regions[0].outer.steps.map(({from,to})=>cad.makeLineEdge({x:from.x,y,z:from.z},{x:to.x,y,z:to.z}));
   const wire=cad.makeWire(edges),face=cad.makeFace(wire),solid=cad.extrude(face,0,shape.height,0);
   expect(cad.isValid(solid)).toBe(true);
   expect(cad.getVolume(solid)).toBeCloseTo(200*shape.height,3);
   const bounds=cad.getBoundingBox(solid,false);expect(bounds.ymin).toBeCloseTo(y,4);expect(bounds.ymax).toBeCloseTo(y+shape.height,4);
   for(const handle of [solid,face,wire,...edges])cad.release(handle);
  }
 }
});
