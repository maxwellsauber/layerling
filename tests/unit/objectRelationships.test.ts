import {expect,it} from 'vitest';
import {resolveObjectRelationships,independentPositionPatch} from '@/lib/objectRelationships';
import {compileVariableDraft,resolveProjectVariables,variableReferences,rewriteParameterNames,parameterUsage} from '@/lib/projectVariables';
import {editorHistoryEntry,hydrateEditorHistoryState} from '@/lib/editorHistory';
import {exportLylProject,importLylProject} from '@/lib/lylProject';
import {DEFAULT_WORKPLANE_WORKSPACE,DEFAULT_SNAP_GRID} from '@/lib/workplaneSettings';
import type {WorkplaneShape} from '@/types/layerling';
const vars=compileVariableDraft([],[{id:'h',name:'height',expression:'100',refs:{}}]);
const sketch=(id:string,elevation=0):WorkplaneShape=>({id,name:id,kind:'mesh',x:0,z:0,size:20,width:20,depth:20,height:10,elevation,rotation:0,color:'#f00',sketchOperation:'extrude',sketchProfile:{points:[{id:'a',x:0,z:0},{id:'b',x:20,z:0}],segments:[{id:'ab',startId:'a',endId:'b'}],constraints:[{id:'distance',kind:'distance',a:'a',b:'b',value:20}]}});
const a=sketch('A'),b={...sketch('B'),elevationRelationship:{parentId:'A',offset:variableReferences('height',vars)}};
it('propagates variable offsets and parent movement in dependency order without changing geometry',()=>{
 const c={...sketch('C'),elevationRelationship:{parentId:'B',offset:variableReferences('5',vars)}};
 const scene=resolveObjectRelationships([c,b,a],resolveProjectVariables(vars));
 expect(scene.map(s=>s.elevation)).toEqual([105,100,0]);
 expect(scene[1].sketchProfile).toBe(b.sketchProfile);
 const updated=resolveObjectRelationships([c,b,{...a,elevation:20}],new Map([['h',40]]));
 expect(updated.map(s=>s.elevation)).toEqual([65,60,20]);
 expect(b.elevation).toBe(0);
});
it('rejects cycles, missing/deleted parents and invalid offsets atomically',()=>{
 const before=JSON.stringify([a,b]);
 expect(()=>resolveObjectRelationships([{...a,elevationRelationship:{parentId:'B',offset:variableReferences('0',vars)}},b],resolveProjectVariables(vars))).toThrow(/Circular/);
 expect(()=>resolveObjectRelationships([b],resolveProjectVariables(vars))).toThrow(/missing/);
 expect(()=>resolveObjectRelationships([a,b],new Map())).toThrow();
 expect(()=>resolveObjectRelationships([a,b],new Map([['h',Infinity]]))).toThrow();
 expect(JSON.stringify([a,b])).toBe(before);
});
it('protects driven moves, locks and competing Z drivers, while detach retains the last position',()=>{
 const scene=resolveObjectRelationships([a,b],resolveProjectVariables(vars));
 expect(()=>resolveObjectRelationships([a,{...scene[1],elevation:120}],resolveProjectVariables(vars),scene)).toThrow(/Detach/);
 expect(()=>resolveObjectRelationships([a,{...b,locked:true}],resolveProjectVariables(vars))).toThrow(/locked/);
 expect(()=>resolveObjectRelationships([a,{...b,parameterBindings:{positionZ:variableReferences('height',vars)}}],resolveProjectVariables(vars))).toThrow(/driver/);
 const detached={...scene[1],elevationRelationship:undefined};
 expect(resolveObjectRelationships([a,detached],resolveProjectVariables(vars))[1].elevation).toBe(100);
});
it('renames variable references and counts relationship usage',()=>{
 const renamed=compileVariableDraft(vars,[{...vars[0],name:'clearance'}]);
 const shapes=rewriteParameterNames([a,b],renamed);
 expect(shapes[1].elevationRelationship?.offset.expression).toBe('clearance');
 expect(parameterUsage(renamed,shapes,'h')).toBe(1);
 expect(resolveObjectRelationships(shapes,resolveProjectVariables(renamed))[1].elevation).toBe(100);
});
it('persists relationships, expressions and undo/redo snapshots through LYL export/import',async()=>{
 const before=resolveObjectRelationships([a,b],resolveProjectVariables(vars));
 const changed=compileVariableDraft(vars,[{...vars[0],expression:'140'}]);
 const after=resolveObjectRelationships(before,resolveProjectVariables(changed));
 const history=[editorHistoryEntry(before,[],[],undefined,undefined,vars),editorHistoryEntry(after,[],[],undefined,undefined,changed)];
 const bytes=await exportLylProject({projectId:'relationships',projectName:'Relationships',createdAt:1,modifiedAt:2,shapes:after,history,historyIndex:1,assets:[],workspace:DEFAULT_WORKPLANE_WORKSPACE,snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
 const restored=await importLylProject(bytes);
 expect(restored.shapes[1].elevationRelationship).toEqual(b.elevationRelationship);
 expect(restored.shapes[1].elevation).toBe(140);
 const undo=hydrateEditorHistoryState(restored.history[0].shapes,restored.history,0);
 expect(undo.entries[undo.index].shapes[1].elevation).toBe(100);
 const redo=hydrateEditorHistoryState(restored.shapes,restored.history,1);
 expect(redo.entries[redo.index].shapes[1].elevation).toBe(140);
 expect(restored.shapes[1].sketchProfile?.constraints).toEqual(b.sketchProfile!.constraints);
});
it('records a zero-offset relationship as a metadata-only undo step',()=>{
 const independent=sketch('B');
 const linked={...independent,elevationRelationship:{parentId:'A',offset:variableReferences('0',vars)}};
 expect(editorHistoryEntry([a,independent],[]).fingerprint).not.toBe(editorHistoryEntry([a,linked],[]).fingerprint);
});
it('allows simultaneous parent/follower moves but rejects grouping linked dependents',()=>{
 const scene=resolveObjectRelationships([a,b],resolveProjectVariables(vars));
 const together=scene.map(s=>({...s,elevation:(s.elevation??0)+10}));
 expect(resolveObjectRelationships(together,resolveProjectVariables(vars),scene)[1].elevation).toBe(110);
 expect(()=>resolveObjectRelationships([{...a,groupedShapes:[b]}],resolveProjectVariables(vars))).toThrow(/Detach/);
});
it('follows independent X/Y centers with variable offsets in displayed CAD coordinates',()=>{
 const parent={...a,x:20,z:-30};
 const child={...b,positionRelationships:{x:{parentId:'A',offset:variableReferences('height / 2',vars)},y:{parentId:'A',offset:variableReferences('-5',vars)}}};
 const scene=resolveObjectRelationships([child,parent],resolveProjectVariables(vars));
 expect(scene[0]).toMatchObject({x:70,z:-25,elevation:100});
 const changed=resolveObjectRelationships([scene[0],{...parent,x:50,z:-40}],new Map([['h',60]]),scene);
 expect(changed[0]).toMatchObject({x:80,z:-35,elevation:60});
 expect(changed[0].sketchProfile).toBe(child.sketchProfile);
});
it('detects cycles on each axis without rejecting unrelated cross-axis dependencies',()=>{
 const first={...a,positionRelationships:{x:{parentId:'B',offset:variableReferences('0',vars)}}};
 const second={...sketch('B'),positionRelationships:{y:{parentId:'A',offset:variableReferences('5',vars)}}};
 expect(()=>resolveObjectRelationships([first,second],resolveProjectVariables(vars))).not.toThrow();
 const cycle={...second,positionRelationships:{x:{parentId:'A',offset:variableReferences('0',vars)}}};
 expect(()=>resolveObjectRelationships([first,cycle],resolveProjectVariables(vars))).toThrow(/Circular.*X/);
});
it('protects driven horizontal moves and detects competing variable bindings',()=>{
 const child={...sketch('B'),positionRelationships:{x:{parentId:'A',offset:variableReferences('10',vars)}}};
 const scene=resolveObjectRelationships([a,child],resolveProjectVariables(vars));
 expect(()=>resolveObjectRelationships([a,{...scene[1],x:20}],resolveProjectVariables(vars),scene)).toThrow(/X is driven/);
 expect(()=>resolveObjectRelationships([a,{...child,parameterBindings:{positionX:variableReferences('height',vars)}}],resolveProjectVariables(vars))).toThrow(/driver/);
});
it('renames and counts horizontal offsets and preserves them through project files and history',async()=>{
 const child={...b,positionRelationships:{x:{parentId:'A',offset:variableReferences('height / 2',vars)},y:{parentId:'A',offset:variableReferences('5',vars)}}};
 const renamed=compileVariableDraft(vars,[{...vars[0],name:'gap'}]);
 const scene=resolveObjectRelationships(rewriteParameterNames([a,child],renamed),resolveProjectVariables(renamed));
 expect(scene[1].positionRelationships!.x!.offset.expression).toBe('gap / 2');
 expect(parameterUsage(renamed,scene,'h')).toBe(2);
 const history=[editorHistoryEntry(scene,[],[],undefined,undefined,renamed)];
 const bytes=await exportLylProject({projectId:'xy',projectName:'XY relationships',createdAt:1,modifiedAt:2,shapes:scene,history,historyIndex:0,assets:[],workspace:DEFAULT_WORKPLANE_WORKSPACE,snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
 const restored=await importLylProject(bytes);
 expect(restored.shapes[1].positionRelationships).toEqual(scene[1].positionRelationships);
 expect(restored.shapes[1]).toMatchObject({x:50,z:-5,elevation:100});
 expect(restored.history[0].shapes[1].positionRelationships).toEqual(scene[1].positionRelationships);
});

it('keeps driven axes fixed during direct drag previews and leaves free axes movable',()=>{
 const linked={...b,positionRelationships:{x:{parentId:'A',offset:variableReferences('0',vars)}}};
 const patch=independentPositionPatch(linked,{x:30,z:40,elevation:50});
 expect(patch).toEqual({z:40});
 expect({...linked,...patch}).toMatchObject({x:0,z:40,elevation:0});
 expect(independentPositionPatch(a,{x:30,z:40,elevation:50})).toEqual({x:30,z:40,elevation:50});
 const scene=resolveObjectRelationships([a,linked],resolveProjectVariables(vars));
 const moved=resolveObjectRelationships([{...a,x:10,elevation:20},{...scene[1],...patch}],resolveProjectVariables(vars));
 expect(moved[1]).toMatchObject({x:10,z:40,elevation:120});
});
