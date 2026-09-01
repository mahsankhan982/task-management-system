"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { createPeerConnection } from "./webrtc";
import { Phone, PhoneOff, Mic, MicOff, Video, VideoOff, MonitorUp } from "lucide-react";

type CallType = "audio" | "video";
type CallState = "idle" | "calling" | "incoming" | "connected";

type IncomingCall = {
  callId: string;
  callerId: number;
  callerEmail: string;
  callerRole: string;
  type: CallType;
};

export default function CallManager() {
  const [callState, setCallState] = useState<CallState>("idle");
  const [incomingCall, setIncomingCall] = useState<IncomingCall | null>(null);
  const [muted, setMuted] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [screenSharing, setScreenSharing] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const activeCallRef = useRef<IncomingCall | null>(null);
  const [activeCall, setActiveCall] = useState<IncomingCall | null>(null);

  const cleanupCall = useCallback(() => {
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    activeCallRef.current = null;
    setActiveCall(null);
    setIncomingCall(null);
    setCallState("idle");
    setMuted(false);
    setCameraEnabled(true);
    setScreenSharing(false);
  }, []);

  const getToken = useCallback(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem("token") || sessionStorage.getItem("token") || "";
  }, []);

  useEffect(() => {
    const token = getToken();
    if (!token) return;
    const socket = io(process.env.NEXT_PUBLIC_API_URL || window.location.origin, {
      auth: { token },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("call:incoming", (call: IncomingCall) => {
      setIncomingCall(call);
      setCallState("incoming");
    });

    socket.on("call:accepted", () => setCallState("connected"));
    socket.on("call:rejected", () => setCallState("idle"));
    socket.on("call:ended", () => endLocalCall());

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [getToken]);

  const endLocalCall = useCallback(() => {
    localStreamRef.current?.getTracks().forEach((track) => track.stop());
    remoteStreamRef.current?.getTracks().forEach((track) => track.stop());
    localStreamRef.current = null;
    remoteStreamRef.current = null;
    setIncomingCall(null);
    setCallState("idle");
    setMuted(false);
    setCameraEnabled(true);
    setScreenSharing(false);
  }, []);

  // WEBRTC_HANDLERS_ADDED
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;

    const handleOffer = async (data: any) => {
      try {
        const fromUserId = Number(data.fromUserId);
        const callId = String(data.callId);
        const peer = createPeerConnection(
          (candidate) => socket.emit("webrtc:ice-candidate", { targetUserId: fromUserId, callId, candidate }),
          (stream) => {
            remoteStreamRef.current = stream;
            if (remoteVideoRef.current) remoteVideoRef.current.srcObject = stream;
          },
          (state) => {
            if (state === "connected") setCallState("connected");
          }
        );
        peerConnectionRef.current = peer;
        if (localStreamRef.current) {
          localStreamRef.current.getTracks().forEach((track) => peer.addTrack(track, localStreamRef.current!));
        }
        await peer.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peer.createAnswer();
        await peer.setLocalDescription(answer);
        socket.emit("webrtc:answer", { targetUserId: fromUserId, callId, answer });
      } catch (error) {
        console.error("WebRTC offer error:", error);
      }
    };

    const handleAnswer = async (data: any) => {
      try {
        if (peerConnectionRef.current) {
          await peerConnectionRef.current.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
      } catch (error) {
        console.error("WebRTC answer error:", error);
      }
    };

    const handleIceCandidate = async (data: any) => {
      try {
        if (peerConnectionRef.current && data.candidate) {
          await peerConnectionRef.current.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
      } catch (error) {
        console.error("WebRTC ICE error:", error);
      }
    };

    socket.on("webrtc:offer", handleOffer);
    socket.on("webrtc:answer", handleAnswer);
    socket.on("webrtc:ice-candidate", handleIceCandidate);

    return () => {
      socket.off("webrtc:offer", handleOffer);
      socket.off("webrtc:answer", handleAnswer);
      socket.off("webrtc:ice-candidate", handleIceCandidate);
    };
  }, []);

  const acceptCall = useCallback(async () => {
    if (!incomingCall || !socketRef.current) return;
    try {
      localStreamRef.current = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: incomingCall.type === "video",
      });
      socketRef.current.emit("call:accept", {
        callId: incomingCall.callId,
        callerId: incomingCall.callerId,
      });
      setCallState("connected");
    } catch {
      setIncomingCall(null);
      setCallState("idle");
    }
  }, [incomingCall]);

  // OUTGOING_CALL_ADDED
  const startCall = useCallback(async (targetUserId: number, type: CallType) => {
    if (!socketRef.current || !targetUserId) return;
    try {
      const callId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: type === "video" });
      localStreamRef.current = stream;
      const peer = createPeerConnection(
        (candidate) => {
          socketRef.current?.emit("webrtc:ice-candidate", { targetUserId, callId, candidate });
        },
        (remoteStream) => {
          remoteStreamRef.current = remoteStream;
          if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream;
        },
        (state) => {
          if (state === "connected") setCallState("connected");
        }
      );
      peerConnectionRef.current = peer;
      stream.getTracks().forEach((track) => peer.addTrack(track, stream));
      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      const call = { callId, callerId: 0, callerEmail: "", callerRole: "", type } as IncomingCall;
      activeCallRef.current = call;
      setActiveCall(call);
      setCallState("calling");
      if (localVideoRef.current) localVideoRef.current.srcObject = stream;
      socketRef.current.emit("call:invite", { targetUserId, callId, type });
      socketRef.current.emit("webrtc:offer", { targetUserId, callId, offer });
    } catch (error) {
      console.error("Could not start call:", error);
      cleanupCall();
    }
  }, [cleanupCall]);

  const rejectCall = useCallback(() => {
    if (incomingCall && socketRef.current) {
      socketRef.current.emit("call:reject", {
        callId: incomingCall.callId,
        callerId: incomingCall.callerId,
      });
    }
    setIncomingCall(null);
    setCallState("idle");
  }, [incomingCall]);

  const toggleMute = () => {
    const next = !muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => { track.enabled = !next; });
    setMuted(next);
  };

  const toggleCamera = () => {
    const next = !cameraEnabled;
    localStreamRef.current?.getVideoTracks().forEach((track) => { track.enabled = next; });
    setCameraEnabled(next);
  };

  const toggleScreenShare = async () => {
    if (!navigator.mediaDevices?.getDisplayMedia) return;
    if (screenSharing) {
      localStreamRef.current?.getVideoTracks().forEach((track) => track.stop());
      setScreenSharing(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const track = stream.getVideoTracks()[0];
      if (track) {
        track.onended = () => setScreenSharing(false);
        setScreenSharing(true);
      }
    } catch {}
  };

  if (callState === "idle") return null;

  if (callState === "incoming" && incomingCall) {
    return (
      <div className="fixed bottom-6 right-6 z-[100] w-[360px] rounded-2xl bg-white p-5 shadow-2xl ring-1 ring-slate-200">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
            <Phone className="text-green-600" size={22} />
          </div>
          <div>
            <div className="font-semibold text-slate-900">Incoming {incomingCall.type === "video" ? "Video" : "Voice"} Call</div>
            <div className="text-sm text-slate-500">{incomingCall.callerEmail}</div>
          </div>
        </div>
        <div className="flex gap-3">
          <button onClick={rejectCall} className="flex-1 rounded-xl bg-red-600 px-4 py-3 font-semibold text-white">Reject</button>
          <button onClick={acceptCall} className="flex-1 rounded-xl bg-green-600 px-4 py-3 font-semibold text-white">Accept</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-6 left-1/2 z-[100] flex -translate-x-1/2 items-center gap-3 rounded-2xl bg-slate-950 px-5 py-4 text-white shadow-2xl">
      <button onClick={toggleMute} className="rounded-full bg-slate-700 p-3" title={muted ? "Unmute" : "Mute"}>{muted ? <MicOff size={20} /> : <Mic size={20} />}</button>
      <button onClick={toggleCamera} className="rounded-full bg-slate-700 p-3" title={cameraEnabled ? "Turn camera off" : "Turn camera on"}>{cameraEnabled ? <Video size={20} /> : <VideoOff size={20} />}</button>
      <button onClick={toggleScreenShare} className="rounded-full bg-slate-700 p-3" title="Screen share"><MonitorUp size={20} /></button>
      <button onClick={() => { const targetUserId = incomingCall?.callerId; if (targetUserId) socketRef.current?.emit("call:end", { targetUserId, callId: incomingCall?.callId }); endLocalCall(); }} className="rounded-full bg-red-600 p-3" title="End call"><PhoneOff size={20} /></button>
    </div>
  );
}
