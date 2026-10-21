# Vértice Climax

Assistente de programação com interface em português brasileiro, editor local de arquivos, árvore de projeto, prévia isolada responsiva, geração de código via OpenAI e exportação ZIP.

## Recursos implementados no repositório

- Interface responsiva com tema escuro.
- Chat de programação com seleção de modelo OpenAI.
- Geração e atualização incremental de arquivos com resposta JSON estruturada e uma tentativa de correção quando o JSON vem inválido.
- Editor manual, criação/exclusão de arquivos, salvamento do workspace no navegador e prévia HTML.
- Exportação do workspace atual em ZIP.
- Instruções para mapas Leaflet/OpenStreetMap e CTAs WhatsApp no prompt de sistema.
- Página de conector WhatsApp Web com QR Code, leitura do cache de conversas/mensagens e envio com aprovação explícita.
- Serviço Node.js separado para manter a sessão do WhatsApp fora de funções serverless.

## Abrir localmente

Abra index.html num navegador ou sirva a raiz com um servidor estático. Para gerar código com IA, abra Configurações e informe uma chave de API válida. A chave é armazenada no localStorage deste navegador e as chamadas são feitas diretamente para a API OpenAI; isso é adequado apenas para teste pessoal, não para um serviço público multiusuário.

## Publicar frontend

Importe este repositório no Vercel ou Render como site estático, com a raiz do repositório como diretório publicado. Não há etapa de build.

## Publicar WhatsApp

Leia whatsapp-service/README.md. O serviço requer Node.js 20+, um token forte configurado como variável de ambiente e armazenamento persistente para whatsapp-service/data/auth. Configure FRONTEND_ORIGIN para o domínio real do frontend. Depois do deploy, abra whatsapp.html, informe a URL HTTPS do serviço e o mesmo token, salve e solicite o QR Code.

## Limitações importantes

- O código foi enviado ao GitHub, mas só está efetivamente publicado quando um deploy termina com sucesso.
- A geração de código exige uma chave OpenAI válida e acesso à API; ChatGPT Plus/Go não substitui uma chave de API.
- A prévia executa o HTML no iframe sandbox e não equivale a um ambiente completo de build para frameworks.
- O serviço WhatsApp usa Baileys, biblioteca comunitária não oficial. O cache não garante histórico completo de conversas antigas e a conexão pode ser desconectada ou restringida pelo WhatsApp. Use apenas contas e mensagens autorizadas; não faça spam.
- Para público externo, implemente autenticação, limites de uso, backend seguro para IA e isolamento por usuário antes de divulgar amplamente.
