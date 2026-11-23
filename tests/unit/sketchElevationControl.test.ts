// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SketchElevationControl} from '@/components/workplane/SketchElevationControl';
import {ProjectVariablesContext} from '@/components/workplane/ProjectVariablesContext';
import type {WorkplaneShape} from '@/types/layerling';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('lets users choose a parent, enter a variable offset, inspect the link and detach it',()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const shape:WorkplaneShape={id:'B',name:'B',kind:'mesh',x:0,z:0,width:20,depth:20,height:10,size:20,rotation:0,color:'#f00',sketchProfile:{points:[],segments:[]}};
 const parent={...shape,id:'A',name:'A'},relate=vi.fn();
 const variables=[{id:'h',name:'height',expression:'100',refs:{}}];
 const render=(s=shape)=>act(()=>root.render(createElement(ProjectVariablesContext.Provider,{value:{variables,objects:[parent,s],relateElevation:relate}},createElement(SketchElevationControl,{shape:s}))));
 try{
  render();
  act(()=>{const select=host.querySelector<HTMLSelectElement>('[aria-label="Parent sketch"]')!;select.value='A';select.dispatchEvent(new Event('change',{bubbles:true}));});
  act(()=>{const input=host.querySelector('input')!;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'height');input.dispatchEvent(new Event('input',{bubbles:true}));});
  act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Link elevation')!.click());
  expect(relate).toHaveBeenCalledWith('B','A','height','z');
  render({...shape,elevation:100,elevationRelationship:{parentId:'A',offset:{expression:'height',refs:{height:'h'}}}});
  expect(host.textContent).toContain('Z = A + height');
  act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='Detach')!.click());
  expect(relate).toHaveBeenLastCalledWith('B',null,'height','z');
 }finally{act(()=>root.unmount());host.remove();}
});
