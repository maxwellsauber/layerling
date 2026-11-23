// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {DependenciesPanel} from '@/components/workplane/DependenciesPanel';
import type {WorkplaneShape} from '@/types/layerling';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('follows selection, navigates references, collapses, closes, and shows empty states without future controls',()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const a:WorkplaneShape={id:'a',name:'Base',kind:'box',x:0,z:0,size:20,width:20,depth:20,height:10,rotation:0,color:'#f00'};
 const b={...a,id:'b',name:'Follower',parameterBindings:{height:{expression:'height',refs:{height:'h'}}}};
 const variables=[{id:'h',name:'height',expression:'30',refs:{}}],navigate=vi.fn(),close=vi.fn();
 const render=(selection:string[])=>act(()=>root.render(createElement(DependenciesPanel,{shapes:[a,b],variables,selection,onNavigate:navigate,onClose:close})));
 try{
  render(['b']);expect(host.textContent).toContain('Follower');expect(host.textContent).toContain('30 mm');
  act(()=>host.querySelector<HTMLButtonElement>('.dependency-row')!.click());expect(navigate).toHaveBeenCalledWith({id:'h',kind:'variable',name:'height'},'height');
  render(['a']);expect(host.textContent).toContain('No direct drivers.');
  render([]);expect(host.textContent).toContain('Select an object');
  render(['a','b']);expect(host.textContent).toContain('Select one object');
  expect(host.textContent).not.toMatch(/Highlight dependents|View dependency graph/);
  act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Collapse dependencies"]')!.click());expect(host.querySelector('.dependencies-content')).toBeNull();
  act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Close dependencies"]')!.click());expect(close).toHaveBeenCalledOnce();
 }finally{act(()=>root.unmount());host.remove();}
});

it('groups repeated references by stable ID, starts expanded, and keeps each property navigable',()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const shape:WorkplaneShape={id:'a',name:'Plate',kind:'box',x:0,z:0,size:20,width:20,depth:20,height:10,rotation:0,color:'#f00',parameterBindings:{height:{expression:'height',refs:{height:'h'}},width:{expression:'height * 2',refs:{height:'h'}}}};
 const variables=[{id:'h',name:'height',expression:'30',refs:{}}],navigate=vi.fn();
 try{
  act(()=>root.render(createElement(DependenciesPanel,{shapes:[shape],variables,selection:['a'],onNavigate:navigate,onClose:()=>{}})));
  const group=host.querySelector<HTMLDetailsElement>('.dependency-reference-group')!;
  expect(group.open).toBe(true);expect(group.querySelector('summary')!.textContent).toContain('2 links');
  expect(group.querySelectorAll('.dependency-row')).toHaveLength(2);
  act(()=>group.querySelectorAll<HTMLButtonElement>('.dependency-row')[1].click());
  expect(navigate).toHaveBeenCalledWith({id:'h',kind:'variable',name:'height'},'width');
  act(()=>group.querySelector('summary')!.click());expect(group.open).toBe(false);
 }finally{act(()=>root.unmount());host.remove();}
});
