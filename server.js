const fs = require("fs"),
	path = require("path");
var config = require(path.join(__dirname, "config.json"));

if (!(config.http_port >= 0 && config.http_port < 65536 && config.http_port % 1 === 0)) {
	console.error("[ERROR] http_port argument must be an integer >= 0 and < 65536.");
	process.exit();
}

if (!(config.ws_port >= 0 && config.ws_port < 65536 && config.ws_port % 1 === 0)) {
	console.error("[ERROR] ws_port argument must be an integer >= 0 and < 65536.");
	process.exit();
}

const finalhandler = require("finalhandler"),
	http = require("http"),
	serveStatic = require("serve-static");
//Serve up public/ folder
var serve = serveStatic("public/", {
	"setHeaders": function(res, path) {
		res.setHeader("Cache-Control", "public, max-age=0");
	}
});

//Create server
try {
	http.createServer(function onRequest(req, res) {
		serve(req, res, finalhandler(req, res));
	}).listen(config.http_port, config.hostname);
}
catch (e) {
	console.error("[ERROR] hostname argument invalid.");
	process.exit();
}

var server = http.createServer();
server.listen(config.ws_port);
var io = require("socket.io")(server);
io.set("transports", ["websocket"]);
const Game = require("./src/game-server.js");
var game = new Game();
io.on("connection", function(socket) {
	socket.on("hello", function(data, fn) {
		//TODO: error checking.
		if (data.name && data.name.length > 32) fn(false, "Your name is too long!");
		else if (!game.addPlayer(socket, data.name)) fn(false, "Game is too full!");
		else fn(true);
	});
	socket.on("pings", function(fn) {
		socket.emit("pongs");
		socket.disconnect();
	});
});

setInterval(function() {
	game.tickFrame();
}, 1000 / 60);
