var logger = require('nlogger').logger(module);
var pkginfo = require('pkginfo')(module);
var nimble = require('nimble');
var fs = require('fs');

var drivers = [];

logger.info('Daemon ', module.exports.name, ' version ',
  module.exports.version, ' starting.');

logger.debug("Installing signal handlers");
process.on('SIGINT', function() {
  logger.debug('Got a SIGINT');
  process.exit(1);
});

process.on('SIGHUP', function() {
  logger.debug('Got a SIGHUP');
  logger.debug('TODO:');
});

nimble.series([
  function(callback) {
    logger.info("Loading drivers.");
    var path = "./lib/drivers";

    fs.readdir(path, function(err, files) {
      if (err) {
        logger.error(err);
        throw err;
      }

      for (var i = 0; i < files.length; i++) {
        var Driver = require(path + '/' + files[i]);
        drivers.push(new Driver);
      }

      callback();
    });
  },
  function(callback) {
    logger.info("Starting drivers drivers.");
    for (var i = 0; i < drivers.length; i++)
      drivers[i].start();
    callback();
  }
], function() {
  logger.info('Daemon ', module.exports.name, ' running.');
});
