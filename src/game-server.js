var core = require("./core");
var consts = require("../config.json").consts;

function Game(id) {
	var possColors = core.Color.possColors();
	var nextInd = 0;
	var players = [];
	var gods = [];
	var newPlayers = [];
	var frameLocs = [];
	var frame = 0;
	var filled = 0;
	var grid = new core.Grid(consts.GRID_COUNT, (row, col, before, after) => {
		if (!!after ^ !!before) {
			if (after) filled++;
			else filled--;
			if (filled === consts.GRID_COUNT * consts.GRID_COUNT) console.log(`[${new Date()}] FULL GAME`);
		}
	});
	this.id = id;
	this.addPlayer = function(client, name) {
		if (players.length >= consts.MAX_PLAYERS) return false;
		var start = findEmpty(grid);
		if (!start) return false;
		var params = {
			posX: start.col * consts.CELL_WIDTH,
			posY: start.row * consts.CELL_WIDTH,
			currentHeading: Math.floor(Math.random() * 4),
			name: name,
			num: nextInd,
			base: possColors.shift()
		};
		var p = new core.Player(grid, params);
		p.tmpHeading = params.currentHeading;
		p.client = client;
		players.push(p);
		newPlayers.push(p);
		nextInd++;
		core.initPlayer(grid, p);
		if (p.name.indexOf("[BOT]") == -1) console.log(`[${new Date()}] ${p.name || "Unnamed"} (${p.num}) joined.`);
		client.on("requestFrame", () => {
			if (p.frame === frame) return;
			p.frame = frame; //Limit number of requests per frame (One per frame)
			var splayers = players.map(val => val.serialData());
			client.emit("game", {
				"num": p.num,
				"gameid": id,
				"frame": frame,
				"players": splayers,
				"grid": gridSerialData(grid, players)
			});
		});
		client.on("frame", (data, errorHan) => {
			if (typeof data === "function") {
				errorHan(false, "No data supplied.");
				return;
			}
			if (typeof errorHan !== "function") errorHan = function() {};
			if (!data) errorHan(false, "No data supplied.");
			else if (!checkInt(data.frame, 0, Infinity)) errorHan(false, "Requires a valid non-negative frame integer.");
			else if (data.frame > frame) errorHan(false, "Invalid frame received.");
			else {
				if (data.heading !== undefined) {
					if (checkInt(data.heading, 0, 4)) {
						p.tmpHeading = data.heading;
						errorHan(true);
					}
					else errorHan(false, "New heading must be an integer of range [0, 4).");
				}
			}
		});
		client.on("disconnect", () => {
			p.die(); //Die immediately if not already
			p.disconnected = true;
			if (p.name.indexOf("[BOT]") == -1) console.log(`[${new Date()}] ${p.name || "Unnamed"} (${p.num}) left.`);
		});
		return true;
	};
	this.addGod = function(client) {
		var g = {
			client: client,
			frame: frame
		}
		gods.push(g);
		var splayers = players.map(val => val.serialData());
		client.emit("game", {
			"gameid": id,
			"frame": frame,
			"players": splayers,
			"grid": gridSerialData(grid, players)
		});
		client.on("requestFrame", () => {
			if (g.frame === frame) return;
			g.frame = frame; //Limit number of requests per frame (One per frame)
			var splayers = players.map(val => val.serialData());
			g.client.emit("game", {
				"gameid": id,
				"frame": frame,
				"players": splayers,
				"grid": gridSerialData(grid, players)
			});
		});
		return true;
	};

	function pushPlayerLocations() {
		var locs = [];
		for (var p of players) {
			locs[p.num] = [p.posX, p.posY, p.waitLag];
		}
		locs.frame = frame;
		if (frameLocs.length >= 300) frameLocs.shift(); //Give it 5 seconds of lag
		frameLocs.push(locs);
	}

	function verifyPlayerLocations(fr, verify, resp) {
		var minFrame = frame - frameLocs.length + 1;
		if (fr < minFrame || fr > frame) {
			resp(false, false, "Frames out of reference");
			return;
		}

		function string(loc) {
			return `(${loc[0]}, ${loc[1]}) [${loc[2]}]`;
		}
		var locs = frameLocs[fr - minFrame];
		if (locs.frame !== fr) {
			resp(false, false, locs.frame + " != " + fr);
			return;
		}
		for (var num in verify) {
			if (!locs[num]) continue;
			if (locs[num][0] !== verify[num][0] || locs[num][1] !== verify[num][1] || locs[num][2] !== verify[num][2]) {
				resp(false, true, "P" + num + " " + string(locs[num]) + " !== " + string(verify[num]));
				return;
			}
		}
		resp(true, false);
	}

	function tick() {
		//TODO: notify those players that this server automatically drops out
		var splayers = players.map(val => val.serialData());
		var snews = newPlayers.map(val => {
			//Emit game stats.
			val.client.emit("game", {
				"num": val.num,
				"gameid": id,
				"frame": frame,
				"players": splayers,
				"grid": gridSerialData(grid, players),
			});
			return val.serialData();
		});
		var moves = players.map(val => {
			//Account for race condition (when heading is set after emitting frames, and before updating)
			val.heading = val.tmpHeading;
			return {
				num: val.num,
				left: !!val.disconnected,
				heading: val.heading
			};
		});
		update();
		var data = {
			frame: frame + 1,
			moves: moves
		};
		if (snews.length > 0) {
			data.newPlayers = snews;
			newPlayers = [];
		}
		for (var p of players) {
			p.client.emit("notifyFrame", data);
		}
		for (var g of gods) {
			g.client.emit("notifyFrame", data);
		}
		frame++;
		pushPlayerLocations();
	}
	this.tickFrame = tick;

	function update() {
		var dead = [];
		core.updateFrame(grid, players, dead);
		for (var p of dead) {
			if (!p.handledDead) {
				possColors.push(p.baseColor);
				p.handledDead = true;
			}
			if (p.name.indexOf("[BOT]") == -1) console.log(`${p.name || "Unnamed"} (${p.num}) died.`);
			p.client.emit("dead");
			p.client.disconnect(true);
		}
	}
}

function checkInt(value, min, max) {
	return !(typeof value !== "number" || value < min || value >= max || Math.floor(value) !== value);
}

function gridSerialData(grid, players) {
	var buff = Buffer.alloc(grid.size * grid.size);
	var numToIndex = new Array(players.length > 0 ? players[players.length - 1].num + 1 : 0);
	for (var i = 0; i < players.length; i++) {
		numToIndex[players[i].num] = i + 1;
	}
	for (var r = 0; r < grid.size; r++) {
		for (var c = 0; c < grid.size; c++) {
			var ele = grid.get(r, c);
			buff[r * grid.size + c] = ele ? numToIndex[ele.num] : 0;
		}
	}
	return buff;
}

function findEmpty(grid) {
	var available = [];
	for (var r = 1; r < grid.size - 1; r++) {
		for (var c = 1; c < grid.size - 1; c++) {
			var cluttered = false;
			checkclutter: for (var dr = -1; dr <= 1; dr++) {
				for (var dc = -1; dc <= 1; dc++) {
					if (grid.get(r + dr, c + dc)) {
						cluttered = true;
						break checkclutter;
					}
				}
			}
			if (!cluttered) available.push({
				row: r,
				col: c
			});
		}
	}
	return (available.length === 0) ? null : available[Math.floor(available.length * Math.random())];
}
module.exports = Game;
