UPDATE public."BANCO_DADOS"
SET status = 'Pago'
WHERE status = 'pago com desconto';

UPDATE public."BANCO_DADOS"
SET status = 'Pago'
WHERE status = 'recebido';

UPDATE public."BANCO_DADOS"
SET status = 'Pago Parcial'
WHERE status = 'parcialmente_pago';
