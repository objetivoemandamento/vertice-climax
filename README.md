# Vértice Climax

Ambiente de programação e automação comercial em português brasileiro. O frontend inclui editor de arquivos, pré-visualização HTML, exportação ZIP, painel comercial local (`business.html`) e painel para conexão do WhatsApp Web.

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
