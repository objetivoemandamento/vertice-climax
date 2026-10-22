(()=> {
"use strict";
const $=s=>document.querySelector(s);
const STORE="vertice_climax_business_leads_v1";
const PROJECT_STORE="vertice_climax_projects_v1";
const AGENT_URL_KEY="vertice_wa_service_url";
const AGENT_TOKEN_KEY="vertice_wa_service_token";
const DEFAULT_AGENT_URL=(location.hostname==="localhost"||location.hostname==="127.0.0.1")?"http://127.0.0.1:8787":"https://vertice-climax-whatsapp.onrender.com";
const STAGES=["Novo","Pesquisado","Contato autorizado","Em conversa","Interessado","Proposta enviada","Aguardando pagamento","Pago","Site entregue","Sem interesse"];
const PACKAGES={Basico:{name:"Básico",price:300},Medio:{name:"Médio",price:700},Avancado:{name:"Avançado",price:2000}};
let leads=load(),hubProjects=loadProjects(),activeDemoId=null,syncTimer=null,syncBusy=false;
function uid(){return (crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+Math.random().toString(36).slice(2))}
function load(){try{const x=JSON.parse(localStorage.getItem(STORE)||"[]");return Array.isArray(x)?x.filter(v=>v&&typeof v.id==="string"&&typeof v.name==="string"):[]}catch{return []}}
function loadProjects(){try{const x=JSON.parse(localStorage.getItem(PROJECT_STORE)||"[]");return Array.isArray(x)?x.filter(v=>v&&typeof v.id==="string"):[]}catch{return []}}
function persist(){try{localStorage.setItem(STORE,JSON.stringify(leads));localStorage.setItem(PROJECT_STORE,JSON.stringify(hubProjects));queueHubSync();return true}catch(e){toast("Não foi possível salvar. Exporte um backup e libere espaço no navegador.");return false}}
function toast(s){const el=$("#toast");el.textContent=s;el.classList.add("show");window.setTimeout(()=>el.classList.remove("show"),3000)}
function value(id){return $("#"+id).value.trim()}
function packageLabel(key){return PACKAGES[key]?PACKAGES[key].name+" — "+money(PACKAGES[key].price):"Não definido"}
function money(n){return new Intl.NumberFormat("pt-BR",{style:"currency",currency:"BRL",maximumFractionDigits:0}).format(Number(n)||0)}
function esc(s){return String(s??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]))}
function normalizedPhone(s){return String(s||"").replace(/\D/g,"")}
function setMetrics(){
  $("#metric-total").textContent=leads.length;
  $("#metric-negotiation").textContent=leads.filter(l=>["Contato autorizado","Em conversa","Interessado","Proposta enviada","Aguardando pagamento"].includes(l.stage)).length;
  const paid=leads.filter(l=>["Pago","Site entregue"].includes(l.stage));
  $("#metric-paid").textContent=paid.length;
  $("#metric-revenue").textContent=money(paid.reduce((sum,l)=>sum+(PACKAGES[l.packageKey]?.price||0),0));
}
function element(tag,cls,text){const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e}
function button(label,cls,fn){const b=element("button","button "+(cls||""),label);b.type="button";b.addEventListener("click",fn);return b}
function render(){
  setMetrics();
  const body=$("#lead-rows");body.replaceChildren();
  const q=$("#lead-search").value.trim().toLocaleLowerCase("pt-BR"),stage=$("#stage-filter").value;
  const visible=leads.filter(l=>(!stage||l.stage===stage)&&(!q||[l.name,l.segment,l.location,l.phone,l.whatsapp,l.website,l.social,l.notes].join(" ").toLocaleLowerCase("pt-BR").includes(q)));
  $("#empty-state").hidden=visible.length>0;
  visible.forEach(l=>{
    const tr=element("tr");
    const nameCell=element("td");nameCell.append(element("strong","",l.name));nameCell.append(element("small","",[(l.segment||"Segmento não informado"),(l.location||"Localização não informada")].join(" · ")));
    if(l.consent)nameCell.append(element("small","consent-label","Autorização de contato registrada"));
    if(l.stage==="Sem interesse")nameCell.append(element("small","", "Não contatar"));
    tr.append(nameCell);
    const contact=element("td");
    contact.append(element("small","", "Telefone: "+(l.phone||"não confirmado")));
    contact.append(element("small","", "WhatsApp: "+(l.whatsapp||"não confirmado")));
    contact.append(element("small","", "Site: "+(l.website||"não informado")));
    if(l.source)contact.append(element("small","", "Fonte: "+l.source));
    tr.append(contact);
    const stageCell=element("td");const sel=element("select","stage-select");sel.setAttribute("aria-label","Etapa de "+l.name);
    STAGES.forEach(s=>{const op=element("option","",s);op.value=s;sel.append(op)});sel.value=l.stage;sel.addEventListener("change",()=>changeStage(l.id,sel.value));stageCell.append(sel);
    if(l.paymentReviewRequired){stageCell.append(element("small","payment-warning","Revisão necessária: "+(l.paymentReviewReason||"divergência no pagamento")));}
    else if(l.paymentStatus){
      const labels={pending:"Aguardando",approved:"Confirmado",in_process:"Em análise",rejected:"Recusado",cancelled:"Cancelado",refunded:"Estornado"};
      stageCell.append(element("small","payment-status","Pagamento: "+(labels[l.paymentStatus]||l.paymentStatus)));
    }
    tr.append(stageCell);
    const packageCell=element("td","",packageLabel(l.packageKey));tr.append(packageCell);
    const actions=element("td");const stack=element("div","row-actions");
    stack.append(button("Selecionar demonstração","",()=>selectDemo(l.id)));
    stack.append(button("Editar","",()=>editLead(l.id)));
    if(l.paymentStatus==="approved"&&(l.paymentId||l.paymentProvider==="pix")){const project=hubProjects.find(item=>item.leadId===l.id);stack.append(button(project?"Abrir projeto":"Criar projeto","",()=>{if(project)window.location.href="./index.html?project="+encodeURIComponent(project.id);else void createProjectFromLead(l.id)}));if(project){const ready=project.publicUrl&&project.publishStatus==="ready";const pending=project.vercelDeploymentId&&["queued","initializing","building"].includes(project.publishStatus);stack.append(button(ready?"Abrir site publicado":pending?"Verificar publicação":"Publicar site","",()=>{if(ready){window.open(project.publicUrl,"_blank","noopener,noreferrer");return}if(pending){void checkClientSiteStatus(project.id,l.id);return}void publishClientSite(project.id,l.id)}));}}
    if(["Proposta enviada","Aguardando pagamento"].includes(l.stage)&&l.packageKey){
      stack.append(button("Cobrar via Pix","",()=>createPixCharge(l.id)));
      stack.append(button("Gerar link de pagamento","",()=>createPaymentLink(l.id)));
    }
    if(l.paymentProvider==="pix"&&["awaiting_receipt","receipt_submitted"].includes(l.paymentStatus)){
      stack.append(button(l.paymentStatus==="receipt_submitted"?"Conferir Pix recebido":"Confirmar Pix no extrato","",()=>confirmPixReceived(l.id)));
    }
    stack.append(button("Abrir Maps","",()=>openMaps(l)));
    if(l.consent&&l.consentEvidence&&!l.doNotContact&&l.stage!=="Sem interesse"&&normalizedPhone(l.whatsapp)){
      const a=element("a","button","Abrir WhatsApp");a.href="https://wa.me/"+normalizedPhone(l.whatsapp);a.target="_blank";a.rel="noopener noreferrer";a.title="Abre o contato; não envia mensagem automaticamente";stack.append(a);
      if(normalizedPhone(l.whatsapp).length>=12&&normalizedPhone(l.whatsapp).length<=15)stack.append(button("Registrar no agente","",()=>registerLeadWithAgent(l.id)));
      stack.append(button("Iniciar abordagem com IA","",()=>startLeadOutreach(l.id)));
    }
    stack.append(button("Excluir","",()=>deleteLead(l.id)));
    actions.append(stack);tr.append(actions);body.append(tr);
  });
}
function changeStage(id,next){
  const l=leads.find(x=>x.id===id);if(!l)return;
  if(next==="Contato autorizado"&&(!l.consent||!l.consentEvidence)){toast("Registre a autorização e sua evidência antes de marcar contato autorizado.");render();return}
  if(next==="Sem interesse"){l.consent=false;l.doNotContact=true}
  if(next!=="Sem interesse"&&l.doNotContact){toast("Este contato foi marcado para não contatar. Edite apenas se houver nova autorização válida.");render();return}
  l.stage=next;l.updatedAt=new Date().toISOString();persist();render();
}
function resetForm(){
  $("#lead-form").reset();$("#lead-id").value="";$("#form-title").textContent="Adicionar empresa";$("#save-lead").textContent="Salvar empresa";$("#cancel-edit").hidden=true;
}
function editLead(id){
  const l=leads.find(x=>x.id===id);if(!l)return;
  $("#lead-id").value=l.id;$("#lead-name").value=l.name||"";$("#lead-segment").value=l.segment||"";$("#lead-location").value=l.location||"";
  $("#lead-phone").value=l.phone||"";$("#lead-whatsapp").value=l.whatsapp||"";$("#lead-website").value=l.website||"";$("#lead-social").value=l.social||"";$("#lead-source").value=l.source||"";$("#lead-consent-evidence").value=l.consentEvidence||"";
  $("#lead-stage").value=l.stage||"Novo";$("#lead-package").value=l.packageKey||"";$("#lead-notes").value=l.notes||"";$("#lead-consent").checked=Boolean(l.consent);
  $("#form-title").textContent="Editar empresa";$("#save-lead").textContent="Salvar alterações";$("#cancel-edit").hidden=false;
  window.scrollTo({top:0,behavior:"smooth"});
}
function saveLead(e){
  e.preventDefault();
  const id=value("lead-id"),existing=leads.find(x=>x.id===id),stage=value("lead-stage"),consent=$("#lead-consent").checked,consentEvidence=value("lead-consent-evidence");
  if(stage==="Contato autorizado"&&!consent){toast("Marque autorização somente se ela realmente existir.");return}
  if(consent&&!consentEvidence){toast("Registre a data ou referência da autorização antes de marcar o consentimento.");return}
  if(stage==="Sem interesse"&&consent){toast("Contato marcado sem interesse não pode permanecer autorizado.");return}
  if(existing?.doNotContact&&stage!=="Sem interesse"){toast("Este registro está bloqueado por recusa. Não reative automaticamente o contato.");return}
  const data={
    id:id||uid(),name:value("lead-name"),segment:value("lead-segment"),location:value("lead-location"),
    phone:value("lead-phone"),whatsapp:value("lead-whatsapp"),website:value("lead-website"),social:value("lead-social"),
    source:value("lead-source"),stage,packageKey:value("lead-package"),notes:value("lead-notes"),consentEvidence,
    consent:stage==="Sem interesse"?false:consent,doNotContact:stage==="Sem interesse"||Boolean(existing?.doNotContact),
    createdAt:existing?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()
  };
  const websiteLower=String(data.website||"").toLowerCase();if(data.website&&!websiteLower.startsWith("http://")&&!websiteLower.startsWith("https://")){toast("O site deve começar com http:// ou https://.");return}
  if(existing)leads=leads.map(l=>l.id===id?data:l);else leads.unshift(data);
  if(!persist())return;
  resetForm();render();toast(existing?"Empresa atualizada":"Empresa cadastrada");
}
function deleteLead(id){
  const l=leads.find(x=>x.id===id);if(!l||!confirm("Excluir "+l.name+" deste navegador?"))return;
  leads=leads.filter(x=>x.id!==id);if(activeDemoId===id)activeDemoId=null;persist();render();updateDemo();
void refreshPendingPayments();
setInterval(()=>{if(!document.hidden)void refreshPendingPayments()},15000);
document.addEventListener("visibilitychange",()=>{if(!document.hidden)void refreshPendingPayments()});toast("Registro excluído");
}
async function createProjectFromLead(id){
  const lead=leads.find(item=>item.id===id);if(!lead)return;
  if(!["Pago","Site entregue"].includes(lead.stage)){toast("Só crie o projeto após confirmar o pagamento e registrar a etapa Pago.");return}
  if(hubProjects.some(project=>project.leadId===lead.id)){toast("Este cliente já possui um projeto no núcleo.");return}
  if(!sessionStorage.getItem(AGENT_TOKEN_KEY)){toast("Conecte o núcleo central antes de criar o projeto compartilhado.");return}
  if(!confirm("Criar workspace de desenvolvimento para "+lead.name+"? O projeto será registrado como pago manualmente no CRM; isso não substitui uma confirmação automática do provedor de pagamento."))return;
  const project={id:uid(),leadId:lead.id,name:lead.name,segment:lead.segment||"",packageKey:lead.packageKey||"",status:"workspace-created",paymentStatus:"manually-confirmed-by-operator",createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()};
  hubProjects.unshift(project);try{localStorage.setItem(PROJECT_STORE,JSON.stringify(hubProjects))}catch{}
  try{
    const remote=await agentRequest("/api/hub/state");
    const payload={leads:mergeById(leads,remote.leads),projects:mergeById(hubProjects,remote.projects),workspaces:remote.workspaces||{},workspaceUpdatedAt:remote.workspaceUpdatedAt||{}};
    await agentRequest("/api/hub/state",{method:"PUT",body:JSON.stringify(payload)});
    toast("Projeto criado no núcleo. Abrindo workspace…");
    window.location.href="./index.html?project="+encodeURIComponent(project.id);
  }catch(e){hubProjects=hubProjects.filter(item=>item.id!==project.id);try{localStorage.setItem(PROJECT_STORE,JSON.stringify(hubProjects))}catch{}toast("Falha ao criar projeto no núcleo: "+e.message)}
}



async function checkClientSiteStatus(projectId,leadId){
  const project=hubProjects.find(item=>item.id===projectId);const lead=leads.find(item=>item.id===leadId);if(!project||!lead)return;
  try{
    const result=await agentRequest("/api/projects/"+encodeURIComponent(projectId)+"/publish-status");
    project.publicUrl=result.publicUrl||project.publicUrl;project.publishStatus=result.publishStatus;project.publishError=result.error||null;
    if(result.publishStatus==="ready"){lead.websiteUrl=project.publicUrl;if(!lead.doNotContact)lead.stage="Site entregue";lead.updatedAt=new Date().toISOString();persist();render();window.location.assign(project.publicUrl);}
    else if(result.publishStatus==="error"){persist();render();toast("A hospedagem informou falha. Revise os arquivos e tente novamente.");}
    else{persist();render();toast("Publicação ainda em andamento: "+result.publishStatus+". Verifique novamente em alguns segundos.");}
  }catch(e){toast("Não foi possível verificar a publicação: "+e.message)}
}
async function publishClientSite(projectId,leadId){
  const project=hubProjects.find(item=>item.id===projectId);const lead=leads.find(item=>item.id===leadId);if(!project||!lead)return;
  if(lead.paymentStatus!=="approved"||!lead.paymentId){toast("A publicação só é liberada após confirmação real do pagamento.");return}
  if(!confirm("Publicar o site de "+lead.name+" na hospedagem Vercel? Confirme somente se revisou os arquivos no Studio e tem autorização para publicar o conteúdo. A publicação ficará pública."))return;
  try{
    const result=await agentRequest("/api/projects/"+encodeURIComponent(projectId)+"/publish",{method:"POST",body:JSON.stringify({approved:true})});
    project.publicUrl=result.publicUrl;project.vercelDeploymentId=result.deploymentId;project.publishStatus=result.publishStatus;lead.websiteUrl=result.publicUrl;lead.updatedAt=new Date().toISOString();
    if(result.publishStatus==="ready"){project.publishedAt=new Date().toISOString();lead.websitePublishedAt=project.publishedAt;if(!lead.doNotContact)lead.stage="Site entregue";}
    persist();render();
    if(result.publishStatus==="ready"){window.location.assign(result.publicUrl);}
    else toast("Publicação iniciada. Status do provedor: "+result.publishStatus+". Use Verificar publicação em alguns segundos.");
  }catch(e){toast("Não foi possível publicar: "+e.message)}
}

async function createPixCharge(id){
  const lead=leads.find(item=>item.id===id);if(!lead)return;
  if(!["Proposta enviada","Aguardando pagamento"].includes(lead.stage)){toast("Envie e registre a proposta antes de cobrar.");return}
  if(!lead.packageKey){toast("Selecione o pacote antes de gerar a cobrança.");return}
  if(!lead.consent||!lead.consentEvidence||lead.doNotContact||lead.stage==="Sem interesse"){toast("Registre autorização válida de contato antes de enviar a cobrança pelo WhatsApp.");return}
  if(!normalizedPhone(lead.whatsapp)){toast("Cadastre o WhatsApp confirmado com código do país e DDD.");return}
  if(!sessionStorage.getItem(AGENT_TOKEN_KEY)){toast("Conecte o núcleo central para enviar a cobrança Pix.");return}
  if(!confirm("Enviar a chave Pix e solicitar comprovante a "+lead.name+" no WhatsApp? Valor: "+packageLabel(lead.packageKey)+". A cobrança só será enviada se a chave Pix estiver configurada no serviço."))return;
  try{
    const result=await agentRequest("/api/payments/pix-charge",{method:"POST",body:JSON.stringify({leadId:lead.id,approved:true})});
    if(!result.sent)throw Error("O serviço não confirmou o envio da cobrança.");
    lead.stage="Aguardando pagamento";lead.paymentProvider="pix";lead.paymentStatus="awaiting_receipt";lead.paymentAmount=result.amount;lead.paymentCurrency="BRL";lead.updatedAt=new Date().toISOString();
    persist();render();toast("Cobrança Pix enviada. O projeto só será liberado após a confirmação do crédito.");
  }catch(e){toast("Não foi possível cobrar via Pix: "+e.message)}
}
async function confirmPixReceived(id){
  const lead=leads.find(item=>item.id===id);if(!lead)return;
  if(lead.paymentProvider!=="pix"||!["awaiting_receipt","receipt_submitted"].includes(lead.paymentStatus)){toast("Não há cobrança Pix pendente para confirmar.");return}
  const evidence=prompt("Confirme somente depois de conferir o crédito no extrato bancário. Registre a evidência, por exemplo: data, valor e referência da transação.");
  if(evidence===null)return;
  if(evidence.trim().length<5){toast("Informe uma evidência de conferência com pelo menos 5 caracteres.");return}
  if(!confirm("Você verificou o crédito real no extrato e confirmou o valor de "+packageLabel(lead.packageKey)+" para "+lead.name+"? Somente confirme se o dinheiro entrou na conta."))return;
  try{
    const result=await agentRequest("/api/payments/pix-confirm",{method:"POST",body:JSON.stringify({leadId:lead.id,confirmed:true,confirmationEvidence:evidence.trim()})});
    lead.paymentProvider="pix";lead.paymentStatus="approved";lead.paymentConfirmationEvidence=evidence.trim();lead.paymentApprovedAt=new Date().toISOString();lead.paymentReviewRequired=false;lead.paymentReviewReason=null;lead.stage=lead.doNotContact?"Sem interesse":"Pago";lead.projectId=result.projectId;lead.updatedAt=new Date().toISOString();
    persist();render();await syncHubState(true);toast("Pix confirmado e projeto criado no núcleo central.");
  }catch(e){toast("Não foi possível confirmar o Pix: "+e.message)}
}

async function createPaymentLink(id){
  const lead=leads.find(item=>item.id===id);if(!lead)return;
  if(!["Proposta enviada","Aguardando pagamento"].includes(lead.stage)){toast("Envie e registre a proposta antes de cobrar.");return}
  if(!lead.packageKey){toast("Selecione o pacote antes de gerar o link.");return}
  if(!sessionStorage.getItem(AGENT_TOKEN_KEY)){toast("Conecte o núcleo central para gerar o pagamento.");return}
  if(!confirm("Gerar link de pagamento de "+packageLabel(lead.packageKey)+" para "+lead.name+"? O estágio mudará para Aguardando pagamento."))return;
  try{
    const result=await agentRequest("/api/payments/preference",{method:"POST",body:JSON.stringify({leadId:lead.id})});
    if(!result.initPoint)throw Error("O provedor não retornou um link de pagamento.");
    lead.stage="Aguardando pagamento";lead.paymentProvider="mercadopago";lead.paymentPreferenceId=String(result.preferenceId||"");lead.paymentStatus="pending";lead.updatedAt=new Date().toISOString();
    persist();render();window.location.assign(result.initPoint);
    toast("Link de pagamento criado. O CRM será atualizado quando o webhook confirmar o recebimento.");
  }catch(e){toast("Não foi possível gerar o pagamento: "+e.message)}
}

function selectDemo(id){activeDemoId=id;updateDemo()}
function updateDemo(){
  const l=leads.find(x=>x.id===activeDemoId);
  $("#generate-demo").disabled=!l;
  $("#demo-status").textContent=l?"Selecionado: "+l.name+" · pacote "+packageLabel(l.packageKey)+". A demonstração será baixada como HTML local, sem hospedagem.": "Nenhuma empresa selecionada.";
}
function openMaps(l){
  const query=[l.name,l.location,l.segment].filter(Boolean).join(" ");
  window.open("https://www.google.com/maps/search/"+encodeURIComponent(query),"_blank","noopener,noreferrer");
}
function exportCSV(){
  const cols=["name","segment","location","phone","whatsapp","website","social","source","stage","packageKey","consent","consentEvidence","doNotContact","notes","createdAt","updatedAt"];
  const rows=[cols.join(","),...leads.map(l=>cols.map(k=>csvCell(l[k])).join(","))];
  download(new Blob(["\uFEFF"+rows.join("\r\n")],{type:"text/csv;charset=utf-8"}),"vertice-climax-leads.csv");
}
function csvCell(v){return '"'+String(v??"").replace(/"/g,'""')+'"'}
function download(blob,name){const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1500)}
function backup(){download(new Blob([JSON.stringify({version:1,exportedAt:new Date().toISOString(),leads},null,2)],{type:"application/json"}),"vertice-climax-backup.json")}
async function importBackup(e){
  const file=e.target.files?.[0];if(!file)return;
  try{
    const data=JSON.parse(await file.text()),incoming=Array.isArray(data)?data:data.leads;
    if(!Array.isArray(incoming)||incoming.some(l=>!l||typeof l.name!=="string"))throw Error("Formato de backup inválido.");
    if(!confirm("Restaurar "+incoming.length+" registros? Isso substituirá a lista atual."))return;
    leads=incoming.map(l=>({...l,id:typeof l.id==="string"?l.id:uid(),stage:STAGES.includes(l.stage)?l.stage:"Novo",consent:Boolean(l.consent),doNotContact:Boolean(l.doNotContact)}));
    if(!persist())return;activeDemoId=null;resetForm();render();updateDemo();toast("Backup restaurado");
  }catch(err){toast("Falha ao restaurar: "+err.message)}finally{e.target.value=""}
}
function safeHttpUrl(value){const v=String(value||"").trim();const lower=v.toLowerCase();return lower.startsWith("https://")||lower.startsWith("http://")?esc(v):""}
async function agentRequest(path,options={}){
  const raw=($("#agent-service-url").value||"").trim();let base=raw;while(base.endsWith("/"))base=base.slice(0,-1);
  const token=$("#agent-token").value.trim();
  if(!base)throw Error("Informe a URL do serviço WhatsApp.");
  if(!token)throw Error("Informe o token do serviço.");
  const headers={Authorization:"Bearer "+token};
  if(options.body)headers["Content-Type"]="application/json";
  const response=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||data.message||"HTTP "+response.status);
  return data;
}
function queueHubSync(){
  if(!sessionStorage.getItem(AGENT_TOKEN_KEY))return;
  if(syncTimer)clearTimeout(syncTimer);
  if(syncBusy){syncTimer=setTimeout(()=>queueHubSync(),1500);return}
  syncTimer=setTimeout(()=>{void syncHubState(true)},1200);
}
function mergeById(localItems,remoteItems){
  const map=new Map();
  for(const item of [...(Array.isArray(remoteItems)?remoteItems:[]),...(Array.isArray(localItems)?localItems:[])]){
    if(!item||typeof item.id!=="string")continue;
    const previous=map.get(item.id);
    const a=Date.parse(previous?.updatedAt||previous?.createdAt||0)||0;
    const b=Date.parse(item.updatedAt||item.createdAt||0)||0;
    const winner=!previous||b>=a?item:previous;
    const optedOut=Boolean(previous?.doNotContact||item.doNotContact||previous?.stage==="Sem interesse"||item.stage==="Sem interesse");
    map.set(item.id,optedOut?{...winner,doNotContact:true,consent:false,stage:"Sem interesse"}:winner);
  }
  return [...map.values()].sort((a,b)=>(Date.parse(b.updatedAt||b.createdAt||0)||0)-(Date.parse(a.updatedAt||a.createdAt||0)||0));
}
async function syncHubState(silent=false){
  if(syncBusy)return;
  if(!sessionStorage.getItem(AGENT_TOKEN_KEY)){if(!silent)toast("Valide a conexão e informe o token antes de sincronizar.");return}
  syncBusy=true;
  const status=$("#agent-connect-status");
  try{
    if(status)status.textContent="Conectando ao núcleo central e conciliando dados…";
    const remote=await agentRequest("/api/hub/state");
    const mergedLeads=mergeById(leads,remote.leads);
    const changed=JSON.stringify(mergedLeads)!==JSON.stringify(leads);
    leads=mergedLeads;
    try{localStorage.setItem(STORE,JSON.stringify(leads))}catch{}
    hubProjects=mergeById(hubProjects,remote.projects);try{localStorage.setItem(PROJECT_STORE,JSON.stringify(hubProjects))}catch{}
    const payload={leads,projects:hubProjects,workspaces:remote.workspaces&&typeof remote.workspaces==="object"?remote.workspaces:{},workspaceUpdatedAt:remote.workspaceUpdatedAt&&typeof remote.workspaceUpdatedAt==="object"?remote.workspaceUpdatedAt:{}};
    const saved=await agentRequest("/api/hub/state",{method:"PUT",body:JSON.stringify(payload)});
    if(changed)render();
    if(status)status.textContent="Núcleo sincronizado · "+saved.counts.leads+" leads · "+saved.counts.projects+" projetos · "+saved.counts.workspaces+" workspaces · "+new Date(saved.updatedAt).toLocaleTimeString("pt-BR");
    if(!silent)toast("Sincronização central concluída.");
    return saved;
  }catch(e){
    if(status)status.textContent="Sincronização indisponível: "+e.message+" · os dados locais foram preservados.";
    if(!silent)toast("Falha ao sincronizar: "+e.message);
  }finally{syncBusy=false}
}

let pendingRefreshBusy=false;
async function refreshPendingPayments(){
  if(pendingRefreshBusy||!sessionStorage.getItem(AGENT_TOKEN_KEY)||!leads.some(lead=>lead.stage==="Aguardando pagamento"))return;
  pendingRefreshBusy=true;
  try{
    const remote=await agentRequest("/api/hub/state");
    const previous=new Map(leads.map(lead=>[lead.id,lead.stage]));
    const nextLeads=mergeById(leads,remote.leads);
    const nextProjects=mergeById(hubProjects,remote.projects);
    const changedLeads=JSON.stringify(nextLeads)!==JSON.stringify(leads);
    const changedProjects=JSON.stringify(nextProjects)!==JSON.stringify(hubProjects);
    if(changedLeads){
      leads=nextLeads;
      try{localStorage.setItem(STORE,JSON.stringify(leads))}catch{}
    }
    if(changedProjects){
      hubProjects=nextProjects;
      try{localStorage.setItem(PROJECT_STORE,JSON.stringify(hubProjects))}catch{}
    }
    if(changedLeads||changedProjects)render();
    const paid=leads.find(lead=>previous.get(lead.id)==="Aguardando pagamento"&&["Pago","Site entregue"].includes(lead.stage));
    if(paid)toast("Pagamento confirmado pelo provedor para "+paid.name+". O projeto foi preparado no Studio.");
  }catch(e){
    // A indisponibilidade temporária não altera o estágio local nem confirma pagamentos.
  }finally{pendingRefreshBusy=false}
}
async function checkAgentHealth(){
  const status=$("#agent-connect-status");
  try{const d=await agentRequest("/api/status");const wa=d.connected?"WhatsApp conectado. Agente: "+(d.automationEnabled?"ativo":"desativado")+".":"Serviço acessível; WhatsApp ainda não conectado.";const payments=d.paymentIntegrationConfigured?"Mercado Pago configurado.":"Mercado Pago pendente de credenciais no backend.";const persistence=d.whatsappAuthPersistence==="supabase-encrypted"?"Persistência criptografada configurada.":"Sessão apenas local; reinícios podem exigir novo pareamento.";const publishing=d.websitePublishingConfigured?"Publicação Vercel configurada.":"Publicação Vercel pendente de token no backend.";status.textContent=[wa,payments,persistence,publishing].join(" ")}
  catch(e){status.textContent="Conexão não validada: "+e.message}
}
async async function registerLeadWithAgent(id){
  const lead=leads.find(l=>l.id===id);if(!lead)return;
  if(!lead.consent||!lead.consentEvidence||lead.doNotContact||lead.stage==="Sem interesse"){toast("É necessário consentimento registrado e ausência de recusa.");return}
  const digits=normalizedPhone(lead.whatsapp);
  if(digits.length<12||digits.length>15){toast("Informe o WhatsApp confirmado com código do país, DDD e número.");return}
  if(!confirm("Registrar "+lead.name+" no agente local? Ele não enviará a primeira mensagem; poderá responder somente a mensagens recebidas após a ativação do agente."))return;
  try{
    await agentRequest("/api/automation/contacts",{method:"POST",body:JSON.stringify({chatId:digits+"@s.whatsapp.net",name:lead.name,consent:true,consentEvidence:lead.consentEvidence})});
    lead.agentRegisteredAt=new Date().toISOString();persist();render();toast("Contato autorizado registrado no agente.");
  }catch(e){toast("Não foi possível registrar: "+e.message)}
}
async function startLeadOutreach(id){
  const lead=leads.find(item=>item.id===id);if(!lead)return;
  if(!lead.consent||!lead.consentEvidence||lead.doNotContact||lead.stage==="Sem interesse"){toast("Registre autorização comercial válida antes de iniciar a abordagem.");return}
  if(!normalizedPhone(lead.whatsapp)){toast("Cadastre o WhatsApp confirmado do cliente.");return}
  if(!confirm("Enviar a primeira mensagem para "+lead.name+" e ativar as respostas automáticas deste contato? A autorização comercial precisa ser real e registrada."))return;
  try{
    await syncHubState(true);
    const result=await agentRequest("/api/automation/start-outreach",{method:"POST",body:JSON.stringify({leadId:lead.id,approved:true})});
    lead.stage="Em conversa";lead.firstOutreachAt=new Date().toISOString();lead.updatedAt=lead.firstOutreachAt;
    persist();render();toast(result.message||"Abordagem enviada.");
  }catch(e){toast("Não foi possível iniciar a abordagem: "+e.message)}
}
function demoHtml(l){
  const name=esc(l.name),segment=esc(l.segment||"Negócio local"),location=esc(l.location||"Localização a confirmar");
  const packageName=esc(packageLabel(l.packageKey)),website=safeHttpUrl(l.website),social=safeHttpUrl(l.social);
  const phone=normalizedPhone(l.whatsapp),wa=phone&&l.consent&&l.consentEvidence&&!l.doNotContact&&l.stage!=="Sem interesse"?"https://wa.me/"+phone:"";
  const waButton=wa?'<a class="button primary" href="'+wa+'" rel="noopener">Falar pelo WhatsApp</a>':'<p class="note">Configure e confirme o contato antes de publicar os dados de contato.</p>';
  const links=[website?'<a href="'+website+'" rel="noopener">Site atual</a>':"",social?'<a href="'+social+'" rel="noopener">Rede social</a>':""].filter(Boolean).join(" · ");
  return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>'+name+' — Demonstração</title><style>*{box-sizing:border-box}body{margin:0;font-family:Inter,system-ui,sans-serif;background:#0b1118;color:#f0f6fc;line-height:1.6}.wrap{max-width:980px;margin:auto;padding:24px}.tag{color:#7dd3fc;text-transform:uppercase;letter-spacing:.15em;font-size:12px}.hero{padding:clamp(40px,9vw,100px) 0}.hero h1{font-size:clamp(36px,7vw,72px);line-height:1.04;margin:14px 0}.hero p{max-width:620px;color:#aab6c5;font-size:18px}.button{display:inline-block;margin:8px 8px 0 0;padding:12px 18px;border-radius:10px;border:1px solid #334155;color:#f0f6fc;text-decoration:none}.primary{background:#0891b2;border-color:#0891b2;color:#03141a}.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:12px;margin:24px 0}.card{border:1px solid #263445;background:#111a25;border-radius:14px;padding:20px}.note,footer{color:#8b98a8;font-size:12px}footer{border-top:1px solid #263445;padding:20px 0}@media(max-width:520px){.wrap{padding:18px}.hero p{font-size:16px}}</style></head><body><main class="wrap"><section class="hero"><span class="tag">'+segment+' · Demonstração</span><h1>'+name+'</h1><p>Uma apresentação digital para conhecer os serviços, encontrar informações e entrar em contato com o negócio.</p>'+waButton+'</section><section class="cards"><article class="card"><h2>Serviços</h2><p>Inclua aqui os serviços confirmados deste estabelecimento.</p></article><article class="card"><h2>Localização</h2><p>'+location+'</p></article><article class="card"><h2>Presença digital</h2><p>'+(links||"Links oficiais serão adicionados após confirmação.")+'</p></article></section><p class="note">Prévia local não publicada. Conteúdo demonstrativo: revise e substitua os textos genéricos antes de apresentar como versão final.</p><footer>Pacote em avaliação: '+packageName+' · Vértice Climax</footer></main></body></html>';
}
$("#lead-form").addEventListener("submit",saveLead);
$("#cancel-edit").addEventListener("click",resetForm);
$("#lead-search").addEventListener("input",render);
$("#stage-filter").addEventListener("change",render);
$("#export-csv").addEventListener("click",exportCSV);
$("#backup-json").addEventListener("click",backup);
$("#import-json").addEventListener("change",importBackup);
$("#open-maps").addEventListener("click",()=>window.open("https://www.google.com/maps/search/","_blank","noopener,noreferrer"));
$("#generate-demo").addEventListener("click",()=>{
  const l=leads.find(x=>x.id===activeDemoId);if(!l)return;
  const html=demoHtml(l);download(new Blob([html],{type:"text/html;charset=utf-8"}),"demo-"+l.name.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"")+".html");
  toast("Demonstração HTML criada. Ela ainda não está hospedada.");
});
$("#agent-service-url").value=localStorage.getItem(AGENT_URL_KEY)||DEFAULT_AGENT_URL;
$("#agent-token").value=sessionStorage.getItem(AGENT_TOKEN_KEY)||"";
$("#agent-save").addEventListener("click",async()=>{
  const urlRaw=$("#agent-service-url").value.trim();let url=urlRaw;while(url.endsWith("/"))url=url.slice(0,-1);const token=$("#agent-token").value.trim();
  if(!url||!token){$("#agent-connect-status").textContent="Informe a URL e o token.";return}
  localStorage.setItem(AGENT_URL_KEY,url);sessionStorage.setItem(AGENT_TOKEN_KEY,token);
  await checkAgentHealth();await syncHubState(true);
});
$("#hub-sync").addEventListener("click",()=>syncHubState(false));
render();updateDemo();
const paymentReturn=new URLSearchParams(location.search).get("payment");
if(paymentReturn==="success")toast("Checkout retornou com sucesso, mas o CRM só marcará Pago após a confirmação oficial do webhook.");
else if(paymentReturn==="pending")toast("Pagamento pendente. O CRM será atualizado quando o provedor confirmar.");
else if(paymentReturn==="failure")toast("O checkout informou que o pagamento não foi concluído. Você pode gerar um novo link.");
})();