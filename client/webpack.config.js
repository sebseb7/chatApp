const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

module.exports = (env, argv) => {
    const isProduction = argv.mode === 'production';
    
    return {
        entry: './src/index.js',
        output: {
            path: path.join(__dirname, '/dist'),
            filename: 'bundle.js',
            publicPath: '/'
        },
        devServer: {
            port: 3881,
            historyApiFallback: true,
            hot: !isProduction,
            liveReload: !isProduction,
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
            allowedHosts: 'all'
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
            })
        ]
    };
};
