import { useState, useEffect } from "react";

interface Greeting {
  text: string;
  icon: string;
}

const subtitles = [
  "What are we building today?",
  "Ready to think deeply?",
  "Let's explore something new.",
  "Continue where you left off.",
  "Your knowledge workspace is ready.",
  "Start researching.",
  "Everything begins with curiosity.",
];

export function useGreeting() {
  const [greeting, setGreeting] = useState<Greeting>({ text: "", icon: "" });
  const [subtitle] = useState(() => subtitles[Math.floor(Math.random() * subtitles.length)]);

  useEffect(() => {
    const update = () => {
      const h = new Date().getHours();
      if (h >= 0 && h < 5) setGreeting({ text: "Hey, night owl.", icon: "🦉" });
      else if (h >= 5 && h < 9) setGreeting({ text: "Good morning.", icon: "🌅" });
      else if (h >= 9 && h < 12) setGreeting({ text: "Hope you're having a productive morning.", icon: "☀️" });
      else if (h >= 12 && h < 17) setGreeting({ text: "Good afternoon.", icon: "🌤" });
      else if (h >= 17 && h < 21) setGreeting({ text: "Good evening.", icon: "🌇" });
      else setGreeting({ text: "Burning the midnight oil?", icon: "🌙" });
    };
    update();
    const timer = setInterval(update, 60000);
    return () => clearInterval(timer);
  }, []);

  return { greeting, subtitle };
}
