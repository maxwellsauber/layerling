import {cadSketchRegions,sampledPath} from '@/lib/sketchCadProfile';
import {normalizeLoftSvgProfile} from '@/lib/loftSvgGeometry';
import {loftMeasures,loftShapePatch,createLoftGeometry} from '@/lib/loftGeometry';
import {t} from '@/lib/i18n';
import {validateClosedSolidTriangleSoup} from '@/lib/svgImport';
import type {LoftSvgProfile,WorkplaneShape} from '@/types/layerling';

/** A reusable local outline: the source keeps its own placement, constraints and editing history. */
export function loftProfileFromSketch(source:WorkplaneShape):LoftSvgProfile {
 const profile=source.sketchProfile;
 if(!profile || profile.stroke || profile.keyring)throw Error(t('loft.sketchClosed'));
 const regions=cadSketchRegions(profile);
 if(regions.length!==1 || regions[0].holes.length)throw Error(t('loft.sketchClosed'));
 const points=sampledPath(regions[0].outer,64);
 const result=normalizeLoftSvgProfile({name:source.name,points,sketchId:source.id});
 if(!result)throw Error(t('loft.sketchClosed'));
 return result;
}

/** Refresh in the same transaction as a source edit, so undo restores both together.
 * Deleted/invalid sources retain the last valid outline. No broken loft enters history. */
export function refreshLoftSketches(next:WorkplaneShape[],before:readonly WorkplaneShape[]):WorkplaneShape[] {
 const sources=new Map(next.map(s=>[s.id,s])),old=new Map(before.map(s=>[s.id,s]));
 return next.map(shape=>{
  if(shape.kind!=='loft')return shape;
  if(!shape.loftBottomSvg?.sketchId&&!shape.loftTopSvg?.sketchId&&!shape.loftSections?.some(s=>s.svg?.sketchId))return shape;
  const m=loftMeasures(shape);let changed=false;
  const update=(svg:LoftSvgProfile|undefined)=>{
   if(!svg?.sketchId)return svg;
   const source=sources.get(svg.sketchId),previous=old.get(svg.sketchId);
   if(!source || (source.name===previous?.name && JSON.stringify(source.sketchProfile)===JSON.stringify(previous?.sketchProfile)))return svg;
   try {const fresh=loftProfileFromSketch(source);if(JSON.stringify(fresh)===JSON.stringify(svg))return svg;changed=true;return fresh;}catch{return svg;}
  };
  const bottomSvg=update(m.bottomSvg),topSvg=update(m.topSvg),middles=m.middles.map(s=>({...s,svg:update(s.svg)}));
  if(!changed)return shape;
  try {
   const patch=loftShapePatch(shape,{bottomSvg,topSvg,middles}),candidate={...shape,...patch};
   const geometry=createLoftGeometry(candidate);
   try {validateClosedSolidTriangleSoup(Array.from(geometry.getAttribute('position').array));}finally{geometry.dispose();}
   return candidate;
  }catch{return shape;}
 });
}
