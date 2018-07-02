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
var dbBlocks = CONFIG.dbBlocks;
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
ipc.config.id   = 'sandonodesync';
ipc.config.retry= 1500;
ipc.serve( function() {
  sendHeight();
});
ipc.server.start();

function sendHeight() {
  console.log('FUNCTION sendHeight() CALLLED ', bestIndex);
  ipc.server.broadcast('height', bestIndex);
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
      makeNewDatabase();
    }
    else {
      console.log('datadase in not empty, get a bestBlock from the database...');  // a debug line, can be deleted  
      database.search(dbBlocks, {i: (result-1)}, function(result2) {
        bestHash = result2._id;
        bestIndex = result2.i;
        syncChain();
      });
    }
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// create new database, if empty
function makeNewDatabase() {
   var block = Block.fromBuffer(BLOCK0);
   var rawBlock = block.toBuffer();
   var tx = block.transactions[0];
   var tx_id = tx.hash;
   var address = 'unknown';
   var qGenesis = { _id: HASH0, i: 0, d: rawBlock, t: [ tx_id ], a: [ address ] };
   database.insertArray(dbBlocks, [qGenesis], function() {
     console.log('genesis block writen to the datadase');      // a debug line, can be deleted  
     database.createIndex(dbBlocks, { i: 1 }, function() {
       console.log('blocks indexed');      // a debug line, can be deleted  
       database.createIndex(dbBlocks, { t: 1 }, function() {
         console.log('transactions indexed');      // a debug line, can be deleted  
         database.createIndex(dbBlocks, { a: 1 }, function() {
           console.log('addresses indexed');      // a debug line, can be deleted  
           syncChain();
         });
       });
     });
   });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a function for a quick sync with the network             //
var canSortBlocks = true;
function syncChain() {
  canSortBlocks = true;
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
        rts.push({_id: cache[i].h, i: cache[i].i, d: cache[i].d});
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
  queryI.forEach( function(item) {
    decodeTransactions(item);  // decode address and transactions
  });
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
  else if ( (orphanScore > 3) || (lastInv > 1) ) {
    resetPool();
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
  var block = Block.fromBuffer(bbRec.d);
  var transactions = block.transactions;
  var t = [];
  var a = [];
  function addAddrIfNotIn(address) {
    for (var j=0; j<a.length; j++) {
      if (a[j] === address)
        return;
    }
    a.push(address);
  }
  transactions.forEach( function(tx) {
    t.push( tx.hash );
    tx.inputs.forEach( function(input) {
      var address = inputAddress(input);
      if ( (address != 'false') && (address != 'coinbase') ) {
        addAddrIfNotIn(address);
      }
    });
    tx.outputs.forEach( function(output) {
      var address = outputAddress(output);
      if (address != 'false') {
        addAddrIfNotIn(address);
      }
    });
  });
  bbRec.t = t;
  bbRec.a = a;
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// recovery from a fork
function resetPool() {
  pool.disconnect();
  wasInitialized = false;
  orphanScore=0;
  canSortBlocks = false;
  blockCache = [];
  treatCache = [];
  intoCache = 0;
  lastInv = 0;
  var indexToDelete = bestIndex - 12;
  if (indexToDelete <=0)
    indexToDelete = 0;
  database.erase(dbBlocks, {i: {$gt: indexToDelete}}, function () {
    pool.connect();
  });
}
//////////////////////////////////////////////////////////////

