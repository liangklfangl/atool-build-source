import { join, resolve } from 'path';
import { writeFileSync } from 'fs';
import webpack, { ProgressPlugin } from 'webpack';
import chalk from 'chalk';
import mergeCustomConfig from './mergeCustomConfig';
import getWebpackCommonConfig from './getWebpackCommonConfig';
/*
(1)调用方式如下：
  let webpackConfig = getWebpackConfig(args, {});
(2)可以通过<shell>命令传入的outputPath，publicPath，compress，hash，config进行配置

*/
function getWebpackConfig(args, cache) {
  let webpackConfig = getWebpackCommonConfig(args);
  webpackConfig.plugins = webpackConfig.plugins || [];

  // Config outputPath.
  if (args.outputPath) {
    webpackConfig.output.path = args.outputPath;
  }

  if (args.publicPath) {
    webpackConfig.output.publicPath = args.publicPath;
  }

  // Config if no --no-compress.
  //表示要对输出的内容进行压缩
  if (args.compress) {
    webpackConfig.UglifyJsPluginConfig = {
      output: {
        ascii_only: true,
      },
      compress: {
        warnings: false,
      },
    };
    webpackConfig.plugins = [...webpackConfig.plugins,
      new webpack.optimize.UglifyJsPlugin(webpackConfig.UglifyJsPluginConfig),
      new webpack.DefinePlugin({
        'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
      }),
    ];
  } else {
    //https://cnodejs.org/topic/5785b3ef3b501f7054982f69
    if (process.env.NODE_ENV) {
      webpackConfig.plugins = [...webpackConfig.plugins,
        new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        }),
      ];
    }
  }

  webpackConfig.plugins = [...webpackConfig.plugins,
    new webpack.optimize.DedupePlugin(),
    new webpack.NoErrorsPlugin(),
  ];

  // Output map.json if hash.
  if (args.hash) {
    const pkg = require(join(args.cwd, 'package.json'));
    //把output.filename和output.chunkFilename设置为加上hash的方式
    webpackConfig.output.filename = webpackConfig.output.chunkFilename = '[name]-[chunkhash].js';
    webpackConfig.plugins = [...webpackConfig.plugins,
      require('map-json-webpack-plugin')({
        assetsPath: pkg.name,//项目名称,会放置在项目根路径
        cache,
      }),
    ];
  }

  //如果shell命令传入了config是函数，那么回调这个函数
  if (typeof args.config === 'function') {
    webpackConfig = args.config(webpackConfig) || webpackConfig;
  } else {
    webpackConfig = mergeCustomConfig(webpackConfig, resolve(args.cwd, args.config || 'webpack.config.js'));
  }
  return webpackConfig;
}


/*
(1)调用方式有两种，分别如下：
     require('../lib/build')(program);
     require('../lib/build')(program, function () {
      process.exit(0);
    });
(2)其中args是进程传过来的参数，通过commander模块解析出来的
*/
export default function build(args, callback) {
  // Get config.
  let webpackConfig = getWebpackConfig(args, {});
  //这里是把shell传入的options和默认的option进行配置后得到的最终options
  webpackConfig = Array.isArray(webpackConfig) ? webpackConfig : [webpackConfig];
  let fileOutputPath;
  webpackConfig.forEach(config => {
    fileOutputPath = config.output.path;
  });
  //获取最终的config.output.path属性表示最终的输出路径

  if (args.watch) {
    webpackConfig.forEach(config => {
      config.plugins.push(
        new ProgressPlugin((percentage, msg) => {
          const stream = process.stderr;
          if (stream.isTTY && percentage < 0.71) {
            stream.cursorTo(0);
            stream.write(`📦  ${chalk.magenta(msg)}`);
            stream.clearLine(1);
          } else if (percentage === 1) {
            console.log(chalk.green('\nwebpack: bundle build is now finished.'));
          }
        })
      );
    });
  }
 //如果配置了watch，表示要监听，我们加入ProgressPlugin

  function doneHandler(err, stats) {
    //shell中配置了json参数，那么在fileOutputPath = config.output.path;也就是config.output.path
    //中输出我们的json文件
    if (args.json) {
      const filename = typeof args.json === 'boolean' ? 'build-bundle.json' : args.json;
      const jsonPath = join(fileOutputPath, filename);
      writeFileSync(jsonPath, JSON.stringify(stats.toJson()), 'utf-8');
      console.log(`Generate Json File: ${jsonPath}`);
    }
    //如果出错，那么退出码是1
    const { errors } = stats.toJson();
    if (errors && errors.length) {
      process.on('exit', () => {
        process.exit(1);
      });
    }
    // if watch enabled only stats.hasErrors would log info
    // otherwise  would always log info
    if (!args.watch || stats.hasErrors()) {
      const buildInfo = stats.toString({
        colors: true,
        children: true,//添加子模块的信息，https://github.com/webpack/extract-text-webpack-plugin/issues/35
        chunks: !!args.verbose,
        modules: !!args.verbose,
        chunkModules: !!args.verbose,
        hash: !!args.verbose,//如果verbose为true表示有日志，那么我们会输出这部分内容
        version: !!args.verbose,
      });
      if (stats.hasErrors()) {
        console.error(buildInfo);
      } else {
        console.log(buildInfo);
      }
    }
    if (err) {
      process.on('exit', () => {
        process.exit(1);
      });
      console.error(err);
    }

    if (callback) {
      callback(err);
    }
  }

  // Run compiler.
  //webpack返回的是一个Compiler实例对象
  const compiler = webpack(webpackConfig);
  // Hack: remove extract-text-webpack-plugin log
  //verbose: 是否输出过程日志
  if (!args.verbose) {
    compiler.plugin('done', (stats) => {
      stats.stats.forEach((stat) => {
        //compilation.children是他所有依赖的模块信息
        stat.compilation.children = stat.compilation.children.filter((child) => {
          return child.name !== 'extract-text-webpack-plugin';
        });
      });
    });
  }
  //调用compiler对象的核心方法watch和run方法
  if (args.watch) {
    compiler.watch(args.watch || 200, doneHandler);
  } else {
    compiler.run(doneHandler);
  }
}
