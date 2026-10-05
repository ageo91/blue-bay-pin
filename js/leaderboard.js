// Today's leaderboard, per hole. No account: the first time a player posts a score we sign them in
// anonymously (Supabase) and they pick a name, shown as Name#1234. Database setup: supabase/leaderboard.sql.
// Listens to bb:holed from js/game.js. Hidden entirely when js/config.js has no Supabase details.
(function(){
const $=id=>document.getElementById(id);
const cfg=window.BB_CONFIG||{};
const on=!!(cfg.supabaseUrl&&cfg.supabaseKey&&window.supabase);
document.querySelectorAll('[data-lb]').forEach(el=>el.hidden=!on);
if(!on)return;

const sb=window.supabase.createClient(cfg.supabaseUrl,cfg.supabaseKey,{auth:{persistSession:true,storageKey:'bb_auth'}});
const NAME_OK=/^[A-Za-z0-9_ ]{3,16}$/;
let me=null,pending=null,shown=null;

async function userId(){const {data}=await sb.auth.getSession();return data.session?data.session.user.id:null}
async function signIn(){if(await userId())return;const {error}=await sb.auth.signInAnonymously();if(error)throw error}
async function loadMe(){const id=await userId();if(!id)return null;
  const {data}=await sb.from('players').select('name,tag').eq('user_id',id).maybeSingle();me=data;return me}
async function pickName(name){
  await signIn();
  for(let i=0;i<4;i++){   // the #tag is random; on the rare clash, just try again
    const {data,error}=await sb.from('players').insert({name:name}).select('name,tag').single();
    if(!error){me=data;return me}
    if(error.code!=='23505')throw error}
  throw new Error('name_taken');
}
async function submit(s){const {data,error}=await sb.rpc('submit_score',{p_hole:s.num,p_strokes:s.strokes,p_best_m:s.best_m});if(error)throw error;return data&&data[0]}
async function board(num){const {data,error}=await sb.rpc('leaderboard',{p_hole:num});if(error)throw error;return data||[]}

function errText(e){const m=(e&&e.message)||'';
  if(/name_not_allowed/.test(m))return "That name isn't allowed. Try another one.";
  if(/too_fast/.test(m))return 'Hold on a few seconds, then try again.';
  if(/name_taken/.test(m))return 'That name is busy right now. Try again.';
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
