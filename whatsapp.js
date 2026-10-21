(()=> {
"use strict";
const $=s=>document.querySelector(s);
const U="vertice_wa_service_url",T="vertice_wa_service_token";
const DEFAULT_URL=(location.hostname==="localhost"||location.hostname==="127.0.0.1")?"http://127.0.0.1:8787":"https://vertice-climax-whatsapp.onrender.com";
let active=null,wasConnected=false,lastChatRefresh=0,pollBusy=false;
function base(){return ($("#service-url").value||"").trim().replace(/\/+$/,"")}
function token(){return $("#service-token").value.trim()}
function headers(json=false){const h={Authorization:"Bearer "+token()};if(json)h["Content-Type"]="application/json";return h}
async function api(p,o={}) {
  if(!base())throw Error("Informe a URL HTTPS do serviço.");
  if(!token())throw Error("Informe o token do serviço.");
  const r=await fetch(base()+p,{...o,headers:{...headers(!!o.body),...(o.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok&&r.status!==202)throw Error(d.error||d.message||"HTTP "+r.status);
  return {...d,httpStatus:r.status};
}
function status(s){$("#status").textContent=s}
function showQr(dataUrl){
  $("#qr-box").replaceChildren();
  const img=document.createElement("img");
  img.alt="QR Code real para vincular o WhatsApp Web";
  img.src=dataUrl;
  $("#qr-box").append(img);
}
async function qr(){
  status("Solicitando QR Code à sessão do WhatsApp…");
  $("#qr").disabled=true;
  try{
    for(let attempt=0;attempt<20;attempt++){
      try{
        const d=await api("/api/qr");
        if(d.connected){
          $("#qr-box").textContent="WhatsApp conectado. Não é necessário escanear novamente.";
          wasConnected=true;
          status("WhatsApp conectado.");
          await loadChats();
          return;
        }
        if(d.qrDataUrl){showQr(d.qrDataUrl);status("No celular: WhatsApp → Dispositivos conectados → Conectar dispositivo.");return}
        status(d.message||"Aguardando o QR Code real da sessão…");
      }catch(e){status(e.message);if(attempt===19)return}
      await new Promise(resolve=>setTimeout(resolve,1500));
    }
    status("QR ainda não disponível. Confirme se o serviço está ativo e tente novamente.");
  }finally{$("#qr").disabled=false}
}
async function checkStatus(silent=true){
  if(pollBusy||!base()||!token())return;
  pollBusy=true;
  try{
    const d=await api("/api/status");
    if(d.connected){
      status("Conectado"+(d.user?.name?" como "+d.user.name:"")+" · acompanhamento ativo");
      if(!wasConnected||Date.now()-lastChatRefresh>30000)await loadChats();
    }else if(d.connecting){
      status("Conectando ao WhatsApp…");
    }else{
      status(d.lastConnectionError||d.message||"WhatsApp desconectado. Solicite um novo QR Code.");
      if(wasConnected){$("#qr-box").textContent="Sessão desconectada. Solicite um novo QR Code se necessário."}
    }
    wasConnected=Boolean(d.connected);
  }catch(e){if(!silent)status(e.message)}
  finally{pollBusy=false}
}
async function loadChats(){
  try{
    const d=await api("/api/chats");
    const container=$("#chats");
    container.replaceChildren();
    (d.chats||[]).forEach(c=>{
      const b=document.createElement("button");
      b.className="chat-button";
      b.textContent=(c.name||c.id)+" — "+(c.lastMessage||"");
      b.onclick=()=>select(c.id,c.name||c.id);
      container.append(b);
    });
    if(!d.chats?.length)container.textContent="Nenhuma conversa no cache. Mensagens antigas podem não ser sincronizadas.";
    lastChatRefresh=Date.now();
    return true;
  }catch(e){status(e.message);return false}
}
async function select(id,name){
  active=id;
  $("#chat-title").textContent=name;
  $("#message").disabled=false;
  $("#approve").disabled=false;
  $("#send").disabled=!$("#approve").checked;
  try{
    const d=await api("/api/messages?chatId="+encodeURIComponent(id));
    const container=$("#messages");
    container.replaceChildren();
    (d.messages||[]).forEach(m=>{
      const p=document.createElement("p");
      p.textContent=(m.fromMe?"Você: ":"Contato: ")+(m.text||"[mensagem sem texto]");
      container.append(p);
    });
    if(!d.messages?.length)container.textContent="Nenhuma mensagem armazenada para esta conversa.";
  }catch(e){$("#messages").textContent=e.message}
}
$("#save").onclick=()=>{
  if(!base())return status("Informe a URL do serviço.");
  if(!token())return status("Informe o token do serviço.");
  localStorage.setItem(U,base());
  sessionStorage.setItem(T,token());
  status("Configuração salva neste navegador. Verificando conexão…");
  void checkStatus(false);
};
$("#qr").onclick=()=>void qr();
$("#refresh").onclick=()=>{void loadChats();void checkStatus(false)};
$("#approve").onchange=()=>$("#send").disabled=!active||!$("#approve").checked;
$("#send-form").onsubmit=async e=>{
  e.preventDefault();
  const text=$("#message").value.trim();
  if(!active||!$("#approve").checked||!text)return;
  if(!confirm("Confirma o envio para "+$("#chat-title").textContent+"?\n\n"+text))return;
  $("#send").disabled=true;
  try{
    await api("/api/send",{method:"POST",body:JSON.stringify({chatId:active,text,approved:true})});
    $("#message").value="";
    $("#approve").checked=false;
    status("Mensagem enviada e registrada.");
    await select(active,$("#chat-title").textContent);
    await loadChats();
  }catch(e){status("Envio falhou: "+e.message)}
  finally{$("#send").disabled=!active||!$("#approve").checked}
};
$("#service-url").value=localStorage.getItem(U)||DEFAULT_URL;
$("#service-token").value=sessionStorage.getItem(T)||localStorage.getItem(T)||"";if(localStorage.getItem(T)){sessionStorage.setItem(T,localStorage.getItem(T));localStorage.removeItem(T)}
if(token())void checkStatus();
window.setInterval(()=>{void checkStatus(true);if(wasConnected&&Date.now()-lastChatRefresh>30000)void loadChats()},10000);
})();