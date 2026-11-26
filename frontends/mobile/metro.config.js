// Metro config: let the app import the shared TS package that lives one level
// up (../shared) even though it is outside this app's own folder.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const sharedRoot = path.resolve(projectRoot, '../shared');

const config = getDefaultConfig(projectRoot);

// Watch the shared package so edits hot-reload.
config.watchFolders = [sharedRoot];

// Resolve node_modules from the app first, then fall back where needed.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules')
];

module.exports = config;
