/**
 * APP.JS - DriverFlux Oficial (Com Hodômetro, Cobrança de Fiado e Emissão de Recibo Corporativo)
 * Lógica de Negócio Completa com Fluxo de Ativação Seguro + Amortização + Consulta Master
 * 
 * MODIFICAÇÕES ADICIONADAS:
 * - Primeiro login obrigatório para MASTER e taxistas
 * - Cadastro de motoristas com senha provisória automática
 * - Geração de senha no formato "XX-1234"
 */

const firebaseConfig = {
    apiKey: "AIzaSyAY217DxZeZZMlg0ZpHYFvXoALrkd5zcPM",
    authDomain: "driverflux.firebaseapp.com",
    databaseURL: "https://driverflux-default-rtdb.firebaseio.com",
    projectId: "driverflux",
    storageBucket: "driverflux.firebasestorage.app",
    messagingSenderId: "855577761510",
    appId: "1:855577761510:web:7e4c0911921a5c18c34d27"
};

let db = null;
function iniciarFirebaseSeNecessario() {
    if (localStorage.getItem('driverflux_modo_demo') !== 'true') {
        if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
        db = firebase.database();
    }
}

let turnosHistoricoMaster = {}; 
let registros = [];             
let pagamentos = [];            
let despesasTurno = [];            
let coordenadaAtual = "Não capturado"; 
let filtroTexto = "";
let usuarioLogado = "";         
let idTurnoAtivo = "";          
let metadadosTurno = { trocoInicial: 0, kmInicial: 0, status: "fechado", tipoContrato: "efetivo", prefixoCarro: "Não informado" };
let motoristasCadastroMaster = {};

const LIMITE_DEMO = 10;


function motoristaDoTurnoAtual() {
    return ((metadadosTurno && metadadosTurno.motorista) || usuarioLogado || '').toString().trim().toLowerCase();
}

function masterEstaNoProprioTurno() {
    if (usuarioLogado !== 'master') return true;
    return motoristaDoTurnoAtual() === 'master';
}

function bloquearMasterForaDoProprioTurno(acao) {
    if (usuarioLogado === 'master' && !masterEstaNoProprioTurno()) {
        alert(`🔒 Segurança operacional:\n\nO usuário MASTER está visualizando o turno de ${motoristaDoTurnoAtual().toUpperCase() || 'outro motorista'}.\n\nNeste modo ele pode consultar, auditar e gerar relatório, mas não pode ${acao || 'alterar corridas'} nesse turno.\n\nPara lançar corrida, selecione/abra um turno do próprio MASTER.`);
        return true;
    }
    return false;
}

function normalizarTelefoneBrasil(numero) {
    let n = (numero || '').toString().replace(/\D/g, '');
    if (!n) return '';
    if (n.startsWith('55') && n.length >= 12) return n;
    return '55' + n;
}

async function copiarTextoDriverFlux(texto, mensagemSucesso) {
    try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(texto);
            alert(mensagemSucesso || 'Texto copiado.');
            return true;
        }
    } catch(e) {}
    const ta = document.createElement('textarea');
    ta.value = texto;
    ta.style.position = 'fixed';
    ta.style.left = '-9999px';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch(e) {}
    ta.remove();
    alert(ok ? (mensagemSucesso || 'Texto copiado.') : 'Não consegui copiar automaticamente. O texto ficou disponível para seleção.');
    return ok;
}

function obterSenhaDefinitiva(desafio) { return (parseInt(desafio) * 13) + 6182; }
function obterSenhaDemo(desafio) { return (parseInt(desafio) * 11) + 3947; }

function checarLicenciamento() {
    const statusLicenca = localStorage.getItem('driverflux_licenca_ativa');
    const usuarioSalvo = localStorage.getItem('driverflux_usuario_logado');

    if (statusLicenca === 'true') {
        if (usuarioSalvo || localStorage.getItem('driverflux_modo_demo') === 'true') {
            document.getElementById('telaAtivacao').style.display = 'none';
            if (localStorage.getItem('driverflux_modo_demo') === 'true') {
                document.getElementById('telaLogin').style.display = 'none';
                usuarioLogado = "demo_local";
                verificarStatusTurnoMotorista(); 
            } else {
                verificarSessaoLogin();
            }
        } else {
            document.getElementById('telaAtivacao').style.display = 'none';
            document.getElementById('telaLogin').style.display = 'block';
            if(document.getElementById('conteudoApp')) document.getElementById('conteudoApp').style.display = 'none';
            iniciarFirebaseSeNecessario();
            garantirUsuariosBaseNoFirebase();
        }
    } else {
        let desafio = localStorage.getItem('driverflux_codigo_desafio') || Math.floor(1000 + Math.random() * 9000).toString();
        localStorage.setItem('driverflux_codigo_desafio', desafio);
        document.getElementById('txtCodigoDesafio').innerText = desafio;
        document.getElementById('telaAtivacao').style.display = 'block';
        document.getElementById('telaLogin').style.display = 'none';
        if(document.getElementById('conteudoApp')) document.getElementById('conteudoApp').style.display = 'none';
    }
}

function verificarAtivacao() {
    const btn = document.getElementById('btnAtivar');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Verificando..."; }

    const desafio = localStorage.getItem('driverflux_codigo_desafio');
    const inputVal = document.getElementById('inputContraSenha').value.trim();
    if (!inputVal) {
        alert("⚠️ Digite a contra-senha.");
        if (btn) { btn.disabled = false; btn.innerHTML = "🚀 Liberar Aplicativo"; }
        return;
    }
    
    const digitada = parseInt(inputVal, 10);

    if (digitada === obterSenhaDefinitiva(desafio)) {
        ativarVersãoCompletaDefinitiva();
    } else if (digitada === obterSenhaDemo(desafio)) {
        if (localStorage.getItem('driverflux_demo_ja_utilizada') === 'true') {
            alert("❌ Bloqueado! Período de demonstração já utilizado.");
            return;
        }
        localStorage.setItem('driverflux_licenca_ativa', 'true');
        localStorage.setItem('driverflux_modo_demo', 'true');
        localStorage.setItem('driverflux_demo_ja_utilizada', 'true'); 
        alert("🟢 Modo DEMONSTRAÇÃO ativado!");
        checarLicenciamento();
    } else { 
        alert("❌ Contra-senha incorreta!"); 
        if (btn) { btn.disabled = false; btn.innerHTML = "🚀 Liberar Aplicativo"; }
    }
}

function ativarVersãoCompletaDefinitiva() {
    localStorage.setItem('driverflux_licenca_ativa', 'true');
    localStorage.setItem('driverflux_modo_demo', 'false');
    localStorage.setItem('driverflux_demo_ja_utilizada', 'true');
    
    if (!firebase.apps.length) { firebase.initializeApp(firebaseConfig); }
    db = firebase.database();

    const caronaDemo = localStorage.getItem('driverflux_demo_reg');
    if (caronaDemo) {
        try {
            const corridasParaMigrar = JSON.parse(caronaDemo);
            if (corridasParaMigrar && corridasParaMigrar.length > 0) {
                const migracaoRef = db.ref("corridas_por_turno/MIGRADO_DA_DEMO");
                corridasParaMigrar.forEach(reg => {
                    migracaoRef.push({
                        id: reg.id, tipo: reg.tipo, cliente: reg.cliente + " (Vindo da Demo)",
                        emprestado: reg.emprestado || 0, corrida: reg.corrida, dataHora: reg.dataHora || "Data Demo", gps: null
                    });
                });
                alert("📦 Sucesso! Corridas registradas na demo foram migradas para a nuvem!");
            }
        } catch(e) { console.error("Sem dados válidos para migrar"); }
    }
    
    alert("🚀 Sistema COMPLETO liberado! Faça login com suas credenciais.");
    
    document.getElementById('telaAtivacao').style.display = 'none';
    document.getElementById('telaLogin').style.display = 'block';
    garantirUsuariosBaseNoFirebase();
}

function verificarSessaoLogin() {
    const salvo = localStorage.getItem('driverflux_usuario_logado');
    if (salvo) {
        usuarioLogado = salvo;
        document.getElementById('telaLogin').style.display = 'none';
        iniciarFirebaseSeNecessario();
        db.ref(`usuarios/${usuarioLogado}`).once('value').then((snapshot) => {
            let dadosUser = snapshot.val();
            let contratoStr = (dadosUser && dadosUser.tipo) ? dadosUser.tipo.toUpperCase() : "EFETIVO";
            if (usuarioLogado === 'master') {
                document.getElementById('telaAberturaTurno').style.display = 'none';
                document.getElementById('conteudoApp').style.display = 'block';
                document.getElementById('painelFiltroMaster').style.display = 'block';
                document.getElementById('lblUsuarioAtivo').innerText = `Operador: ${usuarioLogado.toUpperCase()}`;
                inicializarMaster();
            } else {
                document.getElementById('painelFiltroMaster').style.display = 'none';
                document.getElementById('lblUsuarioAtivo').innerText = `Operador: ${usuarioLogado.toUpperCase()} ({contratoStr})`;
                verificarStatusTurnoMotorista();
            }
        });
    } else {
        document.getElementById('conteudoApp').style.display = 'none';
        document.getElementById('telaAberturaTurno').style.display = 'none';
        document.getElementById('telaLogin').style.display = 'block';
        iniciarFirebaseSeNecessario();
        garantirUsuariosBaseNoFirebase();
    }
}

function renderToggleAcoesDemo() {
    if (localStorage.getItem('driverflux_modo_demo') !== 'true') return;
    
    let containerAviso = document.getElementById('badgeAvisoContador');
    if (!containerAviso) {
        containerAviso = document.createElement('div');
        containerAviso.id = "badgeAvisoContador";
        containerAviso.style.cssText = "background:#fffbeb; color:#b45309; font-size:12px; padding:10px; border-radius:10px; text-align:center; width:100%; margin-bottom:14px; font-weight:700; border:2px solid #fcd34d;";
        
        const divApp = document.getElementById('conteudoApp');
        if (divApp) { divApp.insertBefore(containerAviso, divApp.firstChild); }
    }
    
    containerAviso.innerText = `📈 Modo de Demonstração Ativo: ${registros.length} de ${LIMITE_DEMO} registros.`;
}

function abrirModalEdicao(id) { 
    if (bloquearMasterForaDoProprioTurno(id === null ? 'incluir corrida' : 'editar corrida')) return;
    if (localStorage.getItem('driverflux_modo_demo') === 'true' && id !== null) { alert("🔒 Edição de registros bloqueada no modo de demonstração."); return; }

    if (id === null) {
        document.getElementById('modalTitle').innerText = `Lançar Corrida`; 
        document.getElementById('editId').value = "";
        document.getElementById('inputTipoLancamento').value = "normal"; 
        document.getElementById('inputCorrida').value = "";
        document.getElementById('inputCliente').value = ""; 
        if(document.getElementById('inputWhatsCliente')) document.getElementById('inputWhatsCliente').value = "";
        document.getElementById('inputEmprestimo').value = 0;
    } else {
        const reg = registros.find(r => r.id === id); if (!reg) return;
        document.getElementById('modalTitle').innerText = `Alterar Registro #${id}`; 
        document.getElementById('editId').value = id;
        document.getElementById('inputTipoLancamento').value = reg.tipo || "normal"; 
        document.getElementById('inputCorrida').value = reg.corrida;
        document.getElementById('inputCliente').value = reg.cliente || ""; 
        document.getElementById('inputEmprestimo').value = reg.emprestado || 0;
        if(document.getElementById('inputWhatsCliente')) document.getElementById('inputWhatsCliente').value = reg.whatsCliente || "";
    }
    ajustarCamposPorModalidade(); 
    document.getElementById('formModal').style.display = 'flex'; 
}

function fecharModal() { document.getElementById('formModal').style.display = 'none'; }
function fecharCard(id) { document.getElementById(id).style.display = 'none'; window.scrollTo({ top: 0, behavior: 'smooth' }); }

function ajustarCamposPorModalidade() {
    const tipo = document.getElementById('inputTipoLancamento').value;
    const camposCredito = document.getElementById('camposCreditoOpcionais');
    if (camposCredito) { camposCredito.style.display = (tipo === 'credito') ? 'block' : 'none'; }
}

function descreverErroGpsDriverFlux(error) {
    if (!error) return "GPS não capturado";
    if (error.code === 1) return "Permissão de localização negada";
    if (error.code === 2) return "Sinal de GPS indisponível";
    if (error.code === 3) return "Tempo esgotado para obter GPS";
    return "GPS não capturado";
}

function capturarGpsPromessa() {
    return new Promise((resolve) => {
        if (!navigator.geolocation) {
            resolve({ ok: false, gpsTexto: "GPS não suportado", erro: "GPS não suportado" });
            return;
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const accuracy = position.coords.accuracy;
                const coord = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
                resolve({
                    ok: true,
                    latitude: lat,
                    longitude: lng,
                    precisao: accuracy,
                    gpsTexto: coord,
                    mapsUrl: `https://maps.google.com/?q=${lat},${lng}`
                });
            },
            (error) => {
                const erro = descreverErroGpsDriverFlux(error);
                resolve({ ok: false, gpsTexto: erro, erro: erro });
            },
            { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
        );
    });
}

async function geocodificarReversoDriverFlux(latitude, longitude) {
    if (latitude === undefined || longitude === undefined || latitude === null || longitude === null) return null;

    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(latitude)}&lon=${encodeURIComponent(longitude)}&zoom=18&addressdetails=1&accept-language=pt-BR`;
    let controller = null;
    let timeoutId = null;

    try {
        if (typeof AbortController !== 'undefined') {
            controller = new AbortController();
            timeoutId = setTimeout(() => controller.abort(), 7000);
        }

        const resposta = await fetch(url, {
            method: 'GET',
            headers: { 'Accept': 'application/json' },
            signal: controller ? controller.signal : undefined
        });

        if (timeoutId) clearTimeout(timeoutId);
        if (!resposta.ok) return null;

        const dados = await resposta.json();
        if (dados && dados.display_name) {
            return dados.display_name;
        }
        return null;
    } catch (e) {
        if (timeoutId) clearTimeout(timeoutId);
        return null;
    }
}

async function capturarLocalizacaoCompletaDriverFlux() {
    const gps = await capturarGpsPromessa();
    if (!gps || !gps.ok) return gps;

    const endereco = await geocodificarReversoDriverFlux(gps.latitude, gps.longitude);
    return {
        ...gps,
        endereco: endereco || "Endereço não encontrado",
        localTexto: endereco ? `${endereco}
GPS: ${gps.gpsTexto}` : `Endereço não encontrado
GPS: ${gps.gpsTexto}`
    };
}

function montarLocalizacaoReciboDriverFlux(reg) {
    if (!reg) return "Não indicado";

    const endereco = reg.endereco && reg.endereco !== "Endereço não encontrado" ? reg.endereco : "";
    const gps = reg.gps || reg.gpsTexto || "";
    const maps = reg.mapsUrl || (reg.latitude && reg.longitude ? `https://maps.google.com/?q=${reg.latitude},${reg.longitude}` : "");

    if (endereco && gps && maps) return `${endereco}
GPS: ${gps}
Mapa: ${maps}`;
    if (endereco && gps) return `${endereco}
GPS: ${gps}`;
    if (gps && maps) return `${gps}
Mapa: ${maps}`;
    if (gps) return gps;
    return "Não indicado";
}

function injetarCampoPrefixoCarroSeNecessario() {
    if (!document.getElementById('inputPrefixoCarro')) {
        const containerKm = document.getElementById('inputKmInicial').closest('.input-group');
        if (containerKm) {
            const divGrupo = document.createElement('div');
            divGrupo.className = 'input-group';
            divGrupo.style.marginBottom = '14px';
            divGrupo.innerHTML = `<label style="display:block; font-size:13px; font-weight:600; color:var(--texto-secundario); margin-bottom:4px;">🚖 Prefixo do Carro / Placa</label>
                                  <input type="text" id="inputPrefixoCarro" placeholder="Ex: CARRO-04 ou PLACA" style="width:100%; padding:11px; border:2px solid #e2e8f0; border-radius:10px; font-size:14px;">`;
            containerKm.parentNode.insertBefore(divGrupo, containerKm);
        }
    }
}

function verificarStatusTurnoMotorista() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const tStatus = localStorage.getItem('driverflux_demo_status') || 'fechado';
        if (tStatus === 'aberto') {
            idTurnoAtivo = "DEMO-LOCAL";
            document.getElementById('telaAberturaTurno').style.display = 'none';
            document.getElementById('conteudoApp').style.display = 'block';
            document.getElementById('lblUsuarioAtivo').innerText = "Operador: TESTE DEMO";
            
            let pfx = localStorage.getItem('driverflux_demo_prefixo') || "TESTE-01";
            document.getElementById('lblIdTurnoAtivo').innerText = `Carro: ${pfx.toUpperCase()} | Modo: Demo`;
            inicializarMotorista();
        } else {
            document.getElementById('conteudoApp').style.display = 'none';
            document.getElementById('telaAberturaTurno').style.display = 'block';
            injetarCampoPrefixoCarroSeNecessario();
        }
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`turnos_operacionais/${usuarioLogado}`).orderByChild("status").equalTo("aberto").limitToLast(1).once("value", (snapshot) => {
        if (snapshot.exists()) {
            snapshot.forEach(child => { idTurnoAtivo = child.key; metadadosTurno = child.val(); });
            document.getElementById('telaAberturaTurno').style.display = 'none';
            document.getElementById('conteudoApp').style.display = 'block';
            
            let prefixoAtivo = metadadosTurno.prefixoCarro ? metadadosTurno.prefixoCarro.toUpperCase() : "N/I";
            document.getElementById('lblIdTurnoAtivo').innerText = `🚖 Carro: ${prefixoAtivo} | Turno: #{idTurnoAtivo.substring(1, 8).toUpperCase()}`;
            inicializarMotorista();
        } else {
            document.getElementById('conteudoApp').style.display = 'none';
            document.getElementById('telaAberturaTurno').style.display = 'block';
            injetarCampoPrefixoCarroSeNecessario();
        }
    });
}

function abrirTurnoOperacional() {
    const btn = document.getElementById('btnAbrirTurno');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Iniciando..."; }

    const troco = parseFloat(document.getElementById('inputTrocoInicial').value) || 0;
    const km = parseInt(document.getElementById('inputKmInicial').value) || 0;
    
    let elPrefix = document.getElementById('inputPrefixoCarro');
    let prefixo = elPrefix ? elPrefix.value.trim().toUpperCase() : "";

    if(!prefixo) { 
        alert("⚠️ Por favor, informe o Prefixo ou Placa do Carro que está assumindo."); 
        if (btn) { btn.disabled = false; btn.innerHTML = "Iniciar Trabalho"; }
        return; 
    }
    if(km <= 0) { 
        alert("⚠️ Por favor, digite a quilometragem atual do Hodômetro."); 
        if (btn) { btn.disabled = false; btn.innerHTML = "Iniciar Trabalho"; }
        return; 
    }

    const agora = new Date();
    const dataStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'});
    
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem('driverflux_demo_troco', troco);
        localStorage.setItem('driverflux_demo_km', km);
        localStorage.setItem('driverflux_demo_prefixo', prefixo);
        localStorage.setItem('driverflux_demo_status', 'aberto');
        metadadosTurno = { id: "DEMO-LOCAL", motorista: "teste_demo", status: "aberto", abertura: dataStr, trocoInicial: troco, kmInicial: km, tipoContrato: "comissionado", tipoPagamentoMotorista: "comissionado", comissaoPercentual: 30, valorKmDono: 0, prefixoCarro: prefixo };
        verificarStatusTurnoMotorista();
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${usuarioLogado}`).once('value').then((snapshot) => {
        const dadosUser = snapshot.val();
        const tipoPagamento = (dadosUser && (dadosUser.tipoPagamentoMotorista || dadosUser.tipo)) ? (dadosUser.tipoPagamentoMotorista || dadosUser.tipo) : "comissionado";
        const comissaoPercentual = numeroSeguro(dadosUser && (dadosUser.comissaoPercentual || dadosUser.comissao));
        const valorKmDono = numeroSeguro(dadosUser && (dadosUser.valorKmDono || dadosUser.valorKm));
        const novoTurnoRef = db.ref(`turnos_operacionais/${usuarioLogado}`).push();
        idTurnoAtivo = novoTurnoRef.key;
        metadadosTurno = { id: idTurnoAtivo, motorista: usuarioLogado, status: "aberto", abertura: dataStr, trocoInicial: troco, kmInicial: km, tipoContrato: tipoPagamento, tipoPagamentoMotorista: tipoPagamento, comissaoPercentual: comissaoPercentual, valorKmDono: valorKmDono, prefixoCarro: prefixo };
        novoTurnoRef.set(metadadosTurno).then(() => verificarStatusTurnoMotorista());
    });
}

async function salvarDados() {
    const btn = document.getElementById('btnConfirmarSalvar');
    if (btn && btn.disabled) return;
    if (bloquearMasterForaDoProprioTurno('salvar corrida')) return;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Salvando..."; }

    // Validar se há turno ativo
    if (!idTurnoAtivo || idTurnoAtivo === "") {
        alert("⚠️ Nenhum turno aberto! Por favor, abra um turno antes de lançar corridas.");
        if (btn) { btn.disabled = false; btn.innerHTML = "Confirmar"; }
        return;
    }

    const editId = document.getElementById('editId').value;
    const tipo = document.getElementById('inputTipoLancamento').value;
    const vCorrida = parseFloat(document.getElementById('inputCorrida').value) || 0;
    let nomeCliente = "Passageiro Avulso"; 
    let vEmprestimo = 0;
    let whatsCliente = document.getElementById('inputWhatsCliente') ? document.getElementById('inputWhatsCliente').value.trim() : "";

    if (vCorrida <= 0) {
        alert("⚠️ Digite o valor da corrida.");
        if (btn) { btn.disabled = false; btn.innerHTML = "Confirmar"; }
        return;
    }
    if (tipo === 'credito') {
        nomeCliente = document.getElementById('inputCliente').value.trim();
        vEmprestimo = parseFloat(document.getElementById('inputEmprestimo').value) || 0;
        if (!nomeCliente) {
            alert("⚠️ Digite o nome do cliente.");
            if (btn) { btn.disabled = false; btn.innerHTML = "Confirmar"; }
            return;
        }
    }

    const localizacaoFinal = await capturarLocalizacaoCompletaDriverFlux();
    const agora = new Date();
    const dataHoraStr = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});

    let dadosCorrida = {
        id: registros.length > 0 ? Math.max(...registros.map(r => r.id)) + 1 : 1,
        tipo: tipo, cliente: nomeCliente, emprestado: vEmprestimo, corrida: vCorrida, dataHora: dataHoraStr, gps: localizacaoFinal.gpsTexto, endereco: localizacaoFinal.endereco || "", latitude: localizacaoFinal.latitude || null, longitude: localizacaoFinal.longitude || null, precisaoGps: localizacaoFinal.precisao || null, mapsUrl: localizacaoFinal.mapsUrl || "", erroGps: localizacaoFinal.erro || "", whatsCliente: whatsCliente
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        if (editId) {
            const index = registros.findIndex(r => r.id == editId);
            if (index !== -1) { dadosCorrida.id = parseInt(editId); registros[index] = dadosCorrida; }
        } else { registros.push(dadosCorrida); }
        localStorage.setItem('driverflux_demo_reg', JSON.stringify(registros));
        finalizarSalvamento(dadosCorrida, whatsCliente);
    } else {
        iniciarFirebaseSeNecessario();
        if (editId) {
            const regOriginal = registros.find(r => r.id == editId);
            if (regOriginal && regOriginal.fbKey) {
                dadosCorrida.id = parseInt(editId);
                db.ref(`corridas_por_turno/${idTurnoAtivo}/${regOriginal.fbKey}`).update(dadosCorrida).then(() => {
                    finalizarSalvamento(dadosCorrida, whatsCliente);
                }).catch(err => {
                    alert("Erro ao atualizar: " + err.message);
                    if (btn) { btn.disabled = false; btn.innerHTML = "Confirmar"; }
                });
            }
        } else {
            db.ref(`corridas_por_turno/${idTurnoAtivo}`).push(dadosCorrida).then(() => {
                finalizarSalvamento(dadosCorrida, whatsCliente);
            }).catch(err => {
                alert("Erro ao salvar: " + err.message);
                if (btn) { btn.disabled = false; btn.innerHTML = "Confirmar"; }
            });
        }
    }
}

function finalizarSalvamento(dados, whats) {
    const btn = document.getElementById('btnConfirmarSalvar');
    if (btn) { btn.disabled = false; btn.innerHTML = "Confirmar"; }
    
    fecharModal();
    
    setTimeout(() => {
        renderizarTabela();
        atualizarListaSugestoes();
        alert("Corrida salva com sucesso!");
    }, 500);
    
    if (localStorage.getItem('driverflux_modo_demo') === 'true') { renderToggleAcoesDemo(); }
    if (dados.tipo === 'credito') { prepararDisparoReciboNativo(dados, whats); }
}

function montarTextoReciboDriverFlux(reg) {
    let localizacaoGps = montarLocalizacaoReciboDriverFlux(reg);
    let pfxRecibo = metadadosTurno.prefixoCarro ? metadadosTurno.prefixoCarro.toUpperCase() : "N/I";
    const valorCorrida = numeroSeguro(reg.corrida);
    const emprestado = numeroSeguro(reg.emprestado);
    const juros = emprestado * 0.20;
    const totalDevido = valorCorrida + emprestado + juros;
    const cliente = reg.cliente && reg.cliente !== "Passageiro Avulso" ? reg.cliente : "Passageiro Avulso";

    if (reg.tipo === 'credito') {
        return `🧾 *RECIBO DE CORRIDA - DRIVERFLUX*\n` +
               `-----------------------------------------\n` +
               `🚖 *Prefixo:* ${pfxRecibo}\n` +
               `📅 *Data/Hora:* ${reg.dataHora || 'N/I'}\n` +
               `👤 *Cliente:* ${cliente}\n` +
               `💰 *Corrida:* R$ ${valorCorrida.toFixed(2)}\n` +
               `🏦 *Empréstimo:* R$ ${emprestado.toFixed(2)}\n` +
               `📈 *Taxa 20%:* R$ ${juros.toFixed(2)}\n` +
               `✅ *Total devido:* R$ ${totalDevido.toFixed(2)}\n` +
               `📍 *GPS/Local:* ${localizacaoGps}\n` +
               `-----------------------------------------\n` +
               `Obrigado pela preferência.`;
    }

    return `🧾 *RECIBO DE CORRIDA - DRIVERFLUX*\n` +
           `-----------------------------------------\n` +
           `🚖 *Prefixo:* ${pfxRecibo}\n` +
           `📅 *Data/Hora:* ${reg.dataHora || 'N/I'}\n` +
           `👤 *Cliente:* ${cliente}\n` +
           `💰 *Valor pago:* R$ ${valorCorrida.toFixed(2)}\n` +
           `📍 *GPS/Local:* ${localizacaoGps}\n` +
           `-----------------------------------------\n` +
           `Obrigado pela preferência.`;
}

function textoReciboParaHtml(texto) {
    return texto
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/\*/g, '')
        .replace(/\n/g, '<br>');
}

function garantirModalReciboDriverFlux() {
    let modal = document.getElementById('modalReciboDriverFlux');
    if (modal) return modal;
    modal = document.createElement('div');
    modal.id = 'modalReciboDriverFlux';
    modal.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(15,23,42,.72); z-index:9999; padding:18px; align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div style="background:white; width:min(520px, 96vw); max-height:88vh; overflow-y:auto; border-radius:20px; box-shadow:0 22px 70px rgba(0,0,0,.35);">
            <div style="background:linear-gradient(135deg,#0f172a,#2563eb); color:white; padding:16px; border-radius:20px 20px 0 0; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                    <h3 style="margin:0; font-size:18px;">🧾 Recibo da Corrida</h3>
                    <p style="margin:4px 0 0 0; opacity:.88; font-size:12px;">Confira, copie, imprima ou envie pelo WhatsApp</p>
                </div>
                <button onclick="fecharModalReciboDriverFlux()" style="background:rgba(255,255,255,.18); color:white; border:1px solid rgba(255,255,255,.35); border-radius:10px; padding:8px 10px; font-weight:900;">✕</button>
            </div>
            <div style="padding:16px;">
                <div id="reciboPreviewDriverFlux" style="background:#f8fafc; border:1px solid #e2e8f0; border-radius:14px; padding:14px; line-height:1.55; color:#0f172a; font-size:14px;"></div>
                <input id="reciboTelefoneDriverFlux" type="tel" placeholder="WhatsApp com DDD, só números" style="width:100%; margin-top:12px; padding:13px; border:2px solid #e2e8f0; border-radius:12px; font-size:15px;">
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-top:12px;">
                    <button onclick="enviarReciboWhatsAppDriverFlux()" style="padding:13px; border:none; border-radius:12px; background:#25d366; color:white; font-weight:900;">💬 WhatsApp</button>
                    <button onclick="copiarReciboDriverFlux()" style="padding:13px; border:none; border-radius:12px; background:#0f766e; color:white; font-weight:900;">📋 Copiar</button>
                    <button onclick="imprimirReciboDriverFlux()" style="padding:13px; border:none; border-radius:12px; background:#2563eb; color:white; font-weight:900;">🖨️ Imprimir/PDF</button>
                    <button onclick="fecharModalReciboDriverFlux()" style="padding:13px; border:none; border-radius:12px; background:#e2e8f0; color:#334155; font-weight:900;">Fechar</button>
                </div>
            </div>
        </div>`;
    document.body.appendChild(modal);
    return modal;
}

let reciboAtualDriverFlux = '';

function prepararDisparoReciboNativo(reg, whatsappSugerido) {
    reciboAtualDriverFlux = montarTextoReciboDriverFlux(reg);
    const modal = garantirModalReciboDriverFlux();
    const preview = document.getElementById('reciboPreviewDriverFlux');
    const telefone = document.getElementById('reciboTelefoneDriverFlux');
    if (preview) preview.innerHTML = textoReciboParaHtml(reciboAtualDriverFlux);
    if (telefone) telefone.value = (whatsappSugerido && whatsappSugerido !== '51') ? whatsappSugerido.replace(/\D/g, '') : '';
    modal.style.display = 'flex';
}

function fecharModalReciboDriverFlux() {
    const modal = document.getElementById('modalReciboDriverFlux');
    if (modal) modal.style.display = 'none';
}

function enviarReciboWhatsAppDriverFlux() {
    const telefone = document.getElementById('reciboTelefoneDriverFlux');
    const numero = normalizarTelefoneBrasil(telefone ? telefone.value : '');
    if (!numero || numero.length < 12) {
        alert('⚠️ Informe o WhatsApp com DDD para enviar o recibo.');
        if (telefone) telefone.focus();
        return;
    }
    window.location.href = `whatsapp://send?phone=${numero}&text=${encodeURIComponent(reciboAtualDriverFlux)}`;
}

function copiarReciboDriverFlux() {
    copiarTextoDriverFlux(reciboAtualDriverFlux, '✅ Recibo copiado. Agora você pode colar no WhatsApp ou em outro aplicativo.');
}

function imprimirReciboDriverFlux() {
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Recibo DriverFlux</title><style>body{font-family:Arial,sans-serif;padding:18px;color:#0f172a}.recibo{max-width:420px;margin:auto;border:1px solid #e2e8f0;border-radius:14px;padding:16px;line-height:1.55}h2{margin-top:0}</style></head><body><div class="recibo"><h2>🧾 Recibo DriverFlux</h2>${textoReciboParaHtml(reciboAtualDriverFlux)}</div><script>window.onload=function(){setTimeout(function(){window.print()},300)};<\/script></body></html>`;
    abrirRelatorioEmNovaJanela(html);
    alert('Se a tela de impressão abrir, escolha “Salvar em PDF”.');
}

function emititNotaFiscalWhatsApp(idCorrida) {
    const reg = registros.find(r => r.id === idCorrida);
    if (!reg) return alert("Corrida não encontrada.");
    prepararDisparoReciboNativo(reg, "51");
}

function revierComprovanteWhats(idCorrida) {
    const reg = registros.find(r => r.id === idCorrida);
    if (!reg) return alert("Corrida não encontrada.");
    prepararDisparoReciboNativo(reg, reg.whatsCliente || "51");
}

function renderizarTabela() {
    const tbody = document.querySelector('#tabelaDados tbody'); 
    if (!tbody) return;
    tbody.innerHTML = '';
    const listaHistorico = [...registros].sort((a, b) => obterTimestampRegistro(b) - obterTimestampRegistro(a)).slice(0, 10);
    listaHistorico.forEach(reg => {
        const tr = document.createElement('tr');
        const descTipo = reg.tipo === 'credito' ? '🟡 Crédito' : '🟢 Normal';
        const descCliente = reg.tipo === 'credito' ? (reg.cliente || 'N/I') : 'Passageiro Balcão';
        const valorExibido = reg.tipo === 'credito' ? (reg.corrida + reg.emprestado) : reg.corrida;
        
        let acoesHtml = `<button class="btn-nota" style="background:#10b981; color:white; padding:4px 6px; font-size:11px; margin-right:5px; border:none; border-radius:4px; font-weight:bold;" onclick="emititNotaFiscalWhatsApp(${reg.id})">📋 Recibo</button>`;
        acoesHtml += `<button class="btn-whats" style="background:#25d366; color:white; padding:4px 6px; font-size:11px; margin-right:5px; border:none; border-radius:4px; font-weight:bold;" onclick="revierComprovanteWhats(${reg.id})">💬 WhatsApp</button>`;
        
        if (localStorage.getItem('driverflux_modo_demo') !== 'true') {
            acoesHtml += `<button class="btn-cancel" style="padding:4px 6px; font-size:11px;" onclick="abrirModalEdicao(${reg.id})">Editar</button>`;
        } else { acoesHtml += `🔒 Local`; }

        tr.innerHTML = `<td>#${reg.id}</td><td>${descTipo}</td><td>${descCliente}</td><td style="font-weight:bold;">${formatarMoeda(valorExibido)}</td><td>${acoesHtml}</td>`;
        tbody.appendChild(tr);
    });
}

// ============================================================
// FUNÇÃO GERAR SENHA PROVISÓRIA (ADICIONADA)
// ============================================================
function gerarSenhaProvisoria() {
    const letras = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
    const l1 = letras.charAt(Math.floor(Math.random() * letras.length));
    const l2 = letras.charAt(Math.floor(Math.random() * letras.length));
    const num = Math.floor(1000 + Math.random() * 9000);
    return `${l1}${l2}-${num}`;
}
// ============================================================

// ============================================================
// FUNÇÃO REALIZAR LOGIN MODIFICADA (COM VERIFICAÇÃO DE PRIMEIRO ACESSO)
// ============================================================
function realizarLogin() {
    const btn = document.getElementById('btnLogin');
    if (btn && btn.disabled) return;
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Entrando..."; }

    const user = document.getElementById('loginUsuario').value.trim().toLowerCase();
    const pass = document.getElementById('loginSenha').value.trim();
    if (!user || !pass) {
        alert("⚠️ Digite o usuário e a senha.");
        if (btn) { btn.disabled = false; btn.innerHTML = "🔑 Entrar no Sistema"; }
        return;
    }
    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${user}`).once('value').then((snapshot) => {
        if (snapshot.exists()) {
            const dadosUser = snapshot.val();
            const senhaCorreta = (typeof dadosUser === 'object') ? dadosUser.senha : dadosUser;
            if (senhaCorreta === pass) { 
                localStorage.setItem('driverflux_usuario_logado', user);
                
                // ============================================
                // VERIFICAÇÃO DE PRIMEIRO LOGIN (ADICIONADA)
                // ============================================
                // Verificar se é MASTER com primeiroLoginMaster = true
                if (user === 'master' && dadosUser.primeiroLoginMaster === true) {
                    // Abre a tela unificada de configuração do Master (senha + ponto + prefixos)
                    setTimeout(() => {
                        if (typeof ConfigMaster !== 'undefined' && ConfigMaster.abrir) {
                            ConfigMaster.abrir();
                        } else {
                            alert('Módulo ConfigMaster não carregado. Verifique se js/master/config-master.js está incluído no index.html.');
                        }
                    }, 300);
                    return;
                }
                
                // Verificar se é taxista com primeiroLogin = true
                if (dadosUser.primeiroLogin === true && user !== 'master') {
                    localStorage.setItem('driverflux_temp_user', user);
                    localStorage.setItem('driverflux_temp_isMaster', 'false');
                    window.location.href = 'trocar-senha.html';
                    return;
                }
                // ============================================
                
                verificarSessaoLogin(); 
            } else { alert("❌ Senha incorreta!"); if (btn) { btn.disabled = false; btn.innerHTML = "🔑 Entrar no Sistema"; } }
        } else { alert("❌ Usuário não cadastrado!"); if (btn) { btn.disabled = false; btn.innerHTML = "🔑 Entrar no Sistema"; } }
    }).catch(err => {
        alert("Erro ao realizar login: " + err.message);
        if (btn) { btn.disabled = false; btn.innerHTML = "🔑 Entrar no Sistema"; }
    });
}
// ============================================================


function abrirModalDespesaTurno() {
    const modal = document.getElementById('modalDespesaTurno');
    if (!modal) return alert('Modal de despesa não encontrado.');
    document.getElementById('inputDespesaTipo').value = 'gasolina';
    document.getElementById('inputDespesaValor').value = '';
    document.getElementById('inputDespesaDescricao').value = '';
    modal.style.display = 'flex';
    setTimeout(() => document.getElementById('inputDespesaValor')?.focus(), 80);
}

function fecharModalDespesaTurno() {
    const modal = document.getElementById('modalDespesaTurno');
    if (modal) modal.style.display = 'none';
}

function salvarDespesaTurno() {
    if (!idTurnoAtivo) return alert('Abra um turno antes de lançar despesas.');
    if (bloquearMasterForaDoProprioTurno('lançar despesa')) return;
    const tipo = (document.getElementById('inputDespesaTipo')?.value || 'outros').trim();
    const valor = numeroSeguro(document.getElementById('inputDespesaValor')?.value || 0);
    const descricao = (document.getElementById('inputDespesaDescricao')?.value || '').trim();
    if (valor <= 0) return alert('Informe o valor da despesa.');
    const agora = new Date();
    const despesa = {
        tipo,
        valor,
        descricao,
        motorista: motoristaDoTurnoAtual(),
        prefixo: metadadosTurno.prefixoCarro || '',
        dataHora: agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'}),
        criadoEm: agora.toISOString()
    };

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        despesasTurno.push(despesa);
        localStorage.setItem('driverflux_demo_despesas', JSON.stringify(despesasTurno));
        fecharModalDespesaTurno();
        alert('✅ Despesa lançada no turno.');
        return;
    }

    iniciarFirebaseSeNecessario();
    db.ref(`despesas_por_turno/${idTurnoAtivo}`).push(despesa).then(() => {
        fecharModalDespesaTurno();
        alert('✅ Despesa lançada no turno.');
    }).catch(err => alert('Erro ao salvar despesa: ' + err.message));
}

function efetuarLogout() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        if (confirm("🚪 Sair do modo demonstração?")) {
            localStorage.removeItem('driverflux_modo_demo');
            localStorage.removeItem('driverflux_licenca_ativa');
            location.reload();
        }
        return;
    }
    if (confirm("🚪 Deseja realmente sair do perfil?")) { efetuarLogoutPronto(); }
}

function efetuarLogoutPronto() {
    localStorage.removeItem('driverflux_usuario_logado'); 
    localStorage.removeItem('driverflux_licenca_ativa'); 
    usuarioLogado = ""; idTurnoAtivo = "";
    if(document.getElementById('cardTotais')) document.getElementById('cardTotais').style.display = 'none'; 
    if(document.getElementById('cardRelatorio')) document.getElementById('cardRelatorio').style.display = 'none';
    verificarSessaoLogin();
}

function calcularTotais() {
    const cardRelatorio = document.getElementById('cardRelatorio');
    if (cardRelatorio) cardRelatorio.style.display = 'none';

    let tNormais = 0, tCreditoCorridas = 0, tBrutoEmprestado = 0;
    registros.forEach(r => { 
        if (r.tipo === 'credito') { tCreditoCorridas += numeroSeguro(r.corrida); tBrutoEmprestado += numeroSeguro(r.emprestado); } 
        else { tNormais += numeroSeguro(r.corrida); } 
    });
    let juros = tBrutoEmprestado * 0.20;
    const totalCreditoComJuros = tCreditoCorridas + tBrutoEmprestado + juros;
    const producaoTotal = tNormais + totalCreditoComJuros;
    let fundoFixo = (localStorage.getItem('driverflux_modo_demo') === 'true') ? (parseFloat(localStorage.getItem('driverflux_demo_troco')) || 0) : (metadadosTurno.trocoInicial || 0);
    const despesas = totaisDespesasTurno();
    const regime = obterRegimeMotoristaAtual();

    document.getElementById('totTrocoInicial').innerText = formatarMoeda(fundoFixo);
    document.getElementById('totNormais').innerText = formatarMoeda(tNormais);
    document.getElementById('totCorridasCredito').innerText = formatarMoeda(tCreditoCorridas);
    document.getElementById('totBruto').innerText = formatarMoeda(tBrutoEmprestado);
    document.getElementById('totAcrescimo').innerText = `+ ${formatarMoeda(juros)}`;
    document.getElementById('totGeral').innerText = formatarMoeda(fundoFixo + tNormais);

    const elGas = document.getElementById('totDespesaGasolina');
    const elMan = document.getElementById('totDespesaManutencao');
    const elOut = document.getElementById('totDespesaOutros');
    const elDesp = document.getElementById('totDespesas');
    if (elGas) elGas.innerText = formatarMoeda(despesas.gasolina);
    if (elMan) elMan.innerText = formatarMoeda(despesas.manutencao);
    if (elOut) elOut.innerText = formatarMoeda(despesas.outros);
    if (elDesp) elDesp.innerText = formatarMoeda(despesas.total);

    const labelRegime = document.getElementById('labelRegimeMotorista');
    const inputKmFinal = document.getElementById('inputKmFinalFechamento');
    const boxKm = document.getElementById('boxKmFechamento');
    if (labelRegime) {
        labelRegime.innerText = regime.tipo === 'quilometragem'
            ? `Quilometragem — ${formatarMoeda(regime.valorKmDono)} por KM para o dono`
            : `Comissionado — ${regime.comissaoPercentual}% para o motorista`;
    }
    if (boxKm) boxKm.style.display = regime.tipo === 'quilometragem' ? 'block' : 'none';
    if (inputKmFinal && !inputKmFinal.value && regime.kmFinal > 0) inputKmFinal.value = regime.kmFinal;
    calcularAcertoMotoristaFechamento();

    document.getElementById('cardTotais').style.display = 'block';
}

function calcularAcertoMotoristaFechamento() {
    let tNormais = 0, tCreditoCorridas = 0, tBrutoEmprestado = 0;
    registros.forEach(r => { 
        if (r.tipo === 'credito') { tCreditoCorridas += numeroSeguro(r.corrida); tBrutoEmprestado += numeroSeguro(r.emprestado); } 
        else { tNormais += numeroSeguro(r.corrida); } 
    });
    const juros = tBrutoEmprestado * 0.20;
    const producaoTotal = tNormais + tCreditoCorridas + tBrutoEmprestado + juros;
    const despesas = totaisDespesasTurno();
    const regime = obterRegimeMotoristaAtual();
    const inputKmFinal = document.getElementById('inputKmFinalFechamento');
    const kmFinal = numeroSeguro(inputKmFinal?.value || regime.kmFinal || 0);
    const kmRodado = Math.max(kmFinal - regime.kmInicial, 0);

    let textoPrincipal = '';
    let valorMotorista = 0;
    let valorDono = 0;

    if (regime.tipo === 'quilometragem') {
        valorDono = kmRodado * regime.valorKmDono;
        valorMotorista = producaoTotal - despesas.total - valorDono;
        textoPrincipal = `KM rodado: ${kmRodado.toLocaleString('pt-BR')} km × ${formatarMoeda(regime.valorKmDono)} = ${formatarMoeda(valorDono)} para o dono`;
    } else {
        valorMotorista = producaoTotal * (regime.comissaoPercentual / 100);
        valorDono = producaoTotal - valorMotorista - despesas.total;
        textoPrincipal = `Comissão do motorista: ${regime.comissaoPercentual}% sobre ${formatarMoeda(producaoTotal)} = ${formatarMoeda(valorMotorista)}`;
    }

    const elResumo = document.getElementById('totResumoAcerto');
    const elMotorista = document.getElementById('totValorMotorista');
    const elDono = document.getElementById('totValorDono');
    const elLiquido = document.getElementById('totLiquidoAposDespesas');
    if (elResumo) elResumo.innerText = textoPrincipal;
    if (elMotorista) elMotorista.innerText = formatarMoeda(valorMotorista);
    if (elDono) elDono.innerText = formatarMoeda(valorDono);
    if (elLiquido) elLiquido.innerText = formatarMoeda(producaoTotal - despesas.total);
}

function formatarMoeda(valor) { return (valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function numeroSeguro(valor) {
    if (typeof valor === 'string') valor = valor.replace(',', '.');
    const n = parseFloat(valor);
    return isNaN(n) ? 0 : n;
}

function inicializarMotorista() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const salvo = localStorage.getItem('driverflux_demo_reg');
        registros = salvo ? JSON.parse(salvo) : [];
        const despSalvas = localStorage.getItem('driverflux_demo_despesas');
        despesasTurno = despSalvas ? JSON.parse(despSalvas) : [];
        renderizarTabela();
        renderToggleAcoesDemo(); 
        return;
    }
    iniciarFirebaseSeNecessario();
    db.ref(`corridas_por_turno/${idTurnoAtivo}`).on('value', (snapshot) => {
        registros = [];
        snapshot.forEach(child => {
            let item = child.val();
            item.fbKey = child.key;
            registros.push(item);
        });
        renderizarTabela();
    });
    db.ref(`despesas_por_turno/${idTurnoAtivo}`).on('value', (snapshot) => {
        despesasTurno = [];
        snapshot.forEach(child => {
            const item = child.val() || {};
            item.fbKey = child.key;
            despesasTurno.push(item);
        });
    });
}

function inicializarMaster() {
    iniciarFirebaseSeNecessario();
    db.ref('turnos_operacionais').on('value', (snapshot) => {
        const select = document.getElementById('selectFiltroTurnoMaster');
        if (!select) return;
        select.innerHTML = '<option value="">Selecione um turno...</option>';
        turnosHistoricoMaster = snapshot.val() || {};
        
        Object.keys(turnosHistoricoMaster).forEach(user => {
            Object.keys(turnosHistoricoMaster[user]).forEach(tId => {
                const t = turnosHistoricoMaster[user][tId];
                const opt = document.createElement('option');
                opt.value = `${user}|${tId}`;
                opt.innerText = `${user.toUpperCase()} - ${t.prefixoCarro} ({t.abertura})`;
                select.appendChild(opt);
            });
        });
    });
}

function selecionarTurnoParaVerificacaoMaster() {
    const val = document.getElementById('selectFiltroTurnoMaster').value;
    if (!val) return;
    const [user, tId] = val.split('|');
    idTurnoAtivo = tId;
    metadadosTurno = turnosHistoricoMaster[user][tId];
    inicializarMotorista();
}

function cadastrarNovoMotoristaMaster() {
    const modal = document.getElementById('modalCadastroMotorista');
    if (!modal) return alert('Modal de cadastro não encontrado.');

    const campoUser = document.getElementById('novoMotoristaUsuario');
    const campoSenha = document.getElementById('novoMotoristaSenha');
    const campoTipo = document.getElementById('novoMotoristaTipo');
    const campoPrefixo = document.getElementById('novoMotoristaPrefixo');
    const campoComissao = document.getElementById('novoMotoristaComissao');
    const campoValorKm = document.getElementById('novoMotoristaValorKm');

    if (campoUser) campoUser.value = '';
    if (campoSenha) campoSenha.value = '';
    if (campoTipo) campoTipo.value = 'comissionado';
    if (campoPrefixo) campoPrefixo.value = '';
    if (campoComissao) campoComissao.value = '30';
    if (campoValorKm) campoValorKm.value = '';
    atualizarCamposTipoPagamentoMotorista();

    modal.style.display = 'flex';
    setTimeout(() => { if (campoUser) campoUser.focus(); }, 80);
}

function fecharModalCadastroMotorista() {
    const modal = document.getElementById('modalCadastroMotorista');
    if (modal) modal.style.display = 'none';
}

function atualizarCamposTipoPagamentoMotorista() {
    const tipo = (document.getElementById('novoMotoristaTipo')?.value || 'comissionado').toLowerCase();
    const boxComissao = document.getElementById('boxComissaoMotorista');
    const boxValorKm = document.getElementById('boxValorKmMotorista');
    if (boxComissao) boxComissao.style.display = tipo === 'comissionado' ? 'block' : 'none';
    if (boxValorKm) boxValorKm.style.display = tipo === 'quilometragem' ? 'block' : 'none';
}

// ============================================================
// FUNÇÃO SALVAR NOVO MOTORISTA MODIFICADA (COM SENHA PROVISÓRIA)
// ============================================================
function salvarNovoMotoristaMaster() {
    const userRaw = (document.getElementById('novoMotoristaUsuario')?.value || '').trim();
    const senhaDigitada = (document.getElementById('novoMotoristaSenha')?.value || '').trim();
    const tipo = (document.getElementById('novoMotoristaTipo')?.value || 'comissionado').trim().toLowerCase();
    const prefixo = (document.getElementById('novoMotoristaPrefixo')?.value || '').trim();
    const comissaoPercentual = numeroSeguro(document.getElementById('novoMotoristaComissao')?.value || 0);
    const valorKmDono = numeroSeguro(document.getElementById('novoMotoristaValorKm')?.value || 0);

    if (!userRaw) return alert('⚠️ Informe o nome de usuário do motorista.');
    
    // Se o Master não digitou uma senha, gerar automática
    let senhaFinal = senhaDigitada;
    let senhaProvisoriaGerada = false;
    
    if (!senhaFinal) {
        senhaFinal = gerarSenhaProvisoria();
        senhaProvisoriaGerada = true;
    }
    
    if (!senhaFinal) return alert('⚠️ Informe uma senha para o motorista ou deixe em branco para gerar automática.');

    if (tipo === 'comissionado' && comissaoPercentual <= 0) return alert('⚠️ Informe a porcentagem da comissão do motorista.');
    if (tipo === 'quilometragem' && valorKmDono <= 0) return alert('⚠️ Informe o valor por KM que o motorista paga ao dono do carro.');

    const user = userRaw.toLowerCase().replace(/\s+/g, '_');
    
    // Adicionar pontoId
    const pontoId = localStorage.getItem('driverflux_ponto_id') || 'PONTO-0001';
    
    const payload = { 
        senha: senhaFinal,
        tipo: tipo,
        tipoPagamentoMotorista: tipo,
        comissaoPercentual: comissaoPercentual,
        valorKmDono: valorKmDono,
        primeiroLogin: true,      // NOVO - força troca de senha no primeiro acesso
        pontoId: pontoId          // NOVO - associa ao ponto
    };
    
    if (prefixo) {
        payload.prefixoCarro = prefixo.toUpperCase();
        payload.prefixo = prefixo.toUpperCase();
    }

    iniciarFirebaseSeNecessario();
    db.ref(`usuarios/${user}`).once('value').then(snapshot => {
        if (snapshot.exists()) {
            if (!confirm(`⚠️ O usuário "${user}" já existe. Deseja atualizar esse cadastro?`)) return null;
        }
        return db.ref(`usuarios/${user}`).set(payload);
    }).then(resultado => {
        if (resultado === null) return;
        fecharModalCadastroMotorista();
        
        // Mostrar senha provisória se foi gerada automaticamente
        if (senhaProvisoriaGerada) {
            alert(`✅ Motorista ${user.toUpperCase()} cadastrado!\n\n🔐 SENHA PROVISÓRIA: ${senhaFinal}\n\n⚠️ O motorista será obrigado a trocar a senha no primeiro acesso.`);
        } else {
            alert(`✅ Motorista ${user.toUpperCase()} cadastrado com sucesso!`);
        }
    }).catch(err => {
        alert('Erro ao cadastrar motorista: ' + err.message);
    });
}
// ============================================================

function garantirUsuariosBaseNoFirebase() {
    db.ref('usuarios/master').once('value').then(snap => {
        if (!snap.exists()) { 
            db.ref('usuarios/master').set({ 
                senha: '123', 
                tipo: 'master',
                primeiroLoginMaster: true,  // NOVO
                pontoId: 'PONTO-0001'       // NOVO
            }); 
        } else {
            // Se o master já existe mas não tem os novos campos, adicionar
            const existing = snap.val();
            if (existing.primeiroLoginMaster === undefined) {
                db.ref('usuarios/master').update({ primeiroLoginMaster: true });
            }
            if (existing.pontoId === undefined) {
                db.ref('usuarios/master').update({ pontoId: 'PONTO-0001' });
            }
        }
    });
}

function alternarBarraConsulta() {
    const container = document.getElementById('containerPesquisa');
    if (!container) return;

    const estaOculto = window.getComputedStyle(container).display === 'none';
    container.style.display = estaOculto ? 'block' : 'none';

    if (estaOculto) {
        const input = document.getElementById('inputPesquisa');
        if (input) {
            setTimeout(() => {
                input.focus();
                mostrarSugestoesPagamento();
            }, 80);
        }
    } else {
        esconderSugestoesPagamento();
    }
}

function obterClientesCreditoUnicos() {
    return [...new Set(
        registros
            .filter(r => r.tipo === 'credito' && r.cliente && r.cliente.trim())
            .map(r => r.cliente.trim())
    )].sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

function atualizarListaSugestoes() {
    const datalist = document.getElementById('listaClientes');
    if (!datalist) return;
    const clientesUnicos = obterClientesCreditoUnicos();
    datalist.innerHTML = '';
    clientesUnicos.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        datalist.appendChild(opt);
    });
}

function mostrarSugestoesPagamento() {
    renderizarSugestoesPagamento();
}

function esconderSugestoesPagamento() {
    const box = document.getElementById('listaClientesPagamento');
    if (box) box.style.display = 'none';
}


function escaparHtmlPagamento(valor) {
    return (valor || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderizarSugestoesPagamento() {
    const input = document.getElementById('inputPesquisa');
    const box = document.getElementById('listaClientesPagamento');
    if (!input || !box) return;

    const termo = normalizarTextoConsulta(input.value);
    const clientes = obterClientesCreditoUnicos();
    const filtrados = clientes
        .filter(nome => !termo || normalizarTextoConsulta(nome).includes(termo))
        .slice(0, 30);

    if (!filtrados.length) {
        box.innerHTML = '<div class="suggestion-empty">Nenhum cliente encontrado no crédito.</div>';
        box.style.display = 'block';
        return;
    }

    box.innerHTML = filtrados.map(nome => {
        const corridasCliente = registros.filter(r => r.tipo === 'credito' && r.cliente && r.cliente.toLowerCase() === nome.toLowerCase()).length;
        return `<button type="button" class="suggestion-item" onclick="selecionarClientePagamento(decodeURIComponent('${encodeURIComponent(nome)}'))">👤 ${escaparHtmlPagamento(nome)}<small>${corridasCliente} corrida(s)</small></button>`;
    }).join('');
    box.style.display = 'block';
}

function selecionarClientePagamento(nome) {
    const input = document.getElementById('inputPesquisa');
    if (input) {
        input.value = nome;
        input.blur();
    }
    processarConsultaCliente(true);
    esconderSugestoesPagamento();
}


function obterTimestampRegistro(reg) {
    if (!reg) return 0;
    if (reg.timestamp) {
        const n = Number(reg.timestamp);
        if (!isNaN(n)) return n;
    }
    const dataTexto = (reg.dataHora || reg.data || '').toString().trim();
    if (!dataTexto) return Number(reg.id) || 0;
    const m = dataTexto.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
    if (m) {
        const d = Number(m[1]);
        const mo = Number(m[2]) - 1;
        const y = Number(m[3]);
        const h = Number(m[4] || 0);
        const mi = Number(m[5] || 0);
        const se = Number(m[6] || 0);
        return new Date(y, mo, d, h, mi, se).getTime();
    }
    const parsed = Date.parse(dataTexto);
    return isNaN(parsed) ? (Number(reg.id) || 0) : parsed;
}

function dataIsoLocal(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function formatarDataIsoRelatorio(iso) {
    if (!iso) return '';
    const partes = iso.split('-');
    if (partes.length !== 3) return iso;
    return `${partes[2]}/${partes[1]}/${partes[0]}`;
}

function aplicarPeriodoRelatorio(dias) {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - (Number(dias) - 1));
    const inputIni = document.getElementById('relDataInicial');
    const inputFim = document.getElementById('relDataFinal');
    if (inputIni) inputIni.value = dataIsoLocal(inicio);
    if (inputFim) inputFim.value = dataIsoLocal(fim);
    gerarRelatorio();
}

function limparPeriodoRelatorio() {
    const inputIni = document.getElementById('relDataInicial');
    const inputFim = document.getElementById('relDataFinal');
    if (inputIni) inputIni.value = '';
    if (inputFim) inputFim.value = '';
    gerarRelatorio();
}

function obterFiltroPeriodoRelatorio() {
    const ini = (document.getElementById('relDataInicial')?.value || '').trim();
    const fim = (document.getElementById('relDataFinal')?.value || '').trim();
    const inicioMs = ini ? new Date(`${ini}T00:00:00`).getTime() : null;
    const fimMs = fim ? new Date(`${fim}T23:59:59`).getTime() : null;
    return { ini, fim, inicioMs, fimMs };
}

function filtrarPorPeriodoRelatorio(lista, periodo) {
    if (!periodo || (!periodo.inicioMs && !periodo.fimMs)) return [...lista];
    return lista.filter(item => {
        const ts = obterTimestampRegistro(item);
        if (!ts) return false;
        if (periodo.inicioMs && ts < periodo.inicioMs) return false;
        if (periodo.fimMs && ts > periodo.fimMs) return false;
        return true;
    });
}

function descricaoPeriodoRelatorio(periodo) {
    if (!periodo || (!periodo.ini && !periodo.fim)) return 'Todo o turno';
    if (periodo.ini && periodo.fim) return `${formatarDataIsoRelatorio(periodo.ini)} até ${formatarDataIsoRelatorio(periodo.fim)}`;
    if (periodo.ini) return `A partir de ${formatarDataIsoRelatorio(periodo.ini)}`;
    return `Até ${formatarDataIsoRelatorio(periodo.fim)}`;
}

function obterRegimeMotoristaAtual() {
    const tipo = (metadadosTurno.tipoPagamentoMotorista || metadadosTurno.tipoContrato || metadadosTurno.tipo || 'comissionado').toString().toLowerCase();
    const ehKm = ['quilometragem', 'km', 'por_km', 'aluguel_km'].includes(tipo);
    return {
        tipo: ehKm ? 'quilometragem' : 'comissionado',
        comissaoPercentual: numeroSeguro(metadadosTurno.comissaoPercentual || metadadosTurno.comissao || 0),
        valorKmDono: numeroSeguro(metadadosTurno.valorKmDono || metadadosTurno.valorKm || 0),
        kmInicial: numeroSeguro(metadadosTurno.kmInicial || localStorage.getItem('driverflux_demo_km') || 0),
        kmFinal: numeroSeguro(metadadosTurno.kmFinal || 0)
    };
}

function totaisDespesasTurno() {
    const totais = { gasolina: 0, manutencao: 0, outros: 0, total: 0 };
    (despesasTurno || []).forEach(d => {
        const tipo = (d.tipo || 'outros').toString().toLowerCase();
        const valor = numeroSeguro(d.valor);
        if (tipo.includes('gas')) totais.gasolina += valor;
        else if (tipo.includes('manut')) totais.manutencao += valor;
        else totais.outros += valor;
        totais.total += valor;
    });
    return totais;
}

function escaparHtmlRelatorio(valor) {
    return (valor || '').toString()
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function somarGrupoRelatorio(mapa, chave, valor) {
    const nome = (chave && chave.toString().trim()) ? chave.toString().trim() : 'Não informado';
    if (!mapa[nome]) mapa[nome] = { qtd: 0, total: 0 };
    mapa[nome].qtd += 1;
    mapa[nome].total += valor;
}

function linhasGrupoRelatorio(mapa, vazioTexto) {
    const itens = Object.keys(mapa)
        .map(nome => ({ nome, ...mapa[nome] }))
        .sort((a, b) => b.total - a.total);

    if (!itens.length) {
        return `<div class="report-list-row"><strong>${vazioTexto}</strong><span>R$ 0,00</span></div>`;
    }

    return itens.map(item => `
        <div class="report-list-row">
            <strong>${escaparHtmlRelatorio(item.nome)} <small style="color:#64748b; font-weight:700;">(${item.qtd})</small></strong>
            <span>${formatarMoeda(item.total)}</span>
        </div>
    `).join('');
}

function linhasTabelaCorridasRelatorio(lista) {
    if (!lista.length) {
        return `<div class="report-list-row"><strong>Nenhuma corrida lançada neste turno.</strong><span>-</span></div>`;
    }

    return `
        <table class="report-table">
            <thead>
                <tr>
                    <th>ID</th>
                    <th>DATA</th>
                    <th>CLIENTE</th>
                    <th>TIPO</th>
                    <th>VALOR</th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(r => {
                    const corrida = numeroSeguro(r.corrida);
                    const emprestado = numeroSeguro(r.emprestado);
                    const totalCredito = corrida + emprestado + (emprestado * 0.20);
                    const valorExibido = r.tipo === 'credito' ? totalCredito : corrida;
                    return `
                        <tr>
                            <td>#${escaparHtmlRelatorio(r.id || '-')}</td>
                            <td>${escaparHtmlRelatorio(r.dataHora || '-')}</td>
                            <td>${escaparHtmlRelatorio(r.cliente || 'Passageiro Avulso')}</td>
                            <td>${r.tipo === 'credito' ? 'Crédito' : 'Dinheiro'}</td>
                            <td><b>${formatarMoeda(valorExibido)}</b></td>
                        </tr>
                    `;
                }).join('')}
            </tbody>
        </table>`;
}

function gerarRelatorio() {
    const output = document.getElementById('reportOutput');
    const card = document.getElementById('cardRelatorio');
    if (!output || !card) return;

    let tNormais = 0;
    let tCreditoCorridas = 0;
    let tEmprestado = 0;
    let tJuros = 0;
    const porCliente = {};
    const porMotorista = {};
    const porPrefixo = {};
    const periodo = obterFiltroPeriodoRelatorio();
    const registrosRelatorio = filtrarPorPeriodoRelatorio(registros, periodo).sort((a, b) => obterTimestampRegistro(b) - obterTimestampRegistro(a));
    const pagamentosRelatorio = filtrarPorPeriodoRelatorio(pagamentos || [], periodo);

    const motoristaAtivo = (usuarioLogado || metadadosTurno.motorista || 'Não informado').toString().toUpperCase();
    const prefixoAtivo = (metadadosTurno.prefixoCarro || localStorage.getItem('driverflux_demo_prefixo') || 'N/I').toString().toUpperCase();
    const fundo = (localStorage.getItem('driverflux_modo_demo') === 'true') ? (parseFloat(localStorage.getItem('driverflux_demo_troco')) || 0) : (metadadosTurno.trocoInicial || 0);

    registrosRelatorio.forEach(r => {
        const corrida = numeroSeguro(r.corrida);
        const emprestado = numeroSeguro(r.emprestado);
        const juros = emprestado * 0.20;
        const valorTotal = r.tipo === 'credito' ? (corrida + emprestado + juros) : corrida;

        if (r.tipo === 'credito') {
            tCreditoCorridas += corrida;
            tEmprestado += emprestado;
            tJuros += juros;
            somarGrupoRelatorio(porCliente, r.cliente || 'Cliente sem nome', valorTotal);
        } else {
            tNormais += corrida;
            somarGrupoRelatorio(porCliente, r.cliente || 'Passageiro Avulso', valorTotal);
        }

        somarGrupoRelatorio(porMotorista, motoristaAtivo, valorTotal);
        somarGrupoRelatorio(porPrefixo, prefixoAtivo, valorTotal);
    });

    const totalCreditoComJuros = tCreditoCorridas + tEmprestado + tJuros;
    const totalPago = pagamentosRelatorio.reduce((acc, p) => acc + numeroSeguro(p.valor), 0);
    const saldoPendente = Math.max(totalCreditoComJuros - totalPago, 0);
    const producaoTotal = tNormais + totalCreditoComJuros;
    const dinheiroEsperado = fundo + tNormais + totalPago;
    const despesas = totaisDespesasTurno();
    const regime = obterRegimeMotoristaAtual();
    const kmFinalRel = numeroSeguro(metadadosTurno.kmFinal || document.getElementById('inputKmFinalFechamento')?.value || 0);
    const kmRodadoRel = Math.max(kmFinalRel - regime.kmInicial, 0);
    const comissaoMotoristaRel = regime.tipo === 'comissionado' ? producaoTotal * (regime.comissaoPercentual / 100) : 0;
    const aluguelKmRel = regime.tipo === 'quilometragem' ? kmRodadoRel * regime.valorKmDono : 0;
    const liquidoDonoRel = regime.tipo === 'comissionado' ? producaoTotal - comissaoMotoristaRel - despesas.total : aluguelKmRel;
    const sobraMotoristaRel = regime.tipo === 'quilometragem' ? producaoTotal - despesas.total - aluguelKmRel : comissaoMotoristaRel;
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const periodoTexto = descricaoPeriodoRelatorio(periodo);

    output.innerHTML = `
        <div class="report-pro">
            <div class="report-head">
                <h3>🧾 DriverFlux — Relatório de Turno</h3>
                <p>
                    Motorista: <b>${escaparHtmlRelatorio(motoristaAtivo)}</b> • Prefixo: <b>${escaparHtmlRelatorio(prefixoAtivo)}</b><br>
                    Turno: ${escaparHtmlRelatorio(idTurnoAtivo || metadadosTurno.id || 'DEMO')} • Abertura: ${escaparHtmlRelatorio(metadadosTurno.abertura || 'N/I')}<br>
                    Período: <b>${escaparHtmlRelatorio(periodoTexto)}</b><br>
                    Gerado em: ${escaparHtmlRelatorio(dataGeracao)}
                </p>
            </div>

            <div class="report-grid">
                <div class="report-card primary"><div class="label">Corridas</div><div class="value">${registrosRelatorio.length}</div></div>
                <div class="report-card success"><div class="label">Produção total</div><div class="value">${formatarMoeda(producaoTotal)}</div></div>
                <div class="report-card"><div class="label">Dinheiro + amortizações</div><div class="value">${formatarMoeda(dinheiroEsperado)}</div></div>
                <div class="report-card warning"><div class="label">Crédito lançado</div><div class="value">${formatarMoeda(totalCreditoComJuros)}</div></div>
                <div class="report-card success"><div class="label">Amortizado</div><div class="value">${formatarMoeda(totalPago)}</div></div>
                <div class="report-card danger"><div class="label">Saldo pendente</div><div class="value">${formatarMoeda(saldoPendente)}</div></div>
            </div>

            <div class="report-section">
                <h4>Resumo do Caixa <span>${formatarMoeda(dinheiroEsperado)}</span></h4>
                <div class="report-list-row"><strong>Troco inicial</strong><span>${formatarMoeda(fundo)}</span></div>
                <div class="report-list-row"><strong>Corridas pagas em dinheiro</strong><span>${formatarMoeda(tNormais)}</span></div>
                <div class="report-list-row"><strong>Pagamentos/amortizações recebidos</strong><span>${formatarMoeda(totalPago)}</span></div>
                <div class="report-list-row"><strong>Corridas no crédito</strong><span>${formatarMoeda(tCreditoCorridas)}</span></div>
                <div class="report-list-row"><strong>Empréstimos</strong><span>${formatarMoeda(tEmprestado)}</span></div>
                <div class="report-list-row"><strong>Taxa/juros 20%</strong><span>${formatarMoeda(tJuros)}</span></div>
            </div>

            <div class="report-section">
                <h4>Despesas do Turno <span>${formatarMoeda(despesas.total)}</span></h4>
                <div class="report-list-row"><strong>Gasolina</strong><span>${formatarMoeda(despesas.gasolina)}</span></div>
                <div class="report-list-row"><strong>Manutenção</strong><span>${formatarMoeda(despesas.manutencao)}</span></div>
                <div class="report-list-row"><strong>Outras despesas</strong><span>${formatarMoeda(despesas.outros)}</span></div>
            </div>

            <div class="report-section">
                <h4>Acerto Motorista / Dono</h4>
                <div class="report-list-row"><strong>Regime</strong><span>${regime.tipo === 'quilometragem' ? 'Por KM' : 'Comissão'}</span></div>
                ${regime.tipo === 'quilometragem' ? `<div class="report-list-row"><strong>KM inicial / final / rodado</strong><span>${regime.kmInicial} / ${kmFinalRel || '-'} / ${kmRodadoRel}</span></div><div class="report-list-row"><strong>Valor ao dono por KM</strong><span>${formatarMoeda(aluguelKmRel)}</span></div>` : `<div class="report-list-row"><strong>Comissão do motorista</strong><span>${regime.comissaoPercentual}% = ${formatarMoeda(comissaoMotoristaRel)}</span></div>`}
                <div class="report-list-row"><strong>Motorista fica/recebe</strong><span>${formatarMoeda(sobraMotoristaRel)}</span></div>
                <div class="report-list-row"><strong>Dono do carro</strong><span>${formatarMoeda(liquidoDonoRel)}</span></div>
            </div>

            <div class="report-section">
                <h4>Totais por Cliente</h4>
                ${linhasGrupoRelatorio(porCliente, 'Nenhum cliente no relatório')}
            </div>

            <div class="report-section">
                <h4>Totais por Motorista</h4>
                ${linhasGrupoRelatorio(porMotorista, 'Nenhum motorista no relatório')}
            </div>

            <div class="report-section">
                <h4>Totais por Prefixo</h4>
                ${linhasGrupoRelatorio(porPrefixo, 'Nenhum prefixo no relatório')}
            </div>

            <div class="report-section">
                <h4>Detalhamento das Corridas</h4>
                ${linhasTabelaCorridasRelatorio(registrosRelatorio)}
            </div>
        </div>`;

    output.style.display = 'block';
    card.style.display = 'block';
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}


function aplicarPeriodoRelatorioDespesa(dias) {
    const fim = new Date();
    const inicio = new Date();
    inicio.setDate(fim.getDate() - (Number(dias) - 1));
    const inputIni = document.getElementById('relDespesaDataInicial');
    const inputFim = document.getElementById('relDespesaDataFinal');
    if (inputIni) inputIni.value = dataIsoLocal(inicio);
    if (inputFim) inputFim.value = dataIsoLocal(fim);
    gerarRelatorioDespesas();
}

function limparPeriodoRelatorioDespesa() {
    const inputIni = document.getElementById('relDespesaDataInicial');
    const inputFim = document.getElementById('relDespesaDataFinal');
    if (inputIni) inputIni.value = '';
    if (inputFim) inputFim.value = '';
    gerarRelatorioDespesas();
}

function obterFiltroPeriodoRelatorioDespesa() {
    const ini = (document.getElementById('relDespesaDataInicial')?.value || '').trim();
    const fim = (document.getElementById('relDespesaDataFinal')?.value || '').trim();
    const inicioMs = ini ? new Date(`${ini}T00:00:00`).getTime() : null;
    const fimMs = fim ? new Date(`${fim}T23:59:59`).getTime() : null;
    return { ini, fim, inicioMs, fimMs };
}

function filtrarDespesasPorPeriodo(lista, periodo) {
    if (!periodo || (!periodo.inicioMs && !periodo.fimMs)) return [...lista];
    return lista.filter(item => {
        const ts = obterTimestampRegistro({ dataHora: item.dataHora, data: item.data, timestamp: item.timestamp || item.criadoEm });
        if (!ts) return false;
        if (periodo.inicioMs && ts < periodo.inicioMs) return false;
        if (periodo.fimMs && ts > periodo.fimMs) return false;
        return true;
    });
}

function abrirRelatorioDespesas() {
    const card = document.getElementById('cardRelatorioDespesas');
    const cardRel = document.getElementById('cardRelatorio');
    const cardTotais = document.getElementById('cardTotais');
    if (cardRel) cardRel.style.display = 'none';
    if (cardTotais) cardTotais.style.display = 'none';
    if (!card) return alert('Tela de relatório de despesas não encontrada.');
    const campoPrefixo = document.getElementById('relDespesaPrefixo');
    if (campoPrefixo && !campoPrefixo.value) campoPrefixo.value = (metadadosTurno.prefixoCarro || localStorage.getItem('driverflux_demo_prefixo') || '').toString().toUpperCase();
    card.style.display = 'block';
    gerarRelatorioDespesas();
    setTimeout(() => campoPrefixo?.focus(), 120);
    card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function fecharRelatorioDespesas() {
    const card = document.getElementById('cardRelatorioDespesas');
    if (card) card.style.display = 'none';
}

async function carregarBaseDespesasRelatorio() {
    const base = [];

    if (localStorage.getItem('driverflux_modo_demo') === 'true' || !db) {
        (despesasTurno || []).forEach(d => base.push({
            ...d,
            turno: idTurnoAtivo || 'DEMO-LOCAL',
            motorista: d.motorista || usuarioLogado || 'demo_local',
            prefixo: d.prefixo || metadadosTurno.prefixoCarro || localStorage.getItem('driverflux_demo_prefixo') || 'DEMO'
        }));
        return base;
    }

    iniciarFirebaseSeNecessario();
    const [snapTurnos, snapDespesas] = await Promise.all([
        db.ref('turnos_operacionais').once('value'),
        db.ref('despesas_por_turno').once('value')
    ]);

    const mapaTurnos = {};
    const turnos = snapTurnos.val() || {};
    Object.keys(turnos).forEach(motorista => {
        Object.keys(turnos[motorista] || {}).forEach(tId => {
            const t = turnos[motorista][tId] || {};
            mapaTurnos[tId] = {
                motorista,
                prefixo: t.prefixoCarro || 'N/I',
                abertura: t.abertura || ''
            };
        });
    });

    const despesasPorTurno = snapDespesas.val() || {};
    Object.keys(despesasPorTurno).forEach(tId => {
        const meta = mapaTurnos[tId] || {};
        Object.keys(despesasPorTurno[tId] || {}).forEach(key => {
            const d = despesasPorTurno[tId][key] || {};
            base.push({
                ...d,
                fbKey: key,
                turno: tId,
                motorista: d.motorista || meta.motorista || 'N/I',
                prefixo: d.prefixo || meta.prefixo || 'N/I',
                abertura: meta.abertura || ''
            });
        });
    });
    return base;
}

function totaisDespesasLista(lista) {
    const totais = { gasolina: 0, manutencao: 0, outros: 0, total: 0, qtd: 0 };
    (lista || []).forEach(d => {
        const tipo = (d.tipo || 'outros').toString().toLowerCase();
        const valor = numeroSeguro(d.valor);
        if (tipo.includes('gas') || tipo.includes('comb')) totais.gasolina += valor;
        else if (tipo.includes('manut') || tipo.includes('óleo') || tipo.includes('oleo') || tipo.includes('pneu')) totais.manutencao += valor;
        else totais.outros += valor;
        totais.total += valor;
        totais.qtd += 1;
    });
    return totais;
}

function linhasTabelaDespesasRelatorio(lista) {
    if (!lista.length) {
        return `<div class="report-list-row"><strong>Nenhuma despesa encontrada para este prefixo/período.</strong><span>-</span></div>`;
    }

    return `
        <table class="report-table">
            <thead>
                <tr>
                    <th>DATA</th>
                    <th>TIPO</th>
                    <th>DESCRIÇÃO</th>
                    <th>MOTORISTA</th>
                    <th>VALOR</th>
                </tr>
            </thead>
            <tbody>
                ${lista.map(d => `
                    <tr>
                        <td>${escaparHtmlRelatorio(d.dataHora || d.abertura || '-')}</td>
                        <td>${escaparHtmlRelatorio((d.tipo || 'outros').toString().toUpperCase())}</td>
                        <td>${escaparHtmlRelatorio(d.descricao || '-')}</td>
                        <td>${escaparHtmlRelatorio((d.motorista || 'N/I').toString().toUpperCase())}</td>
                        <td><b>${formatarMoeda(numeroSeguro(d.valor))}</b></td>
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

async function gerarRelatorioDespesas() {
    const output = document.getElementById('reportDespesasOutput');
    const card = document.getElementById('cardRelatorioDespesas');
    if (!output || !card) return;

    output.innerHTML = '<div class="report-section"><h4>Carregando despesas...</h4></div>';
    card.style.display = 'block';

    try {
        const prefixoFiltro = (document.getElementById('relDespesaPrefixo')?.value || '').trim().toUpperCase();
        const periodo = obterFiltroPeriodoRelatorioDespesa();
        const base = await carregarBaseDespesasRelatorio();
        let lista = filtrarDespesasPorPeriodo(base, periodo);
        if (prefixoFiltro) {
            lista = lista.filter(d => (d.prefixo || '').toString().toUpperCase().includes(prefixoFiltro));
        }
        lista.sort((a, b) => obterTimestampRegistro({ dataHora: b.dataHora, timestamp: b.timestamp || b.criadoEm }) - obterTimestampRegistro({ dataHora: a.dataHora, timestamp: a.timestamp || a.criadoEm }));

        const totais = totaisDespesasLista(lista);
        const porPrefixo = {};
        const porMotorista = {};
        lista.forEach(d => {
            somarGrupoRelatorio(porPrefixo, (d.prefixo || 'N/I').toString().toUpperCase(), numeroSeguro(d.valor));
            somarGrupoRelatorio(porMotorista, (d.motorista || 'N/I').toString().toUpperCase(), numeroSeguro(d.valor));
        });

        output.innerHTML = `
            <div class="report-pro">
                <div class="report-head">
                    <h3>⛽ DriverFlux — Relatório de Despesas</h3>
                    <p>
                        Prefixo pesquisado: <b>${escaparHtmlRelatorio(prefixoFiltro || 'Todos')}</b><br>
                        Período: <b>${escaparHtmlRelatorio(descricaoPeriodoRelatorio(periodo))}</b><br>
                        Gerado em: ${escaparHtmlRelatorio(new Date().toLocaleString('pt-BR'))}
                    </p>
                </div>
                <div class="report-grid">
                    <div class="report-card primary"><div class="label">Lançamentos</div><div class="value">${totais.qtd}</div></div>
                    <div class="report-card danger"><div class="label">Total despesas</div><div class="value">${formatarMoeda(totais.total)}</div></div>
                    <div class="report-card warning"><div class="label">Gasolina</div><div class="value">${formatarMoeda(totais.gasolina)}</div></div>
                    <div class="report-card"><div class="label">Manutenção</div><div class="value">${formatarMoeda(totais.manutencao)}</div></div>
                    <div class="report-card"><div class="label">Outros</div><div class="value">${formatarMoeda(totais.outros)}</div></div>
                </div>
                <div class="report-section">
                    <h4>Totais por Prefixo</h4>
                    ${linhasGrupoRelatorio(porPrefixo, 'Nenhum prefixo encontrado')}
                </div>
                <div class="report-section">
                    <h4>Totais por Motorista</h4>
                    ${linhasGrupoRelatorio(porMotorista, 'Nenhum motorista encontrado')}
                </div>
                <div class="report-section">
                    <h4>Detalhamento das Despesas</h4>
                    ${linhasTabelaDespesasRelatorio(lista)}
                </div>
            </div>`;
    } catch (err) {
        output.innerHTML = `<div class="report-section"><h4>Erro ao gerar relatório</h4><p>${escaparHtmlRelatorio(err.message || err)}</p></div>`;
    }
}

function copiarRelatorioDespesas() {
    const texto = (document.getElementById('reportDespesasOutput')?.innerText || '').trim();
    if (!texto) return alert('Gere o relatório de despesas antes de copiar.');
    copiarTextoDriverFlux(texto, '✅ Relatório de despesas copiado.');
}

function montarHtmlRelatorioParaImpressao() {
    const output = document.getElementById('reportOutput');
    if (!output || !output.innerHTML.trim()) return '';

    const estilos = Array.from(document.querySelectorAll('style'))
        .map(style => style.innerHTML)
        .join('\n');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Relatório DriverFlux</title>
<style>
${estilos}
body { background: #ffffff !important; padding: 12px !important; }
.container-central { max-width: 100% !important; }
.report-pro { box-shadow: none !important; }
.no-print, button { display: none !important; }
@media print {
    body, html { background: #ffffff !important; padding: 0 !important; margin: 0 !important; }
    * { visibility: visible !important; }
}
</style>
</head>
<body>
${output.innerHTML}
<script>
window.onload = function() {
    setTimeout(function(){ window.focus(); window.print(); }, 400);
};
<\/script>
</body>
</html>`;
}

function imprimirRelatorioPDF() {
    const html = montarHtmlRelatorioParaImpressao();
    if (!html) {
        alert('Gere o relatório antes de imprimir ou salvar em PDF.');
        return;
    }

    try {
        const frame = document.createElement('iframe');
        frame.style.position = 'fixed';
        frame.style.right = '0';
        frame.style.bottom = '0';
        frame.style.width = '1px';
        frame.style.height = '1px';
        frame.style.border = '0';
        document.body.appendChild(frame);

        const doc = frame.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        setTimeout(() => {
            try {
                frame.contentWindow.focus();
                frame.contentWindow.print();
            } catch (e) {
                abrirRelatorioEmNovaJanela(html);
            }
            setTimeout(() => frame.remove(), 5000);
        }, 700);
    } catch (e) {
        abrirRelatorioEmNovaJanela(html);
    }

    setTimeout(() => {
        alert('Se a tela de impressão abrir, escolha “Salvar em PDF”. Se não abrir neste aparelho, use o botão “Salvar/Compartilhar”.');
    }, 900);
}

function abrirRelatorioEmNovaJanela(html) {
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const janela = window.open(url, '_blank');
    if (!janela) {
        location.href = url;
    }
}

async function salvarRelatorioComoArquivo() {
    const html = montarHtmlRelatorioParaImpressao();
    if (!html) {
        alert('Gere o relatório antes de salvar ou compartilhar.');
        return;
    }

    const agora = new Date();
    const nomeArquivo = 'relatorio-driverflux-' + agora.toISOString().slice(0, 10) + '.html';
    const textoResumo = (document.getElementById('reportOutput')?.innerText || 'Relatório DriverFlux').trim();
    const arquivo = new File([html], nomeArquivo, { type: 'text/html' });

    try {
        if (navigator.canShare && navigator.canShare({ files: [arquivo] }) && navigator.share) {
            await navigator.share({
                title: 'Relatório DriverFlux',
                text: 'Relatório de turno DriverFlux',
                files: [arquivo]
            });
            alert('✅ Relatório enviado para o menu de compartilhamento do Android. Se você escolheu Drive, WhatsApp ou Arquivos, procure nele.');
            return;
        }
    } catch (e) {
        alert('⚠️ O compartilhamento foi cancelado ou bloqueado pelo Android. Vou tentar gerar um arquivo para download.');
    }

    try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomeArquivo;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 3000);
        alert('✅ Relatório gerado como HTML. No Android, procure em Downloads/Arquivos recentes. Para PDF verdadeiro, use “Imprimir/PDF” e escolha “Salvar em PDF”.');
    } catch (e) {
        await copiarTextoDriverFlux(textoResumo, '✅ Não consegui salvar arquivo neste aparelho, mas copiei o relatório em texto para você colar/salvar.');
        abrirRelatorioEmNovaJanela(html);
    }
}

function fecharRelatorioProfissional() {
    const card = document.getElementById('cardRelatorio');
    const output = document.getElementById('reportOutput');
    if (card) card.style.display = 'none';
    if (output) {
        output.innerHTML = '';
        output.style.display = 'none';
    }
}

function encerrarTurnoDefinitivo() {
    const btn = document.getElementById('btnFecharTurnoOficial');
    if (btn && btn.disabled) return;

    const regime = obterRegimeMotoristaAtual();
    const inputKmFinal = document.getElementById('inputKmFinalFechamento');
    const kmFinal = numeroSeguro(inputKmFinal?.value || 0);
    if (regime.tipo === 'quilometragem') {
        if (kmFinal <= 0) return alert('Informe o hodômetro final para calcular o acerto por quilometragem.');
        if (kmFinal < regime.kmInicial) return alert('O hodômetro final não pode ser menor que o hodômetro inicial.');
    }
    calcularAcertoMotoristaFechamento();
    
    if (!confirm("Deseja realmente encerrar este turno?")) return;
    
    if (btn) { btn.disabled = true; btn.innerHTML = "⏳ Encerrando..."; }

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        if (kmFinal > 0) localStorage.setItem('driverflux_demo_km_final', kmFinal);
        localStorage.setItem('driverflux_demo_status', 'fechado');
        location.reload(); return;
    }
    iniciarFirebaseSeNecessario();
    db.ref(`turnos_operacionais/${usuarioLogado}/${idTurnoAtivo}`).update({
        status: 'fechado', fechamento: new Date().toLocaleString('pt-BR'), kmFinal: kmFinal || null
    }).then(() => { alert("Turno encerrado com sucesso!"); location.reload(); }).catch(err => {
        alert("Erro ao encerrar turno: " + err.message);
        if (btn) { btn.disabled = false; btn.innerHTML = "🔴 Encerrar Turno e Fechar Caixa"; }
    });
}

function processarConsultaCliente() {
    const nome = document.getElementById('inputPesquisa').value.trim();
    const ficha = document.getElementById('fichaCliente');
    if (!nome || !ficha) { if(ficha) ficha.style.display = 'none'; return; }
    
    const corridas = registros.filter(r => r.tipo === 'credito' && r.cliente.toLowerCase() === nome.toLowerCase());
    const totalDevido = corridas.reduce((acc, curr) => acc + curr.corrida + (curr.emprestado * 1.20), 0);
    
    document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${nome.toUpperCase()}`;
    document.getElementById('ledgerTotalDevido').innerText = formatarMoeda(totalDevido);
    document.getElementById('ledgerSaldoFinal').innerText = formatarMoeda(totalDevido);
    ficha.style.display = 'block';
}

function limparConsulta() { document.getElementById('inputPesquisa').value = ''; esconderSugestoesPagamento(); const ficha = document.getElementById('fichaCliente'); if (ficha) ficha.style.display = 'none'; }
function registrarPagamento() { alert("Funcionalidade de amortização em desenvolvimento."); }

// ==================== AMORTIZAÇÃO COMPLETA + CONSULTA MASTER + CANCELAR FECHAMENTO ====================

function carregarPagamentos() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        const salvo = localStorage.getItem('driverflux_demo_pagamentos');
        pagamentos = salvo ? JSON.parse(salvo) : [];
        return;
    }

    pagamentos = [];
    if (db && idTurnoAtivo) {
        db.ref(`pagamentos/${idTurnoAtivo}`).once('value').then(snapshot => {
            const dados = snapshot.val() || {};
            pagamentos = Object.keys(dados).map(key => ({ fbKey: key, ...dados[key] }));
            processarConsultaCliente();
        }).catch(err => {
            console.warn('Não foi possível carregar pagamentos:', err);
        });
    }
}

function salvarPagamento(pagamento) {
    const jaExiste = pagamentos.some(p => p.id === pagamento.id);
    if (!jaExiste) pagamentos.push(pagamento);

    if (localStorage.getItem('driverflux_modo_demo') === 'true') {
        localStorage.setItem('driverflux_demo_pagamentos', JSON.stringify(pagamentos));
        return Promise.resolve();
    }

    if (db && idTurnoAtivo) {
        return db.ref(`pagamentos/${idTurnoAtivo}`).push(pagamento).then(ref => {
            pagamento.fbKey = ref.key;
        });
    }

    return Promise.resolve();
}

function calcularTotalPagoPorCliente(nomeCliente) {
    const alvo = normalizarTextoConsulta(nomeCliente);
    let total = 0;
    pagamentos.forEach(p => {
        if (normalizarTextoConsulta(p.cliente) === alvo) {
            total += Number(p.valor) || 0;
        }
    });
    return total;
}

function lerValorMonetarioPagamento(valor) {
    const limpo = (valor || '').toString().replace(/[^0-9,.-]/g, '').replace(',', '.');
    return Number(limpo) || 0;
}

function registrarPagamento() {
    const nomeCliente = document.getElementById('ledgerNomeCliente').innerText.replace('Extrato: ', '').trim();
    const inputValor = document.getElementById('inputValorPagamento');
    const valorPago = lerValorMonetarioPagamento(inputValor ? inputValor.value : '');

    if (!nomeCliente || !valorPago || valorPago <= 0) {
        alert("⚠️ Digite um valor válido para amortizar.");
        return;
    }

    const agora = new Date();
    const dataHora = agora.toLocaleDateString('pt-BR') + ' ' + agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const pagamento = {
        id: Date.now(),
        cliente: nomeCliente,
        valor: valorPago,
        dataHora: dataHora,
        turno: idTurnoAtivo || "DEMO",
        motorista: motoristaDoTurnoAtual ? motoristaDoTurnoAtual() : usuarioLogado
    };

    salvarPagamento(pagamento).then(() => {
        if (inputValor) inputValor.value = '';
        processarConsultaCliente(true);
        alert(`✅ Pagamento de ${formatarMoeda(valorPago)} registrado e abatido para ${nomeCliente}!`);

        if (localStorage.getItem('driverflux_modo_demo') === 'true') {
            renderToggleAcoesDemo();
        }
    }).catch(err => {
        pagamentos = pagamentos.filter(p => p.id !== pagamento.id);
        processarConsultaCliente(true);
        alert('❌ Não foi possível salvar o pagamento: ' + err.message);
    });
}

function processarConsultaCliente(forcarExibicao = false) {
    const input = document.getElementById('inputPesquisa');
    const nomeDigitado = input ? input.value.trim() : '';
    const ficha = document.getElementById('fichaCliente');

    if (forcarExibicao) {
        esconderSugestoesPagamento();
    } else {
        renderizarSugestoesPagamento();
    }

    if (!nomeDigitado || !ficha) {
        if (ficha) ficha.style.display = 'none';
        return;
    }

    const clienteExato = obterClientesCreditoUnicos().find(c => c.toLowerCase() === nomeDigitado.toLowerCase());
    if (!clienteExato && !forcarExibicao) {
        ficha.style.display = 'none';
        return;
    }

    const nome = clienteExato || nomeDigitado;
    const corridas = registros.filter(r => 
        r.tipo === 'credito' && 
        r.cliente && 
        r.cliente.toLowerCase() === nome.toLowerCase()
    );

    let totalDevido = 0;
    corridas.forEach(r => {
        totalDevido += (r.corrida || 0) + ((r.emprestado || 0) * 1.20);
    });

    const totalPago = calcularTotalPagoPorCliente(nome);
    const saldoPendente = totalDevido - totalPago;

    document.getElementById('ledgerNomeCliente').innerText = `Extrato: ${nome.toUpperCase()}`;
    document.getElementById('ledgerTotalDevido').innerText = formatarMoeda(totalDevido);
    document.getElementById('ledgerTotalPago').innerText = formatarMoeda(totalPago);
    document.getElementById('ledgerSaldoFinal').innerText = formatarMoeda(saldoPendente);

    ficha.style.display = 'block';
}

function cancelarFechamento() {
    if (confirm("Deseja realmente voltar sem encerrar o turno?")) {
        const cardTotais = document.getElementById('cardTotais');
        const cardRelatorio = document.getElementById('cardRelatorio');
        const reportOutput = document.getElementById('reportOutput');

        if (cardTotais) cardTotais.style.display = 'none';
        if (cardRelatorio) cardRelatorio.style.display = 'none';
        if (reportOutput) reportOutput.innerText = '';
    }
}

function normalizarTextoConsulta(valor) {
    return (valor || '').toString().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function garantirBoxResultadoConsultaMaster() {
    let box = document.getElementById('resultadoConsultaMaster');
    if (box) return box;

    const painel = document.getElementById('painelFiltroMaster');
    box = document.createElement('div');
    box.id = 'resultadoConsultaMaster';
    box.style.display = 'none';
    box.style.marginTop = '12px';
    box.style.background = '#ffffff';
    box.style.border = '1px solid #c7d2fe';
    box.style.borderRadius = '14px';
    box.style.padding = '14px';
    box.style.boxShadow = '0 8px 18px rgba(79,70,229,0.08)';

    if (painel) painel.appendChild(box);
    return box;
}

function montarLinhaResultadoConsulta(item) {
    const tipo = item.tipo === 'credito' ? 'Crédito' : 'Normal';
    const cliente = item.cliente || 'Passageiro balcão';
    const valorCorrida = parseFloat(item.corrida) || 0;
    const emprestado = parseFloat(item.emprestado) || 0;
    const total = valorCorrida + emprestado + (emprestado * 0.20);

    return `
        <div style="border:1px solid #e2e8f0; border-radius:12px; padding:10px; margin-top:8px; background:#f8fafc;">
            <div style="display:flex; justify-content:space-between; gap:10px; font-weight:800; color:#1e293b;">
                <span>#${item.id || '-' } • ${tipo}</span>
                <span>${formatarMoeda(total)}</span>
            </div>
            <div style="font-size:12px; color:#475569; margin-top:5px; line-height:1.45;">
                👤 Cliente: <b>${cliente}</b><br>
                🚕 Motorista: <b>${(item.motorista || usuarioLogado || 'N/I').toString().toUpperCase()}</b><br>
                🚖 Prefixo: <b>${(item.prefixo || metadadosTurno.prefixoCarro || 'N/I').toString().toUpperCase()}</b><br>
                📅 Data: ${item.dataHora || item.abertura || 'N/I'}<br>
                💰 Corrida: ${formatarMoeda(valorCorrida)} ${emprestado > 0 ? ` • Empréstimo: ${formatarMoeda(emprestado)} + 20%` : ''}
            </div>
        </div>`;
}

async function carregarBaseConsultaMaster() {
    const base = [];

    if (localStorage.getItem('driverflux_modo_demo') === 'true' || !db) {
        registros.forEach(r => base.push({
            ...r,
            motorista: usuarioLogado || 'demo_local',
            prefixo: metadadosTurno.prefixoCarro || localStorage.getItem('driverflux_demo_prefixo') || 'DEMO'
        }));
        return base;
    }

    iniciarFirebaseSeNecessario();

    const [snapTurnos, snapCorridas] = await Promise.all([
        db.ref('turnos_operacionais').once('value'),
        db.ref('corridas_por_turno').once('value')
    ]);

    const mapaTurnos = {};
    const turnos = snapTurnos.val() || {};
    Object.keys(turnos).forEach(motorista => {
        Object.keys(turnos[motorista] || {}).forEach(tId => {
            mapaTurnos[tId] = {
                motorista,
                prefixo: (turnos[motorista][tId] || {}).prefixoCarro || 'N/I',
                abertura: (turnos[motorista][tId] || {}).abertura || ''
            };
        });
    });

    const corridasPorTurno = snapCorridas.val() || {};
    Object.keys(corridasPorTurno).forEach(tId => {
        const meta = mapaTurnos[tId] || {};
        Object.keys(corridasPorTurno[tId] || {}).forEach(key => {
            const r = corridasPorTurno[tId][key] || {};
            base.push({
                ...r,
                fbKey: key,
                turno: tId,
                motorista: meta.motorista || 'N/I',
                prefixo: meta.prefixo || 'N/I',
                abertura: meta.abertura || ''
            });
        });
    });

    return base;
}


let consultaMasterCache = [];
let consultaMasterTipoAtual = 'cliente';

function garantirModalConsultaMaster() {
    let modal = document.getElementById('modalConsultaMaster');
    if (modal) return modal;

    modal = document.createElement('div');
    modal.id = 'modalConsultaMaster';
    modal.style.cssText = 'display:none; position:fixed; inset:0; z-index:9999; background:rgba(15,23,42,0.72); padding:18px; align-items:center; justify-content:center;';
    modal.innerHTML = `
        <div style="width:100%; max-width:520px; max-height:92vh; overflow:hidden; background:white; border-radius:18px; box-shadow:0 18px 50px rgba(0,0,0,0.35); display:flex; flex-direction:column;">
            <div style="padding:16px; background:#4f46e5; color:white; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div>
                    <div style="font-size:18px; font-weight:900;">🔎 Consulta Avançada</div>
                    <div style="font-size:12px; opacity:.9;">Toque no tipo e escolha na lista rolável</div>
                </div>
                <button onclick="fecharModalConsultaMaster()" style="background:rgba(255,255,255,.18); color:white; border:1px solid rgba(255,255,255,.35); border-radius:10px; padding:8px 10px; font-weight:800;">✕</button>
            </div>

            <div style="padding:14px; display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px;">
                <button id="btnTipoClienteMaster" onclick="selecionarTipoConsultaMaster('cliente')" style="padding:12px 6px; border-radius:12px; font-weight:900; border:none;">👤 Cliente</button>
                <button id="btnTipoMotoristaMaster" onclick="selecionarTipoConsultaMaster('motorista')" style="padding:12px 6px; border-radius:12px; font-weight:900; border:none;">🚕 Motorista</button>
                <button id="btnTipoPrefixoMaster" onclick="selecionarTipoConsultaMaster('prefixo')" style="padding:12px 6px; border-radius:12px; font-weight:900; border:none;">🚖 Prefixo</button>
            </div>

            <div style="padding:0 14px 14px 14px;">
                <input id="inputConsultaMasterModal" type="text" placeholder="Digite para filtrar..." autocomplete="off"
                       oninput="renderizarSugestoesConsultaMaster()"
                       style="width:100%; box-sizing:border-box; padding:14px; font-size:16px; border:2px solid #c7d2fe; border-radius:14px; outline:none;">
            </div>

            <div id="listaConsultaMasterModal" style="margin:0 14px 14px 14px; border:1px solid #e2e8f0; border-radius:14px; max-height:300px; overflow-y:auto; background:#f8fafc;"></div>

            <div style="padding:14px; border-top:1px solid #e2e8f0; display:flex; gap:8px;">
                <button onclick="executarConsultaMasterPeloModal()" style="flex:1; padding:13px; border:none; border-radius:12px; background:#16a34a; color:white; font-weight:900;">Consultar</button>
                <button onclick="fecharModalConsultaMaster()" style="padding:13px; border:none; border-radius:12px; background:#e2e8f0; color:#334155; font-weight:900;">Cancelar</button>
            </div>
        </div>`;

    document.body.appendChild(modal);
    return modal;
}

async function abrirModalConsultaMaster() {
    if (usuarioLogado !== 'master') {
        alert('🔒 Função exclusiva para Master!');
        return;
    }

    const modal = garantirModalConsultaMaster();
    modal.style.display = 'flex';

    const lista = document.getElementById('listaConsultaMasterModal');
    if (lista) lista.innerHTML = '<div style="padding:14px; color:#4f46e5; font-weight:800;">Carregando dados...</div>';

    try {
        consultaMasterCache = await carregarBaseConsultaMaster();
        selecionarTipoConsultaMaster('cliente');
        setTimeout(() => {
            const input = document.getElementById('inputConsultaMasterModal');
            if (input) input.focus();
        }, 80);
    } catch (err) {
        if (lista) lista.innerHTML = `<div style="padding:14px; color:#ef4444; font-weight:800;">Erro ao carregar consulta:<br>${err.message}</div>`;
    }
}

function fecharModalConsultaMaster() {
    const modal = document.getElementById('modalConsultaMaster');
    if (modal) modal.style.display = 'none';
}

function selecionarTipoConsultaMaster(tipo) {
    consultaMasterTipoAtual = tipo;
    const input = document.getElementById('inputConsultaMasterModal');
    if (input) {
        input.value = '';
        input.placeholder = tipo === 'cliente' ? 'Digite o nome do cliente...' : tipo === 'motorista' ? 'Digite o nome do motorista...' : 'Digite o prefixo do carro...';
    }

    const botoes = {
        cliente: document.getElementById('btnTipoClienteMaster'),
        motorista: document.getElementById('btnTipoMotoristaMaster'),
        prefixo: document.getElementById('btnTipoPrefixoMaster')
    };

    Object.keys(botoes).forEach(k => {
        if (!botoes[k]) return;
        botoes[k].style.background = k === tipo ? '#4f46e5' : '#e2e8f0';
        botoes[k].style.color = k === tipo ? '#ffffff' : '#334155';
    });

    renderizarSugestoesConsultaMaster();
}

function obterValorCampoConsultaMaster(item, tipo) {
    if (tipo === 'cliente') return item.cliente || '';
    if (tipo === 'motorista') return item.motorista || '';
    return item.prefixo || '';
}

function renderizarSugestoesConsultaMaster() {
    const lista = document.getElementById('listaConsultaMasterModal');
    const input = document.getElementById('inputConsultaMasterModal');
    if (!lista || !input) return;

    const termo = normalizarTextoConsulta(input.value);
    const mapa = new Map();

    consultaMasterCache.forEach(item => {
        const valor = (obterValorCampoConsultaMaster(item, consultaMasterTipoAtual) || '').toString().trim();
        if (!valor) return;
        const chave = normalizarTextoConsulta(valor);
        if (termo && !chave.includes(termo)) return;
        if (!mapa.has(chave)) mapa.set(chave, { texto: valor, qtd: 0 });
        mapa.get(chave).qtd++;
    });

    const opcoes = Array.from(mapa.values()).sort((a, b) => a.texto.localeCompare(b.texto)).slice(0, 80);

    if (!opcoes.length) {
        lista.innerHTML = '<div style="padding:14px; color:#64748b;">Nenhuma opção encontrada. Você ainda pode digitar e tocar em Consultar.</div>';
        return;
    }

    lista.innerHTML = opcoes.map(op => `
        <button onclick="escolherSugestaoConsultaMaster('${consultaMasterTipoAtual}', '${encodeURIComponent(op.texto)}')"
                style="width:100%; text-align:left; padding:13px 14px; border:0; border-bottom:1px solid #e2e8f0; background:white; display:flex; justify-content:space-between; gap:10px; align-items:center;">
            <span style="font-weight:900; color:#1e293b; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${op.texto}</span>
            <span style="font-size:12px; color:#4f46e5; background:#eef2ff; padding:4px 7px; border-radius:999px; white-space:nowrap;">${op.qtd} reg.</span>
        </button>`).join('');
}

function escolherSugestaoConsultaMaster(tipo, valorCodificado) {
    consultaMasterTipoAtual = tipo;
    const valor = decodeURIComponent(valorCodificado);
    const input = document.getElementById('inputConsultaMasterModal');
    if (input) input.value = valor;
    executarConsultaMaster(tipo, valor);
}

function executarConsultaMasterPeloModal() {
    const input = document.getElementById('inputConsultaMasterModal');
    const termo = input ? input.value : '';
    executarConsultaMaster(consultaMasterTipoAtual, termo);
}

async function executarConsultaMaster(tipoConsulta, termoDigitado) {
    if (!termoDigitado || !termoDigitado.trim()) return;

    const termo = normalizarTextoConsulta(termoDigitado);
    const box = garantirBoxResultadoConsultaMaster();
    box.style.display = 'block';
    box.innerHTML = '<div style="font-weight:800; color:#4f46e5;">🔎 Consultando...</div>';
    fecharModalConsultaMaster();

    try {
        const base = consultaMasterCache.length ? consultaMasterCache : await carregarBaseConsultaMaster();
        consultaMasterCache = base;
        let resultados = [];
        let titulo = '';

        if (tipoConsulta === 'cliente') {
            titulo = `Cliente: ${termoDigitado}`;
            resultados = base.filter(r => normalizarTextoConsulta(r.cliente).includes(termo));
        } else if (tipoConsulta === 'motorista') {
            titulo = `Motorista: ${termoDigitado}`;
            resultados = base.filter(r => normalizarTextoConsulta(r.motorista).includes(termo));
        } else if (tipoConsulta === 'prefixo') {
            titulo = `Prefixo: ${termoDigitado}`;
            resultados = base.filter(r => normalizarTextoConsulta(r.prefixo).includes(termo));
        } else {
            box.innerHTML = '<b style="color:#ef4444;">Tipo de consulta inválido.</b>';
            return;
        }

        let totalCorridas = 0;
        let totalEmprestado = 0;
        let totalComJuros = 0;
        resultados.forEach(r => {
            const corrida = parseFloat(r.corrida) || 0;
            const emprestado = parseFloat(r.emprestado) || 0;
            totalCorridas += corrida;
            totalEmprestado += emprestado;
            totalComJuros += corrida + emprestado + (emprestado * 0.20);
        });

        if (!resultados.length) {
            box.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:8px;">
                    <div style="font-weight:800; color:#4f46e5;">🔎 ${titulo}</div>
                    <button onclick="abrirModalConsultaMaster()" style="padding:6px 10px; background:#4f46e5; color:white; border-radius:8px;">Nova consulta</button>
                </div>
                <div style="background:#fff7ed; border:1px solid #fed7aa; color:#9a3412; padding:10px; border-radius:10px;">
                    Nenhum registro encontrado para esta consulta.
                </div>`;
            return;
        }

        box.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; margin-bottom:10px;">
                <div style="font-weight:900; color:#4f46e5;">🔎 ${titulo}</div>
                <div style="display:flex; gap:6px;">
                    <button onclick="abrirModalConsultaMaster()" style="padding:6px 10px; background:#4f46e5; color:white; border-radius:8px;">Nova</button>
                    <button onclick="document.getElementById('resultadoConsultaMaster').style.display='none'" style="padding:6px 10px; background:#e2e8f0; color:#334155; border-radius:8px;">Fechar</button>
                </div>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:10px;">
                <div style="background:#eef2ff; padding:10px; border-radius:10px;"><b>${resultados.length}</b><br><span style="font-size:12px;">registros</span></div>
                <div style="background:#ecfdf5; padding:10px; border-radius:10px;"><b>${formatarMoeda(totalComJuros)}</b><br><span style="font-size:12px;">total geral</span></div>
                <div style="background:#f8fafc; padding:10px; border-radius:10px;"><b>${formatarMoeda(totalCorridas)}</b><br><span style="font-size:12px;">corridas</span></div>
                <div style="background:#f8fafc; padding:10px; border-radius:10px;"><b>${formatarMoeda(totalEmprestado)}</b><br><span style="font-size:12px;">empréstimos</span></div>
            </div>
            <div style="max-height:360px; overflow:auto; padding-right:2px;">
                ${resultados.map(montarLinhaResultadoConsulta).join('')}
            </div>`;
    } catch (err) {
        box.innerHTML = `<b style="color:#ef4444;">Erro na consulta:</b><br>${err.message}`;
    }
}

async function consultarMasterAvancado() {
    abrirModalConsultaMaster();
}

const _originalInit = inicializarMotorista;
inicializarMotorista = function() {
    _originalInit();
    carregarPagamentos();
};

window.registrarPagamento = registrarPagamento;
window.cancelarFechamento = cancelarFechamento;
window.consultarMasterAvancado = consultarMasterAvancado;
window.abrirModalConsultaMaster = abrirModalConsultaMaster;
window.fecharModalConsultaMaster = fecharModalConsultaMaster;
window.selecionarTipoConsultaMaster = selecionarTipoConsultaMaster;
window.renderizarSugestoesConsultaMaster = renderizarSugestoesConsultaMaster;
window.escolherSugestaoConsultaMaster = escolherSugestaoConsultaMaster;
window.executarConsultaMasterPeloModal = executarConsultaMasterPeloModal;

window.onload = () => { 
    checarLicenciamento(); 
};


// Fecha o modal de motorista ao tocar fora da caixa
document.addEventListener('click', function(e) {
    const modal = document.getElementById('modalCadastroMotorista');
    if (modal && modal.style.display === 'flex' && e.target === modal) {
        fecharModalCadastroMotorista();
    }
});

// ==================== BACKUP / RESTAURAÇÃO + EXPORTAÇÃO DRIVER FLUX ====================

function timestampArquivoDriverFlux() {
    const d = new Date();
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function montarHtmlExportacaoDriverFlux(titulo, conteudoHtml, textoFallback) {
    const estilos = Array.from(document.querySelectorAll('style'))
        .map(style => style.innerHTML)
        .join('\n');

    const corpo = conteudoHtml && conteudoHtml.trim()
        ? conteudoHtml
        : `<pre>${(textoFallback || '').replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</pre>`;

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${titulo || 'Driver Flux'}</title>
<style>
${estilos}
body { background:#ffffff !important; padding:16px !important; font-family:Arial, sans-serif; color:#111827; }
.driverflux-export-header { border-bottom:2px solid #111827; margin-bottom:16px; padding-bottom:10px; }
.driverflux-export-header h1 { margin:0; font-size:22px; }
.driverflux-export-header small { color:#475569; }
button, .no-print { display:none !important; }
@media print { body { margin:0; padding:8px !important; } }
</style>
</head>
<body>
<div class="driverflux-export-header">
<h1>${titulo || 'Driver Flux'}</h1>
<small>Gerado em ${new Date().toLocaleString('pt-BR')}</small>
</div>
${corpo}
</body>
</html>`;
}

function montarHtmlRelatorioParaImpressaoSeguroDriverFlux(idOutput, titulo) {
    const output = document.getElementById(idOutput);
    const texto = (output?.innerText || '').trim();
    if (!output || (!output.innerHTML.trim() && !texto)) return '';
    return montarHtmlExportacaoDriverFlux(titulo || 'Relatório Driver Flux', output.innerHTML, texto);
}

function pedirPermissaoArquivosDriverFlux() {
    return new Promise(resolve => {
        if (!window.cordova || !window.cordova.plugins || !cordova.plugins.permissions) {
            resolve(true);
            return;
        }

        const permissions = cordova.plugins.permissions;
        const lista = [];
        if (permissions.WRITE_EXTERNAL_STORAGE) lista.push(permissions.WRITE_EXTERNAL_STORAGE);
        if (permissions.READ_EXTERNAL_STORAGE) lista.push(permissions.READ_EXTERNAL_STORAGE);
        if (!lista.length) {
            resolve(true);
            return;
        }

        permissions.checkPermission(lista[0], status => {
            if (status && status.hasPermission) {
                resolve(true);
                return;
            }
            permissions.requestPermissions(lista, st => resolve(!!(st && st.hasPermission)), () => resolve(false));
        }, () => {
            permissions.requestPermissions(lista, st => resolve(!!(st && st.hasPermission)), () => resolve(false));
        });
    });
}

function salvarBlobEmDownloadsDriverFlux(blob, nomeArquivo) {
    return new Promise(async (resolve, reject) => {
        if (!window.cordova || !window.resolveLocalFileSystemURL || !window.cordova.file) {
            reject(new Error('Cordova File não disponível. Recompile o APK com cordova-plugin-file.'));
            return;
        }

        const permitido = await pedirPermissaoArquivosDriverFlux();
        if (!permitido) {
            reject(new Error('Permissão para salvar arquivos negada pelo Android.'));
            return;
        }

        const candidatos = [
            (cordova.file.externalRootDirectory || '') + 'Download/',
            (cordova.file.externalRootDirectory || '') + 'Downloads/',
            cordova.file.externalDataDirectory || '',
            cordova.file.dataDirectory || ''
        ].filter(Boolean);

        let ultimoErro = null;

        const tentarPasta = index => {
            if (index >= candidatos.length) {
                reject(ultimoErro || new Error('Nenhuma pasta disponível para salvar.'));
                return;
            }

            const pasta = candidatos[index];
            window.resolveLocalFileSystemURL(pasta, dirEntry => {
                dirEntry.getFile(nomeArquivo, { create: true, exclusive: false }, fileEntry => {
                    fileEntry.createWriter(fileWriter => {
                        fileWriter.onwriteend = () => resolve({
                            pasta,
                            nomeArquivo,
                            nativeURL: fileEntry.nativeURL,
                            cdvURL: fileEntry.toURL(),
                            caminhoVisivel: pasta.includes('/Download') || pasta.includes('/Downloads')
                                ? 'Downloads/' + nomeArquivo
                                : nomeArquivo
                        });
                        fileWriter.onerror = err => {
                            ultimoErro = err;
                            tentarPasta(index + 1);
                        };
                        fileWriter.write(blob);
                    }, err => {
                        ultimoErro = err;
                        tentarPasta(index + 1);
                    });
                }, err => {
                    ultimoErro = err;
                    tentarPasta(index + 1);
                });
            }, err => {
                ultimoErro = err;
                tentarPasta(index + 1);
            });
        };

        tentarPasta(0);
    });
}

function salvarBlobNavegadorDriverFlux(blob, nomeArquivo) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
}

async function salvarArquivoDriverFlux(blob, nomeArquivo, titulo, textoFallback) {
    try {
        const info = await salvarBlobEmDownloadsDriverFlux(blob, nomeArquivo);
        alert('✅ ' + (titulo || 'Arquivo') + ' salvo com sucesso.\n\nArquivo:\n' + nomeArquivo + '\n\nLocal provável:\n' + info.caminhoVisivel);
        return true;
    } catch (erroCordova) {
        console.warn('Falha ao salvar via Cordova:', erroCordova);
    }

    try {
        salvarBlobNavegadorDriverFlux(blob, nomeArquivo);
        alert('✅ Arquivo gerado: ' + nomeArquivo + '\n\nSe estiver no navegador, procure em Downloads.');
        return true;
    } catch (erroDownload) {
        console.warn('Falha no download via navegador:', erroDownload);
    }

    if (textoFallback) {
        await copiarTextoDriverFlux(textoFallback, 'Não consegui salvar o arquivo, mas copiei o conteúdo em texto.');
    }
    alert('❌ Não consegui salvar o arquivo neste aparelho. Verifique permissões de arquivos do Driver Flux.');
    return false;
}

async function salvarRelatorioComoArquivo() {
    const output = document.getElementById('reportOutput');
    const texto = (output?.innerText || '').trim();
    if (!texto) return alert('Gere o relatório antes de salvar.');

    const nome = 'DriverFlux_Relatorio_' + timestampArquivoDriverFlux() + '.html';
    const html = montarHtmlRelatorioParaImpressaoSeguroDriverFlux('reportOutput', 'Relatório Driver Flux');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

    await salvarArquivoDriverFlux(blob, nome, 'Relatório Driver Flux', texto);
}

async function salvarRelatorioDespesasPDF() {
    const output = document.getElementById('reportDespesasOutput');
    const texto = (output?.innerText || '').trim();
    if (!texto) return alert('Gere o relatório de despesas antes de salvar.');

    const nome = 'DriverFlux_Relatorio_Despesas_' + timestampArquivoDriverFlux() + '.html';
    const html = montarHtmlRelatorioParaImpressaoSeguroDriverFlux('reportDespesasOutput', 'Relatório de Despesas Driver Flux');
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });

    await salvarArquivoDriverFlux(blob, nome, 'Relatório de Despesas Driver Flux', texto);
}

function montarLocalStorageBackupDriverFlux() {
    const dados = {};
    for (let i = 0; i < localStorage.length; i++) {
        const chave = localStorage.key(i);
        if (chave && chave.startsWith('driverflux_')) dados[chave] = localStorage.getItem(chave);
    }
    return dados;
}

async function coletarFirebaseBackupDriverFlux() {
    if (localStorage.getItem('driverflux_modo_demo') === 'true' || !db) return null;
    iniciarFirebaseSeNecessario();
    const paths = ['usuarios', 'turnos_operacionais', 'corridas_por_turno', 'pagamentos', 'despesas_por_turno'];
    const out = {};
    for (const path of paths) {
        try {
            const snap = await db.ref(path).once('value');
            out[path] = snap.val() || null;
        } catch (e) {
            out[path] = { erro: e.message || String(e) };
        }
    }
    return out;
}

async function fazerBackupDriverFlux() {
    const backup = {
        app: 'Driver Flux',
        produto: 'Driver Flux',
        versaoBackup: 3,
        geradoEm: new Date().toISOString(),
        usuario: usuarioLogado || localStorage.getItem('driverflux_usuario_logado') || 'nao informado',
        turnoAtivo: idTurnoAtivo || '',
        metadadosTurno: metadadosTurno || {},
        localStorage: montarLocalStorageBackupDriverFlux(),
        dadosAtuais: { registros, pagamentos, despesasTurno, motoristasCadastroMaster },
        firebase: await coletarFirebaseBackupDriverFlux()
    };

    const json = JSON.stringify(backup, null, 2);
    const nome = 'DriverFlux_Backup_' + timestampArquivoDriverFlux() + '.json';
    const blob = new Blob([json], { type: 'application/json;charset=utf-8' });

    await salvarArquivoDriverFlux(blob, nome, 'Backup Driver Flux', json);
}

function abrirImportarBackupDriverFlux() {
    const input = document.getElementById('inputBackupDriverFlux');
    if (!input) return alert('Campo de importação de backup não encontrado nesta tela.');
    input.value = '';
    input.click();
}

function restaurarBackupDriverFlux(event) {
    const arq = event?.target?.files?.[0];
    if (!arq) return;
    const reader = new FileReader();
    reader.onload = async function() {
        try {
            const backup = JSON.parse(reader.result);
            const ehDriverFlux = (backup.app || '').toString().toLowerCase().includes('driver') ||
                                 (backup.produto || '').toString().toLowerCase().includes('driver') ||
                                 (backup.app || '').toString().toLowerCase().includes('conta');
            if (!ehDriverFlux) {
                if (!confirm('Este arquivo não parece ser um backup Driver Flux. Deseja tentar restaurar mesmo assim?')) return;
            }
            if (!confirm('Restaurar backup? Isso pode substituir dados locais do aplicativo neste aparelho.')) return;

            if (backup.localStorage && typeof backup.localStorage === 'object') {
                Object.keys(backup.localStorage).forEach(chave => {
                    if (chave.startsWith('driverflux_')) localStorage.setItem(chave, backup.localStorage[chave]);
                });
            }

            if (backup.firebase && db && confirm('Também restaurar dados na nuvem Firebase? Use apenas se tiver certeza.')) {
                const paths = ['usuarios', 'turnos_operacionais', 'corridas_por_turno', 'pagamentos', 'despesas_por_turno'];
                for (const path of paths) {
                    if (backup.firebase[path] && !backup.firebase[path].erro) await db.ref(path).set(backup.firebase[path]);
                }
            }

            alert('✅ Backup restaurado. O aplicativo será recarregado.');
            location.reload();
        } catch (e) {
            alert('❌ Não consegui ler este backup: ' + (e.message || e));
        }
    };
    reader.readAsText(arq);
}

/* ============================================================
   Driver Flux - PDF real com jsPDF + salvamento Cordova
   Esta seção fica no fim do arquivo para sobrescrever rotinas antigas
   de HTML imprimível / PDF manual.
============================================================ */
function dfTextoLimpoParaPdf(valor) {
    return String(valor || '')
        .replace(/\u00a0/g, ' ')
        .replace(/[\t ]+/g, ' ')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
}

function dfCriarPdfBlobDriverFlux(titulo, texto) {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        throw new Error('Biblioteca jsPDF não carregada. Verifique o index.html.');
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'pt', format: 'a4' });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const margem = 36;
    const larguraTexto = pageW - margem * 2;
    let y = 42;

    function novaPaginaSePreciso(alturaLinha) {
        if (y + alturaLinha > pageH - 38) {
            doc.addPage();
            y = 42;
        }
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(String(titulo || 'Driver Flux'), margem, y);
    y += 18;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text('Gerado em: ' + new Date().toLocaleString('pt-BR'), margem, y);
    y += 20;

    doc.setFontSize(10);
    const linhas = doc.splitTextToSize(dfTextoLimpoParaPdf(texto || ''), larguraTexto);
    linhas.forEach(linha => {
        novaPaginaSePreciso(13);
        doc.text(linha || ' ', margem, y);
        y += 13;
    });

    return doc.output('blob');
}

function dfResolverPastaCordovaDriverFlux() {
    return new Promise((resolve, reject) => {
        if (!window.cordova || !window.resolveLocalFileSystemURL || !window.cordova.file) {
            reject(new Error('cordova-plugin-file não está disponível neste APK.'));
            return;
        }
        const candidatos = [
            cordova.file.dataDirectory,
            cordova.file.externalDataDirectory,
            (cordova.file.externalRootDirectory || '') + 'Download/',
            (cordova.file.externalRootDirectory || '') + 'Downloads/'
        ].filter(Boolean);
        let ultimoErro = null;
        const tentar = (i) => {
            if (i >= candidatos.length) return reject(ultimoErro || new Error('Nenhuma pasta Cordova disponível.'));
            window.resolveLocalFileSystemURL(candidatos[i], dir => resolve({ dir, pasta: candidatos[i] }), err => {
                ultimoErro = err;
                tentar(i + 1);
            });
        };
        tentar(0);
    });
}

function salvarBlobEmDownloadsDriverFlux(blob, nomeArquivo) {
    return new Promise(async (resolve, reject) => {
        try {
            const { dir, pasta } = await dfResolverPastaCordovaDriverFlux();
            dir.getFile(nomeArquivo, { create: true, exclusive: false }, fileEntry => {
                fileEntry.createWriter(writer => {
                    writer.onwriteend = () => resolve({
                        pasta,
                        nomeArquivo,
                        nativeURL: fileEntry.nativeURL || fileEntry.toURL(),
                        cdvURL: fileEntry.toURL(),
                        caminhoVisivel: pasta.indexOf('/Download') >= 0 ? 'Downloads/' + nomeArquivo : 'área interna do Driver Flux/' + nomeArquivo
                    });
                    writer.onerror = err => reject(err || new Error('Erro ao escrever arquivo.'));
                    writer.write(blob);
                }, reject);
            }, reject);
        } catch (e) {
            reject(e);
        }
    });
}

async function salvarArquivoDriverFlux(blob, nomeArquivo, titulo, textoFallback) {
    let info = null;
    try {
        info = await salvarBlobEmDownloadsDriverFlux(blob, nomeArquivo);
    } catch (e) {
        console.warn('Falha ao salvar via Cordova File:', e);
    }

    if (info && window.plugins && window.plugins.socialsharing) {
        try {
            await new Promise((resolve, reject) => {
                window.plugins.socialsharing.shareWithOptions({
                    subject: titulo || 'Driver Flux',
                    message: titulo || 'Arquivo Driver Flux',
                    files: [info.nativeURL || info.cdvURL]
                }, resolve, reject);
            });
            alert('✅ Arquivo criado e enviado para o compartilhamento do Android.\n\n' + nomeArquivo);
            return true;
        } catch (e) {
            console.warn('Arquivo salvo, mas compartilhamento falhou:', e);
            alert('✅ Arquivo salvo.\n\n' + nomeArquivo + '\n\nLocal: ' + info.caminhoVisivel);
            return true;
        }
    }

    if (info) {
        alert('✅ Arquivo salvo.\n\n' + nomeArquivo + '\n\nLocal: ' + info.caminhoVisivel);
        return true;
    }

    try {
        salvarBlobNavegadorDriverFlux(blob, nomeArquivo);
        alert('✅ Arquivo gerado: ' + nomeArquivo + '\n\nSe estiver no navegador, procure em Downloads.');
        return true;
    } catch (e) {
        console.warn('Fallback navegador falhou:', e);
    }

    if (textoFallback) await copiarTextoDriverFlux(textoFallback, 'Não consegui salvar, mas copiei o conteúdo para a área de transferência.');
    alert('❌ Não consegui salvar este arquivo neste aparelho.');
    return false;
}

async function salvarRelatorioComoArquivo() {
    const output = document.getElementById('reportOutput');
    const texto = dfTextoLimpoParaPdf(output?.innerText || '');
    if (!texto) return alert('Gere o relatório antes de salvar.');

    try {
        const blob = dfCriarPdfBlobDriverFlux('Relatório Driver Flux', texto);
        const nome = 'DriverFlux_Relatorio_' + timestampArquivoDriverFlux() + '.pdf';
        await salvarArquivoDriverFlux(blob, nome, 'Relatório Driver Flux', texto);
    } catch (e) {
        alert('❌ Erro ao gerar PDF: ' + (e.message || e));
    }
}

async function salvarRelatorioDespesasPDF() {
    const output = document.getElementById('reportDespesasOutput');
    const texto = dfTextoLimpoParaPdf(output?.innerText || '');
    if (!texto) return alert('Gere o relatório de despesas antes de salvar.');

    try {
        const blob = dfCriarPdfBlobDriverFlux('Relatório de Despesas - Driver Flux', texto);
        const nome = 'DriverFlux_Relatorio_Despesas_' + timestampArquivoDriverFlux() + '.pdf';
        await salvarArquivoDriverFlux(blob, nome, 'Relatório de Despesas Driver Flux', texto);
    } catch (e) {
        alert('❌ Erro ao gerar PDF de despesas: ' + (e.message || e));
    }
}

async function imprimirRelatorioPDF() {
    // No Android WebView, window.print costuma falhar. Aqui geramos PDF real.
    await salvarRelatorioComoArquivo();
}


// ===== FIM DO APP.JS - Módulos externos carregados via index.html =====
