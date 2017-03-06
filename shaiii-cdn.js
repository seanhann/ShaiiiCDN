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

WebRTC = (function(){
	function webrtc(stun, optional){
		this.stun = stun;
		this.optional = optional;
		this.init();
	}

	webrtc.prototype.init = function(){
		if(!this.connection){
			this.connection = new RTCPeerConnection(this.stun, this.optional);
		}
	}
	
	webrtc.prototype.dataChannelStateChange = function(){
  		var readyState = sendChannel.readyState;
  		console.log('Send channel state is: ' + readyState);
	}

	webrtc.prototype.message = function(){
  		console.log('receive first byte:'+Date.now());
	}

	webrtc.prototype.error = function(error){
		console.log(error);
	}

	webrtc.prototype.offer = function(fn){
		if(!this.dataChannel){
			dataChannel = this.connection.createDataChannel('dataChannel');
			dataChannel.binaryType = 'arraybuffer';
			dataChannel.onopen = this.dataChannelStateChange;
			dataChannel.onclose = this.dataChannelStateChange;
			dataChannel.onmessage = this.message;
			this.dataChannel=dataChannel; 
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

	webrtc.prototype.answer = function(remoteDesc, blob, answerFun){

  		var rDesc = new RTCSessionDescription(remoteDesc);
  		this.setRemoteDescription(rDesc);
  		this.connection.createAnswer().then(
			function(desc){
				this.connection.setLocalDescription(desc);
				answerFun(desc);
			},
			function(error){
				alert(error);
			}
		);

  		this.connection.ondatachannel = function(event){ 
  			this.dataChannel = event.channel;
  			this.dataChannel.binaryType = 'arraybuffer';
  			this.dataChannel.onmessage = this.message; 
  		};

	}

	webrtc.prototype.send = function(blob){
		 var channel = this.dataChannel;
  		 var reader = new FileReader();
  		 reader.addEventListener("loadend", function() {
  		 	channel.send(reader.result);
  		 });
  		 reader.readAsArrayBuffer(blob);
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

	cdn.prototype.answerHelp = function(data){
		console.log(data);

		var that = this;
		var remoteId = data.id;	
		var resource = data.uri;

		webrtc = this.factory.get(resource);

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', uri: resource, candidate: candidate});
		});

		webrtc.offer(data.desc,
			function(desc){
				that.send(remoteId, {flag:'answer', uri: resource, desc: desc});
			}
		);

		webrtc.send(window.resource[resource]);
	}

	cdn.prototype.confirmAnswer = function(data){
		console.log(data);

		var that = this;
		var remoteId = data.id;	
		var resource = data.uri;

		webrtc = this.factory.get(resource);

		webrtc.ice(function(candidate){
			that.send(remoteId, {flag:'ice', uri: resource, candidate: candidate});
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
		this.signal.on('help', this.answerHelp);
		this.signal.on('token', this.saveToken);
		this.signal.on('answer', this.confirmAnswer);
		this.signal.on('ice', this.exchangeIce);
		this.signal.on('loadFromServer', this.loadFromServer);
	}

	cdn.prototype.send = function(to, msg){
		data = {to: to, session: msg.uri, desc: msg.desc}; 
		this.signal.emit(msg.flag, data);	
	}

	cdn.prototype.get = function(resource){
		webrtc = this.factory.get(resource);
		var that = this;
		webrtc.offer(function(desc){
			that.send('all', {flag:'help', uri: resource, desc: desc});
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
