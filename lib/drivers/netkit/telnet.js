var logger = require('nlogger').logger(module);
var util = require("util");

// COMMANDS
var SE = 0xF0;   /* 240 */
var IP = 0xF4;   /* 244 */
var SB = 0xFA;   /* 250 */
var WILL = 0xFB; /* 251 */
var WONT = 0xFC; /* 252 */
var DO = 0xFD;   /* 253 */
var DONT = 0xFE; /* 254 */
var IAC = 0xFF;  /* 255 */

// COMMAND CODES
var IS = 0x00;    /* 00 */
var SEND = 0x01;  /* 01 */
var VAR = 0x00;   /* 00 */
var VALUE = 0x01; /* 01 */

// OPTIONS
var ECHO = 0x01;         /* 01 */
var SUP_GO_AHEAD = 0x03; /* 03 */
var STATUS = 0x05;       /* 05 */
var TMARK = 0x06;        /* 06 */
var TERM_TYPE = 0x18;    /* 24 */
var NAWS = 0x1F;         /* 31 */
var TERM_SPEED = 0x20;   /* 32 */
var LFLOW = 0x21;        /* 33 */
var XDISPLOC = 0x23;     /* 35 */
var NEW_ENVIRON = 0x27;  /* 39 */

// MISCELLANEOUS
var ESC    = 0x1B; /* 27 Escape character (ctrl + [) */
var CTRL_L = 0x0C; /* (Ctrl + l) => Refresh screen */
var GREEN  = "#{ESC}[32m";
var BLACK  = "#{ESC}[0m";

// Telnet base class
var Telnet = function() {
  this._buffer = new Buffer(0);
}

Telnet.prototype.process = function(buff) {
  this._buffer = Buffer.concat([this._buffer, buff], this._buffer.length +
                                                                  buff.length);
  this._parse_commands();
}

Telnet.prototype._ignore_opt = function(data) {
  logger.debug("TODO: ignore_opt");
}

Telnet.prototype._get_echo_len = function(index) {
  var i = index
  while (i < this._buffer.length) {
    if (this._buffer[i] != IAC)
      i += 1;
    else if (i == this._buffer.length - 1)
      return i;
    else if (this._buffer[i + 1] != IAC)
      return i;
    else
      // Escape double IAC
      i += 2;
  }

  return this._buffer.length;
}

Telnet.prototype._parse_commands = function() {
  var first = 0;
  var i = first + 1;
  var parsing = false;
  var data = new Buffer(0);

  while (i <= this._buffer.length) {
    parsing = true;

    if (this._buffer[first] != IAC ||
                      (this._buffer[first] == IAC && this._buffer[i] == IAC)) {
      // skip echo data
      var index = first;
      parsing = false;
      first = this._get_echo_len(index);
      i = first + 1;

      if (first <= this._buffer.length - 1)
        parsing = true;

      if (this._is_ready())
        data = Buffer.concat([data, this._buffer.slice(index, first)]);

      continue;
    }

    if (!this._buffer[i])
      break;

    if (this._buffer[i] >= WILL && this._buffer[i] <= DONT) {
      // option negotiation commands needs 3 bytes
      if ((i + 2) > (this._buffer.length))
        break;

      this._proc_cmd(this._buffer.slice(first, i + 2));
      first = i + 2;
    } else if (this._buffer[i] == SB) {
      // variable length command
      var index = i + 1;
      for (; index <= (this._buffer.length - 1); index++) {
        if (this._buffer[index] == SE)
          break;
      }

      if (this._buffer[index] != SE)
        break;

      this._proc_cmd(this._buffer.slice(first, index + 1));
      first = index + 1;
    } else {
      // two bytes command
      this._proc_cmd(this._buffer.slice(first, i + 1));
      first = i + 1;
    }

    i = first + 1;
    parsing = false;
  }

  if (parsing)
    this._buffer = this._buffer.slice(first, this._buffer.length);
  else
    this._buffer = new Buffer(0);

  return data;
}

Telnet.prototype._is_ready = function() {
  throw "is ready is not implemented";
}

Telnet.prototype._proc_cmd = function(data) {
  throw "Process command is not implemented";
}

// Basic handshake with telnet server
var TelnetServerConn = function() {
  TelnetServerConn.super_.call(this);
}

util.inherits(TelnetServerConn, Telnet);

TelnetServerConn.prototype._is_ready = function() {
  return false;
}

TelnetServerConn.prototype._proc_cmd = function(cmd) {
  logger.debug(">> ", cmd);
}

// Basic handshake with telnet client
var TelnetClientConn = function() {
  TelnetClientConn.super_.call(this);
}

util.inherits(TelnetClientConn, Telnet);

module.exports.TelnetServerConn = TelnetServerConn;
module.exports.TelnetClientConn = TelnetClientConn;
