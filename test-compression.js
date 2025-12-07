/**
 * Test script to verify response compression is working
 * This will make a request to the /api/health endpoint and check for compression headers
 */

const http = require('http');

function testCompression() {
  console.log('Testing compression middleware...\n');

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/health',
    method: 'GET',
    headers: {
      'Accept-Encoding': 'gzip, deflate, br'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:');
    console.log(`  Content-Encoding: ${res.headers['content-encoding'] || 'none'}`);
    console.log(`  Content-Type: ${res.headers['content-type']}`);
    console.log(`  Content-Length: ${res.headers['content-length'] || 'chunked'}`);

    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });

    res.on('end', () => {
      console.log('\nResponse body:', data);

      if (res.headers['content-encoding']) {
        console.log('\n✅ Compression is ENABLED');
        console.log(`   Compression method: ${res.headers['content-encoding']}`);
      } else {
        console.log('\n⚠️  Compression header not found (response may be too small to compress)');
        console.log('   Note: Compression is only applied to responses larger than 1KB');
      }
    });
  });

  req.on('error', (error) => {
    console.error('❌ Error testing compression:', error.message);
    console.log('\n💡 Make sure the server is running: npm start');
  });

  req.end();
}

// Test without compression header
function testWithoutCompression() {
  console.log('\n\n--- Testing with x-no-compression header ---\n');

  const options = {
    hostname: 'localhost',
    port: 5000,
    path: '/api/health',
    method: 'GET',
    headers: {
      'Accept-Encoding': 'gzip, deflate, br',
      'x-no-compression': '1'
    }
  };

  const req = http.request(options, (res) => {
    console.log(`Status: ${res.statusCode}`);
    console.log('Headers:');
    console.log(`  Content-Encoding: ${res.headers['content-encoding'] || 'none'}`);

    if (!res.headers['content-encoding']) {
      console.log('\n✅ x-no-compression header respected - no compression applied');
    } else {
      console.log('\n⚠️  Compression applied despite x-no-compression header');
    }
  });

  req.on('error', (error) => {
    console.error('❌ Error:', error.message);
  });

  req.end();
}

// Run tests
testCompression();

// Wait 2 seconds before running second test
setTimeout(testWithoutCompression, 2000);
