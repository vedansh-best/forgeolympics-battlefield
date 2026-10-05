/* =====================================================================
   FORGE OLYMPICS · APP
   Reads the sheet, analyses every battle and renders the page.
   The 3D battlefield (scene.js) listens for the "forge:state" event.
   ===================================================================== */
(function () {
var CONFIG = window.CONFIG;
var GAME_ICONS = [
  [/pyramid/i,'🔺'],[/turtle/i,'🐢'],[/pipeline/i,'🛠️'],[/chess/i,'♟️'],[/football/i,'⚽'],[/cricket/i,'🏏'],
  [/basket/i,'🏀'],[/dodge/i,'🎯'],[/tug/i,'🪢'],[/table tennis|pickle/i,'🏓'],[/badminton/i,'🏸'],
  [/relay/i,'🏃'],[/\d+\s*m\b/i,'⚡'],[/spirit|award/i,'🔥']
];

var $ = function (s, r) { return (r || document).querySelector(s); };
var params = new URLSearchParams(location.search);
var DEMO = params.has('demo');
var REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
var root = document.documentElement;
var state = null, prevState = null, lastOk = 0, source = 'live';
var flagCache = {};

var BARS = (CONFIG.HERO_STYLE || 'bars') === 'bars';
if (BARS) root.classList.add('bars');
function use3d(){ return root.classList.contains('try3d'); }
function esc(s){ return String(s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
function house(n){ return CONFIG.HOUSES[n] || { color:'#888', deep:'#333', glow:'#bbb', logo:'', captain:'' }; }
function absUrl(u){ try { return new URL(u, document.baseURI).href; } catch(e){ return u; } }
function hv(n){ var h = house(n); return '--hc:'+h.glow+';--hd:'+h.deep+';--logo:url('+absUrl(h.logo)+')'; }
function iconFor(g){ for (var i=0;i<GAME_ICONS.length;i++) if (GAME_ICONS[i][0].test(g)) return GAME_ICONS[i][1]; return '⚔️'; }
function frontFor(g){ for (var i=0;i<CONFIG.FRONTS.length;i++) if (CONFIG.FRONTS[i].re.test(g)) return CONFIG.FRONTS[i]; return { id:'other', name:'Other Battles', icon:'🛡️' }; }
function plural(n,w){ return n+' '+w+(n===1?'':'s'); }
function joinNames(a){ return a.length<2 ? a.join('') : a.slice(0,-1).join(', ')+' & '+a[a.length-1]; }
function ordinal(n){ var s=['th','st','nd','rd'], v=n%100; return n+(s[(v-20)%10]||s[v]||s[0]); }
function emit(name, detail){ window.dispatchEvent(new CustomEvent(name, { detail: detail })); }

/* ---------------------------- DATA ---------------------------- */
var RESERVED = /^(game|status|max.*|notes?|time|venue|date)$/i;
function canonHouses(headers){
  var keys = Object.keys(CONFIG.HOUSES), out = [];
  headers.forEach(function(h, i){
    var k = keys.filter(function(x){ return x.toLowerCase()===String(h).trim().toLowerCase(); })[0];
    if (k) out.push({ name:k, idx:i });
  });
  if (!out.length) headers.forEach(function(h,i){ if (i>0 && h && !RESERVED.test(h.trim())) out.push({ name:h.trim(), idx:i }); });
  return out;
}
function fromApi(j){
  if (!j || !j.ok || !j.houseNames) throw new Error('bad payload');
  var hs = canonHouses(j.houseNames).map(function(h){ return h.name; });
  return { houses:hs, games:j.games.map(function(g){
    var sc={}; hs.forEach(function(h){ var k = Object.keys(g.scores).filter(function(x){return x.toLowerCase()===h.toLowerCase();})[0]; sc[h] = k ? g.scores[k] : null; });
    return { name:g.name, scores:sc, max:g.maxPoints, status:'' }; }) };
}
function parseCSV(t){
  var rows=[],row=[],f='',q=false;
  for (var i=0;i<t.length;i++){ var c=t[i];
    if (q){ if(c==='"'){ if(t[i+1]==='"'){f+='"';i++;} else q=false; } else f+=c; }
    else if (c==='"') q=true; else if (c===','){row.push(f);f='';} else if (c==='\n'){row.push(f);rows.push(row);row=[];f='';} else if (c!=='\r') f+=c; }
  if (f||row.length){row.push(f);rows.push(row);} return rows;
}
function fromCSV(t){
  var rows = parseCSV(t), head = rows[0].map(function(s){return s.trim();});
  var hs = canonHouses(head);
  var stI = head.findIndex(function(h){ return /^status$/i.test(h); });
  var mxI = head.findIndex(function(h){ return /^max/i.test(h); });
  var games = rows.slice(1).filter(function(r){ return r[0] && r[0].trim(); }).map(function(r){
    var sc={}; hs.forEach(function(h){ var v=(r[h.idx]||'').trim(); sc[h.name] = v==='' || isNaN(Number(v)) ? null : Number(v); });
    return { name:r[0].trim(), scores:sc, max: mxI>=0 && r[mxI] && !isNaN(Number(r[mxI])) ? Number(r[mxI]) : null, status: stI>=0 ? (r[stI]||'').trim() : '' };
  });
  return { houses:hs.map(function(h){return h.name;}), games:games };
}
function demoData(){
  var names=['Pyramid Builder','Magic Turtle','Pipeline','Football','Cricket','Basketball','Dodgeball','Tug of War','Table Tennis','Badminton Singles Boys','Badminton Singles Girls','Badminton Doubles Boys','Badminton Doubles Girls','Badminton Mixed Doubles','Pickleball','4x100m Relay Girls','4x100m Relay Boys','Chess','100m Girls','100m Boys','200m Girls','200m Boys','House Spirit Award'];
  var hs=['Knights','Samurai','Gladiators','Vikings'], seed=7, step=Number(params.get('demo'))||14;
  var schemes=[[20,15,10,0],[30,20,10,5],[20,15,10,0],[50,30,20,10],[10,7,5,0]];
  function rnd(){ seed=(seed*9301+49297)%233280; return seed/233280; }
  var games = names.map(function(n,i){
    var sc={}, status='';
    if (i<step){ var pts=schemes[i%schemes.length], order=hs.slice().sort(function(){return rnd()-.5;});
      if (i===0) order=['Vikings','Samurai','Gladiators','Knights']; if (i===1) order=['Knights','Vikings','Gladiators','Samurai']; if (i===2) order=['Samurai','Vikings','Gladiators','Knights'];
      order.forEach(function(h,k){ sc[h]=pts[k]; }); }
    else hs.forEach(function(h){ sc[h]=null; });
    if (i===step && step<names.length) status='Live';
    return { name:n, scores:sc, max:null, status:status }; });
  return { houses:hs, games:games };
}
var sheetPublic = null;
function withTimeout(p, ms){ return Promise.race([p, new Promise(function(_,rej){ setTimeout(function(){ rej(new Error('timeout')); }, ms); })]); }
function fetchSheet(){
  var u='https://docs.google.com/spreadsheets/d/'+CONFIG.SHEET_ID+'/gviz/tq?tqx=out:csv&sheet='+encodeURIComponent(CONFIG.SHEET_TAB)+'&t='+Date.now();
  return withTimeout(fetch(u, { cache:'no-store' }), 10000).then(function(r){ return r.text(); }).then(function(t){
    if (/^\s*</.test(t)) { sheetPublic = false; throw new Error('sheet not public'); }
    sheetPublic = true; return fromCSV(t);
  }).catch(function(e){ if (sheetPublic !== true) sheetPublic = false; throw e; });
}
function fetchApi(){
  return withTimeout(fetch(CONFIG.API_URL + (CONFIG.API_URL.indexOf('?')<0?'?':'&') + 't=' + Date.now(), { cache:'no-store' }), 60000)
    .then(function(r){ return r.json(); }).then(fromApi);
}
function fetchData(){
  if (DEMO) return Promise.resolve(demoData());
  if (sheetPublic === false) return fetchApi().catch(function(){ return fetchSheet(); });
  return fetchSheet().catch(function(){ return fetchApi(); });
}

/* ---------------------------- ANALYSIS ---------------------------- */
function rankMap(H, totals){
  var r = {}; H.forEach(function(h){ r[h] = 1 + H.filter(function(x){ return totals[x] > totals[h]; }).length; }); return r;
}
function analyse(d){
  var H = d.houses, totals={}, wins={}, top2={}, played={}, places={};
  H.forEach(function(h){ totals[h]=0; wins[h]=0; top2[h]=0; played[h]=0; places[h]=[]; });
  var games = d.games.map(function(g, idx){
    var vals = H.map(function(h){ var v=g.scores[h]; return (v===null||v===undefined||v===''||isNaN(v)) ? null : Number(v); });
    var filled = vals.filter(function(v){return v!==null;}).length;
    var st = String(g.status||'');
    var status = /live|progress|ongoing|now|playing/i.test(st) ? 'live'
      : filled===0 ? 'upcoming' : (filled===H.length || /done|final|complete|over/i.test(st)) ? 'done' : 'live';
    var entries = H.map(function(h,i){ return { house:h, pts:vals[i] }; }).filter(function(e){return e.pts!==null;})
      .sort(function(a,b){ return b.pts-a.pts; });
    var place=0, prev=null; entries.forEach(function(e,i){ if (e.pts!==prev){ place=i+1; prev=e.pts; } e.place=place; });
    var top = entries.length ? entries[0].pts : 0;
    var winners = entries.length ? entries.filter(function(e){ return e.pts===top; }).map(function(e){return e.house;}) : [];
    var runner = entries.filter(function(e){ return e.pts<top; })[0] || null;
    var margin = runner ? top-runner.pts : 0;
    var last = entries.length ? entries[entries.length-1] : null;
    var pool = entries.reduce(function(s,e){return s+e.pts;},0);
    var verdict = status==='live' ? {k:'live',t:'Battle raging'} : winners.length>1 ? {k:'tie',t:'Shared glory'}
      : top>0 && margin/top>=.5 ? {k:'crush',t:'Crushing victory'} : top>0 && margin/top>=.25 ? {k:'decisive',t:'Decisive victory'} : {k:'narrow',t:'Knife-edge win'};
    return { idx:idx, no:idx+1, name:g.name, icon:iconFor(g.name), front:frontFor(g.name), status:status, entries:entries, winners:winners,
             runner:runner, margin:margin, spread: last ? top-last.pts : 0, pool:pool, top:top, verdict:verdict, max:g.max };
  });
  var fought = games.filter(function(g){ return g.status!=='upcoming'; });
  var done = games.filter(function(g){ return g.status==='done'; });
  fought.forEach(function(g){ g.entries.forEach(function(e){ totals[e.house]+=e.pts; played[e.house]++; }); });
  done.forEach(function(g){ g.entries.forEach(function(e){ places[e.house].push(e.place); if (e.place===1) wins[e.house]++; if (e.place<=2) top2[e.house]++; }); });
  var standings = H.map(function(h){ return { house:h, total:totals[h] }; }).sort(function(a,b){ return b.total-a.total || H.indexOf(a.house)-H.indexOf(b.house); });
  var r=0, pv=null; standings.forEach(function(s,i){ if (s.total!==pv){ r=i+1; pv=s.total; } s.rank=r; });
  var nowRank = rankMap(H, totals);
  // order-independent swing: how the standings would look without each battle
  fought.forEach(function(g){
    var w = {}; H.forEach(function(h){ w[h] = totals[h]; }); g.entries.forEach(function(e){ w[e.house] -= e.pts; });
    g.without = w; g.rankWithout = rankMap(H, w);
    var mx = Math.max.apply(null, H.map(function(h){return w[h];})); g.leadersWithout = H.filter(function(h){ return w[h]===mx; });
  });
  var h2h={}; H.forEach(function(a){ h2h[a]={}; H.forEach(function(b){ h2h[a][b]=0; }); });
  done.forEach(function(g){ g.entries.forEach(function(a){ g.entries.forEach(function(b){ if (a.pts>b.pts) h2h[a.house][b.house]++; }); }); });
  var fronts = {};
  games.forEach(function(g){ var f=g.front; if (!fronts[f.id]) fronts[f.id]={ f:f, games:[], pts:{} };
    fronts[f.id].games.push(g); g.entries.forEach(function(e){ fronts[f.id].pts[e.house]=(fronts[f.id].pts[e.house]||0)+e.pts; }); });
  var solo = done.filter(function(g){ return g.winners.length===1 && g.runner; });
  var biggest = solo.slice().sort(function(a,b){ return b.margin-a.margin; })[0] || null;
  var closest = solo.slice().sort(function(a,b){ return a.margin-b.margin; })[0] || null;
  var remaining = games.filter(function(g){return g.status==='upcoming';}).length;
  var live = games.filter(function(g){return g.status==='live';});
  var complete = remaining===0 && live.length===0 && done.length>0;
  return { houses:H, games:games, fought:fought, done:done, live:live, standings:standings, lead:standings[0], second:standings[1],
           h2h:h2h, fronts:fronts, wins:wins, top2:top2, played:played, places:places, nowRank:nowRank,
           biggest:biggest, closest:closest, remaining:remaining, totals:totals, complete:complete };
}

/* ---------------------------- STAGE (plaques + 2D fallback flags) ---------------------------- */
function maskSVG(kind){
  var p = kind==='tattered'
    ? '<path d="M0 0H100V12L93 18L100 26L90 34L98 44L86 50L97 60L88 68L100 78L92 86L100 100H0Z M40 30 l6 3 -2 6 -6 -2z M62 62 l5 2 -1 5 -5 -1z" fill-rule="evenodd"/>'
    : '<path d="M0 0H100L84 50L100 100H0Z"/>';
  return "url('data:image/svg+xml,"+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">'+p+'</svg>')+"')";
}
function buildFlag(name, w, h, kind){
  var c = house(name), N = Math.max(12, Math.round(w/9)), sw = w/N;
  var ch = h*.78, cw = ch*(244/360), cx = w*.42-cw/2, cy = (h-ch)/2;
  var shade = 'linear-gradient(180deg,rgba(255,255,255,.18),rgba(255,255,255,0) 35%,rgba(0,0,0,.28))';
  var stripes = 'linear-gradient(180deg,'+c.deep+' 0 7%,transparent 7% 93%,'+c.deep+' 93%)';
  var cloth = 'linear-gradient(90deg,'+c.color+','+c.deep+')';
  var mask = maskSVG(kind), out = '';
  for (var i=0;i<N;i++){
    var x = i*sw, k = (i/(N-1)).toFixed(3);
    out += '<div class="slice" style="--k:'+k+';left:'+x.toFixed(2)+'px;width:'+(sw+.8).toFixed(2)+'px;height:'+h+'px;'+
      'background-image:'+shade+',url('+c.logo+'),'+stripes+','+cloth+';'+
      'background-size:'+w+'px '+h+'px,'+cw.toFixed(1)+'px '+ch.toFixed(1)+'px,'+w+'px '+h+'px,'+w+'px '+h+'px;'+
      'background-position:'+(-x).toFixed(2)+'px 0,'+(cx-x).toFixed(2)+'px '+cy.toFixed(1)+'px,'+(-x).toFixed(2)+'px 0,'+(-x).toFixed(2)+'px 0;'+
      '-webkit-mask-image:'+mask+';mask-image:'+mask+';-webkit-mask-size:'+w+'px '+h+'px;mask-size:'+w+'px '+h+'px;'+
      '-webkit-mask-position:'+(-x).toFixed(2)+'px 0;mask-position:'+(-x).toFixed(2)+'px 0"></div>';
  }
  return out;
}
var CROWN = '<svg class="crown" viewBox="0 0 64 44"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff3b8"/><stop offset="1" stop-color="#d18b1c"/></linearGradient></defs><path fill="url(#cg)" stroke="#5a3200" stroke-width="2" d="M4 14 L18 26 L32 4 L46 26 L60 14 L54 40 H10 Z"/><circle cx="32" cy="4" r="4" fill="#9b6bff"/></svg>';

function renderStage(s){
  var stage = $('#stage'), W = stage.clientWidth, Hh = stage.clientHeight, small = W < 640;
  var plaque = parseFloat(getComputedStyle(root).getPropertyValue('--plaque')) || 118;
  var col = W/4, flagW = Math.round(Math.min(col*(small?.66:.62), 230)), flagH = Math.round(flagW*.64);
  var maxT = s.lead.total, avail = Hh - plaque - flagH*0.2 - (small?150:190);
  var three = use3d();
  s.standings.forEach(function(st, i){
    var h = st.house, el = document.getElementById('bn-'+h);
    if (!el){
      el = document.createElement('div'); el.className='banner'; el.id='bn-'+h; el.setAttribute('style', hv(h));
      el.innerHTML = '<div class="pole">'+CROWN+'<div class="flag"></div></div>'+
        '<div class="plaque"><span class="rankmark"></span><span class="hname" data-t="'+esc(h.toUpperCase())+'">'+esc(h.toUpperCase())+'</span><span class="hpts">0</span><span class="hgap"></span>'+
        '</div>';
      el.style.left = (i*25)+'%';
      stage.appendChild(el);
    }
    var isLead = st.rank===1 && st.total>0 && (!s.second || st.total>s.second.total), isLast = i===s.standings.length-1 && st.total<s.lead.total;
    el.classList.toggle('lead', isLead);
    el.classList.toggle('limp', !isLead && !isLast);
    el.classList.toggle('fallen', isLast && s.fought.length>0);
    el.style.left = (i*25)+'%';
    $('.rankmark', el).textContent = ['I', 'II', 'III', 'IV', 'V', 'VI'][st.rank - 1] || st.rank;
    el.dataset.medal = s.fought.length ? (['gold', 'silver', 'bronze'][st.rank - 1] || 'iron') : 'iron';
    countTo($('.hpts', el), st.total);
    $('.hgap', el).textContent = st.rank===1 ? (s.second && st.total>s.second.total ? 'Leads by '+(st.total-s.second.total) : s.fought.length ? 'Tied for the lead' : 'Awaiting battle')
      : (s.lead.total-st.total)+' behind';
    if (three) return;
    var kind = isLast && s.fought.length ? 'tattered' : 'clean';
    var ratio = maxT>0 ? st.total/maxT : .7;
    $('.pole', el).style.height = Math.max(80, Math.round(avail*(.42+.58*ratio)) + flagH)+'px';
    var flag = $('.flag', el), key = flagW+'x'+flagH+kind;
    if (flagCache[h]!==key){ flag.innerHTML = buildFlag(h, flagW, flagH, kind); flag.style.width=flagW+'px'; flag.style.height=flagH+'px'; flagCache[h]=key; }
    var amp = isLead ? flagH*.13 : isLast ? flagH*.03 : flagH*.06;
    flag.style.setProperty('--amp', (REDUCED?0:amp).toFixed(1)+'px');
    flag.style.setProperty('--tilt', isLead ? '4deg' : '1.5deg');
    flag.style.setProperty('--dur', isLead ? '1.15s' : isLast ? '4.2s' : '2.8s');
    flag.style.setProperty('--lag', isLead ? '-0.9s' : '-1.8s');
    if (isLead) $('#beam').style.left = (i*25 + 25*(small?.22:.18) - 12.5)+'%';
  });
  $('#beam').style.display = !three && s.lead.total>0 ? '' : 'none';
}
var CROWN_IMG = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 46"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe9a0"/><stop offset=".55" stop-color="#f2b81c"/><stop offset="1" stop-color="#b9780c"/></linearGradient></defs><path fill="url(#g)" stroke="#7a4a00" stroke-width="1.5" d="M5 15 L19 27 L32 6 L45 27 L59 15 L54 38 H10 Z"/><rect x="10" y="37" width="44" height="6" rx="2" fill="#d9960f" stroke="#7a4a00" stroke-width="1.2"/><circle cx="32" cy="6" r="3.6" fill="#ffe9a0"/><circle cx="5" cy="15" r="3" fill="#ffe9a0"/><circle cx="59" cy="15" r="3" fill="#ffe9a0"/></svg>');
function renderBoard(s){
  var b = $('#board'); if (!b) return;
  if (!b.dataset.init){
    b.insertAdjacentHTML('beforeend', '<div class="board-head"><span class="bh-k">House standings</span><span class="bh-r"><small>Battles fought</small><b id="bhCount">0</b></span></div><div class="rows" id="rows"></div>');   // append, so the waving-banner canvas (js/board.js) is kept
    b.dataset.init = '1';
  }
  $('#bhCount').innerHTML = s.done.length + '<i> / ' + s.games.length + '</i>';
  var rows = $('#rows'), lead = s.lead.total, small = innerWidth < 640;
  var H = small ? [66, 60, 56, 50] : [96, 86, 80, 70], gap = small ? 6 : 8, top = 0;
  s.standings.forEach(function(st, i){
    var h = st.house, c = house(h), el = document.getElementById('row-' + h);
    if (!el){
      el = document.createElement('div'); el.className = 'row'; el.id = 'row-' + h;
      el.style.setProperty('--c1', (c.bar||[c.color,c.color])[0]); el.style.setProperty('--c2', (c.bar||[c.color,c.color])[1]); el.style.setProperty('--cap', c.cap || '#eee');
      el.innerHTML = '<div class="bar"><span class="rk"></span><img class="crest" src="' + c.logo + '" alt=""><span class="nm">' + esc(h) + '</span>' +
        '<span class="cap"><b class="pts" data-v="0">0</b><small>pts</small></span></div><img class="crown" src="' + CROWN_IMG + '" alt="Leader">';
      el.style.top = (i * (H[0] + gap)) + 'px';
      rows.appendChild(el);
    }
    var ratio = lead > 0 ? st.total / lead : 0.6;
    el.style.setProperty('--r', ratio.toFixed(4));
    el.style.height = H[Math.min(i, 3)] + 'px';
    el.style.top = top + 'px'; top += H[Math.min(i, 3)] + gap;
    el.classList.toggle('first', i === 0 && st.total > 0 && (!s.second || st.total > s.second.total));
    el.dataset.rank = st.rank; el.dataset.pos = i;
    $('.rk', el).textContent = st.rank;
    countTo($('.pts', el), st.total);
  });
  rows.style.height = top + 'px';
}
function countTo(el, to){
  var from = Number(el.dataset.v||0); el.dataset.v = to;
  if (from===to || REDUCED){ el.textContent = to; el.dataset.t = to; return; }
  var t0 = performance.now(), dur = 1400;
  (function step(t){ var p = Math.min(1,(t-t0)/dur), e = 1-Math.pow(1-p,3); el.textContent = el.dataset.t = Math.round(from+(to-from)*e); if (p<1) requestAnimationFrame(step); })(t0);
}

/* ---------------------------- HERO TEXT ---------------------------- */
function renderHeadline(s){
  var hl = $('#headline'), L = s.lead;
  hl.removeAttribute('style');
  hl.hidden = !s.complete;   // the flags already show who leads; the line returns only to crown the champion
  if (s.complete){ hl.setAttribute('style', hv(L.house)); hl.innerHTML='👑 <b>'+esc(L.house.toUpperCase())+'</b> are champions'; return; }
  if (!s.fought.length){ hl.innerHTML='⚔ The armies are gathering'; return; }
  var tied = s.standings.filter(function(x){return x.total===L.total;});
  if (tied.length>1){ hl.innerHTML='⚔ '+tied.map(function(t){return '<b style="'+hv(t.house)+'">'+esc(t.house.toUpperCase())+'</b>';}).join(' &amp; ')+' tied for the lead'; return; }
  hl.setAttribute('style', hv(L.house));
  hl.innerHTML = '👑 <b>'+esc(L.house.toUpperCase())+'</b> lead by '+(L.total - s.second.total);
}
function eventWindow(){
  var E = CONFIG.EVENT || {}, start = E.start ? new Date(E.start).getTime() : NaN;
  return { E:E, start:start, end: start + (E.hours||14)*3600e3 };
}
function renderNext(){
  var el = $('#nextBattle'), s = state;
  if (!s || s.complete){ el.innerHTML=''; return; }
  var w = eventWindow(), now = Date.now(), E = w.E, parts = [];
  if (s.live.length) parts.push('<span class="livenow">● Live: '+esc(s.live.map(function(g){return g.name;}).join(', '))+'</span>');
  if (!isNaN(w.start) && s.remaining){
    if (now < w.start){
      var d = Math.floor((w.start-now)/1000), dd=Math.floor(d/86400), hh=Math.floor(d%86400/3600), mm=Math.floor(d%3600/60), ss=d%60;
      parts.push('<span>Battle resumes '+esc((E.label||'').replace(/^\w+\s/, '').replace(/\s·.*$/, ''))+' · '+esc(E.venue||'')+'</span><span class="dot">◆</span><span class="cd">'+(dd?dd+'d ':'')+String(hh).padStart(2,'0')+'h '+String(mm).padStart(2,'0')+'m</span>');
    } else if (now < w.end && !s.live.length) parts.push('<span class="livenow">● Battle day · '+esc(E.venue||'')+'</span>');
    else if (!s.live.length) parts.push('<span>'+plural(s.remaining,'battle')+' still to be fought</span>');
  }
  el.innerHTML = parts.join('<span class="dot">◆</span>');
}
setInterval(renderNext, 1000);

function renderTicker(s){
  var items = [];
  if (s.complete) items.push('<span>👑 <b style="'+hv(s.lead.house)+'">'+esc(s.lead.house)+'</b> are champions with '+s.lead.total+' pts</span>');
  else if (s.fought.length) items.push('<span>👑 <b style="'+hv(s.lead.house)+'">'+esc(s.lead.house)+'</b> lead the war with '+s.lead.total+' pts</span>');
  s.live.forEach(function(g){ items.push('<span>🔴 '+esc(g.name)+': battle raging</span>'); });
  s.done.forEach(function(g){
    var w = g.winners;
    items.push('<span>'+g.icon+' '+esc(g.name)+': '+w.map(function(x){return '<b style="'+hv(x)+'">'+esc(x)+'</b>';}).join(' &amp; ')+
      (w.length>1 ? ' share the spoils' : ' victorious by '+g.margin)+'</span>');
  });
  var E = (CONFIG.EVENT||{});
  if (s.remaining) items.push('<span>⏳ '+plural(s.remaining,'battle')+' to be fought · '+esc(E.label||'')+' · '+esc(E.venue||'')+'</span>');
  if (!items.length) items = ['<span>⚔ The Forge Olympics are about to begin</span>'];
  var html = items.join(''), tr = $('#ticker');
  tr.innerHTML = html + html; tr.style.setProperty('--tdur', Math.max(25, items.length*7)+'s');
}

/* ---------------------------- SECTIONS ---------------------------- */
function renderStats(s){
  var total = s.games.length, n = s.done.length, L = s.lead, E = CONFIG.EVENT||{};
  var topW = Math.max.apply(null, s.houses.map(function(h){return s.wins[h];}));
  var dom = s.houses.filter(function(h){return s.wins[h]===topW;});
  var b = s.biggest, c = s.closest;
  var cells = [
    ['<b>'+n+'</b><small> / '+total+'</small>', 'Battles fought', Math.round(n/total*100)+'% of the war complete'],
    [s.fought.length ? (L.total - s.second.total) : '–', 'Lead margin', s.fought.length ? esc(L.house)+' over '+esc(s.second.house) : 'No blood yet'],
    [s.done.length ? topW : '–', 'Most victories', !s.done.length ? 'Unclaimed' : dom.length===1 ? esc(dom[0]) : dom.length===s.houses.length ? 'All houses level' : esc(joinNames(dom))+' level'],
    [b ? b.margin : '–', 'Biggest margin', b ? esc(b.winners[0])+' in '+esc(b.name) : 'Unclaimed'],
    [c ? c.margin : '–', 'Closest battle', c ? esc(c.winners[0])+' edged '+esc(c.runner.house)+' in '+esc(c.name) : 'Unclaimed'],
    [s.remaining, 'Battles remaining', s.remaining ? esc(E.label||'')+' · '+esc(E.venue||'') : 'The war is decided']
  ];
  $('#stats').innerHTML = cells.map(function(c){ return '<div class="panel stat"><div class="v">'+c[0]+'</div><div class="l">'+c[1]+'</div><div class="d">'+c[2]+'</div></div>'; }).join('');
  var sum = s.standings.reduce(function(a,x){return a+x.total;},0);
  $('#terr').innerHTML = s.standings.map(function(x){
    var share = sum ? x.total/sum : .25;
    return '<div class="terr-seg" style="'+hv(x.house)+';flex-grow:'+(share*100).toFixed(2)+';--hc:'+house(x.house).color+'" title="'+esc(x.house)+' '+Math.round(share*100)+'%"><img src="'+house(x.house).logo+'" alt="">'+(share>.12 ? Math.round(share*100)+'%' : '')+'</div>';
  }).join('');
  $('#terrNote').textContent = sum ? 'Share of all '+sum+' points won so far' : 'No territory claimed yet';
}
function miniBars(g){
  var mx = Math.max(1, g.top);
  return '<div class="mini">'+g.entries.map(function(e){
    return '<div class="mini-row" style="'+hv(e.house)+'"><span>'+e.place+'. '+esc(e.house)+'</span><span class="bar"><i data-w="'+(e.pts/mx*100).toFixed(1)+'"></i></span><span class="pts">'+e.pts+'</span></div>';
  }).join('')+'</div>';
}
function renderChronicles(s){
  if (!s.fought.length){ $('#chron').innerHTML='<div class="panel empty">No battles fought yet. The chronicles will be written on '+esc((CONFIG.EVENT||{}).label||'battle day')+'.</div>'; return; }
  var list = s.live.concat(s.done.slice().reverse());
  $('#chron').innerHTML = list.map(function(g){
    var w = g.winners[0], tie = g.winners.length>1, head;
    if (g.status==='live' && !g.entries.length) head = '<div class="raging"><i></i>Battle raging · results incoming</div>';
    else {
      var line = g.status==='live' ? 'Scores still coming in' : tie ? 'Joint victors on '+g.top+' pts' : 'by '+g.margin+' over '+(g.runner?esc(g.runner.house):'the field');
      head = '<div class="b-win"><img src="'+house(w).logo+'" alt=""><div><strong>'+esc(g.winners.join(' & '))+(g.status==='live'?' leading':' victorious')+'</strong><span>'+line+'</span></div></div>'+miniBars(g);
    }
    return '<button class="panel battle" style="'+hv(w)+'" data-game="'+g.idx+'"><span class="shine"></span>'+
      '<div class="b-top"><span>'+g.front.icon+' '+esc(g.front.name)+'</span><span class="verdict v-'+g.verdict.k+'">'+g.verdict.t+'</span></div>'+
      '<div class="b-name"><span class="ic">'+g.icon+'</span>'+esc(g.name)+'</div>'+head+
      (g.entries.length ? '<div class="b-more">Full battle analysis →</div>' : '')+'</button>';
  }).join('');
  requestAnimationFrame(function(){ setTimeout(function(){ document.querySelectorAll('#chron .bar i').forEach(function(i){ i.style.width=i.dataset.w+'%'; }); }, 80); });
}
function renderWarMap(s){
  var H = s.standings.map(function(x){return x.house;}), E = CONFIG.EVENT||{};
  var html = '<table class="warmap"><thead><tr><th class="g">Battle</th>'+H.map(function(h){ return '<th style="'+hv(h)+'"><img src="'+house(h).logo+'" alt="">'+esc(h)+'</th>'; }).join('')+'<th>Margin</th><th>Victor</th></tr></thead><tbody>';
  s.games.forEach(function(g){
    if (g.status==='upcoming'){
      html += '<tr class="up"><td>'+g.icon+' '+esc(g.name)+'</td>'+H.map(function(){return '<td>·</td>';}).join('')+'<td>–</td><td>Awaiting</td></tr>'; return;
    }
    var mx = Math.max(1, g.top);
    html += '<tr class="row" data-game="'+g.idx+'"><td>'+g.icon+' '+esc(g.name)+(g.status==='live'?'<span class="tag">● live</span>':'')+'</td>'+H.map(function(h){
      var e = g.entries.filter(function(x){return x.house===h;})[0];
      if (!e) return '<td class="cell">–</td>';
      var win = g.status==='done' && g.winners.indexOf(h)>=0;
      return '<td class="cell'+(win?' win':'')+'" style="'+hv(h)+';--a:'+(e.pts/mx).toFixed(2)+'"><span>'+e.pts+'</span></td>';
    }).join('')+'<td class="mg">'+(g.status!=='done' ? '–' : g.winners.length>1 ? 'Tie' : '+'+g.margin)+'</td><td class="vic">'+(g.status==='done' && g.winners.length===1 ? '<img src="'+house(g.winners[0]).logo+'" alt="'+esc(g.winners[0])+'">' : g.status==='done' ? '⚖️' : '')+'</td></tr>';
  });
  html += '<tr><td><b>Total</b></td>'+H.map(function(h){ return '<td class="cell" style="'+hv(h)+';--a:.35"><span>'+s.totals[h]+'</span></td>'; }).join('')+'<td></td><td></td></tr>';
  $('#warmap').innerHTML = html+'</tbody></table>';
}
function renderFronts(s){
  var ids = CONFIG.FRONTS.map(function(f){return f.id;}).concat(['other']);
  $('#fronts').innerHTML = ids.filter(function(id){return s.fronts[id];}).map(function(id){
    var F = s.fronts[id], done = F.games.filter(function(g){return g.status!=='upcoming';}).length;
    var ranked = s.houses.map(function(h){return {h:h,p:F.pts[h]||0};}).sort(function(a,b){return b.p-a.p;});
    var lead = ranked[0].p>0 ? ranked[0] : null, tie = lead && ranked[1].p===lead.p;
    return '<div class="panel front"><div class="fi">'+F.f.icon+'</div><h4>'+esc(F.f.name)+'</h4><div class="fp">'+done+' of '+F.games.length+' battles fought</div>'+
      '<div class="stack">'+(lead ? ranked.map(function(r){ return '<i style="--hc:'+house(r.h).glow+';flex-grow:'+r.p+'"></i>'; }).join('') : '')+'</div>'+
      '<div class="fl">'+(lead ? (tie ? '⚖️ Contested between <b style="'+hv(ranked[0].h)+'">'+esc(ranked[0].h)+'</b> &amp; <b style="'+hv(ranked[1].h)+'">'+esc(ranked[1].h)+'</b>' :
        '<img src="'+house(lead.h).logo+'" alt=""><span><b style="'+hv(lead.h)+'">'+esc(lead.h)+'</b> rule this front · '+lead.p+' pts</span>') : '🏳️ Unclaimed territory')+'</div>'+
      '<div class="games">'+F.games.map(function(g){ return (g.status==='done'?'✔ ':g.status==='live'?'● ':'○ ')+esc(g.name); }).join(' · ')+'</div></div>';
  }).join('');
}
function renderRivals(s){
  var H = s.standings.map(function(x){return x.house;});
  var html = '<table class="rival"><thead><tr><th></th>'+H.map(function(h){ return '<th style="'+hv(h)+'"><img src="'+house(h).logo+'" alt="">'+esc(h)+'</th>'; }).join('')+'</tr></thead><tbody>';
  H.forEach(function(a){
    html += '<tr><th class="rowh" style="'+hv(a)+'"><div><img src="'+house(a).logo+'" alt="">'+esc(a)+'</div></th>';
    H.forEach(function(b){
      if (a===b){ html += '<td class="self"></td>'; return; }
      var w = s.h2h[a][b], l = s.h2h[b][a];
      html += '<td class="'+(w>l?'win':'')+'" style="'+hv(a)+'">'+w+'<small>'+(w>l?'dominates':w<l?'trails':'even')+'</small></td>';
    });
    html += '</tr>';
  });
  $('#rivals').innerHTML = html+'</tbody></table><p class="rival-note">Based on '+plural(s.done.length,'completed battle')+'.</p>';
}
function renderDossiers(s){
  $('#dossiers').innerHTML = s.standings.map(function(st){
    var h = st.house, c = house(h), played = s.played[h];
    var mine = s.fought.map(function(g){ var e = g.entries.filter(function(x){return x.house===h;})[0]; return e ? {g:g,e:e} : null; }).filter(Boolean);
    var best = mine.slice().sort(function(a,b){ return a.e.place-b.e.place || b.e.pts-a.e.pts; })[0];
    var worst = mine.slice().sort(function(a,b){ return b.e.place-a.e.place || a.e.pts-b.e.pts; })[0];
    var fr = Object.keys(s.fronts).map(function(id){ return { f:s.fronts[id].f, p:s.fronts[id].pts[h]||0 }; }).sort(function(a,b){return b.p-a.p;})[0];
    var avg = played ? (st.total/played).toFixed(1) : '–';
    var tally = [1,2,3,4].map(function(p){ var n = s.places[h].filter(function(x){return x===p;}).length; return n ? '<i class="'+(p===1?'p1':'')+'">'+ordinal(p)+' ×'+n+'</i>' : ''; }).join('');
    return '<div class="panel dossier" style="'+hv(h)+'"><div class="d-head"><img src="'+c.logo+'" alt=""><div><h4>'+esc(h.toUpperCase())+'</h4>'+(c.captain?'<p>House Captain · <b>'+esc(c.captain)+'</b></p>':'')+'</div></div>'+
      '<div class="d-grid"><div><b>#'+st.rank+'</b><span>War rank</span></div><div><b>'+st.total+'</b><span>Total points</span></div>'+
      '<div><b>'+s.wins[h]+'</b><span>Victories</span></div><div><b>'+avg+'</b><span>Pts per battle</span></div></div>'+
      (best ? '<p class="d-line">Finest hour: <b>'+esc(best.g.name)+'</b> ('+ordinal(best.e.place)+', '+best.e.pts+' pts)</p>' : '<p class="d-line">Yet to take the field.</p>')+
      (worst && worst!==best ? '<p class="d-line">Weakest stand: <b>'+esc(worst.g.name)+'</b> ('+ordinal(worst.e.place)+', '+worst.e.pts+' pts)</p>' : '')+
      (fr && fr.p ? '<p class="d-line">Strongest front: <b>'+fr.f.icon+' '+esc(fr.f.name)+'</b></p>' : '')+
      (tally ? '<div class="tally">Placings '+tally+'</div>' : '')+'</div>';
  }).join('');
}
function renderAhead(s){
  var up = s.games.filter(function(g){return g.status==='upcoming';}), E = CONFIG.EVENT||{};
  $('#aheadMeta').textContent = up.length ? '⚔ '+(E.label||'')+' · '+(E.venue||'') : '';
  if (!up.length){ $('#ahead').innerHTML='<div class="panel empty">Every battle has been fought. Long live the champions.</div>'; return; }
  var groups = {}; up.forEach(function(g){ (groups[g.front.id]=groups[g.front.id]||{f:g.front,list:[]}).list.push(g); });
  $('#ahead').innerHTML = Object.keys(groups).map(function(id){ var G=groups[id];
    return '<div class="panel ahead-col"><h4>'+G.f.icon+' '+esc(G.f.name)+'</h4><ul>'+G.list.map(function(g){ return '<li>'+g.icon+' '+esc(g.name)+'</li>'; }).join('')+'</ul></div>'; }).join('');
}

/* ---------------------------- ANALYSIS MODAL ---------------------------- */
function story(g, s){
  if (g.status==='live') return esc(g.name)+' is still being fought. Results so far are shown below.';
  var e = g.entries, w = g.winners, out;
  if (w.length>1) out = joinNames(w)+' could not be separated in '+g.name+', sharing the spoils on '+g.top+' points each.';
  else if (!g.runner) out = w[0]+' took '+g.name+' unopposed.';
  else if (g.verdict.k==='crush') out = w[0]+' crushed the field in '+g.name+', finishing '+g.margin+' clear of '+g.runner.house+'.';
  else if (g.verdict.k==='decisive') out = w[0]+' claimed '+g.name+' decisively, '+g.margin+' points ahead of '+g.runner.house+'.';
  else out = w[0]+' edged '+g.runner.house+' by just '+g.margin+' in a knife-edge '+g.name+'.';
  var zero = e.filter(function(x){return x.pts===0;}).map(function(x){return x.house;});
  if (zero.length) out += ' '+joinNames(zero)+' left the field empty-handed.';
  return esc(out);
}
function swingNote(g, s){
  var L = s.lead, lw = g.leadersWithout;
  if (!s.fought.length || s.fought.length<2) return '';
  var leadNow = s.second && L.total>s.second.total ? L.house : null;
  if (leadNow && (lw.length>1 || lw[0]!==leadNow))
    return '<div class="callout">⚑ War-deciding battle. Without '+esc(g.name)+', '+(lw.length>1 ? esc(joinNames(lw))+' would be level at the top' : esc(lw[0])+' would lead the war')+'.</div>';
  return '';
}
function openGame(idx){
  var s = state, g = s.games[idx]; if (!g || !g.entries.length) return;
  var w = g.winners[0], pos = s.fought.indexOf(g);
  var res = g.entries.map(function(e){ var mx=Math.max(1,g.top);
    return '<div class="res-row" style="'+hv(e.house)+'"><span class="place">'+(e.place===1?'👑':e.place)+'</span><img src="'+house(e.house).logo+'" alt=""><div><div class="nm">'+esc(e.house)+'</div><div class="bar"><i style="width:'+(e.pts/mx*100)+'%"></i></div></div><span class="pt">'+e.pts+'</span></div>';
  }).join('');
  var imp = '<div class="imp-row head"><span>House</span><span>Share</span><span>Effect on rank</span></div>'+
    s.standings.map(function(st){ var h = st.house, e = g.entries.filter(function(x){return x.house===h;})[0], pts = e ? e.pts : 0;
      var share = st.total ? Math.round(pts/st.total*100) : 0, d = g.rankWithout[h] - s.nowRank[h];
      return '<div class="imp-row" style="'+hv(h)+'"><span class="nm">'+s.nowRank[h]+'. '+esc(h)+'</span><span>'+share+'%</span><span class="'+(d>0?'up':d<0?'down':'same')+'">'+(d>0?'▲ lifted '+d:d<0?'▼ cost '+(-d):'■ no change')+'</span></div>';
    }).join('');
  var m = $('#modal');
  m.setAttribute('style', hv(w));
  m.innerHTML = '<div class="m-hero"><button class="m-close" aria-label="Close" data-close>✕</button>'+
    '<div class="m-kick">'+g.front.icon+' '+esc(g.front.name)+' · <span class="verdict v-'+g.verdict.k+'">'+g.verdict.t+'</span></div>'+
    '<h3 class="m-title"><span>'+g.icon+'</span>'+esc(g.name)+'</h3><p class="m-story">'+story(g,s)+'</p>'+swingNote(g,s)+'</div>'+
    '<div class="m-body"><div class="m-stats"><div><b>'+(g.winners.length>1?'Tie':g.margin)+'</b><span>Winning margin</span></div><div><b>'+g.spread+'</b><span>First to last</span></div><div><b>'+g.pool+'</b><span>Points awarded</span></div></div>'+
    '<div class="m-h">The result</div>'+res+
    '<div class="m-h">How much this battle mattered</div><div class="impact">'+imp+'</div>'+
    '<p class="sec-sub" style="margin-top:8px;font-size:12px">Share is the part of each house\'s war total won here. Effect on rank compares today\'s standings with the standings if this battle had never happened.</p>'+
    '<div class="m-nav"><button data-nav="'+(pos>0?s.fought[pos-1].idx:'')+'" '+(pos>0?'':'disabled')+'>← Previous battle</button><button data-nav="'+(pos<s.fought.length-1?s.fought[pos+1].idx:'')+'" '+(pos<s.fought.length-1?'':'disabled')+'>Next battle →</button></div></div>';
  if (!m.open) m.showModal();
  m.scrollTop = 0;
}
$('#modal').addEventListener('click', function(e){
  var t = e.target;
  if (t === this || t.closest('[data-close]')) { this.close(); return; }
  var nb = t.closest('[data-nav]'); if (nb && !nb.disabled && nb.dataset.nav!=='') openGame(Number(nb.dataset.nav));
});
document.addEventListener('click', function(e){ var b = e.target.closest('#chron [data-game], #warmap [data-game]'); if (b) openGame(Number(b.dataset.game)); });

/* 3D tilt on battle cards */
if (matchMedia('(hover:hover)').matches && !REDUCED){
  $('#chron').addEventListener('pointermove', function(e){
    var c = e.target.closest('.battle'); if (!c) return; var r = c.getBoundingClientRect();
    var x = (e.clientX-r.left)/r.width, y = (e.clientY-r.top)/r.height;
    c.style.transform = 'translateY(-4px) rotateX('+((0.5-y)*8).toFixed(2)+'deg) rotateY('+((x-0.5)*10).toFixed(2)+'deg)';
    c.style.setProperty('--mx', (x*100)+'%'); c.style.setProperty('--my', (y*100)+'%');
  });
  $('#chron').addEventListener('pointerout', function(e){ var c = e.target.closest('.battle'); if (c && !c.contains(e.relatedTarget)) c.style.transform=''; });
}

/* ---------------------------- CUTSCENE / TOAST / CHAMPION ---------------------------- */
var csBusy = false;
function cutscene(h, kick, sub){
  if (csBusy || !h) return; csBusy = true;
  var cs = $('#cutscene'); cs.setAttribute('style', hv(h));
  $('#csKick').textContent = kick; $('#csCrest').src = house(h).logo; $('#csName').textContent = h.toUpperCase(); $('#csSub').textContent = sub;
  cs.classList.remove('out'); cs.classList.add('on');
  [$('#csKick'),$('#csCrest'),$('#csName'),$('#csSub')].forEach(function(el){ el.style.animation='none'; el.offsetHeight; el.style.animation=''; });
  document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake');
  lightning(true); emit('forge:leadchange', h);
  if (window.ForgeAudio) ForgeAudio.leadChange();
  setTimeout(function(){ cs.classList.add('out'); setTimeout(function(){ cs.classList.remove('on','out'); csBusy=false; }, 600); }, 4200);
}
var toastT;
function toast(html, h){ var t=$('#toast'); t.setAttribute('style', h?hv(h):''); t.innerHTML=html; t.classList.add('on'); clearTimeout(toastT); toastT=setTimeout(function(){ t.classList.remove('on'); }, 5200); }
$('#title').addEventListener('dblclick', function(){
  if (state && state.lead.total>0) cutscene(state.lead.house, 'Hail the leaders of the Forge', (house(state.lead.house).captain ? 'Led by '+house(state.lead.house).captain+' · ' : '')+state.lead.total+' points');
});

var fwStop = null;
function showChampion(s){
  var L = s.lead, c = house(L.house), el = $('#champion');
  el.setAttribute('style', hv(L.house));
  $('#champInner').innerHTML = '<div class="ch-kick">The war is over</div><div class="ch-title">Champions of the Forge Olympics</div>'+
    '<img class="ch-crest" src="'+c.logo+'" alt=""><div class="ch-name">'+esc(L.house.toUpperCase())+'</div>'+
    '<div class="ch-sub">'+(c.captain ? 'House Captain '+esc(c.captain)+' · ' : '')+L.total+' points · '+plural(s.wins[L.house],'victory').replace('victorys','victories')+'</div>'+
    '<div class="ch-board">'+s.standings.map(function(st){ return '<div style="'+hv(st.house)+'"><b>'+st.total+'</b>'+ordinal(st.rank)+' · '+esc(st.house)+'</div>'; }).join('')+'</div>'+
    '<button class="ch-btn" type="button" id="chClose">View the battlefield</button>';
  el.classList.add('on');
  $('#chClose').onclick = function(){ el.classList.remove('on'); if (fwStop) fwStop(); };
  try { sessionStorage.setItem('forge-champ', '1'); } catch(e){}
  if (window.ForgeAudio) ForgeAudio.champion();
  fwStop = fireworks($('#fireworks'), [c.glow, '#c9adff', '#ffe08f', '#9b6bff', '#ffffff']);
}
function fireworks(cv, colors){
  var cx = cv.getContext('2d'), W, H, parts = [], run = true, dpr = Math.min(2, devicePixelRatio||1);
  function size(){ W = cv.clientWidth; H = cv.clientHeight; cv.width=W*dpr; cv.height=H*dpr; cx.setTransform(dpr,0,0,dpr,0,0); }
  size(); addEventListener('resize', size);
  function burst(){
    var x = W*(.15+Math.random()*.7), y = H*(.12+Math.random()*.4), col = colors[Math.floor(Math.random()*colors.length)], n = 70+Math.random()*50;
    for (var i=0;i<n;i++){ var a = Math.random()*Math.PI*2, v = 1.5+Math.random()*4.5; parts.push({ x:x, y:y, vx:Math.cos(a)*v, vy:Math.sin(a)*v, life:1, col:col, r:1.2+Math.random()*1.8 }); }
    if (window.ForgeAudio && Math.random()<.5) {}
  }
  var bt = 0;
  (function frame(){
    if (!run) return;
    cx.globalCompositeOperation='destination-out'; cx.fillStyle='rgba(0,0,0,.18)'; cx.fillRect(0,0,W,H); cx.globalCompositeOperation='lighter';
    if (--bt <= 0){ burst(); bt = 18 + Math.random()*30; }
    for (var i=parts.length-1;i>=0;i--){ var p=parts[i]; p.vx*=.985; p.vy=p.vy*.985+.05; p.x+=p.vx; p.y+=p.vy; p.life-=.011;
      if (p.life<=0){ parts.splice(i,1); continue; }
      cx.globalAlpha = p.life; cx.fillStyle = p.col; cx.beginPath(); cx.arc(p.x,p.y,p.r,0,7); cx.fill(); }
    cx.globalAlpha = 1;
    requestAnimationFrame(frame);
  })();
  return function(){ run = false; cx.clearRect(0,0,W,H); removeEventListener('resize', size); };
}

/* ---------------------------- LIVE STATUS ---------------------------- */
function renderLive(){
  var el = $('#live'), tx = $('#liveText');
  el.classList.toggle('offline', source==='offline'); el.classList.toggle('demo', source==='demo');
  if (source==='demo'){ tx.textContent = 'Demo'; return; }
  if (!lastOk){ tx.textContent = 'Loading'; return; }
  if (lastOk<=1){ tx.textContent = 'Loading'; return; }
  var sec = Math.round((Date.now()-lastOk)/1000);
  var ago = sec<10 ? 'just now' : sec<60 ? sec+'s ago' : sec<3600 ? Math.round(sec/60)+'m ago' : 'a while ago';
  tx.textContent = source==='offline' ? 'Reconnecting' : 'Live'; el.title = 'Scores updated ' + ago;
}
setInterval(renderLive, 5000);

/* ---------------------------- MAIN LOOP ---------------------------- */
function renderAll(s){
  window.FORGE_STATE = s;
  if (BARS) renderBoard(s); else renderStage(s);
  renderHeadline(s); renderNext(); renderTicker(s); renderStats(s); renderChronicles(s);
  renderWarMap(s); renderFronts(s); renderRivals(s); renderDossiers(s); renderAhead(s);
  emit('forge:state', s);
}
function signature(d){ return JSON.stringify(d.games.map(function(g){ return [g.status].concat(d.houses.map(function(h){ return g.scores[h]; })); })); }
var lastSig = null;
function apply(d){
  var sig = signature(d); lastOk = Date.now();
  if (!DEMO) try { localStorage.setItem('forge-cache-v2', JSON.stringify(d)); localStorage.setItem('forge-cache-at', String(lastOk)); } catch(e){}
  if (sig === lastSig){ renderLive(); return; }
  var first = !lastSig && !state;
  lastSig = sig; prevState = state; state = analyse(d); renderAll(state); renderLive();
  var forceChamp = params.has('champion');
  if (state.complete || forceChamp){
    var seen = false; try { seen = sessionStorage.getItem('forge-champ')==='1'; } catch(e){}
    var justFinished = prevState && !prevState.complete;
    if (forceChamp || justFinished || !seen) { setTimeout(function(){ showChampion(state); }, first ? 1200 : 600); return; }
  }
  if (prevState){
    var newly = state.done.filter(function(g){ var p = prevState.games[g.idx]; return !p || p.status!=='done'; });
    var pl = prevState.lead, nl = state.lead;
    var prevSole = prevState.second && pl.total>prevState.second.total;
    var nowSole = state.second && nl.total>state.second.total;
    if (nowSole && (!prevSole || pl.house!==nl.house)) cutscene(nl.house, 'The tide has turned', 'Seize the lead · '+nl.total+' points'+(house(nl.house).captain ? ' · Captain '+house(nl.house).captain : ''));
    else if (newly.length){
      var g = newly[newly.length-1];
      toast('⚔ '+esc(g.name)+': <b>'+esc(g.winners.join(' & '))+'</b> '+(g.winners.length>1?'share the spoils':'victorious by '+g.margin), g.winners[0]);
      if (window.ForgeAudio) ForgeAudio.battle();
    }
  }
}
var inFlight = false;
function tick(){
  if (inFlight) return; inFlight = true;
  fetchData().then(function(d){ source = DEMO ? 'demo' : 'live'; apply(d); })
  .catch(function(){ source = 'offline'; renderLive(); })
  .then(function(){ inFlight = false; });
}
if (!DEMO){ try { var cached = JSON.parse(localStorage.getItem('forge-cache-v2')); if (cached && cached.houses){ lastSig = signature(cached); state = analyse(cached); renderAll(state); source='offline'; lastOk = Number(localStorage.getItem('forge-cache-at'))||1; renderLive(); } } catch(e){} }
tick();
setInterval(tick, CONFIG.REFRESH_MS);
document.addEventListener('visibilitychange', function(){ if (!document.hidden) tick(); });
var rz; addEventListener('resize', function(){ clearTimeout(rz); rz = setTimeout(function(){ if (state){ flagCache = {}; if (BARS) renderBoard(state); else renderStage(state); } }, 200); });
window.addEventListener('forge:no3d', function(){ flagCache = {}; if (state) renderStage(state); });

var io = new IntersectionObserver(function(es){ es.forEach(function(e){ if (e.isIntersecting) e.target.classList.add('in'); }); }, { threshold:.08 });
document.querySelectorAll('.reveal').forEach(function(el){ io.observe(el); });

/* ---------------------------- EMBERS (2D overlay), LIGHTNING ---------------------------- */
function lightning(silent){
  var f=$('#flash'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  emit('forge:lightning');
  if (!silent && window.ForgeAudio) ForgeAudio.thunder();
}
(function(){
  if (REDUCED) return;
  var cv = $('#embers'), cx = cv.getContext('2d'), W, H, dpr = 1, parts = [];
  function size(){ W = innerWidth; H = innerHeight; cv.width = W*dpr; cv.height = H*dpr; cx.setTransform(dpr,0,0,dpr,0,0); }
  size(); addEventListener('resize', size);
  var N = W < 640 ? 26 : 50;
  function spawn(p, init){ p.x = Math.random()*W; p.y = init ? Math.random()*H : H + 10; p.r = Math.random()*2+.5; p.vy = -(Math.random()*.6+.2); p.vx = (Math.random()-.5)*.3; p.life = Math.random()*Math.PI*2; p.hue = Math.random()<.25 ? 270 : 18+Math.random()*25; return p; }
  for (var i=0;i<N;i++) parts.push(spawn({}, true));
  (function flashLoop(){ setTimeout(function(){ if (!document.hidden && scrollY < innerHeight) lightning(); flashLoop(); }, 26000 + Math.random()*24000); })();
  var drew = true;
  function frame(){
    // over the 3D hero the scene draws its own embers, so the overlay only shows further down the page
    var fade = use3d() ? Math.min(1, Math.max(0, (scrollY - innerHeight*.5)/(innerHeight*.5))) : 1;
    if (fade <= 0){ if (drew){ cx.clearRect(0,0,W,H); cv.style.visibility='hidden'; drew=false; } requestAnimationFrame(frame); return; }
    if (!drew){ cv.style.visibility=''; drew=true; }
    cx.clearRect(0,0,W,H);
    for (var i=0;i<parts.length;i++){ var p = parts[i];
      p.life += .04; p.x += p.vx + Math.sin(p.life)*.25; p.y += p.vy;
      if (p.y < -10) spawn(p, false);
      var a = (.4 + Math.sin(p.life*2)*.3) * fade;
      cx.fillStyle = 'hsla('+p.hue+',100%,60%,'+(a*.25)+')'; cx.beginPath(); cx.arc(p.x, p.y, p.r*3, 0, Math.PI*2); cx.fill();
      cx.fillStyle = 'hsla('+p.hue+',100%,'+(60+p.r*6)+'%,'+a+')'; cx.beginPath(); cx.arc(p.x, p.y, p.r, 0, Math.PI*2); cx.fill(); }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
})();
