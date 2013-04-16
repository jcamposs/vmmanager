var config = require('konphyg')(Object.config.confdir);
var logger = require('nlogger').logger(module);
var http = require('http');

var conf = config('workspace');

function getHTTP(callback) {
  /* TODO: Make a HTTP GET request for the file */
  callback(null, "Set test path here");
}

function getCompressedFile(wkid, callback) {
  getHTTP(function(err, file) {
    callback(err, file);
  });
}

function load(workspace, callback) {
  getCompressedFile(workspace.getProperty("workspace"), function(err, file) {
    var dir = workspace.getBaseDirectory();
    callback("TODO: Configure workspace")
  })
}

exports.load = load;
