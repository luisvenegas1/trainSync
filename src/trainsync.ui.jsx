import { useState, useEffect } from "react";
import { LOGO_IMG, TRAINER_PHOTO } from "./trainsync.assets";
import { getEmbed, initials, verifyPassword } from "./trainsync.utils";
import { useBranding } from "./branding/BrandingContext";
import { APP_VERSION } from "./version";

export function Logo({size=52}){const b=useBranding();return(<img src={b.logoUrl||LOGO_IMG} alt={b.displayName} style={{width:size,height:size,objectFit:"contain",borderRadius:8}}/>);}

export function PasswordInput({value,onChange,placeholder="••••••••",autoComplete="current-password"}){
  const[show,setShow]=useState(false);
  return(<div className="pw-wrap"><input className="inp" type={show?"text":"password"} value={value} onChange={onChange} placeholder={placeholder} autoComplete={autoComplete}/><button type="button" className="pw-eye" onClick={()=>setShow(s=>!s)}>{show?"🙈":"👁"}</button></div>);
}

export function Modal({title,onClose,children,size=""}){
  return(<div className="mb" onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className={`mo${size?" mo-"+size:""}`}><div className="mo-h"><div className="mo-t">{title}</div><button className="mo-x" onClick={onClose}>✕</button></div>{children}</div></div>);
}

export function SaveBtn({onClick,saving,children,className="btn btn-p",style={}}){
  return(<button className={className} style={style} onClick={onClick} disabled={saving}>
    {saving?<span style={{display:"inline-flex",alignItems:"center",gap:6}}><span style={{width:14,height:14,border:"2px solid currentColor",borderTopColor:"transparent",borderRadius:"50%",display:"inline-block",animation:"spin 0.7s linear infinite"}}/>Guardando...</span>:children}
  </button>);
}

export function VideoModal({name,url,onClose}){
  const embed=getEmbed(url);
  return(<Modal title={name} onClose={onClose}>{embed?(<div style={{position:"relative",paddingBottom:"56.25%",height:0,overflow:"hidden",borderRadius:8}}><iframe src={embed} style={{position:"absolute",top:0,left:0,width:"100%",height:"100%",border:"none",borderRadius:8}} allow="accelerometer;autoplay;clipboard-write;encrypted-media;gyroscope;picture-in-picture" allowFullScreen title={name}/></div>):<div className="empty"><div className="ico">🎬</div><p>Sin video</p></div>}</Modal>);
}

// ── APP FOOTER ──
export function AppFooter(){
  const brand=useBranding();
  const year=new Date().getFullYear();
  return(
    <div className="main-footer">
      © {year} {brand.footerName||brand.displayName} · {brand.tagline} · Todos los derechos reservados<br/>
      <a href="/terminos" style={{color:"inherit",textDecoration:"underline"}}>Términos</a> · <a href="/privacidad" style={{color:"inherit",textDecoration:"underline"}}>Privacidad</a><br/>
      · Desarrollado por <a href="https://wa.me/50688238325" target="_blank" rel="noreferrer" style={{color:"inherit",textDecoration:"underline",fontWeight:700}}>Luis Diego Venegas</a>
      <span style={{opacity:0.5,marginLeft:8}}>· v{APP_VERSION}</span>
    </div>
  );
}

// ── LOGIN ──

export function SobreJohel({onClose}){
  return(
    <div className="mb" onClick={e=>{if(e.target===e.currentTarget)onClose()}} style={{zIndex:2000}}>
      <div className="mo" style={{maxWidth:540,borderRadius:20}}>
        <div className="mo-h">
          <div className="mo-t" style={{fontSize:17}}>Sobre Johel</div>
          <button className="mo-x" onClick={onClose}>✕</button>
        </div>
        {/* Trainer photo */}
        <div style={{textAlign:"center",marginBottom:16}}>
          <img src={TRAINER_PHOTO} alt="Johel Herrera" style={{width:160,height:200,objectFit:"cover",objectPosition:"top",borderRadius:14,boxShadow:"0 4px 20px rgba(0,0,0,0.15)"}}/>
        </div>
        {/* Bio text */}
        <div style={{fontSize:13,color:"#0D1B3E",lineHeight:1.65,marginBottom:16}}>
          <p style={{marginBottom:10}}>Con más de 6 años de experiencia en la industria del fitness, Johel ha trabajado como entrenador en <strong>9Round</strong>, ayudando a personas de distintos niveles a mejorar su condición física, desarrollar hábitos saludables y alcanzar sus objetivos.</p>
          <p style={{marginBottom:10}}>Actualmente se dedica al <strong>entrenamiento personalizado</strong>, diseñando programas adaptados a las necesidades de cada persona, ya sea para aumentar masa muscular, reducir grasa corporal, mejorar el rendimiento físico o desarrollar un estilo de vida más activo y saludable.</p>
          <p style={{marginBottom:10}}>Su enfoque se basa en la constancia, la técnica correcta y la creación de planes sostenibles que permitan obtener resultados reales a largo plazo.</p>
          <p style={{fontWeight:600,color:"#1A5DC8"}}>¿Tienes una meta específica? Ponte en contacto para recibir orientación y acompañamiento personalizado.</p>
        </div>
        {/* CTA */}
        <div style={{background:"#F5F7FC",borderRadius:10,padding:"12px 14px",marginBottom:14}}>
          <div style={{fontSize:12,fontWeight:700,color:"#6B7A99",textAlign:"center",marginBottom:10,textTransform:"uppercase",letterSpacing:0.5}}>¿Interesado en entrenamiento personalizado? Contáctame para una valoración.</div>
          <div style={{display:"flex",gap:10,justifyContent:"center",flexWrap:"wrap"}}>
            <a href="https://wa.me/50660254380" target="_blank" rel="noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:7,background:"#25D366",color:"#fff",padding:"10px 18px",borderRadius:9,fontWeight:700,fontSize:13,textDecoration:"none",fontFamily:"'Barlow',sans-serif"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
              WhatsApp
            </a>
            <a href="https://www.instagram.com/johel_coach/" target="_blank" rel="noreferrer"
              style={{display:"inline-flex",alignItems:"center",gap:7,background:"linear-gradient(135deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888)",color:"#fff",padding:"10px 18px",borderRadius:9,fontWeight:700,fontSize:13,textDecoration:"none",fontFamily:"'Barlow',sans-serif"}}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
              Instagram
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

function InstallModal({onClose}){
  const[os,setOs]=useState(null); // null | "ios" | "android"
  const btnStyle={padding:"12px 0",borderRadius:10,fontWeight:700,fontSize:15,cursor:"pointer",border:"none",width:"100%",marginBottom:8};
  const steps={
    ios:[
      {icon:"🌐",text:"Abrí esta página en Safari (no en Chrome ni otro navegador)."},
      {icon:"⬆️",text:'Tocá el botón de compartir (el cuadrado con la flecha hacia arriba) en la barra inferior.'},
      {icon:"➕",text:'Desplazate hacia abajo y tocá "Agregar a pantalla de inicio".'},
      {icon:"✅",text:'Tocá "Agregar" en la esquina superior derecha. ¡Listo!'},
    ],
    android:[
      {icon:"🌐",text:"Abrí esta página en Chrome."},
      {icon:"⋮",text:"Tocá el menú de tres puntos (⋮) en la esquina superior derecha."},
      {icon:"➕",text:'Tocá "Agregar a pantalla de inicio" o "Instalar app".'},
      {icon:"✅",text:'Confirmá tocando "Agregar". ¡Listo!'},
    ]
  };
  return(<div style={{position:"fixed",inset:0,background:"rgba(11,31,75,0.55)",zIndex:9999,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={onClose}>
    <div style={{background:"#fff",borderRadius:"20px 20px 0 0",width:"100%",maxWidth:480,padding:"28px 24px 28px",boxShadow:"0 -8px 40px rgba(11,31,75,0.18)",borderBottom:"4px solid #0B1F4B"}} onClick={e=>e.stopPropagation()}>
      <div style={{textAlign:"center",marginBottom:20}}>
        <div style={{fontSize:32,marginBottom:6}}>📲</div>
        <div style={{fontSize:18,fontWeight:800,color:"#0B1F4B"}}>Instalar como app</div>
        <div style={{fontSize:13,color:"#6B7A99",marginTop:4}}>Agregala a tu pantalla de inicio para usarla como una app.</div>
      </div>
      {!os&&(<div>
        <div style={{fontSize:13,fontWeight:700,color:"#6B7A99",textAlign:"center",marginBottom:12}}>¿Qué dispositivo tenés?</div>
        <button style={{...btnStyle,background:"#0B1F4B",color:"#fff"}} onClick={()=>setOs("ios")}> iPhone / iPad (iOS)</button>
        <button style={{...btnStyle,background:"#3A8EF6",color:"#fff"}} onClick={()=>setOs("android")}> Android</button>
        <button style={{...btnStyle,background:"#F1F4FF",color:"#6B7A99",marginBottom:0}} onClick={onClose}>Cancelar</button>
      </div>)}
      {os&&(<div>
        <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:16}}>
          <button onClick={()=>setOs(null)} style={{background:"none",border:"none",cursor:"pointer",fontSize:13,color:"#3A8EF6",fontWeight:700,padding:0}}>← Volver</button>
          <div style={{fontWeight:700,fontSize:14,color:"#0B1F4B"}}>{os==="ios"?"iPhone / iPad":"Android"}</div>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12,marginBottom:20}}>
          {steps[os].map((s,i)=>(
            <div key={i} style={{display:"flex",gap:12,alignItems:"center",background:"#F8F9FF",borderRadius:10,padding:"12px 14px"}}>
              <div style={{fontSize:22,flexShrink:0,width:32,textAlign:"center"}}>{s.icon}</div>
              <div style={{flex:1}}>
                <div style={{fontSize:11,fontWeight:700,color:"#3A8EF6",marginBottom:2}}>Paso {i+1}</div>
                <div style={{fontSize:13,color:"#0B1F4B",lineHeight:1.5}}>{s.text}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{background:"#EFF6FF",borderRadius:10,padding:"10px 14px",fontSize:12,color:"#1A5DC8",marginBottom:16}}>
          💡 Una vez instalada, podés abrirla desde tu pantalla de inicio igual que cualquier app.
        </div>
        <button style={{...btnStyle,background:"#0B1F4B",color:"#fff",marginBottom:0}} onClick={onClose}>¡Entendido!</button>
      </div>)}
    </div>
  </div>);
}

export function LoginPage({onLogin,users}){
  const brand=useBranding();
  const[u,setU]=useState("");const[p,setP]=useState("");const[err,setErr]=useState("");const[showSobre,setShowSobre]=useState(false);const[showInstall,setShowInstall]=useState(false);
  function go(e){
    e.preventDefault();
    // Buscar en todos los usuarios (incluyendo trainer)
    const found=users.find(x=>x.username.toLowerCase()===u.toLowerCase());
    if(!found){setErr("Usuario o contraseña incorrectos");return;}
    if(!verifyPassword(p,found.password)){setErr("Usuario o contraseña incorrectos");return;}
    if(found.disabled){setErr("Tu cuenta está deshabilitada. Contactá a Johel para más información.");return;}
    onLogin(found);
  }
  return(<div className="login-page">
    {showSobre&&<SobreJohel onClose={()=>setShowSobre(false)}/>}
    {showInstall&&<InstallModal onClose={()=>setShowInstall(false)}/>}
    <div className="login-box">
      <div className="login-logo">
        {brand.logoUrl&&<img src={brand.logoUrl} alt={brand.displayName} style={{width:120,height:120,objectFit:"contain",display:"block",margin:"0 auto 10px"}}/>}
        <div className="login-brand">{brand.displayName}</div>
        <div className="login-sub">{brand.tagline}</div>
      </div>
      {err&&<div className="err">⚠ {err}</div>}
      <form onSubmit={go}>
        <div className="fg"><label>Usuario</label><input className="inp" value={u} onChange={e=>setU(e.target.value)} placeholder="Tu usuario" autoComplete="username"/></div>
        <div className="fg"><label>Contraseña</label><PasswordInput value={p} onChange={e=>setP(e.target.value)}/></div>
        <button className="btn btn-p btn-full" type="submit" style={{marginTop:8}}>Ingresar →</button>
      </form>
      <div style={{textAlign:"center",marginTop:14,paddingTop:14,borderTop:"1px solid #DDE4F0",display:"flex",justifyContent:"center",gap:20,flexWrap:"wrap"}}>
        <button onClick={()=>setShowInstall(true)} style={{background:"none",border:"none",cursor:"pointer",color:"#3A8EF6",fontSize:13,fontWeight:700,fontFamily:"'Barlow',sans-serif",padding:0}}>
          📲 Instalar como app
        </button>
        <button onClick={()=>setShowSobre(true)} style={{background:"none",border:"none",cursor:"pointer",color:"#1A5DC8",fontSize:13,fontWeight:700,fontFamily:"'Barlow',sans-serif",textDecoration:"underline",padding:0}}>
          Sobre Johel →
        </button>
      </div>
    </div>
    <AppFooter/>
  </div>);
}
export function Sidebar({user,page,setPage,onLogout,isSuperadmin=false,features={}}){
  const brand=useBranding();
  const isT=user.role==="trainer";
  const navs=isT?[
    {id:"dashboard",icon:"🏠",label:"Inicio"},
    {id:"clients",icon:"👥",label:"Clientes"},
    {id:"routines",icon:"📋",label:"Rutinas"},
    {id:"exercises",icon:"🏋️",label:"Ejercicios"},
    {id:"reminders",icon:"🔔",label:"Recordatorios"},
    ...(features.challenges?[{id:"challenges",icon:"🏅",label:"Retos"}]:[]),
    {id:"admins",icon:"🔑",label:"Admins"},
    {id:"guide",icon:"📖",label:"Guía"},
    {id:"about",icon:"✨",label:"Acerca de"},
  ]:[
    {id:"my-routine",icon:"📋",label:"Rutina"},
    {id:"my-profile",icon:"👤",label:"Perfil"},
    {id:"about",icon:"✨",label:"Acerca de"},
  ];
  const ini=initials(user.name);
  const photoKey="jh_photo_"+user.id;
  const photo=localStorage.getItem(photoKey);
  return(
    <aside className="sidebar">
      <div className="sb-logo"><img src={brand.logoUrl||LOGO_IMG} alt={brand.displayName} style={{width:52,height:52,objectFit:"contain",borderRadius:10}}/><div className="sb-brand">{brand.displayName}</div><div className="sb-sub">{brand.taglineShort}</div></div>
      <nav>
        {isT&&<div className="nav-sec">Menú</div>}
        {navs.map(n=>(<div key={n.id} className={`nav-item${page===n.id?" active":""}`} onClick={()=>setPage(n.id)}><span className="nav-icon">{n.icon}</span><span>{n.label}</span></div>))}
        {/* Acceso al Panel de Plataforma: SOLO para el superusuario (platform_admins).
            El acceso real se re-valida en /platform contra platform_admins. */}
        {isSuperadmin&&(<>
          <div className="nav-sec">Plataforma</div>
          <div className="nav-item" onClick={()=>{window.location.href="/platform";}}><span className="nav-icon">🛰️</span><span>Plataforma</span></div>
        </>)}
      </nav>
      {/* Mobile logout button - visible only on mobile */}
      <button className="mob-logout" onClick={onLogout} title="Cerrar sesión">
        <span className="nav-icon">⎋</span>
        <span>Salir</span>
      </button>
      <div className="sb-footer">
        <div className="u-chip">
          <div className="u-av">{photo?<img src={photo} alt=""/>:ini}</div>
          <div style={{flex:1,minWidth:0}}><div className="u-nm">{user.name.split(" ")[0]}</div><div className="u-rl">{isT?"Entrenador":"Cliente"}</div></div>
          <button className="lbtn" onClick={onLogout} title="Salir">⎋</button>
        </div>
        <div className="footer-tm">© {new Date().getFullYear()} {brand.footerName||brand.displayName}<br/>{brand.tagline}</div>
      </div>
    </aside>
  );
}

// ── TOAST NOTIFICATION ──
export function Toast({msg,type,onDone}){
  useEffect(()=>{const t=setTimeout(onDone,5000);return()=>clearTimeout(t)},[onDone]);
  const bg=type==="ok"?"#2E7D32":type==="err"?"#E53935":"#1A5DC8";
  const icon=type==="ok"?"✅":type==="err"?"❌":"ℹ️";
  return(<div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:bg,color:"#fff",borderRadius:10,padding:"12px 20px",display:"flex",alignItems:"center",gap:10,boxShadow:"0 4px 20px rgba(0,0,0,0.25)",fontFamily:"'Barlow',sans-serif",fontSize:13,fontWeight:600,minWidth:240,maxWidth:380,animation:"slideDown 0.3s ease"}}>
    <span style={{fontSize:16}}>{icon}</span>
    <span style={{flex:1}}>{msg}</span>
    <button onClick={onDone} style={{background:"none",border:"none",color:"rgba(255,255,255,0.7)",cursor:"pointer",fontSize:16,padding:0,lineHeight:1}}>✕</button>
    <style>{`@keyframes slideDown{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}@keyframes spin{to{transform:rotate(360deg)}}`}</style>
  </div>);
}

// ── EXERCISE PICKER MODALS ──
export function ExercisePicker({exercises,onPick,onClose}){
  const[search,setSearch]=useState("");const[filter,setFilter]=useState("Todos");
  const normals=exercises.filter(e=>e.type==="normal");
  const groups=["Todos",...new Set(normals.map(e=>e.muscleGroup))].filter((v,i,a)=>a.indexOf(v)===i);
  const list=normals.filter(e=>(filter==="Todos"||e.muscleGroup===filter)&&e.name.toLowerCase().includes(search.toLowerCase()));
  return(<div className="mb" style={{zIndex:1100}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className="mo" style={{maxHeight:"88vh"}}><div className="mo-h"><div className="mo-t">Agregar ejercicio</div><button className="mo-x" onClick={onClose}>✕</button></div><input className="inp" placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus style={{marginBottom:8}}/><div className="chips">{groups.map(g=><button key={g} className={`chip${filter===g?" on":""}`} onClick={()=>setFilter(g)}>{g}</button>)}</div><div style={{maxHeight:300,overflowY:"auto"}}>{list.map(ex=>(<div key={ex.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #DDE4F0"}}><div><div style={{fontSize:13,fontWeight:700}}>{ex.name}</div><div style={{fontSize:10,color:"#6B7A99"}}>{ex.muscleGroup} · {ex.equipment}</div></div><button className="btn btn-p btn-sm" onClick={()=>onPick(ex)}>+ Agregar</button></div>))}{list.length===0&&<div className="empty"><div className="ico">🔍</div><p>Sin resultados</p></div>}</div></div></div>);
}

export function StretchPicker({exercises,selected,onToggle,onClose}){
  const[search,setSearch]=useState("");
  const stretches=exercises.filter(e=>e.type==="stretching"&&e.name.toLowerCase().includes(search.toLowerCase()));
  return(<div className="mb" style={{zIndex:1100}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}><div className="mo"><div className="mo-h"><div className="mo-t">Estiramientos</div><button className="mo-x" onClick={onClose}>✕</button></div><input className="inp" placeholder="Buscar..." value={search} onChange={e=>setSearch(e.target.value)} autoFocus style={{marginBottom:10}}/><div style={{maxHeight:320,overflowY:"auto"}}>{stretches.map(ex=>{const sel=selected.includes(ex.id);return(<div key={ex.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid #DDE4F0"}}><div><div style={{fontSize:13,fontWeight:700}}>{ex.name}</div><div style={{fontSize:10,color:"#6B7A99"}}>{ex.muscleGroup}</div></div><button className={`btn btn-sm ${sel?"btn-d":"btn-ok"}`} onClick={()=>onToggle(ex.id)}>{sel?"Quitar":"✓"}</button></div>);})}</div><div style={{marginTop:10}}><button className="btn btn-p btn-full" onClick={onClose}>Listo ({selected.length})</button></div></div></div>);
}

// ── DASHBOARD ──
