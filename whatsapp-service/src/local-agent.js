const normalize = value => String(value || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

export function classifyIncomingMessage(messageText, currentStage = "inicio") {
  const text = normalize(messageText);
  if (!text) return { action: "human_review", stage: currentStage, reason: "Mensagem sem texto reconhecível" };

  const optOut = /\b(nao tenho interesse|sem interesse|nao me chame|nao me contate|pare de mandar|pare de enviar|remova meu contato|remover meu contato|nao quero receber|stop|sair da lista)\b/.test(text);
  if (optOut) {
    return {
      action: "opt_out",
      stage: "Sem interesse",
      reply: "Entendido. Obrigado por avisar. Não enviarei novas mensagens comerciais."
    };
  }

  if (/\b(de onde|onde conseguiu|como conseguiu|quem passou|origem do contato|meu numero)\b/.test(text)) {
    return {
      action: "reply",
      stage: currentStage,
      reply: "Encontrei as informações comerciais no perfil público do estabelecimento que consultei. Se preferir não receber mensagens, me avise e encerro o contato."
    };
  }

  if (/\b(quanto custa|qual o preco|qual valor|valores|preco|precos|quanto fica|quanto seria)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Preço informado",
      reply: "Tenho três opções: Básico por R$ 300, Médio por R$ 700 e Avançado por R$ 2.000. A manutenção é opcional, por R$ 50 por mês, com escopo combinado antes. O valor certo depende do que você precisa. Posso entender um pouco melhor o que seria útil para o seu negócio?"
    };
  }

  if (/\b(ja temos instagram|temos instagram|so usamos instagram|so pelo instagram|instagram e whatsapp|pelo instagram)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Descoberta",
      reply: "O Instagram é ótimo para mostrar os trabalhos. Quando alguém gosta de um serviço, costuma encontrar ali todas as informações e opções, ou vocês ainda precisam explicar alguns detalhes e enviar fotos pelo WhatsApp?"
    };
  }

  if (/\b(via instagram|pelo instagram|instagram)\b/.test(text) && ["inicio", "abordagem", "descoberta"].includes(normalize(currentStage))) {
    return {
      action: "reply",
      stage: "Descoberta",
      reply: "E a pessoa costuma chegar sabendo qual serviço quer, ou vocês ainda precisam explicar as opções e mandar fotos durante a conversa?"
    };
  }

  if (/\b(ja temos site|temos um site|nosso site|site ja existe)\b/.test(text)) {
    return {
      action: "reply",
      stage: "Descoberta",
      reply: "Entendi. Existe alguma coisa no site atual que vocês gostariam de melhorar, ou ele já atende bem ao que precisam?"
    };
  }

  if (/\b(nao entendi|como assim|nao compreendi|explica melhor)\b/.test(text)) {
    return {
      action: "reply",
      stage: currentStage,
      reply: "É uma página simples na internet onde a pessoa pode ver os serviços, algumas fotos, a localização e um botão para falar com vocês. Posso preparar uma demonstração para você avaliar antes de decidir."
    };
  }

  if (/\b(quero ver|manda exemplo|pode mostrar|me mostra|tem exemplo|ver demonstracao|quero uma demonstracao)\b/.test(text)) {
    return {
      action: "human_review",
      stage: "Demonstração solicitada",
      reason: "O contato pediu uma demonstração; gerar e revisar o site antes de enviar um link."
    };
  }

  if (/\b(quero|tenho interesse|vamos fazer|pode fazer|vamos fechar|gostei|pode mandar)\b/.test(text)) {
    return {
      action: "human_review",
      stage: "Interessado",
      reason: "Há sinal de interesse. Confirmar escopo, pacote, condições e preparar demonstração antes de assumir compromisso."
    };
  }

  if (/\b(ja tenho|agora nao|talvez depois|mais tarde)\b/.test(text)) {
    return {
      action: "reply",
      stage: currentStage,
      reply: "Sem problema. Obrigado por me responder. Se fizer sentido retomar em outro momento, fico à disposição."
    };
  }

  return {
    action: "human_review",
    stage: currentStage,
    reason: "A resposta não correspondeu com segurança a uma regra conhecida; revisar antes de responder."
  };
}
