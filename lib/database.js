'use strict';

//////////////////////////////////////////////////////////////
// load configuration
var fs = require('fs');
JSON.minify = JSON.minify || require("node-json-minify");
if (!fs.existsSync('config.json')){
    console.log('config.json file does not exist. Read the installation/setup instructions.');
    return;
}
var CONFIG = JSON.parse(JSON.minify(fs.readFileSync("config.json", {encoding: 'utf8'})));
console.log('config load in database.js');
//////////////////////////////////////////////////////////////

//////////////////////////////////////////////////////////////
// set-up Mongo parameters
var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://' + CONFIG.dbIP + ':' + CONFIG.dbPort;
var dbName = CONFIG.dbName;
//////////////////////////////////////////////////////////////

function search(table, item, callBack)
{
//  console.log(item);
  MongoClient.connect(url, function(err, db) {
    if (err)
      throw err;
    var dbo = db.db(dbName);
    dbo.collection(table).findOne(item, function(err, result) {
      if (err)
        throw err;
      db.close();
      if (callBack)
        callBack(result);
    });
  });
}

function searchSort(table, item, key, callBack)
{
  MongoClient.connect(url, function(err, db) {
    if (err)
      throw err;
    var dbo = db.db(dbName);
    dbo.collection(table).find(item).sort(key).limit(1).toArray(function(err, result) {
      if (err)
        throw err;
      db.close();
      if (callBack)
        callBack(result[0]);
    });
  });
}

function searchMore(table, item, callBack)
{
  MongoClient.connect(url, function(err, db) {
    if (err)
      throw err;
    var dbo = db.db(dbName);
    dbo.collection(table).find(item).toArray(function(err, result) {
      if (err)
        throw err;
      db.close();
      if (callBack)
        callBack(result);
    });
  });
}

function searchCount(table, item, callBack)
{
  MongoClient.connect(url, function(err, db) {
    if (err)
      throw err;
    var dbo = db.db(dbName);
    dbo.collection(table).find(item).count(function(err, result) {
      if (err)
        throw err;
      db.close();
      if (callBack)
        callBack(result);
    });
  });
}


function insertArray(table, items, callBack)
{
  MongoClient.connect(url, function(err, db) {
    if (err)
      throw err;
    var dbo = db.db(dbName);
    dbo.collection(table).insert(items, function(err, result) {
      if (err)
        throw err;
      db.close();
      if (callBack)
        callBack(result);
    });
  });
}

function erase(table, item, callBack) {
  MongoClient.connect(url, function(err, db) {
    if (err) 
      throw err;
    var dbo = db.db(dbName);
    dbo.collection(table).deleteOne(item, function(err, obj) {
      if (err) 
        throw err;
      console.log('1 document deleted');  // a debug message, can be deleted
      db.close();
      if (callBack)
	callBack();
    });
  });
}


module.exports = {erase, search, searchSort, searchMore, searchCount, insertArray};
