// Modal cards (menu, result, leaderboard): while one is open, everything else in #game is inert,
// so keyboard and screen-reader users stay inside the card. Focus moves in on open and back on close.
(function(){
const game=document.getElementById('game');
const overlays=[...document.querySelectorAll('.overlay')];
const openers=new Map();
const FOCUSABLE='button:not([disabled]):not([hidden]),a[href],input:not([disabled]),[tabindex="0"]';

function visible(el){return !el.hidden&&el.getClientRects().length>0}
function sync(){
  const top=overlays.filter(o=>!o.hidden).pop()||null;
  [...game.children].forEach(el=>{if(el.id==='tut')return;el.inert=!!top&&el!==top});
  return top;
}
function onToggle(o){
  if(!o.hidden){
    if(!openers.has(o))openers.set(o,document.activeElement);
    sync();
    // let the opener's own code place focus first (e.g. the result card focuses "Play next")
    setTimeout(()=>{if(o.hidden||o.contains(document.activeElement))return;
      const first=[...o.querySelectorAll(FOCUSABLE)].find(visible);if(first)first.focus()},0);
  }else{
    sync();const back=openers.get(o);openers.delete(o);
    if(back&&document.contains(back)&&visible(back)&&!back.closest('[inert]'))back.focus();
  }
}
const mo=new MutationObserver(list=>list.forEach(m=>onToggle(m.target)));
overlays.forEach(o=>mo.observe(o,{attributes:true,attributeFilter:['hidden']}));
sync();
})();
