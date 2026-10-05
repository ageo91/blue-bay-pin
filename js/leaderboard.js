// Today's leaderboard, per hole. No account: the first time a player posts a score they pick a name,
// shown as Name#1234, and the API gives this device a secret token (kept in localStorage).
// API: worker/ (Cloudflare Worker + D1). Listens to bb:holed from js/game.js. Hidden when js/config.js has no apiUrl.
(function(){
const $=id=>document.getElementById(id);
const cfg=window.BB_CONFIG||{};
const API=(cfg.apiUrl||'').replace(/\/$/,''),on=!!API;
document.querySelectorAll('[data-lb]').forEach(el=>el.hidden=!on);
if(!on)return;

const NAME_OK=/^[A-Za-z0-9_ ]{3,16}$/,TOKEN='bb_token';
let me=null,pending=null,shown=null;

function token(){try{return localStorage.getItem(TOKEN)}catch(e){return null}}
async function call(method,path,data){
  const h={'Content-Type':'application/json'},t=token();if(t)h.Authorization='Bearer '+t;
  const r=await fetch(API+path,{method:method,headers:h,body:data?JSON.stringify(data):undefined});
  const j=await r.json().catch(()=>({}));if(!r.ok)throw new Error(j.error||'http_'+r.status);return j}
async function loadMe(){if(!token())return null;try{me=await call('GET','/me')}catch(e){me=null}return me}
async function pickName(name){const j=await call('POST','/player',{name:name});
  if(j.token)try{localStorage.setItem(TOKEN,j.token)}catch(e){}
  me={name:j.name,tag:j.tag};return me}
async function submit(s){return call('POST','/score',{hole:s.num,strokes:s.strokes,best_m:s.best_m})}
async function board(num){return (await call('GET','/board?hole='+num)).rows}

function errText(e){const m=(e&&e.message)||'';
  if(/name_not_allowed/.test(m))return "That name isn't allowed. Try another one.";
  if(/too_fast/.test(m))return 'Hold on a few seconds, then try again.';
  if(/name_taken/.test(m))return 'That name is busy right now. Try again.';
  if(/too_many/.test(m))return 'Too many new names from this connection. Try again later.';
  if(/bad_name/.test(m))return 'Use 3 to 16 letters, numbers, spaces or _.';
  if(/no_player/.test(m)){me=null;$('lbJoin').hidden=false;return 'Pick a name to post your score.'}
  return "Couldn't reach the leaderboard. Check your connection and try again."}
function who(p){return p.name+'#'+p.tag}
function showResult(r,s){
  $('lbJoin').hidden=true;$('lbErr').hidden=true;const el=$('lbResult');el.hidden=false;
  if(!r){el.textContent='Score saved.';return}
  const better=r.strokes<s.strokes||(r.strokes===s.strokes&&r.best_m<s.best_m);
  el.textContent=(better?'Your best today still counts: '+r.strokes+(r.strokes===1?' stroke':' strokes')+'. ':'')+
    who(me)+', you\'re #'+r.rank+' of '+r.players+' today on hole '+s.num+'.';
}
async function post(){
  const s=pending;if(!s)return;$('lbErr').hidden=true;$('lbResult').hidden=true;
  try{const r=await submit(s);pending=null;showResult(r,s)}
  catch(e){$('lbErr').textContent=errText(e);$('lbErr').hidden=false}
}

// End of a hole: post straight away if the player already has a name, otherwise offer the name form.
addEventListener('bb:holed',e=>{
  const d=e.detail||{};pending={num:d.num,strokes:d.strokes,best_m:d.best_m};
  $('lbBox').hidden=false;$('lbResult').hidden=true;$('lbErr').hidden=true;
  if(me){$('lbJoin').hidden=true;post()}else{$('lbJoin').hidden=false}
});
$('lbJoin').addEventListener('submit',async e=>{
  e.preventDefault();const name=$('lbName').value.trim().replace(/\s+/g,' ');
  if(!NAME_OK.test(name)){$('lbErr').textContent='Use 3 to 16 letters, numbers, spaces or _.';$('lbErr').hidden=false;return}
  const btn=$('lbJoin').querySelector('button');btn.disabled=true;
  try{await pickName(name);await post()}catch(err){$('lbErr').textContent=errText(err);$('lbErr').hidden=false}
  btn.disabled=false;
});

// The board itself
const holes=window.BB_DATA.holes.map(h=>h.num);
function tabs(){const t=$('lbTabs');t.textContent='';
  holes.forEach(n=>{const b=document.createElement('button');b.type='button';b.textContent=n;b.setAttribute('role','tab');
    b.setAttribute('aria-selected',n===shown);b.setAttribute('aria-label','Hole '+n);b.onclick=()=>show(n);t.appendChild(b)})}
async function show(num){
  shown=num;tabs();$('lbTitle').textContent='Hole '+num;const list=$('lbList');list.textContent='';
  const msg=t=>{const li=document.createElement('li');li.className='lbempty';li.textContent=t;list.appendChild(li)};
  msg('Loading…');
  let rows;try{rows=await board(num)}catch(e){list.textContent='';msg(errText(e));return}
  if(shown!==num)return;list.textContent='';
  if(!rows.length){msg('No scores yet today. Be the first!');return}
  rows.forEach(r=>{const li=document.createElement('li');if(r.is_me)li.className='me';
    const rk=document.createElement('span');rk.className='rk';rk.textContent=r.rank;
    const nm=document.createElement('span');nm.className='nm';nm.textContent=r.name;const tg=document.createElement('small');tg.textContent='#'+r.tag;nm.appendChild(tg);
    const sc=document.createElement('span');sc.className='sc';sc.textContent=r.strokes;
    const bm=document.createElement('span');bm.className='bm';bm.textContent=r.strokes===1?'ace':r.best_m.toFixed(1)+' m';
    li.append(rk,nm,sc,bm);list.appendChild(li)});
}
function open(num){$('lbOverlay').hidden=false;show(num||(window.BB&&BB.hole?BB.hole.num:holes[0]));$('lbClose').focus()}
$('lbOpenBtn').onclick=()=>open(pending?pending.num:BB.hole.num);
$('lbMenuBtn').onclick=()=>open();
$('lbClose').onclick=()=>{$('lbOverlay').hidden=true};
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('lbOverlay').hidden)$('lbOverlay').hidden=true});

loadMe().catch(()=>{});
})();
