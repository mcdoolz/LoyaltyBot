var express = require('express'),
    https = require('https');

//---- Construct ----
function WEB(db, options) {
    var __self = this;

    __self.db = db;

    __self.port = options.port || 9000;
    __self.title = options.title;
    __self.slogan = options.slogan;
    __self.logo = options.logo;
    __self.twitter = options.twitter;
}

// ---- Methods ----
WEB.prototype.start = function () {
    var __self = this;
    __self.srv = express();
    __self.srv.set('view engine', 'jade');
    __self.srv.set('views', 'web/templates');
    __self.srv.use(express.static('./web/public'));


    // ---- Routes -----
    __self.srv.get('/', function(req, res) {
        //lets get the top 5
        sql = 'SELECT * FROM viewers ORDER BY points DESC LIMIT 10;';
        __self.db.execute(sql, function(rows) {
            res.render('index', {
                title: __self.title,
                slogan: __self.slogan,
                logo: __self.logo,
                twitter: __self.twitter,
                rows: rows,
            });
        });
    });
    __self.srv.get('/ladder', function(req, res) {
        //get the whole viewer list
        sql = 'SELECT * FROM viewers ORDER BY points DESC;';
        __self.db.execute(sql, function(rows) {
            res.render('ladder', {
                title: __self.title,
                slogan: __self.slogan,
                logo: __self.logo,
                twitter: __self.twitter,
                rows: rows,
            });
        });
    });
    __self.srv.get('/api/test', function(req, res) {
        res.send("Hey, its Potatr. This data was pulled from the web.");
    });
    __self.srv.all('/api/data', function(req, res) {
        sql = 'SELECT * FROM viewers ORDER BY points DESC;';
        __self.db.execute(sql, function(rows) {
            ladder_data = new Object();
            rows.forEach(function(element, index, array){
                ladder_data[element.user] = element.points;
            });
            res.send(ladder_data);
        });
    });

    __self.srv.listen(__self.port);
    console.log('Started website at '+__self.port);

};

module.exports = function (db, options) {
    return new WEB(db, options);
};
