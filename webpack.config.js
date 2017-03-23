'use strict';

const webpack = require( 'webpack' );
const path = require( 'path' );

const NODE_ENV = process.env.NODE_ENV || 'development';
const TYPE = process.env.TYPE || 'lib';
const isDev = NODE_ENV === 'development';
const suffix = (TYPE === 'lib' ?  '' : '.module') +
				(isDev ? '' : '.min') +
				'.js'

module.exports = {
	context: path.resolve( __dirname, 'src' ),
	entry: './dgwm',
	output: {
		path: path.resolve( __dirname, 'build' ),
		filename: 'dgwm' + suffix,
		libraryTarget: TYPE === 'lib' ? 'var' : 'commonjs2',
		library: 'DGWM'
	},

	// watch: false,
	// watchOptions: {
	// 	aggregateTimeout: 100
	// },

	// devtool: isDev ? 'source-map' : false,

	resolve: {
		modules: [
			path.resolve( __dirname + 'src' ),
			'node_modules'
		]
	},

	plugins: [
		new webpack.NoEmitOnErrorsPlugin(),
		new webpack.DefinePlugin({
			NODE_ENV: JSON.stringify( NODE_ENV )
		})
	],

	module: {
		rules: [
		]
	}
};

if (isDev) {
	module.exports.module.rules.push({
		test: /\.js$/,
		enforce: 'pre',
		include: path.resolve( __dirname, 'src' ),
		loader: 'jshint-loader',
		options: {
			esversion: 6,
			strict: 'global',
			browser: true,
			devel: true
		}
	});
}
else {
	module.exports.module.rules.push({
		test: /\.js$/,
		loader: 'babel-loader',
		exclude: /node_modules/,
		options: {
			presets: ['es2015']
		}
	});

	module.exports.plugins.push(
		new webpack.optimize.UglifyJsPlugin({
			compress: {
				warnings: false,
				unsafe: true
			},
			lint: false
		})
	);
}
