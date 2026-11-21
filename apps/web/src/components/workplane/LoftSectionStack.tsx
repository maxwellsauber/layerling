"use client";
import { useRef, useState, type ReactNode } from "react";
import { ArrowDown, ArrowUp, ChevronDown, GripVertical, Plus, Trash2 } from "lucide-react";
import { t } from "@/lib/i18n";

export type LoftSectionRow<T> = {id:string;title:string;summary:string;properties:T[];removable:boolean};
export function LoftSectionStack<T>({rows,disabled,canAdd,onAdd,onRemove,onMove,renderRows}: {
  rows:LoftSectionRow<T>[];disabled?:boolean;canAdd:boolean;
  onAdd:()=>string|null;onRemove:(index:number)=>boolean;onMove:(from:number,to:number)=>boolean;
  renderRows:(properties:T[])=>ReactNode;
}) {
  const [open,setOpen]=useState<string|null>(()=>rows[0]?.id??null);
  const [over,setOver]=useState<number|null>(null);
  const list=useRef<HTMLOListElement>(null);
  const gesture=useRef<{from:number;x:number;y:number;moved:boolean}|null>(null);
  const hovered=useRef<number|null>(null);
  const targetAt=(x:number,y:number)=>{
    const row=document.elementFromPoint(x,y)?.closest<HTMLElement>("[data-loft-row]");
    return row && list.current?.contains(row) ? Number(row.dataset.loftRow) : null;
  };
  function move(from:number,to:number) {
    if(disabled || from===to) return;
    if(onMove(from,to)) setOpen(rows[to].id);
    hovered.current=null;setOver(null);
  }
  return <section className="loft-section-stack" aria-label={t("loft.stackTitle")}>
    <div className="loft-stack-heading"><strong>{t("loft.stackTitle")}</strong><span>{rows.length}</span></div>
    <p className="loft-stack-hint">{t("loft.stackHint")}</p>
    <ol ref={list} className="loft-stack-list">
      {rows.map((row,index)=><li key={row.id} data-loft-row={index} className={`loft-stack-row${over===index?" drop-target":""}`}>
        <div className="loft-stack-row-header">
          <button type="button" className="loft-stack-grip" disabled={disabled} aria-label={t("loft.dragSection",{name:row.title})} title={t("loft.dragSection",{name:row.title})}
            onPointerDown={event=>{
              if(disabled || event.button!==0)return;
              gesture.current={from:index,x:event.clientX,y:event.clientY,moved:false};
              event.currentTarget.setPointerCapture(event.pointerId);
            }}
            onPointerMove={event=>{
              const active=gesture.current;if(!active)return;
              if(!active.moved && Math.hypot(event.clientX-active.x,event.clientY-active.y)<4)return;
              active.moved=true;event.preventDefault();
              hovered.current=targetAt(event.clientX,event.clientY);setOver(hovered.current);
            }}
            onPointerUp={event=>{
              const active=gesture.current;gesture.current=null;
              const target=targetAt(event.clientX,event.clientY);
              if(active?.moved && target!==null)move(active.from,target);
              hovered.current=null;setOver(null);
              if(event.currentTarget.hasPointerCapture(event.pointerId))event.currentTarget.releasePointerCapture(event.pointerId);
            }}
            onPointerCancel={()=>{gesture.current=null;hovered.current=null;setOver(null);}}><GripVertical size={17}/></button>
          <button type="button" className="loft-stack-expand" aria-expanded={open===row.id} onClick={()=>setOpen(open===row.id?null:row.id)}>
            <span><strong>{row.title}</strong><small>{row.summary}</small></span><ChevronDown size={17} className={open===row.id?"expanded":""}/>
          </button>
          <div className="loft-stack-actions">
            <button type="button" disabled={disabled||index===0} aria-label={t("loft.moveSectionUp",{name:row.title})} title={t("loft.moveSectionUp",{name:row.title})} onClick={()=>move(index,index-1)}><ArrowUp size={15}/></button>
            <button type="button" disabled={disabled||index===rows.length-1} aria-label={t("loft.moveSectionDown",{name:row.title})} title={t("loft.moveSectionDown",{name:row.title})} onClick={()=>move(index,index+1)}><ArrowDown size={15}/></button>
            {row.removable?<button type="button" disabled={disabled} aria-label={t("loft.removeSection",{name:row.title})} title={t("loft.removeSection",{name:row.title})} onClick={()=>{if(onRemove(index)&&open===row.id)setOpen(null);}}><Trash2 size={15}/></button>:null}
          </div>
        </div>
        {open===row.id?<div className="loft-stack-row-properties">{renderRows(row.properties)}</div>:null}
      </li>)}
    </ol>
    <button type="button" className="loft-stack-add" disabled={disabled||!canAdd} onClick={()=>{const id=onAdd();if(id)setOpen(id);}}><Plus size={17}/>{t("loft.addSection")}</button>
    <span className="loft-stack-live" role="status" aria-live="polite">{over!==null?t("loft.dropSection",{name:rows[over].title}):""}</span>
  </section>;
}
