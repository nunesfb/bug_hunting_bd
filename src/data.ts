export type Kind = 'investigar' | 'corrigir' | 'interpretar';
export type Challenge = {
  id: number; world: number; title: string; report: string; code: string; question: string;
  options: string[]; correct: number; explanation: string; hint: string; kind: Kind; impact: string; boss?: boolean;
};
export type World = { name: string; short: string; boss: string; color: string; bg: string; sky: string; story: string; level: string; topics: string };

export const worlds: World[] = [
  { name: 'Floresta das Transações', short: 'FLORESTA', boss: 'GUARDIÃO ROLLBACK', color: '#2dcf92', bg: '#0c302d', sky: '#123f3a', level: 'FÁCIL', topics: 'BEGIN/COMMIT, ROLLBACK, SAVEPOINT, autocommit', story: 'O comércio perdeu o controle dos pedidos. Encontre as falhas de atomicidade.' },
  { name: 'Minas da Concorrência', short: 'MINAS', boss: 'GOLEM DEADLOCK', color: '#f5b963', bg: '#2a1d13', sky: '#382719', level: 'MÉDIO', topics: 'atualização perdida, FOR UPDATE, isolamento, deadlock', story: 'Duas sessões compraram o mesmo item. Domine concorrência e bloqueios.' },
  { name: 'Castelo das Triggers', short: 'CASTELO', boss: 'MAGO TRIGGER', color: '#ca9cff', bg: '#231933', sky: '#302244', level: 'INTERMEDIÁRIO', topics: 'triggers BEFORE/AFTER, WHEN, RETURN NEW, recursão', story: 'Regras do banco foram enfeitiçadas e passaram a gerar registros incorretos.' },
  { name: 'Laboratório da Lentidão', short: 'LABORATÓRIO', boss: 'SLIME SEQ SCAN', color: '#67cfff', bg: '#0f2235', sky: '#17314a', level: 'AVANÇADO', topics: 'índices, EXPLAIN ANALYZE, views materializadas, estatísticas', story: 'O sistema está lento e o painel financeiro não acompanha as vendas.' },
  { name: 'Cidadela das Funções', short: 'CIDADELA', boss: 'LICH INJECTION', color: '#ffd166', bg: '#221d0c', sky: '#2f2810', level: 'EXPERT', topics: 'PL/pgSQL, SQL dinâmico, volatilidade, SECURITY DEFINER', story: 'Funções corrompidas abrem brechas no coração do sistema. Feche cada uma delas.' },
  { name: 'Fortaleza do Dr. Null', short: 'FORTALEZA', boss: 'DR. NULL', color: '#ff7889', bg: '#2e1024', sky: '#431d35', level: 'LENDÁRIO', topics: 'NULL, exceções, SERIALIZABLE, procedures seguras', story: 'O núcleo financeiro foi comprometido. Só o domínio completo do PostgreSQL derrota o Dr. Null.' },
];

/** XP base por mundo; o bug-chefe (4º do mundo) vale 1,5×. */
export const BASE_XP = [100, 150, 200, 250, 300, 400];
export const xpFor = (c: Challenge) => Math.round(BASE_XP[c.world] * (c.boss ? 1.5 : 1));
export const hintXpFor = (c: Challenge) => Math.round(xpFor(c) * 0.7);
export const errorPenaltyFor = (c: Challenge) => 10 + 5 * c.world;
export const BUGS_PER_WORLD = 4;
export const TOTAL_TIME = 2 * 60 * 60;

export const challenges: Challenge[] = [
  // ───────── MUNDO 1 · FÁCIL ─────────
  { id: 1, world: 0, title: 'Pedido pela metade', kind: 'corrigir', report: 'Uma cobrança foi aprovada, mas o pedido falhou. O saldo foi debitado definitivamente.',
    code: "UPDATE conta SET saldo = saldo - 100 WHERE conta_id = 1;\nINSERT INTO pedido(cliente_id, status) VALUES (3, 'PENDENTE');",
    question: 'Qual mudança garante que, se o INSERT falhar, o débito também seja desfeito?',
    options: ['Executar cada comando com COMMIT próprio.', 'Agrupar os comandos em BEGIN/COMMIT e executar ROLLBACK em caso de falha.', 'Adicionar ORDER BY ao UPDATE.', 'Trocar UPDATE por SELECT.'],
    correct: 1, explanation: 'Uma transação explícita mantém a atomicidade das operações; uma falha aborta a transação, que deve ser revertida.', hint: 'O problema é a ausência de uma unidade atômica de trabalho.', impact: 'PEDIDOS RESTAURADOS' },
  { id: 2, world: 0, title: 'O brinde amaldiçoado', kind: 'interpretar', report: 'O pedido tem dois itens válidos e um brinde sem estoque. O brinde pode falhar, mas a venda deve ser mantida.',
    code: "BEGIN;\nINSERT INTO item_pedido(...) VALUES (...); -- item válido\nSAVEPOINT brinde;\nINSERT INTO item_pedido(...) VALUES (...); -- brinde: ERRO\n-- ?\nCOMMIT;",
    question: 'Qual sequência preserva o primeiro item e descarta só o brinde?',
    options: ['ROLLBACK; COMMIT;', 'ROLLBACK TO SAVEPOINT brinde; COMMIT;', 'COMMIT; ROLLBACK;', 'RELEASE SAVEPOINT brinde após o erro; COMMIT;'],
    correct: 1, explanation: 'ROLLBACK TO SAVEPOINT reverte apenas o que ocorreu após o ponto de salvamento e tira a transação do estado de erro. O COMMIT mantém os itens anteriores.', hint: 'Um ROLLBACK total jogaria fora a venda inteira.', impact: 'BRINDE ISOLADO' },
  { id: 3, world: 0, title: 'O desconto irreversível', kind: 'interpretar', report: 'Um operador aplicou 50% de desconto em todo o catálogo por engano (deveria ser 5%) e tentou desfazer com ROLLBACK.',
    code: "-- psql, configuração padrão (autocommit ligado)\nUPDATE produto SET preco = preco * 0.5;   -- deveria ser 0.95!\n-- UPDATE 1200\nROLLBACK;\n-- WARNING: there is no transaction in progress",
    question: 'Por que o ROLLBACK não desfez o desconto errado?',
    options: ['Sem BEGIN, o UPDATE rodou em sua própria transação e foi confirmado automaticamente (autocommit); o ROLLBACK não tinha o que desfazer.', 'ROLLBACK só desfaz INSERT e DELETE, nunca UPDATE.', 'O PostgreSQL exige ROLLBACK WORK; a forma curta é ignorada.', 'O UPDATE ficou bloqueado e será desfeito quando a sessão for encerrada.'],
    correct: 0, explanation: 'Sem BEGIN explícito, cada comando é uma transação implícita confirmada ao terminar. Antes de alterações críticas, abra BEGIN (ou use \\set AUTOCOMMIT off no psql) para poder conferir e reverter.', hint: 'Quando começou — e quando terminou — a transação desse UPDATE?', impact: 'CATÁLOGO PROTEGIDO' },
  { id: 4, world: 0, boss: true, title: 'A transação abortada', kind: 'investigar', report: 'O Guardião Rollback corrompeu um lote: um erro ocorreu no meio da transação e o operador mandou COMMIT mesmo assim.',
    code: "BEGIN;\nINSERT INTO pedido(cliente_id, status) VALUES (7, 'PENDENTE');\nINSERT INTO item_pedido(pedido_id, produto_id, quantidade) VALUES (99999, 1, 2);\n-- ERROR: insert or update on table \"item_pedido\" violates foreign key constraint\nUPDATE estoque SET qtd = qtd - 2 WHERE produto_id = 1;\n-- ERROR: current transaction is aborted, commands ignored until end of transaction block\nCOMMIT;",
    question: 'O que o PostgreSQL faz ao receber esse COMMIT?',
    options: ['Confirma o primeiro INSERT e descarta apenas os comandos que falharam.', 'Confirma tudo, pois o COMMIT força a gravação.', 'Encerra a transação com ROLLBACK: nada é persistido, nem o pedido do primeiro INSERT.', 'Mantém a transação aberta aguardando um novo COMMIT.'],
    correct: 2, explanation: 'Após um erro, a transação entra em estado abortado e ignora os comandos até o fim do bloco. Um COMMIT nesse estado é tratado como ROLLBACK (o psql responde "ROLLBACK"). Para salvar parte do trabalho, seria preciso um SAVEPOINT antes do comando arriscado.', hint: 'Repare na mensagem "current transaction is aborted".', impact: 'GUARDIÃO ROLLBACK DERROTADO' },

  // ───────── MUNDO 2 · MÉDIO ─────────
  { id: 5, world: 1, title: 'O último teclado', kind: 'investigar', report: 'Dois operadores leram estoque 10 e venderam uma unidade cada. O saldo final ficou 9 em vez de 8.',
    code: "-- sessão A: SELECT estoque; -- 10\n-- sessão B: SELECT estoque; -- 10\n-- sessão A: UPDATE produto SET estoque = 9;\n-- sessão B: UPDATE produto SET estoque = 9;",
    question: 'Qual estratégia elimina a atualização perdida sem depender do valor lido antes?',
    options: ['UPDATE produto SET estoque = estoque - 1 WHERE produto_id = 1 AND estoque >= 1; e checar as linhas afetadas.', 'Executar o SELECT outra vez antes do UPDATE literal.', 'Criar uma VIEW sobre produto.', 'Trocar READ COMMITTED por READ UNCOMMITTED.'],
    correct: 0, explanation: 'A atualização atômica com condição de estoque usa o valor corrente da linha e evita subtrações baseadas em leituras antigas. Se nenhuma linha for afetada, não havia estoque.', hint: 'O valor não deve ser calculado fora do UPDATE.', impact: 'ESTOQUE SINCRONIZADO' },
  { id: 6, world: 1, title: 'A poltrona disputada', kind: 'interpretar', report: 'Dois atendentes tentam reservar a mesma poltrona do show no mesmo instante.',
    code: "-- Sessão A\nBEGIN;\nSELECT * FROM assento WHERE assento_id = 42 AND livre FOR UPDATE;\n-- (A ainda não fez COMMIT)\n\n-- Sessão B\nBEGIN;\nSELECT * FROM assento WHERE assento_id = 42 AND livre FOR UPDATE;",
    question: 'O que acontece com a Sessão B (READ COMMITTED)?',
    options: ['B lê a linha normalmente e as duas reservam a mesma poltrona.', 'B fica bloqueada até A terminar; se A marcar livre = false e der COMMIT, B reavalia a condição e não retorna a linha.', 'B recebe erro de deadlock imediatamente.', 'B lê uma cópia antiga da linha e ignora o bloqueio.'],
    correct: 1, explanation: 'FOR UPDATE trava a linha: quem tenta travá-la depois espera. Em READ COMMITTED, após o COMMIT de A, o WHERE é reavaliado sobre a versão nova da linha. Use NOWAIT ou SKIP LOCKED quando não quiser esperar.', hint: 'FOR UPDATE é um bloqueio de linha — quem chega depois precisa...', impact: 'RESERVAS ORGANIZADAS' },
  { id: 7, world: 1, title: 'A leitura fantasma', kind: 'interpretar', report: 'Uma sessão contou cinco produtos com preço menor que 300. Outra inseriu um novo produto barato e fez COMMIT.',
    code: "-- A: BEGIN ISOLATION LEVEL REPEATABLE READ;\n-- A: SELECT COUNT(*) FROM produto WHERE preco < 300; -- 5\n-- B: INSERT INTO produto(...) VALUES (... 45.00 ...);\n-- B: COMMIT;\n-- A: SELECT COUNT(*) FROM produto WHERE preco < 300;",
    question: 'Qual será a segunda contagem de A em PostgreSQL (mesma transação)?',
    options: ['6, pois INSERT confirmado sempre fica visível.', 'Erro obrigatório de deadlock.', '5, pois A mantém o mesmo snapshot durante toda a transação.', '0, pois o índice foi invalidado.'],
    correct: 2, explanation: 'Em REPEATABLE READ, todas as consultas de A usam o snapshot tirado no primeiro comando; o INSERT confirmado por B não aparece. Em READ COMMITTED, a resposta seria 6.', hint: 'O nível de isolamento define a visibilidade das mudanças de outras transações.', impact: 'SNAPSHOT ESTABILIZADO' },
  { id: 8, world: 1, boss: true, title: 'O abraço mortal', kind: 'corrigir', report: 'O Golem Deadlock trava transferências em horário de pico. O log mostra "deadlock detected" várias vezes por hora.',
    code: "-- T1\nBEGIN; UPDATE conta SET saldo = saldo - 50 WHERE conta_id = 1;\n-- T2\nBEGIN; UPDATE conta SET saldo = saldo - 30 WHERE conta_id = 2;\n-- T1\nUPDATE conta SET saldo = saldo + 50 WHERE conta_id = 2;  -- espera T2\n-- T2\nUPDATE conta SET saldo = saldo + 30 WHERE conta_id = 1;  -- espera T1\n-- ERROR: deadlock detected (SQLSTATE 40P01)",
    question: 'Qual medida previne esse deadlock na aplicação?',
    options: ['Bloquear/atualizar as contas sempre na mesma ordem (ex.: menor conta_id primeiro) e repetir a transação se ainda ocorrer 40P01.', 'Aumentar deadlock_timeout para 1 hora.', 'Usar READ UNCOMMITTED, que no PostgreSQL elimina bloqueios.', 'Executar cada UPDATE com COMMIT próprio.'],
    correct: 0, explanation: 'O deadlock nasce de ordens de bloqueio cruzadas. Travar sempre na mesma ordem (ex.: SELECT ... WHERE conta_id IN (1,2) ORDER BY conta_id FOR UPDATE) elimina o ciclo. COMMIT por comando quebraria a atomicidade, e READ UNCOMMITTED no PostgreSQL se comporta como READ COMMITTED.', hint: 'Um ciclo de espera só existe quando cada transação trava os recursos em ordem diferente.', impact: 'GOLEM DEADLOCK DERROTADO' },

  // ───────── MUNDO 3 · INTERMEDIÁRIO ─────────
  { id: 9, world: 2, title: 'A auditoria infinita', kind: 'corrigir', report: 'A trigger está gravando histórico mesmo quando o UPDATE repete o saldo já existente.',
    code: "CREATE TRIGGER auditar\nAFTER UPDATE ON conta\nFOR EACH ROW\nEXECUTE FUNCTION fn_auditar();",
    question: 'Qual condição limita a auditoria a mudanças reais de saldo, inclusive quando há NULL?',
    options: ['WHEN (OLD.saldo IS DISTINCT FROM NEW.saldo)', 'WHEN (OLD.conta_id = NEW.conta_id)', 'WHEN (OLD.saldo = NEW.saldo)', "WHEN (TG_OP = 'INSERT')", 'WHEN (OLD.saldo <> NEW.saldo)'],
    correct: 0, explanation: 'IS DISTINCT FROM compara valores com segurança mesmo com NULL (NULL→100 é diferença; NULL→NULL não é). Já <> devolve NULL quando um lado é NULL, e a trigger deixaria de auditar essa mudança.', hint: 'Pense em uma comparação segura quando um dos valores é NULL.', impact: 'TRILHA DE AUDITORIA REPARADA' },
  { id: 10, world: 2, title: 'O item clandestino', kind: 'corrigir', report: 'Um produto inativo foi incluído e o item ficou sem preço. A validação deve ocorrer antes da gravação.',
    code: "CREATE TRIGGER validar_item\nAFTER INSERT ON item_pedido\nFOR EACH ROW\nEXECUTE FUNCTION fn_validar();",
    question: 'Que estratégia implementa as duas regras antes de persistir o item?',
    options: ['Usar AFTER DELETE e alterar OLD.preco_unitario.', 'Usar BEFORE INSERT; consultar produto; RAISE EXCEPTION para item inválido; preencher NEW.preco_unitario e RETURN NEW.', 'Criar INDEX no campo preco_unitario.', 'Usar somente uma VIEW para ocultar produtos inativos.', 'Manter AFTER INSERT e, na função, alterar NEW.preco_unitario.'],
    correct: 1, explanation: 'Uma trigger BEFORE INSERT pode rejeitar a linha e modificar NEW antes da gravação; RETURN NEW preserva a operação válida. Em AFTER, a linha já foi gravada e mudanças em NEW são ignoradas.', hint: 'Precisamos validar e preencher NEW antes que a linha exista.', impact: 'ITENS VALIDADOS' },
  { id: 11, world: 2, title: 'Os clientes que sumiam', kind: 'investigar', report: 'Os INSERTs em cliente respondem "INSERT 0 0" e nenhuma linha é gravada. Não há mensagem de erro.',
    code: "CREATE FUNCTION fn_normaliza() RETURNS trigger\nLANGUAGE plpgsql AS $$\nBEGIN\n  NEW.email := lower(trim(NEW.email));\n  RETURN NULL;\nEND; $$;\n\nCREATE TRIGGER normaliza BEFORE INSERT ON cliente\nFOR EACH ROW EXECUTE FUNCTION fn_normaliza();",
    question: 'Qual é a causa e a correção?',
    options: ['Em trigger BEFORE ... FOR EACH ROW, retornar NULL cancela silenciosamente a operação da linha; a função deve terminar com RETURN NEW.', 'lower() não pode ser usada em triggers; trocar por upper().', 'Falta COMMIT dentro da função de trigger.', 'A trigger deveria ser FOR EACH STATEMENT para poder retornar NEW.', 'Trocar para AFTER INSERT mantendo RETURN NULL resolve tudo.'],
    correct: 0, explanation: 'Em triggers BEFORE de linha, o valor retornado é a linha que será gravada; NULL manda pular a operação. Em AFTER o retorno é ignorado — por isso a normalização de NEW só funciona em BEFORE.', hint: 'O que significa o valor de retorno de uma trigger BEFORE ROW?', impact: 'CADASTROS RECUPERADOS' },
  { id: 12, world: 2, boss: true, title: 'O feitiço recursivo', kind: 'corrigir', report: 'O Mago Trigger lançou um feitiço: qualquer UPDATE em conta falha com "stack depth limit exceeded".',
    code: "CREATE FUNCTION fn_touch() RETURNS trigger\nLANGUAGE plpgsql AS $$\nBEGIN\n  UPDATE conta SET atualizado_em = now()\n   WHERE conta_id = NEW.conta_id;\n  RETURN NEW;\nEND; $$;\n\nCREATE TRIGGER touch AFTER UPDATE ON conta\nFOR EACH ROW EXECUTE FUNCTION fn_touch();",
    question: 'Qual correção elimina a recursão e mantém o carimbo de data/hora?',
    options: ['Aumentar max_stack_depth no postgresql.conf.', 'Trocar AFTER UPDATE por AFTER INSERT.', 'Trocar para BEFORE UPDATE e, na função, fazer NEW.atualizado_em := now(); RETURN NEW; sem UPDATE adicional.', 'Adicionar COMMIT após o UPDATE dentro da função.', 'Criar a trigger FOR EACH STATEMENT mantendo o mesmo corpo.'],
    correct: 2, explanation: 'O UPDATE dentro da trigger dispara a própria trigger de novo, infinitamente. Em BEFORE ROW basta alterar NEW: a linha já é gravada com o carimbo, sem novo UPDATE e sem recursão.', hint: 'Quem dispara a trigger? E o que a trigger faz?', impact: 'MAGO TRIGGER DERROTADO' },

  // ───────── MUNDO 4 · AVANÇADO ─────────
  { id: 13, world: 3, title: 'O índice de cristal', kind: 'investigar', report: 'Há 200 mil pedidos; esta consulta usa Seq Scan com custo elevado. Também há telas que filtram só por cliente.',
    code: "EXPLAIN (ANALYZE, BUFFERS)\nSELECT * FROM pedido\nWHERE cliente_id = 1234 AND status = 'PAGO';",
    question: 'Qual índice atende o filtro e também permite procurar eficientemente apenas por cliente_id?',
    options: ['CREATE INDEX ix ON pedido(status);', 'CREATE INDEX ix ON pedido(cliente_id, status);', 'CREATE INDEX ix ON pedido(data_pedido, status);', 'CREATE INDEX ix ON cliente(cliente_id);', 'CREATE INDEX ix ON pedido(status, cliente_id);'],
    correct: 1, explanation: 'O B-tree composto (cliente_id, status) atende os dois filtros e também consultas só pelo prefixo cliente_id. Com (status, cliente_id), buscas apenas por cliente_id não aproveitam bem o índice.', hint: 'A coluna usada sozinha deve ser o prefixo do índice.', impact: 'BUSCAS ACELERADAS' },
  { id: 14, world: 3, title: 'O e-mail invisível', kind: 'investigar', report: 'Existe índice em cliente(email), mas o login faz Seq Scan em 2 milhões de linhas.',
    code: "CREATE INDEX ix_cliente_email ON cliente(email);\n\nEXPLAIN SELECT * FROM cliente\nWHERE lower(email) = lower('Ana@Pixel.com');\n-- Seq Scan on cliente  (cost=0.00..48213.00 rows=10000 ...)\n--   Filter: (lower(email) = 'ana@pixel.com'::text)",
    question: 'Por que o índice não é usado e como corrigir?',
    options: ['Índices B-tree não suportam texto; criar índice HASH em email.', 'O filtro aplica lower() na coluna e o B-tree em email não serve; criar CREATE INDEX ON cliente (lower(email));', 'Executar REINDEX TABLE cliente, pois o índice está corrompido.', 'Adicionar LIMIT 1 para forçar o uso do índice.', 'Trocar lower() por ILIKE, que sempre usa índice B-tree.'],
    correct: 1, explanation: 'Um índice só atende a expressão exatamente indexada. Um índice de expressão sobre lower(email) casa com o filtro. Alternativa: usar o tipo citext.', hint: 'O índice guarda email... mas o WHERE compara outra coisa.', impact: 'LOGIN INSTANTÂNEO' },
  { id: 15, world: 3, title: 'O painel congelado', kind: 'interpretar', report: 'O faturamento de dezembro não mudou depois da inclusão de um pedido PAGO.',
    code: "SELECT * FROM mv_faturamento_mensal\nWHERE mes = DATE '2025-12-01';\n-- pedido novo confirmado; a consulta devolve o mesmo total",
    question: 'A view é MATERIALIZED. Como atualizar os dados preservando leitores concorrentes?',
    options: ['UPDATE mv_faturamento_mensal SET faturamento = faturamento + 1;', 'REFRESH MATERIALIZED VIEW CONCURRENTLY mv_faturamento_mensal; com índice UNIQUE adequado e view já populada.', 'ANALYZE pedido; isso atualiza os dados materializados.', 'COMMIT na sessão que consulta, sem refresh.', 'DROP e CREATE da view a cada consulta do painel.'],
    correct: 1, explanation: 'A view materializada guarda um resultado armazenado. REFRESH ... CONCURRENTLY recalcula sem bloquear leitores, mas exige um índice UNIQUE (sem WHERE) e a view já populada.', hint: 'Dados materializados precisam de atualização explícita.', impact: 'PAINEL ATUALIZADO' },
  { id: 16, world: 3, boss: true, title: 'O plano enganado', kind: 'investigar', report: 'O Slime Seq Scan atacou após o lote noturno importar 2 milhões de itens: um relatório que levava 1 s passou a levar 9 minutos.',
    code: "EXPLAIN ANALYZE SELECT ...\n-> Nested Loop  (cost=0.85..16.90 rows=1 width=48)\n               (actual time=0.04..532118.20 rows=1843220 loops=1)\n   -> Index Scan using ix_item on item_pedido\n               (rows=1) (actual rows=1843220 loops=1)\n-- pg_stat_user_tables: last_analyze/last_autoanalyze de\n-- item_pedido são anteriores à carga",
    question: 'Qual diagnóstico e ação são mais adequados?',
    options: ['Executar VACUUM FULL, que reescreve a tabela e corrige o plano.', 'Desabilitar Nested Loop no servidor inteiro (enable_nestloop = off) permanentemente.', 'Aumentar shared_buffers; o problema é falta de memória.', 'Estatísticas desatualizadas: o planejador estimou 1 linha e recebeu 1,8 milhão. Executar ANALYZE item_pedido (e incluí-lo após cargas em massa).', 'Recriar todos os índices com REINDEX DATABASE.'],
    correct: 3, explanation: 'Grande divergência entre rows estimado e actual indica estatísticas obsoletas. ANALYZE atualiza pg_statistic e o planejador volta a escolher um plano adequado. VACUUM FULL não coleta estatísticas; desligar nested loop globalmente é remendo.', hint: 'Compare rows estimadas × actual rows.', impact: 'SLIME SEQ SCAN DERROTADO' },

  // ───────── MUNDO 5 · EXPERT ─────────
  { id: 17, world: 4, title: 'O total invisível', kind: 'corrigir', report: 'A função retorna NULL para pedidos sem itens; o sistema exige zero.',
    code: "SELECT SUM(quantidade * preco_unitario)\nFROM item_pedido\nWHERE pedido_id = p_pedido_id;",
    question: 'Qual expressão corrige o retorno sem alterar a soma de pedidos com itens?',
    options: ['COUNT(*) * preco_unitario', 'SUM(COALESCE(quantidade * preco_unitario, 0))', 'COALESCE(SUM(quantidade * preco_unitario), 0)', 'SUM(quantidade) OR 0', 'NULLIF(SUM(quantidade * preco_unitario), 0)'],
    correct: 2, explanation: 'SUM sem linhas devolve NULL. COALESCE por fora transforma apenas esse NULL em zero. COALESCE dentro do SUM não ajuda: se não há linhas, não há nada para somar e o resultado continua NULL.', hint: 'O NULL vem da agregação sobre zero linhas, não de um item.', impact: 'TOTALIZAÇÃO RECUPERADA' },
  { id: 18, world: 4, title: 'A busca envenenada', kind: 'corrigir', report: "Um invasor digitou  x' OR '1'='1  no campo de busca e listou todos os clientes.",
    code: "CREATE FUNCTION buscar_cliente(p_nome text)\nRETURNS SETOF cliente LANGUAGE plpgsql AS $$\nBEGIN\n  RETURN QUERY EXECUTE\n    'SELECT * FROM cliente WHERE nome = ''' || p_nome || '''';\nEND; $$;",
    question: 'Qual correção elimina a injeção de SQL?',
    options: ['Remover espaços de p_nome com trim() antes de concatenar.', "Usar format('SELECT * FROM cliente WHERE nome = %s', p_nome).", "RETURN QUERY EXECUTE 'SELECT * FROM cliente WHERE nome = $1' USING p_nome;  (ou format() com %L)", 'Trocar as aspas simples por aspas duplas na concatenação.', 'Marcar a função como SECURITY DEFINER.'],
    correct: 2, explanation: 'Parâmetros passados com USING nunca são interpretados como SQL. Se a montagem dinâmica for inevitável, use format() com %L (literais) e %I (identificadores); %s insere o texto sem escape. Aqui nem é preciso SQL dinâmico: RETURN QUERY SELECT ... WHERE nome = p_nome.', hint: 'O valor do usuário precisa viajar como dado, não como código.', impact: 'INJEÇÃO BLOQUEADA' },
  { id: 19, world: 4, title: 'A taxa congelada', kind: 'interpretar', report: 'A taxa do dólar foi alterada na tabela config, mas o índice e algumas consultas continuam usando o valor antigo.',
    code: "CREATE FUNCTION taxa_atual() RETURNS numeric\nLANGUAGE sql IMMUTABLE AS $$\n  SELECT valor FROM config WHERE chave = 'taxa_usd';\n$$;\n\nCREATE INDEX ix_preco_usd ON produto ((preco / taxa_atual()));",
    question: 'Qual é o erro conceitual?',
    options: ['Funções LANGUAGE sql não podem ler tabelas; reescrever em plpgsql resolve.', 'Basta executar REFRESH INDEX ix_preco_usd após mudar a taxa.', 'Deveria ser VOLATILE, e o índice continuaria válido.', 'IMMUTABLE promete que o resultado depende só dos argumentos; como a função lê uma tabela, deve ser STABLE — e então não pode ser usada em índice de expressão.', 'Falta PARALLEL SAFE na declaração da função.'],
    correct: 3, explanation: 'O PostgreSQL confia na volatilidade declarada: chamadas IMMUTABLE podem ser pré-calculadas no planejamento e os valores do índice nunca são recalculados. Quem lê tabelas é, no máximo, STABLE; o índice deve sair e o cálculo ir para a consulta.', hint: 'O que a palavra IMMUTABLE promete ao planejador?', impact: 'CÂMBIO DESCONGELADO' },
  { id: 20, world: 4, boss: true, title: 'O sequestro do caminho', kind: 'investigar', report: 'O Lich Injection criou uma função falsa chamada registrar_log no schema public e executou código com os poderes do administrador.',
    code: "CREATE FUNCTION aprovar_pagamento(p_id int) RETURNS void\nLANGUAGE plpgsql SECURITY DEFINER AS $$\nBEGIN\n  UPDATE pagamento SET status = 'APROVADO' WHERE id = p_id;\n  PERFORM registrar_log(p_id);   -- nome não qualificado\nEND; $$;\n-- dono: admin | search_path herdado do chamador: \"$user\", public\n-- banco legado: qualquer usuário pode criar objetos em public",
    question: 'Qual combinação torna a função segura?',
    options: ['Trocar SECURITY DEFINER por SECURITY INVOKER e conceder UPDATE em pagamento a todos.', 'Renomear registrar_log para um nome difícil de adivinhar.', 'Marcar a função como IMMUTABLE.', 'Adicionar EXCEPTION WHEN OTHERS para capturar ataques.', 'Fixar o search_path da função (SET search_path = admin_app, pg_temp) ou qualificar os nomes com schema, e REVOKE EXECUTE ... FROM PUBLIC, concedendo só a papéis autorizados.'],
    correct: 4, explanation: 'SECURITY DEFINER executa com os privilégios do dono. Com o search_path herdado, o chamador pode "sequestrar" nomes não qualificados criando objetos num schema gravável. A documentação recomenda fixar search_path (pg_temp por último) e restringir EXECUTE, que por padrão é concedido a PUBLIC.', hint: 'Como o PostgreSQL decide qual registrar_log chamar?', impact: 'LICH INJECTION DERROTADO' },

  // ───────── MUNDO 6 · LENDÁRIO ─────────
  { id: 21, world: 5, title: 'Os clientes fantasmas', kind: 'investigar', report: 'O marketing quer os clientes que nunca compraram. Há 3.200 deles, mas a consulta retorna 0 linhas.',
    code: "SELECT c.cliente_id, c.nome\nFROM cliente c\nWHERE c.cliente_id NOT IN (SELECT p.cliente_id FROM pedido p);\n-- (0 rows)\n-- Obs.: pedido.cliente_id aceita NULL (vendas de balcão)",
    question: 'Qual é a causa e a reescrita correta?',
    options: ['NOT IN não funciona com subconsultas; usar uma lista literal.', 'Usar <> ALL (SELECT p.cliente_id FROM pedido p), que ignora NULLs.', 'Adicionar DISTINCT à subconsulta.', 'Se a subconsulta contém NULL, NOT IN nunca é verdadeiro; usar WHERE NOT EXISTS (SELECT 1 FROM pedido p WHERE p.cliente_id = c.cliente_id).', 'Usar LEFT JOIN pedido p ON p.cliente_id = c.cliente_id WHERE p.pedido_id IS NOT NULL.'],
    correct: 3, explanation: 'x NOT IN (a, b, NULL) equivale a x<>a AND x<>b AND x<>NULL; o último termo é NULL, então a condição nunca é TRUE. <> ALL tem o mesmo problema. NOT EXISTS (ou LEFT JOIN ... WHERE p.cliente_id IS NULL) dá o resultado esperado.', hint: 'Avalie 5 NOT IN (1, 2, NULL) pela lógica de três valores.', impact: 'CLIENTES REENCONTRADOS' },
  { id: 22, world: 5, title: 'O erro engolido', kind: 'interpretar', report: "A função de fechamento retorna 'OK', mas o estoque não foi baixado. Nenhum erro chegou à aplicação.",
    code: "CREATE FUNCTION fechar_pedido(p_id int) RETURNS text\nLANGUAGE plpgsql AS $$\nBEGIN\n  UPDATE pedido SET status = 'FECHADO' WHERE pedido_id = p_id;\n  BEGIN\n    UPDATE estoque e SET qtd = e.qtd - i.quantidade\n      FROM item_pedido i\n     WHERE i.pedido_id = p_id AND e.produto_id = i.produto_id;\n    -- aqui ocorre: violação de CHECK (qtd >= 0)\n  EXCEPTION WHEN OTHERS THEN\n    RAISE NOTICE 'falhou: %', SQLERRM;\n  END;\n  RETURN 'OK';\nEND; $$;",
    question: 'O que acontece e qual é a correção adequada?',
    options: ['O bloco com EXCEPTION age como um savepoint: a baixa de estoque é desfeita, mas o pedido fica FECHADO e o erro é engolido. Capturar só erros esperados ou re-lançar com RAISE; para abortar tudo.', 'O PostgreSQL ignora violações de CHECK dentro de funções; basta trocar NOTICE por WARNING.', 'A baixa de estoque é gravada parcialmente, até a linha que violou o CHECK.', 'A função inteira é desfeita automaticamente, inclusive o status, porque houve um erro.', 'Adicionar COMMIT dentro do bloco EXCEPTION resolve.'],
    correct: 0, explanation: 'Um bloco PL/pgSQL com EXCEPTION cria uma subtransação: se ocorre erro, só as alterações do bloco são revertidas e a execução segue no handler. WHEN OTHERS sem propagar esconde falhas e deixa o banco inconsistente. Funções não podem executar COMMIT.', hint: 'O que acontece com o UPDATE de pedido, que está fora do bloco interno?', impact: 'FALHAS EXPOSTAS' },
  { id: 23, world: 5, title: 'O plantão vazio', kind: 'investigar', report: 'A regra exige pelo menos 1 médico de plantão. Dois médicos saíram ao mesmo tempo e o hospital ficou sem ninguém.',
    code: "-- Mesmo código em T1 (médico 1) e T2 (médico 2), em paralelo:\nBEGIN ISOLATION LEVEL REPEATABLE READ;\nSELECT COUNT(*) FROM plantao WHERE ativo;   -- 2\n-- \"ainda sobra 1, posso sair\"\nUPDATE plantao SET ativo = false WHERE medico_id = :eu;\nCOMMIT;   -- as duas confirmam",
    question: 'Qual nível/estratégia impede essa anomalia (write skew)?',
    options: ['READ COMMITTED, pois lê dados mais recentes a cada comando.', 'REPEATABLE READ já impede; o erro foi do relógio do servidor.', 'SERIALIZABLE: o PostgreSQL detecta a dependência e aborta uma delas com erro 40001; a aplicação deve repetir a transação.', 'Criar um índice em plantao(ativo).', 'Adicionar FOR SHARE ao SELECT COUNT(*).'],
    correct: 2, explanation: 'Cada transação leu um snapshot válido e alterou linhas diferentes, então REPEATABLE READ não vê conflito: é o write skew. SERIALIZABLE (SSI) detecta o ciclo e aborta uma transação com serialization_failure (40001). FOR SHARE não é permitido com agregações; a alternativa seria travar as linhas lidas (SELECT medico_id ... WHERE ativo FOR UPDATE).', hint: 'As duas transações alteram linhas diferentes — qual nível enxerga a dependência entre leitura e escrita?', impact: 'PLANTÃO GARANTIDO' },
  { id: 24, world: 5, boss: true, title: 'O golpe de Dr. Null', kind: 'investigar', report: 'Uma transferência debitou a origem, mas o destino não existia. A procedure precisa ser segura em concorrência.',
    code: "CREATE PROCEDURE transferir(origem int, destino int, valor numeric)\nLANGUAGE plpgsql AS $$\nBEGIN\n UPDATE conta SET saldo = saldo - valor WHERE conta_id = origem;\n UPDATE conta SET saldo = saldo + valor WHERE conta_id = destino;\nEND; $$;",
    question: 'Qual plano de correção é tecnicamente mais completo?',
    options: ['Acrescentar apenas SELECT COUNT(*) das contas após os UPDATEs.', 'Usar duas transações independentes, uma para débito e outra para crédito.', 'Validar valor e destino; bloquear e conferir saldo da origem com FOR UPDATE; debitar e creditar na mesma transação; lançar exceções para estados inválidos.', 'Usar LIMIT 1 nos UPDATEs.', 'Envolver tudo em EXCEPTION WHEN OTHERS THEN NULL para que a chamada nunca falhe.'],
    correct: 2, explanation: 'Validação, bloqueio de linha, saldo suficiente e atomicidade impedem débito sem crédito. RAISE EXCEPTION reverte os efeitos da chamada na transação. Engolir exceções reproduziria o bug do incidente anterior.', hint: 'Uma operação financeira envolve pré-condições, concorrência e atomicidade.', impact: 'DR. NULL DERROTADO' },
];
