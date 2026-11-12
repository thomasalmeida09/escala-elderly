# 🏥 Escala Elderly — Painel do Gerente (Frontend)

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-5.1-6E9F18?logo=vitest&logoColor=white)
![MUI](https://img.shields.io/badge/Material_UI-v9_Warm_Care-007A78?logo=mui&logoColor=white)
![Status](<https://img.shields.io/badge/Status-Sprint_3_(Inteligencia_&_LGPD)-007A78>)

Sistema web de monitoramento e gestão inteligente de escalas de cuidadores para **Instituições de Longa Permanência para Idosos (ILPIs)**, clínicas geriátricas e operações de **Home Care**.

---

## 🧭 Links Rápidos de Governança & Gestão da Equipe

| Recurso de Governança                         | Acesso Direto                                                                             | Descrição                                                                     |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| 📊 **Quadro Kanban Interativo**               | **[GitHub Projects (Front + Back)](https://github.com/users/augustoheiss/projects/1)**    | Quadro unificado com o status em tempo real de todas as tarefas da equipe     |
| 🖼️ **Mapa Visual da Arquitetura (PR Lens)**   | **[Canvas Técnico & ADRs (`prlens.dev`)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)**   | Diagramas animados de arquitetura, _blast radius_ das Sprints e payloads JSON |
| 👶 **Explicação Passo a Passo (ELI5 Canvas)** | **[Walkthrough Onboarding (`prlens.dev`)](https://prlens.dev/c/x2StISYcAmXvy49MhetrsQ)**  | Tour visual progressivo de como o sistema resolve uma falta no plantão        |
| 🏛️ **Catálogo de ADRs do Frontend**           | **[`docs/adr/README.md`](./docs/adr/README.md)**                                          | Decisões arquiteturais já tomadas (`ADR-FE-001` a `ADR-FE-015`) e governança  |
| 🗺️ **Divisão por Sprints e Colunas**          | **[`docs/adr/QUADRO-KANBAN-SPRINTS.md`](./docs/adr/QUADRO-KANBAN-SPRINTS.md)**            | Mapa completo das 14 Issues distribuídas entre as Sprints 1, 2 e 3            |
| ☕ **Repositório Backend (API Java)**         | **[`escala-elderly-backend`](https://github.com/thomasalmeida09/escala-elderly-backend)** | API REST em Java 17 + Spring Boot 4.1 que alimenta este painel                |

### 🎬 Diagrama Interativo da Arquitetura (PR Lens)

[![Arquitetura Escala Elderly — PR Lens](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog.svg)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)

> 💡 _Clique no diagrama acima para abrir o **[Canvas Interativo no PR Lens](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)** (ou acesse o **[Tour Visual ELI5 para Onboarding](https://prlens.dev/c/x2StISYcAmXvy49MhetrsQ)**)._

---

## 🎯 Sobre o Projeto

Na rotina de clínicas de repouso e Home Care, **furos de escala de última hora** (como a falta imprevista de um cuidador na troca de plantão) geram desorganização operacional em grupos de WhatsApp e custos elevados com plantonistas de emergência.

O **Escala Elderly** substitui o controle em papel por um **Painel do Gerente** intuitivo, construído sob a estética **"Warm Care + Tech Industrial"**:

- **Visibilidade Instantânea (`0ms`):** Identificação imediata e acessível (WCAG 2.2 AA) de quem está `PRESENTE` (`#005C5A` / `#E6F2F2`), `FALTOU` (`#92400E` / `#FEF3C7`), em `FOLGA` (`#374151` / `#F3F4F6`) ou em `COBERTURA` (`#1E40AF` / `#DBEAFE`).
- **Simulação, Alternância por Teclado e Restauração:** Painel rápido para simular `"Falta de Carlos"`, alternar status diretamente nos cards (`Enter`/`Space`/clique) e restaurar a escala padrão (`"Restaurar Escala"`).
- **Cobertura Inteligente CLT & Acionamento WhatsApp (`ADR-FE-012`):** Ao registrar `"Faltou"`, o painel sugere imediatamente os folguistas elegíveis (intervalo interjornada `>= 11h` do Art. 66 da CLT e zero conflito de plantão), com convocação em 1 clique via `wa.me` (custo R$ 0 e minimização LGPD) e confirmação instantânea da substituição.
- **Importação/Exportação Rápida CSV/Excel & Backup com Rollback (`ADR-FE-013`):** Preenchimento em `< 1s` via seletor de arquivo, _Drag-and-Drop_ ou `Ctrl+V` direto do Excel (auto-cura `;`/`\t`/`,`, `UTF-8`/`Windows-1252` e blindagem OWASP anti-CSV Injection), exportação com `UTF-8 BOM` pronta para Excel e reversão transacional em 1 clique (`Desfazer Importação` em `escala_elderly:undo_backup:v1`).
- **Exportação PDF A4 Vetorial & Estúdio de Mural (`ADR-FE-014`):** Geração 100% vetorial ISO 32000-1 (`%PDF-1.4`, `0` dependências externas, acentuação `WinAnsiEncoding` completa e selo `SHA-256` síncrono) e pré-visualização `SheetCanvas` 1:1 com paginação dinâmica `1/N` sem páginas brancas fantasmas, alternância Retrato/Paisagem, rubrica vetorial `sigv1:` (toque/mouse/teclado `WCAG 2.1.1`) e **Modo Mural Público LGPD**.
- **KPIs Operacionais & Termômetro de Economia Financeira (`ADR-FE-015`):** Faixa executiva no topo do painel com contadores estratificados anti-Paradoxo de Simpson (`Presentes` titulares vs. `Coberturas`, excluindo `Folga` do denominador), alertas imediatos de `Faltas` e termômetro linear determinístico em centavos inteiros (`+R$ 125,00` economizados por cobertura interna planejada frente ao sobrecusto emergencial de `R$ 315,00`), pronto para mascaramento LGPD (`R$ •••,••`).
- **Arquitetura Resiliente (Local-First + REST API):** Hidratação síncrona em `0ms` via `localStorage` (`escala_elderly:schedule:v1`) sincronizada automaticamente aos endpoints `GET`, `PATCH`, `POST /batch` e `POST /reset` da API Spring Boot com fallback offline transparente (`MODO LOCAL-FIRST`).

---

## 🏗️ Arquitetura e Estrutura de Pastas

O projeto segue o padrão de **Componentização com Estilos Isolados (`.styles.ts`)** (`ADR-FE-003`), separação de estado em **Custom Hooks** (`ADR-FE-004`) e **Fitness Functions Automatizadas** em Vitest 5 (`ADR-FE-009`):

```text
escala-elderly/
├── .github/
│   ├── workflows/
│   │   └── ci.yml                               # Pipeline CI Dual-Job Node 24 (Build/Lint/Vitest/Budget & LGPD Gate)
│   ├── CODEOWNERS                               # Roteamento automático de Code Review (@thomasalmeida09 @augustoheiss)
│   ├── pull_request_template.md                 # Checklist de governança alinhado às ADRs (ADR-FE-001..015)
│   └── ruleset-main-protection.json             # Definição auditável de proteção da branch main
├── docs/
│   └── adr/
│       ├── README.md                            # Catálogo oficial de ADRs (ADR-FE-001 a ADR-FE-015)
│       └── QUADRO-KANBAN-SPRINTS.md             # Divisão das Issues por Sprints e Colunas
├── public/
│   └── favicon.svg                              # Ícone vetorial da aplicação
├── src/
│   ├── components/
│   │   ├── BarraIndicadores/
│   │   │   ├── BarraIndicadores.tsx             # Faixa executiva .no-print de KPIs e termômetro linear 0..100%
│   │   │   └── BarraIndicadores.styles.ts       # Tokens WCAG 2.2 AA, números tabulares e orçamento mobile <=118px
│   │   ├── BarraPlanilha/
│   │   │   ├── BarraPlanilha.tsx                # Barra .no-print de planilha CSV, Undo e Estúdio PDF A4
│   │   │   └── BarraPlanilha.styles.ts          # Tokens WCAG 2.2 AA e grade 2x2 responsiva de planilha/PDF
│   │   ├── CardCuidador/
│   │   │   ├── CardCuidador.tsx                 # Card individual de status do cuidador
│   │   │   └── CardCuidador.styles.ts           # Estilos isolados do CardCuidador
│   │   ├── ModalFolhaEscalaA4/
│   │   │   ├── ModalFolhaEscalaA4.tsx           # Estúdio SheetCanvas A4 1:1, rubrica sigv1 e portal @media print
│   │   │   └── ModalFolhaEscalaA4.styles.ts     # Tokens WCAG 2.2 AA e estilos do estúdio A4
│   │   ├── PainelCobertura/
│   │   │   ├── PainelCobertura.tsx              # Painel irmão de triagem CLT (>=11h) e WhatsApp wa.me
│   │   │   └── PainelCobertura.styles.ts        # Tokens WCAG 2.2 AA e estilos responsivos de cobertura
│   │   ├── SimuladorPainel/
│   │   │   ├── SimuladorPainel.tsx              # Painel de controle para simulação de alertas
│   │   │   └── SimuladorPainel.styles.ts        # Estilos isolados do SimuladorPainel
│   │   └── common/
│   │       └── Text.tsx                         # Wrapper tipográfico padronizado do Design System
│   ├── hooks/
│   │   └── useCaregivers.ts                     # Custom Hook de estado e integração de dados
│   ├── mocks/
│   │   └── Caregive.json                        # Seed sintético Clean-Room para simulação local
│   ├── pages/
│   │   ├── Dashboard.tsx                        # Tela principal do Painel do Gerente
│   │   └── Dashboard.styles.ts                  # Estilos isolados do Dashboard
│   ├── services/
│   │   ├── a4PdfScheduleEngine.ts               # Motor determinístico PDF 1.4 A4 vetorial, WinAnsi e SHA-256
│   │   ├── caregiverApi.ts                      # Cliente HTTP nativo (fetch + timeout 2.5s + AbortController)
│   │   ├── caregiverSyncController.ts           # Máquina de sincronização híbrida Local-First <-> Spring Boot
│   │   ├── coverageEngine.ts                    # Motor determinístico de cobertura CLT (>=11h) e WhatsApp wa.me
│   │   ├── csvScheduleCodec.ts                  # Codec tabular RFC 4180 / Excel PT-BR, anti-CSV Injection e BOM
│   │   ├── financialKpiEngine.ts                # Motor contábil O(N) em centavos inteiros, anti-Simpson e LGPD
│   │   ├── lgpdPrivacyEngine.ts                 # Motor puro de pseudonimização PT-BR e projeção LGPD read-time
│   │   ├── localFirstStore.ts                   # Persistência síncrona 0ms (schedule:v1 + undo:v1 + privacy:v1)
│   │   └── vectorSignatureProtocol.ts           # Protocolo vetorial sigv1 + simplificação RDP e síntese por teclado
│   ├── theme/
│   │   └── theme.ts                             # Tokens visuais do tema "warmCareTheme" (MUI)
│   ├── types/
│   │   └── caregiver.ts                         # Contrato canônico de 8 campos e validação estrita (ADR-FE-011)
│   ├── App.tsx                                  # Provedor global de tema e CssBaseline
│   ├── index.css                                # Reset limpo de viewport e fundação @media print A4
│   └── main.tsx                                 # Ponto de entrada da aplicação React 19
├── tests/
│   ├── a4PdfEngine.test.ts                      # Suíte unitária ISO 32000-1 PDF 1.4, WinAnsi, SHA-256, LGPD e sigv1
│   ├── csvImportExport.test.ts                  # Suíte unitária de codec CSV/TSV, OWASP guard, BOM e Undo Local-First
│   ├── dashboardUiContract.test.tsx             # Suíte SSR de semântica HTML5, WCAG 2.2 AA e StrictMode
│   ├── financialKpiEngine.test.ts               # Suíte unitária de KPIs em centavos, clamping e reconciliação PDF
│   ├── governanceHygiene.test.ts                # Fitness Functions de CI, ADRs, Árvore e Clean-Room/LGPD
│   ├── lgpdPrivacyMode.test.ts                  # Suíte unitária de paridade LGPD, persistência F5 e CSV/PDF redigido
│   ├── localFirstSync.test.ts                   # Suíte unitária de contrato, Local-First Store e concorrência API
│   └── smartCoverage.test.ts                    # Suíte unitária de elegibilidade CLT Art. 66, wa.me e alocação
├── .editorconfig                                # Padrão UTF-8 sem BOM e quebras de linha LF
├── .gitattributes                               # Normalização determinística de LF no Git
├── .gitignore                                   # Exclusão de artefatos de build, .env e lockfiles externos
├── .prettierignore                              # Escopo ignorado pelo Prettier (node_modules, dist, bun.lock)
├── .prettierrc                                  # Configuração oficial do Prettier (ADR-FE-008)
├── bun.lock                                     # Lockfile determinístico único do Bun (ADR-FE-002)
├── eslint.config.js                             # Regras de linting (ESLint 10 + TypeScript + React Hooks)
├── index.html                                   # Shell HTML (lang="pt-BR" + Google Fonts Inter & JetBrains Mono)
├── package.json                                 # Manifesto de dependências e scripts (100% Material UI + Vitest 5)
├── README.md                                    # Guia de arquitetura, execução local e governança
├── tsconfig.app.json                            # Configuração TypeScript isolada do bundle browser
├── tsconfig.json                                # Referências ortogonais de projetos TypeScript 6
├── tsconfig.node.json                           # Configuração TypeScript de ferramentas Node/Vite
├── tsconfig.test.json                           # Configuração TypeScript dedicada à suíte de testes
├── vite.config.ts                               # Configuração do bundler Vite 8
└── vitest.config.ts                             # Configuração da suíte de testes Vitest 5
```

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos

- [Bun 1.4+](https://bun.sh/) (recomendado, pois o projeto utiliza `bun.lock`) ou [Node.js 24+ (`>= 22.12`)](https://nodejs.org/).

### Passo a passo

```bash
# 1. Instalar as dependências de forma determinística (respeitando bun.lock)
bun install --frozen-lockfile

# 2. Iniciar o servidor de desenvolvimento (Vite HMR)
bun run dev

# 3. Padronizar e verificar formatação automática em 100% do repositório (Prettier — ADR-FE-008)
bun run format
bun run format:check

# 4. Validar Linter (ESLint 10), Suíte de Testes (Vitest 5) e Build de Produção (TypeScript + Vite)
bun run lint
bun run test
bun run build
```

A aplicação estará disponível em **`http://localhost:5173`**.

### Integração Full-Stack (`Local-First` + API Spring Boot)

- Por padrão, o Frontend conecta-se automaticamente a **`http://localhost:8080`** (`GET /api/cuidadores`, `PATCH /api/cuidadores/{id}/status`, `POST /api/cuidadores/batch` e `POST /api/cuidadores/reset`), configurável via variável pública `VITE_API_BASE_URL` (`ADR-FE-011`).
- Caso o servidor Spring Boot esteja desligado ou inacessível (timeout `2.500ms`), o cabeçalho exibe `● MODO LOCAL-FIRST (SALVO NO DISPOSITIVO)` e todas as mudanças permanecem salvas instantaneamente no navegador, sincronizando automaticamente quando a API voltar a ficar disponível.

---

## 🤝 Fluxo de Trabalho da Equipe (Resumo das ADRs)

1. **Gestão de Tarefas (`ADR-FE-007`):** Escolha uma Issue na coluna `🎯 Sprint 1 (To Do - Fundação)` do [GitHub Projects](https://github.com/users/augustoheiss/projects/1) e atribua seu usuário (`Assignee`).
2. **Padrão de Branches (`ADR-FE-010`):** Crie uma branch a partir da `main` seguindo o padrão `feat/issue-XX-descricao`, `fix/issue-XX-descricao` ou `ci/issue-XX-descricao`.
3. **Padrão de Commits (`ADR-FE-010`):** Utilize _Conventional Commits_ (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `ci:`, `test:`) respeitando _Fowler's Two Hats_.
4. **Pull Requests (`ADR-FE-008`, `ADR-FE-009` & `ADR-FE-010`):** Rode `bun run format:check && bun run lint && bun run test && bun run build` localmente, abra o PR referenciando a Issue (`Closes #XX`), aguarde a aprovação dos 2 gates do **GitHub Actions (CI)** e solicite **1 Code Review** antes do _Squash and Merge_.
