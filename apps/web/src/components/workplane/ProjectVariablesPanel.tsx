"use client";
import {DesignVariants} from "./DesignVariants";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {ChevronDown,ChevronUp,Pencil,Plus,Trash2,X} from 'lucide-react';
import {parameterUsage,resolveProjectVariables,compileVariableDraft,type ProjectVariable} from '@/lib/projectVariables';
import {useMovablePanel} from '@/lib/useMovablePanel';
import type {WorkplaneShape} from '@/types/layerling';
import {createLocalId} from '@/lib/localIds';
import {t} from '@/lib/i18n';
export function ProjectVariablesPanel({variables,shapes,onApply,onClose,projectId}:{projectId?:string|null;variables:ProjectVariable[];shapes:WorkplaneShape[];onApply:(draft:ProjectVariable[])=>void|Promise<void>;onClose:()=>void}){
 const [draft,setDraft]=useState(variables),[error,setError]=useState(''),[busy,setBusy]=useState(false),[collapsed,setCollapsed]=useState(false);
 const [editing,setEditing]=useState<{id:string;field:'name'|'expression'}|null>(null);
 const inputRef=useRef<HTMLInputElement>(null),cancelled=useRef(false),pending=useRef(false);
 const movable=useMovablePanel<HTMLElement>('layerling.editor.variablesPosition',{
  floatingStyle:{right:'auto',bottom:'auto'},keepInside:true,fitUsualSpot:true,
  below:panel=>panel.closest('.layerling-editor')?.querySelector<HTMLElement>('.secondary-toolbar')??null,
 });
 useLayoutEffect(()=>{
  const panel=movable.panelRef.current,position=movable.currentPosition();
  const toolbar=panel?.closest('.layerling-editor')?.querySelector('.secondary-toolbar');
  if(panel&&toolbar&&position){
   const area=panel.offsetParent?.getBoundingClientRect();
   const top=toolbar.getBoundingClientRect().bottom-(area?.top??0)+12;
   if(position.top<top)movable.moveTo({...position,top});
  }
 },[]);
 useEffect(()=>setDraft(variables),[variables]);
 useEffect(()=>{inputRef.current?.focus();inputRef.current?.select();},[editing]);
 let values=new Map<string,number>();try{values=resolveProjectVariables(compileVariableDraft(variables,draft));}catch{/* Show validation errors on commit, without interrupting typing. */}
 const save=async(next:ProjectVariable[],closeEditor=true)=>{
  if(pending.current)return false;
  pending.current=true;setBusy(true);setError('');
  try{await onApply(next);if(closeEditor)setEditing(null);return true;}
  catch(e){setDraft(variables);setEditing(null);setError(e instanceof Error?e.message:String(e));return false;}
  finally{pending.current=false;setBusy(false);}
 };
 const start=(id:string,field:'name'|'expression')=>{if(busy)return;cancelled.current=false;setError('');setEditing({id,field});};
 const editor=(v:ProjectVariable,field:'name'|'expression')=>editing?.id===v.id&&editing.field===field?
  <input ref={inputRef} className="outliner-rename-input" aria-label={`${t(`variables.${field}`)} ${v.name}`} value={v[field]} maxLength={field==='name'?40:80}
   onChange={e=>setDraft(list=>list.map(x=>x.id===v.id?{...x,[field]:e.target.value}:x))}
   onBlur={()=>{if(cancelled.current){cancelled.current=false;return;}void save(draft);}}
   onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();e.currentTarget.blur();}if(e.key==='Escape'){e.preventDefault();e.stopPropagation();cancelled.current=true;setDraft(variables);setEditing(null);setError('');}}}/>
  :<button type="button" className={`project-variable-display ${field==='name'?'outliner-shape-name':'outliner-shape-kind'}`} onDoubleClick={()=>start(v.id,field)} onClick={()=>start(v.id,field)} title={v[field]}>{v[field]}</button>;
 return <aside ref={movable.panelRef} style={movable.style} className={`outliner-panel project-variables-panel ${movable.dragging?'moving':''} ${collapsed?'collapsed':''}`} role="dialog" aria-label={t('variables.title')}
  onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <header className="outliner-header" title={t('outliner.moveHint')} {...movable.handleProps}>
   <div className="outliner-title-wrap">
    <button className="outliner-close-button" type="button" aria-label={t(collapsed?'variables.expand':'variables.collapse')} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronDown size={16}/>:<ChevronUp size={16}/>}</button>
    <span className="project-variable-function" aria-hidden="true">ƒ</span><strong>{t('variables.title')}</strong><span className="outliner-count-badge">{variables.length}</span>
   </div>
   <div className="outliner-header-actions"><button className="outliner-close-button" type="button" onClick={onClose} aria-label={t('variables.close')}><X size={16}/></button></div>
  </header>
  {!collapsed&&<>{projectId&&<DesignVariants projectId={projectId} variables={variables} disabled={busy||Boolean(editing)} onApply={async next=>{
    if(pending.current)return;
    pending.current=true;setBusy(true);setError('');
    try{await onApply(next);setDraft(next);}finally{pending.current=false;setBusy(false);}
  }}/>}<ul className="outliner-list project-variables-list">
   {draft.map(v=>{const used=parameterUsage(variables,shapes,v.id);return <li className="project-variable-row" key={v.id}>
    <span className="project-variable-function" aria-hidden="true">ƒ</span>
    <div className="outliner-info">{editor(v,'name')}<div className="project-variable-expression">{editor(v,'expression')}</div></div>
    <output className="project-variable-result" title={t('variables.result')}>{values.get(v.id)??'—'} <small>mm</small></output>
    <span className="outliner-count-badge" title={`${t('variables.used')}: ${used}`}>{used}</span>
    <button className="outliner-action-btn rename-btn" type="button" disabled={busy} aria-label={`${t('outliner.rename')} ${v.name}`} onClick={()=>start(v.id,'name')}><Pencil size={14}/></button>
    <button className="outliner-action-btn" type="button" disabled={busy||used>0} title={used?`${t('variables.used')}: ${used}`:t('variables.delete')} aria-label={`${t('variables.delete')} ${v.name}`} onClick={()=>void save(draft.filter(x=>x.id!==v.id))}><Trash2 size={14}/></button>
   </li>;})}
  </ul>
  {error?<p className="sketch-constraint-error project-variable-error" role="alert">{error}</p>:null}
  <footer><button type="button" className="outliner-action-btn project-variable-add" disabled={busy} onClick={async()=>{let n=1;while(draft.some(v=>v.name===`dimension${n}`))n++;const id=createLocalId('variable');const saved=await save([...draft,{id,name:`dimension${n}`,expression:'100',refs:{}}]);if(saved)start(id,'name');}}><Plus size={16}/>{t('variables.add')}</button></footer>
  </>}
 </aside>;
}
