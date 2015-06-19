/// <reference path="webrtc.d.ts" />

var inputElement = document.getElementsByTagName('input')[0];
var dc:DataConnection;

inputElement.onkeydown = function( e ) {
    if (e.keyCode == 13) {
        dc = new DataConnection(inputElement.value);
    }
}

