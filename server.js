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

var Game = require("./src/game-server");
var game = new Game();
io.set("transports", ["websocket"]);
io.on("connection", socket => {
	socket.on("hello", (data, fn) => {
		//TODO: error checking.
		if (data.god && game.addGod(socket)) {
			fn(true);
			return;
        }
		if (data.name && data.name.length > 32) fn(false, "Your name is too long!");
		else if (!game.addPlayer(socket, data.name)) fn(false, "There're too many players!");
		else fn(true);
	});
	socket.on("pings", (fn) => {
		socket.emit("pongs");
		socket.disconnect();
	});
});

for (var i = 0; i < parseInt(config.bots); i++) {
	exec(`node ${path.join(__dirname, "paper-io-bot.js")} ws://localhost:${port}`, (error, stdout, stderr) => {
		if (error) {
			console.error("error: " + error);
			return;
		}
		console.log("stdout: " + stdout);
		console.log("stderr: " + typeof stderr);
	});
}

var readline = require('readline');
var log = console.log;

var rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

var takeInput = function () {
  rl.question('Seconds of execution: ', async function (answer) {
    if (answer == 'exit')
      return rl.close(); //closing RL and returning from function.
    var forward = true;
    if (answer.substring(0,1) == 'f') {
        forward = true;
        answer = answer.substring(1);
    } else if (answer.substring(0,1) == 'r') {
        forward = false;
        answer = answer.substring(1);
    }

    var parsed = parseInt(answer);
    var sleepTime = 1;
    if (parsed != NaN)
        sleepTime = parsed;

    if (forward == true) {
        log('Running for ' + sleepTime + ' seconds.');

        for (var i=0; i<60*sleepTime; i++) {
            game.tickFrame();
            await new Promise(resolve => setTimeout(resolve, 1000/60));
        }
    } else {
        log('Reversing for ' + sleepTime + ' seconds.');
        game.reverseTickFrame(60*sleepTime);
    }

    takeInput(); //Calling this function again to ask new question
  });
};

// takeInput();

// setInterval(() => {
// 	game.tickFrame();
// }, 1000 / 60);