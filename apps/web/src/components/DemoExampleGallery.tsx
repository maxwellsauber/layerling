"use client";
import { useEffect, useState } from "react";
import { t } from "@/lib/i18n";
import { useLanguage } from "@/lib/useLanguage";
import { demoAssetUrl, parseDemoManifest, type DemoExample } from "@/lib/demoExamples";

const demoImportBusy = { current: false };

export function DemoExampleGallery({ onOpen, compact = false }: { compact?: boolean; onOpen: (file: File, name: string) => Promise<{ ok: boolean; message: string }> }) {
  useLanguage();
  const [examples, setExamples] = useState<DemoExample[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const busy = demoImportBusy;
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void fetch(demoAssetUrl(compact ? "features-manifest.json" : "manifest.json", window.location.href), { signal: controller.signal })
      .then(response => { if (!response.ok) throw Error(); return response.json(); })
      .then(parseDemoManifest)
      .then(setExamples)
      .catch(() => { if (!controller.signal.aborted) setError(t("demo.loadError")); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [retry, compact]);
  async function open(example: DemoExample) {
    if (busy.current) return;
    busy.current = true;
    setPending(example.id);
    setError("");
    try {
      const response = await fetch(demoAssetUrl(example.project, window.location.href));
      if (!response.ok) throw Error();
      const result = await onOpen(new File([await response.blob()], `${example.id}.lyl`), example.title);
      if (!result.ok) setError(`${t("demo.openError")} ${result.message}`);
    } catch { setError(t("demo.openError")); }
    finally { busy.current = false; setPending(null); }
  }
  const card = (example: DemoExample) => <article className="demo-example-card" key={example.id}>
    {example.thumbnail ? <img src={demoAssetUrl(example.thumbnail, window.location.href)} alt="" loading="lazy" width={800} height={500} /> : null}
    <h4>{example.title}</h4><p>{example.description}</p>
    {!compact ? <p className="demo-example-features">{example.features.join(" · ")}</p> : null}
    <p className="demo-example-try"><strong>{t("demo.tryThis")}</strong> {example.tryThis}</p>
    <button type="button" className="dashboard-confirm-save" aria-label={t("demo.openNamed", {name:example.title})} disabled={pending !== null} onClick={() => void open(example)}>
      {pending === example.id ? t("demo.opening") : t("demo.open")}
    </button>
  </article>;
  const headingId = compact ? "demo-features-title" : "demo-gallery-title";
  return <section className={`demo-gallery${compact ? " demo-feature-gallery" : ""}`} aria-labelledby={headingId}>
    <h2 id={headingId}>{t(compact ? "demo.moreTitle" : "demo.title")}</h2>
    <p>{t(compact ? "demo.moreIntro" : "demo.notice")}</p>
    {!compact ? <p>{t("demo.instructions")}</p> : null}
    {loading ? <p role="status">{t("demo.loading")}</p> : null}
    {error ? <div role="alert"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)}>{t("demo.retry")}</button></div> : null}
    {compact ? <div className="demo-example-grid">{examples.map(card)}</div> : (["featured", "real-world", "functional"] as const).map(category => {
      const grouped = examples.filter(example => category === "featured" ? example.featured : !example.featured && (example.category ?? "functional") === category);
      if (!grouped.length) return null;
      return <section className={`demo-example-category${category === "featured" ? " demo-example-featured" : ""}`} key={category} aria-labelledby={`demo-${category}-title`}>
        <h3 id={`demo-${category}-title`}>{t(category === "featured" ? "demo.featured" : category === "real-world" ? "demo.realWorld" : "demo.functional")}</h3>
        <div className="demo-example-grid">{grouped.map(card)}</div>
      </section>;
    })}
    {compact ? <p className="demo-theme-note">{t("demo.themeNote")}</p> : null}
  </section>;
}
