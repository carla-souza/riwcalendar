# RIW Calendar — Plano de desenvolvimento

App pessoal e compartilhável pra organizar quais palestras assistir na Rio Innovation Week 2026
(programação enorme, muita coisa em paralelo, local gigante).

**Como retomar:** leia este arquivo inteiro. Cada seção tem um **Status**. Pegue a primeira
`⬜ A fazer` e siga os "Próximos passos". As decisões de produto já estão travadas abaixo — não
precisa redecidir, só executar. Regra geral da dona: **simples, sem overengineering**, mas com as
funcionalidades que realmente ajudam na logística.

---

## Orquestração (como construir este plano)

Modo de trabalho combinado com a Carla: **esta sessão roda em Opus e atua como GERENTE/orquestrador.
Os sub-agentes que fazem o código rodam em Sonnet** (mais barato). Fluxo:

1. Leia o `PLANO.md` inteiro e o `CLAUDE.md` (auto-carregado) e o `DESIGN.md`.
2. Pegue a **primeira seção `⬜`** na ordem: **0B → 1 → 2 → 3 → 4 → 4B**. Deixe **6 (PostHog)** e **7 (deploy)** por último.
3. Para cada seção, gere **um sub-agente em Sonnet** (`Agent` com `model: "sonnet"`, `subagent_type: "general-purpose"`) com um **prompt auto-contido**: mande ler `CLAUDE.md` + `PLANO.md` + `DESIGN.md` + o schema em `palestras.json`, fazer **só aquela seção**, não tocar em outras, e reportar o que mudou.
4. **Revise você mesmo (Opus)** o resultado: rode o site (`site/`), confira as abas, os dados, salvar/agenda, conflito/distância, sem erro no console, e leia o código contra o plano.
5. Se estiver certo → marque a seção como ✅ no `PLANO.md` e vá pra próxima. Se tiver erro → **continue o MESMO sub-agente** (SendMessage, preservando o contexto dele) pra corrigir, ou conserte pontualmente.
6. Repita até a aba Mapa. Depois PostHog (se houver key) e deploy. **Só chame a Carla no fim.**

Notas: sub-agentes começam "frios" — por isso o prompt precisa apontar os documentos. Prefira poucas
seções grandes a muitas tarefinhas (o custo de reler os docs se paga melhor assim). Mantenha o lean.

---

## Contexto travado (não mudar sem combinar com a Carla)

**Fonte dos dados.** A programação vem de uma API pública sem autenticação:
`https://api.rioinnovationweek.com.br/conferencia/ConfePublic` → `{ content: [conferências...] }`.
Cada conferência tem `.palestras`. O site oficial mostra só 50/dia (limite da UI), a API não tem limite.
Snapshot capturado em 2026-08-02: **78 conferências, 1401 palestras, dias 04–07/ago/2026**.

**Arquivos de dados (na raiz do projeto):**
- `raw_confepublic.json` — resposta bruta da API (backup).
- `palestras.json` — **1401 registros já achatados e limpos** (1 por palestra), ordenados por dia/hora. É a fonte pro app.
- `palcos_index.json` — os 48 palcos agrupados nos 7 prédios base.

**Schema de cada registro em `palestras.json`:**
```
id, titulo, descricao, tipo, trilha, conferencia, conferencia_id,
dia (YYYY-MM-DD), inicio (HH:MM), fim (HH:MM), data_inicio (ISO), data_fim (ISO),
predio, predio_base, palco,
palestrantes: [ { nome, empresa, cargo, foto, id } ]
```
- `trilha` = categoria (16 no total; ex: "Novas Tecnologias"). `tipo` = Painel/Palestra/Mini Palestra/WorkShop/etc.
- `predio_base` = um dos **7 nós de distância**: **Armazém 1, Armazém 2, Armazém 3, Armazém 4, Armazém 5, Kobra, NAM Atlântico**. (Atenção: há DOIS navios — o *Vital de Oliveira* é a varanda do Armazém 5, então foi mapeado como "Armazém 5"; só o *NAM Atlântico* é nó próprio.) Todos os 1401 registros mapeiam para um nó válido.
- Regenerar dados: re-curl o endpoint acima e rodar o script de flatten (a lógica está no histórico; campos acima). Fazer na véspera do evento — programação "sujeita a alterações".

**Modelo de estados (o coração do app).** Cada palestra tem DOIS estados independentes:
- **Salva** = "me interessa" (triagem rápida da lista gigante).
- **Na agenda** = "meu plano de verdade".
Regras:
- Agenda ⊆ Salvas. Adicionar à agenda → salva automático.
- **Remover da agenda → CONTINUA salva** (isto é intencional: as salvas são o "banco de reserva"
  pra quando a fila estiver enorme / auditório lotado e ela precisar de um plano B no mesmo horário).
- Remover das salvas → sai de tudo (inclusive da agenda).
- Estado no navegador: duas listas de IDs. `localStorage["riw_state"] = { salvas: [id...], agenda: [id...] }`.

**Quatro abas (decidido — não é filtro):**
- **Programação** — lista por dia, filtros + busca. Cada card com ações "Salvar" e "+ Agenda".
- **Salvas** — timeline por dia (igual agenda) pra ENXERGAR conflitos entre as salvas e promover pra agenda.
- **Agenda** — timeline enxuta do plano + alerta de conflito + alerta de distância. Remover mantém salva.
- **Mapa** — imagem da planta oficial do evento como referência visual (pra se localizar entre os prédios/palcos).

**Design (ver `DESIGN.md`):** base é o design system do **Trello (app iOS)** — sóbrio, legível, mobile-first. O que aproveitar:
- **Cores semânticas de alerta** (âmbar "due soon", vermelho "overdue", verde "done") → usar direto nos avisos de **conflito de horário** e **distância** da Agenda.
- **Card + lista densos** → estrutura da palestra e da lista por dia. Cards brancos, cantos ~8px, sombra levíssima com tinte navy (não preto puro), divisórias hairline.
- **Light + dark mode** (o Trello define os dois) → implementar ambos; dark é ótimo pro evento.
- **Azul de ação `#0C66E4`** pra CTAs/estados ativos; tinta navy `#172B4D` pro texto.
- **6 cores de label** → mapear pras 16 trilhas (agrupar/ciclar).
- Fonte de **sistema** (`-apple-system`/`system-ui`) com fallback **Inter** self-hosted — sem fonte proprietária.

**ADAPTAR iOS→web:** usar `px` no lugar de `pt`; **descartar** o que é específico de iOS/kanban (Dynamic Island, home indicator, arrastar card, board scroll horizontal, bottom sheet nativo). Nosso app é navegação por abas + listas/timelines, não um board Trello.

**Stack (confirmada):** site **estático, sem build** — HTML + JavaScript puro + `data.json` embutido.
Sem React, sem Vite, sem passo de compilação. Deploy no **Netlify** (arrastar a pasta). Estado no
`localStorage`, **sem login**. Link compartilhável com outros participantes (cada um tem a própria agenda).

**Regra de conflito de horário:** duas palestras do mesmo dia colidem se `inicio1 < fim2 && inicio2 < fim1`.

---

## Seção 0 — Captura e limpeza dos dados
**Status: ✅ Feita.**
1401 palestras capturadas e achatadas. Ver `palestras.json`, `raw_confepublic.json`, `palcos_index.json`.

---

## Seção 0B — Repositório no GitHub (deploy automático + editar do celular)
**Status: ✅ Feita.** Repo público: https://github.com/carla-souza/riwcalendar (branch `main`,
dados e mapa versionados, sem LFS). Falta só o passo 7 (Carla testar claude.ai/code pelo celular).
Objetivo: ter o projeto versionado no GitHub desde o começo, por dois motivos práticos:
1. **Netlify com deploy contínuo** — em vez de arrastar a pasta a cada mudança, o Netlify observa o
   repositório e republica sozinho a cada `push` (Seção 7).
2. **Claude Code no celular** — durante o evento, a Carla pode abrir o projeto em
   [claude.ai/code](https://claude.ai/code) pelo telefone e pedir ajustes; o Claude Code na nuvem
   trabalha em cima do repositório do GitHub e abre PR / faz push, o que dispara o redeploy do Netlify.
   Sem repositório, isso não existe — a pasta só vive no Mac dela.

Contexto útil: o `gh` CLI já está instalado e autenticado como **`carla-souza`**. O projeto ainda
**não** é um repositório git (`git init` ainda não foi rodado).

Próximos passos:
1. `git init` na raiz do projeto (branch `main`).
2. Criar `.gitignore` mínimo: `.DS_Store` (e nada mais por enquanto — não tem build nem `node_modules`).
3. **Versionar os JSONs de dados** (`palestras.json` 2,2 MB, `raw_confepublic.json` 3,2 MB,
   `distancias.json`, `palcos_index.json`) e a imagem do mapa. São grandes mas bem abaixo do limite do
   GitHub (100 MB/arquivo) e são justamente o que o app precisa pra funcionar no deploy. **Sem Git LFS.**
4. Primeiro commit com tudo que já existe (dados + `CLAUDE.md` + `DESIGN.md` + `PLANO.md` + `site/`).
5. Criar o repo remoto e subir: `gh repo create riwcalendar --public --source=. --remote=origin --push`.
   - **Público** faz sentido: não tem segredo nenhum aqui (dados de API pública, sem login, sem chave
     privada — a key do PostHog da Seção 6 também é pública por design) e facilita compartilhar. Se a
     Carla preferir, `--private` funciona igual pro Netlify e pro Claude Code.
6. Commitar ao fim de cada seção do plano (mensagens curtas em português, ex: `Seção 2: aba Programação`).
   Assim o histórico acompanha o plano e dá pra voltar atrás durante o evento.
7. Confirmar com a Carla que ela consegue abrir o repo em claude.ai/code pelo celular (teste rápido
   **antes** do evento, não no meio dele).

## Seção 1 — Estrutura base do site + estado
**Status: ✅ Feita.** `site/index.html` + `style.css` (tokens Trello, light/dark) + `app.js`
(estado em `localStorage["riw_state"]`, roteamento por hash, `corDaTrilha` com 5 cores — o vermelho
ficou reservado pros alertas). Regras de estado testadas em Node.
Objetivo: esqueleto do app com as 3 abas e o gerenciamento de estado no localStorage.
Próximos passos:
1. Criar pasta `site/` (é a pasta que vai pro Netlify). Copiar `palestras.json` → `site/data.json`.
2. `site/index.html`: mobile-first, CSS embutido (ou `site/style.css`). Header com título e navegação de 4 abas (Programação / Salvas / Agenda / Mapa).
3. `site/app.js`: carregar `data.json` via `fetch`. Funções de estado: `getState()`, `toggleSalva(id)`, `toggleAgenda(id)` (aplicando as regras do modelo acima), `isSalva(id)`, `naAgenda(id)`, persistindo em `localStorage["riw_state"]`.
4. Roteamento simples entre abas (mostrar/esconder seções; pode usar hash `#programacao` etc.).

## Seção 2 — Aba Programação (explorar + triar)
**Status: ✅ Feita.** Chips de dia + selects (trilha/prédio-base/tipo) + busca sem acento com
debounce 200ms, contagem, "Limpar filtros"; lista agrupada por dia, paginação de 80 ("Carregar mais"),
delegação de eventos, `escaparHtml` em tudo que vem da API. Testado em Chrome headless.
Objetivo: navegar as 1401 palestras e salvar/agendar rápido.
Próximos passos:
1. Barra de filtros: chips de **dia** (Todos/04/05/06/07); selects de **trilha**, **prédio**, **tipo**; **busca** por texto (título + palestrante + empresa).
2. Lista agrupada por dia, ordenada por horário. Card: badge de trilha, horário (`inicio–fim`), título, `predio — palco`, nomes dos palestrantes.
3. Cada card com 2 botões: **Salvar** (toggle) e **+ Agenda** (toggle). Estado visual refletindo salva/agenda.
4. Performance: são 1401 itens — renderizar só o subconjunto filtrado; evitar re-render pesado a cada tecla (debounce na busca).

## Seção 3 — Aba Salvas (decidir)
**Status: ✅ Feita.** Timeline por dia, conflitos marcados em âmbar com os títulos das concorrentes,
+/− Agenda e Remover das salvas, contagem "N salvas · M na agenda", estado vazio.
`window.RIW.acharConflitos(lista) → { id: [ids que colidem] }` é a função pura reusada pela Agenda.
Objetivo: ver as salvas em timeline por dia pra escolher o que vira agenda.
Próximos passos:
1. Timeline por dia, ordenada por horário, só itens salvos.
2. **Marcar conflitos** de horário visualmente (itens que se sobrepõem no mesmo dia).
3. Por item: **+ Agenda / − Agenda** e **Remover das salvas**.
4. (Bom ter) a partir de um horário, deixar claro quais salvas competem no mesmo slot.

## Seção 4 — Aba Agenda (executar no dia)
**Status: ✅ Feita — redesenhada em grid (2026-08-03, pedido da Carla).**
Não é mais lista vertical: é um **grid de horários estilo Google Calendar**, **um dia por vez**
(chips de dia no topo, sem "Todos"), 80px/hora, faixa de horas derivada dos itens daquele dia.
Cards sobrepostos **empilham lateralmente** (`window.RIW.posicionarNoGrid(itens) → [{id, coluna, totalColunas}]`,
clusters + colunas gulosas). O card resumido tem só **chip de caminhada + título**; o card é neutro com
fundo na cor da trilha bem clara e filete lateral. **Cor do chip vem só do tempo de caminhada**
(≤10 min âmbar, >10 min vermelho) — decisão da Carla, não olha a folga.
Clicar no card abre um **modal** (bottom-sheet no mobile). **Ordem do conteúdo (fixada com a Carla
em 2026-08-03):** trilha → conferência → título → `HH:MM–HH:MM · Prédio — Palco` → descrição →
palestrantes → aviso de caminhada (2 linhas) → "Remover da agenda" → **"Outras salvas nesse horário"
já aberto**. **Fora do modal:** o tipo (`Painel`), o selo "⚠ Conflito de horário" (a sobreposição já
se vê no grid) e a nota "Continua nas salvas". Fecha no ✕, no backdrop e no Esc.
O **card de intervalo entre cards saiu** (o grid já mostra o espaço) — `avaliarTrecho` e
`construirHtmlTrecho` continuam, usados dentro do modal.
`window.RIW.avaliarTrecho(ant, seg, matriz) → { custo, folga, nivel, mesmoPalco, de, para }`.

**Card de intervalo (ajustado com a Carla em 2026-08-03) — duas linhas:**
`🚶 ~X min de caminhada (De → Para)` + `⏰ ...`. Níveis e cores:
| condição | nivel | cor | linha 2 |
|---|---|---|---|
| mesmo palco | `ok` | não renderiza card | — |
| `folga − custo >= 10` | `ok` | cinza | `Você tem X min de intervalo` |
| `folga >= custo` e sobra `< 10` | `apertado` | âmbar | `Você tem X min de intervalo` |
| `folga < custo` e chega antes do fim | `atrasado` | âmbar | `Você vai chegar com N min de atraso` |
| chegada `>=` fim da palestra | `impossivel` | vermelho | `Você não vai chegar a tempo` |
Regra da dona: a linha do relógio **sempre diz quantos minutos de atraso**; `Você não vai chegar a
tempo` só quando a **chegada** (`fim da anterior + caminhada`) cai **depois do fim da seguinte** —
sobreposição de horário sozinha não basta, se ainda dá pra pegar um pedaço é atraso (âmbar).
⚠️ **A matriz agora existe em DOIS lugares:** `distancias.json` (raiz) e `site/distancias.json` (a que o
app carrega). Ao reeditar a matriz, **copie pra `site/`** — só a pasta `site/` vai pro Netlify.
Objetivo: o plano final, enxuto, com os alertas.
Próximos passos:
1. Timeline por dia só com itens da agenda.
2. **Alerta de conflito** de horário (idealmente zero, mas sinalizar se houver).
3. **Alerta de distância** entre itens consecutivos (usa a Seção 5).
4. **Remover da agenda** (mantém salva). (Bom ter) atalho "ver outras salvas nesse horário" pro cenário de fila/lotação.

## Seção 4B — Aba Mapa (referência visual)
**Status: ✅ Feita.** Planta com pan por scroll nativo + zoom 100/200/400% (botões −/+/Ajustar);
pinch nativo continua liberado. A imagem (534 KB) só baixa quando a aba abre. Legenda dos 7 nós
conferida contra a planta oficial (praças de acesso, Kobra recuado, NAM Atlântico em frente ao 1B/2,
varanda do *Vital de Oliveira* no Armazém 5).
Objetivo: mostrar a planta oficial do evento como referência pra se localizar entre prédios e palcos.
Arquivo: **`site/assets/mapa-evento.webp`** (já salvo; 4125×2250, ~534KB — planta oficial completa com legenda dos palcos).
Próximos passos:
1. Aba "Mapa": exibir a imagem **com zoom/pan no celular** (pinch-to-zoom). A imagem é larga (paisagem) e detalhada, então zoom é essencial no telefone. Pode ser um container com `overflow:auto` + imagem grande, ou uma lib mínima de pan/zoom. Sem overengineering.
2. (Bom ter) legenda curta ligando os 7 nós da matriz de distância aos rótulos do mapa (ex: "NAM Atlântico" = o navio; "Kobra" = Galpão Kobra à direita).

## Seção 5 — Inteligência de distância entre prédios
**Status: ✅ Matriz pronta e calibrada.** Falta só ligar na aba Agenda (Seção 4).
A matriz de tempo de caminhada entre os 7 nós está em **`distancias.json`** (na raiz).
- **Valores finais já incluem tudo:** lotação (2x) + buffer de saída de palco (+2 min) + piso mínimo de 5 min. Fórmula aplicada: `tempo = max(5, base_com_lotação + 2)`.
- **Calibração:** âncora real da Carla — Armazém 2→5 = 5 min no Google → 10 min com lotação; depois +2/piso 5 → **12 min** (valor final na matriz). Armazéns 1–5 em fila, espaçamento uniforme. Kobra e NAM Atlântico estimados pela posição relativa na planta oficial (Kobra recuado atrás do Armazém 4-5; NAM Atlântico atracado na frente do Armazém 2-3).
- **Diagonal = 5** (mesmo prédio, trocar de palco leva no mínimo 5 min). Formato: `distancias.json["matriz"][predio_base_A][predio_base_B]` → minutos (int, simétrico).

Como usar na aba Agenda:
1. Para cada par de itens **consecutivos** da agenda (mesmo dia, ordenados por horário): se for o **mesmo `palco`**, custo = 0 (fica no lugar, sem aviso). Senão, custo = `matriz[predio_base_ant][predio_base_seg]`.
2. `folga = (inicio_seguinte − fim_anterior)` em minutos. Se `folga < custo` → **alerta forte** ("não dá tempo / corre"). Se a folga for pequena mas suficiente → aviso ameno. Sempre mostrar "🚶 ~X min — A → B" quando prédios diferentes.
3. A matriz é fácil de reeditar em `distancias.json` (ver `regras` no arquivo) se quiser ajustar depois.

## Seção 6 — PostHog (pixel de acesso)
**Status: ⬜ A fazer — bloqueada (aguarda project key da Carla).**
Objetivo: só saber se tem gente acessando.
Próximos passos:
1. Adicionar o snippet padrão do PostHog no `index.html` com a **project API key** (é pública, pode ir no código).
2. Manter simples: pageview/autocapture. (Opcional: evento ao salvar/agendar.)
3. Deixar um placeholder claro (`POSTHOG_KEY = "..."`) até a key chegar.

## Seção 7 — Deploy no Netlify (a partir do GitHub)
**Status: ⬜ A fazer.**
Próximos passos:
1. No Netlify: **"Add new site → Import from Git"**, escolher o repo `riwcalendar` (Seção 0B).
   Configuração: **build command vazio** (não tem build) e **publish directory = `site`**.
   A partir daí, todo `push` na `main` republica sozinho — inclusive os pushes feitos do celular.
2. (Alternativa de emergência, se o Git travar) drag-and-drop da pasta `site/` no Netlify.
3. Testar no celular: filtros, salvar, agenda, conflitos, distância, persistência ao recarregar.
4. Passar o link pra Carla; ela compartilha com outros participantes.

---

## Pendências com a Carla
- [x] ~~Mapa oficial do evento (distâncias)~~ — recebido; matriz calibrada (Seção 5 / `distancias.json`).
- [x] ~~Arquivo da imagem da planta~~ — salvo em `site/assets/mapa-evento.webp` (Seção 4B).
- [ ] Project API key do PostHog (Seção 6).
