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
// a way to send some info to api proccess
var bestIndex = 0;
var ipc=require('node-ipc');
ipc.config.id = 'sandonodeapi';
ipc.config.retry= 1500;
ipc.config.silent = true;
function connectIPC() {
  ipc.connectTo('sandonodesync', function() {
    ipc.of.sandonodesync.on('height', function(data,socket) {
      bestIndex = data;
      console.log('got height ', bestIndex);
    });
  });
}
connectIPC();

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
var dbBlocks = CONFIG.dbBlocks;
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
    case 'utxo':
    case 'unspent':
      getUnspent(res, param);
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
      balance: "the same as getbalance",
      utxo: "return unspent balances of ADDRESS",
      unspent: "the same as utxo"
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
    database.search(dbBlocks, {_id: param}, function(rts) {
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
  var block = Block.fromBuffer(rts.d.buffer);
  var size = rts.d.buffer.length;
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
  var query = { t: param };
  database.search(dbBlocks, query, function(rts) {
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
  var txIndex = 0;
  while (txIndex < txs.length) {
    if (txs[txIndex].hash === param) {
      var tx = txs[txIndex];
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
      return;
    }
    txIndex++;
  }
  res.end(JSON.stringify({error: "unknown"}));
}

function getAddressFirst(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = { a: param };
  database.searchSort(dbBlocks, query, {i: 1}, function(rts) {
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
  var query = { a: param };
  database.searchMore(dbBlocks, query, function(rts) {
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    if (rts.length > CONFIG.dbLimit) {
      res.end('{"error": "to many transactions -> wallet is protected "}');
      return;
    }
    var balance = calculateBalance(rts, param);
    res.end(JSON.stringify(balance/SAT));
  });
}

function calculateBalance(blocks, param) {
  var balance = 0;
  var txo = {};
  blocks.forEach( function(item) { 
    var block = Block.fromBuffer(item.d.buffer);
    var txs = block.transactions;
    txs.forEach ( function(tx) {
      var n = 0;
      tx.outputs.forEach( function(output) {
        var address = outputAddress(output);
        if (address === param) {
          var ident = tx.hash + '_' + n;
          txo[ident] = output.satoshis;
          balance += output.satoshis;
        }
        n++;
      });
      tx.inputs.forEach( function(input) {
        var address = inputAddress(input);
        if (address === param) {
          var ident = input.prevTxId.toString('hex') + '_' + input.outputIndex;
          balance -= txo[ident];
        }
      });
    });
  });
  return balance;
}

function getUnspent(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = { a: param };
  console.log('jsem tu a hledam v databazi...');
  database.searchMore(dbBlocks, query, function(rts) {
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    if (rts.length > CONFIG.dbLimit) {
      res.end('{"error": "to many transactions -> wallet is protected "}');
      return;
    }
    var unspent = findUnspent(rts, param);
    res.end(JSON.stringify(unspent));
  });
}


function findUnspent(blocks, param) {
  var txo = {};
  var unspent = [];
  blocks.forEach( function(item) { 
    var block = Block.fromBuffer(item.d.buffer);
    var txs = block.transactions;
    txs.forEach ( function(tx) {
      var n = 0;
      tx.outputs.forEach( function(output) {
        var address = outputAddress(output);
        if (address === param) {
          var ident = tx.hash + '_' + n;
          txo[ident] = {tx_hash: tx.hash, tx_output_n: n, value: output.satoshis, confirmations: bestIndex - item.i, script: output.script.toBuffer().toString('hex')};
        }
        n++;
      });
      tx.inputs.forEach( function(input) {
        var address = inputAddress(input);
        if (address === param) {
          var ident = input.prevTxId.toString('hex') + '_' + input.outputIndex;
          txo[ident] = 'spent';
        }
      });
    });
  });
  Object.keys(txo).forEach( function(k) {
    if (txo[k] != 'spent') {
      unspent.push(txo[k]);
    }
  });
  return unspent;
}


/*
function findUnspent(blocks, param) {
  console.log('tak databaze prohledana, jdeme pocitat...' + blocks.length);
  var txo = {};
  var unspent = [];
  blocks.forEach( function(item) { 
    var block = Block.fromBuffer(item.d.buffer);
    var txs = block.transactions;
    txs.forEach ( function(tx) {
      tx.inputs.forEach( function(input) {
        var address = inputAddress(input);
        if (address === param) {
          var ident = input.prevTxId.toString('hex') + '_' + input.outputIndex;
          txo[ident] = 'spent';
          console.log(txo[ident]);
        }
      });
    });
  });
  blocks.forEach( function(item) { 
    var block = Block.fromBuffer(item.d.buffer);
    var txs = block.transactions;
    txs.forEach ( function(tx) {
      var n = 0;
      tx.outputs.forEach( function(output) {
        var address = outputAddress(output);
        if (address === param) {
          var ident = tx.hash + '_' + n;
          console.log(txo[ident]);
          if ( txo[ident] != 'spent')
            unspent.push({tx_hash: tx.hash, tx_output_n: n, value: output.satoshis, confirmations: bestIndex - item.i, script: output.script.toBuffer().toString('hex')});
        }
        n++;
      });
    });
  });
  console.log('hotovo');
  return unspent;
}


*/