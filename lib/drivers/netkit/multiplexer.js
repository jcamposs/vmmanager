var logger = require('nlogger').logger(module);
var ServerHandShake = require('./telnet').ServerHandShake;
var ClientHandShake = require('./telnet').ClientHandShake;
var nimble = require('nimble');
var util = require("util");
var net = require('net');
var EventEmitter = require('events').EventEmitter;

var CTRL_L = 0x0C; /* (Ctrl + l) => Refresh screen */
var ESC  = 0x1B;
var RED  = new Buffer([ESC, 0x5b, 0x33, 0x31, 0x6d]);   /* {ESC}[31m */
var BLACK  = new Buffer([ESC, 0x5b, 0x30, 0x6d]);       /* {ESC}[0m */

var Multiplexer = function(host, port, name) {
  this._host = host;
  this._port = port;
  this._name = name;
  this._state = "stopped";
  this._users = [];
  this._channel = new EventEmitter();
  this._init = false;
}

util.inherits(Multiplexer, EventEmitter);

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
        if (obj._state == "running")
          obj._addUser(client);
        else {
          var msg = new Buffer("Netkit multiplexer is not ready\r\n");
          client.write(Buffer.concat([RED, msg, BLACK]));
          client.end();
        }
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
    },
    function(_callback) {
      obj._timeoutId = setTimeout(function() {
        obj._vmSocket = net.connect(obj._port, obj._host, function() {
          obj._hackService = new ClientHandShake();
          obj._hackService.on("command", function(cmd) {
            obj._vmSocket.write(cmd);
          });

          if (obj._state == "connecting") {
            obj._state = "connected";
            _callback();
          }
        });

        obj._vmSocket.on('data', function (buff) {
          var data = obj._hackService.process(buff);

          if (data.length <= 0)
            return;

          if (!obj._init && data.toString().search(obj._name + ":~#") >= 0) {
            logger.info("Node " + obj._name + " initialized.");
            obj._init = true;
          }

          if (obj._state == "running")
            obj._channel.emit('output', data)
        });

        obj._vmSocket.on('close', function (had_error) {
          obj.close(function() {
            logger.debug("Lost connection with virtual machine");
            obj.emit('close');
          });
        });

        obj._vmSocket.on('error', function (err) {
          if (obj._state == "connecting") {
            obj.close(function() {
              callback(err, null);
            });
          } else
            logger.error(err);
        });

      }, 2000);

    }
  ], function() {
    if (obj._state != "connected")
      return;

    obj._channel.on('input', function(buff) {
      obj._vmSocket.write(buff);
    });

    var addr = obj._serverSocket.address();
    logger.debug("Multiplexer listening on ",addr.address, ":", addr.port);
    obj._state = "running";
    callback(null, addr.port);
  });
}

Multiplexer.prototype.close = function(callback) {
  if (this._state == "stopped" || this._state == "closing") {
    callback();
    return;
  }

  var obj = this;
  obj._state = "closing";

  this._serverSocket.close(function() {
    logger.debug("Multiplexer closed");
    obj._state = "stopped";
    callback();
  });

  for (var i = 0; i < this._users.length; i++)
    this._users[i].close();
}

Multiplexer.prototype.isInitialized = function() {
  return this._init;
}

Multiplexer.prototype._addUser = function(socket) {
  var user = new User(socket);
  var user_list = this._users;
  var channel = this._channel;

  user_list.push(user);

  var output_listener = function(buff) {
    if (socket.writable)
      socket.write(buff);
  }
  user.on("ready", function() {
    channel.on('output', output_listener);
    // Refresh user's screen
    var buff = new Buffer(1);
    buff[0] = CTRL_L;
    channel.emit('input', buff);
  });

  user.on("data", function(buff) {
    channel.emit('input', buff);
  });

  user.on("error", function(err) {
    logger.error(err);
  });

  user.on("close", function() {
    logger.debug("User ", user.getId(), " disconnected.");
    channel.removeListener('output', output_listener);
    user.removeAllListeners();
    // Remove this user from the user list
    user_list.splice(user_list.indexOf(user), 1);
  });

  user.configure();
}

module.exports = Multiplexer;


/************************************************************/
/* User class.                                              */
/* It represents each user connected to the virtual machine */
/************************************************************/

var User = function(socket) {
  this._socket = socket;
  this._state = "stopped";
  this._telnetConn = new ServerHandShake();
}

util.inherits(User, EventEmitter);

User.prototype.configure = function() {
  var obj = this;
  obj._state = "configuring";

  obj._telnetConn.on("command", function(cmd) {
    obj._socket.write(cmd);
  });

  obj._telnetConn.on("ready", function() {
    if (obj._state == "configuring") {
      obj._state = "configured";
      obj.emit("ready");
    }
  });

  obj._telnetConn.on("error", function(err) {
    if (obj._state == "configuring") {
      obj._state = "stopping";
      obj._socket.end();
    }

    obj.emit("error", err);
  });

  obj._socket.on('data', function (buff) {
    var data = obj._telnetConn.process(buff);

    if (data.length <= 0)
      return;

    if (obj._state == "configured")
      obj.emit('data', data);
  });

  obj._socket.on('close', function () {
    obj._state = "stopped";
    obj.emit("close");
  });

  this._telnetConn.init_handshake();
}

User.prototype.getId = function() {
  return this._telnetConn.get_user();
};

User.prototype.close = function() {
  this._socket.end();
};
