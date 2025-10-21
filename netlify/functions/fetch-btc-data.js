// netlify/functions/fetch-btc-data.js
const { HermesClient } = require('@pythnetwork/hermes-client');

// Helper functions to calculate indicators
function calculateEMA(prices, period) {
  const k = 2 / (period + 1);
  let ema = prices[0];
  for (let i = 1; i < prices.length; i++) {
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function calculateRSI(prices, period) {
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i < period + 1; i++) {
    const difference = prices[i] - prices[i - 1];
    if (difference >= 0) {
      gains += difference;
    } else {
      losses -= difference;
    }
  }
  
  const averageGain = gains / period;
  const averageLoss = losses / period;
  const relativeStrength = averageGain / averageLoss;
  
  return 100 - (100 / (1 + relativeStrength));
}

function calculateMACD(prices) {
  const ema12 = calculateEMA(prices, 12);
  const ema26 = calculateEMA(prices, 26);
  const macdLine = ema12 - ema26;
  return macdLine;
}

function calculateATR(highPrices, lowPrices, closePrices, period) {
  let totalTR = 0;
  
  for (let i = 1; i < period + 1; i++) {
    const highLow = highPrices[i] - lowPrices[i];
    const highPrevClose = Math.abs(highPrices[i] - closePrices[i - 1]);
    const lowPrevClose = Math.abs(lowPrices[i] - closePrices[i - 1]);
    const trueRange = Math.max(highLow, highPrevClose, lowPrevClose);
    totalTR += trueRange;
  }
  
  return totalTR / period;
}

exports.handler = async function (event, context) {
  try {
    // 1. Get live BTC/USD price from Pyth Network using Hermes Client
    const connection = new HermesClient("https://hermes.pyth.network");
    // Official BTC/USD price feed ID on Pyth mainnet
    const btcPriceId = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
    
    let currentPrice = 0;
    try {
      // Use the correct method for the Hermes client
      const priceFeed = await connection.getPriceFeed(btcPriceId);
      // Get the current price
      const price = priceFeed.getPriceUnchecked();
      // Pyth prices are scaled; this converts them to a normal number
      currentPrice = price.price * Math.pow(10, price.expo);
    } catch (pythError) {
      console.error('Pyth price fetch failed:', pythError);
      return {
        statusCode: 500,
        headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Failed to fetch price from Pyth' })
      };
    }

    // 2. Calculate technical indicators (using mock historical data for the example)
    const mockPrices = [107500, 107600, 107450, 107700, 107800, 107750, 107900, 108000, 108100, 108050, 108200, 108150, 108300, 108250, 108400, 108350, 108500, 108450, 108600, 108550, currentPrice];
    const mockHighs = mockPrices.map(price => price + 50);
    const mockLows = mockPrices.map(price => price - 50);

    const rsi7 = calculateRSI(mockPrices, 7);
    const rsi14 = calculateRSI(mockPrices, 14);
    const macd = calculateMACD(mockPrices);
    const ema20 = calculateEMA(mockPrices, 20);
    const ema50 = calculateEMA(mockPrices, 50);
    const atr14 = calculateATR(mockHighs, mockLows, mockPrices, 14);

    // 3. Structure and return the final data
    const finalData = {
      price: currentPrice,
      rsi7: rsi7,
      rsi14: rsi14,
      macd: macd,
      ema20: ema20,
      ema50: ema50,
      atr14: atr14,
      // Note: Open Interest and Funding Rate still need a separate source like an exchange API
      openInterest: 1543200000,
      fundingRate: "0.0012%"
    };

    console.log('Data with calculated indicators:', finalData);

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(finalData)
    };
  } catch (error) {
    console.error('Global function error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        error: 'Function execution failed',
        details: error.message
      })
    };
  }
};