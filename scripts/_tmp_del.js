const fs=require("fs"),path=require("path");const{createClient}=require("@supabase/supabase-js");
const env=fs.readFileSync(path.resolve(__dirname,"..",".env.local"),"utf-8");for(const l of env.split("\n")){const i=l.indexOf("=");if(i>0){const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
(async()=>{const a=await s.from("activities").delete().eq("source","manual").in("title",["RPE-endurance","RPE-tempo","RPE-seuil"]).select("id");console.log("deleted RPE rows:",a.data?.length);})();
