/// <reference path="DefinitelyTyped/firebase/firebase.d.ts" />
/// <reference path="DefinitelyTyped/webrtc/RTCPeerConnection.d.ts" />
declare class DataConnection {
    constructor(sharedKey: string, handleDataChannelMessage: (event: RTCMessageEvent) => void);
}
