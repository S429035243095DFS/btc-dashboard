// netlify/functions/fetch-btc-data.js
const fetch = require('node-fetch');

exports.handler = async function(event, context) {
  try {
    // Your TAAPI.IO API key
    const TAAPI_API_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJjbHVlIjoiNjhmNzVjMzY4MDZmZjE2NTFlODYzZDliIiwiaWF0IjoxNzYxMDQxNDYyLCJleHAiOjMzMjY1NTA1NDYyfQ.yb4aQ_uFvz0Pw7c9jrPNkGLPVrfxHJDDBBs-fCwEjBg';
    
    // 1. Get current BTC price from CoinGecko
    const geckoResponse = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_vol=true&include_market_cap=true');
    const geckoData = await geckoResponse.json();
    const currentPrice = geckoData.bitcoin.usd;

    // 2. Get technical indicators from TAAPI.IO
    const taapiUrl = `https://api.taapi.io/bulk?secret=${TAAPI_API_KEY}&exchange=binance&symbol=BTC/USDT&interval=1d`;
    
    const indicatorsResponse = await fetch(taapiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        "indicators": [
          {"indicator": "rsi", "period": 7},
          {"indicator": "rsi", "period": 14},
          {"indicator": "macd"},
          {"indicator": "ema", "period": 20},
          {"indicator": "ema", "period": 50},
          {"indicator": "atr", "period": 14}
        ]
      })
    });
    
    const taapiData = await indicatorsResponse.json();

    // Helper function to find indicator values
    const findIndicator = (data, indicator, period = null) => {
      const result = data.find(item => 
        item.indicator === indicator && 
        (period === null || item.period === period)
      );
      return result ? result.value : null;
    };

    // 3. Get Open Interest and Funding Rate from Bybit
    const bybitResponse = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
    const bybitData = await bybitResponse.json();
    
    const openInterest = bybitData.result.list[0]?.openInterest || 0;
    const fundingRate = bybitData.result.list[0]?.fundingRate || '0.00%';

    // Structure the final data
    const finalData = {
      price: currentPrice,
      rsi7: findIndicator(taapiData, 'rsi', 7),
      rsi14: findIndicator(taapiData, 'rsi', 14),
      macd: findIndicator(taapiData, 'macd'),
      ema20: findIndicator(taapiData, 'ema', 20),
      ema50: findIndicator(taapiData, 'ema', 50),
      atr14: findIndicator(taapiData, 'atr', 14),
      openInterest: parseFloat(openInterest),
      fundingRate: fundingRate
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalData)
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ error: 'Failed to fetch real-time data' })
    };
  }
};