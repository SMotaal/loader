'use strict';

const debug = require('debug')('loader:load');

const Module = require('./module');

class LoadModuleJob {
  /**
   * @param {Loader} loader
   * @param {Map<string, Module>} moduleMap
   */
  constructor(loader, moduleMap) {
    this._cache = moduleMap;
    this._loader = loader;
    this._byURL = new Map();
    this._pending = 0;
    this.done = new Promise((resolve, reject) => {
      this._depDone = (depURL, wrap) => {
        this._byURL.set(depURL, wrap);
        --this._pending;
        if (this._pending === 0) resolve();
      };
      this._depFailed = reject;
    });
  }

  /**
   * @param {Module} target
   */
  push(target) {
    const url = target.url;

    if (this._byURL.has(url)) return;
    ++this._pending;
    this._byURL.set(url, false);
    const done = this.initialize(url, target);
    this._byURL.set(
      url,
      done.then(
        () => {
          this._depDone(url, target);
        },
        error => this._depFailed(error)
      )
    );
  }

  /**
   * @param {string} url
   */
  getRawModuleHandle(url) {
    if (this._cache.has(url)) return this._cache.get(url);

    const handle = new Module(url);
    this._cache.set(url, handle);

    return handle;
  }

  /**
   * @param {string} url
   * @param {Module} target
   */
  async initialize(url, target) {
    debug('initialize', url);
    const resource = await (0, this._loader.fetch)(url);
    (0, this._loader.init)(target, resource, Module);

    const { requests } = target;
    debug('resolving(%j)', url, requests);
    for (const specifier of requests) {
      if (target.isResolved(specifier)) continue;

      const depURL = (0, this._loader.resolve)(specifier, url);
      const dep = this.getRawModuleHandle(depURL);
      debug('resolveRequest %s --[%s]--> %s', url, specifier, depURL);
      target.resolveRequest(specifier, dep);

      this.push(dep);
    }

    return target;
  }

  /**
   * @param {string} url
   * @param {Module=} target
   */
  async run(url, target) {
    debug('LoadModuleJob#run', url);
    if (!target) {
      target = this.getRawModuleHandle(url);
    }
    this.push(target);
    await this.done;

    for (const depWrap of this._byURL.values()) {
      depWrap.instantiate();
    }

    const evalResult = target.evaluate();
    debug('eval %j', url, evalResult);

    return target;
  }
}

async function loadModule(loader, moduleMap, url) {
  const existing = moduleMap.get(url);
  if (existing && existing.status >= Module.kEvaluated) {
    if (existing.status === Module.kErrored) {
      throw existing.exception;
    }
    return existing;
  }
  return new LoadModuleJob(loader, moduleMap).run(url, existing);
}
module.exports = loadModule;
