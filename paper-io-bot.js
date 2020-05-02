// if (process.argv.length < 3) {
// 	console.log("Usage: node paper-io-bot.js <socket-url> [<name>]")
// 	process.exit(1);
// }

const rust = import('./pkg');
var core = require("./src/core");
var client = require("./src/game-client");
var config = require("./config.json");
var consts = config.consts;

var MOVES = [[-1, 0], [0, 1], [1, 0], [0, -1]];

var startFrame = 0;
var endFrame = 0;
var grid, others, user, playerPortion = {}, claim = [];

client.allowAnimation = false;
client.renderer = {
	addPlayer: function(player) {
		playerPortion[player.num] = 0;
	},
	disconnect: function() {
		var dt = (endFrame - startFrame);
		startFrame = -1;

		console.log(`[${new Date()}] I died... (survived for ${dt} frames.)`);
		console.log(`[${new Date()}] I killed ${client.kills} player(s).`);
		setTimeout(connect, 5000);
	},
	removePlayer: function(player) {
		delete playerPortion[player.num];
	},
	setUser: function(u) {
		user = u;
	},
	update: update,
	updateGrid: function(row, col, before, after) {
		before && playerPortion[before.num]--;
		after && playerPortion[after.num]++;
	}
};

// rust.init();
// var context = new rust.Context("http://localhost:8090", config.contractID);
// connect(context);

rust
  .then(m => {
    m.init();
    return new m.Context("http://localhost:8090", config.contractID);
  })
  .then(connect)
  .catch(console.error);


function mod(x) {
	x %= 4;
	if (x < 0) x += 4;
	return x;
}

async function connect(rctx) {
	await rctx.tips_sync();
  client.giveContext(rctx);
  setTimeout(client.syncTick, 1000);

	var prefixes = consts.PREFIXES.split(" ");
	var names = consts.NAMES.split(" ");
	var name = process.argv[3] || [prefixes[Math.floor(Math.random() * prefixes.length)], names[Math.floor(Math.random() * names.length)]].join(" ");
	client.connectGame(process.argv[2], "[BOT] " + name, function(success, msg) {
		if (!success) {
			console.error(msg);
			setTimeout(connect, 1000);
		}
	});
}

function Loc(row, col) {
	if (this.constructor != Loc) return new Loc(row, col);

	this.row = row;
	this.col = col;
}

function update() {
  endFrame++;
  if (user && endFrame % 120 == 0) {
    grid = client.grid;
    others = client.getOthers();

    //Note: the code below isn't really my own code. This code is in fact the
    //approximate algorithm used by the paper.io game. It has been modified from
    //the original code (i.e. deobfuscating) and made more efficient in some
    //areas (and some tweaks), otherwise, the original logic is about the same.
    var row = user.row, col = user.col, dir = user.currentHeading;
    var thres = (.05 + .1 * Math.random()) * consts.GRID_COUNT * consts.GRID_COUNT;

    if (row < 0 || col < 0 || row >= consts.GRID_COUNT || col >= consts.GRID_COUNT) return;

    if (grid.get(row, col) === user) {
      //When we are inside our territory
      claim = [];
      weights = [25, 25, 25, 25];
      weights[dir] = 100;
      weights[mod(dir + 2)] = -9999;

      for (var nd = 0; nd < 4; nd++) {
        for (var S = 1; S < 20; S++) {
          var nr = MOVES[nd][0] * S + row;
          var nc = MOVES[nd][1] * S + col;

          if (nr < 0 || nc < 0 || nr >= consts.GRID_COUNT || nc >= consts.GRID_COUNT) {
            if (S > 1) weights[nd]--;
            else weights[nd] = -9999;
          }
          else {
            if (grid.get(nr, nc) !== user) weights[nd]--;

            var tailed = undefined;
            for (var o of others) {
              if (o.tail.hitsTail(new Loc(nr, nc))) {
                tailed = o;
                break;
              }
            }

            if (tailed) {
              if (o.name.indexOf("PAPER") != -1) weights[nd] += 3 * (30 - S); //Don't really try to kill our own kind
              else weights[nd] += 30 * (30 - S);
            }
          }
        }
      }

      //View a selection of choices based on the weights we computed
      var choices = [];
      for (var d = 0; d < 4; d++) {
        for (var S = 1; S < weights[d]; S++) {
          choices.push(d);
        }
      }

      if (choices.length === 0) choices.push(dir);
      dir = choices[Math.floor(Math.random() * choices.length)];
    }
    else if (playerPortion[user.num] < thres) {
      //Claim some land if we are relatively tiny and have little to risk.
      if (claim.length === 0) {
        var breadth = 4 * Math.random() + 2;
        var length = 4 * Math.random() + 2;
        var ccw = 2 * Math.floor(2 * Math.random()) - 1;

        turns = [dir, mod(dir + ccw), mod(dir + ccw * 2), mod(dir + ccw * 3)];
        lengths = [breadth, length, breadth + 2 * Math.random() + 1, length];

        for (var i = 0; i < turns.length; i++) {
          for (var j = 0; j < lengths[i]; j++) {
            claim.push(turns[i]);
          }
        }
      }

      if (claim.length !== 0) dir = claim.shift();
    }
    else {
      claim = [];
      //We are playing a little bit more cautious when we are outside and have a
      //lot of land
      weights = [5, 5, 5, 5];
      weights[dir] = 50;
      weights[mod(dir + 2)] = -9999;

      for (var nd = 0; nd < 4; nd++) {
        for (var S = 1; S < 20; S++) {
          var nr = MOVES[nd][0] * S + row;
          var nc = MOVES[nd][1] * S + col;

          if (nr < 0 || nc < 0 || nr >= consts.GRID_COUNT || nc >= consts.GRID_COUNT) {
            if (S > 1) weights[nd]--;
            else weights[nd] = -9999;
          }
          else {
            if (user.tail.hitsTail(new Loc(nr, nc))) {
              if (S > 1) weights[nd] -= 50 - S;
              else weights[nd] = -9999;
            }

            if (grid.get(nr, nc) === user) weights[nd] += 10 + S;

            var tailed = undefined;
            for (var o of others) {
              if (o.tail.hitsTail(new Loc(nr, nc))) {
                tailed = o;
                break;
              }
            }

            if (tailed) {
              if (o.name.indexOf("PAPER") != -1) weights[nd] += 3 * (30 - S); //Don't really try to kill our own kind
              else weights[nd] += 30 * (30 - S);
            }
          }
        }
      }

      //View a selection of choices based on the weights we computed
      var choices = [];
      for (var d = 0; d < 4; d++) {
        for (var S = 1; S < weights[d]; S++) {
          choices.push(d);
        }
      }

      if (choices.length === 0) choices.push(dir);
      dir = choices[Math.floor(Math.random() * choices.length)];
    }
    client.changeHeading(dir);
  }
}

function calcFavorability(params) {
	return params.portion + params.kills * 50 + params.survival / 100;
}
