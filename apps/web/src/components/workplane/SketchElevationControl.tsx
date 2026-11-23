"use client";
import {LockKeyhole} from 'lucide-react';
import {useContext,useEffect,useState} from 'react';
import {ProjectVariablesContext} from './ProjectVariablesContext';
import {supportsSketchElevation,sketchPosition,relationshipOnAxis,type RelationshipAxis} from '@/lib/objectRelationships';
import {evaluateVariableExpression,resolveProjectVariables} from '@/lib/projectVariables';
import type {WorkplaneShape} from '@/types/layerling';
export function SketchElevationControl({shape}:{shape:WorkplaneShape}){
 const context=useContext(ProjectVariablesContext);
 const [axis,setAxis]=useState<RelationshipAxis>('z');
 const relation=relationshipOnAxis(shape,axis);
 const [parent,setParent]=useState(relation?.parentId??''),[offset,setOffset]=useState(relation?.offset.expression??'0'),[error,setError]=useState('');
 useEffect(()=>{setParent(relation?.parentId??'');setOffset(relation?.offset.expression??'0');setError('');},[shape.id,relation,axis]);
 if(!supportsSketchElevation(shape)||!context.relateElevation)return null;
 const choices=(context.objects??[]).filter(s=>s.id!==shape.id&&supportsSketchElevation(s));
 const source=choices.find(s=>s.id===relation?.parentId);
 const locked=Boolean(shape.locked||shape.shapeLocked);
 const apply=(detach=false)=>{try{context.relateElevation!(shape.id,detach?null:parent,offset,axis);setError('');}catch(e){setError(e instanceof Error?e.message:String(e));}};
 let amount:number|undefined;try{if(relation)amount=evaluateVariableExpression(relation.offset,resolveProjectVariables(context.variables));}catch{}
 return <div className="sketch-elevation-relationship">
  <strong>Follow sketch position</strong>
  <label>Axis<select aria-label="Relationship axis" value={axis} disabled={locked} onChange={e=>setAxis(e.target.value as RelationshipAxis)}><option value="x">X center</option><option value="y">Y center</option><option value="z">Z sketch plane</option></select></label>
  <small>Linked axes: {(['x','y','z'] as const).filter(a=>relationshipOnAxis(shape,a)).map(a=>a.toUpperCase()).join(', ')||'none'}</small>
  {relation&&<div className="sketch-relationship-info" role="status"><LockKeyhole size={16} aria-hidden="true"/><span>{axis.toUpperCase()} = {source?.name??'Missing sketch'} + {relation.offset.expression}{amount!==undefined?` (${amount} mm offset)` : ''}. Current: {sketchPosition(shape,axis).toFixed(2)} mm. This axis follows its parent; detach to move it independently.</span></div>}
  <label>Parent sketch<select aria-label="Parent sketch" value={parent} disabled={locked} onChange={e=>setParent(e.target.value)}><option value="">Choose a sketch…</option>{choices.map((s,i)=><option key={s.id} value={s.id}>{s.name} ({i+1})</option>)}</select></label>
  <label>Offset (mm or variable)<input aria-label="Sketch position offset" type="text" value={offset} maxLength={80} disabled={locked} onChange={e=>setOffset(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();apply();}}}/></label>
  <div className="design-variant-actions"><button type="button" className="inspector-action-button" disabled={locked||!parent} onClick={()=>apply()}>{relation?'Update link':axis==='z'?'Link elevation':'Link position'}</button>{relation&&<button type="button" className="inspector-action-button" disabled={locked} onClick={()=>apply(true)}>Detach</button>}</div>
  {!relation&&<small>Moves with its parent; existing alignment tools remain one-time actions.</small>}
  {error&&<div role="alert" className="sketch-constraint-error"><span>{error} The previous relationship and geometry are unchanged.</span><button type="button" className="inspector-action-button" onClick={()=>setError('')}>Dismiss</button></div>}
 </div>;
}
