//////////////////////////////////////////////////////////////
// Load configuration file                                  //
//
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
//
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
//
var utils =  require('./lib/utils');
var convHash = utils.convHash;
var outputAddress = utils.outputAddress;
var inputAddress = utils.inputAddress;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a simple database interface                              //
//
var database =  require('./lib/database');
var dbBlocks = CONFIG.dbBlocks;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// an initial database query on block height
//
database.searchCount(dbBlocks, {}, function(result) {
  bestIndex = (result-1);
});
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// web interface
//
var apiPort = CONFIG.apiPort;                                      
var http = require('http');
console.log('Web server started...');      // a debug message, can be deleted
http.createServer(function (req, res) {
  console.log('URL request: ' + req.url);  // a debug message, can be deleted
  var url = req.url;
  var commands = url.replace(/\/\s*$/,'').split('/');
  commands.shift();
  if (commands[0] === 'api') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Request-Method', '*');
    res.setHeader('Access-Control-Allow-Methods', 'OPTIONS, GET');
    res.setHeader('Access-Control-Allow-Headers', '*');
    res.writeHead(200, {
      'Content-Type': 'application/json',
      'X-Powered-By': 'sando'
    });
    commands.shift();
    responseAPIrequest(res, commands);
  }
  else {
    responseExplorer(res, commands);
  }  
}).listen(apiPort);
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// data structures for blocks and transactions              //
//
var bitcore = require('bitcore-lib');
var Block = bitcore.Block;
var SAT = 100000000;
var COINBASE = CONFIG.blockchain.nullHash;
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
//   ***  utility functions  ***                            //
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Remove unsafe characters from an input string to prevent
// script/database injection attack
//  
function safeString(s) {
  return s.replace(/\W/g, '');
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Converet a part of string from URL request to a 4-char string
// without any special symbols, with 'main' as a default.
// 
function safeCommand(s) {
  var cl = s.length;
  var command = (cl == 0) ? 'main' : s[0].substring(0,4).replace(/\W/g, '');
  return command;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Convert a part of a string from URL request to a parameter
// without any special symbols. Param will contain coin address,
// transaction id, block hash or block index.
//
function safeParam(s) {
  var cl = s.length;
  var param = (cl == 0) ? '' : s[0].substring(7, s[0].length).replace(/\W/g, '');
  return param;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Calculate a difference between now and a past timestamp in minutes.
//
function calcAge(time) {
  var dif = Math.round((Math.floor(Date.now())/1000 - time)/6)/10;
  return dif;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Convert a timestamp to a human readable date/time.
//
function timeToISO(time) {
  var newDate = new Date();
  newDate.setTime(time*1000);
  var dstr = newDate.toISOString().replace('T', ' ').substring(0, 19);
  return dstr;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Add an item into the list (array) to be contained only once. 
//  
function condPush(list, item) {
  var isIn = false;
  for (var i=0; i<list.length; i++) {
    if (list[i] === item) {
      isIn = true;
      break;
    }
  }
  if (!isIn)
    list.push(item);
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// Indexing of address usage in the database by 'oid' parameter
// 'char_number1_number2'. This function split it back to 3
// components
//
function DEOID(oid) {
  var arr = oid.split('_');
  return {typ: arr[0], ti: Number(arr[1]), oi: Number(arr[2])};
}
//////////////////////////////////////////////////////////////



//////////////////////////////////////////////////////////////
//   ***  API-call functions  ***                           //
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API web interface command recognization
//
function responseAPIrequest(res, commands) {
  var nParams = commands.length;
  var command = (nParams == 0) ? 'help' : safeString(commands[0]);
  var param = (nParams > 1) ? safeString(commands[1]) : '';
console.log(command, param);
  switch(command) {
    case 'help':
      showHelp(res);
      break;
    case 'getheight':
    case 'height':
    case 'getblockcount':
      showHeight(res);
      break;
    case 'getblock':
    case 'block':
      showBlock(res, param);
      break;
    case 'txinfo':
    case 'tx':
      showTxInfo(res, param);
      break;
    case 'addressfirstseen':
      showAddressFirst(res, param);
      break;
    case 'addressinfo':
      showAddrInfo(res, param);
      break;
    case 'getbalance':
    case 'balance':
      showBalance(res, param);
      break;
    case 'utxo':
    case 'unspent':
      showUnspent(res, param);
      break;
    case 'txbyaddr':
      showTxByAddr(res, param);
      break;
    case 'getdifficulty':
    case 'difficulty':
      showDifficulty(res);
      break;
    case 'getblockhash':
    case 'blockhash':
      showBlockHash(res, param);
      break;
    case 'getblockheight':
    case 'getblockindex':
    case 'blockheight':
    case 'blockindex':
      showBlockHeight(res, param);
      break;
    case 'getrawblock':
    case 'rawblock':
      showRawBlock(res, param);
      break;
    case 'getrawtransaction':
    case 'rawtransaction':
    case 'rawtx':
      showRawTx(res, param);
      break;
    default:
      res.end('{"error": "unknown request"}');
  }
}

//////////////////////////////////////////////////////////////
// A default API command, it will show list of avaiable API 
// commands and a short description.
function showHelp(res) {
  var rts = {
    avaiable_commands: {
      help: "show this help on avaiable API commands",
      getheight: "return current block height",
      height: "the same as getheight",
      getblock: "return a block, takes block hash or block heigth as PARAM: http://url:port/api/getblock/PARAM",
      block: "the same as getblock",
      txinfo: "return details of transactions TX: http://url:port/txinfo/TX",
      tx: "the same as txinfo",
      addressfirstseen: "return the time when ADDRESS appeared in the blockchain: http://url:port/api/addressfirstseen/ADDRESS",
      getbalance: "return balance of ADDRESS: http://url:port/api/getbalance/ADDRESS",
      addressinfo: "return a short summary of the address balance and transactions",
      balance: "the same as getbalance",
      utxo: "return unspent transaction outputs of ADDRESS: http://url:port/api/utxo/ADDRESS",
      unspent: "the same as utxo",
      txbyaddr: "return a list of all transactions on ADDRESS: http://url:port/api/txbyaddress/ADDRESS"
    }
  };
  res.end(JSON.stringify(rts));
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API command to show a raw block data
//
function showRawBlock(res, param) {
  if (param === '')
    param = bestIndex;
  var index = Number(param);
  var query = ((!(isNaN(param))) && Number.isInteger(index)) ? {i: index} : {_id: param};
  database.search(dbBlocks, query, function(rts) {
    if (rts)
      res.end(JSON.stringify(rts.d.buffer.toString('hex')));
    else
      res.end(JSON.stringify({error: 'not found'}));
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API command to show a raw block data
//
function showRawTx(res, param) {
  if (param === '') {
    res.end(JSON.stringify({error: 'not found'}));
    return; 
  }
  var query =  {t: param};
  database.search(dbBlocks, query, function(rts) {
    if (rts) {
      block = Block.fromBuffer(rts.d.buffer);
      var i=0;
      while (block.transactions[i].hash != param)
        i++;
      res.end(JSON.stringify(block.transactions[i].toString('hex')));
    }
    else
      res.end(JSON.stringify({error: 'not found'}));
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API command to show the current minning difficulty
//
function showDifficulty(res) {
  var param = bestIndex;
  getBlock(param, function(response) {
    if (response.hasOwnProperty('difficulty'))
      res.end(JSON.stringify(response.difficulty));
    else
      res.end(JSON.stringify(response));
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API command to show a block hash
//
function showBlockHash(res, param) {
  if (param === '')
    param = bestIndex;
  getBlock(param, function(response) {
    if (response.hasOwnProperty('hash'))
      res.end(JSON.stringify(response.hash));
    else
      res.end(JSON.stringify(response));
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API command to show a block height
//
function showBlockHeight(res, param) {
  if (param === '')
    param = bestIndex;
  getBlock(param, function(response) {
    if (response.hasOwnProperty('height'))
      res.end(JSON.stringify(response.height));
    else
      res.end(JSON.stringify(response));
  });
}
//////////////////////////////////////////////////////////////	


//////////////////////////////////////////////////////////////
// API command to show the current height of the blockchain
//
function showHeight(res) {
  var rts = JSON.stringify({height: bestIndex});
  res.end(rts);
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API command to show a block details. If no param given,
// it will show the latest block.
//
function showBlock(res, param) {
  if (param == '') 
    param = bestIndex;
  getBlock(param, function(response) {
    res.end(JSON.stringify(response));
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A function to read a block from the database. Autodetect if 
// the param is block index or block hash, extract the data
// of the block found and return the as a JSON structure.
// When finished, the callBack function is called because
// database operations are asynchronous so the value can 
// not be simply returned by the return command.
//
function getBlock(param, callBack) {
  var index = Number(param);
  var query = ((!(isNaN(param))) && Number.isInteger(index)) ? {i: index} : {_id: param};
  database.search(dbBlocks, query, function(rts) {
    if (!rts) {
      console.log('API asked invalid block ');           // a debug message, can be deleted
      callBack({error: "unknown block requested"});
      return;
    }
    var response;
    if (!(rts.d)) {
      console.log('API asked non-indexed block ');       // a debug message, can be deleted
      response = {hash: rts.h, indexed: false};          // theoretically should never happen ?
      callBack(response);
      return;
    }
    var block = Block.fromBuffer(rts.d.buffer);
    var size = rts.d.buffer.length;
    var header = block.header;
    var transactions = block.transactions;
    var txs = [];
    var totalOutput = 0;
    transactions.forEach(function(tx) {
      txs.push(tx.hash);
      tx.outputs.forEach( function(output) {
        totalOutput += output.satoshis;
      });
    });
    var created = transactions[0].outputs[0].satoshis;
    response = {
      hash: header.hash,
      confirmations: (bestIndex - rts.i),
      size: size,
      height: rts.i,
      version: header.version,
      merkleroot: convHash(header.merkleRoot),
      tx: txs,
      valueout: totalOutput,
      created: created,
      time: header.time,
      nonce: header.nonce, 
      bits: header.bits.toString(16),
      difficulty: header.getDifficulty(),
      previousblockhash: convHash(header.prevHash)
    };
    callBack(response);
    return;
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API command to show a transaction details. If no param given,
// an error message is shown.
//
function showTxInfo(res, param) {
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
    var response = getTxInfo(rts, param);
    res.end(JSON.stringify(response));
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Extranct the particular transaction from block database record
// passed in rts and return info on the transaction in JSON format.  
//
function getTxInfo(rts, param) {
  if (rts.i > 0) {
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
        return response;
      }
      txIndex++;
    }
  }
  return {error: "unknown"};   // The code never should got here, but for a safety. 
} 
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API command to show the firts occurency of the address 
// (passed as param) in the blockchain.
//
function showAddressFirst(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = { a: param };
  database.search(dbBlocks, query, function(rts) {      // no need for a sort-search, blocks have been sorted in the database
    if (!rts) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    var block = Block.fromBuffer(rts.d.buffer);
    res.end(JSON.stringify(timeToISO(block.header.time)));
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API command to show the avaiable balance on an address.
// Calculation for a large address (e.g. used for mining) take place
// up to 30 seconds.
//
function showBalance(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = { a: param };
  database.searchMore(dbBlocks, query, function(rts) {
    if (rts.length === 0) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    var jsonRts = exBalance(param, rts);
    var balance = jsonRts.balance;
    res.end(JSON.stringify(balance));
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API command to show the a short summary of an address.
// Calculation for a large address (e.g. used for mining) take place
// up to 30 seconds.
//
function showAddrInfo(res, param) {
  if (param == '') {
    res.end('{"error": "unknown address requested"}');
    return;
  }
  var query = { a: param };
  database.searchMore(dbBlocks, query, function(rts) {
    if (rts.length === 0) {
      res.end('{"error": "unknown address requested"}');
      return;
    }
    var jsonRts = exBalance(param, rts);
    res.end(JSON.stringify(jsonRts));
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// API command to show the unspent outputs of an address.
// Returns the informations needed to construct a spent transaction.
// Similarly the getbalance API command, limit on transaction count
// is applied due to the algorithm complexity. 
//
function showUnspent(res, param) {
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
    var unspent = findUnspent(rts, param);
    res.end(JSON.stringify(unspent));
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Analyze the block records found in the database to identify
// the unspent transactions of an address passed in param.
// Dev note: calculation could be moved to the client side
// and server would only do the database search?
//
function findUnspent(blocks, param) {
  var txo = {};
  var unspent = [];
  blocks.forEach( function(blockRecord) { 
    var block = Block.fromBuffer(blockRecord.d.buffer);
    var txs = block.transactions;
    var i=0;
    while (blockRecord.a[i] != param)
      i++;
    var b = blockRecord.b[i];
    Object.keys(b).forEach( function(c) {
      var doid = DEOID(c);
      var tx = txs[doid.ti];
      if (doid.typ == 'o') {
        var id =  tx.hash + '_' + doid.oi;
        txo[id] = {
          tx_hash: tx.hash,
          tx_output_n: doid.oi,
          value: b[c],
          confirmations: bestIndex - blockRecord.i,
          script: tx.outputs[doid.oi].script.toBuffer().toString('hex')
        };
      }
      else {
        var input = tx.inputs[doid.oi];
        var prevTxId = input.prevTxId.toString('hex');
        var outIndex = input.outputIndex;
        var idSpent = prevTxId + '_' + outIndex;
        txo[idSpent] = false;
      }
    });
  });
  Object.values(txo).forEach( function(item) {
    if (item != false) {
      unspent.push(item);
    }
  });
  return unspent;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// API call for detailed list of input and output transactions
// on an address.  
//
function showTxByAddr(res, param) {
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
    findAllTx(rts, param, function(response) {
      res.end(JSON.stringify(response));
    });
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Prepare a list (in the JSON format) of transactions on an 
// address for the API function txbyaddr. 
// Dev note: Here the call-back style for return values was
// needless - replace with a single return? 
//
function findAllTx(blocks, param, callBack) {
  var txo = {};
  blocks.forEach( function(blockRecord) { 
    var block = Block.fromBuffer(blockRecord.d.buffer);
    var txs = block.transactions;
    var i=0;
    while (blockRecord.a[i] != param)
      i++;
    var b = blockRecord.b[i];
    Object.keys(b).forEach( function(c) {
      var toAddrs = [];
      var srcAddrs = [];
      var doid = DEOID(c);
      var tx = txs[doid.ti];
      var blockInfo = { 
        block_hash: blockRecord._id,
        block_height: blockRecord.i,
        block_time: block.header.time
      };
      var txInfo;
      if (doid.typ == 'o') {
        var id =  tx.hash + '_' + doid.oi;
        tx.inputs.forEach( function(input) {
          condPush(srcAddrs, inputAddress(input));
        });
        txInfo = {
          tx_hash: tx.hash,
          tx_index: doid.ti,
          tx_comment: tx.txComment,
          tx_output_index: doid.oi,
          confirmations: bestIndex - blockRecord.i
        };
        var fromInfo = {
          source: srcAddrs,
          block: blockInfo,
          transaction: txInfo 
        };
        txo[id] = {
          value: b[c],
          script: tx.outputs[doid.oi].script.toBuffer().toString('hex'),
          spent: false,
          received_from: fromInfo
        };
      }
      else {
        tx.outputs.forEach( function(output) {
          condPush(toAddrs, outputAddress(output));
        });
        var input = tx.inputs[doid.oi];
        var prevTxId = input.prevTxId.toString('hex');
        var outIndex = input.outputIndex;
        var idSpent = prevTxId + '_' + outIndex;
        txInfo = {
          tx_hash: tx.hash,
          tx_index: doid.ti,
          tx_comment: tx.txComment,
          tx_input_index: doid.oi,
          confirmations: bestIndex - blockRecord.i
        };
        var spentInTx = {
          target: toAddrs,
          block: blockInfo,
          transaction: txInfo
        };
        txo[idSpent].spent = true;
        txo[idSpent].sent_to = spentInTx;
      }
    });
  });
  callBack(Object.values(txo));
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// ***  Block Explorer functions  ***                       //
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Web interface of the Block Explorer code.
// It translates the URL to commands 
// and calls the appropriate internal functions.
// TODO: The current implementation does not allow graphic
// resources (icons, images, etc.). Is there a simple way for it?   
//
function responseExplorer(res, commands) {
  var command = safeCommand(commands);
  var param = safeParam(commands);
  res.writeHead(200, {'Content-Type': 'text/html'});
  res.write('<!DOCTYPE html><html><head><title>'+CONFIG.coinName+' ('+CONFIG.ticker+') Block Explorer</title>');
  res.write('<style>a:link, a:visited {text-decoration: none; color: blue}</style>');
  res.write('</head><body>');
  switch(command) {
    case 'help':
      exHelp(res);
      break;
    case 'find':
      exFind(res, param);
      break;
    default:
      exMain(res);
  }
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A shorcut function for creation the common top part of 
// the Block Explorer web page.
//
function exHeader(res) {
  var title = '<h1><p align="center"><a href="main">Block Explorer for '+CONFIG.coinName+'</a></p></h1>';
  var searchBar = '<div align="center"> <form action="find" method="get">';
  searchBar+= '<input name="q" type="text" size="80" placeholder="block hash, index, transaction or address" />';
  searchBar+= '<input type="submit" value="Search" /></form></div><hr>';
  var navBar = '<table width="100%"><tr><td width="20%"><B>Block height &nbsp;&nbsp;'+bestIndex+'</b></td>';
  navBar+= '<td width="60%">&nbsp;</td>';
  navBar+= '<td width="20%"><a href="/help">API documentation</a> &nbsp&nbsp&nbsp';
  navBar+= '<a href="/api"> API link</a></td></tr></table>';
  res.write(title);
  res.write(navBar);
  res.write(searchBar);
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A shorcut function for creation the common bottom part of 
// the Block Explorer web page and finishing the http response.
//
function exFooter(res) {
  var footer = '<hr><p align="center">Powered by <A href="https://github.com/Sandokaaan/EarthCoin-API">Sando-explorer</A> &nbsp; &#9400; 2018</P></body></html>';
  res.write(footer);
  res.end();
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Block Explorer default page - tha last 50 blocks sumary 
//
function exMain(res) {
  last50Blocks( function(blockList) { 
    exHeader(res);
    res.write(lbInfo(blockList));
    exFooter(res);
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Search the database for the last 50 blocks and pass them to 
// the call-back function. Call-back is used due to the database
// requests are asynchronous.  
//
function last50Blocks(callBack) {
  var query = {i: {$gt: (bestIndex-50)}};
  database.searchMore(dbBlocks, query, function(rts) {
    callBack(rts);
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Extranct block infromations from database block records 
// passed in and return them in the HTML format.
//
function lbInfo(blockList) {
  var response = '<H3>Last Blocks </H1><HR><table width="100%" border="1">';
  response+= '<tr><td width="16%" align="center">Block Height</td><td width="16%" align="center">Age (min)</td>';
  response+= '<td width="16%" align="center">Transactions</td><td width="16%" align="center">Value Out (' + CONFIG.ticker + ')</td>';
  response+= '<td width="16%" align="center">Difficulty</td><td width="20%" align="center">Extracted by</td></tr>';
  for (var i=(blockList.length-1); i>0; i--) {
    var block = Block.fromBuffer(blockList[i].d.buffer);
    response+= '<tr><td align="center"><a href="/find?q=' + blockList[i].i + '">' + blockList[i].i + '</a></td>';
    var time = block.header.time;
    response+= '<td align="center">'+ calcAge(time) + '</td>';
    response+= '<td align="center">'+ block.transactions.length;
    response+= '<font color="gray"> &nbsp;&nbsp;&nbsp;&nbsp;(';
    response+= parseInt(Math.round(blockList[i].d.buffer.length/102.4))/10 + ' kB)</font></td>';
    var valOut = 0;
    block.transactions.forEach( function(tx) {
      tx.outputs.forEach( function(output) {
        valOut += output.satoshis;
      });
    });
    response+= '<td align="center">'+ valOut/SAT + '</td>';
    response+= '<td align="center">'+ block.header.getDifficulty() + '</td>';
    response+= '<td align="center"><font size="2">'+ outputAddress(block.transactions[0].outputs[0]) + '</font></td>';
    response+= '</tr>';
  }
  response+= '</table>';
  return response;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Search the database for string passed in param and try
// to interpret is as a block index/hash, transaction id
// or address. Result is translatet into the HTLM code
// by daughter functions and passed to the call-back function. 
//
function universalSearch(param, callBack) {
  if (param == '')
    param = bestIndex;
  var query = {$or: [ {_id: param}, {i: Number(param)}, {t: param}, {a: param} ] };
  database.searchMore(dbBlocks, query, function(rts) {
    var response;
    if (rts.length == 0) {  // error
      response = 'Nothing found.';
      callBack(response);
      return;
    }
    else if (rts.length > 1) { // address
      response = exAddress(exBalance(param, rts));
      callBack(response);
      return;
    }
    else if (rts[0]._id === param) { // block by hash
      response = exBlock(param, rts);
      callBack(response);
      return;
    }
    else if (rts[0].i === Number(param)) { // block by index
      response = exBlock(param, rts);
      callBack(response);
      return;
    }
    else {
      var tx=rts[0].t;
      for (var i=0; i<tx.length; i++) {
        if (tx[i] === param) { // transaction
          response = exTx(param, rts);
          callBack(response);
          return;
        }
      }
      // probably address
      response = exAddress(exBalance(param, rts));
      callBack(response);
      return;
    }
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Block Explorer function for the search functionality. 
//
function exFind(res, param) {
  universalSearch(param, function(response) {
    exHeader(res);
    res.write(response);
    exFooter(res);
  });
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// Block Explorer function to show the API documentation.
// TODO: Create the API documentation!
//
function exHelp(res) {
  exHeader(res);
  var apidocread = '';
  fs.readFile('./src/apidoc.inc', 'utf8', function (err, data) {
    res.write(data);
    exFooter(res);
  });
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// a sub-procedure to calculate balance and totalReceived 
// of an address
//
function exBalance(param, found) {
  console.log('memory db start');
  var txo = {};
  var cntr = {};
  var cnts = {};
  var totalReceived = 0;
  var balance = 0;
  found.forEach( function(blockRecord) {
    var revBlockHex = null;
    var i=0;
    while (blockRecord.a[i] != param)
      i++;
    var b = blockRecord.b[i];
    Object.keys(b).forEach( function(c) {
      var doid = DEOID(c);
      var txId = blockRecord.t[doid.ti];
      if (doid.typ == 'o') {
        var id =  txId + '_' + doid.oi;
        var received = b[c];
        txo[id] = received;
        totalReceived += received;
        balance += received;
        cntr[txId] = true;
      }
      else {
        if (!revBlockHex)
          revBlockHex = convHash(blockRecord.d.buffer);
        var doid2 = DEOID(b[c]);
        var pos = doid2.ti;
        var prevTxId = revBlockHex.substring(pos, pos+64);
        var idSpent = prevTxId + '_' + doid2.oi;
        balance -= txo[idSpent];
        txo[idSpent] = 0;
        cnts[txId] = true;
      }
    });
  });
  var firstBlock = Block.fromBuffer(found[0].d.buffer);
  var fbt = timeToISO(firstBlock.header.time);
  var fbi = found[0].i;
  var lbt = fbt;
  var lbi = found[found.length-1].i;
  if (found.length > 1) {
    var lastBlock = Block.fromBuffer(found[found.length-1].d.buffer);
    lbt = timeToISO(lastBlock.header.time);
  }
  console.log('memory db end');
  return { 
    address: param,
    balance: balance/SAT, 
    received: totalReceived/SAT,
    sent: (totalReceived-balance)/SAT,
    txIn: Object.values(cntr).length,
    txOut: Object.values(cnts).length,
    blocks: found.length,
    firstTxBlock: fbi,
    firstTxTime: fbt,
    lastTxBlock: lbi,
    lastTxTime: lbt
  };
}
//////////////////////////////////////////////////////////////


//////////////////////////////////////////////////////////////
// A daughter function of universalSearch function for the case
// an address is detected in the user input.
// Extract information on particular address (passed in param)
// from the list of block database records (passed in found)
// and return them in the HTML format.
//
function exAddress(rts) {
  var response = '<H3>Details of address ' + rts.address + '</H1><HR><table width="100%">';
  response+= '<tr><td width="25%">Address</td><td width="75%">' + rts.address + '</td></tr>';
  response+= '<tr><td>Balance (' + CONFIG.ticker + ') </td><td><b>' + rts.balance + '</b></td></tr>';
  response+= '<tr><td>Received (' + CONFIG.ticker + ') </td><td>' + rts.received;
  response+= '&nbsp;&nbsp;&nbsp;&nbsp; <font color="gray">in ' + rts.txIn + ' transactions</font></td></tr>';
  response+= '<tr><td>Sent (' + CONFIG.ticker + ') </td><td>' + rts.sent;
  if (rts.txOut > 0)
    response+= '&nbsp;&nbsp;&nbsp;&nbsp; <font color="gray">in ' + rts.txOut + ' transactions</font>';
  response+= '</td></tr>';
  response+= '<tr><td>Blocks Effected</td><td>' + rts.blocks + '</td></tr>';
  response+= '<tr><td>First Transaction</td><td>' + rts.firstTxTime;
  response+= '&nbsp;&nbsp;&nbsp;&nbsp;<font color="gray"> in block <a href="/find?q=';
  response+= rts.firstTxBlock + '">' + rts.firstTxBlock + '</a></font></td></tr>';
  if (rts.firstTxBlock != rts.lastTxBlock) {
    response+= '<tr><td>Last Transaction</td><td>' + rts.lastTxTime;
    response+= '&nbsp;&nbsp;&nbsp;&nbsp;<font color="gray"> in block <a href="/find?q=';
    response+= rts.lastTxBlock + '">' + rts.lastTxBlock + '</a></font></td></tr>';
  }
  response+= '</table>';
  return response;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A daughter function of universalSearch function for the case
// a block index/hash is detected in the user input.
// Extract information on particular block
// and return them in the HTML format.
//
function exBlock(param, found) {
  var blockRecord = found[0];       // block should always be unicate
  var block = Block.fromBuffer(blockRecord.d.buffer);
  var response = '<H3>Details of block ' + param + '</H1><HR><table width="100%">';
  response+= '<tr><td width="25%">Hash</td><td width="75%">' 
  if (blockRecord.i > 0) 
    response+= '<A href="find?q='+ (blockRecord.i-1) + '"> <B>&lt;&lt;</B> </A>';
  response+='&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; ' + blockRecord._id;
  if (blockRecord.i < bestIndex)
    response+= ' &nbsp;&nbsp;&nbsp;&nbsp;&nbsp; <A href="find?q='+ (blockRecord.i+1) +'"> <B>&gt;&gt;</B> </A>';
  response+= '</td></tr>';
  response+= '<tr><td>Height</td><td>' + blockRecord.i + '</td></tr>';
  response+= '<tr><td>Confirmations</td><td>' + (bestIndex + 1 - blockRecord.i) + '</td></tr>';
  var time = block.header.time;
  var newDate = new Date();
  newDate.setTime(time*1000);
  var dstr = newDate.toISOString().replace('T', ' ').substring(0, 19);
  response+= '<tr><td>Date/Time</td><td>'+ dstr + '</td></tr>';
  response+= '<tr><td>Count of transactions</td><td>' + block.transactions.length;
  response+= '<font color="gray"> (size ' + parseInt(Math.round(blockRecord.d.buffer.length/102.4))/10 + ' kB) </font></td></tr>';
  if (blockRecord.i === 0) {
    response+= '</table><font color="red">This is the genesis block.</font>'
    return response;
  }
  var valueOut = 0;
  var valuesOut = [];
  var txHashes = [];
  var txAmounts = [];
  var txFroms = [];
  var txTos = [];
  var i = 0;
  block.transactions.forEach( function(tx) {
    var txValue = 0;
    var txAmount = [];
    var txFrom = [];
    var txTo = [];
    tx.inputs.forEach( function(input) {
      condPush(txFrom, inputAddress(input) );
    });
    txFroms.push(txFrom);
    console.log(tx.outputs[0]);
    tx.outputs.forEach( function(output) {
      txValue += output.satoshis;
      txAmount.push(output.satoshis);
      txTo.push(outputAddress(output));
    });
    txHashes.push(tx.hash);
    txTos.push(txTo);
    valuesOut.push(txValue);
    txAmounts.push(txAmount);
    valueOut += txValue;
    i++;
  });
  response+= '<tr><td>Value Out (' + CONFIG.ticker + ')</td><td>' + valueOut/SAT + '</td></tr>';
  response+= '<tr><td>Difficulty</td><td>' + block.header.getDifficulty() + '</td></tr>';
  response+= '<tr><td>Block Reward (' + CONFIG.ticker + ')</td><td>' + valuesOut[0]/SAT + '</td></tr></table>';
  response+= '<br><br>Transactions<br><font size="2"><table width="100%" border="1">';
  response+= '<tr><td width="2%" align="center">#</td><td width="38%" align="center">Hash</td>';
  response+= '<td width="10%" align="center">Value Out (' + CONFIG.ticker + ')</td><td width="20%" align="center">From</td>';
  response+= '<td width="20%" align="center">To</td><td width="10%" align="center">Amount (' + CONFIG.ticker + ')</td</tr>';
  i = 0;
  txHashes.forEach( function(tx) {
    response+= '<tr><td align="center">' + i + '</td><td align="center"><a href=/find?q='+tx+'>';
    response+= tx + '</a></td><td align="center">';
    response+= valuesOut[i]/SAT + '</td><td align="center">';
    txFroms[i].forEach( function(from) {
      if (from === 'coinbase')
        response+= from + '<br>';
      else
        response+= '<a href="/find?q=' + from + '">' + from + '</a><br>';
    });
    response+= '</td><td align="center">';
    txTos[i].forEach( function(to) {
      response+= '<a href="/find?q=' + to + '">' + to + '</a><br>';
    });
    response+= '</td><td align="center">';
    block.transactions[i].outputs.forEach( function(output) {
      response+= output.satoshis/SAT + '<br>';
    });
    response+= '</td></tr>';
    i++;
  });
  response+= '</table></font>';
  return response;
}
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// A daughter function of universalSearch function for the case
// a transaction id is detected in the user input.
// Extract information on particular transaction
// and return them in the HTML format.
//
function exTx(param, found) {
  var blockRecord = found[0];       // block should always be unicate
  var block = Block.fromBuffer(blockRecord.d.buffer);
  var txs = block.transactions;
  var response = '<H3>Details of transaction ' + param + '</H1><HR><table width="100%">';
  var i = 0;
  while (txs[i].hash != param)
    i++;
  response+= '<tr><td width="25%">Hash (txid)</td><td width="75%">' + txs[i].hash + '</td></tr>';
  response+= '<tr><td>Block Height</td><td><a href="/find?q=' + blockRecord.i + '">';
  response+= blockRecord.i + '</a> (' + (bestIndex+1-blockRecord.i) + ' confirmations)</td></tr>' ;
  response+= '<tr><td>Transaction Index</td><td>' + i + '</td></tr>';
  response+= '<tr><td>Count of Inputs</td><td>' + txs[i].inputs.length + '</td></tr>';
  response+= '<tr><td>Count of Outputs</td><td>' + txs[i].outputs.length + '</td></tr>';
  response+= '<tr><td>Block Time</td><td>'+ timeToISO(block.header.time) + '</td></tr>';
  if (blockRecord.i === 0) {
    response+= '</table><font color="red">This is a pseudo-transaction in the genesis block.</font>'
    return response;
  }
  response+= '</table><table width="100%" border="1">';
  response+= '<tr><td width="45%" align="center">Input Addresses</td>';
  response+= '<td width="45%" align="center">Output Addresses</td>';
  response+= '<td width="10%" align="center">Amount (' + CONFIG.ticker + ')</td></tr>';
  response+= '<tr><td align="center">';
  var ins = [];
  txs[i].inputs.forEach( function(input) {
    condPush(ins, inputAddress(input));
  });
  ins.forEach( function(ia) {
    response+= (ia === 'coinbase') ? ia + '<br>' : '<a href="/find?q=' + ia + '">' + ia + '</a><br>';
  });
  response+= '</td><td align="center">';
  txs[i].outputs.forEach( function(output) {
    response+= '<a href="/find?q=' + outputAddress(output) + '">' + outputAddress(output) + '</a><br>';
  });
  response+= '</td><td align="center">';
  var sum = 0;
  txs[i].outputs.forEach( function(output) {
    response+= output.satoshis/SAT + '<br>';
    sum += output.satoshis;
  });
  response+= '</td></tr>';
  response+= '<tr><td></td><td align="right"><b>Total output &nbsp;&nbsp;</b></td><td align="center"><b>'+sum/SAT+'</b></td></tr>';
  response+= '</table>';
  return response;
}
//////////////////////////////////////////////////////////////
