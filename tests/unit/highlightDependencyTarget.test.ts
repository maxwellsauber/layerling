// @vitest-environment jsdom
import {expect,it,vi} from 'vitest';
import {highlightDependencyTarget} from '@/lib/highlightDependencyTarget';
it('reveals, focuses and briefly highlights the destination without editing it, including repeated navigation',()=>{
 const target=document.createElement('div');target.innerHTML='<input value="height">';document.body.append(target);
 target.scrollIntoView=vi.fn();const animate=vi.fn();target.animate=animate;
 try{
  highlightDependencyTarget(target);highlightDependencyTarget(target);
  expect(document.activeElement).toBe(target.querySelector('input'));
  expect(target.querySelector('input')!.value).toBe('height');
  expect(animate).toHaveBeenCalledTimes(2);
  expect(animate.mock.calls[0][1]).toEqual({duration:750,iterations:2});
 }finally{target.remove();}
});
