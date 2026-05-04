const { merge } = require('webpack-merge');
const common = require('./webpack.common.js');

module.exports = merge(common, {
  output: {
    path: `${__dirname}/../../Tomelilla-kommun/origo/plugins/viewer`,
    publicPath: '/build/js',
    filename: 'viewer-plugin.js',
    libraryTarget: 'var',
    libraryExport: 'default',
    library: 'ViewerPlugin'
  },
  mode: 'development',
  module: {
    rules: [{
      test: /\.scss$/,
      use: [{
        loader: 'style-loader'
      },
      {
        loader: 'css-loader'
      },
      {
        loader: 'sass-loader',
        options: { api: 'modern-compiler' }
      }
      ]
    }]
  },
  devServer: {
    static: [
      { directory: `${__dirname}/..`, publicPath: '/' },
      { directory: `${__dirname}/../test`, publicPath: '/test' }
    ],
    port: 9008,
    hot: false,
    open: '/test/',
    devMiddleware: {
      writeToDisk: true
    },
    client: {
      overlay: {
        runtimeErrors: (error) => {
          if (error?.message === 'ResizeObserver loop completed with undelivered notifications.') {
            return false;
          }
          return true;
        },
      },
    },
  }
});
