//////////////////////////////////////////////////////////////
// Load configuration file                                  //
var fs = require('fs');
JSON.minify = JSON.minify || require('node-json-minify');
if (!fs.existsSync('./config.json')){
    console.log('config.json file does not exist. Read the installation/setup instructions.');
    return;
}
var CONFIG = JSON.parse(JSON.minify(fs.readFileSync('./config.json', {encoding: 'utf8'})));
console.log('config load from api');
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// inter-proccess comunication
var bestIndex = 0;
var ipc=require('node-ipc');
ipc.config.id   = 'sandonodeapi';
ipc.config.retry= 1500;
ipc.serve( function() {
  ipc.server.on('height', function(data,socket){
    bestIndex = data;
  });
});
ipc.server.start();
//////////////////////////////////////////////////////////////


/////////////////////////////////////////////////////////////
// shared functions from utils.js
var utils =  require('./lib/utils');
var convHash = utils.convHash;
var outputAddress = utils.outputAddress;
var inputAddress = utils.inputAddress;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a simple database interface                              //
var database =  require('./lib/database');
var dbBlocks = CONFIG.dbTable;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// an initial database query on block height
database.searchCount(dbBlocks, {}, function(result) {
  bestIndex = (result-1);
});
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// web interface
var apiPort = CONFIG.apiPort;                                      //
var http = require('http');
console.log('Web server started...');      // a debug message, can be deleted
http.createServer(function (req, res) {
  console.log('URL request: ' + req.url);  // a debug message, can be deleted
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Request-Method', '*');
  res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.writeHead(200, {
    'Content-Type': 'application/json',
    'X-Powered-By': 'sando'
  });
  var url = req.url;
  var commands = url.replace(/\/\s*$/,'').split('/');
  commands.shift();
  responseAPIrequest(res, commands);
}).listen(apiPort);
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// data structures for blocks and transactions              //
var bitcore = require('bitcore-lib');
var Block = bitcore.Block;
var SAT = 100000000;
var COINBASE = CONFIG.blockchain.nullHash;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API-call functions                                       //
function responseAPIrequest(res, commands) {
  var nParams = commands.length;
  var command = (nParams == 0) ? 'help' : commands[0];
  var param = (nParams > 1) ? commands[1] : '';
  switch(command) {
    case 'help':
      showHelp(res);
      break;
    case 'getheight':
    case 'height':
      getHeight(res);
      break;
    case 'getblock':
    case 'block':
      getBlock(res, param);
      break;
    case 'txinfo':
    case 'tx':
      getTxInfo(res, param);
      break;
    case 'addressfirstseen':
      getAddressFirst(res, param);
      break;
    case 'getbalance':
    case 'balance':
      getBalance(res, param);
      break;
    default:
      res.end('{"error": "unknown request"}');
  }
}

function showHelp(res) {
  var rts = {
    avaiable_commands: {
      help: "show this help on avaiable API commands",
      getheight: "return current block height",
      height: "the same as getheight",
      getblock: "return a block, takes block hash or block heigth as PARAM: http://url:port/getblock/PARAM",
      block: "the same as getblock",
      txinfo: "return details of transactions TX: http://url:port/txinfo/TX",
      tx: "the same as txinfo",
      addressfirstseen: "return the time when ADDRESS appeared in the blockchain: http://url:port/addressfirstseen/ADDRESS",
      getbalance: "return balance of ADDRESS: http://url:port/getbalance/ADDRESS",
      balance: "the same as getbalance"
    }
  };
  res.end(JSON.stringify(rts));
}

function getHeight(res) {
  var rts = JSON.stringify({height: bestIndex});
  res.end(rts);
}

function getBlock(res, param) {
  if (param == '') 
    param = bestIndex;
  var index = Number(param);
  if ((!(isNaN(param))) && Number.isInteger(index))
    database.search(dbBlocks, {i: index}, function(rts) {
      showBlock(res, rts);
    });
  else
    database.search(dbBlocks, {h: param}, function(rts) {
      showBlock(res, rts);
    });
}

function showBlock(res, rts) {
  if (!rts) {
    console.log('API asked invalid block ');           // a debug message, can be deleted
    res.end('{"error": "unknown block requested"}');
    return;
  }
  var response;
  if (!(rts.d)) {
    console.log('API asked non-indexed block ');       // a debug message, can be deleted
    response = {hash: rts.h, indexed: false};
    res.end(JSON.stringify(response));
    return;
  }
  var isCached = !(rts.d.hasOwnProperty('buffer'));
  var block = (isCached) ? Block.fromBuffer(rts.d) : Block.fromBuffer(rts.d.buffer);
  var size = (isCached) ? rts.d.length : rts.d.buffer.length;
  var header = block.header;
  var transactions = block.transactions;
  var txs = [];
  transactions.forEach(function(tx) {
    txs.push(tx.hash);
  });
  response = {
    hash: header.hash,
    confirmations: (bestIndex - rts.i),
    size: size,
    height: rts.i,
    version: header.version,
    merkleroot: convHash(header.merkleRoot),
    tx: txs,
    time: header.time,
    nonce: header.nonce, 
    bits: header.bits.toString(16),
    difficulty: header.getDifficulty(),
    previousblockhash: convHash(header.prevHash)
  };
  res.end(JSON.stringify(response));
}

function getTxInfo(res, param) {
  if (param == '') {
    res.end('{"error": "unknown transaction requested"}');
    return;
  }
  var query = '{ "t.'+param+'": { "$exists": true}}';
  database.search(dbBlocks, JSON.parse(query), function(rts) {
    if (!rts) {
      res.end('{"error": "unknown transaction requested"}');
      return;
    }
    showTx(res, rts, param);
  });
}

function showTx(res, rts, param) {
  var block = Block.fromBuffer(rts.d.buffer);
  var txs = block.transactions;
  var txIndex = rts.t[param];
  var tx = txs[txIndex];
  //console.log(JSON.stringify(tx));
  var response = {
    txid: tx.hash,
    version: tx.version,
    locktime: tx.nLockTime,
    block: rts.i,
    index: txIndex,
    timestamp: block.header.time,
    confirmations: (bestIndex+1-rts.i),
    inputs: [],
    outputs: []
  };
  if ( (tx.version == 2) && (tx.txComment) ) {
    response.txComment = tx.txComment.toString();
  }
  var inputs = tx.inputs;
  var item;
  inputs.forEach(function(input) {
    var prevTxId = input.prevTxId.toString('hex');
    if (prevTxId == COINBASE) {
    item = {received_from: 'coinbase'};
      response.inputs.push(item);
    }
    else {
      var address = inputAddress(input);
      var txPrevId = input.prevTxId.toString('hex');
      var n = input.outputIndex;
      item = {addr: address, received_from: {tx: txPrevId, n: n}};
      response.inputs.push(item);
    }
  });
  var outputs = tx.outputs;
  outputs.forEach(function(output) { 
    var address = outputAddress(output);
    var amount = (output.satoshis)/SAT;
    var script  = output.script.toBuffer().toString('hex');
    var item = {addr: address, amount: amount, script: script};
    response.outputs.push(item);
  });
  res.end(JSON.stringify(response));
}

function getAddressFirst(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = '{ "a.'+param+'": { "$exists": true}}';
  database.searchSort(dbBlocks, JSON.parse(query), {i: 1}, function(rts) {
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    var block = Block.fromBuffer(rts.d.buffer);
    var time = block.header.time;
    var newDate = new Date();
    newDate.setTime(time*1000);
    var dstr = newDate.toISOString().replace('T', ' ').substring(0, 19);
    res.end(JSON.stringify(dstr));
  });
}

function getBalance(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = '{ "a.'+param+'": { "$exists": true}}';
  console.log('jsem tu a hledam v databazi...');
  database.searchMore(dbBlocks, JSON.parse(query), function(rts) {
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    console.log('tak databaze prohledana, jdeme pocitat...' + rts.length);
    var balance = 0;
    var txo = {};
    rts.forEach( function(item) { 
//      console.log(item);
      var block = Block.fromBuffer(item.d.buffer);
      var txs = block.transactions;
      var hits = item.a[param];
      if (hits.hasOwnProperty('O')) {
        var X = hits.O;
        X.forEach( function(x) {
          var ti = x[0];
          var oi = x[1];
          var hash = txs[ti].hash;
          var ident = hash + '_' + oi;
          txo[ident] = {value: txs[ti].outputs[oi].satoshis, spent: false};
        });
      }
    });
    rts.forEach( function(item) { 
      var block = Block.fromBuffer(item.d.buffer);
      var txs = block.transactions;
      var hits = item.a[param];
      if (hits.hasOwnProperty('I')) {
        var X = hits.I;
        X.forEach( function(x) {
          var ti = x[0];
          var ii = x[1];
          var txPrevId = txs[ti].inputs[ii].prevTxId.toString('hex');
          var n = txs[ti].inputs[ii].outputIndex;
          var ident = txPrevId + '_' + n;
          txo[ident].spent = true;
        });
      }
    });
    console.log('a uz jen secist...');
    var txos = Object.keys(txo);
    txos.forEach( function(key) {
      if (txo[key].spent === false)
        balance += txo[key].value;
    });
    console.log('a je to...');
    res.end(JSON.stringify(balance/SAT));
  });
}

