import { syncQueue } from './sync-queue';

export type MeshStatus = 'DISCONNECTED' | 'CONNECTING' | 'CONNECTED';

export class WebRTCMesh {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onStatusChange: (status: MeshStatus) => void;
  private onMessage: (message: unknown) => void;

  constructor(
    onStatusChange: (status: MeshStatus) => void,
    onMessage: (message: unknown) => void
  ) {
    this.onStatusChange = onStatusChange;
    this.onMessage = onMessage;
  }

  private initPeerConnection() {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [], // No STUN/TURN for offline ad-hoc
    });

    this.peerConnection.onicecandidate = (event) => {
      // Note: In an ideal implementation, we wait for all candidates or 
      // bundle them. For this hackathon, we'll assume local candidates 
      // are part of the initial SDP.
    };

    this.peerConnection.onconnectionstatechange = () => {
      // console.log('[WebRTC] Connection state:', this.peerConnection?.connectionState);
      if (this.peerConnection?.connectionState === 'connected') {
        this.onStatusChange('CONNECTED');
      } else if (this.peerConnection?.connectionState === 'failed' || this.peerConnection?.connectionState === 'closed') {
        this.onStatusChange('DISCONNECTED');
      }
    };
  }

  /**
   * Generates a Base64-encoded SDP Offer for optical transmission.
   */
  async generateOffer(): Promise<string> {
    this.onStatusChange('CONNECTING');
    this.initPeerConnection();
    
    this.dataChannel = this.peerConnection!.createDataChannel('resilnode-mesh', {
      ordered: true,
    });
    this.setupDataChannel(this.dataChannel);

    const offer = await this.peerConnection!.createOffer();
    await this.peerConnection!.setLocalDescription(offer);

    // Give a small delay for ICE candidates to settle in the local SDP
    await new Promise(resolve => setTimeout(resolve, 500));

    const sdp = this.peerConnection!.localDescription?.sdp;
    return btoa(JSON.stringify({ type: 'offer', sdp }));
  }

  /**
   * Processes a scanned SDP Offer and generates a Base64-encoded Answer.
   */
  async acceptOfferAndGenerateAnswer(base64Offer: string): Promise<string> {
    this.onStatusChange('CONNECTING');
    this.initPeerConnection();

    this.peerConnection!.ondatachannel = (event) => {
      this.dataChannel = event.channel;
      this.setupDataChannel(this.dataChannel);
    };

    const offerData = JSON.parse(atob(base64Offer));
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(offerData));

    const answer = await this.peerConnection!.createAnswer();
    await this.peerConnection!.setLocalDescription(answer);

    // Give a small delay for ICE candidates
    await new Promise(resolve => setTimeout(resolve, 500));

    const sdp = this.peerConnection!.localDescription?.sdp;
    return btoa(JSON.stringify({ type: 'answer', sdp }));
  }

  /**
   * Finalizes the handshake with a scanned SDP Answer.
   */
  async finalizeHandshake(base64Answer: string) {
    const answerData = JSON.parse(atob(base64Answer));
    await this.peerConnection!.setRemoteDescription(new RTCSessionDescription(answerData));
  }

  private setupDataChannel(channel: RTCDataChannel) {
    channel.onopen = () => {
      this.onStatusChange('CONNECTED');
      // console.log('[WebRTC] DataChannel open. Flushing queue...');
      syncQueue.flushQueue(channel);
    };

    channel.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data);
        this.onMessage(message);
      } catch (e) {
        console.error('[WebRTC] Message parse error:', e);
      }
    };

    channel.onclose = () => {
      this.onStatusChange('DISCONNECTED');
    };
  }

  sendMessage(message: unknown) {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(message));
      return true;
    }
    return false;
  }

  isDisconnected() {
    return !this.dataChannel || this.dataChannel.readyState !== 'open';
  }
}
