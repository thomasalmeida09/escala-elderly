# 🏥 Escala Elderly — Painel do Gerente (Frontend)

![React](https://img.shields.io/badge/React-19.2-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-6.0-3178C6?logo=typescript&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8.1-646CFF?logo=vite&logoColor=white)
![MUI](https://img.shields.io/badge/Material_UI-v9_Warm_Care-007A78?logo=mui&logoColor=white)
![Status](<https://img.shields.io/badge/Status-Sprint_1_(Fundação)-success>)

Sistema web de monitoramento e gestão inteligente de escalas de cuidadores para **Instituições de Longa Permanência para Idosos (ILPIs)**, clínicas geriátricas e operações de **Home Care**.

---

## 🧭 Links Rápidos de Governança & Gestão da Equipe

| Recurso de Governança                         | Acesso Direto                                                                             | Descrição                                                                          |
| :-------------------------------------------- | :---------------------------------------------------------------------------------------- | :--------------------------------------------------------------------------------- |
| 📊 **Quadro Kanban Interativo**               | **[GitHub Projects (Front + Back)](https://github.com/users/augustoheiss/projects/1)**    | Quadro unificado com o status em tempo real de todas as tarefas da equipe          |
| 🖼️ **Mapa Visual da Arquitetura (PR Lens)**   | **[Canvas Técnico & ADRs (`prlens.dev`)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)**   | Diagramas animados de arquitetura, _blast radius_ das Sprints e payloads JSON      |
| 👶 **Explicação Passo a Passo (ELI5 Canvas)** | **[Walkthrough Onboarding (`prlens.dev`)](https://prlens.dev/c/x2StISYcAmXvy49MhetrsQ)**  | Tour visual progressivo de como o sistema resolve uma falta no plantão             |
| 🏛️ **Catálogo de ADRs do Frontend**           | **[`docs/adr/README.md`](./docs/adr/README.md)**                                          | Decisões arquiteturais já tomadas (porquê e _trade-offs_) e decisões de governança |
| 🗺️ **Divisão por Sprints e Colunas**          | **[`docs/adr/QUADRO-KANBAN-SPRINTS.md`](./docs/adr/QUADRO-KANBAN-SPRINTS.md)**            | Mapa completo das 14 Issues distribuídas entre as Sprints 1, 2 e 3                 |
| ☕ **Repositório Backend (API Java)**         | **[`escala-elderly-backend`](https://github.com/thomasalmeida09/escala-elderly-backend)** | API REST em Java 17 + Spring Boot 4.1 que alimenta este painel                     |

### 🎬 Diagrama Interativo da Arquitetura (PR Lens)

[![Arquitetura Escala Elderly — PR Lens](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog.svg)](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)

> 💡 _Clique no diagrama acima para abrir o **[Canvas Interativo no PR Lens](https://prlens.dev/c/L-2rShWu_j0WpKt-jT0Cog)** (ou acesse o **[Tour Visual ELI5 para Onboarding](https://prlens.dev/c/x2StISYcAmXvy49MhetrsQ)**)._

---

## 🎯 Sobre o Projeto

Na rotina de clínicas de repouso e Home Care, **furos de escala de última hora** (como a falta imprevista de um cuidador na troca de plantão) geram desorganização operacional em grupos de WhatsApp e custos elevados com plantonistas de emergência.

O **Escala Elderly** substitui o controle em papel por um **Painel do Gerente** intuitivo, construído sob a estética **"Warm Care + Tech Industrial"**:

- **Visibilidade Instantânea:** Identificação imediata de quem está `PRESENTE` (Verde Esmeralda `#007A78`) e quem `FALTOU` (Alerta Âmbar `#D97706`).
- **Simulação e Gestão de Alertas:** Painel rápido para registrar ausências e acionar a cobertura de plantão.
- **Arquitetura Resiliente (Local-First + REST API):** Projetado para operar com resposta instantânea no navegador sincronizado à API Spring Boot.

---

## 🏗️ Arquitetura e Estrutura de Pastas

O projeto segue o padrão de **Componentização com Estilos Isolados (`.styles.ts`)** e separação de regras de estado em **Custom Hooks**:

```text
escala-elderly/
├── docs/
│   └── adr/
│       ├── README.md                      # Catálogo de ADRs (Grupo 1: Tomadas | Grupo 2: Governança)
│       └── QUADRO-KANBAN-SPRINTS.md       # Divisão das Issues por Sprints e Colunas
├── src/
│   ├── components/
│   │   ├── CardCuidador/                  # Card individual de status do cuidador (.tsx + .styles.ts)
│   │   ├── SimuladorPainel/               # Painel de controle para simulação de alertas (.tsx + .styles.ts)
│   │   └── common/
│   │       └── Text.tsx                   # Wrapper tipográfico padronizado do Design System
│   ├── hooks/
│   │   └── useCaregivers.ts               # Custom Hook de estado e integração de dados
│   ├── mocks/
│   │   └── Caregive.json                  # Dados iniciais para simulação local
│   ├── pages/
│   │   ├── Dashboard.tsx                  # Tela principal do Painel do Gerente
│   │   └── Dashboard.styles.ts            # Estilos isolados do Dashboard
│   ├── theme/
│   │   └── theme.ts                       # Tokens visuais do tema "warmCareTheme" (MUI)
│   ├── App.tsx                            # Provedor global de tema e CssBaseline
│   └── main.tsx                           # Ponto de entrada da aplicação React 19
└── package.json
```

---

## 🚀 Como Executar o Projeto Localmente

### Pré-requisitos

- [Bun](https://bun.sh/) (recomendado, pois o projeto utiliza `bun.lock`) ou [Node.js 20+](https://nodejs.org/).

### Passo a passo

```bash
# 1. Instalar as dependências
bun install

# 2. Iniciar o servidor de desenvolvimento (Vite HMR)
bun run dev

# 3. Validar o Linter (ESLint) e o Build de Produção (TypeScript + Vite)
bun run lint
bun run build
```

A aplicação estará disponível em **`http://localhost:5173`**.

---

## 🤝 Fluxo de Trabalho da Equipe (Resumo das ADRs)

1. **Gestão de Tarefas:** Escolha uma Issue na coluna `🎯 Sprint 1 (To Do - Fundação)` do [GitHub Projects](https://github.com/users/augustoheiss/projects/1) e atribua seu usuário (`Assignee`).
2. **Padrão de Branches:** Crie uma branch a partir da `main` seguindo o padrão `feat/issue-XX-descricao` ou `fix/issue-XX-descricao`.
3. **Padrão de Commits:** Utilize _Conventional Commits_ (`feat:`, `fix:`, `docs:`, `style:`, `refactor:`, `ci:`).
4. **Pull Requests (PRs):** Abra um PR referenciando a Issue (`Closes #XX`), aguarde a validação do **GitHub Actions (CI)** e solicite **1 Code Review** de um colega antes do _Squash and Merge_.
