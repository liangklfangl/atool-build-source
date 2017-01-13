/*
(1)直接返回一个对象,这里是TypeScript的默认配置
*/
export default function ts() {
  return {
    target: 'es6',
    jsx: 'preserve',
    moduleResolution: 'node',
    declaration: false,
    sourceMap: true,
  };
}
