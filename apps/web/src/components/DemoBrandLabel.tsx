import { t } from "@/lib/i18n";

/** A text lockup: accessible lettering stays crisp at every screen size. */
export function DemoBrandLabel() {
  const label = t("demo.brand");
  return <span className="demo-crayon-label" aria-label={label}>
    <span aria-hidden="true">{Array.from(label).map((letter, index) => <span key={index}>{letter === " " ? "\u00a0" : letter}</span>)}</span>
  </span>;
}
