import * as THREE from "three";
import { sketchPoseOf, sketchToWorldMatrix } from "@/lib/sketchPlacement";
import type { CadModifierEdge } from "@/lib/cadModifierTypes";
import type { WorkplaneShape } from "@/types/layerling";

/** Carry old edge samples with the sketch's stable point IDs, rather than its changing bounding box. */
export function sketchMappedEdges(edges: readonly CadModifierEdge[], before: WorkplaneShape, after: WorkplaneShape): CadModifierEdge[] | null {
  if (!before.sketchProfile || !after.sketchProfile ||
      (before.sketchOperation && before.sketchOperation !== "extrude")) return null;
  const nextPoints = new Map(after.sketchProfile.points.map(point => [point.id, point]));
  const pairs = before.sketchProfile.points.flatMap(old => {
    const next = nextPoints.get(old.id);
    return next ? [{old, next}] : [];
  });
  if (pairs.length < 3) return null;
  const oldPose = sketchPoseOf(before), newPose = sketchPoseOf(after);
  const inverse = sketchToWorldMatrix(oldPose).invert();
  const forward = sketchToWorldMatrix(newPose);
  const oldPoints = new Map(before.sketchProfile.points.map(point=>[point.id,point]));
  const boundaries = before.sketchProfile.segments.flatMap(segment=>{
    if(segment.kind && segment.kind!=="line")return [];
    const a=oldPoints.get(segment.startId),b=oldPoints.get(segment.endId),c=nextPoints.get(segment.startId),d=nextPoints.get(segment.endId);
    if(!a||!b||!c||!d)return [];
    const length=Math.hypot(b.x-a.x,b.z-a.z),fresh=Math.hypot(d.x-c.x,d.z-c.z);
    return length>1e-8&&fresh>1e-8?[{a,b,c,d,length,fresh}]:[];
  });
  const map = (x:number, z:number) => {
    // Shell offsets are millimetres, not a fraction of the changing outline. Carry each
    // wall with its source edge, and intersect offset lines again at inner corners.
    const walls=boundaries.map(edge=>{
      const tx=(edge.b.x-edge.a.x)/edge.length,tz=(edge.b.z-edge.a.z)/edge.length;
      const t=((x-edge.a.x)*tx+(z-edge.a.z)*tz)/edge.length;
      const offset=-(x-edge.a.x)*tz+(z-edge.a.z)*tx;
      const u=Math.max(0,Math.min(1,t));
      const distance=Math.hypot(x-edge.a.x-u*(edge.b.x-edge.a.x),z-edge.a.z-u*(edge.b.z-edge.a.z));
      const nx=-(edge.d.z-edge.c.z)/edge.fresh,nz=(edge.d.x-edge.c.x)/edge.fresh;
      return {...edge,t,offset,distance,nx,nz};
    }).sort((a,b)=>a.distance-b.distance);
    const first=walls[0],second=walls[1];
    if(first){
      if(second&&second.distance<=first.distance*1.05+1e-6){
        const det=first.nx*second.nz-second.nx*first.nz;
        if(Math.abs(det)>1e-6){
          const a=first.offset+first.nx*first.c.x+first.nz*first.c.z;
          const b=second.offset+second.nx*second.c.x+second.nz*second.c.z;
          return {x:(a*second.nz-b*first.nz)/det,z:(first.nx*b-second.nx*a)/det};
        }
      }
      return {x:first.c.x+first.t*(first.d.x-first.c.x)+first.offset*first.nx,
        z:first.c.z+first.t*(first.d.z-first.c.z)+first.offset*first.nz};
    }

    const near = pairs.map(pair => ({...pair,distance:Math.hypot(x-pair.old.x,z-pair.old.z)}))
      .sort((a,b)=>a.distance-b.distance).slice(0,6);
    let best: {x:number;z:number;outside:number} | undefined;
    for(let i=0;i<near.length;i++)for(let j=i+1;j<near.length;j++)for(let k=j+1;k<near.length;k++){
      const a=near[i],b=near[j],c=near[k];
      const det=(b.old.z-c.old.z)*(a.old.x-c.old.x)+(c.old.x-b.old.x)*(a.old.z-c.old.z);
      if(Math.abs(det)<1e-8)continue;
      const u=((b.old.z-c.old.z)*(x-c.old.x)+(c.old.x-b.old.x)*(z-c.old.z))/det;
      const v=((c.old.z-a.old.z)*(x-c.old.x)+(a.old.x-c.old.x)*(z-c.old.z))/det,w=1-u-v;
      const outside=Math.max(0,-u)+Math.max(0,-v)+Math.max(0,-w);
      if(!best||outside<best.outside)best={x:u*a.next.x+v*b.next.x+w*c.next.x,z:u*a.next.z+v*b.next.z+w*c.next.z,outside};
    }
    return best;
  };
  let valid=true;
  const result=edges.map(edge=>({...edge,points:edge.points.map((_,i)=>i).filter(i=>i%3===0).flatMap(i=>{
    const p=new THREE.Vector3(edge.points[i],edge.points[i+1],edge.points[i+2]).applyMatrix4(inverse);
    const mapped=map(p.x,p.z);
    if(!mapped){valid=false;return [0,0,0];}
    return new THREE.Vector3(mapped.x,p.y*newPose.height/Math.max(oldPose.height,1e-8),mapped.z).applyMatrix4(forward).toArray();
  })}));
  return valid?result:null;
}
