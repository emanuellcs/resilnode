import { syncQueue } from "./sync-queue";

export type MeshStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED";

interface EncodedSessionDescription {
  type: RTCSdpType;
  sdp: string;
}

export class WebRTCMesh {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onStatusChange: (status: MeshStatus) => void;
  private onMessage: (message: unknown) => void;

  constructor(
    onStatusChange: (status: MeshStatus) => void,
    onMessage: (message: unknown) => void,
  ) {
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;
  }

  private initPeerConnection() {
    this.close();
    this.peerConnection = new RTCPeerConnection({
      iceServers: [], // No STUN/TURN for offline ad-hoc
    });

    this.peerConnection.onconnectionstatechange = () => {
      if (this.peerConnection?.connectionState === "connected") {
        this.onStatusChange("CONNECTED");
      } else if (
        this.peerConnection?.connectionState === "failed" ||
        this.peerConnection?.connectionState === "closed" ||
        this.peerConnection?.connectionState === "disconnected"
      ) {
        this.onStatusChange("DISCONNECTED");
      }
    };
  }

  private async waitForIceGatheringComplete(): Promise<void> {
    const connection = this.peerConnection;
    if (!connection || connection.iceGatheringState === "complete") return;

    await new Promise<void>((resolve) => {
      const timeout = window.setTimeout(() => {
        connection.removeEventListener("icegatheringstatechange", handler);
        resolve();
      }, 3000);

      const handler = () => {
        if (connection.iceGatheringState === "complete") {
          window.clearTimeout(timeout);
          connection.removeEventListener("icegatheringstatechange", handler);
          resolve();
        }
      };

      connection.addEventListener("icegatheringstatechange", handler);
    });
  }

  private encodeLocalDescription(): string {
    const description = this.peerConnection?.localDescription;
    if (!description?.sdp) {
      throw new Error("Unable to generate local SDP.");
    }

    return btoa(
      JSON.stringify({
        type: description.type,
        sdp: description.sdp,
      } satisfies EncodedSessionDescription),
    );
  }

  private decodeSessionDescription(payload: string): RTCSessionDescriptionInit {
    let parsed: Partial<EncodedSessionDescription>;

    try {
      parsed = JSON.parse(atob(payload)) as Partial<EncodedSessionDescription>;
    } catch {
      throw new Error("Scanned QR payload is not a valid ResilNode SDP.");
    }

    if (!parsed.sdp || (parsed.type !== "offer" && parsed.type !== "answer")) {
      throw new Error("Scanned QR payload is missing a valid SDP type.");
    }

    return {
      type: parsed.type,
      sdp: parsed.sdp,
    };
  }

  /**
   * Generates a Base64-encoded SDP Offer for optical transmission.
   */
  async generateOffer(): Promise<string> {
    this.onStatusChange("CONNECTING");
    this.initPeerConnection();

    this.dataChannel = this.peerConnection!.createDataChannel(
      "resilnode-mesh",
      {
        ordered: true,
      },
    );
    this.setupDataChannel(this.dataChannel);

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);
    await this.waitForIceGatheringComplete();

    return this.encodeLocalDescription();
  }

  /**
   * Processes a scanned SDP Offer and generates a Base64-encoded Answer.
   */
  async acceptOfferAndGenerateAnswer(base64Offer: string): Promise<string> {
    this.onStatusChange("CONNECTING");
    this.initPeerConnection();

    this.peerConnection!.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };

    const offerData = this.decodeSessionDescription(base64Offer);
    if (offerData.type !== "offer") {
      throw new Error("Expected an SDP offer QR payload.");
    }

    await this.peerConnection!.setRemoteDescription(
      new RTCSessionDescription(offerData),
    );

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);
    await this.waitForIceGatheringComplete();

    return this.encodeLocalDescription();
  }

  /**
   * Finalizes the handshake with a scanned SDP Answer.
   */
  async finalizeHandshake(base64Answer: string) {
    if (!this.peerConnection) {
      throw new Error("No active WebRTC handshake to finalize.");
    }

    const answerData = this.decodeSessionDescription(base64Answer);
    if (answerData.type !== "answer") {
      throw new Error("Expected an SDP answer QR payload.");
    }

    await this.peerConnection!.setRemoteDescription(
      new RTCSessionDescription(answerData),
    );
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = async () => {
      this.onStatusChange("CONNECTED");
      await syncQueue.flushQueue(channel);
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.onMessage(message);
      } catch (e) {
        console.error("[WebRTC] Message parse error:", e);
      }
    };

    channel.onclose = () => {
      this.onStatusChange("DISCONNECTED");
    };
  }

  sendMessage(message: unknown) {
    if (this.dataChannel && this.dataChannel.readyState === "open") {
      try {
        this.dataChannel.send(JSON.stringify(message));
        return true;
      } catch (error) {
        console.error("[WebRTC] Send failed:", error);
      }
    }
    return false;
  }

  isDisconnected() {
    return !this.dataChannel || this.dataChannel.readyState !== "open";
  }

  close() {
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.dataChannel = null;
    this.peerConnection = null;
    this.onStatusChange("DISCONNECTED");
  }
}
