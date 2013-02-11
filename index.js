var logger = require('nlogger').logger(module);
var pkginfo = require('pkginfo')(module);
var fs = require('fs');

var drivers = [];

function load_drivers(cb) {
  var path = "./lib/drivers";
  logger.info("Loading drivers.");
  fs.readdir(path, function(err, files) {
    if (err) {
      logger.error(err);
      throw err;
    }

    for (var i = 0; i < files.length; i++) {
      var Driver = require(path + '/' + files[i]);
      drivers.push(new Driver);
    }

    cb();
  });
}


logger.info('Daemon ', module.exports.name, ' version ',
  module.exports.version, ' starting');

logger.debug("Installing signal handlers");
process.on('SIGINT', function() {
  logger.debug('Got a SIGINT');
  process.exit(1);
});

process.on('SIGHUP', function() {
  logger.debug('Got a SIGHUP');
  logger.debug('TODO:');
});

load_drivers(function() {
  logger.info("Starting drivers drivers.");
  for (var i = 0; i < drivers.length; i++)
    drivers[i].start();
});
