# SQL QUEST — A Maldição dos Bugs

Jogo 2D de plataforma, inspirado na estética 16-bit, para revisão avançada de PostgreSQL / Banco de Dados Aplicado II. **Não utiliza marcas, personagens nem sprites de jogos comerciais.** Sons e músicas são sintetizados no navegador (Web Audio), sem arquivos externos.

**Jogar online:** https://nunesfb.github.io/bug_hunting_bd/

## Requisitos
Node.js 20+ e npm.

## Executar
```bash
npm install
npm run dev
```
Abra o endereço indicado pelo Vite (normalmente http://localhost:5173).

## Distribuir
```bash
npm run build
npm run preview
```
O build usa caminhos relativos, então a pasta `dist/` funciona em qualquer hospedagem estática (inclusive em subpastas).
Neste repositório, cada push na `main` dispara o workflow `.github/workflows/deploy.yml`, que gera o build e publica no branch `gh-pages` (GitHub Pages).

## Controles
- A/D ou setas: movimentar
- W / seta para cima / espaço: pular (segurar = pulo mais alto)
- E: interagir com terminal próximo
- P ou ESC: pausar / continuar
- No terminal: A–E (ou 1–5) escolhe, ENTER confirma, ESC sai
- Celular/tablet: botões de toque

## Regras
- **6 mundos × 4 incidentes = 24 bugs**, com dificuldade crescente: FÁCIL → MÉDIO → INTERMEDIÁRIO → AVANÇADO → EXPERT → LENDÁRIO.
- Os bugs de cada mundo são liberados em ordem; o 4º é o **chefe** do mundo. Resolvidos os 4, o portal no fim da fase leva ao próximo mundo.
- **2 horas** no cronômetro. O cronômetro **para durante a pausa** (botão ⏸, tecla P/ESC ou ao trocar de aba).
- XP por acerto cresce por mundo: 100, 150, 200, 250, 300, 400 (chefe vale 1,5×). Pista: recebe 70% do XP daquela questão. Erro: −10 a −35 XP conforme o mundo; tentativas ilimitadas.
- Vitória: bônus de 1 XP a cada 5 segundos restantes.
- As alternativas são embaralhadas por jogador(a) (cada partida tem uma ordem diferente).
- A plataforma também fica mais difícil: buracos, mais inimigos, inimigos voadores e plataformas móveis. Cair ou ser atingido **não** tira XP — volta-se ao último checkpoint.
- O progresso fica no `localStorage` do navegador: é possível fechar a aba e continuar depois no mesmo computador/navegador. REINICIAR apaga tudo (com confirmação).
- Os desafios simulam análises SQL; **não executam consultas reais** nem exigem PostgreSQL.

## Estrutura
- `src/main.tsx`: interface React, pontuação, pausa, salvamento, terminais
- `src/engine.ts`: engine Canvas (física em passo fixo, câmera, fases, inimigos, partículas)
- `src/audio.ts`: efeitos sonoros e trilha 8-bit procedural
- `src/data.ts`: história, mundos, gabaritos e desafios
- `src/style.css`: aparência retrô, animações e responsividade
- `BRIEFING_ALUNOS.md`: folha pronta para os alunos

## Nota
As respostas foram redigidas para PostgreSQL. Este é um jogo didático, não um emulador de banco SQL nem um ambiente que valida SQL livre.
