var config = require('konphyg')(__dirname + '/../config');
var logger = require('nlogger').logger(module);
var nimble = require('nimble');
var fs = require('fs');
var http = require('http');
var targz = require('tar.gz');
var path = require('path')

var conf = config('rest');

var session = null;
var auth_token = null;

function compose_config_name(id) {
  return "wk" + id + "conf.tar.gz";
}

function download_file(id, callback) {
  var url_path = conf.path.replace(/:wid/, id);
  var options = {
    host: conf.hostname,
    port: conf.port,
    path: url_path,
    headers: {}
  };

  logger.debug("Getting file");

  if (session)
    options.headers["Cookie"] = session;
  else
    return callback("No cookie");


  var file_name = compose_config_name(id);
  var file_path = path.join(conf.download, file_name);
  var file = fs.createWriteStream(file_path);

  logger.debug("Getting configuration for workspace " + id + " from http://" +
                             conf.hostname + ":" + conf.port + "/" + url_path);

  http.get(options, function(res) {
    logger.debug("Satus code: " + res.statusCode);

    if (res.statusCode != 200)
      return callback("Can not get configuration");

    res.on('data', function(data) {
      file.write(data);
    }).on('end', function() {
      file.end();
      callback(null, file_path);
    }).on('error', function(e) {
      callback(e.message, null);
    });
  });
};

function getCompressedFile(id, callback) {
  get_credentials(function(err) {
    if (err)
      return callback(err);

    download_file(id, function(err, file) {
      callback(err, file);
    });
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
        fs.unlink(file, function(e) {
          if (e)
            logger.error(e);
          else
            logger.debug("Removed temporal file " + file);
        });
      }

      callback(err);
    });
  })
}

function get_cookie_value(cookie) {
  var str = "" + cookie;
  return str.split(";")[0];
}

function get_authenticity_token(html) {
  // Parse meta tags that contains the authenticity token
  var expr = /<meta *content="[^"]*" *name="csrf-token" *\/>/;
  var tag = html.match(expr);

  if (!tag) {
    logger.error("Can not get authenticity token");
    logger.debug(html);
    return null;
  }

  var members = tag[0].split(" ");
  for (var i = 1; i < members.length - 1; i++)
    if (members[i].indexOf("content=") == 0)
      return members[i].substring("content=".length + 1, members[i].length - 1);

  return null;
}

function get_cookie(callback) {
  var options = {
    host: conf.hostname,
    port: conf.port,
    path: conf.authenticate.url,
    method: 'GET'
  };

  logger.debug("Getting Cookie");

  var req = http.request(options, function(res) {
    logger.debug(res.statusCode)

    var cookie = null;

    for (var e in res.headers) {
      if (e.toLowerCase() == "set-cookie") {
        cookie = res.headers[e];
        break;
      }
    }

    if (!cookie)
      return callback("Unable to get session");

    session = get_cookie_value(cookie);
    logger.warn("1 Cookie: " + cookie);

    var html = null;
    res.setEncoding('utf8');

    res.on('data', function(data) {
      html += data;
    }).on('end', function() {
      auth_token = get_authenticity_token(html);
      logger.debug("AUTH: " + auth_token);
      if (!auth_token)
        callback("Can not get authentication token");
      else
        callback(null);
    }).on('error', function(e) {
      callback(e.message);
    });
  });

  req.on('error', function(e) {
    return callback(e.message);
  });

  req.end();
}

function add_param(name, value, parameters) {
  var val = encodeURIComponent(name) + "=" + encodeURIComponent(value);
  if (!parameters || parameters == "")
    parameters = val;
  else
    parameters = parameters + "&" + val;

  return parameters;
}

function authenticate(callback) {
  var email = conf.authenticate.email;
  var passwd = conf.authenticate.passwd;

  var options = {
    host: conf.hostname,
    port: conf.port,
    path: conf.authenticate.url,
    method: 'POST',
    headers: {}
  };

  logger.debug("Authenticating");

  if (session) {
    logger.debug("Setting cookie: " + session);
    options.headers["Cookie"] = session;
  } else {
    return callback("No cookie");
  }

  var req = http.request(options, function(res) {

    // We are just interested in the cookie, so we can
    // abort the request once we got the cookie
    req.abort();

    logger.debug("Got status: " + res.statusCode);

    var cookie = null;
    for (var e in res.headers) {
      if (e.toLowerCase() == "set-cookie") {
        cookie = res.headers[e];
        break;
      }
    }

    if (!cookie)
      return callback("Unable to get session");

    session = get_cookie_value(cookie);
    logger.warn("2 Cookie: " + cookie);

    callback(null);
  });

  req.on('error', function(e) {
    return callback(e.message);
  });

  // write data to request body
  var parameters = "";
  parameters = add_param("authenticity_token", auth_token, parameters);
  parameters = add_param("admin[email]", email, parameters);
  parameters = add_param("admin[password]", passwd, parameters);

  req.write(parameters);
  req.end();
}

function store_session(callback) {
  fs.writeFile(conf.authenticate.cookie, session, function (err) {
    if (err)
      callback("Can write cookie to disk");
    else
      callback(null);
  });
}

function get_credentials(callback) {
  logger.debug("Getting credentials");

  if (session)
    return callback();

  fs.exists(conf.authenticate.cookie, function(exists) {
    if (!exists) {
      make_authentication(function(err) {
        callback(err);
      });
    } else {
      logger.debug("Reading session from " + conf.authenticate.cookie);
      fs.readFile(conf.authenticate.cookie, { "encoding": "utf8" }, 
                                                        function (err, data) {
        if (err)
          return callback(err);

        session = data;
        callback(null);
      });
    }
  });
}

function make_authentication(callback) {
  get_cookie(function(err) {
    if (err)
      return callback(err);

    authenticate(function (err) {
      if (err)
        return callback(err);

      store_session(function(err) {
        if (err)
          logger.warn("Error: " + err);

        callback(null);
      });
    })
  });
}

function authenticate_test() {
  get_credentials(function(err) {
    if (err)
      loger.error(err);
    else
      logger.debug("Done");
  });


  get_cookie(function(err) {
    if (err) {
      logger.debug("Error: " + err);
      return;
    }

    authenticate(function (err) {
      if (err) {
        logger.debug("Error: " + err);
        return;
      }

      store_session(function(err) {
        if (err) {
          logger.debug("Error: " + err);
          return;
        }

        download_file(28, function(err) {
          if (err) {
            logger.debug("Error: " + err);
            return;
          }
          logger.debug("Done");
        });
      });
    })
  });
}

exports.load = load;
