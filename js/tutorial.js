// Steffen's tutorial. Runs automatically the first time a player starts a hole,
// and again whenever they tap "How to play" in the menu.
(function(){
const $=id=>document.getElementById(id);
const KEY='bb_tutorial_done';
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function seen(){try{return localStorage.getItem(KEY)==='1'}catch(e){return false}}
function markSeen(){try{localStorage.setItem(KEY,'1')}catch(e){}}

// mode: talk = Steffen speaks, tap to continue. do = player acts, game stays playable.
// layout: bottom = Steffen standing over the speech box. top = compact box at the top.
// spot: CSS selector to highlight. wait: game event that moves the tutorial on.
const STEPS=[
  {mode:'talk',layout:'bottom',text:"Welcome to Blue Bay! I'm Steffen, the golf pro here. Let me show you how it works."},
  {mode:'talk',layout:'top',demo:true,text:"To hit the ball, put one finger anywhere on the screen and pull back. The further you pull, the harder you hit."},
  {mode:'do',layout:'top',wait:'stopped',text:"Your turn! Pull back anywhere and let go."},
  {mode:'talk',layout:'bottom',text:"Nice! The dotted arc shows your shot in calm air. Use it to aim around trouble.",penaltyText:"Ouch, that one found trouble. No worries: the dotted arc shows your shot in calm air, so use it to aim around hazards."},
  {mode:'do',layout:'top',wait:'look',text:"Want to look ahead? Slide two fingers across the screen. On a computer, just scroll.",skipHint:true},
  {mode:'talk',layout:'bottom',spot:'.windpill',text:"Now the wind. The arrow shows which way it blows your ball, and the number is how strong it is. Everyone gets the same wind today."},
  {mode:'talk',layout:'bottom',spot:'.windpill',text:"The dotted arc ignores the wind, so aim into it. Blowing right? Aim left. In your face? Hit harder or keep it low. High shots feel it most, and by the sea it really blows."},
  {mode:'talk',layout:'top',spot:'.loft',text:"Pick your shot height here. High shots stop quickly on the green, low shots run out further."},
  {mode:'talk',layout:'top',spot:'#mapBtn',text:"Tap 'See the hole' for the full view, with the distance to the pin."},
  {mode:'talk',layout:'top',spot:'#courseBtn',text:"And 'Course' takes you back to the map to pick another hole."},
  {mode:'talk',layout:'bottom',text:"That's it! Find the green, sink your putt, and I'll see you at the 19th hole."}
];

let lastPenalty=false,i=-1,active=false,typing=null,demoRaf=null,waitFor=null;
const root=$('tut'),text=$('tutText'),more=$('tutMore'),spotEl=$('tutSpot'),finger=$('tutFinger');

function start(){active=true;i=-1;root.hidden=false;document.body.classList.add('tutorial-on');next()}
function finish(){active=false;stopDemo();clearInterval(typing);waitFor=null;root.hidden=true;root.className='';document.body.classList.remove('tutorial-on');markSeen()}
function next(){
  stopDemo();i++;if(i>=STEPS.length){finish();return}
  const s=STEPS[i];waitFor=s.wait||null;
  root.className='tut-'+s.mode+' tut-'+s.layout+(s.spot?' tut-spotlit':'')+(s.demo?' tut-demo':'');
  place();type(textOf(s));
  $('tutHint').hidden=!s.skipHint;
  if(s.demo)startDemo();
}
function place(){
  const s=STEPS[i];if(!s)return;
  const el=s.spot&&document.querySelector(s.spot);
  if(!el){spotEl.hidden=true;return}
  const r=el.getBoundingClientRect(),pad=8;
  Object.assign(spotEl.style,{left:(r.left-pad)+'px',top:(r.top-pad)+'px',width:(r.width+pad*2)+'px',height:(r.height+pad*2)+'px'});
  spotEl.hidden=false;
}
function type(full){
  clearInterval(typing);typing=null;more.hidden=true;if(window.Steffen)Steffen.say(full);
  if(reduceMotion){text.textContent=full;done();return}
  let c=0;text.textContent='';
  typing=setInterval(()=>{c+=2;text.textContent=full.slice(0,c);if(window.Steffen)Steffen.speak(full.slice(0,c));if(c>=full.length){clearInterval(typing);typing=null;done()}},26);
}
function textOf(s){return s.penaltyText&&lastPenalty?s.penaltyText:s.text}
function done(){text.textContent=textOf(STEPS[i]);more.hidden=STEPS[i].mode!=='talk'}
function tap(){
  if(!active)return;
  if(typing){clearInterval(typing);typing=null;done();return}
  const s=STEPS[i];if(s.mode==='talk'||s.skipHint)next();
}

// Ghost finger pulling back from the ball, away from the pin, using the real aim preview.
function startDemo(){
  if(reduceMotion||!window.BB)return;
  finger.hidden=false;BB.demoNoZoom=true;const t0=performance.now();
  const loop=now=>{
    const b=BB.ballScreen(),p=BB.pinScreen();
    let ux=p.x-b.x,uy=p.y-b.y;const l=Math.hypot(ux,uy)||1;ux/=l;uy/=l;
    const cyc=((now-t0)/1900)%1,k=cyc<0.6?cyc/0.6:1,e=1-Math.pow(1-k,3);
    const len=Math.min(innerWidth,innerHeight)*0.3*e;
    if(cyc<0.85){BB.demoDrag(-ux*len,-uy*len);finger.style.opacity=1}else{BB.clearDrag();finger.style.opacity=0}
    finger.style.transform='translate('+(b.x-ux*len)+'px,'+(b.y-uy*len)+'px)';
    demoRaf=requestAnimationFrame(loop);
  };
  demoRaf=requestAnimationFrame(loop);
}
function stopDemo(){if(demoRaf)cancelAnimationFrame(demoRaf);demoRaf=null;finger.hidden=true;if(window.BB){BB.clearDrag();BB.demoNoZoom=false}}

$('tutDlg').addEventListener('click',tap);
$('tutDlg').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();tap()}});
$('tutCatch').addEventListener('click',tap);
$('tutSkip').addEventListener('click',finish);
addEventListener('resize',place);

addEventListener('bb:stopped',e=>{lastPenalty=!!(e.detail&&e.detail.penalty);if(active&&waitFor==='stopped')setTimeout(next,350)});
addEventListener('bb:look',()=>{if(active&&waitFor==='look')setTimeout(next,600)});
addEventListener('bb:holed',()=>{if(active)finish()});
addEventListener('bb:start',()=>{if(!active&&!seen())start()});

$('howBtn').addEventListener('click',()=>{BB.startHole(1);setTimeout(()=>{if(!active)start()},50)});
})();
