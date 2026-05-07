#!/usr/bin/env node

const { spawnSync } = require('child_process');

const CHECK = '\u2713';
const CROSS = '\u2717';
const WARN = '!';

function commandLabel(command, args) {
  return [command, ...args].join(' ');
}

function quoteForShell(value) {
  if (!/[\s"]/u.test(value)) {
    return value;
  }

  return `"${value.replace(/"/g, '\\"')}"`;
}

function runCommand(command, args = [], options = {}) {
  const useShell = Boolean(options.shell);
  const spawnCommand = useShell
    ? [quoteForShell(command), ...args.map(quoteForShell)].join(' ')
    : command;
  const spawnArgs = useShell ? [] : args;

  const result = spawnSync(spawnCommand, spawnArgs, {
    encoding: 'utf8',
    windowsHide: true,
    shell: useShell
  });

  return {
    command: useShell ? spawnCommand : commandLabel(command, args),
    ok: !result.error && result.status === 0,
    status: result.status,
    stdout: (result.stdout || '').trim(),
    stderr: (result.stderr || '').trim(),
    error: result.error ? result.error.message : ''
  };
}

function firstLine(output) {
  return output.split(/\r?\n/).find(Boolean) || '';
}

function logResult(result, label, options = {}) {
  if (result.ok) {
    const detail = firstLine(result.stdout || result.stderr);
    console.log(`${CHECK} ${label}${detail ? `: ${detail}` : ''}`);
    return true;
  }

  const marker = options.optional ? WARN : CROSS;
  const detail = firstLine(result.stderr || result.stdout || result.error) || `failed: ${result.command}`;
  console.log(`${marker} ${label}: ${detail}`);
  return Boolean(options.optional);
}

function checkGitBash() {
  if (process.platform !== 'win32') {
    return logResult(runCommand('bash', ['--version']), 'Bash');
  }

  const bashPath = 'C:\\Program Files\\Git\\usr\\bin\\bash.exe';
  const envPath = 'C:\\Program Files\\Git\\usr\\bin\\env.exe';
  const bashOk = logResult(runCommand(bashPath, ['--version']), 'Git Bash');
  logResult(runCommand(envPath, ['bash', '--version']), 'Git env.exe bash', { optional: true });
  const envNodeOk = logResult(runCommand(envPath, ['node', '--version']), 'Git env.exe node for hooks');
  const whereBash = runCommand('where.exe', ['bash']);

  if (whereBash.ok) {
    const paths = whereBash.stdout.split(/\r?\n/).filter(Boolean);
    const firstPath = paths[0] || '';
    if (/\\System32\\bash\.exe$/i.test(firstPath)) {
      console.log(`${WARN} PATH bash resolves to WSL first: ${firstPath}`);
      console.log('  Prefer explicit Git Bash: C:\\Program Files\\Git\\bin\\bash.exe');
    } else {
      console.log(`${CHECK} PATH bash resolves to: ${firstPath}`);
    }
  } else {
    console.log(`${WARN} PATH bash lookup failed: ${firstLine(whereBash.stderr || whereBash.error)}`);
  }

  return bashOk && envNodeOk;
}

function checkRequiredTool(label, command, args = [], options = {}) {
  return logResult(runCommand(command, args, options), label);
}

function checkGitHubAuth() {
  return logResult(runCommand('gh', ['auth', 'status']), 'GitHub CLI auth');
}

function checkRenderAuth() {
  return logResult(runCommand('render', ['whoami', '--output', 'json']), 'Render CLI auth');
}

function main() {
  console.log('Nocturnal local doctor');
  console.log('======================');

  const checks = [
    checkGitBash(),
    checkRequiredTool('Git', 'git', ['--version']),
    checkRequiredTool('Node', 'node', ['--version']),
    checkRequiredTool('npm', process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'], { shell: process.platform === 'win32' }),
    checkRequiredTool('Docker', 'docker', ['--version']),
    checkGitHubAuth(),
    checkRenderAuth()
  ];

  if (checks.every(Boolean)) {
    console.log('');
    console.log(`${CHECK} Local development prerequisites passed.`);
    return;
  }

  console.log('');
  console.log(`${CROSS} Local development prerequisites need attention.`);
  console.log('Use --no-verify only as an emergency fallback after reviewing the hook output.');
  process.exit(1);
}

main();
