/// <reference path="DefinitelyTyped/firebase/firebase.d.ts" />
/// <reference path="DefinitelyTyped/webrtc/RTCPeerConnection.d.ts" />

/* WebRTC Demo
 * Allows two clients to connect via WebRTC with Data Channels
 * Uses Firebase as a signalling server
 * http://fosterelli.co/getting-started-with-webrtc-data-channels.html 
 */

// Generate this browser a unique ID
// On Firebase peers use this unique ID to address messages to each other
// after they have found each other in the announcement channel
var id:string = Math.random().toString().replace('.', '');

// Unique identifier for two clients to use
// They MUST share this to find each other
// Each peer waits in the announcement channel to find its matching identifier
// When it finds its matching identifier, it initiates a WebRTC offer with
// that client. This unique identifier can be pretty much anything in practice.
var sharedKey:string = prompt("Please enter a shared identifier");

var remoteId:string; // ID of the remote peer -- set once they send an offer

/* == Announcement Channel Functions ==
 * The 'announcement channel' allows clients to find each other on Firebase
 * These functions are for communicating through the announcement channel
 * This is part of the signalling server mechanism
 *
 * After two clients find each other on the announcement channel, they 
 * can directly send messages to each other to negotiate a WebRTC connection
 */

// Announce our arrival to the announcement channel
var sendAnnounceChannelMessage = function() {
    announceChannel.push({
      id : id
    });
    console.log('Announced our ID is ' + id);
};

var existingAnnouncementsLoaded:boolean = false;

// Handle an incoming message on the announcement channel
var handleAnnounceChannelMessage = function(snapshot) { 
  var message = snapshot.val();
  if (message.id != id) {
    console.log('Discovered matching announcement from ' + message.id);
    remoteId = message.id;
    if (existingAnnouncementsLoaded) 
    {
      // this announcement arrived after page loaded
      peerConnection.createOffer(handleCreateSDPSuccess , handleCreateSDPError);
    }
  }
};

// This handler is called one time.
// After existing children added but before new children added
var handleAnnounceChannelValue = function(snapshot) {
    existingAnnouncementsLoaded = true;
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
var sendSignalChannelMessage = function(message) {
  database.child('messages').child(remoteId).push(message);
};

function handleCreateSDPError(error) {
  console.log('handleCreateSDPError() error: ', error);
}

function handleCreateSDPSuccess(sessionDescription) {
    peerConnection.setLocalDescription(sessionDescription);
    sendSignalChannelMessage(JSON.stringify({'sdp': sessionDescription}));
}

function addIceCandidateErrorCallback (errorInformation: DOMError): void
{
  console.log('peerConnection.addIceCandidate() error: ', DOMError);
}

function addIceCandidateSuccessCallback () : void
{
  console.log('peerConnection.addIceCandidate() success.');
}

// This is the general handler for a message from our remote client
// Determine what type of message it is, and call the appropriate handler
var handleSignalChannelMessage = function(snapshot) {
  var signal = JSON.parse(snapshot.val());
  if(signal.sdp) {
    peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    if (signal.sdp.type == 'offer') {
      peerConnection.createAnswer(handleCreateSDPSuccess, handleCreateSDPError);
    }
  } else if(signal.ice) {
    peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice),
                                   addIceCandidateSuccessCallback,
                                   addIceCandidateErrorCallback);
  } else 
    console.log('Recieved a signal that is neither sdp nor ice');
};

/* == ICE Candidate Functions ==
 * ICE candidates are what will connect the two peers
 * Both peers must find a list of suitable candidates and exchange their list
 * We exchange this list over the signalling channel (Firebase)
 */

// This is how we determine when the WebRTC connection has ended
// This is most likely because the other peer left the page
var handleICEConnectionStateChange = function() {
  if (peerConnection.iceConnectionState == 'disconnected') {
    console.log('Client disconnected!');
    sendAnnounceChannelMessage();
  }
};

// Handle ICE Candidate events by sending them to our remote
// Send the ICE Candidates via the signal channel
var handleICECandidate = function(event) {
  var candidate = event.candidate;
  if (candidate) {
    console.log('Sending candidate to ' + remoteId);
    sendSignalChannelMessage(JSON.stringify({'ice': candidate}));
  } else {
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
var handleDataChannel = function(event) {
  event.channel.onmessage = handleDataChannelMessage;
};

// This is called on an incoming message from our peer
// You probably want to overwrite this to do something more useful!
var handleDataChannelMessage = function(event) {
  console.log('Recieved Message: ' + event.data);
  document.getElementById("message").innerHTML = event.data;
};

// This is called when the WebRTC sending data channel is offically 'open'
var handleDataChannelOpen = function() {
  console.log('Data channel created!');
  dataChannel.send('Hello! I am ' + id);
};

// Configure, connect, and set up Firebase
// You probably want to replace the text below with your own Firebase URL
var firebaseUrl:string = 'https://pr100.firebaseio.com/';
var database:Firebase = new Firebase(firebaseUrl);

var announceChannel = database.child(sharedKey);
announceChannel.on('child_added', handleAnnounceChannelMessage);
announceChannel.once('value', handleAnnounceChannelValue);

var signalChannel = database.child('messages').child(id);
signalChannel.on('child_added', handleSignalChannelMessage);

// Use well known public servers for STUN/TURN
// STUN is a component of the actual WebRTC connection
var servers = {
  iceServers: [ {url: "stun:23.21.150.121"}, {url: "stun:stun.l.google.com:19302"} ]
};

var peerConnection = new RTCPeerConnection(servers);
peerConnection.ondatachannel = handleDataChannel;

var dataChannel = peerConnection.createDataChannel('myDataChannel');
dataChannel.onopen = handleDataChannelOpen;

// Enable sending of ICE candidates to peer.
peerConnection.onicecandidate = handleICECandidate;
peerConnection.oniceconnectionstatechange = handleICEConnectionStateChange;

// Send a message to the announcement channel
// If our partner is already waiting, they will send us a WebRTC offer
// over our Firebase signalling channel and we can begin delegating WebRTC
sendAnnounceChannelMessage();
