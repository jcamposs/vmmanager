var logger = require('nlogger').logger(module);
var ServerHandShake = require('./telnet').ServerHandShake;
var ClientHandShake = require('./telnet').ClientHandShake;
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
      obj._hackService = new ClientHandShake();
      obj._hackService.on("command", function(cmd) {
        obj._vmSocket.write(cmd);
      });
      // TODO: Change port number for multiplexer listening port
      callback(null, 9999);
    });

    obj._vmSocket.on('data', function (buff) {
      var data = obj._hackService.process(buff);

      if (data.length <= 0)
        return;

      //TODO: Send data to clients
      console.log(data.toString());
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
