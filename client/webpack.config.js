const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const CopyWebpackPlugin = require('copy-webpack-plugin');

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';
    
    return {
        entry: './src/index.js',
        output: {
            path: path.join(__dirname, '/dist'),
            filename: 'bundle.js',
            publicPath: '/',
            // Reproducible build: use deterministic chunk and module IDs
            hashFunction: 'sha256',
            hashDigestLength: 16
        },
        // Reproducible build: deterministic module/chunk IDs
        optimization: {
            moduleIds: 'deterministic',
            chunkIds: 'deterministic'
        },
        devServer: {
            port: 3881,
            historyApiFallback: true,
            hot: !isProduction,
            liveReload: !isProduction,
            static: {
                directory: path.join(__dirname, 'public'),
                publicPath: '/'
            },
            client: isProduction ? false : {
                webSocketURL: 'wss://c.growheads.de/ws',
            },
            proxy: {
                '/api': 'http://localhost:3001',
                '/uploads': 'http://localhost:3001',
                '/socket.io': {
                    target: 'http://localhost:3001',
                    ws: true
                },
                '/auth': 'http://localhost:3001'
            },
            allowedHosts: 'all',
            // CORS headers for SRI hash verification (srihash.org)
            headers: {
                'Access-Control-Allow-Origin': '*',
            }
        },
        module: {
            rules: [
                {
                    test: /\.js$/,
                    exclude: /node_modules/,
                    use: {
                        loader: 'babel-loader',
                        options: {
                            presets: ['@babel/preset-env', '@babel/preset-react']
                        }
                    }
                },
                {
                    test: /\.css$/,
                    use: ['style-loader', 'css-loader']
                }
            ]
        },
        plugins: [
            new HtmlWebpackPlugin({
                template: './public/index.html'
            }),
            new CopyWebpackPlugin({
                patterns: [
                    { from: 'public/sw.js', to: 'sw.js' }
                ]
            })
        ]
    };
};
