# DriverFlux

**Sistema de Gestão de Corridas e Frota de Táxi** para Android (Cordova + Firebase).

Aplicativo profissional para motoristas de táxi e donos de frota, com controle completo de turnos, corridas (dinheiro e crédito/fiado), amortização com juros, GPS, recibos via WhatsApp, relatórios em PDF e backup.

---

## 📁 Estrutura do Projeto (Atual × Planejada)

O DriverFlux está em processo de **modularização gradual**. 

Atualmente a maior parte da lógica de negócio ainda está concentrada no arquivo `app.js`. Estamos extraindo módulos por domínio de responsabilidade para facilitar manutenção, testes e evolução do código a longo prazo.

### Estrutura Atual (o que realmente existe hoje)

```
Conta-tx-main/
├── www/
│   ├── index.html
│   ├── js/
│   │   ├── app.js                    # Orquestrador principal (ainda concentra grande parte da lógica)
│   │   ├── geolocation.js            # Módulo de GPS + geocodificação reversa (Nominatim)
│   │   ├── pdf-driverflux-fallback.js
│   │   │
│   │   └── master/
│   │       └── config-master.js      # ✅ Módulo já extraído - Configuração obrigatória do Master
│   │
│   └── css/
│
├── app/                              # Código nativo Android (Cordova)
├── config.xml
├── package.json
└── .github/workflows/                # Build do APK assinado via GitHub Actions
```

### Estrutura Alvo (Planejada)

Estamos migrando para a seguinte organização por domínio:

```
www/js/
├── core/                    # Utilitários compartilhados (formatters, storage helpers, constants)
├── auth/                    # Login, ativação, primeiro acesso e troca de senha
├── master/                  # Tudo relacionado ao perfil Master
│   ├── config-master.js     # Já implementado (configuração obrigatória + pontos)
│   ├── master-panel.js      # (futuro)
│   └── consulta.js          # (futuro)
├── turno/                   # Abertura, regras e fechamento de turno
├── corridas/                # Lançamento de corridas + emissão de recibos
├── relatorios/              # Geração de relatórios + PDF (jsPDF)
├── motoristas/              # Cadastro e gestão de motoristas
└── app.js                   # Orquestrador leve (só inicializa Firebase e delega para os módulos)
```

### Filosofia de Desenvolvimento

- Cada pasta representa um **domínio de negócio** claro e coeso.
- Cada módulo expõe uma interface simples e bem definida (ex: `ConfigMaster.abrir()`).
- O `app.js` deve ficar progressivamente menor, atuando apenas como orquestrador.
- Isso facilita manutenção, testes unitários e onboarding de novos desenvolvedores.

> **Status atual da modularização**: Apenas o módulo `master/config-master.js` foi extraído com sucesso. O restante da lógica continua sendo gradualmente migrado do `app.js` original.

---

---

## 🚀 Como Rodar / Compilar

### Desenvolvimento (navegador)

```bash
cordova prepare
cordova run browser
```

### Build APK Release (assinado)

O projeto usa GitHub Actions. Basta fazer push na branch `main` ou `master` que o workflow compila automaticamente o APK assinado.

Ou localmente:

```bash
cordova build android --release
```

---

## ✨ Funcionalidades Principais

- **Turnos operacionais** com hodômetro inicial/final
- **Corridas normais** (dinheiro) e **crédito/fiado** com juros de 20%
- **Amortização de dívidas** com histórico e saldo pendente
- **Recibos automáticos** via WhatsApp com GPS + endereço
- **Relatórios profissionais** em PDF (jsPDF)
- **Relatório de despesas** por prefixo
- **Backup/Restauração** completo (JSON + Firebase)
- **Modo Master** com consulta avançada (por cliente, motorista ou prefixo)
- **Cadastro de motoristas** com senha provisória automática
- **Configuração obrigatória** do Master no primeiro acesso (Pontos + Prefixos)

---

## 🔐 Fluxo de Primeiro Acesso (Master)

1. Master faz login com usuário `master` / senha `123`
2. Sistema detecta `primeiroLoginMaster = true`
3. Abre **tela obrigatória** de Configuração do Master
4. Master **deve** cadastrar pelo menos **1 Ponto**
5. Após cadastrar o ponto, libera:
   - Botão de cadastrar Prefixos/Carros
   - Botão de cadastrar Motoristas
6. Pode alterar a senha do Master
7. Ao concluir, o sistema libera o painel completo

---

## 📦 Tecnologias

- **Cordova** + Android
- **Firebase Realtime Database**
- **jsPDF** (geração de PDF real)
- **cordova-plugin-file** + **cordova-plugin-x-socialsharing**
- **Nominatim** (geocodificação reversa)

---

## 📝 Observações

- O arquivo `app.js` ainda concentra muita lógica (será gradualmente extraído para módulos).
- O objetivo é manter cada módulo com **responsabilidade única**.
- Contribuições devem seguir a estrutura de pastas por domínio.

---

**Desenvolvido para uso real em frota de táxi.**

Qualquer dúvida ou sugestão de melhoria na estrutura, é só falar!