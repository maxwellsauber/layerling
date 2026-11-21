"use client";
import { useEffect, useMemo, useRef } from "react";
import { FontPicker } from "@/components/workplane/FontPicker";
import { customFontList, textFontLabel } from "@/lib/textFonts";
import { SURFACE_TEXT_FONTS } from "@/lib/surfaceTextOutline";
import { FONT_MANAGER_OPTION, requestFontManager } from "@/lib/fontManagerEvents";
import { textFillChoice, textStrokeForChoice, textStrokeWider, type TextFillChoice } from "@/lib/textFillChoice";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { sketchTextPathPosition } from "@/lib/sketchText";
import type { SketchProfile, SketchText } from "@/types/layerling";

export function SketchTextPanel({text,profile,picking,onPathGuideChange,onChange,onPickPath,onConvert,onClose}:{text:SketchText;profile:SketchProfile;picking:boolean;onPathGuideChange:(guide:boolean)=>void;onChange:(patch:Partial<SketchText>)=>void;onPickPath:()=>void;onConvert:()=>void;onClose:()=>void}){
 useLanguage();
 const input=useRef<HTMLTextAreaElement>(null);
 useEffect(()=>{input.current?.focus();input.current?.select();},[]);
 const pathPosition=useMemo(()=>sketchTextPathPosition(text,profile),[text,profile]);
 const pathSegments=profile.segments.filter(segment=>text.pathSegmentIds?.includes(segment.id));
 const guideCount=pathSegments.filter(segment=>segment.construction).length;
 const pathRole=guideCount===pathSegments.length?'guide':guideCount===0?'geometry':'mixed';
 const fonts=[...SURFACE_TEXT_FONTS.map(value=>({value,label:value,group:t('font.builtInGroup')})),...customFontList().map(f=>({value:f.id,label:f.name,group:t('font.customGroup')}))];
 if(!fonts.some(f=>f.value===text.font))fonts.push({value:text.font,label:textFontLabel(text.font)??t('font.missing'),group:t('font.customGroup')});
 fonts.push({value:FONT_MANAGER_OPTION,label:t('font.manage'),group:t('font.customGroup')});
 const number=(label:string,key:'size'|'spacing'|'letterWidth'|'lineGap'|'startOffset'|'baselineOffset',min:number,max:number,step=1)=><label>{label}<input type="number" value={text[key]} min={min} max={max} step={step} onChange={e=>{if(e.target.value==='')return;const n=Number(e.target.value);if(Number.isFinite(n))onChange({[key]:Math.max(min,Math.min(max,n))});}} /></label>;
 const toggle=(label:string,key:'kerning'|'vertical'|'reverse'|'flip'|'upright'|'fit'|'silhouette')=><label className="sketch-text-toggle"><input type="checkbox" checked={Boolean(text[key])} onChange={e=>onChange({[key]:e.target.checked})} />{label}</label>;
 return <aside className="sketch-text-panel" aria-label={t('sketchText.title')}>
  <div className="sketch-text-heading"><strong>{t('sketchText.title')}</strong><button type="button" onClick={onClose} aria-label={t('backups.close')}>×</button></div>
  <label>{t('prop.text')}<textarea ref={input} value={text.content} maxLength={2000} onChange={e=>onChange({content:e.target.value})} /></label>
  <FontPicker label={t('prop.font')} value={text.font} options={fonts} sample={text.content} onChange={font=>font===FONT_MANAGER_OPTION?requestFontManager():onChange({font})} />
  {number(t('nameTag.letterSize'),'size',.1,500,.5)}
  {number(t('prop.textSpacing'),'spacing',-50,300)}
  {number(t('prop.textLetterWidth'),'letterWidth',25,400)}
  {toggle(t('prop.textKerning'),'kerning')}{toggle(t('prop.textVertical'),'vertical')}
  {text.content.includes('\n')?number(t('sketchText.lineGap'),'lineGap',0,100,.5):null}
  {text.pathSegmentIds?.length?<label>{t('sketchText.pathPosition')}<output>{Math.round(pathPosition*10)/10}%</output><input type="range" min={0} max={100} step={.1} value={text.pathPosition!==undefined&&text.startOffset===0?text.pathPosition:pathPosition} onChange={e=>onChange({pathPosition:Number(e.target.value),startOffset:0})} /></label>:<label>{t('sketchText.alignment')}<select value={text.align} onChange={e=>onChange({align:e.target.value as SketchText['align']})}>{(['start','center','end'] as const).map(value=><option key={value} value={value}>{t(`sketchText.${value}`)}</option>)}</select></label>}
  <label>{t('sketchText.fill')}<select value={text.stroke?.align==='grow'?'wider':textFillChoice(text.stroke)} onChange={e=>onChange({stroke:e.target.value==='wider'?textStrokeWider(true,text.stroke):textStrokeForChoice(e.target.value as TextFillChoice,text.stroke)})}>{(['filled','outline','outer','inner','wider'] as const).map(value=><option key={value} value={value}>{t(`sketchText.${value}`)}</option>)}</select></label>
  {text.stroke?<><label>{t('sketchText.outlineWidth')}<input type="number" min={.05} max={50} step={.1} value={text.stroke.width} onChange={e=>{const width=Number(e.target.value);if(width>=.05&&width<=50)onChange({stroke:{...text.stroke!,width}});}} /></label><label>{t('sketchText.corners')}<select value={text.stroke.join} onChange={e=>onChange({stroke:{...text.stroke!,join:e.target.value as 'miter'|'round'|'bevel'}})}>{(['miter','round','bevel'] as const).map(value=><option key={value} value={value}>{t(`sketchText.${value}`)}</option>)}</select></label></>:null}
  {toggle(t('sketchText.silhouette'),'silhouette')}
  <fieldset><legend>{t('sketchText.connected')}</legend>
   <label>{t('sketchText.connectionMode')}<select value={text.connections?.mode??'off'} onChange={e=>onChange({connections:e.target.value==='off'?undefined:{mode:e.target.value as 'join'|'rail'|'backer',width:text.connections?.width??1,padding:text.connections?.padding??1,railOffset:text.connections?.railOffset??text.size*.15}})}>{(['off','join','rail','backer'] as const).map(mode=><option key={mode} value={mode}>{t(`sketchText.connection.${mode}`)}</option>)}</select></label>
   {text.connections?<>
    <p className="sketch-text-hint">{t(`sketchText.connectionHint.${text.connections.mode}`)}</p>
    <label>{t('sketchText.connectorWidth')}<input type="number" min={.2} max={20} step={.1} value={text.connections.width} onChange={e=>{const width=Number(e.target.value);if(width>=.2&&width<=20)onChange({connections:{...text.connections!,width}});}}/></label>
    {text.connections.mode==='rail'?<label>{t('sketchText.railOffset')}<input type="number" min={-100} max={100} step={.1} value={text.connections.railOffset} onChange={e=>{if(e.target.value==='')return;const railOffset=Number(e.target.value);if(Number.isFinite(railOffset)&&Math.abs(railOffset)<=100)onChange({connections:{...text.connections!,railOffset}});}}/></label>:null}
    {text.connections.mode==='backer'?<><label>{t('sketchText.backerPadding')}<input type="number" min={.1} max={20} step={.1} value={text.connections.padding} onChange={e=>{const padding=Number(e.target.value);if(padding>=.1&&padding<=20)onChange({connections:{...text.connections!,padding}});}}/></label><p className="sketch-text-hint">{t('sketchText.backerHeight')}</p></>:null}
    {text.connectionParts!==undefined?<p role="status">{text.connectionParts===1?t('sketchText.connectedOne'):t('sketchText.connectedParts',{count:text.connectionParts})}</p>:null}
   </>:null}
  </fieldset>
  <fieldset><legend>{t('sketchText.bridges')}</legend>
   <label className="sketch-text-toggle"><input type="checkbox" checked={Boolean(text.bridges)} onChange={e=>onChange({bridges:e.target.checked?{width:1,count:2}:undefined})}/>{t('sketchText.bridges')}</label>
   <p className="sketch-text-hint">{t('sketchText.bridgesHint')}</p>
   {text.bridges?<><label>{t('stencilBridges.width')} (mm)<input type="number" min={.2} max={10} step={.1} value={text.bridges.width} onChange={e=>{const width=Number(e.target.value);if(width>=.2&&width<=10)onChange({bridges:{...text.bridges!,width}});}}/></label><label>{t('stencilBridges.count')}<select value={text.bridges.count} onChange={e=>onChange({bridges:{...text.bridges!,count:Number(e.target.value)}})}>{[1,2,3,4].map(count=><option key={count} value={count}>{count}</option>)}</select></label></>:null}
   {text.bridgeUnheld?<p role="status">{t('sketchText.bridgeUnheld',{count:text.bridgeUnheld})}</p>:null}
  </fieldset>
  <fieldset><legend>{t('sketchText.follow')}</legend>
   <label className="sketch-text-toggle"><input type="checkbox" checked={Boolean(text.pathSegmentIds?.length)||picking} onChange={e=>{if(e.target.checked)onPickPath();else{if(picking)onPickPath();onChange({pathSegmentIds:undefined});}}} />{t('sketchText.follow')}</label>
   <button type="button" aria-pressed={picking} onClick={onPickPath}>{t(picking?'sketchText.pickInstruction':'sketchText.selectPath')}</button>
   {text.pathSegmentIds?.length?<><label>{t('sketchText.pathRole')}<select value={pathRole} onChange={e=>onPathGuideChange(e.target.value==='guide')}><option value="guide">{t('sketchText.guideOnly')}</option><option value="geometry">{t('sketchText.includeGeometry')}</option>{pathRole==='mixed'?<option value="mixed" disabled>{t('sketchText.mixedRole')}</option>:null}</select></label><p className="sketch-text-hint">{t(pathRole==='guide'?'sketchText.guideHint':'sketchText.geometryHint')}</p><p className="sketch-text-hint">{t('sketchText.sharedPathHint')}</p>{number(t('sketchText.baselineOffset'),'baselineOffset',-1000,1000,.5)}{toggle(t('sketchText.reverse'),'reverse')}<p className="sketch-text-hint">{t('sketchText.reverseHint')}</p>{toggle(t('sketchText.flip'),'flip')}<p className="sketch-text-hint">{t('sketchText.flipHint')}</p>{toggle(t('sketchText.upright'),'upright')}{toggle(t('sketchText.fit'),'fit')}</>:null}
  </fieldset>
  {text.warning?<p role="status">{t(text.warning==='overflow'?'sketchText.overflow':'sketchText.missingPath')}</p>:null}
  <p className="sketch-text-hint">{t('sketchText.convertHint')}</p>
  <button type="button" onClick={onConvert}>{t('sketchText.convert')}</button>
 </aside>;
}
