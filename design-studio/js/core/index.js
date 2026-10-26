/* Node-only aggregator so module files can `require('../core/index.js')`
 * and get the same DS object they see in the browser. */
'use strict';
module.exports = {
  base: require('./base.js'),
  Drawing: require('./drawing.js'),
  svg: require('./svg.js'),
  dxf: require('./dxf.js'),
  csv: require('./csv.js'),
  staad: require('./staad.js'),
  hecras: require('./hecras.js'),
  geo: require('./geo.js'),
  store: require('./store.js'),
  note: require('./note.js')
};
