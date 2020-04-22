// Houses logic specific to the client
// Client version of processFrame is most notable
// Basically everything that allows the client's understanding of the game state to be up to date

const rust = import('./pkg');
rust
  .then(m => {
    m.init();
    var urlParams = new URLSearchParams(window.location.search);
    if (!urlParams.has("id")) {
        throw "Please add ?id=... where ... is your contract id, to the end of your url.";
    }
    return new m.Context("http://localhost:8090", urlParams.get("id"));
  })
  .then(main)
  .catch(console.error);


async function main(ctx) {
	console.log("Syncing tips");
	await ctx.tips_sync();

	console.log("Spawning player");
    await ctx.spawn_player(0, 0); //half way between min and max of u32

    let address = ctx.get_address(); //TODO should be get_str_address()
	console.log("Address: ", address);

	console.log("Applying heading");
	await ctx.apply_input(1); //half way between min and max of u32

	console.log("Get player data");
	let player_location = await ctx.get_player(address); //half way between min and max of u32
    console.log("Current location ", player_location);
    console.log(player_location.x());


    window.$ = window.jQuery = require("jquery");
    var io = require("socket.io-client");
    var client = require("./src/game-client");
    client.giveContext(ctx, address);

    function run(flag) {
        var contactAddress = $("#contactAddress").val();
        console.log(contactAddress);
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

    $(document).keydown(e => {
        var newHeading = -1;
        switch (e.key) {
            case "w": case "ArrowUp":
                console.log("up");
                newHeading = 0; break; //UP (W)
            case "d": case "ArrowRight":
                console.log("right");
                newHeading = 1; break; //RIGHT (D)
            case "s": case "ArrowDown":
                console.log("down");
                newHeading = 2; break; //DOWN (S)
            case "a": case "ArrowLeft":
                console.log("left");
                newHeading = 3; break; //LEFT (A)
            default: return; //Exit handler for other keys
        }
        client.changeHeading(newHeading);
        //e.preventDefault();
    });

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

}