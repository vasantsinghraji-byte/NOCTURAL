# Archived Microservice Experiment

This directory preserves the previous microservice extraction experiment for reference only.

The active production architecture is a modular monolith:

- Root `server.js` / `app.js` is the web runtime.
- Root `package.json` owns dependency installation.
- The root Dockerfile does not copy archived packages.
- Jest ignores `archive/`.

Do not add imports, workspace entries, Docker build steps, or deployment configuration that depends on this archive.
