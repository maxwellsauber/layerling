// @vitest-environment jsdom
/** Run explicitly: npx vitest run --config tests/vitest.tools.config.ts buildFeatureDemos */
import {it,expect} from 'vitest';
import {writeFileSync,mkdirSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import manifoldModule from 'manifold-3d';
import {OcctKernel,type ShapeHandle} from 'occt-wasm';
import {loadTextFonts} from '@/lib/textFonts';
import {rememberManifoldRuntime} from '@/lib/manifoldHandle';
import {newSketchText,regenerateSketchTexts,sketchTextBaseline,sketchTextPathSpan} from '@/lib/sketchText';
import {sketchPrimitiveGeometry} from '@/lib/sketchPrimitives';
import {cadSketchRegions} from '@/lib/sketchCadProfile';
import {pathWire} from '@/lib/sketchCadWire';
import {sketchRaisedTextPlan} from '@/lib/sketchRaisedText';
import {buildRaisedSketchTextSolid} from '@/lib/cadSketchRaisedText';
import {shapeFromCadMesh} from '@/lib/editorSketchCad';
import {loftProfileFromSvg} from '@/lib/loftSvgImport';
import {loftShapePatch} from '@/lib/loftGeometry';
import {makeShapeFromAsset,toolbarShapeAssets} from '@/lib/shapeCatalog';
import {cadModifierProfileForShape} from '@/lib/cadProfileExtrusion';
import {profileExtrusionSolid} from '@/lib/cadProfileSolid';
import {editorHistoryEntry} from '@/lib/editorHistory';
import {exportLylProject,importLylProject} from '@/lib/lylProject';
import {DEFAULT_WORKPLANE_WORKSPACE,DEFAULT_SNAP_GRID} from '@/lib/workplaneSettings';
import type {SketchProfile,SketchText,WorkplaneShape} from '@/types/layerling';
import type {DemoExample} from '@/lib/demoExamples';
const root='apps/web/public/demo-examples/features';
let serial=0;const id=(prefix='p')=>`demo-${prefix}-${++serial}`;
const text=(content:string,size=10):SketchText=>({...newSketchText(id('text')),content,size});
const rectangle=(left:number,top:number,width:number,depth:number)=>{
 const points=[{x:left,z:top},{x:left+width,z:top},{x:left+width,z:top+depth},{x:left,z:top+depth}].map(p=>({...p,id:id()}));
 return {points,segments:points.map((p,i)=>({id:id('edge'),startId:p.id,endId:points[(i+1)%4].id,kind:'line' as const}))};
};
it('builds the five editable feature examples with real exact solids',async()=>{
 mkdirSync(root,{recursive:true});await loadTextFonts();
 const runtime=await manifoldModule();runtime.setup();rememberManifoldRuntime(runtime);
 const cad=await OcctKernel.init({wasm:join(dirname(fileURLToPath(import.meta.resolve('occt-wasm'))),'occt-wasm.wasm')});
 const examples:DemoExample[]=[];
 function extrude(p:SketchProfile,height:number):ShapeHandle {
  const solids=cadSketchRegions(p).map(r=>{
   let face=cad.makeFace(pathWire(cad,r.outer));if(r.holes.length)face=cad.addHolesInFace(face,r.holes.map(h=>pathWire(cad,h)));
   return cad.extrude(face,0,height,0);
  });
  expect(solids.length).toBeGreaterThan(0);return solids.length===1?solids[0]:cad.makeCompound(solids);
 }
 function sketchShape(profile:SketchProfile,height:number,name:string,color:string){
  const live=regenerateSketchTexts(profile), plan=sketchRaisedTextPlan(live);
  const solid=plan.stacks.length?buildRaisedSketchTextSolid(cad,plan.profile,height,plan.stacks):extrude(live,height);
  expect(cad.isValid(solid)).toBe(true);
  const mesh=cad.tessellate(solid,{linearDeflection:.03,angularDeflection:.15});
  const source:WorkplaneShape={id:id('body'),name,kind:'mesh',x:0,z:0,elevation:0,size:1,width:1,depth:1,height,rotation:0,color,sketchProfile:live,sketchOperation:'extrude'};
  const shape=shapeFromCadMesh(source,mesh.positions,mesh.normals,mesh.indices,cad.toBREP(solid));
  expect(shape).not.toBeNull();return shape!;
 }
 async function save(entry:Omit<DemoExample,'project'|'thumbnail'>,shapes:WorkplaneShape[],topView=false){
  const cx=shapes[0].x,cz=shapes[0].z;
  const bytes=await exportLylProject({projectName:entry.title,projectId:`feature-${entry.id}`,createdAt:1795190400000,modifiedAt:1795190400000,shapes,history:[editorHistoryEntry(shapes,[])],historyIndex:0,assets:[],workspace:{...DEFAULT_WORKPLANE_WORKSPACE},snapGrid:DEFAULT_SNAP_GRID,placementElevation:0,
   view:{orthographic:true,position:topView?[cx,220,cz+.01]:[cx+110,150,cz+150],target:[cx,0,cz],up:[0,1,0],zoom:1.5}});
  const restored=await importLylProject(bytes);expect(restored.shapes).toHaveLength(shapes.length);
  writeFileSync(`${root}/${entry.id}.lyl`,bytes);
  examples.push({...entry,project:`features/${entry.id}.lyl`,thumbnail:`features/${entry.id}.jpg`});
 }
 try {
  const curve:SketchProfile={points:[{id:'curve-a',x:0,z:0,handleOut:{x:25,z:-25}},{id:'curve-b',x:75,z:0,handleIn:{x:50,z:-25},handleOut:{x:100,z:25}},{id:'curve-c',x:150,z:0,handleIn:{x:125,z:25}}],segments:[{id:'curve-ab',startId:'curve-a',endId:'curve-b',kind:'bezier',construction:true},{id:'curve-bc',startId:'curve-b',endId:'curve-c',kind:'bezier',construction:true}],texts:[{...text('MAX GALLOWS',12),pathSegmentIds:['curve-ab','curve-bc'],pathPosition:8}]};
  await save({id:'bend-the-words',title:'Bend the words',description:'Live sketch text follows an editable curve. Change the wording or reshape the baseline; the letters follow.',features:['Native sketch text','Text on path','Construction baseline'],tryThis:'Double-click the lettering, select the text, then edit its words or drag a curve handle.'},[sketchShape(curve,2,'Editable text on an S-curve','#28a8bd')],true);
  const circle=sketchPrimitiveGeometry('circle',{x:0,z:0},id,90);
  const badge:SketchProfile={...circle,segments:circle.segments.map(s=>({...s,construction:true})),texts:[{...text('MADE BY MAX',9),pathSegmentIds:circle.segments.map(s=>s.id),reverse:true}]};
  const baseline=sketchTextBaseline(badge,badge.texts![0].pathSegmentIds!)!;
  badge.texts![0].pathPosition=25-sketchTextPathSpan(badge.texts![0],baseline.length,true)/baseline.length*50;
  await save({id:'circular-badge',title:'Make a circular badge',description:'Readable lettering along the bottom of a circle. Its construction guide shapes the words without becoming a solid disk.',features:['Closed paths','Reading direction','Guide-only baseline'],tryThis:'Double-click the lettering and drag the circle’s points, or move the text with its position slider.'},[sketchShape(badge,2,'Circular lettering with a construction guide','#f19a2b')],true);
  let stencil:SketchProfile=regenerateSketchTexts({points:[],segments:[],texts:[{...text('OPEN',16),bridges:{width:1,count:2}}]});
  expect(stencil.texts![0].bridgeUnheld).toBe(0);
  const xs=stencil.points.map(p=>p.x),zs=stencil.points.map(p=>p.z);
  const border=rectangle(Math.min(...xs)-5,Math.min(...zs)-5,Math.max(...xs)-Math.min(...xs)+10,Math.max(...zs)-Math.min(...zs)+10);
  stencil={...stencil,points:[...border.points,...stencil.points],segments:[...border.segments,...stencil.segments]};
  expect(cadSketchRegions(stencil)).toHaveLength(1);
  await save({id:'stencil-open',title:'Keep your stencil together',description:'A real OPEN stencil with bridges connecting the enclosed letter centers to the plate.',features:['Stencil bridges','Editable cutout lettering'],tryThis:'Double-click the stencil, select OPEN, and change the bridge width or the wording.'},[sketchShape(stencil,1.6,'OPEN stencil with retained islands','#6fad49')]);
  const connected:SketchProfile={points:[],segments:[],texts:[{...text('MAX',16),connections:{mode:'backer',width:1.2,padding:1.5,railOffset:1},raised:{backerThickness:1.5,letterHeight:2}}]};
  const nameplate=sketchShape(connected,3.5,'Raised lettering on a thin connected backer','#8458bd');
  expect(nameplate.sketchProfile!.texts![0].connectionParts).toBe(1);
  await save({id:'connected-nameplate',title:'Print the whole word',description:'Raised letters share a thin, connected backer. The lettering stays editable and the result is one fused part.',features:['Connected lettering','Outline backer','Raised letter height'],tryThis:'Double-click MAX to edit it. In 3D properties, change the backer thickness or raised-letter height.'},[nameplate]);
  let loft=makeShapeFromAsset(toolbarShapeAssets.find(s=>s.kind==='loft')!);
  const heart=loftProfileFromSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 -8 L12 -20 L25 -10 L24 4 L0 25 L-24 4 L-25 -10 L-12 -20 Z"/></svg>','heart-profile.svg');
  loft={...loft,...loftShapePatch(loft,{bottomOutline:'rectangle',bottomCorner:0,bottomWidth:45,bottomDepth:45,topOutline:'svg',topSvg:heart,topWidth:45,topDepth:45,middles:[{at:.5,outline:'polygon',width:33,depth:33,corner:0,sides:6,offsetX:0,offsetZ:0}]}),id:'feature-loft',name:'Square → hexagon → SVG heart',height:50,color:'#ea8a26'};
  const part=cadModifierProfileForShape(loft)!;expect(part).not.toBeNull();const solid=profileExtrusionSolid(cad,part);expect(cad.isValid(solid)).toBe(true);
  await save({id:'svg-section-loft',title:'Build between shapes',description:'A square base flows through a hexagon into an SVG heart. Each section has its own shape, size, and height.',features:['SVG profiles','Section layers','Editable loft'],tryThis:'Select the loft and expand Section layers. Change the middle polygon’s sides or drag a section into a new order.'},[loft]);
  writeFileSync('apps/web/public/demo-examples/features-manifest.json',JSON.stringify(examples,null,2)+'\n');
 } finally {cad.releaseAll();}
},120000);
