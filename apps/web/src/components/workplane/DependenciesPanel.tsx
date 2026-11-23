"use client";
import {useMemo,useState} from 'react';
import {ChevronDown,ChevronUp,GitBranch,X,ExternalLink} from 'lucide-react';
import {useMovablePanel} from '@/lib/useMovablePanel';
import {sketchPosition} from '@/lib/objectRelationships';
import {queryDependencies,type DependencyEntity,type DependencyLink} from '@/lib/dependencyQuery';
import type {ProjectVariable} from '@/lib/projectVariables';
import type {WorkplaneShape} from '@/types/layerling';
export function DependenciesPanel({shapes,variables,selection,onNavigate,onClose}:{shapes:WorkplaneShape[];variables:ProjectVariable[];selection:string[];onNavigate:(entity:DependencyEntity,property?:string)=>void;onClose:()=>void}){
 const query=useMemo(()=>queryDependencies(shapes,variables),[shapes,variables]);
 const [collapsed,setCollapsed]=useState(false);
 const movable=useMovablePanel<HTMLElement>('layerling.editor.dependenciesPosition',{floatingStyle:{right:'auto',bottom:'auto'},keepInside:true,fitUsualSpot:true,below:panel=>panel.closest('.layerling-editor')?.querySelector<HTMLElement>('.secondary-toolbar')??null});
 const shape=selection.length===1?query.objects.get(selection[0]):undefined;
 const result=shape?query.inspect('object',shape.id):undefined;
 const rows=(links:DependencyLink[],direction:'incoming'|'outgoing')=>{
  const groups=new Map<string,{ref:DependencyEntity;links:DependencyLink[]}>();
  links.forEach(link=>{const ref=direction==='incoming'?link.source:link.target,key=`${ref.kind}:${ref.id}`;const group=groups.get(key);if(group)group.links.push(link);else groups.set(key,{ref,links:[link]});});
  const icon=(ref:DependencyEntity)=>ref.kind==='variable'?<span className="project-variable-function">ƒ</span>:<GitBranch size={18} aria-hidden="true"/>;
  const row=(link:DependencyLink,ref:DependencyEntity,grouped:boolean)=><button type="button" className="dependency-row" disabled={ref.name==='Missing reference'} onClick={()=>onNavigate(ref,link.property)} title={link.message??`Inspect ${ref.name}: ${link.property}`}>
   {!grouped&&icon(ref)}<span className="outliner-info">{!grouped&&<strong className="outliner-shape-name">{ref.name}</strong>}<small>{grouped?link.property:`${ref.kind==='variable'?'Global variable':'Object'} · ${link.property}`}</small>{link.expression&&<small>ƒ {link.expression}</small>}{link.health!=='Healthy'&&<small className="sketch-constraint-error">{link.health}: {link.message}</small>}</span>
   <output>{link.value===undefined?'—':`${Number(link.value.toFixed(3))} mm`}</output><ExternalLink size={14} aria-hidden="true"/>
  </button>;
  return <ul className="outliner-list dependencies-list">{[...groups].map(([key,group])=><li key={`${shape?.id}:${direction}:${key}`}>{group.links.length>1?<details className="dependency-reference-group" open><summary>{icon(group.ref)}<strong>{group.ref.name}</strong><span className="outliner-count-badge">{group.links.length} links</span></summary>{group.links.map(link=><div key={link.id}>{row(link,group.ref,true)}</div>)}</details>:row(group.links[0],group.ref,false)}</li>)}{!links.length&&<li className="dependencies-empty">{direction==='incoming'?'No direct drivers.':'No direct dependents.'}</li>}</ul>;
 };
 return <aside ref={movable.panelRef} style={movable.style} className={`outliner-panel project-variables-panel dependencies-panel ${movable.dragging?'moving':''} ${collapsed?'collapsed':''}`} role="dialog" aria-label="Dependencies" onPointerDown={e=>e.stopPropagation()} onKeyDown={e=>e.stopPropagation()}>
  <header className="outliner-header" {...movable.handleProps}><div className="outliner-title-wrap"><button type="button" className="outliner-close-button" aria-label={collapsed?'Expand dependencies':'Collapse dependencies'} aria-expanded={!collapsed} onClick={()=>setCollapsed(!collapsed)}>{collapsed?<ChevronDown size={16}/>:<ChevronUp size={16}/>}</button><GitBranch size={18}/><strong title={shape?.name}>Dependencies{shape?` — ${shape.name}`:''}</strong><span className="outliner-count-badge">{result?(result.incoming.length+result.outgoing.length):0}</span></div><div className="outliner-header-actions"><button className="outliner-close-button" aria-label="Close dependencies" onClick={onClose}><X size={16}/></button></div></header>
  {!collapsed&&<div className="dependencies-content">{shape&&result?<><div className="dependency-summary"><strong>{shape.name}</strong><small>{shape.sketchProfile?'Sketch body':shape.kind} · X {shape.x.toFixed(2)} · Y {(-shape.z).toFixed(2)} · Z {sketchPosition(shape,'z').toFixed(2)} · Height {shape.height.toFixed(2)} mm</small><span role="status" className={result.health==='Healthy'?'':'sketch-constraint-error'}>{result.health}</span>{result.message&&<small>{result.message}</small>}</div><details open><summary>Driven by ({result.incoming.length})</summary>{rows(result.incoming,'incoming')}</details><details open><summary>Drives ({result.outgoing.length})</summary>{rows(result.outgoing,'outgoing')}</details></>:<p className="dependencies-empty">{selection.length>1?'Select one object to inspect its dependencies.':'Select an object to inspect its dependencies.'}</p>}</div>}
 </aside>;
}
