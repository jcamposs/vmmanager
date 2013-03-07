var logger = require('nlogger').logger(module);

var Driver = function() {
  this._started = false;
}

Driver.prototype.start = function(callback) {
  if (this._started)
    logger.debug("Driver is already started");
  else
    this._started = true;

  callback(null);
}

Driver.prototype.stop = function(callback) {
  if (!this._started)
    logger.debug("Driver is already stopped");
  else
    this._started = false;

  callback(null);
}

Driver.prototype.running = function() {
  return this._started;
}

Driver.prototype.created = function(workspace, callback) {
  callback(null);
}

Driver.prototype.destroy = function(workspace, callback) {
  callback(null);
}

Driver.prototype.startVM = function(workspace, config, callback) {
  callback(null);
}

Driver.prototype.stopVM = function(workspace, config, callback) {
  callback(null);
}

module.exports = Driver;
