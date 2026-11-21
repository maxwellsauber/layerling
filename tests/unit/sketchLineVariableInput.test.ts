// @vitest-environment jsdom
import {act,createElement,type ComponentProps} from 'react';
import {createRoot} from 'react-dom/client';
import {expect,it,vi} from 'vitest';
import {SketchWorkspace} from '@/components/SketchWorkspace';
import {ProjectVariablesContext} from '@/components/workplane/ProjectVariablesContext';
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
it('assigns variables from the on-canvas line pill, displays bindings, and rejects unknown names',()=>{
 const noop=()=>{};
    const props: ComponentProps<typeof SketchWorkspace> = {
      profile: {
        points: [{ id: "a", x: 0, z: 0 }, { id: "b", x: 30, z: 0 },
          { id: "c", x: 30, z: 20 }, { id: "d", x: 0, z: 20 }],
        segments: [
          { id: "ab", startId: "a", endId: "b" }, { id: "bc", startId: "b", endId: "c" },
          { id: "cd", startId: "c", endId: "d" }, { id: "da", startId: "d", endId: "a" },
        ],
        constraints: [],
      },
      referenceShapes: [], tool: "select", activePointId: null,
      selected: {kind:"segment",id:"ab"},
      measurement: null, pendingMeasurementStart: null,
      onPlanePoint: noop, onAddPrimitive: noop, onPointPress: noop,
      onSelectSegment: noop, onSelectMany: noop, onToggleSelect: noop,
      onSelectImage: noop, onUpdateImage: noop, onDeleteImage: noop,
      onDeletePoint: noop, onDeleteSegment: noop, onMovePoint: noop,
      onTransformPoints: noop, onMoveHandle: noop, onInsertPoint: noop,
      onSetPointMode: noop, onClearMeasurement: noop, onMeasureTool: noop,
      onAddConstraint: noop,
    };

 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 Object.defineProperties(SVGSVGElement.prototype,{
  getScreenCTM:{configurable:true,value:()=>({a:1,b:0,c:0,d:1,inverse(){return this;}})},
  createSVGPoint:{configurable:true,value:()=>({x:0,y:0,matrixTransform(){return {x:this.x,y:this.y};}})},
 });
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 const add=vi.fn(()=>true);props.onAddConstraint=add;
 const render=()=>act(()=>root.render(createElement(ProjectVariablesContext.Provider,{value:{variables:[{id:'w',name:'wall',expression:'80',refs:{}}]}},createElement(SketchWorkspace,props))));
 const enter=(text:string)=>{
  const input=host.querySelector<HTMLInputElement>('.sketch-dimension-input')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,text);input.dispatchEvent(new Event('input',{bubbles:true}));});
  act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));
 };
 try{
  render();
  act(()=>host.querySelector('.sketch-dimension-pill.clickable')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  enter('wall');
  expect(add).toHaveBeenCalledWith({kind:'distance',a:'a',b:'b',value:80,dimensionBinding:{expression:'wall',refs:{wall:'w'}}});
  props.profile={...props.profile,constraints:[{...add.mock.calls[0][0],id:'length'}]};render();
  expect(host.querySelector('.sketch-dimension-pill.clickable')?.textContent).toContain('ƒ wall');
  act(()=>host.querySelector('.sketch-dimension-pill.clickable')!.dispatchEvent(new MouseEvent('click',{bubbles:true})));
  expect(host.querySelector<HTMLInputElement>('.sketch-dimension-input')?.value).toBe('wall');
  add.mockClear();enter('unknown');expect(add).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toContain('unknown');
 }finally{
  act(()=>root.unmount());host.remove();vi.unstubAllGlobals();
  for(const name of ['getScreenCTM','createSVGPoint'])Reflect.deleteProperty(SVGSVGElement.prototype,name);
 }
});
