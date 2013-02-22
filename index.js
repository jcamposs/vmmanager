var daemon = require('./lib/daemon')
var path = require('path');

var environment = "development";

if (Object.config) {
  console.error("Cant store daemon configuration.");
  process.exit(1);
} else {
  Object.config = {
    environment: "development",
    path: "/tmp/workspaces"
  }
}

parse_opts();
daemon.start()

function print_usage() {
  console.log("Usage: node vmmanager [OPTIONS]");
  console.log("Starts a vmmanager daemon to manage workspaces and virtual machines.");
  console.log();
  console.log("List of command line options:");
  console.log("\t-e, --environment=ENVIRONMENT");
  console.log("\t\tEnvironment for the process.");
  console.log("\t\tPossible values: development, test, production");
  console.log("\t\tDefault: development");
  console.log("\t-p, --path=PATH");
  console.log("\t\tWorkspace path.");
  console.log("\t-h, --help");
  console.log("\t\tShow this message.");
  process.exit(0);
}

function set_environment(env) {
  if (env != "development" && env != "test" && env != "production") {
    console.error("Error: Invalid environment", env);
    print_usage();
  }

  Object.config.environment = env;
}

function set_path(p) {
  if (!p) {
    console.error("Error: Invalid path");
    print_usage();
  }

  Object.config.path = path.normalize(p);
}

function parse_opts() {
  var i = 2;

  while (i < process.argv.length) {
    if (process.argv[i] == "-e") {
      if (process.argv.length < i + 2)
        print_usage();

      set_environment(process.argv[i + 1]);
      i += 2;
    } else if (process.argv[i].indexOf("--environment=") == 0) {
      set_environment(process.argv[i].substring("--environment=".length,
                                                     process.argv[i].length));
    } else if (process.argv[i] == "-p") {
      if (process.argv.length < i + 2)
        print_usage();

      set_path(process.argv[i + 1]);
      i += 2;
    } else if (process.argv[i].indexOf("--path=") == 0) {
      set_path(process.argv[i].substring("--path=".length,
                                                      process.argv[i].length));
      i++;
    } else if (process.argv[i] == "-h" ||
                                       process.argv[i].indexOf("--help") == 0){
      print_usage();
    } else {
      console.error("Error: Invalid option", process.argv[i]);
      print_usage();
    }
  }
}
