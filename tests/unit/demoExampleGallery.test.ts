// @vitest-environment jsdom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DemoExampleGallery } from "@/components/DemoExampleGallery";
import { setLanguage } from "@/lib/i18n";
(globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
const example={id:"plate",title:"Plate",description:"Editable plate",features:["Length"],tryThis:"Change width",project:"plate.lyl"};
let container:HTMLDivElement,root:Root;
beforeEach(async()=>{await setLanguage("en",false);container=document.createElement("div");document.body.append(container);root=createRoot(container);});
afterEach(()=>{act(()=>root.unmount());container.remove();vi.unstubAllGlobals();});
async function render(onOpen=vi.fn(async()=>({ok:true,message:"Opened"}))){await act(async()=>{root.render(createElement(DemoExampleGallery,{onOpen}));});return onOpen;}
it("loads cards without importing and blocks duplicate clicks until opening completes",async()=>{
 let finish!:(value:{ok:boolean;message:string})=>void;
 const onOpen=vi.fn(()=>new Promise<{ok:boolean;message:string}>(resolve=>finish=resolve));
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[example]}).mockResolvedValue({ok:true,blob:async()=>new Blob(["package"])});vi.stubGlobal("fetch",fetcher);
 await render(onOpen);expect(onOpen).not.toHaveBeenCalled();expect(fetcher).toHaveBeenCalledTimes(1);
 const button=container.querySelector("button")!;
 await act(async()=>{button.click();button.click();});expect(onOpen).toHaveBeenCalledTimes(1);expect(button.disabled).toBe(true);
 await act(async()=>finish({ok:true,message:"Opened"}));expect(button.disabled).toBe(false);
 await act(async()=>button.click());expect(onOpen).toHaveBeenCalledTimes(2);
 await act(async()=>finish({ok:true,message:"Opened"}));
});
it("shows a retry action for manifest failures",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockRejectedValueOnce(Error()).mockResolvedValue({ok:true,json:async()=>[example]}));
 await render();expect(container.querySelector('[role="alert"]')).not.toBeNull();
 await act(async()=>container.querySelector("button")!.click());expect(container.textContent).toContain("Plate");
});
it("does not import failed downloads and reports rejected project imports",async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce({ok:true,json:async()=>[example]}).mockResolvedValueOnce({ok:false}).mockResolvedValue({ok:true,blob:async()=>new Blob()});vi.stubGlobal("fetch",fetcher);
 const onOpen=await render(vi.fn(async()=>({ok:false,message:"Invalid package"})));
 await act(async()=>container.querySelector("button")!.click());expect(onOpen).not.toHaveBeenCalled();
 const open=[...container.querySelectorAll("button")].find(b=>b.textContent==="Open example")!;
 await act(async()=>open.click());expect(container.querySelector('[role="alert"]')?.textContent).toContain("Invalid package");
});
it("groups practical projects separately from functional demonstrations",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>[example,{...example,id:"ring",title:"Spacer ring",category:"real-world"}]}));
 await render();
 const practical=container.querySelector('[aria-labelledby="demo-real-world-title"]')!;
 const functional=container.querySelector('[aria-labelledby="demo-functional-title"]')!;
 expect(practical.textContent).toContain("Spacer ring");
 expect(practical.textContent).not.toContain("Plate");
 expect(functional.textContent).toContain("Plate");
 expect(functional.textContent).not.toContain("Spacer ring");
});
it("shows a featured workshop once, above the other categories",async()=>{
 vi.stubGlobal("fetch",vi.fn().mockResolvedValue({ok:true,json:async()=>[example,{...example,id:"workshop",title:"Workshop",category:"real-world",featured:true}]}));
 await render();
 const featured=container.querySelector('[aria-labelledby="demo-featured-title"]')!;
 expect(featured.textContent).toContain("Workshop");
 expect(container.querySelectorAll('article')).toHaveLength(2);
 expect(container.querySelector('[aria-labelledby="demo-real-world-title"]')).toBeNull();
 expect(container.querySelector('.demo-example-category')).toBe(featured);
});
it("loads the compact feature manifest without importing and renders accessible example actions",async()=>{
 const fetcher=vi.fn().mockResolvedValue({ok:true,json:async()=>[example]});vi.stubGlobal("fetch",fetcher);
 const onOpen=vi.fn(async()=>({ok:true,message:"Opened"}));
 await act(async()=>root.render(createElement(DemoExampleGallery,{compact:true,onOpen})));
 expect(fetcher.mock.calls[0][0]).toContain("features-manifest.json");
 expect(onOpen).not.toHaveBeenCalled();
 expect(container.querySelector("h2")?.textContent).toBe("More from Max’s Playground");
 expect(container.querySelector("h3")).toBeNull();
 expect(container.querySelector("button")?.getAttribute("aria-label")).toBe("Open example: Plate");
 expect(container.textContent).toContain("88 MPH");
});
