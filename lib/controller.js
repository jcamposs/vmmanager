var logger = require('nlogger').logger(module);
var amqp = require('amqp');

var connection;

function start() {
  connection = amqp.createConnection({ host: 'localhost' });
}

function stop() {
  connection.end()
}

exports.start = start;
exports.stop = stop;
