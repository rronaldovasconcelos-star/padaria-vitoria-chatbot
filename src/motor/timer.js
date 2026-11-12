// TO-BE › Sistema › evento de tempo "Prazo de validação expirado".

export const STATUS_COM_PRAZO = ['AGUARDANDO_SINAL', 'AGUARDANDO_CONFIRMACAO'];

export const prazoValidacao = (agora, minutos) =>
  new Date(new Date(agora).getTime() + minutos * 60_000).toISOString();

/** Pedidos cujo sinal não foi pago/validado dentro do prazo. */
export const pedidosVencidos = (pedidos, agora = new Date()) =>
  pedidos.filter((p) => STATUS_COM_PRAZO.includes(p.status)
    && p.prazo_validacao_ate
    && new Date(p.prazo_validacao_ate).getTime() <= new Date(agora).getTime());
