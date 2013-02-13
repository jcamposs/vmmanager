var Driver = require("../../driver");
var nimble = require('nimble');
var util = require("util");
var path = require('path');
var fs = require('fs');

var Netkit = function() {
}

util.inherits(Netkit, Driver);

Netkit.prototype.start = function(callback) {
  // Check wheter netkit is properly configured in this system
  if (!process.env.NETKIT_HOME) {
    callback("NETKIT_HOME environment variable not found");
    return;
  }

  var commands = ['vstart', 'vhalt', 'vcrash', 'vlist'];

  nimble.series([
    function(_callback) {
      // Check command availability
      var checked = 0;
      var err = null;

      for (var i = 0; i < commands.length; i++) {
        var cmd = path.join(process.env.NETKIT_HOME, 'bin', commands[i]);
        fs.exists(cmd, function(command) {
          return function(exists) {
            if (!exists) {
              var msg = "Command " + command + " does not exists.";
              if (err)
                err += "\n" + msg;
              else
                err = msg;
            }

            if (++checked == commands.length)
              if (err)
                callback(err);
              else
                _callback()
          }
        }(cmd));
      }
    },
    function(_callback) {
      // Check execution permissions
      console.log("Check permission");
      _callback();
    }
  ], function() {
    console.log("Returning can't start");
    callback("TODO: Implement netkit start");
  });
}

Netkit.prototype.stop = function(callback) {
  console.log("Stop netkit");
  this._started = false;
  callback(null);
}

module.exports = Netkit;

