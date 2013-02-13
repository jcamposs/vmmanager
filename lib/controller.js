var logger = require('nlogger').logger(module);
var nimble = require('nimble');
var amqp = require('amqp');
var path = require('path');
var fs = require('fs');

var config;
var connection;

function start(callback) {
  nimble.series([
    function(_callback) {
      // Read AMQP configuration file
      var config = path.join(__dirname, "../amqp.json");
      fs.readFile(config, 'utf8', function(err, data) {
        if (err) {
          callback(err);
          return;
        }

        try {
          amqp_config = JSON.parse(data);
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
    }
  ], function() {
    logger.info('AMQP stuff initialized.');
    callback(null);
  });
}

function stop() {
  connection.end()
}

exports.start = start;
exports.stop = stop;
