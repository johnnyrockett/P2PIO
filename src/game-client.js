// var io = require("socket.io-client");
var core = require("./core");
var { consts } = require("../config.json");
var running = false;
var user, socket, frame;
var players, allPlayers;
var kills;
// var timeout = undefined;
var dirty = false;
var deadFrames = 0;
var requesting = -1; //Frame that we are requesting at
var frameCache = []; //Frames after our request
var allowAnimation = true;
var grid = new core.Grid(consts.GRID_COUNT, (row, col, before, after) => {
  invokeRenderer("updateGrid", [row, col, before, after]);
});

var frameBufferSize = 60 * 4;
var frameBuffer = new Array(frameBufferSize);
var bufferIndex = 0;

var possColors = core.Color.possColors();

var rctx = undefined;
var address = undefined;

var eventQueueHead = 0;
var eventQueueTail = 0;
var eventQueueSize = 100;
var eventQueue = new Array(eventQueueSize).fill(null);

var timelineSize = 1000;
var timelineIndex = 0;
var timeline = new Array(timelineSize);

var inputHeading, pushedHeading;
inputHeading = pushedHeading = 4;

function giveContext(context) {
  rctx = context;
}

var mimiRequestAnimationFrame;
try {
  if (window && window.document) {
    mimiRequestAnimationFrame =
      window.requestAnimationFrame ||
      window.webkitRequestAnimationFrame ||
      window.mozRequestAnimationFrame ||
      window.oRequestAnimationFrame ||
      window.msRequestAnimationFrame ||
      ((callback) => {
        window.setTimeout(callback, 1000 / 30);
      });
  }
} catch (e) {
  mimiRequestAnimationFrame = (callback) => {
    setTimeout(callback, 1000 / 30);
  };
}

//Public API
async function connectGame(url, name, callback, flag) {
  if (running) return; //Prevent multiple runs
  running = true;
  inputHeading = pushedHeading = 4;
  user = null;
  deadFrames = 0;
  var prefixes = consts.PREFIXES.split(" ");
  var names = consts.NAMES.split(" ");
  name =
    name ||
    [
      prefixes[Math.floor(Math.random() * prefixes.length)],
      names[Math.floor(Math.random() * names.length)],
    ].join(" ");

  frame = 0;
  reset();
  console.log("Reset game");

  // For each player on the dag, run these two lines below
  var start = findEmpty(grid);

  var gridData = new Uint8Array(serialGrid);
  for (var r = 0; r < grid.size; r++) {
    for (var c = 0; c < grid.size; c++) {
      var ind = gridData[r * grid.size + c] - 1;
      grid.set(r, c, ind === -1 ? null : players[ind]);
    }
  }
  var serialGrid = gridSerialData(grid, players);

  if (!start) return false;
  var x = start.col * consts.CELL_WIDTH;
  var y = start.row * consts.CELL_WIDTH;
  await rctx.spawn_player(x, y);
  address = rctx.get_address();

  // invokeRenderer("paint", []);
  callback(true, "");
  setTimeout(tick, 0);
}

function changeHeading(newHeading) {
  if (inputHeading === 4 || (
    newHeading != user.currentHeading &&
    (newHeading % 2 === 0) ^ (user.currentHeading % 2 === 0))
  )
    inputHeading = newHeading;
}

function getUser() {
  return user;
}

function getPlayers() {
  return players.slice();
}

function getOthers() {
  var ret = [];
  for (var p of players) {
    if (p !== user) ret.push(p);
  }
  return ret;
}

function disconnect() {
  socket.disconnect();
  running = false;
}

//Private API
function addPlayer(player) {
  if (allPlayers[player.num]) return; //Already added
  allPlayers[player.num] = players[players.length] = player;
  invokeRenderer("addPlayer", [player]);
  return players.length - 1;
}

function invokeRenderer(name, args) {
  var renderer = exports.renderer;
  if (renderer && typeof renderer[name] === "function") {
    renderer[name].apply(exports, args);
  }
}

function reverseFrame(data) {
  // Object.keys(allPlayers).forEach(function(playerId) {
  //     if (playerId in data.playerStats) {
  //         if (playerId === 0)
  //             console.log(allPlayers[playerId].posX);
  //         allPlayers[playerId].posX = data.playerStats[playerId][0];
  //         allPlayers[playerId].posY = data.playerStats[playerId][1];
  //         allPlayers[playerId].waitLag = data.playerStats[playerId][2];
  //         allPlayers[playerId].heading = data.playerStats[playerId][3];
  //     }
  // });
  for (var i = 0; i < players.length; i++) {
    var playerId = players[i].num;
    if (data.playerStats[playerId] !== undefined) {
      var stats = data.playerStats[playerId];
      players[i].reConfigure(stats[0], stats[1], stats[2], stats[3]);
    } else {
      console.log("" + playerId + " was undefined");
    }
  }
  // console.log('reversed frame to ' + data.frame.frame);
  invokeRenderer("update", [frame]);
  dirty = true;
  mimiRequestAnimationFrame(paintLoop);
}

function processFrame() {
  // frameBuffer[bufferIndex] = frameState;
  // bufferIndex = (bufferIndex + 1) % frameBufferSize;
  // frame++;
  var now = Date.now();
  var events = []
  while (eventQueue[eventQueueHead] != null && now >= eventQueue[eventQueueHead].get_timestamp()) {
    events.push(eventQueue[eventQueueHead]);
    eventQueue[eventQueueHead] = null;
    eventQueueHead = eventQueueHead + 1 % eventQueueSize;
  }

  var newPlayers = [];
  var moves = [];

  for (var i = 0; i < events.length; i++) {
    if (events[i].is_input()) {
      var id = events[i].get_id();
      var head = events[i].get_input_heading();
      var millis = Number(events[i].get_timestamp());
      // console.log("Input event at time", milliseconds); // 1587936575412

      moves.push({
        num: id,
        left: false,
        heading: head,
        referenceTime: new Date(millis)
      });
    } else if (events[i].is_spawn()) {
      var birthMillis = Number(events[i].get_timestamp());
      var id = events[i].get_id();
      var x = events[i].get_spawn_x();
      var y = events[i].get_spawn_y();
      var params = {
        posX: x,
        posY: y,
        currentHeading: 4,
        name: id.toString(),
        num: id,
        base: possColors.shift(),
      };
      newPlayers.push(params);

      moves.push({
        num: id,
        left: false,
        heading: 4,
        referenceTime: new Date(birthMillis)
      });
    }
  }

  newPlayers.forEach((p) => {
    var pl = new core.Player(grid, p);
    addPlayer(pl);
    core.initPlayer(grid, pl);
    if (p.num === address) {
      user = allPlayers[address]
      setUser(user);
    }
  });
  moves.forEach((val, i) => {
    var player = allPlayers[val.num];
    if (player != undefined) {
      player.updateReferencePoint(val.referenceTime);
      player.heading = val.heading;
    }
  });
  update();
  dirty = true;
  mimiRequestAnimationFrame(paintLoop);
}

function paintLoop() {
  if (!dirty) return;
  invokeRenderer("paint", []);
  dirty = false;
  if (user && user.dead) {
    // if (timeout) clearTimeout(timeout);
    if (deadFrames === 60) {
      //One second of frame
      var before = allowAnimation;
      allowAnimation = false;
      update();
      invokeRenderer("paint", []);
      allowAnimation = before;
      user = null;
      deadFrames = 0;
      return;
    }
    // socket.disconnect();
    deadFrames++;
    dirty = true;
    update();
    mimiRequestAnimationFrame(paintLoop);
  }
}

function reset() {
  user = null;
  grid.reset();
  players = [];
  allPlayers = [];
  kills = 0;
  invokeRenderer("reset");
}

function setUser(player) {
  user = player;
  invokeRenderer("setUser", [player]);
}

function update() {
  var num = Date.now()
  var currentTime = new Date(num);
  var dead = [];
  core.updateFrame(grid, players, dead, (killer, other) => {
    //addKill
    if (players[killer] === user && killer !== other) kills++;
  }, currentTime);
  dead.forEach((val) => {
    console.log((val.name || "Unnamed") + " is dead");
    delete allPlayers[val.num];
    invokeRenderer("removePlayer", [val]);
  });
  invokeRenderer("update", [frame]);
}

async function syncTick() {
  await rctx.tips_sync();
  setTimeout(syncTick, 50);
}

async function tick() {
  if (user != undefined && user.dead) {
    running = false;
    return connectGame(
      "//" + location.host,
      user.name,
      (success, msg) => {},
      false
    );
  }

  if (pushedHeading != inputHeading) {
    rctx.apply_input(inputHeading); //removed await
    pushedHeading = inputHeading;
  }

  var events = await rctx.take_events();
  for (var i=events.length-1; i>=0; i--) {
    eventQueue[eventQueueTail] = events[i];
    eventQueueTail = eventQueueTail + 1 % eventQueueSize;
  }

  processFrame();
  setTimeout(tick, 1000 / 60);
}

function gridSerialData(grid, players) {
  var buff = Buffer.alloc(grid.size * grid.size);
  var numToIndex = new Array(
    players.length > 0 ? players[players.length - 1].num + 1 : 0
  );
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
      if (!cluttered)
        available.push({
          row: r,
          col: c,
        });
    }
  }
  return available.length === 0
    ? null
    : available[Math.floor(available.length * Math.random())];
}

//Export stuff
[
  connectGame,
  changeHeading,
  getUser,
  getPlayers,
  getOthers,
  disconnect,
  giveContext,
  syncTick,
].forEach((f) => {
  exports[f.name] = f;
});
Object.defineProperties(exports, {
  allowAnimation: {
    get: function () {
      return allowAnimation;
    },
    set: function (val) {
      allowAnimation = !!val;
    },
    enumerable: true,
  },
  grid: {
    get: function () {
      return grid;
    },
    enumerable: true,
  },
  kills: {
    get: function () {
      return kills;
    },
    enumerable: true,
  },
});
