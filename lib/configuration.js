var config = require('konphyg')(Object.config.confdir);
var logger = require('nlogger').logger(module);
var http = require('http');
var targz = require('tar.gz');

var conf = config('rest');

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
  logger.debug("Uncompressing workspace configuration file");
    var dir = workspace.getBaseDirectory();
    var compress = new targz().extract(file, dir, function(err) {
      callback(err);
    });
  })
}

exports.load = load;
