"use client";

import { useState } from "react";
import Avatar from "@/components/Avatar";
import Chat from "@/components/Chat";

// Page Name: Home
// Route: /
// Description: Landing page with 3D avatar and chat interface
// Purpose: Display a 3D avatar on the left and chat interface on the right
export default function Home() {
  const [isTalking, setIsTalking] = useState(false);

  const handleBotMessage = () => {
    setIsTalking(true);
    // Stop talking after 3 seconds (adjust based on message length)
    setTimeout(() => {
      setIsTalking(false);
    }, 3000);
  };

  return (
    <div className="flex h-screen w-full overflow-hidden bg-zinc-50 dark:bg-zinc-950">
      {/* Left Side - Avatar */}
      <div className="w-1/2 border-r border-zinc-200 dark:border-zinc-800">
        <Avatar isTalking={isTalking} />
      </div>

      {/* Right Side - Chat */}
      <div className="w-1/2">
        <Chat onBotMessage={handleBotMessage} />
      </div>
    </div>
  );
}
