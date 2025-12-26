# Architecture
Client (browser)
- Capture mic audio
- Streams audio to server (WebSocket or WebRTC)
- Renders avatar + plays TTS audio
- Manages UI state (listening/thinking/speaking)

Server ()
- Receives audio stream
- Runs STT (or proxies to provider)
- Calls LLM
- Producers TTS Audio
- Sends back: transcript, assistant_text, tts_audio_url/chunks, timing (for lip sync)






src/
    app/
        layout.tsx
        page.tsx
        api/
            health/route.ts
            session/route.ts
            chat/route.ts
            voice/
                ws/route.ts
                stt/route.ts
                tts/route.ts
    components/
        chat/
            ChatPanel.tsx
            MessageList.tsx
            Composer.tsx
        voice/
            MicButton.tsx
            AudioLevelMeter.tsx
            VoiceController.tsx
        avatar/
            AvatarCanvas.tsx        
            AvatarModel.tsx
            LipSyncController.tsx
    lib/
        agent/
            promt.ts
            tools.ts
            llm.ts
            orchestrator.ts
        speech/
            stt.ts
            tts.ts
            vad.ts
            lipSync.ts
        realtime/
            wsClient.ts
            protocol.ts
        config/
            env.ts
    store/
        useConversationStore.ts
    types/
        conversations.ts
    public/
        avatars/
            demo-avatar.glb
        samples/
    sytles 



Endpoints

POST /v1/stt --> audio file --> {transcript}
POST /v1/chat --> {session_id, text} --> {reply_text}
POST /v1/tts --> { text } --> { audio_rul }

WS /v1/ws/voice
    - client sends audio_chunk
    - server sends partial_transcript, final_transcript, assistant_text_delta, tts_audio_chunk

POST /v1/session create/renew session


Important considerations
1) CORS
2) Auth & secrets
3) WebSocket deployment
4) File/audio handling
    - frontend records audio
    - backend returns transcript
    - backend returns TTS as audio/mpeg stream or audio_url


web/
  src/
    app/
    components/
      voice/
      avatar/
    lib/
      apiClient.ts        # calls FastAPI
      wsClient.ts

api/
  app/
    main.py
    api/
      stt.py
      chat.py
      tts.py
      ws_voice.py
    services/
      llm.py
      stt.py
      tts.py
      memory.py
    core/
      config.py
      security.py
  requirements.txt

