// @vitest-environment jsdom
import {expect,it} from 'vitest';
import {projectParameterPatch,projectParameterValue} from '@/components/workplane/ShapeInspector';
import {canonicalizeShape,workplaneShapesEqual} from '@/lib/workplaneShapes';
import {meshForShape} from '@/lib/editorMeshCore';
import {DEFAULT_WORKPLANE_WORKSPACE} from '@/lib/workplaneSettings';
import type {WorkplaneShape} from '@/types/layerling';
const box:WorkplaneShape={id:'box',name:'Box',kind:'box',x:0,z:0,size:20,width:20,depth:20,height:20,rotation:0,color:'#ff8800'};
it('drives the actual primitive mesh through existing inspector properties',()=>{
 const shape=canonicalizeShape({...box,...projectParameterPatch(box,'width',150,DEFAULT_WORKPLANE_WORKSPACE)});
 const mesh=meshForShape(shape),xs=mesh.vertices.map(v=>v[0]);
 expect(Math.max(...xs)-Math.min(...xs)).toBeCloseTo(150);
 expect(()=>projectParameterPatch(box,'height',-2,DEFAULT_WORKPLANE_WORKSPACE)).toThrow();
 expect(()=>projectParameterPatch({...box,kind:'mesh'},'width',40,DEFAULT_WORKPLANE_WORKSPACE)).toThrow();
});
it('uses displayed CAD axes and positions rather than raw Three.js coordinates',()=>{
 const moved={...box,...projectParameterPatch(box,'positionY',25,DEFAULT_WORKPLANE_WORKSPACE)};
 expect(moved.z).toBe(-25);
 expect(projectParameterValue(moved,'positionY',DEFAULT_WORKPLANE_WORKSPACE)).toBe(25);
 const raised={...box,...projectParameterPatch(box,'positionZ',12,DEFAULT_WORKPLANE_WORKSPACE)};
 expect(raised.elevation).toBe(12);
});
it('treats binding-only edits as project changes',()=>{
 expect(workplaneShapesEqual(box,{...box,parameterBindings:{width:{expression:'w',refs:{w:'width-id'}}}})).toBe(false);
});
