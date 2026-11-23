import {beforeAll,expect,it} from 'vitest';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {importedShapeFromStl} from '@/lib/stlImport';
import {validateClosedSolidTriangleSoup} from '@/lib/svgImport';
import {OcctKernel} from 'occt-wasm';
import {shapeFromCadMesh} from '@/lib/editorSketchCad';
import {compileVariableDraft,resolveProjectVariables,variableReferences,evaluateVariableExpression} from '@/lib/projectVariables';
import {resolveSketchVariableBindings} from '@/lib/sketchVariableBindings';
import {resolveObjectRelationships} from '@/lib/objectRelationships';
import {rebuildVariableSketchBody} from '@/lib/rebuildVariableSketchBody';
import {cadSketchRegions} from '@/lib/sketchCadProfile';
import {edgeTreatmentAppliedFrame} from '@/lib/edgeTreatmentHistory';
import {exportLylProject,importLylProject} from '@/lib/lylProject';
import {editorHistoryEntry,hydrateEditorHistoryState} from '@/lib/editorHistory';
import {DEFAULT_WORKPLANE_WORKSPACE,DEFAULT_SNAP_GRID} from '@/lib/workplaneSettings';
import type {WorkplaneShape,SketchProfile,EdgeTreatmentHistoryEntry} from '@/types/layerling';
let cad:OcctKernel;
beforeAll(async()=>{cad=await OcctKernel.init({wasm:join(dirname(fileURLToPath(import.meta.resolve('occt-wasm'))),'occt-wasm.wasm')});});
const definitions=(width=120)=>compileVariableDraft([],[['width',width],['depth',65],['clearance',45],['wall',5]].map(([name,value])=>({id:`shelf-${name}`,name:String(name),expression:String(value),refs:{}})));
function rectangle(width:number,depth:number,widthExpression:string,depthExpression:string):SketchProfile{
 const variables=definitions();
 return {points:[{id:'a',x:-width/2,z:-depth/2},{id:'b',x:width/2,z:-depth/2},{id:'c',x:width/2,z:depth/2},{id:'d',x:-width/2,z:depth/2}],segments:[['a','b'],['b','c'],['c','d'],['d','a']].map(([startId,endId],i)=>({id:`edge${i}`,startId,endId})),constraints:[
  ...[['horizontal','a','b'],['vertical','b','c'],['horizontal','c','d'],['vertical','d','a']].map(([kind,a,b],i)=>({id:`square${i}`,kind:kind as 'horizontal'|'vertical',a,b})),
  {id:'width',kind:'distance',name:'Width',a:'a',b:'b',value:width,dimensionBinding:variableReferences(widthExpression,variables)},
  {id:'depth',kind:'distance',name:'Depth',a:'b',b:'c',value:depth,dimensionBinding:variableReferences(depthExpression,variables)},
 ]};
}
function build(source:WorkplaneShape,profile:SketchProfile):WorkplaneShape{
 const region=cadSketchRegions(profile)[0];
 const edges=region.outer.steps.map(({from,to})=>cad.makeLineEdge({x:from.x+source.x,y:source.elevation??0,z:from.z+source.z},{x:to.x+source.x,y:source.elevation??0,z:to.z+source.z}));
 const wire=cad.makeWire(edges),face=cad.makeFace(wire),body=cad.extrude(face,0,source.height,0);
 expect(cad.isValid(body)).toBe(true);
 const mesh=cad.tessellate(body,{linearDeflection:.05,angularDeflection:.16});
 const result=shapeFromCadMesh({...source,sketchProfile:profile},mesh.positions,mesh.normals,mesh.indices,cad.toBREP(body))!;
 for(const handle of [body,face,wire,...edges])cad.release(handle);
 return result;
}
function fillet(source:WorkplaneShape):WorkplaneShape{
 const body=cad.fromBREP(source.cadBrep!),edges=cad.getSubShapes(body,'edge'),rounded=cad.fillet(body,edges,.8);
 expect(cad.isValid(rounded)).toBe(true);
 const mesh=cad.tessellate(rounded,{linearDeflection:.05,angularDeflection:.16});
 const result=shapeFromCadMesh(source,mesh.positions,mesh.normals,mesh.indices,cad.toBREP(rounded))!;
 const feature={kind:'fillet' as const,amount:.8,edgeCount:edges.length,edgeIds:edges.map((_,i)=>i)};
 const entry:EdgeTreatmentHistoryEntry={id:'shelf-top-fillet',createdAt:1,feature,before:source,appliedFrame:edgeTreatmentAppliedFrame(result)};
 for(const handle of [rounded,...edges,body])cad.release(handle);
 return {...result,edgeTreatments:[feature],edgeTreatmentHistory:[entry]};
}
it('exercises a four-part shelf: three sizes, fillet replay, parent movement, rejection, history and LYL round-trip',async()=>{
 let variables=definitions();const binding=(text:string)=>variableReferences(text,variables);
 const blank=(id:string,name:string,width:number,height:number,profile:SketchProfile):WorkplaneShape=>({id,name,kind:'mesh',x:0,z:0,elevation:0,width,depth:65,size:Math.max(width,65),height,rotation:0,color:'#ef8b35',sketchOperation:'extrude',sketchProfile:profile});
 const base={...blank('shelf-base','Lower shelf · parent',120,5,rectangle(120,65,'width','depth')),parameterBindings:{height:binding('wall')}};
 const top={...blank('shelf-top','Upper shelf · filleted',120,5,rectangle(120,65,'width','depth')),parameterBindings:{height:binding('wall')},elevationRelationship:{parentId:base.id,offset:binding('clearance + wall')}};
 const sides=[-1,1].map((sign,i)=>({...blank(`shelf-side-${i}`,`${sign<0?'Left':'Right'} support`,5,45,rectangle(5,65,'wall','depth')),color:'#6b3faf',parameterBindings:{height:binding('clearance')},elevationRelationship:{parentId:base.id,offset:binding('wall')},positionRelationships:{x:{parentId:base.id,offset:binding(`${sign} * (width - wall) / 2`)},y:{parentId:base.id,offset:binding('0')}}}));
 let scene=resolveObjectRelationships([base,top,...sides],resolveProjectVariables(variables)).map(s=>build(s,s.sketchProfile!));scene[1]=fillet(scene[1]);
 const initial=scene;
 const update=async(nextVariables:typeof variables)=>{
  const values=resolveProjectVariables(nextVariables),next:WorkplaneShape[]=[];
  for(const source of scene){const profile=resolveSketchVariableBindings(source.sketchProfile!,values),height=evaluateVariableExpression(source.parameterBindings!.height,values);if(height<.01)throw Error('Invalid height');
   next.push(await rebuildVariableSketchBody(source,profile,async(s,p)=>build({...s,height},p),async(s)=>fillet(s)));
  }
  return resolveObjectRelationships(next,values);
 };
 const history=[editorHistoryEntry(scene,[],[],undefined,undefined,variables)];
 for(const width of [160,200,120]){
  const nextVariables=definitions(width);scene=await update(nextVariables);variables=nextVariables;
  expect(scene[1].width).toBeCloseTo(width,2);expect(scene[1].elevation).toBeCloseTo(50,2);
  expect(scene[1].edgeTreatmentHistory).toHaveLength(1);expect(scene[2].x).toBeCloseTo(-(width-5)/2,2);
  history.push(editorHistoryEntry(scene,[],[],undefined,undefined,variables));
 }
 scene=resolveObjectRelationships(scene.map(s=>s.id===base.id?{...s,elevation:10}:s),resolveProjectVariables(variables),scene);
 expect(scene[1].elevation).toBeCloseTo(60,2);expect(scene[2].elevation).toBeCloseTo(15,2);
 const valid=JSON.stringify(scene);
 await expect(update(compileVariableDraft(variables,variables.map(v=>v.name==='width'?{...v,expression:'-10'}:v)))).rejects.toThrow();expect(JSON.stringify(scene)).toBe(valid);
 const bytes=await exportLylProject({projectId:'parametric-shelf-demo',projectName:'Parametric desktop shelf',createdAt:1,modifiedAt:2,shapes:initial,history:[history[0]],historyIndex:0,assets:[],workspace:DEFAULT_WORKPLANE_WORKSPACE,snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
 const restored=await importLylProject(bytes);expect(restored.shapes).toHaveLength(4);expect(restored.history[0].variables).toHaveLength(4);expect(restored.shapes[1].edgeTreatmentHistory).toHaveLength(1);
 const undo=hydrateEditorHistoryState(history[1].shapes,history,1);expect(undo.entries[undo.index].variables![0].expression).toBe('160');
 const redo=hydrateEditorHistoryState(history[2].shapes,history,2);expect(redo.entries[redo.index].variables![0].expression).toBe('200');
 if(process.env.SHELF_OUTPUT){mkdirSync(dirname(process.env.SHELF_OUTPUT),{recursive:true});writeFileSync(process.env.SHELF_OUTPUT,bytes);}
});

it('reopens the actual browser-exported shelf with its fillet, variables and links, and a closed STL',async()=>{
 const folder='examples/parametric-shelf';
 const project=await importLylProject(new Uint8Array(readFileSync(`${folder}/Shelf-verified.lyl`)));
 const variables=project.history[project.historyIndex].variables!;
 expect(resolveProjectVariables(variables).get('shelf-width')).toBe(160);
 expect(resolveProjectVariables(variables).get('shelf-clearance')).toBe(45);
 expect(project.shapes.find(s=>s.id==='shelf-top')).toMatchObject({width:160,height:5,elevation:50});
 expect(project.shapes.find(s=>s.id==='shelf-top')!.edgeTreatments![0]).toMatchObject({kind:'fillet',amount:.8});
 expect(project.shapes.find(s=>s.id==='shelf-side-0')!.x).toBeCloseTo(-77.5,2);
 for(const shape of project.shapes){const body=cad.fromBREP(shape.cadBrep!);expect(cad.isValid(body)).toBe(true);expect(cad.getVolume(body)).toBeGreaterThan(0);cad.release(body);}
 const bytes=readFileSync(`${folder}/Shelf-verified.stl`);
 const mesh=importedShapeFromStl('Shelf.stl',bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 expect(mesh.importedMesh!.baseWidth).toBeCloseTo(160,2);expect(mesh.importedMesh!.baseHeight).toBeCloseTo(55,2);
 expect(()=>validateClosedSolidTriangleSoup(mesh.importedMesh!.positions)).not.toThrow();
 if(process.env.SHELF_OUTPUT){
  for(const [name,width] of [['Small',120],['Medium',160],['Large',200]] as const){
   const entry=project.history.find(e=>e.variables?.find(v=>v.name==='width')?.expression===String(width)&&e.shapes.find(s=>s.id==='shelf-base')?.elevation===0&&e.variables?.find(v=>v.name==='clearance')?.expression==='45')!;
   expect(entry).toBeDefined();
   const file=await exportLylProject({...project,projectName:`Parametric shelf - ${name}`,projectId:null,shapes:entry.shapes,history:[entry],historyIndex:0});
   writeFileSync(`${folder}/Shelf-${name}.lyl`,file);
  }
 }
});
