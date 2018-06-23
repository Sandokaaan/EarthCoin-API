var MongoClient = require('mongodb').MongoClient;
var url = 'mongodb://localhost:27017/';
const dbName = 'dbEarthCoin';

function update(table, item, callBack)
{
  if (!item.hash)
    callBack({error: 'invalid request'});
  else {
    var hash = item.hash;
    MongoClient.connect(url, function(err, db) {
      if (err)
        throw err;
      var dbo = db.db(dbName);
      dbo.collection(table).findOne({hash: hash}, function(err, result) {
        if (err)
          throw err;
        if (result) { // db record exist, update it
          var myquery = { hash: hash };
          var newvalues = { $set: item };
          dbo.collection(table).updateOne(myquery, newvalues, function(err, res) {
            if (err)
              throw err;
            var rts = {};
            for(var key in result) 
              rts[key] = result[key];
            for(var key in item) 
              rts[key] = item[key];
            db.close();
	    if (callBack)
              callBack(rts);
          });
        }
        else { // create a new record
          dbo.collection(table).insertOne(item, function(err, res) {
            if (err)
              throw err;
            db.close();
            if (callBack)
              callBack(item);
          });
        }
      });
    });
  }
}

function search(table, item, callBack)
{
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
    var dbo = db.db("dbEarthCoin");
    dbo.collection(table).deleteOne(item, function(err, obj) {
      if (err) 
        throw err;
      console.log("1 document deleted");  // a debug message, can be deleted
      db.close();
      if (callBack)
	callBack();
    });
  });
}


module.exports = {erase, update, search, searchSort, insertArray};
