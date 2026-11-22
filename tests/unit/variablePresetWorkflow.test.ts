// @vitest-environment jsdom
import {act,createElement,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it} from 'vitest';
import {ProjectVariablesPanel} from '@/components/workplane/ProjectVariablesPanel';
import type {ProjectVariable} from '@/lib/projectVariables';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('saves independent presets, switches actual variable values, updates a preset and rolls back failed edits',async()=>{
 localStorage.clear();const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 let current:ProjectVariable[]=[];
 function Harness(){
  const [variables,setVariables]=useState<ProjectVariable[]>([{id:'one',name:'var1',expression:'100',refs:{}},{id:'two',name:'var2',expression:'100',refs:{}}]);
  current=variables;
  return createElement(ProjectVariablesPanel,{projectId:'workflow',variables,shapes:[],onClose:()=>{},onApply:async draft=>{
   if(draft.some(v=>v.expression==='-1'))throw Error('Rejected negative dimension');
   setVariables(draft);
  }});
 }
 const click=(text:string)=>act(()=>[...host.querySelectorAll('button')].find(b=>b.textContent===text)!.click());
 const enter=async(input:HTMLInputElement,value:string)=>{
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,value);input.dispatchEvent(new Event('input',{bubbles:true}));});
  await act(async()=>input.blur());
 };
 const choose=async(index:number)=>{const select=host.querySelector('select')!;await act(async()=>{select.value=select.options[index].value;select.dispatchEvent(new Event('change',{bubbles:true}));});};
 const edit=async(value:string)=>{
  const row=[...host.querySelectorAll('.project-variable-row')][0];
  act(()=>row.querySelector<HTMLButtonElement>('.project-variable-expression button')!.click());
  await enter(row.querySelector('input')!,value);
 };
 try{
  act(()=>root.render(createElement(Harness)));
  click('Save as new');await enter(host.querySelector('[aria-label="Variant name"]')!,'Small');
  await edit('200');expect(current[0].expression).toBe('200');expect(host.textContent).toContain('Unsaved changes');
  click('Save as new');await enter(host.querySelector('[aria-label="Variant name"]')!,'Large');
  await choose(1);expect(current[0].expression).toBe('100');
  await choose(2);expect(current[0].expression).toBe('200');
  await edit('250');click('Update preset');
  await choose(1);expect(current[0].expression).toBe('100');
  await choose(2);expect(current[0].expression).toBe('250');
  await edit('-1');expect(current[0].expression).toBe('250');
  expect(host.querySelector('[role="alert"]')!.textContent).toContain('Rejected');
  expect(host.querySelectorAll('.project-variable-expression')[0].textContent).toBe('250');
  const stored=JSON.parse(localStorage.getItem('layerling.designVariants.workflow')!);
  expect(stored.map((v:{variables:ProjectVariable[]})=>v.variables[0].expression)).toEqual(['100','250']);
 }finally{act(()=>root.unmount());host.remove();localStorage.clear();}
});
