/* Premium shell enhancements; source of truth remains the authenticated RASD API. */
(function(){'use strict';
const $=id=>document.getElementById(id);
const pages=[['/ai-command','مركز القيادة','Command Center'],['/dashboard','لوحة المعلومات','Dashboard'],['/training','مسارات التدريب','Training'],['/readiness','الجاهزية','Readiness'],['/analytics','التحليلات','Analytics'],['/learner-profile','الملف التعليمي','Learning Profile']];
const lang=()=>document.documentElement.lang==='en'?'en':'ar';
function local(ar,en){return lang()==='ar'?ar:en}
function translate(){document.querySelectorAll('[data-ar][data-en]').forEach(x=>{x.textContent=x.getAttribute('data-'+lang())})}
const observer=new MutationObserver(translate);observer.observe(document.documentElement,{attributes:true,attributeFilter:['lang']});translate();
function api(path,options){return fetch('/api'+path,{credentials:'include',headers:{'Content-Type':'application/json'},...(options||{})}).then(async r=>{const obj=await r.json().catch(()=>({}));if(!r.ok)throw new Error(obj.message||`HTTP ${r.status}`);return obj.data})}
const message=(s)=>{const box=$('ac-history-list');box.textContent=s;};
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
async function archive(){try{const r=await api('/ai/sessions');const sessions=r.sessions||[];$('ac-session-count').textContent=String(sessions.length);const list=$('ac-history-list');list.replaceChildren();if(!sessions.length){message(local('لا توجد جلسات محفوظة بعد. ابدأ تدريبك الأول.','No saved sessions yet. Start your first training.'));return;}
sessions.forEach(s=>{const item=document.createElement('div');item.className='archive-item';const meta=document.createElement('div');const name=document.createElement('b');name.textContent=s.skill||'Cyber incident';const sub=document.createElement('small');sub.textContent=[new Date(s.updatedAt||s.createdAt).toLocaleString(lang()==='ar'?'ar-SA':'en-US'),s.state,'TRAIN '+(s.trainingScore??'—'),'VERIFY '+(s.verificationScore??'—')].join(' · ');meta.append(name,sub);const action=document.createElement('button');action.className='outline-action';action.textContent=local('فتح الجلسة','Open session');action.addEventListener('click',()=>restore(s.sessionId));item.append(meta,action);list.append(item);});
}catch(e){$('ac-session-count').textContent='—';message(local('سجل الجلسات يتطلب تسجيل الدخول: ','Sign in to view your sessions: ')+e.message)}}
async function restore(id){try{const result=await api('/ai/sessions/'+encodeURIComponent(id));localStorage.setItem('rasd_last_session',id);window.dispatchEvent(new CustomEvent('rasd:restore',{detail:result}));$('ac-history-panel').hidden=true;window.scrollTo({top:document.querySelector('.workspace-heading').offsetTop-20,behavior:'smooth'});}catch(e){message(e.message)}}
async function mutate(action){const id=localStorage.getItem('rasd_last_session');if(!id)return;try{const data=await api('/ai/sessions/'+encodeURIComponent(id)+'/'+action,{method:'POST'});window.dispatchEvent(new CustomEvent('rasd:restore',{detail:data}));}catch(e){window.alert(e.message)}}
$('ac-pause').addEventListener('click',()=>mutate('pause'));
$('ac-resume').addEventListener('click',()=>mutate('resume'));
$('ac-history-toggle').addEventListener('click',()=>{$('ac-history-panel').hidden=!$('ac-history-panel').hidden;if(!$('ac-history-panel').hidden){archive();$('ac-history-panel').scrollIntoView({behavior:'smooth',block:'nearest'})}});
$('ac-history-refresh').addEventListener('click',archive);
$('ac-menu').addEventListener('click',()=>$('command-sidebar').classList.toggle('is-open'));
document.querySelectorAll('.command-sidebar a').forEach(a=>a.addEventListener('click',()=>$('command-sidebar').classList.remove('is-open')));
const palette=$('ac-palette'),input=$('ac-palette-input');
function showPalette(){palette.hidden=false;input.value='';drawPalette();input.focus()}
function closePalette(){palette.hidden=true}
function drawPalette(){const q=input.value.toLowerCase().trim();const matches=pages.filter(x=>x.slice(1).join(' ').toLowerCase().includes(q));$('ac-palette-results').replaceChildren();matches.forEach(([href,ar,en],i)=>{const a=document.createElement('a');a.href=href;a.textContent=local(ar,en);const hint=document.createElement('small');hint.textContent='0'+(i+1);a.append(hint);$('ac-palette-results').append(a)})}
$('ac-shortcuts').addEventListener('click',showPalette);$('ac-palette-close').addEventListener('click',closePalette);palette.addEventListener('click',e=>{if(e.target===palette)closePalette()});input.addEventListener('input',drawPalette);
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closePalette();$('command-sidebar').classList.remove('is-open')}if((e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName))||(e.key.toLowerCase()==='k'&&(e.ctrlKey||e.metaKey))){e.preventDefault();showPalette()}if(e.key==='Enter'&&!palette.hidden){const first=$('ac-palette-results').querySelector('a');if(first)location.assign(first.href)}});
function update(){const chip=$('ac-sessionchip');const phase=chip?.querySelector('b')?.textContent||'IDLE';$('ac-phase-metric').textContent=phase;const score=document.querySelector('.ac-score');$('ac-score-metric').textContent=score?score.textContent.split('/')[0].trim()+'/100':'—';const id=localStorage.getItem('rasd_last_session');$('ac-pause').disabled=!id||!['SIMULATION','VERIFICATION'].includes(phase);$('ac-resume').disabled=!id||phase!=='PAUSED';}
const obs=new MutationObserver(update);obs.observe($('ac-sessionchip'),{childList:true,subtree:true,attributes:true});obs.observe($('ac-eval'),{childList:true,subtree:true});update();
window.addEventListener('rasd:session-change',event=>{if(event.detail?.sessionId){localStorage.setItem('rasd_last_session',event.detail.sessionId);archive()}update()});
window.addEventListener('rasd:authenticated',archive);
// Restore a saved session only with backend authorization; never use untrusted local snapshots.
window.addEventListener('rasd:booted',async()=>{const id=localStorage.getItem('rasd_last_session');if(id){try{await restore(id)}catch(_){}}archive()});
})();
