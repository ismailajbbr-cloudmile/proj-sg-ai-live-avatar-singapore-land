"use client"

import { useState } from "react"

export default function MicButton() {
  const [listening, setListening] = useState(false)

  return (
    <button onClick={() => setListening(!listening)}>
      {listening ? "Stop" : "Start"}
    </button>
  )
}
