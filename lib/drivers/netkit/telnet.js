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

/***********************************************/
/* Telnet base class. This class is a telnet   */
/* filter to get commands and data to process  */
/* it depending on the role of the agent which */
/* is connected to it                          */
/***********************************************/
var Telnet = function() {
  this._buffer = new Buffer(0);
  this._events = {};
}

Telnet.prototype.process = function(buff) {
  this._buffer = Buffer.concat([this._buffer, buff], this._buffer.length +
                                                                  buff.length);
  this._parse_commands();
}

Telnet.prototype._ignore_opt = function(buff) {
  if (this._is_ready()) {
    logger.warn("Ignored telnet cmd: ", buff);
    return;
  }

  var reply = new Buffer(3);
  reply[0] = IAC;
  reply[2] = buff[2];

  if (buff[1] == DO) {
    reply[1] = WONT;
    this._emit("command", reply);
  } else if (buff[1] == WILL) {
    reply[1] = DONT;
    this._emit("command", reply);
  } else
    logger.warn("Ignored telnet cmd: ", buff);
}

Telnet.prototype.on = function(evt, callback) {
  if (!this._events[evt])
    this._events[evt] = [];

  this._events[evt].push(callback);
}

Telnet.prototype._emit = function(event) {
  if (!this._events[event])
    return;

  // Remove event from arguments for the callback
  var args = new Array();
  for (var i = 1; i < arguments.length; i++)
    args.push(arguments[i]);

  for (var i = 0; i < this._events[event].length; i++)
    this._events[event][i].apply(this, args);
}

Telnet.prototype._get_echo_len = function(index) {
  var i = index;

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

Telnet.prototype._proc_cmd = function(buff) {
  throw "Process command is not implemented";
}

/*********************************************************/
/* Basic handshake with telnet clients. This class hacks */
/* into telnet protocol pretending to be a telnet server */
/* in order to configure clients with the configuration  */
/* we need in netlab                                     */
/*********************************************************/
var ServerHandShake = function() {
  ServerHandShake.super_.call(this);
  this._states = {
    "init": 0,
    "do_new_environ": 1,
    "check_environ": 2,
    "go_ahead": 3,
    "do_echo": 4,
    "will_echo": 5,
    "ready": 6
  };

  this._state = "init";
}

util.inherits(ServerHandShake, Telnet);

ServerHandShake.prototype._is_ready = function() {
  return this._state == "ready";
}

ServerHandShake.prototype._proc_cmd = function(cmd) {
  logger.debug("TODO");
}

/*********************************************************/
/* Basic handshake with telnet servers. This class hacks */
/* into telnet protocol pretending to be a telnet client */
/*********************************************************/
var ClientHandShake = function() {
  ClientHandShake.super_.call(this);
  this._ready = false;
}

util.inherits(ClientHandShake, Telnet);

ClientHandShake.prototype._is_ready = function() {
  return this._ready;
}

ClientHandShake.prototype._proc_cmd = function(cmd) {
  if (cmd[2] == SUP_GO_AHEAD)
    this._go_ahead(cmd);
  else if (cmd[2] == ECHO)
    this._echo(cmd);
  else
    this._ignore_opt(cmd);
}

ClientHandShake.prototype._go_ahead = function(cmd) {
  if (cmd[1] != WILL) {
    logger.warn("Failed option suppress go ahead");
    return;
  }

  var reply = new Buffer(3);
  reply[0] = IAC;
  reply[1] = DO;
  reply[2] = SUP_GO_AHEAD;

  this._emit("command", reply);
}

ClientHandShake.prototype._echo = function(cmd) {
  if (cmd[1] == DO) {
    // Nothing to echo
    var reply = new Buffer(3);
    reply[0] = IAC;
    reply[1] = WONT;
    reply[2] = ECHO;
    this._emit("command", reply);
  } else if (cmd[1] == WILL) {
    var reply = new Buffer(3);
    reply[0] = IAC;
    reply[1] = DO;
    reply[2] = ECHO;
    this._ready = true;
    this._emit("command", reply);
  }
}

module.exports.ServerHandShake = ServerHandShake;
module.exports.ClientHandShake = ClientHandShake;
