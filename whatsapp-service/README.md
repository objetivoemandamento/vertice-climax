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

## Pagamentos automáticos (Mercado Pago)

O fluxo de pagamentos está implementado, mas permanece desativado até configurar no serviço backend as variáveis secretas `MERCADOPAGO_ACCESS_TOKEN` e `MERCADOPAGO_WEBHOOK_SECRET` (não coloque esses valores no frontend ou no Git). Configure `PUBLIC_SERVICE_URL` com a URL pública HTTPS real do conector. No painel do Mercado Pago, cadastre `https://SEU-SERVICO/webhooks/mercadopago` como URL de notificações de pagamentos e use o segredo de assinatura do webhook.

No CRM, registre a etapa **Proposta enviada**, escolha um pacote e use **Gerar link de pagamento**. O backend cria uma preferência no Checkout Pro. O webhook valida a assinatura, consulta o pagamento diretamente à API do Mercado Pago e só marca **Pago** quando a referência do lead, o pacote, a moeda BRL e o valor esperado coincidem. Eventos repetidos são idempotentes; divergências ficam para revisão e não liberam o projeto. O retorno do navegador à página de sucesso não confirma pagamento por si só.

Preços configurados atualmente: Básico (chave `Basico`) R$ 300; Médio (`Medio`) R$ 700; Avançado (`Avancado`) R$ 2.000. Altere a tabela de pacotes no CRM e no backend em conjunto se os preços mudarem.


Após uma confirmação de pagamento aprovada e validada, o backend cria automaticamente o projeto e um rascunho inicial de workspace vinculado ao lead. O rascunho é salvo no núcleo persistente e começa com `noindex,nofollow`; não é uma publicação pública. O cliente/proprietário ainda precisa revisar os textos, completar os dados reais e integrar um provedor de hospedagem antes de divulgar o site.
