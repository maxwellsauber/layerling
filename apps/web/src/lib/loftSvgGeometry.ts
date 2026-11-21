import { offsetPathCrosses } from "@/lib/sketchCurveOffsets";
import type { LoftSvgProfile } from "@/types/layerling";

export const MAX_LOFT_SVG_POINTS = 512;
type Point = { x: number; z: number };

/** Stored coordinates are normalized to a unit bounding box, never raw SVG markup. */
export function normalizeLoftSvgProfile(raw: unknown): LoftSvgProfile | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const value = raw as LoftSvgProfile;
  if (!Array.isArray(value.points) || value.points.length < 3 || value.points.length > MAX_LOFT_SVG_POINTS) return undefined;
  if (value.points.some(p => !p || !Number.isFinite(p.x) || !Number.isFinite(p.z) || Math.abs(p.x) > 1e6 || Math.abs(p.z) > 1e6)) return undefined;
  let points = value.points.map(p => ({ x: p.x, z: p.z }));
  points = points.filter((p, i) => Math.hypot(p.x - points[(i + points.length - 1) % points.length].x, p.z - points[(i + points.length - 1) % points.length].z) > 1e-8);
  if (points.length < 3 || offsetPathCrosses(points, true)) return undefined;
  const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
  const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
  if (maxX - minX < 1e-8 || maxZ - minZ < 1e-8) return undefined;
  const area = points.reduce((sum,p,i) => { const q=points[(i+1)%points.length]; return sum+p.x*q.z-q.x*p.z; },0);
  if (Math.abs(area) < 1e-10) return undefined;
  if (area < 0) points.reverse();
  points = points.map(p => ({ x: (p.x-(minX+maxX)/2)/(maxX-minX), z: (p.z-(minZ+maxZ)/2)/(maxZ-minZ) }));
  // Sub-resolution SVG edges make nearly coincident loft wires in the exact kernel.
  // Remove only a vertex on an edge shorter than 0.01% of the profile frame, within that same tolerance.
  for(let pass=0;pass<value.points.length && points.length>3;pass++) {
    const remove=points.findIndex((p,i)=>{
      const before=points[(i+points.length-1)%points.length],after=points[(i+1)%points.length];
      if(Math.min(Math.hypot(p.x-before.x,p.z-before.z),Math.hypot(p.x-after.x,p.z-after.z))>=1e-4) return false;
      const dx=after.x-before.x,dz=after.z-before.z,len=Math.hypot(dx,dz);
      return len>1e-8 && Math.abs(dx*(p.z-before.z)-dz*(p.x-before.x))/len<1e-4;
    });
    if(remove<0) break;
    points.splice(remove,1);
  }
  // A stable rightmost seam, nearest the horizontal centre, for both ends.
  let first=0;
  points.forEach((p,i) => { const q=points[first]; if(p.x>q.x+1e-8 || (Math.abs(p.x-q.x)<1e-8 && Math.abs(p.z)<Math.abs(q.z))) first=i; });
  return { name: typeof value.name === "string" ? value.name.slice(0,160) : "SVG", points:[...points.slice(first),...points.slice(0,first)], ...(typeof value.sketchId === "string" && value.sketchId.length <= 200 ? {sketchId:value.sketchId} : {}) };
}

export function loftSvgPoints(svg: LoftSvgProfile, width: number, depth: number): Point[] {
  return svg.points.map(p => ({ x:p.x*width, z:p.z*depth }));
}

/** Miter inset with short-edge removal. SVG tessellation edges may disappear without splitting the opening. */
export function insetLoftSvg(points: Point[], wall: number): Point[] {
  if (wall <= 1e-8) return points.map(p=>({...p}));
  const failure = () => new Error("This wall closes or splits an SVG opening. Use a smaller wall thickness.");
  const cross=(a:Point,b:Point)=>a.x*b.z-a.z*b.x;
  const sub=(a:Point,b:Point)=>({x:a.x-b.x,z:a.z-b.z});
  // Each line stays at exactly wall mm from its original edge, even after an adjacent short edge disappears.
  const edges = points.map((p,i)=>{
    const delta=sub(points[(i+1)%points.length],p), length=Math.hypot(delta.x,delta.z);
    const direction={x:delta.x/length,z:delta.z/length};
    return { p:{x:p.x-direction.z*wall,z:p.z+direction.x*wall}, direction };
  });
  while(edges.length>=3) {
    const corners=edges.map((edge,i)=>{
      const before=edges[(i+edges.length-1)%edges.length];
      const turn=cross(before.direction,edge.direction);
      if(Math.abs(turn)<1e-10) return {...edge.p};
      const t=cross(sub(edge.p,before.p),edge.direction)/turn;
      return {x:before.p.x+t*before.direction.x,z:before.p.z+t*before.direction.z};
    });
    let remove=-1, shortest=1e-7;
    edges.forEach((edge,i)=>{
      const delta=sub(corners[(i+1)%corners.length],corners[i]);
      const length=delta.x*edge.direction.x+delta.z*edge.direction.z;
      if(length<shortest) {shortest=length;remove=i;}
    });
    if(remove>=0) {edges.splice(remove,1);continue;}
    const area=corners.reduce((sum,p,i)=>sum+cross(p,corners[(i+1)%corners.length]),0)/2;
    if(!Number.isFinite(area) || area<1e-6 || offsetPathCrosses(corners,true)) throw failure();
    // Reject a reversed or escaped inset (for example beyond a rectangle's inradius).
    const inside=(p:Point)=>{
      let odd=false;
      for(let i=0,j=points.length-1;i<points.length;j=i++) {
        const a=points[i],b=points[j];
        if((a.z>p.z)!==(b.z>p.z) && p.x<(b.x-a.x)*(p.z-a.z)/(b.z-a.z)+a.x) odd=!odd;
      }
      return odd;
    };
    if(corners.some(p=>!inside(p))) throw failure();
    return corners;
  }
  throw failure();
}
