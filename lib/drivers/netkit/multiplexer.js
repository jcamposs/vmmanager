var logger = require('nlogger').logger(module);
var ServerHandShake = require('./telnet').ServerHandShake;
var ClientHandShake = require('./telnet').ClientHandShake;
var nimble = require('nimble');
var net = require('net');

var Multiplexer = function(host, port) {
  this._host = host;
  this._port = port;
  this._events = {};
  this._state = "stopped";
}

Multiplexer.prototype.on = function(evt, callback) {
  this._events[evt] = callback;
}

Multiplexer.prototype.connect = function(callback) {
  var obj = this;

  if (this._state != "stopped") {
    callback("Multplexer is already running", null);
    return;
  }

  nimble.series([
    function(_callback) {
      logger.debug("Creating multiplexer server");
      obj._serverSocket = net.createServer(function (client) {
        logger.debug("Connected new client");
        client.end();
      }).listen(0);

      obj._serverSocket.on('listening', function() {
        if (obj._state == "stopped") {
          obj._state = "connecting";
          _callback();
        }
      });

      obj._serverSocket.on('error', function(err) {
        if (obj._state == "stopped")
          callback("Error connecting Netkit multiplexer", null);
        else
          logger.error(err);
      });
    }
  ], function() {
    var addr = obj._serverSocket.address();
    logger.debug("Multiplexer listening on ",addr.address, ":", addr.port);
    obj._state == "running";
    callback(null, addr.port);
  });
/*
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
*/
}

module.exports = Multiplexer;
