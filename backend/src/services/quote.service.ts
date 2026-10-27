import { prisma } from '../models/prisma';
import axios from 'axios';

interface QuoteItem {
  quote: string;
  author: string;
  theme: string;
  fallbackImage: string;
}

const CURATED_QUOTES: QuoteItem[] = [
  {
    quote: "Focused, intentional, and ready for the month ahead.",
    author: "Mindful Living",
    theme: "mindfulness,workspace,minimalist",
    fallbackImage: "https://images.unsplash.com/photo-1544717305-2782549b5136?auto=format&fit=crop&w=800&q=80",
  },
  {
    quote: "You do not rise to the level of your goals. You fall to the level of your systems.",
    author: "James Clear",
    theme: "desk,journal,study",
    fallbackImage: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?auto=format&fit=crop&w=800&q=80",
  },
  {
    quote: "We are what we repeatedly do. Excellence, then, is not an act, but a habit.",
    author: "Aristotle",
    theme: "morning,routine,coffee",
    fallbackImage: "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=800&q=80",
  },
  {
    quote: "Great things are done by a series of small things brought together.",
    author: "Vincent van Gogh",
    theme: "art,drawing,creative",
    fallbackImage: "https://images.unsplash.com/photo-1579783900882-c0d3dad7b119?auto=format&fit=crop&w=800&q=80",
  },
  {
    quote: "The soul becomes dyed with the color of its thoughts.",
    author: "Marcus Aurelius",
    theme: "nature,sunlight,peace",
    fallbackImage: "https://images.unsplash.com/photo-1506126613408-eca07ce68773?auto=format&fit=crop&w=800&q=80",
  },
  {
    quote: "You can't use up creativity. The more you use, the more you have.",
    author: "Maya Angelou",
    theme: "writing,craft,notebook",
    fallbackImage: "https://images.unsplash.com/photo-1460518451282-c93d30906a24?auto=format&fit=crop&w=800&q=80",
  },
  {
    quote: "Simplicity is the ultimate sophistication.",
    author: "Leonardo da Vinci",
    theme: "architecture,minimal,zen",
    fallbackImage: "https://images.unsplash.com/photo-1497633762265-9d179a990aa6?auto=format&fit=crop&w=800&q=80",
  },
];

export class QuoteService {
  /**
   * Retrieves today's cached quote or generates a fresh daily quote and image
   */
  async getDailyQuote(): Promise<{
    date: string;
    quote: string;
    author: string;
    imageUrl: string;
  }> {
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];

    try {
      // Check database cache first
      const cached = await prisma.dailyQuoteCache.findUnique({
        where: { date: dateStr },
      });

      if (cached) {
        return {
          date: cached.date,
          quote: cached.quote,
          author: cached.author,
          imageUrl: cached.image_url,
        };
      }
    } catch (e) {
      console.warn('Quote cache query bypassed (db offline or initializing)');
    }

    // Refresh and cache for today
    return this.refreshDailyQuote(dateStr);
  }

  /**
   * Fetches fresh quote and Unsplash image, then caches in database
   */
  async refreshDailyQuote(targetDate?: string): Promise<{
    date: string;
    quote: string;
    author: string;
    imageUrl: string;
  }> {
    const today = new Date();
    const dateStr = targetDate || today.toISOString().split('T')[0];

    // Deterministic selection based on day of year
    const startOfYear = new Date(today.getFullYear(), 0, 0);
    const diff = today.getTime() - startOfYear.getTime();
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const quoteIndex = dayOfYear % CURATED_QUOTES.length;
    const item = CURATED_QUOTES[quoteIndex];

    let imageUrl = item.fallbackImage;

    // Optional Unsplash API integration if API key is provided
    const unsplashKey = process.env.UNSPLASH_ACCESS_KEY;
    if (unsplashKey && unsplashKey !== 'your-unsplash-access-key') {
      try {
        const response = await axios.get('https://api.unsplash.com/photos/random', {
          params: { query: item.theme, orientation: 'squarish' },
          headers: { Authorization: `Client-ID ${unsplashKey}` },
          timeout: 4000,
        });
        if (response.data?.urls?.regular) {
          imageUrl = response.data.urls.regular;
        }
      } catch (err) {
        console.warn('Unsplash API request failed, using high-res fallback image:', (err as Error).message);
      }
    }

    // Cache in database
    try {
      await prisma.dailyQuoteCache.upsert({
        where: { date: dateStr },
        update: {
          quote: item.quote,
          author: item.author,
          image_url: imageUrl,
        },
        create: {
          date: dateStr,
          quote: item.quote,
          author: item.author,
          image_url: imageUrl,
        },
      });
    } catch (e) {
      console.warn('Could not persist quote to cache table:', (e as Error).message);
    }

    return {
      date: dateStr,
      quote: item.quote,
      author: item.author,
      imageUrl,
    };
  }
}

export const quoteService = new QuoteService();
