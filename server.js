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

/*
Server logic
 */
io.on('connection', function(socket) {
    // Listen for disconnect
    socket.on('disconnect', function () {
        // Did the player hello the server before disconnecting?
        if (typeof socket.__playerId === "undefined") {
            return;
        }

        // Was the player inside a room?
        const room = roomsByPlayerId[socket.__playerId];
        if (typeof room === "undefined") {
            return;
        }

        // Remove the player from the room
        const playerNum = getPlayerNum(room, socket.__playerId);
        room.playerIds[playerNum - 1] = null;

        // Send event room-changed to all remaining players
        room.playerIds.filter(util.isString).map(getSocketForPlayer).forEach(sock => sock.emit('room-changed', room));
        });
    });

    // Listen for hello
    socket.on('hello', function () {
        console.log('> hello [' + socket.handshake.address + ']');

        // Get a new id for player
        const playerId = getUUID();
        socketsByPlayerId[playerId] = socket;

        // Mark the socket
        socket.__playerId = playerId;

        // Send ok reply
        console.log('< hello-ok(' + playerId + ') [' + socket.handshake.address + ']');
        socket.emit('hello-ok', playerId);
    });

    // Listen for create-room
    socket.on('create-room', function (playerId) {
        console.log('> create-room(' + playerId + ') [' + socket.handshake.address + ']');

        // Make a new room
        sweetName().then(function (roomId) {
            const room = {
                started: false,
                roomId: roomId,
                ownerId: playerId,
                playerIds: [playerId, null, null, null]
            };
            rooms[room.roomId] = room;
            roomsByPlayerId[playerId] = room;

            // Send ok reply
            console.log('< create-room-ok(1, _) [' + socket.handshake.address + ']');
            console.log(room);
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
        console.log('< list-rooms-ok(_) [' + socket.handshake.address + ']');
        console.log(rooms);
        socket.emit('list-rooms-ok', rooms);
    });

    // Listen for join-room
    socket.on('join-room', function (msg) {
        const playerId = msg.playerId;
        const roomId = msg.roomId;
        console.log('> join-room(' + playerId + ', ' + roomId + ') [' + socket.handshake.address + ']');

        // Check that game is not started
        const room = rooms[roomId];
        if (room.started) socket.emit('join-room-ko');

        // Pick a player number
        const playerNum = getNextPlayerNum(room);
        room.playerIds[playerNum - 1] = playerId;
        roomsByPlayerId[playerId] = room;

        // Send ok reply
        console.log('< join-room-ok(' + playerNum + ', _) [' + socket.handshake.address + ']');
        console.log(room);
        socket.emit('join-room-ok', {
            playerNum: playerNum,
            room: room
        });

        // Send  event room-changed
        room.playerIds.filter(util.isString).map(getSocketForPlayer).forEach((sock) => {
            console.log('<< room-changed(_S) [' + socket.handshake.address + ']');
            sock.emit('room-changed', room);
        });
    });

    socket.on('start-game', function (msg) {
        const playerId = msg.playerId;
        const roomId = msg.roomId;
        console.log('> start-game(' + playerId + ', ' + roomId + ') [' + socket.handshake.address + ']');

        const room = rooms[roomId];
        room.started = true;

        // Send event game-started
        room.playerIds.filter(util.isString).map(getSocketForPlayer).forEach((sock) => {
            console.log('<< game-started [' + socket.handshake.address + ']');
            sock.emit('game-started');
        });
    });

    socket.on('spawn-entity', function (msg) {
        const playerId = msg.playerId;
        const room = roomsByPlayerId[playerId];
        // Send event entity-spawned (excluding event sender)
        room.playerIds.filter(util.isString).filter((thatPlayerId) => thatPlayerId !== playerId).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('entity-spawned', msg);
        });
    });

    socket.on('sync-entity', function (msg) {
        const playerId = msg.playerId;
        const room = roomsByPlayerId[playerId];
        // Send event entity-synced (excluding event sender)
        room.playerIds.filter(util.isString).filter((thatPlayerId) => thatPlayerId !== playerId).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('entity-synced', msg);
        });
    });

    socket.on('destroy-entity', function (msg) {
        const playerId = msg.playerId;
        const room = roomsByPlayerId[playerId];
        // Send event entity-destroyed (excluding event sender)
        room.playerIds.filter(util.isString).filter((thatPlayerId) => thatPlayerId !== playerId).map(getSocketForPlayer).forEach((sock) => {
            sock.emit('entity-destroyed', msg);
        });
    });
});

http.listen(3000, function() {
    console.log('listening on *:3000');
});
