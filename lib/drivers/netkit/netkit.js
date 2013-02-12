var util = require("util");
var Driver = require("../../driver");

var Netkit = function() {
}

util.inherits(Netkit, Driver);

Netkit.prototype.start = function(callback) {
  console.log("Started netkit");
  this._started = true;
  callback(null);
}

module.exports = Netkit;

