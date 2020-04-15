// Houses logic specific to the client
// Client version of processFrame is most notable
// Basically everything that allows the client's understanding of the game state to be up to date

const rust = import('./pkg');
rust
  .then(m => {
    m.init();
    return new m.BlockDAG("http://localhost:8090");
  })
  .then(main)
  .catch(console.error);


async function main(dag) {
  let transaction = await dag.load_tip();
  console.log(transaction);
}

window.$ = window.jQuery = require("jquery");
var io = require("socket.io-client");
var client = require("./src/game-client");

function run(flag) {
	client.renderer = flag ? require("./src/mode/god") : require("./src/mode/player");
	client.connectGame("//" + location.host, $("#name").val(), (success, msg) => {
		if (success) {
			$("#main-ui").fadeIn(1000);
			$("#begin, #wasted").fadeOut(1000);
		}
		else {
			$("#error").text(msg);
		}
	}, flag);
}

$(document).ready(() => {
	var err = $("#error");
	if (!window.WebSocket) {
		err.text("Your browser does not support WebSockets!");
		return;
	}
	err.text("Loading... Please wait"); //TODO: show loading screen
	(() => {
		var socket = io(`//${location.host}`, {
			forceNew: true,
			upgrade: false,
			transports: ["websocket"]
		});
		socket.on("connect", () => {
			socket.emit("pings");
		});
		socket.on("pongs", () => {
			socket.disconnect();
			err.text("All done, have fun!");
			$("#name").keypress(evt => {
				if (evt.which === 13) run();
			});
			$(".start").removeAttr("disabled").click(evt => {
				run();
			});
			$(".spectate").removeAttr("disabled").click(evt => {
				run(true);
			});
		});
		socket.on("connect_error", () => {
			err.text("Cannot connect with server. This probably is due to misconfigured proxy server. (Try using a different browser)");
		});
	})();
});
//Event listeners
$(document).keydown(e => {
	var newHeading = -1;
	switch (e.key) {
		case "w": case "ArrowUp":
		newHeading = 0; break; //UP (W)
		case "d": case "ArrowRight":
		newHeading = 1; break; //RIGHT (D)
		case "s": case "ArrowDown":
		newHeading = 2; break; //DOWN (S)
		case "a": case "ArrowLeft":
		newHeading = 3; break; //LEFT (A)
		default: return; //Exit handler for other keys
	}
	client.changeHeading(newHeading);
	//e.preventDefault();
});

$(document).on("touchmove", e => {
	e.preventDefault();
});

$(document).on("touchstart", e1 => {
	var x1 = e1.targetTouches[0].pageX;
	var y1 = e1.targetTouches[0].pageY;
	$(document).one("touchend", e2 => {
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

$(".menu").on("click", () => {
	client.disconnect();
	$("#main-ui, #wasted").fadeOut(1000);
	$("#begin").fadeIn(1000);
});

$(".toggle").on("click", () => {
	$("#settings").slideToggle();
});
