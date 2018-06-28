//////////////////////////////////////////////////////////////
// Load configuration file                                  //
var fs = require('fs');
JSON.minify = JSON.minify || require('node-json-minify');
if (!fs.existsSync('./config.json')) {
    console.log('config.json file does not exist. Read the installation/setup instructions.');
    return;
}
var CONFIG = JSON.parse(JSON.minify(fs.readFileSync('./config.json', {encoding: 'utf8'})));
console.log('config load from main');
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
// data structures for blocks and transactions              //
var bitcore = require('bitcore-lib');
var Block = bitcore.Block;
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
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// set-up a pool of EAC nodes                               //
var Pool = require('bitcore-p2p').Pool;
var p2p = require('bitcore-p2p');
//var Peer = p2p.Peer;
var Messages = p2p.Messages;
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
// inter-proccess comunication 
// a way to send some info to api proccess
var ipc=require('node-ipc');
ipc.config.id = 'sandonodesync';
ipc.config.retry= 1500;
ipc.config.maxRetries = 2;
ipc.config.silent = true;

function connectIPC() {
  ipc.connectTo('sandonodeapi', function() {
    ipc.of.sandonodeapi.on('connect', function() {
      ipc.of.sandonodeapi.emit('height', bestIndex);
      console.log('send height ', bestIndex);
    });
  });
}

connectIPC();

function sendHeight() {
  console.log('FUNCTION sendHeight() CALLLED ', bestIndex);
  if (ipc.of['sandonodeapi'].socket.writable)
    ipc.of['sandonodeapi'].emit('height', bestIndex);
  else
    connectIPC();
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a blockchain initialization function                     //
var wasInitialized = false;   // a workaroud to prevent multiple calling the initChain() function
function initChain() {
  if (wasInitialized)
    return;
  wasInitialized = true;
  database.searchCount(dbBlocks, {}, function(result) {
    if (!(result)) {
      console.log('datadase is empty, create the genesis block...');  // a debug line, can be deleted 
      var block0 = Block.fromBuffer(BLOCK0).toBuffer();
      var qGenesis = { h: HASH0, i: 0, d: block0 };
      database.insertArray(dbBlocks, [qGenesis], function() {
        console.log('genesis block writen to the datadase');      // a debug line, can be deleted  
        syncChain();
      });
    }
    else {
      console.log('datadase in not empty, get a bestBlock from the database...');  // a debug line, can be deleted  
      bestIndex = result-1;
      database.search(dbBlocks, {i: bestIndex}, function(result2) {
        bestHash = result2.h;
        syncChain();
      });
    }
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a function for a quick sync with the network             //
var canSortBlocks = true;
function syncChain() {
  console.log('best database index is '+bestIndex+' '+bestHash);  // a debug line, can be deleted  
  sendHeight();
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
var lastInv = 0;

pool.on('peerblock', function(peer, message) {
  var block = message.block;
  var header = block.header;
  var hash = header.hash;
  var prevHash = convHash(header.prevHash);
  var rawBlock = block.toBuffer(); 
  var rqThis = {h: hash,  p: prevHash, d: rawBlock,};
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
    if ((invs[0].type)==2) {
      lastInv = invs.length;
      intoCache += lastInv;    // count only blocks but answer to all messages?
      console.log('got an inventory ' + invs.length + '/' + intoCache + ' sort: ' + canSortBlocks);  // a debug message, can be deleted
      // console.log('inv type '+ invs[0].type + ': ' + convHash(invs[0].hash));
      var messages = new Messages();
      var msg = messages.GetData(invs);
      peer.sendMessage(msg);
    }
});
// TO-DO:
// - ansver all other events to get a both dirrection communication
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// a double loop for indexing new blocks and transactions
function addIndexes(cache) {
  var rts = [];
  var cLen = cache.length;
  console.log('now ' + cLen + ' blocks should be sorted...');  // a debug message, can be deleted
  for (var j = 0; j < cLen; j++) {
    for (var i = 0; i < cLen; i++) {
      if (cache[i].p == bestHash) {
        bestIndex++;
        cache[i].i = bestIndex;
        bestHash = cache[i].h;
        var decoded = decodeTransactions(cache[i]);  // decode address and transactions
        rts.push({h: cache[i].h, i: cache[i].i, d: cache[i].d, t: decoded.txs, a: decoded.addrs});
      }
    }
    if (rts.length == cLen)
      break;      // all have been indexed, yet
  }
  return rts;
}
//////////////////////////////////////////////////////////////

function pushBackNoIndex() {
  var iBack = 0;
  treatCache.forEach(function(item) {
    if (!(item.hasOwnProperty('i'))) {
      var repeat = false;
      for (var i=0; i<blockCache.length; i++) {
        if (blockCache[i].h === item.h) {
          repeat = true;
          break;
        }
      }
      if (!repeat) {
        intoCache++;
        iBack++;
        blockCache.push(item);
      }
    }
  });
  console.log('... pushed back ' + iBack + ' blocks');
}

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
  if ( !((lastInv == 1) && (qLen == 1) && (orphanScore == 0)) )    // clear the cache
    pushBackNoIndex();
  // write to database
  if (qLen > 0) {
    orphanScore = 0;
    database.insertArray(dbBlocks, queryI, function() {
      console.log('...' + (qLen) + ' blocks written to the database'); // a debug message, can be deleted
      canSortBlocks = true;
      syncChain();              // continue the sync by requesting a new package of blocks
    });
  }
  else if ( (orphanScore > 2) || (lastInv > 1) ) {
    var indexToDelete = bestIndex;
    database.search(dbBlocks, {i: (indexToDelete-1)}, function(result) {
      if (result) {
        bestIndex = result.i;
        bestHash = result.h;
        database.erase(dbBlocks, {i: indexToDelete}, function () {
          canSortBlocks = true;
          orphanScore=0;
          wasInitialized = false;
          pool.disconnect();
          setTimeout( pool.connect(), 3000);
        });
      }
    }); 
  }
  else {
    orphanScore++;
    canSortBlocks = true;
  }
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// Just before blocks been stored to the database, try to 
// decode all transactions and addresses
function decodeTransactions(bbRec) {
//  console.log('decoding txs...');
  var txs = {};
  var addrs = {};
  var block = Block.fromBuffer(bbRec.d);
  var transactions = block.transactions;

  for (var i=0; i<transactions.length; i++) {
    var hash = transactions[i].hash;
    txs[hash] = i;
    var inputs  = transactions[i].inputs;
    var j;
    var address;
    for (j=0; j<inputs.length; j++) {
      if ((i+j)>0) {   // non-coinbase
        address = inputAddress(inputs[j]);
        if (address != 'false') {                 // can not decode PAY_TO_PUBKEY
          if (!(addrs.hasOwnProperty(address))) {
            addrs[address] = {I: []};
          }
          else if (!(addrs[address].hasOwnProperty('I'))) {
            addrs[address].I = [];
          }
          addrs[address].I.push([i, j]);
        }
      }
    }
    var outputs  = transactions[i].outputs;
    for (j=0; j<outputs.length; j++) {
      address = outputAddress(outputs[j]);
      if (!(addrs.hasOwnProperty(address))) {
        addrs[address] = {O: []};
      }
      else if (!(addrs[address].hasOwnProperty('O'))) {
        addrs[address].O = [];
      }
      addrs[address].O.push([i, j]);
    }
  }
  return {txs: txs, addrs: addrs};
}
//////////////////////////////////////////////////////////////
