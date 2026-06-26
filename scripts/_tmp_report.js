const fs=require("fs"),path=require("path");const{createClient}=require("@supabase/supabase-js");
const env=fs.readFileSync(path.resolve(__dirname,"..",".env.local"),"utf-8");for(const l of env.split("\n")){const i=l.indexOf("=");if(i>0){const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const titles=["REF-endurance","REF-tempo","REF-seuil","RPE-endurance","RPE-tempo","RPE-seuil","EST-nodata"];
(async()=>{const{data}=await s.from("activities").select("title,status,tss,tss_type,actual_duration_minutes,raw_data").eq("source","manual").in("title",titles);
const m={};data.forEach(r=>m[r.title]=r);
console.log(JSON.stringify(m,null,1));})();
