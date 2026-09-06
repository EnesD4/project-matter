import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import axios from 'axios';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;

app.use(cors());
app.use(express.json());

// Stock Search Endpoint
app.get('/api/stocks/search', async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query) {
      return res.json([]);
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/search?q=${query}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data.result || []);
  } catch (error) {
    console.error('Error fetching search results:', error);
    res.status(500).json({ error: 'Failed to fetch search results' });
  }
});

// Company Profile Endpoint (logo, market cap, website domain, etc.)
app.get('/api/stocks/profile', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/stock/profile2?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching company profile:', error);
    res.status(500).json({ error: 'Failed to fetch company profile' });
  }
});

// Stock Quote Endpoint
app.get('/api/stocks/quote', async (req, res) => {
  try {
    const symbol = req.query.symbol as string;
    if (!symbol) {
      return res.status(400).json({ error: 'Symbol is required' });
    }
    const response = await axios.get(
      `https://finnhub.io/api/v1/quote?symbol=${symbol}&token=${FINNHUB_API_KEY}`
    );
    res.json(response.data);
  } catch (error) {
    console.error('Error fetching stock quote:', error);
    res.status(500).json({ error: 'Failed to fetch stock quote' });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});