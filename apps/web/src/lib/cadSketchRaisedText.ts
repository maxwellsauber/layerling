import type {OcctKernel,ShapeHandle} from 'occt-wasm';
import {cadSketchRegions} from '@/lib/sketchCadProfile';
import {pathWire} from '@/lib/sketchCadWire';
import type {SketchTextStack} from '@/lib/sketchRaisedText';
import type {SketchProfile} from '@/types/layerling';
function solids(cad:OcctKernel,profile:SketchProfile,height:number):ShapeHandle[]{
 return cadSketchRegions(profile).map(region=>{
  let face=cad.makeFace(pathWire(cad,region.outer));
  if(region.holes.length)face=cad.addHolesInFace(face,region.holes.map(hole=>pathWire(cad,hole)));
  return cad.extrude(face,0,height,0);
 });
}
export function buildRaisedSketchTextSolid(cad:OcctKernel,profile:SketchProfile,height:number,stacks:SketchTextStack[]):ShapeHandle{
 const result=solids(cad,profile,height);
 for(const stack of stacks){
  const backing=solids(cad,stack.backer,stack.backerHeight);
  if(!backing.length)throw Error('Raised lettering needs a closed backer');
  let body=backing[0];for(const part of backing.slice(1))body=cad.fuse(body,part);
  const letters=solids(cad,stack.letters,stack.letterHeight);
  if(!letters.length)throw Error('Raised lettering has no printable letters');
  for(const letter of letters)body=cad.fuse(body,cad.translate(letter,0,stack.backerHeight,0));
  if(!cad.isValid(body))throw Error('Raised lettering produced invalid topology');
  result.push(body);
 }
 if(!result.length)throw Error('No closed profile found');
 return result.length===1?result[0]:cad.makeCompound(result);
}
