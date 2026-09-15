import { useState, useCallback, useRef, useEffect } from "react";

// Hook para manejar estado de guardado (loading + doble click prevention)
export function useSaving(){
  const[saving,setSaving]=useState(false);
  const ref=useRef(false);
  async function wrap(fn){
    if(ref.current)return;
    ref.current=true;setSaving(true);
    try{await fn();}finally{ref.current=false;setSaving(false);}
  }
  return[saving,wrap];
}
import bcrypt from "bcryptjs";

export function generatePassword(){
  const chars="ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
  const len=Math.floor(Math.random()*3)+6; // 6-8
  let pwd="";
  for(let i=0;i<len;i++) pwd+=chars[Math.floor(Math.random()*chars.length)];
  return pwd;
}
export async function hashPassword(plain){
  return bcrypt.hashSync(plain, 10);
}
export function verifyPassword(plain, hash){
  // Soporte para contraseñas legacy (sin hash) durante transición
  if(!hash.startsWith("$2"))return plain===hash;
  return bcrypt.compareSync(plain, hash);
}

export function genId(){return"id_"+Math.random().toString(36).slice(2,10)}
export function useLS(key,init){
  const[val,setVal]=useState(()=>{try{const s=localStorage.getItem(key);return s?JSON.parse(s):init}catch{return init}});
  const set=useCallback(v=>{
    setVal(v);
    try{localStorage.setItem(key,JSON.stringify(v))}catch{/* ignore */}
    // Notificar a OTRAS instancias de useLS con la misma clave (misma pestaña), para
    // que se sincronicen en vivo (ej. "Reabrir tour" en Guía afecta al tour montado).
    try{window.dispatchEvent(new CustomEvent("ls:"+key,{detail:v}))}catch{/* ignore */}
  },[key]);
  useEffect(()=>{
    const h=(e)=>setVal(e.detail);
    window.addEventListener("ls:"+key,h);
    return()=>window.removeEventListener("ls:"+key,h);
  },[key]);
  return[val,set];
}
export function getEmbed(url){
  if(!url)return null;
  const s=url.match(/youtube\.com\/shorts\/([^?&]+)/);if(s)return`https://www.youtube.com/embed/${s[1]}`;
  const w=url.match(/[?&]v=([^&]+)/);if(w)return`https://www.youtube.com/embed/${w[1]}`;
  return null;
}
export function calcAge(dob){
  if(!dob)return null;
  const b=new Date(dob),n=new Date();
  let age=n.getFullYear()-b.getFullYear();
  if(n.getMonth()<b.getMonth()||(n.getMonth()===b.getMonth()&&n.getDate()<b.getDate()))age--;
  return age;
}
export function fmtDate(d){if(!d)return"—";try{const dt=d.includes("T")?new Date(d):new Date(d+"T12:00:00");return dt.toLocaleDateString("es-CR",{day:"2-digit",month:"short",year:"numeric"})}catch{return d}}
export function initials(name){return(name||"").split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase()}
export function planColor(type){return{Base:"bd-gray",Elite:"bd-purple",Activación:"bd-blue",Transformación:"bd-orange",Especial:"bd-teal"}[type]||"bd-gray"}
export function getPlanStatus(plan){
  if(!plan)return"Sin plan";
  if(plan.paused)return"Pausado";
  const endDate=plan.endDate;
  if(!endDate)return"Sin plan";
  const d=Math.ceil((new Date(endDate+"T23:59:59")-new Date())/(1000*60*60*24));
  if(d<0)return"Vencido";
  if(d===0)return"Vence hoy";
  return"Activo";
}
export function getPlanStatusFromEndDate(endDate){
  if(!endDate)return"Sin plan";
  const d=Math.ceil((new Date(endDate+"T23:59:59")-new Date())/(1000*60*60*24));
  if(d<0)return"Vencido";
  if(d===0)return"Vence hoy";
  return"Activo";
}
export function daysLeft(endDate){
  if(!endDate)return null;
  return Math.ceil((new Date(endDate+"T23:59:59")-new Date())/(1000*60*60*24));
}
export function addMonths(dateStr,months){
  const d=new Date(dateStr+"T12:00:00");
  d.setMonth(d.getMonth()+months);
  return d.toISOString().split("T")[0];
}

// ── Fechas para agrupar entrenamientos ──
export function startOfWeek(d){
  const dt=new Date(d);
  dt.setHours(0,0,0,0);
  const day=(dt.getDay()+6)%7; // lunes = 0
  dt.setDate(dt.getDate()-day);
  return dt;
}
export function weekKey(d){return startOfWeek(d).toISOString().slice(0,10);}
export function weekLabel(d){return startOfWeek(d).toLocaleDateString("es-CR",{day:"2-digit",month:"short"});}
export function monthKey(d){const dt=new Date(d);return`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;}
export function monthLabel(d){return new Date(d).toLocaleDateString("es-CR",{month:"short",year:"2-digit"});}
export function dayKey(d){const dt=new Date(d);return`${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}-${String(dt.getDate()).padStart(2,"0")}`;}
// ── Conversión de peso (guardamos siempre en libras para consistencia) ──
const LBS_PER_KG=2.2046226218;
export function convertWeight(val,from,to){
  const n=Number(val);
  if(val===""||val==null||isNaN(n))return val;
  let lbs=from==="kg"?n*LBS_PER_KG:n;
  let out=to==="kg"?lbs/LBS_PER_KG:lbs;
  return Math.round(out*10)/10; // 1 decimal
}
export function fmtDuration(startIso,endIso){
  if(!startIso||!endIso)return"—";
  const ms=new Date(endIso)-new Date(startIso);
  if(ms<0||isNaN(ms))return"—";
  const totalMin=Math.round(ms/60000);
  const h=Math.floor(totalMin/60),m=totalMin%60;
  return h>0?`${h}h ${m}min`:`${m} min`;
}