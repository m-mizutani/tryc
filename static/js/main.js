'use strict';

// jqueryの読み込み
var $ = require("./static/js/jquery-2.1.4.min.js");
var d3 = require('./static/js/d3.min.js');
const ipc = require("electron").ipcRenderer;
// var ipc = require('ipc');


$(function(){
  const flow_map = {};
  const dns_map = {};
  var init_msg = null;
  
  // "tweet" channelからメッセージを読み込む
  ipc.on('flow.new', function(ev, arg) {
    const msg = JSON.parse(arg);
    if (init_msg !== null) {
      if (init_msg.addrs.includes(msg.src_addr)) {
        msg.own = 'src';
      }
      if (init_msg.addrs.includes(msg.dst_addr)) {
        msg.own = 'dst';
      }
      if (msg.own !== undefined) {
        msg.last_ts = msg.init_ts = $.now() / 1000;
        msg.size = 0;
        flow_map[msg.hash] = msg;
      }
    }
  });

  
  ipc.on('flow.update', function(ev, arg) {
    const flows = Object.keys(flow_map).map(function(v, idx) {
      const f = flow_map[v];
      let tgt = (f.own === 'src') ?
          ((f.dst_name !== null) ? f.dst_name : f.dst_addr) :
          ((f.src_name !== null) ? f.src_name : f.src_addr);
      const addr = (f.own === 'src') ? f.dst_addr : f.src_addr;
      const geo  = (f.own === 'src') ? f.dst_geo  : f.src_geo;
      if (tgt in dns_map) {
        tgt = dns_map[tgt];
      }
      return {name: tgt, addr: addr, geo: geo, data: f};
    });

    const msg = JSON.parse(arg);
    Object.keys(msg.flow_size).forEach(function(v, idx) {
      if (flow_map[v] !== undefined) {
        flow_map[v].last_ts = $.now() / 1000;
        flow_map[v].size += msg.flow_size[v];
      }
    });

    // Merging.
    const session_map = {};
    flows.forEach(function(f) {
      if (session_map[f.name] === undefined) {
        session_map[f.name] = {
          last_ts: f.data.last_ts,
          init_ts: f.data.init_ts,
          total_size: 0,
          delta_size: 0,
          addr: f.addr,
          geo: f.geo,
        };
      }
      const ssn = session_map[f.name];

      ssn.total_size += f.data.size;
      if (ssn.init_ts > f.data.init_ts) { ssn.init_ts = f.data.init_ts; }
      if (ssn.last_ts < f.data.last_ts) { ssn.last_ts = f.data.last_ts; }
      if (f.data.hash in msg.flow_size) {
        session_map[f.name].delta_size += msg.flow_size[f.data.hash];
      }
    });
    const sessions = Object.keys(session_map).map(function(v, idx) {
      return {name: v, data: session_map[v]};
    }).sort(function(a, b) {
      return b.data.last_ts - a.data.last_ts;
    });

    const ssn_html = sessions.map(function(ssn) {
      const cc = (ssn.data.geo !== null) ? ssn.data.geo.country : 'unknown';

      return '<div class="session">' +
          '<img src="static/imgs/flags/' + cc + '.png">' +
          '<div class="name">' + ssn.name + '</div>' +
          '<div class="bps">' + ssn.data.delta_size + ' bps</div>' +
          '<div class="total">(total ' + ssn.data.total_size + ' byte)</div>'+
          '<div class="clearfx"></div>' +
          '</div>';
    });

    $('div#sessions').empty();
    $('div#sessions').append(ssn_html.join(''));
    
    // flows.sort(function(a,b) { return b.data.last_ts - a.data.last_ts; });
  });
  ipc.on('mdns', function(ev, arg) {
    const msg = JSON.parse(arg);
    // console.log(msg);
  });

  ipc.on('dns.tx', function(ev, arg) {
    const msg = JSON.parse(arg);
    // console.log(msg);
  });

  const indexedDB = window.indexedDB || window.webkitIndexedDB || window.mozIndexedDB || window.msIndexedDB;
  console.log(indexedDB);
  const dnsmap_db = indexedDB.open('dnsmap', 1);
  
  dnsmap_db.onupgradeneeded = function(event) {
    console.log('onupgrade');
    const db = event.target.result;
    db.createObjectStore('addr2name', {keyPath: 'addr'});
    console.log('created');
  };
  dnsmap_db.onsuccess = function(event) {
    const tx = dnsmap_db.result.transaction(['addr2name'], 'readwrite');
    const addr2name = tx.objectStore('addr2name');
    
    addr2name.openCursor().onsuccess = function(ev) {
      const cur = ev.target.result;
      if (cur) {
        dns_map[cur.value.addr] = cur.value.name;
        cur.continue();
      }
    };
  };

  ipc.on('dns.log', function(ev, arg) {    
    const msg = JSON.parse(arg);

    const tx = dnsmap_db.result.transaction(['addr2name'], 'readwrite');
    const addr2name = tx.objectStore('addr2name');
    addr2name.add({addr: msg.data, name: msg.name, ts: $.now() / 1000});
    
    dns_map[msg.data] = msg.name;
  });

  ipc.on('sys', function(ev, arg) {
    const msg = JSON.parse(arg);
    init_msg = msg;
  });
  
});
