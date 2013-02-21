var logger = require('nlogger').logger(module);
var nimble = require('nimble');
var path = require('path');
var fs = require('fs');

var Workspace = function(config, driver, callback) {
  this._ctag = null;
  this._initialized = false;
  this._config = config;
  this._driver = driver;
  this.base_path = path.join(Object.config.path, "workspace" + this._config.workspace);

  var obj = this;

  nimble.series([
    function(next_cb) {
      // Create workspace directory
      fs.exists(obj.base_path, function (exists) {
        if (exists) {
          next_cb();
          return;
        }

        fs.mkdir(obj.base_path, function(err) {
          if (err)
            callback(err);
          else
            next_cb();
        });
      });
    },
    function(next_cb) {
      // Create workspace config file
      var conf_file = path.join(obj.base_path, "config.json");
      fs.exists(conf_file, function (exists) {
        if (exists) {
          next_cb();
          return;
        }

        fs.writeFile(conf_file, JSON.stringify(obj._config), function (err) {
          if (err)
            callback(err);
          else
            next_cb();
        });
      });
    },
    function(next_cb) {
      // Create driver directory
      var driver_path = path.join(obj.base_path, obj._config.driver);
      fs.exists(driver_path, function (exists) {
        if (exists) {
          next_cb();
          return;
        }

        fs.mkdir(driver_path, function(err) {
          if (err)
            callback(err);
          else
            next_cb();
        });
      });
    }
  ], function() {
      driver.created(obj, function(err) {
        obj._initialized = (err == null);
        callback(err);
      });
  });
}

Workspace.prototype.configureAMQP = function(connection, callback) {
  if (!this._initialized) {
    callback("Workspace ", this._config.workspace + " is not initialized");
    return;
  }

  var workspace = this;

  // Configure start queue
  var name = 'workspace.' + Object.config.environment + "." +
                               this._config.workspace.toString() + '.vm_start';
  this._startQueue = connection.queue(name, {durable: false, autoDelete: true},
                                                            function (queue) {
    queue.bind("");

    queue.on('queueBindOk', function() {
      logger.debug('Queue ' + queue.name + ' bound');
      queue.subscribe(function (msg, headers, deliveryInfo) {
        workspace._startVM(msg, function(rsp) {
          logger.debug(rsp);
        });
      }).addCallback(function(ok) {
        workspace._ctag = ok.consumerTag;
      });
    });
  });

  //TODO: Subscribe stop queue
  //TODO: Subscribe destroy queue
  //TODO: Remove callback
  callback(null);
}

Workspace.prototype.getBaseDirectory = function() {
  return path.join(this.base_path, this._config.driver);
}

Workspace.prototype.getProperty = function(name) {
  return this._config[name];
}

Workspace.prototype._startVM = function(req, callback) {
  if (!req.workspace && !req.parameters) {
    callback("VMC protocol error");
    return;
  }

  var rsp = [];
  var count = 0;

  for (var i = 0; i < req.parameters.length; i++) {
    this._driver.startVM(this, req.parameters[i], function(config) {
      return function(err, port) {
        var node = {
          "name": config.name
        }

        if (err) {
          node["status"] = "error";
          node["cause"] = err;
        } else {
          node["status"] = "success";
          node["port"] = port;
        }

        rsp.push(node);

        if (++count == req.parameters.length)
          callback(rsp);
      }
    }(req.parameters[i]));
  }
}

module.exports = Workspace;
