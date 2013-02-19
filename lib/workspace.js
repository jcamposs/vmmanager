var logger = require('nlogger').logger(module);
var nimble = require('nimble');
var path = require('path');
var fs = require('fs');

var Workspace = function(config, driver, callback) {
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
        callback(err);
      });
  });
}

Workspace.prototype.getBaseDirectory = function() {
  return path.join(this.base_path, this._config.driver);
}

Workspace.prototype.getProperty = function(name) {
  return this._config[name];
}

module.exports = Workspace;
