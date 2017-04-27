;(function(){	
	var tracker = io.connect('http://shaiii.com:8080/', {reconnection: false});
	var Log = (function(){
		function log(show){
			this.begin = Date.now();
			this.show = show;
		}
	
		log.prototype.write = function(str){
			var now = Date.now();
			if(this.show) console.log(str+'\t'+(now - this.begin) +'\t' + Date.now());
		}
		return log;
	})();

	var log = new Log(true);

	var EVENTS = {'INIT':'init', 'COMMIT':'commit', 'HTTPLOAD': 'http', 'PREPARE': 'prepare', 'WEBRTC': 'webrtc', 'PEERLOST': 'peerlost'};
	var FLAG = {'OFFER':0, 'ANSWER':1 ,'CONFIRM':2 ,'CLOSE': 3};
	var PROCESS = {'Wait':0, 'peerBegin':1, 'cacheBegin':2, 'httpBegin':3, 'Done':4};
	

	var MyDB = (function(){
	        function db(database, table){
	                this.indexedDB = window.indexedDB || window.mozIndexedDB || window.webkitIndexedDB || window.msIndexedDB;
	                this.IDBTransaction = window.IDBTransaction || window.webkitIDBTransaction || window.msIDBTransaction;
	                this.database = database;
	                this.table = table;
	                this.request = null;
	                this.db = null;
	                this.objectStore = null;
	                this.errorFn = null;
	                this.init();
	        }
	        db.prototype.error = function(fn){
	                this.errorFn = fn;
	        }
	        db.prototype.dropDB = function(name){
	                this.indexedDB.deleteDatabase(name);
	        }
	        db.prototype.dropTable = function(name){
	                this.db.deleteObjectStore(name);
	        }
	        db.prototype.init = function(){
	                var that = this;
	                this.request = this.indexedDB.open(this.database);
	                this.request.onerror = function(event) {
	                        if(that.errorFn) that.errorFn(event);
	                };
	                this.request.onupgradeneeded = function(event) {
	                        mydb= event.target.result;
	                        if(!mydb.objectStoreNames.contains(that.table)) {
	                            var objectStore = mydb.createObjectStore(that.table, {keyPath: "id"});
	                            objectStore.createIndex("idIndex", "id", { unique: true });                             
	                        }
	                }
	        }
	        db.prototype.add = function(data){
	                //this.objectStore.delete(data.src);
			var that = this;
	                this.request = this.indexedDB.open(this.database);
	                this.request.onsuccess = function(event) {
	                        var db = event.target.result;;
	                	var transaction = db.transaction([that.table], 'readwrite');
	                	transaction.onerror = function(event) {
	                	        if(that.errorFn) that.errorFn(event);
	                	};
	                	var objectStore = transaction.objectStore(that.table);
	                	objectStore.delete(data.id);
	                	objectStore.add(data);
			}
	        }
	        db.prototype.get = function(key, fn){
	                var that = this;
	                this.request = this.indexedDB.open(this.database);
			this.st = setTimeout(function(){ 
				that.errorFn(); 
			}, 50);
	                this.request.onsuccess = function(event) {
				clearTimeout(that.st);
	                        var db = event.target.result;;
	                	var transaction = db.transaction([that.table], 'readwrite');
	                	transaction.onerror = function(event) {
	                	        if(that.errorFn) that.errorFn(event);
	                	};
	                	var objectStore = transaction.objectStore(that.table);
				if(key == '*'){
	                		var records = objectStore.getAll();
				}else{
	                		var records = objectStore.get(key);
				}
	                	records.onerror = function(event) {
	                	        if(that.errorFn) that.errorFn(event);
	                	};
	
	                	records.onsuccess = function(event){
	                	        fn(event.target.result);
	                	}
	                };
			this.request.onerror = function(){
				that.errorFn();
			}
			this.request.onblocked = function(){
				that.errorFn();
			}
	        }
	        return db;
	})();


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
			    function sendQ(i, debug){
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
				var bUrl = e.data.blobUrl;
			        xhr.open('GET', bUrl, true);
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
						new Promise(function(resolve){ setTimeout(resolve, 50) });
					}
				}
				this.running = false;
			}
		}
	
		sender.prototype.send = function(blob){
			var that = this;
			this.blob = blob;
			
			var worker = this.worker();
			worker.onmessage = function(e){
				that.Q(e.data);
			}
			worker.postMessage({blobUrl: this.blob, chunkSize: this.chunkSize});
			log.write('start worker '+this.channel.label);
		}
	
		return sender;
	})();
	
	var Receiver = (function(){
	
		function receiver(channel, chunkSize, security){
			this.channel = channel;
			this.chunkSize = chunkSize;
			this.uri = channel.label;
			this.token = security ? security.hash:null;
			this.size = security ? security.size:null;
			this.bufferedSize = 0;
			this.buffer = [];
			this.success = false;
			this.init();
		}
	
		receiver.prototype.init = function(){
			var that = this;	
	  		this.channel.onmessage = function (event) {
	  			log.write('receive byte:'+event.data.byteLength);
	  			that.receive(event.data);
	  		};
			this.channel.closeFn.push(function(event){
				if(! that.success){
					if(that.error) that.error(event);
				}
			});
	
		}
	
		receiver.prototype.ready = function(closure){
			this.closure = closure;
		}
	
		receiver.prototype.error = function(closure){
			this.error = closure;
		}
	
		receiver.prototype.receive = function(data){
			if(!this.dataLen) this.dataLen = data.byteLength;
			this.buffer.push(data);
			this.bufferedSize += data.byteLength;
			if(this.bufferedSize == this.size){
				log.write('loaded pic');
				var tokenBuffer = [];
				if(this.chunkSize != data.byteLength){
					var i,len=this.buffer.length,chunk = this.chunkSize/this.dataLen;
					for (i=0; i<len; i+=chunk) {
						tokenBuffer.push( this.buffer.slice(i,i+chunk) );
					}
				}else{
					tokenBuffer = this.buffer;
				}

			  	var wordArray = CryptoJS.lib.WordArray.create(tokenBuffer);
			  	var hash = CryptoJS.SHA3(wordArray, { outputLength: 224});
				var token = hash.toString(CryptoJS.enc.Hex);
	
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
				this.channel.close();
			}
		}
		return receiver;		
	})();


	var WebRTC = (function(){
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
					log.write('webrtc connection state: '+that.connection.iceConnectionState);
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
		
		webrtc.prototype.error = function(closure){
			this.errorClosure = closure;
		}

		webrtc.prototype.iceDone = function(closure){
			this.iceDoneClosure = closure;
		}

		webrtc.prototype.dataChannelStateChange = function(name){
			if(this.dataChannel[name]){
	  			var readyState = this.dataChannel[name].readyState;
	  			log.write('data channel '+ this.dataChannel[name].label +' is: ' + readyState );

				if(readyState == 'open'){
					if(this.closure) this.closure(this.dataChannel[name]);
				}else if(readyState == 'closed'){
					delete this.dataChannel[name];
					if(Object.keys(this.dataChannel).length == 0) this.connection.close();
				}
			}
		}
	
		webrtc.prototype.createChannel = function(name){
			var that = this;	 
			this.dataChannel[name] = this.connection.createDataChannel(name, {ordered:true});
			this.dataChannel[name].binaryType = 'arraybuffer';
			this.dataChannel[name].onopen = function(){ 
				that.dataChannelStateChange(name);
			}
			this.dataChannel[name].closeFn = []; 
			this.dataChannel[name].onclose = function(event){
				if(that.dataChannel[name]) 
				for(fn in that.dataChannel[name].closeFn){
					that.dataChannel[name].closeFn[fn](event);	
				}
				that.dataChannelStateChange(name);
			}
		}

		webrtc.prototype.clear = function(){
			log.write('webrtc clear');
			for(name in this.dataChannel){
				this.dataChannel[name].close();	
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
			var that = this;
			this.connection.onicecandidate = function(e){
				if(e.candidate){
					iceFun(e.candidate);	
				}else{
					if(that.iceDoneClosure) that.iceDoneClosure();
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

	var Factory = function(){
		//this.stun = { urls: 'stun:stun.l.google.com:19302' };
		this.stun = { urls: 'stun:turn.shaiii.com:3478', 'credential': 'hjxhlk@123', 'username': 'shaiii' };
		this.turn = { urls: 'turn:turn.shaiii.com:3478', 'credential': 'hjxhlk@123', 'username': 'shaiii' };
		this.servers = { iceServers: [this.stun], iceCandidatePoolSize: 5};
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

	var Peer = (function(){
		function peer(optional){
			this.id = Date.now();
			this.factory = new Factory();
			this.signal = optional.signal;
			this.timeout = optional.timeout ? optional.timeout : 500;
			this.chunkSize = optional.chunkSize ? optional.chunkSize : 65536;
			this.token={};
			this.st={};
			this.listen();
		}

		peer.prototype.listen = function(){
			var that = this;

			this.signal.on(EVENTS.WEBRTC, function(data){
				if(data.flag == FLAG.OFFER){
					that.answer(data);
				}else if(data.flag == FLAG.ANSWER){
					that.confirm(data);
				}else if(data.flag == FLAG.ICE){
					that.exchangeIce(data);
				}else if(data.flag == FLAG.CLOSE){
					console.log('close webrtc');
				}	
			});
		}

		peer.prototype.close = function(closure){
			this.closeClosure = closure;
		}

		peer.prototype.send = function(data){
			this.signal.emit(EVENTS.WEBRTC, data);	
		}

		peer.prototype.exchangeIce = function(data){
			log.write('exchangeIce:');

			var session = data.session;
			var candidate = data.desc;
			webrtc = this.factory.get(session);
			webrtc.addIce(candidate);
		}

		peer.prototype.get = function(images, readyClosure){
			var len = images.length;
			if(len ==  0) return;

			log.write('get webrtc');
			var that = this;
			var id = Date.now();
			console.log('peer id'+id);
			var webrtc = this.factory.get(id);

			for(i=0; i<len; i++){
				//src = images[i].getAttribute('shaiii-cdn');
				webrtc.createChannel(images[i]);
			}
			log.write('created channel');

			webrtc.offer(function(desc){
				log.write('created offer');
				that.send({flag:FLAG.OFFER, session: id, desc: desc});
				log.write('send offer:');
			});

			webrtc.ice(function(candidate){
				that.send({flag:FLAG.ICE, session: id, desc: candidate});
				log.write('send ice:');
			});

			webrtc.ready(function(channel){
				if(readyClosure) readyClosure(channel);
			});

			webrtc.close(function(){
				log.write('webrtc close');
				if(that.closeClosure) that.closeClosure(id);
			});

			webrtc.error(function(){
				log.write('webrtc error');
				if(that.closeClosure) that.closeClosure(id);
			});


			this.st[id] = setTimeout(function(){
				webrtc.clear();
			}, this.timeout);

			return id;
		}

		peer.prototype.answerReady = function(answerReadyClosure){
			this.answerReadyClosure = answerReadyClosure;
		}

		peer.prototype.answer = function(data){
			log.write('answer');

			var that = this;
			var session = data.session;

			webrtc = this.factory.get(session);

			webrtc.ice(function(candidate){
				that.send({flag: FLAG.ICE, session: session, desc: candidate});
				log.write('send ice:');
			});

			webrtc.answer(data.desc,
				function(desc){
					that.send({flag:FLAG.ANSWER, session: session, desc: desc});
				}
			);

			webrtc.ready(function(channel){
				if(that.answerReadyClosure) that.answerReadyClosure(channel);
			});
		}
		peer.prototype.confirm = function(data){
			log.write('confirm');

			var that = this;
			var session = data.session;

			clearTimeout(this.st[session]);

			webrtc = this.factory.get(session);
			webrtc.setRemoteDescription(data.desc);
		}

		return peer;

	})();
	
	var PlaceHolder = (function(){
		function holder(option){
			this.c = document.createElement('canvas');
			if(option){
				if(option.background) this.fillStyle = option.background;
				if(option.text) this.text = option.text;
			}
		}

		holder.prototype.get = function(width, height){
			this.c.width = width;
                	this.c.height = height;

			var ctx = this.c.getContext("2d");

                	ctx.fillStyle =  this.fillStyle ? this.fillStyle : '#ffffff';
                	ctx.fillRect(0,0,width,height);

			txt = this.text ? this.text : 'LOADING...';
			fontSize = (width < height ? width:height)/10;
			ctx.font =  fontSize+"px Arial";
			ctx.fillStyle = '#cecece';
			var fontWidth = ctx.measureText(txt).width;
			var x = width/2 - fontWidth/2;
			var y = height/2 - fontSize/2;
			ctx.fillText(txt, x, y);

			return this.c.toDataURL('image/jpeg');
		}

		return holder;
	})();

	var HTTP = (function(){
		function http(uri){
			this.uri = uri;
			this.oReq = new XMLHttpRequest();
		}

		http.prototype.get = function(callback){
			this.callback = callback;
			this.oReq.open("GET", this.uri, true);
			this.oReq.responseType = "blob";
				
			var that = this;
			this.oReq.onload = function(oEvent) {
				if(oEvent.target.status == 200) that.callback(oEvent);
			}
			this.oReq.send();

		}
		return http;
	})(); 

	var ShaiiiCDN = (function(){
		function cdn(option){
			this.resource = {};
			this.htmlElements={};
			if(window.RTCPeerConnection && option.signal){
				this.signal = option.signal;
				this.cache = (option.cache == null ? 1 : (option.cache ? 1:0));
				this.chunkSize = 65536;
				this.db = new MyDB('ShaiiiCDN', 'images');
				this.peer = new Peer({signal: this.signal, timeout: option.timeout, chunkSize: this.chunkSize});
				this.listen();
				this.holder = new PlaceHolder();
				this.token={};
				this.sessions = {};
			}else{
				this.noSupport = true;
			}
		}
		
		cdn.prototype.listen = function(){
			var that = this;
			this.signal.on(EVENTS.INIT,  function(data){that.init(data)});
			this.signal.on(EVENTS.HTTPLOAD, function(data){
				that.loadFromServer();
			});

			this.signal.on(EVENTS.PEERLOST, function() {
				log.write('peer lost');
				that.bestGet(2);	
			});

			this.signal.on('connect_error', function() {
				that.loadFromServer();
			});

			this.peer.answerReady(function(channel){
				var name = channel.label;
				var blobUrl = that.htmlElements[name] && that.htmlElements[name][0] ? that.htmlElements[name][0].src : false;
				var chunkSize = that.chunkSize; //65536; //1024 * 64; //16384;//1024*32;
				if(blobUrl){
					var sender = new Sender(channel, chunkSize);
					sender.send(blobUrl);
				}else{
					channel.close();
				}
			});

			window.onbeforeunload = function(){
				that.signal.close();
				that.close();
			}
		}

		cdn.prototype.send = function(flag, data){
			this.signal.emit(flag, data);	
		}

		cdn.prototype.getCache = function(images){
			var that = this;
			this.db.error(function(){
				that.peerGet(images);
			});
			this.db.get('*', function(data){
				var len = data.length;
				var diff = [];
				for(var i=0; i<len; i++){
					var cache = data[i];
					if(cache && that.token[cache.id] && (cache.token == that.token[cache.id].hash)){
						that.showBlob(cache.id, cache.blob);
					} 
				}
				that.bestGet(0);
			});	
		}

		cdn.prototype.init = function(data){
			log.write('init');
			this.token = data.token;
			var images = [];
	
			if(Object.keys(this.resource).length == 0)	
			for(src in this.token){
				this.resource[src] = PROCESS.Wait;
			}

			this.bestGet(this.cache);
		}

		cdn.prototype.get = function(imgs){
			var images=[];
			for(i=0; i<imgs.length; i++){
				src = imgs[i].getAttribute('shaiii-cdn');
				if(this.resource[ src ] == null) this.resource[ src ] = PROCESS.Wait;
				if(this.htmlElements[ src ] == null) this.htmlElements[ src ] = [];
				this.htmlElements[ src ].push(imgs[i]);
			}

			if(this.noSupport){
				this.notSupport();
			}else if(Object.keys(this.token).length){
				this.bestGet(this.cache);
			}
		}

		cdn.prototype.bestGet = function(cache){
			var imgs = [];
			if(cache == 2){
				for(src in this.resource){
					if(this.resource[src] < PROCESS.httpBegin){
						imgs.push(src);
						this.resource[src] = PROCESS.httpBegin;
					}
				}
				this.httpGet(imgs);
			}else if(cache == 1){
				for(src in this.resource){
					if(this.resource[src] < PROCESS.cacheBegin){
						imgs.push(src);
						this.resource[src] = PROCESS.cacheBegin;
					}
				}
				this.getCache(imgs);
			}else{
				for(src in this.resource){
					if(this.resource[src] <= PROCESS.cacheBegin){
						imgs.push(src);
						this.resource[src] = PROCESS.peerBegin;
					}
				}
				this.peerGet(imgs);
			}
		}

		cdn.prototype.httpGet = function(src){
			log.write('http get');
			var that = this;
			var len = src.length;

			for(i=0; i<len; i++){
				var http = new HTTP(src[i]);
				http.get(function(e){
					var src = this.uri;
					var blob = e.target.response;
					that.showBlob(src, blob);
				});
			}
		}

		cdn.prototype.peerGet = function(imgs){
			log.write('peer get');
			var that = this;

			var session = this.peer.get(imgs, function(channel){
				var name = channel.label;
				var token = that.token[name];
  				var receiver = new Receiver(channel, that.chunkSize, token);
				receiver.ready(function(received){
					that.showBlob(name, received);
					that.db.add({id:name, token: token.hash, blob: received});
					log.write(name + ' closed correctly');
				});

				receiver.error(function(event){
					var src = event.target.label;
					that.httpGet([src]);
				});

			});

			this.sessions[session] = imgs;

			this.peer.close(function(session){
				log.write('session close');
				that.bestGet(2);
			});
		}

		cdn.prototype.check = function(){
			if(Object.keys(this.sessions).length > 0){
				for(session in this.sessions){
					var len = this.sessions[session].length, count=0;
					for(i=0; i<len; i++){
						if(this.resource[ this.sessions[session][i] ]  == PROCESS.Done){
							count++;
						}else{
							break;
						}
					}

					if(len == count){
						this.send(EVENTS.COMMIT, session);
						delete this.sessions[session];
						console.log('session commit');
					}
				}
			}else{
				var commit = true;
				for(key in this.resource){
					if(this.resource[key] != PROCESS.Done){
						commit = false;
						break;
					}
				}
				if(commit){
					this.send(EVENTS.COMMIT, '');
					console.log('http commit');
				}
			}
		}

		cdn.prototype.setHolder = function(imgs){
			var that = this;
			var len = imgs.length;
			for(i=0; i<len; i++){
				src = imgs[i];
				document.querySelectorAll('[shaiii-cdn="'+src+'"]').forEach(function(img){
					img.src = that.holder.get(that.token[src].width, that.token[src].height);
				});
			}
		}

		cdn.prototype.loadFromServer = function(){
			log.write('load from server');
			var that = this;
			var prepare = [];
			imgs = document.images;
			var len = imgs.length;
			for(var i=0; i<len; i++){
				src = imgs[i].getAttribute('shaiii-cdn');
				if(src){
					prepare.push(src);
					if(this.resource[ src ] == null) this.resource[ src ] = PROCESS.Wait;
					if(!this.htmlElements[src]) this.htmlElements[src] = [];
					this.htmlElements[ src ].push(imgs[i]);
				}
			}
			this.httpGet(prepare);
			this.send(EVENTS.PREPARE, prepare);
		}

		cdn.prototype.showBlob = function(src, blob){
	  		var bUrl = URL.createObjectURL(blob);
			var len = this.htmlElements[src].length;
			for(var i=0; i<len; i++){
				this.htmlElements[src][i].src = bUrl;
			}		
			this.resource[src] = PROCESS.Done;
			this.check();
		}

		cdn.prototype.notSupport = function(){
			tracker.disconnect();
			for(src in this.htmlElements){
				var len = this.htmlElements[src].length;
				for(i=0; i<len; i++){
					this.htmlElements[src][i].src = src;
				}		
			}
		}

		cdn.prototype.close = function(){
			var rtcs = this.peer.factory.list;
			for(var key in rtcs){
				rtcs[key].connection.close();
			}
		}

		return cdn;
	})();

	var shaiiiCdn = new ShaiiiCDN({signal: tracker, cache: true, timeout: 500});

	document.onreadystatechange = function () {
		var state = document.readyState;
		if (state == 'complete') {
			imgs = document.querySelectorAll('img[shaiii-cdn]');
			shaiiiCdn.get(imgs);
		}
	};
})();
