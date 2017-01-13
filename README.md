### 1.atool-build的简单说明
 该脚手架只是对webpack进行了简单的封装。

 首先,webpack/babel/TypeScript那些基本配置信息都有了默认信息，并内置了很多默认的`loader`来处理文件;然后,他是自己调用`compiler.run`方法开始编译的，并通过compiler.watch来监听文件的变化，生产build-bundle.json表示编译的信息；然后，里面通过一个hack来解决extract-webpack-text-plugin打印log的问题;Babel的缓存目录会使用操作系统默认的缓存目录来完成，使用os模块的tmpdir方法；其中devtool采用的是如下的方式加载:

 ```js
 webpack --devtool source-map
 ```

`.`如果在 package.json 中 browser 没有设置，则设置 child_process, cluster, dgram, dns, fs, module, net, readline, repl, tls 为 `empty`!

`.`对于自定义添加的 loader，plugin等依赖，需要在项目文件夹中npm install 这些依赖。但不需要再安装 webpack 依赖，因为可以通过 require('atool-build/lib/webpack') 得到；

### 2.atool-build官方配置项与内部处理

下面是atool-build给出的那些可以允许配置信息:

--verbose:是否在shell中传入verbose参数(是否输入过程日志)

``` if (!args.verbose) {
    compiler.plugin('done', (stats) => {
      stats.stats.forEach((stat) => {
        stat.compilation.children = stat.compilation.children.filter((child) => {
          return child.name !== 'extract-text-webpack-plugin';
        });
      });
    });
  }
```

如果没有传入verbose，那么表示不允许输出日志。至于为什么是移除'extract-text-webpack-plugin'可以参见这个[hach](https://github.com/webpack/extract-text-webpack-plugin/issues/35)

--json <filename>是否生成bundle.json文件
```js
if (args.json) {
      const filename = typeof args.json === 'boolean' ? 'build-bundle.json' : args.json;
      const jsonPath = join(fileOutputPath, filename);
      writeFileSync(jsonPath, JSON.stringify(stats.toJson()), 'utf-8');
      console.log(`Generate Json File: ${jsonPath}`);
    }
```

表示是否在shell中配置了json参数，在doneHandle，也就是说每次修改都会调用这个方法，然后写一个默认为build-bundle.json文件：

-o, --output-path <path> 指定构建后的输出路径。

处理如下：
```js
  if (args.outputPath) {
    webpackConfig.output.path = args.outputPath;
  }
```

-w, --watch [delpay] 是否监控文件变化，默认为不监控。

内部处理如下：
```js
if (args.watch) {
    compiler.watch(args.watch || 200, doneHandler);
  } else {
    compiler.run(doneHandler);
  }
```

也用于监控编译的过程
```js
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
```


--public-path <path>

具体可以查看[该文档](https://github.com/webpack/docs/wiki/configuration#outputpublicpath)，内部处理如下:

```js
  if (args.publicPath) {
    webpackConfig.output.publicPath = args.publicPath;
  }
```

--no-compress 不压缩代码。

```js
 if (args.compress) {//配置为--no-compress表示不压缩
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
```

如果压缩代码，那么我们添加UglifyJsPlugin。

--config [userConfigFile] 指定用户配置文件。默认为根目录下的 webpack.config.js 文件。这个配置文件不是必须的。处理方式如下：
```js
if (typeof args.config === 'function') {
    webpackConfig = args.config(webpackConfig) || webpackConfig;
  } else {
    webpackConfig = mergeCustomConfig(webpackConfig, resolve(args.cwd, args.config || 'webpack.config.js'));
  }
```

也就说，如果config参数是一个函数，那么直接调用这个函数，否则获取路径并调用这个路径引入的文件的默认导出函数，传入参数为webpackConfig，下面是内置的mergeCustomConfig内部逻辑：
```js
export default function mergeCustomConfig(webpackConfig, customConfigPath) {
  if (!existsSync(customConfigPath)) {
    return webpackConfig;
  }
  const customConfig = require(customConfigPath);
  if (typeof customConfig === 'function') {
    return customConfig(webpackConfig, ...[...arguments].slice(2));
  }
  throw new Error(`Return of ${customConfigPath} must be a function.`);
}
```
注意，也就说如果我们传入的是config为file，*那么这个config必须导出的是一个函数*！

--devtool <devtool> 生成 sourcemap 的方法，默认为空，这个参数和 webpack 的配置一致。

--hash 使用 hash 模式的构建, 并生成映射表 map.json。

内部的处理如下：
```js
  if (args.hash) {
    const pkg = require(join(args.cwd, 'package.json'));
    webpackConfig.output.filename = webpackConfig.output.chunkFilename = '[name]-[chunkhash].js';
    webpackConfig.plugins = [...webpackConfig.plugins,
      require('map-json-webpack-plugin')({
        assetsPath: pkg.name,//项目名称,会放置在项目根路径
        cache,
      }),
    ];
  }
```

也就是说如果指定了hash，那么我们必须修改输出的文件名，即webpackConfig.output.filename 和webpackConfig.output.chunkFilename并添加hash。而且这里使用的是chunkhash，同时这里使用了map-json-webpack-plugin这个插件生成map.json映射文件。

### 3.atool-build中内置的那些插件

(1)ProgressPlugin学习
```js
 config.plugins.push(new ProgressPlugin(percentage,msg)=>{
    const stream=process.stderr;
    if(stream.isTTY&&percentage<0.71){
         stream.cursorTo(0);
        stream.write(`📦  ${chalk.magenta(msg)}`);
        stream.clearLine(1);
    }else if(percentate==1){
     console.log(chalk.green('webpack: bundle build is now finished.'));
    }
  })

```

该插件表示编译的进度。插件详见官方网站[阅读](https://webpack.github.io/docs/list-of-plugins.html)

(2)NoErrorsPlugin

  表示如果编译的时候有错误，那么我们跳过emit阶段，因此包含错误信息的资源都不会经过emit阶段也就是没有文件产生。这时候所有资源的emitted都是false。如果你使用CLI，那么当你使用这个插件的时候不会退出并产生一个error code，如果你想要CLI退出，那么使用bail选项。

（3）DefinePlugin
  表示允许你定义全局变量，可以用于在编译阶段和开发阶段进行不同的处理。用法如下:
```javascript
 new webpack.DefinePlugin({
          'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV),
        }),
```

（4）DedupePlugin
   查找相等或者相似的文件并从输出去剔除。在watch模式下不要使用，要在production下使用

  ```js
    export default function mergeCustomConfig(webpackConfig, customConfigPath) {
  if (!existsSync(customConfigPath)) {
    return webpackConfig;
  }
  const customConfig = require(customConfigPath);
  //必须返回函数,也就是我们通过shell配置的args.config必须是返回一个函数！
  if (typeof customConfig === 'function') {
    return customConfig(webpackConfig, ...[...arguments].slice(2));
  }
  throw new Error(`Return of ${customConfigPath} must be a function.`);
}
  ```

### 4.atool-build源码分析

```js
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
  //verbose: 是否输出过程日志，这里是取消'extract-text-webpack-plugin'所有的日志信息
  if (!args.verbose) {
    compiler.plugin('done', (stats) => {
      stats.stats.forEach((stat) => {
        //compilation.children是他所有依赖的plugin信息
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
```

上面的代码是很容易看懂的，其实我们最重要的代码就是如下的内容：
```js
function doneHandler(err, stats) {
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
```

因为我们调用compiler.watch方法，在webpack中，其会调用Watching对象的watch方法监听文件的变化，每次变化的时候我们只是重新生成我们的'build-bundle.json'文件表示本次编译的信息！而且在webpack的watch的回调函数，也就是doneHandler中每次都会传入Stats对象，如果你还不知道可以查看下面这个[文章](https://github.com/liangklfangl/webpack-compiler-and-compilation)

### 5.TypeScript默认配置项
```js
export default function ts() {
  return {
    target: 'es6',
    jsx: 'preserve',
    moduleResolution: 'node',
    declaration: false,
    sourceMap: true,
  };
}
```

### 6.Babel配置项

```js
export default function babel() {
  return {
    cacheDirectory: tmpdir(),//临时文件存放位置
    presets: [//presets字段设定转码规则
      require.resolve('babel-preset-es2015-ie'),
      require.resolve('babel-preset-react'),
      require.resolve('babel-preset-stage-0'),
    ],
    plugins: [
      require.resolve('babel-plugin-add-module-exports'),
      require.resolve('babel-plugin-transform-decorators-legacy'),
    ],
  };
}
```

上面tmpdir的作用如下：
  The *os.tmpdir()* method returns a string specifying the operating system's default directory for temporary files.

### 7.Webpack默认配置项

直接上源码部分，再分开分析下：
```js
export default function getWebpackCommonConfig(args) {
  const pkgPath = join(args.cwd, 'package.json');
  const pkg = existsSync(pkgPath) ? require(pkgPath) : {};
  const jsFileName = args.hash ? '[name]-[chunkhash].js' : '[name].js';
  const cssFileName = args.hash ? '[name]-[chunkhash].css' : '[name].css';
  const commonName = args.hash ? 'common-[chunkhash].js' : 'common.js';
  //如果传入hash，那么输出文件名要修改
  const babelQuery = getBabelCommonConfig();
  const tsQuery = getTSCommonConfig();
  //获取TypeScript配置
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
```

我们是如下调用的：
```js
  let webpackConfig = getWebpackCommonConfig(args);
```

而我们的args表示从shell控制台传入的参数，这些参数会被原样传入到上面的getWebpackCommonConfig方法中。但是，我们依然要弄清楚下面的内容：
```js
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
```

我们可以在package.json中配置theme选项，如果配置为对象，那么就是theme内容，否则如果是文件那么我们require进来，然后调用默认的方法！这也就是告诉我们，我们配置的这个文件名导出的内容`必须是一个函数`！那么这个theme有什么用呢？其实这是less为我们提供的覆盖less文件默认配置的变量的方法！我们在package.json中配置的theme会被传入到以下的插件中:
ExtractTextPlugin

```js
   {
          test(filePath) {
            return /\.less$/.test(filePath) && !/\.module\.less$/.test(filePath);
          },
          loader: ExtractTextPlugin.extract(
            `${require.resolve('css-loader')}?sourceMap&-autoprefixer!` +
            `${require.resolve('postcss-loader')}!` +
            `${require.resolve('less-loader')}?{"sourceMap":true,"modifyVars":${JSON.stringify(theme)}}`
          ),
        }
```

首先：一种文件可以使用多个loader来完成；然后：我们可以使用?为不同的loader添加参数并且注意哪些参数是变量哪些参数是字符串！比如对于less-loader来说，我们使用了modifyVars来覆盖原来的样式,因为在loader里面会通过query读取查询字符串，然后做相应的覆盖（因为less里面使用了变量）。

```less
less.modifyVars({
  '@buttonFace': '#5B83AD',
  '@buttonText': '#D9EEF2'
});
```
详见链接:[modifyVars](http://lesscss.org/usage/#using-less-in-the-browser-modify-variables)

### 8.compiler和compilation
  学习那些插件的写法，深入理解compiler和compliation不同的生命周期，你可以阅读[这篇文章](https://github.com/liangklfangl/webpack-compiler-and-compilation
)

### 9.webpack/TypeScript/Babel基本配置的含义
  
为什么说getWebpackCommonConfig返回的是一个webpack的common配置信息，这些信息都是什么意思？为何说getBabelCommonConfig.js得到的是babel的基本配置，配置是什么意思？getTSCommonConfig得到的又是什么配置？这些内容不再一一赘述，读者可自行google.



参考资料：
[atoolo-build官方文档](http://ant-tool.github.io/atool-build.html)

[webpack配置文档](https://github.com/webpack/docs/wiki/configuration#outputpublicpath)

[Babel入门教程](http://www.ruanyifeng.com/blog/2016/01/babel.html)
