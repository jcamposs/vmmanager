var config = require('konphyg')(__dirname + '/../config');
var configuration = require('./configuration');
var logger = require('nlogger').logger(module);
var Workspace = require('./workspace');
var nimble = require('nimble');
var amqp = require('amqp');
var path = require('path');
var fs = require('fs');
var os = require('os');

var amqpCfg = config('amqp');
var workspaces = {};
var drivers = {};
var connection = null;
var queue = null;
var max_tries = 5;
var initialized = false;
var ctag = null;
var exchange = null;

var env = (!process.env.NODE_ENV) ? "development" : process.env.NODE_ENV;

function start() {
  if (initialized) {
    logger.warn("AMQP controller is already initialized");
    callback(null);
    return;
  }

  // Initialize AMQP stuff
  connection = amqp.createConnection(amqpCfg);
  connection.on('ready', function () {
    logger.debug("AMQP Ready.");
    if (!initialized)
      configAMQP();
  });
  connection.on('close', function (err) {
    logger.warn("AMQP connection closed.");
  });
  connection.on('error', function (err) {
    if (err)
      logger.error(err);
  });
}

function create_rsp(err, rkey) {
  var msg = {}

  if (err) {
    msg["status"] = "error";
    msg["cause"] = err;
  } else {
    msg["status"] = "success";
    msg["host"] = os.hostname();
  }

  exchange.publish(rkey, JSON.stringify(msg), {contentType: 'application/json'});
}

function configAMQP() {
  nimble.series([
    function(_callback) {
      // Initialize direct exchange
      exchange = connection.exchange('', { type: 'direct' }, function() {
        logger.debug("Notification exchange initialized");
        _callback();
      });
    },
    function(_callback) {
      // Initialize working queue
      var name = 'workspace.' + env + '.create';
      queue = connection.queue(name, {durable: true, autoDelete: false},
                                                            function (queue) {
        queue.bind("");

        queue.on('queueBindOk', function() {
          logger.info('Queue ' + queue.name + ' bound');
          queue.subscribe({ack: true}, function (msg, headers, deliveryInfo) {
            logger.info('Received: ', msg);

            add_workspace(msg, function(err) {
              if (err) {
                logger.warn(err);
                create_rsp(err, deliveryInfo.replyTo);
                queue.shift();
                return;
              }

              configuration.load(workspaces[msg.workspace], function(err) {
                if (err)
                  logger.warn(err);

                workspaces[msg.workspace].configureAMQP(connection);
              });

              create_rsp(null, deliveryInfo.replyTo);
              queue.shift();
            });
          }).addCallback(function(ok) {
            ctag = ok.consumerTag;
          });
          _callback();
        });
      });
    },
    function(_callback) {
      // Set AMQP connection for all workspaces

      for (var wk in workspaces)
        workspaces[wk].configureAMQP(connection);

      _callback();
    }
  ], function() {
    initialized = true;
  });
}

function stop(callback) {
  if (!initialized) {
    logger.warn("AMQP controller is not running.");
    return;
  }

  queue.unsubscribe(ctag);
  queue.unbind("");

  connection.end();
  connection.destroy();

  reset_parameters();

  callback();
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
          wk.on("update", function(msg) {
            var rkey = "netlab.services." + env + ".workspace.update";
            exchange.publish(rkey, msg, {contentType: 'application/json'});
          });
          wk.on("destroy", function() {
            delete workspaces[wk.getProperty("workspace")];
          });
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
          if ((!err) && (initialized)) {
            workspaces[cfg.workspace].configureAMQP(connection);
            callback(null);
          } else
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
