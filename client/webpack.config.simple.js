/**
 * Simplified Webpack Configuration
 * For serving the existing static frontend
 */

const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = {
    mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',

    // Keep a neutral entrypoint so the copy-only build no longer points at
    // Deprecated legacy frontend scripts.
    entry: path.resolve(__dirname, 'public/js/config.js'),

    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: 'bundle.js',
        clean: true
    },

    // Just copy everything from public to dist
    plugins: [
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'public',
                    to: '.',
                    globOptions: {
                        ignore: [
                            '**/node_modules/**',
                            '**/test/**',
                            '**/shared/auth-setup.html',
                            '**/js/auth-setup.js',
                            '**/*.original'
                        ]
                    }
                }
            ]
        })
    ],

    devServer: {
        static: {
            directory: path.join(__dirname, 'public')
        },
        compress: true,
        port: 3000,
        hot: true,
        open: true,
        proxy: [{
            context: ['/api'],
            target: 'http://localhost:5000',
            changeOrigin: true
        }]
    }
};
