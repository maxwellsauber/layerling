import type {WorkplaneShape} from '@/types/layerling';
import {evaluateVariableExpression,resolveProjectVariables,type ProjectVariable,type VariableExpression} from './projectVariables';
import {relationshipOnAxis,resolveObjectRelationships,sketchPosition,supportsSketchElevation,type RelationshipAxis} from './objectRelationships';
export type DependencyHealth='Healthy'|'Missing reference'|'Circular dependency'|'Invalid expression or unresolved value';
export type DependencyEntity={id:string;kind:'object'|'variable';name:string};
export type DependencyLink={id:string;source:DependencyEntity;target:DependencyEntity;property:string;expression?:string;value?:number;health:DependencyHealth;message?:string};
export function queryDependencies(shapes:readonly WorkplaneShape[],variables:readonly ProjectVariable[]){
 const objects=new Map<string,WorkplaneShape>();
 const walk=(list:readonly WorkplaneShape[])=>list.forEach(shape=>{objects.set(shape.id,shape);if(shape.groupedShapes)walk(shape.groupedShapes);});walk(shapes);
 const vars=new Map(variables.map(v=>[v.id,v]));
 const entity=(kind:'object'|'variable',id:string):DependencyEntity=>({id,kind,name:(kind==='object'?objects.get(id):vars.get(id))?.name??'Missing reference'});
 const links:DependencyLink[]=[];
 const diagnostics:Array<{target:DependencyEntity;property:string;expression:string;health:DependencyHealth;message?:string}>=[];
 const evaluate=(binding:VariableExpression)=>{
  const needed=new Set<string>();
  const visit=(id:string)=>{if(needed.has(id))return;needed.add(id);const v=vars.get(id);if(v)Object.values(v.refs).forEach(visit);};
  Object.values(binding.refs).forEach(visit);
  return evaluateVariableExpression(binding,resolveProjectVariables(variables.filter(v=>needed.has(v.id))));
 };
 const evaluatedPosition=(id:string,axis:RelationshipAxis):number=>{
  const ancestors=new Map<string,WorkplaneShape>(),needed=new Set<string>();
  const needVariable=(id:string)=>{if(needed.has(id))return;needed.add(id);Object.values(vars.get(id)?.refs??{}).forEach(needVariable);};
  const collect=(id:string)=>{
   if(ancestors.has(id))return;
   const shape=objects.get(id);if(!shape)return;
   const relation=relationshipOnAxis(shape,axis);
   // Use the modeling evaluator on this axis's actual ancestor chain, without rebuilding geometry.
   ancestors.set(id,{...shape,elevationRelationship:axis==='z'?relation:undefined,positionRelationships:axis==='z'?undefined:{[axis]:relation}});
   if(relation){Object.values(relation.offset.refs).forEach(needVariable);collect(relation.parentId);}
  };
  collect(id);
  const resolved=resolveObjectRelationships([...ancestors.values()],resolveProjectVariables(variables.filter(v=>needed.has(v.id))));
  return sketchPosition(resolved.find(shape=>shape.id===id)!,axis);
 };
 const add=(source:DependencyEntity,target:DependencyEntity,property:string,binding?:VariableExpression)=>{
  const link:DependencyLink={id:`${source.kind}:${source.id}:${target.kind}:${target.id}:${property}`,source,target,property,expression:binding?.expression,health:'Healthy'};
  if(!(source.kind==='object'?objects.has(source.id):vars.has(source.id))){link.health='Missing reference';link.message='The referenced entity no longer exists.';}
  if(binding){try{link.value=evaluate(binding);}catch(e){if(link.health==='Healthy')link.health='Invalid expression or unresolved value';link.message=e instanceof Error?e.message:String(e);}}
  links.push(link);return link;
 };
 const expressionLinks=(target:DependencyEntity,property:string,binding:VariableExpression)=>{
  const ids=[...new Set(Object.values(binding.refs))];
  if(ids.length)ids.forEach(id=>add(entity('variable',id),target,property,binding));
  else {
   try{evaluate(binding);}catch(e){diagnostics.push({target,property,expression:binding.expression,health:'Invalid expression or unresolved value',message:e instanceof Error?e.message:String(e)});}
  }
 };
 variables.forEach(v=>Object.values(v.refs).length&&expressionLinks(entity('variable',v.id),'Expression',v));
 for(const shape of objects.values()){
  const target=entity('object',shape.id);
  Object.entries(shape.parameterBindings??{}).forEach(([field,binding])=>expressionLinks(target,field,binding));
  shape.sketchProfile?.constraints?.forEach(rule=>{if(rule.dimensionBinding)expressionLinks(target,`Sketch constraint: ${rule.name??rule.kind}`,rule.dimensionBinding);});
  for(const axis of ['x','y','z'] as const){
   const relation=relationshipOnAxis(shape,axis);if(!relation)continue;
   const property=`${axis.toUpperCase()} position`;
   const link=add(entity('object',relation.parentId),target,property,relation.offset);
   if(link.health==='Healthy'){
    const parent=objects.get(relation.parentId)!;
    if(!supportsSketchElevation(shape)||!supportsSketchElevation(parent)||shape.parameterBindings?.[`position${axis.toUpperCase()}`]){link.health='Invalid expression or unresolved value';link.message='This position has incompatible drivers or geometry.';}
    else {try{link.value=evaluatedPosition(shape.id,axis);}catch(e){const message=e instanceof Error?e.message:String(e);link.health=/missing/i.test(message)?'Missing reference':/circular/i.test(message)?'Circular dependency':'Invalid expression or unresolved value';link.message=message;link.value=undefined;}if(link.health==='Healthy'&&(!Number.isFinite(link.value)||Math.abs(link.value!)>1e6)){link.health='Invalid expression or unresolved value';link.message='Linked position is outside the supported range.';}}
   }
   if(Object.values(relation.offset.refs).length)expressionLinks(target,`${axis.toUpperCase()} offset`,relation.offset);
  }
  [shape.loftBottomSvg,shape.loftTopSvg,...(shape.loftSections??[]).map(section=>section.svg)].forEach((profile,index)=>{if(profile?.sketchId)add(entity('object',profile.sketchId),target,index===0?'Loft bottom':index===1?'Loft top':`Loft section ${index-1}`);});
 }
 // Match the per-axis positional graphs: crossing X and Y links is not a cycle.
 const cyclicPosition=(id:string,axis:RelationshipAxis,seen=new Set<string>()):boolean=>{if(seen.has(id))return true;seen.add(id);const s=objects.get(id),r=s&&relationshipOnAxis(s,axis);return Boolean(r&&cyclicPosition(r.parentId,axis,seen));};
 const cyclicVariable=(id:string,path=new Set<string>()):boolean=>{if(path.has(id))return true;const next=new Set(path).add(id);return Object.values(vars.get(id)?.refs??{}).some(ref=>cyclicVariable(ref,next));};
 links.forEach(link=>{
  const axis=/^([XYZ]) position$/.exec(link.property)?.[1].toLowerCase() as RelationshipAxis|undefined;
  if(axis&&cyclicPosition(link.target.id,axis)||link.source.kind==='variable'&&cyclicVariable(link.source.id)){link.health='Circular dependency';link.message='A dependency leads back to itself.';}
 });
 return {links,diagnostics,objects,entity,inspect(kind:'object'|'variable',id:string){
  const incoming=links.filter(link=>link.target.kind===kind&&link.target.id===id);
  const outgoing=links.filter(link=>link.source.kind===kind&&link.source.id===id&&!(link.target.kind===kind&&link.target.id===id));
  const bad=[...incoming,...outgoing].find(link=>link.health!=='Healthy')??diagnostics.find(item=>item.target.kind===kind&&item.target.id===id);
  return {entity:entity(kind,id),incoming,outgoing,health:bad?.health??'Healthy' as DependencyHealth,message:bad?.message};
 }};
}
