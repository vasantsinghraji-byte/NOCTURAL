/**
 * Webpack Configuration for Frontend Build Process
 */

const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const TerserPlugin = require('terser-webpack-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

const isProduction = process.env.NODE_ENV === 'production';

module.exports = {
    mode: isProduction ? 'production' : 'development',
    entry: {
        main: './public/app.js',
        api: './public/api.js',
        'firebase-config': './public/firebase-config.js'
    },
    output: {
        path: path.resolve(__dirname, 'dist'),
        filename: isProduction ? 'js/[name].[contenthash:8].js' : 'js/[name].js',
        chunkFilename: isProduction ? 'js/[name].[contenthash:8].chunk.js' : 'js/[name].chunk.js',
        clean: true,
        publicPath: '/'
    },
    devtool: isProduction ? 'source-map' : 'eval-source-map',
    optimization: {
        minimize: isProduction,
        minimizer: [
            new TerserPlugin({
                terserOptions: {
                    compress: {
                        drop_console: isProduction,
                        drop_debugger: isProduction
                    }
                }
            }),
            new CssMinimizerPlugin()
        ],
        splitChunks: {
            chunks: 'all',
            cacheGroups: {
                vendor: {
                    test: /[\\/]node_modules[\\/]/,
                    name: 'vendors',
                    priority: 10
                },
                common: {
                    minChunks: 2,
                    priority: 5,
                    reuseExistingChunk: true
                }
            }
        },
        runtimeChunk: 'single'
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                exclude: /node_modules/,
                use: {
                    loader: 'babel-loader',
                    options: {
                        presets: ['@babel/preset-env'],
                        cacheDirectory: true
                    }
                }
            },
            {
                test: /\.css$/,
                use: [
                    isProduction ? MiniCssExtractPlugin.loader : 'style-loader',
                    'css-loader',
                    'postcss-loader'
                ]
            },
            {
                test: /\.(png|svg|jpg|jpeg|gif|ico)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'images/[name].[hash:8][ext]'
                }
            },
            {
                test: /\.(woff|woff2|eot|ttf|otf)$/i,
                type: 'asset/resource',
                generator: {
                    filename: 'fonts/[name].[hash:8][ext]'
                }
            }
        ]
    },
    plugins: [
        new MiniCssExtractPlugin({
            filename: isProduction ? 'css/[name].[contenthash:8].css' : 'css/[name].css',
            chunkFilename: isProduction ? 'css/[name].[contenthash:8].chunk.css' : 'css/[name].chunk.css'
        }),
        new CopyWebpackPlugin({
            patterns: [
                {
                    from: 'public/**/*.html',
                    to: '[name][ext]',
                    transform(content, path) {
                        // Add cache-busting and optimization meta tags
                        return content.toString().replace(
                            '</head>',
                            `  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>`
                        );
                    }
                },
                {
                    from: 'public/src/css',
                    to: 'css',
                    noErrorOnMissing: true
                },
                {
                    from: 'public/src/js',
                    to: 'js',
                    noErrorOnMissing: true
                }
            ]
        }),
        // Generate HTML files for main pages
        new HtmlWebpackPlugin({
            template: './public/index.html',
            filename: 'index.html',
            chunks: ['main', 'firebase-config', 'api'],
            minify: isProduction ? {
                removeComments: true,
                collapseWhitespace: true,
                removeRedundantAttributes: true,
                useShortDoctype: true,
                removeEmptyAttributes: true,
                removeStyleLinkTypeAttributes: true,
                keepClosingSlash: true,
                minifyJS: true,
                minifyCSS: true,
                minifyURLs: true
            } : false
        })
    ],
    devServer: {
        static: {
            directory: path.join(__dirname, 'public')
        },
        compress: true,
        port: 3000,
        hot: true,
        historyApiFallback: true,
        proxy: {
            '/api': {
                target: 'http://localhost:5000',
                changeOrigin: true
            }
        }
    },
    performance: {
        hints: isProduction ? 'warning' : false,
        maxEntrypointSize: 512000,
        maxAssetSize: 512000
    }
};
