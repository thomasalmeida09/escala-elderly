## 🎯 Objetivo deste Pull Request

<!-- Descreva de forma clara e direta O QUE mudou e POR QUÊ essa decisão foi tomada -->

- **Issue vinculada (`ADR-FE-007` & `ADR-FE-010`):** `Closes #`
- **Tipo de mudança (`Fowler's Two Hats`):**
  - [ ] `feat:` Nova funcionalidade (mudança de comportamento)
  - [ ] `fix:` Correção de bug (mudança de comportamento)
  - [ ] `refactor:` Refatoração estrutural pura (sem alterar comportamento externo)
  - [ ] `ci:` / `chore:` / `docs:` / `style:` / `test:` Governança, CI, formatação, documentação ou testes

---

## 🛡️ Checklist Automatizado de Engenharia & Governança

### 1. Stack, Tipagem, Testes & Arquitetura Frontend (`agency-frontend-developer` & `ADRs`)

- [ ] **Stack, Build, Vitest & Zero-Bloat (`ADR-FE-002` & `ADR-FE-009`):** `bun install --frozen-lockfile`, `bun run format:check`, `bun run lint`, `bun run test` e `bun run build` passam 100% verdes localmente; nenhum lockfile concorrente (`package-lock.json`, `yarn.lock`, `pnpm-lock.yaml`) ou biblioteca redundante (`lodash`, `moment`, `axios`, `classnames`, `uuid`) foi adicionado.
- [ ] **Design System Material UI (`ADR-FE-003`):** Estilos isolados em arquivos `.styles.ts` / `sx` consumindo os tokens de `src/theme/theme.ts` (`warmCareTheme`) e o wrapper `<Text />`, sem hexadecimais soltos fora do tema.
- [ ] **Custom Hooks, Local-First, Cobertura CLT, Planilha CSV & Contrato JSON Canônico (`ADR-FE-004`, `ADR-FE-011`, `ADR-FE-012` & `ADR-FE-013`):** Componentes visuais permanecem desacoplados de estado/fetch (`src/hooks/` + `src/services/`), blindam contra CSV Formula Injection (OWASP) e preservam paridade estrita do contrato `Cuidador` com o Backend (`id: 3 = Carlos Rocha`).

### 2. Formatação, Pragmatic Code Review & Git Hygiene (`agency-code-reviewer` & `agency-git-workflow-master`)

- [ ] **Formatação Prettier/LF & Zero Broken Windows (`ADR-FE-008`):** Arquivos salvos em `UTF-8` sem BOM e quebras de linha `LF`; zero `debugger;`, zero blocos `catch {}` vazios e zero `any` silenciosos.
- [ ] **Governança de Branches & Commits Atômicos (`ADR-FE-010`):** Cada commit segue _Conventional Commits_, respeita _Fowler's Two Hats_ e pode ser revertido individualmente sem quebrar `git bisect`.

### 3. Segurança & Higiene de Dados LGPD (`agency-clean-room-data-hygiene-engineer` & `agency-secrets-credential-hygiene-engineer`)

- [ ] **Clean-Room & Zero PII:** Nenhum nome real de paciente/cuidador, CPF/CNPJ, e-mail fora de domínios RFC 2606 (`@example.com`) ou PDF de referência foi incluído em `src/`, `public/` ou `tests/`.
- [ ] **Zero Segredos:** Nenhum arquivo `.env`, chave privada ou token foi comitado (variáveis `VITE_*` contêm apenas configurações públicas seguras).

---

## 📸 Evidência Visual / Como Testar

<!-- Cole aqui um print/GIF da tela e os comandos executados para o revisor validar -->
