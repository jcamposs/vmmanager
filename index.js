var logger = require('nlogger').logger(module);
var pkginfo = require('pkginfo')(module);

function load_drivers() {
  logger.info("Loading drivers.");
}


logger.info('Daemon ', module.exports.name, ' version ',
  module.exports.version, ' starting');

load_drivers();
