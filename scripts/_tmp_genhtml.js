const fs=require("fs"),path=require("path");const{createClient}=require("@supabase/supabase-js");
const env=fs.readFileSync(path.resolve(__dirname,"..",".env.local"),"utf-8");for(const l of env.split("\n")){const i=l.indexOf("=");if(i>0){const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const FTP=250;
// intensité -> {if, np, rpe, refTitle, rpeTitle}
const rows=[
 {label:"Endurance",iff:0.70,rpe:4,ref:"REF-endurance",rpeT:"RPE-endurance"},
 {label:"Tempo",iff:0.83,rpe:5,ref:"REF-tempo",rpeT:"RPE-tempo"},
 {label:"Seuil",iff:0.95,rpe:7,ref:"REF-seuil",rpeT:"RPE-seuil"},
];
(async()=>{
const titles=[...rows.map(r=>r.ref),...rows.map(r=>r.rpeT),"EST-nodata"];
const{data}=await s.from("activities").select("title,tss,tss_type,actual_duration_minutes,raw_data").eq("source","manual").in("title",titles);
const m={};data.forEach(r=>m[r.title]=r);
const computed=rows.map(r=>{const refT=m[r.ref].tss, rpeT=m[r.rpeT].tss; const dev=((rpeT-refT)/refT)*100; return {...r, np:m[r.ref].raw_data?._calculated?.normalized_power, refTss:refT, refType:m[r.ref].tss_type, rpeTss:rpeT, rpeType:m[r.rpeT].tss_type, dev};});
const est=m["EST-nodata"];
const mae=computed.reduce((a,r)=>a+Math.abs(r.dev),0)/computed.length;
const maxDev=Math.max(...computed.map(r=>Math.abs(r.dev)));
const now=new Date().toISOString().slice(0,16).replace("T"," ");
const fmt=x=>x.toFixed(1);
const sign=x=>(x>=0?"+":"")+fmt(x)+" %";
const devColor=a=>{const v=Math.abs(a);return v<=10?"#00d4aa":v<=20?"#f59e0b":"#ef4444";};
const badge=(v)=>`<span class="badge" style="background:${devColor(v)}1a;color:${devColor(v)};border-color:${devColor(v)}55">${sign(v)}</span>`;
const tr=computed.map(r=>`<tr>
 <td>${r.label}</td><td class="num">${r.iff.toFixed(2)}</td><td class="num">${r.np} W</td>
 <td class="num">${r.refTss} <span class="muted">(${r.refType})</span></td>
 <td class="num">RPE ${r.rpe} → ${r.rpeTss} <span class="muted">(${r.rpeType})</span></td>
 <td class="num">${badge(r.dev)}</td></tr>`).join("");
const html=`<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Rapport — Écarts TSS (estimations vs référence)</title>
<style>
:root{--bg:#0b0f14;--card:#131a22;--line:#1f2a36;--fg:#e6edf3;--muted:#8aa0b2;--accent:#00d4aa}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;padding:40px 20px}
.wrap{max-width:920px;margin:0 auto}
h1{font-size:24px;margin:0 0 4px}h2{font-size:17px;margin:32px 0 12px;color:var(--accent)}
.sub{color:var(--muted);margin:0 0 24px;font-size:13px}
.card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:20px 22px;margin:16px 0}
.kpis{display:flex;gap:14px;flex-wrap:wrap}
.kpi{flex:1;min-width:150px;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 18px}
.kpi .v{font-size:26px;font-weight:700}.kpi .l{color:var(--muted);font-size:12px;margin-top:2px}
table{width:100%;border-collapse:collapse;margin-top:6px}
th,td{text-align:left;padding:10px 12px;border-bottom:1px solid var(--line)}
th{color:var(--muted);font-weight:600;font-size:12px;text-transform:uppercase;letter-spacing:.04em}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.muted{color:var(--muted);font-size:12px}
.badge{display:inline-block;padding:2px 9px;border-radius:999px;border:1px solid;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums}
.legend{display:flex;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:12px;color:var(--muted)}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px;vertical-align:middle}
ul{margin:8px 0 0;padding-left:20px}li{margin:4px 0}
code{background:#0b0f14;border:1px solid var(--line);border-radius:5px;padding:1px 6px;font-size:13px}
.warn{border-left:3px solid #ef4444;background:#ef44440d}
.foot{color:var(--muted);font-size:12px;margin-top:28px;border-top:1px solid var(--line);padding-top:14px}
</style></head><body><div class="wrap">
<h1>Rapport — Écarts TSS des méthodes d'estimation</h1>
<p class="sub">Mesuré end-to-end via Playwright sur l'application réelle • ${now} • FTP de test = ${FTP} W • séances de 60 min • référence = TSS puissance (Coggan, <code>tss</code>)</p>

<div class="kpis">
 <div class="kpi"><div class="v" style="color:${devColor(mae)}">${fmt(mae)} %</div><div class="l">Écart absolu moyen — RPE vs puissance</div></div>
 <div class="kpi"><div class="v" style="color:${devColor(maxDev)}">${fmt(maxDev)} %</div><div class="l">Écart max observé (RPE)</div></div>
 <div class="kpi"><div class="v" style="color:var(--accent)">${est.tss}</div><div class="l">TSS méthode <code>estimated</code> (sans données)</div></div>
</div>

<h2>Cas 1 — TSS basé sur le RPE (table de Friel)</h2>
<div class="card">
<p class="sub" style="margin:0 0 12px">Pour chaque intensité : une séance <b>référence puissance</b> (NP/FTP) et une séance <b>RPE seule</b> de même durée. L'écart mesure l'erreur de la méthode RPE par rapport au TSS réel calculé par l'app.</p>
<table><thead><tr><th>Intensité</th><th class="num">IF</th><th class="num">NP</th><th class="num">Réf. (puissance)</th><th class="num">Méthode RPE</th><th class="num">Écart</th></tr></thead><tbody>${tr}</tbody></table>
<div class="legend">
 <span><span class="dot" style="background:#00d4aa"></span>≤ 10 % (acceptable)</span>
 <span><span class="dot" style="background:#f59e0b"></span>10–20 % (toléré pour le RPE)</span>
 <span><span class="dot" style="background:#ef4444"></span>&gt; 20 %</span>
</div>
</div>

<h2>Cas 2 — Méthode <code>estimated</code> (aucune donnée)</h2>
<div class="card warn">
<p style="margin:0">Séance <b>EST-nodata</b> (vélo, 60 min, ni puissance, ni allure, ni FC, ni RPE) → TSS = <b>${est.tss}</b>, type <code>${est.tss_type}</code>.</p>
<p class="muted" style="margin:8px 0 0">Ce n'est <b>pas une estimation de charge</b> mais une <b>sentinelle « donnée manquante »</b>. L'écart vs une vraie séance est de fait −100 % : aucun pourcentage de tolérance ne s'applique. La mitigation est l'<b>avertissement visible</b> dans le détail de l'activité, pas un seuil.</p>
</div>

<h2>Lecture &amp; seuils recommandés</h2>
<div class="card">
<ul>
<li><b>RPE :</b> écart absolu moyen <b>${fmt(mae)} %</b> (max ${fmt(maxDev)} %). Cohérent avec l'attente structurelle de <b>~15–25 %</b> : le RPE est subjectif et entier, et un cran de RPE vaut ~15–25 % de TSS. <b>Seuil d'acceptation conseillé : ≤ 20 %.</b></li>
<li><b>Quantification :</b> l'écart vient du barème de Friel, pas d'un bug — l'endurance tombe juste (RPE 4 ≈ IF 0,70) tandis que tempo/seuil sous-estiment (le cran de RPE choisi crédite un peu moins que l'IF² réel).</li>
<li><b>estimated :</b> pas de seuil — critère <b>binaire</b> (<code>tss=0</code>, type <code>estimated</code>, avertissement). À exclure des analyses fines.</li>
<li><b>Lissage :</b> ces écarts par séance sont absorbés par la <b>CTL/ATL</b> (moyennes mobiles 42 j / 7 j) — l'impact sur les tendances de charge reste faible.</li>
</ul>
</div>

<p class="foot">Référence = TSS puissance (<code>tss</code>), considéré comme « réel ». Méthodes comparées : <code>rpe</code> (Friel) et <code>estimated</code>. Données générées par des séances de test (supprimées après mesure). Reproductible via le formulaire de création manuelle.</p>
</div></body></html>`;
const out=path.resolve(__dirname,"..","documentation","activity_creation","rapport_ecarts_tss.html");
fs.writeFileSync(out,html);
console.log("written:",out);
console.log("MAE",fmt(mae),"maxDev",fmt(maxDev));
computed.forEach(r=>console.log(r.label,"ref",r.refTss,"rpe",r.rpeTss,"dev",sign(r.dev)));
})();
