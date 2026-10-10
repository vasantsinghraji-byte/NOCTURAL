module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      [
        'module-resolver',
        {
          alias: {
            // Resolve the shared TS package from outside the app root.
            '@medrush/shared': '../shared/src/index.ts'
          },
          extensions: ['.ts', '.tsx', '.js', '.jsx', '.json']
        }
      ]
    ]
  };
};
