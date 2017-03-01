var tracker = io.connect('http://shaiii.com:8080');

var buket;

var sendChannel;

var resource = [];
var STUN = { urls: 'stun:stun.l.google.com:19302' };
var servers = { iceServers: STUN};
var DtlsSrtpKeyAgreement = {
   DtlsSrtpKeyAgreement: true
};
var optional = {
   optional: [DtlsSrtpKeyAgreement]
};

localConnections = remoteConnections = {};

tracker.emit('domain', window.location, function (domain, id) {
     buket = io.connect('http://shaiii.com:8080/'+domain);

     buket.on('connect', function(){
	imgs = document.querySelectorAll("img[shaiii-cdn]");
	for(i=0; i<imgs.length; i++){
		src = imgs[i].getAttribute('shaiii-cdn');
		offer(src);
	}	
     });

     buket.on('help', function (data) {
      	answer(data);
     });

     buket.on('answer', function (data) {
      	acceptAnswer(data);
     });

     buket.on('ice', function (data) {
      	addIce(data);
     });

     buket.on('loadFromServer', function(uri){
	load(uri);	
     });
});



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

function offer(uri) {
  console.log('startOffer:'+Date.now());
  localConnections[uri] = new RTCPeerConnection(STUN, optional);

  receiver = new Receiver(uri); 

  sendChannel = localConnections[uri].createDataChannel('sendDataChannel');
  sendChannel.binaryType = 'arraybuffer';
  sendChannel.onopen = onSendChannelStateChange;
  sendChannel.onclose = onSendChannelStateChange;
  sendChannel.onmessage = function (event) {
  	console.log('receive first byte:'+Date.now());
	receiver.receive(event.data);
  	//console.log("received: " + event.data);
  };

  localConnections[uri].createOffer().then(
    function(desc){
  	localConnections[uri].setLocalDescription(desc);
	buket.emit('help', uri, desc);	
    },
    function(error){
         console.log(error);
    } 
  );
}

function acceptAnswer(data){
  	localConnections[data.uri].onicecandidate = function(e) {
	      if(e.candidate) buket.emit('ice', {id:data.id, uri:data.uri,flag:0, candidate:e.candidate});
  	};
  	localConnections[data.uri].setRemoteDescription(data.desc);
}

function answer(data){
  id = data.id;
  desc = data.desc;

  remoteConnections[data.uri] = new RTCPeerConnection(STUN, optional);

  remoteConnections[data.uri].onicecandidate = function(e) {
	if(e.candidate) buket.emit('ice',{id: id, uri:data.uri, flag:1, candidate: e.candidate});
  };
  
  desc = new RTCSessionDescription(desc);
  remoteConnections[data.uri].setRemoteDescription(desc);
  remoteConnections[data.uri].createAnswer().then(
    function(desc){
	remoteConnections[data.uri].setLocalDescription(desc);
	buket.emit('answer', id, desc, data.uri);	
    },
    function(error){
	alert(error);
    } 
  );
  remoteConnections[data.uri].ondatachannel = function(event){ 
	receiveChannel = event.channel;
  	receiveChannel.binaryType = 'arraybuffer';
	receiveChannel.onmessage = function(e){
		console.log(e);
        }
	var reader = new FileReader();
	reader.addEventListener("loadend", function() {
	   	//reader.result contains the contents of blob as a typed array
		receiveChannel.send(reader.result);
	});
	reader.readAsArrayBuffer(blob);
  };
}

function addIce(data){
	if(data.flag){
		connection = localConnections[data.uri];
	}else{
		connection = window.remoteConnection;
	}
	//connection = window.localConnection ? window.localConnection : window.remoteConnection;
	connection.addIceCandidate(data.candidate);
}


function onSendChannelStateChange() {
  var readyState = sendChannel.readyState;
  console.log('Send channel state is: ' + readyState);
}


function reDraw(){
	var replaceChars={ "&lt;":"<" , "&gt;":">" };
	html = document.getElementsByTagName('plaintext')[0].innerHTML.replace(/&lt;|&gt;/g,function(match) {return replaceChars[match];});
	document.getElementsByTagName('body')[0].innerHTML = html;
}

var blob;

function load(uri){
	var oReq = new XMLHttpRequest();
	oReq.open("GET", uri, true);
	oReq.responseType = "blob";
	
	oReq.onload = function(oEvent) {
	  blob = oReq.response;
	  var url = URL.createObjectURL(blob); 
	  document.querySelector('img[shaiii-cdn="'+uri+'"]').src = url;
	  /*
	  window.webkitRequestFileSystem(window.TEMPORARY, blob.size, function(localstorage){
  		localstorage.root.getFile("image1", {create: true}, function(DatFile) {
		//blob.close();
  		  DatFile.createWriter(function(DatContent) {
  		    DatContent.write(blob);
	  	    document.querySelector('img').src = DatFile.toURL();
  		  });
  		});	
	  });
	  */
	};
	
	oReq.send();
}
//window.onload = reDraw;
