/* global $ */

var io = require("socket.io-client");
var client = require("./src/game-client");
var config = require("./config.json");

function run(flag) {
	client.renderer = flag ? require("./src/mode/god") : require("./src/mode/player");
	client.connectGame("//" + location.host, $("#name").val(), function(success, msg) {
		if (success) {
			$("#main-ui").fadeIn(1000);
			$("#begin, #wasted").fadeOut(1000);
		}
		else {
			$("#error").text(msg);
		}
	}, flag);
}

$(document).ready(function() {
	var err = $("#error");
	if (!window.WebSocket) {
		err.text("Your browser does not support WebSockets!");
		return;
	}
	err.text("Loading... Please wait"); //TODO: show loading screen
	(function() {
		var socket = io(`//${location.host}`, {
			forceNew: true,
			upgrade: false,
			transports: ["websocket"]
		});
		socket.on("connect", function() {
			socket.emit("pings");
		});
		socket.on("pongs", function() {
			socket.disconnect();
			err.text("All done, have fun!");
			$("#name").keypress(function(evt) {
				if (evt.which === 13) run();
			});
			$(".start").removeAttr("disabled").click(function(evt) {
				run();
			});
			$(".spectate").removeAttr("disabled").click(function(evt) {
				run(true);
			});
		});
		socket.on("connect_error", function() {
			err.text("Cannot connect with server. This probably is due to misconfigured proxy server. (Try using a different browser)");
		});
	})();
});
//Event listeners
$(document).keydown(function(e) {
	var newHeading = -1;
	switch (e.which) {
		case 38: newHeading = 0; break; //UP
		case 87: newHeading = 0; break; //UP (W)
		case 39: newHeading = 1; break; //RIGHT
		case 68: newHeading = 1; break; //RIGHT (D)
		case 40: newHeading = 2; break; //DOWN
		case 83: newHeading = 2; break; //DOWN (S)
		case 37: newHeading = 3; break; //LEFT
		case 65: newHeading = 3; break; //LEFT (A)
		default: return; //Exit handler for other keys
	}
	client.changeHeading(newHeading);
	//e.preventDefault();
});

$(document).on("touchmove", function(e) {
	e.preventDefault(); 
});

$(document).on("touchstart", function (e1) {
	var x1 = e1.targetTouches[0].pageX;
	var y1 = e1.targetTouches[0].pageY;
	$(document).one("touchend", function (e2) {
		var x2 = e2.changedTouches[0].pageX;
		var y2 = e2.changedTouches[0].pageY;
		var deltaX = x2 - x1;
		var deltaY = y2 - y1;
		var newHeading = -1;
		if (deltaY < 0 && Math.abs(deltaY) > Math.abs(deltaX)) newHeading = 0;
		else if (deltaX > 0 && Math.abs(deltaY) < deltaX) newHeading = 1;
		else if (deltaY > 0 && Math.abs(deltaX) < deltaY) newHeading = 2;
		else if (deltaX < 0 && Math.abs(deltaX) > Math.abs(deltaY)) newHeading = 3;
		client.changeHeading(newHeading);
	});
});

$(".menu").on("click", function() {
	client.disconnect();
	$("#main-ui, #wasted").fadeOut(1000);
	$("#begin").fadeIn(1000);
});

$(".toggle").on("click", function() {
	$("#settings").slideToggle();
});
