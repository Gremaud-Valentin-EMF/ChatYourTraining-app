const fs=require("fs"),path=require("path");const{createClient}=require("@supabase/supabase-js");
const env=fs.readFileSync(path.resolve(__dirname,"..",".env.local"),"utf-8");for(const l of env.split("\n")){const i=l.indexOf("=");if(i>0){const k=l.slice(0,i).trim();let v=l.slice(i+1).trim();if((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))v=v.slice(1,-1);if(!process.env[k])process.env[k]=v;}}
const s=createClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false}});
const uid="753ed77c-5500-47c1-9f91-7baf2557c566";const CYC="00000000-0000-0000-0000-000000000002",RUN="00000000-0000-0000-0000-000000000001";
(async()=>{
await s.from("physiological_data").delete().eq("user_id",uid);
await s.from("user_sports").delete().eq("user_id",uid);
const r1=await s.from("physiological_data").insert({user_id:uid,hr_max:190,hr_rest:50,lthr:165});
const r2=await s.from("user_sports").insert([{user_id:uid,sport_id:CYC,level:"intermediate",ftp_watts:250},{user_id:uid,sport_id:RUN,level:"intermediate",threshold_pace_per_km:300}]);
console.log("seed:",r1.error?.message||"physio ok",r2.error?.message||"sports ok");})();
