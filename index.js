var logger = require('nlogger').logger(module);
var controller = require('./lib/controller');
var nimble = require('nimble');
var path = require('path');
var fs = require('fs');

var daemon_info = JSON.parse(fs.readFileSync('package.json', 'utf8'))

var drivers = {};
var driverinfo = {};
var exiting = false;
var driver_count = 0;

function shutdown() {
  var count = 0;
  exiting = true;

  logger.info("Stop plugins.");
  for (var driver in drivers)
    if (drivers[driver].running())
      drivers[driver].stop(function(err) {
        if (err) {
          logger.debug("Unable to stop driver ", driver);
          logger.error(err);
        }

        if (++count == driver_count) {
          logger.info("Stop AMQP stuff.");
          controller.stop();
        }
      });
    else if (++count == driver_count) {
      logger.info("Stop AMQP stuff.");
      controller.stop();
    }
}

logger.info('Daemon ', daemon_info.name, ' version ',
  daemon_info.version, ' starting.');

nimble.series([
  function(callback) {
    logger.info("Install signal handlers.");

    process.on('SIGINT', function() {
      logger.debug('Got a SIGINT');
      shutdown();
    });

    process.on('SIGHUP', function() {
      logger.debug('Got a SIGHUP');
      shutdown();
    });

    process.on('exit', function () {
      logger.info('Daemon ', daemon_info.name, ' exit.');
    });

    callback();
  },
  function(callback) {
    if (exiting) {
      logger.debug("Skipping drivers loading.");
      callback();
    }

    logger.info("Load drivers.");
    var driver_dir = path.join(__dirname, "lib", "drivers");

    fs.readdir(driver_dir, function(err, files) {
      if (err) {
        logger.error(err);
        throw err;
      }

      var count = 0;
      for (var i = 0; i < files.length; i++) {
        var module_dir = path.join(driver_dir, files[i]);
        fs.readFile(path.join(module_dir, 'package.json'), 'utf8',
          function(err, data) {
            if (err)
              logger.error(err);
            else {
              try {
                var info = JSON.parse(data);
                var Driver = require(module_dir);

                if (!info.name) {
                  logger.warn("Missing name driver ", module_dir);
                  return
                }

                logger.debug("Found driver:\n", data);
                if (driverinfo[info.name]) {
                  if (info.version > driverinfo[info.name].version) {
                    logger.warn("Replacing driver ", info.name, " v.",
                                                driverinfo[info.name].version);
                    logger.warn("Using driver ", info.name, " v.", info.version);
                    drivers[info.name] = new Driver;
                    driverinfo[info.name] = info;
                  } else
                    logger.debug("Ignored driver ", info.name,
                                              " v.", info.version, ". Using v.",
                                                driverinfo[info.name].version);
                } else {
                  drivers[info.name] = new Driver;
                  driverinfo[info.name] = info;
                  driver_count++;
                }
              } catch (err) {
                logger.error(err);
              }
            }

            if (++count == files.length)
              callback();
        });
      }
    });
  },
  function(callback) {
    if (exiting) {
      logger.debug("Skipping drivers initialization.");
      callback();
    }

    logger.info("Start drivers.");
    var count = 0;
    for (var driver in drivers)
      drivers[driver].start(function(err) {
        if (err) {
          logger.debug("Unable to start driver ", driver);
          logger.error(err);
        } else if (exiting)
          drivers[driver].stop(function(err) {
            if (err) {
              logger.debug("Unable to stop driver ", driver);
              logger.error(err);
            }
          });

        if (++count == driver_count)
          callback();
      });
  },
  function(callback) {
    if (exiting)
      callback();

    var running = 0;
    for (var driver in drivers)
      if (drivers[driver].running())
        running++;

    if (running == 0) {
      logger.warn("No drivers loaded. Unable to attend requests");
      return;
    }

    logger.debug(running, " driver", (running > 1) ? "s " : " ", "started");
    callback();
  },
  function(callback) {
    if (exiting) {
      logger.debug("Skipping AMQP initialization.");
      callback();
    }

    logger.info("Start AMQP stuff.");
    controller.start();
    callback();
  }
], function() {
  logger.info('Daemon ', daemon_info.name, ' is now running.');
});
