// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {ProjectVariablesPanel} from '@/components/workplane/ProjectVariablesPanel';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('uses inline editing, commits on blur, and cancels with Escape',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const onApply=vi.fn(async()=>{});
 try{
  act(()=>root.render(createElement(ProjectVariablesPanel,{variables:[{id:'w',name:'wall',expression:'3',refs:{}}],shapes:[],onApply,onClose:vi.fn()})));
  expect(host.querySelector('input')).toBeNull();
  act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='wall')!.click());
  const input=host.querySelector('input')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'thickness');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>input.blur());
  expect(onApply).toHaveBeenCalledTimes(1);expect(onApply.mock.calls[0][0][0].name).toBe('thickness');
  act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent==='thickness')!.click());
  act(()=>host.querySelector('input')!.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  expect(onApply).toHaveBeenCalledTimes(1);expect(host.querySelector('input')).toBeNull();
 }finally{act(()=>root.unmount());host.remove();}
});
