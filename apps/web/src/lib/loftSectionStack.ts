import { loftMiddlesWithCount, type LoftMeasures, type LoftMiddle } from "@/lib/loftGeometry";

/** Ascending height order. Reordering moves profiles between the existing height slots. */
export function loftStackSections(m: LoftMeasures): LoftMiddle[] {
  return [
    {at:0,outline:m.bottomOutline,svg:m.bottomSvg,width:m.bottomWidth,depth:m.bottomDepth,corner:m.bottomCorner,sides:m.bottomSides,offsetX:0,offsetZ:0},
    ...m.middles,
    {at:1,outline:m.topOutline,svg:m.topSvg,width:m.topWidth,depth:m.topDepth,corner:m.topCorner,sides:m.topSides,offsetX:m.offsetX,offsetZ:m.offsetZ},
  ];
}

export function reorderLoftSections(m: LoftMeasures, from: number, to: number): Partial<LoftMeasures> {
  const sections=loftStackSections(m), slots=sections.map(s=>s.at);
  if(!Number.isInteger(from)||!Number.isInteger(to)||from<0||to<0||from>=sections.length||to>=sections.length||from===to) return {};
  const [moved]=sections.splice(from,1);sections.splice(to,0,moved);
  const bottom=sections[0],top=sections[sections.length-1];
  // The new bottom is the anchor. Preserve all lateral distances between profiles.
  const place=(s:LoftMiddle,at:number)=>({...s,at,offsetX:s.offsetX-bottom.offsetX,offsetZ:s.offsetZ-bottom.offsetZ});
  return {
    bottomOutline:bottom.outline,bottomSvg:bottom.svg,bottomWidth:bottom.width,bottomDepth:bottom.depth,bottomCorner:bottom.corner,bottomSides:bottom.sides,
    topOutline:top.outline,topSvg:top.svg,topWidth:top.width,topDepth:top.depth,topCorner:top.corner,topSides:top.sides,
    offsetX:top.offsetX-bottom.offsetX,offsetZ:top.offsetZ-bottom.offsetZ,
    middles:sections.slice(1,-1).map((s,i)=>place(s,slots[i+1])),
  };
}

export function addLoftSection(m: LoftMeasures) {
  const middles=loftMiddlesWithCount(m,m.middles.length+1);
  const added=middles.find(s=>!m.middles.some(old=>Math.abs(old.at-s.at)<1e-9));
  if(added) { added.outline="polygon";added.svg=undefined;added.sides=6;added.corner=0; }
  return {middles,added};
}
