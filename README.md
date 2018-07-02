# EarthCoin-API
Full EarthCoin node with API based on bitpay/bitcore


## Pre-requirements:
- MongoDB - https://docs.mongodb.com/manual/installation/
- Nodejs - https://nodejs.org/en/


## Install & run:

git clone https://github.com/Sandokaaan/EarthCoin-API.git 

cd EarthCoin-API
nodejs sync.js &
nodejs api.js &

## Configuration
Some parameters, such as port number or preffered network nodes can be set in the file 'config.json'


### API interface:
http://<YOUR_SERVER_ADDRESS>:3000/


This code is under development, some functions are not implemented, yet.


## What work?
- Sync from a network. Legacy EarthCoin daemon is not required. Under test conditions the node got full sync from a scratch within a hour.
- Api can show any block on hash or index query.
- Api can show any transaction and address balance.
- Api function for unspent balance (UTXO). Addresses with more that CONFIG.dbLimit are not shown because of complexity of the calculation (may take up to 30 seconds).


## To do list:
- ~~Configuration is hardcoded in the javascript for now. Need to be moved to a .json file to easier setup.~~
- ~~Detection of forks/orphans blocks - it is still buggy, from time to time lost the sync~~
- ~~Indexing of transactions and API functions for read transactions info.~~
- Block explorer frontend based on the API.
- Implement functions for both-way comunication. For now the node not answer to other nodes queries.
- Automatic selection of the best node for data download, eg. based on a ping delay.
- Optimization of the code for multi-node queries, now the code select one network node to request all block data.
- Standardize modular design of the code, add NPM installer.
- ~~Split API and SYNC into two independend proccesses. Some API calls can break the sync.~~
- ~~A better design of transaction indexing --> speed-up calculation of a big wallet balance.~~
- ~~A request for balance of an address with a huge number of transactions can cause DoS. Only small wallets will be enabled without API key.~~
- A database structure for a quick calculation of unspent balance for mining addresses (about 10-50k coinbase transactions) ???
