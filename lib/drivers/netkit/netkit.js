var logger = require('nlogger').logger(module);
var spawn = require('child_process').spawn;
var exec = require('child_process').exec;
var Driver = require("../../driver");
var Multiplexer = require("./multiplexer");
var nimble = require('nimble');
var util = require("util");
var path = require('path');
var net = require('net');
var ejs = require('ejs');
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
  var obj = this;
  var context = {
    workspace: workspace.getProperty("workspace"),
    author: workspace.getProperty("user"),
    email: workspace.getProperty("email"),
    version: pkg.version,
    web: NETKIT_WEB,
    description: workspace.getProperty("description")
  }

  render("lab_conf.ejs", "lab.conf", context, workspace, function(err) {
    if (err)
      callback(err);
    else {
      logger.debug("Netkit laboratory file configured successfully.");
      obj._workspaces[workspace.getProperty("workspace")] = workspace;
      obj._vms[workspace.getProperty("workspace")] = [];
      callback(null);
    }
  });
}

Netkit.prototype.startVM = function(workspace, config, callback) {
  var index = this._getVmIndex(workspace, "node", config.name);

  if (index < 0) {
    this._startNetkitNode(workspace, config, callback);
    return;
  }

  var vm_obj = this._vms[workspace.getProperty("workspace")][index];

  switch (vm_obj["state"]) {
  case "started":
    callback(null, vm_obj["port"]);
    break;
  case "starting":
    // Add the callback to start queue
    vm_obj["callbacks"]["start"].push(callback);
    break;
  default:
    callback("Virtual machine is in state " + vm_obj["state"], null);
    break;
  }
}


Netkit.prototype._startNetkitNode = function(workspace, config, callback) {
  var obj = this;

  configureNetkitVM(workspace, config, function(err, cfg) {
    if (err) {
      destroyNode(workspace, cfg, function(e) {
        if (e)
          logger.error(e);
        else
          logger.debug("Destroyed node " + cfg["name"]);
      });
      callback(err);
    } else {
      // Release the port so that it can be used by the virtual machine
      // Note: This port can be reassigned to a diferent process if a context
      // switch happens altough getting the same port is not very likely.
      cfg["svc"].close();
      delete cfg["svc"];

      // Store process pid
      var child = spawn(cfg["cmd"], cfg["args"], {
        detached: true,
        cwd: undefined,
        env: process.env,
        stdio: 'ignore',
      });

      child.unref();

      var m = new Multiplexer("localhost", cfg["port"]);
      var vm_obj = {
        "state": "starting",
        "node": cfg["node"],
        "process": cfg["name"],
        "config": config,
        "callbacks": {
          "start": []
        },
        "multiplexer": m
      };

      obj._vms[workspace.getProperty("workspace")].push(vm_obj);

      m.on('close', function() {
        logger.debug("Closed virtual machine connection with ", cfg["name"]);
        vm_obj["state"] = "closed";
        var index = obj._getVmIndex(workspace, "node", config["name"]);

        if (index < 0)
          return;

        obj.stopVM(workspace, config, function(err) {
          if (err)
            logger.error(err);
          else {
            destroyNode(workspace, cfg, function(e) {
              if (e)
                logger.error(e);
              else
                logger.debug("Destroyed node " + cfg["name"]);
            });
            obj._vms[workspace.getProperty("workspace")].splice(index, 1);
          }
        });
      });

      m.connect(function(err, port) {
        vm_obj["port"] = port;
        vm_obj["state"] = "started";

        callback(err, port);

        // Fire pending start callbacks
        for (var i = 0; i < vm_obj["callbacks"]["start"].length; i++)
          vm_obj["callbacks"]["start"][i](null, port);

        vm_obj["callbacks"]["start"] = [];
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

  var context = {
    vhalt: path.join(process.env.NETKIT_HOME, 'bin', "vhalt"),
    vcrash: path.join(process.env.NETKIT_HOME, 'bin', "vcrash"),
    vlist: path.join(process.env.NETKIT_HOME, 'bin', "vlist"),
    name: this._vms[workspace.getProperty("workspace")][index]["process"]
  }

  var file = path.join(__dirname, "template", "halt.ejs");

  fs.readFile(file, function(err, data) {
    if (err) {
      callback(err);
      return;
    }

    var str = data.toString();
    var script = ejs.render(str, context);

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
    "name": params.name + "_workspace" + workspace.getProperty("workspace"),
    "type": params.type.toLowerCase(),
    "cmd": path.join(process.env.NETKIT_HOME, 'bin', "vstart"),
    "ifaces": [],
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
        callback("Can not start Netkit virtual machine", netkitCfg);
      });
    },
    function(_callback) {
      // Network configuration
      if (!params["network"])
        return netkitCfg;

      for (var i = 0; i < params["network"].length; i++) {
        var entry = params["network"][i];

        if (entry["interface"] && entry["collision_domain"]) {
          netkitCfg["args"].push("--" + entry["interface"] + "=" +
                                                     entry["collision_domain"]);
          netkitCfg["ifaces"].push({
            name: entry["interface"],
            callision: entry["collision_domain"]
          });
        } else
          callback("Error: VMC protocol error", netkitCfg);
      }

      _callback();
    },
    function(_callback) {
      // Make special configuration if this node is a switch one
      if (netkitCfg["type"] != "switch") {
        _callback();
        return;
      }

      var file = netkitCfg["name"] + ".startup";
      var context = {
        version: pkg.version,
        name: netkitCfg["name"],
        ifaces: netkitCfg["ifaces"]
      };

      render("switch.ejs", file, context, workspace, function(err) {
        if (err)
          callback(err, netkitCfg);
        else
          _callback();
      });
    }
  ], function() {
    callback(null, netkitCfg);
  });
}

function destroyNode(workspace, config, callback) {
  var error = null;
  nimble.series([
    function(_callback) {
      // Close socket if it's possible
      if (config["svc"]) {
        config["svc"].close();
        delete config["svc"];
      }

      _callback();
    },
    function(_callback) {
      // Destroy .ready file
      var name = config["name"] + ".ready";
      var file = path.join(workspace.getBaseDirectory(), name);

      fs.unlink(file, function(err) {
        if (error)
          add_error(error, "Error deleting file " + name);

        _callback();
      });
    },
    function(_callback) {
      // Destroy switch configuration file
      if (config["type"] != "switch") {
        callback(error);
        return;
      }

      var name = config["name"] + ".startup";
      var file = path.join(workspace.getBaseDirectory(), name);

      fs.unlink(file, function(err) {
        if (error)
          add_error(error, "Error deleting file " + name);

        callback(error);
      });
    }
  ]);
}

function render(template, name, context, workspace, callback) {
  var content = null;

  nimble.series([
    function(_callback) {
      var file = path.join(__dirname, "template", template);

      fs.readFile(file, function(err, data) {
        if (err)
          callback(err);
        else {
          var str = data.toString();

          content = ejs.render(str, context);
          _callback();
        }
      });
    },
    function(_callback) {
      var file = path.join(workspace.getBaseDirectory(), name);

      fs.writeFile(file, content, function (err) {
        if (err)
          callback(err);
        else
          _callback();
      });
    }
  ], function() {
    // No errors happened
    callback(null);
  });
}
