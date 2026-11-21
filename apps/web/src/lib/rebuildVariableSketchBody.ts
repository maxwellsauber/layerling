import { withExtrudeDeformsKept } from "@/lib/editorSketchCad";
import { restoreShapeBeforeEdgeTreatment } from "@/lib/edgeTreatmentHistory";
import { sketchPoseOf } from "@/lib/sketchPlacement";
import type { EdgeTreatmentHistoryEntry, SketchProfile, WorkplaneShape } from "@/types/layerling";

/** Rebuild the source, then replay its modifiers. Never publish an unfinished solid. */
export async function rebuildVariableSketchBody(
  shape: WorkplaneShape,
  profile: SketchProfile,
  build: (source: WorkplaneShape, profile: SketchProfile) => Promise<WorkplaneShape>,
  replay: (body: WorkplaneShape, entry: EdgeTreatmentHistoryEntry) => Promise<WorkplaneShape>,
): Promise<WorkplaneShape> {
  const history = shape.edgeTreatmentHistory ?? [];
  if (shape.surfaceTexture || history.some(({feature}) => feature.kind === "surfaceTexture" || feature.kind === "deleteFace") ||
      (shape.edgeTreatments?.length ?? 0) > history.length) {
    throw new Error("This variable change cannot preserve all of the body's operations. The design has not been changed.");
  }
  const source = history.length ? restoreShapeBeforeEdgeTreatment(shape, history[0]) : shape;
  // A boolean or other baked operation before the first modifier cannot be reconstructed from a sketch alone.
  if (history.length && (!source.sketchProfile || source.groupedShapes?.length)) {
    throw new Error("This variable change cannot rebuild the body's original sketch. The design has not been changed.");
  }
  let body = await build({...sketchPoseOf(source), parameterBindings: shape.parameterBindings}, profile);
  for (const entry of history) body = await replay(body, entry);
  // Deformations applied after the last baked modifier belong on top of the replayed body.
  return withExtrudeDeformsKept(body, shape);
}
