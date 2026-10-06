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
  if(/name_not_allowed/.test(m))return 'That name isn\u2019t allowed. Try another one.';
  if(/too_fast/.test(m))return 'Hold on a few seconds, then try again.';
  if(/name_taken/.test(m))return 'That name is busy right now. Try again.';
  if(/too_many/.test(m))return 'Too many new names from this connection. Try again later.';
  if(/bad_name/.test(m))return 'Use 3 to 16 letters, numbers, spaces or _.';
  if(/no_player/.test(m)){me=null;$('lbJoin').hidden=false;return 'Pick a name to post your score.'}
  return 'Couldn\u2019t reach the leaderboard. Check your connection and try again.'}
function who(p){return p.name+'#'+p.tag}
function showResult(r,s){
  $('lbJoin').hidden=true;$('lbErr').hidden=true;const el=$('lbResult');el.hidden=false;
  if(!r){el.textContent='Score saved.';return}
  const better=r.strokes<s.strokes||(r.strokes===s.strokes&&r.best_m<s.best_m);
  el.textContent=(better?'Your best today still counts: '+r.strokes+(r.strokes===1?' stroke':' strokes')+'. ':'')+
    who(me)+', you\u2019re #'+r.rank+' of '+r.players+' today on hole '+s.num+'.';
}
// Errors sit under the name field and are tied to it, so screen readers read them with the field.
function showErr(msg,onField){const el=$('lbErr'),f=$('lbName');el.textContent=msg;el.hidden=!msg;
  if(msg&&onField){f.setAttribute('aria-invalid','true');f.setAttribute('aria-describedby','lbErr lbHelp');f.focus()}
  else{f.removeAttribute('aria-invalid');f.setAttribute('aria-describedby','lbHelp')}
  if(msg&&!onField)el.setAttribute('role','alert');else el.removeAttribute('role')}
async function post(){
  const s=pending;if(!s)return;showErr('');$('lbResult').hidden=true;
  try{const r=await submit(s);pending=null;showResult(r,s)}
  catch(e){showErr(errText(e),false)}
}

// End of a hole: post straight away if the player already has a name, otherwise offer the name form.
addEventListener('bb:holed',e=>{
  const d=e.detail||{};pending={num:d.num,strokes:d.strokes,best_m:d.best_m};
  $('lbBox').hidden=false;$('lbResult').hidden=true;showErr('');
  if(me){$('lbJoin').hidden=true;post()}else{$('lbJoin').hidden=false}
});
$('lbJoin').addEventListener('submit',async e=>{
  e.preventDefault();const name=$('lbName').value.trim().replace(/\s+/g,' ');
  if(!NAME_OK.test(name)){showErr(name.length<3?'Use at least 3 characters.':'Use only letters, numbers, spaces or _.',true);return}
  const btn=$('lbJoin').querySelector('button');btn.disabled=true;btn.textContent='Posting…';
  try{await pickName(name);await post()}catch(err){showErr(errText(err),/name/.test(err.message))}
  btn.disabled=false;btn.textContent='Post';
});

// The board itself
const holes=window.BB_DATA.holes.map(h=>h.num);
// Hole picker: plain toggle buttons (one pressed), not a tab widget
function tabs(){const t=$('lbTabs');
  if(!t.children.length)holes.forEach(n=>{const b=document.createElement('button');b.type='button';b.textContent=n;
    b.setAttribute('aria-label','Hole '+n);b.onclick=()=>show(n);t.appendChild(b)});
  [...t.children].forEach((b,i)=>b.setAttribute('aria-pressed',holes[i]===shown))}
const fmt=new Intl.NumberFormat(undefined,{minimumFractionDigits:1,maximumFractionDigits:1});
function cell(cls,text){const td=document.createElement('td');td.className=cls;td.textContent=text;return td}
async function show(num){
  shown=num;tabs();$('lbTitle').textContent='Hole '+num;$('lbCaption').textContent='Today\u2019s leaderboard for hole '+num;
  const list=$('lbList');list.textContent='';
  const msg=t=>{const tr=document.createElement('tr'),td=cell('lbempty',t);td.colSpan=4;tr.appendChild(td);list.appendChild(tr)};
  msg('Loading…');
  let rows;try{rows=await board(num)}catch(e){list.textContent='';msg(errText(e));return}
  if(shown!==num)return;list.textContent='';
  if(!rows.length){msg('No scores yet today on hole '+num+'. Finish the hole to post the first one.');return}
  rows.forEach(r=>{const tr=document.createElement('tr');if(r.is_me)tr.className='me';
    const nm=cell('nm',r.name),tg=document.createElement('small');tg.textContent='#'+r.tag;nm.appendChild(tg);
    if(r.is_me){const y=document.createElement('span');y.className='you';y.textContent='You';nm.appendChild(y)}
    tr.append(cell('rk',r.rank),nm,cell('sc',r.strokes),cell('bm',r.strokes===1?'Ace':fmt.format(r.best_m)+'\u00a0m'));list.appendChild(tr)});
}
function open(num){$('lbOverlay').hidden=false;show(num||(window.BB&&BB.hole?BB.hole.num:holes[0]))}
$('lbOpenBtn').onclick=()=>open(pending?pending.num:BB.hole.num);
$('lbMenuBtn').onclick=()=>open();
$('lbClose').onclick=()=>{$('lbOverlay').hidden=true};
addEventListener('keydown',e=>{if(e.key==='Escape'&&!$('lbOverlay').hidden)$('lbOverlay').hidden=true});

loadMe().catch(()=>{});
})();
