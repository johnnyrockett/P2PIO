// Initial server startup
// Launches htmlServer for serving the public/ directory
// Launches gameServer for handling game requests
// Logic for "hello" aka inputting a name and "checkConn" are housed here
// Creates new game instance imported from game-server

// Stores the game in a list but then doesn't take advantage of that in any way

//https://github.com/socketio/socket.io/blob/master/examples/chat/index.js
const express = require("express");
const app = express();
const path = require("path");
const os = require("os");
const chalk = require("chalk");
const server = require("http").createServer(app);
const io = require("socket.io")(server);
const { exec } = require("child_process");

var config = require("./config.json");
config.dev ? exec("npm run build-dev") : exec("npm run build");

if (!(config.port >= 0 && config.port < 65536 && config.port % 1 === 0)) {
	console.error("[ERROR] `port` argument must be an integer >= 0 and < 65536. Default value will be used.");
	config.port = 8080;
}
var port = process.env.PORT || config.port;

server.listen(port, () => {
	console.log(chalk.yellow("Server available on:"));
	const ifaces = os.networkInterfaces();
	Object.keys(ifaces).forEach(dev => {
		ifaces[dev].forEach(details => {
			if (details.family === 'IPv4') {
				console.log((`  http://${details.address}:${chalk.green(port.toString())}`));
			}
		});
	});
	console.log("Hit CTRL-C to stop the server");
});

//Routing
app.use(express.static(path.join(__dirname, "public")));

for (var i = 0; i < parseInt(config.bots); i++) {
  var cmd = '/Applications/Firefox.app/Contents/MacOS/firefox --headless -no-remote -P "BOT' + i + '" http://127.0.0.1:5050';
  console.log(cmd);
	exec(cmd, (error, stdout, stderr) => {
		if (error) {
			console.error("error: " + error);
			return;
		}
		console.log("stdout: " + stdout);
		console.log("stderr: " + stderr);
	});
}
