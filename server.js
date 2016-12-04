const app = require('express')();
const http = require('http').Server(app);
const io = require('socket.io')(http);
const sweetName = require("adjective-adjective-animal");
const util = require("util");

/*
 Global state
 */

const rooms = {};
const socketsByPlayerId = {};
const roomsByPlayerId = {};

/*
Utility functions
 */

function getUUID() {
    // http://stackoverflow.com/a/2117523/2938962
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

function getPlayerNum(room, playerId) {
    for (let i = 0; i < 4; i++) {
        if (room.playerIds[i] === playerId) {
            return i + 1;
        }
    }
    return null;
}

function getNextPlayerNum(room) {
    for (let i = 0; i < 4; i++) {
        if (room.playerIds[i] === null) {
            return i + 1;
        }
    }
    return null;
}

function getSocketForPlayer(playerId) {
    return socketsByPlayerId[playerId];
}

function cleanupRoomForPlayerId(playerId) {
    console.log('(!) cleanupRoomForPlayerId: player "' + playerId + '"');

    const room = roomsByPlayerId[playerId];
    if (room) {
        const playerNum = getPlayerNum(room, playerId);
        if (playerNum !== null) { room.playerIds[playerNum - 1] = null; }

        delete roomsByPlayerId[playerId];

        const remainingPlayer = room.playerIds.filter(util.isString);
        if (remainingPlayer.length) {
            // Send event room-changed to all remaining players
            remainingPlayer.map(getSocketForPlayer).forEach(sock => sock.emit('room-changed', room));
        } else {
            // No more player, reap the room
            console.log('(!) cleanupForPlayerId: room "' + room.roomId + '" is empty. Cleaning up...');
            delete rooms[room.roomId];
        }
    }
}

function cleanupEverythngForPlayerId(playerId) {
    console.log('(!) cleanupEverythngForPlayerId: player "' + playerId + '"');

    if (socketsByPlayerId[playerId]) {
        delete socketsByPlayerId[playerId];
    }
    cleanupRoomForPlayerId(playerId);
}

/*
Server logic
 */
io.on('connection', function(socket) {
    console.log('> connect [' + socket.handshake.address + ']');

    // Listen for disconnect
    socket.on('disconnect', function () {
        console.log('> disconnect [' + socket.handshake.address + ']');
        // Did the player hello the server before disconnecting?
        if (!socket.__playerId) { return; }

        // Cleanup any previous state for socket/player
        cleanupEverythngForPlayerId(socket.__playerId);
    });

    // Listen for hello
    socket.on('hello', function () {
        console.log('> hello [' + socket.handshake.address + ']');

        // Cleanup any previous state for socket/player
        if (socket.__playerId) { cleanupEverythngForPlayerId(socket.__playerId); }

        // Get a new id for player
        const playerId = getUUID();
        socketsByPlayerId[playerId] = socket;

        // Mark the socket
        socket.__playerId = playerId;

        // Send ok reply
        socket.emit('hello-ok', playerId);
    });

    // Listen for create-room
    socket.on('create-room', function () {
        console.log('> create-room [' + socket.handshake.address + ']');

        const playerId = socket.__playerId;
        if (!playerId) { return; }

        // Clean up any previous room
        cleanupRoomForPlayerId(playerId);

        // Make a new room
        sweetName().then(roomId => {
            const room = {
                started: false,
                roomId: roomId,
                ownerId: playerId,
                playerIds: [playerId, null, null, null]
            };
            rooms[room.roomId] = room;
            roomsByPlayerId[playerId] = room;

            // Send ok reply
            socket.emit('create-room-ok', {
                playerNum: 1,
                room: room
            });
        });
    });

    // Listen for list-rooms
    socket.on('list-rooms', function () {
        console.log('> list-rooms [' + socket.handshake.address + ']');

        // Send ok reply
        // Only list rooms where the game has not started and there are less than 4 players
        socket.emit('list-rooms-ok', Object.keys(rooms).map(roomKey => rooms[roomKey]).filter(room =>
            !room.started && room.playerIds.filter(util.isString).length < 4)
        );
    });

    // Listen for join-room
    socket.on('join-room', function (roomId) {
        console.log('> join-room [' + socket.handshake.address + ']');

        const playerId = socket.__playerId;
        if (!playerId) { return; }

        // Check that game is not started
        const room = rooms[roomId];
        if (!room) {
            console.log("Warning: rejecting join-room from player '" + playerId + "' (room '" + roomId + "' is unknown).");
            socket.emit('join-room-ko');
            return;
        }

        if (room.started) {
            console.log("Warning: rejecting join-room from player '" + playerId + "' (room '" + roomId + "' is started).");
            socket.emit('join-room-ko');
            return;
        }

        // Pick a player number
        const playerNum = getNextPlayerNum(room);
        if (playerNum === null) {
            console.log("Warning: rejecting join-room from player '" + playerId + "' (could not get a number for player).");
            socket.emit('join-room-ko');
            return;
        }

        // Add player to room
        room.playerIds[playerNum - 1] = playerId;
        roomsByPlayerId[playerId] = room;

        // Send ok reply
        socket.emit('join-room-ok', {
            playerNum: playerNum,
            room: room
        });

        // Send  event room-changed
        room.playerIds.filter(util.isString).map(getSocketForPlayer).forEach(sock => sock.emit('room-changed', room));
    });

    socket.on('start-game', function () {
        console.log('> start-game [' + socket.handshake.address + ']');

        const playerId = socket.__playerId;
        if (!playerId) { return; }

        const room = roomsByPlayerId[playerId];
        if (room === null || room.started || room.ownerId !== playerId) {
            console.log("Warning: rejecting start-room from player '" + playerId + "' (room unknown or started, or not owned by player).");
            socket.emit('start-game-ko');
            return;
        }
        room.started = true;

        // Send event game-started
        room.playerIds.filter(util.isString).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('game-started');
        });
    });

    socket.on('spawn-entity', function (msg) {
        const playerId = socket.__playerId;
        if (!playerId) { return; }

        const room = roomsByPlayerId[playerId];
        if (!room) { return; }

        // Send event entity-spawned (excluding event sender)
        room.playerIds.filter(util.isString).filter((thatPlayerId) => thatPlayerId !== playerId).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('entity-spawned', msg);
        });
    });

    socket.on('sync-entity', function (msg) {
        const playerId = socket.__playerId;
        if (!playerId) { return; }

        const room = roomsByPlayerId[playerId];
        if (!room) { return; }

        // Send event entity-synced (excluding event sender)
        room.playerIds.filter(util.isString).filter((thatPlayerId) => thatPlayerId !== playerId).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('entity-synced', msg);
        });
    });

    socket.on('destroy-entity', function (msg) {
        const playerId = socket.__playerId;
        if (!playerId) { return; }

        const room = roomsByPlayerId[playerId];
        if (!room) { return; }

        // Send event entity-destroyed (excluding event sender)
        room.playerIds.filter(util.isString).filter((thatPlayerId) => thatPlayerId !== playerId).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('entity-destroyed', msg);
        });
    });
});

http.listen(3000, function() {
    console.log('listening on *:3000');
});
