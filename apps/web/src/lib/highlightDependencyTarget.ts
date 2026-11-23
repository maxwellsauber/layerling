/** Briefly point out a navigated field without changing or entering its value. */
export function highlightDependencyTarget(target:HTMLElement|null){
 if(!target)return;
 target.closest('.property-card.collapsed')?.querySelector<HTMLButtonElement>('.property-card-header')?.click();
 target.scrollIntoView({block:'nearest',behavior:'smooth'});
 const field=target.matches('input,button,select')?target:target.querySelector<HTMLElement>('input,button,select');
 field?.focus({preventScroll:true});
 const reduced=window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 target.getAnimations?.().forEach(animation=>animation.cancel());
 target.animate?.([
  {outline:'3px solid transparent',outlineOffset:'4px'},
  {outline:'3px solid var(--accent, #7835bd)',outlineOffset:'4px',backgroundColor:'rgba(156, 95, 218, .2)'},
  {outline:'3px solid transparent',outlineOffset:'4px'},
 ],{duration:reduced?1400:750,iterations:reduced?1:2});
}
