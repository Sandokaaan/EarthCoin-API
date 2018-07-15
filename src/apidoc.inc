<h2>API documentation</h2>

<h3>1. General functions</h3>

<b>help</b><br>
Return a short help on the API functions in the JSON format. 
This is also the default API method, if no API command used.<br>
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/help</code><br>
<code>http://explorer.yourdomain.com:3000/api</code><br>
<br>

<h3>2. Block functions</h3>

<b>getheight</b> (aliases: <b>height</b>, <b>getblockcount</b>)<br>
Return the current block height. If the node is in sync with the network, 
it should be equal the number of blocks in the blockchain.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getheight</code><br>
<code>http://explorer.yourdomain.com:3000/api/height</code><br>
<br>

<b>getblock</b> (alias: <b>block</b>)<br>
Return a detail info on a particular block. 
The parameter can be a block hash or a block height.
If no parameter is passed, the current block is returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getblock</code><br>
<code>http://explorer.yourdomain.com:3000/api/block</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblock/99999</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblock/b9aa1aefa248a9d11b63fafde7a65f7367842b3a9bd1583ea6be487145375d58</code><br>
<br>

<b>getdifficulty</b> (alias: <b>difficulty</b>)<br>
Return the difficulty value of the last mined block.<br>
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getdifficulty</code><br>
<code>http://explorer.yourdomain.com:3000/api/difficulty</code><br>
<br>

<b>getblockhash</b> (alias: <b>blockhash</b>)<br>
Return the block hash of a particular block. 
The parameter can be a block hash or a block height.
If no parameter is passed, the current block hash is returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getblockhash</code><br>
<code>http://explorer.yourdomain.com:3000/api/blockhash</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblockhash/99999</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblockhash/b9aa1aefa248a9d11b63fafde7a65f7367842b3a9bd1583ea6be487145375d58</code><br>
<br>

<b>getblockheight</b> (aliases: <b>blockheight</b>, <b>getblockindex</b>, <b>blockindex</b>)<br>
Return the block height (index in the blockchain) of a particular block. 
The parameter can be a block hash or a block height.
If no parameter is passed, the current block height is returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getblockheight</code><br>
<code>http://explorer.yourdomain.com:3000/api/blockheight</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblockindex</code><br>
<code>http://explorer.yourdomain.com:3000/api/blockindex</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblockheight/99999</code><br>
<code>http://explorer.yourdomain.com:3000/api/getblockheight/b9aa1aefa248a9d11b63fafde7a65f7367842b3a9bd1583ea6be487145375d58</code><br>
<br>

<b>getrawblock</b> (aliases: <b>rawblock</b>)<br>
Return the raw data of a particular block as a hexadecimal string. 
The parameter can be a block hash or a block height.
If no parameter is passed, the data of current block are returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getrawblock</code><br>
<code>http://explorer.yourdomain.com:3000/api/rawblock</code><br>
<code>http://explorer.yourdomain.com:3000/api/getrawblock/99999</code><br>
<code>http://explorer.yourdomain.com:3000/api/getrawblock/b9aa1aefa248a9d11b63fafde7a65f7367842b3a9bd1583ea6be487145375d58</code><br>
<br>

<h3>3. Transaction functions</h3>

<b>txinfo</b> (alias: <b>tx</b>)<br>
Return a detail info on a particular transaction. 
The parameter have to be a transaction hash.
If an invalid transaction hash or no parameter is passed, an error message is returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/txinfo/b6732c039b62ec92cb6623872d2b5adf0460ccbf4144562941932029cba98bbf</code><br>
<code>http://explorer.yourdomain.com:3000/api/tx/b6732c039b62ec92cb6623872d2b5adf0460ccbf4144562941932029cba98bbf</code><br>
<br>

<b>getrawtransaction</b> (aliases: <b>rawtransaction</b>, <b>rawtx</b>,)<br>
Return the raw data of a particular a particular transaction as a hexadecimal string.
The parameter have to be a transaction hash.
If an invalid transaction hash or no parameter is passed, an error message is returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getrawtransaction/b6732c039b62ec92cb6623872d2b5adf0460ccbf4144562941932029cba98bbf</code><br>
<code>http://explorer.yourdomain.com:3000/api/rawtransaction/b6732c039b62ec92cb6623872d2b5adf0460ccbf4144562941932029cba98bbf</code><br>
<code>http://explorer.yourdomain.com:3000/api/rawtx/b6732c039b62ec92cb6623872d2b5adf0460ccbf4144562941932029cba98bbf</code><br>
<br>

<h3>4. Address functions</h3>

<b>addressfirstseen</b><br>
Return the time of the first transaction to the address
passed an the parameter. 
If an invalid/unused address or no parameter is passed, an error message is returned.<br>  
Example:<br> 
<code>http://explorer.yourdomain.com:3000/api/addressfirstseen/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<br>

<b>addressinfo</b><br>
Return a short summary of the address passed an the parameter. 
If an invalid/unused address or no parameter is passed, an error message is returned.<br>  
Example:<br> 
<code>http://explorer.yourdomain.com:3000/api/addressinfo/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<br>

<b>getbalance</b> (alias: <b>balance</b>)<br>
Return the unspent balance of the address passed an the parameter. 
If an invalid/unused address or no parameter is passed, an error message is returned.<br>  
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/getbalance/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<code>http://explorer.yourdomain.com:3000/api/balance/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<br>

<b>utxo</b> (alias: <b>unspent</b>)<br>
Return details on unspent transaction outputs of the address passed an the parameter. 
If an invalid/unused address or no parameter is passed, an error message is returned.<br>
The result of this function can be used to create a new tranasction on the client side. 
The addresses with too much transactions (e.g. a mining pool addresses) are protected 
and due to the complexity of the calculation, the result will not be shown.<br>   
Examples:<br> 
<code>http://explorer.yourdomain.com:3000/api/utxo/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<code>http://explorer.yourdomain.com:3000/api/unspent/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<br>

<b>txbyaddr</b><br>
Return details on all transactions of the address passed an the parameter. 
If an invalid/unused address or no parameter is passed, an error message is returned.<br>
The addresses with too much transactions (e.g. a mining pool addresses) are protected 
and due to the complexity of the calculation, the result will not be shown.<br>   
Example:<br> 
<code>http://explorer.yourdomain.com:3000/api/txbyaddr/eW1mCXiSfy4HfuBhVRfQ4kedviUcRLZd3T</code><br>
<br>