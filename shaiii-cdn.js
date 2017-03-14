var begin = Date.now();
var debug = null;
console.log('begin:'+begin);

var tracker = io.connect('http://shaiii.com:8080/'+window.location.href);

Hash = (function(){
	function hash(blob){
		this.blob = blob;
	}

	hash.prototype.verify = function(fn){
		var reader = new FileReader();
		reader.onloadend = function(evt) {
		  	if (evt.target.readyState == FileReader.DONE) { // DONE == 2
		  	  	var wordArray = CryptoJS.lib.WordArray.create(evt.target.result);
		  	  	var hash = CryptoJS.SHA3(wordArray, { outputLength: 224});
				fn(hash.toString(CryptoJS.enc.Hex));
		  	}
		};
		reader.readAsArrayBuffer( this.blob );
	}
	return hash;
})();

var Receiver = (function(){

	function receiver(uri, token){
		this.uri = uri;
		this.token = token;
		this.buffer = [];
	}

	receiver.prototype.receive = function(data){
		this.buffer.push(data);	
		if(data.byteLength != 65664){
			var that = this;
			var received = new window.Blob(this.buffer);
			this.buffer = [];

			window.sources[this.uri] = received;

			/*
			url= URL.createObjectURL(received);
			document.querySelector('img[shaiii-cdn="'+that.uri+'"]').src = url;
			*/
			var hash = new Hash(received);
			hash.verify(function(hex){
				//if(hex == that.token){
					url= URL.createObjectURL(received);
					document.querySelector('img[shaiii-cdn="'+that.uri+'"]').src = url;
					console.log('show pic:'+Date.now());
				//}
			});
		}
	}
	return receiver;		
})();

WebRTC = (function(){
	function webrtc(stun, optional){
		this.dataChannel = {};
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
	
	webrtc.prototype.dataChannelStateChange = function(name){
  		var readyState = this.dataChannel[name].readyState;
		if(readyState == 'open'){
			if(this.closure) this.closure(this.dataChannel[name]);		
		}
  		console.log( this.dataChannel[name].label +'channel state is: ' + readyState);
	}

	webrtc.prototype.error = function(error){
		console.log(error);
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

			console.log('answer channel:'+name);

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
		this.token=[];
		this.listen();
	}

	cdn.prototype.send = function(to, msg){
		data = {to: to, session: msg.session, desc: msg.desc}; 
		this.signal.emit(msg.flag, data);	
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
		console.log('init: remoteId '+data.id);
		var remoteId = data.id;

		this.help(remoteId);
	
		this.token[data.uri] = data.token;
	}

	cdn.prototype.exchangeIce = function(data){
		console.log('exchangeIce:' + data);

		var session = data.session;
		var candidate = data.desc;
		webrtc = this.factory.get(session);
		webrtc.addIce(candidate);
	}

	cdn.prototype.help = function(remoteId){
		var id = Date.now();
		var webrtc = this.factory.get(id);
		var that = this;

		console.log('new webrtc:'+id);
		debug = webrtc;
	
		imgs = document.querySelectorAll("img[shaiii-cdn]");
		for(i=0; i<imgs.length; i++){
			src = imgs[i].getAttribute('shaiii-cdn');
			webrtc.createChannel(src);
		}

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', session: id, desc: candidate});
		});

		webrtc.offer(function(desc){
			that.send(remoteId, {flag:'help', session: id, desc: desc});
		});
		
		webrtc.ready(function(channel){
			var name = channel.label;
			var token = that.token[name];
  			var receiver = new Receiver(name, token); 
  			channel.onmessage = function (event) {
  				console.log('receive first byte:'+Date.now());
  				receiver.receive(event.data);
  			};
		});
	}

	cdn.prototype.answerHelp = function(data){
		console.log('answer for:'+data.id);

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
			var blob = window.sources[name];
  		 	var reader = new FileReader();
  		 	reader.addEventListener("loadend", function() {
  		 		channel.send(reader.result);
  		 	});
			if(blob){
  		 		reader.readAsArrayBuffer(blob);
			}else{
				channel.close();
			}
		});
	}

	cdn.prototype.confirmAnswer = function(data){
		console.log('confirm answer:'+data.id);

		var that = this;
		var remoteId = data.id;	
		var session = data.session;

		webrtc = this.factory.get(session);
		webrtc.setRemoteDescription(data.desc);
	}

	cdn.prototype.loadFromServer = function(data){
		imgs = document.querySelectorAll("img[shaiii-cdn]");
		for(i=0; i<imgs.length; i++){
			src = imgs[i].getAttribute('shaiii-cdn');
			this.loadUri(src);
		}
	}

	cdn.prototype.loadUri = function(uri){
		console.log('load from server:'+(Date.now() - begin));
		var oReq = new XMLHttpRequest();
		oReq.open("GET", uri, true);
		oReq.responseType = "blob";
			
		oReq.onload = function(oEvent) {
	  		blob = oReq.response;
			window.sources[uri] = blob;
	  		var url = URL.createObjectURL(blob); 
	  		document.querySelector('img[shaiii-cdn="'+uri+'"]').src = url;
			console.log('loaded pic:'+(Date.now() - begin));
		}
		oReq.send();
	}


	return cdn;
})();

try{
	document.addEventListener("DOMContentLoaded", function(event) {
		cdn = new ShaiiiCDN(tracker);
	});
} catch(e) {
	console.log(e);
}
