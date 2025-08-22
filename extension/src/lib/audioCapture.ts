export class AudioCapture {
  private mediaRecorder: MediaRecorder | null = null;
  private audioContext: AudioContext | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private stream: MediaStream | null = null;
  private onDataCallback: ((data: ArrayBuffer) => void) | null = null;

  constructor() {}

  async start(
    streamId: string,
    onData: (data: ArrayBuffer) => void
  ): Promise<void> {
    this.onDataCallback = onData;

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          mandatory: {
            chromeMediaSource: 'tab',
            chromeMediaSourceId: streamId
          }
        } as any,
        video: false
      });

      this.audioContext = new AudioContext({ sampleRate: 16000 });
      this.sourceNode = this.audioContext.createMediaStreamSource(this.stream);
      
      this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);
      
      this.processorNode.onaudioprocess = (event) => {
        const inputData = event.inputBuffer.getChannelData(0);
        const pcm16 = this.convertFloat32ToPCM16(inputData);
        
        if (this.onDataCallback) {
          this.onDataCallback(pcm16.buffer);
        }
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.setupOpusEncoder();
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      throw error;
    }
  }

  private setupOpusEncoder() {
    this.mediaRecorder = new MediaRecorder(this.stream!, {
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: 32000
    });

    this.mediaRecorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && this.onDataCallback) {
        const arrayBuffer = await event.data.arrayBuffer();
        this.onDataCallback(arrayBuffer);
      }
    };

    this.mediaRecorder.start(100);
  }

  private convertFloat32ToPCM16(float32Array: Float32Array): Int16Array {
    const pcm16 = new Int16Array(float32Array.length);
    
    for (let i = 0; i < float32Array.length; i++) {
      const sample = Math.max(-1, Math.min(1, float32Array[i]));
      pcm16[i] = sample < 0 ? sample * 0x8000 : sample * 0x7FFF;
    }
    
    return pcm16;
  }

  async stop(): Promise<void> {
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stop();
    }

    if (this.processorNode) {
      this.processorNode.disconnect();
    }

    if (this.sourceNode) {
      this.sourceNode.disconnect();
    }

    if (this.audioContext) {
      await this.audioContext.close();
    }

    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
    }

    this.mediaRecorder = null;
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.stream = null;
    this.onDataCallback = null;
  }

  isRecording(): boolean {
    return this.mediaRecorder?.state === 'recording';
  }
}