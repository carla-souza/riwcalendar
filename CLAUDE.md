# RIW Calendar

App web pessoal e compartilhável pra organizar quais palestras assistir na **Rio Innovation Week 2026**
(programação enorme, muita coisa em paralelo, local gigante no Píer Mauá).

## 👉 Antes de mexer, leia o `PLANO.md`
`PLANO.md` é a fonte da verdade: plano de desenvolvimento dividido em **seções com status**
(✅ feita / ⬜ a fazer). Pegue a primeira seção `⬜` e siga os "próximos passos". As decisões de
produto já estão travadas lá — não redecida, execute.

## O essencial
- **Stack:** site **estático, sem build** (HTML + JS puro + JSON embutido). Código no **GitHub** e
  deploy contínuo no **Netlify** (publish dir = `site/`, sem build command) — ver Seção 0B do `PLANO.md`.
  Sem login; estado no `localStorage`. Regra geral: **simples, sem overengineering.**
- **3 abas:** Programação · Agenda · Mapa. As "salvas" são um **filtro** na Programação, chamado **"Tenho interesse"** na UI (a aba dedicada saiu em 2026-08-03).
- **Modelo de 2 estados por palestra:** *Tenho interesse* (triagem) e *Adicionar à agenda* (plano).
  Agenda ⊆ interesses; remover da agenda MANTÉM o interesse (banco de reserva pra fila lotada).
  No código o estado ainda se chama `salvas` — só o texto da UI mudou. Detalhes no `PLANO.md`.

## Arquivos de dados (raiz)
- `palestras.json` — 1401 palestras achatadas (fonte do app). Snapshot da API em 2026-08-02.
- `raw_confepublic.json` — resposta bruta da API (backup).
- `distancias.json` — matriz de tempo de caminhada entre os 7 prédios (já com lotação/buffer/piso).
- `palcos_index.json` — palcos agrupados por prédio.
- `site/assets/mapa-evento.webp` — planta oficial do evento (aba Mapa).
- `DESIGN.md` — design system de referência: **Trello (app iOS)**. Base sóbria/legível, mobile-first, **light + dark mode**, cores semânticas de alerta prontas (âmbar/vermelho/verde → usar nos avisos de conflito e distância), cards+listas densos, fonte de sistema/Inter (sem fonte proprietária). **Adaptar iOS→web:** usar `px` em vez de `pt`, fonte de sistema/Inter, e descartar o que é específico de iOS/kanban (Dynamic Island, home indicator, arrastar card, board scroll horizontal). Mapear as 6 cores de label do Trello pras 16 trilhas.

## Dados: origem e refresh
API pública sem auth: `https://api.rioinnovationweek.com.br/conferencia/ConfePublic` → `{content:[...]}`.
Programação muda ("sujeita a alterações") — re-buscar e regenerar `palestras.json` na véspera. Schema e
detalhes no `PLANO.md`.

## Status
Todas as seções do `PLANO.md` (0 → 7) estão ✅ feitas — site no ar em https://riwcalendar.netlify.app,
deploy contínuo a partir do `main` no GitHub, PostHog instalado. Pendências reais (rotina, não
bloqueiam nada) ficam listadas em "Pendências com a Carla" no fim do `PLANO.md`.
