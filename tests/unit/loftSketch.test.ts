import {expect,it} from 'vitest';
import {loftProfileFromSketch,refreshLoftSketches} from '@/lib/loftSketch';
import {loftShapePatch} from '@/lib/loftGeometry';
import {importLylProject,exportLylProject} from '@/lib/lylProject';
import {editorHistoryEntry} from '@/lib/editorHistory';
import {DEFAULT_SNAP_GRID,DEFAULT_WORKPLANE_WORKSPACE} from '@/lib/workplaneSettings';
import type {WorkplaneShape} from '@/types/layerling';
const source:WorkplaneShape={id:'source',name:'Editable profile',kind:'mesh',x:0,z:0,size:40,width:40,depth:30,height:2,rotation:0,color:'#ff8800',sketchProfile:{points:[{id:'a',x:0,z:0},{id:'b',x:40,z:0},{id:'c',x:40,z:30},{id:'d',x:0,z:30}],segments:[{id:'ab',startId:'a',endId:'b',kind:'line'},{id:'bc',startId:'b',endId:'c',kind:'line'},{id:'cd',startId:'c',endId:'d',kind:'line'},{id:'da',startId:'d',endId:'a',kind:'line'}]}};
const base:WorkplaneShape={...source,id:'loft',kind:'loft',sketchProfile:undefined,height:50};
function linked(){return {...base,...loftShapePatch(base,{topOutline:'svg',topSvg:loftProfileFromSketch(source),middles:[{at:.5,outline:'svg',svg:loftProfileFromSketch(source),width:30,depth:25,corner:0,sides:6,offsetX:0,offsetZ:0}]})};}
it('updates linked top and middle outlines with source edits, without moving or consuming the source',()=>{
 const loft=linked(),edited={...source,sketchProfile:{...source.sketchProfile!,points:source.sketchProfile!.points.map(p=>p.id==='c'?{...p,x:20}:p)}};
 const next=refreshLoftSketches([edited,loft],[source,loft]);
 expect(next[0]).toBe(edited);
 expect(next[1].loftTopSvg?.points).not.toEqual(loft.loftTopSvg?.points);
 expect(next[1].loftTopSvg?.sketchId).toBe(source.id);
 expect(next[1].loftSections?.[0].svg).toEqual(next[1].loftTopSvg);
 expect(next[1].loftTopWidth).toBe(loft.loftTopWidth);
 expect(refreshLoftSketches([source,loft],[edited,next[1]])[1].loftTopSvg).toEqual(loft.loftTopSvg);
});
it('retains the last valid outline when the source is deleted or becomes open',()=>{
 const loft=linked();
 expect(refreshLoftSketches([loft],[source,loft])[0]).toBe(loft);
 const open={...source,sketchProfile:{...source.sketchProfile!,segments:source.sketchProfile!.segments.slice(1)}};
 expect(()=>loftProfileFromSketch(open)).toThrow();
 expect(refreshLoftSketches([open,loft],[source,loft])[1]).toBe(loft);
});
it('preserves the source link and editable sketch through project save/reload',async()=>{
 const shapes=[source,linked()];
 const bytes=await exportLylProject({projectName:'Linked loft',projectId:'test',createdAt:1,modifiedAt:1,shapes,history:[editorHistoryEntry(shapes,[])],historyIndex:0,assets:[],workspace:{...DEFAULT_WORKPLANE_WORKSPACE},snapGrid:DEFAULT_SNAP_GRID,placementElevation:0});
 const restored=await importLylProject(bytes);
 expect(restored.shapes[1].loftTopSvg?.sketchId).toBe(restored.shapes[0].id);
 expect(restored.shapes[0].sketchProfile).toEqual(source.sketchProfile);
});
