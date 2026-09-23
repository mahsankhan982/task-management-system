export const ICE_SERVERS: RTCConfiguration = { iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }] };

export function createPeerConnection(onIceCandidate: (candidate: RTCIceCandidate) => void, onTrack: (stream: MediaStream) => void, onConnectionStateChange: (state: RTCPeerConnectionState) => void): RTCPeerConnection {
  const peer = new RTCPeerConnection(ICE_SERVERS);
  peer.onicecandidate = (event) => { if (event.candidate) onIceCandidate(event.candidate); };
  peer.ontrack = (event) => { const stream = event.streams[0]; if (stream) onTrack(stream); };
  peer.onconnectionstatechange = () => { onConnectionStateChange(peer.connectionState); };
  return peer;
}
