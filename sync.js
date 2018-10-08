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

//////////////////////////////////////////////////////////////
// kill self and restart every 5 minutes
setTimeout(function () {
  console.log('I am bored...let us restart');
  process.exit();
}, 5*60*1000)
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
  dnsSeed: false,                     // prevent seeding with DNS discovered known peers upon connecting
  listenAddr: true,                  // prevent new peers being added from addr messages
  relay: true,
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
// pool.listen();      // TODO both way comunication ?
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
// Blockchain initialization function                       //
//
var wasInitialized = false;   // a workaroud to prevent multiple calling the initChain() function
var syncFinished = false;
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
        askHeaders();
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
   var address = 'genesis';
   var qGenesis = { _id: HASH0, i: 0, d: rawBlock, t: [ tx_id ], a: [ address ], b: [ {o_0_0: 0} ] };
   database.insertArray(dbBlocks, [qGenesis], function() {
     console.log('genesis block writen to the datadase');      // a debug line, can be deleted  
     database.createIndex(dbBlocks, { i: 1 }, function() {
       console.log('blocks indexed');      // a debug line, can be deleted  
       database.createIndex(dbBlocks, { t: 1 }, function() {
         console.log('transactions indexed');      // a debug line, can be deleted  
         database.createIndex(dbBlocks, { a: 1 }, function() {
           console.log('addresses indexed');      // a debug line, can be deleted  
           askHeaders();
         });
       });
     });
   });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// requests only the block headers, it is a faster way to
// sync (the 'headers first' method)
//
function askHeaders() {
  var messages = new Messages();
  var msg = messages.GetHeaders({starts: [bestHash], stop: STOP});
  pool.sendMessage(msg);
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Create a block headers cache, assign indexes to block hashes.
//
var headCache = {};       // will be written to the database
var hc = 0;               // a counter for headers
var bc = 0;               // a full block counter
function sortHeaders(headers) {
  syncFinished = false;   // prevent an interruption by a new block received
  headCache = {};         // clear the chache ?
  var invs = [];          // used in p2p request for data
  bc = 0;                 // clear the full block counter
  var fork = false;
  headers.forEach( function(header) {
    var prevHash = convHash(header.prevHash);
    if (prevHash === bestHash) {
      bestHash = header.hash;
      bestIndex++;
      headCache[prevHash] = { _id: bestHash, i: bestIndex };
      var copybuf = Buffer.from(bestHash, 'hex').reverse();
      invs.push( {type: 2, hash: copybuf} );
    }
    else {
      fork = true;
    }
  });
  if (!fork)
    askBlocks(invs);
  else
    treatFork();
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// Send a p2p request for block data
//
function askBlocks(invs) {
  var messages = new Messages();
  var msg = messages.GetData(invs);
  pool.sendMessage(msg);
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// This function is caaled if an incosistency in blockchain 
// is detected. It simply deleted last several blocks from
// the database and try to resync again.
//
function treatFork() {
  console.log('a fork detected...');
  pool.disconnect();
  wasInitialized = false;
  syncFinished = false;
  var indexToDelete = bestIndex - 12;
  if (indexToDelete <=0)
    indexToDelete = 0;
  database.erase(dbBlocks, {i: {$gt: indexToDelete}}, function () {
    pool.connect();
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// Add the block data to the cache.
//
function sortBlocks(block) {
  var header = block.header;
  var hash = header.hash;
  var prevHash = convHash(header.prevHash);
  var rawBlock = block.toBuffer();
  if (headCache[prevHash]._id === hash) {
    headCache[prevHash].d = rawBlock;
    bc++;
  }
  if (bc === hc)
    verifyBlocks();
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Write the indexed blocks to database and call the sync
// procces continue
//
function dbwriteBlocks(dbCache) {
  console.log('write to db', dbCache.length);
  database.insertArray(dbBlocks, dbCache, function() {
    console.log('... blocks written to the database'); // a debug message, can be deleted
    sendHeight();
    askHeaders();
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A simple check the block data before database write.
//
function verifyBlocks() {
  console.log('verify');
  var dbCache = Object.values(headCache);
  console.log('...');
  var cl = dbCache.length;
  var itisOK = (cl === hc);
  var fork = false;
  dbCache.forEach( function (dbRec) {
    itisOK = itisOK && dbRec.hasOwnProperty('_id') && dbRec.hasOwnProperty('i') && dbRec.hasOwnProperty('d');
    if (itisOK)
      decodeTransactions(dbRec);
    else
      fork  = true;
  });
  if (!fork) {
    dbwriteBlocks(dbCache);
  }
  else {
    console.log('fork detected');
    treatFork();          // something failed ?
  }
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a short identifier of a transaction output (blockIndex+txIndex+outputIndex)
//
function OID(typ, ti, oi) {
 return (typ + '_' + ti + '_' + oi);
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// Just before blocks been stored to the database, try to 
// decode all transactions and addresses
function decodeTransactions(bbRec) {
//  console.log('decoding txs...');
  var block = Block.fromBuffer(bbRec.d);
  var revHexBlock = convHash(bbRec.d);
  var transactions = block.transactions;
  var t = [];
  var a = [];
  var b = [];
  function addAddrIfNotIn(address, oid, val) {
    for (var j=0; j<a.length; j++) {
      if (a[j] === address) {
        b[j][oid] = val;
        return;
      }
    }
    a.push(address);
    var k = b.length;
    b.push({});
    b[k][oid] = val;
  }
  var ti=0;
  transactions.forEach( function(tx) {
    t.push( tx.hash );
    var n = 0;
    tx.inputs.forEach( function(input) {
      var address = inputAddress(input);
      if ( address != 'coinbase' ) {
        var prevTx = input.prevTxId.toString('hex');
        var pos = revHexBlock.indexOf(prevTx);
        var outIndex = input.outputIndex;
        addAddrIfNotIn(address, OID('i', ti, n), OID('r', pos, outIndex));                 // spent
      }
      n++;
    });
    n = 0;
    tx.outputs.forEach( function(output) {
      var address = outputAddress(output);
      if (address != 'false') {
        addAddrIfNotIn(address, OID('o', ti, n), output.satoshis);    // received
      }
      n++;
    });
    ti++;
  });
  bbRec.t = t;
  bbRec.a = a;
  bbRec.b = b;
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// the pool evene to treat the received block headers data
//
pool.on('peerheaders', function(peer, message) {
  hc = message.headers.length;   // set the header counter
  console.log('peerheaders', hc, bestIndex);
  if (hc > 0) 
    sortHeaders(message.headers);
  else
    syncFinished = true;
});
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// Pool event to treat the block data
//
pool.on('peerblock', function(peer, message) {
//  console.log('peerblock', bc);
  sortBlocks(message.block);
});

//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// A New peer peer connected to the network 
//
pool.on('peeraddr', function(peer, message) {
  console.log('a new peer addr found: ' + peer.host + ' ' + peer.version + ' ' + peer.subversion + ' ' + peer.bestHeight); // a debug line, can be deleted  
});
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// The pool is ready, start the sync process
//
pool.on('peerready', function(peer, message) {
  console.log('a peer connected: ' + peer.host + ' ' + peer.version + ' ' + peer.subversion + ' ' + peer.bestHeight);  // a debug line, can be deleted  
  initChain();
});
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A peer disconnected. Nothing need to do, pool connect
// another automatically
//
pool.on('peerdisconnect', function(peer, message) {
  console.log('peerdisconnect');
});
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A new block has been announced -> ask for it, but only
// if the initial sync finished.
//
pool.on('peerinv', function(peer, message) {
  console.log('peerinv');
  if ( (message.inventory[0].type == 2) && (syncFinished) )
    askHeaders();
});
//////////////////////////////////////////////////////////////


/*
///  unused pool messages. 
// TODO use for the both dirrection comunication

pool.on('peerversion', function(peer, message) {
  console.log('peerversion');
//  console.log(message);
});


pool.on('peergetdata', function(peer, message) {
  console.log('peergetdata');
});


pool.on('peerping', function(peer, message) {
  console.log('peerping');
//  console.log(message);
});


pool.on('peerpong', function(peer, message) {
  console.log('peerpong');
});


pool.on('peerverack', function(peer, message) {
  console.log('peerverack');
});


pool.on('peeralert', function(peer, message) {
  console.log('peeralert');
});

pool.on('peermerkleblock', function(peer, message) {
  console.log('peermerkleblock');
});

pool.on('peertx', function(peer, message) {
  console.log('peertx');
});

pool.on('peergetblocks', function(peer, message) {
  console.log('peergetblocks');
});

pool.on('peergetheaders', function(peer, message) {
  console.log('peergetheaders');
  var reqStarts = message.starts;
  reqStarts.forEach( function(req) {
    console.log(convHash(req));
  });
});

pool.on('peererror', function(peer, message) {
  console.log('peererror');
});

pool.on('peerfilterload', function(peer, message) {
  console.log('peerfilterload');
});

pool.on('peerfilteradd', function(peer, message) {
  console.log('peerfilteradd');
});

pool.on('peerfilterclear', function(peer, message) {
  console.log('peerfilterclear');
});

*/
