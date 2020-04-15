var { consts } = require("../../config.json");

exports.Color = require("./color");
exports.Grid = require("./grid");
exports.Player = require("./player");

exports.initPlayer = (grid, player) => {
	for (var dr = -1; dr <= 1; dr++) {
		for (var dc = -1; dc <= 1; dc++) {
			if (!grid.isOutOfBounds(dr + player.row, dc + player.col)) grid.set(dr + player.row, dc + player.col, player);
		}
	}
};
exports.updateFrame = (grid, players, dead, notifyKill) => {
	var adead = [];
	if (dead instanceof Array) adead = dead;

	var kill = (!notifyKill) ? () => {} : (killer, other) => {
			if (!removing[other]) notifyKill(killer, other);
		};

	//Move players
	var tmp = players.filter(val => {
		val.move();
		if (val.dead) adead.push(val);
		return !val.dead;
	});

	//Remove players with collisions
	var removing = new Array(players.length);
	for (var i = 0; i < players.length; i++) {
		for (var j = i; j < players.length; j++) {

			//Remove those players when other players have hit their tail
			if (!removing[j] && players[j].tail.hitsTail(players[i])) {
				kill(i, j);
				removing[j] = true;
				//console.log("TAIL");
			}
			if (!removing[i] && players[i].tail.hitsTail(players[j])) {
				kill(j, i);
				removing[i] = true;
				//console.log("TAIL");
			}

			//Remove players with collisons...
			if (i !== j && squaresIntersect(players[i].posX, players[j].posX) &&
				squaresIntersect(players[i].posY, players[j].posY)) {
				//...if one player is own his own territory, the other is out
				if (grid.get(players[i].row, players[i].col) === players[i]) {
					kill(i, j);
					removing[j] = true;
				}
				else if (grid.get(players[j].row, players[j].col) === players[j]) {
					kill(j, i);
					removing[i] = true;
				}
				else {
					//...otherwise, the one that sustains most of the collision will be removed
					var areaI = area(players[i]);
					var areaJ = area(players[j]);

					if (areaI === areaJ) {
						kill(i, j);
						kill(j, i);
						removing[i] = removing[j] = true;
					}
					else if (areaI > areaJ) {
						kill(j, i);
						removing[i] = true;
					}
					else {
						kill(i, j);
						removing[j] = true;
					}
				}
			}
		}
	}

	tmp = tmp.filter((val, i) => {
		if (removing[i]) {
			adead.push(val);
            val.die();
            console.log('Dead from colliding');
		}
		return !removing[i];
	});
	players.length = tmp.length;
	for (var i = 0; i < tmp.length; i++) {
		players[i] = tmp[i];
	}

	//Remove dead squares
	for (var r = 0; r < grid.size; r++) {
		for (var c = 0; c < grid.size; c++) {
			if (adead.indexOf(grid.get(r, c)) !== -1) grid.set(r, c, null);
		}
	}
};

function squaresIntersect(a, b) {
	return (a < b) ? (b < a + consts.CELL_WIDTH) : (a < b + consts.CELL_WIDTH);
}

function area(player) {
	var xDest = player.col * consts.CELL_WIDTH;
	var yDest = player.row * consts.CELL_WIDTH;
	return (player.posX === xDest) ? Math.abs(player.posY - yDest) : Math.abs(player.posX - xDest);
}
