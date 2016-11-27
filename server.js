var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var sweetName = require("adjective-adjective-animal");

function getUUID() {
    // http://stackoverflow.com/a/2117523/2938962
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        var r = Math.random()*16|0, v = c == 'x' ? r : (r&0x3|0x8);
        return v.toString(16);
    });
}

var rooms = {};

io.on('connection', function(socket) {
    console.log('> connection [' + socket.handshake.address + ']');

    socket.on('disconnect', function () {
        console.log('> disconnect [' + socket.handshake.address + ']');
    });

    socket.on('create-room', function () {
        console.log('> create-room [' + socket.handshake.address + ']');

        const ownerId = getUUID();
        sweetName().then(function (roomId) {
            var room = {
                started: false,
                roomId: roomId,
                ownerId: ownerId,
                players: [{
                    playerId: ownerId,
                    playerSocket: socket
                }]
            };
            rooms[room.roomId] = room;

            const msg = {roomId: room.roomId, ownerId: room.ownerId};
            socket.emit('create-room-ok', msg);
        });
    });

    socket.on('list-rooms', function () {
        console.log('> list-rooms [' + socket.handshake.address + ']');

        const msg = [];
        for (roomId in rooms) {
            const room = rooms[roomId];
            msg.push({roomId: room.roomId, ownerId: room.ownerId});
        }

        socket.emit('list-rooms-ok', msg);
    });

    socket.on('join-room', function (roomId) {
        console.log('> join-room [' + socket.handshake.address + ']');

        const room = rooms[roomId];
        if (room.started) socket.emit('join-room-ko', msg);
        room.players.push({playerId: getUUID(), playerSocket: socket});

        const msg = {roomId: room.roomId, ownerId: room.ownerId};
        socket.emit('join-room-ok', msg);


        for (player in room.players) {
            player.socket.emit('evt-room-joined');
        }
    });

    socket.on('start-game', function (roomId) {
        const room = rooms[roomId];
        room.started = true;

        for (player in room.players) {
            player.socket.emit('start-game-ok');
        }
    });
});

http.listen(3000, function() {
    console.log('listening on *:3000');
});
