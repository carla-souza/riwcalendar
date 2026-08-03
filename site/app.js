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
  // filtros: { dia, trilha, predio, tipo, busca, interesse, idsInteresse },
  // todos opcionais ('todos'/'todas' ou vazio = sem restrição nesse campo).
  // `interesse: true` restringe às palestras com id presente em
  // `idsInteresse` (array/objeto de ids) — quem chama resolve essa lista
  // (ex.: getState().salvas), a função em si não lê estado nenhum, então
  // continua pura e testável sem localStorage/DOM.
  function filtrarPalestras(lista, filtros) {
    filtros = filtros || {};
    var dia = filtros.dia || 'todos';
    var trilha = filtros.trilha || 'todas';
    var predio = filtros.predio || 'todos';
    var tipo = filtros.tipo || 'todos';
    var buscaNorm = normalizarTexto(filtros.busca || '');
    var interesse = filtros.interesse === true;
    var conjuntoInteresse = null;
    if (interesse) {
      conjuntoInteresse = {};
      (filtros.idsInteresse || []).forEach(function (id) { conjuntoInteresse[id] = true; });
    }

    var resultado = (lista || []).filter(function (p) {
      if (dia !== 'todos' && p.dia !== dia) return false;
      if (trilha !== 'todas' && normalizarTrilha(p.trilha) !== trilha) return false;
      if (predio !== 'todos' && p.predio_base !== predio) return false;
      if (tipo !== 'todos' && p.tipo !== tipo) return false;
      if (interesse && !conjuntoInteresse[p.id]) return false;

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

  // -----------------------------------------------------------
  // Ícones inline SVG — sem arquivo externo nenhum. Todos seguem o mesmo
  // padrão: viewBox 24x24, stroke="currentColor" (herda a cor do texto do
  // botão/chip pai — funciona sozinho em light/dark e nos estados
  // ativo/inativo), stroke-width 2, linecap/linejoin "round".
  // aria-hidden porque o texto ao lado do ícone já dá o rótulo acessível.
  // -----------------------------------------------------------
  function svgIcone(conteudoInterno, opts) {
    opts = opts || {};
    var tamanho = opts.tamanho || 18;
    var fill = opts.fill || 'none';
    return '<svg width="' + tamanho + '" height="' + tamanho + '" viewBox="0 0 24 24" fill="' + fill +
      '" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" ' +
      'aria-hidden="true">' + conteudoInterno + '</svg>';
  }

  // bookmark (marcador de página) — "Tenho interesse". Preenchido quando
  // ativo/marcado, só contorno quando não.
  function iconeBookmark(ativo, tamanho) {
    var path = '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>';
    return svgIcone(path, { tamanho: tamanho, fill: ativo ? 'currentColor' : 'none' });
  }

  // base do calendário (retângulo + argolas + linha do cabeçalho), reusada
  // pelas 3 variantes abaixo (com "+", com "−", ou lisa pra tab bar).
  function iconeCalendarioBase(conteudoExtra, tamanho) {
    var base = '<rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>' +
      '<line x1="16" y1="2" x2="16" y2="6"/>' +
      '<line x1="8" y1="2" x2="8" y2="6"/>' +
      '<line x1="3" y1="10" x2="21" y2="10"/>';
    return svgIcone(base + (conteudoExtra || ''), { tamanho: tamanho });
  }

  function iconeCalendarioMais(tamanho) {
    return iconeCalendarioBase(
      '<line x1="12" y1="14" x2="12" y2="18"/><line x1="10" y1="16" x2="14" y2="16"/>', tamanho);
  }

  function iconeCalendarioMenos(tamanho) {
    return iconeCalendarioBase('<line x1="10" y1="16" x2="14" y2="16"/>', tamanho);
  }

  // "x" pra limpar o campo de busca.
  function iconeFechar(tamanho) {
    var path = '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>';
    return svgIcone(path, { tamanho: tamanho });
  }

  // -----------------------------------------------------------
  // Programação — estado dos filtros + paginação incremental
  // -----------------------------------------------------------
  var TAMANHO_PAGINA = 80;
  var programacaoInicializada = false;
  var qtdVisivel = TAMANHO_PAGINA;
  // diaFiltroPadrao é setado em renderProgramacao() na 1ª vez que a
  // Programação renderiza (quando PALESTRAS já carregou), usando
  // diaPadraoAgenda() — a mesma função que a Agenda já usa. Guardado à
  // parte pra filtrosEstaoAtivos()/limparFiltros() saberem qual é o "sem
  // filtro nenhum" agora que não existe mais o chip "Todas".
  var diaFiltroPadrao = null;
  var filtroEstado = { dia: 'todos', trilha: 'todas', predio: 'todos', tipo: 'todos', busca: '', interesse: false };

  function filtrosEstaoAtivos() {
    return filtroEstado.dia !== diaFiltroPadrao ||
      filtroEstado.trilha !== 'todas' ||
      filtroEstado.predio !== 'todos' ||
      filtroEstado.tipo !== 'todos' ||
      filtroEstado.busca !== '' ||
      filtroEstado.interesse === true;
  }

  // chips de dia vivem fora do card de filtros agora (logo abaixo do
  // título da página) — HTML deles é construído à parte por
  // construirHtmlDiasProgramacao() e injetado em #programacao-dias.
  function construirHtmlDiasProgramacao() {
    var dias = diasUnicos(PALESTRAS);
    var html = '';
    // sem chip "Todas": o dia ativo (filtroEstado.dia) já foi setado pra
    // diaPadraoAgenda() em renderProgramacao(), antes desta função rodar.
    dias.forEach(function (d) {
      var partes = d.split('-');
      var ativo = d === filtroEstado.dia;
      html += '<button type="button" class="chip' + (ativo ? ' chip--ativo' : '') + '" data-dia="' + d +
        '" aria-pressed="' + ativo + '">' + partes[2] + '/' + partes[1] + '</button>';
    });
    return html;
  }

  function construirHtmlFiltros() {
    var trilhas = valoresUnicosOrdenados(PALESTRAS, function (p) { return normalizarTrilha(p.trilha); });
    var predios = valoresUnicosOrdenados(PALESTRAS, function (p) { return p.predio_base; });
    var tipos = valoresUnicosOrdenados(PALESTRAS, function (p) { return p.tipo; });

    var html = '';

    function opcoesSelect(valores) {
      return valores.map(function (v) {
        var esc = escaparHtml(v);
        return '<option value="' + esc + '">' + esc + '</option>';
      }).join('');
    }

    html += '<div class="filtros__linha">';
    // "Minha marcação" — toggle "Tenho interesse", primeiro campo de todos,
    // na mesma lógica de espaçamento dos selects (.filtros__label dentro de
    // .filtros__linha), mas com largura própria de 100% (.filtros__label--
    // interesse) pra sempre ocupar uma linha sozinho, mesmo no mobile. É um
    // FILTRO que liga/desliga (compõe com os outros filtros, não
    // substitui). Filtra às palestras marcadas via toggleSalva/isSalva.
    html += '<label class="filtros__label filtros__label--interesse" for="filtro-interesse">Minha marcação' +
      '<button type="button" class="filtros__campo-toggle" id="filtro-interesse" aria-pressed="false">' +
      '<span class="botao__icone">' + iconeBookmark(false, 18) + '</span><span>Tenho interesse</span></button></label>';
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
      '<span class="filtros__busca-wrap">' +
      '<input type="search" id="filtro-busca" class="filtros__busca" ' +
      'placeholder="Título, palestrante ou empresa…">' +
      '<button type="button" id="filtro-busca-x" class="filtros__busca-x" hidden aria-label="Limpar busca">' +
      iconeFechar(14) + '</button>' +
      '</span></label>';
    html += '<button type="button" id="filtro-limpar" class="filtros__limpar" hidden>Limpar filtros</button>';
    html += '</div>';

    return html;
  }

  function atualizarBotaoLimpar(container) {
    var botao = container.querySelector('#filtro-limpar');
    if (botao) botao.hidden = !filtrosEstaoAtivos();
  }

  // "x" dentro do campo de busca: só aparece com texto digitado.
  function atualizarBotaoBuscaX(container) {
    var busca = container.querySelector('#filtro-busca');
    var botaoX = container.querySelector('#filtro-busca-x');
    if (busca && botaoX) botaoX.hidden = busca.value === '';
  }

  // gerencia só os chips de DIA (seleção single-choice); o chip "Tenho
  // interesse" vive fora de .filtros__dias agora (handler próprio em
  // ligarEventosFiltros) e nem entra nessa varredura.
  function marcarChipAtivo(container, chipClicado) {
    var chips = container.querySelectorAll('.filtros__dias .chip');
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
    filtroEstado = { dia: diaFiltroPadrao, trilha: 'todas', predio: 'todos', tipo: 'todos', busca: '', interesse: false };

    var chipDiaPadrao = container.querySelector('.chip[data-dia="' + diaFiltroPadrao + '"]');
    if (chipDiaPadrao) marcarChipAtivo(container, chipDiaPadrao);

    var selTrilha = container.querySelector('#filtro-trilha');
    var selPredio = container.querySelector('#filtro-predio');
    var selTipo = container.querySelector('#filtro-tipo');
    var busca = container.querySelector('#filtro-busca');
    if (selTrilha) selTrilha.value = 'todas';
    if (selPredio) selPredio.value = 'todos';
    if (selTipo) selTipo.value = 'todos';
    if (busca) busca.value = '';
    atualizarBotaoBuscaX(container);

    var elInteresse = container.querySelector('#filtro-interesse');
    if (elInteresse) {
      elInteresse.classList.remove('filtros__campo-toggle--ativo');
      elInteresse.setAttribute('aria-pressed', 'false');
    }

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
        atualizarBotaoBuscaX(container);
        clearTimeout(temporizador);
        // debounce ~200ms: evita filtrar/renderizar a cada tecla
        temporizador = setTimeout(function () {
          filtroEstado.busca = valor;
          aoMudarFiltro(container);
        }, 200);
      });
    }

    var elBuscaX = container.querySelector('#filtro-busca-x');
    if (elBuscaX) {
      elBuscaX.addEventListener('click', function () {
        if (elBusca) elBusca.value = '';
        elBuscaX.hidden = true;
        filtroEstado.busca = '';
        if (elBusca) elBusca.focus();
        aoMudarFiltro(container);
      });
    }

    var elLimpar = container.querySelector('#filtro-limpar');
    if (elLimpar) {
      elLimpar.addEventListener('click', function () { limparFiltros(container); });
    }

    var elInteresse = container.querySelector('#filtro-interesse');
    if (elInteresse) {
      elInteresse.addEventListener('click', function () {
        filtroEstado.interesse = !filtroEstado.interesse;
        elInteresse.classList.toggle('filtros__campo-toggle--ativo', filtroEstado.interesse);
        elInteresse.setAttribute('aria-pressed', String(filtroEstado.interesse));
        aoMudarFiltro(container);
      });
    }
  }

  // -----------------------------------------------------------
  // Programação — lista de resultados (cards) + delegação
  // -----------------------------------------------------------
  // idHorario: setado só no primeiro card de cada horário (âncora das
  // pills fixas no topo — ver construirHtmlPillsHorarios).
  function construirHtmlCard(p, idHorario) {
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

    var html = '<article class="card" data-card-id="' + p.id + '"' +
      (idHorario ? ' id="' + idHorario + '"' : '') + '>';
    html += '<span class="card__badge-trilha" style="background:' + cor + '">' +
      escaparHtml(normalizarTrilha(p.trilha)) + '</span>';
    html += '<div class="card__horario">' + escaparHtml(p.inicio) + '–' + escaparHtml(p.fim) + '</div>';
    html += '<h4 class="card__titulo">' + escaparHtml(p.titulo) + '</h4>';
    html += '<div class="card__local">' + escaparHtml(local) + '</div>';
    if (p.descricao) {
      html += '<p class="card__descricao">' + escaparHtml(p.descricao) + '</p>';
    }
    if (nomes) {
      html += '<div class="card__palestrantes">' + escaparHtml(nomes) + '</div>';
    }
    html += '<div class="card__acoes">';
    html += '<button type="button" class="botao ' + (salva ? 'botao--ativo' : 'botao--secundario') +
      '" data-acao="salvar" data-id="' + p.id + '" aria-pressed="' + salva + '">' +
      '<span class="botao__icone">' + iconeBookmark(salva, 18) + '</span><span>Tenho interesse</span></button>';
    html += '<button type="button" class="botao ' + (agendada ? 'botao--ativo' : 'botao--secundario') +
      '" data-acao="agenda" data-id="' + p.id + '" aria-pressed="' + agendada + '">' +
      '<span class="botao__icone">' + iconeCalendarioMais(18) + '</span><span>' +
      (agendada ? 'Na agenda' : 'Adicionar na agenda') + '</span></button>';
    html += '</div>';
    html += '</article>';
    return html;
  }

  // âncora do primeiro card de cada horário — id estável, sem os dois
  // pontos (inválido puro em id, mas evitamos mesmo assim).
  function idHorarioAncora(horario) {
    return 'horario-' + String(horario).replace(':', '');
  }

  // a lista sempre mostra um único dia por vez agora (o filtro de dia da
  // Programação não produz mais 'todos' via UI), então não agrupa mais por
  // cabeçalho de dia — só concatena os cards. O cabeçalho "Exibindo N
  // palestras" fica por conta de renderizarListaResultados(). Marca o
  // primeiro card de cada horário com um id (âncora das pills fixas).
  function construirHtmlLista(itens) {
    var horarioAnterior = null;
    return itens.map(function (p) {
      var primeiroDoHorario = p.inicio !== horarioAnterior;
      horarioAnterior = p.inicio;
      return construirHtmlCard(p, primeiroDoHorario ? idHorarioAncora(p.inicio) : null);
    }).join('');
  }

  // pills pequenas com os horários do dia (na ordem em que aparecem),
  // fixas no topo do scroll — cada uma pula pro primeiro card daquele
  // horário. Construídas a partir do resultado INTEIRO (não só da fatia
  // visível/paginada), senão horários mais tarde no dia nunca apareceriam
  // como pill antes do usuário clicar em "carregar mais".
  function construirHtmlPillsHorarios(itens) {
    var vistos = {};
    var horarios = [];
    itens.forEach(function (p) {
      if (!vistos[p.inicio]) {
        vistos[p.inicio] = true;
        horarios.push(p.inicio);
      }
    });
    if (horarios.length === 0) return '';

    var html = '<div class="horarios-pills">';
    horarios.forEach(function (h) {
      html += '<button type="button" class="chip chip--horario" data-horario="' +
        escaparHtml(h) + '">' + escaparHtml(h) + '</button>';
    });
    html += '</div>';
    return html;
  }

  // clique numa pill de horário: rola até o primeiro card daquele horário.
  // Se ainda não foi renderizado (além da paginação atual), estende
  // qtdVisivel até cobrir esse horário antes de rolar.
  function irParaHorario(horario) {
    var idAlvo = idHorarioAncora(horario);
    var elAlvo = document.getElementById(idAlvo);
    if (!elAlvo) {
      var filtros = {
        dia: filtroEstado.dia,
        trilha: filtroEstado.trilha,
        predio: filtroEstado.predio,
        tipo: filtroEstado.tipo,
        busca: filtroEstado.busca,
        interesse: filtroEstado.interesse,
        idsInteresse: getState().salvas
      };
      var resultado = filtrarPalestras(PALESTRAS, filtros);
      var indice = resultado.findIndex(function (p) { return p.inicio === horario; });
      if (indice === -1) return;
      // renderiza uma folga de mais uma página além do alvo — só até
      // o alvo faria o documento terminar bem ali, sem espaço embaixo
      // pro scrollIntoView rolar o card até o topo (o navegador trava
      // no fim da página).
      qtdVisivel = Math.max(qtdVisivel, indice + 1 + TAMANHO_PAGINA);
      renderizarListaResultados();
      elAlvo = document.getElementById(idAlvo);
    }
    if (elAlvo) elAlvo.scrollIntoView({ behavior: 'smooth', block: 'start' });
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
      btnSalvar.innerHTML = '<span class="botao__icone">' + iconeBookmark(salva, 18) +
        '</span><span>Tenho interesse</span>';
    }
    var btnAgenda = card.querySelector('[data-acao="agenda"]');
    if (btnAgenda) {
      btnAgenda.className = 'botao ' + (agendada ? 'botao--ativo' : 'botao--secundario');
      btnAgenda.setAttribute('aria-pressed', String(agendada));
      btnAgenda.innerHTML = '<span class="botao__icone">' + iconeCalendarioMais(18) + '</span><span>' +
        (agendada ? 'Na agenda' : 'Adicionar na agenda') + '</span>';
    }
  }

  // delegação de eventos: um único listener no container da lista
  function aoClicarLista(evento) {
    var pillHorario = evento.target.closest('.chip--horario');
    if (pillHorario) {
      irParaHorario(pillHorario.getAttribute('data-horario'));
      return;
    }

    var botao = evento.target.closest('button[data-acao]');
    if (!botao) return;
    var id = Number(botao.getAttribute('data-id'));
    var acao = botao.getAttribute('data-acao');
    if (acao === 'salvar') toggleSalva(id);
    else if (acao === 'agenda') toggleAgenda(id);

    // com o chip "Tenho interesse" ligado, marcar/desmarcar interesse muda
    // quem aparece na lista (e a contagem) — precisa re-renderizar tudo.
    if (filtroEstado.interesse) {
      renderizarListaResultados();
    } else {
      atualizarBotoesCard(id); // regra: +Agenda também marca Salva, refletir os dois botões
    }
  }

  function renderizarListaResultados() {
    var elLista = document.getElementById('programacao-conteudo');
    if (!elLista) return;

    var idsInteresse = getState().salvas;
    var filtros = {
      dia: filtroEstado.dia,
      trilha: filtroEstado.trilha,
      predio: filtroEstado.predio,
      tipo: filtroEstado.tipo,
      busca: filtroEstado.busca,
      interesse: filtroEstado.interesse,
      idsInteresse: idsInteresse
    };
    var resultado = filtrarPalestras(PALESTRAS, filtros);

    if (resultado.length === 0) {
      if (filtroEstado.interesse && idsInteresse.length === 0) {
        elLista.innerHTML = '<p class="lista__vazio">Você ainda não marcou nenhuma palestra como ' +
          '"Tenho interesse". Navegue na programação e toque em "Tenho interesse" nos cards.</p>';
      } else {
        elLista.innerHTML = '<p class="lista__vazio">Nenhuma palestra encontrada com esses filtros.</p>';
      }
      return;
    }

    var visiveis = resultado.slice(0, qtdVisivel);
    // cabeçalho "Exibindo N palestras" no topo dos resultados — fonte
    // única da contagem agora que o filtro de dia é sempre um dia só
    // (o antigo filtros__contagem no topo da caixa de filtros duplicava
    // essa informação e foi removido).
    var html = '<h3 class="lista__cabecalho-dia">Exibindo ' + resultado.length +
      (resultado.length === 1 ? ' palestra' : ' palestras') + '</h3>';
    // pills de horário, fixas no topo do scroll assim que passam por ele
    // (ver CSS .horarios-pills) — construídas a partir do resultado
    // inteiro, não só da fatia visível, pra já mostrar os horários mais
    // tarde do dia.
    html += construirHtmlPillsHorarios(resultado);
    html += construirHtmlLista(visiveis);

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
  // Helpers de dia/horário reusados pela Agenda (a aba Salvas que os
  // introduziu na Seção 3 saiu do app em 2026-08-03 — virou o filtro
  // "Tenho interesse" da Programação).
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
  // não colidem). Não lê estado nenhum — recebe a lista pronta. Mantida e
  // exposta em window.RIW mesmo sem chamador interno no momento (a Agenda
  // pode reusá-la), por pedido explícito da Carla.
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

  // -----------------------------------------------------------
  // Seção 4 — Aba Agenda: timeline enxuta + conflito (vermelho) +
  // alerta de distância entre itens consecutivos (usa a matriz da
  // Seção 5, distancias.json).
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

    // chegada real = fim da anterior + caminhada. "Não vai chegar a tempo"
    // vale só quando essa chegada cai depois do FIM da seguinte (pedido da
    // Carla) — atraso que ainda pega parte da palestra continua sendo atraso.
    var perdeuTudo = custo != null &&
      minutosDoHorario(anterior.fim) + custo >= minutosDoHorario(seguinte.fim);

    var nivel;
    if (mesmoPalco) {
      nivel = 'ok'; // mesmo palco: fica no lugar, sem aviso — nunca é risco
    } else if (custo == null) {
      nivel = 'ok'; // sem dado de distância — não alarma
    } else if (perdeuTudo) {
      nivel = 'impossivel'; // chega depois de acabar
    } else if (folga < custo) {
      nivel = 'atrasado'; // chega atrasado, mas ainda pega parte
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
    var atraso = (avaliacao.custo == null) ? null : avaliacao.custo - avaliacao.folga;
    if (avaliacao.nivel === 'impossivel') {
      linha2 = '⏰ Você não vai chegar a tempo';
    } else if (atraso != null && atraso > 0) {
      linha2 = '⏰ Você vai chegar com ' + atraso + ' min de atraso';
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
  function construirHtmlCardGradeAgenda(p, itensMesmoDia, pos, horaInicioFaixa, maxColunas) {
    var coluna = pos ? pos.coluna : 0;
    var inicioMin = minutosDoHorario(p.inicio);
    var fimMin = minutosDoHorario(p.fim);

    var top = (inicioMin - horaInicioFaixa * 60) * ESCALA_PX_MIN;
    var altura = Math.max(ALTURA_MIN_CARD_PX, (fimMin - inicioMin) * ESCALA_PX_MIN);
    // largura/posição usam maxColunas (o pico de sobreposição DO DIA
    // INTEIRO, mesmo valor que define o min-width do container), não o
    // totalColunas do cluster local — senão um cluster de 2 cards num dia
    // com um pico de 6 herda 1/2 da largura do container de 6 colunas
    // (cards enormes) e, se o 2º cair fora da faixa visível do scroll
    // (que abre em 0), some sem nenhuma pista de que tem mais pra direita.
    var left = (coluna / maxColunas) * 100;
    var largura = 'calc(' + (100 / maxColunas) + '% - 2px)';
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
      return construirHtmlCardGradeAgenda(p, itens, mapaPos[p.id], faixa.horaInicio, maxColunas);
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

  // chips de dia da Agenda (sem "Todos" — a Agenda mostra um dia por vez)
  // vivem fora do card de conteúdo agora, em #agenda-dias, logo abaixo do
  // título da página (mesmo tratamento da Programação).
  function construirHtmlDiasAgenda(dias, diaSelecionado) {
    var html = '';
    dias.forEach(function (d) {
      var partes = d.split('-');
      var ativo = d === diaSelecionado;
      html += '<button type="button" class="chip' + (ativo ? ' chip--ativo' : '') + '" ' +
        'data-dia-agenda="' + d + '" aria-pressed="' + ativo + '">' + partes[2] + '/' + partes[1] + '</button>';
    });
    return html;
  }

  var agendaDiaSelecionado = null; // dia mostrado na aba; escolhido em diaPadraoAgenda na 1ª vez

  // renderizarAgendaGrade() — relê o estado do zero (sem cache) e
  // re-renderiza chips + grid do dia selecionado inteiros.
  function renderizarAgendaGrade() {
    var elDias = document.getElementById('agenda-dias');
    var elConteudo = document.getElementById('agenda-conteudo');
    if (!elDias || !elConteudo) return;

    var dias = diasUnicos(PALESTRAS); // todos os dias do EVENTO, não só os com itens na agenda
    if (!dias.length) {
      elDias.innerHTML = '';
      elConteudo.innerHTML = '<p class="lista__vazio">Nenhum dia de evento carregado.</p>';
      return;
    }

    if (!agendaDiaSelecionado || dias.indexOf(agendaDiaSelecionado) === -1) {
      agendaDiaSelecionado = diaPadraoAgenda(dias);
    }

    var itensDoDia = itensAgendaPorDia(agendaDiaSelecionado);

    elDias.innerHTML = construirHtmlDiasAgenda(dias, agendaDiaSelecionado);

    var html = '<h3 class="lista__cabecalho-dia">Exibindo ' + itensDoDia.length +
      (itensDoDia.length === 1 ? ' palestra' : ' palestras') + '</h3>';
    if (!itensDoDia.length) {
      html += '<p class="lista__vazio">Nada na agenda nesse dia. Adicione a partir da Programação.</p>';
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

  // construirHtmlModalAgenda(p, ...) — TODOS os detalhes, na ordem que a
  // Carla pediu: trilha, conferência, título, "horário · local", descrição,
  // palestrantes, aviso de caminhada (reusa construirHtmlTrecho), remover da
  // agenda e "outras salvas nesse horário" JÁ ABERTO (pedido explícito dela).
  function construirHtmlModalAgenda(p, itensMesmoDia, todasSalvas) {
    var cor = corDaTrilha(p.trilha);
    var local = p.predio || '';
    if (p.palco) local += ' — ' + p.palco;

    var html = '';
    html += '<span class="card__badge-trilha" style="background:' + cor + '">' +
      escaparHtml(normalizarTrilha(p.trilha)) + '</span>';
    // ordem pedida pela Carla: conferência no topo, horário colado no local,
    // descrição antes dos palestrantes. O tipo ("Painel") saiu — não ajuda.
    if (p.conferencia) {
      html += '<div class="modal__meta">' + escaparHtml(p.conferencia) + '</div>';
    }
    html += '<h3 id="agenda-modal-titulo" class="modal__titulo">' + escaparHtml(p.titulo) + '</h3>';
    html += '<div class="card__local">' + escaparHtml(p.inicio) + '–' + escaparHtml(p.fim) +
      (local ? ' · ' + escaparHtml(local) : '') + '</div>';

    if (p.descricao) {
      html += '<p class="modal__descricao">' + escaparHtml(p.descricao) + '</p>';
    }

    if (Array.isArray(p.palestrantes) && p.palestrantes.length) {
      html += '<ul class="modal__palestrantes">';
      p.palestrantes.forEach(function (pal) {
        if (!pal || !pal.nome) return;
        var texto = pal.nome + (pal.empresa ? ' — ' + pal.empresa : '');
        html += '<li>' + escaparHtml(texto) + '</li>';
      });
      html += '</ul>';
    }

    var anterior = acharAnteriorAgenda(p, itensMesmoDia);
    if (anterior) {
      html += construirHtmlTrecho(avaliarTrecho(anterior, p, MATRIZ_DISTANCIAS));
    }

    // sem selo de conflito: a sobreposição já se vê no grid (pedido da Carla)
    html += '<div class="modal__acoes">';
    html += '<button type="button" class="botao botao--secundario" data-acao-modal="remover-agenda" data-id="' +
      p.id + '"><span class="botao__icone">' + iconeCalendarioMenos(18) +
      '</span><span>Remover da agenda</span></button>';
    html += '</div>';

    var candidatas = candidatasMesmoHorario(p, todasSalvas);
    html += '<div class="modal__outras">';
    html += '<h4 class="modal__outras-titulo">Outros interesses nesse horário</h4>';
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
      html += '<p class="modal__outras-vazio">Nenhum outro interesse nesse horário.</p>';
    }
    html += '</div>';

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
    var itensMesmoDia = itensAgendaPorDia(p.dia);

    var corpo = document.getElementById('agenda-modal-corpo');
    if (corpo) corpo.innerHTML = construirHtmlModalAgenda(p, itensMesmoDia, todasSalvas);
  }

  function abrirModalAgenda(id) {
    var p = getPalestraPorId(id);
    if (!p) return;

    var modal = garantirModalAgenda();
    modalIdAtual = id;

    var estado = getState();
    var todasSalvas = estado.salvas.map(getPalestraPorId).filter(Boolean);
    var itensMesmoDia = itensAgendaPorDia(p.dia);

    var corpo = document.getElementById('agenda-modal-corpo');
    corpo.innerHTML = construirHtmlModalAgenda(p, itensMesmoDia, todasSalvas);

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
  // Roteamento por hash (#programacao, #agenda, #mapa)
  // -----------------------------------------------------------
  var ABAS_VALIDAS = ['programacao', 'agenda', 'mapa'];
  var ABA_PADRAO = 'programacao';

  function renderProgramacao() {
    var elSecao = document.getElementById('programacao');
    var elDias = document.getElementById('programacao-dias');
    var elFiltros = document.getElementById('programacao-filtros');
    var elLista = document.getElementById('programacao-conteudo');
    if (!elSecao || !elDias || !elFiltros || !elLista) return;

    if (!DADOS_CARREGADOS) {
      elLista.innerHTML = '<p class="carregando">Carregando palestras…</p>';
      return;
    }

    // barra de filtros é construída e ligada só uma vez; cliques/troca de
    // filtro depois disso só re-renderizam a lista de resultados.
    if (!programacaoInicializada) {
      // dia padrão = hoje (se for um dos dias do evento) senão o primeiro
      // dia — mesma lógica já testada na Agenda (diaPadraoAgenda). Precisa
      // rodar aqui (não na declaração de filtroEstado lá em cima) porque
      // só agora PALESTRAS já carregou.
      diaFiltroPadrao = diaPadraoAgenda(diasUnicos(PALESTRAS));
      filtroEstado.dia = diaFiltroPadrao;
      elDias.innerHTML = construirHtmlDiasProgramacao();
      elFiltros.innerHTML = construirHtmlFiltros();
      // container abrange os pills de dia (fora do card) e o resto dos
      // filtros (dentro do card) — os dois são descendentes de #programacao.
      ligarEventosFiltros(elSecao);
      elLista.addEventListener('click', aoClicarLista);
      programacaoInicializada = true;
    }

    renderizarListaResultados();
  }

  function renderAgenda() {
    var elSecao = document.getElementById('agenda');
    var elConteudo = document.getElementById('agenda-conteudo');
    if (!elSecao || !elConteudo) return;

    if (!DADOS_CARREGADOS) {
      elConteudo.innerHTML = '<p class="carregando">Carregando palestras…</p>';
      return;
    }

    // listener de delegação ligado só uma vez na seção inteira (cobre os
    // pills de dia em #agenda-dias, fora do card, e o grid dentro de
    // #agenda-conteudo — os elementos em si são recriados a cada render,
    // mas a seção nunca é substituída).
    if (!agendaInicializada) {
      elSecao.addEventListener('click', aoClicarAgendaGrade);
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
    // link antigo/aba restaurada pelo navegador em #salvas (a aba Salvas
    // saiu do app em 2026-08-03, virou o filtro "Tenho interesse" da
    // Programação) — redireciona em vez de deixar tela em branco.
    var hash = (window.location.hash || '').replace('#', '');
    if (hash === 'salvas') {
      window.location.hash = ABA_PADRAO;
      return; // o hashchange que acabou de disparar chama rotear() de novo
    }
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
    // regra de conflito, genérica — mantida pra Agenda reusar
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
