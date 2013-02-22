var logger = require('nlogger').logger(module);
var Driver = require("../../driver");
var nimble = require('nimble');
var util = require("util");
var path = require('path');
var net = require('net');
var fs = require('fs');
var pkg = require('./package.json');

var Netkit = function() {
}

util.inherits(Netkit, Driver);

Netkit.prototype.start = function(callback) {
  if (this._started) {
    logger.debug("Netkit driver is already started");
    callback();
    return;
  }

  // Check wheter netkit is properly configured in this system
  if (!process.env.NETKIT_HOME) {
    callback("NETKIT_HOME environment variable not found");
    return;
  }

  var commands = ['vstart', 'vhalt', 'vcrash', 'vlist'];
  var obj = this;

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
              err_msg = add_error(err_msg, "Command " + command +
                                                           " does not exists.");

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
                err_msg = add_error(err_msg, "Missing execute permission in" +
                                                                       command);

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
    obj._started = true;
    callback();
  });
}

function add_error(msg, err) {
  if (msg)
    msg += "\n" + err;
  else
    msg = err;

  return msg;
}

Netkit.prototype.created = function(workspace, callback) {
  var dir = path.join(workspace.getBaseDirectory(), "lab.conf");
  var file = "LAB_AUTHOR=" + workspace.getProperty("user") + "\n";
  file += "LAB_EMAIL=" + workspace.getProperty("email") + "\n";
  file += "LAB_VERSION=" + pkg.version + "\n";
  file += "LAB_WEB=http://wiki.netkit.org/\n";
  file += "LAB_DESCRIPTION=" + workspace.getProperty("description") + "\n";

  fs.writeFile(dir, file, function (err) {
    callback(err);
  });
}

Netkit.prototype.startVM = function(workspace, config, callback) {
  configureNetkitVM(workspace, config, function(err, cfg) {
    if (err)
      callback(err);
    else {
      logger.debug("Configuration: " + cfg["cmd"]);
      cfg["svc"].close();
    }
  });
}

module.exports = Netkit;

function configureNetkitVM(workspace, params, callback) {
  // Assign an unique name by using epoch time value
  var netkitCfg = {
    "name": (new Date).getTime(),
    "cmd": path.join(process.env.NETKIT_HOME, 'bin', "vstart")
  }

  netkitCfg["cmd"] += " " + netkitCfg["name"];

  // Set directory where COW file is going to be stored
  var cow_file = params.name + ".disk";
  var cow_path = path.join(workspace.getBaseDirectory(), cow_file);
  netkitCfg["cmd"] += " -f " + cow_path;

  // By default, the home directory of the current user is made available for
  // reading/writing  inside  the  virtual machine under the special directory
  // "/hosthome". This option disables this behaviour, thus not making the host
  // filesystem accessible from inside the virtual machine.
  netkitCfg["cmd"] += " -H";

  // Set a directory on the host machine which contains information about the
  // configuration of the laboratory
  netkitCfg["cmd"] += " -l " + workspace.getBaseDirectory();

  // Some serial asynchronous configuration
  nimble.series([
    function(_callback) {
      // Reserve a free port by using it, afterwads we will release when
      // launching the virtual machine. That's not an infallible fix due to the
      // port can be reassigned to a different process in the time it is
      // realeased and assigned again.
      netkitCfg["svc"] = net.createServer(function(socket) {});

      netkitCfg["svc"].listen(0, function() {
          netkitCfg["port"] = netkitCfg["svc"].address().port;
          netkitCfg["cmd"] += " --con0=port:" + netkitCfg["port"];
          _callback();
      });

      netkitCfg["svc"].on('error', function (err) {
        logger.error(err);
        callback("Can not start Netkit virtual machine", null);
      });
    },
    function(_callback) {
      // Network configuration
      if (!params["network"])
        return netkitCfg;

      for (var i = 0; i < params["network"].length; i++) {
        var entry = params["network"][i];

        if (entry["interface"] && entry["collision_domain"])
          netkitCfg["cmd"] += " --" + entry["interface"] + "=" +
                                                      entry["collision_domain"];
        else
          callback("Error: VMC protocol error", null);
      }

      _callback();
    }
  ], function() {
    callback(null, netkitCfg);
  });
}
