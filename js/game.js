(function(){
const S={TREES:0,FAIR:1,ROUGH:2,SAND:3,GREEN:4,PATH:5,WATER:6,ROCKS:7};
const LIE_NAME=["Trees","Fairway","Rough","Bunker","Green","Cart path","Water","Rocks"];
const ROLL=[900,380,700,1900,190,230,900,900];
const REST=[0,.10,.05,.01,.06,.16,0,0];
const GRIP=[0,.42,.26,.06,.40,.58,0,0];
const LIE_POWER=[1,1,.82,.55,1,.95,1,1];
const G0=600, ANGLE=0.55, SPEED0=610, CARRY0=SPEED0*SPEED0*Math.sin(2*ANGLE)/G0, PUTT0=230, BALL_R=8, HOLE_R=8;
const WIND_FX=1.5, CUP_SPEED=55; // wind push multiplier; a putt drops only below this speed (x sqrt k), about 2.5 m of roll past the cup
function decode(s){const m=new Uint8Array(s.length);for(let i=0;i<s.length;i++)m[i]=s.charCodeAt(i)-48;return m}
const HOLES=window.BB_DATA.holes.map(h=>Object.assign(h,{mask:decode(window.BB_MASKS[h.num])}));
HOLES.forEach(h=>{h.img=new Image();h.img.src=h.src});
let hole=HOLES[0];
function lieAt(x,y){const mx=Math.floor(x/4),my=Math.floor(y/4);if(mx<0||my<0||mx>=hole.mw||my>=hole.mh)return S.WATER;return hole.mask[my*hole.mw+mx]}
function emit(name,detail){window.dispatchEvent(new CustomEvent('bb:'+name,{detail:detail}))}
const SNOW=false; // falling snow, switched off for now
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
const cv=document.getElementById('c'),ctx=cv.getContext('2d');
const $=id=>document.getElementById(id);
let baseScale=1,fitScale=1,scale=0,mapMode=false,W=0,H=0,dpr=1,cam={x:0,y:0};
let wind={ax:0,ay:0,kmh:0},ball,strokes=0,state='intro',last,drag=null,look=null,pan=null,flakes=[],sinkT=0,trail=[],aimMark=null,closest=Infinity;

// Wind is the same for every player: seeded by the hole and today's date in Curacao (UTC-4).
// Inland holes get 10-20 km/h, holes on the sea up to ~38 km/h. Later the backend can hand out this seed.
function dayKey(){return new Date(Date.now()-4*3600e3).toISOString().slice(0,10)}
function seeded(str){let h=2166136261;for(let i=0;i<str.length;i++)h=Math.imul(h^str.charCodeAt(i),16777619);
  return function(){h=Math.imul(h^(h>>>15),h|1);h^=h+Math.imul(h^(h>>>7),h|61);return((h^(h>>>14))>>>0)/4294967296}}
function dailyWind(num){const r=seeded('bb-wind/'+dayKey()+'/'+num),ex=window.BB_DATA.exposure[num]||0;
  const wa=r()*Math.PI*2,kmh=Math.round(10+r()*10+ex*(8+r()*10)),a=kmh*3.6*WIND_FX;return{ax:Math.cos(wa)*a,ay:Math.sin(wa)*a,kmh:kmh,wa:wa}}
// How today's wind plays on a hole, seen from the tee looking at the pin. Used by Steffen's tips and the start toast.
function windRead(num){const h=HOLES.find(x=>x.num===num),w=dailyWind(num);if(!h)return null;
  const dx=h.pin.x-h.tee.x,dy=h.pin.y-h.tee.y,l=Math.hypot(dx,dy),cw=Math.cos(w.wa),sw=Math.sin(w.wa);
  const along=(cw*dx+sw*dy)/l,side=(cw*-dy+sw*dx)/l;
  const push=Math.abs(side)>0.4?(side>0?'right':'left'):null,head=along<-0.4,tail=along>0.4;
  return{kmh:w.kmh,push:push,head:head,tail:tail,coast:(window.BB_DATA.exposure[num]||0)>=0.7}}
function windShort(r){const parts=[];if(r.head)parts.push('into your face');if(r.tail)parts.push('behind you');if(r.push)parts.push('pushing the ball '+r.push);
  return 'Wind '+r.kmh+' km/h, '+(parts.join(' and ')||'swirling')+'.'}
function windTip(num){const r=windRead(num);if(!r)return null;
  const feel=r.kmh<15?'Just a light breeze today':r.kmh<25?'A steady breeze today':'The wind is really blowing today';
  const where=r.coast?" We’re right on the sea here, so it blows harder than inland.":'';
  const tips=[];if(r.push)tips.push('aim a little '+(r.push==='right'?'left':'right')+' of your target');
  if(r.head)tips.push('hit it harder, or keep it low under the wind');if(r.tail)tips.push('ease off, because the ball will fly further');
  if(!tips.length)tips.push('it will move your ball less than you think, so trust your line');
  if(r.kmh>=25&&r.push&&!r.head)tips.push('a low shot keeps it out of the worst of it');
  const t=tips.join(', and ');
  return feel+', '+r.kmh+' km/h, '+(windShort(r).replace(/^Wind \d+ km\/h, /,'').replace(/\.$/,''))+'.'+where+' The dotted arc ignores the wind, so '+t+'.'}
function startHole(i){
  hole=HOLES[i];document.body.style.background=hole.bg;
  ball={x:hole.tee.x,y:hole.tee.y,vx:0,vy:0,vz:0,z:0,air:false,landed:false,scale:1};
  strokes=0;closest=Infinity;kb=null;state='ready';last={x:ball.x,y:ball.y};setTimeout(()=>emit('start',{num:hole.num}),0);drag=null;look=null;pan=null;mapMode=false;syncMapBtn();
  wind=dailyWind(hole.num);trail=[];aimMark=null;
  $('windSpeed').textContent=wind.kmh;$('windArrow').style.transform='rotate('+(wind.wa*180/Math.PI+90)+'deg)';
  scale=0;resize();cam.x=ball.x;cam.y=ball.y;updateHud();$('hint').style.opacity=1;
  const num=hole.num;setTimeout(()=>{if(hole.num===num&&!document.body.classList.contains('tutorial-on'))toast(windShort(windRead(num)),4500)},700);
}
function updateHud(){
  const lf=document.querySelector('.loft');if(lf)lf.style.visibility=isPutt()?'hidden':'';
  $('strokes').textContent='Hole '+hole.num+', shot '+(strokes+1);
  const d=Math.round(Math.hypot(hole.pin.x-ball.x,hole.pin.y-ball.y)*hole.m);
  $('info').textContent='Par '+hole.par+'. '+LIE_NAME[lieAt(ball.x,ball.y)]+', '+d+' m to the pin';
}
function toast(msg,ms){const t=$('toast');t.textContent=msg;t.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>t.classList.remove('show'),ms||2200)}

function resize(){
  dpr=Math.min(window.devicePixelRatio||1,2);W=cv.clientWidth;H=cv.clientHeight;cv.width=W*dpr;cv.height=H*dpr;
  baseScale=Math.max(Math.min(W/hole.w,H/hole.h),H/hole.h*0.85);fitScale=Math.min(W/hole.w,(H-150)/hole.h)*0.97;if(!scale)scale=baseScale;
  flakes=[];const n=(reduceMotion||!SNOW)?0:Math.round(W*H/9000);
  for(let i=0;i<n;i++)flakes.push({x:Math.random()*W,y:Math.random()*H,r:0.8+Math.random()*1.8,s:12+Math.random()*28,d:Math.random()*6});
}
addEventListener('resize',resize);

function isPutt(){return lieAt(ball.x,ball.y)===S.GREEN}
function eff(p){return Math.pow(p,1.35)}
const LOFTS=[{n:'Low',a:0.36,c:1.0,g:1.0},{n:'Mid',a:0.55,c:1.0,g:0.72},{n:'High',a:0.9,c:0.85,g:0.4}];let loft=1;
function launch(d){const L=LOFTS[loft];const v=Math.sqrt(eff(d.p)*LIE_POWER[lieAt(ball.x,ball.y)]*L.c*Math.sin(2*ANGLE)/Math.sin(2*L.a))*SPEED0*Math.sqrt(hole.k);return{hv:v*Math.cos(L.a),vz:v*Math.sin(L.a),T:2*v*Math.sin(L.a)/G0,g:L.g}}
// Where the shot lands in calm air. The aim guide shows only this, so reading the wind is up to the player.
function landing(d){const s=isPutt()?predict(d.p):launch(d).hv*launch(d).T;return{x:ball.x+d.ux*s,y:ball.y+d.uy*s}}
function predict(p){p=eff(p);return isPutt()?Math.pow(p*PUTT0,2)*hole.k/(2*ROLL[S.GREEN]):p*CARRY0*hole.k*LIE_POWER[lieAt(ball.x,ball.y)]*LOFTS[loft].c}
// Pulling starts outside a small circle around the touch point. Sliding back into it cancels the shot.
const CANCEL_R=36;
function dragInfo(){
  if(!drag)return null;
  const dx=drag.sx-drag.cx,dy=drag.sy-drag.cy,len=Math.hypot(dx,dy);
  if(len<CANCEL_R)return{p:0,ux:0,uy:0,cancel:!!drag.armed&&!drag.demo};
  drag.armed=true;
  return{p:Math.min((len-CANCEL_R)/(Math.min(W,H)*0.42),1),ux:dx/len,uy:dy/len};
}
function cancelAim(){if(!drag||drag.demo)return;const armed=drag.armed;drag=null;kb=null;$('hint').style.opacity=1;if(armed)toast('Shot cancelled.')}
// Keyboard play: Left/Right aim (Shift for fine steps), Up/Down set power, Space or Enter shoots, Escape cancels.
// Builds the same drag the touch controls do, so the aim guide, zoom and physics are identical.
let kb=null;
function kbReady(){
  if(state!=='ready'||mapEl.classList.contains('open'))return false;
  if(['introOverlay','endOverlay','lbOverlay'].some(id=>!$(id).hidden))return false;
  const a=document.activeElement;return !a||a===document.body||a===cv;
}
function kbAim(){const len=CANCEL_R+kb.p*Math.min(W,H)*0.42;drag={sx:0,sy:0,cx:-Math.cos(kb.ang)*len,cy:-Math.sin(kb.ang)*len,kb:true,armed:true};$('hint').style.opacity=0}
addEventListener('keydown',e=>{
  if(!kbReady())return;const k=e.key,fine=e.shiftKey;
  if(k==='ArrowLeft'||k==='ArrowRight'||k==='ArrowUp'||k==='ArrowDown'){
    e.preventDefault();
    if(!kb)kb={ang:Math.atan2(hole.pin.y-ball.y,hole.pin.x-ball.x),p:isPutt()?0.3:0.6};
    if(k==='ArrowLeft')kb.ang-=(fine?0.5:2)*Math.PI/180;
    if(k==='ArrowRight')kb.ang+=(fine?0.5:2)*Math.PI/180;
    if(k==='ArrowUp')kb.p=Math.min(1,kb.p+(fine?0.005:0.02));
    if(k==='ArrowDown')kb.p=Math.max(0,kb.p-(fine?0.005:0.02));
    kbAim();
  }else if((k===' '||k==='Enter')&&drag&&drag.kb){
    e.preventDefault();const d=dragInfo();drag=null;kb=null;
    if(d&&d.p>=0.05){look=null;mapMode=false;syncMapBtn();shoot(d)}else $('hint').style.opacity=1;
  }
});
function syncMapBtn(){const away=mapMode||look;$('mapBtn').setAttribute('aria-pressed',!!away);$('mapLabel').textContent=away?'Back to the ball':'See the hole'}

const pts=new Map();let lockAim=false;
function mid(){let x=0,y=0;pts.forEach(p=>{x+=p.x;y+=p.y});return{x:x/pts.size,y:y/pts.size}}
function startPan(){drag=null;if(!look)look={x:cam.x,y:cam.y};pan=mid();syncMapBtn();emit('look')}
cv.addEventListener('pointerdown',e=>{
  if(state==='intro'||state==='done')return;
  if(e.button>0){cancelAim();return}
  cv.setPointerCapture(e.pointerId);pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pts.size>=2){lockAim=true;startPan();return}
  if(state==='ready'&&!lockAim){drag={sx:e.clientX,sy:e.clientY,cx:e.clientX,cy:e.clientY};$('hint').style.opacity=0}
});
cv.addEventListener('pointermove',e=>{
  if(!pts.has(e.pointerId))return;pts.set(e.pointerId,{x:e.clientX,y:e.clientY});
  if(pan&&pts.size>=2){const m=mid();look.x-=(m.x-pan.x)/scale;look.y-=(m.y-pan.y)/scale;pan=m}
  else if(drag){drag.cx=e.clientX;drag.cy=e.clientY}
});
function up(e){
  pts.delete(e.pointerId);
  if(pan){if(pts.size<2)pan=null;if(pts.size===0)lockAim=false;return}
  if(pts.size===0)lockAim=false;
  if(!drag)return;const armed=drag.armed,d=dragInfo();drag=null;
  if(e.type==='pointercancel'||!d||d.p<0.05){$('hint').style.opacity=1;if(armed&&e.type!=='pointercancel')toast('Shot cancelled.');return}
  look=null;mapMode=false;syncMapBtn();shoot(d);
}
cv.addEventListener('contextmenu',e=>{e.preventDefault();cancelAim()});
addEventListener('keydown',e=>{if(e.key==='Escape')cancelAim()});
cv.addEventListener('pointerup',up);cv.addEventListener('pointercancel',up);
cv.addEventListener('wheel',e=>{e.preventDefault();if(state==='intro'||state==='done')return;if(!look)look={x:cam.x,y:cam.y};look.x+=e.deltaX/scale;look.y+=e.deltaY/scale;syncMapBtn();emit('look')},{passive:false});

// closest: nearest the ball came to rest before a shot (tee excluded), the leaderboard tiebreak
function shoot(d){
  if(strokes>0)closest=Math.min(closest,Math.hypot(hole.pin.x-ball.x,hole.pin.y-ball.y)*hole.m);
  strokes++;last={x:ball.x,y:ball.y};const k=hole.k;trail=[];aimMark=isPutt()?null:landing(d);
  if(isPutt()){
    const v=eff(d.p)*PUTT0*Math.sqrt(k);ball.vx=d.ux*v;ball.vy=d.uy*v;ball.vz=0;ball.air=false;
  }else{
    const L=launch(d);ball.vx=d.ux*L.hv;ball.vy=d.uy*L.hv;ball.vz=L.vz;ball.grip=L.g;ball.air=true;ball.landed=false;
  }
  state='moving';updateHud();emit('shot');
}
function penalty(lie){
  strokes++;
  const toDrop=hole.drop&&(lie===S.WATER||lie===S.ROCKS);
  const msg=lie===S.WATER?'Splash. One-stroke penalty':lie===S.ROCKS?'Off the rocks and gone. One-stroke penalty':'Into the trees. One-stroke penalty';
  toast(msg+(toDrop?', playing from the drop zone.':'.'));
  const p=toDrop?hole.drop:last;ball.x=p.x;ball.y=p.y;ball.vx=ball.vy=ball.vz=0;ball.z=0;ball.air=false;state='ready';aimMark=null;updateHud();emit('stopped',{penalty:true});
}
function hazard(l){return l===S.TREES||l===S.WATER||l===S.ROCKS}
function step(dt){
  const k=hole.k,G=G0,rk=Math.sqrt(k);
  if(state==='moving'){
    const dh=Math.hypot(hole.pin.x-ball.x,hole.pin.y-ball.y);
    if(ball.air){
      if(!trail.length||Math.hypot(ball.x-trail[trail.length-1].x,ball.y-trail[trail.length-1].y)>14)trail.push({x:ball.x,y:ball.y,z:ball.z});
      ball.vz-=G*dt;ball.vx+=wind.ax*dt;ball.vy+=wind.ay*dt;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;ball.z+=ball.vz*dt;
      if(ball.z<=0){
        ball.z=0;const lie=lieAt(ball.x,ball.y);
        if(hazard(lie)){penalty(lie);return}
        const sp=Math.hypot(ball.vx,ball.vy);
        if(dh<HOLE_R&&sp<320*rk){sink();return}
        if(!ball.landed&&lie===S.SAND)toast('Right into the bunker.');
        if(!ball.landed){ball.vx*=ball.grip;ball.vy*=ball.grip}
        ball.landed=true;
        if(ball.vz<-90*rk){ball.vz=-ball.vz*REST[lie];ball.vx*=GRIP[lie];ball.vy*=GRIP[lie]}
        else{ball.vz=0;ball.air=false}
      }
      return;
    }
    const lie=lieAt(ball.x,ball.y);
    if(hazard(lie)){penalty(lie);return}
    const sp=Math.hypot(ball.vx,ball.vy);
    if(dh<HOLE_R){
      if(sp<CUP_SPEED*Math.sqrt(k)){sink();return}
      const nx=(ball.x-hole.pin.x)/dh||0,ny=(ball.y-hole.pin.y)/dh||0;ball.vx+=nx*400*dt;ball.vy+=ny*400*dt;
      const ns=Math.hypot(ball.vx,ball.vy)||1;ball.vx*=sp/ns;ball.vy*=sp/ns;
    }
    const f=ROLL[lie]*dt;
    if(sp<=f||sp<2){ball.vx=ball.vy=0;state='ready';aimMark=null;updateHud();emit('stopped',{lie:lie});
      if(lie===S.GREEN)toast(Math.round(dh*hole.m*10)/10+' m from the pin');
      return}
    ball.vx-=ball.vx/sp*f;ball.vy-=ball.vy/sp*f;ball.x+=ball.vx*dt;ball.y+=ball.vy*dt;
  }else if(state==='sinking'){
    sinkT+=dt;ball.x+=(hole.pin.x-ball.x)*Math.min(dt*10,1);ball.y+=(hole.pin.y-ball.y)*Math.min(dt*10,1);ball.scale=Math.max(0,1-sinkT*2.5);
    if(sinkT>0.6){state='done';showEnd()}
  }
}
function sink(){state='sinking';sinkT=0;ball.vx=ball.vy=ball.vz=0;ball.z=0;ball.air=false}

const NAMES={'-3':'Albatross','-2':'Eagle','-1':'Birdie','0':'Par','1':'Bogey','2':'Double bogey'};
const LINES={
  great:["That one went in like it had a dinner reservation. Back home it\u2019s probably grey and cold, just saying.","Even the palms stopped swaying to watch. Somewhere in Rotterdam, someone is scraping ice off a windscreen."],
  par:["Solid, steady, sunny. That’s more than you can say for the weather back home.","Par in 28 degrees. Your colleagues in the office would like a word."],
  over:["The palms were cheering for you anyway. Tomorrow’s hole is waiting, and so is the beach.","A few extra swings, a few extra minutes in the sun. We’d call that a win."]
};
function scoreName(){const d=strokes-hole.par;return strokes===1?'Hole in one':(NAMES[String(d)]||('+'+d))}
function showEnd(){emit('holed',{num:hole.num,strokes:strokes,best_m:strokes===1||!isFinite(closest)?0:Math.round(closest*10)/10});
  const diff=strokes-hole.par;$('endKicker').textContent='Hole '+hole.num+', par '+hole.par;$('endScore').textContent=strokes;$('endName').textContent=scoreName();
  const pool=diff<0?LINES.great:diff===0?LINES.par:LINES.over;$('endLine').textContent=pool[Math.floor(Math.random()*pool.length)];
  const other=(HOLES.indexOf(hole)+1)%HOLES.length;$('nextBtn').textContent='Play hole '+HOLES[other].num;$('nextBtn').dataset.hole=other;
  $('shareBtn').textContent='Share score';$('endOverlay').hidden=false;$('nextBtn').focus();
}
document.querySelectorAll('.holepick').forEach(b=>b.onclick=()=>{$('introOverlay').hidden=true;closeMap();startHole(+b.dataset.hole)});
$('nextBtn').onclick=()=>{$('endOverlay').hidden=true;startHole(+$('nextBtn').dataset.hole)};
$('againBtn').onclick=()=>{$('endOverlay').hidden=true;startHole(HOLES.indexOf(hole))};
$('mapBtn').onclick=()=>{if(mapMode||look){mapMode=false;look=null}else{mapMode=true}syncMapBtn()};
$('shareBtn').onclick=async()=>{
  const text='I played Blue Bay hole '+hole.num+' in '+strokes+' ('+scoreName()+'). Beat me before Christmas.';
  try{if(navigator.share){await navigator.share({text:text});return}await navigator.clipboard.writeText(text);$('shareBtn').textContent='Score copied'}catch(e){}
};

const MAPW=1374,MAPH=1145;
const MARKS=window.BB_DATA.marks,CARD=window.BB_DATA.card,HCP=window.BB_DATA.hcp,TIPS=window.BB_DATA.tips;
function genericTips(n){const h=HCP[n],lvl=h<=6?'one of the toughest holes out here':h<=12?'a fair test, right in the middle of the pack':'one of the more forgiving holes on the course';
 return["Hole "+n+", par "+CARD[n][0]+". Handicap "+h+" makes it "+lvl+".","I’m still walking this one with the greenkeepers. It’ll be playable soon. For now, try holes 1 to 4, 6 or 7."]}
let dlg={lines:[],i:0,c:0,timer:null};
function typeLine(){clearInterval(dlg.timer);const full=dlg.lines[dlg.i];dlg.c=0;$('dlgMore').hidden=true;if(window.Steffen)Steffen.say(full);
 if(reduceMotion){$('dlgText').textContent=full;lineDone();return}
 $('dlgText').textContent='';dlg.timer=setInterval(()=>{dlg.c+=2;$('dlgText').textContent=full.slice(0,dlg.c);if(window.Steffen)Steffen.speak(full.slice(0,dlg.c));if(dlg.c>=full.length){clearInterval(dlg.timer);dlg.timer=null;lineDone()}},28)}
function lineDone(){$('dlgText').textContent=dlg.lines[dlg.i];$('dlgMore').hidden=dlg.i>=dlg.lines.length-1;$('dlg').setAttribute('aria-label',dlg.i>=dlg.lines.length-1?'Start over':'Next tip')}
function advance(){if(dlg.timer){clearInterval(dlg.timer);dlg.timer=null;lineDone();return}dlg.i=(dlg.i+1)%dlg.lines.length;typeLine()}
$('dlg').addEventListener('click',advance);$('dlg').addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();advance()}});
const mapEl=$('courseMap'),layer=$('mapLayer'),marksEl=$('marks');
let mv={s:1,x:0,y:0,min:1},mp=new Map(),mPan=null,mMoved=0,selNum=null;
const markBtns={};
Object.keys(MARKS).forEach(n=>{n=+n;const live=HOLES.some(h=>h.num===n);const b=document.createElement('button');
  b.className='hmark '+(live?'live':'soon');b.textContent=n;b.setAttribute('aria-label','Hole '+n+(live?'':', coming soon'));
  b.addEventListener('click',()=>{if(mMoved>8)return;selectHole(n)});
  b.addEventListener('focus',()=>{const w=mapEl.clientWidth,h=mapEl.clientHeight,x=MARKS[n][0]*mv.s+mv.x,y=MARKS[n][1]*mv.s+mv.y;
    if(x<40||y<90||x>w-40||y>h-40){mv.x+=w/2-x;mv.y+=h/2-y;mapApply()}});
  marksEl.appendChild(b);markBtns[n]=b});
function mapFit(){const w=mapEl.clientWidth,h=mapEl.clientHeight;mv.min=Math.min(w/MAPW,h/MAPH);
  const s=Math.max(mv.min,Math.min(w/MAPW*1.6,h/MAPH));mv.s=s;mv.x=(w-MAPW*s)/2;mv.y=(h-MAPH*s)/2;mapApply()}
function mapClamp(){const w=mapEl.clientWidth,h=mapEl.clientHeight,mw=MAPW*mv.s,mh=MAPH*mv.s;
  mv.x=mw<=w?(w-mw)/2:Math.min(0,Math.max(w-mw,mv.x));mv.y=mh<=h?(h-mh)/2:Math.min(0,Math.max(h-mh,mv.y))}
function mapApply(){mapClamp();layer.style.transform='translate('+mv.x+'px,'+mv.y+'px) scale('+mv.s+')';
  for(const n in MARKS){const b=markBtns[n];b.style.left=(MARKS[n][0]*mv.s+mv.x)+'px';b.style.top=(MARKS[n][1]*mv.s+mv.y)+'px'}}
function mapZoom(f,cx,cy){const ns=Math.min(Math.max(mv.s*f,mv.min),mv.min*5);const k=ns/mv.s;mv.x=cx-(cx-mv.x)*k;mv.y=cy-(cy-mv.y)*k;mv.s=ns;mapApply()}
function mmid(){let x=0,y=0;mp.forEach(p=>{x+=p.x;y+=p.y});const r=mapEl.getBoundingClientRect();return{x:x/mp.size-r.left,y:y/mp.size-r.top}}
function mdist(){const a=[...mp.values()];return a.length<2?0:Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y)}
mapEl.addEventListener('pointerdown',e=>{if(e.target.closest('.sheet,.maphead'))return;mp.set(e.pointerId,{x:e.clientX,y:e.clientY});if(mp.size===1)mMoved=0;mPan={m:mmid(),d:mdist()}});
mapEl.addEventListener('pointermove',e=>{if(!mp.has(e.pointerId))return;mp.set(e.pointerId,{x:e.clientX,y:e.clientY});const m=mmid(),d=mdist();
  mMoved+=Math.hypot(m.x-mPan.m.x,m.y-mPan.m.y);mv.x+=m.x-mPan.m.x;mv.y+=m.y-mPan.m.y;
  if(mp.size>=2&&mPan.d>0&&d>0){mMoved+=10;mapZoom(d/mPan.d,m.x,m.y)}else mapApply();mPan={m:m,d:d}});
function mUp(e){mp.delete(e.pointerId);if(mp.size)mPan={m:mmid(),d:mdist()}}
mapEl.addEventListener('pointerup',mUp);mapEl.addEventListener('pointercancel',mUp);
mapEl.addEventListener('wheel',e=>{e.preventDefault();const r=mapEl.getBoundingClientRect();mapZoom(e.deltaY<0?1.12:1/1.12,e.clientX-r.left,e.clientY-r.top)},{passive:false});
function selectHole(n){selNum=n;for(const k in markBtns)markBtns[k].classList.toggle('sel',+k===n);const live=HOLES.some(h=>h.num===n);
  $('sheetTitle').textContent='Hole '+n;$('statPar').textContent=CARD[n][0];$('statHcp').textContent=HCP[n];
  const pi=$('proImg');pi.style.animation='none';void pi.offsetWidth;pi.style.animation='';
  dlg.lines=(TIPS[n]||genericTips(n)).slice();if(live)dlg.lines.splice(1,0,windTip(n));dlg.i=0;
  $('sheetPlay').disabled=!live;$('sheetPlay').textContent=live?'Play':'Soon';$('sheet').hidden=false;typeLine()}
function openMap(){state='intro';$('introOverlay').hidden=true;$('endOverlay').hidden=true;$('sheet').hidden=true;mapEl.classList.add('open');mapFit();
  for(const k in markBtns)markBtns[k].classList.remove('sel')}
function closeMap(){mapEl.classList.remove('open');clearInterval(dlg.timer);dlg.timer=null}
$('sheetClose').onclick=()=>{$('sheet').hidden=true;clearInterval(dlg.timer);dlg.timer=null;for(const k in markBtns)markBtns[k].classList.remove('sel')};
$('sheetPlay').onclick=()=>{const i=HOLES.findIndex(h=>h.num===selNum);if(i<0)return;closeMap();startHole(i)};
$('openMapBtn').onclick=openMap;$('endMapBtn').onclick=openMap;$('courseBtn').onclick=openMap;
document.querySelectorAll('.loft button').forEach(b=>b.onclick=()=>{loft=+b.dataset.loft;document.querySelectorAll('.loft button').forEach(x=>x.setAttribute('aria-pressed',x===b))});
// Menu from the map: keep the course map behind the menu instead of jumping to a hole.
$('mapMenuBtn').onclick=()=>{$('sheet').hidden=true;clearInterval(dlg.timer);dlg.timer=null;for(const k in markBtns)markBtns[k].classList.remove('sel');$('introOverlay').hidden=false};
addEventListener('resize',()=>{if(mapEl.classList.contains('open'))mapApply()});

function w2s(x,y){return[(x-cam.x)*scale+W/2,(y-cam.y)*scale+H/2]}
function roundRect(x,y,w,h,r){ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function draw(dt){
  if(!ball)return;
  let tS=baseScale,tx=ball.x,ty=ball.y;const aim=dragInfo();
  if(mapMode){tS=fitScale;tx=look?look.x:hole.w/2;ty=look?look.y:hole.h/2}
  else if(look&&!(aim&&aim.p>0)){tx=look.x;ty=look.y}
  else if(aim&&state==='ready'&&!window.BB.demoNoZoom){
    const lp=aim.p>0?landing(aim):{x:ball.x,y:ball.y},lx=lp.x,ly=lp.y;
    const x0=Math.min(ball.x,lx,hole.pin.x),x1=Math.max(ball.x,lx,hole.pin.x),y0=Math.min(ball.y,ly,hole.pin.y),y1=Math.max(ball.y,ly,hole.pin.y);
    const need=Math.min((W*0.82)/Math.max(x1-x0,1),((H-190)*0.85)/Math.max(y1-y0,1));
    tS=Math.max(Math.min(baseScale,need),fitScale);tx=(x0+x1)/2;ty=(y0+y1)/2;
  }
  scale+=(tS-scale)*(reduceMotion?1:Math.min(dt*5,1));
  const halfW=W/2/scale,halfH=H/2/scale;
  if(look){look.x=Math.min(Math.max(look.x,halfW),hole.w-halfW);look.y=Math.min(Math.max(look.y,halfH),hole.h-halfH);if(hole.w<=W/scale)look.x=hole.w/2;if(hole.h<=H/scale)look.y=hole.h/2}
  const ox=halfW*0.4,oy=halfH*0.3;
  tx=hole.w<=W/scale?hole.w/2:Math.min(Math.max(tx,halfW-ox),hole.w-halfW+ox);
  ty=hole.h<=H/scale?hole.h/2:Math.min(Math.max(ty,halfH-oy),hole.h-halfH+oy);
  const lerp=(reduceMotion||pan||look)?1:Math.min(dt*4,1);cam.x+=(tx-cam.x)*lerp;cam.y+=(ty-cam.y)*lerp;

  ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle=hole.bg;ctx.fillRect(0,0,W,H);
  ctx.imageSmoothingEnabled=false;
  if(hole.img.complete){const o=w2s(0,0);ctx.drawImage(hole.img,o[0],o[1],hole.w*scale,hole.h*scale)}
  const h=w2s(hole.pin.x,hole.pin.y);
  ctx.fillStyle='#10301c';ctx.beginPath();ctx.ellipse(h[0],h[1]+2*scale,HOLE_R*scale,HOLE_R*scale*.7,0,0,Math.PI*2);ctx.fill();

  const d=aim,b=w2s(ball.x,ball.y);
  if(mapMode&&!(d&&d.p>0)){
    ctx.save();ctx.setLineDash([3,7]);ctx.strokeStyle='rgba(255,255,255,.85)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(h[0],h[1]);ctx.stroke();ctx.restore();
    const lbl=Math.round(Math.hypot(hole.pin.x-ball.x,hole.pin.y-ball.y)*hole.m)+' m to the pin';
    ctx.font='500 13px Outfit, system-ui, sans-serif';const tw=ctx.measureText(lbl).width+18;
    const mx=(b[0]+h[0])/2,my=(b[1]+h[1])/2;ctx.fillStyle='rgba(30,42,99,.9)';roundRect(mx-tw/2,my-13,tw,26,13);ctx.fill();
    ctx.fillStyle='#F4ECDD';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(lbl,mx,my);
  }
  if(d&&d.p>0&&state==='ready'){
    const putt=isPutt(),dist=predict(d.p);
    const col=d.p<0.6?'#FFFFFF':d.p<0.92?'#E8892B':'#E0443A';
    const lp=landing(d),e=w2s(lp.x,lp.y);
    if(putt){
      ctx.save();ctx.setLineDash([2,9]);ctx.lineCap='round';ctx.lineWidth=4;ctx.strokeStyle=col;ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(b[0]+d.ux*(40+60*d.p),b[1]+d.uy*(40+60*d.p));ctx.stroke();ctx.restore();
    }else{
      ctx.save();ctx.setLineDash([2,8]);ctx.lineCap='round';ctx.lineWidth=2;ctx.strokeStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.moveTo(b[0],b[1]);{const L0=launch(d);for(let i=1;i<=20;i++){const tt=L0.T*i/20,s=w2s(ball.x+d.ux*L0.hv*tt,ball.y+d.uy*L0.hv*tt);ctx.lineTo(s[0],s[1])}}ctx.stroke();ctx.restore();
      const L=launch(d),hv=L.hv,vz=L.vz,T=L.T;
      const n=Math.max(8,Math.round(Math.hypot(e[0]-b[0],e[1]-b[1])/11));
      for(let i=1;i<n;i++){const tt=T*i/n,x=ball.x+d.ux*hv*tt,y=ball.y+d.uy*hv*tt,z=(vz*tt-G0*tt*tt/2)/hole.k,s=w2s(x,y);
        const rr=2.2+1.6*(z/(vz*vz/(2*G0)/hole.k||1));
        ctx.fillStyle='rgba(30,42,99,.35)';ctx.beginPath();ctx.arc(s[0]+1,s[1]-z*scale+1.5,rr,0,Math.PI*2);ctx.fill();
        ctx.fillStyle=col;ctx.beginPath();ctx.arc(s[0],s[1]-z*scale,rr,0,Math.PI*2);ctx.fill()}
    }
    if(!putt){ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle=col;ctx.lineWidth=2;ctx.beginPath();ctx.arc(e[0],e[1],Math.max(12,Math.hypot(lp.x-ball.x,lp.y-ball.y)*0.06*scale),0,Math.PI*2);ctx.stroke();ctx.restore()}
    ctx.strokeStyle='rgba(255,255,255,.5)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(b[0],b[1]);ctx.lineTo(b[0]-d.ux*d.p*60,b[1]-d.uy*d.p*60);ctx.stroke();
    const R=26;ctx.lineWidth=6;ctx.strokeStyle='rgba(30,42,99,.55)';ctx.beginPath();ctx.arc(b[0],b[1],R,0,Math.PI*2);ctx.stroke();
    ctx.strokeStyle=col;ctx.beginPath();ctx.arc(b[0],b[1],R,-Math.PI/2,-Math.PI/2+Math.PI*2*d.p);ctx.stroke();
    const label=d.p>=0.99?'Max':Math.round(d.p*100)+'%';
    ctx.font='600 16px Fraunces, Georgia, serif';ctx.textAlign='center';ctx.textBaseline='middle';
    const tw=ctx.measureText(label).width+16;ctx.fillStyle='rgba(30,42,99,.9)';roundRect(b[0]-tw/2,b[1]-R-34,tw,24,12);ctx.fill();
    ctx.fillStyle=col==='#FFFFFF'?'#F4ECDD':col;ctx.fillText(label,b[0],b[1]-R-22);
    ctx.font='500 12px Outfit, system-ui, sans-serif';ctx.fillStyle='#FFFFFF';{const cm=Math.hypot(lp.x-ball.x,lp.y-ball.y)*hole.m;ctx.fillText(putt?'Putt, about '+Math.max(1,Math.round(cm))+' m':LOFTS[loft].n+' shot, ~'+Math.round(cm/5)*5+' m, no wind',b[0],b[1]+R+16)}
  }
  if(drag&&drag.armed&&!drag.demo&&!drag.kb&&state==='ready'){
    const r=cv.getBoundingClientRect(),sx=drag.sx-r.left,sy=drag.sy-r.top,inside=d&&d.cancel,k=7;
    ctx.save();ctx.fillStyle=inside?'rgba(224,68,58,.92)':'rgba(30,42,99,.6)';ctx.beginPath();ctx.arc(sx,sy,inside?24:20,0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='#fff';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(sx-k,sy-k);ctx.lineTo(sx+k,sy+k);ctx.moveTo(sx+k,sy-k);ctx.lineTo(sx-k,sy+k);ctx.stroke();
    if(inside){const lbl='Release to cancel';ctx.font='500 13px Outfit, system-ui, sans-serif';const tw=ctx.measureText(lbl).width+18;
      ctx.fillStyle='rgba(30,42,99,.92)';roundRect(sx-tw/2,sy-60,tw,26,13);ctx.fill();ctx.fillStyle='#F4ECDD';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(lbl,sx,sy-47)}
    ctx.restore();
  }
  if(state==='ready'&&!(d&&d.p>0)){const pr=reduceMotion?0.5:(Math.sin(performance.now()/350)+1)/2;ctx.strokeStyle='rgba(232,137,43,'+(0.45+pr*0.45)+')';ctx.lineWidth=2.5;ctx.beginPath();ctx.arc(b[0],b[1],Math.max(BALL_R*scale*3,26)-6+pr*4,0,Math.PI*2);ctx.stroke()}
  if(state==='moving'||state==='sinking'){
    if(aimMark){const a=w2s(aimMark.x,aimMark.y);ctx.save();ctx.setLineDash([4,4]);ctx.strokeStyle='rgba(255,255,255,.6)';ctx.lineWidth=2;ctx.beginPath();ctx.arc(a[0],a[1],12,0,Math.PI*2);ctx.stroke();ctx.restore()}
    ctx.fillStyle='rgba(255,255,255,.55)';for(const t of trail){const s=w2s(t.x,t.y);ctx.beginPath();ctx.arc(s[0],s[1]-t.z/hole.k*scale,2,0,Math.PI*2);ctx.fill()}
  }
  if(state!=='done'){
    const zs=ball.z/hole.k;
    const r=BALL_R*scale*(1+zs/320)*ball.scale;
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.ellipse(b[0]+zs*scale*.3,b[1]+zs*scale*.45+2,BALL_R*scale*ball.scale,BALL_R*scale*.7*ball.scale,0,0,Math.PI*2);ctx.fill();
    const by=b[1]-zs*scale;ctx.fillStyle='#FFFFFF';ctx.beginPath();ctx.arc(b[0],by,Math.max(r,0),0,Math.PI*2);ctx.fill();
    ctx.strokeStyle='rgba(30,42,99,.5)';ctx.lineWidth=1.2;ctx.stroke();
  }
  if(h[0]<0||h[0]>W||h[1]<0||h[1]>H){
    const ang=Math.atan2(h[1]-H/2,h[0]-W/2),m=34;
    const px=Math.min(Math.max(W/2+Math.cos(ang)*W,m),W-m),py=Math.min(Math.max(H/2+Math.sin(ang)*H,m+70),H-m-40);
    ctx.save();ctx.translate(px,py);ctx.rotate(ang);ctx.fillStyle='rgba(30,42,99,.9)';ctx.beginPath();ctx.arc(0,0,18,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#E8892B';ctx.beginPath();ctx.moveTo(10,0);ctx.lineTo(-5,-7);ctx.lineTo(-5,7);ctx.closePath();ctx.fill();ctx.restore();
  }
  ctx.fillStyle='rgba(255,252,240,.8)';
  for(const f of flakes){f.y+=f.s*dt;f.x+=Math.sin((f.y+f.d*40)/40)*0.3+wind.ax*dt*0.12;f.y+=wind.ay*dt*0.12;if(f.y>H){f.y=-4;f.x=Math.random()*W}if(f.y<-6)f.y=H;if(f.x>W)f.x=0;if(f.x<0)f.x=W;
    ctx.beginPath();ctx.arc(f.x,f.y,f.r,0,Math.PI*2);ctx.fill()}
}
// Small API for js/tutorial.js
window.BB={
  get state(){return state},get hole(){return hole},
  ballScreen(){const r=cv.getBoundingClientRect(),s=w2s(ball.x,ball.y);return{x:s[0]+r.left,y:s[1]+r.top}},
  pinScreen(){const r=cv.getBoundingClientRect(),s=w2s(hole.pin.x,hole.pin.y);return{x:s[0]+r.left,y:s[1]+r.top}},
  demoDrag(dx,dy){const b=this.ballScreen(),l=Math.hypot(dx,dy),k=l>1?(l+CANCEL_R)/l:0;drag={sx:b.x,sy:b.y,cx:b.x+dx*k,cy:b.y+dy*k,demo:true}},
  clearDrag(){drag=null},
  demoNoZoom:false,
  startHole(num){const i=HOLES.findIndex(h=>h.num===num);if(i>=0){$('introOverlay').hidden=true;closeMap();startHole(i)}},
  get loftEl(){return document.querySelector('.loft')}
};
let prev=performance.now();
function loop(now){const dt=Math.min((now-prev)/1000,0.05);prev=now;for(let i=0;i<3;i++)step(dt/3);draw(dt);requestAnimationFrame(loop)}
ball={x:hole.tee.x,y:hole.tee.y,vx:0,vy:0,vz:0,z:0,air:false,scale:1};cam.x=ball.x;cam.y=ball.y;resize();updateHud();requestAnimationFrame(loop);
})();
