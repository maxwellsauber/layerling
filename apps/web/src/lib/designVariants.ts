import {compileVariableDraft,type ProjectVariable} from '@/lib/projectVariables';
export type DesignVariant={id:string;name:string;variables:ProjectVariable[]};
export function variantDraft(current:ProjectVariable[],variant:DesignVariant):ProjectVariable[]{
 const names=new Map(current.map(v=>[v.id,v.name]));
 if(variant.variables.some(v=>!names.has(v.id)))throw Error('A variable saved in this variant was deleted. Save a new variant.');
 const draft=current.map(v=>{
  const saved=variant.variables.find(item=>item.id===v.id);if(!saved)return v;
  const expression=saved.expression.replace(/[A-Za-z_][A-Za-z0-9_]*/g,token=>{
   const id=saved.refs[token];if(!id)return token;
   const name=names.get(id);if(!name)throw Error('A variable used by this variant was deleted.');return name;
  });
  return {...v,expression};
 });
 return compileVariableDraft(current,draft);
}
