import type {CrossSection,ManifoldToplevel} from 'manifold-3d';
import {orderedCadSketchPaths} from '@/lib/sketchCadProfile';
import {sampledPath,strokedSketchProfile} from '@/lib/sketchStroke';
import type {SketchProfile} from '@/types/layerling';
export type TextConnections={mode:'join'|'rail'|'backer';width:number;padding:number;railOffset:number};
type P=[number,number];
const area=(p:P[])=>p.reduce((sum,a,i)=>{const b=p[(i+1)%p.length];return sum+a[0]*b[1]-b[0]*a[1];},0)/2;
function closest(a:P[],b:P[]):[P,P]{
 let best=Infinity,result:[P,P]=[a[0],b[0]];
 const test=(points:P[],edges:P[],swap:boolean)=>{for(const p of points)for(let i=0;i<edges.length;i++){
  const x=edges[i],y=edges[(i+1)%edges.length],dx=y[0]-x[0],dy=y[1]-x[1],length=dx*dx+dy*dy;
  const t=length?Math.max(0,Math.min(1,((p[0]-x[0])*dx+(p[1]-x[1])*dy)/length)):0;
  const q:P=[x[0]+dx*t,x[1]+dy*t],distance=(p[0]-q[0])**2+(p[1]-q[1])**2;
  if(distance<best){best=distance;result=swap?[q,p]:[p,q];}
 }};test(a,b,false);test(b,a,true);return result;
}
function connector(a:P,b:P,width:number):P[]{
 const length=Math.hypot(b[0]-a[0],b[1]-a[1]),dx=length?(b[0]-a[0])/length:1,dy=length?(b[1]-a[1])/length:0;
 // Positive overlap makes a volume connection rather than touching at an edge.
 const overlap=width/2,x=a[0]-dx*overlap,y=a[1]-dy*overlap,u=b[0]+dx*overlap,v=b[1]+dy*overlap,h=width/2;
 return [[x-dy*h,y+dx*h],[x+dy*h,y-dx*h],[u+dy*h,v-dx*h],[u-dy*h,v+dx*h]];
}
/** Join actual disjoint regions, including dots/accents and spaces, and verify the union. */
export function connectSketchText(runtime:ManifoldToplevel,profile:SketchProfile,id:string,settings:TextConnections,rails:P[][]=[]):{profile:SketchProfile;parts:number}{
 const made:CrossSection[]=[];const keep=(s:CrossSection)=>{made.push(s);return s;};
 try{
  const loops=orderedCadSketchPaths(profile).filter(p=>p.closed).map(p=>sampledPath(p).map(v=>[v.x,v.z] as P));
  if(!loops.length)return {profile,parts:0};
  let base=keep(new runtime.CrossSection(loops,'EvenOdd'));
  if(settings.mode==='backer'){
   const widened=keep(base.offset(settings.padding,'Round',2,32));
   base=keep(new runtime.CrossSection(widened.toPolygons().filter(loop=>area(loop)>0),'NonZero'));
  }
  if(settings.mode==='rail'){
   const points:SketchProfile['points']=[],segments:SketchProfile['segments']=[];
   rails.forEach((rail,row)=>rail.forEach(([x,z],i)=>{const point=`rail-${row}-${i}`;points.push({id:point,x,z});if(i)segments.push({id:`rail-s${row}-${i}`,startId:`rail-${row}-${i-1}`,endId:point,kind:'line'});}));
   const rail=strokedSketchProfile(runtime,{points,segments,stroke:{width:settings.width,align:'center',join:'round',cap:'round'}});
   if(rail){const polygons=orderedCadSketchPaths(rail).filter(p=>p.closed).map(p=>sampledPath(p).map(v=>[v.x,v.z] as P));base=keep(runtime.CrossSection.union([base,keep(new runtime.CrossSection(polygons,'EvenOdd'))]));}
  }
  const pieces=base.decompose().map(keep);
  // Prim-style nearest bounds search: quadratic scalar work, only n-1 detailed contour comparisons.
  const contours=pieces.map(piece=>piece.toPolygons().filter(loop=>area(loop)>0).flat());
  const boxes=pieces.map(piece=>piece.bounds()),joined=new Set<number>([0]),distance=pieces.map(()=>Infinity),from=pieces.map(()=>0),bars:CrossSection[]=[];
  const gap=(i:number,j:number)=>{const a=boxes[i],b=boxes[j],dx=Math.max(0,a.min[0]-b.max[0],b.min[0]-a.max[0]),dy=Math.max(0,a.min[1]-b.max[1],b.min[1]-a.max[1]);return dx*dx+dy*dy;};
  let last=0;
  while(joined.size<pieces.length){
   for(let i=0;i<pieces.length;i++)if(!joined.has(i)){const d=gap(last,i);if(d<distance[i]){distance[i]=d;from[i]=last;}}
   let next=-1;for(let i=0;i<pieces.length;i++)if(!joined.has(i)&&(next<0||distance[i]<distance[next]))next=i;
   if(next<0)break;
   const [a,b]=closest(contours[from[next]],contours[next]);bars.push(keep(new runtime.CrossSection([connector(a,b,settings.width)],'NonZero')));
   joined.add(next);last=next;
  }
  const union=bars.length?keep(runtime.CrossSection.union([base,...bars])):base;
  const result=keep(union.simplify(1e-5));
  const components=result.decompose().map(keep),points:SketchProfile['points']=[],segments:SketchProfile['segments']=[];
  for(const polygon of result.toPolygons()){
   const ids=polygon.map((_,i)=>`${id}:p${points.length+i}`);polygon.forEach(([x,z],i)=>points.push({id:ids[i],x,z}));
   ids.forEach((point,i)=>segments.push({id:`${id}:s${segments.length}`,startId:point,endId:ids[(i+1)%ids.length],kind:'line'}));
  }
  return {profile:{points,segments},parts:components.length};
 }finally{new Set(made).forEach(s=>s.delete());}
}
