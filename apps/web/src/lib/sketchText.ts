import { connectSketchText } from "@/lib/sketchTextConnections";
import { bridgeSketchText } from "@/lib/sketchTextBridges";
import * as THREE from "three";
import { straightTextShapes } from "@/lib/textGeometry";
import { textFont } from "@/lib/textFonts";
import { withSegmentsConstruction } from "@/lib/sketchConstruction";
import { curveControls } from "@/lib/sketchPaths";
import { orderedSketchPaths } from "@/lib/sketchSmoothHandles";
import { silhouetteSketchProfile } from "@/lib/sketchCadProfile";
import { strokedSketchProfile } from "@/lib/sketchStroke";
import { MAX_TEXT_LENGTH } from "@/lib/textLength";
import { MAX_TEXT_BLOCK_LINES } from "@/lib/textBlock";
import { updateSketchOffsets } from "@/lib/sketchOffsets";
import { loadedManifoldRuntime } from "@/lib/manifoldHandle";
import type { SketchPoint, SketchProfile, SketchSegment, SketchText } from "@/types/layerling";

type Vec = { x: number; z: number };
type Matrix = SketchText["matrix"];
export const IDENTITY_TEXT_MATRIX: Matrix = [1, 0, 0, 1, 0, 0];
const mapMatrix = (m: Matrix, p: Vec): Vec => ({ x: m[0]*p.x+m[2]*p.z+m[4], z:m[1]*p.x+m[3]*p.z+m[5] });
export function composeTextMatrix(a: Matrix, b: Matrix): Matrix {
  return [a[0]*b[0]+a[2]*b[1],a[1]*b[0]+a[3]*b[1],a[0]*b[2]+a[2]*b[3],a[1]*b[2]+a[3]*b[3],a[0]*b[4]+a[2]*b[5]+a[4],a[1]*b[4]+a[3]*b[5]+a[5]];
}

/** CurvePath.getPoint already uses distance; do not apply a second sampled arc-length mapping. */
class SketchBaselineCurve extends THREE.CurvePath<THREE.Vector2> {
  override getPointAt(u:number,target?:THREE.Vector2):THREE.Vector2 {
    return this.getPoint(Math.max(0,Math.min(1,u)),target);
  }
  override getTangentAt(u:number,target=new THREE.Vector2()):THREE.Vector2 {
    const lengths=this.getCurveLengths(),distance=Math.max(0,Math.min(1,u))*(lengths.at(-1)??0);
    let before=0;
    for(let i=0;i<this.curves.length;i++){
      const length=lengths[i]-before;
      if(length>1e-10&&(distance<=lengths[i]||i===this.curves.length-1))
        return this.curves[i].getTangentAt(Math.max(0,Math.min(1,(distance-before)/length)),target);
      before=lengths[i];
    }
    return target.set(1,0);
  }
}

/** A single connected, unbranched baseline. Preserve the first saved segment as its seam. */
export function sketchTextBaseline(profile: SketchProfile, ids: readonly string[]) {
  const forbidden = new Set(profile.texts?.flatMap(text => text.segmentIds));
  for (let pass=0;pass<(profile.offsets?.length??0);pass++) for (const offset of profile.offsets ?? []) {
    if(offset.sourceSegmentIds.some(id=>forbidden.has(id)))offset.segmentIds.forEach(id=>forbidden.add(id));
  }
  if(ids.some(id=>forbidden.has(id)))return null;
  const segments = ids.map(id=>profile.segments.find(s=>s.id===id));
  if (!segments.length || segments.some(s=>!s)) return null;
  const paths=orderedSketchPaths({...profile, segments:segments as SketchSegment[]});
  if(paths.length!==1 || paths[0].steps.length!==segments.length)return null;
  const path=paths[0];
  const seed = path.steps.find(step => step.segment.id === ids[0])!;
  const steps = seed.from.id === seed.segment.startId ? path.steps : [...path.steps].reverse().map(step => ({ ...step, from: step.to, to: step.from }));
  const degrees=new Map<string,number>();
  for(const s of segments as SketchSegment[])for(const id of [s.startId,s.endId])degrees.set(id,(degrees.get(id)??0)+1);
  if([...degrees.values()].some(n=>n>2))return null;
  const curve=new SketchBaselineCurve();
  for(const step of steps){
    const a=step.from,b=step.to;
    const va=new THREE.Vector2(a.x,a.z),vb=new THREE.Vector2(b.x,b.z);
    const {first:h1,second:h2}=curveControls(step);
    // Match the editor and CAD wire builder, including smooth and legacy implicit curves.
    if(step.segment.kind!=='line'&&h1&&h2){
      const cubic=new THREE.CubicBezierCurve(va,new THREE.Vector2(h1.x,h1.z),new THREE.Vector2(h2.x,h2.z),vb);
      cubic.arcLengthDivisions=256;curve.add(cubic);
    }else curve.add(new THREE.LineCurve(va,vb));
  }
  const length=curve.getLength();
  if(!Number.isFinite(length)||length<1e-6)return null;
  return {curve,length,closed:path.closed};
}

/** The role belongs to the source segments, so all text sharing a baseline agrees. */
export function setSketchTextPathGuide(profile:SketchProfile,segmentIds:string[],guide:boolean):SketchProfile {
 if(!sketchTextBaseline(profile,segmentIds))return profile;
 return withSegmentsConstruction(profile,new Set(segmentIds),guide);
}
/** New baselines default to construction geometry; shared baselines keep their chosen role. */
export function attachSketchTextPath(profile:SketchProfile,textId:string,segmentIds:string[]):SketchProfile {
 if(!profile.texts?.some(text=>text.id===textId)||!sketchTextBaseline(profile,segmentIds))return profile;
 const shared=profile.texts.some(text=>text.id!==textId&&text.pathSegmentIds?.some(id=>segmentIds.includes(id)));
 const unchanged=profile.texts.find(text=>text.id===textId)?.pathSegmentIds;
 const same=unchanged?.length===segmentIds.length&&unchanged.every(id=>segmentIds.includes(id));
 const next=shared||same?profile:setSketchTextPathGuide(profile,segmentIds,true);
 return {...next,texts:next.texts!.map(text=>text.id===textId?{...text,pathSegmentIds:[...segmentIds],matrix:[1,0,0,1,0,0] as Matrix}:text)};
}

/** Pick the complete connected path containing a segment, excluding all generated lettering. */
export function sketchTextPathSelection(profile:SketchProfile,segmentId:string):string[]|null{
  const generated=new Set(profile.texts?.flatMap(t=>t.segmentIds));
  const paths=orderedSketchPaths({...profile,segments:profile.segments.filter(s=>!generated.has(s.id))});
  const path=paths.find(p=>p.steps.some(s=>s.segment.id===segmentId));
  if(!path)return null;
  const ids=path.steps.map(s=>s.segment.id);
  return sketchTextBaseline(profile,ids)?ids:null;
}

function bounds(shape:THREE.Shape){const p=shape.getPoints(8);return {min:Math.min(...p.map(p=>p.x)),max:Math.max(...p.map(p=>p.x)),minY:Math.min(...p.map(p=>p.y)),maxY:Math.max(...p.map(p=>p.y))};}
/** Generate the whole shaped run through the existing engine, never by splitting source Unicode characters. */
function glyphRuns(text:SketchText){
  const settings={text:text.content,font:text.font,textSpacing:text.spacing,textKerning:text.kerning,textVertical:text.vertical};
  const cap=textFont(text.font).generateShapes('H',100).flatMap(g=>g.getPoints(4));
  const capHeight=cap.length?Math.max(...cap.map(p=>p.y))-Math.min(...cap.map(p=>p.y)):70;
  const em=100*text.size/Math.max(1e-6,capHeight);
  const verticalPath=Boolean(text.vertical&&text.pathSegmentIds?.length);
  let down=0;
  return text.content.split(/\r?\n/).slice(0,MAX_TEXT_BLOCK_LINES).flatMap(line=>{
    const glyphs=straightTextShapes({...settings,text:line.slice(0,MAX_TEXT_LENGTH)},em);
    if(!glyphs.length){down+=text.size+text.lineGap;return [];}
    const ranges=glyphs.map(g=>({glyph:g,...bounds(g)}));
    const min=Math.min(...ranges.map(r=>verticalPath?-r.maxY:r.min)),max=Math.max(...ranges.map(r=>verticalPath?-r.minY:r.max));
    const width=(max-min)*(verticalPath?1:text.letterWidth/100);
    const lineOffset=down;
    down+=Math.max(...ranges.map(r=>r.maxY))-Math.min(...ranges.map(r=>r.minY))+text.lineGap;
    return ranges.map(r=>{
      // Detached dots/accents whose horizontal extent lies inside a larger contour share its tangent.
      const body=ranges.filter(other=>other!==r&&other.min<=r.min+1e-7&&other.max>=r.max-1e-7&&(other.max-other.min)>(r.max-r.min)+1e-7).sort((a,b)=>(b.max-b.min)-(a.max-a.min))[0]??r;
      return {glyph:r.glyph,center:verticalPath?-(r.minY+r.maxY)/2:(body.min+body.max)/2,centerX:(body.min+body.max)/2,centerY:(r.minY+r.maxY)/2,min,width,lineOffset,verticalPath,glyphBounds:r};
    });
  });
}

/** The occupied arc is stable when changing reading direction. */
export function sketchTextPathSpan(text:SketchText,length:number,closed:boolean):number {
 const runs=glyphRuns(text),width=runs.length?Math.max(...runs.map(r=>r.width)):0;
 const available=closed?length:Math.max(0,length-Math.max(0,text.pathPosition===undefined?text.startOffset:sketchTextPathStart(text,length)));
 return text.fit?Math.min(width,available):width;
}
export function sketchTextPathAnchor(text:SketchText,length:number,closed:boolean):number {
 const span=sketchTextPathSpan(text,length,closed);
 return sketchTextPathStart(text,length,span)+(text.reverse?span:0);
}

/** Preserve legacy alignment until the percentage slider is first adjusted. */
export function sketchTextPathStart(text:SketchText,length:number,span=0):number {
 return text.pathPosition !== undefined ? length*text.pathPosition/100+text.startOffset : (length-span)*(text.align==='center'?.5:text.align==='end'?1:0)+text.startOffset;
}
export function sketchTextPathPosition(text:SketchText,profile:SketchProfile):number {
 if(text.pathPosition!==undefined&&text.startOffset===0)return text.pathPosition;
 const baseline=text.pathSegmentIds?.length?sketchTextBaseline(profile,text.pathSegmentIds):null;
 if(!baseline)return text.pathPosition??0;
 const runs=glyphRuns(text),width=runs.length?Math.max(...runs.map(r=>r.width)):0;
 const available=baseline.closed?baseline.length:Math.max(0,baseline.length-Math.max(0,text.startOffset));
 const span=text.fit?Math.min(width,available):width;
 const value=sketchTextPathStart(text,baseline.length,span)/baseline.length*100;
 return baseline.closed?((value%100)+100)%100:Math.max(0,Math.min(100,value));
}

function outlineGeometry(text:SketchText,profile:SketchProfile,cache:SketchProfile):{profile:SketchProfile; warning?:SketchText['warning'];bridgeUnheld?:number;connectionParts?:number} {
  const runs=glyphRuns(text),points:SketchPoint[]=[],segments:SketchSegment[]=[];
  const baseline=text.pathSegmentIds?.length?sketchTextBaseline(profile,text.pathSegmentIds):null;
  if(text.pathSegmentIds?.length&&!baseline)return {profile:{points:cache.points.filter(p=>text.pointIds.includes(p.id)),segments:cache.segments.filter(s=>text.segmentIds.includes(s.id))},warning:'missing-path'};
  let warning:SketchText['warning'];
  let index=0;
  const width=runs.length?Math.max(...runs.map(r=>r.width)):0;
  const available=baseline?baseline.length-(baseline.closed?0:Math.max(0,text.pathPosition===undefined?text.startOffset:sketchTextPathStart(text,baseline.length))):Infinity;
  const fit=baseline&&text.fit&&width>available?Math.max(0,available)/Math.max(width,1e-9):1;
  const span=width*fit;
  if(baseline&&span>available+1e-6)warning='overflow';
  const align=text.align==='center'?.5:text.align==='end'?1:0;
  const flipShift=baseline&&text.flip&&runs.length ? (Math.max(...runs.map(r=>r.glyphBounds.maxY-r.lineOffset))+Math.min(...runs.map(r=>r.glyphBounds.minY-r.lineOffset)))*fit : 0;
  for(const run of runs){
    const scaleX=text.letterWidth/100;
    const glyphBounds=run.glyphBounds;
    const glyphWidth=(run.verticalPath?glyphBounds.maxY-glyphBounds.minY:(glyphBounds.max-glyphBounds.min)*scaleX)*fit;
    const along=(run.center-run.min)*(run.verticalPath?1:scaleX)*fit;
    const start=baseline?sketchTextPathStart(text,baseline.length,span):-span*align;
    const s=start+(baseline&&text.reverse?span-along:along);
    // An open end or a full closed revolution never repeats or cuts through a glyph.
    if(baseline&&(along+glyphWidth/2>baseline.length+1e-6||(!baseline.closed&&(s-glyphWidth/2<0||s+glyphWidth/2>baseline.length))))continue;
    const distance=baseline?.closed?((s%baseline.length)+baseline.length)%baseline.length:s;
    const u=baseline?Math.min(1,Math.max(0,distance/baseline.length)):0;
    const direction=text.reverse?-1:1;
    const at=baseline?baseline.curve.getPointAt(u):null;
    const tangent=baseline?baseline.curve.getTangentAt(u).multiplyScalar(direction):new THREE.Vector2(1,0);
    const angle=text.upright?0:Math.atan2(tangent.y,tangent.x);
    const cos=Math.cos(angle),sin=Math.sin(angle);
    const map=(v:THREE.Vector2):Vec=>{
      const px=(v.x-(run.verticalPath?run.centerX:run.center))*scaleX*fit;
      const py=(-v.y+(run.verticalPath?run.centerY:0)+run.lineOffset)*fit+flipShift;
      const origin=at?{x:at.x-tangent.y*text.baselineOffset,z:at.y+tangent.x*text.baselineOffset}:{x:s,z:0};
      return mapMatrix(text.matrix,{x:origin.x+px*cos-py*sin,z:origin.z+px*sin+py*cos});
    };
    for(const contour of [run.glyph,...run.glyph.holes]){
      if(!contour.curves.length)continue;
      const contourPoints:SketchPoint[]=[];
      for(const curve of contour.curves){
        const a=map(curve.getPoint(0)),b=map(curve.getPoint(1));
        const point:SketchPoint={id:`${text.id}:p${index++}`,...a,shapeName:text.content};
        const raw=curve as unknown as {isCubicBezierCurve?:boolean;isQuadraticBezierCurve?:boolean;v0:THREE.Vector2;v1:THREE.Vector2;v2:THREE.Vector2;v3?:THREE.Vector2};
        let h1:Vec|undefined,h2:Vec|undefined;
        if(raw.isCubicBezierCurve){h1=map(raw.v1);h2=map(raw.v2);}
        else if(raw.isQuadraticBezierCurve){const q=map(raw.v1);h1={x:a.x+2*(q.x-a.x)/3,z:a.z+2*(q.z-a.z)/3};h2={x:b.x+2*(q.x-b.x)/3,z:b.z+2*(q.z-b.z)/3};}
        if(text.font==='Stencil'){h1=undefined;h2=undefined;}
        if(h1)point.handleOut=h1;
        // The incoming handle belongs to the next point; store it after closure below.
        contourPoints.push(point);
        segments.push({id:`${text.id}:s${segments.length}`,startId:point.id,endId:'',kind:h1?'bezier':'line'});
        (segments[segments.length-1] as SketchSegment & {_incoming?:Vec})._incoming=h2;
      }
      const firstSegment=segments.length-contourPoints.length;
      contourPoints.forEach((point,i)=>{const next=contourPoints[(i+1)%contourPoints.length];const segment=segments[firstSegment+i] as SketchSegment & {_incoming?:Vec};segment.endId=next.id;if(segment._incoming)next.handleIn=segment._incoming;delete segment._incoming;});
      points.push(...contourPoints);
    }
  }
  let made:SketchProfile={points,segments};
  if(text.stroke){const runtime=loadedManifoldRuntime();if(!runtime)throw Error('Text fill engine is not ready');made=strokedSketchProfile(runtime,{...made,stroke:text.stroke})??{points:[],segments:[]};
    // Offset results get deterministic IDs too, so a save/reload cannot accumulate geometry.
    const ids=new Map(made.points.map((p,i)=>[p.id,`${text.id}:p${i}`]));made={...made,points:made.points.map(p=>({...p,id:ids.get(p.id)!,shapeName:text.content})),segments:made.segments.map((s,i)=>({...s,id:`${text.id}:s${i}`,startId:ids.get(s.startId)!,endId:ids.get(s.endId)!}))};
  }
  if(text.silhouette)made=silhouetteSketchProfile(made);
  let bridgeUnheld:number|undefined;
  if(text.bridges){
    const runtime=loadedManifoldRuntime();if(!runtime)throw Error('Text fill engine is not ready');
    const bridged=bridgeSketchText(runtime,made,text.id,text.bridges);made=bridged.profile;bridgeUnheld=bridged.unheld;
  }
  let connectionParts:number|undefined;
  if(text.connections){
    const runtime=loadedManifoldRuntime();if(!runtime)throw Error('Text fill engine is not ready');
    const rails:Array<Array<[number,number]>>=[];
    if(text.connections.mode==='rail'){
      const start=baseline?sketchTextPathStart(text,baseline.length,span):-span*align;
      for(const lineOffset of new Set(runs.map(run=>run.lineOffset))){
        const rail:Array<[number,number]>=[],steps=baseline?Math.max(2,Math.min(512,Math.ceil(span/Math.max(.25,text.connections.width/2)))):1;
        for(let i=0;i<=steps;i++){
          const distance=start+span*i/steps;
          if(baseline&&!baseline.closed&&(distance<0||distance>baseline.length))continue;
          const u=baseline?(baseline.closed?((distance/baseline.length%1)+1)%1:distance/baseline.length):0;
          const at=baseline?baseline.curve.getPointAt(u):new THREE.Vector2(distance,0),v=baseline?baseline.curve.getTangentAt(u).multiplyScalar(text.reverse?-1:1):new THREE.Vector2(1,0);
          const offset=text.baselineOffset+lineOffset*fit+flipShift-text.connections.railOffset;
          const point=mapMatrix(text.matrix,{x:at.x-v.y*offset,z:at.y+v.x*offset});rail.push([point.x,point.z]);
        }
        rails.push(rail);
      }
    }
    const connected=connectSketchText(runtime,made,text.id,text.connections,rails);made=connected.profile;connectionParts=connected.parts;
  }
  return {profile:made,warning,bridgeUnheld,connectionParts};
}

export function regenerateSketchTexts(profile:SketchProfile,cache=profile):SketchProfile{
  if(!profile.texts?.length)return profile;
  const ownedPoints=new Set(profile.texts.flatMap(t=>t.pointIds)),ownedSegments=new Set(profile.texts.flatMap(t=>t.segmentIds));
  let result:SketchProfile={...profile,points:profile.points.filter(p=>!ownedPoints.has(p.id)),segments:profile.segments.filter(s=>!ownedSegments.has(s.id)),texts:[]};
  for(const text of profile.texts){
    const made=outlineGeometry(text,profile,cache);
    const next={...text,pointIds:made.profile.points.map(p=>p.id),segmentIds:made.profile.segments.map(s=>s.id),warning:made.warning,bridgeUnheld:made.bridgeUnheld,connectionParts:made.connectionParts};
    result.points.push(...made.profile.points);result.segments.push(...made.profile.segments);result.texts!.push(next);
  }
  const offsets = updateSketchOffsets(result);
  if(!offsets.ok)throw Error(offsets.message);
  return offsets.profile;
}
export function newSketchText(id:string,x=0,z=0):SketchText{
 return {id,content:'TEXT',font:'Sans',size:10,spacing:0,kerning:true,letterWidth:100,vertical:false,lineGap:2,align:'start',startOffset:0,baselineOffset:0,reverse:false,flip:false,upright:false,fit:false,matrix:[1,0,0,1,x,z],pointIds:[],segmentIds:[]};
}
export function convertSketchTextToOutlines(profile:SketchProfile,id:string):SketchProfile{
 return {...profile,texts:profile.texts?.filter(t=>t.id!==id)};
}

/** Infer the user's affine transform from three non-collinear owned vertices. */
function changedMatrix(before:SketchPoint[],after:Map<string,SketchPoint>):Matrix|null{
 const a=before[0];if(!a)return null;
 for(let i=1;i<before.length;i++)for(let j=i+1;j<before.length;j++){
  const b=before[i],c=before[j],det=(b.x-a.x)*(c.z-a.z)-(b.z-a.z)*(c.x-a.x);if(Math.abs(det)<1e-7)continue;
  const aa=after.get(a.id),bb=after.get(b.id),cc=after.get(c.id);if(!aa||!bb||!cc)return null;
  const inverse:Matrix=[(c.z-a.z)/det,-(b.z-a.z)/det,-(c.x-a.x)/det,(b.x-a.x)/det,0,0];
  const m=composeTextMatrix([bb.x-aa.x,bb.z-aa.z,cc.x-aa.x,cc.z-aa.z,aa.x,aa.z],composeTextMatrix(inverse,[1,0,0,1,-a.x,-a.z]));
  if(before.every(p=>{const q=after.get(p.id),r=mapMatrix(m,p);return q&&Math.hypot(q.x-r.x,q.z-r.z)<1e-4;}))return m;
  return null;
 }
 return null;
}

/** Keep live text intact through older sketch tools that operate on geometry alone. */
export function transformSketchText(text:SketchText,transform:Matrix,profile:SketchProfile):SketchText{
 const baseline=text.pathSegmentIds?.length?sketchTextBaseline(profile,text.pathSegmentIds):null;
 if(!baseline)return {...text,matrix:composeTextMatrix(transform,text.matrix)};
 const span=sketchTextPathSpan(text,baseline.length,baseline.closed);
 const distance=sketchTextPathStart(text,baseline.length,span)+span/2;
 const u=baseline.closed?((distance/baseline.length%1)+1)%1:Math.min(1,Math.max(0,distance/baseline.length));
 const v=baseline.curve.getTangentAt(u).multiplyScalar(text.reverse?-1:1);
 const at=baseline.curve.getPointAt(u),anchor=mapMatrix(text.matrix,{x:at.x,z:at.y});
 const moved=mapMatrix(transform,anchor),dx=moved.x-anchor.x,dz=moved.z-anchor.z;
 const sx=Math.hypot(transform[0],transform[1]),sz=Math.hypot(transform[2],transform[3]);
 // On-path transforms change typography and offsets rather than pulling lettering off its baseline.
 return {...text,size:Math.min(500,Math.max(.1,text.size*sz)),letterWidth:Math.min(400,Math.max(25,text.letterWidth*sx/Math.max(1e-8,sz))),
  startOffset:text.startOffset+(dx*v.x+dz*v.y)*(text.reverse?-1:1),baselineOffset:text.baselineOffset-dx*v.y+dz*v.x};
}

export function carrySketchTexts(next:SketchProfile,previous?:SketchProfile):SketchProfile{
 const texts='texts' in next?next.texts:previous?.texts;
 if(!texts?.length)return next;
 const present=new Map(next.points.map(p=>[p.id,p]));
 const carried=texts.flatMap(text=>{
  const old=previous?.texts?.find(t=>t.id===text.id);
  if(!old||JSON.stringify(old)!==JSON.stringify(text))return [text];
  const before=previous!.points.filter(p=>text.pointIds.includes(p.id));
  if(before.length&&!before.some(p=>present.has(p.id)))return [];
  const pathIds=new Set(next.segments.filter(s=>text.pathSegmentIds?.includes(s.id)).flatMap(s=>[s.startId,s.endId]));
  const pathMoved=previous!.points.some(p=>pathIds.has(p.id)&&JSON.stringify(p)!==JSON.stringify(present.get(p.id)));
  const moved=before.some(p=>{const q=present.get(p.id);return q&&Math.hypot(p.x-q.x,p.z-q.z)>1e-7;});
  const transform=moved&&!pathMoved?changedMatrix(before,present):null;
  return [transform?transformSketchText(text,transform,next):text];
 });
 return {...next,texts:carried};
}
export function withoutSketchTextGeometry(profile:SketchProfile):SketchProfile{
 const points=new Set(profile.texts?.flatMap(t=>t.pointIds)),segments=new Set(profile.texts?.flatMap(t=>t.segmentIds));
 return {...profile,points:profile.points.filter(p=>!points.has(p.id)),segments:profile.segments.filter(s=>!segments.has(s.id))};
}

/** Turning path following off keeps the straight run anchored near the same baseline. */
export function detachSketchTextPath(text:SketchText,profile:SketchProfile):SketchText{
 const baseline=text.pathSegmentIds?sketchTextBaseline(profile,text.pathSegmentIds):null;
 if(!baseline)return {...text,pathSegmentIds:undefined,warning:undefined};
 const span=sketchTextPathSpan(text,baseline.length,baseline.closed);
 const align=text.align==='center'?.5:text.align==='end'?1:0;
 const distance=sketchTextPathStart(text,baseline.length,span)+span*(text.reverse?1-align:align);
 const u=baseline.closed?((distance/baseline.length%1)+1)%1:Math.min(1,Math.max(0,distance/baseline.length));
 const at=baseline.curve.getPointAt(u),v=baseline.curve.getTangentAt(u).multiplyScalar(text.reverse?-1:1);
 return {...text,pathSegmentIds:undefined,warning:undefined,matrix:composeTextMatrix(text.matrix,[1,0,0,1,at.x-v.y*text.baselineOffset,at.y+v.x*text.baselineOffset])};
}
