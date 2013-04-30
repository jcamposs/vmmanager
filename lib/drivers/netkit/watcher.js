var logger = require('nlogger').logger(module);
var ClientHandShake = require('./telnet').ClientHandShake;
var nimble = require('nimble');
var util = require("util");
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var MAX_TRIES = 4;

var Watcher = function(host, port, name) {
  this._host = host;
  this._port = port;
  this._name = name;
  this._state = "stopped";
  this._init = false;
}

util.inherits(Watcher, EventEmitter);

Watcher.prototype.connect = function(callback) {
  var obj = this;

  if (this._state != "stopped") {
    callback("Watcher is already running");
    return;
  }

  nimble.series([
    function(_callback) {
      var TIMEOUT = 2000;
      var tries = 0;
      var handler = function() {
        obj._vmSocket = net.connect(obj._port, obj._host, function() {
          obj._hackService = new ClientHandShake();
          obj._hackService.on("command", function(cmd) {
            obj._vmSocket.write(cmd);
          });

          if (obj._state == "connecting") {
            logger.warn("Watcher connected_______________________________");
            obj._state = "connected";
            _callback();
          }
        });

        obj._vmSocket.on('data', function (buff) {
          var data = obj._hackService.process(buff);

          if (data.length <= 0)
            return;

          if (!obj._init && data.toString().search(obj._name + ":~#") >= 0) {
            obj._watch(function() {
              logger.debug("Watcher " + obj._name + " initialized.");
              obj._init = true;
            });
          }

          if (obj._init)
            obj._filterIPs(data.toString());
        });

        obj._vmSocket.on('close', function (had_error) {
          logger.warn("Watcher lost connection_______________________________");
          if (obj._state == "connecting")
            return;

          obj._state = "stopped";
          obj.emit('close');
        });

        obj._vmSocket.on('error', function (err) {
          if (obj._state == "connecting") {
            if (tries++ < MAX_TRIES) {
              logger.debug("Watcher connection failed. Trial " + tries);
              obj._timeoutId = setTimeout(handler, TIMEOUT);
            } else
              callback(err);
          } else
            logger.error(err);
        });

      }

      obj._state = "connecting";
      obj._timeoutId = setTimeout(handler, TIMEOUT);
    }
  ], function() {
    obj._state = "running";
    callback(null);
  });
}

Watcher.prototype.close = function() {
  logger.debug("Closing " + this._name + " watcher.");

  if (this._state == "stopped")
    return;

  this._state = "stopping";
  this._vmSocket.destroy();
}

Watcher.prototype._watch = function(callback) {
  /* Next command will send text whenever an interface is updated */
  var cmd = Buffer("ip -4 monitor address\r\n");
  this._vmSocket.write(cmd, callback);
}

Watcher.prototype._filterIPs = function(text) {
  logger.debug("Watcher: " + text);
}

module.exports = Watcher;