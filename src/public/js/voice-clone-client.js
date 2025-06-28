/**
 * Voice Cloning System Client Example
 * 
 * This example demonstrates how to use the voice cloning system from the client side.
 */

// Required HTML:
// <div id="voice-clone-demo">
//   <div class="controls">
//     <button id="start-conversation">Start Conversation</button>
//     <button id="stop-conversation" disabled>End Conversation</button>
//     <select id="language-select">
//       <option value="en-US">English</option>
//       <option value="hi-IN">Hindi</option>
//       <option value="mixed">Mixed</option>
//     </select>
//     <select id="emotion-select">
//       <option value="neutral">Neutral</option>
//       <option value="cheerful">Cheerful</option>
//       <option value="warm">Warm</option>
//       <option value="sad">Sad</option>
//       <option value="authoritative">Authoritative</option>
//       <option value="empathetic">Empathetic</option>
//     </select>
//   </div>
//   <div class="status">Status: <span id="connection-status">Disconnected</span></div>
//   <div class="transcriptions">
//     <div id="user-transcript"></div>
//     <div id="ai-transcript"></div>
//   </div>
// </div>

class VoiceCloneClient {
  constructor() {
    // WebSocket connection
    this.ws = null;
    
    // Audio context and nodes
    this.audioContext = null;
    this.microphoneStream = null;
    this.scriptProcessor = null;
    
    // State management
    this.isConnected = false;
    this.isRecording = false;
    this.conversationId = null;
    
    // UI elements
    this.startButton = document.getElementById('start-conversation');
    this.stopButton = document.getElementById('stop-conversation');
    this.languageSelect = document.getElementById('language-select');
    this.emotionSelect = document.getElementById('emotion-select');
    this.statusSpan = document.getElementById('connection-status');
    this.userTranscriptDiv = document.getElementById('user-transcript');
    this.aiTranscriptDiv = document.getElementById('ai-transcript');
    
    // Bind event handlers
    this.startButton.addEventListener('click', this.startConversation.bind(this));
    this.stopButton.addEventListener('click', this.stopConversation.bind(this));
    this.languageSelect.addEventListener('change', this.setLanguage.bind(this));
    this.emotionSelect.addEventListener('change', this.setEmotion.bind(this));
  }
  
  /**
   * Initialize the client
   */
  async initialize() {
    try {
      // Request necessary permissions
      await this.requestPermissions();
      
      this.updateStatus('Ready');
    } catch (error) {
      console.error('Error initializing Voice Clone Client:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Request necessary permissions
   */
  async requestPermissions() {
    try {
      // Request microphone permission
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(track => track.stop()); // Stop tracks after permission
      
      return true;
    } catch (error) {
      console.error('Error requesting permissions:', error);
      this.updateStatus('Error: Microphone permission denied');
      throw error;
    }
  }
  
  /**
   * Start a conversation
   */
  async startConversation() {
    try {
      // Create WebSocket connection
      const wsUrl = 'ws://' + window.location.host + '/api/voice-clone/ws';
      this.ws = new WebSocket(wsUrl);
      
      // Set up event handlers
      this.ws.onopen = this.handleWebSocketOpen.bind(this);
      this.ws.onclose = this.handleWebSocketClose.bind(this);
      this.ws.onerror = this.handleWebSocketError.bind(this);
      this.ws.onmessage = this.handleWebSocketMessage.bind(this);
      
      this.updateStatus('Connecting...');
    } catch (error) {
      console.error('Error starting conversation:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Handle WebSocket open event
   */
  async handleWebSocketOpen() {
    try {
      this.isConnected = true;
      this.updateStatus('Connected');
      
      // Send initialization message
      this.ws.send(JSON.stringify({
        type: 'init',
        language: this.languageSelect.value,
        emotion: this.emotionSelect.value
      }));
      
      // Update UI
      this.startButton.disabled = true;
      this.stopButton.disabled = false;
    } catch (error) {
      console.error('Error in WebSocket open handler:', error);
    }
  }
  
  /**
   * Handle WebSocket close event
   */
  handleWebSocketClose(event) {
    this.isConnected = false;
    this.stopRecording();
    this.updateStatus(`Disconnected (${event.code})`);
    
    // Update UI
    this.startButton.disabled = false;
    this.stopButton.disabled = true;
  }
  
  /**
   * Handle WebSocket error event
   */
  handleWebSocketError(error) {
    console.error('WebSocket error:', error);
    this.updateStatus('Connection Error');
  }
  
  /**
   * Handle WebSocket message event
   */
  handleWebSocketMessage(event) {
    try {
      // Check if the message is binary (audio data)
      if (event.data instanceof Blob) {
        // Play audio data
        this.playAudioData(event.data);
        return;
      }
      
      // Parse JSON message
      const message = JSON.parse(event.data);
      
      switch (message.type) {
        case 'welcome':
          console.log('Connected to WebSocket server with ID:', message.connectionId);
          break;
          
        case 'init_confirm':
          this.conversationId = message.conversationId;
          this.updateStatus('Conversation Active');
          this.startRecording();
          break;
          
        case 'transcription':
          this.displayTranscription(message.text, message.language, 'user');
          break;
          
        case 'ai_response':
          this.displayTranscription(message.text, message.language, 'ai');
          break;
          
        case 'error':
          console.error('Server error:', message.message);
          this.updateStatus('Error: ' + message.message);
          break;
          
        default:
          console.log('Received message:', message);
      }
    } catch (error) {
      console.error('Error processing WebSocket message:', error);
    }
  }
  
  /**
   * Start recording audio
   */
  async startRecording() {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      
      // Get microphone stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      this.microphoneStream = stream;
      
      // Create source node
      const source = this.audioContext.createMediaStreamSource(stream);
      
      // Create script processor for audio processing
      this.scriptProcessor = this.audioContext.createScriptProcessor(4096, 1, 1);
      this.scriptProcessor.onaudioprocess = this.handleAudioProcess.bind(this);
      
      // Connect nodes
      source.connect(this.scriptProcessor);
      this.scriptProcessor.connect(this.audioContext.destination);
      
      this.isRecording = true;
      this.updateStatus('Recording...');
    } catch (error) {
      console.error('Error starting recording:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Handle audio processing
   */
  handleAudioProcess(event) {
    if (!this.isRecording || !this.isConnected) return;
    
    try {
      // Get audio data from input channel
      const input = event.inputBuffer.getChannelData(0);
      
      // Convert to 16-bit PCM
      const buffer = new ArrayBuffer(input.length * 2);
      const view = new DataView(buffer);
      
      for (let i = 0; i < input.length; i++) {
        const s = Math.max(-1, Math.min(1, input[i]));
        view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
      }
      
      // Send audio data to server
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(buffer);
      }
    } catch (error) {
      console.error('Error processing audio:', error);
    }
  }
  
  /**
   * Stop recording audio
   */
  stopRecording() {
    if (this.scriptProcessor) {
      this.scriptProcessor.disconnect();
      this.scriptProcessor = null;
    }
    
    if (this.microphoneStream) {
      this.microphoneStream.getTracks().forEach(track => track.stop());
      this.microphoneStream = null;
    }
    
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
      this.audioContext = null;
    }
    
    this.isRecording = false;
  }
  
  /**
   * Stop the conversation
   */
  stopConversation() {
    if (!this.isConnected) return;
    
    try {
      // Send end message
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'end'
        }));
      }
      
      // Stop recording
      this.stopRecording();
      
      // Close WebSocket
      if (this.ws) {
        this.ws.close();
        this.ws = null;
      }
      
      // Reset state
      this.isConnected = false;
      this.conversationId = null;
      
      // Update UI
      this.updateStatus('Disconnected');
      this.startButton.disabled = false;
      this.stopButton.disabled = true;
    } catch (error) {
      console.error('Error stopping conversation:', error);
      this.updateStatus('Error: ' + error.message);
    }
  }
  
  /**
   * Set conversation language
   */
  setLanguage() {
    if (!this.isConnected || !this.conversationId) return;
    
    try {
      // Send language change message
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'language',
          language: this.languageSelect.value
        }));
      }
      
      console.log('Language set to:', this.languageSelect.value);
    } catch (error) {
      console.error('Error setting language:', error);
    }
  }
  
  /**
   * Set conversation emotion
   */
  setEmotion() {
    if (!this.isConnected || !this.conversationId) return;
    
    try {
      // Send emotion change message
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'emotion',
          emotion: this.emotionSelect.value
        }));
      }
      
      console.log('Emotion set to:', this.emotionSelect.value);
    } catch (error) {
      console.error('Error setting emotion:', error);
    }
  }
  
  /**
   * Play audio data from server
   */
  async playAudioData(blob) {
    try {
      const arrayBuffer = await blob.arrayBuffer();
      
      // Create audio context if not exists
      if (!this.audioContext) {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
      }
      
      // Decode audio data
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
      
      // Create buffer source
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      
      // Connect to destination
      source.connect(this.audioContext.destination);
      
      // Play audio
      source.start(0);
    } catch (error) {
      console.error('Error playing audio data:', error);
    }
  }
  
  /**
   * Display transcription
   */
  displayTranscription(text, language, speaker) {
    const div = speaker === 'user' ? this.userTranscriptDiv : this.aiTranscriptDiv;
    
    const transcriptElement = document.createElement('div');
    transcriptElement.className = `transcript ${speaker}`;
    
    const speakerLabel = document.createElement('span');
    speakerLabel.className = 'speaker-label';
    speakerLabel.textContent = speaker === 'user' ? 'You: ' : 'AI: ';
    
    const langLabel = document.createElement('span');
    langLabel.className = 'lang-label';
    langLabel.textContent = `[${language}] `;
    
    const textSpan = document.createElement('span');
    textSpan.className = 'transcript-text';
    textSpan.textContent = text;
    
    transcriptElement.appendChild(speakerLabel);
    transcriptElement.appendChild(langLabel);
    transcriptElement.appendChild(textSpan);
    
    div.appendChild(transcriptElement);
    div.scrollTop = div.scrollHeight;
  }
  
  /**
   * Update connection status
   */
  updateStatus(status) {
    this.statusSpan.textContent = status;
  }
}

// Initialize client when the page loads
document.addEventListener('DOMContentLoaded', () => {
  const client = new VoiceCloneClient();
  client.initialize();
});
