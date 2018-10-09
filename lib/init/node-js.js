'use strict';

function initNodeJS(target) {
  const urlObject = new URL(target.url);
  const actual = require(urlObject.pathname);
  const exportKeys = [...Object.keys(actual), 'default'];
  target.setLazyStaticExports(exportKeys, () => {
    return Object.assign({}, actual, {
      default: actual,
    });
  });
}
module.exports = initNodeJS;