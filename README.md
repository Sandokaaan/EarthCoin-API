# EarthCoin-API
Full EarthCoin node with API based on bitpay/bitcore


Pre-requirements:
- MongoDB - https://docs.mongodb.com/manual/installation/
- Nodejs - https://nodejs.org/en/


Install & run:

git clone https://github.com/Sandokaaan/EarthCoin-API.git 

cd EarthCoin-API
nodejs sync.js &
nodejs api.js &


API interface:
http://<YOUR_SERVER_ADDRESS>:3000/


This code is under development, some functions are not implemented, yet.


What work?
- Sync from a network. Legacy EarthCoin daemon is not required. Under test conditions the node got full sync from a scratch within a hour.
- Api can shoh any block on hash or index query.


To do list:
- Configuration is hardcoded in the javascript for now. Need to be moved to a .json file to easier setup.
- ~~Detection of forks/orphans blocks.~~
- Indexing of transactions and API functions for read transactions info.
- Block explorer frontend based on the API.
- Implement functions for both-way comunication. For now the node not answer to other nodes queries.
- Automatic selection of the best node for data download, eg. based on a ping delay.
- Optimization of the code for multi-node queries, now the code select one network node to request all block data.
- Standardize modular design of the code, add NPM installer.

### update 2018-06-22
- deleted some files from dependency packages, that are not needed
- removed dependency on bcoin library
- detection of forks/orphans with an automatic recovery implemented
