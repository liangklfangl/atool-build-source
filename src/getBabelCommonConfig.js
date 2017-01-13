import { tmpdir } from 'os';
/*
(1)调用方式如下：
  getBabelCommonConfig();
(2)tmpdir方法作用
  The os.tmpdir() method returns a string specifying the operating system's default directory for 
  temporary files.
*/
export default function babel() {
  return {
    cacheDirectory: tmpdir(),
    presets: [
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
