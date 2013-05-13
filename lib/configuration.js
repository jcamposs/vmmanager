var config = require('konphyg')(__dirname + '/../config');
var logger = require('nlogger').logger(module);
var fs = require('fs');
var http = require('http');
var targz = require('tar.gz');
var path = require('path')

var conf = config('rest');

function compose_config_name(id) {
  return "wk" + id + "conf.tar.gz";
}

function download_file(id, callback) {
  var url_path = conf.path.replace(/:wid/, id);
  var options = {
    host: conf.hostname,
    port: conf.port,
    path: url_path
  };

  var file_name = compose_config_name(id);
  var file_path = path.join(conf.download, file_name);
  var file = fs.createWriteStream(file_path);

  logger.debug("Getting configuration for workspace " + id + " from http://" +
                             conf.hostname + ":" + conf.port + "//" + url_path);

  http.get(options, function(res) {
    res.on('data', function(data) {
      file.write(data);
    }).on('end', function() {
      file.end();
      console.log(file_name + ' downloaded to ' + conf.download);
      callback(null, file_path);
    }).on('error', function(e) {
      callback(e.message, null);
    });
  });
};

function getCompressedFile(id, callback) {
  download_file(id, function(err, file) {
    callback(err, file);
  });
}

function load(workspace, callback) {
  var wid = workspace.getProperty("workspace");

  getCompressedFile(wid, function(err, file) {
    if (err)
      return callback(err);

    var dir = workspace.getBaseDirectory();
    var compress = new targz().extract(file, dir, function(err) {
      if (!err) {
        /* Remove temporal files */
        fs.unlink(path.join(conf.download, compose_config_name(wid)));
        fs.unlink(file);
      }

      callback(err);
    });
  })
}

exports.load = load;
