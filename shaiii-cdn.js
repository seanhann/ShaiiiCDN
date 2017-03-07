var begin = Date.now();
console.log('begin:'+begin);

var tracker = io.connect('http://shaiii.com:8080/'+window.location.href);

Hash = (function(){
	function hash(blob){
		var reader = new FileReader();
		reader.onloadend = function(evt) {
		  	if (evt.target.readyState == FileReader.DONE) { // DONE == 2
		  	  	var wordArray = CryptoJS.lib.WordArray.create(evt.target.result);
		  	  	var hash = CryptoJS.SHA3(wordArray, { outputLength: 224});
				console.log(hash.toString(CryptoJS.enc.Hex));
		  	}
		};
		reader.readAsArrayBuffer( blob );
	}
	return hash;
})();

var Receiver = function(uri){
	this.uri = uri;
	this.buffer = [];

	this.receive = function(data){
		this.buffer.push(data);	
		if(data.byteLength != 65664){
			var received = new window.Blob(this.buffer);

			this.buffer = [];

			url= URL.createObjectURL(received);
			document.querySelector('img[shaiii-cdn="'+this.uri+'"]').src = url;
		}
	}		
}

WebRTC = (function(){
	function webrtc(stun, optional){
		this.dataChannel = null;
		this.closure = null;
		this.stun = stun;
		this.optional = optional;
		this.init();
	}

	webrtc.prototype.init = function(){
		if(!this.connection){
			this.connection = new RTCPeerConnection(this.stun, this.optional);
		}
	}

	webrtc.prototype.ready = function(closure){
		this.closure = closure;
	}
	
	webrtc.prototype.dataChannelStateChange = function(){
  		var readyState = this.dataChannel.readyState;
		if(readyState == 'open'){
			if(this.closure) this.closure(this.dataChannel);		
		}
  		console.log('Send channel state is: ' + readyState);
	}

	webrtc.prototype.message = function(){
  		console.log('receive first byte:'+Date.now());
	}

	webrtc.prototype.error = function(error){
		console.log(error);
	}

	webrtc.prototype.offer = function(fn){
		var that = this;
		if(!this.dataChannel){
			dataChannel = this.connection.createDataChannel('dataChannel');
			this.dataChannel=dataChannel; 
			dataChannel.binaryType = 'arraybuffer';
			dataChannel.onopen = function(){ 
				that.dataChannelStateChange();
			}
			dataChannel.onclose = function(){ 
				that.dataChannelStateChange();
			}
		}
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
		this.connection.addIceCandidate(candidate);
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
  			that.dataChannel = event.channel;
  			that.dataChannel.binaryType = 'arraybuffer';
			that.dataChannel.onmessage = function(){ 
				that.message(); 
			}
			that.dataChannel.onopen = function(){ 
				that.dataChannelStateChange();
			}
			that.dataChannel.onclose = function(){ 
				that.dataChannelStateChange();
			}
  		};

	}

	return webrtc;
})();


Factory = function(){
	this.stun = { urls: 'stun:stun.l.google.com:19302' };
	this.servers = { iceServers: this.stun};
	this.DtlsSrtpKeyAgreement = { DtlsSrtpKeyAgreement: true };
	this.optional = { optional: [this.DtlsSrtpKeyAgreement] };
	this.list = [];
}

Factory.prototype.get = function(name){
	if(!this.list[name]){
		this.list[name] = new WebRTC(this.stun, this.optional); 
	}
	return this.list[name];	
}

ShaiiiCDN = (function(){
	function cdn(signal){
		this.factory = new Factory();
		this.signal = signal;
		this.token=[];
		window.sources = {};
		this.listen();
		this.images();
	}

	cdn.prototype.exchangeIce = function(data){
		console.log(data);

		var session = data.session;
		var candidate = data.desc;
		webrtc = this.factory.get(session);
		webrtc.addIce(candidate);
	}

	cdn.prototype.answerHelp = function(data){
		console.log(data);

		var that = this;
		var remoteId = data.id;	
		var session = data.session;
		var blob = window.sources[session];

		webrtc = this.factory.get('p'+session);

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', session:'g'+ session, desc: candidate});
		});

		webrtc.answer(data.desc,
			function(desc){
				that.send(remoteId, {flag:'answer', session: session, desc: desc});
			}
		);

		webrtc.ready(function(channel){
  		 	var reader = new FileReader();
  		 	reader.addEventListener("loadend", function() {
  		 		channel.send(reader.result);
  		 	});
  		 	reader.readAsArrayBuffer(blob);
		});
	}

	cdn.prototype.confirmAnswer = function(data){
		console.log(data);

		var that = this;
		var remoteId = data.id;	
		var session = data.session;

		webrtc = this.factory.get('g'+session);

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', session: 'p'+session, desc: candidate});
		});

		webrtc.setRemoteDescription(data.desc);
	}

	cdn.prototype.saveToken = function(data){
		console.log(data);
		this.token[data.uri] = data.token;
	}

	cdn.prototype.loadFromServer = function(uri){
		console.log('load from server:'+(Date.now() - begin));
		var oReq = new XMLHttpRequest();
		oReq.open("GET", uri, true);
		oReq.responseType = "blob";
			
		oReq.onload = function(oEvent) {
	  		blob = oReq.response;
			new Hash(blob);
			window.sources[uri] = blob;
	  		var url = URL.createObjectURL(blob); 
	  		document.querySelector('img[shaiii-cdn="'+uri+'"]').src = url;
			console.log('loaded pic:'+(Date.now() - begin));
		}
		oReq.send();
	}

	cdn.prototype.listen = function(){
		var that = this;
		this.signal.on('help', function(data){that.answerHelp(data)});
		this.signal.on('token', function(data){that.saveToken(data)});
		this.signal.on('answer', function(data){that.confirmAnswer(data)});
		this.signal.on('ice', function(data){that.exchangeIce(data)});
		this.signal.on('loadFromServer', function(data){ that.loadFromServer(data)});
	}

	cdn.prototype.send = function(to, msg){
		data = {to: to, session: msg.session, desc: msg.desc}; 
		this.signal.emit(msg.flag, data);	
	}

	cdn.prototype.get = function(resource){
		var webrtc = this.factory.get('g'+resource);
		var that = this;
  		var receiver = new Receiver(resource); 
		webrtc.offer(function(desc){
			that.send('all', {flag:'help', session: resource, desc: desc});
		});

		webrtc.ready(function(channel){
  			channel.onmessage = function (event) {
  				console.log('receive first byte:'+Date.now());
  				receiver.receive(event.data);
  			};
		});
	}

	cdn.prototype.images = function(){
		var that = this;
		document.addEventListener("DOMContentLoaded", function(event) {
			imgs = document.querySelectorAll("img[shaiii-cdn]");
			for(i=0; i<imgs.length; i++){
				src = imgs[i].getAttribute('shaiii-cdn');
				that.get(src);
			}
		});	
	}
	return cdn;
})();

cdn = new ShaiiiCDN(tracker);
