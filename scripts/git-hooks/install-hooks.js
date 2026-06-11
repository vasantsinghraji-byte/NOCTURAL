const { spawnSync } = require('child_process');

const HOOKS_PATH = '.githooks';

function run(command, args = []) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    stdio: 'pipe',
    windowsHide: true
  });
}

function firstLine(output) {
  return String(output || '').split(/\r?\n/u).find(Boolean) || '';
}

function git(args) {
  return run('git', args);
}

function gitShellCommand() {
  if (process.platform === 'win32') {
    return 'C:\\Program Files\\Git\\usr\\bin\\sh.exe';
  }

  return 'sh';
}

function gitShellIsHealthy() {
  const shell = gitShellCommand();
  const result = run(shell, ['--version']);

  return {
    ok: !result.error && result.status === 0,
    detail: firstLine(result.stderr || result.stdout || (result.error && result.error.message))
  };
}

function unsetHooksPath() {
  git(['config', '--unset-all', 'core.hooksPath']);
}

function main() {
  const shell = gitShellIsHealthy();

  if (!shell.ok) {
    unsetHooksPath();
    console.warn(`Skipping git hooks setup: Git shell is not healthy${shell.detail ? ` (${shell.detail})` : ''}`);
    console.warn('Run npm run doctor:local for details. CI still enforces the same checks.');
    return;
  }

  const result = git(['config', 'core.hooksPath', HOOKS_PATH]);

  if (result.error || result.status !== 0) {
    console.warn(`Skipping git hooks setup: ${firstLine(result.stderr || result.error.message)}`);
  }
}

main();
