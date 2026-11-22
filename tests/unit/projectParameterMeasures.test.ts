import {expect,it} from 'vitest';
import {projectParameterPatch,projectParameterValue} from '@/components/workplane/ShapeInspector';
import {canonicalizeShape} from '@/lib/workplaneShapes';
import {DEFAULT_WORKPLANE_WORKSPACE as workspace} from '@/lib/workplaneSettings';
import type {WorkplaneShape} from '@/types/layerling';
const box:WorkplaneShape={id:'box',name:'Box',kind:'box',x:0,z:0,size:40,width:40,depth:30,height:20,rotation:0,color:'#f00'};
it('validates the overall tapered width that the property actually updates',()=>{
 const tapered={...box,taperTopWidth:80,taperTopDepth:30};
 expect(projectParameterValue(tapered,'width',workspace)).toBe(80);
 const next=canonicalizeShape({...tapered,...projectParameterPatch(tapered,'width',120,workspace)});
 expect(next.width).toBe(60);
 expect(projectParameterValue(next,'width',workspace)).toBe(120);
});
it('reads the same axis written by the oriented inspector',()=>{
 const rotated={...box,rotation:90};
 const next=canonicalizeShape({...rotated,...projectParameterPatch(rotated,'width',75,workspace)});
 expect(projectParameterValue(next,'width',workspace)).toBe(75);
});
