/**
 * Comprehensive API Testing Script for LexorA
 * Tests every configured API endpoint with detailed evidence
 */
const LexoraAPITest = {
  results: [],
  
  async testEndpoint(name, url, options = {}) {
    const result = {
      name: name,
      url: url,
      method: options.method || 'GET',
      status: 'PENDING',
      statusCode: null,
      responseTime: null,
      dataSize: null,
      error: null,
      data: null,
      parsedPrice: null,
      timestamp: new Date().toISOString()
    };
    
    const startTime = Date.now();
    
    try {
      const response = await fetch(url, {
        method: options.method || 'GET',
        headers: options.headers || {
          'Accept': 'application/json',
          'Cache-Control': 'no-cache'
        },
        credentials: options.credentials || 'omit'
      });
      
      result.statusCode = response.status;
      result.responseTime = Date.now() - startTime;
      
      if (!response.ok) {
        result.status = 'FAILED';
        result.error = `HTTP ${response.status} ${response.statusText}`;
        return result;
      }
      
      const text = await response.text();
      result.dataSize = text.length;
      
      try {
        const data = JSON.parse(text);
        result.data = data;
        
        if (options.parsePrice) {
          result.parsedPrice = options.parsePrice(data);
        }
        
        if (options.validate) {
          const validation = options.validate(data);
          result.status = validation.success ? 'WORKING' : 'FAILED';
          result.error = validation.error;
        } else {
          result.status = 'WORKING';
        }
      } catch (e) {
        result.status = 'INVALID_JSON';
        result.error = `JSON parse error: ${e.message}`;
        result.data = text.substring(0, 500);
      }
      
    } catch (e) {
      result.status = 'ERROR';
      result.error = e.message;
      result.responseTime = Date.now() - startTime;
    }
    
    this.results.push(result);
    return result;
  },
  
  async testWithProxy(name, url, options = {}) {
    const proxies = [
      url,
      `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
      `https://corsproxy.io/?${encodeURIComponent(url)}`
    ];
    
    for (let i = 0; i < proxies.length; i++) {
      const proxyUrl = proxies[i];
      const result = await this.testEndpoint(name, proxyUrl, options);
      if (result.status === 'WORKING') {
        result.proxyUsed = i === 0 ? 'DIRECT' : proxyUrl;
        return result;
      }
    }
    
    return this.results[this.results.length - 1];
  },
  
  generateDetailedReport() {
    console.log('\n=== LEXORA API DETAILED TEST REPORT ===\n');
    console.log(`Test Time: ${new Date().toISOString()}\n`);
    
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
      console.log(`  Data Size: ${r.dataSize} bytes`);
      if (r.proxyUsed) console.log(`  Proxy: ${r.proxyUsed}`);
      if (r.parsedPrice) console.log(`  Parsed Price: ${r.parsedPrice}`);
      console.log(`  Timestamp: ${r.timestamp}`);
      console.log('');
    });
    
    console.log('\n=== FAILED APIS ===');
    failed.forEach(r => {
      console.log(`✗ ${r.name}`);
      console.log(`  URL: ${r.url}`);
      console.log(`  Status: ${r.status}`);
      console.log(`  Error: ${r.error}`);
      if (r.statusCode) console.log(`  HTTP Status: ${r.statusCode}`);
      if (r.responseTime) console.log(`  Response Time: ${r.responseTime}ms`);
      console.log(`  Timestamp: ${r.timestamp}`);
      console.log('');
    });
    
    return {
      total: this.results.length,
      working: working.length,
      failed: failed.length,
      results: this.results
    };
  },
  
  async runComprehensiveTest() {
    console.log('Starting comprehensive LexorA API Test...\n');
    
    // Test Gold APIs
    await this.testWithProxy('Gold - goldprice.org', 'https://data-asg.goldprice.org/dbXRates/USD', {
      parsePrice: (data) => {
        const item = Array.isArray(data?.items) ? data.items[0] : data;
        return item?.xauPrice;
      },
      validate: (data) => {
        const item = Array.isArray(data?.items) ? data.items[0] : data;
        const price = item?.xauPrice;
        return {
          success: !!(price && price > 1500 && price < 8000),
          error: !price ? 'No xauPrice in response' : `Price ${price} out of valid range (1500-8000)`
        };
      }
    });
    
    await this.testWithProxy('Gold - gold-api.com', 'https://api.gold-api.com/price/XAU', {
      parsePrice: (data) => data?.price ?? data?.metalPrice ?? data?.value,
      validate: (data) => {
        const price = Number(data?.price ?? data?.metalPrice ?? data?.value);
        return {
          success: !!(price && price > 1500 && price < 8000),
          error: !price ? 'No price in response' : `Price ${price} out of valid range (1500-8000)`
        };
      }
    });
    
    await this.testWithProxy('Gold - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/GC=F?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 1500 && price < 8000),
          error: !price ? 'No price in response' : `Price ${price} out of valid range (1500-8000)`
        };
      }
    });
    
    // Test Silver APIs
    await this.testWithProxy('Silver - goldprice.org', 'https://data-asg.goldprice.org/dbXRates/USD', {
      parsePrice: (data) => {
        const item = Array.isArray(data?.items) ? data.items[0] : data;
        return item?.xagPrice;
      },
      validate: (data) => {
        const item = Array.isArray(data?.items) ? data.items[0] : data;
        const price = item?.xagPrice;
        return {
          success: !!(price && price > 12 && price < 150),
          error: !price ? 'No xagPrice in response' : `Price ${price} out of valid range (12-150)`
        };
      }
    });
    
    await this.testWithProxy('Silver - gold-api.com', 'https://api.gold-api.com/price/XAG', {
      parsePrice: (data) => data?.price ?? data?.metalPrice ?? data?.value,
      validate: (data) => {
        const price = Number(data?.price ?? data?.metalPrice ?? data?.value);
        return {
          success: !!(price && price > 12 && price < 150),
          error: !price ? 'No price in response' : `Price ${price} out of valid range (12-150)`
        };
      }
    });
    
    await this.testWithProxy('Silver - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/SI=F?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 12 && price < 150),
          error: !price ? 'No price in response' : `Price ${price} out of valid range (12-150)`
        };
      }
    });
    
    // Test Cryptocurrencies - Binance
    await this.testEndpoint('Bitcoin - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=BTCUSDT', {
      parsePrice: (data) => data?.lastPrice,
      validate: (data) => {
        const price = Number(data?.lastPrice);
        return {
          success: !!(price && price > 10000 && price < 250000),
          error: !price ? 'No lastPrice in response' : 'Price ' + price + ' out of valid range (10000-250000)'
        };
      }
    });
    
    await this.testEndpoint('Ethereum - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=ETHUSDT', {
      parsePrice: (data) => data?.lastPrice,
      validate: (data) => {
        const price = Number(data?.lastPrice);
        return {
          success: !!(price && price > 500 && price < 25000),
          error: !price ? 'No lastPrice in response' : 'Price ' + price + ' out of valid range (500-25000)'
        };
      }
    });
    
    await this.testEndpoint('Solana - Binance', 'https://api.binance.com/api/v3/ticker/24hr?symbol=SOLUSDT', {
      parsePrice: (data) => data?.lastPrice,
      validate: (data) => {
        const price = Number(data?.lastPrice);
        return {
          success: !!(price && price > 10 && price < 300),
          error: !price ? 'No lastPrice in response' : 'Price ' + price + ' out of valid range (10-300)'
        };
      }
    });
    
    // Test Cryptocurrencies - CoinGecko
    await this.testWithProxy('Bitcoin - CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true', {
      parsePrice: (data) => data?.bitcoin?.usd,
      validate: (data) => {
        const price = data?.bitcoin?.usd;
        return {
          success: !!(price && price > 10000 && price < 250000),
          error: !price ? 'No bitcoin.usd in response' : 'Price ' + price + ' out of valid range (10000-250000)'
        };
      }
    });
    
    await this.testWithProxy('Ethereum - CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=ethereum&vs_currencies=usd&include_24hr_change=true', {
      parsePrice: (data) => data?.ethereum?.usd,
      validate: (data) => {
        const price = data?.ethereum?.usd;
        return {
          success: !!(price && price > 500 && price < 25000),
          error: !price ? 'No ethereum.usd in response' : 'Price ' + price + ' out of valid range (500-25000)'
        };
      }
    });
    
    await this.testWithProxy('Solana - CoinGecko', 'https://api.coingecko.com/api/v3/simple/price?ids=solana&vs_currencies=usd&include_24hr_change=true', {
      parsePrice: (data) => data?.solana?.usd,
      validate: (data) => {
        const price = data?.solana?.usd;
        return {
          success: !!(price && price > 10 && price < 300),
          error: !price ? 'No solana.usd in response' : 'Price ' + price + ' out of valid range (10-300)'
        };
      }
    });
    
    // Test Stocks - Yahoo Finance
    await this.testWithProxy('Apple - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 100 && price < 250),
          error: !price ? 'No price in response' : 'Price ' + price + ' out of valid range (100-250)'
        };
      }
    });
    
    await this.testWithProxy('Tesla - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/TSLA?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 150 && price < 400),
          error: !price ? 'No price in response' : 'Price ' + price + ' out of valid range (150-400)'
        };
      }
    });
    
    // Test Commodities - Yahoo Finance
    await this.testWithProxy('Crude Oil - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/CL=F?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 35 && price < 200),
          error: !price ? 'No price in response' : 'Price ' + price + ' out of valid range (35-200)'
        };
      }
    });
    
    await this.testWithProxy('Natural Gas - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/NG=F?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 1.5 && price < 10),
          error: !price ? 'No price in response' : 'Price ' + price + ' out of valid range (1.5-10)'
        };
      }
    });
    
    // Test Indices - Yahoo Finance
    await this.testWithProxy('S&P 500 - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/^GSPC?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 3000 && price < 9000),
          error: !price ? 'No price in response' : 'Price ' + price + ' out of valid range (3000-9000)'
        };
      }
    });
    
    await this.testWithProxy('NASDAQ - Yahoo Finance', 'https://query1.finance.yahoo.com/v8/finance/chart/^IXIC?interval=1m&range=1d', {
      parsePrice: (data) => {
        const result = data?.chart?.result?.[0];
        return result?.meta?.regularMarketPrice || result?.meta?.previousClose;
      },
      validate: (data) => {
        const result = data?.chart?.result?.[0];
        const price = result?.meta?.regularMarketPrice || result?.meta?.previousClose;
        return {
          success: !!(price && price > 10000 && price < 35000),
          error: !price ? 'No price in response' : 'Price ' + price + ' out of valid range (10000-35000)'
        };
      }
    });
    
    // Test Forex - Frankfurter
    await this.testEndpoint('Forex - Frankfurter', 'https://api.frankfurter.app/latest?from=USD&to=INR,EUR,GBP', {
      parsePrice: (data) => data?.rates?.INR,
      validate: (data) => {
        const rates = data?.rates;
        return {
          success: !!(rates && rates.INR && rates.EUR && rates.GBP),
          error: !rates ? 'No rates in response' : 'Missing required currency pairs'
        };
      }
    });
    
    await this.testEndpoint('Forex - open.er-api', 'https://open.er-api.com/v6/latest/USD', {
      parsePrice: (data) => data?.rates?.INR,
      validate: (data) => {
        const rates = data?.rates;
        return {
          success: !!(rates && rates.INR && rates.EUR && rates.GBP),
          error: !rates ? 'No rates in response' : 'Missing required currency pairs'
        };
      }
    });
    
    return this.generateDetailedReport();
  }
};

// Make available globally
window.LexoraAPITest = LexoraAPITest;

console.log('LexorA API Test Tool loaded. Run LexoraAPITest.runComprehensiveTest() to start testing.');
