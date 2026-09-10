import { useState, useEffect, useRef } from "react";
import {
  CHART_COLORS,
  MEASUREMENT_FIELDS,
  PAYMENT_PERIODS,
} from "./trainsync.constants";
import { useCatalogs, CATALOG_META } from "./trainsync.catalogs";
import { usePermissions } from "./auth/PermissionsContext";
import { addMonths, calcAge, daysLeft, fmtDate, genId, getPlanStatus, getPlanStatusFromEndDate, initials, planColor, useLS, hashPassword, generatePassword, useSaving, weekKey, weekLabel, monthKey, monthLabel, dayKey, fmtDuration, convertWeight } from "./trainsync.utils";
import { Modal, PasswordInput, Toast, VideoModal, ExercisePicker, StretchPicker, Logo, SaveBtn } from "./trainsync.ui";
import { updateOwnPassword, resetClientPassword, inviteClient, inviteTrainer, manageTrainer, deleteClientAccount } from "./auth/authClient";
import { setClientReminder, getOrgAdmins, removeOrgAdmin } from "./db";
import { uploadRoutineImage } from "./storage/storage";
import { MedalsView } from "./gamification/GamificationUI";
import { initialWeightFor } from "./workout/lastWeights";
import { useTenant } from "./tenant/tenantContext";
import { useBranding } from "./branding/BrandingContext";
import { PlanGate } from "./plans/PlanGate";

// Bloquea el ingreso de valores negativos en inputs numéricos
const preventNegKey=e=>{if(["-","e","E","+"].includes(e.key))e.preventDefault();};
const stripNeg=v=>String(v).replace(/-/g,"");

export function Dashboard({users}){
  const clients=users.filter(u=>u.role==="user");
  const enabled=clients.filter(u=>!u.disabled);
  const disabled=clients.filter(u=>u.disabled);
  const total=enabled.length;
  const active=enabled.filter(u=>getPlanStatus(u.plan)==="Activo").length;
  const expiring=enabled.filter(u=>{const d=daysLeft(u.plan?.endDate);return d!==null&&d>=0&&d<=30}).length;
  const expired=enabled.filter(u=>getPlanStatus(u.plan)==="Vencido").length;
  return(<div>
    <div className="ph">
      <div><div className="pt">Dashboard</div><div className="ps">Panel de control</div></div>
    </div>
    <div className="stats">
      <div className="stat"><div className="sl">Clientes</div><div className="sv">{total}</div></div>
      <div className="stat"><div className="sl">Activos</div><div className="sv" style={{color:"#2E7D32"}}>{active}</div></div>
      <div className="stat"><div className="sl">Vencidos</div><div className="sv" style={{color:"#E53935"}}>{expired}</div></div>
      <div className="stat"><div className="sl">Vencen pronto</div><div className="sv" style={{color:expiring>0?"#F57C00":"#6B7A99"}}>{expiring}</div></div>
    </div>

    <div className="card" style={{marginBottom:16}}>
      <div style={{padding:"12px 16px 8px",fontWeight:700,fontSize:12,color:"#0B1F4B",textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid #DDE4F0"}}>
        👥 Clientes habilitados ({enabled.length})
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Cliente</th><th>Plan</th><th>Modalidad</th><th>Vence</th><th>Estado</th></tr></thead>
        <tbody>{enabled.map(u=>{
          const st=getPlanStatus(u.plan);
          const d=daysLeft(u.plan?.endDate);
          return(<tr key={u.id}>
            <td><strong>{u.name}</strong><br/><span style={{color:"#6B7A99",fontSize:10}}>@{u.username}</span></td>
            <td><span className={`badge ${planColor(u.plan?.type)}`}>{u.plan?.type||"—"}</span></td>
            <td><span className="badge bd-gray">{u.plan?.modality||"—"}</span></td>
            <td style={{fontSize:11}}>{fmtDate(u.plan?.endDate)}{d!==null&&d>=0&&d<=30&&<span style={{color:"#F57C00",fontWeight:700}}> ({d}d)</span>}</td>
            <td><span className={`badge ${st==="Activo"?"bd-green":st==="Vencido"?"bd-red":"bd-gray"}`}>{st}</span></td>
          </tr>);
        })}{enabled.length===0&&<tr><td colSpan={5}><div className="empty"><div className="ico">👥</div><p>Sin clientes habilitados</p></div></td></tr>}</tbody>
      </table></div>
    </div>

    {disabled.length>0&&<div className="card" style={{padding:0}}>
      <div style={{padding:"12px 16px 8px",fontWeight:700,fontSize:12,color:"#9E9E9E",textTransform:"uppercase",letterSpacing:1,borderBottom:"1px solid #DDE4F0"}}>
        🚫 Clientes deshabilitados ({disabled.length})
      </div>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Cliente</th><th>Plan</th><th>Modalidad</th><th>Vence</th><th></th></tr></thead>
        <tbody>{disabled.map(u=>{
          return(<tr key={u.id} style={{opacity:0.6}}>
            <td><strong>{u.name}</strong><br/><span style={{color:"#6B7A99",fontSize:10}}>@{u.username}</span></td>
            <td><span className={`badge ${planColor(u.plan?.type)}`}>{u.plan?.type||"—"}</span></td>
            <td><span className="badge bd-gray">{u.plan?.modality||"—"}</span></td>
            <td style={{fontSize:11}}>{fmtDate(u.plan?.endDate)}</td>
            <td><span className="badge bd-red">🚫 Deshabilitado</span></td>
          </tr>);
        })}</tbody>
      </table></div>
    </div>}
  </div>);
}

// ── EDITOR DE CATÁLOGOS (listas editables) ──
export function CatalogEditor(){
  const cat=useCatalogs();
  const{readOnly}=usePermissions();
  const[adding,setAdding]=useState(null);
  const[newVal,setNewVal]=useState("");
  const[busy,setBusy]=useState(false);
  const[toast,setToast]=useState(null);
  const[editKey,setEditKey]=useState(null); // `${dbCat}|${item}` en edición
  const[editVal,setEditVal]=useState("");
  const ERR="No se pudo guardar. ¿Corriste supabase-catalogos.sql? Intentá de nuevo.";
  async function renameItem(m,oldItem){
    if(readOnly)return;
    const v=editVal.trim();
    setEditKey(null);
    if(!v||v===oldItem)return; // sin cambios
    // Evitar duplicado con OTRO item existente.
    if(cat[m.key].some(x=>x!==oldItem&&x.toLowerCase()===v.toLowerCase())){setToast({msg:`Ya existe "${v}" en ${m.label}`,type:"err"});return;}
    setBusy(true);
    try{await cat.saveCategory(m.dbCat,cat[m.key].map(x=>x===oldItem?v:x));setToast({msg:"Lista actualizada",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
    finally{setBusy(false);}
  }
  async function addItem(m){
    if(readOnly)return;
    const v=newVal.trim();
    if(!v){return;}
    if(cat[m.key].some(x=>x.toLowerCase()===v.toLowerCase())){setNewVal("");setAdding(null);return;}
    setBusy(true);
    try{await cat.saveCategory(m.dbCat,[...cat[m.key],v]);setToast({msg:"Lista actualizada",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
    finally{setBusy(false);setNewVal("");setAdding(null);}
  }
  async function removeItem(m,item){
    if(readOnly)return;
    if(!confirm(`¿Quitar "${item}" de ${m.label}?`))return;
    try{await cat.saveCategory(m.dbCat,cat[m.key].filter(x=>x!==item));setToast({msg:"Lista actualizada",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  return(<div className="card" style={{marginTop:12}}>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div style={{fontWeight:700,fontSize:13,marginBottom:4}}>Catálogos (listas editables)</div>
    <div style={{fontSize:11,color:"#6B7A99",marginBottom:8}}>Estas listas aparecen en los menús de rutinas, ejercicios y planes. Los cambios se aplican para todos.</div>
    {CATALOG_META.map(m=>(<div key={m.key} style={{padding:"10px 0",borderTop:"1px solid #DDE4F0"}}>
      <div style={{fontSize:12,fontWeight:700,color:"#0B1F4B",marginBottom:6}}>{m.label}</div>
      <div style={{display:"flex",flexWrap:"wrap",gap:6,alignItems:"center"}}>
        {cat[m.key].map(item=>(editKey===`${m.dbCat}|${item}`?(
          <span key={item} style={{display:"inline-flex",gap:4,alignItems:"center"}}>
            <input className="inp" autoFocus value={editVal} onChange={e=>setEditVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")renameItem(m,item);if(e.key==="Escape")setEditKey(null);}} style={{width:140,minHeight:34,fontSize:12}}/>
            <button className="btn btn-ok btn-sm" onClick={()=>renameItem(m,item)} disabled={busy}>✓</button>
            <button className="btn btn-g btn-sm" onClick={()=>setEditKey(null)}>✕</button>
          </span>
        ):(
          <span key={item} className="badge bd-gray" style={{display:"inline-flex",alignItems:"center",gap:6,padding:"6px 9px",textTransform:"none",fontSize:11}}>
            {item}
            {!readOnly&&item!=="Ninguno"&&<button onClick={()=>{setEditKey(`${m.dbCat}|${item}`);setEditVal(item);}} title="Editar" style={{background:"none",border:"none",cursor:"pointer",color:"#1A5DC8",fontWeight:700,padding:0,lineHeight:1,fontSize:12}}>✎</button>}
            {!readOnly&&item!=="Ninguno"&&<button onClick={()=>removeItem(m,item)} title="Quitar" style={{background:"none",border:"none",cursor:"pointer",color:"#E53935",fontWeight:700,padding:0,lineHeight:1,fontSize:13}}>✕</button>}
          </span>
        )))}
        {!readOnly&&(adding===m.dbCat?(<span style={{display:"inline-flex",gap:4,alignItems:"center"}}>
          <input className="inp" autoFocus value={newVal} onChange={e=>setNewVal(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")addItem(m);if(e.key==="Escape"){setAdding(null);setNewVal("");}}} placeholder="Nuevo..." style={{width:140,minHeight:34,fontSize:12}}/>
          <button className="btn btn-ok btn-sm" onClick={()=>addItem(m)} disabled={busy}>✓</button>
          <button className="btn btn-g btn-sm" onClick={()=>{setAdding(null);setNewVal("");}}>✕</button>
        </span>):(
          <button className="btn btn-s btn-sm" onClick={()=>{setAdding(m.dbCat);setNewVal("");}}>+ Agregar</button>
        ))}
      </div>
    </div>))}
  </div>);
}

// ── ADMINS PAGE ──
// Administradores/co-entrenadores REALES: miembros de la organización (owner/trainer).
// El alta es por invitación de correo (Edge Function invite-trainer); el nuevo admin
// crea su propia contraseña. Solo el owner (principal) puede agregar/quitar.
export function AdminsPage(){
  const{readOnly}=usePermissions();
  const tenant=useTenant();
  const orgId=tenant?.org?.id||null;
  const[admins,setAdmins]=useState([]);
  const[loading,setLoading]=useState(true);
  const[showAdd,setShowAdd]=useState(false);
  const[form,setForm]=useState({name:"",email:""});
  const[err,setErr]=useState("");
  const[busy,setBusy]=useState(false);
  const[toast,setToast]=useState(null);
  const[editing,setEditing]=useState(null);
  const[eForm,setEForm]=useState({name:"",pwd:""});

  async function reload(){
    if(!orgId){setLoading(false);return;}
    try{const list=await getOrgAdmins(orgId);setAdmins(list);}
    catch(e){console.error("getOrgAdmins:",e);}
    finally{setLoading(false);}
  }
  useEffect(()=>{let alive=true;(async()=>{await Promise.resolve();if(alive)await reload();})();return()=>{alive=false;};// eslint-disable-next-line react-hooks/exhaustive-deps
  },[orgId]);

  async function add(){
    if(readOnly)return;
    const email=form.email.trim().toLowerCase();
    if(!form.name.trim()||!email){setErr("Nombre y correo son requeridos");return;}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){setErr("Correo inválido");return;}
    setErr("");setBusy(true);
    const res=await inviteTrainer(email,form.name.trim());
    setBusy(false);
    if(!res.ok){setErr(res.error||"No se pudo invitar. Intentá de nuevo.");return;}
    setForm({name:"",email:""});setShowAdd(false);
    setToast({msg:res.data?.already_member?"Esa persona ya era miembro de la organización.":"Invitación enviada. El nuevo admin recibirá un correo para crear su contraseña.",type:"ok"});
    reload();
  }
  async function del(a){
    if(readOnly||a.role==="owner")return;
    if(!confirm("¿Quitar a este administrador de la organización?"))return;
    try{await removeOrgAdmin(orgId,a.userId);setToast({msg:"Administrador removido",type:"ok"});reload();}
    catch(e){console.error(e);setToast({msg:"No se pudo remover: "+(e?.message||e),type:"err"});}
  }
  function openEdit(a){setEditing(a);setEForm({name:a.name||"",pwd:""});setErr("");}
  async function saveEdit(){
    if(readOnly||!editing)return;
    setErr("");setBusy(true);
    try{
      if(eForm.name.trim()&&eForm.name.trim()!==(editing.name||"")){
        const r=await manageTrainer({action:"update_name",targetUserId:editing.userId,name:eForm.name.trim()});
        if(!r.ok){setBusy(false);setErr(r.error||"No se pudo actualizar el nombre.");return;}
      }
      if(eForm.pwd){
        if(eForm.pwd.length<8){setBusy(false);setErr("La contraseña debe tener al menos 8 caracteres.");return;}
        const r=await manageTrainer({action:"reset_password",targetUserId:editing.userId,newPassword:eForm.pwd});
        if(!r.ok){setBusy(false);setErr(r.error||"No se pudo cambiar la contraseña.");return;}
      }
      setBusy(false);setEditing(null);setToast({msg:"Administrador actualizado",type:"ok"});reload();
    }catch(e){setBusy(false);setErr(String(e?.message||e));}
  }

  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="ph"><div><div className="pt">Administradores</div><div className="ps">Perfiles con acceso de entrenador a esta organización</div></div>{!readOnly&&<button className="btn btn-p" onClick={()=>{setForm({name:"",email:""});setErr("");setShowAdd(true);}}>+ Nuevo admin</button>}</div>
    <div className="card" style={{padding:0}}>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Nombre</th><th>Rol</th><th></th></tr></thead>
        <tbody>
          {loading&&<tr><td colSpan={3} style={{textAlign:"center",color:"#6B7A99",padding:20,fontSize:12}}>Cargando…</td></tr>}
          {!loading&&admins.map(a=>(<tr key={a.userId}>
            <td><strong>{a.name||"(sin nombre)"}</strong></td>
            <td>{a.role==="owner"?<span className="badge bd-blue">Principal</span>:<span className="badge bd-gray">Administrador</span>}</td>
            <td style={{textAlign:"right",whiteSpace:"nowrap"}}>{a.role!=="owner"&&!readOnly&&<><button className="ibtn" title="Editar" onClick={()=>openEdit(a)}>✏️</button> <button className="ibtn d" title="Quitar" onClick={()=>del(a)}>🗑</button></>}</td>
          </tr>))}
          {!loading&&admins.length===0&&<tr><td colSpan={3} style={{textAlign:"center",color:"#6B7A99",padding:20,fontSize:12}}>Sin administradores</td></tr>}
        </tbody>
      </table></div>
    </div>
    {showAdd&&<Modal title="Invitar administrador" onClose={()=>setShowAdd(false)}>
      {err&&<div className="err">{err}</div>}
      <div style={{fontSize:12,color:"#6B7A99",marginBottom:10}}>Le enviaremos un correo para que cree su propia contraseña y quede como co-entrenador de tu organización.</div>
      <div className="fg"><label>Nombre completo</label><input className="inp" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ej: Ana Pérez"/></div>
      <div className="fg"><label>Correo</label><input className="inp" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="ana@correo.com" autoComplete="off"/></div>
      <div style={{display:"flex",gap:8}}><button className="btn btn-p" onClick={add} disabled={busy}>{busy?"Enviando…":"Enviar invitación"}</button><button className="btn btn-g" onClick={()=>setShowAdd(false)}>Cancelar</button></div>
    </Modal>}
    {editing&&<Modal title="Editar administrador" onClose={()=>setEditing(null)}>
      {err&&<div className="err">{err}</div>}
      <div className="fg"><label>Nombre</label><input className="inp" value={eForm.name} onChange={e=>setEForm({...eForm,name:e.target.value})}/></div>
      <div className="fg"><label>Nueva contraseña (opcional)</label>
        <PasswordInput value={eForm.pwd} onChange={e=>setEForm({...eForm,pwd:e.target.value})} autoComplete="new-password"/>
        <div style={{marginTop:6}}><button type="button" className="btn btn-s btn-sm" onClick={()=>setEForm(f=>({...f,pwd:generatePassword()}))}>🔑 Generar</button></div>
        <div style={{fontSize:11,color:"#6B7A99",marginTop:4}}>Dejala en blanco si no querés cambiarla. Si la cambiás, compartísela al admin de forma segura.</div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:10}}><button className="btn btn-p" onClick={saveEdit} disabled={busy}>{busy?"Guardando…":"Guardar"}</button><button className="btn btn-g" onClick={()=>setEditing(null)}>Cancelar</button></div>
    </Modal>}
    <CatalogEditor/>
  </div>);
}

// ── PAYMENT MODULE ──
// Fuente de verdad: tabla `payments` (prop allPayments + setPayments), NO client.payments.
export function PaymentModule({client,setClient,payments:allPayments=[],setPayments}){
  const{readOnly}=usePermissions();
  const[showPay,setShowPay]=useState(false);
  const[editingPay,setEditingPay]=useState(null);
  const[period,setPeriod]=useState(1);
  const[payDate,setPayDate]=useState(new Date().toISOString().split("T")[0]);
  const[amount,setAmount]=useState(client.plan?.price||"");
  const[notes,setNotes]=useState("");
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";
  // Pagos de este cliente (ordenados por fecha desc), derivados de la tabla real.
  const payments=allPayments.filter(p=>p.clientId===client.id).sort((a,b)=>new Date(b.date)-new Date(a.date));

  function openNew(){
    setEditingPay(null);
    setPeriod(1);
    setPayDate(new Date().toISOString().split("T")[0]);
    setAmount(client.plan?.price||"");
    setNotes("");
    setShowPay(true);
  }

  function openEdit(p){
    setEditingPay(p);
    setPeriod(p.months||1);
    setPayDate(p.date||new Date().toISOString().split("T")[0]);
    setAmount(p.amount||"");
    setNotes(p.notes||"");
    setShowPay(true);
  }

  // Recalcula el endDate del plan a partir del pago más reciente del cliente.
  function planFromPayments(clientPays){
    const sorted=[...clientPays].sort((a,b)=>new Date(b.date)-new Date(a.date));
    return {...client.plan,endDate:sorted[0]?.endDate||""};
  }

  async function savePayment(){
    if(readOnly){setToast({msg:"Modo demostración: solo lectura",type:"err"});return;}
    // Guardado en dos pasos con rollback: primero la tabla payments, luego el plan.
    const prevClient=client;
    let paid=false;
    try{
      let clientPays;
      if(editingPay){
        const newEnd=addMonths(payDate,period);
        const updated={...editingPay,clientId:client.id,date:payDate,months:period,amount,notes,endDate:newEnd};
        const newAll=allPayments.map(p=>p.id===editingPay.id?updated:p);
        clientPays=newAll.filter(p=>p.clientId===client.id);
        await setPayments(newAll);           // persiste en tabla payments (con rollback interno)
        paid=true;
      } else {
        const currentEnd=client.plan?.endDate;
        const base=(currentEnd&&getPlanStatusFromEndDate(currentEnd)==="Activo")?currentEnd:payDate;
        const newEnd=addMonths(base,period);
        const pay={id:genId(),clientId:client.id,date:payDate,months:period,amount,notes,endDate:newEnd};
        const newAll=[pay,...allPayments];
        clientPays=newAll.filter(p=>p.clientId===client.id);
        await setPayments(newAll);
        paid=true;
      }
      // Actualizar el plan (endDate) del cliente en base a sus pagos.
      const newPlan=editingPay
        ?planFromPayments(clientPays)
        :{...client.plan,endDate:clientPays.sort((a,b)=>new Date(b.date)-new Date(a.date))[0]?.endDate,startDate:client.plan?.startDate||payDate};
      await setClient({...client,plan:newPlan});
      setShowPay(false);setNotes("");setEditingPay(null);
      setToast({msg:editingPay?"Pago actualizado":"Pago registrado correctamente",type:"ok"});
    }catch(e){
      console.error(e);
      // Rollback visual: setPayments ya revierte su estado; si el pago entró pero
      // falló el plan, revertir el cliente para no mostrar datos no guardados.
      if(paid){try{await setClient(prevClient);}catch{/* ignore */}}
      setToast({msg:ERR,type:"err"});
    }
  }

  async function delPayment(id){
    if(readOnly)return;
    if(!confirm("¿Eliminar este pago?"))return;
    const prevClient=client;
    let removed=false;
    try{
      const newAll=allPayments.filter(p=>p.id!==id);
      const clientPays=newAll.filter(p=>p.clientId===client.id);
      await setPayments(newAll);
      removed=true;
      await setClient({...client,plan:planFromPayments(clientPays)});
      setToast({msg:"Pago eliminado",type:"ok"});
    }catch(e){
      console.error(e);
      if(removed){try{await setClient(prevClient);}catch{/* ignore */}}
      setToast({msg:ERR,type:"err"});
    }
  }

  const st=getPlanStatus(client.plan);
  const dl=daysLeft(client.plan?.endDate);
  const previewEnd=editingPay
    ?fmtDate(addMonths(payDate,period))
    :fmtDate(addMonths(client.plan?.endDate&&getPlanStatusFromEndDate(client.plan?.endDate)==="Activo"?client.plan.endDate:payDate,period));

  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="sa">
      <div>
        <span className={`badge ${st==="Activo"?"bd-green":st==="Vencido"?"bd-red":st==="Pausado"?"bd-yellow":"bd-gray"}`} style={{fontSize:12,padding:"4px 12px"}}>{st}</span>
        {dl!==null&&!client.plan?.paused&&<span style={{fontSize:11,color:"#6B7A99",marginLeft:8}}>{dl<0?`Venció hace ${Math.abs(dl)} días`:`${dl} días restantes`}</span>}
        {client.plan?.paused&&<span style={{fontSize:11,color:"#F57C00",marginLeft:8}}>Plan pausado</span>}
      </div>
      {!readOnly&&<button className="btn btn-ok btn-sm" onClick={openNew}>💰 Registrar pago</button>}
    </div>

    {payments.length>0&&<div>
      <div style={{fontSize:10,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Historial de pagos</div>
      {payments.map(p=>{
        const lbl=PAYMENT_PERIODS.find(x=>x.months===p.months)?.label||`${p.months} meses`;
        return(<div key={p.id} className="pay-hist" style={{display:"flex",alignItems:"center",gap:8}}>
          <span>💰</span>
          <div style={{flex:1}}>
            <div style={{fontWeight:700,fontSize:12}}>{fmtDate(p.date)} · {lbl}</div>
            <div style={{fontSize:10,color:"#6B7A99"}}>Válido hasta: {fmtDate(p.endDate)}{p.amount&&` · ₡${p.amount}`}{p.notes&&` · ${p.notes}`}</div>
          </div>
          <button className="ibtn" onClick={()=>openEdit(p)} title="Editar">✏️</button>
          <button className="ibtn d" onClick={()=>delPayment(p.id)} title="Eliminar">🗑</button>
        </div>);
      })}
    </div>}
    {payments.length===0&&<div style={{textAlign:"center",padding:16,color:"#6B7A99",fontSize:12}}>Sin pagos registrados — el plan está sin activar</div>}

    {showPay&&<Modal title={editingPay?"Editar pago":"Registrar pago"} onClose={()=>{setShowPay(false);setEditingPay(null);}}>
      <div className="fg"><label>Fecha de pago</label><input className="inp" type="date" value={payDate} onChange={e=>setPayDate(e.target.value)}/></div>
      <div className="fg"><label>Período pagado</label>
        {PAYMENT_PERIODS.map(p=>(<div key={p.months} className={`pay-row${period===p.months?" selected":""}`} onClick={()=>setPeriod(p.months)}>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div style={{width:18,height:18,borderRadius:"50%",border:`2px solid ${period===p.months?"#1A5DC8":"#DDE4F0"}`,background:period===p.months?"#1A5DC8":"transparent",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{period===p.months&&<div style={{width:8,height:8,borderRadius:"50%",background:"#fff"}}/>}</div>
            <span style={{fontSize:13,fontWeight:600}}>{p.label}</span>
          </div>
        </div>))}
      </div>
      <div className="fr2">
        <div className="fg"><label>Monto (₡/$)</label><input className="inp" type="number" min={0} onKeyDown={preventNegKey} value={amount} onChange={e=>setAmount(stripNeg(e.target.value))} placeholder="0"/></div>
        <div className="fg"><label>Notas</label><input className="inp" value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Opcional"/></div>
      </div>
      <div style={{background:"#EFF6FF",borderRadius:8,padding:10,fontSize:12,marginBottom:12,color:"#1A5DC8"}}>
        {editingPay?"📅":"✅"} {editingPay?"Nuevo vencimiento estimado:":"Nuevo vencimiento:"} <strong>{previewEnd}</strong>
      </div>
      <div style={{display:"flex",gap:8}}>
        <SaveBtn className="btn btn-ok" onClick={()=>wrap(savePayment)} saving={saving}>{editingPay?"Guardar cambios":"Confirmar pago"}</SaveBtn>
        <button className="btn btn-g" onClick={()=>{setShowPay(false);setEditingPay(null);}}>Cancelar</button>
      </div>
    </Modal>}
  </div>);
}

// ── PLAN EDITOR ──
export function PlanEditor({client,onSave}){
  const cat=useCatalogs();
  const{readOnly}=usePermissions();
  const[form,setForm]=useState(()=>({type:"Base",modality:"En Estudio",format:"Individual",startDate:"",endDate:"",price:"",notes:"",paused:false,pausedAt:null,...(client.plan||{})}));
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();

  async function handleSave(){
    if(readOnly){setToast({msg:"Modo demostración: solo lectura",type:"err"});return;}
    try{
      await onSave(form);
      setToast({msg:"Plan guardado correctamente",type:"ok"});
    }catch{
      setToast({msg:"Hubo un problema al guardar. Intentá de nuevo en unos minutos.",type:"err"});
    }
  }

  function handlePause(){
    if(!form.paused){
      // Pause: record the pause date
      setForm(f=>({...f,paused:true,pausedAt:new Date().toISOString().split("T")[0]}));
    } else {
      // Unpause: extend end date by the number of days paused
      const pausedAt=form.pausedAt?new Date(form.pausedAt+"T12:00:00"):new Date();
      const today=new Date();
      const daysPaused=Math.max(0,Math.ceil((today-pausedAt)/(1000*60*60*24)));
      let newEnd=form.endDate;
      if(newEnd&&daysPaused>0){
        const d=new Date(newEnd+"T12:00:00");
        d.setDate(d.getDate()+daysPaused);
        newEnd=d.toISOString().split("T")[0];
      }
      setForm(f=>({...f,paused:false,pausedAt:null,endDate:newEnd}));
    }
  }

  const st=getPlanStatus(form);
  const dl=daysLeft(form.endDate);
  const daysPausedSoFar=form.paused&&form.pausedAt?Math.ceil((new Date()-new Date(form.pausedAt+"T12:00:00"))/(1000*60*60*24)):0;

  return(<div className="card">
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14,flexWrap:"wrap",gap:8}}>
      <div style={{fontWeight:700,fontSize:13}}>Configuración del plan</div>
      <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
        <span className={`badge ${st==="Activo"?"bd-green":st==="Pausado"?"bd-yellow":st==="Vencido"?"bd-red":"bd-gray"}`}>{st}</span>
        {dl!==null&&!form.paused&&<span style={{fontSize:11,color:dl<0?"#E53935":dl<=30?"#F57C00":"#6B7A99"}}>{dl<0?`Venció hace ${Math.abs(dl)}d`:`${dl} días restantes`}</span>}
        {form.paused&&<span style={{fontSize:11,color:"#F57C00"}}>Pausado hace {daysPausedSoFar}d</span>}
      </div>
    </div>

    <div className="fr3">
      <div className="fg"><label>Tipo</label><select className="sel" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>{cat.planTypes.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
      <div className="fg"><label>Modalidad</label><select className="sel" value={form.modality} onChange={e=>setForm({...form,modality:e.target.value})}>{cat.planModalities.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
      <div className="fg"><label>Formato</label><select className="sel" value={form.format} onChange={e=>setForm({...form,format:e.target.value})}>{cat.planFormats.map(f=><option key={f} value={f}>{f}</option>)}</select></div>
    </div>
    <div className="fr3">
      <div className="fg"><label>Fecha inicio</label><input className="inp" type="date" value={form.startDate||""} onChange={e=>setForm({...form,startDate:e.target.value})}/></div>
      <div className="fg">
        <label>Fecha vencimiento <span style={{color:"#1A5DC8",fontSize:9,fontWeight:700}}>EDITABLE</span></label>
        <input className="inp" type="date" value={form.endDate||""} onChange={e=>setForm({...form,endDate:e.target.value})}/>
      </div>
      <div className="fg"><label>Precio (₡/$)</label><input className="inp" value={form.price||""} onChange={e=>setForm({...form,price:e.target.value})} placeholder="0"/></div>
    </div>
    <div className="fg"><label>Notas</label><input className="inp" value={form.notes||""} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Descuento, acuerdo especial..."/></div>

    {readOnly?<div style={{borderTop:"1px solid #DDE4F0",paddingTop:12,marginTop:4,fontSize:12,color:"#7B1FA2"}}>👀 Modo demostración — solo lectura.</div>:
    <div style={{borderTop:"1px solid #DDE4F0",paddingTop:12,marginTop:4,display:"flex",gap:8,flexWrap:"wrap",alignItems:"center"}}>
      <SaveBtn onClick={()=>wrap(handleSave)} saving={saving}>💾 Guardar</SaveBtn>
      <button
        className={`btn ${form.paused?"btn-ok":"btn-w"}`}
        onClick={handlePause}
        title={form.paused?"Quitar pausa y extender fecha según días pausados":"Poner plan en pausa"}
      >
        {form.paused?"▶ Reactivar plan":"⏸ Pausar plan"}
      </button>
      {form.paused&&<span style={{fontSize:11,color:"#6B7A99",fontStyle:"italic"}}>Al reactivar se añaden {daysPausedSoFar}d a la fecha de vencimiento</span>}
    </div>}
  </div>);
}

// ── MEASUREMENTS ──
export function MeasurementsTab({client,measurements,setMeasurements}){
  const{readOnly}=usePermissions();
  const blankForm={date:new Date().toISOString().split("T")[0],...Object.fromEntries(MEASUREMENT_FIELDS.map(f=>[f.key,""]))};
  const[showAdd,setShowAdd]=useState(false);
  const[editingM,setEditingM]=useState(null);
  const[mForm,setMForm]=useState(blankForm);
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";
  const clientMs=measurements.filter(m=>m.clientId===client.id).sort((a,b)=>new Date(b.date)-new Date(a.date));
  const latest=clientMs[0];

  function openAdd(){setMForm(blankForm);setEditingM(null);setShowAdd(true)}
  function openEdit(m){setMForm({date:m.date,...Object.fromEntries(MEASUREMENT_FIELDS.map(f=>[f.key,m[f.key]||""]))});setEditingM(m.id);setShowAdd(true)}
  async function save(){
    if(readOnly){setToast({msg:"Modo demostración: solo lectura",type:"err"});return;}
    try{
      if(editingM){await setMeasurements(measurements.map(m=>m.id===editingM?{...m,...mForm}:m));}
      else{await setMeasurements([...measurements,{id:genId(),clientId:client.id,...mForm}]);}
      setShowAdd(false);setMForm(blankForm);setEditingM(null);
      setToast({msg:editingM?"Medición actualizada":"Medición registrada",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  async function del(id){
    if(readOnly)return;
    if(!confirm("¿Eliminar medición?"))return;
    try{await setMeasurements(measurements.filter(m=>m.id!==id));setToast({msg:"Medición eliminada",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }

  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="sa">
      <div style={{fontWeight:700,fontSize:13}}>Última medición{latest?` — ${fmtDate(latest.date)}`:""}</div>
      {!readOnly&&<button className="btn btn-p btn-sm" onClick={openAdd}>+ Registrar</button>}
    </div>
    {latest?(<div className="m-grid">{MEASUREMENT_FIELDS.map(f=>{const v=latest[f.key];return v?(<div key={f.key} className="m-card"><div className="m-lbl">{f.label}</div><div className="m-val">{v}<span className="m-unit"> {f.unit}</span></div></div>):null;})}</div>):<div className="empty"><div className="ico">📊</div><p>Sin mediciones</p></div>}
    {clientMs.length>1&&<div style={{marginTop:14}}>
      <div style={{fontSize:10,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Todas las mediciones</div>
      {clientMs.map(m=>(
        <div key={m.id} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #DDE4F0"}}>
          <div style={{fontWeight:700,fontSize:12,minWidth:80,color:"#0B1F4B"}}>{fmtDate(m.date)}</div>
          <div style={{flex:1,display:"flex",flexWrap:"wrap",gap:4}}>{MEASUREMENT_FIELDS.map(f=>m[f.key]&&<span key={f.key} className="hist-val">{f.label.split(" ")[0]}: {m[f.key]}{f.unit}</span>)}</div>
          <button className="ibtn" onClick={()=>openEdit(m)} title="Editar">✏️</button>
          <button className="ibtn d" onClick={()=>del(m.id)} title="Eliminar">🗑</button>
        </div>
      ))}
    </div>}
    {showAdd&&<Modal title={editingM?"Editar medición":"Registrar medición"} onClose={()=>setShowAdd(false)}>
      <div className="fg"><label>Fecha</label><input className="inp" type="date" value={mForm.date} onChange={e=>setMForm({...mForm,date:e.target.value})}/></div>
      <div className="fr2">{MEASUREMENT_FIELDS.map(f=>(<div key={f.key} className="fg"><label>{f.label}{f.unit?` (${f.unit})`:""}</label><input className="inp" type="number" step="0.1" min={0} onKeyDown={preventNegKey} value={mForm[f.key]} onChange={e=>setMForm({...mForm,[f.key]:stripNeg(e.target.value)})} placeholder="—"/></div>))}</div>
      <div style={{display:"flex",gap:8}}><SaveBtn onClick={()=>wrap(save)} saving={saving}>{editingM?"Guardar cambios":"Guardar"}</SaveBtn><button className="btn btn-g" onClick={()=>setShowAdd(false)}>Cancelar</button></div>
    </Modal>}
  </div>);
}

// ── HISTORY WITH CHART SELECTOR ──
export function MultiChart({clientMs}){
  const[chartField,setChartField]=useState("weight");
  const data=clientMs.filter(m=>m[chartField]&&Number(m[chartField])>0).slice(-10);
  const max=data.length?Math.max(...data.map(m=>Number(m[chartField]))):1;
  const min=data.length?Math.min(...data.map(m=>Number(m[chartField]))):0;
  const range=max-min||1;
  const fld=MEASUREMENT_FIELDS.find(f=>f.key===chartField);
  return(<div className="card" style={{marginBottom:12}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1}}>Gráfico:</div>
      <select className="sel" style={{width:"auto",minWidth:150,flex:1}} value={chartField} onChange={e=>setChartField(e.target.value)}>
        {MEASUREMENT_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}{f.unit?` (${f.unit})`:""}</option>)}
      </select>
    </div>
    {data.length>1?(<div className="chart-wrap">
      <div className="chart-inner">
        {data.map((m,i)=>{
          const h=Math.max(6,((Number(m[chartField])-min)/range)*80+12);
          const color=CHART_COLORS[MEASUREMENT_FIELDS.findIndex(f=>f.key===chartField)%CHART_COLORS.length];
          return(<div key={i} className="chart-col">
            <div className="chart-val">{m[chartField]}</div>
            <div className="chart-bar-f" style={{height:h,background:color}}/>
            <div className="chart-lbl">{m.date?.slice(5)}</div>
          </div>);
        })}
      </div>
    </div>):<div style={{textAlign:"center",padding:12,color:"#6B7A99",fontSize:12}}>Necesitas al menos 2 mediciones de {fld?.label} para ver la gráfica</div>}
  </div>);
}

export function HistoryTab({client,measurements,setMeasurements}){
  const{readOnly}=usePermissions();
  const clientMs=measurements.filter(m=>m.clientId===client.id).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const clientMsDesc=[...clientMs].reverse();
  const[toast,setToast]=useState(null);
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";
  async function del(id){
    if(readOnly)return;
    if(!confirm("¿Eliminar?"))return;
    try{await setMeasurements(measurements.filter(m=>m.id!==id));setToast({msg:"Registro eliminado",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    {clientMs.length>1&&<MultiChart clientMs={clientMs}/>}
    <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Historial ({clientMs.length})</div>
    {clientMsDesc.map(m=>(<div key={m.id} className="hist-row">
      <div className="hist-date">{fmtDate(m.date)}</div>
      <div className="hist-vals">{MEASUREMENT_FIELDS.map(f=>m[f.key]&&<span key={f.key} className="hist-val">{f.label.split(" ")[0]}: {m[f.key]}{f.unit}</span>)}</div>
      <button className="ibtn d" onClick={()=>del(m.id)}>🗑</button>
    </div>))}
    {clientMs.length===0&&<div className="empty"><div className="ico">📈</div><p>Sin historial</p></div>}
  </div>);
}

// ── EDIT CLIENT MODAL (admin) ──
function ConfirmPwdPopup({pwd,onConfirm,onCancel}){
  const[copied,setCopied]=useState(false);
  function handleCopy(){navigator.clipboard.writeText(pwd).then(()=>{setCopied(true);setTimeout(()=>setCopied(false),2000);});}
  return(<div style={{position:"fixed",inset:0,background:"rgba(11,31,75,0.6)",zIndex:10000,display:"flex",alignItems:"center",justifyContent:"center",padding:"0 20px"}} onClick={onCancel}>
    <div style={{background:"#fff",borderRadius:16,padding:"24px 20px",width:"100%",maxWidth:360,boxShadow:"0 8px 40px rgba(11,31,75,0.22)"}} onClick={e=>e.stopPropagation()}>
      <div style={{fontSize:22,textAlign:"center",marginBottom:8}}>🔑</div>
      <div style={{fontWeight:800,fontSize:16,color:"#0B1F4B",textAlign:"center",marginBottom:6}}>Contraseña generada</div>
      <div style={{fontSize:13,color:"#6B7A99",textAlign:"center",marginBottom:16}}>Copiá la contraseña antes de guardar para enviársela al cliente.</div>
      <div style={{display:"flex",alignItems:"center",gap:8,justifyContent:"center",marginBottom:20}}>
        <span style={{fontFamily:"monospace",fontWeight:700,fontSize:18,background:"#F0F4FF",border:"1px solid #C7D6F7",borderRadius:8,padding:"6px 14px",letterSpacing:3,color:"#0B1F4B"}}>{pwd}</span>
        <button type="button" className="btn btn-s btn-sm" onClick={handleCopy}>{copied?"✅":"📋"}</button>
      </div>
      <div style={{display:"flex",gap:8}}>
        <button className="btn btn-p" style={{flex:1}} onClick={onConfirm}>Guardar cambios</button>
        <button className="btn btn-g" style={{flex:1}} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  </div>);
}

function EditClientModal({cForm,setCForm,onSave,onClose,saving=false}){
  const[genPwd,setGenPwd]=useState("");
  const[showConfirm,setShowConfirm]=useState(false);
  const{features}=usePermissions();

  function handleGenerate(){
    const pwd=generatePassword();
    setGenPwd(pwd);
    setCForm(f=>({...f,_newPlainPwd:pwd}));
    setShowConfirm(true);
  }
  function handleConfirm(){setShowConfirm(false);onSave();}
  function handleCancelPwd(){
    setGenPwd("");
    setCForm(f=>{const n={...f};delete n._newPlainPwd;return n;});
    setShowConfirm(false);
  }

  return(<Modal title="Editar datos" onClose={onClose}>
    {showConfirm&&<ConfirmPwdPopup pwd={genPwd} onConfirm={handleConfirm} onCancel={handleCancelPwd}/>}
    <div className="fr2">
      <div className="fg"><label>Nombre</label><input className="inp" value={cForm.name||""} onChange={e=>setCForm({...cForm,name:e.target.value})}/></div>
      <div className="fg"><label>Usuario</label><input className="inp" value={cForm.username||""} onChange={e=>setCForm({...cForm,username:e.target.value})}/></div>
      <div className="fg"><label>Cédula</label><input className="inp" value={cForm.cedula||""} onChange={e=>setCForm({...cForm,cedula:e.target.value})}/></div>
      <div className="fg"><label>Teléfono</label><input className="inp" value={cForm.phone||""} onChange={e=>setCForm({...cForm,phone:e.target.value})}/></div>
      <div className="fg"><label>Correo</label><input className="inp" type="email" value={cForm.email||""} onChange={e=>setCForm({...cForm,email:e.target.value})}/></div>
      <div className="fg"><label>Fecha de nacimiento</label><input className="inp" type="date" value={cForm.dob||""} onChange={e=>setCForm({...cForm,dob:e.target.value})}/></div>
      <div className="fg"><label>Estatura (cm)</label><input className="inp" type="number" min={0} onKeyDown={preventNegKey} value={cForm.height||""} onChange={e=>setCForm({...cForm,height:stripNeg(e.target.value)})}/></div>
    </div>
    <div className="fg"><label>Notas internas</label><textarea className="ta" value={cForm.notes||""} onChange={e=>setCForm({...cForm,notes:e.target.value})}/></div>
    {features?.payment_reminders&&<div style={{borderTop:"1px solid #DDE4F0",paddingTop:12,marginTop:4}}>
      <label style={{display:"flex",alignItems:"center",gap:8,cursor:"pointer"}}>
        <input type="checkbox" checked={cForm.reminderEnabled!==false} onChange={e=>setCForm({...cForm,reminderEnabled:e.target.checked})} style={{width:16,height:16}}/>
        <span style={{fontSize:13,fontWeight:600,color:"#0B1F4B"}}>🔔 Enviar recordatorio de pago a este cliente</span>
      </label>
    </div>}
    <div style={{borderTop:"1px solid #DDE4F0",paddingTop:12,marginTop:4}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Contraseña</div>
      <div style={{fontSize:12,color:"#6B7A99",marginBottom:8}}>Generá una nueva contraseña para enviarle al cliente (cliente nuevo o contraseña olvidada).</div>
      <button type="button" className="btn btn-s btn-sm" onClick={handleGenerate}>🔑 Generar contraseña</button>
      {genPwd&&<div style={{marginTop:8,fontSize:12,color:"#1A5DC8"}}>✅ Contraseña lista — se guardará junto con los datos.</div>}
    </div>
    <div style={{display:"flex",gap:8,marginTop:14}}><SaveBtn onClick={onSave} saving={saving}>Guardar</SaveBtn><button className="btn btn-g" onClick={onClose}>Cancelar</button></div>
  </Modal>);
}

// ── CLIENT DETAIL ──
export function ClientDetail({client,setClient,measurements,setMeasurements,payments=[],setPayments,workoutSessions=[],setWorkoutSessions,routines,onBack,onDelete,deleteConfirm,setDeleteConfirm,doDelete}){
  const{readOnly}=usePermissions();
  const[tab,setTab]=useState("info");
  const[showEditInfo,setShowEditInfo]=useState(false);
  const[cForm,setCForm]=useState({...client});
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";

  const[disableConfirm,setDisableConfirm]=useState(false);

  async function saveInfo(){
    if(readOnly){setToast({msg:"Modo demostración: solo lectura",type:"err"});return;}
    try{
      let updated={...cForm};
      // La contraseña de login vive en Supabase Auth, no en users.password. Si el
      // entrenador generó una clave nueva, se aplica vía Edge Function segura.
      const newPwd=updated._newPlainPwd;
      delete updated._newPlainPwd;
      await setClient({...updated}); // no tocamos updated.password (columna legacy)
      // El opt-out de recordatorios se guarda por separado (columna dedicada; tolerante si aún no existe la migración 0026).
      if(updated.reminderEnabled!==client.reminderEnabled){
        try{await setClientReminder(client.id,updated.reminderEnabled!==false);}catch(e){console.warn("setClientReminder:",e?.message||e);}
      }
      // Si cambió el correo, reenviar la invitación al NUEVO correo (y la función
      // invalida el link viejo borrando la cuenta Auth del correo equivocado).
      const oldEmail=(client.email||"").trim().toLowerCase();
      const newEmail=(updated.email||"").trim().toLowerCase();
      let reinvited=false;
      if(newEmail&&newEmail!==oldEmail&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)){
        const inv=await inviteClient(client.id,newEmail);
        if(inv.ok)reinvited=true;
        else{setShowEditInfo(false);setToast({msg:"Datos guardados, pero no se pudo reenviar la invitación: "+(inv.error||"intentá de nuevo."),type:"err"});return;}
      }
      if(newPwd){
        const res=await resetClientPassword(client.id,newPwd);
        if(!res.ok){
          setShowEditInfo(false);
          const msg=res.error==="client_no_auth"
            ? "Este cliente aún no tiene cuenta de correo para iniciar sesión. Asignale un correo y creá su acceso primero."
            : ("No se pudo cambiar la contraseña del cliente: "+(res.error||"intentá de nuevo."));
          setToast({msg,type:"err"});return;
        }
      }
      setShowEditInfo(false);setToast({msg:reinvited?"Datos guardados y correo de invitación reenviado al nuevo correo.":(newPwd?"Datos y contraseña actualizados":"Datos actualizados"),type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  async function savePlan(plan){
    if(readOnly)return;
    await setClient({...client,plan});
  }
  async function doToggleDisabled(){
    if(readOnly)return;
    const next=!client.disabled;
    try{
      await setClient({...client,disabled:next});
      setDisableConfirm(false);
      setToast({msg:next?"Usuario deshabilitado":"Usuario habilitado",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }

  const routine=routines.find(r=>r.userId===client.id);
  const dl=daysLeft(client.plan?.endDate);
  const age=client.dob?calcAge(client.dob):null;

  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
      <button className="back-btn" style={{margin:0}} onClick={onBack}>← Volver</button>
      {!readOnly&&<div style={{marginLeft:"auto",display:"flex",gap:6}}>
        <button className={`btn btn-sm ${client.disabled?"btn-ok":"btn-w"}`} onClick={()=>setDisableConfirm(true)}>
          {client.disabled?"✅ Habilitar":"🚫 Deshabilitar"}
        </button>
        <button className="btn btn-d btn-sm" onClick={onDelete}>🗑 Eliminar</button>
      </div>}
    </div>
    <div className="ph">
      <div style={{display:"flex",alignItems:"center",gap:12}}>
        <div style={{width:44,height:44,borderRadius:"50%",background:client.disabled?"#9E9E9E":"#3A8EF6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:16,fontWeight:800,color:"#fff",flexShrink:0}}>{initials(client.name)}</div>
        <div>
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <div className="pt" style={{fontSize:20}}>{client.name}</div>
            {client.disabled&&<span className="badge bd-red" style={{fontSize:10}}>🚫 Deshabilitado</span>}
          </div>
          <div className="ps">@{client.username}{age!==null&&` · ${age} años`}</div>
        </div>
      </div>
      {dl!==null&&dl>=0&&dl<=30&&<div className="warn-box" style={{margin:0,alignSelf:"center"}}>⚠ Plan vence en {dl}d</div>}
    </div>
    {disableConfirm&&<Modal title={client.disabled?"Habilitar usuario":"Deshabilitar usuario"} onClose={()=>setDisableConfirm(false)}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:44,marginBottom:12}}>{client.disabled?"✅":"🚫"}</div>
        {client.disabled
          ?<><div style={{fontSize:15,fontWeight:700,color:"#0B1F4B",marginBottom:8}}>¿Habilitar a {client.name}?</div>
            <div style={{fontSize:13,color:"#6B7A99"}}>El usuario podrá volver a iniciar sesión en la app.</div></>
          :<><div style={{fontSize:15,fontWeight:700,color:"#0B1F4B",marginBottom:8}}>¿Deshabilitar a {client.name}?</div>
            <div style={{fontSize:13,color:"#E53935",marginBottom:4}}>El usuario <strong>no podrá iniciar sesión</strong> hasta que lo habilites nuevamente.</div>
            <div style={{fontSize:12,color:"#6B7A99"}}>Sus datos y rutinas se conservan.</div></>
        }
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        <SaveBtn className={`btn ${client.disabled?"btn-ok":"btn-w"}`} onClick={()=>wrap(doToggleDisabled)} saving={saving}>
          {client.disabled?"Sí, habilitar":"Sí, deshabilitar"}
        </SaveBtn>
        <button className="btn btn-g" onClick={()=>setDisableConfirm(false)}>Cancelar</button>
      </div>
    </Modal>}
    {deleteConfirm&&<Modal title="⚠️ Eliminar cliente" onClose={()=>setDeleteConfirm(null)}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:40,marginBottom:12}}>🗑️</div>
        <div style={{fontSize:15,fontWeight:700,color:"#0B1F4B",marginBottom:8}}>¿Eliminar a {deleteConfirm.name}?</div>
        <div style={{fontSize:13,color:"#E53935",marginBottom:4}}>Esta acción <strong>no se puede deshacer</strong>.</div>
        <div style={{fontSize:12,color:"#6B7A99"}}>Se eliminarán todos sus datos, rutinas asignadas y mediciones.</div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        <SaveBtn className="btn btn-d" onClick={()=>wrap(doDelete)} saving={saving}>Sí, eliminar</SaveBtn>
        <button className="btn btn-g" onClick={()=>setDeleteConfirm(null)}>Cancelar</button>
      </div>
    </Modal>}
    <div className="tabs">
      {[["info","👤 Info"],["plan","💳 Plan"],["payments","💰 Pagos"],["workouts","🏋️ Entrenos"],["measurements","📊 Medición"],["history","📈 Historial"]].map(([id,lbl])=>(<div key={id} className={`tab${tab===id?" active":""}`} onClick={()=>setTab(id)}>{lbl}</div>))}
    </div>

    {tab==="info"&&(<div className="card">
      <div className="sa"><div style={{fontWeight:700,fontSize:13}}>Datos personales</div>{!readOnly&&<button className="btn btn-s btn-sm" onClick={()=>{setCForm({...client});setShowEditInfo(true)}}>✏️ Editar</button>}</div>
      <div className="fr2">{[["Nombre",client.name],["Usuario","@"+client.username],["Cédula",client.cedula],["Teléfono",client.phone],["Correo",client.email],["Fecha nac.",fmtDate(client.dob)],["Edad",age!==null?(age+" años"):"—"],["Estatura",client.height?(client.height+" cm"):"—"]].map(([k,v])=>(<div key={k} style={{padding:"8px 0",borderBottom:"1px solid #DDE4F0"}}><div style={{fontSize:10,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1}}>{k}</div><div style={{fontSize:13,fontWeight:600,marginTop:2}}>{v||"—"}</div></div>))}</div>
      {client.notes&&<div style={{marginTop:10,padding:10,background:"#F8F9FF",borderRadius:7,fontSize:12,color:"#6B7A99"}}>{client.notes}</div>}
      <div style={{marginTop:10,fontSize:12,color:"#6B7A99"}}>Rutina: <strong style={{color:"#0B1F4B"}}>{routine?routine.title:"Sin rutina"}</strong></div>
    </div>)}

    {tab==="plan"&&<PlanEditor client={client} onSave={savePlan}/>}
    {tab==="payments"&&<div className="card"><PaymentModule client={client} setClient={setClient} payments={payments} setPayments={setPayments}/></div>}
    {tab==="workouts"&&<WorkoutHistory sessions={workoutSessions.filter(s=>s.userId===client.id)} onDeleteSession={(setWorkoutSessions&&!readOnly)?async id=>{
      if(!confirm("¿Eliminar este entrenamiento del historial?"))return;
      try{await setWorkoutSessions(workoutSessions.filter(s=>s.id!==id));setToast({msg:"Entrenamiento eliminado",type:"ok"});}
      catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
    }:undefined}/>}
    {tab==="measurements"&&<PlanGate feature="measurements"><MeasurementsTab client={client} measurements={measurements} setMeasurements={setMeasurements}/></PlanGate>}
    {tab==="history"&&<PlanGate feature="analytics"><HistoryTab client={client} measurements={measurements} setMeasurements={setMeasurements}/></PlanGate>}

    {showEditInfo&&<EditClientModal cForm={cForm} setCForm={setCForm} onSave={()=>wrap(saveInfo)} saving={saving} onClose={()=>setShowEditInfo(false)}/>}
  </div>);
}

// ── CLIENTS LIST ──
export function ClientsPage({users,setUsers,routines,measurements,setMeasurements,payments=[],setPayments,workoutSessions=[],setWorkoutSessions,selectedClientId}){
  const cat=useCatalogs();
  const{readOnly}=usePermissions();
  const tenant=useTenant();
  const orgId=tenant?.org?.id||null; // org del entrenador (para asignar el cliente)
  const BLANK_CLIENT={name:"",username:"",email:"",phone:"",cedula:"",dob:"",height:"",notes:"",plan:{type:"Base",modality:"En Estudio",format:"Individual",startDate:"",endDate:"",price:""}};
  const[detail,setDetail]=useState(()=>selectedClientId?users.find(u=>u.id===selectedClientId)||null:null);
  const[showAdd,setShowAdd]=useState(false);
  const[form,setForm]=useState(BLANK_CLIENT);
  const[err,setErr]=useState("");
  const[deleteConfirm,setDeleteConfirm]=useState(null);
  const[toast,setToast]=useState(null);
  const[search,setSearch]=useState("");
  const[saving,wrap]=useSaving();
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";

  async function addClient(){
    if(readOnly)return; // demo_viewer: solo lectura
    if(!form.name||!form.email){setErr("Nombre y correo son requeridos.");return}
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)){setErr("El correo no es válido.");return}
    const username=(form.username||form.email).trim();
    if(users.some(u=>u.username===username||(u.email&&u.email.toLowerCase()===form.email.toLowerCase()))){setErr("Ya existe un cliente con ese correo/usuario.");return}
    try{
      const id=genId();
      // Cliente SIN contraseña: se invita por correo y él crea la suya.
      await setUsers([...users,{id,...form,username,password:"",role:"user",organizationId:orgId,payments:[]}]);
      const res=await inviteClient(id,form.email);
      setForm(BLANK_CLIENT);setErr("");setShowAdd(false);
      setToast(res.ok
        ?{msg:"Cliente creado. Le enviamos un correo para crear su contraseña.",type:"ok"}
        :{msg:"Cliente creado, pero no se pudo enviar la invitación: "+(res.error||"intentá reenviarla."),type:"err"});
    }catch(e){console.error(e);setErr("No se pudo crear el cliente: "+(e?.message||e?.details||ERR));}
  }

  // Chokepoint de persistencia de ClientDetail (info/plan/deshabilitar): bloquea demo.
  function updateClient(u){if(readOnly)return;setUsers(users.map(x=>x.id===u.id?u:x));setDetail(u)}
  function confirmDelete(client){setDeleteConfirm(client)}
  async function doDelete(){
    if(readOnly)return; // demo_viewer: solo lectura
    if(!deleteConfirm)return;
    const id=deleteConfirm.id;
    try{
      // Borra la fila + la cuenta Auth (para que no queden cuentas huérfanas).
      // Best-effort: si falla (ej. modo legacy sin Auth), el setUsers de abajo borra
      // al menos la fila. Si funciona, ese setUsers queda como no-op sobre la fila.
      await deleteClientAccount(id).catch(()=>{});
      await setUsers(users.filter(u=>u.id!==id));
      setDeleteConfirm(null);setDetail(null);
      setToast({msg:"Cliente eliminado",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});setDeleteConfirm(null);}
  }

  const activeDetail=selectedClientId?users.find(u=>u.id===selectedClientId)||null:detail;

  if(activeDetail){
    const live=users.find(u=>u.id===activeDetail.id)||activeDetail;
    return<ClientDetail
      client={live}
      setClient={c=>updateClient({...live,...c})}
      measurements={measurements}
      setMeasurements={setMeasurements}
      payments={payments}
      setPayments={setPayments}
      workoutSessions={workoutSessions}
      setWorkoutSessions={setWorkoutSessions}
      routines={routines}
      onBack={()=>setDetail(null)}
      onDelete={()=>confirmDelete(live)}
      deleteConfirm={deleteConfirm}
      setDeleteConfirm={setDeleteConfirm}
      doDelete={doDelete}
    />;
  }
  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="ph"><div><div className="pt">Clientes</div><div className="ps">{users.length} clientes</div></div>{!readOnly&&<button className="btn btn-p" onClick={()=>setShowAdd(true)}>+ Nuevo</button>}</div>
    <input className="inp" placeholder="🔍 Buscar por nombre o usuario..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:10}}/>
    <div className="card" style={{padding:0}}>
      <div className="tbl-wrap"><table className="tbl">
        <thead><tr><th>Cliente</th><th>Plan</th><th>Modalidad</th><th>Vence</th><th>Estado</th></tr></thead>
        <tbody>{users.filter(u=>u.name.toLowerCase().includes(search.toLowerCase())||u.username.toLowerCase().includes(search.toLowerCase())).map(u=>{
          const st=getPlanStatus(u.plan);
          const dl=daysLeft(u.plan?.endDate);
          return(<tr key={u.id} style={{cursor:"pointer"}} onClick={()=>setDetail(u)}>
            <td><div style={{display:"flex",alignItems:"center",gap:7}}><div style={{width:28,height:28,borderRadius:"50%",background:u.disabled?"#9E9E9E":"#3A8EF6",display:"flex",alignItems:"center",justifyContent:"center",fontSize:10,fontWeight:800,color:"#fff",flexShrink:0}}>{initials(u.name)}</div><div><strong>{u.name}</strong><br/><span style={{color:"#6B7A99",fontSize:10}}>@{u.username}</span></div></div></td>
            <td><span className={`badge ${planColor(u.plan?.type)}`}>{u.plan?.type||"—"}</span></td>
            <td><span className="badge bd-gray">{u.plan?.modality||"—"}</span></td>
            <td style={{fontSize:11}}>{fmtDate(u.plan?.endDate)}{dl!==null&&dl>=0&&dl<=15&&<span style={{color:"#F57C00",fontWeight:700}}> ⚠</span>}</td>
            <td>{u.disabled?<span className="badge bd-red">🚫 Deshabilitado</span>:<span className={`badge ${st==="Activo"?"bd-green":st==="Vencido"?"bd-red":"bd-gray"}`}>{st}</span>}</td>
          </tr>);
        })}{users.filter(u=>u.name.toLowerCase().includes(search.toLowerCase())||u.username.toLowerCase().includes(search.toLowerCase())).length===0&&<tr><td colSpan={5}><div className="empty"><div className="ico">🔍</div><p>{search?"Sin resultados para \""+search+"\"":"Sin clientes"}</p></div></td></tr>}</tbody>
      </table></div>
    </div>
    {showAdd&&<Modal title="Nuevo cliente" onClose={()=>setShowAdd(false)}>
      {err&&<div className="err">{err}</div>}
      <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Datos personales</div>
      <div className="fr2">
        <div className="fg"><label>Nombre *</label><input className="inp" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="María García"/></div>
        <div className="fg"><label>Correo *</label><input className="inp" type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} placeholder="maria@correo.com"/></div>
        <div className="fg" style={{gridColumn:"1/-1"}}>
          <div style={{fontSize:12,color:"#1A5DC8",background:"#EEF3FF",border:"1px solid #C7D6F7",borderRadius:8,padding:"8px 12px"}}>📧 Al crear el cliente, le enviamos un correo para que <strong>cree su propia contraseña</strong>. Ya no se usan contraseñas temporales.</div>
        </div>
        <div className="fg"><label>Usuario (opcional)</label><input className="inp" value={form.username} onChange={e=>setForm({...form,username:e.target.value})} placeholder="se usa el correo si lo dejás vacío"/></div>
        <div className="fg"><label>Cédula</label><input className="inp" value={form.cedula} onChange={e=>setForm({...form,cedula:e.target.value})}/></div>
        <div className="fg"><label>Teléfono</label><input className="inp" value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
        <div className="fg"><label>Fecha de nacimiento</label><input className="inp" type="date" value={form.dob} onChange={e=>setForm({...form,dob:e.target.value})}/></div>
        <div className="fg"><label>Estatura (cm)</label><input className="inp" type="number" min={0} onKeyDown={preventNegKey} value={form.height} onChange={e=>setForm({...form,height:stripNeg(e.target.value)})}/></div>
      </div>
      <div className="fg"><label>Notas internas</label><textarea className="ta" value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} rows={2}/></div>
      <div style={{borderTop:"1px solid #DDE4F0",paddingTop:12,marginTop:4}}>
        <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Plan</div>
        <div className="fr3">
          <div className="fg"><label>Tipo</label><select className="sel" value={form.plan.type} onChange={e=>setForm({...form,plan:{...form.plan,type:e.target.value}})}>{cat.planTypes.map(t=><option key={t}>{t}</option>)}</select></div>
          <div className="fg"><label>Modalidad</label><select className="sel" value={form.plan.modality} onChange={e=>setForm({...form,plan:{...form.plan,modality:e.target.value}})}>{cat.planModalities.map(m=><option key={m}>{m}</option>)}</select></div>
          <div className="fg"><label>Formato</label><select className="sel" value={form.plan.format} onChange={e=>setForm({...form,plan:{...form.plan,format:e.target.value}})}>{cat.planFormats.map(f=><option key={f}>{f}</option>)}</select></div>
        </div>
        <div className="fr2">
          <div className="fg"><label>Fecha inicio</label><input className="inp" type="date" value={form.plan.startDate} onChange={e=>setForm({...form,plan:{...form.plan,startDate:e.target.value}})}/></div>
          <div className="fg"><label>Fecha vencimiento</label><input className="inp" type="date" value={form.plan.endDate} onChange={e=>setForm({...form,plan:{...form.plan,endDate:e.target.value}})}/></div>
          <div className="fg"><label>Precio (₡/$)</label><input className="inp" type="number" min={0} onKeyDown={preventNegKey} value={form.plan.price} onChange={e=>setForm({...form,plan:{...form.plan,price:stripNeg(e.target.value)}})}/></div>
        </div>
      </div>
      <div style={{display:"flex",gap:8,marginTop:4}}><SaveBtn onClick={()=>wrap(addClient)} saving={saving}>Crear cliente</SaveBtn><button className="btn btn-g" onClick={()=>setShowAdd(false)}>Cancelar</button></div>
    </Modal>}

    {deleteConfirm&&<Modal title="⚠️ Eliminar cliente" onClose={()=>setDeleteConfirm(null)}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:40,marginBottom:12}}>🗑️</div>
        <div style={{fontSize:15,fontWeight:700,color:"#0B1F4B",marginBottom:8}}>¿Eliminar a {deleteConfirm.name}?</div>
        <div style={{fontSize:13,color:"#E53935",marginBottom:4}}>Esta acción <strong>no se puede deshacer</strong>.</div>
        <div style={{fontSize:12,color:"#6B7A99"}}>Se eliminarán todos sus datos, rutinas asignadas y mediciones.</div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        <SaveBtn className="btn btn-d" onClick={()=>wrap(doDelete)} saving={saving}>Sí, eliminar</SaveBtn>
        <button className="btn btn-g" onClick={()=>setDeleteConfirm(null)}>Cancelar</button>
      </div>
    </Modal>}
  </div>);
}

// ── EXERCISES ──
export function ExercisesPage({exercises,setExercises}){
  const cat=useCatalogs();
  const{readOnly}=usePermissions();
  const[tab,setTab]=useState("normal");const[filter,setFilter]=useState("Todos");const[search,setSearch]=useState("");const[showAdd,setShowAdd]=useState(false);const[editing,setEditing]=useState(null);const[videoEx,setVideoEx]=useState(null);const[form,setForm]=useState({name:"",videoUrl:"",muscleGroup:"Piernas",type:"normal",equipment:"Ninguno"});
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";
  const list=exercises.filter(e=>e.type===tab&&(filter==="Todos"||e.muscleGroup===filter)&&e.name.toLowerCase().includes(search.toLowerCase()));
  function openAdd(){setForm({name:"",videoUrl:"",muscleGroup:"Piernas",type:tab,equipment:"Ninguno"});setEditing(null);setShowAdd(true)}
  function openEdit(ex){setForm({name:ex.name,videoUrl:ex.videoUrl||"",muscleGroup:ex.muscleGroup,type:ex.type,equipment:ex.equipment||"Ninguno"});setEditing(ex);setShowAdd(true)}
  async function save(){
    if(readOnly){setToast({msg:"Modo demostración: solo lectura",type:"err"});return;}
    if(!form.name.trim())return;
    try{
      if(editing)await setExercises(exercises.map(e=>e.id===editing.id?{...e,...form}:e));
      else await setExercises([...exercises,{id:genId(),...form}]);
      setShowAdd(false);
      setToast({msg:editing?"Ejercicio actualizado":"Ejercicio creado",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  async function del(id){
    if(readOnly)return;
    if(!confirm("¿Eliminar ejercicio?"))return;
    try{
      await setExercises(exercises.filter(e=>e.id!==id));
      setToast({msg:"Ejercicio eliminado",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  const groups=["Todos",...new Set(exercises.filter(e=>e.type===tab).map(e=>e.muscleGroup))].filter((v,i,a)=>a.indexOf(v)===i);
  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="ph"><div><div className="pt">Ejercicios</div><div className="ps">{exercises.length} ejercicios</div></div>{!readOnly&&<button className="btn btn-p" onClick={openAdd}>+ Agregar</button>}</div>
    <div className="tabs">{["normal","stretching"].map(t=>(<div key={t} className={`tab${tab===t?" active":""}`} onClick={()=>{setTab(t);setFilter("Todos")}}>{t==="normal"?"🏋️ Ejercicios":"🧘 Estiramientos"}</div>))}</div>
    <input className="inp" placeholder="🔍 Buscar..." value={search} onChange={e=>setSearch(e.target.value)} style={{marginBottom:8}}/>
    <div className="chips">{groups.map(g=><button key={g} className={`chip${filter===g?" on":""}`} onClick={()=>setFilter(g)}>{g}</button>)}</div>
    <div className="card" style={{padding:0}}>
      <div className="tbl-wrap"><table className="tbl"><thead><tr><th>Ejercicio</th><th>Músculo</th><th>Equipo</th><th>Video</th><th></th></tr></thead>
      <tbody>{list.map(ex=>(<tr key={ex.id}>
        <td><strong>{ex.name}</strong></td><td><span className="badge bd-blue">{ex.muscleGroup}</span></td><td><span className="badge bd-gray">{ex.equipment||"Ninguno"}</span></td>
        <td>{ex.videoUrl?<button className="vbtn" onClick={()=>setVideoEx(ex)}>▶</button>:<span style={{color:"#6B7A99",fontSize:10}}>—</span>}</td>
        <td style={{whiteSpace:"nowrap"}}><button className="ibtn" onClick={()=>openEdit(ex)}>✏️</button>{!readOnly&&<button className="ibtn d" onClick={()=>del(ex.id)}>🗑</button>}</td>
      </tr>))}{list.length===0&&<tr><td colSpan={5}><div className="empty"><div className="ico">🏋️</div><p>Sin ejercicios</p></div></td></tr>}</tbody></table></div>
    </div>
    {showAdd&&<Modal title={editing?"Editar ejercicio":"Nuevo ejercicio"} onClose={()=>setShowAdd(false)}>
      <div className="fg"><label>Nombre</label><input className="inp" value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Nombre del ejercicio"/></div>
      <div className="fr2">
        <div className="fg"><label>Grupo muscular</label>
              <select className="sel" value={cat.muscleGroups.includes(form.muscleGroup)?form.muscleGroup:"__custom__"} onChange={e=>{if(e.target.value!=="__custom__")setForm({...form,muscleGroup:e.target.value})}}>
                {cat.muscleGroups.map(g=><option key={g} value={g}>{g}</option>)}
                {!cat.muscleGroups.includes(form.muscleGroup)&&form.muscleGroup&&<option value="__custom__">{form.muscleGroup}</option>}
              </select>
              <input className="inp" style={{marginTop:4,fontSize:12}} value={form.muscleGroup} onChange={e=>setForm({...form,muscleGroup:e.target.value})} placeholder="O escribe uno nuevo..."/>
            </div>
        <div className="fg"><label>Tipo</label><select className="sel" value={form.type} onChange={e=>setForm({...form,type:e.target.value})}><option value="normal">Normal</option><option value="stretching">Estiramiento</option></select></div>
      </div>
      <div className="fg"><label>Equipo</label><select className="sel" value={form.equipment} onChange={e=>setForm({...form,equipment:e.target.value})}>{cat.equipment.map(eq=><option key={eq} value={eq}>{eq}</option>)}</select></div>
      <div className="fg"><label>URL Video (YouTube)</label><input className="inp" value={form.videoUrl} onChange={e=>setForm({...form,videoUrl:e.target.value})} placeholder="https://www.youtube.com/..."/></div>
      <div style={{display:"flex",gap:8}}><SaveBtn onClick={()=>wrap(save)} saving={saving}>{editing?"Guardar":"Crear"}</SaveBtn><button className="btn btn-g" onClick={()=>setShowAdd(false)}>Cancelar</button></div>
    </Modal>}
    {videoEx&&<VideoModal name={videoEx.name} url={videoEx.videoUrl} onClose={()=>setVideoEx(null)}/>}
  </div>);
}

// ── ROUTINE EDITOR ──
// ¿Este ejercicio de la rutina ya tiene datos cargados por el coach?
function exHasData(ex){
  return (ex.weightAmount!=null&&String(ex.weightAmount).trim()!=="")
    ||(ex.notes&&String(ex.notes).trim()!=="")
    ||(ex.surface&&ex.surface!=="Ninguno");
}
// Copia peso/unidad/equipo/superficie/notas del primer ejercicio con datos
// a las demás instancias del MISMO ejercicio (en la misma rutina) que estén vacías.
function propagateExerciseData(rt){
  const sources={};
  rt.days.forEach(d=>d.groups.forEach(g=>g.exercises.forEach(ex=>{
    if(exHasData(ex)&&!sources[ex.exId]){
      sources[ex.exId]={weightAmount:ex.weightAmount,weightUnit:ex.weightUnit,equipment:ex.equipment,surface:ex.surface,notes:ex.notes};
    }
  })));
  const days=rt.days.map(d=>({...d,groups:d.groups.map(g=>({...g,exercises:g.exercises.map(ex=>{
    if(!exHasData(ex)&&sources[ex.exId])return{...ex,...sources[ex.exId]};
    return ex;
  })}))}));
  return{...rt,days};
}

export function RoutineEditor({routine,exercises,users,onSave,onBack,saving=false}){
  const cat=useCatalogs();
  const{readOnly}=usePermissions();
  const tenant=useTenant();
  const orgId=tenant?.org?.id||null;
  const[wUploading,setWUploading]=useState(false);
  const blank={id:genId(),userId:"",title:"Nueva Rutina",daysPerWeek:0,note:"",days:[],warmupStretchIds:[],cooldownStretchIds:[],warmupMode:"exercises",warmupImageUrl:"",assignedUserIds:[]};
  const[rt,setRt]=useState(()=>{
    if(!routine)return blank;
    const copy=JSON.parse(JSON.stringify(routine));
    if(!Array.isArray(copy.assignedUserIds))copy.assignedUserIds=copy.userId?[copy.userId]:[];
    return copy;
  });
  // Clientes para los que ESTA rutina está activa (users.activeRoutineId === rt.id).
  // Para una rutina nueva (routine null) el set arranca vacío.
  const[activeIds,setActiveIds]=useState(()=>new Set(routine?users.filter(u=>u.activeRoutineId===routine.id).map(u=>u.id):[]));
  const[selDay,setSelDay]=useState(0);const[exPicker,setExPicker]=useState(null);const[strPicker,setStrPicker]=useState(null);
  const assignedSet=new Set(rt.assignedUserIds||[]);
  const clientsList=users.filter(u=>!u.disabled);

  function toggleAssign(uid){
    const wasAssigned=(rt.assignedUserIds||[]).includes(uid);
    setRt(r=>{const s=new Set(r.assignedUserIds||[]);if(s.has(uid))s.delete(uid);else s.add(uid);return{...r,assignedUserIds:[...s]};});
    if(wasAssigned)setActiveIds(prev=>{const n=new Set(prev);n.delete(uid);return n;}); // al desasignar, quitar activa
  }
  function toggleActive(uid){
    const wasActive=activeIds.has(uid);
    setActiveIds(prev=>{const n=new Set(prev);if(n.has(uid))n.delete(uid);else n.add(uid);return n;});
    if(!wasActive)setRt(r=>{const s=new Set(r.assignedUserIds||[]);s.add(uid);return{...r,assignedUserIds:[...s]};}); // activa implica asignada
  }
  function saveRoutine(){
    if(readOnly)return; // demo_viewer: solo lectura
    const next=propagateExerciseData(rt);
    setRt(next);
    onSave(next,[...activeIds]);
  }

  function updateDays(count){
    if(!count){setRt(r=>({...r,daysPerWeek:0,days:[]}));return}
    const days=[...rt.days];
    while(days.length<count)days.push({id:genId(),label:`Entrenamiento ${days.length+1}`,groups:[]});
    const nd=days.slice(0,count);
    setRt(r=>({...r,daysPerWeek:count,days:nd}));
    if(selDay>=count)setSelDay(Math.max(0,count-1));
  }
  function addGroup(di){const labels=["A","B","C","D","E","F","G"];setRt(r=>{const days=r.days.map((d,i)=>{if(i!==di)return d;const lbl=labels[d.groups.length]||`G${d.groups.length+1}`;return{...d,groups:[...d.groups,{id:genId(),label:lbl,restSeconds:60,exercises:[]}]};});return{...r,days}});}
  function removeGroup(di,gi){setRt(r=>{const days=r.days.map((d,i)=>i!==di?d:{...d,groups:d.groups.filter((_,j)=>j!==gi)});return{...r,days}})}
  function updGroup(di,gi,k,v){setRt(r=>{const days=r.days.map((d,i)=>i!==di?d:{...d,groups:d.groups.map((g,j)=>j!==gi?g:{...g,[k]:v})});return{...r,days}})}
  function addEx(di,gi,ex){setRt(r=>{const days=r.days.map((d,i)=>i!==di?d:{...d,groups:d.groups.map((g,j)=>j!==gi?g:{...g,exercises:[...g.exercises,{exId:ex.id,series:3,reps:"12",notes:"",weightAmount:"",weightUnit:"lbs",equipment:ex.equipment||"Ninguno",surface:"Ninguno"}]})});return{...r,days}});setExPicker(null);}
  function removeEx(di,gi,ei){setRt(r=>{const days=r.days.map((d,i)=>i!==di?d:{...d,groups:d.groups.map((g,j)=>j!==gi?g:{...g,exercises:g.exercises.filter((_,k)=>k!==ei)})});return{...r,days}})}
  function updEx(di,gi,ei,k,v){setRt(r=>{const days=r.days.map((d,i)=>i!==di?d:{...d,groups:d.groups.map((g,j)=>j!==gi?g:{...g,exercises:g.exercises.map((e,k2)=>k2!==ei?e:{...e,[k]:v})})});return{...r,days}})}
  function toggleStretch(kind,id){const key=kind==="warmup"?"warmupStretchIds":"cooldownStretchIds";setRt(r=>{const arr=r[key]||[];return{...r,[key]:arr.includes(id)?arr.filter(x=>x!==id):[...arr,id]}});}
  async function uploadWarmupImg(file){
    if(!file||readOnly)return;
    if(!orgId){alert("No se pudo determinar la organización para subir la imagen.");return;}
    setWUploading(true);
    try{const url=await uploadRoutineImage(orgId,rt.id,file);setRt(r=>({...r,warmupImageUrl:url,warmupMode:"image"}));}
    catch(e){console.error(e);alert("No se pudo subir la imagen: "+(e?.message||e));}
    finally{setWUploading(false);}
  }

  const day=rt.days[selDay];
  const warmupIds=rt.warmupStretchIds||[];
  const cooldownIds=rt.cooldownStretchIds||[];

  return(<div>
    <button className="back-btn" onClick={onBack}>← Volver a Rutinas</button>
    <div className="ph"><div><div className="pt">{routine?"Editar Rutina":"Nueva Rutina"}</div></div>{readOnly?<span className="badge" style={{background:"#F3E5F5",color:"#7B1FA2",border:"1px solid #E1BEE7"}}>👀 Solo lectura</span>:<SaveBtn className="btn btn-ok" onClick={saveRoutine} saving={saving}>💾 Guardar</SaveBtn>}</div>
    <div className="card" style={{marginBottom:12}}>
      <div className="fg"><label>Título</label><input className="inp" value={rt.title} onChange={e=>setRt(r=>({...r,title:e.target.value}))}/></div>
      <div className="fg">
        <label>Asignar a clientes ({(rt.assignedUserIds||[]).length})</label>
        <div style={{maxHeight:190,overflowY:"auto",border:"1px solid #DDE4F0",borderRadius:8,padding:"4px 6px"}}>
          {clientsList.map(u=>{const assigned=assignedSet.has(u.id);const active=activeIds.has(u.id);return(
            <div key={u.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 2px",borderBottom:"1px solid #EEF1F7"}}>
              <label style={{display:"flex",alignItems:"center",gap:7,flex:1,cursor:"pointer",fontSize:13,minWidth:0}}>
                <input type="checkbox" checked={assigned} onChange={()=>toggleAssign(u.id)}/>
                <span style={{fontWeight:assigned?700:500,color:"#0B1F4B",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{u.name}</span>
              </label>
              <button type="button" onClick={()=>toggleActive(u.id)} title={active?"Rutina activa para este cliente":"Marcar como activa para este cliente"}
                style={{background:active?"#E8F5E9":"#F4F6FB",border:`1px solid ${active?"#A5D6A7":"#DDE4F0"}`,borderRadius:6,padding:"3px 9px",fontSize:11,fontWeight:700,color:active?"#2E7D32":"#6B7A99",cursor:"pointer",whiteSpace:"nowrap"}}>
                {active?"⭐ Activa":"Activar"}
              </button>
            </div>);})}
          {clientsList.length===0&&<div style={{fontSize:12,color:"#6B7A99",padding:8}}>No hay clientes disponibles</div>}
        </div>
        <div style={{fontSize:10,color:"#6B7A99",marginTop:4}}>La misma rutina puede asignarse a varios clientes. La marca "activa" es independiente por cliente.</div>
      </div>
      <div className="fr2">
        <div className="fg"><label>Días por semana</label>
          <select className="sel" value={rt.daysPerWeek} onChange={e=>updateDays(Number(e.target.value))}>
            <option value={0}>— Seleccionar días —</option>
            {[1,2,3,4,5,6,7].map(n=><option key={n} value={n}>{n} {n===1?"día":"días"}</option>)}
          </select>
        </div>
        <div className="fg"><label>Nota general</label><input className="inp" value={rt.note||""} onChange={e=>setRt(r=>({...r,note:e.target.value}))} placeholder="Instrucciones para el cliente..."/></div>
      </div>
      <div className="fr2">
        <div className="fg"><label>🧘 Calentamiento</label>
          <div style={{display:"flex",gap:6,marginBottom:6}}>
            <button type="button" className={`btn btn-sm ${rt.warmupMode!=="image"?"btn-p":"btn-s"}`} onClick={()=>setRt(r=>({...r,warmupMode:"exercises"}))}>Ejercicios</button>
            <button type="button" className={`btn btn-sm ${rt.warmupMode==="image"?"btn-p":"btn-s"}`} onClick={()=>setRt(r=>({...r,warmupMode:"image"}))}>Imagen</button>
          </div>
          {rt.warmupMode==="image"?(<div>
            {rt.warmupImageUrl&&<div style={{marginBottom:6}}><img src={rt.warmupImageUrl} alt="Calentamiento" style={{maxWidth:"100%",maxHeight:160,borderRadius:8,border:"1px solid #DDE4F0",display:"block"}}/></div>}
            {!readOnly&&<label className="btn btn-s btn-sm" style={{cursor:"pointer"}}>{wUploading?"Subiendo…":(rt.warmupImageUrl?"Cambiar imagen":"📷 Subir imagen")}<input type="file" accept="image/*" style={{display:"none"}} onChange={e=>uploadWarmupImg(e.target.files&&e.target.files[0])}/></label>}
            {rt.warmupImageUrl&&!readOnly&&<button type="button" className="btn btn-g btn-sm" style={{marginLeft:6}} onClick={()=>setRt(r=>({...r,warmupImageUrl:""}))}>Quitar</button>}
          </div>):(<>
            <button type="button" className="btn btn-s btn-sm" onClick={()=>setStrPicker("warmup")}>Configurar ejercicios ({warmupIds.length})</button>
            {warmupIds.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>{warmupIds.map(id=>{const ex=exercises.find(e=>e.id===id);return ex&&<span key={id} className="badge bd-green">{ex.name}</span>})}</div>}
          </>)}
        </div>
        <div className="fg"><label>🧘 Enfriamiento ({cooldownIds.length})</label><button className="btn btn-s btn-sm" onClick={()=>setStrPicker("cooldown")}>Configurar</button>{cooldownIds.length>0&&<div style={{marginTop:6,display:"flex",flexWrap:"wrap",gap:4}}>{cooldownIds.map(id=>{const ex=exercises.find(e=>e.id===id);return ex&&<span key={id} className="badge bd-teal">{ex.name}</span>})}</div>}</div>
      </div>
    </div>

    {rt.days.length>0&&<>
      <div className="tabs">{rt.days.map((d,i)=>(<div key={d.id} className={`tab${selDay===i?" active":""}`} onClick={()=>setSelDay(i)}>Día {i+1}</div>))}</div>
      {day&&<div className="card">
        <div className="fg"><label>Nombre del día</label><input className="inp" value={day.label} onChange={e=>setRt(r=>{const days=r.days.map((d,i)=>i===selDay?{...d,label:e.target.value}:d);return{...r,days}})}/></div>
        {day.groups.map((g,gi)=>(<div key={g.id} className="grp-card">
          <div className="grp-h">
            <div className="grp-lbl">{g.label}</div>
            <input className="inp" style={{width:50,minHeight:34,fontSize:12}} value={g.label} onChange={e=>updGroup(selDay,gi,"label",e.target.value)}/>
            <span style={{fontSize:11,color:"#6B7A99"}}>Desc:</span>
            <select className="sel" style={{width:80,minHeight:34,fontSize:12}} value={g.restSeconds} onChange={e=>updGroup(selDay,gi,"restSeconds",Number(e.target.value))}>{[15,20,30,45,60,90,120].map(s=><option key={s} value={s}>{s}s</option>)}</select>
            <button className="ibtn d" style={{marginLeft:"auto"}} onClick={()=>removeGroup(selDay,gi)}>🗑</button>
          </div>
          <div className="grp-b">
            {g.exercises.map((ex,ei)=>{const info=exercises.find(e=>e.id===ex.exId);return(<div key={ei} style={{borderBottom:"1px solid #DDE4F0",paddingBottom:10,marginBottom:10}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}><strong style={{fontSize:13,flex:1}}>{info?.name||"?"}</strong><span className="badge bd-blue" style={{fontSize:9}}>{info?.muscleGroup}</span><button className="ibtn d" onClick={()=>removeEx(selDay,gi,ei)}>✕</button></div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6}}>
                <div><label style={{fontSize:9}}>Series</label><input className="inp" type="number" min={1} onKeyDown={preventNegKey} value={ex.series} onChange={e=>updEx(selDay,gi,ei,"series",Number(e.target.value))}/></div>
                <div><label style={{fontSize:9}}>Reps / Duración</label><input className="inp" value={ex.reps} onChange={e=>updEx(selDay,gi,ei,"reps",e.target.value)}/></div>
                <div><label style={{fontSize:9}}>Peso</label><div style={{display:"flex",gap:3}}><input className="inp" style={{flex:1}} type="number" min={0} onKeyDown={preventNegKey} value={ex.weightAmount} onChange={e=>updEx(selDay,gi,ei,"weightAmount",stripNeg(e.target.value))} placeholder="0"/><select className="sel" style={{width:65}} value={ex.weightUnit} onChange={e=>updEx(selDay,gi,ei,"weightUnit",e.target.value)}><option value="lbs">lbs</option><option value="kg">kg</option></select></div></div>
                <div><label style={{fontSize:9}}>Equipo</label><select className="sel" value={ex.equipment} onChange={e=>updEx(selDay,gi,ei,"equipment",e.target.value)}>{cat.equipment.map(eq=><option key={eq} value={eq}>{eq}</option>)}</select></div>
                <div><label style={{fontSize:9}}>Superficie</label><select className="sel" value={ex.surface||"Ninguno"} onChange={e=>updEx(selDay,gi,ei,"surface",e.target.value)}>{cat.surface.map(s=><option key={s} value={s}>{s}</option>)}</select></div>
                <div><label style={{fontSize:9}}>Notas</label><input className="inp" value={ex.notes} onChange={e=>updEx(selDay,gi,ei,"notes",e.target.value)} placeholder="Obs..."/></div>
              </div>
            </div>);})}
            <button className="btn btn-s btn-sm" onClick={()=>setExPicker({dayIdx:selDay,gIdx:gi})}>+ Agregar ejercicio</button>
          </div>
        </div>))}
        <button className="btn btn-g btn-sm" style={{marginTop:4}} onClick={()=>addGroup(selDay)}>+ Grupo</button>
      </div>}
    </>}
    {rt.days.length===0&&<div className="card"><div className="empty"><div className="ico">📅</div><p>Selecciona los días por semana arriba</p></div></div>}
    <div style={{display:"flex",gap:8,marginTop:14,paddingTop:14,borderTop:"1px solid #DDE4F0"}}>
      {!readOnly&&<SaveBtn className="btn btn-ok" onClick={saveRoutine} saving={saving}>💾 Guardar rutina</SaveBtn>}
      <button className="btn btn-g" onClick={onBack}>{readOnly?"← Volver":"Cancelar"}</button>
    </div>
    {exPicker&&<ExercisePicker exercises={exercises} onPick={ex=>addEx(exPicker.dayIdx,exPicker.gIdx,ex)} onClose={()=>setExPicker(null)}/>}
    {strPicker&&<StretchPicker exercises={exercises} selected={strPicker==="warmup"?warmupIds:cooldownIds} onToggle={id=>toggleStretch(strPicker,id)} onClose={()=>setStrPicker(null)}/>}
  </div>);
}

// ── ROUTINES LIST ──
export function RoutinesPage({routines,setRoutines,users,setUsers,exercises,saveRoutineAssignments}){
  const{readOnly}=usePermissions();
  const[editing,setEditing]=useState(null);
  const[filterUser,setFilterUser]=useState("__all__");
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";

  async function saveRoutine(rt,activeUserIds=[]){
    if(readOnly)return; // demo_viewer: solo lectura
    const exists=routines.find(r=>r.id===rt.id);
    const now=new Date().toISOString();
    // "primary" = primer cliente asignado. Se guarda en routines.user_id para que la
    // función save_routine derive el organization_id y por compatibilidad legacy.
    const primary=(rt.assignedUserIds&&rt.assignedUserIds[0])||rt.userId||"";
    const rtSave={...rt,userId:primary};
    try{
      // 1) Rutina (días/grupos/ejercicios)
      if(exists)await setRoutines(routines.map(r=>r.id===rt.id?{...rtSave,updatedAt:now}:r));
      else await setRoutines([...routines,{...rtSave,createdAt:now,updatedAt:now}]);
      // 2) Asignaciones (a qué clientes está asignada)
      if(saveRoutineAssignments)await saveRoutineAssignments(rt.id,rt.assignedUserIds||[]);
      // 3) Rutina activa por cliente (independiente): activar para los marcados,
      //    desactivar para quien la tenía activa y ya no está marcado.
      const activeSet=new Set(activeUserIds);
      const newUsers=users.map(u=>{
        if(activeSet.has(u.id))return u.activeRoutineId===rt.id?u:{...u,activeRoutineId:rt.id};
        if(u.activeRoutineId===rt.id)return{...u,activeRoutineId:null};
        return u;
      });
      if(JSON.stringify(newUsers)!==JSON.stringify(users))await setUsers(newUsers);
      setEditing(null);
      setToast({msg:exists?"Rutina actualizada":"Rutina creada",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  async function del(id){
    if(readOnly)return;
    if(!confirm("¿Eliminar rutina?"))return;
    try{await setRoutines(routines.filter(r=>r.id!==id));setToast({msg:"Rutina eliminada",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  async function duplicate(rt){
    if(readOnly)return;
    const now=new Date().toISOString();
    const newRt={...JSON.parse(JSON.stringify(rt)),id:genId(),title:rt.title+" (copia)",createdAt:now,updatedAt:now,userId:"",assignedUserIds:[]};
    try{await setRoutines([...routines,newRt]);setToast({msg:"Rutina duplicada (sin asignar)",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }
  async function setActiveFor(rt,userId){
    if(readOnly||!userId)return;
    try{await setUsers(users.map(u=>u.id===userId?{...u,activeRoutineId:rt.id}:u));setToast({msg:"Rutina activa actualizada",type:"ok"});}
    catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }

  // Clientes que tienen al menos una rutina asignada
  const usersWithRoutines=users.filter(u=>routines.some(r=>(r.assignedUserIds||[]).includes(u.id)));

  // Filtrar + ordenar: si hay filtro por cliente, las activas para ESE cliente primero
  const filtered=routines
    .filter(r=>filterUser==="__all__"||(r.assignedUserIds||[]).includes(filterUser))
    .sort((a,b)=>{
      if(filterUser!=="__all__"){
        const fu=users.find(u=>u.id===filterUser);
        const aActive=fu&&fu.activeRoutineId===a.id?1:0;
        const bActive=fu&&fu.activeRoutineId===b.id?1:0;
        if(aActive!==bActive)return bActive-aActive;
      }
      return new Date(b.createdAt||b.updatedAt||0)-new Date(a.createdAt||a.updatedAt||0);
    });

  if(editing!==null)return<RoutineEditor routine={editing==="__new__"?null:editing} exercises={exercises} users={users} onSave={(rt,activeIds)=>wrap(()=>saveRoutine(rt,activeIds))} saving={saving} onBack={()=>setEditing(null)}/>;
  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="ph"><div><div className="pt">Rutinas</div><div className="ps">{filtered.length} rutina{filtered.length!==1?"s":""}</div></div>{!readOnly&&<button className="btn btn-p" onClick={()=>setEditing("__new__")}>+ Nueva</button>}</div>
    <div style={{marginBottom:12,display:"flex",alignItems:"center",gap:10}}>
      <select value={filterUser} onChange={e=>setFilterUser(e.target.value)} style={{fontFamily:"'Barlow',sans-serif",fontSize:13,padding:"8px 12px",borderRadius:8,border:"1px solid #DDE4F0",background:"#fff",color:"#0B1F4B",flex:1,maxWidth:280}}>
        <option value="__all__">Todos los clientes</option>
        {usersWithRoutines.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}
      </select>
      {filterUser!=="__all__"&&<button onClick={()=>setFilterUser("__all__")} style={{fontSize:12,color:"#6B7A99",background:"none",border:"none",cursor:"pointer",padding:"4px 8px"}}>✕ Limpiar</button>}
    </div>
    {filtered.map(rt=>{
    const assigned=(rt.assignedUserIds||[]).map(id=>users.find(u=>u.id===id)).filter(Boolean);
    const totalEx=rt.days?.reduce((s,d)=>s+d.groups.reduce((ss,g)=>ss+g.exercises.length,0),0)||0;
    const filterU=filterUser!=="__all__"?users.find(u=>u.id===filterUser):null;
    const activeForFilter=filterU&&filterU.activeRoutineId===rt.id;
    const isActiveAny=assigned.some(u=>u.activeRoutineId===rt.id);
    const highlight=filterU?activeForFilter:isActiveAny;
    return(<div key={rt.id} className="card" style={{marginBottom:10,border:highlight?"2px solid #2E7D32":""}}>
      <div style={{display:"flex",alignItems:"flex-start",gap:10}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{display:"flex",alignItems:"center",gap:7,marginBottom:5,flexWrap:"wrap"}}>
            <span style={{fontFamily:"'Barlow Condensed',sans-serif",fontSize:17,fontWeight:900,color:"#0B1F4B"}}>{rt.title}</span>
            <span className="badge bd-blue">{rt.daysPerWeek}d/sem</span>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:5,flexWrap:"wrap",marginBottom:5}}>
            {assigned.length===0&&<span className="badge bd-gray">Sin asignar</span>}
            {assigned.map(u=>{const act=u.activeRoutineId===rt.id;return(
              <span key={u.id} className="badge" style={act?{background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7"}:{background:"#E3F0FF",color:"#1A5DC8",border:"1px solid #BBDEFB"}}>{act&&"⭐ "}{u.name}</span>);})}
          </div>
          <div style={{fontSize:11,color:"#6B7A99",display:"flex",gap:12,flexWrap:"wrap"}}>
            <span>👥 {assigned.length} asignado{assigned.length!==1?"s":""}</span>
            <span>📅 {rt.days?.length||0} días</span><span>🏋️ {totalEx} ejercicios</span>
            {(rt.createdAt||rt.updatedAt)&&<span>📆 {fmtDate(rt.createdAt||rt.updatedAt)}</span>}
          </div>
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0,flexWrap:"wrap"}}>
          {filterU&&(rt.assignedUserIds||[]).includes(filterU.id)&&!activeForFilter&&!readOnly&&<button className="btn btn-sm" style={{background:"#E8F5E9",color:"#2E7D32",border:"1px solid #A5D6A7"}} onClick={()=>setActiveFor(rt,filterU.id)}>⭐ Activar p/ {filterU.name.split(" ")[0]}</button>}
          {!readOnly&&<button className="btn btn-g btn-sm" onClick={()=>duplicate(rt)}>📋 Duplicar</button>}
          <button className="btn btn-s btn-sm" onClick={()=>setEditing(rt)}>✏️ Editar</button>
          {!readOnly&&<button className="btn btn-d btn-sm" onClick={()=>del(rt.id)}>🗑</button>}
        </div>
      </div>
    </div>);})}
    {filtered.length===0&&<div className="card"><div className="empty"><div className="ico">📋</div><p>{filterUser==="__all__"?"Sin rutinas":"Este cliente no tiene rutinas"}</p></div></div>}
  </div>);
}

// ── WORKOUT TIMER (per group) ──
export function GroupTimer({restSeconds}){
  const[secs,setSecs]=useState(0);const[running,setRunning]=useState(false);
  const[restLeft,setRestLeft]=useState(0);const[restActive,setRestActive]=useState(false);
  const[fullscreen,setFullscreen]=useState(false);
  const intRef=useRef(null);const restRef=useRef(null);

  function playAlarm(){
    try{
      const ctx=new(window.AudioContext||window.webkitAudioContext)();
      // 3 beeps
      [0,0.35,0.7].forEach(delay=>{
        const osc=ctx.createOscillator();
        const gain=ctx.createGain();
        osc.connect(gain);gain.connect(ctx.destination);
        osc.type="sine";
        osc.frequency.setValueAtTime(880,ctx.currentTime+delay);
        osc.frequency.setValueAtTime(1100,ctx.currentTime+delay+0.1);
        gain.gain.setValueAtTime(0.6,ctx.currentTime+delay);
        gain.gain.exponentialRampToValueAtTime(0.001,ctx.currentTime+delay+0.28);
        osc.start(ctx.currentTime+delay);
        osc.stop(ctx.currentTime+delay+0.28);
      });
    }catch(e){console.log("Audio no disponible:",e);}
  }

  useEffect(()=>{
    if(running){intRef.current=setInterval(()=>setSecs(s=>s+1),1000)}
    else clearInterval(intRef.current);
    return()=>clearInterval(intRef.current);
  },[running]);

  useEffect(()=>{
    if(restActive&&restLeft>0){restRef.current=setInterval(()=>setRestLeft(s=>{
      if(s<=1){clearInterval(restRef.current);setRestActive(false);setFullscreen(false);playAlarm();return 0}
      return s-1;
    }),1000)}
    else clearInterval(restRef.current);
    return()=>clearInterval(restRef.current);
  },[restActive,restLeft]);

  function startRest(s){setRestLeft(s);setRestActive(true);setFullscreen(true)}
  function toggleTimer(){setRunning(r=>!r);if(!running)setFullscreen(true)}
  function reset(){setSecs(0);setRunning(false);setFullscreen(false)}
  function stopRest(){setRestActive(false);setRestLeft(0);setFullscreen(false)}
  function fmt(s){const m=Math.floor(s/60);const sec=s%60;return`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`}

  const pct=restActive&&restLeft>0?((restSeconds-restLeft)/restSeconds)*100:0;

  return(<div className="timer-wrap">
    <div className="timer-box">
      <div>
        <div className="timer-lbl">Cronómetro</div>
        <div className="timer-disp">{fmt(secs)}</div>
      </div>
      <div style={{display:"flex",gap:5}}>
        <button className="btn btn-sm" style={{background:running?"#E53935":"#2E7D32",color:"#fff",minHeight:36}} onClick={toggleTimer}>{running?"⏸":"▶"}</button>
        <button className="btn btn-sm" style={{background:"#4A5568",color:"#fff",minHeight:36}} onClick={reset}>↺</button>
      </div>
      <div style={{marginLeft:"auto",textAlign:"right"}}>
        <div className="timer-lbl">Descanso</div>
        <div style={{display:"flex",gap:4,justifyContent:"flex-end",marginTop:3}}>
          {[restSeconds,30,60].filter((v,i,a)=>a.indexOf(v)===i).map(s=>(
            <button key={s} className="btn btn-xs" style={{background:"#1A5DC8",color:"#fff"}} onClick={()=>startRest(s)}>{s}s</button>
          ))}
        </div>
      </div>
    </div>
    {restActive&&restLeft>0&&(
      <div className="rest-active">
        <span style={{color:"#fff",fontSize:13,fontWeight:700}}>⏱ Descanso</span>
        <div className="rest-disp">{fmt(restLeft)}</div>
        <button className="btn btn-xs" style={{background:"rgba(255,255,255,0.2)",color:"#fff",marginLeft:"auto"}} onClick={stopRest}>✕</button>
      </div>
    )}

    {/* FULLSCREEN OVERLAY */}
    {fullscreen&&<div style={{position:"fixed",inset:0,zIndex:9000,background:"rgba(10,20,60,0.97)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:32}}>
      {restActive&&restLeft>0?(
        <>
          <div style={{fontSize:18,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:4,textTransform:"uppercase"}}>⏱ Descanso</div>
          <div style={{position:"relative",width:220,height:220}}>
            <svg viewBox="0 0 220 220" style={{position:"absolute",inset:0,transform:"rotate(-90deg)"}}>
              <circle cx="110" cy="110" r="100" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="10"/>
              <circle cx="110" cy="110" r="100" fill="none" stroke="#4FC3F7" strokeWidth="10"
                strokeDasharray={`${2*Math.PI*100}`}
                strokeDashoffset={`${2*Math.PI*100*(1-pct/100)}`}
                strokeLinecap="round"
                style={{transition:"stroke-dashoffset 1s linear"}}/>
            </svg>
            <div style={{position:"absolute",inset:0,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontSize:72,fontWeight:900,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1}}>{fmt(restLeft)}</div>
              <div style={{fontSize:13,color:"rgba(255,255,255,0.5)",marginTop:4}}>{restSeconds}s total</div>
            </div>
          </div>
          <div style={{display:"flex",gap:12}}>
            <button onClick={stopRest} style={{background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",borderRadius:12,padding:"12px 28px",fontSize:15,fontWeight:700,cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}>✕ Cancelar</button>
          </div>
        </>
      ):(
        <>
          <div style={{fontSize:18,fontWeight:700,color:"rgba(255,255,255,0.6)",letterSpacing:4,textTransform:"uppercase"}}>Cronómetro</div>
          <div style={{fontSize:96,fontWeight:900,color:"#fff",fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1,letterSpacing:2}}>{fmt(secs)}</div>
          <div style={{display:"flex",gap:12}}>
            <button onClick={toggleTimer} style={{background:running?"#E53935":"#2E7D32",border:"none",color:"#fff",borderRadius:12,padding:"14px 36px",fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"'Barlow',sans-serif",minWidth:130}}>
              {running?"⏸ Pausar":"▶ Iniciar"}
            </button>
            <button onClick={reset} style={{background:"#4A5568",border:"none",color:"#fff",borderRadius:12,padding:"14px 24px",fontSize:18,fontWeight:700,cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}>↺</button>
          </div>
          <div style={{display:"flex",gap:10,marginTop:8}}>
            {[restSeconds,30,60].filter((v,i,a)=>a.indexOf(v)===i).map(s=>(
              <button key={s} onClick={()=>startRest(s)} style={{background:"#1A5DC8",border:"none",color:"#fff",borderRadius:10,padding:"10px 20px",fontSize:14,fontWeight:700,cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}>{s}s descanso</button>
            ))}
          </div>
          <button onClick={()=>setFullscreen(false)} style={{background:"none",border:"1px solid rgba(255,255,255,0.2)",color:"rgba(255,255,255,0.5)",borderRadius:10,padding:"8px 20px",fontSize:13,cursor:"pointer",fontFamily:"'Barlow',sans-serif",marginTop:8}}>
            Minimizar
          </button>
        </>
      )}
    </div>}
  </div>);
}

// ── ROUTINE DISPLAY (reusable) ──
export function RoutineDisplay({routine,exercises,renderDayAction,workout=null}){
  const[openDays,setOpenDays]=useState({});
  const[videoEx,setVideoEx]=useState(null);
  const[imgZoom,setImgZoom]=useState(null);
  function toggleDay(id){setOpenDays(s=>({...s,[id]:!s[id]}))}
  const warmupIds=routine.warmupStretchIds||[];
  const cooldownIds=routine.cooldownStretchIds||[];
  return(<div>
    {routine.note&&<div className="note-box"><span>📝</span><span>{routine.note}</span></div>}
    {routine.warmupMode==="image"&&routine.warmupImageUrl?(<div className="card" style={{marginBottom:12,background:"#E8F5E9",border:"1px solid #C8E6C9"}}>
      <div style={{fontWeight:700,fontSize:12,color:"#2E7D32",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>🧘 Calentamiento</div>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <img src={routine.warmupImageUrl} alt="Calentamiento" onClick={()=>setImgZoom(routine.warmupImageUrl)} style={{height:90,width:90,objectFit:"cover",borderRadius:8,border:"1px solid #C8E6C9",cursor:"zoom-in",display:"block"}}/>
        <button type="button" onClick={()=>setImgZoom(routine.warmupImageUrl)} style={{background:"none",border:"none",cursor:"pointer",color:"#2E7D32",fontSize:12,fontWeight:700,padding:0,textAlign:"left"}}>🔍 Tocá para ver en grande</button>
      </div>
    </div>):warmupIds.length>0&&(<div className="card" style={{marginBottom:12,background:"#E8F5E9",border:"1px solid #C8E6C9"}}>
      <div style={{fontWeight:700,fontSize:12,color:"#2E7D32",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>🧘 Calentamiento (20 seg c/u)</div>
      {warmupIds.map((id,i)=>{const ex=exercises.find(e=>e.id===id);return ex&&(<div key={id} style={{fontSize:13,padding:"6px 0",borderBottom:"1px solid #C8E6C9",display:"flex",alignItems:"center",gap:6}}><span style={{color:"#2E7D32",fontWeight:700}}>{i+1}.</span><span style={{flex:1}}>{ex.name}</span>{ex.videoUrl&&<button className="vbtn" onClick={()=>setVideoEx(ex)}>▶</button>}</div>);})}
    </div>)}
    {routine.days.map((day)=>(<div key={day.id} className="day-card">
      <div className="day-h" onClick={()=>toggleDay(day.id)}>
        <div><div className="day-ht">{day.label}</div><div style={{fontSize:10,color:"rgba(255,255,255,0.55)",marginTop:2}}>{day.groups.length} grupos · {day.groups.reduce((s,g)=>s+g.exercises.length,0)} ejercicios</div></div>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          {renderDayAction&&<span onClick={e=>e.stopPropagation()}>{renderDayAction(day)}</span>}
          <span style={{color:"rgba(255,255,255,0.5)",fontSize:20}}>{openDays[day.id]?"▲":"▼"}</span>
        </div>
      </div>
      {openDays[day.id]&&(<div className="day-b">
        {day.groups.map((g,gIdx)=>(<div key={g.id} className="grp-card">
          <div className="grp-h">
            <div className="grp-lbl">{g.label}</div>
            <span style={{fontSize:13,fontWeight:700}}>Grupo {g.label}</span>
            <span style={{marginLeft:"auto",fontSize:11,color:"#6B7A99"}}>⏱ {g.restSeconds}s</span>
          </div>
          <div className="grp-b">
            <GroupTimer restSeconds={g.restSeconds}/>
            {g.exercises.map((ex,ei)=>{
              const info=exercises.find(e=>e.id===ex.exId);
              const hasWeight=ex.weightAmount&&Number(ex.weightAmount)>0;
              const hasSurface=ex.surface&&ex.surface!=="Ninguno";
              const hasEquip=ex.equipment&&ex.equipment!=="Ninguno";
              const isWo=workout&&workout.dayId===day.id; // día en curso: peso editable
              const wi=day.groups.slice(0,gIdx).reduce((s,gg)=>s+gg.exercises.length,0)+ei;
              const wv=isWo?(workout.weights[wi]||{}):null;
              return(<div key={ei} className="ex-row">
                <div className="ex-num">{ei+1}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div className="ex-nm">{info?.name||"Ejercicio"}</div>
                  <div className="ex-tags">
                    <span className="ex-tag"><span className="tag-lbl">Series</span>{ex.series}</span>
                    <span className="ex-tag"><span className="tag-lbl">Reps</span>{ex.reps}</span>
                    {hasWeight&&<span className="ex-tag"><span className="tag-lbl">Peso</span>{ex.weightAmount} {ex.weightUnit}</span>}
                    {hasEquip&&<span className="ex-tag"><span className="tag-lbl">Equipo</span>{ex.equipment}</span>}
                    {ex.equipment==="Mancuernas (par)"&&<span className="ex-tag" style={{background:"#F3E5F5",borderColor:"#E1BEE7",color:"#7B1FA2"}}>🖐 Una por mano</span>}
                    {hasSurface&&<span className="ex-tag" style={{background:"#FFF3E0",borderColor:"#FFE0B2",color:"#F57C00"}}><span className="tag-lbl" style={{color:"#FB8C00"}}>Superficie</span>{ex.surface}</span>}
                  </div>
                  {ex.notes&&<div className="ex-dt">📌 {ex.notes}</div>}
                  {isWo&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:6}} onClick={e=>e.stopPropagation()}>
                    <span style={{fontSize:11,fontWeight:800,color:"#2E7D32"}}>Peso de hoy:</span>
                    <input className="inp" type="number" step="0.5" min={0} onKeyDown={preventNegKey} style={{width:72,minHeight:32,fontSize:13}} value={wv.val||""} onChange={e=>workout.onWeight(wi,{val:stripNeg(e.target.value)})} placeholder="—"/>
                    <select className="sel" style={{width:62,minHeight:32,padding:"4px"}} value={wv.unit||"lbs"} onChange={e=>workout.onWeight(wi,{unit:e.target.value})}><option value="lbs">lbs</option><option value="kg">kg</option></select>
                  </div>}
                </div>
                {info?.videoUrl&&<button className="vbtn" onClick={()=>setVideoEx(info)}>▶</button>}
              </div>);
            })}
          </div>
        </div>))}
      </div>)}
    </div>))}
    {cooldownIds.length>0&&(<div className="card" style={{marginTop:12,background:"#E3F0FF",border:"1px solid #BBDEFB"}}>
      <div style={{fontWeight:700,fontSize:12,color:"#1A5DC8",marginBottom:8,textTransform:"uppercase",letterSpacing:1}}>🧘 Enfriamiento (20 seg c/u)</div>
      {cooldownIds.map((id,i)=>{const ex=exercises.find(e=>e.id===id);return ex&&(<div key={id} style={{fontSize:13,padding:"6px 0",borderBottom:"1px solid #BBDEFB",display:"flex",alignItems:"center",gap:6}}><span style={{color:"#1A5DC8",fontWeight:700}}>{i+1}.</span><span style={{flex:1}}>{ex.name}</span>{ex.videoUrl&&<button className="vbtn" onClick={()=>setVideoEx(ex)}>▶</button>}</div>);})}
    </div>)}
    {videoEx&&<VideoModal name={videoEx.name} url={videoEx.videoUrl} onClose={()=>setVideoEx(null)}/>}
    {imgZoom&&<div onClick={()=>setImgZoom(null)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:3000,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <button type="button" onClick={()=>setImgZoom(null)} style={{position:"absolute",top:16,right:16,background:"rgba(255,255,255,0.15)",border:"none",color:"#fff",fontSize:22,width:40,height:40,borderRadius:20,cursor:"pointer"}}>✕</button>
      <img src={imgZoom} alt="Calentamiento" onClick={e=>e.stopPropagation()} style={{maxWidth:"95vw",maxHeight:"90vh",objectFit:"contain",borderRadius:10}}/>
    </div>}
  </div>);
}

// ── WORKOUT: cronómetro transcurrido ──
export function ElapsedTimer({startedAt}){
  const[elapsed,setElapsed]=useState(0);
  useEffect(()=>{
    const start=new Date(startedAt).getTime();
    const update=()=>setElapsed(Math.max(0,Math.floor((Date.now()-start)/1000)));
    update();
    const i=setInterval(update,1000);
    return()=>clearInterval(i);
  },[startedAt]);
  const h=Math.floor(elapsed/3600),m=Math.floor((elapsed%3600)/60),s=elapsed%60;
  const disp=h>0?`${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`:`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;
  return<span>{disp}</span>;
}

// ── WORKOUT: modal de finalizar (confirmar/editar pesos) ──
export function FinishWorkoutModal({workout,onConfirm,onCancel,saving}){
  // Unidad por ejercicio (lbs/kg). Se ingresa en la unidad elegida pero SIEMPRE se guarda en libras.
  // Precargar con los pesos que la persona fue anotando EN VIVO durante el entreno
  // (o el del coach si no tocó ese ejercicio).
  const[rows,setRows]=useState(()=>workout.exercises.map((e,i)=>{
    const w=(workout.weights&&workout.weights[i])||{};
    return {
      ...e,
      unit:w.unit||e.weightUnit||"lbs",
      val:(w.val!=null&&w.val!=="")?String(w.val):(e.plannedWeight?String(e.plannedWeight):""),
    };
  }));
  function setVal(i,v){setRows(rs=>rs.map((r,idx)=>idx===i?{...r,val:v}:r));}
  function setUnit(i,next){setRows(rs=>rs.map((r,idx)=>idx===i?{...r,unit:next,val:r.val===""?"":String(convertWeight(r.val,r.unit,next))}:r));}
  function save(){
    const result=rows.map(r=>({
      ...r,
      actualWeight:r.val===""||r.val==null?"":String(convertWeight(r.val,r.unit,"lbs")),
      weightUnit:"lbs",
    }));
    onConfirm(result);
  }
  return(<Modal title="Finalizar entrenamiento" onClose={onCancel}>
    <div style={{fontSize:12,color:"#6B7A99",marginBottom:12}}>Confirmá los pesos que usaste. Elegí la unidad (lbs/kg) en cada ejercicio según la mancuerna que usaste.</div>
    <div style={{maxHeight:"52vh",overflowY:"auto"}}>
      {rows.map((r,i)=>{
        const perHand=r.equipment==="Mancuernas (par)";
        return(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 0",borderBottom:"1px solid #DDE4F0"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"#0B1F4B"}}>{r.name||"Ejercicio"}{perHand&&<span style={{fontSize:10,color:"#7B1FA2",fontWeight:700,marginLeft:6}}>🖐 c/mano</span>}</div>
          <div style={{fontSize:11,color:"#6B7A99"}}>{r.series} series · {r.reps} reps{r.plannedWeight?` · coach: ${r.plannedWeight} ${r.weightUnit||"lbs"}`:""}</div>
        </div>
        <input className="inp" type="number" step="0.5" min={0} onKeyDown={preventNegKey} style={{width:72}} value={r.val} onChange={e=>setVal(i,stripNeg(e.target.value))} placeholder="—"/>
        <select className="sel" style={{width:66,minWidth:66,padding:"6px 4px"}} value={r.unit} onChange={e=>setUnit(i,e.target.value)}>
          <option value="lbs">lbs</option>
          <option value="kg">kg</option>
        </select>
      </div>);
      })}
    </div>
    <div style={{display:"flex",gap:8,marginTop:14}}>
      <SaveBtn onClick={save} saving={saving}>✓ Guardar entrenamiento</SaveBtn>
      <button className="btn btn-g" onClick={onCancel}>Cancelar</button>
    </div>
  </Modal>);
}

// ── WORKOUT: gráfica de frecuencia (días por semana/mes) ──
export function WorkoutFrequencyChart({sessions}){
  const[mode,setMode]=useState("week");
  const buckets={};
  sessions.forEach(s=>{
    const key=mode==="week"?weekKey(s.startedAt):monthKey(s.startedAt);
    const label=mode==="week"?weekLabel(s.startedAt):monthLabel(s.startedAt);
    if(!buckets[key])buckets[key]={key,label,days:new Set()};
    buckets[key].days.add(dayKey(s.startedAt));
  });
  const arr=Object.values(buckets).sort((a,b)=>a.key<b.key?-1:1);
  const shown=arr.slice(-(mode==="week"?8:6));
  const max=Math.max(1,...shown.map(b=>b.days.size));
  const nowKey=mode==="week"?weekKey(new Date()):monthKey(new Date());
  return(<div className="card" style={{marginBottom:12}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1}}>Días entrenados por</div>
      <div style={{display:"flex",gap:6,marginLeft:"auto"}}>
        <button className={`chip${mode==="week"?" on":""}`} onClick={()=>setMode("week")}>Semana</button>
        <button className={`chip${mode==="month"?" on":""}`} onClick={()=>setMode("month")}>Mes</button>
      </div>
    </div>
    {shown.length>0?(<div className="chart-wrap"><div className="chart-inner">
      {shown.map(b=>{
        const h=Math.max(6,(b.days.size/max)*80+12);
        const isNow=b.key===nowKey;
        return(<div key={b.key} className="chart-col">
          <div className="chart-val" style={{color:isNow?"#E53935":"#1A5DC8"}}>{b.days.size}</div>
          <div className="chart-bar-f" style={{height:h,background:isNow?"#E53935":"#1A5DC8"}}/>
          <div className="chart-lbl">{b.label}</div>
        </div>);
      })}
    </div></div>):<div style={{textAlign:"center",padding:12,color:"#6B7A99",fontSize:12}}>Aún no hay entrenamientos</div>}
    <div style={{fontSize:10,color:"#6B7A99",textAlign:"center",marginTop:6}}>En rojo la {mode==="week"?"semana":"mes"} actual · comparalo con {mode==="week"?"semanas":"meses"} anteriores</div>
  </div>);
}

// ── WORKOUT: evolución de peso por ejercicio ──
export function ExerciseProgressChart({sessions}){
  const asc=[...sessions].sort((a,b)=>new Date(a.startedAt)-new Date(b.startedAt));
  const names=[...new Set(asc.flatMap(s=>s.logs.map(l=>l.name)).filter(Boolean))].sort();
  const[ex,setEx]=useState("");
  if(!names.length)return null;
  const chosen=names.includes(ex)?ex:names[0];
  const points=[];
  asc.forEach(s=>{
    const log=s.logs.find(l=>l.name===chosen&&l.actualWeight&&Number(l.actualWeight)>0);
    if(log)points.push({date:s.startedAt,w:Number(log.actualWeight),unit:log.weightUnit});
  });
  const data=points.slice(-10);
  const max=Math.max(1,...data.map(p=>p.w));
  const min=data.length?Math.min(...data.map(p=>p.w)):0;
  const range=max-min||1;
  const delta=data.length>1?data[data.length-1].w-data[0].w:0;
  return(<div className="card" style={{marginBottom:12}}>
    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10,flexWrap:"wrap"}}>
      <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1}}>Progreso de peso</div>
      <select className="sel" style={{width:"auto",minWidth:150,flex:1}} value={chosen} onChange={e=>setEx(e.target.value)}>
        {names.map(n=><option key={n} value={n}>{n}</option>)}
      </select>
    </div>
    {data.length>1?(<>
      <div className="chart-wrap"><div className="chart-inner">
        {data.map((p,i)=>{
          const h=Math.max(6,((p.w-min)/range)*80+12);
          return(<div key={i} className="chart-col">
            <div className="chart-val" style={{color:"#2E7D32"}}>{p.w}</div>
            <div className="chart-bar-f" style={{height:h,background:"#2E7D32"}}/>
            <div className="chart-lbl">{fmtDate(p.date).slice(0,6)}</div>
          </div>);
        })}
      </div></div>
      <div style={{marginTop:8,fontSize:12,textAlign:"center",fontWeight:700,color:delta>0?"#2E7D32":delta<0?"#E53935":"#6B7A99"}}>
        {delta>0?`▲ +${delta} ${data[0].unit} desde el inicio`:delta<0?`▼ ${delta} ${data[0].unit} desde el inicio`:"Sin cambio aún"}
      </div>
    </>):<div style={{textAlign:"center",padding:12,color:"#6B7A99",fontSize:12}}>Necesitás al menos 2 registros de “{chosen}” para ver la evolución</div>}
  </div>);
}

// ── WORKOUT: historial completo (reutilizable cliente/entrenador) ──
export function WorkoutHistory({sessions,onDeleteSession,readOnly=false}){
  const[open,setOpen]=useState({});
  if(!sessions.length)return(<div className="empty"><div className="ico">🏋️</div><p>Sin entrenamientos registrados aún.<br/>{readOnly?"El cliente aún no ha completado entrenamientos.":"Iniciá y finalizá un entrenamiento desde tu rutina."}</p></div>);
  const desc=[...sessions].sort((a,b)=>new Date(b.startedAt)-new Date(a.startedAt));
  const nowW=weekKey(new Date()),nowM=monthKey(new Date());
  const daysThisWeek=new Set(sessions.filter(s=>weekKey(s.startedAt)===nowW).map(s=>dayKey(s.startedAt))).size;
  const daysThisMonth=new Set(sessions.filter(s=>monthKey(s.startedAt)===nowM).map(s=>dayKey(s.startedAt))).size;
  return(<div>
    <div className="m-grid" style={{marginBottom:12}}>
      <div className="m-card"><div className="m-lbl">Total entrenos</div><div className="m-val">{sessions.length}</div></div>
      <div className="m-card"><div className="m-lbl">Esta semana</div><div className="m-val">{daysThisWeek}<span className="m-unit"> días</span></div></div>
      <div className="m-card"><div className="m-lbl">Este mes</div><div className="m-val">{daysThisMonth}<span className="m-unit"> días</span></div></div>
    </div>
    <WorkoutFrequencyChart sessions={sessions}/>
    <ExerciseProgressChart sessions={sessions}/>
    <div style={{fontWeight:700,fontSize:13,margin:"10px 0"}}>Historial ({sessions.length})</div>
    {desc.map(s=>(<div key={s.id} style={{border:"1px solid #DDE4F0",borderRadius:10,marginBottom:8,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>({...o,[s.id]:!o[s.id]}))} style={{display:"flex",alignItems:"center",gap:10,padding:"10px 12px",cursor:"pointer",background:"#F8F9FF"}}>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:13,fontWeight:700,color:"#0B1F4B"}}>{s.dayLabel||"Entrenamiento"}</div>
          <div style={{fontSize:11,color:"#6B7A99"}}>{fmtDate(s.startedAt)} · ⏱ {fmtDuration(s.startedAt,s.finishedAt)} · {s.logs.length} ejercicios</div>
        </div>
        <span style={{color:"#6B7A99",fontSize:16}}>{open[s.id]?"▲":"▼"}</span>
      </div>
      {open[s.id]&&(<div style={{padding:"6px 12px 10px"}}>
        {s.logs.map((l,i)=>(<div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 0",borderBottom:"1px solid #EEF1F7",fontSize:12}}>
          <span style={{flex:1,minWidth:0,color:"#0B1F4B"}}>{l.name}</span>
          <span style={{color:"#6B7A99"}}>{l.series}×{l.reps}</span>
          <span style={{fontWeight:700,color:"#2E7D32",minWidth:64,textAlign:"right"}}>{l.actualWeight?`${l.actualWeight} ${l.weightUnit}`:"—"}</span>
        </div>))}
        {!readOnly&&onDeleteSession&&<div style={{textAlign:"right",marginTop:8}}><button className="btn btn-d btn-sm" onClick={()=>onDeleteSession(s.id)}>🗑 Eliminar</button></div>}
      </div>)}
    </div>))}
  </div>);
}

// ── USER ROUTINE PAGE ──
export function MyRoutinePage({user,routines,exercises,workoutSessions=[],setWorkoutSessions}){
  const[showPrev,setShowPrev]=useState(false);
  const[openPrev,setOpenPrev]=useState({});
  const[activeWorkout,setActiveWorkout]=useLS("jh_active_workout_"+user.id,null);
  const[showFinish,setShowFinish]=useState(false);
  const[cancelConfirm,setCancelConfirm]=useState(false);
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();

  // Sort: active first, then by createdAt desc
  const userRoutines=routines
    .filter(r=>(r.assignedUserIds||[]).includes(user.id)||r.userId===user.id)
    .sort((a,b)=>{
      const aActive=a.id===user.activeRoutineId?1:0;
      const bActive=b.id===user.activeRoutineId?1:0;
      if(aActive!==bActive)return bActive-aActive;
      return new Date(b.createdAt||b.updatedAt||0)-new Date(a.createdAt||a.updatedAt||0);
    });

  const activeRoutine=userRoutines[0]||null;
  const prevRoutines=userRoutines.slice(1);

  function startWorkout(day){
    const exs=[];const weights=[];
    day.groups.forEach(g=>g.exercises.forEach(ex=>{
      const info=exercises.find(e=>e.id===ex.exId);
      const e={exId:ex.exId,name:info?.name||"Ejercicio",series:String(ex.series||""),reps:String(ex.reps||""),plannedWeight:ex.weightAmount?String(ex.weightAmount):"",weightUnit:ex.weightUnit||"lbs",equipment:ex.equipment||"Ninguno"};
      exs.push(e);
      // Precargar el ÚLTIMO peso usado (o el del coach si es la primera vez).
      const init=initialWeightFor(workoutSessions,user.id,e);
      weights.push({val:init.val,unit:init.unit});
    }));
    setActiveWorkout({sessionId:genId(),routineId:activeRoutine.id,dayId:day.id,dayLabel:day.label,startedAt:new Date().toISOString(),exercises:exs,weights});
  }
  // Editar en vivo el peso de un ejercicio durante el entrenamiento (persiste en localStorage).
  function setWorkoutWeight(idx,patch){
    if(!activeWorkout)return;
    const weights=(activeWorkout.weights||[]).map((x,i)=>i===idx?{...x,...patch}:x);
    setActiveWorkout({...activeWorkout,weights});
  }
  async function finishWorkout(rows){
    const now=new Date().toISOString();
    const session={id:activeWorkout.sessionId,userId:user.id,routineId:activeWorkout.routineId,dayId:activeWorkout.dayId,dayLabel:activeWorkout.dayLabel,startedAt:activeWorkout.startedAt,finishedAt:now,status:"completed",createdAt:now,logs:rows.map(r=>({exId:r.exId,name:r.name,series:r.series,reps:r.reps,plannedWeight:r.plannedWeight,actualWeight:r.actualWeight,weightUnit:r.weightUnit}))};
    try{
      await setWorkoutSessions([session,...workoutSessions]);
      setActiveWorkout(null);setShowFinish(false);
      setToast({msg:"¡Entrenamiento guardado! 💪",type:"ok"});
    }catch(e){console.error(e);setToast({msg:"No se pudo guardar. Revisá tu conexión e intentá de nuevo.",type:"err"});}
  }
  function dayAction(day){
    if(activeWorkout&&activeWorkout.dayId===day.id)return<span className="badge bd-green">● En curso</span>;
    if(activeWorkout)return null;
    return<button className="btn btn-ok btn-sm" onClick={()=>startWorkout(day)}>▶ Iniciar</button>;
  }

  if(!activeRoutine)return(<div><div className="ph"><div className="pt">Mi Rutina</div></div><div className="card"><div className="empty"><div className="ico">📋</div><p>Tu entrenador aún no te ha asignado una rutina.<br/>¡Pronto llegará tu plan!</p></div></div></div>);

  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="ph">
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <Logo size={36}/>
        <div>
          <div className="pt" style={{fontSize:19}}>{activeRoutine.title}</div>
          <div className="ps">{activeRoutine.daysPerWeek} días/semana{activeRoutine.createdAt&&` · ${fmtDate(activeRoutine.createdAt)}`}</div>
        </div>
      </div>
    </div>

    {activeWorkout&&(<div style={{position:"sticky",top:8,zIndex:50,background:"#0B1F4B",color:"#fff",borderRadius:12,padding:"12px 16px",marginBottom:12,display:"flex",alignItems:"center",gap:12,boxShadow:"0 6px 18px rgba(11,31,75,0.35)"}}>
      <div style={{width:10,height:10,borderRadius:"50%",background:"#4ADE80",flexShrink:0}}/>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:10,color:"rgba(255,255,255,0.6)",textTransform:"uppercase",letterSpacing:1}}>Entrenando · {activeWorkout.dayLabel}</div>
        <div style={{fontSize:22,fontWeight:900,fontFamily:"'Barlow Condensed',sans-serif",lineHeight:1.1}}><ElapsedTimer startedAt={activeWorkout.startedAt}/></div>
      </div>
      <button className="btn btn-sm" style={{background:"#2E7D32",color:"#fff",minHeight:38}} onClick={()=>setShowFinish(true)}>✓ Finalizar</button>
      <button className="btn btn-sm" style={{background:"rgba(255,255,255,0.15)",color:"#fff",minHeight:38}} onClick={()=>setCancelConfirm(true)}>✕</button>
    </div>)}

    {!activeWorkout&&<div style={{fontSize:12,color:"#6B7A99",marginBottom:10}}>Tocá <strong style={{color:"#2E7D32"}}>▶ Iniciar</strong> en el día que vas a entrenar para registrarlo.</div>}

    {activeWorkout&&<div style={{fontSize:12,color:"#2E7D32",fontWeight:700,marginBottom:8,background:"#E8F5E9",border:"1px solid #C8E6C9",borderRadius:8,padding:"8px 12px"}}>💪 Anotá el peso que uses en cada ejercicio. Al finalizar te pedimos confirmar. La próxima vez ya te aparece el último peso que usaste.</div>}

    <RoutineDisplay routine={activeRoutine} exercises={exercises} renderDayAction={setWorkoutSessions?dayAction:undefined} workout={activeWorkout?{dayId:activeWorkout.dayId,weights:activeWorkout.weights||[],onWeight:setWorkoutWeight}:null}/>

    {showFinish&&activeWorkout&&<FinishWorkoutModal workout={activeWorkout} saving={saving} onCancel={()=>setShowFinish(false)} onConfirm={rows=>wrap(()=>finishWorkout(rows))}/>}
    {cancelConfirm&&<Modal title="Cancelar entrenamiento" onClose={()=>setCancelConfirm(false)}>
      <div style={{textAlign:"center",padding:"8px 0 16px"}}>
        <div style={{fontSize:40,marginBottom:12}}>🗑️</div>
        <div style={{fontSize:15,fontWeight:700,color:"#0B1F4B",marginBottom:8}}>¿Descartar este entrenamiento?</div>
        <div style={{fontSize:13,color:"#6B7A99"}}>No se guardará en tu historial.</div>
      </div>
      <div style={{display:"flex",gap:8,justifyContent:"center"}}>
        <button className="btn btn-d" onClick={()=>{setActiveWorkout(null);setCancelConfirm(false);}}>Sí, descartar</button>
        <button className="btn btn-g" onClick={()=>setCancelConfirm(false)}>Seguir entrenando</button>
      </div>
    </Modal>}

    {prevRoutines.length>0&&(<div style={{marginTop:16}}>
      <button onClick={()=>setShowPrev(s=>!s)} style={{display:"flex",alignItems:"center",gap:8,background:"none",border:"none",cursor:"pointer",color:"#1A5DC8",fontSize:13,fontWeight:700,padding:"10px 0",fontFamily:"'Barlow',sans-serif"}}>
        <span>{showPrev?"▲":"▼"}</span>
        <span>{showPrev?"Ocultar":"Ver"} rutinas anteriores ({prevRoutines.length})</span>
      </button>
      {showPrev&&(<div style={{marginTop:4}}>
        {prevRoutines.map(rt=>(<div key={rt.id} style={{marginBottom:8}}>
          <button onClick={()=>setOpenPrev(s=>({...s,[rt.id]:!s[rt.id]}))} style={{width:"100%",display:"flex",alignItems:"center",justifyContent:"space-between",background:"#F4F6FB",border:"1px solid #DDE4F0",borderRadius:10,padding:"12px 16px",cursor:"pointer",fontFamily:"'Barlow',sans-serif"}}>
            <div style={{textAlign:"left"}}>
              <div style={{fontSize:14,fontWeight:700,color:"#0B1F4B"}}>{rt.title}</div>
              <div style={{fontSize:11,color:"#6B7A99",marginTop:2}}>{rt.daysPerWeek} días/semana{(rt.createdAt||rt.updatedAt)&&` · ${fmtDate(rt.createdAt||rt.updatedAt)}`}</div>
            </div>
            <span style={{color:"#6B7A99",fontSize:18}}>{openPrev[rt.id]?"▲":"▼"}</span>
          </button>
          {openPrev[rt.id]&&(<div style={{border:"1px solid #DDE4F0",borderTop:"none",borderRadius:"0 0 10px 10px",padding:"12px 8px",background:"#fff"}}>
            <RoutineDisplay routine={rt} exercises={exercises}/>
          </div>)}
        </div>))}
      </div>)}
    </div>)}
  </div>);
}

// ── USER PROFILE ──
export function MyProfilePage({user,setUsers,users,measurements,workoutSessions=[],setWorkoutSessions,challenges=[]}){
  const brand=useBranding();
  const{features}=usePermissions(); // plan de la organización (heredado por el cliente)
  const tenant=useTenant();
  const gamification=tenant?.gamification||{};
  const showMedals=!!(features?.challenges&&gamification.enabled); // retos activos + entrenador los prendió
  const[tab,setTab]=useState("info");
  const[editing,setEditing]=useState(false);
  const[form,setForm]=useState({...user});
  const[toast,setToast]=useState(null);
  const[saving,wrap]=useSaving();
  const[showChangePwd,setShowChangePwd]=useState(false);
  const[pwdForm,setPwdForm]=useState({nueva:"",confirmar:""});
  const[pwdErr,setPwdErr]=useState("");
  const ERR="Hubo un problema al guardar. Intentá de nuevo en unos minutos.";
  const photoKey="jh_photo_"+user.id;
  const[photo,setPhoto]=useState(()=>localStorage.getItem(photoKey)||"");

  const age=user.dob?calcAge(user.dob):null;
  const dl=daysLeft(user.plan?.endDate);
  const ini=initials(user.name);
  const clientMsAsc=measurements.filter(m=>m.clientId===user.id).sort((a,b)=>new Date(a.date)-new Date(b.date));
  const clientMsDesc=[...clientMsAsc].reverse();
  const latest=clientMsDesc[0];

  async function saveProfile(){
    try{
      await setUsers(users.map(u=>u.id===user.id?{...u,...form}:u));
      setEditing(false);
      setToast({msg:"Perfil actualizado",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }

  async function savePassword(){
    setPwdErr("");
    if(!pwdForm.nueva){setPwdErr("Ingresá una contraseña.");return;}
    if(pwdForm.nueva.length<6){setPwdErr("La contraseña debe tener al menos 6 caracteres.");return;}
    if(pwdForm.nueva!==pwdForm.confirmar){setPwdErr("Las contraseñas no coinciden.");return;}
    try{
      // Con Supabase Auth, la contraseña vive en Auth (no en users.password).
      const res=await updateOwnPassword(pwdForm.nueva);
      if(res.legacy){
        // Modo legacy (sin sesión Auth): comportamiento viejo.
        const hashed=await hashPassword(pwdForm.nueva);
        await setUsers(users.map(u=>u.id===user.id?{...u,password:hashed}:u));
      } else if(!res.ok){
        setPwdErr("No se pudo actualizar: "+(res.error||"intentá de nuevo."));return;
      }
      setShowChangePwd(false);setPwdForm({nueva:"",confirmar:""});
      setToast({msg:"Contraseña actualizada",type:"ok"});
    }catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
  }

  function handlePhoto(e){
    const file=e.target.files[0];
    if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{const data=ev.target.result;localStorage.setItem(photoKey,data);setPhoto(data);}
    reader.readAsDataURL(file);
  }

  return(<div>
    {toast&&<Toast msg={toast.msg} type={toast.type} onDone={()=>setToast(null)}/>}
    <div className="ph"><div className="pt">Mi Perfil</div></div>
    <div style={{display:"flex",alignItems:"center",gap:14,marginBottom:18}}>
      <label className="avatar-wrap" style={{cursor:"pointer"}}>
        <input type="file" accept="image/*" style={{display:"none"}} onChange={handlePhoto}/>
        <div className="avatar-big" style={{width:70,height:70,fontSize:26}}>{photo?<img src={photo} alt="foto"/>:ini}</div>
        <div className="avatar-edit">📷</div>
      </label>
      <div>
        <div style={{fontSize:20,fontWeight:800,color:"#0B1F4B"}}>{user.name}</div>
        <div style={{color:"#6B7A99",fontSize:12}}>@{user.username}{age!==null&&` · ${age} años`}</div>
      </div>
    </div>

    <div className="tabs">
      {[["info","👤 Info"],["workouts","🏋️ Entrenos"],...(showMedals?[["medals","🏅 Medallas"]]:[]),...(features?.measurements?[["measurements","📊 Mediciones"]]:[]),...(features?.analytics?[["history","📈 Historial"]]:[])].map(([id,lbl])=>(<div key={id} className={`tab${tab===id?" active":""}`} onClick={()=>setTab(id)}>{lbl}</div>))}
    </div>

    {tab==="info"&&(<div>
      <div className="card" style={{marginBottom:12}}>
        <div className="sa"><div style={{fontWeight:700,fontSize:13}}>Mis datos</div><div style={{display:"flex",gap:6}}><button className="btn btn-s btn-sm" onClick={()=>{setForm({...user});setEditing(true);setShowChangePwd(false);setPwdForm({nueva:"",confirmar:""});setPwdErr("");}}>✏️ Editar</button></div></div>
        {[["Correo",user.email],["Teléfono",user.phone],["Cédula",user.cedula],["Fecha nac.",fmtDate(user.dob)],["Edad",age!==null?(age+" años"):"—"],["Estatura",user.height?(user.height+" cm"):"—"]].map(([k,v])=>(<div key={k} style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:"1px solid #DDE4F0",fontSize:13}}><span style={{color:"#6B7A99"}}>{k}</span><span style={{fontWeight:600}}>{v||"—"}</span></div>))}
      </div>
      <div className="card">
        <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Mi plan</div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:6}}>
          <span className={`badge ${planColor(user.plan?.type)}`}>{user.plan?.type||"—"}</span>
          <span className="badge bd-gray">{user.plan?.modality||"—"}</span>
          <span className="badge bd-gray">{user.plan?.format||"—"}</span>
          {dl!==null&&<span className={`badge ${dl<0?"bd-red":dl<=30?"bd-orange":"bd-green"}`}>{dl<0?"Vencido":`${dl} días restantes`}</span>}
        </div>
        <div style={{fontSize:12,color:"#6B7A99"}}>Entrenador: <strong style={{color:"#0B1F4B"}}>{brand.displayName}</strong></div>
      </div>
      {editing&&<Modal title="Editar mis datos" onClose={()=>setEditing(false)}>
        <div className="fr2">
          <div className="fg"><label>Correo</label><input className="inp" type="email" value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})}/></div>
          <div className="fg"><label>Teléfono</label><input className="inp" value={form.phone||""} onChange={e=>setForm({...form,phone:e.target.value})}/></div>
          <div className="fg"><label>Cédula</label><input className="inp" value={form.cedula||""} onChange={e=>setForm({...form,cedula:e.target.value})}/></div>
          <div className="fg"><label>Fecha de nacimiento</label><input className="inp" type="date" value={form.dob||""} onChange={e=>setForm({...form,dob:e.target.value})}/></div>
          <div className="fg"><label>Estatura (cm)</label><input className="inp" type="number" min={0} onKeyDown={preventNegKey} value={form.height||""} onChange={e=>setForm({...form,height:stripNeg(e.target.value)})}/></div>
        </div>
        <div style={{borderTop:"1px solid #DDE4F0",paddingTop:12,marginTop:4}}>
          {!showChangePwd&&<button type="button" className="btn btn-w btn-sm" onClick={()=>{setShowChangePwd(true);setPwdForm({nueva:"",confirmar:""});setPwdErr("");}}>🔐 Cambiar contraseña</button>}
          {showChangePwd&&(<div>
            <div style={{fontSize:11,fontWeight:700,color:"#6B7A99",textTransform:"uppercase",letterSpacing:1,marginBottom:8}}>Nueva contraseña</div>
            {pwdErr&&<div className="err">{pwdErr}</div>}
            <div className="fg"><label>Nueva contraseña</label><PasswordInput value={pwdForm.nueva} onChange={e=>setPwdForm({...pwdForm,nueva:e.target.value})} autoComplete="new-password"/></div>
            <div className="fg"><label>Confirmar contraseña</label><PasswordInput value={pwdForm.confirmar} onChange={e=>setPwdForm({...pwdForm,confirmar:e.target.value})} autoComplete="new-password"/></div>
            <div style={{display:"flex",gap:8,marginTop:4}}><SaveBtn className="btn btn-p btn-sm" onClick={()=>wrap(savePassword)} saving={saving}>Guardar contraseña</SaveBtn><button className="btn btn-g btn-sm" onClick={()=>setShowChangePwd(false)}>Cancelar</button></div>
          </div>)}
        </div>
        <div style={{display:"flex",gap:8,marginTop:12}}><SaveBtn onClick={()=>wrap(saveProfile)} saving={saving}>Guardar datos</SaveBtn><button className="btn btn-g" onClick={()=>setEditing(false)}>Cancelar</button></div>
      </Modal>}
    </div>)}

    {tab==="workouts"&&(<div>
      <WorkoutHistory sessions={workoutSessions.filter(s=>s.userId===user.id)} onDeleteSession={async id=>{
        if(!confirm("¿Eliminar este entrenamiento del historial?"))return;
        try{await setWorkoutSessions(workoutSessions.filter(s=>s.id!==id));setToast({msg:"Entrenamiento eliminado",type:"ok"});}
        catch(e){console.error(e);setToast({msg:ERR,type:"err"});}
      }}/>
    </div>)}

    {tab==="medals"&&showMedals&&<MedalsView sessions={workoutSessions} clientId={user.id} gamification={gamification} clients={users.filter(u=>u.role!=="trainer")} challenges={challenges}/>}

    {tab==="measurements"&&features?.measurements&&(<div>
      <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Última medición{latest?` — ${fmtDate(latest.date)}`:""}</div>
      {latest?(<div className="m-grid">{MEASUREMENT_FIELDS.map(f=>{const v=latest[f.key];return v?(<div key={f.key} className="m-card"><div className="m-lbl">{f.label}</div><div className="m-val">{v}<span className="m-unit"> {f.unit}</span></div></div>):null;})}</div>):<div className="empty"><div className="ico">📊</div><p>Sin mediciones registradas aún</p></div>}
    </div>)}

    {tab==="history"&&features?.analytics&&(<div>
      {clientMsAsc.length>1&&<MultiChart clientMs={clientMsAsc}/>}
      <div style={{fontWeight:700,fontSize:13,marginBottom:10}}>Historial ({clientMsAsc.length})</div>
      {clientMsDesc.map(m=>(<div key={m.id} className="hist-row"><div className="hist-date">{fmtDate(m.date)}</div><div className="hist-vals">{MEASUREMENT_FIELDS.map(f=>m[f.key]&&<span key={f.key} className="hist-val">{f.label.split(" ")[0]}: {m[f.key]}{f.unit}</span>)}</div></div>))}
      {clientMsAsc.length===0&&<div className="empty"><div className="ico">📈</div><p>Sin historial</p></div>}
    </div>)}
  </div>);
}
