# 🏥 Escala Elderly — Painel do Gerente (Frontend)

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white)
![Vitest](https://img.shields.io/badge/Vitest-5.1-6E9F18?logo=vitest&logoColor=white)
![MUI](https://img.shields.io/badge/Material_UI-v9_Warm_Care-007A78?logo=mui&logoColor=white)
![Status](<https://img.shields.io/badge/Status-Sprint_2_(MVP_Core)-007A78>)

Sistema web de monitoramento e gestão inteligente de escalas de cuidadores para **Instituições de Longa Permanência para Idosos (ILPIs)**, clínicas geriátricas e operações de **Home Care**.

---

## 🧭 Links Rápidos de Governança & Gestão da Equipe

| Recurso de Governança                         | Acesso Direto                                                                             | Descrição                                                                     |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------- |
| 📊 **Quadro Kanban Interativo**               | **[GitHub Projects (Front + Back)](https://github.com/users/augustoheiss/projects/1)**    | Quadro unificado com o status em tempo real de todas as tarefas da equipe     |
| 🖼️ **Mapa Visual da Arquitetura (PR Lens)**   | **[Canvas Técnico & ADRs (`prlens.dev`)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)**   | Diagramas animados de arquitetura, _blast radius_ das Sprints e payloads JSON |
| 👶 **Explicação Passo a Passo (ELI5 Canvas)** | **[Walkthrough Onboarding (`prlens.dev`)](https://prlens.dev/c/x2StISYcAmXvy49MhetrsQ)**  | Tour visual progressivo de como o sistema resolve uma falta no plantão        |
| 🏛️ **Catálogo de ADRs do Frontend**           | **[`docs/adr/README.md`](./docs/adr/README.md)**                                          | Decisões arquiteturais já tomadas (`ADR-FE-001` a `ADR-FE-012`) e governança  |
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
│   ├── pull_request_template.md                 # Checklist de governança alinhado às ADRs (ADR-FE-001..012)
│   └── ruleset-main-protection.json             # Definição auditável de proteção da branch main
├── docs/
│   └── adr/
│       ├── README.md                            # Catálogo oficial de ADRs (ADR-FE-001 a ADR-FE-012)
│       └── QUADRO-KANBAN-SPRINTS.md             # Divisão das Issues por Sprints e Colunas
├── public/
│   └── favicon.svg                              # Ícone vetorial da aplicação
├── src/
│   ├── components/
│   │   ├── CardCuidador/
│   │   │   ├── CardCuidador.tsx                 # Card individual de status do cuidador
│   │   │   └── CardCuidador.styles.ts           # Estilos isolados do CardCuidador
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
│   │   ├── caregiverApi.ts                      # Cliente HTTP nativo (fetch + timeout 2.5s + AbortController)
│   │   ├── caregiverSyncController.ts           # Máquina de sincronização híbrida Local-First <-> Spring Boot
│   │   ├── coverageEngine.ts                    # Motor determinístico de cobertura CLT (>=11h) e WhatsApp wa.me
│   │   └── localFirstStore.ts                   # Persistência síncrona 0ms (escala_elderly:schedule:v1)
│   ├── theme/
│   │   └── theme.ts                             # Tokens visuais do tema "warmCareTheme" (MUI)
│   ├── types/
│   │   └── caregiver.ts                         # Contrato canônico de 8 campos e validação estrita (ADR-FE-011)
│   ├── App.tsx                                  # Provedor global de tema e CssBaseline
│   ├── index.css                                # Reset limpo de viewport e fundação @media print A4
│   └── main.tsx                                 # Ponto de entrada da aplicação React 19
├── tests/
│   ├── dashboardUiContract.test.tsx             # Suíte SSR de semântica HTML5, WCAG 2.2 AA e StrictMode
│   ├── governanceHygiene.test.ts                # Fitness Functions de CI, ADRs, Árvore e Clean-Room/LGPD
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
