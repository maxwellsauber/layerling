import type {SketchProfile} from '@/types/layerling';
import {variableReferences,resolveProjectVariables,type ProjectVariable,evaluateVariableExpression} from '@/lib/projectVariables';
import {applySketchConstraints,sketchConstraintValueError} from '@/lib/sketchConstraints';
import {t} from '@/lib/i18n';

/** Resolve all dimensions first, then solve once; failure leaves the input intact. */
export function resolveSketchVariableBindings(profile:SketchProfile,values:ReadonlyMap<string,number>):SketchProfile {
 let changed=false;
 const constraints=profile.constraints?.map(rule=>{
  if(!rule.dimensionBinding)return rule;
  const value=evaluateVariableExpression(rule.dimensionBinding,values);
  const error=sketchConstraintValueError(rule,value);if(error)throw Error(error);
  if('value' in rule){if(rule.value===value)return rule;changed=true;return {...rule,value};}
  if(rule.kind==='concentric'){
   const radialGap=(rule.radialGap??0)<0?-value:value;
   if(rule.radialGap===radialGap)return rule;changed=true;return {...rule,radialGap};
  }
  throw Error(t('variables.unsupported'));
 });
 if(!changed)return profile;
 const solved=applySketchConstraints({...profile,constraints});
 if(!solved.ok)throw Error(t('status.sketchConstraintConflict'));
 return solved.profile;
}

/** Literal measurements retain their unit/fraction parser; named expressions share the project graph. */
export function parseSketchDimension(text:string,variables:readonly ProjectVariable[],literal:(text:string)=>number){
 try{
  const numeric=literal(text);
  if(Number.isFinite(numeric))return {value:numeric,binding:undefined,error:undefined};
  const binding=variableReferences(text,variables);
  return {value:evaluateVariableExpression(binding,resolveProjectVariables(variables)),binding,error:undefined};
 }catch(error){return {value:NaN,binding:undefined,error:error instanceof Error?error.message:String(error)};}
}
