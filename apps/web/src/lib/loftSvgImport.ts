import { SVGLoader } from "three/examples/jsm/loaders/SVGLoader.js";
import { composeNestedRings, parseSvgForImport, svgProfilePaths } from "@/lib/svgImport";
import { MAX_LOFT_SVG_POINTS, normalizeLoftSvgProfile } from "@/lib/loftSvgGeometry";
import { t } from "@/lib/i18n";

export function loftProfileFromSvg(source: string, name: string) {
  const parsed = parseSvgForImport(source);
  const shapes = composeNestedRings(svgProfilePaths(parsed.paths).flatMap(path => SVGLoader.createShapes(path)));
  if (shapes.length !== 1 || shapes[0].holes.length) throw new Error(t("loft.svgSingleOutline"));
  // Refine where the curve bends, rather than assigning every curve sixteen
  // steps regardless of its size. Keep line corners and bound stored geometry.
  const shape = shapes[0];
  const bounds = shape.getPoints(8);
  const scale = Math.hypot(Math.max(...bounds.map(p=>p.x))-Math.min(...bounds.map(p=>p.x)), Math.max(...bounds.map(p=>p.y))-Math.min(...bounds.map(p=>p.y)));
  let points: {x:number;z:number}[] = [];
  for (let tolerance = scale * .0001; ; tolerance *= 2) {
    points = [];
    for (const curve of shape.curves) {
      const sample = (a:number,b:number,depth:number) => {
        const start=curve.getPoint(a),end=curve.getPoint(b),delta=end.clone().sub(start);
        const error=Math.max(...[.25,.5,.75].map(f=>{
          const p=curve.getPoint(a+(b-a)*f);
          const t=delta.lengthSq() ? Math.max(0,Math.min(1,p.clone().sub(start).dot(delta)/delta.lengthSq())) : 0;
          return p.distanceTo(start.clone().addScaledVector(delta,t));
        }));
        if(error>tolerance && depth<12) {const mid=(a+b)/2;sample(a,mid,depth+1);sample(mid,b,depth+1);}
        else points.push({x:start.x,z:-start.y});
      };
      sample(0,1,0);
    }
    const end=shape.curves.at(-1)?.getPoint(1);
    if(end) points.push({x:end.x,z:-end.y});
    if(points.length<=MAX_LOFT_SVG_POINTS || tolerance>=scale) break;
  }
  const profile = normalizeLoftSvgProfile({name,points});
  if (!profile) throw new Error(t("loft.svgInvalid"));
  return profile;
}
