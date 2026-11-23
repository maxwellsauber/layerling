import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { demoAssetUrl, parseDemoManifest } from "@/lib/demoExamples";
import { importLylProject, exportLylProject } from "@/lib/lylProject";
import { applySketchConstraints } from "@/lib/sketchConstraints";
import { updateSketchOffsets } from "@/lib/sketchOffsets";
import { editorHistoryEntry } from "@/lib/editorHistory";
const root="apps/web/public/demo-examples/";
const examples=parseDemoManifest(JSON.parse(readFileSync(root+"manifest.json","utf8")));
describe("bundled sketch examples",()=>{
 it("resolves assets at the root and beneath a static mount",()=>{
  expect(demoAssetUrl("manifest.json","https://example.com/?editor=1")).toBe("https://example.com/demo-examples/manifest.json");
  expect(demoAssetUrl("linked-mirror.lyl","https://example.com/layerling/index.html")).toBe("https://example.com/layerling/demo-examples/linked-mirror.lyl");
 });
 it("rejects malformed manifests, duplicate IDs and unsafe paths",()=>{
  for(const value of [{},[examples[0],examples[0]],[{...examples[0],project:"../other.lyl"}],[{...examples[0],features:null}]])expect(()=>parseDemoManifest(value)).toThrow();
 });
 it.each(examples)("validates $id and preserves editable relationships through save/reload",async example=>{
  if(example.thumbnail)expect(existsSync(root+example.thumbnail)).toBe(true);
  const bytes=readFileSync(root+example.project),original=await importLylProject(bytes),copy=await importLylProject(bytes);
  expect(original.shapes[0].kind).toBe("mesh");
  expect(original.shapes[0].importedMesh?.positions.length).toBeGreaterThan(0);
  const profile=original.shapes[0].sketchProfile!;
  expect(profile.constraints?.length||profile.offsets?.length).toBeGreaterThan(0);
  expect(applySketchConstraints(profile).ok).toBe(true);
  expect(updateSketchOffsets(profile).ok).toBe(true);
  // Change an independent local copy and save it through the normal project serializer.
  copy.shapes[0].name="My edited example";
  const saved=await exportLylProject({...copy,projectId:"local-copy",modifiedAt:Date.now(),history:[editorHistoryEntry(copy.shapes,[], undefined, undefined, undefined, copy.history[copy.historyIndex]?.variables)],historyIndex:0});
  const reloaded=await importLylProject(saved);
  expect(reloaded.shapes[0].name).toBe("My edited example");
  expect(reloaded.shapes[0].sketchProfile).toEqual(profile);
  expect((await importLylProject(bytes)).shapes[0].name).toBe(original.shapes[0].name);
 });
});
