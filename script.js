// ==========================================
// 1. UTILITÁRIOS E DOM HELPERS (Clean Code)
// ==========================================
const Utils = {
  escapeHTML: (str) => (!str ? '' : str.toString().replace(/[&<>'"]/g, tag => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'}[tag]))),
  fmt: (v) => (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
  fmtDate: (ms) => new Date(ms).toLocaleDateString('pt-BR'),
  getFloat: (id, fallback = 0) => parseFloat(document.getElementById(id)?.value) || fallback,
  getVal: (id) => document.getElementById(id)?.value || '',
  setText: (id, text) => { const el = document.getElementById(id); if (el) el.innerText = text; },
  showToast: (mensagem, tipo = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${tipo}`;
    toast.innerHTML = `<span>${tipo === 'error' ? '❌' : tipo === 'warning' ? '⚠️' : '✅'}</span> <span>${mensagem}</span>`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
  },
  toggleLoading: (btn, isLoading, originalHtml = '') => {
    if (!btn) return;
    if (isLoading) {
      btn.dataset.original = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Salvando...`;
    } else {
      btn.disabled = false;
      btn.innerHTML = btn.dataset.original || originalHtml;
      lucide.createIcons();
    }
  },
  // Função DRY (Don't Repeat Yourself) para gerar todas as listas do sistema
  renderizarLista: (containerId, lista, emptyMsg, mapCallback) => {
    const container = document.getElementById(containerId);
    if (!container) return;
    if (lista.length === 0) {
      container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem;">${emptyMsg}</p>`;
      return;
    }
    container.innerHTML = lista.map(mapCallback).join('');
    setTimeout(() => lucide.createIcons(), 0);
  }
};
const { escapeHTML, fmt, fmtDate, getFloat, getVal, setText, showToast, toggleLoading, renderizarLista } = Utils;

// ==========================================
// 2. CONFIGURAÇÃO FIREBASE E ESTADO GLOBAL
// ==========================================
const firebaseConfig = {
  apiKey: "AIzaSyCHsKj0Y0B538kbxv3uyXscbFJ5o5JX48w",
  authDomain: "custo3d-3d649.firebaseapp.com",
  projectId: "custo3d-3d649",
  storageBucket: "custo3d-3d649.firebasestorage.app",
  messagingSenderId: "1063139278364",
  appId: "1:1063139278364:web:d47e81b9afcc88458569d9"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// Estado Centralizado da Aplicação
let cfg = { potencia: 110, kwh: 0.65, maqVal: 4500, maqHrs: 5000, mo: 25, impostoPct: 10, taxaPgPct: 3.5 };
let materiais = [{ id: 'm1', nome: 'PLA', marca: 'Padrão', cor: '', preco: 90, estoque: 1000 }];
let acessorios = [], produtos = [], kits = [], pedidos = [];
let calcAtual = {}, calcAcessorios = [], kitProdutosTemp = [];

// ==========================================
// 3. INICIALIZAÇÃO E AUTENTICAÇÃO
// ==========================================
window.onload = () => {
  firebase.auth().onAuthStateChanged((user) => {
    document.getElementById('auth-screen').style.display = user ? 'none' : 'flex';
    document.getElementById('app-content').style.display = user ? 'block' : 'none';
    if (user) carregarDadosCloud();
    else lucide.createIcons();
  });
};

function fazerLogin(btn) {
  let email = getVal('login-email'), senha = getVal('login-senha');
  setText('login-erro', "");
  toggleLoading(btn, true);
  
  firebase.auth().signInWithEmailAndPassword(email, senha)
    .then(() => toggleLoading(btn, false))
    .catch((error) => {
      let msg = error.message;
      if (error.code === 'auth/user-not-found') msg = "Usuário não cadastrado.";
      if (error.code === 'auth/wrong-password') msg = "Senha incorreta.";
      if (error.code === 'auth/invalid-email') msg = "E-mail inválido.";
      setText('login-erro', "Erro: " + msg);
      toggleLoading(btn, false);
    });
}

function toggleTheme() { document.body.setAttribute('data-theme', document.body.getAttribute('data-theme') === 'light' ? 'dark' : 'light'); }
function switchTab(t) { 
  document.querySelectorAll('.tab-content, nav button').forEach(e => e.classList.remove('active')); 
  document.getElementById('tab-' + t).classList.add('active'); 
  if (event && event.currentTarget) event.currentTarget.classList.add('active'); 
  if (t === 'dashboard') atualizarDashboard(); 
}

// ==========================================
// 4. CAMADA DE DADOS (Firestore Listeners)
// ==========================================
function carregarDadosCloud() {
  db.collection('configuracoes').doc('geral').get().then(doc => { if (doc.exists) cfg = doc.data(); uiInit(); }).catch(uiInit);
  
  db.collection('materiais').onSnapshot(snap => {
    materiais = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    if (materiais.length === 0) db.collection('materiais').doc('m1').set({ nome: 'PLA', marca: 'Padrão', cor: '', preco: 90, estoque: 1000 });
    else atualizarSelectsEListas();
  });

  db.collection('acessorios').onSnapshot(snap => {
    acessorios = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    atualizarSelectsEListas();
  });

  db.collection('produtos').onSnapshot(snap => {
    produtos = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderizarProdutos(); atualizarSelectCRM(); renderizarKitSelector();
  });

  db.collection('kits').onSnapshot(snap => {
    kits = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    renderizarKits(); atualizarSelectCRM();
  });

  db.collection('pedidos').onSnapshot(snap => {
    pedidos = snap.docs.map(doc => {
      let p = { id: doc.id, ...doc.data() };
      if (!p.data) p.data = Date.now();
      if (p.status === 'Produzido') { p.status = 'Enviado'; p.estoqueDeduzido = true; }
      if (p.estoqueDeduzido === undefined) p.estoqueDeduzido = false;
      return p;
    });
    renderizarPedidos(pedidos);
    renderizarClientes();
  });
}

function uiInit() {
  ['cfg-potencia','cfg-kwh','cfg-maquina','cfg-horas','cfg-mo','cfg-imposto','cfg-taxapg'].forEach(id => {
    const key = id.replace('cfg-', '');
    const mappedKey = key === 'maquina' ? 'maqVal' : key === 'horas' ? 'maqHrs' : key === 'imposto' ? 'impostoPct' : key === 'taxapg' ? 'taxaPgPct' : key;
    if(document.getElementById(id)) document.getElementById(id).value = cfg[mappedKey] || 0;
  });
  atualizarSelectsEListas(); atualizarSelectCRM(); renderizarKitSelector(); calcular();
  setTimeout(() => lucide.createIcons(), 100);
}

function atualizarSelectsEListas() {
  const optsMat = `<option value="">-- Nenhum --</option>` + materiais.map(m => `<option value="${m.id}">${m.codigo ? '['+m.codigo+'] ' : ''}${m.nome} ${m.detalhe || (m.marca+' '+m.cor).trim()} (R$${m.preco})</option>`).join('');
  [1, 2, 3, 4].forEach(i => { if (document.getElementById(`prod-mat-${i}`)) document.getElementById(`prod-mat-${i}`).innerHTML = optsMat; });
  renderizarMateriais();

  if (document.getElementById('prod-add-acc')) document.getElementById('prod-add-acc').innerHTML = `<option value="">-- Selecione para Adicionar --</option>` + acessorios.map(a => `<option value="${a.id}">${a.nome} (R$${a.preco.toFixed(2)})</option>`).join('');
  renderizarAcessorios(); renderizarAcessoriosCalc(); calcular();
}

// ==========================================
// 5. MOTOR DA CALCULADORA (Lógica Pura - Sem DOM)
// ==========================================
const CalcEngine = {
  processar: (inputs, config, listaAcessorios) => {
    const { g1, p1, g2, p2, g3, p3, g4, p4, purga, tImp, tMo, markup, precoManual, incluirTaxas } = inputs;

    // 1. Material e Purga Rateada
    const cFilBase = (g1 * p1) + (g2 * p2) + (g3 * p3) + (g4 * p4);
    let coresAtivas = 0, somaPrecos = 0;
    if (g1 > 0) { coresAtivas++; somaPrecos += p1; }
    if (g2 > 0) { coresAtivas++; somaPrecos += p2; }
    if (g3 > 0) { coresAtivas++; somaPrecos += p3; }
    if (g4 > 0) { coresAtivas++; somaPrecos += p4; }

    const custoPurga = (coresAtivas > 0 && purga > 0) ? (purga / coresAtivas) * somaPrecos : 0;
    const cFilTotal = cFilBase + custoPurga;

    // 2. Custos Operacionais
    const cEn = tImp * (config.potencia / 1000) * config.kwh;
    const cDep = tImp * (config.maqVal / config.maqHrs);
    const cMo = tMo * config.mo;
    const cAcc = listaAcessorios.reduce((acc, curr) => acc + (curr.preco * curr.qtd), 0);
    const custoTotalBase = cFilTotal + cEn + cDep + cMo + cAcc;

    // 3. Precificação Base
    const taxaTotalPct = (config.impostoPct + config.taxaPgPct) / 100;
    const margemLiquida = markup > 1 ? (1 - (1 / markup)) : 0;
    let precoSugerido = custoTotalBase * markup;

    if (incluirTaxas) {
      const deducoes = taxaTotalPct + margemLiquida;
      if (deducoes < 0.95) precoSugerido = custoTotalBase / (1 - deducoes);
      else precoSugerido = custoTotalBase * (1 + margemLiquida) / Math.max(0.1, (1 - taxaTotalPct));
    } else if (margemLiquida < 1) {
      precoSugerido = custoTotalBase / (1 - margemLiquida);
    }

    // 4. Preço Final Oficial e Ponto de Equilíbrio
    const precoVendaFinal = (!isNaN(precoManual) && precoManual > 0) ? precoManual : precoSugerido;
    const precoMinimo = incluirTaxas && taxaTotalPct < 1 ? custoTotalBase / (1 - taxaTotalPct) : custoTotalBase;

    // 5. Cálculo de Lucro e Taxas sobre o Preço Praticado
    let valorImpostos = 0;
    if (incluirTaxas) valorImpostos = precoVendaFinal * taxaTotalPct;
    
    const lucroReal = precoVendaFinal - custoTotalBase - valorImpostos;
    const custoTotalFinal = custoTotalBase + valorImpostos;

    return { cFilTotal, cEn, cDep, cMo, cAcc, custoTotalBase, valorImpostos, precoSugerido, precoVendaFinal, lucroReal, custoTotalFinal, precoMinimo };
  }
};

// ==========================================
// 6. CONTROLO DA CALCULADORA (Lê Tela -> Roda Engine -> Atualiza Tela)
// ==========================================
function calcular() {
  const getPrc = id => (materiais.find(m => m.id === getVal(id)) || { preco: 0 }).preco / 1000;
  
  const inputs = {
    g1: getFloat('prod-g-1'), p1: getPrc('prod-mat-1'),
    g2: getFloat('prod-g-2'), p2: getPrc('prod-mat-2'),
    g3: getFloat('prod-g-3'), p3: getPrc('prod-mat-3'),
    g4: getFloat('prod-g-4'), p4: getPrc('prod-mat-4'),
    purga: getFloat('prod-purga'), tImp: getFloat('prod-tempo-imp'), tMo: getFloat('prod-tempo-mo'),
    markup: Math.max(1, getFloat('prod-markup', 1.0)),
    precoManual: getFloat('prod-preco-manual', NaN),
    incluirTaxas: document.getElementById('prod-incluir-taxas').checked
  };

  const res = CalcEngine.processar(inputs, cfg, calcAcessorios);

  // Atualiza KPIs
  setText('res-kpi-custo', fmt(res.custoTotalBase));
  setText('res-kpi-lucro', fmt(res.lucroReal));
  setText('res-kpi-minimo', fmt(res.precoMinimo));
  setText('res-kpi-venda', fmt(res.precoVendaFinal));

  // Atualiza Barra de Composição
  const safeTotal = Math.max(0.01, res.custoTotalBase);
  const pMat = (res.cFilTotal / safeTotal) * 100, pNrg = (res.cEn / safeTotal) * 100;
  const pMac = (res.cDep / safeTotal) * 100, pMo = (res.cMo / safeTotal) * 100, pExt = (res.cAcc / safeTotal) * 100;
  
  document.getElementById('bar-mat').style.width = `${pMat}%`; document.getElementById('bar-nrg').style.width = `${pNrg}%`;
  document.getElementById('bar-mac').style.width = `${pMac}%`; document.getElementById('bar-mo').style.width = `${pMo}%`;
  document.getElementById('bar-ext').style.width = `${pExt}%`;

  setText('leg-mat', fmt(res.cFilTotal)); setText('leg-nrg', fmt(res.cEn));
  setText('leg-mac', fmt(res.cDep)); setText('leg-mo', fmt(res.cMo)); setText('leg-ext', fmt(res.cAcc));

  // Atualiza Tabela PRO
  const rowHtml = (nome, val, pct) => `<tr>
    <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); color: var(--text);">${nome}</td>
    <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text);">${fmt(val)}</td>
    <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text-muted);">${pct.toFixed(1)}%</td>
  </tr>`;

  document.getElementById('tabela-custos-body').innerHTML = 
    rowHtml('Matéria-Prima (Filamento/Resina)', res.cFilTotal, pMat) +
    rowHtml('Energia Elétrica', res.cEn, pNrg) +
    rowHtml('Desgaste da Máquina', res.cDep, pMac) +
    rowHtml('Mão de Obra Técnica', res.cMo, pMo) +
    rowHtml('Embalagem & Insumos Extras', res.cAcc, pExt) +
    `<tr style="background: rgba(255,255,255,0.03);">
      <td style="padding: 1rem; font-weight: bold; color: var(--text);">CUSTO DIRETO TOTAL</td>
      <td style="padding: 1rem; text-align: right; font-weight: bold; color: var(--text);">${fmt(res.custoTotalBase)}</td>
      <td style="padding: 1rem; text-align: right; font-weight: bold; color: var(--text);">100%</td>
    </tr>`;

  // Salva no Estado
  calcAtual = { 
    custo: res.custoTotalFinal, preco: res.precoVendaFinal, precoManual: isNaN(inputs.precoManual) ? '' : inputs.precoManual,
    lucro: res.lucroReal, imp: inputs.tImp, tImp: inputs.tImp, tMo: inputs.tMo,
    g1: inputs.g1, g2: inputs.g2, g3: inputs.g3, g4: inputs.g4, purga: inputs.purga, 
    markup: inputs.markup, incluirTaxas: inputs.incluirTaxas, acessoriosLista: [...calcAcessorios]
  };
}

// ==========================================
// 7. MÓDULO DE PRODUTOS
// ==========================================
function salvarProduto(btn) {
  let nome = getVal('prod-nome'); if (!nome) return showToast("Nome do Produto!", "warning");
  let docId = getVal('prod-id') || ('p_' + Date.now());
  
  let p = { 
    id: docId, nome, custo: calcAtual.custo, preco: calcAtual.preco, precoManual: calcAtual.precoManual,
    imp: calcAtual.imp, lucro: calcAtual.lucro, m1: getVal('prod-mat-1'), g1: calcAtual.g1,
    m2: getVal('prod-mat-2'), g2: calcAtual.g2, m3: getVal('prod-mat-3'), g3: calcAtual.g3,
    m4: getVal('prod-mat-4'), g4: calcAtual.g4, purga: calcAtual.purga,
    markup: calcAtual.markup, incluirTaxas: calcAtual.incluirTaxas, acessoriosLista: calcAtual.acessoriosLista
  };
  
  toggleLoading(btn, true);
  db.collection('produtos').doc(docId).set(p).then(() => { toggleLoading(btn, false); showToast("Produto Salvo!"); limparCalc(); });
}

function limparCalc() { 
  ['prod-nome','prod-id','prod-preco-manual'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('prod-g-1').value = 100;
  document.getElementById('prod-markup').value = 2.0; 
  document.getElementById('prod-incluir-taxas').checked = true;
  if (document.getElementById('prod-add-acc')) document.getElementById('prod-add-acc').value = ''; 
  
  document.getElementById('form-title').innerHTML = `<i data-lucide="calculator"></i> Calcular Peça`;
  calcAcessorios = []; renderizarAcessoriosCalc(); calcular(); lucide.createIcons();
}

function editarProduto(id) { 
  let p = produtos.find(x => x.id === id); if (!p) return;
  document.getElementById('prod-id').value = p.id; document.getElementById('prod-nome').value = p.nome;
  [1, 2, 3, 4].forEach(i => {
    if (p[`m${i}`]) document.getElementById(`prod-mat-${i}`).value = p[`m${i}`];
    document.getElementById(`prod-g-${i}`).value = p[`g${i}`] || 0;
  });
  document.getElementById('prod-purga').value = p.purga || 0;
  document.getElementById('prod-markup').value = p.markup || 2.0;
  document.getElementById('prod-preco-manual').value = p.precoManual || '';
  document.getElementById('prod-incluir-taxas').checked = p.incluirTaxas !== undefined ? p.incluirTaxas : true;
  
  calcAcessorios = p.acessoriosLista ? [...p.acessoriosLista] : [];
  document.getElementById('form-title').innerHTML = `<i data-lucide="edit"></i> Editar Produto`;
  switchTab('calc'); window.scrollTo({ top: 0, behavior: 'smooth' });
  renderizarAcessoriosCalc(); calcular(); lucide.createIcons();
}

function renderizarProdutos(lista = produtos) {
  renderizarLista('lista-produtos', lista, 'Nenhum produto encontrado.', p => `
    <div class="list-item">
      <div class="item-info">
        <h3><i data-lucide="box" width="16"></i> ${escapeHTML(p.nome)}</h3>
        <p>Venda: <strong>${fmt(p.preco)}</strong> | Custo: ${fmt(p.custo)}</p>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-outline" style="padding:0.3rem" onclick="editarProduto('${p.id}')">Editar</button>
        <button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('produtos','${p.id}')"><i data-lucide="trash-2" width="16"></i></button>
      </div>
    </div>`);
}

function filtrarProdutos() {
  let termo = getVal('busca-produtos').toLowerCase().trim();
  renderizarProdutos(termo ? produtos.filter(p => p.nome && p.nome.toLowerCase().includes(termo)) : produtos);
}

// ==========================================
// 8. MÓDULO DE KITS
// ==========================================
function renderizarKitSelector() {
  const el = document.getElementById('kit-add-prod');
  if (el) el.innerHTML = `<option value="">-- Selecione para Adicionar --</option>` + produtos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (Venda: ${fmt(p.preco)})</option>`).join('');
}

function addProdutoKit() {
  const selectId = getVal('kit-add-prod'), qtd = getInt('kit-add-qtd', 1);
  if (!selectId) return showToast("Selecione um produto da lista!", "warning");
  
  const p = produtos.find(x => x.id === selectId);
  if (p) {
    let existente = kitProdutosTemp.find(item => item.id === p.id);
    if (existente) existente.qtd += qtd;
    else kitProdutosTemp.push({ id: p.id, nome: p.nome, preco: p.preco, custo: p.custo, qtd });
    document.getElementById('kit-add-qtd').value = 1; document.getElementById('kit-add-prod').value = ''; 
    renderizarProdutosKit();
  }
}

function removerProdutoKit(index) { kitProdutosTemp.splice(index, 1); renderizarProdutosKit(); }

function renderizarProdutosKit() {
  renderizarLista('lista-calc-kit-produtos', kitProdutosTemp, 'Nenhum produto adicionado a este combo.', (item, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg); padding: 0.6rem; border-radius: 6px; font-size: 0.85rem; border: 1px dashed var(--card-border);">
      <span><strong style="color:var(--primary);">${item.qtd}x</strong> ${item.nome}</span>
      <div style="display: flex; align-items: center; gap: 1rem;"><span style="font-weight:bold;">${fmt(item.preco * item.qtd)}</span>
      <button style="background: transparent; border: none; color: var(--danger); cursor: pointer; font-weight: bold; font-size: 1.2rem; padding: 0 0.5rem;" onclick="removerProdutoKit(${i})">×</button></div>
    </div>`);
}

function salvarKit(btn) {
  let nome = getVal('kit-nome'); if (!nome) return showToast("Digite o Nome do Combo!", "warning");
  if (kitProdutosTemp.length === 0) return showToast("Adicione produtos ao combo!", "warning");
  
  let itens = [], c = 0, p = 0;
  kitProdutosTemp.forEach(item => { itens.push({ id: item.id, qtd: item.qtd }); c += (item.custo || 0) * item.qtd; p += (item.preco || 0) * item.qtd; });
  
  toggleLoading(btn, true);
  let kitId = 'k_' + Date.now();
  db.collection('kits').doc(kitId).set({ id: kitId, nome, itens, custo: c, preco: p }).then(() => {
    toggleLoading(btn, false); showToast("Combo salvo com sucesso!"); 
    document.getElementById('kit-nome').value = ''; document.getElementById('kit-add-prod').value = ''; 
    kitProdutosTemp = []; renderizarProdutosKit();
  });
}

function renderizarKits(lista = kits) {
  renderizarLista('lista-kits', lista, 'Nenhum combo encontrado.', k => `
    <div class="list-item">
      <div class="item-info">
        <h3><i data-lucide="layers" width="16"></i> ${escapeHTML(k.nome)}</h3><p>Venda: <strong>${fmt(k.preco)}</strong> | Custo: ${fmt(k.custo)}</p>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('kits','${k.id}')"><i data-lucide="trash-2" width="16"></i></button>
      </div>
    </div>`);
}
function filtrarKits() { let termo = getVal('busca-kits').toLowerCase().trim(); renderizarKits(termo ? kits.filter(k => k.nome && k.nome.toLowerCase().includes(termo)) : kits); }

// ==========================================
// 9. MÓDULO CRM, PEDIDOS E ESTOQUE
// ==========================================
function atualizarSelectCRM() {
  const el = document.getElementById('crm-item');
  if (el) el.innerHTML = `<optgroup label="Produtos">` + produtos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`).join('') + `</optgroup><optgroup label="Kits">` + kits.map(k => `<option value="${k.id}">${escapeHTML(k.nome)}</option>`).join('') + `</optgroup>`;
}

function verificarStatusAutomatico() {
  let alterou = false; const seteDias = 7 * 24 * 60 * 60 * 1000; const agora = Date.now();
  pedidos.forEach(p => {
    if (p.status === 'Orçamento' && p.data && (agora - p.data > seteDias)) {
      p.status = 'Sem Retorno'; db.collection('pedidos').doc(p.id.toString()).update({ status: 'Sem Retorno' }); alterou = true;
    }
  });
}

function renderizarPedidos(lista) {
  verificarStatusAutomatico(); 
  // Clonar para não inverter a array original
  const listaParaExibir = [...lista].reverse();
  
  renderizarLista('lista-pedidos', listaParaExibir, 'Nenhum pedido encontrado.', p => {
    let bClass = 'badge-gray', sIcon = 'clock';
    if (p.status === 'Em Preparo') { bClass = 'badge-blue'; sIcon = 'hammer'; }
    if (p.status === 'Enviado') { bClass = 'badge-green'; sIcon = 'truck'; }
    if (p.status === 'Recusado') { bClass = 'badge-red'; sIcon = 'x-circle'; }
    if (p.status === 'Sem Retorno') { bClass = 'badge-orange'; sIcon = 'alert-triangle'; }

    let detalhes = '';
    if (p.cpf) detalhes += `<i data-lucide="file-text" width="12"></i> ${escapeHTML(p.cpf)} &nbsp;`;
    if (p.contato) detalhes += `<i data-lucide="phone" width="12"></i> ${escapeHTML(p.contato)} &nbsp;`;
    if (p.endereco) detalhes += `<br><i data-lucide="map-pin" width="12"></i> ${escapeHTML(p.endereco)}${p.cidade||p.estado?' - '+[escapeHTML(p.cidade),escapeHTML(p.estado)].filter(Boolean).join('/'):''}`;
    if (p.obs) detalhes += `<br><i data-lucide="pen-tool" width="12"></i> <i>Obs: ${escapeHTML(p.obs)}</i>`;

    return `<div class="list-item" style="border-left: 4px solid var(--card-border); ${p.status==='Em Preparo'?'border-color:var(--accent);':''} ${p.status==='Enviado'?'border-color:var(--primary);':''} ${p.status==='Recusado'?'border-color:var(--danger);':''}">
      <div class="item-info">
        <h3>${escapeHTML(p.cliente)} <span class="badge ${bClass}" style="font-size:0.65rem;"><i data-lucide="${sIcon}" width="12"></i> ${p.status}</span></h3>
        <p style="font-size:0.75rem; margin-bottom:0.3rem;"><i data-lucide="calendar" width="12"></i> Data: ${fmtDate(p.data)}</p>
        <p style="margin-bottom: 0.3rem; font-size:0.85rem;"><i data-lucide="shopping-bag" width="14"></i> ${escapeHTML(p.itemNome)} | <strong style="color:var(--primary);">${fmt(p.preco)}</strong></p>
        <p style="font-size:0.75rem;">${detalhes}</p>
        <div style="margin-top: 0.5rem; display: flex; gap: 0.3rem;">
          <button class="btn btn-outline" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="gerarPDF('${p.id}')"><i data-lucide="file-down" width="14"></i> PDF</button>
          <button class="btn btn-whatsapp" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="enviarWhatsPedido('${p.id}')">💬 Whats</button>
        </div>
      </div>
      <div style="display:flex; flex-direction:column; gap:0.5rem; align-items:flex-end;">
        <select class="select-status" onchange="mudarStatusPedido('${p.id}', this.value)">
          <option value="Orçamento" ${p.status==='Orçamento'?'selected':''}>⏳ Orçamento</option>
          <option value="Em Preparo" ${p.status==='Em Preparo'?'selected':''}>🛠️ Em Preparo</option>
          <option value="Enviado" ${p.status==='Enviado'?'selected':''}>✅ Enviado</option>
          <option value="Recusado" ${p.status==='Recusado'?'selected':''}>❌ Recusado</option>
          <option value="Sem Retorno" ${p.status==='Sem Retorno'?'selected':''}>⚠️ Sem Retorno</option>
        </select>
        <button class="btn btn-danger" style="padding:0.2rem 0.5rem; font-size:0.75rem;" onclick="excluirCloud('pedidos','${p.id}')">Excluir</button>
      </div>
    </div>`;
  });
}

function filtrarPedidos() {
  let termo = getVal('input-busca').toLowerCase().trim();
  renderizarPedidos(termo ? pedidos.filter(p => (p.cliente && p.cliente.toLowerCase().includes(termo)) || (p.cpf && p.cpf.toLowerCase().includes(termo)) || (p.contato && p.contato.toLowerCase().includes(termo))) : pedidos);
}

function mudarStatusPedido(id, novoStatus) {
  let ped = pedidos.find(x => x.id === id); if (!ped) return;
  const requerDeducao = (novoStatus === 'Em Preparo' || novoStatus === 'Enviado');
  
  if (requerDeducao && !ped.estoqueDeduzido) {
    if (confirm(`Mudar para "${novoStatus}" irá subtrair automaticamente o plástico do seu estoque. Confirmar?`)) { movimentarEstoquePedidoCloud(ped, -1); ped.estoqueDeduzido = true; } 
    else { uiInit(); return; }
  } else if (!requerDeducao && ped.estoqueDeduzido) {
    if (confirm(`Mudar para "${novoStatus}" irá DEVOLVER os materiais deste pedido para o estoque. Confirmar?`)) { movimentarEstoquePedidoCloud(ped, 1); ped.estoqueDeduzido = false; } 
    else { uiInit(); return; }
  }
  db.collection('pedidos').doc(id.toString()).update({ status: novoStatus, estoqueDeduzido: ped.estoqueDeduzido });
}

function movimentarEstoquePedidoCloud(ped, mul) {
  if (ped.tipo === 'p') alterarProdEstoqueCloud(ped.refId, 1 * mul);
  else { let k = kits.find(x => x.id === ped.refId); if (k && k.itens) k.itens.forEach(i => alterarProdEstoqueCloud(i.id, i.qtd * mul)); }
}

function alterarProdEstoqueCloud(pid, mult) {
  let p = produtos.find(x => x.id === pid); if (!p) return;
  alterarEstoqueCloud(p.m1, (p.g1 + p.purga) * mult); alterarEstoqueCloud(p.m2, p.g2 * mult);
  alterarEstoqueCloud(p.m3, p.g3 * mult); alterarEstoqueCloud(p.m4, p.g4 * mult);
}

function alterarEstoqueCloud(mid, val) {
  if (!mid || val === 0) return; 
  let m = materiais.find(x => x.id === mid); 
  if (m) db.collection('materiais').doc(mid.toString()).update({ estoque: Math.max(0, m.estoque + val) });
}

function salvarPedido(btn) {
  let cli = getVal('crm-cliente'), val = getVal('crm-item'), cpf = getVal('crm-cpf'), cont = getVal('crm-contato'),
      end = getVal('crm-endereco'), cid = getVal('crm-cidade'), est = getVal('crm-estado'), obs = getVal('crm-obs');
      
  if (!cli || !val) return showToast("Preencha pelo menos o Nome do Cliente e o Produto!", "warning");
  
  let tipo = val.split('_')[0], ref = tipo === 'p' ? produtos.find(x => x.id === val) : kits.find(x => x.id === val);
  if (!ref) return showToast("Erro: Item selecionado não encontrado.", "error");

  toggleLoading(btn, true);
  let pedId = 'ped_' + Date.now();
  db.collection('pedidos').doc(pedId).set({ id: pedId, data: Date.now(), cliente: cli, cpf, contato: cont, endereco: end, cidade: cid, estado: est, obs, tipo, refId: val, itemNome: ref.nome, preco: ref.preco, status: 'Orçamento', estoqueDeduzido: false })
    .then(() => {
      toggleLoading(btn, false);
      ['crm-cliente', 'crm-cpf', 'crm-contato', 'crm-endereco', 'crm-cidade', 'crm-estado', 'crm-obs'].forEach(id => document.getElementById(id).value = '');
      showToast("Orçamento lançado!");
    });
}

function exportarPedidosCSV() {
  if (pedidos.length === 0) return showToast("Nenhum pedido para exportar.", "warning");
  let csv = "Data,Cliente,CPF,Contato,Produto,Status,Valor Total\n" + pedidos.map(p => `${fmtDate(p.data)},${(p.cliente||'').replace(/,/g,'')},${(p.cpf||'').replace(/,/g,'')},${(p.contato||'').replace(/,/g,'')},${(p.itemNome||'').replace(/,/g,'')},${p.status},${(p.preco||0).toFixed(2)}`).join('\n');
  let link = document.createElement("a"); link.href = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: 'text/csv;charset=utf-8;' })); link.download = `Relatorio_Vendas_${new Date().toISOString().slice(0,10)}.csv`; document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("Planilha gerada com sucesso!");
}

function gerarPDF(pedId) {
  let ped = pedidos.find(x => x.id === pedId); if (!ped) return;
  let ref = ped.tipo === 'p' ? produtos.find(x => x.id === ped.refId) : null;
  setText('p-cliente', ped.cliente || '-'); setText('p-cpf', ped.cpf || 'Não informado'); setText('p-contato', ped.contato || 'Não informado');
  setText('p-endereco', `${ped.endereco || ''} ${ped.cidade || ped.estado ? '- ' + [ped.cidade, ped.estado].filter(Boolean).join('/') : ''}`.trim() || 'Não informado');
  setText('p-nome', ped.itemNome); setText('p-tempo', ref ? ref.imp : "Variável"); setText('p-preco', fmt(ped.preco)); window.print();
}

function gerarPDFAvulso() {
  setText('p-cliente', 'Cliente Avulso'); setText('p-cpf', '-'); setText('p-contato', '-'); setText('p-endereco', '-');
  setText('p-nome', getVal('prod-nome') || 'Peça Avulsa'); setText('p-tempo', calcAtual.imp || 0); setText('p-preco', fmt(calcAtual.preco)); window.print();
}

function enviarWhatsPedido(id) {
  let ped = pedidos.find(x => x.id === id); if (!ped) return;
  let msg = `Olá, *${ped.cliente}*! Tudo bem?\n\nSegue o orçamento referente ao pedido: *${ped.itemNome}*.\n\n💰 *Valor Total:* ${fmt(ped.preco)}\n\nPodemos dar andamento na sua produção? Qualquer dúvida, estou à disposição!`;
  let fone = ped.contato ? ped.contato.replace(/\D/g, '') : '';
  window.open(fone.length >= 10 ? `https://api.whatsapp.com/send?phone=55${fone}&text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`, '_blank');
}

// ==========================================
// 10. MÓDULO DE CLIENTES (CRM Agrupado)
// ==========================================
function agruparClientes() {
  let mapa = {};
  pedidos.forEach(p => {
    if (!p.cliente) return;
    let nome = p.cliente.trim(), cpfLimpo = p.cpf ? p.cpf.replace(/\D/g, '') : '', key = cpfLimpo || nome.toLowerCase();
    
    if (!mapa[key]) mapa[key] = { idKey: key, nome, contato: p.contato, cpf: p.cpf, totalGasto: 0, qtdPedidos: 0, pedidos: [], ultimo: 0 };
    if (p.status === 'Enviado' || p.status === 'Em Preparo') mapa[key].totalGasto += p.preco;
    mapa[key].qtdPedidos++; mapa[key].pedidos.push(p);
    
    if (p.data > mapa[key].ultimo) {
      mapa[key].ultimo = p.data; mapa[key].nome = nome;
      if (p.contato) mapa[key].contato = p.contato;
      if (p.cpf) mapa[key].cpf = p.cpf; 
    }
  });
  return Object.values(mapa).sort((a, b) => b.totalGasto - a.totalGasto); 
}

function renderizarClientes(lista = agruparClientes()) {
  renderizarLista('lista-clientes', lista, 'Nenhum cliente registrado nos pedidos.', c => `
    <div class="list-item" style="flex-direction:column; align-items:flex-start; cursor:pointer; transition: 0.2s;" onclick="verDetalhesCliente('${c.idKey}')">
       <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <h3 style="font-size:1.1rem; color:var(--primary);"><i data-lucide="user"></i> ${escapeHTML(c.nome)}</h3><span class="badge badge-blue">${c.qtdPedidos} Pedidos</span>
       </div>
       <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;"><i data-lucide="calendar"></i> Último Pedido: ${fmtDate(c.ultimo)}</p>
       <p style="font-size:0.95rem; font-weight:bold; margin-top:0.5rem;">Total Gasto: ${fmt(c.totalGasto)}</p>
    </div>`);
}

function filtrarClientes() {
  let termo = getVal('busca-clientes').toLowerCase().trim(), clientes = agruparClientes();
  renderizarClientes(termo ? clientes.filter(c => c.nome.toLowerCase().includes(termo) || (c.contato && c.contato.includes(termo)) || (c.cpf && c.cpf.replace(/\D/g, '').includes(termo.replace(/\D/g, '')))) : clientes);
}

function verDetalhesCliente(idKey) {
  let c = agruparClientes().find(x => x.idKey === idKey); if (!c) return;
  document.getElementById('detalhe-cliente-nome').innerHTML = `<i data-lucide="user"></i> ${escapeHTML(c.nome)}`;
  setText('detalhe-cliente-info', `${c.contato || 'Sem Telefone Cadastrado'} | ${c.cpf || 'Sem CPF Cadastrado'}`);
  setText('detalhe-cliente-gasto', fmt(c.totalGasto)); setText('detalhe-cliente-qtd', c.qtdPedidos);
  
  renderizarLista('detalhe-cliente-pedidos', c.pedidos.sort((a,b) => b.data - a.data), '', p => {
     let bClass = p.status === 'Em Preparo' ? 'badge-blue' : p.status === 'Enviado' ? 'badge-green' : p.status === 'Recusado' ? 'badge-red' : p.status === 'Sem Retorno' ? 'badge-orange' : 'badge-gray';
     return `<div class="list-item" style="padding:0.8rem; flex-wrap:wrap; border:1px dashed var(--card-border);">
       <div style="flex:1; min-width:150px;"><strong style="display:block; font-size:0.95rem; margin-bottom:0.2rem;">${escapeHTML(p.itemNome)}</strong><span class="badge ${bClass}" style="font-size:0.7rem;">${p.status}</span></div>
       <div style="text-align:right; font-size:0.85rem;"><div style="color:var(--text-muted); margin-bottom:0.2rem;">${fmtDate(p.data)}</div><strong style="color:var(--primary); font-size:1rem;">${fmt(p.preco)}</strong></div>
     </div>`;
  });
  document.getElementById('modal-cliente').style.display = 'flex';
}
function fecharModalCliente() { document.getElementById('modal-cliente').style.display = 'none'; }

// ==========================================
// 11. MÓDULO DE MATERIAIS, ACESSÓRIOS E CONFIG
// ==========================================
function reporEstoque(id) {
  let m = materiais.find(x => x.id === id); if (!m) return;
  let qtdAdicional = parseFloat(prompt(`Quantas gramas de ${m.nome} (${m.detalhe || (m.marca + ' ' + m.cor).trim()}) está adicionando?`, "1000"));
  if (isNaN(qtdAdicional) || qtdAdicional <= 0) return;
  let precoNovoKg = parseFloat(prompt(`Qual foi o preço pago por KG (R$) nessa nova compra?`, m.preco));
  if (isNaN(precoNovoKg) || precoNovoKg < 0) return;

  let novoEstoque = m.estoque + qtdAdicional;
  let novoPrecoMedio = (((m.estoque / 1000) * m.preco) + ((qtdAdicional / 1000) * precoNovoKg)) / (novoEstoque / 1000);

  db.collection('materiais').doc(id.toString()).update({ estoque: novoEstoque, preco: novoPrecoMedio }).then(() => showToast(`Sucesso! Estoque: ${novoEstoque}g | Novo Preço Médio: R$ ${novoPrecoMedio.toFixed(2)}/kg.`));
}

function editarMaterial(id) {
  let m = materiais.find(x => x.id === id); if (!m) return;
  document.getElementById('mat-id').value = m.id; document.getElementById('mat-codigo').value = m.codigo || ''; document.getElementById('mat-nome').value = m.nome;
  document.getElementById('mat-marca').value = m.detalhe || m.marca || ''; document.getElementById('mat-cor').value = m.detalhe ? '' : (m.cor || '');
  document.getElementById('mat-preco').value = m.preco; document.getElementById('mat-estoque').value = m.estoque;
  document.getElementById('btn-mat').innerHTML = `<i data-lucide="save"></i> Atualizar Material`; document.getElementById('btn-cancel-mat').style.display = "inline-flex"; lucide.createIcons();
}

function cancelarEdicaoMat() {
  ['mat-id','mat-codigo','mat-nome','mat-marca','mat-cor','mat-preco'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('mat-estoque').value = '1000';
  document.getElementById('btn-mat').innerHTML = `<i data-lucide="save"></i> Salvar Material`; document.getElementById('btn-cancel-mat').style.display = "none"; lucide.createIcons();
}

function salvarMaterial(btn) {
  let id = getVal('mat-id'), nome = getVal('mat-nome'), prc = getFloat('mat-preco', NaN);
  if (!nome || isNaN(prc)) return showToast("Preencha o tipo e o preço corretamente.", "warning");
  
  toggleLoading(btn, true); let docId = id || ('m_' + Date.now());
  db.collection('materiais').doc(docId).set({ codigo: getVal('mat-codigo'), nome, marca: getVal('mat-marca'), cor: getVal('mat-cor'), preco: prc, estoque: getFloat('mat-estoque') }).then(() => { toggleLoading(btn, false); cancelarEdicaoMat(); showToast("Material salvo!"); });
}

function renderizarMateriais(lista = materiais) {
  renderizarLista('lista-materiais', lista, 'Nenhum material encontrado.', m => {
    let estClass = m.estoque <= 200 ? 'badge-danger' : 'badge-default', alerta = m.estoque <= 200 ? `<br><span style="color:var(--danger); font-size:0.75rem;">⚠️ Estoque Crítico!</span>` : '';
    return `<div class="list-item"><div class="item-info"><h3><span style="color:var(--accent); margin-right:0.5rem;">[${m.codigo || 'S/C'}]</span> ${m.nome} <span style="font-size:0.8rem">${m.detalhe || (m.marca + ' ' + m.cor).trim()}</span></h3><p><i data-lucide="coins" width="14"></i> ${fmt(m.preco)}/kg | <span class="badge ${estClass}">Estoque: ${m.estoque}g</span>${alerta}</p></div><div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;"><button class="btn btn-outline" style="padding:0.3rem; border-color:var(--primary); color:var(--primary);" onclick="reporEstoque('${m.id}')">+ Repor</button><button class="btn btn-outline" style="padding:0.3rem" onclick="editarMaterial('${m.id}')">Editar</button><button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('materiais','${m.id}')"><i data-lucide="trash-2" width="16"></i></button></div></div>`;
  });
}
function filtrarMateriais() { let termo = getVal('busca-materiais').toLowerCase().trim(); renderizarMateriais(termo ? materiais.filter(m => (m.nome && m.nome.toLowerCase().includes(termo)) || (m.marca && m.marca.toLowerCase().includes(termo)) || (m.cor && m.cor.toLowerCase().includes(termo)) || (m.codigo && m.codigo.toString().toLowerCase().includes(termo))) : materiais); }

function renderizarAcessorios() {
  renderizarLista('lista-acessorios', acessorios, 'Nenhum item cadastrado.', a => `<div class="list-item"><div class="item-info"><h3><i data-lucide="package-plus" width="16"></i> ${a.nome}</h3><p>Custo Unitário: ${fmt(a.preco)}</p></div><div style="display:flex; gap:0.5rem; flex-wrap:wrap;"><button class="btn btn-outline" style="padding:0.3rem" onclick="editarAcessorio('${a.id}')">Editar</button><button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('acessorios','${a.id}')"><i data-lucide="trash-2" width="16"></i></button></div></div>`);
}

function editarAcessorio(id) { let a = acessorios.find(x => x.id === id); if (!a) return; document.getElementById('acc-id').value = a.id; document.getElementById('acc-nome').value = a.nome; document.getElementById('acc-preco').value = a.preco; document.getElementById('btn-salvar-acc').innerHTML = `<i data-lucide="save"></i> Atualizar Item`; document.getElementById('btn-cancelar-acc').style.display = "inline-flex"; lucide.createIcons(); }
function cancelarEdicaoAcc() { ['acc-id','acc-nome','acc-preco'].forEach(id => document.getElementById(id).value = ''); document.getElementById('btn-salvar-acc').innerHTML = `<i data-lucide="plus-circle"></i> Cadastrar Item`; document.getElementById('btn-cancelar-acc').style.display = "none"; lucide.createIcons(); }
function salvarAcessorio(btn) { let nome = getVal('acc-nome'), prc = getFloat('acc-preco', NaN); if (!nome || isNaN(prc)) return showToast("Preencha o nome e o preço.", "warning"); toggleLoading(btn, true); let docId = getVal('acc-id') || ('acc_' + Date.now()); db.collection('acessorios').doc(docId).set({ nome, preco: prc }).then(() => { toggleLoading(btn, false); cancelarEdicaoAcc(); showToast("Item salvo!"); }); }
function addAcessorioCalc() { const acc = acessorios.find(a => a.id === getVal('prod-add-acc')); if (acc) { calcAcessorios.push({ id: acc.id, nome: acc.nome, preco: acc.preco, qtd: getInt('prod-add-qtd', 1) }); document.getElementById('prod-add-qtd').value = 1; document.getElementById('prod-add-acc').value = ''; renderizarAcessoriosCalc(); calcular(); } else showToast("Selecione um item da lista primeiro!", "warning"); }
function removerAcessorioCalc(index) { calcAcessorios.splice(index, 1); renderizarAcessoriosCalc(); calcular(); }
function renderizarAcessoriosCalc() { renderizarLista('lista-calc-acessorios', calcAcessorios, 'Nenhum acessório ou embalagem adicionado a esta peça.', (item, i) => `<div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg); padding: 0.6rem; border-radius: 6px; font-size: 0.85rem; border: 1px dashed var(--card-border);"><span><strong style="color:var(--primary);">${item.qtd}x</strong> ${item.nome}</span><div style="display: flex; align-items: center; gap: 1rem;"><span style="font-weight:bold;">${fmt(item.preco * item.qtd)}</span><button style="background: transparent; border: none; color: var(--danger); cursor: pointer; font-weight: bold; font-size: 1.2rem; padding: 0 0.5rem;" onclick="removerAcessorioCalc(${i})">×</button></div></div>`); }

function salvarConfig(btn) {
  cfg.potencia = getFloat('cfg-potencia', 110); cfg.kwh = getFloat('cfg-kwh'); cfg.maqVal = getFloat('cfg-maquina'); cfg.maqHrs = getFloat('cfg-horas', 1); cfg.mo = getFloat('cfg-mo'); cfg.impostoPct = getFloat('cfg-imposto'); cfg.taxaPgPct = getFloat('cfg-taxapg');
  toggleLoading(btn, true); db.collection('configuracoes').doc('geral').set(cfg).then(() => { toggleLoading(btn, false); showToast("Custos salvos na nuvem!"); });
}

function excluirCloud(col, id) {
  if (!confirm("Tem certeza que deseja excluir?")) return;
  if (col === 'pedidos') { let p = pedidos.find(x => x.id === id); if (p && p.estoqueDeduzido && confirm("Deseja DEVOLVER os materiais ao estoque antes de excluir?")) movimentarEstoquePedidoCloud(p, 1); }
  db.collection(col).doc(id.toString()).delete().then(() => showToast("Excluído!"));
}

// ==========================================
// 12. BACKUP E MÁSCARAS DE INPUT
// ==========================================
function exportar() { let data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({cfg, materiais, acessorios, produtos, kits, pedidos})); let a = document.createElement('a'); a.href = data; a.download = `backup_3d_${new Date().toISOString().slice(0,10)}.json`; a.click(); }
function importar(e) {
  let r = new FileReader(); 
  r.onload = async function(ev) { 
    try {
      let obj = JSON.parse(ev.target.result); showToast("Restaurando backup... Aguarde.", "warning");
      if (obj.cfg) await db.collection('configuracoes').doc('geral').set(obj.cfg);
      const restCol = async (col, arr) => { if (arr && arr.length > 0) { let batch = db.batch(); arr.forEach(item => batch.set(db.collection(col).doc(item.id.toString()), item)); await batch.commit(); } };
      await restCol('materiais', obj.materiais); await restCol('acessorios', obj.acessorios); await restCol('produtos', obj.produtos); await restCol('kits', obj.kits); await restCol('pedidos', obj.pedidos);
      showToast("Backup restaurado com sucesso! A página será atualizada."); setTimeout(() => window.location.reload(), 2000);
    } catch(err) { showToast("Erro ao ler backup. Arquivo inválido.", "error"); }
  }; 
  r.readAsText(e.target.files[0]); 
}

const applyMask = (id, regex, formatFn) => { const el = document.getElementById(id); if(el) el.addEventListener('input', e => e.target.value = formatFn(e.target.value.replace(/\D/g, '').match(regex))); };
applyMask('crm-cpf', /(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})/, x => !x[2] ? x[1] : x[1] + '.' + x[2] + (x[3] ? '.' + x[3] : '') + (x[4] ? '-' + x[4] : ''));
applyMask('crm-contato', /(\d{0,2})(\d{0,5})(\d{0,4})/, x => !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : ''));

// ==========================================
// 13. DASHBOARD E GRÁFICOS (CHART.JS)
// ==========================================
let chartFinancas = null, chartProdutos = null;
if (typeof Chart !== 'undefined') Chart.defaults.color = '#94a3b8'; 

function atualizarDashboard() {
  if (typeof Chart === 'undefined') return;
  let periodo = getVal('filtro-dashboard') || 'tudo', agora = Date.now();

  let pedidosFiltrados = pedidos.filter(p => {
    if (p.status !== 'Enviado') return false; 
    if (periodo === 'tudo') return true;
    let trintaDias = 30 * 24 * 60 * 60 * 1000, noventaDias = 90 * 24 * 60 * 60 * 1000;
    if (periodo === '30') return (agora - p.data) <= trintaDias;
    if (periodo === '90') return (agora - p.data) <= noventaDias;
    if (periodo === 'ano') return new Date(p.data).getFullYear() === new Date().getFullYear();
    return true;
  });
  
  let meses = {}, produtosCount = {};
  pedidosFiltrados.forEach(p => {
    let mesAno = new Date(p.data).toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    if (!meses[mesAno]) meses[mesAno] = { receita: 0, custo: 0 };
    meses[mesAno].receita += p.preco;
    let ref = p.tipo === 'p' ? produtos.find(x => x.id === p.refId) : kits.find(x => x.id === p.refId);
    meses[mesAno].custo += ref ? ref.custo : 0;
    produtosCount[p.itemNome] = (produtosCount[p.itemNome] || 0) + 1;
  });

  let labelsMeses = Object.keys(meses), dadosReceita = labelsMeses.map(m => meses[m].receita), dadosLucro = labelsMeses.map(m => meses[m].receita - meses[m].custo);
  let topProdutos = Object.entries(produtosCount).sort((a,b) => b[1] - a[1]).slice(0, 5);

  const initChart = (id, type, data, options) => {
    const ctx = document.getElementById(id)?.getContext('2d');
    if (!ctx) return null;
    return new Chart(ctx, { type, data, options });
  };

  if (chartFinancas) chartFinancas.destroy();
  chartFinancas = initChart('chartFinancas', 'bar', {
    labels: labelsMeses.length ? labelsMeses : ['Sem vendas'],
    datasets: [{ label: 'Faturamento (R$)', data: dadosReceita.length ? dadosReceita : [0], backgroundColor: '#10b981', borderRadius: 4 }, { label: 'Lucro Liquido (R$)', data: dadosLucro.length ? dadosLucro : [0], backgroundColor: '#3b82f6', borderRadius: 4 }]
  }, { responsive: true, maintainAspectRatio: false });

  if (chartProdutos) chartProdutos.destroy();
  chartProdutos = initChart('chartProdutos', 'doughnut', {
    labels: topProdutos.length ? topProdutos.map(p => p[0]) : ['Nenhum dado'],
    datasets: [{ data: topProdutos.length ? topProdutos.map(p => p[1]) : [1], backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'], borderWidth: 0 }]
  }, { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } } });
}