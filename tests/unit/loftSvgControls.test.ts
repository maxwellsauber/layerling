// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LoftSvgControls } from "@/components/workplane/LoftSvgControls";
import type { WorkplaneShape } from "@/types/layerling";

const shape: WorkplaneShape = {id:"loft",kind:"loft",name:"Loft",x:0,z:0,size:40,width:40,depth:40,height:30,rotation:0,color:"#ff8800"};
it("offers design sketches instead of file upload in sketch mode and links only the chosen section",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const source={...shape,id:'profile',kind:'mesh' as const,name:'My sketch',sketchProfile:{points:[{id:'a',x:0,z:0},{id:'b',x:20,z:0},{id:'c',x:10,z:20}],segments:[{id:'ab',startId:'a',endId:'b',kind:'line' as const},{id:'bc',startId:'b',endId:'c',kind:'line' as const},{id:'ca',startId:'c',endId:'a',kind:'line' as const}]}};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host),update=vi.fn(),selectSource=vi.fn();
 await act(async()=>root.render(createElement(LoftSvgControls,{shape,section:'top',sketchMode:true,sources:[source],onSelectSource:selectSource,onUpdate:update})));
 expect(host.querySelector('input[type="file"]')).toBeNull();
 const select=host.querySelector('select')!;
 await act(async()=>{select.value='profile';select.dispatchEvent(new Event('change',{bubbles:true}));});
 expect(update.mock.lastCall?.[0].loftTopSvg).toMatchObject({sketchId:'profile',name:'My sketch'});
 expect(update.mock.lastCall?.[0].loftBottomSvg).toBeUndefined();
 await act(async()=>root.render(createElement(LoftSvgControls,{shape:{...shape,...update.mock.lastCall![0]},section:'top',sketchMode:true,sources:[source],onSelectSource:selectSource,onUpdate:update})));
 await act(async()=>host.querySelector('button')!.click());expect(selectSource).toHaveBeenCalledWith('profile');
 await act(async()=>root.unmount());
});
afterEach(()=>{document.body.innerHTML="";vi.unstubAllGlobals();});
it("imports only the chosen end, reports invalid SVGs without changing the design, and permits retry",async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const host=document.createElement("div");document.body.append(host);
 const root=createRoot(host), update=vi.fn();
 await act(async()=>root.render(createElement("div",null,createElement(LoftSvgControls,{shape,section:"bottom",onUpdate:update}),createElement(LoftSvgControls,{shape,section:"top",onUpdate:update}))));
 const inputs=host.querySelectorAll('input[type="file"]');expect(inputs).toHaveLength(2);
 async function choose(input:Element,source:string,name:string){
   const file=new File([source],name,{type:"image/svg+xml"});
   Object.defineProperty(file,"arrayBuffer",{value:async()=>new TextEncoder().encode(source).buffer});
   Object.defineProperty(input,"files",{configurable:true,value:[file]});
   await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
 }
 await choose(inputs[1],'<svg xmlns="http://www.w3.org/2000/svg"><rect width="10" height="10"/><rect x="20" width="10" height="10"/></svg>',"bad.svg");
 expect(update).not.toHaveBeenCalled();expect(host.querySelector('[role="alert"]')?.textContent).toMatch(/one closed outline/);
 await choose(inputs[1],'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H40V30H0Z"/></svg>',"top.svg");
 expect(update).toHaveBeenCalledTimes(1);
 expect(update.mock.calls[0][0]).toMatchObject({loftTopOutline:"svg",loftTopSvg:{name:"top.svg"}});
 expect(update.mock.calls[0][0].loftBottomOutline).toBe("rectangle");
 expect(host.querySelector('[role="alert"]')).toBeNull();
 const uploaded={...shape,...update.mock.calls[0][0]};
 await act(async()=>root.render(createElement(LoftSvgControls,{shape:uploaded,section:"top",onUpdate:update})));
 expect(host.querySelector('input[type="file"]')?.hasAttribute('hidden')).toBe(true);
 expect(host.querySelector('.inspector-action-button')?.textContent).toContain('Upload top SVG');
 expect(host.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toBe('top.svg');
 expect(host.querySelector('svg[role="img"] path')?.getAttribute('d')).toContain('Z');
 await act(async()=>root.unmount());
});

it("updates the selected middle section without replacing its neighbours", async()=>{
 vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT",true);
 const host=document.createElement("div");document.body.append(host);
 const root=createRoot(host),update=vi.fn();
 const source={...shape,loftSections:[{at:.3,outline:"round" as const,width:30,depth:30},{at:.7,outline:"rectangle" as const,width:25,depth:25}]};
 await act(async()=>root.render(createElement(LoftSvgControls,{shape:source,section:1,onUpdate:update})));
 const input=host.querySelector('input[type="file"]')!;
 expect(host.textContent).toContain("Upload section 2 SVG");
 const text='<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0H40V30H0Z"/></svg>';
 const file=new File([text],"middle.svg",{type:"image/svg+xml"});
 Object.defineProperty(file,"arrayBuffer",{value:async()=>new TextEncoder().encode(text).buffer});
 Object.defineProperty(input,"files",{value:[file]});
 await act(async()=>input.dispatchEvent(new Event("change",{bubbles:true})));
 expect(update).toHaveBeenCalledTimes(1);
 const patch=update.mock.calls[0][0];
 expect(patch.loftSections[0]).toMatchObject({at:.3,outline:"round"});
 expect(patch.loftSections[1]).toMatchObject({at:.7,outline:"svg",svg:{name:"middle.svg"}});
 expect(patch.loftBottomOutline).toBe("rectangle");expect(patch.loftTopOutline).toBe("round");
 await act(async()=>root.unmount());
});
