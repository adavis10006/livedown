/* global io, hljs, $ */

var socket = io.connect(window.location.origin)


// socket.emit('server', socket)
socket.on('content', function (data) {
  $('.markdown-body').html(data)
  Prism.highlightAll();
})

// var init_highlight = false;

socket.on('title', function (data) {
  $('title').html(data)
})

socket.on('style', function (data) {
  // if (!init_highlight) {
  $('head').append(data)
  console.log("fetch style\n");
    // init_highlight = true;
  // }
})

socket.on('javascript', function (data) {
  // if (!init_highlight) {
  $('body').append(data)
  console.log("fetch javascript\n");
    // init_highlight = true;
  // }
})

socket.on('kill', function () {
  window.open('', '_self', '')
  window.close()
})
