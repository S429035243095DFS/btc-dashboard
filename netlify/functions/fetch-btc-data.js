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
    let rsi7 = 50.0;
    let rsi14 = 50.0;
    let macd = 0.0;
    let ema20 = currentPrice;
    let ema50 = currentPrice;
    let atr14 = 500.0;

    try {
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

      rsi7 = findIndicator(taapiData, 'rsi', 7) || 50.0;
      rsi14 = findIndicator(taapiData, 'rsi', 14) || 50.0;
      macd = findIndicator(taapiData, 'macd') || 0.0;
      ema20 = findIndicator(taapiData, 'ema', 20) || currentPrice;
      ema50 = findIndicator(taapiData, 'ema', 50) || currentPrice;
      atr14 = findIndicator(taapiData, 'atr', 14) || 500.0;
    } catch (taapiError) {
      console.log('TAAPI error, using defaults:', taapiError.message);
    }

    // 3. Get Open Interest and Funding Rate with better error handling
    let openInterest = 1500000000;
    let fundingRate = "0.003%";

    try {
      const bybitResponse = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
      if (bybitResponse.ok) {
        const bybitData = await bybitResponse.json();
        openInterest = bybitData.result.list[0]?.openInterest || 1500000000;
        fundingRate = bybitData.result.list[0]?.fundingRate || "0.003%";
      }
    } catch (bybitError) {
      console.log('Bybit error, using defaults:', bybitError.message);
    }

    // Structure the final data
    const finalData = {
      price: currentPrice,
      rsi7: rsi7,
      rsi14: rsi14,
      macd: macd,
      ema20: ema20,
      ema50: ema50,
      atr14: atr14,
      openInterest: parseFloat(openInterest),
      fundingRate: fundingRate
    };

    console.log('Final data:', finalData);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalData)
    };
  } catch (error) {
    console.error('Main function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ 
        error: 'Failed to fetch real-time data',
        details: error.message 
      })
    };
  }
};