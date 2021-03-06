'use strict';

const debug = require('util').debuglog('esm');

const bindings = require('bindings');

const { ModuleWrap: Module } = bindings('loader');

const ArrayJoin = Function.call.bind(Array.prototype.join);
const ArrayMap = Function.call.bind(Array.prototype.map);

/**
 * @typedef ReflectiveExport
 * @prop {() => any} get
 * @prop {(value: any) => void} set
 */

/**
 * @typedef {{ [key: string]: ReflectiveExport }} ReflectiveExports
 */

/**
 * @typedef Reflect
 * @prop {ReflectiveExports} exports
 */

/**
 * @param {Module} target
 * @param {string[]} exportNames
 * @param {(reflect: Reflect) => void} evaluate
 */
const createDynamicModule = (target, exportNames, evaluate) => {
  const url = target.url;
  debug(
    `creating ESM facade for ${url} with exports: ${ArrayJoin(
      exportNames,
      ', '
    )}`
  );
  const names = ArrayMap(exportNames, name => `${name}`);
  // Create two modules: One whose exports are get- and set-able ('reflective'),
  // and one which re-exports all of these but additionally may
  // run an executor function once everything is set up.
  const src = `
  export let executor;
  ${ArrayJoin(ArrayMap(names, name => `export let $${name};`), '\n')}
  /* This function is implicitly returned as the module's completion value */
  (() => ({
    setExecutor: fn => executor = fn,
    reflect: {
      exports: { ${ArrayJoin(
        ArrayMap(
          names,
          name => `
        ${name}: {
          get: () => $${name},
          set: v => $${name} = v
        }`
        ),
        ', \n'
      )}
      }
    }
  }));`;
  const reflectiveModule = new Module(`reflect:${url}`);
  reflectiveModule.compile(src);
  reflectiveModule.instantiate();
  const { setExecutor, reflect } = reflectiveModule.evaluate(-1, false)();
  // public exposed ESM
  const reexports = `
  import {
    executor,
    ${ArrayMap(names, name => `$${name}`)}
  } from "";
  export {
    ${ArrayJoin(ArrayMap(names, name => `$${name} as ${name}`), ', ')}
  }
  if (typeof executor === "function") {
    // add await to this later if top level await comes along
    executor()
  }`;
  if (typeof evaluate === 'function') {
    setExecutor(() => evaluate(/** @type {Reflect} */ (reflect)));
  }
  target.compile(reexports);
  target.resolveRequest('', reflectiveModule);
  target.instantiate();
  reflect.namespace = target.namespace;
  return {
    module: target,
    reflect,
  };
};

module.exports = createDynamicModule;
