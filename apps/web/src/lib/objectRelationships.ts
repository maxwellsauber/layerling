import {evaluateVariableExpression,validateVariableExpression,type VariableExpression} from '@/lib/projectVariables';
import {displayY,insideZ} from '@/lib/displayAxes';
import {sketchPoseOf} from '@/lib/sketchPlacement';
import type {WorkplaneShape} from '@/types/layerling';
export type ObjectElevationRelationship={parentId:string;offset:VariableExpression};
export function supportsSketchElevation(shape:WorkplaneShape){
 if(!shape.sketchProfile||shape.groupedShapes?.length||shape.sketchRevolve||(shape.sketchOperation&&shape.sketchOperation!=='extrude'))return false;
 const pose=sketchPoseOf(shape);
 return Math.abs(pose.rotationX??0)<1e-6&&Math.abs(pose.rotationZ??0)<1e-6;
}
export function sketchElevation(shape:WorkplaneShape){return sketchPoseOf(shape).elevation??0;}
export function validateElevationRelationship(raw:unknown):asserts raw is ObjectElevationRelationship{
 if(!raw||typeof raw!=='object')throw Error('Invalid sketch elevation relationship.');
 const r=raw as ObjectElevationRelationship;
 if(typeof r.parentId!=='string'||!r.parentId||r.parentId.length>200)throw Error('Invalid parent sketch ID.');
 validateVariableExpression(r.offset);
}
export type RelationshipAxis='x'|'y'|'z';
export type ObjectPositionRelationships=Partial<Record<'x'|'y',ObjectElevationRelationship>>;
export function relationshipOnAxis(shape:WorkplaneShape,axis:RelationshipAxis){return axis==='z'?shape.elevationRelationship:shape.positionRelationships?.[axis];}
export function sketchPosition(shape:WorkplaneShape,axis:RelationshipAxis){return axis==='x'?shape.x:axis==='y'?displayY(shape.z):sketchElevation(shape);}
export function validatePositionRelationships(raw:unknown):asserts raw is ObjectPositionRelationships{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid position relationships.');
 for(const [axis,relationship] of Object.entries(raw)){if(axis!=='x'&&axis!=='y')throw Error('Unsupported relationship axis.');validateElevationRelationship(relationship);}
}
/** Each axis has its own directional graph: an X link does not create a Y dependency. */
export function resolveObjectRelationships(shapes:readonly WorkplaneShape[],values:ReadonlyMap<string,number>,before?:readonly WorkplaneShape[]):WorkplaneShape[]{
 const checkGroups=(shape:WorkplaneShape)=>{for(const child of shape.groupedShapes??[]){if(child.elevationRelationship||Object.keys(child.positionRelationships??{}).length)throw Error('Detach sketch position relationships before grouping their dependents.');checkGroups(child);}};
 shapes.forEach(checkGroups);
 const byId=new Map(shapes.map(s=>[s.id,s])),old=new Map(before?.map(s=>[s.id,s]));
 const results=new Map(byId),done=new Set<string>(),visiting=new Set<string>();
 const visit=(id:string,axis:RelationshipAxis):number=>{
  const key=`${id}:${axis}`;
  if(visiting.has(key))throw Error(`Circular sketch relationship on ${axis.toUpperCase()}. Choose a parent that does not depend on this sketch on that axis.`);
  const shape=byId.get(id);if(!shape)throw Error(`Referenced sketch is missing (${id}). Detach its dependents before deleting it.`);
  if(done.has(key))return sketchPosition(results.get(id)!,axis);
  visiting.add(key);
  const relation=relationshipOnAxis(shape,axis),label=axis.toUpperCase();
  if(relation){
   validateElevationRelationship(relation);
   if(!supportsSketchElevation(shape))throw Error(`${shape.name}: position relationships need a flat extruded sketch.`);
   if(shape.parameterBindings?.[`position${label}`])throw Error(`${shape.name}: ${label} already has a variable driver. Detach one driver first.`);
   const parentPosition=visit(relation.parentId,axis),parent=byId.get(relation.parentId)!;
   if(!supportsSketchElevation(parent))throw Error(`${parent.name}: the parent must be a flat extruded sketch.`);
   const target=parentPosition+evaluateVariableExpression(relation.offset,values);
   if(!Number.isFinite(target)||Math.abs(target)>1e6)throw Error(`${shape.name}: linked sketch position is outside the supported range.`);
   const current=results.get(id)!,delta=target-sketchPosition(current,axis);
   if(Math.abs(delta)>1e-7){
    if(shape.locked||shape.shapeLocked)throw Error(`${shape.name} is locked. Unlock it before moving its parent.`);
    const previous=old.get(id);
    if(previous&&JSON.stringify(relationshipOnAxis(previous,axis))===JSON.stringify(relation)&&Math.abs(sketchPosition(previous,axis)-sketchPosition(shape,axis))>1e-7&&previous.height===shape.height&&previous.width===shape.width&&previous.depth===shape.depth)
     throw Error(`${shape.name}: ${label} is driven by its parent sketch. Detach the relationship before moving it independently.`);
    results.set(id,axis==='x'?{...current,x:target}:axis==='y'?{...current,z:insideZ(target)}:{...current,elevation:(current.elevation??0)+delta});
   }
  }
  visiting.delete(key);done.add(key);return sketchPosition(results.get(id)!,axis);
 };
 for(const shape of shapes)for(const axis of ['x','y','z'] as const)visit(shape.id,axis);
 return shapes.map(s=>results.get(s.id)!);
}

/** Project a direct move onto the free axes; parent propagation is handled by the scene resolver. */
export function independentPositionPatch(shape:WorkplaneShape,patch:Partial<WorkplaneShape>):Partial<WorkplaneShape>{
 const free={...patch};
 if(relationshipOnAxis(shape,'x'))delete free.x;
 if(relationshipOnAxis(shape,'y'))delete free.z;
 if(relationshipOnAxis(shape,'z'))delete free.elevation;
 return free;
}
