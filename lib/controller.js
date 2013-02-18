var logger = require('nlogger').logger(module);
var Workspace = require('./workspace');
var nimble = require('nimble');
var amqp = require('amqp');
var path = require('path');
var fs = require('fs');

var workspaces = {};
var drivers = {};
var config = {};
var connection = null;;
var queue = null;
var max_tries = 5;
var initialized = false;
var ctag = null;

function start(drv, callback) {
  if (initialized) {
    logger.warn("AMQP controller is already initialized");
    callback(null);
    return;
  }

  drivers = drv;
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
    },
    function(_callback) {
      // Initialize working queue
      var name = 'workspace.' + Object.config.environment + '.create';
      queue = connection.queue(name, {durable: true, autoDelete: false},
                                                            function (queue) {
        queue.bind("");

        queue.on('queueBindOk', function() {
          logger.info('Queue ' + queue.name + ' bound');
          queue.subscribe(function (msg, headers, deliveryInfo) {
            logger.info('Received: ', msg);
            try {
              if (!drivers[msg.driver])
                throw "Driver is not specified";
              else if (workspaces[msg.workspace])
                logger.warn("Workspace ", msg.workspace, " already created");
              else {
                var wk = new Workspace(msg, drivers[msg.driver], function(err) {
                  if (err)
                    logger.error(err);
                  else if (!wk.getProperty("workspace"))
                    logger.error("Nor workspace property found");
                  else if (workspaces[wk.getProperty("workspace")])
                    logger.warn("Workspace ", wk.getProperty("workspace"),
                                                            " already created");
                  else
                    workspaces[wk.getProperty("workspace")] = wk;
                });
              }
            } catch(err) {
              logger.error(err);
            }
          }).addCallback(function(ok) {
            ctag = ok.consumerTag;
          });
          _callback();
        });
      });
    }
  ], function() {
    logger.info('AMQP stuff initialized.');
    initialized = true;
    callback(null);
  });
}

function stop(callback) {
  if (!initialized) {
    logger.warn("AMQP controller is not running.");
    return;
  }

  queue.unsubscribe(ctag);
  queue.unbind("");
  queue.destroy().addCallback(function(){
    connection.end();
    connection.destroy();

    reset_parameters();

    callback();
  });
}

function reset_parameters() {
  ctag = null;
  connection = null;
  queue = null;
  initialized = false;
}

exports.start = start;
exports.stop = stop;
