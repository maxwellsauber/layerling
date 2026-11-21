import {expect,it} from 'vitest';
import {resolveSketchVariableBindings} from '@/lib/sketchVariableBindings';
import {compileVariableDraft,variableReferences,resolveProjectVariables,rewriteParameterNames,parameterUsage} from '@/lib/projectVariables';
import {cloneSketchProfile} from '@/lib/sketchSmoothHandles';
import type {SketchProfile,WorkplaneShape} from '@/types/layerling';
const variables=compileVariableDraft([],[{id:'w',name:'wall',expression:'12',refs:{}}]);
const profile:SketchProfile={points:[{id:'a',x:0,z:0},{id:'b',x:5,z:0}],segments:[{id:'s',startId:'a',endId:'b'}],constraints:[{id:'distance',name:'My Wall',kind:'distance',a:'a',b:'b',value:5,dimensionBinding:variableReferences('wall * 2',variables)}]};
it('solves linked dimensions while preserving editable formula and source geometry',()=>{
 const result=resolveSketchVariableBindings(profile,resolveProjectVariables(variables));
 expect(Math.hypot(result.points[1].x-result.points[0].x,result.points[1].z-result.points[0].z)).toBeCloseTo(24);
 expect(profile.points[1].x).toBe(5);
 expect(cloneSketchProfile(result).constraints?.[0].dimensionBinding?.expression).toBe('wall * 2');
 expect(resolveSketchVariableBindings(result,resolveProjectVariables(variables))).toBe(result);
});
it('rejects missing names, negative lengths and conflicting constraints atomically',()=>{
 expect(()=>resolveSketchVariableBindings(profile,new Map())).toThrow();
 expect(()=>resolveSketchVariableBindings(profile,new Map([['w',-2]]))).toThrow();
 const conflict={...profile,constraints:[...profile.constraints!,{id:'fixed',kind:'distance' as const,a:'a',b:'b',value:5}]};
 expect(()=>resolveSketchVariableBindings(conflict,resolveProjectVariables(variables))).toThrow();
 expect(conflict.points[1].x).toBe(5);
});
it('renames references by stable ID and counts sketch dimension usage',()=>{
 const shape={id:'shape',sketchProfile:profile} as WorkplaneShape;
 const renamed=compileVariableDraft(variables,[{...variables[0],name:'thickness'}]);
 const next=rewriteParameterNames([shape],renamed)[0];
 expect(next.sketchProfile?.constraints?.[0].dimensionBinding?.expression).toBe('thickness * 2');
 expect(parameterUsage(variables,[shape],'w')).toBe(1);
 expect(()=>variableReferences('WALL',variables)).toThrow(/WALL/);
});
it('preserves dimension references in exported projects and undo snapshots',async()=>{
 const {editorHistoryEntry}=await import('@/lib/editorHistory');
 const {exportLylProject,importLylProject}=await import('@/lib/lylProject');
 const {DEFAULT_WORKPLANE_WORKSPACE,DEFAULT_SNAP_GRID}=await import('@/lib/workplaneSettings');
 const shape:WorkplaneShape={id:'sketch',name:'Sketch',kind:'box',x:0,z:0,size:20,width:20,depth:20,height:10,rotation:0,color:'#ff8800',sketchProfile:profile};
 const history=[editorHistoryEntry([shape],[],[],undefined,undefined,variables)];
 const bytes=await exportLylProject({projectId:'sketch-vars',projectName:'Sketch variables',createdAt:1,modifiedAt:2,shapes:[shape],history,historyIndex:0,assets:[],workspace:DEFAULT_WORKPLANE_WORKSPACE,snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
 const restored=await importLylProject(bytes);
 expect(restored.shapes[0].sketchProfile?.constraints?.[0].dimensionBinding).toEqual(profile.constraints![0].dimensionBinding);
 expect(restored.history[0].variables).toEqual(variables);
 expect(restored.shapes[0].sketchProfile?.constraints?.[0].name).toBe('My Wall');
 expect(cloneSketchProfile(profile).constraints?.[0].name).toBe('My Wall');
});
it('accepts named toolbar dimensions, preserving literal units and reporting unknown names',async()=>{
 const {parseSketchDimension}=await import('@/lib/sketchVariableBindings');
 const {parseLengthMm,setLengthUnit}=await import('@/lib/measurementUnits');
 expect(parseSketchDimension('wall * 2',variables,parseLengthMm)).toMatchObject({value:24,binding:{expression:'wall * 2',refs:{wall:'w'}}});
 expect(parseSketchDimension('1/2',variables,parseLengthMm).value).toBe(.5);
 expect(parseSketchDimension('10',variables,parseLengthMm).value).toBe(10);
 try{
  setLengthUnit({units:'Imperial',scale:'1:1 (inches)'} as Parameters<typeof setLengthUnit>[0]);
  expect(parseSketchDimension('1',variables,parseLengthMm).value).toBe(25.4);
  expect(parseSketchDimension('wall',variables,parseLengthMm).value).toBe(12);
 }finally{setLengthUnit({units:'Metric (Default)',scale:'1:1 (millimeters)'});} 
 expect(parseSketchDimension('missing',variables,parseLengthMm).error).toContain('missing');
});
it('assigns or releases a formula even when replacing a dimension with the same numeric value',async()=>{
 const {withSketchConstraint}=await import('@/lib/sketchConstraints');
 const original={...profile,constraints:[{id:'d',kind:'distance' as const,a:'a',b:'b',value:12}]};
 const binding=variableReferences('wall',variables);
 const bound=withSketchConstraint(original,{...original.constraints[0],id:'new',dimensionBinding:binding});
 expect(bound.constraints).toHaveLength(1);expect(bound.constraints![0].id).toBe('d');
 expect(bound.constraints![0].dimensionBinding).toEqual(binding);
 const literal=withSketchConstraint(bound,{...original.constraints[0],id:'replacement'});
 expect(literal.constraints![0].dimensionBinding).toBeUndefined();
});
