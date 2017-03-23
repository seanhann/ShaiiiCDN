Log = (function(){
	function log(show){
		this.begin = Date.now();
		this.show = show;
	}

	log.prototype.write = function(str){
		var now = Date.now();
		if(this.show) console.log(str+'\t'+(now - this.begin));
	}
	return log;
})();

var log = new Log(true);

log.write('begin');
var tracker = io.connect('http://shaiii.com:8080/'+window.location.href);

var Sender = (function(){
	function sender(channel, chunkSize){
		this.channel = channel;
		this.chunkSize = chunkSize;
		this.q = [];
		this.running = false;
		this.blob = null;
	}

	sender.prototype.worker = function(){
		var blobURL = URL.createObjectURL( new Blob([ '(',
		function(){
		    var queue = [];
		    var pointer = 0;
		    function sendQ(i){
			if(i <= pointer){
				while(queue[pointer]){
					postMessage(queue[pointer]);
					pointer++;
				}
			}
		    }
		    onmessage = function(e) {
		        var xhr = new XMLHttpRequest();
			var chunkSize = e.data.chunkSize;
		        xhr.open('GET', e.data.blobUrl, true);
		        xhr.responseType = 'blob';
		        xhr.onload = function(e) {
		                if (this.status == 200) {
		                        var blob = this.response;
		                        var offset = 0;
					var sended = 0;
					var counter = 0;
		                        while(blob.size > offset){
		                                var reader = new FileReader();
		                                var chunk = blob.slice(offset, chunkSize+offset);
		                                reader.addEventListener('loadend', (function(index){return function(e) {
		                                        queue[index] = e.target.result;
							sendQ(index);
							sended += e.target.result.byteLength;
							if(sended == blob.size) close();
		                                }})(counter));
		                                reader.readAsArrayBuffer(chunk);
		                                offset += chunkSize;
						counter++;
		                        }
		                }
		        };
		        xhr.send();
		    }
		}.toString(),
		')()' ], { type: 'application/javascript' } ) ),
		
		worker = new Worker( blobURL );
		URL.revokeObjectURL( blobURL );
		return worker;
	}

	sender.prototype.Q = function(data){
		this.q.push(data);
		if(this.running == false){
			this.running = true;
			while( this.q.length > 0 ){
				if(this.channel.bufferedAmount < 16744448){
					this.channel.send(this.q.shift());
				}else{
					new Promise(function(resolve){ setTimeout(resolve, 100) });
				}
			}
			this.running = false;
		}
	}

	sender.prototype.send = function(blob){
		var that = this;
		this.blob = blob;
		
		log.write('create worker '+this.channel.label);
		var worker = this.worker();
		worker.onmessage = function(e){
			that.Q(e.data);
		}
		worker.postMessage({blobUrl: this.blob, chunkSize: this.chunkSize});
		log.write('start worker '+this.channel.label);
		//this.chunk(0);
	}

	sender.prototype.chunk = function(offset){
		if(this.blob.size > offset){
			log.write('begin chunk '+this.channel.label);
			var that = this;
  		 	var reader = new FileReader();
			var chunk = this.blob.slice(offset, this.chunkSize+offset, this.blob.type);
  		 	reader.addEventListener("loadend", function(e) {
				log.write('slice chunk '+that.channel.label);
  		 		that.channel.send(reader.result);
				if(that.channel.bufferedAmount > 16744448){
					new Promise(function(resolve){ setTimeout(resolve, 500) });
				}
				log.write('buffered amount '+ that.channel.bufferedAmount);
  		 	});
  		 	reader.readAsArrayBuffer(chunk);
			this.chunk(offset + that.chunkSize);
		}
	}

	return sender;
})();

var Receiver = (function(){

	function receiver(channel, security){
		this.channel = channel;
		this.uri = channel.label;
		this.token = security.hash;
		this.size = security.size;
		this.bufferedSize = 0;
		this.buffer = [];
		this.success = false;
		this.init();
		//this.buffer = new Uint8Array(this.size);
	}

	receiver.prototype.init = function(){
		var that = this;	
  		this.channel.onmessage = function (event) {
  			log.write(name+' receive byte:'+event.data.byteLength);
  			that.receive(event.data);
  		};

		this.channel.onclose = function(){
			if(! that.success){
				if(this.error) this.error();
			}
		}

	}

	receiver.prototype.ready = function(closure){
		this.closure = closure;
	}

	receiver.prototype.error = function(closure){
		this.error = closure;
	}

	receiver.prototype.receive = function(data){
		this.buffer.push(data);
		//this.buffer.set( new Uint8Array( data ), this.bufferedSize );
		this.bufferedSize += data.byteLength;
		if(this.bufferedSize == this.size){
			log.write('loaded pic');
			var that = this;
			/*
			var dataView = new DataView(this.buffer.buffer);
			var received = new Blob([dataView]);
			*/

		  	var wordArray = CryptoJS.lib.WordArray.create(this.buffer);
		  	var hash = CryptoJS.SHA3(wordArray, { outputLength: 224});
			var token = hash.toString(CryptoJS.enc.Hex);

			//log.write('show pic' + this.uri + 'web: '+token+ ' server:'+this.token);
			if(token == this.token){
				this.success = true;
				if(this.closure){
					var received = new Blob(this.buffer);
					this.closure(received);
				}
			}else{
				if(this.error) this.error();
			}

			this.buffer = [];
		}
	}
	return receiver;		
})();

WebRTC = (function(){
	function webrtc(stun, optional){
		this.dataChannel = {};
		this.closure = null;
		this.closeClosure = null;
		this.stun = stun;
		this.optional = optional;
		this.init();
	}

	webrtc.prototype.init = function(){
		if(!this.connection){
			this.connection = new RTCPeerConnection(this.stun, this.optional);

			var that = this;
			this.connection.oniceconnectionstatechange = function(event) {
				log.write(that.connection.iceConnectionState);
				if (that.connection.iceConnectionState === "failed" || that.connection.iceConnectionState === "disconnected" || that.connection.iceConnectionState === "closed") {
					if(that.closeClosure) that.closeClosure();
				}
			}
		}
	}

	webrtc.prototype.ready = function(closure){
		this.closure = closure;
	}

	webrtc.prototype.close = function(closure){
		this.closeClosure = closure;
	}
	
	webrtc.prototype.dataChannelStateChange = function(name){
  		var readyState = this.dataChannel[name].readyState;
  		log.write( this.dataChannel[name].label +'is: ' + readyState );

		if(readyState == 'open'){
			if(this.closure) this.closure(this.dataChannel[name]);
		}else if(readyState == 'closed'){
  			log.write( this.dataChannel[name].label +'is: ' + readyState );
			delete this.dataChannel[name];
			if(Object.keys(this.dataChannel).length == 0) this.connection.close();
		}
	}

	webrtc.prototype.error = function(error){
		log.write(error);
	}

	webrtc.prototype.createChannel = function(name){
		var that = this;	 
		this.dataChannel[name] = this.connection.createDataChannel(name);
		this.dataChannel[name].binaryType = 'arraybuffer';
		this.dataChannel[name].onopen = function(){ 
			that.dataChannelStateChange(name);
		}
		this.dataChannel[name].onclose = function(){ 
			that.dataChannelStateChange(name);
		}
	}
	
	webrtc.prototype.offer = function(fn){
		var that = this;
  		this.connection.createOffer().then(
  			function(desc){
  			      	that.connection.setLocalDescription(desc);
				fn(desc);	
  			},this.error
  		);
	}

	webrtc.prototype.setRemoteDescription = function(desc){
		this.connection.setRemoteDescription(desc);
	}

	webrtc.prototype.ice = function(iceFun){
		this.connection.onicecandidate = function(e){
			if(e.candidate){
				iceFun(e.candidate)	
			}
		}
	}

	webrtc.prototype.addIce = function(candidate){
		this.connection.addIceCandidate(new RTCIceCandidate(candidate));
	}

	webrtc.prototype.answer = function(remoteDesc, answerFun){

		var that = this;
  		var desc = new RTCSessionDescription(remoteDesc);
  		this.setRemoteDescription(desc);
  		this.connection.createAnswer().then(
			function(desc){
				that.connection.setLocalDescription(desc);
				answerFun(desc);
			},
			function(error){
				alert(error);
			}
		);

  		this.connection.ondatachannel = function(event){ 
  			var dataChannel = event.channel;
			var name = dataChannel.label;

  			dataChannel.binaryType = 'arraybuffer';
			that.dataChannel[name] = dataChannel;

			dataChannel.onopen = function(){
				that.dataChannelStateChange(name);
			}
			dataChannel.onclose = function(){ 
				that.dataChannelStateChange(name);
			}
  		};

	}

	return webrtc;
})();


Factory = function(){
	//this.stun = { urls: 'stun:stun.l.google.com:19302' };
	this.stun = { urls: 'stun:turn.shaiii.com:3478', 'credential': 'hjxhlk@123', 'username': 'shaiii' };
	this.turn = { urls: 'turn:turn.shaiii.com:3478', 'credential': 'hjxhlk@123', 'username': 'shaiii' };
	this.servers = { iceServers: [this.stun, this.turn]};
	this.DtlsSrtpKeyAgreement = { DtlsSrtpKeyAgreement: true };
	this.optional = { optional: [this.DtlsSrtpKeyAgreement] };
	this.list = [];
}

Factory.prototype.get = function(name){
	if(!this.list[name]){
		this.list[name] = new WebRTC(this.servers, this.optional); 
	}
	return this.list[name];	
}

ShaiiiCDN = (function(){
	function cdn(signal){
		window.sources = {};
		this.factory = new Factory();
		this.signal = signal;
		this.token={};
		this.listen();
	}

	cdn.prototype.listen = function(){
		var that = this;
		this.signal.on('help', function(data){that.answerHelp(data)});
		this.signal.on('init', function(data){that.init(data)});
		this.signal.on('answer', function(data){that.confirmAnswer(data)});
		this.signal.on('ice', function(data){that.exchangeIce(data)});
		this.signal.on('loadFromServer', function(data){ that.loadFromServer(data)});
	}

	cdn.prototype.init = function(data){
		if(window.RTCPeerConnection){
			log.write('init: remoteId ');
			var remoteId = data.id;
			this.help(remoteId);
			this.token = data.token;
		}else{
			imgs = document.querySelectorAll("[shaiii-cdn]");
			for(i=0; i<imgs.length; i++){
				imgs[i].src = imgs[i].getAttribute('shaiii-cdn');
			}
		}

	}

	cdn.prototype.close = function(){
		var rtcs = this.factory.list;
		for(var key in rtcs){
			rtcs[key].connection.close();
		}
	}

	cdn.prototype.send = function(to, msg){
		data = {to: to, session: msg.session, desc: msg.desc}; 
		this.signal.emit(msg.flag, data);	
	}

	cdn.prototype.exchangeIce = function(data){
		log.write('exchangeIce:' + data);

		var session = data.session;
		var candidate = data.desc;
		webrtc = this.factory.get(session);
		webrtc.addIce(candidate);
	}

	cdn.prototype.help = function(remoteId){
		var id = Date.now();
		var webrtc = this.factory.get(id);
		var that = this;

		log.write('new webrtc:'+id);
	
		imgs = document.querySelectorAll("[shaiii-cdn]");
		for(i=0; i<imgs.length; i++){
			src = imgs[i].getAttribute('shaiii-cdn');
			if(window.sources[src] == null){
				window.sources[src] = null;
				webrtc.createChannel(src);
			}
		}

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', session: id, desc: candidate});
			log.write('send ice:');
		});

		webrtc.offer(function(desc){
			that.send(remoteId, {flag:'help', session: id, desc: desc});
			log.write('send offer:');
		});
		
		webrtc.ready(function(channel){
			var name = channel.label;
			var token = that.token[name];
  			var receiver = new Receiver(channel, token);
			receiver.ready(function(received){
				window.sources[name] = received;

				url= URL.createObjectURL(received);
				document.querySelector('[shaiii-cdn="'+name+'"]').src = url;
				log.write('show pic' + name);

				channel.close();
				log.write(name + 'closed correctly');
			});

			receiver.error(function(){
				that.loadUri(name);
			});

		});

		webrtc.close(function(){
			for(var i in window.sources){
				if(window.sources[i] == '' || window.sources[i] == null || window.sources[i] == undefined) that.loadUri(i);
			};
		});
	}

	cdn.prototype.answerHelp = function(data){
		log.write('answer for:'+data.id);

		var that = this;
		var remoteId = data.id;	
		var session = data.session;

		webrtc = this.factory.get(session);

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', session: session, desc: candidate});
		});

		webrtc.answer(data.desc,
			function(desc){
				that.send(remoteId, {flag:'answer', session: session, desc: desc});
			}
		);

		webrtc.ready(function(channel){
			var name = channel.label;
			//var blob = window.sources[name];
	  		var blob = document.querySelector('[shaiii-cdn="'+name+'"]').src;
			var chunkSize = 65536; //1024 * 64; //16384;//1024*32;
			if(blob){
				var sender = new Sender(channel, chunkSize);
				sender.send(blob);
			}else{
				channel.close();
			}
		});
	}

	cdn.prototype.confirmAnswer = function(data){
		log.write('confirm answer:'+data.id);

		var that = this;
		var remoteId = data.id;	
		var session = data.session;

		webrtc = this.factory.get(session);
		webrtc.setRemoteDescription(data.desc);
	}

	cdn.prototype.loadFromServer = function(data){
		var prepare = [];
		imgs = document.querySelectorAll("[shaiii-cdn]");
		for(i=0; i<imgs.length; i++){
			src = imgs[i].getAttribute('shaiii-cdn');
			this.loadUri(src);
			prepare.push(src);
		}
		this.signal.emit('prepare', prepare);	
	}

	cdn.prototype.loadUri = function(uri){
		log.write('load from server:');
		var oReq = new XMLHttpRequest();
		oReq.open("GET", uri, true);
		oReq.responseType = "blob";
			
		oReq.onload = function(oEvent) {
	  		blob = oReq.response;
			window.sources[uri] = blob;
	  		var url = URL.createObjectURL(blob); 
	  		document.querySelector('[shaiii-cdn="'+uri+'"]').src = url;
			log.write('loaded pic:');
		}
		oReq.send();
	}


	return cdn;
})();

try{
	var cdn;
	document.addEventListener("DOMContentLoaded", function(event) {
		cdn = new ShaiiiCDN(tracker);
	});
	window.onbeforeunload = function(){
		cdn.close();
	}
	window.addEventListener("beforeunload", function(e){
		cdn.close();	
	}, false);
} catch(e) {
	console.log(e);
}
