import webpack from 'webpack';
import ExtractTextPlugin from 'extract-text-webpack-plugin';
import getBabelCommonConfig from './getBabelCommonConfig';
import getTSCommonConfig from './getTSCommonConfig';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import rucksack from 'rucksack-css';
import autoprefixer from 'autoprefixer';
/*
(1)调用方式如下：
   let webpackConfig = getWebpackCommonConfig(args);其中args是通过进程传过来的，也就是解析process.argv
(2)如果传入的参数有hash，那么我们会对css/js和普通文件名进行修改，而且这里采用的是chunkHash
   const jsFileName = args.hash ? '[name]-[chunkhash].js' : '[name].js';
   const cssFileName = args.hash ? '[name]-[chunkhash].css' : '[name].css';
   const commonName = args.hash ? 'common-[chunkhash].js' : 'common.js';
(3)获取babel特定的配置信息，cacheDirectory，presets，plugins
(4)getTSCommonConfig返回如下内容：
    return {
      target: 'es6',
      jsx: 'preserve',
      moduleResolution: 'node',
      declaration: false,//设置为false
      sourceMap: true,
    };
(5)获取package.json中配置的theme，如果theme是string，那么表示是路径，如果是相对路径那么转化为绝对路径并获取
  该路径的文件内容，并调用默认theme文件默认导出的方法！如果配置的是一个对象，那么表示这个对象就是theme!
(6)读取package.json中的browser对象


*/
export default function getWebpackCommonConfig(args) {
  const pkgPath = join(args.cwd, 'package.json');
  const pkg = existsSync(pkgPath) ? require(pkgPath) : {};
  const jsFileName = args.hash ? '[name]-[chunkhash].js' : '[name].js';
  const cssFileName = args.hash ? '[name]-[chunkhash].css' : '[name].css';
  const commonName = args.hash ? 'common-[chunkhash].js' : 'common.js';
  const babelQuery = getBabelCommonConfig();
  const tsQuery = getTSCommonConfig();
  tsQuery.declaration = false;

  let theme = {};
  if (pkg.theme && typeof(pkg.theme) === 'string') {
    let cfgPath = pkg.theme;
    // relative path
    if (cfgPath.charAt(0) === '.') {
      cfgPath = resolve(args.cwd, cfgPath);
    }
    const getThemeConfig = require(cfgPath);
    theme = getThemeConfig();
  } else if (pkg.theme && typeof(pkg.theme) === 'object') {
    theme = pkg.theme;
  }

  const emptyBuildins = [
    'child_process',
    'cluster',
    'dgram',
    'dns',
    'fs',
    'module',
    'net',
    'readline',
    'repl',
    'tls',
  ];

  const browser = pkg.browser || {};
  const node = emptyBuildins.reduce((obj, name) => {
    //如果browser里面没有这个模块，那么我们会把obj对象上这个模块的信息设置为'empty'字符串
    if (!(name in browser)) {
      return { ...obj, ...{ [name]: 'empty' } };
    }
    return obj;
  }, {});


  return {
    babel: babelQuery,
    ts: {
      transpileOnly: true,
      compilerOptions: tsQuery,
    },

    output: {
      path: join(process.cwd(), './dist/'),
      filename: jsFileName,
      chunkFilename: jsFileName,
    },

    devtool: args.devtool,//source-map

    resolve: {
      modulesDirectories: ['node_modules', join(__dirname, '../node_modules')],
      //本层级的node_modules和上一级node_modules
      extensions: ['', '.web.tsx', '.web.ts', '.web.jsx', '.web.js', '.ts', '.tsx', '.js', '.jsx', '.json'],
      //扩展名
    },

    resolveLoader: {
      modulesDirectories: ['node_modules', join(__dirname, '../node_modules')],
    },

    entry: pkg.entry,
    //package.json中配置的entry对象

    node,

    module: {
      noParse: [/moment.js/],//不解析moment.js
      loaders: [
        {
          test: /\.js$/,
          exclude: /node_modules/,
          loader: require.resolve('babel-loader'),
          query: babelQuery,
        },
        {
          test: /\.jsx$/,
          loader: require.resolve('babel-loader'),
          query: babelQuery,
        },
        {
          test: /\.tsx?$/,
          loaders: [require.resolve('babel-loader'), require.resolve('ts-loader')],
        },
        {
          test(filePath) {
            return /\.css$/.test(filePath) && !/\.module\.css$/.test(filePath);
          },
          loader: ExtractTextPlugin.extract(
            `${require.resolve('css-loader')}` +
            `?sourceMap&-restructuring&-autoprefixer!${require.resolve('postcss-loader')}`
          ),
        },
        {
          test: /\.module\.css$/,
          loader: ExtractTextPlugin.extract(
            `${require.resolve('css-loader')}` +
            `?sourceMap&-restructuring&modules&localIdentName=[local]___[hash:base64:5]&-autoprefixer!` +
            `${require.resolve('postcss-loader')}`
          ),
        },
        {
          test(filePath) {
            return /\.less$/.test(filePath) && !/\.module\.less$/.test(filePath);
          },
          loader: ExtractTextPlugin.extract(
            `${require.resolve('css-loader')}?sourceMap&-autoprefixer!` +
            `${require.resolve('postcss-loader')}!` +
            `${require.resolve('less-loader')}?{"sourceMap":true,"modifyVars":${JSON.stringify(theme)}}`
          ),
        },
        {
          test: /\.module\.less$/,
          loader: ExtractTextPlugin.extract(
            `${require.resolve('css-loader')}?` +
            `sourceMap&modules&localIdentName=[local]___[hash:base64:5]&-autoprefixer!` +
            `${require.resolve('postcss-loader')}!` +
            `${require.resolve('less-loader')}?` +
            `{"sourceMap":true,"modifyVars":${JSON.stringify(theme)}}`
          ),
        },
        {
          test: /\.woff(\?v=\d+\.\d+\.\d+)?$/,
          loader: `${require.resolve('url-loader')}?` +
          `limit=10000&minetype=application/font-woff`,
        },
        {
          test: /\.woff2(\?v=\d+\.\d+\.\d+)?$/,
          loader: `${require.resolve('url-loader')}?` +
          `limit=10000&minetype=application/font-woff`,
        },
        {
          test: /\.ttf(\?v=\d+\.\d+\.\d+)?$/,
          loader: `${require.resolve('url-loader')}?` +
          `limit=10000&minetype=application/octet-stream`,
        },
        { test: /\.eot(\?v=\d+\.\d+\.\d+)?$/, loader: `${require.resolve('file-loader')}` },
        {
          test: /\.svg(\?v=\d+\.\d+\.\d+)?$/,
          loader: `${require.resolve('url-loader')}?` +
          `limit=10000&minetype=image/svg+xml`,
        },
        {
          test: /\.(png|jpg|jpeg|gif)(\?v=\d+\.\d+\.\d+)?$/i,
          loader: `${require.resolve('url-loader')}?limit=10000`,
        },
        { test: /\.json$/, loader: `${require.resolve('json-loader')}` },
        { test: /\.html?$/, loader: `${require.resolve('file-loader')}?name=[name].[ext]` },
      ],
    },

    postcss: [
      rucksack(),
      autoprefixer({
        browsers: ['last 2 versions', 'Firefox ESR', '> 1%', 'ie >= 8', 'iOS >= 8', 'Android >= 4'],
      }),
    ],

    plugins: [
      new webpack.optimize.CommonsChunkPlugin('common', commonName),
      //公共模块名字
      new ExtractTextPlugin(cssFileName, {
        disable: false,
        allChunks: true,
      }),
      //css文件名字
      new webpack.optimize.OccurenceOrderPlugin(),
      //顺序触发的插件
    ],
  };
}
