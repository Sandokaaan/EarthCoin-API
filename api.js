//////////////////////////////////////////////////////////////
// a function for buffer to hexa-string hash conversion     //
const util = require('./lib/utils');
var ch = util.convHash;   
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a simple database interface                              //
var database =  require('./lib/database');
const dbBlocks = 'blocks';
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// web interface                                            //
var http = require('http');
console.log('Web server started...');      // a debug message, can be deleted
http.createServer(function (req, res) {
  console.log('URL request: ' + req.url);  // a debug message, can be deleted
  res.setHeader("Access-Control-Allow-Origin", "*");
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
}).listen(3000);
// TO-DO: replase with express library?
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// data structures for blocks and transactions              //
var bitcore = require('bitcore-lib');
var BlockHeader = bitcore.BlockHeader;
var Block = bitcore.Block;
var Transaction = bitcore.Transaction;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// set-up parameters for EarthCoin network                  //
var fs=require('fs');
var configFile="./config.json";
var EACConfig=JSON.parse(fs.readFileSync(configFile));

var Networks = require('bitcore-lib').Networks;

var EACnetJson = EACConfig[0].EACnet;
//console.log('EACnet.name:' + EACnetJson.name);
var EACnet = {
  name: EACnetJson.name, 	 //'earthcoin',
  alias: EACnetJson.alias, 	 //'eacnet',
  pubkeyhash: conventToInt(EACnetJson.pubkeyhash), 	 //0x5d,
  privatekey: conventToInt(EACnetJson.privatekey), 	 //0xdd,
  scripthash: conventToInt(EACnetJson.scripthash), 	 //0x05,
  xpubkey: conventToInt(EACnetJson.xpubkey),  	//0x0488b21e,
  xprivkey: conventToInt(EACnetJson.xprivkey),  	//0x0488ade4,
  networkMagic: conventToInt(EACnetJson.networkMagic),  	//0xc0dbf1fd,
  port: EACnetJson.port, 	//35677,
  dnsSeeds: EACnetJson.dnsSeeds	 //[]
};  
Networks.add(EACnet);
var eac = Networks.get('earthcoin');
Networks.defaultNetwork = eac;

// data for the genesis block
const HASH0 = '21717d4df403301c0538f1cb9af718e483ad06728bbcd8cc6c9511e2f9146ced';
const HASH1 = 'af62faa20269542f3f4398670cfbd66cda2fb3b99c6ecf3075fb61ff8009b041';
const STOP = '0000000000000000000000000000000000000000000000000000000000000000';
const BLOCK0 = '010000000000000000000000000000000000000000000000000000000000000000000000b14b5c80816e64e616a2abb5e5b0396394817f4df0c12a4591184110367c75133811a852f0ff0f1e383fbe000102000000010000000000000000000000000000000000000000000000000000000000000000ffffffff6204ffff001d01044c5920446563656d6265722031392c20323031332097204172726573742c2073747269702d736561726368206f6620496e6469616e206469706c6f6d617420696e204e657720596f726b207472696767657273207570726f61722effffffff010000000000000000434104dcba12349012341234900abcd12223abcd455abcd77788abcd000000aaaaabbbbbcccccdddddeeeeeff00ff00ff00ff001234567890abcdef0022446688abc11ac0000000000';
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// set-up a pool of EAC nodes                               //
var Pool = require('bitcore-p2p').Pool;
var p2p = require('bitcore-p2p')
var Peer = p2p.Peer;
var Messages = p2p.Messages;

var pool = new Pool({
  network: eac, // the network object
  dnsSeed: false, // prevent seeding with DNS discovered known peers upon connecting
  listenAddr: true, // prevent new peers being added from addr messages
  maxSize: 1,
  // Initial peers to connect to; if you have a local legacy daemon, use the '127.0.0.1' IP address.
  // Alternativelly choose the fastest node manually here.
  addrs: [ 
    { ip: {v4: '5.9.10.66'} },
    { ip: {v4: '46.28.107.182'} },
    { ip: {v4: '47.100.119.161'} },
    { ip: {v4: '59.110.164.172'} },
    { ip: {v4: '76.169.51.184'} },
    { ip: {v4: '79.143.181.221'} },
    { ip: {v4: '80.211.198.20'} },
    { ip: {v4: '144.217.67.68'} },
    { ip: {v4: '119.27.187.110'} }, 
    { ip: {v4: '127.0.0.1'} }
  ]
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
      var qGenesis = {hash: HASH0, index: 0, data: block0}
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
// a function for Sixteen decimal decimal system            //
function conventToInt(str){
	if (str.substring(0, 2) == "0x" || str.substring(0, 2) == "0X")
	{
		str=str.substring(2, str.length);
	}
	
	var val = parseInt(str, 16);
	return val;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// a function for a quick sync with the network             //
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
pool.on('peerblock', function(peer, message) {
  var block = message.block;
  var header = block.header;
  var hash = header.hash;
  var prevHash = ch(header.prevHash);
  var rawBlock = block.toBuffer(); 
  var rqThis = {hash: hash,  prevHash: prevHash, data: rawBlock,};
  blockCache.push(rqThis);
  if (blockCache.length >= intoCache) {
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
  console.log('got an inventory ' + invs.length);  // a debug message, can be deleted
  if (invs.length > 0)
    if ((invs[0].type)==2)
      intoCache += invs.length;    // count only blocks but answer to all messages?
  var messages = new Messages();
  var msg = messages.GetData(invs);
  peer.sendMessage(msg);
});
// TO-DO:
// - ansver all other events to get a both dirrection communication
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
  queryI = [];  // new array used in the database query
  var cacheLen = treatCache.length;
  console.log('now ' + cacheLen + ' blocks will be sorted...');  // a debug message, can be deleted
  for (var j = 0; j < cacheLen; j++) {
    for (var i = 0; i < cacheLen; i++) {
      if (treatCache[i].prevHash == bestHash) {
        bestIndex++;
        treatCache[i].index = bestIndex;
        bestHash = treatCache[i].hash;
        queryI.push({hash: treatCache[i].hash, index: treatCache[i].index, data: treatCache[i].data });
      }
    }
  }
  var qLen = queryI.length;
  console.log('indexed ' + qLen + ' blocks, orphanScore ' + orphanScore); // a debug message, can be deleted
  // blocks without index will be forgoten and requested later when appropriate
  if (qLen > 0) {
    orphasScore = 0;
    database.insertArray(dbBlocks, queryI, function() {
      console.log('...' + (queryI.length) + ' blocks written to the database'); // a debug message, can be deleted
      syncChain();  // continue the sync by requesting a new package of blocks
    });
  }
  else if ( (cacheLen != 1 ) || (orphanScore > 2) ) {
    orphanScore --;
    database.erase(dbBlocks, {index: bestIndex}, function() {
      bestIndex--;
      database.search(dbBlocks, {index: bestIndex}, function(result) {
        if (result) {
           bestHash = result.hash;
           syncChain();
        }
      });
    });
  }
  else
    orphanScore++;
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API-call functions                                       //
function responseAPIrequest(res, commands) {
  nParams = commands.length;
  var command = (nParams == 0) ? 'help' : commands[0];
  var param = (nParams > 1) ? commands[1] : bestIndex;
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
    default:
      res.end('{"error": "unknown request"}');
  }
}

function showHelp(res) {
  var rts = '{\
    "avaiable_commands": {\
    "getheight": "return current block height",\
    "getblock": "return a block, takes block hash or block heigth as a param: http://url:port/getblock/param" }}';
  res.end(rts);
}

function getHeight(res) {
  var rts = JSON.stringify({height: bestIndex});
  res.end(rts);
}

function getBlock(res, param) {
  var index = Number(param);
  if ((!(isNaN(param))) && Number.isInteger(index)) {
    database.search(dbBlocks, {index: index}, function(rts) {
      showBlock(res, rts);
    });
  }
  else {
    database.search(dbBlocks, {hash: param}, function(rts) {
      showBlock(res, rts);
    });
  }
}

function showBlock(res, rts) {
  if (!rts) {
    console.log('API asked invalid block ');           // a debug message, can be deleted
    res.end('{"error": "unknown block requested"}');
    return;
  }
  if (!(rts.data)) {
    console.log('API asked non-indexed block ');       // a debug message, can be deleted
    var response = {hash: rts.hash, indexed: false}
    res.end(JSON.stringify(response));
    return;
  }
  var block = Block.fromBuffer(rts.data.buffer);
  var header = block.header;
  var transactions = block.transactions;
  var txs = [];
  transactions.forEach(function(tx) {
    txs.push(tx.hash);
  });
  var response = {
    hash: header.hash,
    confirmations: bestIndex-rts.index,
    size: rts.data.buffer.length,
    height: rts.index,
    version: header.version,
    merkleroot: ch(header.merkleRoot),
    tx: txs,
    time: header.time,
    nonce: header.nonce, 
    bits: header.bits.toString(16),
    difficulty: header.getDifficulty(),
    previousblockhash: ch(header.prevHash)   //,  TODO: need a simple method for nextBlockHash, if exists
//    nextblockhash: rts.nextHash
  };
  res.end(JSON.stringify(response));
}
