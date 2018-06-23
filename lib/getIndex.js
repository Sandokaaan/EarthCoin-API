var XMLHttpRequest = require("xmlhttprequest").XMLHttpRequest;

var hash;
var index;

/*
function getBlockCount(callBack) {
    // read block height from the block explorer
    var request = "https://chainz.cryptoid.info/eac/api.dws?q=getblockcount";
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", request, true);
    xmlhttp.send();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
	    index = JSON.parse(this.responseText);
//            console.log(index);
	    var request2 = "https://chainz.cryptoid.info/eac/api.dws?q=getblockhash&height="+index;
	    var xmlhttp2 = new XMLHttpRequest();
	    xmlhttp2.open("GET", request2, true);
	    xmlhttp2.send();
	    xmlhttp2.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
		    hash = JSON.parse(this.responseText);
//		    console.log(hash);
		    callBack();
		}
	    }
	}
    }
}*/


function getBlockCount(callBack) {
    // read block height from the block explorer
    var request = "http://80.211.198.20:7000/getblockcount";
    var xmlhttp = new XMLHttpRequest();
    xmlhttp.open("GET", request, true);
    xmlhttp.send();
    xmlhttp.onreadystatechange = function() {
        if (this.readyState == 4 && this.status == 200) {
	    index = JSON.parse(this.responseText);
            console.log(index);
	    var request2 = "http://80.211.198.20:7000/getblockhash?height="+index;
	    var xmlhttp2 = new XMLHttpRequest();
	    xmlhttp2.open("GET", request2, true);
	    xmlhttp2.send();
	    xmlhttp2.onreadystatechange = function() {
		if (this.readyState == 4 && this.status == 200) {
		    hash = this.responseText;
		    console.log(hash);
		    callBack();
		}
	    }
	}
    }
}

function getItem() {
  return {hash: hash, index: index};
}

module.exports = {getItem, getBlockCount}