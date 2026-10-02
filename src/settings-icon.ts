/** Reversible icon adaptation, restricted to this fork's unique setting label. */
const PAW = '<circle cx="11" cy="4" r="2"/><circle cx="18" cy="8" r="2"/><circle cx="20" cy="16" r="2"/><path d="M9 10a5 5 0 0 1 5 5v3.5a3.5 3.5 0 0 1-6.84 1.045Q6.52 17.48 4.46 16.84A3.5 3.5 0 0 1 5.5 10Z"/>';
export function observePetSettingsIcon(): () => void {
  const saved = new Map<SVGElement,{html:string;attrs:Map<string,string|null>}>();
  const apply = () => {
    for (const button of document.querySelectorAll('button,[role=button],.dcu-settings-link')) {
      if (!['悬浮宠物', 'Floating pet'].includes(button.textContent?.trim() ?? '')) continue;
      const svg = button.querySelector('svg');
      if (!svg || svg.getAttribute('data-pet-icon') === 'codex-paw') continue;
      if(!saved.has(svg))saved.set(svg,{html:svg.innerHTML,attrs:new Map(['viewBox','fill','stroke','stroke-linecap','stroke-linejoin','data-pet-icon'].map(name=>[name,svg.getAttribute(name)]))});
      svg.setAttribute('data-pet-icon', 'codex-paw');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
      svg.innerHTML = PAW;
    }
  };
  apply();
  const observer = new MutationObserver(apply);
  observer.observe(document.body, { childList: true, subtree: true });
  return () => {observer.disconnect();for(const [svg,original] of saved){svg.innerHTML=original.html;for(const [name,value] of original.attrs){if(value===null)svg.removeAttribute(name);else svg.setAttribute(name,value);}}saved.clear();};
}
