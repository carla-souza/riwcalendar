// ===========================================================
// RIW Calendar — app.js
// JS puro, sem módulos, sem build. Seção 1 do PLANO.md:
// estrutura base + estado (localStorage) + roteamento por hash.
// ===========================================================

(function () {
  'use strict';

  // -----------------------------------------------------------
  // Dados
  // -----------------------------------------------------------
  var PALESTRAS = []; // preenchido depois do fetch
  var DADOS_CARREGADOS = false;
  var PALESTRAS_POR_ID = {}; // índice id → palestra, montado junto com PALESTRAS

  function carregarDados() {
    return fetch('data.json')
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        PALESTRAS = Array.isArray(json) ? json : [];
        DADOS_CARREGADOS = true;
        PALESTRAS_POR_ID = {};
        for (var i = 0; i < PALESTRAS.length; i++) {
          PALESTRAS_POR_ID[PALESTRAS[i].id] = PALESTRAS[i];
        }
        return PALESTRAS;
      });
  }

  function getPalestraPorId(id) {
    return PALESTRAS_POR_ID[id];
  }

  // -----------------------------------------------------------
  // Cores de trilha
  // 16 trilhas → 5 cores de label do Trello, ciclando por índice
  // numa lista fixa e ordenada (determinístico e estável).
  // O vermelho (#F87168) fica reservado pros alertas de
  // conflito/distância, por isso usamos só 5 das 6 cores.
  // -----------------------------------------------------------
  var PALETA_TRILHAS = ['#4BCE97', '#F5CD47', '#FEA362', '#9F8FEF', '#579DFF'];
  // verde,    amarelo,  laranja,  roxo,     azul

  // Lista fixa das 16 trilhas conhecidas (snapshot de 2026-08-02),
  // já normalizada (sem espaço de largura zero / trim). Serve de
  // referência estável pro índice; trilha nova/desconhecida cai
  // no fallback de hash abaixo, sem quebrar.
  var TRILHAS_CONHECIDAS = [
    'Agronegócio',
    'Branding Experience',
    'Diversidade, Equidade e Inclusão',
    'Diálogos Inspiradores',
    'E-gov, Governança e Jurídico',
    'Economia Criativa - RIW Pop Tech',
    'Economia e Finanças',
    'Educação e Futuro do Trabalho',
    'Empreendedorismo e Open Innovation',
    'Energia',
    'Esporte',
    'Impacto Socioambiental e Mudança Climática',
    'Novas Tecnologias',
    'Saúde',
    'Sociedade, Arquitetura e Design',
    'Varejo'
  ];

  function normalizarTrilha(trilha) {
    // remove espaço de largura zero (U+200B) que aparece em algumas
    // trilhas vindas da API, ex.: "Educação e Futuro do Trabalho" + U+200B
    return String(trilha || '').replace(/\u200B/g, '').trim();
  }

  // corDaTrilha(trilha) → hex da cor de label pra essa trilha.
  // Índice fixo na lista conhecida % tamanho da paleta; trilha
  // fora da lista usa um hash simples da string (ainda estável).
  function corDaTrilha(trilha) {
    var nome = normalizarTrilha(trilha);
    var idx = TRILHAS_CONHECIDAS.indexOf(nome);
    if (idx === -1) {
      var hash = 0;
      for (var i = 0; i < nome.length; i++) {
        hash = (hash * 31 + nome.charCodeAt(i)) >>> 0;
      }
      idx = hash;
    }
    return PALETA_TRILHAS[idx % PALETA_TRILHAS.length];
  }

  // -----------------------------------------------------------
  // Estado (localStorage) — modelo de 2 estados
  // salvas = triagem ("me interessa")
  // agenda = plano final (agenda ⊆ salvas)
  // -----------------------------------------------------------
  var CHAVE_ESTADO = 'riw_state';

  function estadoVazio() {
    return { salvas: [], agenda: [] };
  }

  // normaliza um array qualquer pra lista de ids numéricos únicos
  function normalizarIds(lista) {
    if (!Array.isArray(lista)) return [];
    var vistos = {};
    var resultado = [];
    for (var i = 0; i < lista.length; i++) {
      var bruto = lista[i];
      // só aceita número/string numérica; null, "" e lixo viram NaN e caem fora
      var n = (typeof bruto === 'number' || (typeof bruto === 'string' && bruto.trim() !== ''))
        ? Number(bruto)
        : NaN;
      if (Number.isInteger(n) && n > 0 && !vistos[n]) {
        vistos[n] = true;
        resultado.push(n);
      }
    }
    return resultado;
  }

  // getState() — robusto a localStorage ausente/corrompido.
  function getState() {
    try {
      var bruto = localStorage.getItem(CHAVE_ESTADO);
      if (!bruto) return estadoVazio();
      var obj = JSON.parse(bruto);
      if (!obj || typeof obj !== 'object') return estadoVazio();
      return {
        salvas: normalizarIds(obj.salvas),
        agenda: normalizarIds(obj.agenda)
      };
    } catch (erro) {
      console.warn('riw: estado corrompido em localStorage, usando vazio.', erro);
      return estadoVazio();
    }
  }

  // saveState(s) — grava, tolerante a falha de storage (ex: modo privado).
  function saveState(estado) {
    var limpo = {
      salvas: normalizarIds(estado && estado.salvas),
      agenda: normalizarIds(estado && estado.agenda)
    };
    try {
      localStorage.setItem(CHAVE_ESTADO, JSON.stringify(limpo));
    } catch (erro) {
      console.warn('riw: não deu pra salvar o estado.', erro);
    }
    return limpo;
  }

  function isSalva(id) {
    var n = Number(id);
    return getState().salvas.indexOf(n) !== -1;
  }

  function naAgenda(id) {
    var n = Number(id);
    return getState().agenda.indexOf(n) !== -1;
  }

  // toggleSalva(id) — remover das salvas também remove da agenda
  // (agenda ⊆ salvas sempre).
  function toggleSalva(id) {
    var n = Number(id);
    var estado = getState();
    var idxSalva = estado.salvas.indexOf(n);
    if (idxSalva !== -1) {
      estado.salvas.splice(idxSalva, 1);
      var idxAgenda = estado.agenda.indexOf(n);
      if (idxAgenda !== -1) estado.agenda.splice(idxAgenda, 1);
    } else {
      estado.salvas.push(n);
    }
    return saveState(estado);
  }

  // toggleAgenda(id) — adicionar também garante salva; remover
  // MANTÉM salva (banco de reserva pra fila lotada).
  function toggleAgenda(id) {
    var n = Number(id);
    var estado = getState();
    var idxAgenda = estado.agenda.indexOf(n);
    if (idxAgenda !== -1) {
      estado.agenda.splice(idxAgenda, 1);
      // intencional: não mexe em salvas aqui
    } else {
      estado.agenda.push(n);
      if (estado.salvas.indexOf(n) === -1) estado.salvas.push(n);
    }
    return saveState(estado);
  }

  // -----------------------------------------------------------
  // Seção 2 — Aba Programação: escape, normalização e filtro
  // (funções puras, testáveis fora do navegador)
  // -----------------------------------------------------------

  // escaparHtml(s) — nunca deixar título/nome/empresa vindos da API
  // irem crus pro innerHTML.
  var MAPA_ESCAPE = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  function escaparHtml(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return MAPA_ESCAPE[c];
    });
  }

  // normalizarTexto(s) — minúsculo + sem acento, pra busca "inteligencia"
  // casar com "Inteligência".
  function normalizarTexto(s) {
    return String(s || '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase();
  }

  // filtrarPalestras(lista, filtros) — pura, sem tocar no DOM.
  // filtros: { dia, trilha, predio, tipo, busca }, todos opcionais
  // ('todos'/'todas' ou vazio = sem restrição nesse campo).
  function filtrarPalestras(lista, filtros) {
    filtros = filtros || {};
    var dia = filtros.dia || 'todos';
    var trilha = filtros.trilha || 'todas';
    var predio = filtros.predio || 'todos';
    var tipo = filtros.tipo || 'todos';
    var buscaNorm = normalizarTexto(filtros.busca || '');

    var resultado = (lista || []).filter(function (p) {
      if (dia !== 'todos' && p.dia !== dia) return false;
      if (trilha !== 'todas' && normalizarTrilha(p.trilha) !== trilha) return false;
      if (predio !== 'todos' && p.predio_base !== predio) return false;
      if (tipo !== 'todos' && p.tipo !== tipo) return false;

      if (buscaNorm) {
        var achou = normalizarTexto(p.titulo).indexOf(buscaNorm) !== -1;
        if (!achou && Array.isArray(p.palestrantes)) {
          for (var i = 0; i < p.palestrantes.length && !achou; i++) {
            var pal = p.palestrantes[i] || {};
            if (normalizarTexto(pal.nome).indexOf(buscaNorm) !== -1) achou = true;
            else if (normalizarTexto(pal.empresa).indexOf(buscaNorm) !== -1) achou = true;
          }
        }
        if (!achou) return false;
      }
      return true;
    });

    resultado.sort(function (a, b) {
      if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
      if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
      return 0;
    });

    return resultado;
  }

  // valores únicos de um campo, ordenados alfabeticamente (pt-BR)
  function valoresUnicosOrdenados(lista, seletor) {
    var vistos = {};
    var saida = [];
    for (var i = 0; i < lista.length; i++) {
      var v = seletor(lista[i]);
      if (v && !vistos[v]) {
        vistos[v] = true;
        saida.push(v);
      }
    }
    saida.sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });
    return saida;
  }

  function diasUnicos(lista) {
    var vistos = {};
    var saida = [];
    for (var i = 0; i < lista.length; i++) {
      var d = lista[i].dia;
      if (d && !vistos[d]) {
        vistos[d] = true;
        saida.push(d);
      }
    }
    saida.sort();
    return saida;
  }

  var DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

  // "2026-08-04" → "Terça, 04/08" (Date local, sem risco de fuso mudar o dia)
  function formatarCabecalhoDia(diaIso) {
    var partes = diaIso.split('-');
    var d = new Date(Number(partes[0]), Number(partes[1]) - 1, Number(partes[2]));
    return DIAS_SEMANA[d.getDay()] + ', ' + partes[2] + '/' + partes[1];
  }

  // -----------------------------------------------------------
  // Programação — estado dos filtros + paginação incremental
  // -----------------------------------------------------------
  var TAMANHO_PAGINA = 80;
  var programacaoInicializada = false;
  var qtdVisivel = TAMANHO_PAGINA;
  var filtroEstado = { dia: 'todos', trilha: 'todas', predio: 'todos', tipo: 'todos', busca: '' };

  function filtrosEstaoAtivos() {
    return filtroEstado.dia !== 'todos' ||
      filtroEstado.trilha !== 'todas' ||
      filtroEstado.predio !== 'todos' ||
      filtroEstado.tipo !== 'todos' ||
      filtroEstado.busca !== '';
  }

  function construirHtmlFiltros() {
    var dias = diasUnicos(PALESTRAS);
    var trilhas = valoresUnicosOrdenados(PALESTRAS, function (p) { return normalizarTrilha(p.trilha); });
    var predios = valoresUnicosOrdenados(PALESTRAS, function (p) { return p.predio_base; });
    var tipos = valoresUnicosOrdenados(PALESTRAS, function (p) { return p.tipo; });

    var html = '';
    html += '<p class="filtros__contagem" id="filtro-contagem"></p>';

    html += '<div class="filtros__dias" role="group" aria-label="Filtrar por dia">';
    html += '<button type="button" class="chip chip--ativo" data-dia="todos" aria-pressed="true">Todos</button>';
    dias.forEach(function (d) {
      var partes = d.split('-');
      html += '<button type="button" class="chip" data-dia="' + d + '" aria-pressed="false">' +
        partes[2] + '/' + partes[1] + '</button>';
    });
    html += '</div>';

    function opcoesSelect(valores) {
      return valores.map(function (v) {
        var esc = escaparHtml(v);
        return '<option value="' + esc + '">' + esc + '</option>';
      }).join('');
    }

    html += '<div class="filtros__linha">';
    html += '<label class="filtros__label" for="filtro-trilha">Trilha' +
      '<select id="filtro-trilha" class="filtros__select"><option value="todas">Todas</option>' +
      opcoesSelect(trilhas) + '</select></label>';
    html += '<label class="filtros__label" for="filtro-predio">Prédio' +
      '<select id="filtro-predio" class="filtros__select"><option value="todos">Todos</option>' +
      opcoesSelect(predios) + '</select></label>';
    html += '<label class="filtros__label" for="filtro-tipo">Tipo' +
      '<select id="filtro-tipo" class="filtros__select"><option value="todos">Todos</option>' +
      opcoesSelect(tipos) + '</select></label>';
    html += '</div>';

    html += '<div class="filtros__busca-linha">';
    html += '<label class="filtros__label filtros__label--busca" for="filtro-busca">Buscar' +
      '<input type="search" id="filtro-busca" class="filtros__busca" ' +
      'placeholder="Título, palestrante ou empresa…"></label>';
    html += '<button type="button" id="filtro-limpar" class="filtros__limpar" hidden>Limpar filtros</button>';
    html += '</div>';

    return html;
  }

  function atualizarBotaoLimpar(container) {
    var botao = container.querySelector('#filtro-limpar');
    if (botao) botao.hidden = !filtrosEstaoAtivos();
  }

  function marcarChipAtivo(container, chipClicado) {
    var chips = container.querySelectorAll('.chip');
    chips.forEach(function (chip) {
      var ativo = chip === chipClicado;
      chip.classList.toggle('chip--ativo', ativo);
      chip.setAttribute('aria-pressed', ativo ? 'true' : 'false');
    });
  }

  function aoMudarFiltro(container) {
    qtdVisivel = TAMANHO_PAGINA;
    atualizarBotaoLimpar(container);
    renderizarListaResultados();
  }

  function limparFiltros(container) {
    filtroEstado = { dia: 'todos', trilha: 'todas', predio: 'todos', tipo: 'todos', busca: '' };

    var chipTodos = container.querySelector('.chip[data-dia="todos"]');
    if (chipTodos) marcarChipAtivo(container, chipTodos);

    var selTrilha = container.querySelector('#filtro-trilha');
    var selPredio = container.querySelector('#filtro-predio');
    var selTipo = container.querySelector('#filtro-tipo');
    var busca = container.querySelector('#filtro-busca');
    if (selTrilha) selTrilha.value = 'todas';
    if (selPredio) selPredio.value = 'todos';
    if (selTipo) selTipo.value = 'todos';
    if (busca) busca.value = '';

    aoMudarFiltro(container);
  }

  function ligarEventosFiltros(container) {
    var elDias = container.querySelector('.filtros__dias');
    if (elDias) {
      elDias.addEventListener('click', function (evento) {
        var chip = evento.target.closest('.chip');
        if (!chip) return;
        filtroEstado.dia = chip.getAttribute('data-dia');
        marcarChipAtivo(container, chip);
        aoMudarFiltro(container);
      });
    }

    ['trilha', 'predio', 'tipo'].forEach(function (campo) {
      var el = container.querySelector('#filtro-' + campo);
      if (!el) return;
      el.addEventListener('change', function (evento) {
        filtroEstado[campo] = evento.target.value;
        aoMudarFiltro(container);
      });
    });

    var elBusca = container.querySelector('#filtro-busca');
    if (elBusca) {
      var temporizador = null;
      elBusca.addEventListener('input', function (evento) {
        var valor = evento.target.value;
        clearTimeout(temporizador);
        // debounce ~200ms: evita filtrar/renderizar a cada tecla
        temporizador = setTimeout(function () {
          filtroEstado.busca = valor;
          aoMudarFiltro(container);
        }, 200);
      });
    }

    var elLimpar = container.querySelector('#filtro-limpar');
    if (elLimpar) {
      elLimpar.addEventListener('click', function () { limparFiltros(container); });
    }
  }

  // -----------------------------------------------------------
  // Programação — lista de resultados (cards) + delegação
  // -----------------------------------------------------------
  function construirHtmlCard(p) {
    var cor = corDaTrilha(p.trilha);
    var salva = isSalva(p.id);
    var agendada = naAgenda(p.id);

    var local = p.predio || '';
    if (p.palco) local += ' — ' + p.palco;

    var nomes = '';
    if (Array.isArray(p.palestrantes) && p.palestrantes.length) {
      nomes = p.palestrantes.map(function (pal) { return pal && pal.nome; })
        .filter(Boolean).join(', ');
    }

    var html = '<article class="card" data-card-id="' + p.id + '">';
    html += '<span class="card__badge-trilha" style="background:' + cor + '">' +
      escaparHtml(normalizarTrilha(p.trilha)) + '</span>';
    html += '<div class="card__horario">' + escaparHtml(p.inicio) + '–' + escaparHtml(p.fim) + '</div>';
    html += '<h4 class="card__titulo">' + escaparHtml(p.titulo) + '</h4>';
    html += '<div class="card__local">' + escaparHtml(local) + '</div>';
    if (nomes) {
      html += '<div class="card__palestrantes">' + escaparHtml(nomes) + '</div>';
    }
    html += '<div class="card__acoes">';
    html += '<button type="button" class="botao ' + (salva ? 'botao--ativo' : 'botao--secundario') +
      '" data-acao="salvar" data-id="' + p.id + '" aria-pressed="' + salva + '">' +
      (salva ? '✓ Salva' : 'Salvar') + '</button>';
    html += '<button type="button" class="botao ' + (agendada ? 'botao--ativo' : 'botao--secundario') +
      '" data-acao="agenda" data-id="' + p.id + '" aria-pressed="' + agendada + '">' +
      (agendada ? '✓ Na agenda' : '+ Agenda') + '</button>';
    html += '</div>';
    html += '</article>';
    return html;
  }

  // agrupa por dia (a lista já vem ordenada por dia/inicio)
  function construirHtmlLista(itens) {
    var partes = [];
    var diaAtual = null;
    for (var i = 0; i < itens.length; i++) {
      var p = itens[i];
      if (p.dia !== diaAtual) {
        diaAtual = p.dia;
        partes.push('<h3 class="lista__cabecalho-dia">' + escaparHtml(formatarCabecalhoDia(p.dia)) + '</h3>');
      }
      partes.push(construirHtmlCard(p));
    }
    return partes.join('');
  }

  // atualiza só os botões de UM card, sem re-renderizar a lista inteira
  function atualizarBotoesCard(id) {
    var card = document.querySelector('.card[data-card-id="' + id + '"]');
    if (!card) return;
    var salva = isSalva(id);
    var agendada = naAgenda(id);

    var btnSalvar = card.querySelector('[data-acao="salvar"]');
    if (btnSalvar) {
      btnSalvar.className = 'botao ' + (salva ? 'botao--ativo' : 'botao--secundario');
      btnSalvar.setAttribute('aria-pressed', String(salva));
      btnSalvar.textContent = salva ? '✓ Salva' : 'Salvar';
    }
    var btnAgenda = card.querySelector('[data-acao="agenda"]');
    if (btnAgenda) {
      btnAgenda.className = 'botao ' + (agendada ? 'botao--ativo' : 'botao--secundario');
      btnAgenda.setAttribute('aria-pressed', String(agendada));
      btnAgenda.textContent = agendada ? '✓ Na agenda' : '+ Agenda';
    }
  }

  // delegação de eventos: um único listener no container da lista
  function aoClicarLista(evento) {
    var botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    var id = Number(botao.getAttribute('data-id'));
    var acao = botao.getAttribute('data-acao');
    if (acao === 'salvar') toggleSalva(id);
    else if (acao === 'agenda') toggleAgenda(id);
    atualizarBotoesCard(id); // regra: +Agenda também marca Salva, refletir os dois botões
  }

  function renderizarListaResultados() {
    var elLista = document.getElementById('programacao-conteudo');
    var elContagem = document.getElementById('filtro-contagem');
    if (!elLista) return;

    var resultado = filtrarPalestras(PALESTRAS, filtroEstado);

    if (elContagem) {
      elContagem.textContent = resultado.length + (resultado.length === 1 ? ' palestra' : ' palestras');
    }

    if (resultado.length === 0) {
      elLista.innerHTML = '<p class="lista__vazio">Nenhuma palestra encontrada com esses filtros.</p>';
      return;
    }

    var visiveis = resultado.slice(0, qtdVisivel);
    var html = construirHtmlLista(visiveis);

    if (resultado.length > visiveis.length) {
      html += '<button type="button" id="botao-carregar-mais" class="botao botao--secundario botao--carregar-mais">' +
        'Carregar mais (' + (resultado.length - visiveis.length) + ' restantes)</button>';
    }

    // um único innerHTML pra todo o lote — nada de appendChild item a item
    elLista.innerHTML = html;

    var botaoMais = document.getElementById('botao-carregar-mais');
    if (botaoMais) {
      botaoMais.addEventListener('click', function () {
        qtdVisivel += TAMANHO_PAGINA;
        renderizarListaResultados();
      });
    }
  }

  // -----------------------------------------------------------
  // Seção 3 — Aba Salvas: timeline + conflitos de horário
  // -----------------------------------------------------------

  // compararDiaHorario(a, b) — ordena por dia e depois por início.
  function compararDiaHorario(a, b) {
    if (a.dia !== b.dia) return a.dia < b.dia ? -1 : 1;
    if (a.inicio !== b.inicio) return a.inicio < b.inicio ? -1 : 1;
    return 0;
  }

  // acharConflitos(lista) — função pura: recebe uma lista de palestras
  // (cada uma com id, dia, inicio, fim) e devolve um objeto
  // { id: [ids que colidem com ele] }. Regra do PLANO.md: duas palestras
  // do MESMO dia colidem se inicio1 < fim2 && inicio2 < fim1 (encostadas
  // não colidem). Não lê estado nenhum — recebe a lista pronta, pra
  // poder ser reusada pela Agenda (Seção 4) com outra lista de entrada.
  function acharConflitos(lista) {
    var itens = lista || [];
    var resultado = {};
    for (var i = 0; i < itens.length; i++) {
      resultado[itens[i].id] = [];
    }
    for (var i = 0; i < itens.length; i++) {
      for (var j = i + 1; j < itens.length; j++) {
        var a = itens[i];
        var b = itens[j];
        if (a.dia !== b.dia) continue;
        if (a.inicio < b.fim && b.inicio < a.fim) {
          resultado[a.id].push(b.id);
          resultado[b.id].push(a.id);
        }
      }
    }
    return resultado;
  }

  // truncarTexto(s, n) — corta título comprido pro rótulo de conflito.
  function truncarTexto(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n - 1) + '…' : s;
  }

  // resumoConflitantes(ids, mapaPorId) — "Título A; Título B e mais N",
  // é o jeito simples de deixar claro QUEM compete no mesmo horário
  // (passo 4, "bom ter", do PLANO.md) sem inventar UI nova.
  var TITULOS_CONFLITO_MAX = 2;
  function resumoConflitantes(ids, mapaPorId) {
    var titulos = [];
    for (var i = 0; i < ids.length && titulos.length < TITULOS_CONFLITO_MAX; i++) {
      var pal = mapaPorId[ids[i]];
      if (pal) titulos.push(truncarTexto(pal.titulo, 28));
    }
    var resto = ids.length - titulos.length;
    var texto = titulos.join('; ');
    if (resto > 0) texto += (texto ? ' e mais ' : 'mais ') + resto;
    return texto;
  }

  // card da Salvas: mesma estrutura visual do card da Programação, mas
  // com ações diferentes (+Agenda/−Agenda + Remover das salvas) e
  // marca de conflito/"na agenda".
  function construirHtmlCardSalva(p, conflitantes, mapaPorId) {
    var cor = corDaTrilha(p.trilha);
    var agendada = naAgenda(p.id);
    var temConflito = conflitantes && conflitantes.length > 0;

    var local = p.predio || '';
    if (p.palco) local += ' — ' + p.palco;

    var nomes = '';
    if (Array.isArray(p.palestrantes) && p.palestrantes.length) {
      nomes = p.palestrantes.map(function (pal) { return pal && pal.nome; })
        .filter(Boolean).join(', ');
    }

    var classes = 'card';
    // conflito é o alerta mais urgente (âmbar); "na agenda" só marca a
    // borda quando não há conflito — o rótulo "● Na agenda" aparece
    // sempre, independente da borda.
    if (temConflito) classes += ' card--conflito';
    else if (agendada) classes += ' card--na-agenda';

    var html = '<article class="' + classes + '" data-card-id="' + p.id + '">';
    html += '<span class="card__badge-trilha" style="background:' + cor + '">' +
      escaparHtml(normalizarTrilha(p.trilha)) + '</span>';
    html += '<div class="card__horario">' + escaparHtml(p.inicio) + '–' + escaparHtml(p.fim) +
      ' <span class="card__tag-agenda"' + (agendada ? '' : ' hidden') + '>● Na agenda</span></div>';
    html += '<h4 class="card__titulo">' + escaparHtml(p.titulo) + '</h4>';
    html += '<div class="card__local">' + escaparHtml(local) + '</div>';
    if (nomes) {
      html += '<div class="card__palestrantes">' + escaparHtml(nomes) + '</div>';
    }
    if (temConflito) {
      html += '<div class="card__conflito">⚠ Conflito com ' + conflitantes.length +
        (conflitantes.length === 1 ? ' outra: ' : ' outras: ') +
        escaparHtml(resumoConflitantes(conflitantes, mapaPorId)) + '</div>';
    }
    html += '<div class="card__acoes">';
    html += '<button type="button" class="botao ' + (agendada ? 'botao--ativo' : 'botao--secundario') +
      '" data-acao="agenda" data-id="' + p.id + '" aria-pressed="' + agendada + '">' +
      (agendada ? '− Agenda' : '+ Agenda') + '</button>';
    html += '<button type="button" class="botao botao--secundario" data-acao="remover" data-id="' + p.id + '">' +
      'Remover das salvas</button>';
    html += '</div>';
    html += '</article>';
    return html;
  }

  // agrupa por dia (a lista já vem ordenada por dia/inicio)
  function construirHtmlListaSalvas(itens, conflitos, mapaPorId) {
    var partes = [];
    var diaAtual = null;
    for (var i = 0; i < itens.length; i++) {
      var p = itens[i];
      if (p.dia !== diaAtual) {
        diaAtual = p.dia;
        partes.push('<h3 class="lista__cabecalho-dia">' + escaparHtml(formatarCabecalhoDia(p.dia)) + '</h3>');
      }
      partes.push(construirHtmlCardSalva(p, conflitos[p.id] || [], mapaPorId));
    }
    return partes.join('');
  }

  // atualiza só a contagem do topo ("N salvas · M na agenda"), sem
  // re-renderizar a timeline inteira.
  function atualizarContagemSalvas() {
    var el = document.querySelector('#salvas-conteudo .filtros__contagem');
    if (!el) return;
    var estado = getState();
    var lista = estado.salvas.map(getPalestraPorId).filter(Boolean);
    var qtdAgenda = lista.filter(function (p) { return naAgenda(p.id); }).length;
    el.textContent = lista.length + (lista.length === 1 ? ' salva' : ' salvas') +
      ' · ' + qtdAgenda + ' na agenda';
  }

  // atualiza só o card afetado (+Agenda/−Agenda não muda o tamanho da
  // lista nem os conflitos dos vizinhos, então não precisa re-renderizar
  // tudo — só remover das salvas precisa, ver aoClicarSalvas).
  function atualizarCardSalva(id) {
    var card = document.querySelector('#salvas-conteudo .card[data-card-id="' + id + '"]');
    if (!card) return;
    var agendada = naAgenda(id);

    var btn = card.querySelector('[data-acao="agenda"]');
    if (btn) {
      btn.className = 'botao ' + (agendada ? 'botao--ativo' : 'botao--secundario');
      btn.setAttribute('aria-pressed', String(agendada));
      btn.textContent = agendada ? '− Agenda' : '+ Agenda';
    }

    var tag = card.querySelector('.card__tag-agenda');
    if (tag) tag.hidden = !agendada;

    // a borda de conflito (âmbar) tem prioridade visual; só alterna a
    // borda "na agenda" quando o card não estiver marcado em conflito
    if (!card.classList.contains('card--conflito')) {
      card.classList.toggle('card--na-agenda', agendada);
    }

    atualizarContagemSalvas();
  }

  // delegação de eventos: um único listener no container da timeline
  function aoClicarSalvas(evento) {
    var botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    var id = Number(botao.getAttribute('data-id'));
    var acao = botao.getAttribute('data-acao');

    if (acao === 'agenda') {
      toggleAgenda(id);
      atualizarCardSalva(id);
    } else if (acao === 'remover') {
      toggleSalva(id);
      // sai da lista → re-renderiza a timeline inteira (recalcula
      // conflitos dos vizinhos, que mudam quando este item some)
      renderizarListaSalvas();
    }
  }

  var salvasInicializada = false;

  // renderizarListaSalvas() — sempre relê o estado do zero (sem cache),
  // pra ficar em sincronia com o que foi feito na aba Programação.
  function renderizarListaSalvas() {
    var elConteudo = document.getElementById('salvas-conteudo');
    if (!elConteudo) return;

    var estado = getState();
    var listaSalvas = estado.salvas.map(getPalestraPorId).filter(Boolean);
    listaSalvas.sort(compararDiaHorario);

    if (listaSalvas.length === 0) {
      elConteudo.innerHTML = '<p class="lista__vazio">Nenhuma palestra salva ainda. ' +
        'Salve palestras na aba Programação pra triar aqui.</p>';
      return;
    }

    var mapaPorId = {};
    listaSalvas.forEach(function (p) { mapaPorId[p.id] = p; });

    var conflitos = acharConflitos(listaSalvas);
    var qtdAgenda = listaSalvas.filter(function (p) { return naAgenda(p.id); }).length;

    var html = '<p class="filtros__contagem">' + listaSalvas.length +
      (listaSalvas.length === 1 ? ' salva' : ' salvas') +
      ' · ' + qtdAgenda + ' na agenda</p>';
    html += construirHtmlListaSalvas(listaSalvas, conflitos, mapaPorId);

    elConteudo.innerHTML = html;
  }

  // -----------------------------------------------------------
  // Roteamento por hash (#programacao, #salvas, #agenda, #mapa)
  // -----------------------------------------------------------
  var ABAS_VALIDAS = ['programacao', 'salvas', 'agenda', 'mapa'];
  var ABA_PADRAO = 'programacao';

  function renderProgramacao() {
    var elFiltros = document.getElementById('programacao-filtros');
    var elLista = document.getElementById('programacao-conteudo');
    if (!elFiltros || !elLista) return;

    if (!DADOS_CARREGADOS) {
      elLista.innerHTML = '<p class="carregando">Carregando palestras…</p>';
      return;
    }

    // barra de filtros é construída e ligada só uma vez; cliques/troca de
    // filtro depois disso só re-renderizam a lista de resultados.
    if (!programacaoInicializada) {
      elFiltros.innerHTML = construirHtmlFiltros();
      ligarEventosFiltros(elFiltros);
      elLista.addEventListener('click', aoClicarLista);
      programacaoInicializada = true;
    }

    renderizarListaResultados();
  }

  function renderSalvas() {
    var elConteudo = document.getElementById('salvas-conteudo');
    if (!elConteudo) return;

    if (!DADOS_CARREGADOS) {
      elConteudo.innerHTML = '<p class="carregando">Carregando palestras…</p>';
      return;
    }

    // listener de delegação ligado só uma vez no container (o container
    // em si nunca é substituído, só o innerHTML dele)
    if (!salvasInicializada) {
      elConteudo.addEventListener('click', aoClicarSalvas);
      salvasInicializada = true;
    }

    // relê o estado do zero sempre que a aba abre — nada de cache
    renderizarListaSalvas();
  }

  function renderAgenda() {
    // stub — implementado na Seção 4 do PLANO.md
  }

  function renderMapa() {
    // stub — implementado na Seção 4B do PLANO.md
  }

  var RENDERERS = {
    programacao: renderProgramacao,
    salvas: renderSalvas,
    agenda: renderAgenda,
    mapa: renderMapa
  };

  function abaAtual() {
    var hash = (window.location.hash || '').replace('#', '');
    return ABAS_VALIDAS.indexOf(hash) !== -1 ? hash : ABA_PADRAO;
  }

  function mostrarAba(aba) {
    ABAS_VALIDAS.forEach(function (nome) {
      var secao = document.getElementById(nome);
      if (secao) secao.hidden = nome !== aba;
    });

    var botoes = document.querySelectorAll('.abas__botao');
    botoes.forEach(function (botao) {
      var ativo = botao.getAttribute('data-aba') === aba;
      if (ativo) {
        botao.setAttribute('aria-current', 'page');
      } else {
        botao.removeAttribute('aria-current');
      }
    });

    var render = RENDERERS[aba];
    if (typeof render === 'function') render();
  }

  function rotear() {
    mostrarAba(abaAtual());
  }

  function mostrarErroCarregamento(erro) {
    console.error('riw: falha ao carregar data.json', erro);
    var el = document.getElementById('programacao-conteudo');
    if (el) {
      el.innerHTML =
        '<p class="erro">Não foi possível carregar as palestras. ' +
        'Verifique sua conexão e recarregue a página.</p>';
    }
  }

  // -----------------------------------------------------------
  // Inicialização
  // -----------------------------------------------------------
  function iniciar() {
    var botoes = document.querySelectorAll('.abas__botao');
    botoes.forEach(function (botao) {
      botao.addEventListener('click', function () {
        var aba = botao.getAttribute('data-aba');
        if (window.location.hash === '#' + aba) {
          mostrarAba(aba); // mesma aba: re-render manual (hashchange não dispara)
        } else {
          window.location.hash = aba;
        }
      });
    });

    window.addEventListener('hashchange', rotear);

    rotear(); // mostra a aba certa (ou Programação) já de cara

    carregarDados()
      .then(function () {
        rotear(); // re-renderiza a aba ativa agora com dados
      })
      .catch(mostrarErroCarregamento);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }

  // -----------------------------------------------------------
  // Ponto de acesso global — facilita teste manual no console
  // e é usado pelas próximas seções do plano.
  // -----------------------------------------------------------
  window.RIW = {
    getState: getState,
    saveState: saveState,
    isSalva: isSalva,
    naAgenda: naAgenda,
    toggleSalva: toggleSalva,
    toggleAgenda: toggleAgenda,
    corDaTrilha: corDaTrilha,
    getPalestras: function () {
      return PALESTRAS;
    },
    RENDERERS: RENDERERS,
    // Seção 2 — expostas pra teste puro em Node (sem navegador)
    escaparHtml: escaparHtml,
    normalizarTexto: normalizarTexto,
    filtrarPalestras: filtrarPalestras,
    // Seção 3 — regra de conflito, genérica (a Seção 4/Agenda reusa)
    acharConflitos: acharConflitos
  };
})();
