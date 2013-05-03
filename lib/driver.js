var logger = require('nlogger').logger(module);
var util = require("util");

var Driver = function() {
  this._started = false;
}

/***************************************************************/
/* This class is able to emit events.                          */
/* Next are the events emitted by this class:                  */
/* -stopped                                                    */
/*    This event is emitted when a virtual machines is halted  */
/*    halted. Parameters provided should include the workspace */
/*    id as first parameter and the virtual machine name as    */
/*    second parameter.                                        */
/* -ip changed                                                 */
/*    This event is emmited whenever a ip change is done in    */
/*    any network interface. Parameters provided include the   */
/*    workspace id as first parameter, the virtual machine     */
/*    name, the interface name, and the ip.                    */
/***************************************************************/

util.inherits(Driver, require('events').EventEmitter);

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

/********************************/
/* Methods to manage workspaces */
/********************************/
Driver.prototype.create = function(workspace, callback) {
  callback(null);
}

Driver.prototype.destroy = function(workspace, callback) {
  callback(null);
}

/**************************************/
/* Methods to manage virtual machines */
/**************************************/
Driver.prototype.startVM = function(workspace, config, callback) {
  callback(null);
}

Driver.prototype.stopVM = function(workspace, config, callback) {
  callback(null);
}

module.exports = Driver;
