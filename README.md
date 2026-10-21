# Vértice Climax

Assistente de programação em HTML/CSS/JavaScript puro com geração por OpenAI, árvore de arquivos, preview sandbox, exportação ZIP e painel de conexão WhatsApp Web.

## Deploy frontend
Publique a raiz na Vercel como site estático. Se upload de pasta não estiver disponível, importe o repositório ou use a CLI.

## OpenAI
Abra Configurações e informe sua chave. Ela fica no localStorage e é enviada diretamente à API OpenAI. Para uso público multiusuário, prefira backend com autenticação e limites de uso.

## WhatsApp Web
O painel está em whatsapp.html. O serviço persistente fica em whatsapp-service/ e deve ser publicado separadamente num serviço Node.js com disco persistente. Leia whatsapp-service/README.md.

Baileys é uma biblioteca comunitária não oficial. Pode haver desconexão ou restrição de conta. O cache não garante recuperação de conversas antigas. Não use para spam ou mensagens em massa.