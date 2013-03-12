var logger = require('nlogger').logger(module);
var util = require("util");
var pkg = require('./package.json');

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
var GREEN  = new Buffer([ESC, 0x5b, 0x33, 0x32, 0x6d]); /* {ESC}[32m */
var BLACK  = new Buffer([ESC, 0x5b, 0x30, 0x6d]);       /* {ESC}[0m */

/***********************************************/
/* Telnet base class. This class is a telnet   */
/* filter to get commands and data to process  */
/* it depending on the role of the agent which */
/* is connected to it                          */
/***********************************************/
var Telnet = function() {
  this._buffer = new Buffer(0);
}

util.inherits(Telnet, require('events').EventEmitter);

Telnet.prototype.process = function(buff) {
  this._buffer = Buffer.concat([this._buffer, buff], this._buffer.length +
                                                                  buff.length);
  return this._parse_commands();
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
    this.emit("command", reply);
  } else if (buff[1] == WILL) {
    reply[1] = DONT;
    this.emit("command", reply);
  } else
    logger.warn("Ignored telnet cmd: ", buff);
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
  this._state = "init";
}

util.inherits(ServerHandShake, Telnet);

ServerHandShake.prototype.init_handshake = function() {
  if (this._state = "init")
    this._transite();
}

ServerHandShake.prototype.get_user = function() {
  return this._user;
}

ServerHandShake.prototype._transite = function() {
  switch (this._state) {
  case "init":
    // Mechanism for passing environment information. We must pay attention
    // to the USER environment variable to identify the user.
    var cmd = new Buffer(3);
    cmd[0] = IAC;
    cmd[1] = DO;
    cmd[2] = NEW_ENVIRON;
    this.emit("command", cmd);
    this._state = "do_new_environ";
    break;
  case "do_new_environ":
    var cmd = new Buffer(6);
    cmd[0] = IAC;
    cmd[1] = SB;
    cmd[2] = NEW_ENVIRON;
    cmd[3] = SEND;
    cmd[4] = IAC;
    cmd[5] = SE;
    this.emit("command", cmd);
    this._state = "check_environ";
    break;
  case "check_environ":
    // Set operation mode (one character at the time)
    var cmd = new Buffer(3);
    cmd[0] = IAC;
    cmd[1] = WILL;
    cmd[2] = SUP_GO_AHEAD;
    this.emit("command", cmd);
    this._state = "go_ahead";
    break;
  case "go_ahead":
    // Confirm operation mode
    var cmd = new Buffer(3);
    cmd[0] = IAC;
    cmd[1] = DO;
    cmd[2] = ECHO;
    this.emit("command", cmd);
    this._state = "do_echo";
    break;
  case "do_echo":
    var cmd = new Buffer(3);
    cmd[0] = IAC;
    cmd[1] = WILL;
    cmd[2] = ECHO;
    this.emit("command", cmd);
    this._state = "will_echo";
    break;
  case "will_echo":
    this._state = "ready";
    this.emit("ready");
    break;
  default:
    logger.error("Client is in an invalid state ", this._state);
    break;
  }
}

ServerHandShake.prototype._is_ready = function() {
  return this._state == "ready";
}

ServerHandShake.prototype._proc_cmd = function(cmd) {
  switch(this._state) {
  case "do_new_environ":
    this._do_new_environ(cmd);
    break;
  case "check_environ":
    this._check_environ(cmd);
    break;
  case "go_ahead":
    this._go_ahead(cmd);
    break;
  case "do_echo":
    this._do_echo(cmd);
    break;
  case "will_echo":
    this._will_echo(cmd);
    break;
  default:
    this._ignore_opt(cmd);
  }
}

ServerHandShake.prototype._do_new_environ = function(cmd) {
  var expected = new Buffer(3);
  expected[0] = IAC;
  expected[1] = WILL;
  expected[2] = NEW_ENVIRON;

  if (expected.toString() != cmd.toString()) {
    logger.warn("Unexpected command received while setting up NEW-ENVIRON");
    this._ignore_opt(cmd);
    return;
  }

  this._transite();
}

ServerHandShake.prototype._check_environ = function(cmd) {
  var expected = new Buffer(4);
  expected[0] = IAC;
  expected[1] = SB;
  expected[2] = NEW_ENVIRON;
  expected[3] = IS;

  if (expected.toString() != cmd.slice(0,4).toString()) {
    logger.warn("Unexpected command received checking environment variabes");
    this._ignore_opt(cmd);
    return;
  }

  this._user = this._get_environ_var("USER", cmd);

  if (this._user)
    this._transite();
  else
    this.emit("error", "USER is not specified");
}

ServerHandShake.prototype._get_environ_var = function(v, cmd) {
  // Skip the first 4 bytes: IAC SB NEW_ENVIRON IS...
  var i = 4
  while (i < cmd.length - 1) {
    if (cmd[i] != VAR) {
      i++;
      continue;
    }

    // Get variable name
    var name = "";
    i++;
    while (i < cmd.length - 1) {
      if (cmd[i] == VALUE) {
        i++;
        break;
      }

      name += String.fromCharCode(cmd[i]);
      i++;
    }

    if (name != v)
      continue;

    // Get variable value
    var val = "";
    while (i < cmd.length - 1) {
      if (cmd[i] == VAR || cmd[i] == IAC) {
        if (val == "")
          return null;
        else
          return val;
      }

      val += String.fromCharCode(cmd[i]);
      i++;
    }
  }

  return null;
}

ServerHandShake.prototype._go_ahead = function(cmd) {
  var expected = new Buffer(3);
  expected[0] = IAC;
  expected[1] = DO;
  expected[2] = SUP_GO_AHEAD;

  if (expected.toString()  != cmd.toString()) {
    logger.warn("Unexpected command received setting up SUP_GO_AHEAD");
    this._ignore_opt(cmd);
    return
  }

  this._transite();
}

ServerHandShake.prototype._do_echo = function(cmd) {
  if (cmd[2] != ECHO) {
    logger.warn("Unexpected command received on ECHO operation");
    this._ignore_opt(cmd);
    return;
  }

  this._transite();
}

ServerHandShake.prototype._will_echo = function(cmd) {
  if (cmd[2] != ECHO) {
    logger.warn("Unexpected reply to ECHO request");
    this._ignore_opt(cmd);
    return;
  }

  if (cmd[1] == DO) {
    var str = "Netkit driver " + pkg.version + "\r\n";
    var msg = new Buffer(str);
    this.emit("command", Buffer.concat([GREEN, msg, BLACK]));
  }

  this._transite();
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

  this.emit("command", reply);
}

ClientHandShake.prototype._echo = function(cmd) {
  if (cmd[1] == DO) {
    // Nothing to echo
    var reply = new Buffer(3);
    reply[0] = IAC;
    reply[1] = WONT;
    reply[2] = ECHO;
    this.emit("command", reply);
  } else if (cmd[1] == WILL) {
    var reply = new Buffer(3);
    reply[0] = IAC;
    reply[1] = DO;
    reply[2] = ECHO;
    this._ready = true;
    this.emit("command", reply);
  }
}

module.exports.ServerHandShake = ServerHandShake;
module.exports.ClientHandShake = ClientHandShake;
