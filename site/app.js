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

  function carregarDados() {
    return fetch('data.json')
      .then(function (resp) {
        if (!resp.ok) throw new Error('HTTP ' + resp.status);
        return resp.json();
      })
      .then(function (json) {
        PALESTRAS = Array.isArray(json) ? json : [];
        DADOS_CARREGADOS = true;
        return PALESTRAS;
      });
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
  // Roteamento por hash (#programacao, #salvas, #agenda, #mapa)
  // -----------------------------------------------------------
  var ABAS_VALIDAS = ['programacao', 'salvas', 'agenda', 'mapa'];
  var ABA_PADRAO = 'programacao';

  // Pontos de extensão pras próximas seções do plano preencherem.
  function renderProgramacao() {
    var el = document.getElementById('programacao-conteudo');
    if (!el) return;
    if (!DADOS_CARREGADOS) {
      el.innerHTML = '<p class="carregando">Carregando palestras…</p>';
      return;
    }
    el.innerHTML =
      '<p class="placeholder">' +
      PALESTRAS.length +
      ' palestras carregadas. A lista com filtros e busca chega na próxima seção do plano.</p>';
  }

  function renderSalvas() {
    // stub — implementado na Seção 3 do PLANO.md
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
    RENDERERS: RENDERERS
  };
})();
