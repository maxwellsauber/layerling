// @vitest-environment jsdom
import {act,createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {DesignVariants} from '@/components/workplane/DesignVariants';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('saves a named preset, reopens it for the same project, and applies its saved values',async()=>{
 localStorage.clear();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const apply=vi.fn(async()=>{}),variables=[{id:'w',name:'wall',expression:'3',refs:{}}];
 const button=(text:string)=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!;
 try{
  act(()=>root.render(createElement(DesignVariants,{projectId:'p',variables,onApply:apply,disabled:false})));
  act(()=>button('Save as new').click());
  const input=host.querySelector('input')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'Small');input.dispatchEvent(new Event('input',{bubbles:true}));});
  act(()=>input.blur());
  expect(host.querySelector('select')!.textContent).toContain('Small');
  act(()=>root.render(createElement(DesignVariants,{key:'reopen',projectId:'p',variables:[{...variables[0],expression:'8'}],onApply:apply,disabled:false})));
  const select=host.querySelector('select')!;
  await act(async()=>{select.value=select.options[1].value;select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(apply).toHaveBeenCalledWith(variables);
  act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Delete variant"]')!.click());
  expect(select.options).toHaveLength(1);
 }finally{act(()=>root.unmount());host.remove();localStorage.clear();}
});
it('keeps presets isolated by project and reports failed applies',async()=>{
 const variable={id:'w',name:'wall',expression:'3',refs:{}};
 localStorage.setItem('layerling.designVariants.one',JSON.stringify([{id:'small',name:'Small',variables:[variable]}]));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const apply=vi.fn(async()=>{throw Error('Walls do not fit');});
 const render=(projectId:string)=>act(()=>root.render(createElement(DesignVariants,{projectId,variables:[variable],onApply:apply,disabled:false})));
 try{
  render('one');const select=host.querySelector('select')!;
  await act(async()=>{select.value='small';select.dispatchEvent(new Event('change',{bubbles:true}));});
  expect(host.querySelector('[role="alert"]')!.textContent).toBe('Walls do not fit');
  expect(variable.expression).toBe('3');
  render('two');expect(host.querySelector('select')!.options).toHaveLength(1);
  expect(host.querySelector('[role="alert"]')).toBeNull();
 }finally{act(()=>root.unmount());host.remove();localStorage.clear();}
});

it('gives later variables independent saved values in existing presets, including after reopening',async()=>{
 localStorage.clear();
 const first={id:'w',name:'wall',expression:'3',refs:{}};
 const added={id:'h',name:'height',expression:'10',refs:{}};
 const key='layerling.designVariants.later';
 localStorage.setItem(key,JSON.stringify(['small','large'].map(id=>({id,name:id,variables:[first]}))));
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const apply=vi.fn(async(_draft:typeof first[])=>{});
 const render=(variables:typeof first[],reopen=false)=>act(()=>root.render(createElement(DesignVariants,{key:reopen?'reopen':'initial',projectId:'later',variables,onApply:apply,disabled:false})));
 const choose=async(id:string)=>act(async()=>{const select=host.querySelector('select')!;select.value=id;select.dispatchEvent(new Event('change',{bubbles:true}));});
 try{
  render([first]);render([first,added]);
  expect(JSON.parse(localStorage.getItem(key)!)[1].variables[1].expression).toBe('10');
  await choose('small');
  render([first,{...added,expression:'25'}]);
  const update=[...host.querySelectorAll('button')].find(button=>button.textContent==='Update preset')!;
  expect(update.disabled).toBe(false);act(()=>update.click());
  await choose('large');expect(apply.mock.calls.at(-1)?.[0]).toEqual([first,added]);
  render([first,added],true);await choose('small');
  expect(apply.mock.calls.at(-1)?.[0]).toEqual([first,{...added,expression:'25'}]);
 }finally{act(()=>root.unmount());host.remove();localStorage.clear();}
});
