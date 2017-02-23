var tracker = io.connect('http://shaiii.com:8080');

var buket;

var sendChannel;

tracker.emit('domain', window.location.hostname, function (domain, id) {
     buket = io.connect('http://shaiii.com:8080/'+domain);

     buket.on('connect', function(){
	offer();
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

     buket.on('loadFromServer', function(){
	load();	
     });
});


STUN = { urls: 'stun:stun.l.google.com:19302' };
servers = { iceServers: STUN};
DtlsSrtpKeyAgreement = {
   DtlsSrtpKeyAgreement: true
};
optional = {
   optional: [DtlsSrtpKeyAgreement]
};

receiveBuffer = [];
function offer() {
  console.log('startOffer:'+Date.now());
  window.localConnection = localConnection = new RTCPeerConnection(STUN, optional);

  sendChannel = localConnection.createDataChannel('sendDataChannel');
  sendChannel.binaryType = 'arraybuffer';
  sendChannel.onopen = onSendChannelStateChange;
  sendChannel.onclose = onSendChannelStateChange;
  sendChannel.onmessage = function (event) {
  	console.log('receive first byte:'+Date.now());
	receiveBuffer.push(event.data);
	if(event.data.byteLength != 65664){
		var received = new window.Blob(receiveBuffer);
		receiveBuffer = [];

		url= URL.createObjectURL(received);
		setTimeout(function(){ document.querySelector('img').src = url; }, 500);
	}
  	//console.log("received: " + event.data);
  };

  localConnection.createOffer().then(
    function(desc){
  	localConnection.setLocalDescription(desc);
	buket.emit('help', desc);	
    },
    function(error){
         console.log(error);
    } 
  );
}

function acceptAnswer(data){
  	window.localConnection.onicecandidate = function(e) {
	      if(e.candidate) buket.emit('ice', data.id, e.candidate);
  	};
  	window.localConnection.setRemoteDescription(data.desc);
}

function answer(data){
  id = data.id;
  desc = data.desc;

  window.remoteConnection = remoteConnection = new RTCPeerConnection(STUN, optional);

  remoteConnection.onicecandidate = function(e) {
	if(e.candidate) buket.emit('ice',id , e.candidate);
  };
  
  desc = new RTCSessionDescription(desc);
  remoteConnection.setRemoteDescription(desc);
  remoteConnection.createAnswer().then(
    function(desc){
	remoteConnection.setLocalDescription(desc);
	buket.emit('answer', id, desc);	
    },
    function(error){
	alert(error);
    } 
  );
  remoteConnection.ondatachannel = function(event){ 
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
	connection = window.localConnection ? window.localConnection : window.remoteConnection;
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

function load(){
	var oReq = new XMLHttpRequest();
	oReq.open("GET", "/nothing.ico", true);
	oReq.responseType = "blob";
	
	oReq.onload = function(oEvent) {
	  blob = oReq.response;
	  var url = URL.createObjectURL(blob); 
	  document.querySelector('img').src = url;
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
