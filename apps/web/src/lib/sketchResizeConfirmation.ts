import type { WorkplaneShape } from "@/types/layerling";

const dimensions = ["width", "depth", "height", "size"] as const;

/** A modifier can change the bounds while leaving its constrained source sketch intact. */
function recordedModifierPreservesSketch(original: WorkplaneShape, shape: WorkplaneShape) {
  const previous = original.edgeTreatmentHistory ?? [];
  const history = shape.edgeTreatmentHistory ?? [];
  if (history.length !== previous.length + 1 || previous.some((entry, index) => history[index].id !== entry.id)) return false;
  const added = history[history.length - 1];
  if (!added.appliedFrame || JSON.stringify(shape.sketchProfile) !== JSON.stringify(original.sketchProfile) ||
      JSON.stringify(added.before.sketchProfile) !== JSON.stringify(original.sketchProfile)) return false;
  // Match both ends of the recorded operation. A subsequent drag on a treated body is still a resize.
  return dimensions.every((key) => Math.abs(added.before[key] - original[key]) < 1e-8) &&
    (["width", "depth", "height"] as const).every((key) => Math.abs(added.appliedFrame![key] - shape[key]) < 1e-8);
}

/** Extrusion thickness is independent of the constrained 2D outline. */
function onlyExtrusionHeightChanged(original: WorkplaneShape, shape: WorkplaneShape) {
  if ((original.sketchOperation && original.sketchOperation !== "extrude") || original.sketchRevolve) return false;
  if (JSON.stringify(original.sketchProfile) !== JSON.stringify(shape.sketchProfile)) return false;
  if ((["width", "depth", "size"] as const).some(key => Math.abs((original[key] ?? 0) - (shape[key] ?? 0)) > 1e-8)) return false;
  // A tilted sketch baked into a CAD body's world axes has part of its outline
  // along world Y. Scaling that body's height would change the sketch too.
  const pose = original.sketchPose?.transform;
  if (pose && (Math.abs(pose[1]) > 1e-8 || Math.abs(pose[9]) > 1e-8)) return false;
  return true;
}

/** Ordinary placement changes are safe; resizing a constrained sketch needs an explicit choice. */
export function constrainedSketchResizeIds(before: readonly WorkplaneShape[], after: readonly WorkplaneShape[]) {
  const previous = new Map(before.map((shape) => [shape.id, shape]));
  return after.filter((shape) => {
    const original = previous.get(shape.id);
    return original?.sketchProfile?.constraints?.length && shape.sketchProfile &&
      !recordedModifierPreservesSketch(original, shape) &&
      !onlyExtrusionHeightChanged(original, shape) &&
      dimensions.some((key) => Math.abs((shape[key] ?? 0) - (original[key] ?? 0)) > 1e-8);
  }).map((shape) => shape.id);
}

export function withoutResizedSketchConstraints(shapes: readonly WorkplaneShape[], ids: readonly string[]) {
  const affected = new Set(ids);
  return shapes.map((shape) => affected.has(shape.id) && shape.sketchProfile ? {
    ...shape, sketchProfile: { ...shape.sketchProfile, constraints: undefined },
  } : shape);
}
