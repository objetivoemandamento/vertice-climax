# Vértice Climax

Ambiente de programação e automação comercial em português brasileiro. O frontend inclui editor de arquivos, pré-visualização HTML, exportação ZIP, painel comercial local (`business.html`) e painel para conexão do WhatsApp Web.

## Núcleo unificado

O serviço autenticado expõe `GET /api/hub/state` e `PUT /api/hub/state`, compartilhando leads do CRM, metadados de projetos e workspaces do Studio em um único estado persistido no diretório de dados do conector. O CRM concilia registros por ID e data de atualização, mantendo uma cópia local como fallback. O Studio sincroniza seu workspace principal ou um workspace dedicado por projeto criado a partir de um lead marcado como pago.

### Fluxo integrado

1. Cadastre a empresa no Painel Comercial e mantenha a evidência de autorização separada do estado da negociação.
2. Valide a URL e o token do núcleo e use **Sincronizar sistema inteiro** para enviar/conciliar os leads.
3. Conecte o WhatsApp por QR Code; o agente fica desligado até ser habilitado e só responde a contatos individuais registrados com autorização.
4. Com o webhook do Mercado Pago configurado, o sistema confirma o pagamento por consulta à API e cria automaticamente o projeto e um rascunho de workspace no Studio. A publicação pública continua bloqueada até revisão do conteúdo e configuração do provedor de hospedagem.
5. Edite os arquivos e sincronize o workspace com o núcleo. A prévia e o ZIP são locais; publicar um site em produção continua sendo uma etapa separada.

A sincronização de dados e workspaces está implementada, mas a confirmação de pagamento por webhook não está configurada: sem credenciais de um provedor e um endpoint de webhook, o estado **Pago** continua sendo uma confirmação manual do operador. O webhook e a criação automática do workspace estão implementados, mas a publicação pública automática de sites e a hospedagem de cada cliente ainda não estão implementadas. As credenciais de sessão do WhatsApp agora são criptografadas no backend e sincronizadas com a tabela dedicada do Supabase quando há pareamento; o primeiro QR e um teste real de reinicialização ainda precisam ser validados. O cache de conversas e mensagens continua em arquivos locais e pode ser perdido em reinicializações no plano gratuito.

## Executar localmente no Windows

Para manter a sessão do WhatsApp e o cache em disco local sem contratar hospedagem, instale Node.js 20+ e execute `run-local.bat). Ele abre o servidor estático local e o conector, gera um token forte no arquivo ignorado pelo Git `whatsapp-service/.env` e abre o painel comercial.

No painel WhatsApp, use `http://127.0.0.1:8787`; o token está na linha `VERTICE_SERVICE_TOKEN` de `whatsapp-service/.env`. Escaneie o QR Code com o celular. Mantenha as duas janelas abertas enquanto utilizar a automação.

A sessão e o cache serão salvos em `whatsapp-service/data`. Não compartilhe essa pasta nem o arquivo `.env`. A primeira instalação exige conexão à internet para baixar dependências do Node.js. A execução local evita a limitação de disco efêmero do plano gratuito do Render, mas o computador precisa permanecer ligado e conectado.

## WhatsApp Web

O conector usa Baileys, uma biblioteca comunitária não oficial. A autenticação é feita com QR Code do WhatsApp Web; não exige a API oficial do WhatsApp, mas depende da compatibilidade contínua com o protocolo e pode sofrer desconexões ou restrições.

### Executar localmente

Requisitos: Node.js 20+.

```bash
cd whatsapp-service
npm install
cp .env.example .env
``

Edite `.env` e configure:
- `VERTICE_SERVICE_TOKEN`: segredo aleatório forte, com pelo menos 24 caracteres.
- `FRONTEND_ORIGIN`: origem exata do frontend, por exemplo `http://localhost:8080`.
- `DATA_DIR`: diretório persistente e gravável para credenciais e cache; por padrão, `whatsapp-service/data`.
- `MESSAGE_CACHE_LIMIT`: limite de mensagens armazenadas por conversa.
- `CHAT_CACHE_LIMIT`: limite de conversas armazenadas.

Inicie o serviço:

```bash
npm start
```

Abra `whatsapp.html`, informe a URL HTTPS ou local do serviço e o mesmo token. Clique em “Obter QR Code” e escaneie com WhatsApp → Dispositivos conectados → Conectar dispositivo.

### Persistência e hospedagem

O serviço salva as credenciais da sessão em `DATA_DIR/auth` e o cache de conversas/mensagens em `DATA_DIR/store.json`, usando escrita temporária e renomeação para reduzir o risco de corrupção. Configure um disco persistente no provedor de hospedagem e defina `DATA_DIR` para o caminho montado. Em hospedagem gratuita sem disco persistente, uma nova implantação pode apagar a sessão e exigir novo pareamento.

Não exponha a pasta de dados, o arquivo `.env` ou o token. Faça backups protegidos se precisar preservar a sessão. O cache é limitado e não representa garantia de histórico completo de conversas antigas.

### Agente local de respostas

Na página `whatsapp.html`, o agente local fica desativado por padrão. Para usá-lo, conecte a sessão por QR Code, selecione uma conversa individual, registre a evidência de autorização e habilite o contato. Também é possível registrar um lead autorizado a partir de `business.html`, desde que o WhatsApp esteja no formato internacional completo. Depois, ative o agente.

O agente usa regras locais, não um modelo de linguagem. Ele não inicia conversas nem dispara listas; responde apenas a mensagens recebidas de contatos autorizados. Recusas desativam o contato. Perguntas sobre a origem dos dados, pedidos de demonstração, sinais de compra e mensagens que não correspondem com segurança a uma regra ficam para revisão humana. Isso evita inventar respostas ou prometer entregas que ainda não foram feitas.

Os testes determinísticos do classificador podem ser executados com `npm test` dentro de `whatsapp-service`.

### Verificação rápida do conector

Com o serviço local rodando, em outro terminal execute:

```powershell
cd whatsapp-service
npm run smoke
```

O teste verifica o endpoint de saúde e se as rotas privadas rejeitam chamadas sem token. Para testar também a autenticação válida, defina `VERTICE_SERVICE_TOKEN` no ambiente do terminal com o mesmo valor do arquivo `.env` antes de executar. O smoke test não envia mensagens nem valida um pareamento real; isso exige escanear o QR Code com o proprietário.

### Endpoints

Todas as rotas em `/api` exigem `Authorization: Bearer VERTICE_SERVICE_TOKEN`.

- `GET /health`: saúde básica do serviço.
- `GET /api/status`: estado da conexão.
- `GET /api/qr`: QR Code atual, quando disponível.
- `GET /api/chats`: conversas presentes no cache.
- `GET /api/messages?chatId=...`: mensagens armazenadas para uma conversa.
- `POST /api/send`: envio individual com `chatId`, `text` e `approved: true`.

O envio possui validação, limite de taxa e aprovação explícita. Não é um mecanismo de disparo em massa. Utilize apenas para conversas autorizadas, respeite recusas e políticas aplicáveis. A automação não oficial pode gerar restrições à conta.

## Painel comercial local\n\nAbra `business.html` para cadastrar empresas, manter etapas comerciais, registrar autorização de contato, consultar os pacotes Básico (R$ 300), Médio (R$ 700) e Avançado (R$ 2.000), exportar CSV, criar backups JSON e gerar uma demonstração HTML local. Os registros ficam no `localStorage` do navegador; exporte backups para evitar perda de dados. A demonstração HTML não é hospedagem pública e não deve ser apresentada como site publicado. A pesquisa do Google Maps é aberta no navegador para consulta; a coleta automática em escala ainda não está implementada.\n\n## Studio de programação

O editor web permite criar e editar arquivos no navegador, pré-visualizar HTML/CSS/JavaScript e exportar o workspace em ZIP. O workspace fica no armazenamento local do navegador; exporte backups para não perder os arquivos.

A versão atual do Studio ainda possui geração de código via API OpenAI no frontend. Isso requer chave de API e não é equivalente a um modelo local. Não publique o frontend para uso multiusuário com segredos no navegador. A remoção dessa dependência exige substituir a geração por regras/templates locais ou integrar um modelo executado localmente.

## Limitações importantes

- Um QR Code real só aparece quando o conector recebe um QR da sessão.
- O serviço precisa permanecer ativo para receber mensagens em tempo real.
- Sem armazenamento persistente no servidor, credenciais e cache podem ser perdidos em novas implantações.
- O cache de mensagens inclui eventos recebidos durante a execução e não garante sincronização de todo o histórico antigo.
- A conexão Baileys não é uma integração oficial da Meta.
- O envio de mensagens deve respeitar consentimento, privacidade e políticas da plataforma.
