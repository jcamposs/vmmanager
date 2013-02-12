var logger = require('nlogger').logger(module);
var pkginfo = require('pkginfo')(module);
var nimble = require('nimble');
var fs = require('fs');

var drivers = [];
var exiting = false;

function shutdown() {
  exiting = true;
  for (var i = 0; i < drivers.length; i++)
    if (drivers[i].running)
      drivers[i].stop();
}

logger.info('Daemon ', module.exports.name, ' version ',
  module.exports.version, ' starting.');

nimble.series([
  function(callback) {
    logger.info("Installing signal handlers");

    process.on('SIGINT', function() {
      logger.debug('Got a SIGINT');
      shutdown();
    });

    process.on('SIGHUP', function() {
      logger.debug('Got a SIGHUP');
      shutdown();
    });

    process.on('exit', function () {
      logger.info('Daemon ', module.exports.name, ' exit.');
    });

    callback();
  },
  function(callback) {
    if (exiting) {
      logger.debug("Skipping drivers loading.");
      callabck();
    }

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
    if (exiting) {
      logger.debug("Skipping drivers initialization.");
      callabck();
    }

    logger.info("Starting drivers drivers.");
    var count = 0;
    for (var i = 0; i < drivers.length; i++)
      drivers[i].start(function(err) {
        if (err)
          logger.error(err);
        else if (exiting)
          drivers[i].stop();

        if (++count == drivers.length)
          callback();
      });
  }
], function() {
  logger.info('Daemon ', module.exports.name, ' running.');
});
