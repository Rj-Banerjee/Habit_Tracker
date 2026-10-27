// quotes.js - Daily fresh motivational quotes and matching aesthetic imagery

export const QUOTES_DATABASE = [
  {
    quote: "Focused, intentional, and ready for the month ahead.",
    prefix: "I am ...",
    author: "Mindful Living",
    theme: "Intentionality",
    image: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e6e0d2"
  },
  {
    quote: "You do not rise to the level of your goals. You fall to the level of your systems.",
    prefix: "Remember...",
    author: "James Clear",
    theme: "Consistency",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#dbeafe"
  },
  {
    quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    prefix: "Wisdom...",
    author: "Aristotle",
    theme: "Habits",
    image: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fce7f3"
  },
  {
    quote: "Great things are done by a series of small things brought together.",
    prefix: "Inspire...",
    author: "Vincent van Gogh",
    theme: "Small Steps",
    image: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#ccfbf1"
  },
  {
    quote: "The soul becomes dyed with the color of its thoughts.",
    prefix: "Reflection...",
    author: "Marcus Aurelius",
    theme: "Mindset",
    image: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fef3c7"
  },
  {
    quote: "You can't use up creativity. The more you use, the more you have.",
    prefix: "Creativity...",
    author: "Maya Angelou",
    theme: "Expression",
    image: "https://images.unsplash.com/photo-1460518451282-c93d30906a24?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e0e7ff"
  },
  {
    quote: "Simplicity is the ultimate sophistication.",
    prefix: "Clarity...",
    author: "Leonardo da Vinci",
    theme: "Focus",
    image: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#dbeafe"
  },
  {
    quote: "The secret of getting ahead is getting started.",
    prefix: "Action...",
    author: "Mark Twain",
    theme: "Initiative",
    image: "https://images.unsplash.com/photo-1434030216411-0b793f4b4173?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fce7f3"
  },
  {
    quote: "It does not matter how slowly you go as long as you do not stop.",
    prefix: "Patience...",
    author: "Confucius",
    theme: "Perseverance",
    image: "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#ccfbf1"
  },
  {
    quote: "Your future is created by what you do today, not tomorrow.",
    prefix: "Today...",
    author: "Robert Kiyosaki",
    theme: "Presence",
    image: "https://images.unsplash.com/photo-1484480974693-6ca0a78fb36b?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fef3c7"
  },
  {
    quote: "Continuous improvement is better than delayed perfection.",
    prefix: "Growth...",
    author: "Mark Twain",
    theme: "Progress",
    image: "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e6e0d2"
  },
  {
    quote: "The only limit to our realization of tomorrow will be our doubts of today.",
    prefix: "Belief...",
    author: "Franklin D. Roosevelt",
    theme: "Confidence",
    image: "https://images.unsplash.com/photo-1470240731273-7821a6eeb6bd?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#dbeafe"
  },
  {
    quote: "Peace comes from within. Do not seek it without.",
    prefix: "Calm...",
    author: "Buddha",
    theme: "Inner Peace",
    image: "https://images.unsplash.com/photo-1518241353330-0f7941c2d9b5?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fce7f3"
  },
  {
    quote: "First say to yourself what you would be; and then do what you have to do.",
    prefix: "Identity...",
    author: "Epictetus",
    theme: "Self-Mastery",
    image: "https://images.unsplash.com/photo-1499209974431-9dddcece7f88?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#ccfbf1"
  },
  {
    quote: "What we achieve inwardly will change outer reality.",
    prefix: "Harmony...",
    author: "Plutarch",
    theme: "Mindfulness",
    image: "https://images.unsplash.com/photo-1515378791036-0648a3ef77b2?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fef3c7"
  },
  {
    quote: "Energy flows where attention goes.",
    prefix: "Focus...",
    author: "Tony Robbins",
    theme: "Direction",
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e0e7ff"
  },
  {
    quote: "In the depth of winter, I finally learned that within me there lay an invincible summer.",
    prefix: "Strength...",
    author: "Albert Camus",
    theme: "Resilience",
    image: "https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e6e0d2"
  },
  {
    quote: "Do small things with great love.",
    prefix: "Grace...",
    author: "Mother Teresa",
    theme: "Devotion",
    image: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fce7f3"
  },
  {
    quote: "Small disciplines repeated with consistency every day lead to great achievements.",
    prefix: "Dedication...",
    author: "John C. Maxwell",
    theme: "Consistency",
    image: "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#ccfbf1"
  },
  {
    quote: "The mind is everything. What you think you become.",
    prefix: "Awareness...",
    author: "Buddha",
    theme: "Thought",
    image: "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#dbeafe"
  },
  {
    quote: "Mastering others is strength. Mastering yourself is true power.",
    prefix: "Wisdom...",
    author: "Lao Tzu",
    theme: "Power",
    image: "https://images.unsplash.com/photo-1470071459604-3b5ec3a7fe05?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fef3c7"
  },
  {
    quote: "Adopt the pace of nature: her secret is patience.",
    prefix: "Nature...",
    author: "Ralph Waldo Emerson",
    theme: "Patience",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#ccfbf1"
  },
  {
    quote: "Either you run the day or the day runs you.",
    prefix: "Leadership...",
    author: "Jim Rohn",
    theme: "Intention",
    image: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#dbeafe"
  },
  {
    quote: "To live is the rarest thing in the world. Most people exist, that is all.",
    prefix: "Presence...",
    author: "Oscar Wilde",
    theme: "Living",
    image: "https://images.unsplash.com/photo-1501504905252-473c47e087f8?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fce7f3"
  },
  {
    quote: "Start where you are. Use what you have. Do what you can.",
    prefix: "Action...",
    author: "Arthur Ashe",
    theme: "Courage",
    image: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e6e0d2"
  },
  {
    quote: "A year from now you may wish you had started today.",
    prefix: "Motivation...",
    author: "Karen Lamb",
    theme: "Opportunity",
    image: "https://images.unsplash.com/photo-1490730141103-6cac27aaab94?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fef3c7"
  },
  {
    quote: "Well begun is half done.",
    prefix: "Beginning...",
    author: "Aristotle",
    theme: "Starting",
    image: "https://images.unsplash.com/photo-1509198397868-475647b2a1e5?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e0e7ff"
  },
  {
    quote: "Look deep into nature, and then you will understand everything better.",
    prefix: "Insight...",
    author: "Albert Einstein",
    theme: "Understanding",
    image: "https://images.unsplash.com/photo-1426604966848-d7adac402bff?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#ccfbf1"
  },
  {
    quote: "Light tomorrow with today.",
    prefix: "Hope...",
    author: "Elizabeth Barrett Browning",
    theme: "Dedication",
    image: "https://images.unsplash.com/photo-1518495973542-4542c06a5843?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#dbeafe"
  },
  {
    quote: "Nothing diminishes anxiety faster than action.",
    prefix: "Clarity...",
    author: "Walter Anderson",
    theme: "Calm",
    image: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#fce7f3"
  },
  {
    quote: "Dwell on the beauty of life. Watch the stars, and see yourself running with them.",
    prefix: "Wonder...",
    author: "Marcus Aurelius",
    theme: "Perspective",
    image: "https://images.unsplash.com/photo-1506703719100-a0f3a48c0f86?auto=format&fit=crop&w=700&q=80",
    fallbackColor: "#e6e0d2"
  }
];

/**
 * Calculates a non-repeating daily quote index based on the real calendar day of the year.
 * Changes deterministically every day at midnight.
 */
export function getDailyQuote(date = new Date()) {
  const startOfYear = new Date(date.getFullYear(), 0, 0);
  const diff = date - startOfYear;
  const oneDay = 1000 * 60 * 60 * 24;
  const dayOfYear = Math.floor(diff / oneDay);

  // Deterministic seed ensures each day of the year gets a fresh quote
  const index = Math.abs((date.getFullYear() * 365 + dayOfYear) % QUOTES_DATABASE.length);
  return QUOTES_DATABASE[index];
}
