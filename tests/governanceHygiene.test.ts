import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(currentDir, '..');

function readRepoFile(relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function walkRepoFiles(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === 'coverage') {
      continue;
    }
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkRepoFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

const CPF_CNPJ_PATTERN =
  /\b[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2}\b|\b[0-9]{2}\.[0-9]{3}\.[0-9]{3}\/[0-9]{4}-[0-9]{2}\b/;

const NON_RESERVED_EMAIL_PATTERN =
  /\b[A-Za-z0-9._%+-]+@(?!([A-Za-z0-9-]+\.)?(example\.(com|org|net)|test|invalid|localhost)\b)[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;

const ANY_ADR_REFERENCE_PATTERN = /\bADR-(?:[A-Z]+-)?\d+\b/g;
const CANONICAL_FE_ADR_PATTERN = /^ADR-FE-\d{3}$/;

interface RulesetFile {
  enforcement: string;
  rules: Array<{
    type: string;
    parameters?: {
      strict_required_status_checks_policy?: boolean;
      required_status_checks?: Array<{ context: string }>;
    };
  }>;
}

interface PackageJsonFile {
  scripts?: Record<string, string>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

interface CaregiverSeedRow {
  id: number;
  nome: string;
  status: string;
  turno?: string;
  quarto?: string;
}

function extractCiJobNames(ciYaml: string): string[] {
  const lines = ciYaml.split('\n');
  const jobNames: string[] = [];
  let inJobs = false;
  let currentJobIndent = -1;

  for (const line of lines) {
    if (/^jobs:\s*$/.test(line)) {
      inJobs = true;
      continue;
    }
    if (!inJobs) continue;
    if (/^[A-Za-z0-9_-]+:/.test(line)) {
      break;
    }
    const jobMatch = line.match(/^ {2}([a-z0-9_-]+):\s*$/);
    if (jobMatch) {
      currentJobIndent = 2;
      continue;
    }
    if (currentJobIndent === 2) {
      const nameMatch = line.match(/^ {4}name:\s*(.+?)\s*$/);
      if (nameMatch) {
        jobNames.push(nameMatch[1].replace(/^['"]|['"]$/g, ''));
        currentJobIndent = -1;
      }
    }
  }
  return jobNames;
}

function parseReadmeTreePaths(readmeContent: string): string[] {
  const fenceMatch = readmeContent.match(/```text\n(escala-elderly\/[\s\S]*?)```/);
  if (!fenceMatch) {
    throw new Error('Could not locate escala-elderly/ directory tree block in README.md');
  }

  const lines = fenceMatch[1].trim().split('\n').slice(1);
  const stack: string[] = [];
  const extractedPaths: string[] = [];

  for (const rawLine of lines) {
    const cleanLine = rawLine.split('#')[0].trimEnd();
    const branchMatch = cleanLine.match(/^([│ ]*)(?:├── |└── )(.+)$/);
    if (!branchMatch) {
      throw new Error(`Malformed tree line in README.md: "${rawLine}"`);
    }

    const prefix = branchMatch[1];
    const entryName = branchMatch[2].trim();
    const depth = prefix.length / 4;
    if (!Number.isInteger(depth)) {
      throw new Error(`Invalid 4-space tree indentation in README.md: "${rawLine}"`);
    }

    stack.length = depth;
    const cleanSegment = entryName.replace(/\/$/, '');
    stack.push(cleanSegment);

    const relPath = stack.join('/');
    extractedPaths.push(entryName.endsWith('/') ? `${relPath}/` : relPath);
  }

  return extractedPaths;
}

describe('Governance, Supply-Chain & Clean-Room Architectural Fitness Suite', () => {
  it('1. preserves 1:1 status-check context parity between ci.yml and ruleset-main-protection.json', () => {
    const ciYaml = readRepoFile('.github/workflows/ci.yml');
    const ruleset = JSON.parse(readRepoFile('.github/ruleset-main-protection.json')) as RulesetFile;

    expect(ruleset.enforcement).toBe('active');
    expect(ruleset.rules.some((r) => r.type === 'required_linear_history')).toBe(true);

    const statusCheckRule = ruleset.rules.find((r) => r.type === 'required_status_checks');
    expect(statusCheckRule?.parameters?.strict_required_status_checks_policy).toBe(true);

    const expectedContexts =
      statusCheckRule?.parameters?.required_status_checks?.map((c) => c.context) ?? [];
    const ciJobNames = extractCiJobNames(ciYaml);

    expect(ciJobNames).toEqual([
      'Build, Typecheck, Lint & Bundle Budget Gate',
      'Secret, Credential & LGPD Clean-Room Hygiene Gate',
    ]);
    expect(ciJobNames).toEqual(expectedContexts);
  });

  it('2. enforces Node 24 40-char SHA pinning, ubuntu-24.04, Bun 1.4.4, and mandatory CI gates', () => {
    const ciYaml = readRepoFile('.github/workflows/ci.yml');

    expect(ciYaml).toMatch(/^permissions:\n {2}contents: read$/m);
    expect(ciYaml).toMatch(/^env:\n {2}LC_ALL: C\.UTF-8$/m);
    expect(ciYaml).not.toContain('ubuntu-latest');

    const runsOnMatches = [...ciYaml.matchAll(/^\s+runs-on:\s*(\S+)/gm)].map((m) => m[1]);
    expect(runsOnMatches.length).toBeGreaterThanOrEqual(2);
    for (const runner of runsOnMatches) {
      expect(runner).toBe('ubuntu-24.04');
    }

    const usesMatches = [...ciYaml.matchAll(/^\s*-?\s*uses:\s*([^\s#]+)/gm)].map((m) => m[1]);
    expect(usesMatches.length).toBeGreaterThanOrEqual(3);
    for (const actionRef of usesMatches) {
      expect(actionRef).toMatch(/^[a-z0-9-]+\/[a-z0-9._-]+@[0-9a-f]{40}$/i);
    }

    expect(ciYaml).toContain("bun-version: '1.4.4'");
    expect(ciYaml).not.toMatch(/bun-version:\s*['"]?latest['"]?/);

    for (const mandatoryGate of [
      'bun install --frozen-lockfile',
      'bun run format:check',
      'bun run lint',
      'bun run test',
      'bun run build',
      'gzip -n -9 -c',
      'LC_ALL=C xargs -0 grep -l',
    ]) {
      expect(ciYaml).toContain(mandatoryGate);
    }
  });

  it('3. enforces strict ADR-FE-001..011 referential integrity across PR template, README, and CODEOWNERS', () => {
    const adrCatalog = readRepoFile('docs/adr/README.md');
    const prTemplate = readRepoFile('.github/pull_request_template.md');
    const readme = readRepoFile('README.md');
    const codeowners = readRepoFile('.github/CODEOWNERS');

    const catalogHeadings = [...adrCatalog.matchAll(/^### .*?(ADR-FE-\d{3}):/gm)].map((m) => m[1]);
    expect(catalogHeadings).toEqual([
      'ADR-FE-001',
      'ADR-FE-002',
      'ADR-FE-003',
      'ADR-FE-004',
      'ADR-FE-005',
      'ADR-FE-006',
      'ADR-FE-007',
      'ADR-FE-008',
      'ADR-FE-009',
      'ADR-FE-010',
      'ADR-FE-011',
    ]);
    const catalogSet = new Set(catalogHeadings);

    // Self-verify saboteur detection against unprefixed or non-existent ADR tokens
    const unprefixedToken = ['ADR', '002'].join('-');
    const phantomToken = ['ADR', 'FE', '099'].join('-');
    expect(CANONICAL_FE_ADR_PATTERN.test(unprefixedToken)).toBe(false);
    expect(catalogSet.has(phantomToken)).toBe(false);

    for (const [docName, content] of [
      ['.github/pull_request_template.md', prTemplate],
      ['README.md', readme],
      ['docs/adr/README.md', adrCatalog],
    ] as const) {
      const references = content.match(ANY_ADR_REFERENCE_PATTERN) ?? [];
      expect(references.length).toBeGreaterThan(0);
      for (const ref of references) {
        expect(
          CANONICAL_FE_ADR_PATTERN.test(ref),
          `${docName} contains non-canonical ADR token "${ref}" (expected ADR-FE-XXX)`
        ).toBe(true);
        expect(
          catalogSet.has(ref),
          `${docName} cites unknown "${ref}" missing from docs/adr/README.md`
        ).toBe(true);
      }
    }

    for (const implementedAdr of catalogHeadings) {
      const sectionRegex = new RegExp(
        `### .*?${implementedAdr}:[\\s\\S]*?- \\*\\*Status:\\*\\* \`ACEITA / IMPLEMENTADA\``
      );
      expect(adrCatalog).toMatch(sectionRegex);
    }

    for (const protectedPath of [
      '/.github/',
      '/docs/adr/',
      '/src/theme/',
      '/src/hooks/',
      '/src/services/',
      '/src/types/',
      '/tests/',
    ]) {
      expect(codeowners).toContain(protectedPath);
    }
  });

  it('4. guarantees 1:1 filesystem parity for the README.md tree and full Prettier coverage', () => {
    const readme = readRepoFile('README.md');
    const treeEntries = parseReadmeTreePaths(readme);
    expect(treeEntries.length).toBeGreaterThanOrEqual(45);

    for (const entry of treeEntries) {
      const targetPath = path.join(repoRoot, entry.replace(/\/$/, ''));
      expect(fs.existsSync(targetPath), `README.md documents non-existent path: "${entry}"`).toBe(
        true
      );

      const stats = fs.statSync(targetPath);
      if (entry.endsWith('/')) {
        expect(stats.isDirectory(), `"${entry}" has trailing slash but is not a directory`).toBe(
          true
        );
      } else {
        expect(stats.isFile(), `"${entry}" has no trailing slash but is not a file`).toBe(true);
      }
    }

    const documentedSet = new Set(treeEntries);
    const rootEntries = fs
      .readdirSync(repoRoot, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => e.name);
    for (const rootFile of rootEntries) {
      expect(
        documentedSet.has(rootFile),
        `Root file "${rootFile}" is missing from the README.md architecture tree`
      ).toBe(true);
    }

    const trackedSubtreeFiles = [
      ...walkRepoFiles(path.join(repoRoot, 'src')),
      ...walkRepoFiles(path.join(repoRoot, 'tests')),
      ...walkRepoFiles(path.join(repoRoot, 'public')),
    ];
    for (const absFile of trackedSubtreeFiles) {
      const posixRel = path.relative(repoRoot, absFile).split(path.sep).join('/');
      expect(
        documentedSet.has(posixRel),
        `Repository file "${posixRel}" is missing from the README.md architecture tree`
      ).toBe(true);
    }

    const prettierIgnoreLines = readRepoFile('.prettierignore')
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith('#'));
    expect(prettierIgnoreLines).not.toContain('.github/');
    expect(prettierIgnoreLines).not.toContain('.github');
    expect(prettierIgnoreLines).not.toContain('docs/');
    expect(prettierIgnoreLines).not.toContain('docs');
  });

  it('5. enforces package.json script contracts, zero-bloat dependencies, and TypeScript orthogonality', () => {
    const pkg = JSON.parse(readRepoFile('package.json')) as PackageJsonFile;

    for (const scriptName of [
      'dev',
      'build',
      'lint',
      'format',
      'format:check',
      'test',
      'test:watch',
      'preview',
    ]) {
      expect(pkg.scripts?.[scriptName]).toBeTruthy();
    }

    const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };
    for (const banned of [
      'lodash',
      'moment',
      'axios',
      'classnames',
      'uuid',
      'tailwindcss',
      'postcss',
      'autoprefixer',
    ]) {
      expect(allDeps).not.toHaveProperty(banned);
    }

    expect(pkg.dependencies).not.toHaveProperty('vitest');
    expect(pkg.devDependencies).toHaveProperty('vitest');

    expect(fs.existsSync(path.join(repoRoot, 'bun.lock'))).toBe(true);
    for (const competingLockfile of ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml']) {
      expect(fs.existsSync(path.join(repoRoot, competingLockfile))).toBe(false);
    }

    const tsAppRaw = readRepoFile('tsconfig.app.json');
    expect(tsAppRaw).toContain('"types": ["vite/client"]');
    expect(tsAppRaw).not.toContain('"node"');
    expect(tsAppRaw).toContain('"src/**/*.test.ts"');
    expect(tsAppRaw).toContain('"src/**/*.test.tsx"');

    const tsTestRaw = readRepoFile('tsconfig.test.json');
    expect(tsTestRaw).toContain(
      '"tsBuildInfoFile": "./node_modules/.tmp/tsconfig.test.tsbuildinfo"'
    );
  });

  it('6. enforces Clean-Room LGPD hygiene across src/public/tests and validates Caregive.json seed contract', () => {
    // Prove regex lethality dynamically without embedding literal PII strings in the repo
    const syntheticCpfProbe = ['123', '456', '789-00'].join('.');
    const syntheticLeakEmail = ['operador', 'clinica-externa.com.br'].join('@');
    expect(CPF_CNPJ_PATTERN.test(syntheticCpfProbe)).toBe(true);
    expect(NON_RESERVED_EMAIL_PATTERN.test(syntheticLeakEmail)).toBe(true);
    expect(NON_RESERVED_EMAIL_PATTERN.test('operador@example.com')).toBe(false);

    const auditedFiles = [
      ...walkRepoFiles(path.join(repoRoot, 'src')),
      ...walkRepoFiles(path.join(repoRoot, 'public')),
      ...walkRepoFiles(path.join(repoRoot, 'tests')),
    ];
    expect(auditedFiles.length).toBeGreaterThanOrEqual(12);

    const violations: string[] = [];
    for (const file of auditedFiles) {
      const rel = path.relative(repoRoot, file);
      if (file.toLowerCase().endsWith('.pdf')) {
        violations.push(`${rel}: bundled PDF binary forbidden`);
        continue;
      }
      if (!/\.(ts|tsx|js|json|css|html|svg)$/.test(file)) continue;
      const content = fs.readFileSync(file, 'utf8');
      if (CPF_CNPJ_PATTERN.test(content)) {
        violations.push(`${rel}: Brazilian CPF/CNPJ pattern detected`);
      }
      const emailMatch = content.match(NON_RESERVED_EMAIL_PATTERN);
      if (emailMatch) {
        violations.push(`${rel}: non-RFC-2606 email "${emailMatch[0]}"`);
      }
    }
    expect(violations).toEqual([]);

    const seed = JSON.parse(readRepoFile('src/mocks/Caregive.json')) as CaregiverSeedRow[];
    expect(Array.isArray(seed)).toBe(true);
    expect(seed.length).toBeGreaterThanOrEqual(4);

    const allowedStatuses = new Set(['Presente', 'Faltou', 'Folga', 'Cobertura']);
    const seenIds = new Set<number>();
    for (const row of seed) {
      expect(Number.isInteger(row.id) && row.id > 0).toBe(true);
      expect(seenIds.has(row.id)).toBe(false);
      seenIds.add(row.id);
      expect(row.nome.trim().length).toBeGreaterThan(0);
      expect(allowedStatuses.has(row.status)).toBe(true);
      expect(typeof row.turno === 'string' && row.turno.trim().length > 0).toBe(true);
      expect(typeof row.quarto === 'string' && row.quarto.trim().length > 0).toBe(true);
    }

    const carlos = seed.find((c) => c.id === 3);
    expect(carlos).toBeDefined();
    expect(carlos?.nome).toBe('Carlos Rocha');
  });
});
