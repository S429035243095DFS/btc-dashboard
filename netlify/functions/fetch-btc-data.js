// netlify/functions/fetch-btc-data.js
exports.handler = async function(event, context) {
  try {
    // For now, we'll return sample data
    // In the next steps we'll add real API calls
    const sampleData = {
      price: 67500.50,
      rsi7: 56.234,
      rsi14: 52.167,
      macd: -45.678,
      ema20: 67200.75,
      ema50: 66500.25,
      atr14: 1200.45,
      openInterest: 1543200000,
      fundingRate: "0.005%"
    };

    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sampleData)
    };
  } catch (error) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Failed to fetch data' })
    };
  }
};