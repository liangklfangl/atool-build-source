import less from 'less';
import { readFileSync } from 'fs';
import path, { dirname } from 'path';
import postcss from 'postcss';
import rucksack from 'rucksack-css';
import autoprefixer from 'autoprefixer';
import NpmImportPlugin from 'less-plugin-npm-import';

function transformLess(lessFile, config = {}) {
  const { cwd = process.cwd() } = config;
  const resolvedLessFile = path.resolve(cwd, lessFile);

  let data = readFileSync(resolvedLessFile, 'utf-8');
  data = data.replace(/^\uFEFF/, '');

  return new Promise((resolve, reject) => {
    // Do less compile
    const lessOpts = {
      paths: [dirname(resolvedLessFile)],
      filename: resolvedLessFile,
      plugins: [
        new NpmImportPlugin({ prefix: '~' }),
      ],
    };
    less.render(data, lessOpts)
      .then(result => {
        // Do postcss compile
        const plugins = [
          rucksack(),
          autoprefixer({
            browsers: ['last 2 versions', 'Firefox ESR', '> 1%', 'ie >= 8'],
          }),
        ];
        const source = result.css;
        const postcssOpts = {};

        postcss(plugins).process(source, postcssOpts)
          .then(r => {
            resolve(r.css);
          })
          .catch(err => {
            reject(err);
          });
      })
      .catch(err => {
        reject(err);
      });
  });
}

export default transformLess;
