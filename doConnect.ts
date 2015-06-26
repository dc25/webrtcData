/// <reference path="webrtc.d.ts" />

var inputElement = document.getElementsByTagName('input')[0];
var dc:DataConnection;

// This is called on an incoming message from our peer
// You probably want to overwrite this to do something more useful!
function handleMessage(event) {
   console.log("Recieved Message: " + event.data);
}

inputElement.onkeydown = function( e ) {
    if (e.keyCode == 13) {
        dc = new DataConnection(inputElement.value, handleMessage);
    }
}

