var logger = require('nlogger').logger(module);
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var Driver = require("../../driver");
var Multiplexer = require("./multiplexer");
var nimble = require('nimble');
var util = require("util");
var path = require('path');
var net = require('net');
var fs = require('fs');
var pkg = require('./package.json');

var NETKIT_WEB = "http://wiki.netkit.org/";

var Netkit = function() {
  this._vms = {};
  this._workspaces = {};
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

Netkit.prototype.stop = function(callback) {
  for (var id in this._workspaces) {
    var wk = this._workspaces[id];
    var vmlist = this._vms[wk.getProperty("workspace")];

    for (var j = 0; j < vmlist.length; j++) {
      logger.debug("Stopping netkit node ", vmlist[j]["process"]);

      this.stopVM(wk, vmlist[j]["config"], function(err) {
        if (err)
          logger.error(err);
      })
    }
  }

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

Netkit.prototype.created = function(workspace, callback) {
  var dir = path.join(workspace.getBaseDirectory(), "lab.conf");
  var file = "LAB_AUTHOR=\"" + workspace.getProperty("user") + "\"\r\n";
  file += "LAB_EMAIL=\"" + workspace.getProperty("email") + "\"\r\n";
  file += "LAB_VERSION=\"" + pkg.version + "\"\r\n";
  file += "LAB_WEB=\"" + NETKIT_WEB + "\"\r\n";
  file += "LAB_DESCRIPTION=\"" + workspace.getProperty("description") + "\"\r\n";

  var obj = this;

  fs.writeFile(dir, file, function (err) {
    if (!err) {
      obj._workspaces[workspace.getProperty("workspace")] = workspace;
      obj._vms[workspace.getProperty("workspace")] = [];
    }

    callback(err);
  });
}

Netkit.prototype.startVM = function(workspace, config, callback) {
  var obj = this;

  configureNetkitVM(workspace, config, function(err, cfg) {
    if (err)
      callback(err);
    else {
      // Release the port so that it can be used by the virtual machine
      // Note: This port can be reassigned to a diferent process if a context
      // switch happens altough getting the same port is not very likely.
      cfg["svc"].close();

      // Store process pid

      var child = spawn(cfg["cmd"], cfg["args"], {
        detached: true,
        cwd: undefined,
        env: process.env,
        stdio: 'ignore',
      });

      child.unref();

      var m = new Multiplexer("localhost", cfg["port"]);

      obj._vms[workspace.getProperty("workspace")].push({
        "node": cfg["node"],
        "process": cfg["name"],
        "config": config,
        "callbacks": {
          "start": [],
          "stop": []
        },
        "multiplexer": m});

      m.on('close', function() {
        logger.debug("Closed virtual machine connection with ", cfg["name"]);
        var index = obj._getVmIndex(workspace, "node", config["name"]);

        if (index < 0)
          return;

        obj.stopVM(workspace, config, function(err) {
          if (err)
            logger.error(err);
          else
            obj._vms[workspace.getProperty("workspace")].splice(index, 1);
        });
      });

      m.connect(function(err, port) {
        callback(err, port);
      });
    }
  });
}

Netkit.prototype.stopVM = function(workspace, config, callback) {
  var index = this._getVmIndex(workspace, "node", config["name"]);

  if (index < 0) {
    // Virtual machine is not running
    callback(null);
    return;
  }

  var name = this._vms[workspace.getProperty("workspace")][index]["process"];
  var script = path.join(process.env.NETKIT_HOME, 'bin', "vhalt");
  script += " " + name + " > /dev/null;";
  script += " if `"
  script += path.join(process.env.NETKIT_HOME, 'bin', "vlist");
  script += " | grep " + name + " > /dev/null`;";
  script += " then ";
  script += path.join(process.env.NETKIT_HOME, 'bin', "vcrash");
  script += " " + name + " > /dev/null;";
  script += " fi;";

  // Set exit status depending on wheter the process is still running or not
  script += " if `"
  script += path.join(process.env.NETKIT_HOME, 'bin', "vlist");
  script += " | grep " + name + " > /dev/null`;";
  script += " then ";
  script += "exit 2;";
  script += " fi;";

  child = exec(script, function(error, stdout, stderr) {
    if (error !== null)
      logger.error(error);
  });

  child.on('exit', function (code) {
    if (code != 0)
      callback("Can not shut down virtual machine " + config["name"]);
    else
      callback(null);
  });
}

Netkit.prototype._getVmIndex = function(workspace, property, value) {
  var vm_list = this._vms[workspace.getProperty("workspace")];

  if (!vm_list)
    return -1;

  for (var i = 0; i < vm_list.length; i++) {
    if (vm_list[i][property] == value)
      return i;
  }

  return -1
}

module.exports = Netkit;

function configureNetkitVM(workspace, params, callback) {
  // Assign an unique name by using epoch time value
  var netkitCfg = {
    "node": params.name,
    "name": "vm" + (new Date).getTime(),
    "cmd": path.join(process.env.NETKIT_HOME, 'bin', "vstart"),
    "args": []
  }

  netkitCfg["args"].push(netkitCfg["name"]);

  // Set directory where COW file is going to be stored
  var cow_file = params.name + ".disk";
  var cow_path = path.join(workspace.getBaseDirectory(), cow_file);
  netkitCfg["args"].push("-f");
  netkitCfg["args"].push(cow_path);

  // By default, the home directory of the current user is made available for
  // reading/writing  inside  the  virtual machine under the special directory
  // "/hosthome". This option disables this behaviour, thus not making the host
  // filesystem accessible from inside the virtual machine.
  netkitCfg["args"].push("-H");

  // Set a directory on the host machine which contains information about the
  // configuration of the laboratory
  netkitCfg["args"].push("-l");
  netkitCfg["args"].push(workspace.getBaseDirectory());

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
          netkitCfg["args"].push("--con0=port:" + netkitCfg["port"]);
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
          netkitCfg["args"].push("--" + entry["interface"] + "=" +
                                                     entry["collision_domain"]);
        else
          callback("Error: VMC protocol error", null);
      }

      _callback();
    }
  ], function() {
    callback(null, netkitCfg);
  });
}
