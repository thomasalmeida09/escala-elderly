## 🎯 Objetivo deste Pull Request

<!-- Descreva de forma clara e direta O QUE mudou e POR QUÊ essa decisão foi tomada -->

- **Issue vinculada:** `Closes #`
- **Tipo de mudança (`Fowler's Two Hats`):**
  - [ ] `feat:` Nova funcionalidade (mudança de comportamento)
  - [ ] `fix:` Correção de bug (mudança de comportamento)
  - [ ] `refactor:` Refatoração estrutural pura (sem alterar comportamento externo)
  - [ ] `chore:` / `docs:` / `test:` Infraestrutura, documentação ou testes

---

## 🛡️ Checklist Automatizado de Engenharia & Governança

### 1. Qualidade & Arquitetura Frontend (`agency-frontend-developer` & `ADRs`)
- [ ] **Zero-Bloat Dependency:** Nenhuma biblioteca redundante (`lodash`, `moment`, `axios`, `uuid`) foi adicionada onde Web APIs nativas resolvem.
- [ ] **Design System (`ADR-002` & `ADR-004`):** Estilos utilizam MUI `sx` / `.styles.ts` e o wrapper `<Text />` sem cores hexadecimais soltas fora do `theme.ts`.
- [ ] **Estado Explícito (`ADR-006`):** Componentes visuais não misturam lógica de domínio/fetch diretamente dentro do JSX.

### 2. Pragmatic Code Review & Git Hygiene (`agency-code-reviewer` & `agency-git-workflow-master`)
- [ ] **Zero Broken Windows:** Sem blocos `catch {}` vazios, `console.log` de debug esquecidos, ou `any` silenciosos.
- [ ] **Commits Atômicos:** Cada commit representa uma mudança coesa que pode ser revertida individualmente se necessário.

### 3. Segurança & Higiene de Dados LGPD (`agency-clean-room-data-hygiene-engineer` & `agency-secrets-credential-hygiene-engineer`)
- [ ] **Clean-Room & Zero PII:** Nenhum nome real de paciente/cuidador, CPF, telefone real ou PDF de referência foi incluído em `src/mocks/`, testes ou assets públicos.
- [ ] **Zero Segredos:** Nenhum arquivo `.env` ou chave privada foi comitado (variáveis `VITE_*` contêm apenas configurações públicas seguras).

---

## 📸 Evidência Visual / Como Testar

<!-- Cole aqui um print/GIF da tela ou os passos rápidos para o revisor validar -->
