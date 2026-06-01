-- Reconstituída do baseline remoto (migração 20250618173406 'round_shadow').
-- Gerada a partir de supabase_migrations.schema_migrations para alinhar repo <-> banco.

-- Insert sample data into BANCO_DADOS table
INSERT INTO "BANCO_DADOS" (
  "ID_PARCELA", "NOME_DA_LOJA", "CLIENTE", "DOCUMENTO", "ENDERECO", "NUMERO", 
  "BAIRRO", "CIDADE", "ESTADO", "TELEFONE", "CELULAR",
  "VALOR_ORIGINAL", "VALOR_REAJUSTADO", "DATA_VENCIMENTO", 
  "PARCELA", "NUMERO_TITULO", "VENDA_N", "STATUS", "TIPO_DE_COBRANCA"
) VALUES 
-- Loja Crateús
(1001, 'Crateús', 'João Silva Santos', '123.456.789-00', 'Rua das Flores', '123', 'Centro', 'Crateús', 'CE', '(88) 1234-5678', '(88) 98765-4321', '1000.00', '1050.00', '2024-01-15', 1, 12345, 1001, 'pendente', 'Carnê'),
(1002, 'Crateús', 'Maria Oliveira Costa', '987.654.321-00', 'Av. Principal', '456', 'Vila Nova', 'Crateús', 'CE', '(88) 2345-6789', '(88) 87654-3210', '750.00', '780.00', '2024-01-20', 2, 12346, 1002, 'em_atraso', 'Carnê'),
(1003, 'Crateús', 'Pedro Almeida Lima', '456.789.123-00', 'Rua do Comércio', '789', 'Jardim América', 'Crateús', 'CE', '(88) 3456-7890', '(88) 76543-2109', '1200.00', '1250.00', '2024-01-25', 1, 12347, 1003, 'pendente', 'Carnê'),

-- Loja Crateús Externa
(1004, 'Crateús Externa', 'Ana Paula Ferreira', '321.654.987-00', 'Estrada Rural', '45', 'Zona Rural', 'Crateús', 'CE', '(88) 4567-8901', '(88) 65432-1098', '850.00', '890.00', '2024-01-18', 3, 12348, 1004, 'pendente', 'Carnê'),
(1005, 'Crateús Externa', 'Carlos Eduardo Souza', '654.321.789-00', 'Sítio Boa Vista', 'S/N', 'Zona Rural', 'Crateús', 'CE', '(88) 5678-9012', '(88) 54321-0987', '950.00', '980.00', '2024-01-22', 1, 12349, 1005, 'em_atraso', 'Carnê'),

-- Loja Itapipoca
(1006, 'Itapipoca', 'Francisca Silva Rocha', '789.123.456-00', 'Rua da Praia', '234', 'Centro', 'Itapipoca', 'CE', '(85) 1234-5678', '(85) 98765-4321', '1100.00', '1150.00', '2024-01-12', 2, 12350, 1006, 'recebido', 'Carnê'),
(1007, 'Itapipoca', 'José Roberto Mendes', '147.258.369-00', 'Av. Beira Mar', '567', 'Praia', 'Itapipoca', 'CE', '(85) 2345-6789', '(85) 87654-3210', '800.00', '830.00', '2024-01-28', 1, 12351, 1007, 'pendente', 'Carnê'),

-- Loja Itapipoca Externa
(1008, 'Itapipoca Externa', 'Luiza Fernanda Gomes', '258.369.147-00', 'Distrito de Baleia', '12', 'Baleia', 'Itapipoca', 'CE', '(85) 3456-7890', '(85) 76543-2109', '700.00', '720.00', '2024-01-30', 4, 12352, 1008, 'em_negociacao', 'Carnê'),

-- Loja Independência
(1009, 'Independencia', 'Roberto Carlos Silva', '369.147.258-00', 'Rua Central', '890', 'Centro', 'Independência', 'CE', '(88) 7890-1234', '(88) 43210-9876', '1300.00', '1350.00', '2024-02-05', 1, 12353, 1009, 'pendente', 'Carnê'),
(1010, 'Independencia', 'Sandra Maria Santos', '741.852.963-00', 'Av. da Liberdade', '345', 'Vila Esperança', 'Independência', 'CE', '(88) 8901-2345', '(88) 32109-8765', '900.00', '940.00', '2024-02-08', 2, 12354, 1010, 'em_atraso', 'Carnê'),

-- Loja Novo Oriente
(1011, 'Novo Oriente', 'Antônio José Pereira', '852.963.741-00', 'Rua do Sol', '678', 'Centro', 'Novo Oriente', 'CE', '(88) 9012-3456', '(88) 21098-7654', '1050.00', '1100.00', '2024-02-10', 3, 12355, 1011, 'acordado', 'Carnê'),

-- Loja Poranga
(1012, 'Poranga', 'Mariana Costa Lima', '963.741.852-00', 'Praça da Matriz', '123', 'Centro', 'Poranga', 'CE', '(88) 0123-4567', '(88) 10987-6543', '1150.00', '1200.00', '2024-02-12', 1, 12356, 1012, 'pendente', 'Carnê'),
(1013, 'Poranga', 'Fernando Augusto Rocha', '159.753.486-00', 'Rua das Palmeiras', '456', 'Vila Nova', 'Poranga', 'CE', '(88) 1357-9024', '(88) 09876-5432', '650.00', '680.00', '2024-02-15', 5, 12357, 1013, 'em_atraso', 'Carnê'),

-- Loja Excellence
(1014, 'Excellence', 'Patrícia Alves Moreira', '357.159.753-00', 'Shopping Center', '789', 'Aldeota', 'Fortaleza', 'CE', '(85) 4567-8901', '(85) 98765-4321', '2000.00', '2100.00', '2024-02-18', 1, 12358, 1014, 'recebido', 'Cartão'),
(1015, 'Excellence', 'Ricardo Henrique Dias', '486.357.159-00', 'Av. Beira Mar', '1010', 'Meireles', 'Fortaleza', 'CE', '(85) 5678-9012', '(85) 87654-3210', '1800.00', '1890.00', '2024-02-20', 2, 12359, 1015, 'pendente', 'Cartão'),

-- Loja Exxlab
(1016, 'Exxlab', 'Gabriela Souza Martins', '753.486.357-00', 'Rua da Tecnologia', '2020', 'Centro', 'Fortaleza', 'CE', '(85) 6789-0123', '(85) 76543-2109', '1500.00', '1575.00', '2024-02-22', 1, 12360, 1016, 'em_negociacao', 'Cartão'),
(1017, 'Exxlab', 'Thiago Barbosa Oliveira', '159.357.486-00', 'Av. da Inovação', '3030', 'Cocó', 'Fortaleza', 'CE', '(85) 7890-1234', '(85) 65432-1098', '1750.00', '1820.00', '2024-02-25', 3, 12361, 1017, 'pendente', 'Cartão')

ON CONFLICT ("ID_PARCELA") DO NOTHING;
