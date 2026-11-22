import {expect,it} from 'vitest';
import {variantDraft,type DesignVariant} from '@/lib/designVariants';
import {compileVariableDraft,resolveProjectVariables} from '@/lib/projectVariables';
const saved=compileVariableDraft([],[{id:'w',name:'wall',expression:'3',refs:{}},{id:'d',name:'double',expression:'wall * 2',refs:{}}]);
const variant:DesignVariant={id:'small',name:'Small',variables:saved};
it('restores values and formulas by stable ID, preserving renamed and newly added variables',()=>{
 const current=compileVariableDraft(saved,[{...saved[0],name:'thickness',expression:'8'},saved[1],{id:'new',name:'extra',expression:'20',refs:{}}]);
 const next=variantDraft(current,variant);
 expect(next[0].name).toBe('thickness');expect(next[1].expression).toBe('thickness * 2');
 expect(resolveProjectVariables(next).get('d')).toBe(6);expect(next[2]).toEqual(current[2]);
 expect(current[0].expression).toBe('8');
});
it('rejects deleted variables without changing the current list',()=>{
 expect(()=>variantDraft([saved[0]],variant)).toThrow(/deleted/);
 expect(saved[0].expression).toBe('3');
});
