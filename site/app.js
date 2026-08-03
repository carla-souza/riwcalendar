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
  var MATRIZ_DISTANCIAS = null; // Seção 5 — { predio_base: { predio_base: minutos } }; null se não carregou

  // carrega data.json (obrigatório) e distancias.json (opcional — Seção 4
  // usa pra avisos de distância, mas o app não pode quebrar sem ele).
  function carregarDados() {
    var carregarPalestras = fetch('data.json')
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

    var carregarMatriz = fetch('distancias.json')
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        MATRIZ_DISTANCIAS = (json && json.matriz) || null;
      })
      .catch(function (erro) {
        // degrade suave: Agenda funciona sem os avisos de distância
        console.warn('riw: não deu pra carregar distancias.json, ' +
          'Agenda vai ficar sem os avisos de distância.', erro);
        MATRIZ_DISTANCIAS = null;
      });

    return Promise.all([carregarPalestras, carregarMatriz]).then(function () {
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
  // Seção 4 — Aba Agenda: timeline enxuta + conflito (vermelho,
  // mais grave que o âmbar da Salvas) + alerta de distância entre
  // itens consecutivos (usa a matriz da Seção 5, distancias.json).
  // -----------------------------------------------------------

  // minutosDoHorario("HH:MM") → inteiro de minutos desde 00:00.
  // NaN se o formato vier estranho (não trava o app, só não alerta).
  function minutosDoHorario(horario) {
    var partes = String(horario || '').split(':');
    var h = Number(partes[0]);
    var m = Number(partes[1]);
    if (!isFinite(h) || !isFinite(m)) return NaN;
    return h * 60 + m;
  }

  // avaliarTrecho(anterior, seguinte, matriz) — função pura, o coração
  // da Seção 4. Recebe duas palestras consecutivas (mesmo dia, já
  // ordenadas por horário) e a matriz de distâncias (pode ser null).
  //
  // → { custo, folga, nivel, mesmoPalco, de, para }
  // - mesmoPalco: só true quando os dois têm `palco` não-nulo, MESMO
  //   `predio` e MESMO `palco` (armadilha real dos dados: `palco` é
  //   null em 142 registros, e o mesmo texto de palco existe em prédios
  //   diferentes — por isso o predio precisa bater também).
  // - custo: 0 se mesmoPalco; senão matriz[predio_base_ant][predio_base_seg];
  //   null se a matriz não tiver esse par (dado desconhecido — não inventa número).
  // - folga: minutos(seguinte.inicio) − minutos(anterior.fim). Pode ser
  //   negativa quando as palestras se sobrepõem de verdade.
  // - nivel (pedido da Carla após testar a Agenda — atraso causado só
  //   pelo deslocamento é ÂMBAR, não vermelho; vermelho fica reservado
  //   pra quando os HORÁRIOS realmente se sobrepõem):
  //     'ok'        — mesmoPalco, custo desconhecido, ou folga − custo >= 10.
  //     'apertado'  — folga >= custo mas folga − custo < 10 (dá tempo, é
  //                   só correria). Âmbar.
  //     'atrasado'  — folga >= 0 mas folga < custo: os horários NÃO se
  //                   sobrepõem, mas o deslocamento sozinho causa atraso
  //                   na chegada. Âmbar (não é culpa da programação).
  //     'impossivel'— folga < 0: as palestras se sobrepõem de verdade.
  //                   Vermelho.
  // - de/para: predio_base de origem/destino, pra montar o rótulo
  //   "Armazém 1 → Kobra".
  function avaliarTrecho(anterior, seguinte, matriz) {
    var mesmoPalco = !!(anterior.palco && seguinte.palco &&
      anterior.predio === seguinte.predio && anterior.palco === seguinte.palco);

    var custo;
    if (mesmoPalco) {
      custo = 0;
    } else {
      custo = null;
      if (matriz && matriz[anterior.predio_base] &&
        typeof matriz[anterior.predio_base][seguinte.predio_base] === 'number') {
        custo = matriz[anterior.predio_base][seguinte.predio_base];
      }
    }

    var folga = minutosDoHorario(seguinte.inicio) - minutosDoHorario(anterior.fim);

    var nivel;
    if (mesmoPalco) {
      nivel = 'ok'; // mesmo palco: fica no lugar, sem aviso — nunca é risco
    } else if (custo == null) {
      nivel = 'ok'; // sem dado de distância — não alarma
    } else if (folga < 0) {
      nivel = 'impossivel'; // sobreposição real de horário
    } else if (folga < custo) {
      nivel = 'atrasado'; // não sobrepõe, mas o deslocamento causa atraso
    } else if (folga - custo < 10) {
      nivel = 'apertado';
    } else {
      nivel = 'ok';
    }

    return {
      custo: custo,
      folga: folga,
      nivel: nivel,
      mesmoPalco: mesmoPalco,
      de: anterior.predio_base,
      para: seguinte.predio_base
    };
  }

  // candidatasMesmoHorario(item, todasSalvas) — salvas que NÃO estão na
  // agenda e colidem no horário com `item` (mesma regra de conflito),
  // pro atalho "ver outras salvas nesse horário" (plano B de fila/lotação).
  function candidatasMesmoHorario(item, todasSalvas) {
    return (todasSalvas || []).filter(function (s) {
      if (s.id === item.id) return false;
      if (naAgenda(s.id)) return false;
      if (s.dia !== item.dia) return false;
      return s.inicio < item.fim && item.inicio < s.fim;
    });
  }

  // construirHtmlTrecho(avaliacao) — o aviso vive ENTRE dois cards, não
  // dentro deles. Mesmo palco: sem card nenhum (não polui a timeline).
  // Duas linhas fixas (pedido da Carla, pra ficar fácil de ler correndo):
  //   linha 1: "🚶 ~X min de caminhada (De → Para)" — sempre.
  //   linha 2: "⏰ ..." com um dos 3 textos (intervalo / atraso / não
  //   vai chegar a tempo), conforme avaliacao.nivel.
  function construirHtmlTrecho(avaliacao) {
    if (avaliacao.mesmoPalco) return '';

    // mesmo prédio (só troca de palco) não vira "Armazém 3 → Armazém 3"
    var mesmoPredio = avaliacao.de === avaliacao.para;
    var rota = mesmoPredio
      ? 'outro palco no ' + escaparHtml(avaliacao.de)
      : escaparHtml(avaliacao.de) + ' → ' + escaparHtml(avaliacao.para);

    var linha1;
    if (avaliacao.custo == null) {
      // dado desconhecido: avisa que são prédios diferentes sem inventar minutos
      linha1 = '🚶 Caminhada (' + rota + ') — prédios diferentes, tempo desconhecido';
    } else {
      linha1 = '🚶 ~' + avaliacao.custo + ' min de caminhada (' + rota + ')';
    }

    var linha2;
    if (avaliacao.nivel === 'impossivel') {
      linha2 = '⏰ Você não vai chegar a tempo';
    } else if (avaliacao.nivel === 'atrasado') {
      linha2 = '⏰ Você vai chegar com ' + (avaliacao.custo - avaliacao.folga) + ' min de atraso';
    } else if (avaliacao.custo == null && avaliacao.folga < 0) {
      // custo desconhecido e a folga já é negativa: não dá pra afirmar
      // intervalo (folga negativa) nem calcular atraso (custo
      // desconhecido) — melhor não mostrar a linha 2 do que inventar.
      linha2 = '';
    } else {
      linha2 = '⏰ Você tem ' + avaliacao.folga + ' min de intervalo';
    }

    var html = '<div class="trecho trecho--' + avaliacao.nivel + '">';
    html += '<div class="trecho__linha">' + linha1 + '</div>';
    if (linha2) html += '<div class="trecho__linha">' + linha2 + '</div>';
    html += '</div>';
    return html;
  }

  // ESCALA_PX_MIN: pixels por minuto no grid (fonte única da escala —
  // da Carla). ALTURA_MIN_CARD_PX evita que um card de 30 min (a menor
  // duração dos dados) fique pequeno demais pra ler. LARGURA_MIN_COLUNA_PX
  // é o mínimo por coluna quando muitos itens se sobrepõem — depois
  // disso o grid rola por dentro (nunca a página).
  // 80px/hora: com 64px um card de 30 min (a menor duração dos dados)
  // não cabia chip + título e o texto ficava cortado no meio da linha.
  var ESCALA_PX_MIN = 80 / 60;
  var ALTURA_MIN_CARD_PX = 32;
  var LARGURA_MIN_COLUNA_PX = 92;

  function doisDigitos(n) {
    return (n < 10 ? '0' : '') + n;
  }

  // hojeIso() — data de hoje no formato YYYY-MM-DD (fuso local), pra
  // comparar com os dias do evento e escolher o dia padrão da Agenda.
  function hojeIso() {
    var agora = new Date();
    return agora.getFullYear() + '-' + doisDigitos(agora.getMonth() + 1) + '-' + doisDigitos(agora.getDate());
  }

  // diaPadraoAgenda(dias) — hoje, se for um dos dias do evento; senão
  // o primeiro dia (dias já vem ordenado por diasUnicos).
  function diaPadraoAgenda(dias) {
    var hoje = hojeIso();
    return dias.indexOf(hoje) !== -1 ? hoje : dias[0];
  }

  // itensAgendaPorDia(diaIso) — só os itens da agenda daquele dia,
  // ordenados por início. Relê o estado do zero (sem cache).
  function itensAgendaPorDia(diaIso) {
    var estado = getState();
    var lista = estado.agenda.map(getPalestraPorId).filter(Boolean)
      .filter(function (p) { return p.dia === diaIso; });
    lista.sort(compararDiaHorario);
    return lista;
  }

  // acharAnteriorAgenda(item, itensMesmoDia) — dentre os itens da agenda
  // do MESMO dia que começam antes de `item`, o que tem o maior `fim`
  // (não é necessariamente o item imediatamente anterior na lista: pode
  // ser uma sessão paralela mais longa). null se `item` for o primeiro
  // do dia. Usado tanto pro chip de caminhada do card quanto pro aviso
  // de caminhada do modal — as duas telas têm que concordar.
  function acharAnteriorAgenda(item, itensMesmoDia) {
    var melhor = null;
    for (var i = 0; i < itensMesmoDia.length; i++) {
      var outro = itensMesmoDia[i];
      if (outro.id === item.id) continue;
      if (!(outro.inicio < item.inicio)) continue;
      if (!melhor || outro.fim > melhor.fim) melhor = outro;
    }
    return melhor;
  }

  // posicionarNoGrid(itens) — função pura (exposta em window.RIW pro
  // teste em Node). Recebe os itens de UM dia e devolve, pra cada um,
  // { id, coluna, totalColunas }. Algoritmo em 2 passos:
  // 1) agrupa em clusters de itens transitivamente sobrepostos (encostados
  //    NÃO se sobrepõem — mesma regra de acharConflitos);
  // 2) dentro de cada cluster, atribui colunas de forma gulosa: cada item
  //    (em ordem de início) entra na primeira coluna cujo último item já
  //    terminou; se nenhuma servir, abre coluna nova.
  function posicionarNoGrid(itens) {
    var lista = itens || [];
    var resultado = [];
    if (!lista.length) return resultado;

    // ordena defensivamente por início — a função é pura e não deve
    // presumir que quem chama nunca erra a ordem.
    var ordenada = lista.slice().sort(function (a, b) {
      return minutosDoHorario(a.inicio) - minutosDoHorario(b.inicio);
    });

    var clusterAtual = [];
    var maiorFimCluster = -Infinity;

    function fecharCluster() {
      if (!clusterAtual.length) return;
      var fimPorColuna = []; // fimPorColuna[c] = minuto em que a coluna c fica livre
      var atribuicoes = [];
      clusterAtual.forEach(function (item) {
        var inicioMin = minutosDoHorario(item.inicio);
        var fimMin = minutosDoHorario(item.fim);
        var colocado = false;
        for (var c = 0; c < fimPorColuna.length; c++) {
          if (fimPorColuna[c] <= inicioMin) {
            fimPorColuna[c] = fimMin;
            atribuicoes.push({ id: item.id, coluna: c });
            colocado = true;
            break;
          }
        }
        if (!colocado) {
          fimPorColuna.push(fimMin);
          atribuicoes.push({ id: item.id, coluna: fimPorColuna.length - 1 });
        }
      });
      var totalColunas = fimPorColuna.length;
      atribuicoes.forEach(function (a) {
        resultado.push({ id: a.id, coluna: a.coluna, totalColunas: totalColunas });
      });
      clusterAtual = [];
      maiorFimCluster = -Infinity;
    }

    ordenada.forEach(function (item) {
      var inicioMin = minutosDoHorario(item.inicio);
      var fimMin = minutosDoHorario(item.fim);
      if (clusterAtual.length && inicioMin >= maiorFimCluster) {
        fecharCluster();
      }
      clusterAtual.push(item);
      if (fimMin > maiorFimCluster) maiorFimCluster = fimMin;
    });
    fecharCluster();

    return resultado;
  }

  // calcularFaixaHoras(itens) — hora cheia do primeiro início até a hora
  // cheia ACIMA do último fim, pra não desenhar 24h vazias no grid.
  function calcularFaixaHoras(itens) {
    var minInicio = Infinity;
    var maxFim = -Infinity;
    itens.forEach(function (p) {
      var ini = minutosDoHorario(p.inicio);
      var fim = minutosDoHorario(p.fim);
      if (ini < minInicio) minInicio = ini;
      if (fim > maxFim) maxFim = fim;
    });
    if (!isFinite(minInicio) || !isFinite(maxFim)) return null;
    var horaInicio = Math.floor(minInicio / 60);
    var horaFim = Math.ceil(maxFim / 60);
    if (horaFim <= horaInicio) horaFim = horaInicio + 1; // guarda mínima
    return { horaInicio: horaInicio, horaFim: horaFim };
  }

  // chip de caminhada do card resumido — regra da Carla: a cor sai só
  // do CUSTO (tempo de caminhada), nunca da folga. custo desconhecido
  // (matriz sem esse par) mostra "🚶 ?" em neutro, sem inventar minuto.
  function construirHtmlChipCaminhadaGrid(anterior, item) {
    var avaliacao = avaliarTrecho(anterior, item, MATRIZ_DISTANCIAS);
    if (avaliacao.mesmoPalco) return '';

    var nivelChip, texto;
    if (avaliacao.custo == null) {
      nivelChip = 'neutro';
      texto = '🚶 ?';
    } else if (avaliacao.custo <= 10) {
      nivelChip = 'amber';
      texto = '🚶 ' + avaliacao.custo + ' min';
    } else {
      nivelChip = 'vermelho';
      texto = '🚶 ' + avaliacao.custo + ' min';
    }
    return '<span class="agenda-grade__chip-caminhada agenda-grade__chip-caminhada--' + nivelChip + '">' +
      texto + '</span>';
  }

  // card resumido dentro do grid: só chip de caminhada (se houver) +
  // título truncado + horário (se o card for alto o bastante). Nada de
  // palestrantes/local/conflito aqui — isso tudo foi pro modal.
  function construirHtmlCardGradeAgenda(p, itensMesmoDia, pos, horaInicioFaixa) {
    var coluna = pos ? pos.coluna : 0;
    var totalColunas = pos ? pos.totalColunas : 1;
    var inicioMin = minutosDoHorario(p.inicio);
    var fimMin = minutosDoHorario(p.fim);

    var top = (inicioMin - horaInicioFaixa * 60) * ESCALA_PX_MIN;
    var altura = Math.max(ALTURA_MIN_CARD_PX, (fimMin - inicioMin) * ESCALA_PX_MIN);
    var left = (coluna / totalColunas) * 100;
    var largura = 'calc(' + (100 / totalColunas) + '% - 2px)';
    var cor = corDaTrilha(p.trilha);

    var anterior = acharAnteriorAgenda(p, itensMesmoDia);
    var chip = anterior ? construirHtmlChipCaminhadaGrid(anterior, p) : '';

    // Quantas linhas de título cabem: calculado, não chutado por faixa de
    // altura — senão a última linha fica cortada no meio das letras.
    // Alturas em px do que existe dentro do card (bate com o style.css).
    var PADDING_V = 6, ALTURA_CHIP = 18, ALTURA_LINHA = 15, ALTURA_HORARIO = 16;
    var disponivel = altura - PADDING_V - (chip ? ALTURA_CHIP : 0);
    var linhas = Math.max(1, Math.floor(disponivel / ALTURA_LINHA));
    // o horário só entra se sobrar espaço DEPOIS do título (o grid já
    // posiciona no horário certo, então ele é o primeiro a cair)
    var horarioHtml = (disponivel - linhas * ALTURA_LINHA >= ALTURA_HORARIO)
      ? '<span class="agenda-grade__card-horario">' + escaparHtml(p.inicio) + '</span>'
      : '';

    // fundo = cor da trilha bem clara (hex + alpha). Card branco sobre o
    // container branco ficava invisível; o chip de caminhada continua
    // sendo a única cor forte (âmbar/vermelho), então ele ainda salta.
    var html = '<button type="button" class="agenda-grade__card" data-id="' + p.id + '" ' +
      'style="top:' + top + 'px; height:' + altura + 'px; left:' + left + '%; width:' + largura +
      '; border-left-color:' + cor + '; background:' + cor + '2E" ' +
      'aria-label="' + escaparHtml(p.titulo) + ', ' + escaparHtml(p.inicio) + ' às ' + escaparHtml(p.fim) + '">';
    html += chip;
    html += '<span class="agenda-grade__card-titulo" style="-webkit-line-clamp:' + linhas + '">' +
      escaparHtml(p.titulo) + '</span>';
    html += horarioHtml;
    html += '</button>';
    return html;
  }

  // grid do dia: coluna de horas + área de eventos com hairlines a cada
  // hora e os cards posicionados por posicionarNoGrid.
  function construirHtmlGradeAgenda(itens) {
    var faixa = calcularFaixaHoras(itens);
    var alturaTotal = (faixa.horaFim - faixa.horaInicio) * 60 * ESCALA_PX_MIN;

    var posicoes = posicionarNoGrid(itens);
    var mapaPos = {};
    posicoes.forEach(function (p) { mapaPos[p.id] = p; });

    var maxColunas = 1;
    posicoes.forEach(function (p) { if (p.totalColunas > maxColunas) maxColunas = p.totalColunas; });

    var rotulos = '';
    var linhas = '';
    for (var h = faixa.horaInicio; h <= faixa.horaFim; h++) {
      // mesma escala dos cards — hardcodar aqui desalinhava tudo
      var top = (h - faixa.horaInicio) * 60 * ESCALA_PX_MIN;
      linhas += '<div class="agenda-grade__linha-hora" style="top:' + top + 'px"></div>';
      if (h < faixa.horaFim) {
        rotulos += '<div class="agenda-grade__rotulo-hora" style="top:' + top + 'px">' +
          doisDigitos(h) + ':00</div>';
      }
    }

    var cardsHtml = itens.map(function (p) {
      return construirHtmlCardGradeAgenda(p, itens, mapaPos[p.id], faixa.horaInicio);
    }).join('');

    var html = '<div class="agenda-grade">';
    html += '<div class="agenda-grade__horas" style="height:' + alturaTotal + 'px">' + rotulos + '</div>';
    html += '<div class="agenda-grade__area">';
    html += '<div class="agenda-grade__eventos" style="height:' + alturaTotal + 'px; min-width:' +
      (maxColunas * LARGURA_MIN_COLUNA_PX) + 'px">';
    html += linhas;
    html += cardsHtml;
    html += '</div></div></div>';
    return html;
  }

  // cabeçalho da Agenda: chips de dia (sem "Todos" — a Agenda mostra um
  // dia por vez) + cabeçalho do dia + contagem.
  function construirHtmlCabecalhoAgenda(dias, diaSelecionado, qtdNoDia) {
    var html = '<div class="filtros">';
    html += '<div class="filtros__dias" role="group" aria-label="Selecionar dia da agenda">';
    dias.forEach(function (d) {
      var partes = d.split('-');
      var ativo = d === diaSelecionado;
      html += '<button type="button" class="chip' + (ativo ? ' chip--ativo' : '') + '" ' +
        'data-dia-agenda="' + d + '" aria-pressed="' + ativo + '">' + partes[2] + '/' + partes[1] + '</button>';
    });
    html += '</div>';
    html += '<h3 class="lista__cabecalho-dia agenda-grade__cabecalho-dia">' +
      escaparHtml(formatarCabecalhoDia(diaSelecionado)) + '</h3>';
    html += '<p class="filtros__contagem">' + qtdNoDia + ' na agenda nesse dia</p>';
    html += '</div>';
    return html;
  }

  var agendaDiaSelecionado = null; // dia mostrado na aba; escolhido em diaPadraoAgenda na 1ª vez

  // renderizarAgendaGrade() — relê o estado do zero (sem cache) e
  // re-renderiza chips + grid do dia selecionado inteiros.
  function renderizarAgendaGrade() {
    var elConteudo = document.getElementById('agenda-conteudo');
    if (!elConteudo) return;

    var dias = diasUnicos(PALESTRAS); // todos os dias do EVENTO, não só os com itens na agenda
    if (!dias.length) {
      elConteudo.innerHTML = '<p class="lista__vazio">Nenhum dia de evento carregado.</p>';
      return;
    }

    if (!agendaDiaSelecionado || dias.indexOf(agendaDiaSelecionado) === -1) {
      agendaDiaSelecionado = diaPadraoAgenda(dias);
    }

    var itensDoDia = itensAgendaPorDia(agendaDiaSelecionado);

    var html = construirHtmlCabecalhoAgenda(dias, agendaDiaSelecionado, itensDoDia.length);
    if (!itensDoDia.length) {
      html += '<p class="lista__vazio">Nada na agenda nesse dia. Adicione a partir das Salvas ou da Programação.</p>';
    } else {
      html += construirHtmlGradeAgenda(itensDoDia);
    }

    elConteudo.innerHTML = html;
  }

  // -----------------------------------------------------------
  // Modal de detalhes da Agenda — um único elemento reaproveitado
  // (nunca um por card), criado sob demanda e anexado ao <body>.
  // -----------------------------------------------------------
  var modalAgendaEl = null;
  var modalIdAtual = null; // id da palestra aberta no modal (pra reabrir depois de promover)
  var elementoFocoAntesDoModal = null; // foco a devolver quando o modal fechar

  function garantirModalAgenda() {
    if (modalAgendaEl) return modalAgendaEl;
    var el = document.createElement('div');
    el.id = 'agenda-modal';
    el.className = 'modal';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'agenda-modal-titulo');
    el.innerHTML =
      '<div class="modal__backdrop" data-acao-modal="fechar"></div>' +
      '<div class="modal__painel">' +
      '<button type="button" class="modal__fechar" data-acao-modal="fechar" aria-label="Fechar">✕</button>' +
      '<div class="modal__corpo" id="agenda-modal-corpo"></div>' +
      '</div>';
    document.body.appendChild(el);
    el.addEventListener('click', aoClicarModalAgenda);
    document.addEventListener('keydown', aoTecladoModalAgenda);
    modalAgendaEl = el;
    return el;
  }

  // construirHtmlModalAgenda(p, ...) — TODOS os detalhes (o que hoje está
  // no card da Agenda + no card da Programação): trilha, horário, título,
  // local, palestrantes, tipo, conferência, descrição, aviso de caminhada
  // (reusa construirHtmlTrecho), selo de conflito, remover da agenda e
  // "outras salvas nesse horário" JÁ ABERTO (pedido explícito da Carla).
  function construirHtmlModalAgenda(p, itensMesmoDia, todasSalvas, conflitos) {
    var cor = corDaTrilha(p.trilha);
    var local = p.predio || '';
    if (p.palco) local += ' — ' + p.palco;

    var html = '';
    html += '<span class="card__badge-trilha" style="background:' + cor + '">' +
      escaparHtml(normalizarTrilha(p.trilha)) + '</span>';
    html += '<div class="card__horario">' + escaparHtml(p.inicio) + '–' + escaparHtml(p.fim) + '</div>';
    html += '<h3 id="agenda-modal-titulo" class="modal__titulo">' + escaparHtml(p.titulo) + '</h3>';
    html += '<div class="card__local">' + escaparHtml(local) + '</div>';

    if (Array.isArray(p.palestrantes) && p.palestrantes.length) {
      html += '<ul class="modal__palestrantes">';
      p.palestrantes.forEach(function (pal) {
        if (!pal || !pal.nome) return;
        var texto = pal.nome + (pal.empresa ? ' — ' + pal.empresa : '');
        html += '<li>' + escaparHtml(texto) + '</li>';
      });
      html += '</ul>';
    }

    var meta = [];
    if (p.tipo) meta.push(escaparHtml(p.tipo));
    if (p.conferencia) meta.push(escaparHtml(p.conferencia));
    if (meta.length) html += '<div class="modal__meta">' + meta.join(' · ') + '</div>';

    // a descrição vai pro FIM do modal (montada mais abaixo): no dia do
    // evento o que importa primeiro é caminhada, conflito, ações e o
    // plano B — descrição longa empurrava tudo isso pra fora da tela.
    var anterior = acharAnteriorAgenda(p, itensMesmoDia);
    if (anterior) {
      html += construirHtmlTrecho(avaliarTrecho(anterior, p, MATRIZ_DISTANCIAS));
    }

    var conflitantes = (conflitos && conflitos[p.id]) || [];
    if (conflitantes.length) {
      html += '<div class="card__conflito card__conflito--grave">⚠ Conflito de horário com ' +
        conflitantes.length +
        (conflitantes.length === 1 ? ' outra palestra da agenda' : ' outras palestras da agenda') +
        '</div>';
    }

    html += '<div class="modal__acoes">';
    html += '<button type="button" class="botao botao--secundario" data-acao-modal="remover-agenda" data-id="' +
      p.id + '">Remover da agenda</button>';
    html += '<p class="agenda-item__nota">Continua nas salvas.</p>';
    html += '</div>';

    var candidatas = candidatasMesmoHorario(p, todasSalvas);
    html += '<div class="modal__outras">';
    html += '<h4 class="modal__outras-titulo">Outras salvas nesse horário</h4>';
    if (candidatas.length) {
      html += '<div class="agenda-item__outras-lista">';
      candidatas.forEach(function (c) {
        var localC = c.predio || '';
        if (c.palco) localC += ' — ' + c.palco;
        html += '<div class="agenda-item__outras-item">';
        html += '<div class="agenda-item__outras-info">';
        html += '<strong>' + escaparHtml(c.titulo) + '</strong>';
        html += '<span>' + escaparHtml(c.inicio) + '–' + escaparHtml(c.fim) + ' · ' + escaparHtml(localC) + '</span>';
        html += '</div>';
        html += '<button type="button" class="botao botao--secundario" data-acao-modal="promover" data-id="' +
          c.id + '">+ Agenda</button>';
        html += '</div>';
      });
      html += '</div>';
    } else {
      html += '<p class="modal__outras-vazio">Nenhuma outra salva nesse horário.</p>';
    }
    html += '</div>';

    if (p.descricao) {
      html += '<p class="modal__descricao">' + escaparHtml(p.descricao) + '</p>';
    }

    return html;
  }

  // atualizarConteudoModalAgenda() — reconstrói o corpo do modal sem
  // fechar/reabrir (usado depois de "promover", pra sumir a candidata
  // da lista de "outras salvas" e refletir o novo estado).
  function atualizarConteudoModalAgenda() {
    if (modalIdAtual == null) return;
    var p = getPalestraPorId(modalIdAtual);
    if (!p) { fecharModalAgenda(); return; }

    var estado = getState();
    var todasSalvas = estado.salvas.map(getPalestraPorId).filter(Boolean);
    var listaAgendaCompleta = estado.agenda.map(getPalestraPorId).filter(Boolean);
    var conflitos = acharConflitos(listaAgendaCompleta);
    var itensMesmoDia = itensAgendaPorDia(p.dia);

    var corpo = document.getElementById('agenda-modal-corpo');
    if (corpo) corpo.innerHTML = construirHtmlModalAgenda(p, itensMesmoDia, todasSalvas, conflitos);
  }

  function abrirModalAgenda(id) {
    var p = getPalestraPorId(id);
    if (!p) return;

    var modal = garantirModalAgenda();
    modalIdAtual = id;

    var estado = getState();
    var todasSalvas = estado.salvas.map(getPalestraPorId).filter(Boolean);
    var listaAgendaCompleta = estado.agenda.map(getPalestraPorId).filter(Boolean);
    var conflitos = acharConflitos(listaAgendaCompleta);
    var itensMesmoDia = itensAgendaPorDia(p.dia);

    var corpo = document.getElementById('agenda-modal-corpo');
    corpo.innerHTML = construirHtmlModalAgenda(p, itensMesmoDia, todasSalvas, conflitos);

    elementoFocoAntesDoModal = document.activeElement;
    modal.hidden = false;
    document.body.classList.add('modal-aberto'); // trava o scroll do body

    var botaoFechar = modal.querySelector('.modal__fechar');
    if (botaoFechar) botaoFechar.focus();
  }

  function fecharModalAgenda() {
    var modal = document.getElementById('agenda-modal');
    if (!modal || modal.hidden) return;
    modal.hidden = true;
    modalIdAtual = null;
    document.body.classList.remove('modal-aberto');
    if (elementoFocoAntesDoModal && typeof elementoFocoAntesDoModal.focus === 'function') {
      elementoFocoAntesDoModal.focus();
    }
    elementoFocoAntesDoModal = null;
  }

  function aoClicarModalAgenda(evento) {
    var alvo = evento.target.closest('[data-acao-modal]');
    if (!alvo) return;
    var acao = alvo.getAttribute('data-acao-modal');

    if (acao === 'fechar') {
      fecharModalAgenda();
      return;
    }

    var id = Number(alvo.getAttribute('data-id'));
    if (acao === 'remover-agenda') {
      toggleAgenda(id);
      fecharModalAgenda(); // remover fecha o modal (pedido do plano)
      renderizarAgendaGrade();
    } else if (acao === 'promover') {
      toggleAgenda(id);
      renderizarAgendaGrade(); // grid do fundo reflete a nova palestra agendada
      atualizarConteudoModalAgenda(); // e some da lista de "outras salvas" aqui dentro
    }
  }

  function aoTecladoModalAgenda(evento) {
    if (evento.key !== 'Escape' && evento.key !== 'Esc') return;
    var modal = document.getElementById('agenda-modal');
    if (!modal || modal.hidden) return;
    fecharModalAgenda();
  }

  // delegação de eventos: um único listener no container (chips de dia
  // + abrir o modal ao clicar num card do grid).
  function aoClicarAgendaGrade(evento) {
    var chip = evento.target.closest('[data-dia-agenda]');
    if (chip) {
      var dia = chip.getAttribute('data-dia-agenda');
      if (dia !== agendaDiaSelecionado) {
        agendaDiaSelecionado = dia;
        renderizarAgendaGrade();
      }
      return;
    }

    var card = evento.target.closest('.agenda-grade__card');
    if (card) {
      abrirModalAgenda(Number(card.getAttribute('data-id')));
    }
  }

  var agendaInicializada = false;

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
    var elConteudo = document.getElementById('agenda-conteudo');
    if (!elConteudo) return;

    if (!DADOS_CARREGADOS) {
      elConteudo.innerHTML = '<p class="carregando">Carregando palestras…</p>';
      return;
    }

    // listener de delegação ligado só uma vez no container (o container
    // em si nunca é substituído, só o innerHTML dele)
    if (!agendaInicializada) {
      elConteudo.addEventListener('click', aoClicarAgendaGrade);
      agendaInicializada = true;
    }

    // relê o estado do zero sempre que a aba abre — nada de cache
    renderizarAgendaGrade();
  }

  // -----------------------------------------------------------
  // Seção 4B — Aba Mapa: planta oficial com zoom/pan simples
  // (sem lib externa) + legenda dos 7 nós da matriz de distância.
  // -----------------------------------------------------------

  // níveis de zoom = % da largura do container (não da tela); o pan
  // em si é o scroll nativo do container (overflow:auto), inclusive
  // pinch-to-zoom nativo do navegador — não bloqueamos com touch-action.
  var NIVEIS_ZOOM_MAPA = [100, 200, 400];
  var indiceZoomMapa = 0;
  var mapaInicializado = false;

  function aplicarZoomMapa(indice) {
    indiceZoomMapa = Math.max(0, Math.min(NIVEIS_ZOOM_MAPA.length - 1, indice));
    var img = document.getElementById('mapa-imagem');
    var rotulo = document.getElementById('mapa-zoom-rotulo');
    if (img) img.style.width = NIVEIS_ZOOM_MAPA[indiceZoomMapa] + '%';
    if (rotulo) rotulo.textContent = NIVEIS_ZOOM_MAPA[indiceZoomMapa] + '%';
  }

  // delegação de eventos: um único listener no container da aba Mapa
  function aoClicarMapa(evento) {
    var botao = evento.target.closest('button[data-zoom]');
    if (!botao) return;
    var acao = botao.getAttribute('data-zoom');
    if (acao === 'menos') aplicarZoomMapa(indiceZoomMapa - 1);
    else if (acao === 'mais') aplicarZoomMapa(indiceZoomMapa + 1);
    else if (acao === 'ajustar') aplicarZoomMapa(0);
  }

  // legenda dos 7 nós da matriz (Seção 5) em linguagem de quem está
  // andando pelo evento. Só afirma o que o PLANO.md afirma (Seção 4B/5):
  // Armazéns 1–5 em fila; Kobra recuado atrás do 4-5; NAM Atlântico
  // atracado na frente do 2-3; Armazém 5 inclui a varanda do Vital de Oliveira.
  function construirHtmlLegendaMapa() {
    var html = '<ul class="mapa__legenda">';
    // descrições conferidas contra a planta oficial (site/assets/mapa-evento.webp)
    html += '<li><strong>Armazém 1</strong> — ponta esquerda do píer, perto da Praça Mauá e da ' +
      'entrada principal. Dividido em 1A (RIW Pop Tech), 1B e a varanda.</li>';
    html += '<li><strong>Armazém 2</strong> — logo depois do 1B, na sequência do píer.</li>';
    html += '<li><strong>Armazém 3</strong> — no meio da fila, entre a Praça 2-3 e a Praça 3-4.</li>';
    html += '<li><strong>Armazém 4</strong> — depois do 3; é da Praça 3-4 que sai o acesso ao Kobra.</li>';
    html += '<li><strong>Armazém 5</strong> — o último da fila, do lado do MAR. Inclui a varanda do ' +
      'navio <em>Vital de Oliveira</em>, atracado ali na frente.</li>';
    html += '<li><strong>Kobra</strong> — o Galpão Kobra, recuado atrás dos Armazéns 3, 4 e 5; ' +
      'acesso pela Praça 3-4.</li>';
    html += '<li><strong>NAM Atlântico</strong> — o navio laranja atracado em frente aos Armazéns 1B ' +
      'e 2; acesso pela Praça 2-3.</li>';
    html += '</ul>';
    return html;
  }

  function construirHtmlMapa() {
    var html = '';
    html += '<p class="mapa__lembrete">🚶 A matriz de tempo de caminhada (usada na aba Agenda) já ' +
      'considera lotação e buffer de saída de palco.</p>';

    html += '<div class="mapa__controles" role="group" aria-label="Zoom do mapa">';
    html += '<button type="button" class="botao botao--secundario" data-zoom="menos" aria-label="Diminuir zoom">−</button>';
    html += '<span id="mapa-zoom-rotulo" class="mapa__zoom-rotulo">100%</span>';
    html += '<button type="button" class="botao botao--secundario" data-zoom="mais" aria-label="Aumentar zoom">+</button>';
    html += '<button type="button" class="botao botao--secundario" data-zoom="ajustar">Ajustar</button>';
    html += '</div>';

    // a imagem só entra no DOM aqui — ou seja, só baixa quando a aba
    // Mapa é aberta pela primeira vez (são 534KB, não vale a pena antes).
    html += '<div class="mapa__zoom-container" id="mapa-zoom-container">';
    html += '<img id="mapa-imagem" class="mapa__imagem" src="assets/mapa-evento.webp" ' +
      'alt="Planta oficial da Rio Innovation Week 2026: os Armazéns 1 a 5, o Galpão Kobra, ' +
      'o navio NAM Atlântico e a legenda dos palcos de cada prédio." ' +
      'width="4125" height="2250" loading="lazy" decoding="async">';
    html += '</div>';

    html += construirHtmlLegendaMapa();
    return html;
  }

  // renderMapa() — monta o conteúdo só na primeira vez que a aba abre
  // (guardado por mapaInicializado); reabrir a aba não duplica a
  // imagem nem os listeners, só reaproveita o que já está no DOM.
  function renderMapa() {
    var elConteudo = document.getElementById('mapa-conteudo');
    if (!elConteudo) return;

    if (!mapaInicializado) {
      elConteudo.innerHTML = construirHtmlMapa();
      elConteudo.addEventListener('click', aoClicarMapa);
      mapaInicializado = true;
    }
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
    acharConflitos: acharConflitos,
    // Seção 4 — distância entre itens consecutivos da Agenda
    minutosDoHorario: minutosDoHorario,
    avaliarTrecho: avaliarTrecho,
    getMatrizDistancias: function () {
      return MATRIZ_DISTANCIAS;
    },
    // Seção 4 (redesenho) — grid de horários estilo Google Calendar
    posicionarNoGrid: posicionarNoGrid
  };
})();
