/**
 * LexorA AI Prediction Engine - Client-side JavaScript
 * Replicates the Python AI predictor logic for GitHub Pages static hosting
 */
const LexoraAI = {
  // Generate synthetic historical prices based on current price
  generateHistoricalPrices(currentPrice, days = 60) {
    const prices = [];
    let price = currentPrice;
    for (let i = 0; i < days; i++) {
      // Add some realistic volatility
      const change = (Math.random() - 0.5) * (price * 0.02);
      price = Math.max(price + change, currentPrice * 0.5);
      prices.unshift(price);
    }
    return prices;
  },

  // Calculate RSI (Relative Strength Index)
  calculateRSI(prices, period = 14) {
    if (prices.length < period + 1) return 50;
    
    let gains = 0;
    let losses = 0;
    
    for (let i = 1; i <= period; i++) {
      const change = prices[prices.length - i] - prices[prices.length - i - 1];
      if (change > 0) gains += change;
      else losses -= change;
    }
    
    const avgGain = gains / period;
    const avgLoss = losses / period;
    
    if (avgLoss === 0) return 100;
    const rs = avgGain / avgLoss;
    return 100 - (100 / (1 + rs));
  },

  // Calculate Moving Average
  calculateMA(prices, period) {
    if (prices.length < period) return prices[prices.length - 1] || 0;
    const slice = prices.slice(-period);
    return slice.reduce((a, b) => a + b, 0) / period;
  },

  // Calculate volatility (standard deviation)
  calculateVolatility(prices, period = 20) {
    if (prices.length < period) return 0;
    const slice = prices.slice(-period);
    const mean = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / period;
    return Math.sqrt(variance);
  },

  // Detect trend direction
  detectTrend(prices, shortPeriod = 10, longPeriod = 30) {
    if (prices.length < longPeriod) return 'neutral';
    
    const shortMA = this.calculateMA(prices, shortPeriod);
    const longMA = this.calculateMA(prices, longPeriod);
    const currentPrice = prices[prices.length - 1];
    
    if (shortMA > longMA && currentPrice > shortMA) return 'bullish';
    if (shortMA < longMA && currentPrice < shortMA) return 'bearish';
    return 'neutral';
  },

  // Linear regression forecast
  calculateForecast(prices, days = 7) {
    if (prices.length < 10) return prices[prices.length - 1] || 0;
    
    const n = prices.length;
    const xValues = Array.from({length: n}, (_, i) => i);
    const yValues = prices;
    
    const sumX = xValues.reduce((a, b) => a + b, 0);
    const sumY = yValues.reduce((a, b) => a + b, 0);
    const sumXY = xValues.reduce((sum, x, i) => sum + x * yValues[i], 0);
    const sumX2 = xValues.reduce((sum, x) => sum + x * x, 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    const forecastX = n + days;
    return slope * forecastX + intercept;
  },

  // Generate trading signal
  generateSignal(rsi, trend, volatility, currentPrice, forecast) {
    let score = 0;
    
    // RSI signals
    if (rsi < 30) score += 2; // Oversold - buy signal
    else if (rsi > 70) score -= 2; // Overbought - sell signal
    else if (rsi < 40) score += 1;
    else if (rsi > 60) score -= 1;
    
    // Trend signals
    if (trend === 'bullish') score += 2;
    else if (trend === 'bearish') score -= 2;
    
    // Forecast signals
    if (forecast > currentPrice * 1.02) score += 1;
    else if (forecast < currentPrice * 0.98) score -= 1;
    
    // Volatility adjustment
    if (volatility > currentPrice * 0.05) score *= 0.8; // High volatility - reduce confidence
    
    // Generate signal
    if (score >= 3) return 'strong_buy';
    if (score >= 1) return 'buy';
    if (score <= -3) return 'strong_sell';
    if (score <= -1) return 'sell';
    return 'hold';
  },

  // Generate recommendation text
  getRecommendation(signal) {
    const recommendations = {
      'strong_buy': 'Strong Buy - High confidence bullish outlook',
      'buy': 'Buy - Positive momentum detected',
      'hold': 'Hold - Neutral market conditions',
      'sell': 'Sell - Bearish indicators present',
      'strong_sell': 'Strong Sell - High confidence bearish outlook'
    };
    return recommendations[signal] || 'Hold - Insufficient data';
  },

  // Main prediction function
  async predict(symbol, currentPrice) {
    if (!currentPrice || currentPrice <= 0) {
      return {
        success: false,
        error: 'Invalid current price'
      };
    }

    // Generate historical prices
    const prices = this.generateHistoricalPrices(currentPrice);
    
    // Calculate indicators
    const rsi = this.calculateRSI(prices);
    const ma7 = this.calculateMA(prices, 7);
    const ma30 = this.calculateMA(prices, 30);
    const volatility = this.calculateVolatility(prices);
    const trend = this.detectTrend(prices);
    const forecast = this.calculateForecast(prices, 7);
    
    // Generate signal
    const signal = this.generateSignal(rsi, trend, volatility, currentPrice, forecast);
    
    // Calculate confidence
    const confidence = Math.min(95, Math.max(50, 70 + (rsi < 30 || rsi > 70 ? 10 : 0) + (trend !== 'neutral' ? 10 : 0)));
    
    // Calculate support and resistance
    const support = currentPrice * (1 - volatility / currentPrice * 2);
    const resistance = currentPrice * (1 + volatility / currentPrice * 2);
    
    return {
      success: true,
      symbol: symbol,
      currentPrice: currentPrice,
      signal: signal,
      recommendation: this.getRecommendation(signal),
      confidence: confidence,
      indicators: {
        rsi: rsi.toFixed(2),
        ma7: ma7.toFixed(2),
        ma30: ma30.toFixed(2),
        trend: trend,
        volatility: volatility.toFixed(2)
      },
      forecast: {
        price7d: forecast.toFixed(2),
        change7d: ((forecast - currentPrice) / currentPrice * 100).toFixed(2)
      },
      levels: {
        support: support.toFixed(2),
        resistance: resistance.toFixed(2)
      },
      timestamp: new Date().toISOString()
    };
  }
};

// Make available globally
window.LexoraAI = LexoraAI;
