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
            add_workspace(msg, function(err) {
              if (err)
                logger.warn(err);
            });
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

function add_driver(name, driver) {
  if (drivers[name])
    logger.warn("Driver ", name, " is already loaded.");
  else
    drivers[name] = driver;
}

function add_workspace(cfg, callback) {
  try {
    if (!drivers[cfg.driver])
      callback("Missing driver: " + cfg.driver + ". Required by workspace " +
                                                                cfg.workspace);
    else if (workspaces[cfg.workspace])
      callback("Workspace " + cfg.workspace + " already created");
    else {
      var wk = new Workspace(cfg, drivers[cfg.driver], function(err) {
        if (err)
          callback(err);
        else if (!wk.getProperty("workspace"))
          callback("Nor workspace property found");
        else if (workspaces[wk.getProperty("workspace")])
          callback("Workspace " + wk.getProperty("workspace") +
                                                            " already created");
        else {
          workspaces[wk.getProperty("workspace")] = wk;
          callback(null);
        }
      });
    }
  } catch(err) {
    callback(err);
  }
}

function load_workspace(dir, callback) {
  var conf_file = path.join(dir, "config.json");
  fs.readFile(conf_file, function (err, data) {
    if (err)
      callback(err);
    else
      try {
        var cfg = JSON.parse(data);
        add_workspace(cfg, function(err){
          callback(err);
        });
      } catch (err) {
        logger.warn(err);
        callback("Unable to parse " + conf_file);
      }
  });
}

exports.start = start;
exports.stop = stop;
exports.load_workspace = load_workspace;
exports.add_driver = add_driver;
