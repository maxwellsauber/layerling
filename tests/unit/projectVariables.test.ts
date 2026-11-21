import {expect,it} from 'vitest';
import {evaluateArithmetic} from '@/lib/measurementUnits';
import {resolveProjectVariables,variableReferences,evaluateVariableExpression,renameProjectVariable,type ProjectVariable} from '@/lib/projectVariables';
import {editorHistoryEntry,hydrateEditorHistoryState} from '@/lib/editorHistory';
import {exportLylProject,importLylProject} from '@/lib/lylProject';
import {DEFAULT_SNAP_GRID,DEFAULT_WORKPLANE_WORKSPACE} from '@/lib/workplaneSettings';
import type {WorkplaneShape} from '@/types/layerling';
const definitions=[{id:'w',name:'caseWidth',expression:'120',refs:{}},{id:'t',name:'wall',expression:'3',refs:{}},{id:'i',name:'insideWidth',expression:'caseWidth - 2 * wall',refs:{caseWidth:'w',wall:'t'}}] satisfies ProjectVariable[];
it('extends the existing arithmetic parser without changing number-only expressions',()=>{
 expect(evaluateArithmetic('(40+2)/2')).toBe(21);expect(evaluateArithmetic('2x3')).toBe(6);
 const values=resolveProjectVariables(definitions);expect(values.get('i')).toBe(114);
 expect(evaluateVariableExpression(variableReferences('insideWidth/2',definitions),values)).toBe(57);
 expect(resolveProjectVariables(definitions.map(v=>v.id==='t'?{...v,expression:'4'}:v)).get('i')).toBe(112);
});
it('rejects cycles, missing references, duplicate names and nonfinite calculations',()=>{
 for(const variables of [[{id:'a',name:'a',expression:'b+1',refs:{b:'b'}},{id:'b',name:'b',expression:'a+1',refs:{a:'a'}}],definitions.map(v=>v.id==='t'?{...v,expression:'1/0'}:v),[definitions[0],{...definitions[1],name:'caseWidth'}]])expect(()=>resolveProjectVariables(variables)).toThrow();
 expect(()=>variableReferences('missing*2',definitions)).toThrow(/Unknown/);
});
const box:WorkplaneShape={id:'box',name:'Box',kind:'box',x:0,z:0,size:40,width:114,depth:30,height:20,rotation:0,color:'#ff8800',parameterBindings:{width:variableReferences('insideWidth',definitions)}};
it('renames definitions and bindings by stable IDs',()=>{
 const renamed=renameProjectVariable(definitions,[box],'i','inner');
 expect(renamed.shapes[0].parameterBindings?.width).toEqual({expression:'inner',refs:{inner:'i'}});
 expect(resolveProjectVariables(renamed.variables).get('i')).toBe(114);
});
it('retains variables, formulas and metadata-only history through LYL and browser history normalization',async()=>{
 const history=[editorHistoryEntry([box],[],[],undefined,undefined,definitions),editorHistoryEntry([box],[],[],undefined,undefined,[...definitions,{id:'spare',name:'spare',expression:'25',refs:{}}])];
 expect(history[0].fingerprint).not.toBe(history[1].fingerprint);
 expect(hydrateEditorHistoryState([box],history,1).entries).toHaveLength(2);
 const bytes=await exportLylProject({projectId:'vars-test',projectName:'Variables',createdAt:1,modifiedAt:2,shapes:[box],history,historyIndex:1,assets:[],workspace:DEFAULT_WORKPLANE_WORKSPACE,snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
 const restored=await importLylProject(bytes);
 expect(restored.history[restored.historyIndex].variables).toHaveLength(4);
 expect(restored.shapes[0].parameterBindings).toEqual(box.parameterBindings);
});
