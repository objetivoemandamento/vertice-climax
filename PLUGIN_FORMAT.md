# Formato de plugin Vértice

Um plugin é um ZIP de até 20 MB com até 100 arquivos. Inclua um `manifest.json` (ou `plugin.json`) e, opcionalmente, `instructions.md`, `README.md` e referências em `.md`, `.txt`, `.json` ou `.yaml`. O manifesto pode estar na raiz ou dentro de uma pasta do repositório.

Exemplo mínimo:

```json
{
  "id": "meu-plugin",
  "name": "Meu plugin",
  "version": "1.0.0",
  "description": "Orientações para um domínio.",
  "tools": []
}
```

O núcleo valida o identificador, limita tamanho/quantidade, ignora arquivos executáveis e injeta instruções e referências no contexto do modelo. Os arquivos ficam no armazenamento local deste navegador.

## Ferramentas declarativas

Cada item de `tools` define `name`, `description`, `parameters` (JSON Schema de objeto) e uma ação suportada. A versão inicial aceita:

- `search_plugin`: pesquisa nos arquivos de referência do próprio plugin. Schema recomendado: `{"type":"object","properties":{"query":{"type":"string"}},"required":["query"],"additionalProperties":false}`.
- `save_note`: salva uma nota no armazenamento local. Campos: `title` e `content`.
- `download_text`: gera um arquivo de texto para download. Campos: `filename` e `content`.
- `set_language`: altera o idioma para um de `pt-BR`, `en-US`, `zh-CN`, `es-ES` ou `hi-IN`.

Ações fora dessa lista são ignoradas. Plugins não podem instalar dependências, executar scripts, acessar APIs locais nem controlar o navegador. Para implementar uma nova ação, ela precisa de um handler explícito no núcleo e revisão de segurança.

## Voz e IA

O seletor configura o idioma enviado ao modelo e às APIs nativas do navegador. Ditado depende de `SpeechRecognition` (Chrome/Edge e permissão do microfone); leitura usa `speechSynthesis`. A disponibilidade de vozes e reconhecimento varia por navegador e sistema.

A chamada ao modelo usa uma chave OpenAI fornecida pelo usuário e enviada diretamente ao endpoint da OpenAI. Ela é guardada em `localStorage`; remova-a em Configurações ou limpe os dados do site ao terminar. Esta versão não tem servidor, proxy nem isolamento entre usuários; não use em computadores compartilhados.
