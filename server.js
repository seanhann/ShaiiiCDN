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

function token(domain, uri){
	var url = /^(http|https):\/\//.test(uri) ? uri:(domain+uri);
	http.get(url, function(res) {
	  res.setEncoding('binary');
	  var body = ''; 
	  res.on('data', function(data){
	    body += data;
	  });
	  res.on('end', function() {
		buffer = new Buffer(body, 'binary');
		data = toArrayBuffer(buffer);
		sliced = [];
		offset = 0;
		chunkSize = 65536;
		while(data.byteLength > offset){
			sliced.push( data.slice(offset, offset+chunkSize) );
			offset += chunkSize;
		}

		var wordArray = CryptoJS.lib.WordArray.create(sliced);
		var hash = CryptoJS.SHA3(wordArray, { outputLength: 224 });

		resourceToken[domain][uri] = {hash: hash.toString(CryptoJS.enc.Hex), size: buffer.length};
	  	console.log("prepare: " + domain+uri + 'size:' + buffer.length);
	  });
	})
	.on('error', function(e) {
	  console.log("Got error: " + e.message);
	});
}


domainList = {};
domainPeer = {};
resourceToken = {};
pairs = {};
io.on('connection', function (socket) {
    domain = socket.handshake.headers.referer;
    if(domainList[domain] == null){ 
        console.log('new domain space '+domain);

	domainPeer[domain] = [];
	space = domainList[domain] = io.of('/'+domain);
        space.on('connection', function(socket){

	    console.log('domain peers '+domainPeer[domain].length);

	    if(domainPeer[domain].length > 1){
	    	len = domainPeer[domain].length;
	    	peer = domainPeer[domain][ Math.floor((Math.random() * 10) + 1)%len ];
	    	socket.emit('init', { token: resourceToken[domain], id: peer});
	    	console.log('init from:'+socket.id+' asigned to:'+peer);
	    }else{
	    	console.log('loadFromServer:'+domain);
	    	socket.emit('loadFromServer', domain);
	    	//token(domain+uri);
	    }

	    domainPeer[domain].push(socket.id); 
	    socket.on('prepare', function(data){
		resourceToken[domain] = {};
		data.forEach(function(elem){
			token(domain, elem);
		});
	    });

	    socket.on('ice', function(data){
		console.log('ice from:'+socket.id + 'to: '+data.to);
		if(data.to) socket.broadcast.to(data.to).emit('ice',{to:socket.id, session:data.session, desc:data.desc});
	    });

	    socket.on('help', function(data){
		console.log('help from:'+socket.id);
		uri = data.session;
		desc = data.desc;
            	socket.broadcast.to(data.to).emit('help',{id:socket.id, desc:desc, session: uri});
	    });

	    socket.on('answer', function(data){
		console.log('answer from:'+socket.id);
		to = data.to;
		desc = data.desc;
		session = data.session;
            	socket.broadcast.to(to).emit('answer',{id:socket.id, desc:desc, session:session});
	    });

  	    socket.on('disconnect', function () {
  	        console.log('domain user disconnected');
		var length = domainPeer[domain].length;
		for(i=0; i<length; i++){
			if(domainPeer[domain][i] == socket.id){
				domainPeer[domain].splice(i,1);
			}
		}
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
