
if (!console || !console.log) {
  var console = {
    log: function() {}
  };
}

// Ugh, globals.
var peerc;
var source = new EventSource("events");
var dataChannel;

$("#incomingCall").modal();
$("#incomingCall").modal("hide");

$("#incomingCall").on("hidden", function() {
  document.getElementById("incomingRing").pause();
});

source.addEventListener("ping", function(e) {}, false);

source.addEventListener("userjoined", function(e) {
  appendUser(e.data);
}, false);

source.addEventListener("userleft", function(e) {
  removeUser(e.data);
}, false);

source.addEventListener("offer", function(e) {
  var offer = JSON.parse(e.data);
  document.getElementById("incomingUser").innerHTML = offer.from;
  document.getElementById("incomingAccept").onclick = function() {
    $("#incomingCall").modal("hide");
    acceptCall(offer);
  };
  $("#incomingCall").modal();
  document.getElementById("incomingRing").play();
}, false);

source.addEventListener("answer", function(e) {
  var answer = JSON.parse(e.data);
  peerc.setRemoteDescription(new mozRTCSessionDescription(JSON.parse(answer.answer)), function() {
    console.log("Call established!");
  }, error);
}, false);

function log(info) {
  logInBox("Log >> " + info);
}

function appendUser(user) {
  var d = document.createElement("div");
  d.setAttribute("id", btoa(user));

  var a = document.createElement("a");
  a.setAttribute("class", "btn btn-block btn-inverse");
  a.setAttribute("onclick", "initiateCall('" + user + "');");
  a.innerHTML = "<i class='icon-user icon-white'></i> " + user;

  d.appendChild(a);
  d.appendChild(document.createElement("br"));
  document.getElementById("users").appendChild(d);
}

function removeUser(user) {
  var d = document.getElementById(btoa(user));
  if (d) {
    document.getElementById("users").removeChild(d);
  }
}

function logInBox(msg) {
  function replacer(s) {
    switch (s) {
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '&': return '&amp;';
    }
    return s;
  }

  function setStyle(p, msg) {
    if (msg.match(/^Send >>/)) {
      p.css('color', 'blue');
    } else if (msg.match(/^Remote >>/)) {
      p.css('color', 'green');
    } else if (msg.match(/^Log >>/)) {
      p.css('font-weight', 'bold');
    }
  }

  var p = $('<p>' + msg.replace(/[<>&]/, replacer) + '</p>');
  setStyle(p, msg);
  $('#logview').append(p);
}

function setupDataChannel() {
  dataChannel.binaryType = "blob";
  dataChannel.onmessage = function(evt) {
    if (evt.data instanceof Blob) {
      logInBox("Remote-Blob >> " + evt.data);
    } else {
      logInBox("Remote >> " + evt.data);
    }
  };

  dataChannel.onopen = function() {
    dataChannel.send("Hello...");
    var c = 0;
    (function sendTestPacket() {
      if (dataChannel.readyState != 'open') {
        return;
      }
      dataChannel.send("counter: " + c++);
      logInBox("Send >> counter: " + c);
      setTimeout(sendTestPacket, 1000);
    })();
  };
  dataChannel.onclose = function() {
    logInBox("onclose fired");
  };
}

function setupPeerConnection(pc) {
  pc.onaddstream = function(obj) {
    log("Got onaddstream of type " + obj.type);
  };
  pc.onconnection = function() {
    log("onconnection");
  };
  pc.oniceconnectionstatechange = function() {
    log("oniceconnectionstatechange: " + pc.iceConnectionState);
  };
}

// TODO: refactor, this function is almost identical to initiateCall().
function acceptCall(offer) {
  navigator.mozGetUserMedia({fake:true, audio:true}, function(stream) {
    var pc = new mozRTCPeerConnection();
    pc.addStream(stream);
    dataChannel = pc.createDataChannel("Data channel", {protocol: "text/plain", preset:true, stream: 5});
    setupDataChannel();
    setupPeerConnection(pc);
    console.log("offer.offer.type: " + JSON.parse(offer.offer).type);
    pc.setRemoteDescription(new mozRTCSessionDescription(JSON.parse(offer.offer)), function() {
      log("setRemoteDescription, creating answer");
      pc.createAnswer(function(answer) {
        pc.setLocalDescription(answer, function() {
          // Send answer to remote end.
          log("created Answer and setLocalDescription " + JSON.stringify(answer));
          peerc = pc;
          log("Create answer: " + JSON.stringify(answer));
          jQuery.post(
            "answer", {
              to: offer.from,
              from: offer.to,
              answer: JSON.stringify(answer)
            },
            function() {
              console.log("Answer sent!");
            }
          ).error(error);
        }, error);
      }, error);
    }, error);
    console.log("setRemoteDescription done");
  }, error);
}

function initiateCall(user) {
  document.getElementById("main").style.display = "none";

  navigator.mozGetUserMedia({fake:true, audio:true}, function(stream) {
    var pc = new mozRTCPeerConnection();
    pc.addStream(stream);
    dataChannel = pc.createDataChannel("Data channel", {protocol: "text/plain", preset:true, stream: 5});
    setupDataChannel();
    setupPeerConnection(pc);
    pc.createOffer(function(offer) {
      log("Created offer" + JSON.stringify(offer));
      pc.setLocalDescription(offer, function() {
        // Send offer to remote end.
        log("setLocalDescription, sending to remote");
        peerc = pc;
        console.log("will send offer: " + JSON.stringify(offer));
        jQuery.post(
          "offer", {
            to: user,
            from: document.getElementById("user").innerHTML,
            offer: JSON.stringify(offer)
          },
          function() { console.log("Offer sent!"); }
        ).error(error);
      }, error);
    }, error);
  }, error);
}

function endCall() {
  log("Ending call");
  document.getElementById("main").style.display = "block";
  peerc.close();
  peerc = null;
}

function error(e) {
  if (typeof e == typeof {}) {
    alert("Oh no! " + JSON.stringify(e));
  } else {
    alert("Oh no! " + e);
  }
  endCall();
}

$(document).load(function() {
  $("#button_send").click(function() {
    var msg = $('#text_message').text();
    dataChannel.send(msg);
    logInBox("Send >> " + msg);
  });
});
