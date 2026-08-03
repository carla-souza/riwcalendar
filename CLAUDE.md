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
- **4 abas:** Programação · Salvas · Agenda · Mapa.
- **Modelo de 2 estados por palestra:** *Salvar* (triagem) e *Adicionar à agenda* (plano). Agenda ⊆ Salvas;
  remover da agenda MANTÉM salva (banco de reserva pra fila lotada). Detalhes no `PLANO.md`.

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

## Pendências
- Key do PostHog (pixel de acesso simples — Seção 6 do `PLANO.md`).
