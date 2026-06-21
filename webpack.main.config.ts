import type { Configuration } from 'webpack';

import { mainRules } from './webpack.rules';
import { plugins } from './webpack.plugins';

export const mainConfig: Configuration = {
  /**
   * This is the main entry point for your application, it's the first file
   * that runs in the main process.
   */
  entry: './src/main/index.ts',
  externals: {
    argon2: 'commonjs2 argon2',
    sharp: 'commonjs2 sharp',
  },
  // Put your normal webpack config below here
  module: {
    rules: mainRules,
  },
  plugins,
  resolve: {
    extensions: ['.js', '.ts', '.jsx', '.tsx', '.css', '.json'],
    conditionNames: ['node', 'import', 'module', 'webpack', '...'],
  },
};
