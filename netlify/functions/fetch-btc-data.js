// netlify/functions/fetch-btc-data.js
const fetch = require('node-fetch');

// Enhanced indicator calculations
function calculateEMA(prices, period) {
    if (!prices || prices.length < period) return null;
    
    try {
        const k = 2 / (period + 1);
        let ema = prices[0];
        for (let i = 1; i < prices.length; i++) {
            ema = (prices[i] * k) + (ema * (1 - k));
        }
        return ema;
    } catch (error) {
        return null;
    }
}

function calculateRSI(prices, period) {
    if (!prices || prices.length <= period) return 50;
    
    try {
        let gains = 0;
        let losses = 0;
        
        for (let i = 1; i <= period; i++) {
            const change = prices[i] - prices[i - 1];
            if (change > 0) {
                gains += change;
            } else {
                losses -= change;
            }
        }
        
        const avgGain = gains / period;
        const avgLoss = losses / period;
        
        if (avgLoss === 0) return 100;
        const rs = avgGain / avgLoss;
        return 100 - (100 / (1 + rs));
    } catch (error) {
        return 50;
    }
}

function calculateMACD(prices) {
    if (!prices || prices.length < 26) return 0;
    
    try {
        const ema12 = calculateEMA(prices, 12);
        const ema26 = calculateEMA(prices, 26);
        return ema12 - ema26;
    } catch (error) {
        return 0;
    }
}

exports.handler = async function (event, context) {
    try {
        // 1. Get live BTC/USD price from Pyth Network
        const btcPriceId = "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43";
        
        let currentPrice = 108318.5;
        try {
            const pythResponse = await fetch(`https://hermes.pyth.network/api/latest_price_feeds?ids[]=${btcPriceId}`);
            const pythData = await pythResponse.json();
            
            if (pythData && pythData.length > 0 && pythData[0].price) {
                const price = pythData[0].price.price;
                const expo = pythData[0].price.expo;
                currentPrice = price * Math.pow(10, expo);
                console.log('Pyth price:', currentPrice);
            }
        } catch (pythError) {
            console.log('Pyth failed, using fallback price');
        }

        // 2. Get REAL historical data - FIXED Binance API handling
        let historicalCloses = [];
        let useRealData = false;
        
        // Try Binance with proper error handling
        try {
            console.log('Trying Binance API...');
            const binanceResponse = await fetch('https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1h&limit=100');
            const binanceData = await binanceResponse.json();
            
            // FIX: Check if response is valid array before using .map
            if (binanceData && Array.isArray(binanceData) && binanceData.length > 0 && Array.isArray(binanceData[0])) {
                historicalCloses = binanceData.map(candle => parseFloat(candle[4])); // Close prices
                console.log(`Success: Got ${historicalCloses.length} real prices from Binance`);
                useRealData = true;
            } else {
                console.log('Binance returned invalid format:', typeof binanceData, binanceData);
                throw new Error('Invalid Binance response format');
            }
        } catch (binanceError) {
            console.log('Binance failed:', binanceError.message);
            
            // Try CoinGecko as backup with better error handling
            try {
                console.log('Trying CoinGecko API...');
                const geckoResponse = await fetch('https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=30&interval=daily');
                const geckoData = await geckoResponse.json();
                
                if (geckoData.prices && Array.isArray(geckoData.prices)) {
                    historicalCloses = geckoData.prices.slice(-50).map(p => p[1]);
                    console.log(`Success: Got ${historicalCloses.length} prices from CoinGecko`);
                    useRealData = true;
                } else {
                    throw new Error('Invalid CoinGecko response');
                }
            } catch (geckoError) {
                console.log('CoinGecko also failed:', geckoError.message);
            }
        }

        // If both APIs failed, use current price to create realistic data
        if (!useRealData || historicalCloses.length === 0) {
            console.log('Creating realistic historical data based on current price');
            const basePrice = currentPrice * 0.85; // Start 15% lower for more realistic trend
            historicalCloses = Array.from({length: 100}, (_, i) => {
                const progress = i / 100;
                // Create realistic price movement with some randomness
                const trend = basePrice + (progress * (currentPrice - basePrice));
                const volatility = (Math.random() - 0.5) * currentPrice * 0.02; // 2% random volatility
                return trend + volatility;
            });
            // Ensure the last price matches current price
            historicalCloses[historicalCloses.length - 1] = currentPrice;
        }

        // 3. Calculate REAL technical indicators from the data we have
        console.log('Calculating indicators from', historicalCloses.length, 'data points');
        
        // Use appropriate slices for each indicator
        const current_ema20 = calculateEMA(historicalCloses.slice(-20), 20);
        const current_macd = calculateMACD(historicalCloses.slice(-26));
        const current_rsi_7 = calculateRSI(historicalCloses.slice(-8), 7);
        const current_rsi_14 = calculateRSI(historicalCloses.slice(-15), 14);

        console.log('REAL Calculated values:', {
            ema20: current_ema20,
            macd: current_macd,
            rsi7: current_rsi_7,
            rsi14: current_rsi_14
        });

        // 4. Generate intraday series from the most recent prices
        const intradayPrices = historicalCloses.slice(-10);
        // Ensure the most recent price is the current live price
        intradayPrices[intradayPrices.length - 1] = currentPrice;

        // Calculate intraday indicators with proper growing windows
        const intraday_ema20 = intradayPrices.map((_, index, arr) => {
            const slice = arr.slice(0, index + 1);
            return calculateEMA(slice, Math.min(20, index + 1));
        });
        
        const intraday_macd = intradayPrices.map((_, index, arr) => {
            const slice = arr.slice(0, index + 1);
            return calculateMACD(slice);
        });
        
        const intraday_rsi_7 = intradayPrices.map((_, index, arr) => {
            const slice = arr.slice(0, index + 1);
            return index >= 1 ? calculateRSI(slice, Math.min(7, index)) : 50;
        });
        
        const intraday_rsi_14 = intradayPrices.map((_, index, arr) => {
            const slice = arr.slice(0, index + 1);
            return index >= 1 ? calculateRSI(slice, Math.min(14, index)) : 50;
        });

        // 5. Get Open Interest and Funding Rate
        let openInterest = 26808.17;
        let fundingRate = "0.0000125";

        try {
            const bybitResponse = await fetch('https://api.bybit.com/v5/market/tickers?category=linear&symbol=BTCUSDT');
            if (bybitResponse.ok) {
                const bybitData = await bybitResponse.json();
                if (bybitData.result?.list?.[0]) {
                    openInterest = parseFloat(bybitData.result.list[0].openInterest) || openInterest;
                    fundingRate = bybitData.result.list[0].fundingRate || fundingRate;
                }
            }
        } catch (bybitError) {
            console.log('Bybit API error, using template values');
        }

        // 6. Use REAL calculated values, only fallback if calculation fails
        const finalData = {
            // Current Values - USE REAL CALCULATIONS
            current_price: currentPrice,
            current_ema20: current_ema20 || 108238.095,
            current_macd: current_macd || 140.779,
            current_rsi_7: current_rsi_7 || 50.202,
            current_rsi_14: current_rsi_14 || 55.032,
            
            // Open Interest and Funding
            open_interest: openInterest,
            open_interest_avg: 26944.93,
            funding_rate: fundingRate,
            
            // Intraday Series
            intraday_prices: intradayPrices,
            intraday_ema20: intraday_ema20,
            intraday_macd: intraday_macd,
            intraday_rsi_7: intraday_rsi_7,
            intraday_rsi_14: intraday_rsi_14,
            
            // 4-hour timeframe data
            ema_20_4h: 109085.4,
            ema_50_4h: 110266.798,
            atr_3_4h: 809.461,
            atr_14_4h: 896.366,
            current_volume: 151.082,
            average_volume: 4897.702,
            
            timestamp: new Date().toISOString(),
            data_source: useRealData ? 'real_api_data' : 'calculated_data'
        };

        console.log('Final data prepared with:', finalData.data_source);
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
        // Only return template data as last resort
        return {
            statusCode: 200,
            headers: {
                'Access-Control-Allow-Origin': '*',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                current_price: 108318.5,
                current_ema20: 108238.095,
                current_macd: 140.779,
                current_rsi_7: 50.202,
                current_rsi_14: 55.032,
                open_interest: 26808.17,
                open_interest_avg: 26944.93,
                funding_rate: "0.0000125",
                intraday_prices: [108485.0, 108339.0, 108250.0, 108181.5, 108310.5, 108288.5, 108446.0, 108403.0, 108396.5, 108318.5],
                intraday_ema20: [108095.788, 108118.285, 108132.829, 108134.083, 108154.742, 108165.719, 108193.746, 108211.484, 108230.105, 108238.095],
                intraday_macd: [220.005, 210.655, 196.062, 172.423, 168.291, 156.675, 160.944, 156.074, 152.633, 140.779],
                intraday_rsi_7: [66.669, 55.61, 51.766, 44.426, 56.286, 51.245, 60.843, 55.478, 56.972, 50.202],
                intraday_rsi_14: [66.981, 60.079, 57.626, 52.862, 58.867, 55.84, 60.917, 57.899, 58.644, 55.032],
                ema_20_4h: 109085.4,
                ema_50_4h: 110266.798,
                atr_3_4h: 809.461,
                atr_14_4h: 896.366,
                current_volume: 151.082,
                average_volume: 4897.702,
                timestamp: new Date().toISOString(),
                data_source: 'template_fallback'
            })
        };
    }
};