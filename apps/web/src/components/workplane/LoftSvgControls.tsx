"use client";
import { useEffect, useRef, useState } from "react";
import { loftProfileFromSketch } from "@/lib/loftSketch";
import { ImageUp } from "lucide-react";
import { t } from "@/lib/i18n";
import { loftProfileFromSvg } from "@/lib/loftSvgImport";
import { decodeSvgBytes, MAX_SVG_BYTES, validateClosedSolidTriangleSoup } from "@/lib/svgImport";
import { createLoftGeometry, loftShapePatch, loftMeasures } from "@/lib/loftGeometry";
import type { LoftSvgProfile, WorkplaneShape } from "@/types/layerling";

export type LoftSvgSection = "bottom" | "top" | number;

export function LoftSvgControls({ shape, section, disabled, onUpdate, sketchMode, sources = [], onSelectSource }: { sketchMode?:boolean; sources?:readonly WorkplaneShape[]; onSelectSource?:(id:string)=>void; shape: WorkplaneShape; section: LoftSvgSection; disabled?: boolean; onUpdate: (patch: Partial<WorkplaneShape>) => void }) {
  const [busy,setBusy]=useState(false), [error,setError]=useState("");
  const live=useRef(true), locked=useRef(false);
  const fileInput=useRef<HTMLInputElement>(null);
  const current=useRef(shape); current.current=shape;
  useEffect(()=>{ live.current=true; return ()=>{live.current=false;}; },[]);
  function applyProfile(svg:LoftSvgProfile) {
      const source=current.current;
      const measures=loftMeasures(source);
      if(typeof section === "number" && !measures.middles[section]) return;
      const patch=loftShapePatch(source,section === "bottom" ? {bottomOutline:"svg",bottomSvg:svg} : section === "top" ? {topOutline:"svg",topSvg:svg} : {
        middles:measures.middles.map((middle,i)=>i === section ? {...middle,outline:"svg",svg} : middle),
      });
      // Validate before changing the design, so a failed import is atomic.
      const geometry=createLoftGeometry({...source,...patch});
      try { validateClosedSolidTriangleSoup(Array.from(geometry.getAttribute("position").array)); }
      finally { geometry.dispose(); }
      onUpdate(patch);
      const updated=loftMeasures({...source,...patch});
      if(updated.wall + 1e-4 < measures.wall) setError(t("loft.wallReduced",{wall:updated.wall.toFixed(2)}));
  }
  async function load(file: File) {
    if(locked.current || disabled) return;
    locked.current=true;setBusy(true);setError("");
    try {
      if(file.size>MAX_SVG_BYTES) throw new Error(t("loft.svgTooLarge"));
      const svg=loftProfileFromSvg(decodeSvgBytes(new Uint8Array(await file.arrayBuffer())),file.name);
      if(!live.current) return;
      applyProfile(svg);
    } catch(e) { if(live.current) setError(e instanceof Error ? e.message : t("loft.svgInvalid")); }
    finally { locked.current=false; if(live.current) setBusy(false); }
  }
  const measures=loftMeasures(shape);
  const profile=section === "bottom" ? measures.bottomSvg : section === "top" ? measures.topSvg : measures.middles[section]?.svg;
  const label=section === "bottom" ? t("loft.svgBottom") : section === "top" ? t("loft.svgTop") : t("loft.svgSection",{n:section+1});
  return <div className="loft-svg-controls">
    {sketchMode ? <div className="loft-svg-file">
      <select aria-label={t("loft.selectSketch")} disabled={disabled || busy} value={profile?.sketchId??""} onChange={event=>{
        const source=sources.find(s=>s.id===event.currentTarget.value);
        if(!source)return;
        try {setError("");applyProfile(loftProfileFromSketch(source));}catch(e){setError(e instanceof Error?e.message:t("loft.sketchClosed"));}
      }}>
        <option value="">{t("loft.selectSketch")}</option>
        {profile?.sketchId&&!sources.some(s=>s.id===profile.sketchId) ? <option value={profile.sketchId}>{profile.name} ({t("loft.sketchMissing")})</option>:null}
        {sources.filter(s=>s.id!==shape.id&&s.sketchProfile).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
      <small>{t("loft.sketchLinkedHint")}</small>
      {profile?.sketchId&&sources.some(s=>s.id===profile.sketchId)&&onSelectSource ? <button className="inspector-action-button" type="button" onClick={()=>onSelectSource(profile.sketchId!)}>{t("loft.sketchSource")}</button>:null}
    </div>:<div className="loft-svg-file">
      <input ref={fileInput} hidden aria-label={label} type="file" accept=".svg,image/svg+xml" disabled={disabled || busy} onChange={event=>{
        const file=event.currentTarget.files?.[0];event.currentTarget.value="";
        if(file) void load(file);
      }}/>
      <button className="inspector-action-button" type="button" disabled={disabled || busy} onClick={()=>fileInput.current?.click()}>
        <ImageUp size={17} strokeWidth={2.5}/><span>{label}…</span>
      </button>
      {profile ? <svg className="loft-svg-preview" viewBox="-.6 -.6 1.2 1.2" role="img" aria-label={profile.name}>
        <path d={`M${profile.points.map(p=>`${p.x},${-p.z}`).join("L")}Z`}/>
      </svg> : null}
      <small>{profile?.name || t("loft.svgHint")}</small>
    </div>}
    {busy ? <p role="status">{t("loft.svgLoading")}</p> : null}
    {error ? <p role="alert">{error}</p> : null}
  </div>;
}
