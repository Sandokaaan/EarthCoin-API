var bitcore = require('bitcore-lib');

var COINBASE = '0000000000000000000000000000000000000000000000000000000000000000';

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


// a function for buffer to hexa-string hash conversion     //
// convert a result of getBlocks to a conventional block hash
function convHash(data) {
  var copyData = Buffer.from(data);
  var hash = copyData.reverse().toString('hex');
  return hash;
}
//////////////////////////////////////////////////////////////


module.exports = {convHash, outputAddress, inputAddress};
