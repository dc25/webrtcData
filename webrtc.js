/// <reference path="DefinitelyTyped/firebase/firebase.d.ts" />
/// <reference path="DefinitelyTyped/webrtc/RTCPeerConnection.d.ts" />
/* WebRTC Demo
 * Allows two clients to connect via WebRTC with Data Channels
 * Uses Firebase as a signalling server
 * http://fosterelli.co/getting-started-with-webrtc-data-channels.html
 */
var id; // Our unique ID
var sharedKey; // Unique identifier for two clients to find each other
var remote; // ID of the remote peer -- set once they send an offer
var peerConnection; // This is our WebRTC connection
var dataChannel; // This is our outgoing data channel within WebRTC
// Function to initiate the WebRTC peerconnection and dataChannel
var initiateWebRTCState = function () {
    // Use well known public servers for STUN/TURN
    // STUN is a component of the actual WebRTC connection
    var servers = {
        iceServers: [{ url: "stun:23.21.150.121" }, { url: "stun:stun.l.google.com:19302" }]
    };
    peerConnection = new RTCPeerConnection(servers);
    peerConnection.ondatachannel = handleDataChannel;
    dataChannel = peerConnection.createDataChannel('myDataChannel');
    dataChannel.onopen = handleDataChannelOpen;
    // Enable sending of ICE candidates to peer.
    peerConnection.onicecandidate = handleICECandidate;
    peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;
};
/* == Announcement Channel Functions ==
 * The 'announcement channel' allows clients to find each other on Firebase
 * These functions are for communicating through the announcement channel
 * This is part of the signalling server mechanism
 *
 * After two clients find each other on the announcement channel, they
 * can directly send messages to each other to negotiate a WebRTC connection
 */
// Announce our arrival to the announcement channel
var sendAnnounceChannelMessage = function () {
    var announceChannel = database.child(sharedKey);
    announceChannel.on('child_added', handleAnnounceChannelMessage);
    announceChannel.remove(function () {
        announceChannel.push({
            id: id
        });
        console.log('Announced our ID is ' + id);
    });
};
// Handle an incoming message on the announcement channel
var handleAnnounceChannelMessage = function (snapshot) {
    var message = snapshot.val();
    if (message.id != id) {
        console.log('Discovered matching announcement from ' + message.id);
        remote = message.id;
        peerConnection.createOffer(handleCreateSDPSuccess, handleCreateSDPError);
    }
};
/* == Signal Channel Functions ==
 * The signal channels are used to delegate the WebRTC connection between
 * two peers once they have found each other via the announcement channel.
 *
 * This is done on Firebase as well. Once the two peers communicate the
 * necessary information to 'find' each other via WebRTC, the signalling
 * channel is no longer used and the connection becomes peer-to-peer.
 */
// Send a message to the remote client via Firebase
var sendSignalChannelMessage = function (message) {
    message.sender = id;
    database.child('messages').child(remote).push(message);
};
function handleCreateSDPError(error) {
    console.log('handleCreateSDPError() error: ', error);
}
function handleCreateSDPSuccess(sessionDescription) {
    peerConnection.setLocalDescription(sessionDescription);
    sendSignalChannelMessage({
        type: sessionDescription.type,
        sdp: sessionDescription.sdp
    });
}
// Handle a WebRTC offer request from a remote client
var handleOfferSignal = function (message) {
    remote = message.sender;
    peerConnection.setRemoteDescription(new RTCSessionDescription(message));
    peerConnection.createAnswer(handleCreateSDPSuccess, handleCreateSDPError);
};
// Handle a WebRTC answer response to our offer we gave the remote client
var handleAnswerSignal = function (message) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(message));
};
// Handle an ICE candidate notification from the remote client
var handleCandidateSignal = function (message) {
    if (typeof peerConnection !== 'undefined') {
        var candidate = new RTCIceCandidate(message);
        peerConnection.addIceCandidate(candidate);
    }
    else {
        console.log('UNDEFINED PEER CONNECTION');
    }
};
// This is the general handler for a message from our remote client
// Determine what type of message it is, and call the appropriate handler
var handleSignalChannelMessage = function (snapshot) {
    var message = snapshot.val();
    var sender = message.sender;
    var type = message.type;
    console.log('Recieved a \'' + type + '\' signal from ' + sender);
    if (type == 'offer')
        handleOfferSignal(message);
    else if (type == 'answer')
        handleAnswerSignal(message);
    else if (type == 'candidate')
        handleCandidateSignal(message);
};
/* == ICE Candidate Functions ==
 * ICE candidates are what will connect the two peers
 * Both peers must find a list of suitable candidates and exchange their list
 * We exchange this list over the signalling channel (Firebase)
 */
// This is how we determine when the WebRTC connection has ended
// This is most likely because the other peer left the page
var handleICEConnectionStateChange = function () {
    if (peerConnection.iceConnectionState == 'disconnected') {
        console.log('Client disconnected!');
        sendAnnounceChannelMessage();
    }
};
// Handle ICE Candidate events by sending them to our remote
// Send the ICE Candidates via the signal channel
var handleICECandidate = function (event) {
    var candidate = event.candidate;
    if (candidate) {
        candidate.type = 'candidate';
        console.log('Sending candidate to ' + remote);
        sendSignalChannelMessage({
            type: candidate.type,
            candidate: candidate.candidate,
            sdpMLineIndex: candidate.sdpMLineIndex
        });
    }
    else {
        console.log('All candidates sent');
    }
};
/* == Data Channel Functions ==
 * The WebRTC connection is established by the time these functions run
 * The hard part is over, and these are the functions we really want to use
 *
 * The functions below relate to sending and receiving WebRTC messages over
 * the peer-to-peer data channels
 */
// This is our receiving data channel event
// We receive this channel when our peer opens a sending channel
// We will bind to trigger a handler when an incoming message happens
var handleDataChannel = function (event) {
    event.channel.onmessage = handleDataChannelMessage;
};
// This is called on an incoming message from our peer
// You probably want to overwrite this to do something more useful!
var handleDataChannelMessage = function (event) {
    console.log('Recieved Message: ' + event.data);
    document.getElementById("message").innerHTML = event.data;
};
// This is called when the WebRTC sending data channel is offically 'open'
var handleDataChannelOpen = function () {
    console.log('Data channel created!');
    dataChannel.send('Hello! I am ' + id);
};
// Generate this browser a unique ID
// On Firebase peers use this unique ID to address messages to each other
// after they have found each other in the announcement channel
id = Math.random().toString().replace('.', '');
// Unique identifier for two clients to use
// They MUST share this to find each other
// Each peer waits in the announcement channel to find its matching identifier
// When it finds its matching identifier, it initiates a WebRTC offer with
// that client. This unique identifier can be pretty much anything in practice.
sharedKey = prompt("Please enter a shared identifier");
// Configure, connect, and set up Firebase
// You probably want to replace the text below with your own Firebase URL
var firebaseUrl = 'https://pr100.firebaseio.com/';
var database = new Firebase(firebaseUrl);
var signalChannel = database.child('messages').child(id);
signalChannel.on('child_added', handleSignalChannelMessage);
initiateWebRTCState();
// Send a message to the announcement channel
// If our partner is already waiting, they will send us a WebRTC offer
// over our Firebase signalling channel and we can begin delegating WebRTC
sendAnnounceChannelMessage();
