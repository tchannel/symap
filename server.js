var express = require('express')

app = express()
app.set('port', 8083)

app.use(express.static(__dirname+"/sample"))

server = app.listen(app.get('port'), function () {
  var host = server.address().address;
  var port = server.address().port;
  console.log('running %s %s', host, port)
});


