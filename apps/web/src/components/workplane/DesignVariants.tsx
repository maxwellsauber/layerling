"use client";
import {useEffect,useRef,useState} from 'react';
import {Pencil,Plus,Trash2,Save} from 'lucide-react';
import {createLocalId} from '@/lib/localIds';
import {variantDraft,type DesignVariant} from '@/lib/designVariants';
import {validateProjectVariables,type ProjectVariable} from '@/lib/projectVariables';

export function DesignVariants({projectId,variables,onApply,disabled}:{projectId:string;variables:ProjectVariable[];onApply:(draft:ProjectVariable[])=>Promise<void>;disabled:boolean}){
 const applying=useRef(false);
 const [working,setWorking]=useState(false);
 const key=`layerling.designVariants.${projectId}`;
 const [variants,setVariants]=useState<DesignVariant[]>([]),[selected,setSelected]=useState('');
 const [editing,setEditing]=useState(false),[name,setName]=useState(''),[error,setError]=useState('');
 const unavailable=disabled||working;
 useEffect(()=>{
  let list:DesignVariant[]=[];
  try{
   const saved=JSON.parse(localStorage.getItem(key)??'[]');
   if(Array.isArray(saved))list=saved.filter(v=>{
    try{if(!v||typeof v.id!=='string'||typeof v.name!=='string')return false;validateProjectVariables(v.variables);return true;}catch{return false;}
   });
  }catch{/* Storage may be unavailable. Saving will explain the problem. */}
  setVariants(list);
  let remembered='';try{remembered=localStorage.getItem(`${key}.selected`)??'';}catch{}
  setSelected(list.some(v=>v.id===remembered)?remembered:'');setEditing(false);setError('');
 },[key]);
 const remember=(id:string)=>{setSelected(id);try{localStorage.setItem(`${key}.selected`,id);}catch{}};
 const store=(next:DesignVariant[])=>{
  try{localStorage.setItem(key,JSON.stringify(next));setVariants(next);setError('');return true;}
  catch{setError('Could not save presets in this browser.');return false;}
 };
 const current=variants.find(v=>v.id===selected);
 let modified=false;
 if(current){try{modified=JSON.stringify(variantDraft(variables,current))!==JSON.stringify(variables);}catch{modified=true;}}
 const snapshot=()=>JSON.parse(JSON.stringify(variables)) as ProjectVariable[];
 const rename=()=>{
  const trimmed=name.trim();if(!trimmed){setEditing(false);return;}
  if(store(variants.map(v=>v.id===selected?{...v,name:trimmed}:v)))setEditing(false);
 };
 const apply=async(id:string)=>{
  if(applying.current||unavailable)return;
  if(!id){remember('');return;}
  const variant=variants.find(v=>v.id===id);if(!variant)return;
  applying.current=true;setWorking(true);setError('');
  try{await onApply(variantDraft(variables,variant));remember(id);}
  catch(e){setError(e instanceof Error?e.message:String(e));}
  finally{applying.current=false;setWorking(false);}
 };
 return <section className="design-variants" aria-label="Design variants">
  <div className="design-variant-heading"><strong>Design variants</strong>{working?<small role="status">Applying…</small>:current?<small>{modified?'Unsaved changes':'Saved values'}</small>:null}</div>
  <div className="design-variant-actions">
   {editing?<input className="outliner-rename-input" aria-label="Variant name" value={name} maxLength={80} autoFocus onFocus={e=>e.currentTarget.select()} onChange={e=>setName(e.target.value)} onBlur={rename} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();setEditing(false);}}}/>
    :<select aria-label="Design variant" disabled={unavailable} value={selected} onChange={e=>void apply(e.target.value)}><option value="">Choose a preset…</option>{variants.map(v=><option key={v.id} value={v.id}>{v.name}</option>)}</select>}
   <button type="button" className="design-variant-icon" disabled={unavailable||!current||editing} onClick={()=>{if(current){setName(current.name);setEditing(true);}}} aria-label="Rename variant" title="Rename preset"><Pencil size={15}/></button>
   <button type="button" className="design-variant-icon" disabled={unavailable||!current||editing} aria-label="Delete variant" title="Delete preset" onClick={()=>{if(store(variants.filter(v=>v.id!==selected)))remember('');}}><Trash2 size={15}/></button>
  </div>
  <div className="design-variant-actions design-variant-save-actions">
   <button type="button" className="design-variant-button" disabled={unavailable||!variables.length||editing} onClick={()=>{
    let n=1;while(variants.some(v=>v.name===`Variant ${n}`))n++;
    const v:DesignVariant={id:createLocalId('variant'),name:`Variant ${n}`,variables:snapshot()};
    if(store([...variants,v])){remember(v.id);setName(v.name);setEditing(true);}
   }}><Plus size={15}/>Save as new</button>
   <button type="button" className="design-variant-button primary" disabled={unavailable||!current||!modified||editing} onClick={()=>{if(current)store(variants.map(v=>v.id===selected?{...v,variables:snapshot()}:v));}}><Save size={15}/>Update preset</button>
  </div>
  {error&&<p role="alert" className="sketch-constraint-error">{error}</p>}
 </section>;
}
