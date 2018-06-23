////////////////////////////////////////////////////////////////
// convert a result of getBlocks to a conventional block hash
function convHash(data) {
  var copyData = Buffer.from(data);
  var hash = copyData.reverse().toString('hex');
  return hash;
}
/////////////////////////////////////////////////////////////////

module.exports = { convHash }
