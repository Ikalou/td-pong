var app = require('express')();
var http = require('http').Server(app);
var io = require('socket.io')(http);

app.get('/', function(req, res){
    res.sendFile(__dirname + '/index.html');
});

io.on('connection', function(socket){
    io.emit('service-message', '[Someone connected]');
    socket.on('message', function(msg){
        socket.broadcast.emit('message', msg);
    });
    socket.on('disconnect', function(){
        io.emit('service-message', '[Someone disconnected]');
    });
    socket.on('typing', function(msg){
        io.emit('service-message', '[' + msg.nick + '] is typing...');
    });
    socket.on('not-typing', function(msg){
        io.emit('service-message', '[' + msg.nick + '] is no longer typing.');
    });
});

http.listen(3000, function(){
    console.log('listening on *:3000');
});
