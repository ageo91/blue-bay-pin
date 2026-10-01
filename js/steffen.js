// Steffen, animated. Cuts assets/steffen.png into layers (body, head, talking hand) and draws them on
// any <canvas data-steffen>: blinking, mouth shapes while he talks, and a pose per line of dialogue.
// Pixel boxes below are in steffen.png (320x598). If the artwork changes, update them.
// API: Steffen.say(line) when a new line starts, Steffen.speak(textSoFar) while it types out.
(function(){
const SRC='assets/steffen.png',IW=320,IH=598,PAD={l:14,t:10,r:10};
const EYES=[{x0:144,x1:163,y0:73,y1:88},{x0:182,x1:204,y0:74,y1:90}];
const MOUTH={x0:155,x1:190,y0:111,y1:120};
const HEAD_CUT=146,HEAD_KEEP=138,HEAD_PIVOT={x:175,y:140};   // head layer rows 0..145, body keeps rows from 138
const HAND={x1:72,y0:205,y1:286,clear:62,pivot:{x:66,y:278}};  // hand layer x<72, body cleared x<62, pivot at the bottom of the wrist
// Poses: hand = wrist angle (deg, + lifts the fingers), head = tilt (deg), lean = whole body (deg).
const POSES={
  rest:{hand:0,head:0,lean:0},
  explain:{hand:12,head:-2,lean:.8},
  point:{hand:-5,head:2,lean:-.8},
  think:{hand:-6,head:4,lean:0},
  excited:{hand:18,head:-3,lean:1.4,hop:1}
};
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
let ready=false,still=null,body,hand,heads=[],last='rest';
const cur={hand:0,head:0,lean:0},tgt=Object.assign({},POSES.rest);
let hopT=-1,speakUntil=0,mouth=0,mouthAt=0,lastCh=' ',blink=0,nextBlink=performance.now()+2500,blinkT=-1,blinkTwice=false;

function layer(w,h){const c=document.createElement('canvas');c.width=w;c.height=h;return c}
function build(img){
  const src=layer(IW,IH),sx=src.getContext('2d');sx.drawImage(img,0,0);
  const px=sx.getImageData(0,0,IW,IH),d=px.data;
  const at=(x,y)=>(y*IW+x)*4,col=(x,y)=>{const i=at(x,y);return[d[i],d[i+1],d[i+2],d[i+3]]};
  const isW=(x,y)=>{const i=at(x,y),l=(d[i]+d[i+1]+d[i+2])/3;return d[i+3]>128&&l>200&&Math.max(d[i],d[i+1],d[i+2])-Math.min(d[i],d[i+1],d[i+2])<40};
  const isSkin=(x,y)=>{const i=at(x,y);return d[i+3]>128&&d[i]>165&&d[i+1]>95&&d[i+2]<150&&!isW(x,y)};
  const LID=col(170,74),SKIN=col(165,92),LASH=col(150,74),LIP=col(175,122),DARK=[74,28,22,255];
  // body without the head and the hand
  body=layer(IW,IH);const bx=body.getContext('2d');bx.drawImage(img,0,0);
  bx.clearRect(0,0,IW,HEAD_KEEP);bx.clearRect(0,HAND.y0,HAND.clear,HAND.y1-HAND.y0);
  hand=layer(HAND.x1,HAND.y1-HAND.y0);hand.getContext('2d').drawImage(img,0,HAND.y0,HAND.x1,HAND.y1-HAND.y0,0,0,HAND.x1,HAND.y1-HAND.y0);
  // mouth columns: the rows the teeth cover in each column
  const span={};for(let x=MOUTH.x0;x<=MOUTH.x1;x++){let t=-1,b=-1;for(let y=MOUTH.y0;y<=MOUTH.y1;y++)if(isW(x,y)){if(t<0)t=y;b=y}if(t>=0)span[x]=[t,b]}
  // 3 eye states (open, half, closed) x 3 mouths (smile, closed, open)
  for(let e=0;e<3;e++){heads[e]=[];for(let m=0;m<3;m++){
    const f=new ImageData(new Uint8ClampedArray(d),IW,IH),q=f.data,put=(x,y,c)=>{const i=at(x,y);q[i]=c[0];q[i+1]=c[1];q[i+2]=c[2];q[i+3]=c[3]};
    // eyelids: per column, paint over the eye pixels with the skin just above and below it, then a lash line
    if(e>0)for(const E of EYES){const cols=[];
      for(let x=E.x0;x<=E.x1;x++){let t=-1,b=-1;for(let y=E.y0;y<=E.y1;y++)if(!isSkin(x,y)){if(t<0)t=y;b=y}if(t>=0)cols.push([x,t,b])}
      if(!cols.length)continue;const T=Math.min(...cols.map(c=>c[1])),B=Math.max(...cols.map(c=>c[2]));
      const lineY=Math.round(T+(B-T)*(e===2?.68:.42)),xa=cols[0][0],xb=cols[cols.length-1][0];
      const avg=y=>{const a=[0,0,0];let n=0;for(let x=xa;x<=xb;x++)if(isSkin(x,y)){const c=col(x,y);a[0]+=c[0];a[1]+=c[1];a[2]+=c[2];n++}return n?[a[0]/n,a[1]/n,a[2]/n,255]:null};
      let ya=T-1;while(ya>T-6&&!avg(ya))ya--;let yb=B+1;while(yb<B+6&&!avg(yb))yb++;
      const ca=avg(ya)||LID,cb=avg(yb)||SKIN,shade=y=>{const k=e===2?Math.max(0,Math.min(1,(y-T)/(B-T||1))):0;return ca.map((v,i)=>Math.round(v+(cb[i]-v)*k))};
      for(const [x,t,b] of cols){for(let y=t;y<=(e===2?b:Math.min(b,lineY));y++)put(x,y,shade(y));
        if(x>xa&&x<xb)put(x,lineY+(e===2&&(x<xa+3||x>xb-3)?-1:0),LASH)}}
    if(m>0)for(const k in span){const x=+k,[t,b]=span[k];
      if(m===1){for(let y=t;y<=b;y++)put(x,y,LIP);put(x,Math.round(t+(b-t)*.35),LASH)}
      else for(let y=t+2;y<=b;y++)put(x,y,(y===b&&b-t>4)?col(x,b):DARK)}
    const c=layer(IW,HEAD_CUT);c.getContext('2d').putImageData(f,0,0,0,0,IW,HEAD_CUT);heads[e][m]=c}}
  ready=true;
}
// Opened as a local file, Chrome won't let us read the pixels: fall back to the plain picture.
const img=new Image();img.onload=()=>{try{build(img)}catch(e){still=img}};img.src=SRC;

function pickPose(line){
  let p=/!/.test(line)?'excited':/\?/.test(line)?'think':/\b(aim|left|right|look|tap|here|arrow)\b/i.test(line)?'point':'explain';
  if(p===last)p=p==='explain'?'rest':'explain';return p}
function say(line){
  if(reduceMotion)return;last=pickPose(line||'');Object.assign(tgt,{hand:0,head:0,lean:0},POSES[last]);
  if(POSES[last].hop)hopT=0;
}
function speak(soFar){speakUntil=performance.now()+160;lastCh=(soFar||' ').slice(-1)}

function draw(cv,now){
  const W=IW+PAD.l+PAD.r,H=IH+PAD.t;if(cv.width!==W){cv.width=W;cv.height=H}
  const x=cv.getContext('2d');x.setTransform(1,0,0,1,0,0);x.clearRect(0,0,W,H);x.imageSmoothingEnabled=false;
  const talking=now<speakUntil,sway=reduceMotion?0:Math.sin(now/260);
  const breath=reduceMotion?0:Math.round((Math.sin(now/900)+1)/2);
  const hop=hopT>=0?Math.sin(Math.min(hopT,1)*Math.PI)*6:0;
  // lean the whole figure around his feet
  x.translate(PAD.l+IW/2,PAD.t+IH-hop);x.rotate(cur.lean*Math.PI/180);x.translate(-IW/2,-IH);
  x.drawImage(body,0,0);
  x.save();x.translate(HAND.pivot.x,HAND.pivot.y+breath);x.rotate((cur.hand+(talking?sway*4:0))*Math.PI/180);
  x.drawImage(hand,-HAND.pivot.x,HAND.y0-HAND.pivot.y);x.restore();
  x.save();x.translate(HEAD_PIVOT.x,HEAD_PIVOT.y+breath);x.rotate((cur.head+(talking?Math.sin(now/180)*1.2:0))*Math.PI/180);
  x.drawImage(heads[blink][mouth],-HEAD_PIVOT.x,-HEAD_PIVOT.y);x.restore();
}
let prev=performance.now();
function tick(now){
  const dt=Math.min((now-prev)/1000,.05);prev=now;
  if(still)document.querySelectorAll('canvas[data-steffen]').forEach(cv=>{if(cv.width!==IW){cv.width=IW;cv.height=IH;cv.getContext('2d').drawImage(still,0,0)}});
  if(ready){
    const k=Math.min(dt*7,1);for(const n in cur)cur[n]+=(tgt[n]-cur[n])*k;
    if(hopT>=0){hopT+=dt*3.2;if(hopT>1)hopT=-1}
    // blink: half, closed, half, sometimes twice
    if(blinkT<0&&now>nextBlink){blinkT=now;blinkTwice=Math.random()<.18}
    if(blinkT>=0){const t=now-blinkT;blink=t<0?0:t<50?1:t<130?2:t<180?1:0;
      if(t>=180){if(blinkTwice){blinkTwice=false;blinkT=now+90}else{blinkT=-1;nextBlink=now+2200+Math.random()*4000}}}
    // mouth: change shape about 11 times a second while text is typing
    if(now<speakUntil){if(now-mouthAt>90){mouthAt=now;
      mouth=/[aeiouy]/i.test(lastCh)?(mouth===2?1:2):/[mbp]/i.test(lastCh)?1:/[\s.,!?]/.test(lastCh)?0:(mouth===1?2:1)}}
    else if(mouth!==0&&now-mouthAt>90)mouth=0;
    document.querySelectorAll('canvas[data-steffen]').forEach(cv=>{if(cv.getClientRects().length)draw(cv,now)});
  }
  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
window.Steffen={say:say,speak:speak};
})();
