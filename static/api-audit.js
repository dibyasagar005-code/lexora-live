/**
 * LexorA API Audit Tool
 * Tests all market API integrations and generates a comprehensive report
 */
const LexoraAPIAudit = {
  results: [],
  
  async testAPI(name, url, method = 'GET', testFn = null) {
    const result = {
      name: name,
      url: url,
      method: method,
      status: 'PENDING',
      statusCode: null,
      error: null,
      responseTime: null,
      data: null
    };
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method: method,
        headers: {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        }
      });
      
      result.statusCode = response.status;
      result.responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        result.status = 'FAILED';
        result.error = `HTTP ${response.status}`;
        return result;
      }
      
      const text = await response.text();
      
      try {
        const data = JSON.parse(text);
        result.data = data;
        
        if (testFn) {
          const testResult = testFn(data);
          result.status = testResult.success ? 'WORKING' : 'FAILED';
          result.error = testResult.error;
        } else {
          result.status = 'WORKING';
        }
      } catch (e) {
        result.status = 'INVALID_JSON';
        result.error = `JSON parse error: ${e.message}`;
        result.data = text.substring(0, 200);
      }
      
    } catch (e) {
      result.status = 'ERROR';
      result.error = e.message;
      result.responseTime = Date.now() - startTime;
    }
    
    this.results.push(result);
    return result;
  },
  
  async testWithProxy(name, url, testFn = null) {
    const proxies = [
      url,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];
    
    for (const proxyUrl of proxies) {
      const result = await this.testAPI(name, proxyUrl, 'GET', testFn);
      if (result.status === 'WORKING') {
        result.proxyUsed = proxyUrl !== url ? proxyUrl : 'DIRECT';
        return result;
      }
    }
    
    return this.results[this.results.length - 1];
  },
  
  generateReport() {
    console.log('\n=== LEXORA API AUDIT REPORT ===\n');
    
    const working = this.results.filter(r => r.status === 'WORKING');
    const failed = this.results.filter(r => r.status !== 'WORKING');
    
    console.log(`Total APIs Tested: ${this.results.length}`);
    console.log(`Working: ${working.length}`);
    console.log(`Failed: ${failed.length}\n`);
    
    console.log('=== WORKING APIS ===');
    working.forEach(r => {
      console.log(`✓ ${r.name}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  Status: ${r.statusCode}`);
      console.log(`  Response Time: ${r.responseTime}ms`);
      if (r.proxyUsed) console.log(`  Proxy: ${r.proxyUsed}`);
      console.log('');
    });
    
    console.log('\n=== FAILED APIS ===');
    failed.forEach(r => {
      console.log(`✗ ${r.name}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  Status: ${r.status}`);
      console.log(`  Error: ${r.error}`);
      if (r.statusCode) console.log(`  HTTP Status: ${r.statusCode}`);
      console.log('');
    });
    
    return {
      total: this.results.length,
      working: working.length,
      failed: failed.length,
      results: this.results
    };
  },
  
  async runFullAudit() {
    console.log('Starting LexorA API Audit...\n');
    
    // Test Gold APIs
    await this.testWithProxy('Gold - goldprice.org', 'https://data-asg.goldprice.org/dbXRates/USD', (data) => {
      const item = Array.isArray(data?.items) ? data.items[0] : data;
      return {
        success: !!(item?.xauPrice && item.xauPrice > 1500 && item.xauPrice < 8000),
        error: !item?.xauPrice ? 'No xauPrice in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Gold - gold-api.com', 'https://api.gold-api.com/price/XAU', (data) => {
      const price = Number(data?.price ?? data?.metalPrice ?? data?.value);
      return {
        success: !!(price && price > 1500 && price < 8000),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Gold - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 1500 && price < 8000),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    // Test Silver APIs
    await this.testWithProxy('Silver - goldprice.org', 'https://data-asg.goldprice.org/dbXRates/USD', (data) => {
      const item = Array.isArray(data?.items) ? data.items[0] : data;
      return {
        success: !!(item?.xagPrice && item.xagPrice > 12 && item.xagPrice < 150),
        error: !item?.xagPrice ? 'No xagPrice in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Silver - gold-api.com', 'https://api.gold-api.com/price/XAG', (data) => {
      const price = Number(data?.price ?? data?.metalPrice ?? data?.value);
      return {
        success: !!(price && price > 12 && price < 150),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Silver - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 12 && price < 150),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    // Test Platinum
    await this.testWithProxy('Platinum - goldprice.org', 'https://data-asg.goldprice.org/dbXRates/USD', (data) => {
      const item = Array.isArray(data?.items) ? data.items[0] : data;
      const price = item?.xptPrice || item?.xpt;
      return {
        success: !!(price && price > 700 && price < 4000),
        error: !price ? 'No platinum price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Platinum - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/PL=F?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 700 && price < 4000),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    // Test Cryptocurrencies - Binance
    await this.testAPI('Bitcoin - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', 'GET', (data) => {
      const price = Number(data?.lastPrice);
      return {
        success: !!(price && price > 10000 && price < 250000),
        error: !price ? 'No lastPrice in response' : 'Price out of valid range'
      };
    });
    
    await this.testAPI('Ethereum - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', 'GET', (data) => {
      const price = Number(data?.lastPrice);
      return {
        success: !!(price && price > 500 && price < 25000),
        error: !price ? 'No lastPrice in response' : 'Price out of valid range'
      };
    });
    
    await this.testAPI('Solana - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT', 'GET', (data) => {
      const price = Number(data?.lastPrice);
      return {
        success: !!(price && price > 10 && price < 300),
        error: !price ? 'No lastPrice in response' : 'Price out of valid range'
      };
    });
    
    await this.testAPI('Ripple - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=XRPUSDT', 'GET', (data) => {
      const price = Number(data?.lastPrice);
      return {
        success: !!(price && price > 0.2 && price < 5),
        error: !price ? 'No lastPrice in response' : 'Price out of valid range'
      };
    });
    
    // Test Cryptocurrencies - CoinGecko
    await this.testWithProxy('Bitcoin - CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', (data) => {
      const price = data?.bitcoin?.usd;
      return {
        success: !!(price && price > 10000 && price < 250000),
        error: !price ? 'No bitcoin.usd in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Ethereum - CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true', (data) => {
      const price = data?.ethereum?.usd;
      return {
        success: !!(price && price > 500 && price < 25000),
        error: !price ? 'No ethereum.usd in response' : 'Price out of valid range'
      };
    });
    
    // Test Stocks - Yahoo Finance
    await this.testWithProxy('Apple - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 100 && price < 250),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Tesla - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 150 && price < 400),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Microsoft - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/MSFT?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 300 && price < 500),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Google - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/GOOGL?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 120 && price < 200),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    // Test Commodities - Yahoo Finance
    await this.testWithProxy('Crude Oil - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 35 && price < 200),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Natural Gas - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/NG=F?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 1.5 && price < 10),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    // Test Indices - Yahoo Finance
    await this.testWithProxy('S&P 500 - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 3000 && price < 9000),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('NASDAQ - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/^IXIC?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 10000 && price < 35000),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    await this.testWithProxy('Dow Jones - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/^DJI?interval=1m&range=1d', (data) => {
      const result = data?.chart?.result?.[0];
      const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      return {
        success: !!(price && price > 30000 && price < 45000),
        error: !price ? 'No price in response' : 'Price out of valid range'
      };
    });
    
    // Test Forex - Frankfurter
    await this.testAPI('Forex - Frankfurter', 'https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP', 'GET', (data) => {
      const rates = data?.rates;
      return {
        success: !!(rates && rates.INR && rates.EUR && rates.GBP),
        error: !rates ? 'No rates in response' : 'Missing required currency pairs'
      };
    });
    
    await this.testAPI('Forex - open.er-api', 'https://open.er-api.com/v6/latest/USD', 'GET', (data) => {
      const rates = data?.rates;
      return {
        success: !!(rates && rates.INR && rates.EUR && rates.GBP),
        error: !rates ? 'No rates in response' : 'Missing required currency pairs'
      };
    });
    
    return this.generateReport();
  }
};

// Make available globally
window.LexoraAPIAudit = LexoraAPIAudit;

// Auto-run if loaded directly
if (typeof window !== 'undefined') {
  console.log('LexorA API Audit Tool loaded. Run LexoraAPIAudit.runFullAudit() to start audit.');
}
