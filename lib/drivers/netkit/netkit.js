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
      var err_msg = null;

      for (var i = 0; i < commands.length; i++) {
        var cmd = path.join(process.env.NETKIT_HOME, 'bin', commands[i]);
        fs.exists(cmd, function(command) {
          return function(exists) {
            if (!exists)
              err_msg = add_error(err_msg, "Command " + command + " does not exists.");

            if (++checked == commands.length)
              if (err_msg)
                callback(err_msg);
              else
                _callback()
          }
        }(cmd));
      }
    },
    function(_callback) {
      var S_IXUSR = 00100;
      var S_IXGRP = 00010;
      var S_IXOTH = 00001;
      var exec_bits = S_IXUSR | S_IXGRP | S_IXOTH;

      // Check execution permissions
      var checked = 0;
      var err_msg = null;

      for (var i = 0; i < commands.length; i++) {
        var cmd = path.join(process.env.NETKIT_HOME, 'bin', commands[i]);
        fs.stat(cmd, function(command) {
          return function(err, stats) {
            if (err)
              err_msg = add_error(err_msg, err);

            if (!stats.isFile())
              err_msg = add_error(err_msg, "Not regular file " + command);
            else
              if (stats.mode & exec_bits == 0)
                err_msg = add_error(err_msg, "Missing execute permission in" + command);

            if (++checked == commands.length)
              if (err_msg)
                callback(err_msg);
              else
                _callback()
          }
        }(cmd));
      }
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

function add_error(msg, err) {
  if (msg)
    msg += "\n" + err;
  else
    msg = err;

  return msg;
}

module.exports = Netkit;

