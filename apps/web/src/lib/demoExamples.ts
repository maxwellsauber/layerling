export type DemoExample = {
  id: string;
  category?: "real-world" | "functional";
  featured?: boolean;
  title: string;
  description: string;
  features: string[];
  tryThis: string;
  project: string;
  thumbnail?: string;
};

function safePath(value: unknown): value is string {
  return typeof value === "string" && /^[a-zA-Z0-9][a-zA-Z0-9_./-]*$/.test(value)
    && !value.split("/").includes("..");
}

export function parseDemoManifest(value: unknown): DemoExample[] {
  if (!Array.isArray(value)) throw new Error("Invalid example manifest");
  const ids = new Set<string>();
  return value.map((entry: DemoExample) => {
    if (!entry || typeof entry.id !== "string" || ids.has(entry.id)
      || ![entry.title, entry.description, entry.tryThis].every(text => typeof text === "string" && text.trim())
      || !Array.isArray(entry.features) || !entry.features.every(text => typeof text === "string")
      || (entry.category !== undefined && entry.category !== "real-world" && entry.category !== "functional")
      || (entry.featured !== undefined && typeof entry.featured !== "boolean")
      || !safePath(entry.project) || !entry.project.endsWith(".lyl")
      || (entry.thumbnail !== undefined && !safePath(entry.thumbnail))) throw new Error("Invalid example manifest");
    ids.add(entry.id);
    return entry;
  });
}

// Resolve against the mounted app directory, preserving a static-host subdirectory.
export function demoAssetUrl(path: string, pageUrl: string): string {
  return new URL(`demo-examples/${path}`, new URL("./", pageUrl)).href;
}
