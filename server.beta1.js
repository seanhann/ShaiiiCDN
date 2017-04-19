var io = require('socket.io')(8080);
var http = require("http");
var CryptoJS = require("crypto-js");
var redis = require("redis"), client = redis.createClient();

var domainPeer = {};
var maxPeer = 2;
var resourceToken = {};
var peerConn = [];
var EVENTS = {'INIT':'init', 'COMMIT':'commit', 'HTTPLOAD': 'http', 'PREPARE': 'prepare', 'WEBRTC': 'webrtc'};
var FLAG = {'OFFER':0, 'ANSWER':1 ,'ICE': 2,'CONFIRM':3 ,'CLOSE': 4};

function toArrayBuffer(buf) {
    var ab = new ArrayBuffer(buf.length);
    var view = new Uint8Array(ab);
    for (var i = 0; i < buf.length; ++i) {
        view[i] = buf[i];
    }
    return ab;
}

function token(domain, page, uri){
	var url = /^(http|https):\/\//.test(uri) ? uri:(/^\//.test(uri) ? domain+uri:page+uri);
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

		resourceToken[page][uri] = {hash: hash.toString(CryptoJS.enc.Hex), size: buffer.length};
		//client.sadd([domain, uri, hash.toString(CryptoJS.enc.Hex), buffer.length]);
	  	console.log("prepare: " + domain+uri + 'size:' + buffer.length);
	  });
	})
	.on('error', function(e) {
	  console.log("Got error: " + e.message);
	});
}

io.on('connection', function (socket) {
    	var page = socket.handshake.headers.referer;
    	var domain = socket.handshake.headers.origin;

	if(!domainPeer[page]) domainPeer[page] = [];
	if(!peerConn[socket.id]) peerConn[socket.id] = [];

	console.log(domainPeer[page].length);
	if(domainPeer[page].length > 0){
	    	socket.emit(EVENTS.INIT, { token: resourceToken[page] });
	}else{
	    	socket.emit(EVENTS.HTTPLOAD, domain);
	}

	socket.on(EVENTS.COMMIT, function(session){
		if(!domainPeer[page][socket.id]) domainPeer[page].push(socket.id);
		console.log('delete bridge: '+peerConn[peerConn[socket.id][session]][session]);
		if(peerConn[socket.id] && peerConn[socket.id][session] && peerConn[peerConn[socket.id][session]][session])
		delete peerConn[peerConn[socket.id][session]][session];
		console.log('delete bridge: '+peerConn[socket.id][session]);
		if(peerConn[socket.id] && peerConn[socket.id][session])
		delete peerConn[socket.id][session];
		console.log('peer left: '+domainPeer[page].length);
	});

	socket.on(EVENTS.PREPARE, function(data){
		console.log('prepare');
		if(!resourceToken[page]) resourceToken[page] = {};
		data.forEach(function(elem){
			token(domain, page, elem);
		});

		if(!domainPeer[page][socket.id]) domainPeer[page].push(socket.id);
	});

	socket.on(EVENTS.WEBRTC, function(data){
		if(domainPeer[page].length > 0){
			if(!peerConn[socket.id][data.session]){
	    			len = domainPeer[page].length;
	    			random = domainPeer[page][ Math.floor((Math.random() * 10) + 1)%len ];
				peerConn[socket.id][data.session] = random;
				if(!peerConn[random]) peerConn[random] = [];
				peerConn[random][data.session] = socket.id;
			}
			console.log(socket.id+'-->'+peerConn[socket.id][data.session]);
        		socket.broadcast.to( peerConn[socket.id][data.session] ).emit(EVENTS.WEBRTC, data);
		}else{
			socket.emit(EVENTS.WEBRTC, {flag: FLAG.CLOSE});
		}
	});

  	socket.on('disconnect', function () {
  	    console.log('domain user disconnected');
	    var length = domainPeer[page].length;
	    for(i=0; i<length; i++){
	    	if(domainPeer[page][i] == socket.id){
			for(key in peerConn[socket.id]){
				delete peerConn[ peerConn[socket.id][key] ][key];	
			}
			delete peerConn[socket.id];
	    		domainPeer[page].splice(i,1);
	    	}
	    }
  	});
});
