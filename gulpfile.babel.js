import gulp from 'gulp';
import gulpFile from 'gulp-file';
import clean from 'gulp-clean';

import { rollup, watch } from 'rollup';
import rollupTypescript from 'rollup-plugin-typescript2';
import rollupResolve from 'rollup-plugin-node-resolve';
import rollupCommonjs from 'rollup-plugin-commonjs';
import rollupReplace from 'rollup-plugin-re'
import rollupIgnore from 'rollup-plugin-ignore';
import { uglify } from 'rollup-plugin-uglify';
import rollupTsLint from 'rollup-plugin-tslint';
import rollupSass from 'rollup-plugin-sass';
import rollupSassLint from 'rollup-plugin-sass-lint';
import rollupLivereload from 'rollup-plugin-livereload';
import rollupServe from 'rollup-plugin-serve';
import rollupImage from 'rollup-plugin-img';
import rollupHandlebars from 'rollup-plugin-hbs';
import rollupFilesize from 'rollup-plugin-filesize';
import rollupProgress from 'rollup-plugin-progress';
import rollupIgnoreImport from 'rollup-plugin-ignore-import';
import rollupBabel from 'rollup-plugin-babel';

import postCss from 'postcss';
import postCssAutoPrefix from 'autoprefixer';
import postCssImageInline from 'postcss-image-inliner';

import typescript from 'typescript';
import merge from 'lodash/merge';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';

import packageJson from './package.json';
import config from './config.json';

// Build utils

const baseConfig = {
  input: `${config.source}/${config.entry}`,
  output: {
    name: packageJson.name,
    sourcemap: true
  }
};

const makeDir = (name) => {
  if (!fs.existsSync(name)){
    fs.mkdirSync(name);
  }
};

const rollupStyleBuildPlugin = (watch) => {
  return rollupSass({
    output: config.bundleStyle || function (styles, styleNodes) {
      const styleDist = `${watch? config.watch.script: config.out}/style`;
      makeDir(styleDist);

      styleNodes.reduce((acc, node) => {
        const baseName = path.basename(node.id);
        const currentNode = acc.find(accNode => accNode.name === baseName);
        if (currentNode) {
          currentNode.styles += node.content;
        } else {
          acc.push({
            name: baseName,
            styles: node.content
          });
        }

        return acc;
      }, []).forEach((node) => {
        fs.writeFileSync(`${styleDist}/${node.name.slice(0, -4)}css`, node.styles);
      });
    },
    insert: config.bundleStyle,
    processor: (css) => {
      return postCss([
        postCssImageInline({
          maxFileSize: config.imageInlineLimit,
          assetPaths: config.assetPaths
        }),
        postCssAutoPrefix,
      ])
        .process(css, { from: undefined })
        .then(result => result.css)
    }
  })
};

const rollupReplacePlugin = rollupReplace({
  patterns: config.pathReplacePatterns
});

const resolvePlugins = [
  rollupIgnore(config.ignore),
  rollupResolve({
    jsnext: true,
    main: true,
    browser: true,
    preferBuiltins: false
  }),
  rollupCommonjs({
    include: 'node_modules/**'
  })
];

const buildPlugin = (esVersion, generateDefinition, watch) => {
  if (config.tsProject) {
    let buildConf = {
      tsconfig: `tsconfig.${esVersion}.json`,
      typescript: typescript,
      check: !watch
    };

    if (generateDefinition) {
      buildConf.tsconfigOverride  = {
        compilerOptions: {
          declaration: true,
          declarationDir: config.out
        }
      };

      buildConf.useTsconfigDeclarationDir = true;
    }

    return rollupTypescript(buildConf);
  }

  return rollupBabel({
    babelrc: false,
    exclude: 'node_modules/**',
    presets: [
      [
        '@babel/preset-env',
        {
          'targets': {
            'esmodules': esVersion === 'es2015'
          }
        }
      ]
    ]
  });
};

const lintPlugins = [
  rollupTsLint({
    include: [`${config.source}/**/*.ts`]
  }),
  rollupSassLint({
    include: 'src/**/*.scss',
  })
];

const preBundlePlugins = () => {
  return [
    rollupReplacePlugin,
    rollupHandlebars(),
    rollupImage({
      extensions: /\.(png|jpg|jpeg|gif|svg)$/,
      limit: config.imageInlineLimit,
      exclude: 'node_modules/**'
    })
  ];
};

const postBundlePlugins = () => {
  return [
    rollupProgress(),
    rollupFilesize({
      render : function (options, size, gzippedSize){
        return chalk.yellow(`Bundle size: ${chalk.red(size)}, Gzipped size: ${chalk.red(gzippedSize)}`);
      }
    })
  ];
};

const ignoreImportPlugin = rollupIgnoreImport({
  extensions: ['.scss']
});

const bundleBuild = async (config, type) => {
  try {
    console.log(chalk.blue(`${type} bundle build start`));
    const bundle = await rollup(config);
    await bundle.write(config.output);
    console.log(chalk.blue(`${type} bundle build end`));
  } catch (error) {
    console.log(chalk.red(`${type} bundle build Failure`));
    console.log(error);
    throw error;
  }
};

// Clean tasks

gulp.task('build:clean', () => {
  return gulp.src(['.rpt2_cache', config.out], {
      read: false,
      allowEmpty: true
    })
    .pipe(clean());
});

gulp.task('watch:clean', () => {
  return gulp.src(['.rpt2_cache', config.watch.script], {
    read: false,
    allowEmpty: true
  })
    .pipe(clean());
});

// Base build tasks

gulp.task('build:copy:essentials', () => {
  let fieldsToCopy = ['name', 'version', 'description', 'keywords', 'author', 'repository', 'license', 'bugs', 'homepage'];

  let targetPackage = {
    main: `bundles/${packageJson.name}.${config.bundleFormat}.js`,
    module: `fesm5/${packageJson.name}.js`,
    es2015: `fesm2015/${packageJson.name}.js`,
    fesm5: `fesm5/${packageJson.name}.js`,
    fesm2015: `fesm2015/${packageJson.name}.js`,
    typings: 'index.d.ts',
    peerDependencies: {}
  };

  //only copy needed properties from project's package json
  fieldsToCopy.forEach((field) => targetPackage[field] = packageJson[field]);

  // defines project's dependencies as 'peerDependencies' for final users
  Object.keys(packageJson.dependencies).forEach((dependency) => {
    targetPackage.peerDependencies[dependency] = `^${packageJson.dependencies[dependency].replace(/[\^~><=]/, '')}`;
  });

  // copy the needed additional files in the 'dist' folder
  return gulp.src(config.copy)
    .pipe(gulpFile('package.json', JSON.stringify(targetPackage, null, 2)))
    .pipe(gulp.dest(config.out))
});

gulp.task('build:bundle', async () => {
  // flat bundle.
  const flatConfig = merge({}, baseConfig, {
    output: {
      name: config.namespace,
      format: config.bundleFormat,
      file: path.join(config.out, 'bundles', `${packageJson.name}.${config.bundleFormat}.js`),
      globals: config.flatGlobals
    },
    external: Object.keys(config.flatGlobals),
    plugins: [
      ...lintPlugins,
      rollupStyleBuildPlugin(false),
      ...preBundlePlugins(),
      ...resolvePlugins,
      buildPlugin('es5', true, false),
      ...postBundlePlugins()
    ]
  });

  // minified flat bundle.
  const minifiedFlatConfig = merge({}, baseConfig, {
    output: {
      name: config.namespace,
      format: config.bundleFormat,
      file: path.join(config.out, 'bundles', `${packageJson.name}.${config.bundleFormat}.min.js`),
      globals: config.flatGlobals
    },
    external: Object.keys(config.flatGlobals),
    plugins: [
      ignoreImportPlugin,
      ...preBundlePlugins(),
      ...resolvePlugins,
      buildPlugin('es5', false, false),
      uglify(),
      ...postBundlePlugins()
    ]
  });

  // FESM+ES5 flat module bundle.
  const fesm5config = merge({}, baseConfig, {
    output: {
      format: 'es',
      file: path.join(config.out, 'fesm5', `${packageJson.name}.es5.js`),
    },
    plugins: [
      ignoreImportPlugin,
      ...preBundlePlugins(),
      buildPlugin('es5', false, false),
      ...postBundlePlugins()
    ],
    external: config.esmExternals
  });

  // FESM+ES2015 flat module bundle.
  const fesm2015config = merge({}, baseConfig, {
    output: {
      format: 'es',
      file: path.join(config.out, 'fesm2015', `${packageJson.name}.js`),
    },

    plugins: [
      ignoreImportPlugin,
      ...preBundlePlugins(),
      buildPlugin('es2015', false, false),
      ...postBundlePlugins()
    ],
    external: config.esmExternals
  });

  try {
    await bundleBuild(flatConfig, 'FLAT');
    await bundleBuild(minifiedFlatConfig, 'FLAT MIN');
    await bundleBuild(fesm5config, 'FESM5');
    await bundleBuild(fesm2015config, 'FESM2015');
  } catch(error) {
    return null;
  }
});

gulp.task('build', gulp.series('build:clean', 'build:copy:essentials', 'build:bundle'));

// Watch tasks

gulp.task('build:watch', async () => {
  makeDir(config.watch.script);

  const watchConfig = merge({}, baseConfig, {
    output: {
      name: config.namespace,
      format: config.bundleFormat,
      file: path.join(config.watch.script, `${packageJson.name}.${config.bundleFormat}.js`),
      globals: config.flatGlobals
    },
    external: Object.keys(config.flatGlobals),
    plugins: [
      ...lintPlugins,
      rollupStyleBuildPlugin(true),
      ...preBundlePlugins(),
      ...resolvePlugins,
      buildPlugin('es5', false, true),
      rollupServe({
        contentBase: [config.watch.script, config.watch.demo],
        port: config.watch.port,
        open: config.watch.open,
      }),
      rollupLivereload({
        watch: [config.watch.script, config.watch.demo]
      }),
      rollupProgress()
    ],
    watch: {
      exclude: ['node_modules/**']
    }
  });

  try {
    const watcher = await watch(watchConfig);
    watcher.on('event', event => {
      switch (event.code) {
        case 'START':
          console.log(chalk.blue('[WATCH] ') + chalk.yellow('bundling start'));
          break;
        case 'END':
          console.log(chalk.blue('[WATCH] ') + chalk.yellow('bundling end'));
          break;
        case 'ERROR':
          console.log(chalk.blue('[WATCH] ') + chalk.red('bundling failure'));
          console.log(event.error);
          break;
        case 'FATAL':
          console.log(chalk.blue('[WATCH] ') + chalk.red('bundling crashed'));
          console.log(event);
          break;
      }
    });
  } catch(error) {
    console.log(chalk.blue('[WATCH] ') + chalk.red('watch task failure'));
  }
});

gulp.task('watch', gulp.series('watch:clean', 'build:watch'));
