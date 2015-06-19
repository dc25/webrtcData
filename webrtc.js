/// <reference path="DefinitelyTyped/firebase/firebase.d.ts" />
/// <reference path="DefinitelyTyped/webrtc/RTCPeerConnection.d.ts" />
var DataConnection = (function () {
    function DataConnection(sharedKey) {
        // Use well known public servers for STUN/TURN
        // STUN is a component of the actual WebRTC connection
        var _this = this;
        /* == Announcement Channel Functions ==
         * The 'announcement channel' allows clients to find each other on Firebase
         * These functions are for communicating through the announcement channel
         * This is part of the signalling server mechanism
         *
         * After two clients find each other on the announcement channel, they
         * can directly send messages to each other to negotiate a WebRTC connection
         */
        // Announce our arrival to the announcement channel
        this.sendAnnounceChannelMessage = function () {
            this.announceChannel.push({
                id: this.id
            });
            console.log('Announced our ID is ' + this.id);
        };
        this.existingAnnouncementsLoaded = false;
        this.handleCreateSDPError = function (error) {
            console.log('handleCreateSDPError() error: ', error);
        };
        this.handleCreateSDPSuccess = function (sessionDescription) {
            this.peerConnection.setLocalDescription(sessionDescription);
            this.sendSignalChannelMessage(JSON.stringify({ 'sdp': sessionDescription }));
        };
        // Handle an incoming message on the announcement channel
        this.handleAnnounceChannelMessage = function (snapshot) {
            var _this = this;
            var message = snapshot.val();
            if (message.id != this.id) {
                console.log('Discovered matching announcement from ' + message.id);
                this.remoteId = message.id;
                if (this.existingAnnouncementsLoaded) {
                    // this announcement arrived after page loaded
                    this.peerConnection.createOffer(function (sd) {
                        _this.handleCreateSDPSuccess(sd);
                    }, function (err) {
                        _this.handleCreateSDPError(err);
                    });
                }
            }
        };
        // This handler is called one time.
        // After existing children added but before new children added
        this.handleAnnounceChannelValue = function (snapshot) {
            this.existingAnnouncementsLoaded = true;
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
        this.sendSignalChannelMessage = function (message) {
            this.database.child('messages').child(this.remoteId).push(message);
        };
        this.addIceCandidateErrorCallback = function (errorInformation) {
            console.log('peerConnection.addIceCandidate() error: ', DOMError);
        };
        this.addIceCandidateSuccessCallback = function () {
            console.log('peerConnection.addIceCandidate() success.');
        };
        // This is the general handler for a message from our remote client
        // Determine what type of message it is, and call the appropriate handler
        this.handleSignalChannelMessage = function (snapshot) {
            var _this = this;
            var signal = JSON.parse(snapshot.val());
            if (signal.sdp) {
                this.peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp));
                if (signal.sdp.type == 'offer') {
                    this.peerConnection.createAnswer(function (sd) {
                        _this.handleCreateSDPSuccess(sd);
                    }, function (err) {
                        _this.handleCreateSDPError(err);
                    });
                }
            }
            else if (signal.ice) {
                this.peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice), this.addIceCandidateSuccessCallback, this.addIceCandidateErrorCallback);
            }
            else
                console.log('Recieved a signal that is neither sdp nor ice');
        };
        /* == ICE Candidate Functions ==
         * ICE candidates are what will connect the two peers
         * Both peers must find a list of suitable candidates and exchange their list
         * We exchange this list over the signalling channel (Firebase)
         */
        // This is how we determine when the WebRTC connection has ended
        // This is most likely because the other peer left the page
        this.handleICEConnectionStateChange = function () {
            if (this.peerConnection.iceConnectionState == 'disconnected') {
                console.log('Client disconnected!');
                this.sendAnnounceChannelMessage();
            }
        };
        // Handle ICE Candidate events by sending them to our remote
        // Send the ICE Candidates via the signal channel
        this.handleICECandidate = function (event) {
            var candidate = event.candidate;
            if (candidate) {
                console.log('Sending candidate to ' + this.remoteId);
                this.sendSignalChannelMessage(JSON.stringify({ 'ice': candidate }));
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
        this.handleDataChannel = function (event) {
            var _this = this;
            event.channel.onmessage = function (e) {
                _this.handleDataChannelMessage(e);
            };
        };
        // This is called on an incoming message from our peer
        // You probably want to overwrite this to do something more useful!
        this.handleDataChannelMessage = function (event) {
            console.log('Recieved Message: ' + event.data);
            document.getElementById("message").innerHTML = event.data;
        };
        // This is called when the WebRTC sending data channel is offically 'open'
        this.handleDataChannelOpen = function () {
            console.log('Data channel created!');
            this.dataChannel.send('Hello! I am ' + this.id);
        };
        var servers = {
            iceServers: [{ url: "stun:23.21.150.121" }, { url: "stun:stun.l.google.com:19302" }]
        };
        this.peerConnection = new RTCPeerConnection(servers);
        this.peerConnection.ondatachannel = function (event) {
            _this.handleDataChannel(event);
        };
        // Enable sending of ICE candidates to peer.
        this.peerConnection.onicecandidate = function (event) {
            _this.handleICECandidate(event);
        };
        this.peerConnection.oniceconnectionstatechange = function () {
            _this.handleICEConnectionStateChange();
        };
        this.dataChannel = this.peerConnection.createDataChannel('myDataChannel');
        this.dataChannel.onopen = function () {
            _this.handleDataChannelOpen();
        };
        // Choose a random id
        this.id = Math.random().toString().replace('.', '');
        // Configure, connect, and set up Firebase
        // You probably want to replace the text below with your own Firebase URL
        this.database = new Firebase('https://pr100.firebaseio.com/');
        this.announceChannel = this.database.child(sharedKey);
        this.announceChannel.on('child_added', function (snapshot) {
            _this.handleAnnounceChannelMessage(snapshot);
        });
        this.announceChannel.once('value', function (snapshot) {
            _this.handleAnnounceChannelValue(snapshot);
        });
        var signalChannel = this.database.child('messages').child(this.id);
        signalChannel.on('child_added', function (snapshot) {
            _this.handleSignalChannelMessage(snapshot);
        });
        // Send a message to the announcement channel
        // If our partner is already waiting, they will send us a WebRTC offer
        // over our Firebase signalling channel and we can begin delegating WebRTC
        this.sendAnnounceChannelMessage();
    }
    return DataConnection;
})();
