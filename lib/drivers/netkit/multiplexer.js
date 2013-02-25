var logger = require('nlogger').logger(module);
var net = require('net');

var Multiplexer = function(host, port) {
  this._host = host;
  this._port = port;
  this._events = {};
}

Multiplexer.prototype.on = function(evt, callback) {
  this._events[evt] = callback;
}

Multiplexer.prototype.connect = function(callback) {
  var obj = this;

  this._timeoutId = setTimeout(function() {
    obj._vmSocket = net.connect(obj._port, obj._host, function() {
      callback(null, 9999);
    });

    obj._vmSocket.on('data', function (buff) {
      console.log("Received: ", buff);
    });

    obj._vmSocket.on('close', function (had_error) {
      if (obj._events['close'])
        obj._events['close']();
    });

    obj._vmSocket.on('error', function (err) {
      logger.error(err);
    });

  }, 2000);
}

module.exports = Multiplexer;
