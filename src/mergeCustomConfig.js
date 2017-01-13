import { existsSync } from 'fs';

/**
 * Merge custom config from `webpack.config.js`.
 * @param webpackConfig {Object}
 * @param customConfigPath {String}
 */

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