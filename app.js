(()=>{"use strict";
const $=s=>document.querySelector(s),KEY="vertice_climax_openai_key",HUB_URL="vertice_wa_service_url",HUB_TOKEN="vertice_wa_service_token",PROJECT_ID=(new URLSearchParams(location.search).get("project")||"").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,120),HUB_WORKSPACE_KEY=PROJECT_ID?"project:"+PROJECT_ID:"studio",STORE=PROJECT_ID?"vertice_climax_workspace_project_"+PROJECT_ID:"vertice_climax_workspace_v2",WORKSPACE_REV="vertice_climax_workspace_updated_at_"+HUB_WORKSPACE_KEY;
const starter={"index.html":'<!doctype html>\n<html lang="pt-BR">\n<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Meu projeto</title></head>\n<body><main><h1>Sua próxima ideia começa aqui.</h1><p>Descreva o que deseja criar no Vértice Climax.</p></main></body>\n</html>',"style.css":"body{margin:0;font-family:Inter,system-ui,sans-serif;color:#18202a;padding:2rem}main{max-width:900px;margin:10vh auto}h1{font-size:clamp(2rem,6vw,4rem)}","app.js":"// Escreva aqui a lógica do projeto."};
let files=loadWorkspace(),selected=Object.keys(files)[0]||"index.html",previewUrl=null,busy=false,editor=null,hubTimer=null,hubBusy=false;
const system="Você é Vértice Climax, um agente de engenharia de software inspirado em assistentes de programação. Trabalhe incrementalmente e preserve arquivos existentes quando possível. Responda SOMENTE com JSON válido, sem markdown, neste formato: {\"mensagem\":\"resumo em português brasileiro\",\"arquivos\":{\"caminho/arquivo.ext\":\"conteúdo COMPLETO do arquivo alterado\"},\"acao\":\"criar|editar|responder\"}. Se apenas responder, use arquivos:{} e acao:responder. Para cada arquivo alterado, forneça o conteúdo integral. Nunca inclua chaves, senhas, tokens ou segredos nos arquivos. Valide sintaxe, caminhos, importações, responsividade, acessibilidade e segurança. Não use eval nem Function para executar código gerado. Prefira HTML/CSS/JS puros salvo pedido por framework. Para mapas, use Leaflet + OpenStreetMap via CDN, zoom, marcadores, popups e busca Nominatim com aviso de uso responsável; não invente credenciais. Para links WhatsApp use https://wa.me/NUMERO?text=MENSAGEM somente quando o usuário fornecer o número; nunca invente telefone. Se pedirem revisão/correção, examine todos os arquivos atuais e faça alterações concretas. Retorne JSON válido sempre.";
function loadWorkspace(){try{const x=JSON.parse(localStorage.getItem(STORE)||"null");if(x&&typeof x==="object"&&!Array.isArray(x)&&Object.keys(x).length)return x}catch(e){}return {...starter}}
function persist(sync=true){try{localStorage.setItem(STORE,JSON.stringify(files));localStorage.setItem(WORKSPACE_REV,new Date().toISOString());$("#save-state").textContent="Salvo localmente · "+new Date().toLocaleTimeString("pt-BR");if(sync)queueWorkspaceSync()}catch(e){$("#save-state").textContent="Armazenamento local cheio; exporte o ZIP."}}
function hubBase(){let value=($("#hub-url-input")?.value||localStorage.getItem(HUB_URL)||"").trim();while(value.endsWith("/"))value=value.slice(0,-1);return value}
function hubToken(){return ($("#hub-token-input")?.value||sessionStorage.getItem(HUB_TOKEN)||"").trim()}
async function hubRequest(path,options={}){
  const base=hubBase(),token=hubToken();
  if(!base||!token)throw Error("Configure a URL e o token do núcleo nas Configurações.");
  const headers={Authorization:"Bearer "+token};
  if(options.body)headers["Content-Type"]="application/json";
  const response=await fetch(base+path,{...options,headers:{...headers,...(options.headers||{})}});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Error(data.error||data.message||"HTTP "+response.status);
  return data;
}
function queueWorkspaceSync(){
  if(!sessionStorage.getItem(HUB_TOKEN))return;
  if(hubTimer)clearTimeout(hubTimer);
  if(hubBusy){hubTimer=setTimeout(()=>queueWorkspaceSync(),1800);return}
  hubTimer=setTimeout(()=>{void syncWorkspaceWithHub(true)},1800);
}
async function syncWorkspaceWithHub(silent=false){
  if(hubBusy)return;
  const token=hubToken(),base=hubBase();
  if(!token||!base){if(!silent)toast("Configure o núcleo Vértice antes de sincronizar.");return}
  hubBusy=true;
  const status=$("#hub-sync-status");
  try{
    if(status)status.textContent="Sincronizando arquivos com o núcleo…";
    const remote=await hubRequest("/api/hub/state");
    if(PROJECT_ID){const project=(remote.projects||[]).find(item=>item.id===PROJECT_ID);if(project){document.title=project.name+" — Vértice Climax";const heading=document.querySelector(".hero h1");if(heading)heading.textContent="Projeto · "+project.name;const intro=document.querySelector(".hero p");if(intro)intro.textContent="Workspace vinculado ao CRM. Edite os arquivos, valide a prévia e sincronize as alterações com o núcleo Vértice."}}
    const remoteFiles=remote.workspaces?.[HUB_WORKSPACE_KEY];
    const localRev=Date.parse(localStorage.getItem(WORKSPACE_REV)||"1970-01-01T00:00:00Z")||0;
    const remoteRev=Date.parse(remote.workspaceUpdatedAt?.[HUB_WORKSPACE_KEY]||"1970-01-01T00:00:00Z")||0;
    if(remoteFiles&&Object.keys(remoteFiles).length&&remoteRev>localRev){
      files=remoteFiles;selected=Object.keys(files)[0]||"index.html";
      localStorage.setItem(STORE,JSON.stringify(files));localStorage.setItem(WORKSPACE_REV,remote.workspaceUpdatedAt[HUB_WORKSPACE_KEY]);
      tree();showFile();preview();
    }
    const workspaces={...(remote.workspaces||{}),[HUB_WORKSPACE_KEY]:files};
    const workspaceUpdatedAt={...(remote.workspaceUpdatedAt||{}),[HUB_WORKSPACE_KEY]:localStorage.getItem(WORKSPACE_REV)||new Date().toISOString()};
    const projects=(remote.projects||[]).map(project=>PROJECT_ID&&project.id===PROJECT_ID?{...project,status:"in-development",updatedAt:new Date().toISOString()}:project);
    const result=await hubRequest("/api/hub/state",{method:"PUT",body:JSON.stringify({leads:remote.leads||[],projects,workspaces,workspaceUpdatedAt})});
    if(status)status.textContent=(PROJECT_ID?"Projeto "+PROJECT_ID:"Workspace principal")+" sincronizado · "+Object.keys(files).length+" arquivos · núcleo atualizado "+new Date(result.updatedAt).toLocaleTimeString("pt-BR");
    if(!silent)toast("Workspace sincronizado com o núcleo Vértice.");
    return result;
  }catch(e){
    if(status)status.textContent="Núcleo indisponível: "+e.message+" · os arquivos locais foram preservados.";
    if(!silent)toast("Falha na sincronização: "+e.message);
  }finally{hubBusy=false}
}
function toast(s){const e=$("#toast");e.textContent=s;e.classList.add("show");setTimeout(()=>e.classList.remove("show"),2600)}
function tree(){const t=$("#file-tree");t.replaceChildren();Object.keys(files).sort().forEach(n=>{const b=document.createElement("button");b.className="file"+(n===selected?" active":"");b.textContent="▤  "+n;b.onclick=()=>{saveEditor(false);selected=n;tree();showFile()};t.append(b)});$("#file-count").textContent=Object.keys(files).length}
function showFile(){const e=$("#file-editor"),value=files[selected]??"";if(editor){editor.setValue(value);editor.setOption("mode",editorMode(selected))}else e.value=value;$("#preview-file-label").textContent=selected+" · prévia";e.dataset.original=value}
function saveEditor(notify=true){const e=$("#file-editor");if(!e||!selected)return;files[selected]=editor?editor.getValue():e.value;persist();if(notify)toast("Arquivo salvo")}
function preview(){saveEditor(false);let h=files["index.html"]||"<h1>Crie um index.html</h1>",css=files["style.css"]||"",js=files["app.js"]||"";h=h.replace(/<link\b[^>]*href=["'][^"']*style\.css[^"']*["'][^>]*>/gi,"");h=h.replace(/<script\b[^>]*src=["'][^"']*app\.js[^"']*["'][^>]*>\s*<\/script>/gi,"");if(css){if(/<\/head>/i.test(h))h=h.replace(/<\/head>/i,"<style>\n"+css.replace(/<\/style/gi,"<\\/style")+"\n</style></head>");else h="<style>"+css+"</style>"+h}if(js){const safeJs=js.replace(/<\/script/gi,"<\\/script");h=h.replace(/<\/body>/i,"<script>\n"+safeJs+"\n</scr"+"ipt></body>")}$("#preview-frame").srcdoc=h;if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(new Blob([h],{type:"text/html"}))}
function add(role,msg){const d=document.createElement("div");d.className="msg";const b=document.createElement("b");b.textContent=role==="user"?"Você":"Vértice Climax";const p=document.createElement("p");p.textContent=msg;d.append(b,p);$("#chat-messages").append(d);$("#chat-messages").scrollTop=$("#chat-messages").scrollHeight}
function editorMode(name){const ext=(name.split(".").pop()||"").toLowerCase();return ({html:"htmlmixed",htm:"htmlmixed",xml:"xml",css:"css",js:"javascript",mjs:"javascript",cjs:"javascript",json:{name:"javascript",json:true},md:"text/plain",py:"text/plain",yml:"text/plain",yaml:"text/plain"})[ext]||"text/plain"}
function validPath(n){return typeof n==="string"&&n.trim()&&!n.startsWith("/")&&!n.split("/").includes("..")&&!n.split("/").some(p=>p.startsWith(".env"))&&n.length<180}
function parseJSON(raw){raw=raw.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,"").replace(/\s*\x60\x60\x60$/,"");try{return JSON.parse(raw)}catch(e){const a=raw.indexOf("{"),b=raw.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(raw.slice(a,b+1));throw Error("A IA retornou JSON inválido.")}}
async function run(prompt){const key=localStorage.getItem(KEY);if(!key){toast("Adicione sua chave OpenAI em Configurações.");$("#settings-modal").classList.remove("hidden");return}if(busy)return;busy=true;add("user",prompt);$("#send-button").disabled=true;$("#api-status").textContent="IA trabalhando…";
try{const current=Object.entries(files).map(([n,c])=>"--- FILE: "+n+" ---\n"+c).join("\n\n");const payload={model:$("#model-select").value,temperature:.15,messages:[{role:"system",content:system},{role:"user",content:"PEDIDO DO USUÁRIO:\n"+prompt+"\n\nARQUIVOS ATUAIS:\n"+current+"\n\nRetorne somente o JSON especificado. Para cada arquivo alterado, envie o arquivo inteiro."}]};let data,res,raw;
for(let attempt=0;attempt<2;attempt++){const r=await fetch("https://api.openai.com/v1/chat/completions",{method:"POST",headers:{"Content-Type":"application/json","Authorization":"Bearer "+key},body:JSON.stringify(payload)});data=await r.json().catch(()=>({}));if(!r.ok)throw Error(data.error?.message||"Falha HTTP "+r.status+" na API OpenAI.");raw=(data.choices?.[0]?.message?.content||"").trim();try{res=parseJSON(raw);break}catch(e){if(attempt)throw e;payload.messages.push({role:"assistant",content:raw},{role:"user",content:"Corrija a resposta anterior: JSON válido sem markdown, campos mensagem (string), arquivos (objeto com conteúdo completo) e acao (criar, editar ou responder). Retorne somente JSON."})}}
if(!res||typeof res.mensagem!=="string"||!res.arquivos||typeof res.arquivos!=="object"||!["criar","editar","responder"].includes(res.acao))throw Error("Formato de resposta inválido; tente um pedido mais específico.");
const changed=[];for(const [name,content] of Object.entries(res.arquivos)){const n=name.replace(/^\.\//,"").trim();if(!validPath(n)||typeof content!=="string")continue;files[n]=content;changed.push(n)}
if(changed.length){selected=changed[0];persist();tree();showFile();preview();add("assistant",res.mensagem+"\n\nArquivos atualizados: "+changed.join(", "))}else add("assistant",res.mensagem);
}catch(e){add("assistant","Não foi possível concluir: "+e.message+"\nVerifique a chave, o saldo/limites da API e tente novamente.")}finally{busy=false;$("#send-button").disabled=false;$("#api-status").textContent=localStorage.getItem(KEY)?"API configurada neste navegador":"Configure a chave OpenAI"}}
$("#prompt-form").addEventListener("submit",e=>{e.preventDefault();const p=$("#prompt-input").value.trim();if(p){$("#prompt-input").value="";run(p)}});
document.querySelectorAll(".suggestion").forEach(b=>b.addEventListener("click",()=>{$("#prompt-input").value=b.textContent.trim();$("#prompt-input").focus()}));
$("#settings-open").onclick=()=>{$("#api-key-input").value=localStorage.getItem(KEY)||"";$("#hub-url-input").value=localStorage.getItem(HUB_URL)||"https://vertice-climax-whatsapp.onrender.com";$("#hub-token-input").value=sessionStorage.getItem(HUB_TOKEN)||"";$("#settings-modal").classList.remove("hidden")};$("#settings-close").onclick=()=>$("#settings-modal").classList.add("hidden");$("#settings-save").onclick=()=>{const k=$("#api-key-input").value.trim(),url=$("#hub-url-input").value.trim(),token=$("#hub-token-input").value.trim();if(k)localStorage.setItem(KEY,k);else localStorage.removeItem(KEY);if(url)localStorage.setItem(HUB_URL,url);else localStorage.removeItem(HUB_URL);if(token)sessionStorage.setItem(HUB_TOKEN,token);else sessionStorage.removeItem(HUB_TOKEN);$("#api-status").textContent=k?"API configurada neste navegador":"Configure a chave OpenAI";$("#settings-modal").classList.add("hidden");toast("Configurações salvas");if(token&&url)void syncWorkspaceWithHub(true)};$("#hub-sync-studio").onclick=()=>syncWorkspaceWithHub(false);
$("#new-file").onclick=()=>{const n=prompt("Nome do arquivo (ex.: pages/home.html):");if(!n)return;const p=n.trim().replace(/^\.\//,"");if(!validPath(p))return toast("Caminho inválido.");if(Object.hasOwn(files,p))return toast("Este arquivo já existe.");files[p]="";selected=p;persist();tree();showFile()};
$("#delete-file").onclick=()=>{if(Object.keys(files).length<2)return toast("Mantenha pelo menos um arquivo.");if(!confirm("Excluir "+selected+"?"))return;delete files[selected];selected=Object.keys(files)[0];persist();tree();showFile();preview()};
$("#save-file").onclick=()=>{saveEditor();tree();preview()};
$("#refresh-preview").onclick=preview;$("#open-preview").onclick=()=>{preview();if(previewUrl)window.open(previewUrl,"_blank","noopener,noreferrer")};document.querySelectorAll("[data-device]").forEach(b=>b.onclick=()=>{$("#preview-frame").style.width=b.dataset.device;document.querySelectorAll("[data-device]").forEach(x=>x.classList.toggle("active",x===b))});
$("#download-project").onclick=async()=>{saveEditor(false);if(!window.JSZip)return toast("Não foi possível carregar JSZip; verifique a conexão.");try{const z=new JSZip();Object.entries(files).forEach(([n,c])=>z.file(n,c));z.file("README.md","# Projeto criado com Vértice Climax\n\nEdite os arquivos e publique-os no seu provedor.\n");const blob=await z.generateAsync({type:"blob"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="vertice-climax-projeto.zip";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);toast("ZIP gerado")}catch(e){toast("Falha ao exportar: "+e.message)}};
$("#clear-workspace").onclick=()=>{if(!confirm("Apagar os arquivos salvos neste navegador?"))return;files={...starter};selected="index.html";persist();tree();showFile();preview();$("#settings-modal").classList.add("hidden");toast("Workspace reiniciado")};
if(window.CodeMirror){editor=window.CodeMirror.fromTextArea($("#file-editor"),{lineNumbers:true,mode:editorMode(selected),theme:"material-darker",lineWrapping:false,tabSize:2,indentUnit:2,viewportMargin:20});editor.setSize("100%","320px");editor.addKeyMap({"Ctrl-S":()=>{saveEditor();preview()},"Cmd-S":()=>{saveEditor();preview()}})}
tree();showFile();preview();$("#api-status").textContent=localStorage.getItem(KEY)?"API configurada neste navegador":"Configure a chave OpenAI";if(sessionStorage.getItem(HUB_TOKEN))void syncWorkspaceWithHub(true);
})();