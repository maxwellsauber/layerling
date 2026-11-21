// @vitest-environment jsdom
import { act,createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect,it,vi } from "vitest";
import { LoftSectionStack } from "@/components/workplane/LoftSectionStack";
it("drags a layer with its grip, submits one move, and leaves the model untouched while hovering",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const host=document.createElement("div");document.body.append(host);const root=createRoot(host),move=vi.fn(()=>true);
 const rows=[{id:"top",title:"Top",summary:"circle",properties:[],removable:false},{id:"middle-0",title:"Section 1",summary:"polygon",properties:[],removable:true},{id:"bottom",title:"Bottom",summary:"SVG",properties:[],removable:false}];
 const dispatch=(target:Element,name:string,x:number,y:number)=>{const event=new MouseEvent(name,{bubbles:true,cancelable:true,button:0,clientX:x,clientY:y});Object.defineProperty(event,"pointerId",{value:1});target.dispatchEvent(event);};
 try {
  await act(async()=>root.render(createElement(LoftSectionStack,{rows,canAdd:true,onAdd:()=>null,onRemove:()=>true,onMove:move,renderRows:()=>null})));
  const grip=host.querySelector('.loft-stack-grip')!, target=host.querySelectorAll('.loft-stack-row')[2];
  Object.defineProperty(grip,"setPointerCapture",{value:vi.fn()});
  Object.defineProperty(grip,"hasPointerCapture",{value:()=>false});
  Object.defineProperty(document,"elementFromPoint",{configurable:true,value:()=>target});
  await act(async()=>{dispatch(grip,"pointerdown",10,10);dispatch(grip,"pointermove",10,100);});
  expect(move).not.toHaveBeenCalled();expect(target.classList.contains("drop-target")).toBe(true);
  await act(async()=>dispatch(grip,"pointerup",10,100));
  expect(move).toHaveBeenCalledExactlyOnceWith(0,2);
  expect(host.querySelector('.drop-target')).toBeNull();
 } finally {await act(async()=>root.unmount());host.remove();delete (document as {elementFromPoint?:unknown}).elementFromPoint;vi.unstubAllGlobals();}
});
