var Driver = function() {
  this._started = false;
}

Driver.prototype.start = function(callback) {
  this._started = true;
  callback(null);
}

Driver.prototype.stop = function(callback) {
  this._started = false;
  callback(null);
}

Driver.prototype.running = function(callback) {
  return this._started;
}

module.exports = Driver;
