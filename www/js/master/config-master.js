/**
 * Módulo: Configuração do Master (Obrigatória no primeiro acesso)
 * DriverFlux - Sistema de Gestão de Táxi
 * 
 * Regras:
 * - Não permite fechar a tela enquanto não existir pelo menos 1 ponto cadastrado
 * - Botões de Prefixo e Motorista ficam desabilitados visualmente até existir ponto
 * - Funciona tanto no primeiro acesso quanto para reconfiguração posterior
 */

const ConfigMaster = {

    modalId: 'modalConfigMaster',

    /**
     * Abre a tela de configuração do Master.
     * Se não tiver ponto, força o usuário a criar um.
     */
    abrir() {
        const temPonto = !!localStorage.getItem('driverflux_ponto_id');

        // Remove modal anterior se existir
        const anterior = document.getElementById(this.modalId);
        if (anterior) anterior.remove();

        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.style.cssText = 'position:fixed; inset:0; background:rgba(15,23,42,0.94); z-index:99999; display:flex; align-items:center; justify-content:center; padding:16px;';

        modal.innerHTML = this._criarHTML(temPonto);
        document.body.appendChild(modal);

        this._atualizarListaPontos();
        this._configurarEventos();
    },

    _criarHTML(temPonto) {
        return `
            <div style="background:white; width:100%; max-width:540px; border-radius:20px; box-shadow:0 25px 70px rgba(0,0,0,0.45); overflow:hidden; max-height:94vh; display:flex; flex-direction:column;">
                
                <!-- Header -->
                <div style="background:linear-gradient(135deg,#1e293b,#334155); color:white; padding:20px;">
                    <div style="display:flex; align-items:center; gap:14px;">
                        <div style="font-size:32px;">⚙️</div>
                        <div>
                            <div style="font-size:22px; font-weight:900;">Configuração do Master</div>
                            <div style="font-size:13px; opacity:0.85;">${temPonto ? 'DriverFlux • Configuração' : 'PRIMEIRO ACESSO — OBRIGATÓRIO'}</div>
                        </div>
                    </div>
                </div>

                <div style="padding:22px; overflow-y:auto; flex:1;">

                    ${!temPonto ? `
                    <div style="background:#fef2f2; border:2px solid #ef4444; color:#991b1b; padding:14px 16px; border-radius:14px; margin-bottom:22px; font-weight:700; line-height:1.4;">
                        ⚠️ Esta configuração é <strong>OBRIGATÓRIA</strong>.<br>
                        Você <strong>não poderá sair</strong> desta tela enquanto não cadastrar pelo menos <strong>um ponto</strong>.
                    </div>` : ''}

                    <!-- 1. SENHA DO MASTER -->
                    <div style="margin-bottom:26px;">
                        <div style="font-weight:800; font-size:15px; margin-bottom:8px; color:#1e293b;">🔐 Senha do Master</div>
                        <div style="display:flex; gap:8px;">
                            <input id="configMasterSenha" type="password" placeholder="Nova senha (mínimo 4 caracteres)" 
                                   style="flex:1; padding:13px; border:2px solid #e2e8f0; border-radius:12px; font-size:15px;">
                            <button id="btnSalvarSenhaMaster" 
                                    style="padding:13px 22px; background:#1e293b; color:white; border:none; border-radius:12px; font-weight:800; white-space:nowrap;">
                                Salvar
                            </button>
                        </div>
                    </div>

                    <!-- 2. PONTOS -->
                    <div style="margin-bottom:26px;">
                        <div style="font-weight:800; font-size:15px; margin-bottom:8px; color:#1e293b;">📍 Pontos do Sistema</div>
                        <div id="listaPontosConfig" style="margin-bottom:12px; min-height:48px;"></div>
                        
                        <div style="display:flex; gap:8px;">
                            <input id="inputNovoPonto" type="text" placeholder="Nome do ponto (ex: Centro, Aeroporto...)" 
                                   style="flex:1; padding:13px; border:2px solid #e2e8f0; border-radius:12px; font-size:15px;">
                            <button id="btnCriarPonto" 
                                    style="padding:13px 24px; background:#16a34a; color:white; border:none; border-radius:12px; font-weight:900; white-space:nowrap;">
                                + Criar Ponto
                            </button>
                        </div>
                        <div style="font-size:12px; color:#64748b; margin-top:6px;">Obrigatório ter pelo menos 1 ponto cadastrado.</div>
                    </div>

                    <!-- 3. PREFIXOS / CARROS -->
                    <div style="margin-bottom:26px; opacity: ${temPonto ? '1' : '0.45'};">
                        <div style="font-weight:800; font-size:15px; margin-bottom:8px; color:#1e293b;">🚖 Prefixos / Carros</div>
                        <button id="btnCadastrarPrefixo" ${!temPonto ? 'disabled' : ''} 
                                style="width:100%; padding:14px; background:${temPonto ? '#2563eb' : '#94a3b8'}; color:white; border:none; border-radius:12px; font-weight:800; font-size:15px;">
                            + Cadastrar Prefixo / Carro
                        </button>
                        <div id="listaPrefixosConfig" style="margin-top:10px; font-size:13px; color:#475569;"></div>
                    </div>

                    <!-- 4. MOTORISTAS -->
                    <div style="margin-bottom:8px; opacity: ${temPonto ? '1' : '0.45'};">
                        <div style="font-weight:800; font-size:15px; margin-bottom:8px; color:#1e293b;">👤 Motoristas</div>
                        <button id="btnCadastrarMotorista" ${!temPonto ? 'disabled' : ''} 
                                style="width:100%; padding:14px; background:${temPonto ? '#7c3aed' : '#94a3b8'}; color:white; border:none; border-radius:12px; font-weight:800; font-size:15px;">
                            + Cadastrar Novo Motorista
                        </button>
                    </div>

                </div>

                <!-- Footer -->
                <div style="padding:16px 20px; border-top:1px solid #e2e8f0; background:#f8fafc; display:flex; gap:10px;">
                    <button id="btnFecharConfigMaster" 
                            style="flex:1; padding:15px; background:#e2e8f0; color:#334155; border:none; border-radius:12px; font-weight:800;">
                        ${temPonto ? 'Fechar' : 'Não posso fechar ainda'}
                    </button>
                    
                    ${temPonto ? `
                    <button id="btnConcluirConfigMaster" 
                            style="flex:1; padding:15px; background:#16a34a; color:white; border:none; border-radius:12px; font-weight:900;">
                        ✅ Concluir Configuração
                    </button>` : ''}
                </div>
            </div>
        `;
    },

    _configurarEventos() {
        const btnSenha = document.getElementById('btnSalvarSenhaMaster');
        if (btnSenha) btnSenha.onclick = () => this._salvarSenha();

        const btnPonto = document.getElementById('btnCriarPonto');
        if (btnPonto) btnPonto.onclick = () => this._criarPonto();

        const btnFechar = document.getElementById('btnFecharConfigMaster');
        if (btnFechar) btnFechar.onclick = () => this._tentarFechar();

        const btnConcluir = document.getElementById('btnConcluirConfigMaster');
        if (btnConcluir) btnConcluir.onclick = () => this._concluir();

        const btnPrefixo = document.getElementById('btnCadastrarPrefixo');
        if (btnPrefixo && !btnPrefixo.disabled) {
            btnPrefixo.onclick = () => this._cadastrarPrefixo();
        }

        const btnMotorista = document.getElementById('btnCadastrarMotorista');
        if (btnMotorista && !btnMotorista.disabled) {
            btnMotorista.onclick = () => {
                if (typeof cadastrarNovoMotoristaMaster === 'function') {
                    cadastrarNovoMotoristaMaster();
                } else {
                    alert('Função de cadastro de motorista ainda não foi modularizada.');
                }
            };
        }
    },

    _atualizarListaPontos() {
        const container = document.getElementById('listaPontosConfig');
        if (!container) return;

        const pontoId = localStorage.getItem('driverflux_ponto_id');
        const nome = localStorage.getItem('driverflux_ponto_nome') || 'Sem nome';

        if (pontoId) {
            container.innerHTML = `
                <div style="background:#ecfdf5; border:2px solid #10b981; padding:13px 15px; border-radius:12px; font-weight:700; color:#065f46;">
                    ✅ Ponto ativo: <strong>${nome}</strong><br>
                    <span style="font-size:12px; font-weight:500;">ID: ${pontoId}</span>
                </div>
            `;
        } else {
            container.innerHTML = `<div style="color:#64748b; font-size:13px; padding:8px 4px;">Nenhum ponto cadastrado ainda.</div>`;
        }
    },

    async _salvarSenha() {
        const input = document.getElementById('configMasterSenha');
        const novaSenha = (input?.value || '').trim();

        if (!novaSenha || novaSenha.length < 4) {
            alert('A senha precisa ter no mínimo 4 caracteres.');
            return;
        }

        try {
            if (db) {
                await db.ref('usuarios/master').update({ 
                    senha: novaSenha, 
                    primeiroLoginMaster: false 
                });
            }
            alert('✅ Senha alterada com sucesso!');
            if (input) input.value = '';
        } catch (e) {
            alert('Erro ao salvar senha: ' + e.message);
        }
    },

    _criarPonto() {
        const input = document.getElementById('inputNovoPonto');
        const nome = (input?.value || '').trim();

        if (!nome) {
            alert('Digite o nome do ponto (ex: Centro, Aeroporto...).');
            return;
        }

        const pontoId = 'PONTO-' + Date.now().toString().slice(-6);

        localStorage.setItem('driverflux_ponto_id', pontoId);
        localStorage.setItem('driverflux_ponto_nome', nome);

        if (db) {
            db.ref('pontos/' + pontoId).set({
                nome: nome,
                criadoEm: new Date().toISOString(),
                criadoPor: 'master',
                ativo: true
            });
            db.ref('usuarios/master').update({ pontoId: pontoId });
        }

        alert(`✅ Ponto "${nome}" criado com sucesso!`);

        setTimeout(() => {
            const modal = document.getElementById(this.modalId);
            if (modal) modal.remove();
            this.abrir();
        }, 500);
    },

    _tentarFechar() {
        const temPonto = !!localStorage.getItem('driverflux_ponto_id');

        if (!temPonto) {
            alert('⚠️ Você precisa cadastrar pelo menos UM PONTO antes de continuar.\n\nIsso é obrigatório para o funcionamento do sistema.');
            return;
        }

        const modal = document.getElementById(this.modalId);
        if (modal) modal.remove();
    },

    _concluir() {
        const modal = document.getElementById(this.modalId);
        if (modal) modal.remove();

        if (db && usuarioLogado === 'master') {
            db.ref('usuarios/master').update({
                primeiroLoginMaster: false,
                configuracaoConcluida: true,
                pontoId: localStorage.getItem('driverflux_ponto_id')
            });
        }

        alert('✅ Configuração concluída com sucesso!');
        
        if (typeof verificarSessaoLogin === 'function') {
            verificarSessaoLogin();
        }
    },

    _cadastrarPrefixo() {
        const prefixo = prompt('Digite o prefixo ou placa do carro:');
        if (!prefixo) return;

        const arr = JSON.parse(localStorage.getItem('driverflux_prefixos') || '[]');
        arr.push({
            pontoId: localStorage.getItem('driverflux_ponto_id'),
            prefixo: prefixo.toUpperCase(),
            criadoEm: new Date().toISOString()
        });
        localStorage.setItem('driverflux_prefixos', JSON.stringify(arr));

        alert('✅ Prefixo cadastrado com sucesso!');
    }
};

// Expõe globalmente
window.ConfigMaster = ConfigMaster;
