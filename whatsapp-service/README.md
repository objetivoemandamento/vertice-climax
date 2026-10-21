# Serviço WhatsApp Web

Serviço Node.js persistente separado do frontend, usando Baileys (biblioteca comunitária não oficial).

## Rodar localmente
1. Node.js 20+.
2. Nesta pasta, execute npm install.
3. Copie .env.example para .env e configure VERTICE_SERVICE_TOKEN com segredo aleatório forte e FRONTEND_ORIGIN com o domínio do frontend.
4. Execute npm start.
5. No frontend, abra WhatsApp Web, informe URL e token, clique Obter QR Code e escaneie em WhatsApp → Dispositivos conectados.

## Hospedagem
Use serviço Node.js persistente com disco para data/auth. Não use função serverless para manter a sessão ativa. Configure HTTPS, token forte, CORS restrito e proteja a sessão. Nunca publique .env ou data/auth.

## Endpoints autenticados
Todas as rotas /api exigem Authorization: Bearer VERTICE_SERVICE_TOKEN: GET /api/status, GET /api/qr, GET /api/chats, GET /api/messages?chatId=..., POST /api/send com JSON contendo chatId, text e approved:true. /health é público.

A lista e mensagens são cache de eventos recebidos, não histórico completo garantido. Envio exige aprovação explícita no frontend e backend. Não use para spam ou mensagens em massa; automação não oficial pode gerar restrições.