/* Render Lucide icons after vanilla HTML and React/Vaul updates. */
(() => {
  let scheduled = false;
  const paint = () => {
    scheduled = false;
    if (!window.lucide || !document.querySelector('i[data-lucide]')) return;
    window.lucide.createIcons({attrs:{'stroke-width':2}});
  };
  const queue = () => { if (!scheduled) { scheduled = true; requestAnimationFrame(paint); } };
  const start = () => {
    new MutationObserver(queue).observe(document.body, {childList:true,subtree:true});
    queue();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded',start,{once:true}); else start();
})();
