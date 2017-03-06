var express = require('express');
var app = express();
var http = require("http");
var server = http.Server(app);
var io = require('socket.io')(server);
var CryptoJS = require("crypto-js");

server.listen(8080);

app.use(express.static('public'));

function toArrayBuffer(buf) {
    var ab = new ArrayBuffer(buf.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

function token(uri){
	http.get(uri, function(res) {
	  res.setEncoding('binary');
	  var body = ''; 
	  res.on('data', function(data){
	    body += data;
	  });
	  res.on('end', function() {
		buffer = new Buffer(body, 'binary');
		data = toArrayBuffer(buffer);
		var wordArray = CryptoJS.lib.WordArray.create(data);
		var hash = CryptoJS.SHA3(wordArray, { outputLength: 224 });
		resourceToken[uri] = hash.toString(CryptoJS.enc.Hex);
	  });
	})
	.on('error', function(e) {
	  console.log("Got error: " + e.message);
	});
}


domainList = {};
domainCount = {};
resourceToken = {};

io.on('connection', function (socket) {
    domain = socket.handshake.headers.referer;
    if(domainList[domain] == null){ 
        console.log('new domain space '+domain);

	domainCount[domain] = 0;
	space = domainList[domain] = io.of('/'+domain);
        space.on('connection', function(socket){
	    domainCount[domain] += 1;

            console.log('new peer of '+domain);
            console.log('new peer id '+socket.id);
	    console.log('domain peers '+domainCount[domain]);

	    socket.on('ice', function(data){
		console.log('ice from:'+socket.id + 'to: '+data.id);
		if(data.id) socket.broadcast.to(data.id).emit('ice',{id:socket.id, uri:data.uri, candidate:data.candidate});
	    });

	    socket.on('help', function(data){
		console.log('help from:'+socket.id);
		uri = data.session;
		desc = data.desc;
		if(domainCount[domain] > 1){
			console.log('brodcast help for:'+socket.id);
			socket.emit('token', { uri: uri, token: resourceToken[domain+uri]});
            		socket.broadcast.emit('help',{id:socket.id, desc:desc, uri: uri});
		}else{
			console.log('loadFromServer:'+domain+uri);
			socket.emit('loadFromServer', uri);
			token(domain+uri);
		}
	    });

	    socket.on('answer', function(to, desc, uri){
		console.log('answer from:'+socket.id);
            	socket.broadcast.to(to).emit('answer',{id:socket.id, desc:desc, uri:uri});
	    });

  	    socket.on('disconnect', function () {
  	        console.log('domain user disconnected');
		if(domainCount[domain] > 0) domainCount[domain] -= 1;
  	    });
        });
    }else{
	    socket.on('help', function(data){
		console.log('Special help:'+socket.id);
		uri = data.session;
		desc = data.desc;
		console.log('Special loadFromServer:'+socket.id);
		socket.emit('Special loadFromServer', uri);
	    });
    }
});
