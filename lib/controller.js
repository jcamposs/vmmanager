var logger = require('nlogger').logger(module);
var nimble = require('nimble');
var amqp = require('amqp');
var path = require('path');
var fs = require('fs');

var config;
var connection;
var max_tries = 5;
var initialized = false;

function start(callback) {
  if (initialized) {
    logger.warn("AMQP controller is already initialized");
    callback(null);
    return;
  }

  var tries = 0;

  nimble.series([
    function(_callback) {
      // Read AMQP configuration file
      var conf_file = path.join(__dirname, "../amqp.json");
      fs.readFile(conf_file, 'utf8', function(err, data) {
        if (err) {
          callback(err);
          return;
        }

        try {
          config = JSON.parse(data);
          _callback();
        } catch (err) {
          callback(err);
        }
      });
    },
    function(_callback) {
      // Initialize AMQP stuff
      connection = amqp.createConnection(config);
      connection.on('ready', function () {
        _callback();
      });
      connection.on('close', function (err) {
        logger.warn("AMQP connection closed.");
      });
      connection.on('error', function (err) {
        if (err) {
          logger.error(err);
          if ((++tries >= max_tries) && (connection)) {
            logger.warn("Maximum connection tries exceeded.");
            connection.destroy();
            connection = null;
            throw("Unable to create create AMQP connection,");
          }
        }
      });
    }
  ], function() {
    logger.info('AMQP stuff initialized.');
    initialized = true;
    callback(null);
  });
}

function stop() {
  if (!initialized) {
    logger.warn("AMQP controller is not running.");
    return;
  }

  connection.end();
  connection = null;
  initialized = false;
}

exports.start = start;
exports.stop = stop;
