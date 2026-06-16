const webpack = require('webpack');
const { merge } = require('webpack-merge');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const autoprefixer = require('autoprefixer');
const common = require('./webpack.common');

module.exports = merge(common, {
  optimization: {
    nodeEnv: 'production',
    minimize: true
  },
  performance: {
    hints: false
  },
  output: {
    path: `${__dirname}/../build/js`,
    filename: 'digifilter.min.js',  
    libraryTarget: 'var',
    libraryExport: 'default',
    library: 'DigiFilter'  
  },
  devtool: false,
  mode: 'production',
  module: {
    rules: [{
      test: /\.(sc|c)ss$/,
      use: [{
        loader: MiniCssExtractPlugin.loader
      },
      {
        loader: 'css-loader'
      },
      {
        loader: 'postcss-loader',
        options: {
          postcssOptions: {
            plugins: [
              require('autoprefixer')
            ]
          }
        }
      },
      {
        loader: 'sass-loader'
      }
      ]
    }]
  },
  plugins: [
    new webpack.optimize.AggressiveMergingPlugin(),
    new MiniCssExtractPlugin({
      filename: '../css/barebone.css'
    })
  ]
});
