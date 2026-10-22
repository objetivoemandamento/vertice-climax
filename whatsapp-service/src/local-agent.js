const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

const PACKAGES = {
  avancado: { key: "Avancado", name: "Avançado", price: 2000 },
  medio: { key: "Medio", name: "Médio", price: 700 },
  basico: { key: "Basico", name: "Básico", price: 300 }
};

export function classifyIncomingMessage(messageText, currentStage = "inicio", context = {}) {
  const text = normalize(messageText);
  const stage = normalize(currentStage);
  if (!text) return { action: "human_review", stage: currentStage, reason: "Mensagem sem texto reconhecível" };

  const optOut = /\b(nao tenho interesse|sem interesse|nao me chame|nao me contate|nao me mande|nao mande mais|nao envie mais|pare|parar|pare de mandar|pare de enviar|remova meu contato|remover meu contato|me tire da lista|nao quero receber|stop|sair da lista)\b/.test(text);
  if (optOut) return { action: "opt_out", stage: "Sem interesse", reply: "Entendido. Obrigado por avisar. Não enviarei novas mensagens comerciais." };

  if (/\b(de onde|onde conseguiu|como conseguiu|quem passou|origem do contato|meu numero)\b/.test(text)) {
    return { action: "human_review", stage: currentStage, reason: "O contato perguntou a origem dos dados; verificar a fonte real registrada antes de responder." };
  }

  if ((context.packageKey && /^(sim|isso|pode|confirmo|fechado|vamos|pode ser|tudo bem|ok)$/.test(text)) || /\b(contratar|quero fechar|pode cobrar|confirmo a contratacao|pode enviar o pix|manda o pix|quero contratar)\b/.test(text)) {
    if (!context.packageKey) return { action: "reply", stage: "Interessado", reply: "Claro. Qual opção faz mais sentido para o que você precisa: Avançado (R$ 2.000), Médio (R$ 700) ou Básico (R$ 300)? Posso explicar as diferenças antes de você decidir." };
    return { action: "confirm_purchase", stage: "Proposta enviada", packageKey: context.packageKey, reason: "O cliente confirmou explicitamente que deseja contratar." };
  }

  const selectedPackage =
    /\b(avancado|avançado|2000|2\.000|dois mil|mais completo|completo)\b/.test(text) ? PACKAGES.avancado :
    /\b(medio|médio|700|setecentos)\b/.test(text) ? PACKAGES.medio :
    /\b(basico|básico|300|trezentos|mais simples|simples)\b/.test(text) ? PACKAGES.basico : null;
  if (selectedPackage && /\b(quero|prefiro|escolho|opcao|opção|pacote|vamos de|pode ser|gostei do)\b/.test(text)) {
    return {
      action: "select_package",
      stage: "Interessado",
      packageKey: selectedPackage.key,
      reply: `Entendi. O pacote ${selectedPackage.name} custa R$ ${selectedPackage.price.toLocaleString("pt-BR")}. Posso seguir com essa opção? Só envio a cobrança se você confirmar que deseja contratar.`
    };
  }

  if (/\b(quanto custa|qual o preco|qual valor|valores|preco|precos|quanto fica|quanto seria)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Preço informado",
      reply: "Temos três opções: Avançado (R$ 2.000), para um projeto mais personalizado com funcionalidades adicionais combinadas; Médio (R$ 700), com mais seções, galeria autorizada e personalização ampliada; e Básico (R$ 300), com apresentação, serviços essenciais, localização e contato. A manutenção é opcional, R$ 50/mês, com escopo combinado. Posso entender o que seria mais útil para o seu negócio e recomendar a opção adequada?"
    };
  }

  if (/\b(ja temos instagram|temos instagram|so usamos instagram|so pelo instagram|instagram e whatsapp|pelo instagram|via instagram)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Descoberta",
      reply: "O Instagram é ótimo para mostrar os trabalhos. Quando alguém quer conhecer os serviços, consegue encontrar tudo e entrar em contato facilmente, ou vocês acabam explicando as opções pelo WhatsApp?"
    };
  }

  if (/\b(ja temos site|temos um site|ja tenho um site|ja tenho site|temos site|nosso site|site ja existe)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Descoberta",
      reply: "Entendi. O site atual já apresenta bem os serviços e facilita o contato, ou há algo que vocês gostariam de melhorar? Se já atende bem, não há motivo para trocar sem necessidade."
    };
  }

  if (/\b(nao entendi|como assim|nao compreendi|explica melhor)\b/.test(text)) {
    return {
      action: "reply",
      stage: currentStage,
      reply: "É um site para apresentar o negócio, os serviços, a localização e formas de contato em um só lugar. Primeiro entendemos o que faz sentido para vocês; depois apresentamos o escopo e o preço antes de qualquer contratação."
    };
  }

  if (/\b(quero ver|manda exemplo|pode mostrar|me mostra|tem exemplo|ver demonstracao|quero uma demonstracao)\b/.test(text)) {
    return {
      action: "human_review",
      stage: "Demonstração solicitada",
      reason: "O contato pediu uma demonstração; preparar e revisar o site com base nas informações verificadas antes de compartilhar."
    };
  }

  if (/\b(quero|tenho interesse|vamos fazer|pode fazer|vamos fechar|gostei|pode mandar|me interessa|seria bom|pode explicar)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Interessado",
      reply: "Ótimo. Para não oferecer algo maior ou menor do que você precisa: o que seria mais importante para o negócio — apresentar os serviços com clareza, mostrar fotos/galeria ou facilitar os pedidos de contato? Com isso eu recomendo a opção mais adequada."
    };
  }

  if (/\b(ja tenho|agora nao|talvez depois|mais tarde|sem tempo agora)\b/.test(text)) {
    return { action: "reply", stage: currentStage, reply: "Sem problema. Obrigado por me responder. Se fizer sentido retomar em outro momento, fico à disposição." };
  }

  if (/\b(obrigad[oa]|valeu)\b/.test(text) && /\b(nao|não)\b/.test(text)) {
    return { action: "reply", stage: currentStage, reply: "Por nada. Obrigado pelo seu tempo." };
  }

  return { action: "human_review", stage: currentStage, reason: "A resposta não correspondeu com segurança a uma regra conhecida; revisar antes de responder." };
}
