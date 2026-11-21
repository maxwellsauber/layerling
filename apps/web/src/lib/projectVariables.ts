import {t} from "@/lib/i18n";
import {evaluateArithmetic} from '@/lib/measurementUnits';
import type {WorkplaneShape} from '@/types/layerling';
export type VariableExpression={expression:string;refs:Record<string,string>};
export type ProjectVariable=VariableExpression&{id:string;name:string};
export type ParameterBindings=Record<string,VariableExpression>;
export const PARAMETER_FIELDS=['width','length','height','positionX','positionY','positionZ'] as const;
export type ParameterField=typeof PARAMETER_FIELDS[number];
const reserved=new Set(['x','X','NaN','Infinity','undefined','null','true','false','constructor','prototype','__proto__']);
export function variableReferences(expression:string,variables:readonly ProjectVariable[]):VariableExpression {
 if(!expression.trim()||expression.length>80)throw Error(t("variables.invalidExpression"));
 const refs:Record<string,string>=Object.create(null);
 for(const name of expression.match(/[A-Za-z_][A-Za-z0-9_]*/g)??[]){
  const variable=variables.find(v=>v.name===name);if(!variable)throw Error(t("variables.unknown",{name}));refs[name]=variable.id;
 }
 return {expression:expression.trim(),refs};
}
export function resolveProjectVariables(variables:readonly ProjectVariable[]) {
 if(variables.length>100)throw Error(t("variables.tooMany"));
 const ids=new Set<string>(),names=new Set<string>();
 for(const v of variables){
  if(!v.id||ids.has(v.id)||!/^[A-Za-z_][A-Za-z0-9_]*$/.test(v.name)||reserved.has(v.name)||names.has(v.name))throw Error(t("variables.badName",{name:v.name}));
  ids.add(v.id);names.add(v.name);
 }
 const values=new Map<string,number>(),visiting=new Set<string>();
 const visit=(id:string):number=>{
  if(values.has(id))return values.get(id)!;
  const v=variables.find(v=>v.id===id);if(!v)throw Error(t("variables.missing"));
  if(visiting.has(id))throw Error(t("variables.cycle",{name:v.name}));
  visiting.add(id);
  const value=evaluateArithmetic(v.expression,name=>{const target=v.refs[name];if(!target)throw Error(t("variables.unknown",{name}));return visit(target);});
  if(!Number.isFinite(value))throw Error(t("variables.invalidCalculation",{name:v.name}));
  visiting.delete(id);values.set(id,value);return value;
 };
 variables.forEach(v=>visit(v.id));return values;
}
export function evaluateVariableExpression(binding:VariableExpression,values:ReadonlyMap<string,number>) {
 const value=evaluateArithmetic(binding.expression,name=>{const value=values.get(binding.refs[name]);if(value===undefined)throw Error(t("variables.unknown",{name}));return value;});
 if(!Number.isFinite(value))throw Error(t("variables.nonfinite"));return value;
}
export function renameProjectVariable(variables:ProjectVariable[],shapes:WorkplaneShape[],id:string,name:string) {
 const rewrite=(v:VariableExpression):VariableExpression=>{
  const refs:Record<string,string>={};const expression=v.expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g,token=>{const ref=v.refs[token];const next=ref===id?name:token;if(ref)refs[next]=ref;return next;});
  return {expression,refs};
 };
 const next=variables.map(v=>({...v,...rewrite(v),name:v.id===id?name:v.name}));resolveProjectVariables(next);
 const rewriteShape=(s:WorkplaneShape):WorkplaneShape=>({...s,...(s.parameterBindings?{parameterBindings:Object.fromEntries(Object.entries(s.parameterBindings).map(([field,b])=>[field,rewrite(b)]))}:{}),...(s.groupedShapes?{groupedShapes:s.groupedShapes.map(rewriteShape)}:{})});
 return {variables:next,shapes:shapes.map(rewriteShape)};
}
export function compileVariableDraft(current:readonly ProjectVariable[],draft:ProjectVariable[]) {
 const next=draft.map(v=>{
  const old=current.find(x=>x.id===v.id);
  const expression=old?.expression===v.expression?v.expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g,token=>draft.find(x=>x.id===old.refs[token])?.name??token):v.expression;
  return {...v,...variableReferences(expression,draft)};
 });
 resolveProjectVariables(next);return next;
}
export function rewriteParameterNames(shapes:WorkplaneShape[],variables:ProjectVariable[]):WorkplaneShape[]{
 const rewrite=(b:VariableExpression):VariableExpression=>{
  const refs:Record<string,string>={};
  const expression=b.expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g,token=>{const id=b.refs[token],name=variables.find(v=>v.id===id)?.name??token;if(id)refs[name]=id;return name;});
  return {...b,expression,refs};
 };
 return shapes.map(s=>({...s,...(s.parameterBindings?{parameterBindings:Object.fromEntries(Object.entries(s.parameterBindings).map(([key,b])=>[key,rewrite(b)]))}:{}),...(s.sketchProfile?.constraints?{sketchProfile:{...s.sketchProfile,constraints:s.sketchProfile.constraints.map(rule=>rule.dimensionBinding?{...rule,dimensionBinding:rewrite(rule.dimensionBinding)}:rule)}}:{}),...(s.groupedShapes?{groupedShapes:rewriteParameterNames(s.groupedShapes,variables)}:{})}));
}
export function parameterUsage(variables:readonly ProjectVariable[],shapes:readonly WorkplaneShape[],id:string):number {
 let count=variables.filter(v=>Object.values(v.refs).includes(id)).length;
 const walk=(list:readonly WorkplaneShape[])=>list.forEach(s=>{count+=Object.values(s.parameterBindings??{}).filter(b=>Object.values(b.refs).includes(id)).length;count+=(s.sketchProfile?.constraints??[]).filter(rule=>rule.dimensionBinding&&Object.values(rule.dimensionBinding.refs).includes(id)).length;if(s.groupedShapes)walk(s.groupedShapes);});walk(shapes);return count;
}
/** Controlled initial property set. Complex/generated bodies keep their existing editing rules. */
export function supportsParameters(shape:WorkplaneShape){return !shape.groupedShapes && (shape.sketchProfile ? !shape.sketchProfile.constraints?.length : ['box','cylinder','sphere','cone','wedge','roof','roundedBox'].includes(shape.kind)&&!shape.cadBrep);}
export function parameterValue(shape:WorkplaneShape,field:string){
 return field==='width'?shape.width??shape.size:field==='length'?shape.depth??shape.size:field==='height'?shape.height:field==='positionX'?shape.x:field==='positionY'?shape.z:shape.elevation??0;
}
export function validateVariableExpression(raw:unknown):asserts raw is VariableExpression {
 if(!raw||typeof raw!=='object')throw Error('Invalid variable expression.');
 const b=raw as VariableExpression;
 if(typeof b.expression!=='string'||!b.expression.trim()||b.expression.length>80||!b.refs||typeof b.refs!=='object'||Array.isArray(b.refs)||Object.keys(b.refs).length>100)throw Error('Invalid variable expression.');
 for(const [name,id] of Object.entries(b.refs))if(!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)||typeof id!=='string'||id.length>200)throw Error('Invalid variable reference.');
}
export function validateProjectVariables(raw:unknown):asserts raw is ProjectVariable[] {
 if(!Array.isArray(raw)||raw.length>100)throw Error('Invalid project variables.');
 for(const v of raw){validateVariableExpression(v);const variable=v as ProjectVariable;if(typeof variable.id!=='string'||variable.id.length>200||typeof variable.name!=='string'||variable.name.length>40)throw Error('Invalid project variable.');}
 resolveProjectVariables(raw);
}
