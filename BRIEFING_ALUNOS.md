# SQL QUEST — A Maldição dos Bugs
## Missão dos alunos | Banco de Dados Aplicado II

**Duração:** até 2 horas de jogo (o cronômetro para quando o jogo é pausado). **Formato:** individual. **Recurso:** navegador em computador (recomendado) ou dispositivo móvel. **Endereço:** https://nunesfb.github.io/bug_hunting_bd/ **Pré-requisito:** nenhuma instalação de PostgreSQL.

### Ano 1995. O Reino Digital está em perigo.
A empresa PixelWare controla pedidos, estoques, pagamentos e relatórios do comércio do Reino Digital. O Dr. Null infectou o sistema com **24 bugs críticos**, espalhados por seis mundos. Seu personagem, **Byte**, precisa atravessar as fases, localizar terminais danificados, analisar evidências SQL e selecionar correções técnicas defensáveis.

### Objetivo
Resolver os 24 incidentes e derrotar os seis chefes para estabilizar as operações. Priorize a **correção técnica e a justificativa**. Não basta acertar por tentativa — cada erro custa XP.

### Controles
- **A/D** ou **←/→** — movimentar Byte.
- **Espaço**, **W** ou **↑** — pular (segure para pular mais alto). Pule em cima dos bugs para esmagá-los.
- **E** — acessar terminal próximo.
- **P** ou **ESC** — pausar / continuar.
- No terminal: **A–E** escolhe a alternativa, **ENTER** confirma, **ESC** sai.

### Regras
1. São **seis mundos**, com **quatro terminais por mundo**, liberados em ordem. O 4º terminal é o **chefe** do mundo.
2. A dificuldade cresce a cada mundo — e o XP também:

   | Mundo | Dificuldade | XP por bug | XP do chefe | Erro |
   |---|---|---|---|---|
   | 1. Floresta das Transações | Fácil | 100 | 150 | −10 |
   | 2. Minas da Concorrência | Médio | 150 | 225 | −15 |
   | 3. Castelo das Triggers | Intermediário | 200 | 300 | −20 |
   | 4. Laboratório da Lentidão | Avançado | 250 | 375 | −25 |
   | 5. Cidadela das Funções | Expert | 300 | 450 | −30 |
   | 6. Fortaleza do Dr. Null | Lendário | 400 | 600 | −35 |

3. Usar a pista reduz a recompensa daquela questão para 70%.
4. Cair num buraco ou encostar num bug **não** tira XP: Byte volta ao último terminal resolvido.
5. Resolvidos os 4 bugs, o **portal** no fim da fase se abre e leva ao próximo mundo.
6. Vencer com tempo sobrando dá **bônus** de 1 XP a cada 5 segundos restantes.
7. O progresso é salvo no próprio navegador. Dá para pausar, fechar a aba e continuar depois **no mesmo computador e navegador**. Não use modo anônimo nem apague os dados do site.
8. A atividade é **individual**: é permitido consultar suas anotações, mas cada decisão precisa ser fundamentada por você.

### Os seis mundos
1. Floresta das Transações — BEGIN/COMMIT, ROLLBACK, SAVEPOINT, autocommit.
2. Minas da Concorrência — atualização perdida, FOR UPDATE, isolamento, deadlock.
3. Castelo das Triggers — BEFORE/AFTER, WHEN, RETURN NEW, recursão.
4. Laboratório da Lentidão — índices, EXPLAIN ANALYZE, views materializadas, estatísticas.
5. Cidadela das Funções — SQL dinâmico, volatilidade, SECURITY DEFINER.
6. Fortaleza do Dr. Null — NULL, exceções, SERIALIZABLE, procedures seguras.

### Registro individual (entregar ao professor)
**Nome:** ________________________ **Matrícula:** ________________

Para **cada mundo**, anote resumidamente:
- Qual foi o defeito principal encontrado no chefe do mundo?
- Que recurso do PostgreSQL resolve o problema? Por quê?
- Qual risco permaneceria se a solução não fosse aplicada?

**Resultado final:** ____/24 bugs; ____ XP; ____ erros; ____ pistas; patente: ______________.

### Discussão ao final
Escolha **uma decisão técnica** que gerou dúvida durante o jogo e prepare uma justificativa de 1 minuto para defender perante a turma. Diferencie *corrigir um sintoma* de *eliminar a causa*.

> Importante: os incidentes são simulações didáticas; nenhuma operação é executada num banco de dados real.
