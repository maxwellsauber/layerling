import {expect,it} from 'vitest';
import {queryDependencies} from '@/lib/dependencyQuery';
import {compileVariableDraft,variableReferences} from '@/lib/projectVariables';
import type {WorkplaneShape} from '@/types/layerling';
const variables=compileVariableDraft([],[{id:'h',name:'height',expression:'30',refs:{}}]);
const shape=(id:string):WorkplaneShape=>({id,name:id,kind:'mesh',x:0,z:0,size:20,width:20,depth:20,height:10,rotation:0,color:'#f00',sketchProfile:{points:[],segments:[]}});
it('discovers direct variable, constraint and positional drivers with correct direction and values',()=>{
 const a=shape('a'),b={...shape('b'),parameterBindings:{height:variableReferences('height',variables)},elevationRelationship:{parentId:'a',offset:variableReferences('height + 5',variables)}};
 const query=queryDependencies([a,b],variables),inspected=query.inspect('object','b');
 expect(inspected.incoming.map(link=>link.property)).toEqual(['height','Z position','Z offset']);
 expect(inspected.incoming[0].value).toBe(30);expect(inspected.incoming[1].value).toBe(35);
 expect(inspected.outgoing).toHaveLength(0);
 expect(query.inspect('object','a').outgoing).toHaveLength(1);
 expect(query.inspect('variable','h').outgoing).toHaveLength(2);
 expect(inspected.health).toBe('Healthy');
 const constrained={...a,sketchProfile:{points:[],segments:[],constraints:[{id:'c',kind:'radius' as const,a:'p',value:30,dimensionBinding:variableReferences('height',variables)}]}};
 expect(queryDependencies([constrained],variables).inspect('object','a').incoming[0].property).toContain('Sketch constraint');
});
it('detects missing references, invalid expressions and per-axis cycles without false cross-axis cycles',()=>{
 const offset=variableReferences('0',variables),a=shape('a'),b=shape('b');
 expect(queryDependencies([{...b,elevationRelationship:{parentId:'gone',offset}}],variables).inspect('object','b').health).toBe('Missing reference');
 const c={...shape('c'),elevationRelationship:{parentId:'b',offset}};
 expect(queryDependencies([{...b,elevationRelationship:{parentId:'gone',offset}},c],variables).inspect('object','c').health).toBe('Missing reference');
 expect(queryDependencies([{...a,parameterBindings:{height:{expression:'3 + 4',refs:{}}}}],variables).links).toHaveLength(0);
 expect(queryDependencies([{...b,parameterBindings:{height:{expression:'1 / 0',refs:{}}}}],variables).inspect('object','b').health).toBe('Invalid expression or unresolved value');
 const linkedA={...a,positionRelationships:{x:{parentId:'b',offset}}},linkedB={...b,positionRelationships:{x:{parentId:'a',offset}}};
 expect(queryDependencies([linkedA,linkedB],variables).inspect('object','b').health).toBe('Circular dependency');
 expect(queryDependencies([linkedA,{...b,positionRelationships:{y:{parentId:'a',offset}}}],variables).inspect('object','b').health).toBe('Healthy');
});
it('finds loft references and nested objects, and only lists immediate dependents',()=>{
 const a=shape('a'),b={...shape('b'),elevationRelationship:{parentId:'a',offset:variableReferences('5',variables)}},c={...shape('c'),elevationRelationship:{parentId:'b',offset:variableReferences('5',variables)}};
 const loft={...shape('loft'),kind:'loft' as const,loftTopSvg:{name:'a',points:[],sketchId:'a'}};
 const query=queryDependencies([a,b,c,loft],variables);
 expect(query.inspect('object','a').outgoing.map(link=>link.target.id)).toEqual(['b','loft']);
 expect(queryDependencies([{...shape('group'),groupedShapes:[a]}],variables).objects.has('a')).toBe(true);
 expect(query.inspect('object','c').outgoing).toHaveLength(0);
});
it('reports variable cycles and does not let unrelated invalid variables poison valid relationships',()=>{
 const cycle=[{id:'v',name:'loop',expression:'loop',refs:{loop:'v'}}];
 const obj={...shape('a'),parameterBindings:{height:{expression:'loop',refs:{loop:'v'}}}};
 expect(queryDependencies([obj],cycle).inspect('object','a').health).toBe('Circular dependency');
 const valid={...obj,parameterBindings:{height:variableReferences('height',variables)}};
 expect(queryDependencies([valid],[...variables,...cycle]).inspect('object','a').health).toBe('Healthy');
});
