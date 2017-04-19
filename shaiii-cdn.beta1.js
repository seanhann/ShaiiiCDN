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

	var EVENTS = {'INIT':'init', 'COMMIT':'commit', 'HTTPLOAD': 'http', 'PREPARE': 'prepare', 'WEBRTC': 'webrtc'};
	var FLAG = {'OFFER':0, 'ANSWER':1 ,'CONFIRM':2 ,'CLOSE': 3};
	

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
	                this.request.onsuccess = function(event) {
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
	  			log.write('receive byte:'+event.data.byteLength);
	  			that.receive(event.data);
	  		};
	
			this.channel.onclose = function(event){
				if(! that.success){
					if(that.error) that.error(event);
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
			this.bufferedSize += data.byteLength;
			if(this.bufferedSize == this.size){
				log.write('loaded pic');
				var that = this;
	
			  	var wordArray = CryptoJS.lib.WordArray.create(this.buffer);
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
		
		webrtc.prototype.dataChannelStateChange = function(name){
	  		var readyState = this.dataChannel[name].readyState;
	  		log.write('data channel '+ this.dataChannel[name].label +' is: ' + readyState );
	
			if(readyState == 'open'){
				if(this.closure) this.closure(this.dataChannel[name]);
			}else if(readyState == 'closed'){
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

	var Factory = function(){
		//this.stun = { urls: 'stun:stun.l.google.com:19302' };
		this.stun = { urls: 'stun:turn.shaiii.com:3478', 'credential': 'hjxhlk@123', 'username': 'shaiii' };
		this.turn = { urls: 'turn:turn.shaiii.com:3478', 'credential': 'hjxhlk@123', 'username': 'shaiii' };
		this.servers = { iceServers: [this.stun]};
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
		function peer(signal){
			this.id = Date.now();
			this.factory = new Factory();
			this.signal = signal;
			this.token={};
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
				}	
			});
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

			var that = this;
			var id = Date.now();
			var webrtc = this.factory.get(id);
			for(i=0; i<len; i++){
				//src = images[i].getAttribute('shaiii-cdn');
				webrtc.createChannel(images[i]);
			}

			webrtc.offer(function(desc){
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

			return id;
		}

		peer.prototype.answer = function(data){
			log.write('answer');

			var that = this;
			var session = data.session;

			webrtc = this.factory.get(session);

			webrtc.ice(function(candidate){
				that.send({flag: FLAG.ICE, session: session, desc: candidate});
			});

			webrtc.answer(data.desc,
				function(desc){
					that.send({flag:FLAG.ANSWER, session: session, desc: desc});
				}
			);

			webrtc.ready(function(channel){
				var name = channel.label;
		  		var res = document.querySelector('[shaiii-cdn="'+name+'"]');
				var chunkSize = 65536; //1024 * 64; //16384;//1024*32;
				if(res){
					var sender = new Sender(channel, chunkSize);
					sender.send(res.src);
				}else{
					channel.close();
				}
			});
		}
		peer.prototype.confirm = function(data){
			log.write('confirm');

			var that = this;
			var session = data.session;

			webrtc = this.factory.get(session);
			webrtc.setRemoteDescription(data.desc);
		}

		return peer;

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
		function cdn(signal){
			if(window.RTCPeerConnection){
				this.signal = signal;
				this.listen();
				this.factory = new Factory();
				this.db = new MyDB('ShaiiiCDN', 'images');
				this.peer = new Peer(signal);
				this.token={};
				this.resource = {};
			}else{
				this.notSupport();
			}
		}
		
		cdn.prototype.listen = function(){
			var that = this;
			this.signal.on(EVENTS.INIT,  function(data){that.init(data)});
			this.signal.on(EVENTS.HTTPLOAD, function(data){
				var srcs = [];
				document.querySelectorAll("[shaiii-cdn]").forEach(function(img){
					srcs.push( img.getAttribute('shaiii-cdn') );
				});
				that.loadFromServer(srcs);
			});

			this.signal.on('connect_error', function() {
				var srcs = [];
				document.querySelectorAll("[shaiii-cdn]").forEach(function(img){
					srcs.push( img.getAttribute('shaiii-cdn') );
				});
				that.loadFromServer(srcs);
			});
		}

		cdn.prototype.send = function(flag, data){
			this.signal.emit(flag, data);	
		}

		cdn.prototype.getCache = function(){
			var that = this;
			this.db.get('*', function(data){
				var len = data.length;
				for(i=0; i<len; i++){
					var cache = data[i];
					if(cache && that.token[cache.id] && (cache.token == that.token[cache.id].hash)){
						that.showBlob(cache.id, cache.blob);
					} 
				}
			});	
		}

		cdn.prototype.init = function(data){
			log.write('init');
			this.token = data.token;
			var prepare=[], img=[];
			imgs = document.querySelectorAll("[shaiii-cdn]");
			for(i=0; i<imgs.length; i++){
				src = imgs[i].getAttribute('shaiii-cdn');
				if(this.token && this.token[src]){
					img.push(src);
				}else{
					prepare.push(src);
				}
			}
			if(img.length > 0) this.get(img);
			if(prepare.length > 0) this.loadFromServer(prepare);
		}
		cdn.prototype.get = function(imgs){
			var that = this;
			var session = this.peer.get(imgs, function(channel){
				var name = channel.label;
				var token = that.token[name];
  				var receiver = new Receiver(channel, token);
				receiver.ready(function(received){
					that.showBlob(name, received);
					that.db.add({id:name, token: token.hash, blob: received});
					channel.close();
					log.write(name + ' closed correctly');
				});

				receiver.error(function(event){
					var src = event.target.label;
					var http = new HTTP(src);
					http.get(function(e){
						var src = this.uri;
						var blob = e.target.response;
						that.showBlob(src, blob);
					});
				});

			});
			this.resource[session] = [];
			for(key in imgs){
				this.resource[session][imgs[key]] = 1;
			}
		}

		cdn.prototype.loadFromServer = function(imgs){
			log.write('load from http');
			var prepare = [];
			var that = this;
			for(i=0; i<imgs.length; i++){
				var http = new HTTP(imgs[i]);
				http.get(function(e){
					var src = this.uri;
					var blob = e.target.response;
					that.showBlob(src, blob);
				});
				prepare.push(imgs[i]);
			}
			this.send(EVENTS.PREPARE, prepare);
		}

		cdn.prototype.showBlob = function(src, blob){
	  		var bUrl = URL.createObjectURL(blob); 
			document.querySelectorAll('[shaiii-cdn="'+src+'"]').forEach(function(img){
				img.src = bUrl;
			});

			//Need more effort to perfect
			var loaded = document.querySelectorAll('[shaiii-cdn][src]');
			for(session in this.resource){
				if( this.resource[session].length <= loaded.length ){
					var commited = 0; 
					for(i=0; i<loaded.length; i++){
						if( this.resource[session][ loaded[i].getAttribute('shaiii-cdn') ] ) commited++;
					}
					if(commited == Object.keys(this.resource[session]).length){
						this.send(EVENTS.COMMIT, session);
						delete this.resource[session];
					}
				}
			}
		}

		cdn.prototype.notSupport = function(){
			tracker.disconnect();
			imgs = document.querySelectorAll("[shaiii-cdn]");
			for(i=0; i<imgs.length; i++){
				imgs[i].src = imgs[i].getAttribute('shaiii-cdn');
			}
		}

		return cdn;
	})();

document.onreadystatechange = function () {
  var state = document.readyState;
  if (state == 'complete') {
	var shaiiiCdn = new ShaiiiCDN(tracker);
  }
};
