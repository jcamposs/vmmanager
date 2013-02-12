var Driver = function() {
  this._started = false;
}

Driver.prototype.start = function(callback) {
  this._started = true;
  callback(null);
}

Driver.prototype.stop = function() {
  throw "Not implemented";
}

Driver.prototype.running = function(callback) {
  return this._started;
}

module.exports = Driver;
