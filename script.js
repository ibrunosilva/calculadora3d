// PREVENÇÃO XSS
function escapeHTML(str) {
  if (!str) return '';
  return str.toString().replace(/[&<>'"]/g, tag => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag])
  );
}

// SPINNER DE AÇÃO / FEEDBACK
function toggleLoading(btn, isLoading, originalHtml = '') {
  if(!btn) return;
  if (isLoading) {
    btn.dataset.original = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="spin" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Salvando...`;
  } else {
    btn.disabled = false;
    btn.innerHTML = btn.dataset.original || originalHtml;
    lucide.createIcons();
  }
}

// CONFIGURAÇÃO DO FIREBASE
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

// VARIÁVEIS GLOBAIS
let cfg = { potencia: 110, kwh: 0.65, maqVal: 4500, maqHrs: 5000, mo: 25, impostoPct: 10, taxaPgPct: 3.5 };
let materiais = [{ id: 'm1', nome: 'PLA', marca: 'Voolt3D', cor: 'Vermelho', preco: 90, estoque: 1000 }];
let acessorios = [];
let produtos = []; let kits = []; let pedidos = [];
let calcAtual = {};

let calcAcessorios = [];
let kitProdutosTemp = [];

// FUNÇÃO DE NOTIFICAÇÃO TOAST
function showToast(mensagem, tipo = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  
  const toast = document.createElement('div');
  toast.className = `toast ${tipo}`;
  
  let icone = '✅';
  if (tipo === 'error') icone = '❌';
  if (tipo === 'warning') icone = '⚠️';
  
  toast.innerHTML = `<span>${icone}</span> <span>${mensagem}</span>`;
  container.appendChild(toast);
  
  setTimeout(() => toast.remove(), 3000);
}

window.onload = () => {
  firebase.auth().onAuthStateChanged((user) => {
    if (user) {
      document.getElementById('auth-screen').style.display = 'none';
      document.getElementById('app-content').style.display = 'block';
      carregarDadosCloud(); 
    } else {
      document.getElementById('auth-screen').style.display = 'flex';
      document.getElementById('app-content').style.display = 'none';
      lucide.createIcons();
    }
  });
};

function fazerLogin(btn) {
  let email = document.getElementById('login-email').value;
  let senha = document.getElementById('login-senha').value;
  
  document.getElementById('login-erro').innerText = "";
  toggleLoading(btn, true);
  
  firebase.auth().signInWithEmailAndPassword(email, senha)
    .then((userCredential) => {
      toggleLoading(btn, false);
    })
    .catch((error) => {
      console.error("Erro completo:", error);
      let msg = error.message;
      if (error.code === 'auth/user-not-found') msg = "Usuário não cadastrado.";
      if (error.code === 'auth/wrong-password') msg = "Senha incorreta.";
      if (error.code === 'auth/invalid-email') msg = "Formato de e-mail inválido.";
      if (error.code === 'auth/network-request-failed') msg = "Erro de rede (Verifique sua conexão).";
      document.getElementById('login-erro').innerText = "Erro: " + msg;
      toggleLoading(btn, false);
    });
}

function toggleTheme() { document.body.setAttribute('data-theme', document.body.getAttribute('data-theme')==='light'?'dark':'light'); }
function switchTab(t) { 
  document.querySelectorAll('.tab-content, nav button').forEach(e => e.classList.remove('active')); 
  document.getElementById('tab-'+t).classList.add('active'); 
  if(event && event.currentTarget) event.currentTarget.classList.add('active'); 
  if(t === 'dashboard') atualizarDashboard(); 
}
function fmt(v) { return (v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}); }
function fmtDate(ms) { let d = new Date(ms); return d.toLocaleDateString('pt-BR'); }

// CARREGAR DADOS EM TEMPO REAL DA NUVEM
function carregarDadosCloud() {
  db.collection('configuracoes').doc('geral').get().then(doc => {
    if(doc.exists) cfg = doc.data();
    uiInit();
  }).catch(() => uiInit());

  db.collection('materiais').onSnapshot(snapshot => {
    materiais = [];
    snapshot.forEach(doc => materiais.push({ id: doc.id, ...doc.data() }));
    if(materiais.length === 0) {
      db.collection('materiais').doc('m1').set({ nome: 'PLA', marca: 'Padrão', cor: '', preco: 90, estoque: 1000 });
    } else {
      atualizarSelectsEListas();
    }
  });

  db.collection('acessorios').onSnapshot(snapshot => {
    acessorios = [];
    snapshot.forEach(doc => acessorios.push({ id: doc.id, ...doc.data() }));
    atualizarSelectsEListas();
  });

  db.collection('produtos').onSnapshot(snapshot => {
    produtos = [];
    snapshot.forEach(doc => produtos.push({ id: doc.id, ...doc.data() }));
    renderizarProdutos();
    atualizarSelectCRM();
    renderizarKitSelector();
  });

  db.collection('kits').onSnapshot(snapshot => {
    kits = [];
    snapshot.forEach(doc => kits.push({ id: doc.id, ...doc.data() }));
    renderizarKits();
    atualizarSelectCRM();
  });

  db.collection('pedidos').onSnapshot(snapshot => {
    pedidos = [];
    snapshot.forEach(doc => {
      let p = { id: doc.id, ...doc.data() };
      if(!p.data) p.data = Date.now();
      if(p.status === 'Produzido') { p.status = 'Enviado'; p.estoqueDeduzido = true; }
      if(p.estoqueDeduzido === undefined) p.estoqueDeduzido = false;
      pedidos.push(p);
    });
    renderizarPedidos(pedidos);
    renderizarClientes(); // O CRM de Clientes baseia-se nos pedidos!
  });
}

function atualizarSelectsEListas() {
  const opts = `<option value="">-- Nenhum --</option>` + materiais.map(m => {
    let desc = m.detalhe ? m.detalhe : `${m.marca || ''} ${m.cor || ''}`.trim();
    return `<option value="${m.id}">${m.codigo ? '['+m.codigo+'] ' : ''}${m.nome} ${desc} (R$${m.preco})</option>`;
  }).join('');
  [1,2,3,4].forEach(i => {
    let el = document.getElementById(`prod-mat-${i}`);
    if(el) el.innerHTML = opts;
  });
  renderizarMateriais();

  const optsAcc = `<option value="">-- Selecione para Adicionar --</option>` + acessorios.map(a => `<option value="${a.id}">${a.nome} (R$${a.preco.toFixed(2)})</option>`).join('');
  let elAcc = document.getElementById('prod-add-acc');
  if(elAcc) elAcc.innerHTML = optsAcc;
  renderizarAcessorios();
  renderizarAcessoriosCalc();

  calcular();
}

function uiInit() {
  document.getElementById('cfg-potencia').value = cfg.potencia || 110;
  document.getElementById('cfg-kwh').value = cfg.kwh || 0.65;
  document.getElementById('cfg-maquina').value = cfg.maqVal || 4500;
  document.getElementById('cfg-horas').value = cfg.maqHrs || 5000;
  document.getElementById('cfg-mo').value = cfg.mo || 25;
  document.getElementById('cfg-imposto').value = cfg.impostoPct || 10;
  document.getElementById('cfg-taxapg').value = cfg.taxaPgPct || 3.5;
  
  atualizarSelectsEListas();
  atualizarSelectCRM();
  renderizarKitSelector();
  calcular();
  
  setTimeout(() => lucide.createIcons(), 100);
}

function verificarStatusAutomatico() {
  let alterou = false;
  const seteDias = 7 * 24 * 60 * 60 * 1000;
  const agora = Date.now();
  pedidos.forEach(p => {
    if(p.status === 'Orçamento' && p.data && (agora - p.data > seteDias)) {
      p.status = 'Sem Retorno';
      db.collection('pedidos').doc(p.id.toString()).update({ status: 'Sem Retorno' });
      alterou = true;
    }
  });
}

// ==========================================
// SEÇÃO DE MATERIAIS
// ==========================================
function reporEstoque(id) {
  let m = materiais.find(x => x.id === id);
  if(m) {
    let desc = m.detalhe ? m.detalhe : `${m.marca || ''} ${m.cor || ''}`.trim();
    let qtdAdicional = parseFloat(prompt(`Quantas gramas de ${m.nome} (${desc}) você está adicionando?`, "1000"));
    if(isNaN(qtdAdicional) || qtdAdicional <= 0) return;
    
    let precoNovoKg = parseFloat(prompt(`Qual foi o preço pago por KG (R$) nessa nova compra?`, m.preco));
    if(isNaN(precoNovoKg) || precoNovoKg < 0) return;

    let custoAtualTotal = (m.estoque / 1000) * m.preco;
    let custoNovoTotal = (qtdAdicional / 1000) * precoNovoKg;
    
    let novoEstoque = m.estoque + qtdAdicional;
    let novoPrecoMedio = (custoAtualTotal + custoNovoTotal) / (novoEstoque / 1000);

    db.collection('materiais').doc(id.toString()).update({ 
      estoque: novoEstoque,
      preco: novoPrecoMedio 
    }).then(() => {
      showToast(`Sucesso! Estoque: ${novoEstoque}g | Novo Preço Médio: R$ ${novoPrecoMedio.toFixed(2)}/kg.`);
    });
  }
}

function editarMaterial(id) {
  let m = materiais.find(x => x.id === id);
  if(!m) return;
  document.getElementById('mat-id').value = m.id; 
  document.getElementById('mat-codigo').value = m.codigo || ''; 
  document.getElementById('mat-nome').value = m.nome;
  
  if(m.detalhe) {
    document.getElementById('mat-marca').value = m.detalhe;
    document.getElementById('mat-cor').value = '';
  } else {
    document.getElementById('mat-marca').value = m.marca || ''; 
    document.getElementById('mat-cor').value = m.cor || '';
  }
  
  document.getElementById('mat-preco').value = m.preco;
  document.getElementById('mat-estoque').value = m.estoque;
  
  document.getElementById('btn-mat').innerHTML = `<i data-lucide="save"></i> Atualizar Material`;
  document.getElementById('btn-cancel-mat').style.display = "inline-flex";
  lucide.createIcons();
}

function cancelarEdicaoMat() {
  document.getElementById('mat-id').value = ''; 
  document.getElementById('mat-codigo').value = ''; 
  document.getElementById('mat-nome').value = '';
  document.getElementById('mat-marca').value = ''; 
  document.getElementById('mat-cor').value = ''; 
  document.getElementById('mat-preco').value = '';
  document.getElementById('mat-estoque').value = '1000';
  
  document.getElementById('btn-mat').innerHTML = `<i data-lucide="save"></i> Salvar Material`;
  document.getElementById('btn-cancel-mat').style.display = "none";
  lucide.createIcons();
}

function salvarMaterial(btn) {
  let id = document.getElementById('mat-id').value;
  let cod = document.getElementById('mat-codigo').value;
  let nome = document.getElementById('mat-nome').value;
  let marca = document.getElementById('mat-marca').value;
  let cor = document.getElementById('mat-cor').value;
  let prc = parseFloat(document.getElementById('mat-preco').value);
  let est = parseFloat(document.getElementById('mat-estoque').value);
  
  if(!nome||isNaN(prc)) return showToast("Preencha o tipo e o preço corretamente.", "warning");
  
  toggleLoading(btn, true);
  let docId = id ? id : 'm_' + Date.now();
  
  db.collection('materiais').doc(docId).set({ codigo: cod, nome, marca: marca, cor: cor, preco: prc, estoque: est }).then(() => {
    toggleLoading(btn, false);
    cancelarEdicaoMat(); 
    showToast("Material salvo!");
  });
}

// ==========================================
// SEÇÃO DE ACESSÓRIOS (CONFIGURAÇÃO)
// ==========================================
function renderizarAcessorios() {
  let container = document.getElementById('lista-acessorios');
  if(!container) return;
  if(acessorios.length === 0) { container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">Nenhum item cadastrado.</p>'; return; }
  container.innerHTML = acessorios.map(a => `
    <div class="list-item">
      <div class="item-info">
        <h3><i data-lucide="package-plus" width="16"></i> ${a.nome}</h3><p>Custo Unitário: ${fmt(a.preco)}</p>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap;">
        <button class="btn btn-outline" style="padding:0.3rem" onclick="editarAcessorio('${a.id}')">Editar</button>
        <button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('acessorios','${a.id}')"><i data-lucide="trash-2" width="16"></i></button>
      </div>
    </div>
  `).join('');
  setTimeout(() => lucide.createIcons(), 0);
}

function editarAcessorio(id) {
  let a = acessorios.find(x => x.id === id);
  if(!a) return;
  document.getElementById('acc-id').value = a.id;
  document.getElementById('acc-nome').value = a.nome;
  document.getElementById('acc-preco').value = a.preco;
  
  document.getElementById('btn-salvar-acc').innerHTML = `<i data-lucide="save"></i> Atualizar Item`;
  document.getElementById('btn-cancelar-acc').style.display = "inline-flex";
  lucide.createIcons();
}

function cancelarEdicaoAcc() {
  document.getElementById('acc-id').value = '';
  document.getElementById('acc-nome').value = '';
  document.getElementById('acc-preco').value = '';
  
  document.getElementById('btn-salvar-acc').innerHTML = `<i data-lucide="plus-circle"></i> Cadastrar Item`;
  document.getElementById('btn-cancelar-acc').style.display = "none";
  lucide.createIcons();
}

function salvarAcessorio(btn) {
  let id = document.getElementById('acc-id').value;
  let nome = document.getElementById('acc-nome').value, prc = parseFloat(document.getElementById('acc-preco').value);
  if(!nome || isNaN(prc)) return showToast("Preencha o nome e o preço.", "warning");

  toggleLoading(btn, true);
  let docId = id ? id : 'acc_' + Date.now();
  db.collection('acessorios').doc(docId).set({ nome, preco: prc }).then(() => {
    toggleLoading(btn, false);
    cancelarEdicaoAcc(); showToast("Item salvo!");
  });
}

function addAcessorioCalc() {
  const select = document.getElementById('prod-add-acc');
  const qtd = parseInt(document.getElementById('prod-add-qtd').value) || 1;
  if(!select.value) return showToast("Selecione um item da lista primeiro!", "warning");
  
  const acc = acessorios.find(a => a.id === select.value);
  if(acc) {
    calcAcessorios.push({ id: acc.id, nome: acc.nome, preco: acc.preco, qtd: qtd });
    document.getElementById('prod-add-qtd').value = 1; 
    select.value = ''; // Limpa seletor
    renderizarAcessoriosCalc();
    calcular();
  }
}

function removerAcessorioCalc(index) {
  calcAcessorios.splice(index, 1);
  renderizarAcessoriosCalc();
  calcular();
}

function renderizarAcessoriosCalc() {
  const container = document.getElementById('lista-calc-acessorios');
  if(!container) return;
  
  if(calcAcessorios.length === 0) {
    container.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted);">Nenhum acessório ou embalagem adicionado a esta peça.</p>';
    return;
  }
  
  container.innerHTML = calcAcessorios.map((item, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg); padding: 0.6rem; border-radius: 6px; font-size: 0.85rem; border: 1px dashed var(--card-border);">
      <span><strong style="color:var(--primary);">${item.qtd}x</strong> ${item.nome}</span>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <span style="font-weight:bold;">${fmt(item.preco * item.qtd)}</span>
        <button style="background: transparent; border: none; color: var(--danger); cursor: pointer; font-weight: bold; font-size: 1.2rem; padding: 0 0.5rem;" onclick="removerAcessorioCalc(${i})">×</button>
      </div>
    </div>
  `).join('');
}

// ==========================================
// CÁLCULO MESTRE (RATEIO DE PURGA + PREÇO MANUAL)
// ==========================================
function calcular() {
  const getMat = id => materiais.find(m => m.id === document.getElementById(id).value) || {preco:0};
  
  const g1 = parseFloat(document.getElementById('prod-g-1').value)||0; 
  const g2 = parseFloat(document.getElementById('prod-g-2').value)||0;
  const g3 = parseFloat(document.getElementById('prod-g-3').value)||0; 
  const g4 = parseFloat(document.getElementById('prod-g-4').value)||0;
  const purga = parseFloat(document.getElementById('prod-purga').value)||0;
  
  const tImp = parseFloat(document.getElementById('prod-tempo-imp').value)||0;
  const tMo = parseFloat(document.getElementById('prod-tempo-mo').value)||0;
  
  const custoAcessorio = calcAcessorios.reduce((acc, curr) => acc + (curr.preco * curr.qtd), 0);
  const markupMultiplicador = Math.max(1, parseFloat(document.getElementById('prod-markup').value) || 1.0);
  
  // Captura o preço manual se tiver sido preenchido
  const precoManualInput = document.getElementById('prod-preco-manual').value;
  const precoManual = parseFloat(precoManualInput);
  
  const incluirTaxas = document.getElementById('prod-incluir-taxas').checked;
  const impPct = cfg.impostoPct || 10;
  const txaPct = cfg.taxaPgPct || 3.5;
  const taxaTotalPct = (impPct + txaPct) / 100;

  // 1. CUSTO DE MATERIAL BASE E RATEIO DE PURGA
  const p1 = getMat('prod-mat-1').preco / 1000;
  const p2 = getMat('prod-mat-2').preco / 1000;
  const p3 = getMat('prod-mat-3').preco / 1000;
  const p4 = getMat('prod-mat-4').preco / 1000;

  const cFilBase = (g1 * p1) + (g2 * p2) + (g3 * p3) + (g4 * p4);
  let coresAtivas = 0; let somaPrecosAtivos = 0; let custoPurga = 0;
  if (g1 > 0) { coresAtivas++; somaPrecosAtivos += p1; }
  if (g2 > 0) { coresAtivas++; somaPrecosAtivos += p2; }
  if (g3 > 0) { coresAtivas++; somaPrecosAtivos += p3; }
  if (g4 > 0) { coresAtivas++; somaPrecosAtivos += p4; }

  if (coresAtivas > 0 && purga > 0) {
    const purgaPorCor = purga / coresAtivas;
    custoPurga = purgaPorCor * somaPrecosAtivos;
  }
  const cFilTotal = cFilBase + custoPurga;
  
  // 2. CUSTOS OPERACIONAIS E DIRETOS
  const cEn = tImp * (cfg.potencia / 1000) * cfg.kwh; 
  const cDep = tImp * (cfg.maqVal / cfg.maqHrs); 
  const cMo = tMo * cfg.mo;
  const custoTotalBase = cFilTotal + cEn + cDep + cMo + custoAcessorio;

  // 3. PREÇO SUGERIDO MATEMÁTICO
  const margemLiquida = markupMultiplicador > 1 ? (1 - (1 / markupMultiplicador)) : 0; 
  let precoSugerido = custoTotalBase * markupMultiplicador; 
  
  if (incluirTaxas) {
    const deducoesTotais = taxaTotalPct + margemLiquida;
    if (deducoesTotais < 0.95) { precoSugerido = custoTotalBase / (1 - deducoesTotais); } 
    else { precoSugerido = custoTotalBase * (1 + margemLiquida) / Math.max(0.1, (1 - taxaTotalPct)); }
  } else {
    if(margemLiquida < 1) precoSugerido = custoTotalBase / (1 - margemLiquida);
  }

  // 4. APLICAÇÃO DO PREÇO FINAL (Manual vs Sugerido)
  let precoVendaFinal = precoSugerido;
  if (!isNaN(precoManual) && precoManual > 0) {
      precoVendaFinal = precoManual; // Substitui o sugerido pelo seu preço customizado
  }

  // 5. CÁLCULO DE TAXAS SOBRE O PREÇO FINAL PRATICADO
  let valorImposto = 0; 
  let valorTaxaPg = 0;
  if(incluirTaxas) {
      valorImposto = precoVendaFinal * (impPct / 100);
      valorTaxaPg = precoVendaFinal * (txaPct / 100);
  }
  
  const lucroReal = precoVendaFinal - custoTotalBase - valorImposto - valorTaxaPg;
  const custoTotalFinal = custoTotalBase + valorImposto + valorTaxaPg;

  // 6. ATUALIZAÇÃO DA INTERFACE (NOVO PAINEL PRO)
  
  // Cálculo do Ponto de Equilíbrio (Zero a Zero)
  const precoMinimo = incluirTaxas && taxaTotalPct < 1 ? custoTotalBase / (1 - taxaTotalPct) : custoTotalBase;

  // Atualizar KPIs Topo
  document.getElementById('res-kpi-custo').innerText = fmt(custoTotalBase);
  document.getElementById('res-kpi-lucro').innerText = fmt(lucroReal);
  document.getElementById('res-kpi-minimo').innerText = fmt(precoMinimo);
  document.getElementById('res-kpi-venda').innerText = fmt(precoVendaFinal);

  // Calcula Percentagens para a Barra e Tabela
  const safeTotal = Math.max(0.01, custoTotalBase);
  const pMat = (cFilTotal / safeTotal) * 100;
  const pNrg = (cEn / safeTotal) * 100;
  const pMac = (cDep / safeTotal) * 100;
  const pMo = (cMo / safeTotal) * 100;
  const pExt = (custoAcessorio / safeTotal) * 100;

  // Atualiza as larguras da Barra de Composição
  document.getElementById('bar-mat').style.width = `${pMat}%`;
  document.getElementById('bar-nrg').style.width = `${pNrg}%`;
  document.getElementById('bar-mac').style.width = `${pMac}%`;
  document.getElementById('bar-mo').style.width = `${pMo}%`;
  document.getElementById('bar-ext').style.width = `${pExt}%`;

  // Atualiza Valores da Legenda
  document.getElementById('leg-mat').innerText = fmt(cFilTotal);
  document.getElementById('leg-nrg').innerText = fmt(cEn);
  document.getElementById('leg-mac').innerText = fmt(cDep);
  document.getElementById('leg-mo').innerText = fmt(cMo);
  document.getElementById('leg-ext').innerText = fmt(custoAcessorio);

  // Injeta as Linhas na Tabela de Custos Detalhada
  document.getElementById('tabela-custos-body').innerHTML = `
    <tr>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); color: var(--text);">Matéria-Prima (Filamento/Resina)</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text);">${fmt(cFilTotal)}</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text-muted);">${pMat.toFixed(1)}%</td>
    </tr>
    <tr>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); color: var(--text);">Energia Elétrica</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text);">${fmt(cEn)}</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text-muted);">${pNrg.toFixed(1)}%</td>
    </tr>
    <tr>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); color: var(--text);">Desgaste da Máquina</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text);">${fmt(cDep)}</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text-muted);">${pMac.toFixed(1)}%</td>
    </tr>
    <tr>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); color: var(--text);">Mão de Obra Técnica</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text);">${fmt(cMo)}</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text-muted);">${pMo.toFixed(1)}%</td>
    </tr>
    <tr>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); color: var(--text);">Embalagem & Insumos Extras</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text);">${fmt(custoAcessorio)}</td>
      <td style="padding: 0.8rem 1rem; border-bottom: 1px solid var(--card-border); text-align: right; color: var(--text-muted);">${pExt.toFixed(1)}%</td>
    </tr>
    <tr style="background: rgba(255,255,255,0.03);">
      <td style="padding: 1rem; font-weight: bold; color: var(--text);">CUSTO DIRETO TOTAL</td>
      <td style="padding: 1rem; text-align: right; font-weight: bold; color: var(--text);">${fmt(custoTotalBase)}</td>
      <td style="padding: 1rem; text-align: right; font-weight: bold; color: var(--text);">100%</td>
    </tr>
  `;

  calcAtual = { 
    custo: custoTotalFinal, 
    preco: precoVendaFinal, 
    precoManual: isNaN(precoManual) ? '' : precoManual,
    lucro: lucroReal, imp: tImp, tImp: tImp, tMo: tMo, g1, g2, g3, g4, purga, markup: markupMultiplicador, incluirTaxas, 
    acessoriosLista: [...calcAcessorios]
  };
}

// ==========================================
// CADASTRO DE PRODUTOS
// ==========================================
function salvarProduto(btn) {
  let nome = document.getElementById('prod-nome').value; if(!nome) return showToast("Nome do Produto!", "warning");
  let id = document.getElementById('prod-id').value;
  let docId = id ? id : 'p_' + Date.now();
  
  let p = { 
    id: docId, nome, 
    custo: calcAtual.custo, 
    preco: calcAtual.preco, 
    precoManual: calcAtual.precoManual, // Salva o preço que você digitou
    imp: calcAtual.imp, lucro: calcAtual.lucro,
    m1: document.getElementById('prod-mat-1').value, g1: calcAtual.g1,
    m2: document.getElementById('prod-mat-2').value, g2: calcAtual.g2,
    m3: document.getElementById('prod-mat-3').value, g3: calcAtual.g3,
    m4: document.getElementById('prod-mat-4').value, g4: calcAtual.g4, purga: calcAtual.purga,
    markup: calcAtual.markup, incluirTaxas: calcAtual.incluirTaxas, 
    acessoriosLista: calcAtual.acessoriosLista
  };
  
  toggleLoading(btn, true);
  db.collection('produtos').doc(docId.toString()).set(p).then(() => {
    toggleLoading(btn, false);
    showToast("Produto Salvo!"); limparCalc();
  });
}

function limparCalc() { 
  document.getElementById('prod-nome').value=''; 
  document.getElementById('prod-id').value=''; 
  document.getElementById('prod-g-1').value=100;
  document.getElementById('prod-markup').value=2.0; 
  document.getElementById('prod-preco-manual').value=''; // Limpa o preço manual
  document.getElementById('prod-incluir-taxas').checked=true;
  
  let selectAcc = document.getElementById('prod-add-acc');
  if(selectAcc) selectAcc.value = ''; 
  
  document.getElementById('form-title').innerHTML = `<i data-lucide="calculator"></i> Calcular Peça`;
  
  calcAcessorios = [];
  renderizarAcessoriosCalc();
  calcular(); 
  lucide.createIcons();
}

function editarProduto(id) { 
  let p = produtos.find(x => x.id == id);
  if(!p) return;
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-nome').value = p.nome;
  if (p.m1) document.getElementById('prod-mat-1').value = p.m1; document.getElementById('prod-g-1').value = p.g1;
  if (p.m2) document.getElementById('prod-mat-2').value = p.m2; document.getElementById('prod-g-2').value = p.g2 || 0;
  if (p.m3) document.getElementById('prod-mat-3').value = p.m3; document.getElementById('prod-g-3').value = p.g3 || 0;
  if (p.m4) document.getElementById('prod-mat-4').value = p.m4; document.getElementById('prod-g-4').value = p.g4 || 0;
  document.getElementById('prod-purga').value = p.purga || 0;
  
  document.getElementById('prod-markup').value = p.markup || 2.0;
  document.getElementById('prod-preco-manual').value = p.precoManual || ''; // Carrega o preço manual salvo
  document.getElementById('prod-incluir-taxas').checked = p.incluirTaxas !== undefined ? p.incluirTaxas : true;
  
  calcAcessorios = p.acessoriosLista ? [...p.acessoriosLista] : [];
  if(p.acessorioId && calcAcessorios.length === 0) {
      const oldAcc = acessorios.find(a => a.id === p.acessorioId);
      if (oldAcc) calcAcessorios.push({ id: oldAcc.id, nome: oldAcc.nome, preco: oldAcc.preco, qtd: p.accQtd || 1 });
  }
  
  document.getElementById('form-title').innerHTML = `<i data-lucide="edit"></i> Editar Produto`;
  switchTab('calc'); 
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderizarAcessoriosCalc();
  calcular();
  lucide.createIcons();
}

// ==========================================
// CADASTRO DE PRODUTOS
// ==========================================
function salvarProduto(btn) {
  let nome = document.getElementById('prod-nome').value; if(!nome) return showToast("Nome do Produto!", "warning");
  let id = document.getElementById('prod-id').value;
  let docId = id ? id : 'p_' + Date.now();
  
  let p = { 
    id: docId, nome, custo: calcAtual.custo, preco: calcAtual.preco, imp: calcAtual.imp, lucro: calcAtual.lucro,
    m1: document.getElementById('prod-mat-1').value, g1: calcAtual.g1,
    m2: document.getElementById('prod-mat-2').value, g2: calcAtual.g2,
    m3: document.getElementById('prod-mat-3').value, g3: calcAtual.g3,
    m4: document.getElementById('prod-mat-4').value, g4: calcAtual.g4, purga: calcAtual.purga,
    markup: calcAtual.markup, incluirTaxas: calcAtual.incluirTaxas, 
    acessoriosLista: calcAtual.acessoriosLista
  };
  
  toggleLoading(btn, true);
  db.collection('produtos').doc(docId.toString()).set(p).then(() => {
    toggleLoading(btn, false);
    showToast("Produto Salvo!"); limparCalc();
  });
}

function limparCalc() { 
  document.getElementById('prod-nome').value=''; 
  document.getElementById('prod-id').value=''; 
  document.getElementById('prod-g-1').value=100;
  document.getElementById('prod-markup').value=2.0; 
  document.getElementById('prod-incluir-taxas').checked=true;
  
  let selectAcc = document.getElementById('prod-add-acc');
  if(selectAcc) selectAcc.value = ''; 
  
  document.getElementById('form-title').innerHTML = `<i data-lucide="calculator"></i> Calcular Peça`;
  
  calcAcessorios = [];
  renderizarAcessoriosCalc();
  calcular(); 
  lucide.createIcons();
}

function editarProduto(id) { 
  let p = produtos.find(x => x.id == id);
  if(!p) return;
  document.getElementById('prod-id').value = p.id;
  document.getElementById('prod-nome').value = p.nome;
  if (p.m1) document.getElementById('prod-mat-1').value = p.m1; document.getElementById('prod-g-1').value = p.g1;
  if (p.m2) document.getElementById('prod-mat-2').value = p.m2; document.getElementById('prod-g-2').value = p.g2 || 0;
  if (p.m3) document.getElementById('prod-mat-3').value = p.m3; document.getElementById('prod-g-3').value = p.g3 || 0;
  if (p.m4) document.getElementById('prod-mat-4').value = p.m4; document.getElementById('prod-g-4').value = p.g4 || 0;
  document.getElementById('prod-purga').value = p.purga || 0;
  
  document.getElementById('prod-markup').value = p.markup || 2.0;
  document.getElementById('prod-incluir-taxas').checked = p.incluirTaxas !== undefined ? p.incluirTaxas : true;
  
  calcAcessorios = p.acessoriosLista ? [...p.acessoriosLista] : [];
  if(p.acessorioId && calcAcessorios.length === 0) {
      const oldAcc = acessorios.find(a => a.id === p.acessorioId);
      if (oldAcc) calcAcessorios.push({ id: oldAcc.id, nome: oldAcc.nome, preco: oldAcc.preco, qtd: p.accQtd || 1 });
  }
  
  document.getElementById('form-title').innerHTML = `<i data-lucide="edit"></i> Editar Produto`;
  switchTab('calc'); 
  window.scrollTo({ top: 0, behavior: 'smooth' });
  renderizarAcessoriosCalc();
  calcular();
  lucide.createIcons();
}

// ==========================================
// KITS / COMBOS
// ==========================================
function renderizarKitSelector() {
  let el = document.getElementById('kit-add-prod');
  if(el) { 
    el.innerHTML = `<option value="">-- Selecione para Adicionar --</option>` + 
      produtos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)} (Venda: ${fmt(p.preco)})</option>`).join(''); 
  }
}

function addProdutoKit() {
  const select = document.getElementById('kit-add-prod');
  const qtd = parseInt(document.getElementById('kit-add-qtd').value) || 1;
  
  if(!select.value) return showToast("Selecione um produto da lista primeiro!", "warning");
  
  const p = produtos.find(x => x.id === select.value);
  if(p) {
    let existente = kitProdutosTemp.find(item => item.id === p.id);
    if(existente) {
        existente.qtd += qtd;
    } else {
        kitProdutosTemp.push({ id: p.id, nome: p.nome, preco: p.preco, custo: p.custo, qtd: qtd });
    }
    
    document.getElementById('kit-add-qtd').value = 1; 
    select.value = ''; 
    renderizarProdutosKit();
  }
}

function removerProdutoKit(index) {
  kitProdutosTemp.splice(index, 1);
  renderizarProdutosKit();
}

function renderizarProdutosKit() {
  const container = document.getElementById('lista-calc-kit-produtos');
  if(!container) return;
  
  if(kitProdutosTemp.length === 0) {
    container.innerHTML = '<p style="font-size: 0.8rem; color: var(--text-muted);">Nenhum produto adicionado a este combo.</p>';
    return;
  }
  
  container.innerHTML = kitProdutosTemp.map((item, i) => `
    <div style="display: flex; justify-content: space-between; align-items: center; background: var(--bg); padding: 0.6rem; border-radius: 6px; font-size: 0.85rem; border: 1px dashed var(--card-border);">
      <span><strong style="color:var(--primary);">${item.qtd}x</strong> ${item.nome}</span>
      <div style="display: flex; align-items: center; gap: 1rem;">
        <span style="font-weight:bold;">${fmt(item.preco * item.qtd)}</span>
        <button style="background: transparent; border: none; color: var(--danger); cursor: pointer; font-weight: bold; font-size: 1.2rem; padding: 0 0.5rem;" onclick="removerProdutoKit(${i})">×</button>
      </div>
    </div>
  `).join('');
}

function salvarKit(btn) {
  let nome = document.getElementById('kit-nome').value; 
  if(!nome) return showToast("Por favor, digite o Nome do Combo!", "warning");
  
  if(kitProdutosTemp.length === 0) return showToast("Adicione pelo menos um produto ao combo!", "warning");
  
  let itens = [], c = 0, p = 0;
  
  kitProdutosTemp.forEach(item => {
    itens.push({ id: item.id, qtd: item.qtd }); 
    c += (item.custo || 0) * item.qtd; 
    p += (item.preco || 0) * item.qtd; 
  });
  
  toggleLoading(btn, true);
  let kitId = 'k_' + Date.now();
  db.collection('kits').doc(kitId).set({ id: kitId, nome, itens, custo: c, preco: p }).then(() => {
    toggleLoading(btn, false);
    showToast("Combo salvo com sucesso!"); 
    
    document.getElementById('kit-nome').value = '';
    document.getElementById('kit-add-prod').value = ''; 
    
    kitProdutosTemp = [];
    renderizarProdutosKit();
  });
}

function atualizarSelectCRM() {
  let el = document.getElementById('crm-item');
  if(el) { 
    el.innerHTML = `<optgroup label="Produtos">` + 
      produtos.map(p => `<option value="${p.id}">${escapeHTML(p.nome)}</option>`).join('') + 
      `</optgroup><optgroup label="Kits">` + 
      kits.map(k => `<option value="${k.id}">${escapeHTML(k.nome)}</option>`).join('') + 
      `</optgroup>`; 
  }
}

// ==========================================
// PEDIDOS E GESTÃO DE CLIENTES
// ==========================================
function renderizarPedidos(lista) {
  verificarStatusAutomatico(); 
  const container = document.getElementById('lista-pedidos');
  if(!container) return;
  if(lista.length === 0) { container.innerHTML = `<p style="color:var(--text-muted); font-size:0.9rem;">Nenhum pedido encontrado.</p>`; return; }

  container.innerHTML = lista.map(p => {
    let badgeClass = 'badge-gray';
    let statusIcon = 'clock';
    if(p.status === 'Em Preparo') { badgeClass = 'badge-blue'; statusIcon = 'hammer'; }
    if(p.status === 'Enviado') { badgeClass = 'badge-green'; statusIcon = 'truck'; }
    if(p.status === 'Recusado') { badgeClass = 'badge-red'; statusIcon = 'x-circle'; }
    if(p.status === 'Sem Retorno') { badgeClass = 'badge-orange'; statusIcon = 'alert-triangle'; }

    let detalhes = '';
    if(p.cpf) detalhes += `<i data-lucide="file-text" width="12"></i> ${escapeHTML(p.cpf)} &nbsp;`;
    if(p.contato) detalhes += `<i data-lucide="phone" width="12"></i> ${escapeHTML(p.contato)} &nbsp;`;
    if(p.endereco) detalhes += `<br><i data-lucide="map-pin" width="12"></i> ${escapeHTML(p.endereco)}${p.cidade||p.estado?' - '+[escapeHTML(p.cidade),escapeHTML(p.estado)].filter(Boolean).join('/'):''}`;
    if(p.obs) detalhes += `<br><i data-lucide="pen-tool" width="12"></i> <i>Obs: ${escapeHTML(p.obs)}</i>`;

    return `<div class="list-item" style="border-left: 4px solid var(--card-border); ${p.status==='Em Preparo'?'border-color:var(--accent);':''} ${p.status==='Enviado'?'border-color:var(--primary);':''} ${p.status==='Recusado'?'border-color:var(--danger);':''}">
              <div class="item-info">
                <h3>${escapeHTML(p.cliente)} <span class="badge ${badgeClass}" style="font-size:0.65rem;"><i data-lucide="${statusIcon}" width="12"></i> ${p.status}</span></h3>
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
  }).reverse().join(''); 
  setTimeout(() => lucide.createIcons(), 0);
}

function filtrarPedidos() {
  let termo = document.getElementById('input-busca').value.toLowerCase().trim();
  if(!termo) { renderizarPedidos(pedidos); return; }
  let filtrados = pedidos.filter(p => 
    (p.cliente && p.cliente.toLowerCase().includes(termo)) || (p.cpf && p.cpf.toLowerCase().includes(termo)) || (p.contato && p.contato.toLowerCase().includes(termo))
  );
  renderizarPedidos(filtrados);
}

// AGRUPAMENTO DE CLIENTES A PARTIR DE PEDIDOS
// AGRUPAMENTO DE CLIENTES A PARTIR DE PEDIDOS (Por CPF)
function agruparClientes() {
  let mapa = {};
  pedidos.forEach(p => {
    if(!p.cliente) return;
    
    let nome = p.cliente.trim();
    // Limpa a formatação do CPF para garantir que "111.222.333-44" e "11122233344" sejam o mesmo
    let cpfLimpo = p.cpf ? p.cpf.replace(/\D/g, '') : '';
    
    // Se tem CPF usa o CPF como chave única, senão usa o nome em minúsculas
    let key = cpfLimpo ? cpfLimpo : nome.toLowerCase();
    
    if(!mapa[key]) {
      mapa[key] = { idKey: key, nome: nome, contato: p.contato, cpf: p.cpf, totalGasto: 0, qtdPedidos: 0, pedidos: [], ultimo: 0 };
    }
    
    // Considera para o total gasto apenas pedidos em andamento ou concluídos
    if(p.status === 'Enviado' || p.status === 'Em Preparo') {
      mapa[key].totalGasto += p.preco;
    }
    mapa[key].qtdPedidos++;
    mapa[key].pedidos.push(p);
    
    // Atualiza os dados do cliente para a versão mais recente cadastrada no último pedido
    if(p.data > mapa[key].ultimo) {
      mapa[key].ultimo = p.data;
      if(p.contato) mapa[key].contato = p.contato;
      if(p.cpf) mapa[key].cpf = p.cpf; 
      mapa[key].nome = nome; 
    }
  });
  // Retorna ordenado pelos que mais gastaram
  return Object.values(mapa).sort((a,b) => b.totalGasto - a.totalGasto); 
}

function renderizarClientes(lista = agruparClientes()) {
  let container = document.getElementById('lista-clientes');
  if(!container) return;
  if(lista.length === 0) { container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Nenhum cliente registrado nos pedidos.</p>'; return; }
  
  container.innerHTML = lista.map(c => `
    <div class="list-item" style="flex-direction:column; align-items:flex-start; cursor:pointer; transition: 0.2s;" onclick="verDetalhesCliente('${c.idKey}')">
       <div style="display:flex; justify-content:space-between; width:100%; align-items:center;">
          <h3 style="font-size:1.1rem; color:var(--primary);"><i data-lucide="user"></i> ${escapeHTML(c.nome)}</h3>
          <span class="badge badge-blue">${c.qtdPedidos} Pedidos</span>
       </div>
       <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.5rem;"><i data-lucide="calendar"></i> Último Pedido: ${fmtDate(c.ultimo)}</p>
       <p style="font-size:0.95rem; font-weight:bold; margin-top:0.5rem;">Total Gasto: ${fmt(c.totalGasto)}</p>
    </div>
  `).join('');
  setTimeout(() => lucide.createIcons(), 0);
}

function filtrarClientes() {
  let termo = document.getElementById('busca-clientes').value.toLowerCase().trim();
  let clientesAgrupados = agruparClientes();
  if(!termo) { renderizarClientes(clientesAgrupados); return; }
  
  let filtrados = clientesAgrupados.filter(c => 
    c.nome.toLowerCase().includes(termo) || 
    (c.contato && c.contato.includes(termo)) ||
    (c.cpf && c.cpf.replace(/\D/g, '').includes(termo.replace(/\D/g, '')))
  );
  renderizarClientes(filtrados);
}

function verDetalhesCliente(idKey) {
  let c = agruparClientes().find(x => x.idKey === idKey);
  if(!c) return;
  
  document.getElementById('detalhe-cliente-nome').innerHTML = `<i data-lucide="user"></i> ${escapeHTML(c.nome)}`;
  document.getElementById('detalhe-cliente-info').innerText = `${c.contato || 'Sem Telefone Cadastrado'} | ${c.cpf || 'Sem CPF Cadastrado'}`;
  document.getElementById('detalhe-cliente-gasto').innerText = fmt(c.totalGasto);
  document.getElementById('detalhe-cliente-qtd').innerText = c.qtdPedidos;
  
  // Renderiza a lista de pedidos dentro do modal
  document.getElementById('detalhe-cliente-pedidos').innerHTML = c.pedidos.sort((a,b)=>b.data-a.data).map(p => {
     let badgeClass = 'badge-gray';
     if(p.status === 'Em Preparo') badgeClass = 'badge-blue';
     if(p.status === 'Enviado') badgeClass = 'badge-green';
     if(p.status === 'Recusado') badgeClass = 'badge-red';
     if(p.status === 'Sem Retorno') badgeClass = 'badge-orange';
     
     return `<div class="list-item" style="padding:0.8rem; flex-wrap:wrap; border:1px dashed var(--card-border);">
       <div style="flex:1; min-width:150px;">
         <strong style="display:block; font-size:0.95rem; margin-bottom:0.2rem;">${escapeHTML(p.itemNome)}</strong>
         <span class="badge ${badgeClass}" style="font-size:0.7rem;">${p.status}</span>
       </div>
       <div style="text-align:right; font-size:0.85rem;">
         <div style="color:var(--text-muted); margin-bottom:0.2rem;">${fmtDate(p.data)}</div>
         <strong style="color:var(--primary); font-size:1rem;">${fmt(p.preco)}</strong>
       </div>
     </div>`;
  }).join('');
  
  document.getElementById('modal-cliente').style.display = 'flex';
  lucide.createIcons();
}

function fecharModalCliente() {
  document.getElementById('modal-cliente').style.display = 'none';
}

// Continua com Funções de Pedidos (Alteração de Status, Estoque, etc)
function mudarStatusPedido(id, novoStatus) {
  let ped = pedidos.find(x => x.id == id);
  if(!ped) return;
  const requerDeducao = (novoStatus === 'Em Preparo' || novoStatus === 'Enviado');
  
  if (requerDeducao && !ped.estoqueDeduzido) {
    if(confirm(`Mudar para "${novoStatus}" irá subtrair automaticamente o plástico do seu estoque. Confirmar?`)) {
      movimentarEstoquePedidoCloud(ped, -1); 
      ped.estoqueDeduzido = true;
    } else { uiInit(); return; }
  } 
  else if (!requerDeducao && ped.estoqueDeduzido) {
    if(confirm(`Mudar para "${novoStatus}" irá DEVOLVER os materiais deste pedido para o estoque. Confirmar?`)) {
      movimentarEstoquePedidoCloud(ped, 1); 
      ped.estoqueDeduzido = false;
    } else { uiInit(); return; }
  }

  ped.status = novoStatus;
  db.collection('pedidos').doc(id.toString()).update({ status: novoStatus, estoqueDeduzido: ped.estoqueDeduzido });
}

function movimentarEstoquePedidoCloud(ped, multiplicador) {
  if(ped.tipo === 'p') { alterarProdEstoqueCloud(ped.refId, 1 * multiplicador); } 
  else { 
    let k = kits.find(x=>x.id == ped.refId); 
    if(k && k.itens) k.itens.forEach(i => alterarProdEstoqueCloud(i.id, i.qtd * multiplicador)); 
  }
}

function alterarProdEstoqueCloud(pid, mult) {
  let p = produtos.find(x => x.id == pid); if(!p) return;
  alterarEstoqueCloud(p.m1, (p.g1+p.purga)*mult); 
  alterarEstoqueCloud(p.m2, p.g2*mult);
  alterarEstoqueCloud(p.m3, p.g3*mult); 
  alterarEstoqueCloud(p.m4, p.g4*mult);
}

function alterarEstoqueCloud(mid, val) {
  if(!mid || val===0) return; 
  let m = materiais.find(x => x.id === mid); 
  if(m) {
    let novoEstoque = Math.max(0, m.estoque + val);
    db.collection('materiais').doc(mid.toString()).update({ estoque: novoEstoque });
  }
}

function salvarPedido(btn) {
  let cli = document.getElementById('crm-cliente').value, val = document.getElementById('crm-item').value,
      cpf = document.getElementById('crm-cpf').value, cont = document.getElementById('crm-contato').value,
      end = document.getElementById('crm-endereco').value, cid = document.getElementById('crm-cidade').value,
      est = document.getElementById('crm-estado').value, obs = document.getElementById('crm-obs').value;
      
  if(!cli||!val) return showToast("Preencha pelo menos o Nome do Cliente e o Produto!", "warning");
  
  let tipo = val.split('_')[0]; 
  let id = val; 
  
  let ref = tipo === 'p' ? produtos.find(x => x.id === id) : kits.find(x => x.id === id);
  if(!ref) return showToast("Erro: Item selecionado não encontrado.", "error");

  toggleLoading(btn, true);
  let pedId = 'ped_' + Date.now();
  let novoPedido = { 
    id: pedId, data: Date.now(), cliente: cli, cpf: cpf, contato: cont, endereco: end, cidade: cid, estado: est, obs: obs,
    tipo: tipo, refId: id, itemNome: ref.nome, preco: ref.preco, status: 'Orçamento', estoqueDeduzido: false 
  };
  
  db.collection('pedidos').doc(pedId).set(novoPedido).then(() => {
    toggleLoading(btn, false);
    ['crm-cliente','crm-cpf','crm-contato','crm-endereco','crm-cidade','crm-estado','crm-obs'].forEach(id => document.getElementById(id).value='');
    showToast("Orçamento lançado!");
  });
}

function gerarPDF(pedId) {
  let ped = pedidos.find(x => x.id == pedId); if(!ped) return;
  let ref = ped.tipo === 'p' ? produtos.find(x=>x.id == ped.refId) : null;
  let tempo = ref ? ref.imp : "Variável"; 
  document.getElementById('p-cliente').innerText = ped.cliente || '-';
  document.getElementById('p-cpf').innerText = ped.cpf || 'Não informado';
  document.getElementById('p-contato').innerText = ped.contato || 'Não informado';
  document.getElementById('p-endereco').innerText = `${ped.endereco || ''} ${ped.cidade || ped.estado ? '- ' + [ped.cidade, ped.estado].filter(Boolean).join('/') : ''}`.trim() || 'Não informado';
  document.getElementById('p-nome').innerText = ped.itemNome; document.getElementById('p-tempo').innerText = tempo; document.getElementById('p-preco').innerText = fmt(ped.preco);
  window.print();
}

function gerarPDFAvulso() {
  document.getElementById('p-cliente').innerText = 'Cliente Avulso'; document.getElementById('p-cpf').innerText = '-';
  document.getElementById('p-contato').innerText = '-'; document.getElementById('p-endereco').innerText = '-';
  document.getElementById('p-nome').innerText = document.getElementById('prod-nome').value || 'Peça Avulsa';
  document.getElementById('p-tempo').innerText = calcAtual.imp || 0; document.getElementById('p-preco').innerText = fmt(calcAtual.preco);
  window.print();
}

function enviarWhatsPedido(id) {
  let ped = pedidos.find(x => x.id == id); if(!ped) return;
  let msg = `Olá, *${ped.cliente}*! Tudo bem?\n\nSegue o orçamento referente ao pedido: *${ped.itemNome}*.\n\n💰 *Valor Total:* ${fmt(ped.preco)}\n\nPodemos dar andamento na sua produção? Qualquer dúvida, estou à disposição!`;
  let fone = ped.contato ? ped.contato.replace(/\D/g, '') : '';
  let url = fone.length >= 10 ? `https://api.whatsapp.com/send?phone=55${fone}&text=${encodeURIComponent(msg)}` : `https://api.whatsapp.com/send?text=${encodeURIComponent(msg)}`;
  window.open(url, '_blank');
}

function salvarConfig(btn) {
  cfg.potencia = parseFloat(document.getElementById('cfg-potencia').value) || 110; 
  cfg.kwh = parseFloat(document.getElementById('cfg-kwh').value) || 0;
  cfg.maqVal = parseFloat(document.getElementById('cfg-maquina').value) || 0;
  cfg.maqHrs = parseFloat(document.getElementById('cfg-horas').value) || 1; 
  cfg.mo = parseFloat(document.getElementById('cfg-mo').value) || 0;
  cfg.impostoPct = parseFloat(document.getElementById('cfg-imposto').value) || 0;
  cfg.taxapgPct = parseFloat(document.getElementById('cfg-taxapg').value) || 0;

  toggleLoading(btn, true);
  db.collection('configuracoes').doc('geral').set(cfg).then(() => { 
    toggleLoading(btn, false);
    showToast("Custos salvos na nuvem!"); 
  });
}

function excluirCloud(col, id) {
  if(!confirm("Tem certeza que deseja excluir?")) return;
  if(col === 'pedidos') {
    let p = pedidos.find(x => x.id == id);
    if(p && p.estoqueDeduzido) {
      if(confirm("Este pedido já teve o estoque deduzido. Deseja DEVOLVER os materiais ao estoque antes de excluir?")) {
        movimentarEstoquePedidoCloud(p, 1);
      }
    }
  }
  db.collection(col).doc(id.toString()).delete().then(() => { showToast("Excluído!"); });
}

// ==========================================
// EXPORTAR PEDIDOS E BACKUP
// ==========================================
function exportarPedidosCSV() {
  if(pedidos.length === 0) return showToast("Nenhum pedido para exportar.", "warning");
  
  let csv = "Data,Cliente,CPF,Contato,Produto,Status,Valor Total\n";
  
  pedidos.forEach(p => {
    let dataStr = fmtDate(p.data);
    let cliente = p.cliente ? p.cliente.replace(/,/g, '') : '';
    let cpf = p.cpf ? p.cpf.replace(/,/g, '') : '';
    let contato = p.contato ? p.contato.replace(/,/g, '') : '';
    let produto = p.itemNome ? p.itemNome.replace(/,/g, '') : '';
    let valor = p.preco ? p.preco.toFixed(2) : '0.00';
    
    csv += `${dataStr},${cliente},${cpf},${contato},${produto},${p.status},${valor}\n`;
  });
  
  let blob = new Blob(["\uFEFF"+csv], { type: 'text/csv;charset=utf-8;' }); 
  let link = document.createElement("a");
  let url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", `Relatorio_Vendas_3D_${new Date().toISOString().slice(0,10)}.csv`);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  
  showToast("Planilha gerada com sucesso!");
}

function exportar() { 
  let data = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({cfg, materiais, acessorios, produtos, kits, pedidos})); 
  let a = document.createElement('a'); a.href = data; a.download = `backup_3d_${new Date().toISOString().slice(0,10)}.json`; a.click(); 
}

function importar(e) { 
  let r = new FileReader(); 
  r.onload = async function(ev){ 
    try {
      let obj = JSON.parse(ev.target.result); 
      showToast("Restaurando backup... Aguarde.", "warning");
      
      if(obj.cfg) await db.collection('configuracoes').doc('geral').set(obj.cfg);
      
      const restaurarColecao = async (colecaoNome, arrayDados) => {
        if(arrayDados && arrayDados.length > 0) {
          let batch = db.batch();
          arrayDados.forEach(item => {
            let docRef = db.collection(colecaoNome).doc(item.id.toString());
            batch.set(docRef, item);
          });
          await batch.commit();
        }
      };

      await restaurarColecao('materiais', obj.materiais);
      await restaurarColecao('acessorios', obj.acessorios);
      await restaurarColecao('produtos', obj.produtos);
      await restaurarColecao('kits', obj.kits);
      await restaurarColecao('pedidos', obj.pedidos);

      showToast("Backup restaurado com sucesso! A página será atualizada.");
      setTimeout(() => window.location.reload(), 2000);
    } catch(err) { 
      console.error(err);
      showToast("Erro ao ler backup. Arquivo inválido.", "error"); 
    }
  }; 
  r.readAsText(e.target.files[0]); 
}

document.getElementById('crm-cpf').addEventListener('input', function (e) {
  let x = e.target.value.replace(/\D/g, '').match(/(\d{0,3})(\d{0,3})(\d{0,3})(\d{0,2})/);
  e.target.value = !x[2] ? x[1] : x[1] + '.' + x[2] + (x[3] ? '.' + x[3] : '') + (x[4] ? '-' + x[4] : '');
});

document.getElementById('crm-contato').addEventListener('input', function (e) {
  let x = e.target.value.replace(/\D/g, '').match(/(\d{0,2})(\d{0,5})(\d{0,4})/);
  e.target.value = !x[2] ? x[1] : '(' + x[1] + ') ' + x[2] + (x[3] ? '-' + x[3] : '');
});

// ==========================================
// DASHBOARD E GRÁFICOS (CHART.JS)
// ==========================================
let chartFinancas = null;
let chartProdutos = null;

if (typeof Chart !== 'undefined') {
  Chart.defaults.color = '#94a3b8'; 
}

function atualizarDashboard() {
  if (typeof Chart === 'undefined') return;

  let filtroElemento = document.getElementById('filtro-dashboard');
  let periodo = filtroElemento ? filtroElemento.value : 'tudo';
  let agora = Date.now();

  let pedidosFiltrados = pedidos.filter(p => {
    if (p.status !== 'Enviado') return false; 
    if (periodo === 'tudo') return true;

    let dataPed = new Date(p.data);
    let trintaDias = 30 * 24 * 60 * 60 * 1000;
    let noventaDias = 90 * 24 * 60 * 60 * 1000;

    if (periodo === '30') return (agora - p.data) <= trintaDias;
    if (periodo === '90') return (agora - p.data) <= noventaDias;
    if (periodo === 'ano') return dataPed.getFullYear() === new Date().getFullYear();
    return true;
  });
  
  let meses = {};
  let produtosCount = {};

  pedidosFiltrados.forEach(p => {
    let d = new Date(p.data);
    let mesAno = d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });

    if (!meses[mesAno]) meses[mesAno] = { receita: 0, custo: 0 };
    meses[mesAno].receita += p.preco;

    let ref = p.tipo === 'p' ? produtos.find(x => x.id === p.refId) : kits.find(x => x.id === p.refId);
    let custoItem = ref ? ref.custo : 0;
    meses[mesAno].custo += custoItem;

    if (!produtosCount[p.itemNome]) produtosCount[p.itemNome] = 0;
    produtosCount[p.itemNome]++;
  });

  let labelsMeses = Object.keys(meses);
  let dadosReceita = labelsMeses.map(m => meses[m].receita);
  let dadosLucro = labelsMeses.map(m => meses[m].receita - meses[m].custo);

  let produtosOrdenados = Object.entries(produtosCount).sort((a,b) => b[1] - a[1]).slice(0, 5);
  let labelsProd = produtosOrdenados.map(p => p[0]);
  let dadosProd = produtosOrdenados.map(p => p[1]);

  if (chartFinancas) chartFinancas.destroy();
  let canvasFin = document.getElementById('chartFinancas');
  if (canvasFin) {
    let ctxFinancas = canvasFin.getContext('2d');
    chartFinancas = new Chart(ctxFinancas, {
      type: 'bar',
      data: {
        labels: labelsMeses.length ? labelsMeses : ['Sem vendas'],
        datasets: [
          { label: 'Faturamento (R$)', data: dadosReceita.length ? dadosReceita : [0], backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Lucro Liquido (R$)', data: dadosLucro.length ? dadosLucro : [0], backgroundColor: '#3b82f6', borderRadius: 4 }
        ]
      },
      options: { responsive: true, maintainAspectRatio: false }
    });
  }

  if (chartProdutos) chartProdutos.destroy();
  let canvasProd = document.getElementById('chartProdutos');
  if (canvasProd) {
    let ctxProd = canvasProd.getContext('2d');
    chartProdutos = new Chart(ctxProd, {
      type: 'doughnut',
      data: {
        labels: labelsProd.length ? labelsProd : ['Nenhum dado'],
        datasets: [{
          data: dadosProd.length ? dadosProd : [1],
          backgroundColor: ['#10b981', '#3b82f6', '#f59e0b', '#8b5cf6', '#ef4444'],
          borderWidth: 0
        }]
      },
      options: { 
        responsive: true, 
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } }
      }
    });
  }
}

// --- FILTROS E RENDERIZAÇÃO DE PRODUTOS ---
function renderizarProdutos(lista = produtos) {
  let container = document.getElementById('lista-produtos');
  if(!container) return;
  if(lista.length === 0) { container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Nenhum produto encontrado.</p>'; return; }
  
  container.innerHTML = lista.map(p => `
    <div class="list-item">
      <div class="item-info">
        <h3><i data-lucide="box" width="16"></i> ${escapeHTML(p.nome)}</h3>
        <p>Venda: <strong>${fmt(p.preco)}</strong> | Custo: ${fmt(p.custo)}</p>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-outline" style="padding:0.3rem" onclick="editarProduto('${p.id}')">Editar</button>
        <button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('produtos','${p.id}')"><i data-lucide="trash-2" width="16"></i></button>
      </div>
    </div>`).join('');
  setTimeout(() => lucide.createIcons(), 0);
}

function filtrarProdutos() {
  let termo = document.getElementById('busca-produtos').value.toLowerCase().trim();
  if(!termo) { renderizarProdutos(produtos); return; }
  let filtrados = produtos.filter(p => p.nome && p.nome.toLowerCase().includes(termo));
  renderizarProdutos(filtrados);
}

// --- FILTROS E RENDERIZAÇÃO DE KITS ---
function renderizarKits(lista = kits) {
  let container = document.getElementById('lista-kits');
  if(!container) return;
  if(lista.length === 0) { container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Nenhum combo encontrado.</p>'; return; }
  
  container.innerHTML = lista.map(k => `
    <div class="list-item">
      <div class="item-info">
        <h3><i data-lucide="layers" width="16"></i> ${escapeHTML(k.nome)}</h3>
        <p>Venda: <strong>${fmt(k.preco)}</strong> | Custo: ${fmt(k.custo)}</p>
      </div>
      <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
        <button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('kits','${k.id}')"><i data-lucide="trash-2" width="16"></i></button>
      </div>
    </div>`).join('');
  setTimeout(() => lucide.createIcons(), 0);
}

function filtrarKits() {
  let termo = document.getElementById('busca-kits').value.toLowerCase().trim();
  if(!termo) { renderizarKits(kits); return; }
  let filtrados = kits.filter(k => k.nome && k.nome.toLowerCase().includes(termo));
  renderizarKits(filtrados);
}

// --- FILTROS E RENDERIZAÇÃO DE MATERIAIS (ESTOQUE) ---
function renderizarMateriais(lista = materiais) {
  let container = document.getElementById('lista-materiais');
  if(!container) return;
  if(lista.length === 0) { container.innerHTML = '<p style="color:var(--text-muted); font-size:0.9rem;">Nenhum material encontrado.</p>'; return; }
  
  container.innerHTML = lista.map(m => {
    let estClass = m.estoque <= 200 ? 'badge-danger' : 'badge-default';
    let alerta = m.estoque <= 200 ? `<br><span style="color:var(--danger); font-size:0.75rem;">⚠️ Estoque Crítico!</span>` : '';
    let desc = m.detalhe ? m.detalhe : `${m.marca || ''} ${m.cor || ''}`.trim();
    return `<div class="list-item">
              <div class="item-info">
                <h3><span style="color:var(--accent); margin-right:0.5rem;">[${m.codigo || 'S/C'}]</span> ${m.nome} <span style="font-size:0.8rem">${desc}</span></h3>
                <p><i data-lucide="coins" width="14"></i> ${fmt(m.preco)}/kg | <span class="badge ${estClass}">Estoque: ${m.estoque}g</span>${alerta}</p>
              </div>
              <div style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;">
                <button class="btn btn-outline" style="padding:0.3rem; border-color:var(--primary); color:var(--primary);" onclick="reporEstoque('${m.id}')">+ Repor</button>
                <button class="btn btn-outline" style="padding:0.3rem" onclick="editarMaterial('${m.id}')">Editar</button>
                <button class="btn btn-danger" style="padding:0.3rem" onclick="excluirCloud('materiais','${m.id}')"><i data-lucide="trash-2" width="16"></i></button>
              </div>
            </div>`;
  }).join('');
  setTimeout(() => lucide.createIcons(), 0);
}

function filtrarMateriais() {
  let termo = document.getElementById('busca-materiais').value.toLowerCase().trim();
  if(!termo) { renderizarMateriais(materiais); return; }
  
  let filtrados = materiais.filter(m => 
    (m.nome && m.nome.toLowerCase().includes(termo)) || 
    (m.marca && m.marca.toLowerCase().includes(termo)) || 
    (m.cor && m.cor.toLowerCase().includes(termo)) ||
    (m.codigo && m.codigo.toString().toLowerCase().includes(termo))
  );
  renderizarMateriais(filtrados);
}