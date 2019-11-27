/* global $ */

var core = require("../core");
var client = require("../game-client");
var consts = require("../../config.json").consts;

var SHADOW_OFFSET = 5;
var ANIMATE_FRAMES = 24;
var BOUNCE_FRAMES = [8, 4];
var DROP_HEIGHT = 24;
var DROP_SPEED = 2;
var MIN_BAR_WIDTH = 65;
var BAR_HEIGHT = SHADOW_OFFSET + consts.CELL_WIDTH;
var BAR_WIDTH = 400;

var canvas, ctx, offscreenCanvas, offctx,
	canvasWidth, canvasHeight, gameWidth, gameHeight;

$(() => {
	canvas = $("#main-ui")[0];
	ctx = canvas.getContext("2d");
	offscreenCanvas = document.createElement("canvas");
	offctx = offscreenCanvas.getContext("2d");
	updateSize();
});

var animateGrid, playerPortion, portionsRolling, barProportionRolling, animateTo, offset, user, zoom, showedDead;
var grid = client.grid;

function updateSize() {
	var changed = false;
	if (canvasWidth != window.innerWidth) {
		gameWidth = canvasWidth = offscreenCanvas.width = canvas.width = window.innerWidth;
		changed = true;
	}
	if (canvasHeight != window.innerHeight) {
		gameHeight = canvasHeight = offscreenCanvas.height = canvas.height = window.innerHeight;
		changed = true;
	}
	if (changed && user) centerOnPlayer(user, offset);
}

function reset() {
	animateGrid = new core.Grid(consts.GRID_COUNT);
	playerPortion = [];
	portionsRolling = [];
	barProportionRolling = [];
	animateTo = [0, 0];
	offset = [0, 0];
	user = null;
	zoom = (Math.min(canvasWidth, canvasHeight) - consts.BORDER_WIDTH) / (consts.CELL_WIDTH * consts.GRID_COUNT);
	showedDead = false;
}

reset();

//Paint methods
function paintGridBorder(ctx) {
	ctx.fillStyle = "lightgray";
	var gridWidth = consts.CELL_WIDTH * consts.GRID_COUNT;

	ctx.fillRect(-consts.BORDER_WIDTH, 0, consts.BORDER_WIDTH, gridWidth);
	ctx.fillRect(-consts.BORDER_WIDTH, -consts.BORDER_WIDTH, gridWidth + consts.BORDER_WIDTH * 2, consts.BORDER_WIDTH);
	ctx.fillRect(gridWidth, 0, consts.BORDER_WIDTH, gridWidth);
	ctx.fillRect(-consts.BORDER_WIDTH, gridWidth, gridWidth + consts.BORDER_WIDTH * 2, consts.BORDER_WIDTH);
}

function paintGrid(ctx) {
	//Paint background
	ctx.fillStyle = "rgb(211, 225, 237)";
	ctx.fillRect(0, 0, consts.CELL_WIDTH * consts.GRID_COUNT, consts.CELL_WIDTH * consts.GRID_COUNT);
	paintGridBorder(ctx);

	//Get viewing limits
	var offsetX = (offset[0] - consts.BORDER_WIDTH);
	var offsetY = (offset[1] - consts.BORDER_WIDTH);
	var minRow = Math.max(Math.floor(offsetY / consts.CELL_WIDTH), 0);
	var minCol = Math.max(Math.floor(offsetX / consts.CELL_WIDTH), 0);
	var maxRow = Math.min(Math.ceil((offsetY + gameHeight / zoom) / consts.CELL_WIDTH), grid.size);
	var maxCol = Math.min(Math.ceil((offsetX + gameWidth / zoom) / consts.CELL_WIDTH), grid.size);

	//Paint occupied areas (and fading ones)
	for (var r = minRow; r < maxRow; r++) {
		for (var c = minCol; c < maxCol; c++) {
			var p = grid.get(r, c);
			var x = c * consts.CELL_WIDTH, y = r * consts.CELL_WIDTH, baseColor, shadowColor;
			var animateSpec = animateGrid.get(r, c);
			if (client.allowAnimation && animateSpec) {
				if (animateSpec.before) { //fading animation
					var frac = (animateSpec.frame / ANIMATE_FRAMES);
					var back = new core.Color(.58, .41, .92, 1);
					baseColor = animateSpec.before.lightBaseColor.interpolateToString(back, frac);
					shadowColor = animateSpec.before.shadowColor.interpolateToString(back, frac);
				}
				else continue;
			}
			else if (p) {
				baseColor = p.lightBaseColor;
				shadowColor = p.shadowColor;
			}
			else continue; //No animation nor is this player owned
			var hasBottom = !grid.isOutOfBounds(r + 1, c);
			var bottomAnimate = hasBottom && animateGrid.get(r + 1, c);
			var totalStatic = !bottomAnimate && !animateSpec;
			var bottomEmpty = totalStatic ? (hasBottom && !grid.get(r + 1, c)) : (!bottomAnimate || (bottomAnimate.after && bottomAnimate.before));
			if (hasBottom && ((!!bottomAnimate ^ !!animateSpec) || bottomEmpty)) {
				ctx.fillStyle = shadowColor.rgbString();
				ctx.fillRect(x, y + consts.CELL_WIDTH, consts.CELL_WIDTH + 1, SHADOW_OFFSET);
			}
			ctx.fillStyle = baseColor.rgbString();
			ctx.fillRect(x, y, consts.CELL_WIDTH + 1, consts.CELL_WIDTH + 1);
		}
	}
	if (!client.allowAnimation) return;

	//Paint squares with drop in animation
	for (var r = 0; r < grid.size; r++) {
		for (var c = 0; c < grid.size; c++) {
			animateSpec = animateGrid.get(r, c);
			x = c * consts.CELL_WIDTH, y = r * consts.CELL_WIDTH;
			if (animateSpec && client.allowAnimation) {
				var viewable = r >= minRow && r < maxRow && c >= minCol && c < maxCol;
				if (animateSpec.after && viewable) {
					//Bouncing the squares.
					var offsetBounce = getBounceOffset(animateSpec.frame);
					y -= offsetBounce;
					shadowColor = animateSpec.after.shadowColor;
					baseColor = animateSpec.after.lightBaseColor.deriveLumination(-(offsetBounce / DROP_HEIGHT) * .1);
					ctx.fillStyle = shadowColor.rgbString();
					ctx.fillRect(x, y + consts.CELL_WIDTH, consts.CELL_WIDTH, SHADOW_OFFSET);
					ctx.fillStyle = baseColor.rgbString();
					ctx.fillRect(x, y, consts.CELL_WIDTH + 1, consts.CELL_WIDTH + 1);
				}
				animateSpec.frame++;
				if (animateSpec.frame >= ANIMATE_FRAMES) animateGrid.set(r, c, null);
			}
		}
	}
}

function paintUIBar(ctx) {
	ctx.fillStyle = "white";
	ctx.font = "18px Changa";

	//Calcuate rank
	var sorted = [];
	client.getPlayers().forEach(val => {
		sorted.push({player: val, portion: playerPortion[val.num]});
	});
	sorted.sort((a, b) => {
		return (a.portion === b.portion) ? a.player.num - b.player.num : b.portion - a.portion;
	});

	//Rolling the leaderboard bars
	if (sorted.length > 0) {
		var maxPortion = sorted[0].portion;
		client.getPlayers().forEach(player => {
			var rolling = barProportionRolling[player.num];
			rolling.value = playerPortion[player.num] / maxPortion;
			rolling.update();
		});
	}

	//Show leaderboard
	var leaderboardNum = Math.min(consts.LEADERBOARD_NUM, sorted.length);
	for (var i = 0; i < leaderboardNum; i++) {
		var player = sorted[i].player;
		var name = player.name || "Unnamed";
		var portion = barProportionRolling[player.num].lag;
		var nameWidth = ctx.measureText(name).width;
		barSize = Math.ceil((BAR_WIDTH - MIN_BAR_WIDTH) * portion + MIN_BAR_WIDTH);
		var barX = canvasWidth - barSize;
		var barY = BAR_HEIGHT * i;
		var offset = i == 0 ? 10 : 0;
		ctx.fillStyle = "rgba(10, 10, 10, .3)";
		ctx.fillRect(barX - 10, barY + 10 - offset, barSize + 10, BAR_HEIGHT + offset);
		ctx.fillStyle = player.baseColor.rgbString();
		ctx.fillRect(barX, barY, barSize, consts.CELL_WIDTH);
		ctx.fillStyle = player.shadowColor.rgbString();
		ctx.fillRect(barX, barY + consts.CELL_WIDTH, barSize, SHADOW_OFFSET);
		ctx.fillStyle = "black";
		ctx.fillText(name, barX - nameWidth - 15, barY + 27);
		var percentage = (portionsRolling[player.num].lag * 100).toFixed(3) + "%";
		ctx.fillStyle = "white";
		ctx.fillText(percentage, barX + 5, barY + consts.CELL_WIDTH - 5);
	}
}

function paint(ctx) {
	ctx.fillStyle = "#e2ebf3"; //"whitesmoke";
	ctx.fillRect(0, 0, canvasWidth, canvasHeight);

	//Move grid to viewport as said with the offsets, below the stats
	ctx.save();
	//ctx.translate(0, BAR_HEIGHT);
	ctx.beginPath();
	ctx.rect(0, 0, gameWidth, gameHeight);
	ctx.clip();

	//Zoom in/out based on player stats
	ctx.scale(zoom, zoom);
	ctx.translate(consts.BORDER_WIDTH, consts.BORDER_WIDTH);

	paintGrid(ctx);
	client.getPlayers().forEach(p => {
		var fr = p.waitLag;
		if (fr < ANIMATE_FRAMES) p.render(ctx, fr / ANIMATE_FRAMES);
		else p.render(ctx);
	});

	//Reset transform to paint fixed UI elements
	ctx.restore();
	paintUIBar(ctx);

	if ((!user || user.dead) && !showedDead) {
		showedDead = true;
		console.log("You died!");
	}
}

function paintDoubleBuff() {
	paint(offctx);
	ctx.drawImage(offscreenCanvas, 0, 0);
}

function update() {
	updateSize();

	//Change grid offsets
	for (var i = 0; i <= 1; i++) {
		if (animateTo[i] !== offset[i]) {
			if (client.allowAnimation) {
				var delta = animateTo[i] - offset[i];
				var dir = Math.sign(delta);
				var mag = Math.min(consts.SPEED, Math.abs(delta));
				offset[i] += dir * mag;
			}
			else offset[i] = animateTo[i];
		}
	}

	//Calculate player portions
	client.getPlayers().forEach(player => {
		var roll = portionsRolling[player.num];
		roll.value = playerPortion[player.num] / consts.GRID_COUNT / consts.GRID_COUNT;
		roll.update();
	});
}

//Helper methods
function centerOnPlayer(player, pos) {
	player = {
		posX: 0,
		posY: 0
	}
	var xOff = Math.floor(player.posX - (gameWidth / zoom - consts.CELL_WIDTH) / 2);
	var yOff = Math.floor(player.posY - (gameHeight / zoom - consts.CELL_WIDTH) / 2);
	var gridWidth = grid.size * consts.CELL_WIDTH + consts.BORDER_WIDTH * 2;
	pos[0] = xOff; //Math.max(Math.min(xOff, gridWidth + (BAR_WIDTH + 100) / zoom - gameWidth / zoom), 0);
	pos[1] = yOff; //Math.max(Math.min(yOff, gridWidth - gameHeight / zoom), 0);
}

function getBounceOffset(frame) {
	var offsetBounce = ANIMATE_FRAMES;
	var bounceNum = BOUNCE_FRAMES.length - 1;
	while (bounceNum >= 0 && frame < offsetBounce - BOUNCE_FRAMES[bounceNum]) {
		offsetBounce -= BOUNCE_FRAMES[bounceNum];
		bounceNum--;
	}
	if (bounceNum === -1) return (offsetBounce - frame) * DROP_SPEED;
	else {
		offsetBounce -= BOUNCE_FRAMES[bounceNum];
		frame = frame - offsetBounce;
		var midFrame = BOUNCE_FRAMES[bounceNum] / 2;
		return (frame >= midFrame) ? (BOUNCE_FRAMES[bounceNum] - frame) * DROP_SPEED : frame * DROP_SPEED;
	}
}

function Rolling(value, frames) {
	var lag = 0;
	if (!frames) frames = 24;
	this.value = value;
	Object.defineProperty(this, "lag", {
		get: function() {
			return lag;
		},
		enumerable: true
	});
	this.update = function() {
		var delta = this.value - lag;
		var dir = Math.sign(delta);
		var speed = Math.abs(delta) / frames;
		var mag = Math.min(Math.abs(speed), Math.abs(delta));

		lag += mag * dir;
		return lag;
	}
}

module.exports = exports = {
	addPlayer: function(player) {
		playerPortion[player.num] = 0;
		portionsRolling[player.num] = new Rolling(9 / consts.GRID_COUNT / consts.GRID_COUNT, ANIMATE_FRAMES);
		barProportionRolling[player.num] = new Rolling(0, ANIMATE_FRAMES);
	},
	disconnect: function() {
	},
	removePlayer: function(player) {
		delete playerPortion[player.num];
		delete portionsRolling[player.num];
		delete barProportionRolling[player.num];
	},
	setUser: function(player) {
		user = player;
		centerOnPlayer(user, offset);
	},
	reset: reset,
	updateGrid: function(row, col, before, after) {
		//Keep track of areas
		if (before) playerPortion[before.num]--;
		if (after) playerPortion[after.num]++;
		//Queue animation
		if (before === after || !client.allowAnimation) return;
		animateGrid.set(row, col, {
			before: before,
			after: after,
			frame: 0
		});
	},
	paint: paintDoubleBuff,
	update: update
};
