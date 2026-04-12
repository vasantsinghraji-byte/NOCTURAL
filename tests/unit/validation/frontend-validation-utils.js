const fs = require('fs');
const path = require('path');
const rootDir = path.resolve(__dirname, '..', '..', '..');
const publicDir = path.join(rootDir, 'client', 'public');
const distDir = path.join(rootDir, 'client', 'dist');
const jsDir = path.join(publicDir, 'js');
const rolesDir = path.join(publicDir, 'roles');

const readDirectoryRecursively = (directoryPath, shouldIncludeFile) => {
  const entries = fs.readdirSync(directoryPath, { withFileTypes: true });

  return entries.flatMap((entry) => {
    const entryPath = path.join(directoryPath, entry.name);

    if (entry.isDirectory()) {
      if (entry.name === 'test') {
        return [];
      }

      return readDirectoryRecursively(entryPath, shouldIncludeFile);
    }

    if (!shouldIncludeFile(entry.name, entryPath)) {
      return [];
    }

    return [entryPath];
  });
};

const productionPagePaths = readDirectoryRecursively(publicDir, (fileName) => (
  fileName.endsWith('.html') && !fileName.endsWith('.original')
));

const productionFrontendScriptPaths = readDirectoryRecursively(publicDir, (fileName) => (
  fileName.endsWith('.js') && !fileName.endsWith('.original')
));

const roleHtmlFilePaths = readDirectoryRecursively(rolesDir, (fileName) => (
  fileName.endsWith('.html') && !fileName.endsWith('.original')
));

const frontendJsFilePaths = readDirectoryRecursively(jsDir, (fileName) => (
  fileName.endsWith('.js') && !fileName.endsWith('.original')
));

const buildOutputHtmlPaths = fs.existsSync(distDir)
  ? readDirectoryRecursively(distDir, (fileName) => (
      fileName.endsWith('.html') && !fileName.endsWith('.original')
    ))
  : [];

const toProjectRelativePath = (absolutePath) => path.relative(rootDir, absolutePath).replace(/\\/g, '/');

const listProjectRelativePaths = (absolutePaths) => absolutePaths.map(toProjectRelativePath).sort();

const productionServedHtmlPaths = productionPagePaths.filter((filePath) => (
  toProjectRelativePath(filePath) !== 'client/public/shared/auth-setup.html'
));

const guardedFrontendEventNames = [
  'blur',
  'change',
  'click',
  'contextmenu',
  'dblclick',
  'drag',
  'dragend',
  'dragenter',
  'dragleave',
  'dragover',
  'dragstart',
  'drop',
  'error',
  'focus',
  'focusin',
  'focusout',
  'input',
  'keydown',
  'keypress',
  'keyup',
  'load',
  'mousedown',
  'mouseenter',
  'mouseleave',
  'mousemove',
  'mouseout',
  'mouseover',
  'mouseup',
  'pointerdown',
  'pointerenter',
  'pointerleave',
  'pointermove',
  'pointerout',
  'pointerover',
  'pointerup',
  'reset',
  'resize',
  'scroll',
  'submit',
  'touchend',
  'touchmove',
  'touchstart',
  'wheel'
];

const guardedFrontendEventPattern = guardedFrontendEventNames.join('|');

const hardeningPatterns = {
  inlineScript: /<script(?![^>]*\bsrc=)/i,
  inlineHtmlHandler: /\son[a-z]+=/i,
  inlineHandlerString: new RegExp(`(?:['"\`\\s<])on(?:${guardedFrontendEventPattern})\\s*=`, 'i'),
  directHandlerAssignment: new RegExp(`\\.on(?:${guardedFrontendEventPattern})\\s*=`),
  unsafeJavascriptUrl: /\b(?:href|src|action)\s*=\s*["'`]javascript:/i,
  inlineStyle: /\sstyle=/ig
};

module.exports = {
  fs,
  distDir,
  buildOutputHtmlPaths,
  frontendJsFilePaths,
  hardeningPatterns,
  productionFrontendScriptPaths,
  productionPagePaths,
  productionServedHtmlPaths,
  roleHtmlFilePaths,
  rootDir,
  listProjectRelativePaths,
  toProjectRelativePath
};
