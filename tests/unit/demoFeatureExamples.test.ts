import {readFileSync,existsSync} from 'node:fs';
import {expect,it} from 'vitest';
import {parseDemoManifest} from '@/lib/demoExamples';
import {importLylProject,exportLylProject} from '@/lib/lylProject';
import {editorHistoryEntry} from '@/lib/editorHistory';
const root='apps/web/public/demo-examples/';
const examples=parseDemoManifest(JSON.parse(readFileSync(root+'features-manifest.json','utf8')));
it('bundles five feature examples with real screenshot assets',()=>{
 expect(examples).toHaveLength(5);
 for(const example of examples){
  expect(existsSync(root+example.project)).toBe(true);
  expect(example.thumbnail).toBeTruthy();
  const image=readFileSync(root+example.thumbnail!);
  expect(image.length).toBeGreaterThan(5000);
  expect([...image.subarray(0,2)]).toEqual([255,216]);
 }
});
it.each(examples)('imports $id and retains editable data through an independent save',async example=>{
 const bytes=readFileSync(root+example.project);
 const original=await importLylProject(bytes),copy=await importLylProject(bytes);
 expect(copy.shapes).toHaveLength(1);
 const shape=copy.shapes[0];
 if(shape.kind==='loft'){
  expect(shape.loftTopOutline).toBe('svg');
  expect(shape.loftTopSvg).toBeTruthy();
 }else{
  expect(shape.importedMesh?.positions.length).toBeGreaterThan(0);
  const profile=shape.sketchProfile!;
  expect(profile.texts).toHaveLength(1);
  const text=profile.texts![0];
  for(const segmentId of text.pathSegmentIds??[])expect(profile.segments.some(s=>s.id===segmentId)).toBe(true);
  if(text.pathSegmentIds?.length)expect(profile.segments.filter(s=>text.pathSegmentIds!.includes(s.id)).every(s=>s.construction)).toBe(true);
  if(example.id==='stencil-open'){expect(text.bridges?.width).toBe(1);expect(text.bridgeUnheld).toBe(0);}
  if(example.id==='connected-nameplate'){expect(text.connectionParts).toBe(1);expect(text.raised).toEqual({backerThickness:1.5,letterHeight:2});}
 }
 shape.name='My local edit';
 const saved=await exportLylProject({...copy,projectId:'independent-copy',history:[editorHistoryEntry(copy.shapes,[])],historyIndex:0});
 const restored=await importLylProject(saved);
 expect(restored.shapes[0].name).toBe('My local edit');
 expect(restored.shapes[0].sketchProfile).toEqual(shape.sketchProfile);
 expect((await importLylProject(bytes)).shapes).toEqual(original.shapes);
});
