//////////////////////////////////////////////////////////////
// Load configuration file                                  //
var fs = require('fs');
JSON.minify = JSON.minify || require("node-json-minify");
if (!fs.existsSync('./config.json')){
    console.log('config.json file does not exist. Read the installation/setup instructions.');
    return;
}
var CONFIG = JSON.parse(JSON.minify(fs.readFileSync("./config.json", {encoding: 'utf8'})));
console.log('config load from main');
//////////////////////////////////////////////////////////////


// a function for buffer to hexa-string hash conversion     //
// convert a result of getBlocks to a conventional block hash
function convHash(data) {
  var copyData = Buffer.from(data);
  var hash = copyData.reverse().toString('hex');
  return hash;
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a simple database interface                              //
var database =  require('./lib/database');
var dbBlocks = CONFIG.dbTable;
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
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// set-up parameters for EarthCoin network                  //
var Networks = require('bitcore-lib').Networks;
Networks.add(CONFIG.network);
var customNetwork = Networks.get(CONFIG.network.name);
Networks.defaultNetwork = customNetwork;
// data for the genesis block
var HASH0 = CONFIG.blockchain.genesisHash;
var STOP = CONFIG.blockchain.nullHash;
var BLOCK0 = CONFIG.blockchain.genesisBlock;
var COINBASE = STOP;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// set-up a pool of EAC nodes                               //
var Pool = require('bitcore-p2p').Pool;
var p2p = require('bitcore-p2p');
//var Peer = p2p.Peer;
var Messages = p2p.Messages;
var trustedNodes = CONFIG.trustedNodes;
var pool = new Pool({
  network: customNetwork,            // the network object
  dnsSeed: false,                    // prevent seeding with DNS discovered known peers upon connecting
  listenAddr: true,                  // prevent new peers being added from addr messages
  maxSize: 1,
  addrs: CONFIG.trustedNodes
});
//
// TO-DO: 
//  - an automatic node selection based on the best connection
//  - or multinode optimization
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// initial empty blockchain parameters + connect the pool   //
var bestIndex = 0;
var bestHash = HASH0;
pool.connect();
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a blockchain initialization function                     //
var wasInitialized = false;   // a workaroud to prevent multiple calling the initChain() function
function initChain() {
  if (wasInitialized)
    return;
  wasInitialized = true;
  database.searchSort(dbBlocks, {index: {$ne: null}}, {index: -1}, function(result) {
    if (!(result)) {
      console.log('datadase is empty, create the genesis block...');  // a debug line, can be deleted 
      var block0 = Block.fromBuffer(BLOCK0).toBuffer();
      var qGenesis = {hash: HASH0, index: 0, data: block0};
      database.insertArray(dbBlocks, [qGenesis], function() {
        console.log('genesis block writen to the datadase');      // a debug line, can be deleted  
        syncChain();
      });
    }
    else {
      console.log('datadase in not empty, get a bestBlock from the database...');  // a debug line, can be deleted  
      bestHash = result.hash;
      bestIndex = result.index;
      syncChain();
    }
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a function for a quick sync with the network             //
var canSortBlocks = true;
function syncChain() {
  console.log('best database index is '+bestIndex+' '+bestHash);  // a debug line, can be deleted  
  var starts = [bestHash];
  var messages = new Messages();
  var message = messages.GetBlocks({starts: starts, stop: STOP});
  pool.sendMessage(message);
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// pool events                                              //
// This event is emited when a peer in the pool is connected 
// and ready for the comunication. When the first network node 
// is ready, the function initChain() will be called.
// To-do: find a better place for initChain() call to avoid 
// multiple initialization. Temporary workaround - a global 
// variable tested each time the function is called.
pool.on('peerready', function(peer, message) {
  console.log('a peer connected: ' + peer.host + ' ' + peer.version + ' ' + peer.subversion + ' ' + peer.bestHeight);  // a debug line, can be deleted  
  initChain();  
});

// This evet is emited when a new peer is discovered in the network.
// A ping test could be placed here for an automatioc selection 
// of the best peer for sync. Also the height of peer copy of the
// blockchain can be done here. Now only shows a debug information.
pool.on('peeraddr', function(peer, message) {
  console.log('a new peer addr found: ' + peer.host + ' ' + peer.version + ' ' + peer.subversion + ' ' + peer.bestHeight); // a debug line, can be deleted  
});

// This event is emited when the node receive the 'block' message.
// Here the received blocks are stored in a temporary array
// before saved into the database. This trick significantly
// increase the blockchain sync, because the database operation
// is the slowest step in the process. If the network peer for sync
// is selected properly, the whole sync process takes place about 
// 1 hour. It is much better than in the case legacy wallet sync, 
// which usualy last a day or more. There is also the "headers-first"
// method for sync, which was finished in my test within 2 minutes, 
// however the algorithm was not stable, so left for a future upgrade.
var blockCache = [];   // an array for blocks temporary storage
var treatCache = [];   // the second array, in which the blocks are indexed
var intoCache = 0;     // a counter for blocks stored in the cache
const ccLen = 1000;
var cyclicCache = new Array(ccLen);
var ccPrefix = 0;

pool.on('peerblock', function(peer, message) {
  var block = message.block;
  var header = block.header;
  var hash = header.hash;
  var prevHash = convHash(header.prevHash);
  var rawBlock = block.toBuffer(); 
  var rqThis = {hash: hash,  prevHash: prevHash, data: rawBlock,};
  blockCache.push(rqThis);
  if ((blockCache.length >= intoCache) && (canSortBlocks)) {
    console.log('limit of blocks reached ' + blockCache.length + '/' + intoCache);  // a debug message, can be deleted
    treatCache = blockCache;    // move all block to the second array
    blockCache = [];            // and empty the cache
    indexBlocks();
    intoCache = 0;
  }
});

// This event is emited when an inventory message is received.
// Can contain a new transaction id broadcasted to the network 
// (message type 1), or block hashes (message type 2) eighter 
// of new blocks broadcasted to the network or an answer to the
// getBlocks message (up to 500 blocks at once). If the node
// want to receive the data of those blocks/transactions, it
// have to response by the getData message. For now the node
// ignore the transaction messages. TO-DO: Treating those 
// transaction-messages can be used to create the mempool
// known in the conventional wallet/daemon.
pool.on('peerinv', function(peer, message) {
  var invs = message.inventory;
  if (invs.length > 0)
    if ((invs[0].type)==2)
      intoCache += invs.length;    // count only blocks but answer to all messages?
  console.log('got an inventory ' + invs.length + '/' + intoCache + ' can ' + canSortBlocks);  // a debug message, can be deleted
  console.log('inv type '+ invs[0].type + ': ' + convHash(invs[0].hash));
  var messages = new Messages();
  var msg = messages.GetData(invs);
  peer.sendMessage(msg);
});
// TO-DO:
// - ansver all other events to get a both dirrection communication
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// a double loop for indexing new blocks
function addIndexes(cache) {
  var rts = [];
  var cLen = cache.length;
  console.log('now ' + cLen + ' blocks should be sorted...');  // a debug message, can be deleted
  for (var j = 0; j < cLen; j++) {
    for (var i = 0; i < cLen; i++) {
      if (cache[i].prevHash == bestHash) {
        bestIndex++;
        cache[i].index = bestIndex;
        cyclicCache[bestIndex % ccLen] = cache[i];
        ccPrefix = bestIndex / ccLen;
        bestHash = cache[i].hash;
        var decoded = decodeTransactions(cache[i]);  // decode address and transactions
        rts.push({hash: cache[i].hash, index: cache[i].index, data: cache[i].data, txs: decoded.txs, addrs: decoded.addrs});
      }
    }
    if (rts.length == cLen)
      break;      // all have been indexed, yet
  }
  return rts;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A function for sorting the blocks in the cache and asign 
// indexes. TO-DO: optimize the sort algorithm. Now it uses 
// a brute-force method with n^2 loop passes. Theoretically
// it should be sufficient n*log(n) passes, but it is not 
// a critical factor, because it is much faster, than the 
// following database operation.
var orphanScore = 0;
function indexBlocks() {
  canSortBlocks = false;                // prevent another call until database operations are finished
  var cLen = treatCache.length;
  var queryI = addIndexes(treatCache);
  var qLen = queryI.length;
  console.log('indexed ' + qLen + ' / ' + cLen  + ' blocks, orphanScore ' + orphanScore); // a debug message, can be deleted
  // push back blocks without index
  treatCache.forEach(function(item) {
    if (!(item.hasOwnProperty('index'))) {
      intoCache++;
      blockCache.push(item);
      console.log('....push bash ' + item.hash);
    }
  });
  // write to database
  if (qLen > 0) {
    orphanScore = 0;
    database.insertArray(dbBlocks, queryI, function() {
      console.log('...' + (qLen) + ' blocks written to the database'); // a debug message, can be deleted
      canSortBlocks = true;
      syncChain();              // continue the sync by requesting a new package of blocks
    });
  }
  else if ( (orphanScore > 2) || (cLen > 1) ) {
    var indexToDelete = bestIndex;
    var ccPrevIndex = (bestIndex+ccLen-1) % ccLen;
    if (cyclicCache[ccPrevIndex]) {
      if (cyclicCache[ccPrevIndex].hasOwnProperty('hash')) {
        bestIndex = cyclicCache[ccPrevIndex].index;
        bestHash = cyclicCache[ccPrevIndex].hash;
        database.erase(dbBlocks, {index: indexToDelete}, function() {
          canSortBlocks = true;
          orphanScore=0;
          syncChain();
        });
      }
    }
    else {
      database.search(dbBlocks, {index: (indexToDelete-1)}, function(result) {
        if (result) {
          bestIndex = result.index;
          bestHash = result.hash;
          database.erase(dbBlocks, {index: indexToDelete}, function () {
            canSortBlocks = true;
            orphanScore=0;
            syncChain();
          });
        }
      }); 
    }
  }
  else {
    orphanScore++;
    canSortBlocks = true;
  }
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Decode address from transaction output script
function outputAddress(output)
{
  var address = output.script.toAddress().toString();
  if (address == 'false') {
    var hexa = output.script.toBuffer().toString('hex');
    var pk = hexa.substring(2, hexa.length-2);
    var key = bitcore.PublicKey(pk);
    address =  key.toAddress().toString();
  }
  return address;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Decode address from transaction input script
function inputAddress(input)
{
  var prevTxId = input.prevTxId.toString('hex');  // exclude coinbase inputs
  if (prevTxId == COINBASE) {
    return 'coinbase';
  }
  var address = input.script.toAddress().toString();
  return address;  
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// test if an address has been in the array, yet
function isIn (address, addrs) {
  if (address == 'coinbase')
    return true;              // coinbase input has no address
  var rts = false;
  addrs.forEach( function(addr) {
    if (addr.addr === address)
      rts = true;
  });
  return rts;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Just before blocks been stored to the database, try to 
// decode all transactions and addresses
function decodeTransactions(bbRec) {
//  console.log('decoding txs...');
  var txs = [];
  var addrs = [];
  var block = Block.fromBuffer(bbRec.data);
  var transactions = block.transactions;
  transactions.forEach( function(tx) {
    var hash = tx.hash;
    txs.push({txId: hash});
    var inputs  = tx.inputs;
    inputs.forEach( function(input) {
      var address = inputAddress(input);
      if (!isIn(address, addrs))
        addrs.push({addr: address});
    });
    var outputs  = tx.outputs;
    outputs.forEach( function(output) {
      var address = outputAddress(output);
      if (!isIn(address, addrs))
        addrs.push({addr: address});
    });
  });
  return {txs: txs, addrs: addrs};
}
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
      getHeight(res);
      break;
    case 'getblock':
      getBlock(res, param);
      break;
    case 'txinfo':
      getTxInfo(res, param);
      break;
    case 'addressfirstseen':
      getAddressFirst(res, param);
      break;
    case 'getbalance':
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
      getblock: "return a block, takes block hash or block heigth as PARAM: http://url:port/getblock/PARAM",
      txinfo: "return details of transactions TX: http://url:port/txinfo/TX",
      addressfirstseen: "return the time when ADDRESS appeared in the blockchain: http://url:port/addressfirstseen/ADDRESS",
      getbalance: "return balance of ADDRESS: http://url:port/getbalance/ADDRESS"
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
    getBlockByIndex(res, index);
  else
    getBlockByHash(res, param);
}

function getBlockByIndex(res, index) {
  // try to get the block from cache
  for (var i = 0; i < ccLen; i++)
    if (cyclicCache[i])
      if (cyclicCache[i].index == index) {
        showBlock(res, cyclicCache[i]);
        return;
      }
  database.search(dbBlocks, {index: index}, function(rts) {
    showBlock(res, rts);
  });
}

function getBlockByHash(res, param) {
  // try to get the block from cache
  for (var i = 0; i < ccLen; i++)
    if (cyclicCache[i])
      if (cyclicCache[i].hash == param) {
        showBlock(res, cyclicCache[i]);
        return;
      }
  database.search(dbBlocks, {hash: param}, function(rts) {
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
  if (!(rts.data)) {
    console.log('API asked non-indexed block ');       // a debug message, can be deleted
    response = {hash: rts.hash, indexed: false};
    res.end(JSON.stringify(response));
    return;
  }
  var isCached = !(rts.data.hasOwnProperty('buffer'));
  var block = (isCached) ? Block.fromBuffer(rts.data) : Block.fromBuffer(rts.data.buffer);
  var size = (isCached) ? rts.data.length : rts.data.buffer.length;
  var header = block.header;
  var transactions = block.transactions;
  var txs = [];
  transactions.forEach(function(tx) {
    txs.push(tx.hash);
  });
  response = {
    hash: header.hash,
    confirmations: bestIndex-rts.index,
    size: size,
    height: rts.index,
    version: header.version,
    merkleroot: convHash(header.merkleRoot),
    tx: txs,
    time: header.time,
    nonce: header.nonce, 
    bits: header.bits.toString(16),
    difficulty: header.getDifficulty(),
    previousblockhash: convHash(header.prevHash)   // TODO - nextHash ?
  };
  res.end(JSON.stringify(response));
}

function getTxInfo(res, param) {
  if (param == '') {
    res.end('{"error": "unknown transaction requested"}');
    return;
  }
  database.search(dbBlocks, {txs: {txId: param}}, function(rts) {
    if (!rts) {
      res.end('{"error": "unknown transaction requested"}');
      return;
    }
    var block = Block.fromBuffer(rts.data.buffer);
//    console.log(JSON.stringify(block));
    var txs = block.transactions;
    var response = {
      hash: param,
      block: rts.index,
      index: 99,                    // will be replaced in the loop
      timestamp: block.header.time,
      confirmations: (bestIndex+1-rts.index),
      inputs: [],
      outputs: []
    };
    var tLen = txs.length;
    for (var i=0; i<tLen; i++) {
      if (txs[i].hash == param) {
        response.index = i;
        var inputs = txs[i].inputs;
        var item;
        inputs.forEach(function(input) {
          var prevTxId = input.prevTxId.toString('hex');
          if (prevTxId == COINBASE) {
            item = {received_from: 'coinbase'};
            response.inputs.push(item);
          }
          else {
            var address = input.script.toAddress().toString();
            var txPrevId = input.prevTxId.toString('hex');
            var n = input.outputIndex;
            item = {addr: address, received_from: {tx: txPrevId, n: n}};
            response.inputs.push(item);
          }
        });
        var outputs = txs[i].outputs;
        outputs.forEach(function(output) { 
          var address = outputAddress(output);
          var amount = (output.satoshis)/SAT;
          var script  = output.script.toBuffer().toString('hex');
          var item = {addr: address, amount: amount, script: script};
          response.outputs.push(item);
        });
      }
    }
    res.end(JSON.stringify(response));
  });
}

function getAddressFirst(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  database.searchSort(dbBlocks, {addrs: {addr: param}}, {index: 1}, function(rts) {
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    var block = Block.fromBuffer(rts.data.buffer);
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
  console.log('jsem tu a hledam v databazi...');
  database.searchMore(dbBlocks, {addrs: {addr: param}}, function(rts) {
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
  console.log('tak databaze prohledana, jseme pocitat...' + rts.length);
    var balance = 0;
    var txoI = [];
    var txoO = [];
    rts.forEach( function(item) { 
      var block = Block.fromBuffer(item.data.buffer);
      var txs = block.transactions;
      txs.forEach( function(tx) {
        var outputs = tx.outputs;
        var i = 0;
        outputs.forEach( function(output) {
          var address = outputAddress(output);
          if (address === param) {
            var txo = {txId: tx.hash, index: i, value: output.satoshis, spent: false}; 
            txoO.push(txo);
          }
          i++;
        });
        var inputs = tx.inputs;
        inputs.forEach( function(input) {
          var address = inputAddress(input);
          if (address === param) {
            var txPrevId = input.prevTxId.toString('hex');
            var n = input.outputIndex;
            var txo = {txId: txPrevId, index: n};
            txoI.push(txo);
          }
        });
      });
    });
    console.log('uz to skoro mam ...' + rts.length);
    var recLen = txoO.length;
    var spentLen = txoI.length;
    console.log('... ale je to ' + recLen + ' krat ' + spentLen);
    for (var j=0; j<spentLen; j++) {
      for (var i=0; i< recLen; i++) {
        if (txoI[j].txId === txoO[i].txId) 
          if (txoI[j].index === txoO[i].index) {
            txoO[i].spent = true;
            break;
          }
      }
    }
    console.log('a uz jen secist...');
    txoO.forEach( function(txo) {
      if (txo.spent === false)
        balance += txo.value;
    });
    console.log('a je to...');
    res.end(JSON.stringify(balance/SAT));
  });
}
