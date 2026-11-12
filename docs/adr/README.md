# 🏛️ Architecture Decision Records (ADRs) — Frontend (`escala-elderly`)

> **Projeto:** Escala Elderly — Painel do Gerente & Gestão Inteligente de Escalas  
> **Repositório:** [`escala-elderly`](https://github.com/thomasalmeida09/escala-elderly) (Frontend SPA)  
> **Última Atualização:** 12 de Novembro de 2026

Este documento registra as **Decisões Arquiteturais (ADRs)** do **Frontend**, divididas em **2 Grupos**:

1. **Grupo 1 — Decisões Já Tomadas no Projeto (V1.0):** O que já foi implementado no repositório inicial, **o porquê (motivação)** e os **trade-offs (vantagens vs. custos/dívidas técnicas)**.
2. **Grupo 2 — Decisões de Governança, Processos e Evolução (Kickoff do Time):** Como gerenciamos tarefas, padrão de formatação de código, Continuous Integration (CI), suíte automatizada de testes, Pull Requests (PRs) e escopo das Sprints.

### 🖼️ Visualização Interativa das ADRs no PR Lens

- 🏗️ **[Canvas Arquitetura Completa & ADRs (4 Diagramas + Walkthrough)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)**
- 👶 **[Canvas ELI5 — Como o Escala Elderly Resolve uma Falta (Onboarding Visual)](https://prlens.dev/c/x2StISYcAmXvy49MhetrsQ)**

[![Arquitetura Escala Elderly — PR Lens](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog.svg)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)

---

## 📗 GRUPO 1: Decisões Já Tomadas no Frontend (`STATUS: ACEITA / IMPLEMENTADA NA V1.0`)

---

### 📌 ADR-FE-001: Arquitetura de Repositórios Separados (SPA Frontend Desacoplada da API REST)

- **Status:** `ACEITA / IMPLEMENTADA`
- **Contexto:** O sistema precisa de uma interface rica para o gestor da clínica de idosos e de uma API backend em Java.
- **Decisão:** Manter o Frontend em um repositório próprio (`escala-elderly`), comunicando-se via HTTP/JSON com o repositório `escala-elderly-backend`.
- **Por quê (Motivação):**
  - Permite que os desenvolvedores de Frontend rodem e testem a interface imediatamente com `bun run dev`, sem precisar subir o servidor Java/Gradle para validar layout e interações de tela.
- **Trade-offs (Vantagens vs. Custos Assumidos):**
  - ✅ **Vantagens:** Ciclo de desenvolvimento visual ultrarrápido; zero acoplamento de build entre Node/Bun e Gradle/JVM.
  - ⚠️ **Custos / Cuidados:** Exige manter o **Contrato JSON (`interface Cuidador`)** sincronizado com a classe `Cuidador.java` do Backend para evitar divergências de IDs e nomes de campos.

---

### 📌 ADR-FE-002: Stack Tecnológica — React 19 + TypeScript 6 + Vite 8 + Vitest 5 + Bun

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`package.json`](../../package.json), [`vite.config.ts`](../../vite.config.ts), [`vitest.config.ts`](../../vitest.config.ts), [`tsconfig.json`](../../tsconfig.json), [`tsconfig.app.json`](../../tsconfig.app.json), [`tsconfig.node.json`](../../tsconfig.node.json), [`tsconfig.test.json`](../../tsconfig.test.json) e [`bun.lock`](../../bun.lock).
- **Decisão:** Utilizar **React 19** com **TypeScript 6 estrito** (referências ortogonais separando browser puro em `tsconfig.app.json` e testes em `tsconfig.test.json`), empacotado pelo **Vite 8**, testado com **Vitest 5** e gerenciado pelo **Bun 1.4+**.
- **Por quê (Motivação):**
  - O Vite entrega _Hot Module Replacement (HMR)_ instantâneo; o TypeScript previne erros de propriedades nulas ou tipos incorretos em tempo de compilação (`tsc -b`); o Vitest 5 executa _Fitness Functions_ e testes unitários em milissegundos sem inflar o bundle de produção; e o Bun instala dependências de forma determinística (`--frozen-lockfile`).
- **Trade-offs (Vantagens vs. Custos Assumidos):**
  - ✅ **Vantagens:** Produtividade máxima, bundle enxuto, suíte subcutânea rápida e tipagem forte isolada entre navegador e Node.
  - ⚠️ **Custos / Cuidados:** Toda a equipe deve utilizar `bun install` mantendo `bun.lock` como lockfile único (`.gitignore` e `ci.yml` bloqueiam `package-lock.json`, `yarn.lock` e `pnpm-lock.yaml`).

---

### 📌 ADR-FE-003: Design System Baseado em Material UI (`@mui/material`) com Tema `"Warm Care + Tech Industrial"` e Arquivos `.styles.ts`

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/theme/theme.ts`](../../src/theme/theme.ts), [`src/App.tsx`](../../src/App.tsx), [`src/pages/Dashboard.styles.ts`](../../src/pages/Dashboard.styles.ts) e [`src/components/CardCuidador/CardCuidador.styles.ts`](../../src/components/CardCuidador/CardCuidador.styles.ts).
- **Decisão:** Adotar o **Material UI v9 (`@mui/material` + Emotion)** como biblioteca única de componentes e estilização, isolando os objetos de estilo (`sx`) em arquivos `.styles.ts` dedicados e aplicando a paleta customizada `warmCareTheme` (`#F9F8F6` Off-White, `#007A78` Verde Esmeralda e `#D97706` Âmbar de Alerta).
- **Por quê (Motivação):**
  - Transmitir acolhimento hospitalar (_Warm Care_) combinado com precisão de painel de monitoramento (_Tech Industrial_ com fonte monoespaçada `JetBrains Mono`), mantendo os arquivos `.tsx` limpos de blocos extensos de CSS.
- **Trade-offs (Vantagens vs. Custos Assumidos):**
  - ✅ **Vantagens:** Identidade visual autoral, fácil manutenção de cores via tokens do `theme.ts` e componentes `.tsx` curtos e legíveis.
  - ⚠️ **Dívida Técnica Resolvida na Issue #1:** Os arquivos e pacotes inativos do Tailwind (`tailwind.config.js`, `postcss.config.js`) e o CSS residual do template Vite foram integralmente removidos, consolidando **100% Material UI (`.styles.ts`)** + fundação `@media print` A4 limpa em `src/index.css`.

---

### 📌 ADR-FE-004: Desacoplamento de Estado e Lógica via Custom Hooks (`useCaregivers`)

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/hooks/useCaregivers.ts`](../../src/hooks/useCaregivers.ts), [`src/services/caregiverSyncController.ts`](../../src/services/caregiverSyncController.ts) e [`src/pages/Dashboard.tsx`](../../src/pages/Dashboard.tsx).
- **Decisão:** Extrair todo o gerenciamento de estado (`cuidadores`, `connectionStatus`, `pendingRemoteSync`) e mutações de negócio (`simularFaltaDoCarlos`, `alternarStatusCuidador`, `restaurarEscala`) para dentro de Custom Hooks em `src/hooks/` apoiados por serviços puros em `src/services/`, deixando os componentes em `src/pages/` e `src/components/` focados apenas em apresentação acessível.
- **Por quê (Motivação):**
  - Permite sincronizar instantaneamente o armazenamento _Local-First_ (`localStorage`) com a API Spring Boot via `useSyncExternalStore` em `useCaregivers.ts`, sem acoplar lógica de rede ou persistência aos componentes visuais.
- **Trade-offs (Vantagens vs. Custos Assumidos):**
  - ✅ **Vantagens:** Código modular, fácil de testar em `environment: 'node'` e com responsabilidade única clara.
  - ✅ **Evolução Implementada na Issue #2:** O estado agora hidrata sincronicamente em `0ms` a partir de `escala_elderly:schedule:v1` (`ADR-FE-011`), sobrevivendo ao `F5` com reconciliação resiliente contra a API REST.

---

### 📌 ADR-FE-005: Abordagem "Bottom-Up" Focada na Simulação Visual do Furo de Escala

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/components/SimuladorPainel/SimuladorPainel.tsx`](../../src/components/SimuladorPainel/SimuladorPainel.tsx) e [`src/components/CardCuidador/CardCuidador.tsx`](../../src/components/CardCuidador/CardCuidador.tsx).
- **Decisão:** Começar o produto diretamente pelo **Painel de Monitoramento do Gerente** e pela simulação em 1 clique da **"Falta de Carlos"**, sem exigir telas prévias de login ou cadastros extensos.
- **Por quê (Motivação):**
  - Validar imediatamente a dor central mapeada no Onboarding: dar visibilidade instantânea quando um cuidador falta.
- **Trade-offs (Vantagens vs. Custos Assumidos):**
  - ✅ **Vantagens:** Demonstração imediata de valor em menos de 3 segundos de uso.
  - ✅ **Evolução Implementada na Issue #7 (`ADR-FE-012`):** Ao detectar `status === 'Faltou'`, o painel agora abre imediatamente a estação de triagem `<PainelCobertura />` filtrando folguistas aptos pelo intervalo interjornada de `>= 11h` da CLT e acionando via `wa.me` em 1 clique.

---

## 📙 GRUPO 2: Decisões de Governança e Evolução do Frontend (`STATUS: ATIVAS NAS SPRINTS`)

---

### 🗳️ ADR-FE-006: Escopo do Frontend Dividido em 3 Sprints Evolutivas

- **Status:** `ACEITA / IMPLEMENTADA`
- **Pergunta:** _"Qual o escopo do projeto no Frontend?"_
- **Decisão:** Dividir a construção em **3 ondas incrementais** para garantir entregas rápidas e sem conflito de código entre os membros do time:
  1. **🟢 Sprint 1 (`sprint-1: fundacao` — Issues [#1](https://github.com/thomasalmeida09/escala-elderly/issues/1), [#2](https://github.com/thomasalmeida09/escala-elderly/issues/2) e [#9](https://github.com/thomasalmeida09/escala-elderly/issues/9)):**
     - Limpeza do CSS residual do Vite, importação das fontes `Inter` e `JetBrains Mono`, correção do typo `"DASHBOARD"`, configuração do Prettier/Vitest/CI e conexão do `useCaregivers.ts` com a API Spring Boot + persistência **Local-First (`localStorage`)**.
  2. **🔵 Sprint 2 (`sprint-2: mvp-core` — Issues [#3](https://github.com/thomasalmeida09/escala-elderly/issues/3), [#4](https://github.com/thomasalmeida09/escala-elderly/issues/4) e [#7](https://github.com/thomasalmeida09/escala-elderly/issues/7)):**
     - **Cobertura Inteligente de Falta (#7):** Sugerir quem pode cobrir o turno (folguistas com descanso $\ge 11\text{h}$ CLT) + botão de acionamento rápido via WhatsApp (`wa.me`);
     - **Importação/Exportação de Planilha CSV (#3):** Preenchimento da escala em 1 segundo e backup Local-First;
     - **Exportação da Escala em PDF A4 Vetorial (#4):** Impressão direta para o mural da enfermaria e envio no WhatsApp.
  3. **🟣 Sprint 3 (`sprint-3: evolucao` — Issues [#5](https://github.com/thomasalmeida09/escala-elderly/issues/5), [#6](https://github.com/thomasalmeida09/escala-elderly/issues/6) e [#8](https://github.com/thomasalmeida09/escala-elderly/issues/8)):**
     - Barra de KPIs e termômetro de economia financeira no topo (#8), Modo Privacidade LGPD (#6) e sincronização multiplayer em tempo real via `BroadcastChannel` + `SSE` (#5).

---

### 🗳️ ADR-FE-007: Gestão de Tarefas via GitHub Issues + GitHub Projects (Kanban Unificado)

- **Status:** `ACEITA / IMPLEMENTADA`
- **Pergunta:** _"Como vamos gerenciar as tarefas?"_
- **Decisão:** Utilizar **GitHub Issues** conectadas a um quadro único no **GitHub Projects** integrando Frontend e Backend, estruturado em 5 colunas:
  - `📋 Backlog (Sprint 2 & 3)` $\rightarrow$ `🎯 Sprint 1 (To Do)` $\rightarrow$ `🔨 In Progress` $\rightarrow$ `👀 In Review (PR)` $\rightarrow$ `✅ Done`
- **Regra Operacional:** Nenhuma funcionalidade é codada sem uma Issue associada e atribuída (`Assignee`) ao desenvolvedor responsável.

---

### 🗳️ ADR-FE-008: Padrão de Formatação de Código, Fim de Linha `LF` e Linting no Frontend

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`.prettierrc`](../../.prettierrc), [`.prettierignore`](../../.prettierignore), [`.editorconfig`](../../.editorconfig), [`.gitattributes`](../../.gitattributes) e [`eslint.config.js`](../../eslint.config.js).
- **Pergunta:** _"Qual o padrão de formatação do código?"_
- **Decisão:**
  1. **Linter:** Manter o **ESLint 10 (`eslint.config.js`)** validando regras de React Hooks, React Refresh e TypeScript em `src/`, `tests/` e arquivos `*.config.ts`.
  2. **Formatador Automático (100% do Repositório):** Adotar **Prettier 3.9+** (`bun run format` e `bun run format:check`) cobrindo código, `.github/` e `docs/` com:
     - `singleQuote: true`, `semi: true`, `tabWidth: 2`, `trailingComma: "es5"`, `printWidth: 100`.
  3. **Higiene `UTF-8` sem BOM & `LF` (`.editorconfig` + `.gitattributes`):** Padronizar `charset = utf-8` (zero BOM `0xEF 0xBB 0xBF`) e `* text=auto eol=lf` para eliminar conflitos entre Windows (`CRLF`) e Linux/macOS (`LF`).
  4. **Convenção de Pastas e Nomes:**
     - Componentes em `PascalCase` com estilos isolados (`NomeComponente.tsx` + `NomeComponente.styles.ts`);
     - Hooks em `camelCase` iniciados por `use` (`useCaregivers.ts`);
     - Módulos puros de negócio em `src/core/` ou `src/services/` e suítes automatizadas em `tests/` ou `src/**/*.test.ts`.

---

### 🗳️ ADR-FE-009: Continuous Integration (CI) Dual-Job Endurecida com GitHub Actions & Vitest 5

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`.github/workflows/ci.yml`](../../.github/workflows/ci.yml), [`vitest.config.ts`](../../vitest.config.ts) e [`tests/governanceHygiene.test.ts`](../../tests/governanceHygiene.test.ts).
- **Pergunta:** _"Como vai funcionar o Continuous Integration?"_
- **Decisão:** Executar automaticamente o workflow Dual-Job `.github/workflows/ci.yml` em todo `push` e `pull_request` para a branch `main` sobre **`ubuntu-24.04`**, com `permissions: contents: read`, `LC_ALL: C.UTF-8` e Actions Node 24 fixadas por **SHA criptográfico de 40 caracteres** (`actions/checkout` v7.0.1 e `oven-sh/setup-bun` v2.2.0 com `bun-version: '1.4.4'`):
  1. **Job 1 — `Build, Typecheck, Lint & Bundle Budget Gate` (`frontend-ci`):**
     - _Zero-Bloat & Single-Lockfile Gate_ (rejeita `lodash`, `moment`, `axios`, `classnames`, `uuid` e lockfiles concorrentes);
     - _Broken-Windows Static Audit_ (rejeita `debugger;` e blocos `catch {}` vazios em `src/` e `tests/`);
     - `bun install --frozen-lockfile`;
     - `bun run format:check` (Prettier com diagnóstico didático);
     - `bun run lint` (ESLint 10);
     - `bun run test` (**Vitest 5** executando _Fitness Functions_ de governança e suítes unitárias);
     - `bun run build` (`tsc -b && vite build`);
     - _Bundle Budget Gate_ (`gzip -n -9 -c`: máximo de `160 KiB` por chunk JS, `260 KiB` JS agregado e `25 KiB` CSS agregado).
  2. **Job 2 — `Secret, Credential & LGPD Clean-Room Hygiene Gate` (`clean-room-security`):**
     - Gate binário POSIX Anti-BOM (`0xEF 0xBB 0xBF`) e Anti-CRLF (`100% LF`);
     - Bloqueio de arquivos `.env`, chaves privadas, tokens e variáveis `VITE_*_SECRET/PASSWORD` em `src/`, `public/` e `tests/`;
     - Bloqueio Clean-Room / LGPD contra PDFs de referência embarcados, CPFs/CNPJs e e-mails fora de domínios reservados RFC 2606 (`@example.com`).
- **Trade-off:** Bloqueia deterministicamente merges com desvios de formatação, regressões de contrato, explosão de bundle ou vazamento de PII/segredos em menos de 45 segundos.

---

### 🗳️ ADR-FE-010: Governança de Branches, Commits, CODEOWNERS e Pull Requests (PRs)

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`.github/pull_request_template.md`](../../.github/pull_request_template.md), [`.github/CODEOWNERS`](../../.github/CODEOWNERS) e [`.github/ruleset-main-protection.json`](../../.github/ruleset-main-protection.json).
- **Pergunta:** _"Como vão ser os PRs?"_
- **Decisão:**
  1. **Branch `main` Protegida por Ruleset:** Proibido `push` direto e `force-push` na `main`; exigência de histórico linear (`required_linear_history`) e aprovação dos 2 _status checks_ obrigatórios do `ci.yml`.
  2. **Conventional Commits & _Fowler's Two Hats_:** Mensagens padronizadas (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `ci:`, `test:`) separando refatorações estruturais/formatação de mudanças comportamentais.
  3. **Regras de Revisão e Merge do PR:**
     - PR focado em **1 única Issue** (`Closes #Número`) preenchido segundo `.github/pull_request_template.md`;
     - Roteamento automático de revisão via `.github/CODEOWNERS` (incluindo `/.github/`, `/docs/adr/`, `/src/components/`, `/src/hooks/`, `/src/mocks/`, `/src/services/`, `/src/theme/`, `/src/types/` e `/tests/`);
     - **CI 100% Verde** + **1 Code Review aprovado** com resolução de threads antes do **Squash and Merge**.

---

### 🗳️ ADR-FE-011: Arquitetura Local-First com Sincronização Resiliente e Contrato JSON Unificado

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/types/caregiver.ts`](../../src/types/caregiver.ts), [`src/services/localFirstStore.ts`](../../src/services/localFirstStore.ts), [`src/services/caregiverApi.ts`](../../src/services/caregiverApi.ts), [`src/services/caregiverSyncController.ts`](../../src/services/caregiverSyncController.ts), [`src/hooks/useCaregivers.ts`](../../src/hooks/useCaregivers.ts), [`tests/localFirstSync.test.ts`](../../tests/localFirstSync.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - O Frontend hidrata sincronicamente em `0ms` e grava imediatamente no envelope versionado `escala_elderly:schedule:v1` (`{ schemaVersion: 1, updatedAtIso, pendingRemoteSync, cuidadores }`), purgando automaticamente snapshots corrompidos (_Versioned Schema Purge Guard_) e degradando para memória volátil se o navegador bloquear `localStorage`.
  - Sincroniza de forma resiliente com a API Spring Boot (`VITE_API_BASE_URL`, padrão `http://localhost:8080`) usando `fetch` nativo com timeout determinístico de `2.500ms`, proteção de corrida via `AbortController` + contador monotônico de revisão, reconciliação anti-_clobbering_ (`POST /api/cuidadores/batch` sempre que houver alterações locais pendentes ou auto-cura em `404`), mutação unitária (`PATCH /api/cuidadores/{id}/status`) e restauração (`POST /api/cuidadores/reset`).
  - **Contrato JSON Canônico de 8 campos compartilhado 1:1 com o Backend (zero chaves `null`):**
    ```ts
    export type StatusCuidador = 'Presente' | 'Faltou' | 'Folga' | 'Cobertura';

    export interface Cuidador {
      readonly id: number; // Ex: 3 = Carlos Rocha (unificado no Front e no Back)
      readonly nome: string;
      readonly status: StatusCuidador;
      readonly turno?: string; // Ex: "Diurno (07h-19h)" | "Noturno (19h-07h)"
      readonly quarto?: string; // Ex: "Quarto 03"
      readonly telefone?: string;
      readonly horasDescanso?: number;
      readonly substituto?: string; // Omitido sempre que status !== 'Cobertura'
    }
    ```

---

### 🗳️ ADR-FE-012: Motor Determinístico de Cobertura Inteligente (Art. 66 da CLT, Zero Sobreposição e Convocação WhatsApp)

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/services/coverageEngine.ts`](../../src/services/coverageEngine.ts), [`src/components/PainelCobertura/PainelCobertura.tsx`](../../src/components/PainelCobertura/PainelCobertura.tsx), [`src/components/PainelCobertura/PainelCobertura.styles.ts`](../../src/components/PainelCobertura/PainelCobertura.styles.ts), [`src/services/caregiverSyncController.ts`](../../src/services/caregiverSyncController.ts), [`src/pages/Dashboard.tsx`](../../src/pages/Dashboard.tsx), [`tests/smartCoverage.test.ts`](../../tests/smartCoverage.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - Implementar o motor puro `coverageEngine.ts` que combina dinamicamente os cuidadores em `'Folga'` da escala ativa (`activeRoster`, com autoridade total de sombreamento anti-bypass) com o banco sintético Clean-Room de folguistas de reserva (`FOLGUISTAS_RESERVA_PADRAO`, namespace `id: 9001..9003`), preservando paridade determinística entre os modos Online (`:8080`) e Offline (`Caregive.json`).
  - Aplicar filtragem trabalhista _Poka-Yoke_ estrita exigindo `horasDescanso >= 11` (**Art. 66 da CLT**) e bloqueio em tempo real contra dupla alocação simultânea (_Zero Shift Overlap_ sobre `status === 'Cobertura'`), ranqueando candidatos por afinidade de turno, horas de descanso e origem.
  - Renderizar `<PainelCobertura />` (`.no-print`) como irmão semântico adjacente fora do `<button>` de `<CardCuidador />` (preservando HTML5 válido, `WCAG 2.2 AA >= 4.5:1`, `WCAG 2.5.3` e restauração de foco `WCAG 2.4.3`), oferecendo acionamento `https://wa.me/` a custo R$ 0 com minimização de dados LGPD (`noopener noreferrer`, sem expor o nome pessoal do ausente) e confirmação em 1 clique sincronizada via `PATCH /api/cuidadores/{id}/status` / `POST /api/cuidadores/batch`.

---

### 🗳️ ADR-FE-013: Codec Tabular Auto-Curativo (RFC 4180 / Excel PT-BR), Blindagem OWASP Anti-CSV Injection e Backup Transacional Local-First com Undo

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/services/csvScheduleCodec.ts`](../../src/services/csvScheduleCodec.ts), [`src/services/localFirstStore.ts`](../../src/services/localFirstStore.ts), [`src/services/caregiverSyncController.ts`](../../src/services/caregiverSyncController.ts), [`src/components/BarraPlanilha/BarraPlanilha.tsx`](../../src/components/BarraPlanilha/BarraPlanilha.tsx), [`src/components/BarraPlanilha/BarraPlanilha.styles.ts`](../../src/components/BarraPlanilha/BarraPlanilha.styles.ts), [`tests/csvImportExport.test.ts`](../../tests/csvImportExport.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - Implementar em TypeScript puro (`0` dependências NPM extras) o motor `csvScheduleCodec.ts` com pipeline _Write-Audit-Publish_ tudo-ou-nada, limite anti-DoS pré-alocação (`1 MiB` em arquivo, `Uint8Array` e `string` colada; teto de `500` linhas), detecção de assinaturas mágicas binárias (`.xlsx`, `.xls`, `%PDF-`, `UTF-32`), auto-cura de codificação (`UTF-8`, `UTF-8 BOM`, `UTF-16LE/BE` e fallback automático `Windows-1252` para Excel em Português) e máquina de estados RFC 4180 com detecção automática de `;`, `\t` e `,` fora de aspas.
  - Aplicar defesa em profundidade **OWASP CSV Formula Injection** bloqueando células iniciadas por `=`, `+`, `-`, `@`, `\t` ou `\r` (brutos, após espaços, precedidos por `'` ou em linhas internas `Alt+Enter`) em campos textuais, combinada com gramática estrita E.164 em `telefone` e exportação `UTF-8 BOM` (`\uFEFF` restrito ao `Blob` em memória) na ordem canônica _OWASP Prefix $\rightarrow$ RFC 4180 Quote_, assegurando idempotência exata de backup (`import(export(escala)) === escala`) sem erros `#NOME?` nem truncamento científico no Excel.
  - Persistir snapshots transacionais de reversão em `escala_elderly:undo_backup:v1` antes de cada nova importação distinta (sobrevivendo ao `F5` e ao `reconcile()` contra `:8080`, com guarda anti-duplo-`Ctrl+V`, sincronização `POST /api/cuidadores/batch` e restauração de foco `WCAG 2.4.3` ao acionar `Desfazer Importação`).

---

### 🗳️ ADR-FE-014: Motor Determinístico de Exportação PDF A4 Vetorial (ISO 32000-1 %PDF-1.4), Estúdio SheetCanvas 1:1, Rubrica sigv1 e Modo Mural Público LGPD

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/services/a4PdfScheduleEngine.ts`](../../src/services/a4PdfScheduleEngine.ts), [`src/services/vectorSignatureProtocol.ts`](../../src/services/vectorSignatureProtocol.ts), [`src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.tsx`](../../src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.tsx), [`src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.styles.ts`](../../src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.styles.ts), [`src/components/BarraPlanilha/BarraPlanilha.tsx`](../../src/components/BarraPlanilha/BarraPlanilha.tsx), [`src/index.css`](../../src/index.css), [`tests/a4PdfEngine.test.ts`](../../tests/a4PdfEngine.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - Implementar em TypeScript puro (`0` dependências NPM extras; bundle gzip preservado abaixo do teto de `160 KiB`) o compilador binário `Uint8Array` ISO 32000-1 `%PDF-1.4` 100% vetorial (`0` imagens raster), declarando `/Encoding /WinAnsiEncoding` explícito nas fontes _Standard 14_ (`/Helvetica`, `/Helvetica-Bold`, `/Courier`), normalização `.normalize('NFC')` + mapa bidirecional CP1252 `0x80..0x9F` + escapes octais `\ddd` blindados contra injeção PostScript em `/Contents` e `/Info`, tabela `xref` de exatos `20` bytes por entrada sem desvio UTF-8 e selo criptográfico síncrono FIPS 180-4 `SHA-256` (`sha256HexSync`, independente de HTTPS/`crypto.subtle`).
  - Compartilhar o modelo geométrico euclidiano unificado (`buildA4ScheduleDocumentModel` em `mm`, com _auto-fit_ tipográfico AFM de segurança `0.94`, piso `6.5pt` e paginação dinâmica `1/N` sem páginas brancas fantasmas em Retrato `210×297mm` e Paisagem `297×210mm`) 1:1 entre o compilador `.pdf` e o `<FolhaEscalaA4Document />`, isolando a impressão física via portal `#a4-print-sheet-host` + `@media print` imune ao `overflow: hidden` do `ModalManager` do MUI e à rasterização do _Skia Print Compositor_.
  - Oferecer no `<ModalFolhaEscalaA4 />` zoom óptico responsivo sem overflow horizontal em `375×667` (`computeOpticalSheetScale` com piso `0.24` sobre a largura real da folha), protocolo vetorial `sigv1:` com simplificação Ramer-Douglas-Peucker (`PointerEvents` + síntese acessível por teclado `WCAG 2.1.1`) e **Modo Mural Público LGPD** que pseudonimiza tanto `cuidador.nome` quanto `cuidador.substituto` (ignorando partículas `da/de/do/das/dos/e`) e suprime 100% dos dígitos telefônicos.

---

### 🗳️ ADR-FE-015: Telemetria Operacional em Tempo Real e Termômetro Determinístico de Economia Financeira em Centavos Inteiros

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/services/financialKpiEngine.ts`](../../src/services/financialKpiEngine.ts), [`src/components/BarraIndicadores/BarraIndicadores.tsx`](../../src/components/BarraIndicadores/BarraIndicadores.tsx), [`src/components/BarraIndicadores/BarraIndicadores.styles.ts`](../../src/components/BarraIndicadores/BarraIndicadores.styles.ts), [`src/pages/Dashboard.tsx`](../../src/pages/Dashboard.tsx), [`tests/financialKpiEngine.test.ts`](../../tests/financialKpiEngine.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - Implementar em TypeScript puro (`0` pacotes NPM novos) o motor contábil $O(N)$ `financialKpiEngine.ts` operando exclusivamente em **centavos inteiros (`Safe Integer`)** e formatação determinística `formatCentavosToBrl` (espaço ASCII `0x20`, sem depender de `Intl.NumberFormat`), ancorado nas premissas auditáveis de domínio (`DEFAULT_SHIFT_COST_MODEL`: plantão planejado CLT Art. 66 `19_000` centavos / `R$ 190,00` vs. benchmark emergencial de última hora CLT Art. 71 § 4º `31_500` centavos / `R$ 315,00` = `12_500` centavos / `R$ 125,00` de economia líquida realizada por cobertura interna).
  - Aplicar higiene estatística anti-Paradoxo de Simpson excluindo `'Folga'` do denominador `requiredPostsCount`, estratificando titulares vs. coberturas (`3 tit. + 1 cob.`), aplicando clamping `[1..99]` quando coexistem postos ativos e faltas abertas (evitando `100%` falso em escalas de `200+` linhas), reconciliando contadores `1:1` com `buildA4ScheduleDocumentModel` e preservando `realizedSavingsCentavos` mesmo em estados mistos (`Cobertura` + `Faltou`).
  - Renderizar `<BarraIndicadores />` (`.no-print`, `role="region"`, zero `<section>`/`<a>`) abaixo do cabeçalho `DASHBOARD` com paleta `BARRA_INDICADORES_TOKENS` pré-certificada (`WCAG 2.2 AA >= 4.5:1` texto e `>= 3.0:1` gráfico `1.4.11`), `role="progressbar"` linear ancorado em `0%..100%`, números tabulares `JetBrains Mono` (`whiteSpace: 'nowrap'`), orçamento vertical `<= 118px` em `375×667` (grade adaptativa em `< 360px`) e prontidão nativa `privacyMode` (`R$ •••,••` sem vazamento de dígitos em atributos WAI-ARIA).

---

### 🗳️ ADR-FE-016: Modo Privacidade LGPD Fim-a-Fim Read-Time na Tela, Cobertura, Planilha CSV e Estúdio PDF A4

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/services/lgpdPrivacyEngine.ts`](../../src/services/lgpdPrivacyEngine.ts), [`src/services/localFirstStore.ts`](../../src/services/localFirstStore.ts), [`src/services/csvScheduleCodec.ts`](../../src/services/csvScheduleCodec.ts), [`src/services/a4PdfScheduleEngine.ts`](../../src/services/a4PdfScheduleEngine.ts), [`src/hooks/useCaregivers.ts`](../../src/hooks/useCaregivers.ts), [`src/pages/Dashboard.tsx`](../../src/pages/Dashboard.tsx), [`src/pages/Dashboard.styles.ts`](../../src/pages/Dashboard.styles.ts), [`src/components/CardCuidador/CardCuidador.tsx`](../../src/components/CardCuidador/CardCuidador.tsx), [`src/components/CardCuidador/CardCuidador.styles.ts`](../../src/components/CardCuidador/CardCuidador.styles.ts), [`src/components/PainelCobertura/PainelCobertura.tsx`](../../src/components/PainelCobertura/PainelCobertura.tsx), [`src/components/PainelCobertura/PainelCobertura.styles.ts`](../../src/components/PainelCobertura/PainelCobertura.styles.ts), [`src/components/BarraPlanilha/BarraPlanilha.tsx`](../../src/components/BarraPlanilha/BarraPlanilha.tsx), [`src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.tsx`](../../src/components/ModalFolhaEscalaA4/ModalFolhaEscalaA4.tsx), [`tests/lgpdPrivacyMode.test.ts`](../../tests/lgpdPrivacyMode.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - Extrair em [`src/services/lgpdPrivacyEngine.ts`](../../src/services/lgpdPrivacyEngine.ts) a fonte única da verdade de pseudonimização PT-BR (`maskPersonNameLgpd` e `projectCaregiverForLgpd`), mantendo paridade algébrica `1:1` com `LgpdPrivacyMasker.java` do Backend (**Lei nº 13.709/2018 — Arts. 6º III/VII, 13 e 46**): normalização Unicode `.normalize('NFC')` com cura de surrogates órfãos, filtragem das partículas `da/de/do/das/dos/e` com fallback seguro, preservação de planos suplementares Unicode (aplicando `sanitizeWinAnsiText` exclusivamente na fronteira PDF ISO 32000-1), teto `<= 120` code units UTF-16 (`truncateUtf16Safe`) e idempotência algébrica $f(f(x)) = f(x)$, sem jamais mutar o snapshot canônico (`escala_elderly:schedule:v1`) nem os payloads REST enviados à API.
  - Persistir a preferência do posto em `escala_elderly:privacy_mode:v1` no `LocalFirstStore` (hidratação síncrona `0ms` resistente a `F5`, `Restaurar Escala`, `Importar CSV`, `Desfazer Importação` e `QuotaExceededError`, com sincronia entre abas via evento `storage` em `useCaregivers.ts`) controlada por `<Button type="button" className="no-print" aria-pressed={privacyMode}>` no cabeçalho do `Dashboard` (`WCAG 2.2 AA >= 4.5:1` / `>= 3.0:1`, alvo mobile `44px`, transição sem flash `background-color` e Card #1 `<= 667px` acima da dobra em `375×667`).
  - Fechar `100%` dos canais laterais de PII e cifras financeiras quando `privacyMode === true`: mascaramento simultâneo de `nome`, `substituto` e `aria-label` em `<CardCuidador />` (`WCAG 2.5.3` + `overflowWrap: 'anywhere'`), ocultação `R$ •••,••` sem dígitos em `<BarraIndicadores />`, supressão total de tags `<a href="https://wa.me/...">` (tanto nos candidatos elegíveis quanto no banner de pool exaurido) em `<PainelCobertura />` substituídas pelo selo `🔒 Contato oculto (LGPD)` preservando confirmação e sombreamento CLT canônicos, exportação CSV redigida (`escala-cuidadores-YYYY-MM-DD-lgpd.csv` sem telefones) e inicialização sincronizada do `<ModalFolhaEscalaA4 />` em `Modo Mural Público LGPD: Ativo`.

---

### 🗳️ ADR-FE-017: Sincronização Multiplayer em Tempo Real em Dupla Camada (BroadcastChannel Local < 5ms + EventSource W3C SSE com Proteção Anti-Clobber Local-First)

- **Status:** `ACEITA / IMPLEMENTADA`
- **Onde está no código:** [`src/services/multiplayerSyncEngine.ts`](../../src/services/multiplayerSyncEngine.ts), [`src/services/caregiverSyncController.ts`](../../src/services/caregiverSyncController.ts), [`src/hooks/useCaregivers.ts`](../../src/hooks/useCaregivers.ts), [`tests/multiplayerSync.test.ts`](../../tests/multiplayerSync.test.ts), [`tests/localFirstSync.test.ts`](../../tests/localFirstSync.test.ts) e [`tests/dashboardUiContract.test.tsx`](../../tests/dashboardUiContract.test.tsx).
- **Decisão:**
  - Implementar em TypeScript puro (`0` dependências NPM externas; Web APIs nativas `BroadcastChannel`, `StorageEvent` e `EventSource`) o motor ortogonal [`src/services/multiplayerSyncEngine.ts`](../../src/services/multiplayerSyncEngine.ts) estruturado em **Dupla Camada Assíncrona**:
    1. **Camada 1 — Barramento Local Entre Abas (`CrossTabChannelBridge`, `< 5ms`, `100%` Offline):** Canal dedicado `escala_elderly:multiplayer:v1` para propagação imediata de mutações da escala (`SCHEDULE_SYNC`, transportando honestamente `canUndoImport` e `undoBackup` inclusive em armazenamento volátil) e da preferência LGPD (`PRIVACY_SYNC`), com fallback automático por `window.addEventListener('storage', ...)`, persistência condicional anti-amplificação $O(N^2)$, validação estrita anti-_prototype pollution_ (`parseCrossTabMessage` rejeitando `__proto__` e chaves desconhecidas), geração resiliente de IDs em contextos LAN HTTP não-seguros (`crypto.randomUUID` → `crypto.getRandomValues` → fallback monotônico) e anel LRU determinístico (`MAX_SEEN_MESSAGE_IDS = 128`) que impede loops de eco e tempestades de requisições HTTP entre $N$ abas.
    2. **Camada 2 — Stream Cross-Device W3C Server-Sent Events (`SseStreamClient`, `< 150ms` LAN):** Conexão reativa a `GET /api/cuidadores/stream` (`CuidadorController.java` / `CuidadorSseBroadcaster.java`) ouvindo eventos nomeados `SCHEDULE_UPDATED` validados por `parseCuidadorList`, filtragem monotônica por sessão de `lastEventId` (`sessionLastEventSeq` reiniciado a cada reconexão para aceitar reinícios in-memory do servidor Java sem descartar frames legítimos) e reconexão explícita com _Equal Jitter Exponential Backoff_ (`computeSseBackoffDelayMs`: intervalo `[500ms..30.000ms]`, base `1.000ms`, teto `30.000ms`, fechando proativamente o `EventSource` em `onerror` para eliminar tempestades _Thundering Herd_).
  - Integrar o motor à máquina de estados [`src/services/caregiverSyncController.ts`](../../src/services/caregiverSyncController.ts) e ao hook [`src/hooks/useCaregivers.ts`](../../src/hooks/useCaregivers.ts) preservando **Linearizabilidade Anti-Clobber Local-First** (`deferredSseSchedule` + `deferredCrossTabPayload` retêm frames durante mutações HTTP em voo, convergindo corridas sub-milissegundo em cards distintos com `0` GETs extras e resolvendo corridas _Last-Writer-Wins_ no mesmo card via `reconcile()`), **Idempotência Referencial Estrita** (`emitIfChanged` garantindo `0` re-renders supérfluos, `0` perda de foco teclado `WCAG 2.4.3` e `0` spam em `aria-live="polite"`), **Estabilidade Semântica de Conexão** (falhas de proxy em `text/event-stream` antes de `onopen` jamais rebaixam REST `'online'`) e **Simetria LIFO `<StrictMode>`** (`0` canais ou sockets órfãos e transição pura em `alternarModoPrivacidade`).
