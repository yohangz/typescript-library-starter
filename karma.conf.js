var rollupResolve = require('rollup-plugin-node-resolve');
var rollupCommonjs = require('rollup-plugin-commonjs');
var rollupImage = require('rollup-plugin-img');
var rollupHandlebars = require('rollup-plugin-hbs');
var rollupTypescript = require('rollup-plugin-typescript2');
var rollupIstanbul = require('rollup-plugin-istanbul');

var typescript = require('typescript');
process.env.CHROME_BIN = require('puppeteer').executablePath();

module.exports = function(config) {
  config.set({
    basePath: '',

    frameworks: ['jasmine'],

    browsers: [ process.env.CI? 'ChromeHeadless': 'Chrome' ],

    port: 9876,

    singleRun: !!process.env.CI,

    colors: true,

    logLevel: config.LOG_INFO,

    reporters: ['progress', 'kjhtml', 'coverage'],

    files: [
      /**
       * Make sure to disable Karma’s file watcher
       * because the preprocessor will use its own.
       */
      { pattern: 'src/**/*.spec.ts', watched: false }
    ],

    preprocessors: {
      'src/**/*.spec.ts': ['rollup']
    },

    plugins: [
      require('karma-jasmine'),
      require('karma-chrome-launcher'),
      require('karma-rollup-preprocessor'),
      require('karma-jasmine-html-reporter'),
      require('karma-coverage')
    ],

    mime: {
      'text/x-typescript': ['ts', 'tsx']
    },

    client:{
      clearContext: false // leave Jasmine Spec Runner output visible in browser
    },

    rollupPreprocessor: {
      /**
       * This is just a normal Rollup config object,
       * except that `input` is handled for you.
       */
      plugins: [
        rollupResolve({
          jsnext: true,
          main: true,
          browser: true,
          preferBuiltins: false
        }),
        rollupCommonjs({
          include: 'node_modules/**'
        }),
        rollupHandlebars(),
        rollupImage({
          extensions: /\.(png|jpg|jpeg|gif|svg)$/,
          limit: 1000000,
          exclude: 'node_modules/**'
        }),
        rollupTypescript({
          tsconfig: `tsconfig.es5.json`,
          typescript: typescript,
          check: !!process.env.CI
        }),
        rollupIstanbul({
          exclude: ['src/**/*.spec.ts']
        })
      ],
      output: {
        format: 'iife',
        name: 'test',
        sourcemap: 'inline'
      }
    }
  })
};

