const webpack = require('webpack');
const { merge } = require('webpack-merge');
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
  plugins: [
    new webpack.optimize.AggressiveMergingPlugin()
  ]
});