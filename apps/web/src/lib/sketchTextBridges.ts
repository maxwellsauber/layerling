import type { ManifoldToplevel, CrossSection } from 'manifold-3d';
import { orderedCadSketchPaths } from '@/lib/sketchCadProfile';
import { sampledPath } from '@/lib/sketchStroke';
import { stencilBridges, normalizedStencilBridges, type StencilBridgeOptions } from '@/lib/stencilBridges';
import type { SketchProfile } from '@/types/layerling';

/** Cut channels through the lettering: when used as a hole these remain as material bridges. */
export function bridgeSketchText(runtime:ManifoldToplevel,profile:SketchProfile,id:string,options:StencilBridgeOptions):{profile:SketchProfile;unheld:number} {
 const loops=orderedCadSketchPaths(profile).filter(p=>p.closed).map(p=>sampledPath(p).map(v=>[v.x,v.z] as [number,number]));
 if(!loops.length)return {profile,unheld:0};
 const created:CrossSection[]=[];const keep=(s:CrossSection)=>{created.push(s);return s;};
 try {
  const settings=normalizedStencilBridges(options),letters=keep(new runtime.CrossSection(loops,'EvenOdd'));
  const polygons=letters.toPolygons(),vertices=polygons.flat();
  if(!vertices.length)return {profile,unheld:0};
  const pad=Math.max(2,settings.width*2);
  const minX=Math.min(...vertices.map(v=>v[0]))-pad,maxX=Math.max(...vertices.map(v=>v[0]))+pad;
  const minY=Math.min(...vertices.map(v=>v[1]))-pad,maxY=Math.max(...vertices.map(v=>v[1]))+pad;
  const frame=keep(new runtime.CrossSection([[[minX,minY],[maxX,minY],[maxX,maxY],[minX,maxY]]],'EvenOdd'));
  const material=keep(frame.subtract(letters));
  const plan=stencilBridges(material.toPolygons(),settings);
  if(!plan.rects.length)return {profile,unheld:plan.unheld};
  const cuts=keep(new runtime.CrossSection(plan.rects,'NonZero'));
  const result=keep(letters.subtract(cuts));
  const points:SketchProfile['points']=[],segments:SketchProfile['segments']=[];
  for(const polygon of result.toPolygons()){
   const ids=polygon.map((_,i)=>`${id}:p${points.length+i}`);
   polygon.forEach(([x,z],i)=>points.push({id:ids[i],x,z}));
   ids.forEach((point,i)=>segments.push({id:`${id}:s${segments.length}`,startId:point,endId:ids[(i+1)%ids.length],kind:'line'}));
  }
  return {profile:{points,segments},unheld:plan.unheld};
 } finally {new Set(created).forEach(s=>s.delete());}
}
